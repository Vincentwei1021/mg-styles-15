"""Core types & helpers: SR, Sound (buffer + sync point), envelopes, noise, gain utils.

Conventions
-----------
* Sample rate is fixed at 48 kHz (``SR``).
* Mono buffers are 1-D float32 ``(n,)``; stereo buffers are ``(2, n)`` float32.
* ``Sound`` wraps a buffer plus a *sync point* (seconds into the buffer that should
  line up with the ``at=`` time when placed on a timeline).  One-shots have sync=0,
  risers / reverse cymbals have sync at their peak/end, whooshes at their pass-by peak.
"""
from __future__ import annotations

import numpy as np

SR = 48000
NYQ = SR / 2

# ----------------------------------------------------------------------------- rng
_rng_counter = [0]


def rng(seed=None):
    """Deterministic RNG.  seed=None -> auto-incrementing (reproducible per call order)."""
    if seed is None:
        _rng_counter[0] += 1
        seed = 1_000_003 * _rng_counter[0] + 17
    return np.random.default_rng(int(seed) & 0xFFFFFFFF)


def reset_rng(n=0):
    _rng_counter[0] = int(n)


# ----------------------------------------------------------------------------- conversions
def db(x):
    """linear -> dB"""
    return 20.0 * np.log10(np.maximum(np.abs(x), 1e-12))


def amp(d):
    """dB -> linear"""
    return 10.0 ** (np.asarray(d, dtype=np.float64) / 20.0)


def ns(sec):
    """seconds -> samples (int)"""
    return int(round(float(sec) * SR))


def tvec(n_or_sec):
    n = n_or_sec if isinstance(n_or_sec, (int, np.integer)) else ns(n_or_sec)
    return np.arange(n, dtype=np.float64) / SR


# ----------------------------------------------------------------------------- buffers
def as_array(x):
    """Sound | ndarray -> float64 ndarray (mono (n,) or stereo (2,n))."""
    if isinstance(x, Sound):
        x = x.data
    a = np.asarray(x, dtype=np.float64)
    if a.ndim == 2 and a.shape[0] != 2 and a.shape[1] == 2:
        a = a.T
    if a.ndim == 2 and a.shape[0] == 1:
        a = a[0]
    return a


def to_stereo(a):
    a = as_array(a)
    if a.ndim == 1:
        return np.stack([a, a])
    return a


def to_mono(a):
    a = as_array(a)
    if a.ndim == 2:
        return 0.5 * (a[0] + a[1])
    return a


def pan_mono(a, pan=0.0):
    """Constant-power pan of a mono signal -> stereo. pan in [-1, 1]; centre = unity per side."""
    a = as_array(a)
    if a.ndim == 2:
        return balance(a, pan)
    p = np.clip(pan, -1, 1)
    th = (p + 1) * np.pi / 4
    gl, gr = np.cos(th) * np.sqrt(2), np.sin(th) * np.sqrt(2)
    return np.stack([a * gl, a * gr])


def balance(st, pan=0.0):
    """Stereo balance (pan for stereo sources). pan may be scalar or per-sample array."""
    st = to_stereo(st)
    p = np.clip(np.asarray(pan, dtype=np.float64), -1, 1)
    gl = np.where(p > 0, 1 - p, 1.0) if np.ndim(p) else (1 - p if p > 0 else 1.0)
    gr = np.where(p < 0, 1 + p, 1.0) if np.ndim(p) else (1 + p if p < 0 else 1.0)
    # mild constant-power-ish compensation
    return np.stack([st[0] * gl, st[1] * gr])


def pan_curve(a, pan):
    """Time-varying constant-power pan; pan is an array (len n) in [-1,1]. Mono or stereo input."""
    a = as_array(a)
    p = np.clip(np.asarray(pan, dtype=np.float64), -1, 1)
    th = (p + 1) * np.pi / 4
    gl, gr = np.cos(th) * np.sqrt(2), np.sin(th) * np.sqrt(2)
    if a.ndim == 1:
        return np.stack([a * gl, a * gr])
    m = 0.5 * (a[0] + a[1])
    s = 0.5 * (a[0] - a[1])
    # pan the mid, keep side
    return np.stack([m * gl + s, m * gr - s])


def width(st, w=1.0):
    """M/S width. w=0 mono, 1 unchanged, >1 wider."""
    st = to_stereo(st)
    m = 0.5 * (st[0] + st[1])
    s = 0.5 * (st[0] - st[1]) * w
    return np.stack([m + s, m - s])


def fit(a, n):
    """Pad with zeros / truncate along time to n samples."""
    a = as_array(a)
    cur = a.shape[-1]
    if cur == n:
        return a
    if cur > n:
        return a[..., :n]
    pad = [(0, 0)] * (a.ndim - 1) + [(0, n - cur)]
    return np.pad(a, pad)


def mix_into(dst, src, start):
    """Add src into dst (both same ndim, or src mono into stereo) at sample index start (may be <0)."""
    src = as_array(src)
    if dst.ndim == 2 and src.ndim == 1:
        src = np.stack([src, src])
    n = dst.shape[-1]
    s0 = int(start)
    a0, b0 = max(0, s0), min(n, s0 + src.shape[-1])
    if b0 <= a0:
        return dst
    dst[..., a0:b0] += src[..., a0 - s0:b0 - s0]
    return dst


def silence(dur, stereo=False):
    n = ns(dur)
    return np.zeros((2, n) if stereo else n)


def peak(a):
    a = as_array(a)
    return float(np.max(np.abs(a))) if a.size else 0.0


def rms(a):
    a = as_array(a)
    return float(np.sqrt(np.mean(a ** 2) + 1e-20))


def normalize(a, peak_db=-1.0):
    a = as_array(a)
    p = peak(a)
    if p < 1e-9:
        return a
    return a * (amp(peak_db) / p)


def loudness_proxy(a, win=0.1):
    """Max short-window RMS (dB) of a roughly K-weighted signal: perceptual loudness for one-shots.
    Stereo: mean of the channel powers (as BS.1770 sums channels), NOT the power of the mono downmix - a
    downmix under-reads wide / out-of-phase material and made such SFX come out far too loud."""
    from .filters import sos_filter, highpass_sos, highshelf_sos
    x = as_array(a)
    if x.size == 0:
        return -120.0
    k = sos_filter(x, highshelf_sos(1500, 4.0, 0.7))
    k = sos_filter(k, highpass_sos(60, 2))
    p = np.mean(k ** 2, axis=0) if k.ndim == 2 else k ** 2
    w = max(8, int(win * SR))
    if p.size < w:
        p = np.pad(p, (0, w - p.size))
    c = np.cumsum(np.concatenate([[0.0], p]))
    ms = (c[w:] - c[:-w]) / w
    return float(10 * np.log10(np.max(ms) + 1e-20))


def norm_loud(a, target=-18.0, max_peak_db=-1.0):
    """Normalise by loudness proxy (see loudness_proxy) with a peak ceiling."""
    a = as_array(a)
    L = loudness_proxy(a)
    g = amp(target - L)
    p = peak(a) * g
    if p > amp(max_peak_db):
        g *= amp(max_peak_db) / p
    return a * g


def fade(a, fin=0.0, fout=0.0, curve='cos'):
    """Apply fade in/out (seconds)."""
    a = as_array(a).copy()
    n = a.shape[-1]
    fi, fo = min(n, ns(fin)), min(n, ns(fout))
    if fi > 0:
        r = np.linspace(0, 1, fi)
        r = np.sin(r * np.pi / 2) ** 2 if curve == 'cos' else r
        a[..., :fi] *= r
    if fo > 0:
        r = np.linspace(1, 0, fo)
        r = np.sin(r * np.pi / 2) ** 2 if curve == 'cos' else r
        a[..., n - fo:] *= r
    return a


def declick(a, ms_in=1.0, ms_out=3.0):
    return fade(a, ms_in / 1000, ms_out / 1000, curve='lin')


def dc_block(a, hz=8.0):
    from .filters import sos_filter, highpass_sos
    return sos_filter(as_array(a), highpass_sos(hz, 1))


# ----------------------------------------------------------------------------- envelopes
def adsr(n_or_dur, a=0.005, d=0.1, s=0.7, r=0.2, gate=None, curve=4.0, total=None):
    """ADSR envelope.  If total samples > gate, release happens after gate.

    n_or_dur: gate length (seconds float or samples int).  total: full length in seconds
    (default gate + r).  curve>0 gives exponential-ish segments (analog feel).
    """
    g = n_or_dur if isinstance(n_or_dur, (int, np.integer)) else ns(n_or_dur)
    tot = ns(total) if total is not None else g + ns(r)
    t = np.arange(tot) / SR
    env = np.zeros(tot)
    A, D, R = max(a, 1e-4), max(d, 1e-4), max(r, 1e-4)

    def shape(x):  # 0..1 -> 0..1 concave (exp-like)
        if curve <= 0:
            return x
        return (1 - np.exp(-curve * x)) / (1 - np.exp(-curve))

    tg = g / SR
    # attack
    m = t < A
    env[m] = 1 - (1 - t[m] / A) ** 2 if curve > 0 else t[m] / A
    m2 = (t >= A) & (t < A + D)
    env[m2] = 1 - (1 - s) * shape((t[m2] - A) / D)
    env[t >= A + D] = s
    # value at gate off
    if tg < A:
        lvl = 1 - (1 - tg / A) ** 2
    elif tg < A + D:
        lvl = 1 - (1 - s) * shape((tg - A) / D)
    else:
        lvl = s
    mr = t >= tg
    tr = t[mr] - tg
    env[mr] = lvl * np.exp(-tr * 6.9 / R) * np.clip(1 - tr / (R * 1.5), 0, 1) ** 0.5
    return env


def perc_env(dur, attack=0.001, decay=0.2, hold=0.0, curve='exp'):
    """Percussive AD envelope. decay = time to -60 dB (exp) or linear to 0."""
    n = ns(dur)
    t = np.arange(n) / SR
    env = np.ones(n)
    ma = t < attack
    env[ma] = (t[ma] / max(attack, 1e-5)) ** 1.5
    td = t - attack - hold
    md = td > 0
    if curve == 'exp':
        env[md] = np.exp(-6.9 * td[md] / max(decay, 1e-4))
    else:
        env[md] = np.clip(1 - td[md] / decay, 0, 1) ** 2
    return env


def exp_env(n_or_dur, tau):
    n = n_or_dur if isinstance(n_or_dur, (int, np.integer)) else ns(n_or_dur)
    return np.exp(-np.arange(n) / (SR * max(tau, 1e-5)))


def ramp(n_or_dur, v0, v1, curve=0.0):
    """Ramp from v0 to v1. curve 0 linear; >0 exponential-like (fast start); <0 slow start."""
    n = n_or_dur if isinstance(n_or_dur, (int, np.integer)) else ns(n_or_dur)
    x = np.linspace(0, 1, n)
    if curve > 0:
        x = (1 - np.exp(-curve * x)) / (1 - np.exp(-curve))
    elif curve < 0:
        c = -curve
        x = (np.exp(c * x) - 1) / (np.exp(c) - 1)
    return v0 + (v1 - v0) * x


def exp_ramp(n_or_dur, f0, f1):
    """Exponential (geometric) glide - use for frequencies."""
    n = n_or_dur if isinstance(n_or_dur, (int, np.integer)) else ns(n_or_dur)
    return f0 * (f1 / f0) ** np.linspace(0, 1, n)


def breakpoints(points, n, t0=0.0, log=False, smooth=0.0):
    """Piecewise-linear curve from [(t_sec, value), ...] sampled at n samples starting at t0.

    log=True interpolates in log domain (for Hz).  smooth: seconds of one-pole smoothing.
    """
    pts = sorted(points, key=lambda p: p[0])
    ts = np.array([p[0] for p in pts], dtype=np.float64)
    vs = np.array([p[1] for p in pts], dtype=np.float64)
    t = t0 + np.arange(n) / SR
    if log:
        out = np.exp(np.interp(t, ts, np.log(np.maximum(vs, 1e-9))))
    else:
        out = np.interp(t, ts, vs)
    if smooth > 0:
        from .filters import onepole_lp_array
        out = onepole_lp_array(out, 1.0 / (2 * np.pi * smooth))
    return out


def lfo(n_or_dur, rate, shape='sine', phase=0.0, rate_end=None):
    """LFO in [-1, 1]. rate may sweep to rate_end (Hz)."""
    n = n_or_dur if isinstance(n_or_dur, (int, np.integer)) else ns(n_or_dur)
    if rate_end is None:
        ph = phase + rate * np.arange(n) / SR
    else:
        r = exp_ramp(n, max(rate, 1e-3), max(rate_end, 1e-3))
        ph = phase + np.cumsum(r) / SR
    ph = ph % 1.0
    if shape == 'sine':
        return np.sin(2 * np.pi * ph)
    if shape == 'tri':
        return 1 - 4 * np.abs(ph - 0.5)
    if shape == 'saw':
        return 2 * ph - 1
    if shape == 'square':
        return np.where(ph < 0.5, 1.0, -1.0)
    raise ValueError(shape)


# ----------------------------------------------------------------------------- noise
def white(n_or_dur, seed=None):
    n = n_or_dur if isinstance(n_or_dur, (int, np.integer)) else ns(n_or_dur)
    return rng(seed).standard_normal(n) * 0.35


def pink(n_or_dur, seed=None):
    """Pink noise (-3 dB/oct) via FFT shaping. ~unit-ish RMS 0.25."""
    n = n_or_dur if isinstance(n_or_dur, (int, np.integer)) else ns(n_or_dur)
    if n == 0:
        return np.zeros(0)
    r = rng(seed)
    m = 1 << int(np.ceil(np.log2(max(n, 16))))
    spec = r.standard_normal(m // 2 + 1) + 1j * r.standard_normal(m // 2 + 1)
    f = np.fft.rfftfreq(m, 1 / SR)
    f[0] = f[1]
    spec *= 1 / np.sqrt(f)
    spec[f < 15] *= (f[f < 15] / 15) ** 2
    x = np.fft.irfft(spec, m)[:n]
    return x / (np.std(x) + 1e-12) * 0.25


def brown(n_or_dur, seed=None):
    n = n_or_dur if isinstance(n_or_dur, (int, np.integer)) else ns(n_or_dur)
    r = rng(seed)
    m = 1 << int(np.ceil(np.log2(max(n, 16))))
    spec = r.standard_normal(m // 2 + 1) + 1j * r.standard_normal(m // 2 + 1)
    f = np.fft.rfftfreq(m, 1 / SR)
    f[0] = f[1]
    spec *= 1 / f
    spec[f < 20] *= (f[f < 20] / 20) ** 2
    x = np.fft.irfft(spec, m)[:n]
    return x / (np.std(x) + 1e-12) * 0.25


def noise_st(n_or_dur, color='white', seed=None, corr=0.0):
    """Stereo noise with inter-channel correlation corr (0 = independent)."""
    f = {'white': white, 'pink': pink, 'brown': brown}[color]
    r = rng(seed)
    a = f(n_or_dur, seed=int(r.integers(1 << 30)))
    b = f(n_or_dur, seed=int(r.integers(1 << 30)))
    b = corr * a + np.sqrt(max(0.0, 1 - corr ** 2)) * b
    return np.stack([a, b])


# ----------------------------------------------------------------------------- Sound
class Sound:
    """Audio buffer + sync point.  Most mgaudio generators return Sound.

    s.data : float32 (n,) or (2,n);  s.sync : seconds into buffer aligned with ``at=``.
    """
    __slots__ = ('data', 'sync')

    def __init__(self, data, sync=0.0):
        if isinstance(data, Sound):
            sync = data.sync if sync == 0.0 else sync
            data = data.data
        a = np.asarray(data)
        if a.ndim == 2 and a.shape[0] != 2 and a.shape[1] == 2:
            a = a.T
        if a.ndim == 2 and a.shape[0] == 1:
            a = a[0]
        a = np.nan_to_num(a.astype(np.float32, copy=False))
        self.data = a
        self.sync = float(sync)

    # -- info
    @property
    def n(self):
        return self.data.shape[-1]

    @property
    def dur(self):
        return self.n / SR

    @property
    def is_stereo(self):
        return self.data.ndim == 2

    def __len__(self):
        return self.n

    def __repr__(self):
        return f"Sound({'stereo' if self.is_stereo else 'mono'}, {self.dur:.3f}s, sync={self.sync:.3f}, peak={db(peak(self.data)):.1f}dB)"

    def __array__(self, dtype=None, copy=None):
        return self.data if dtype is None else self.data.astype(dtype)

    def _new(self, data, sync=None):
        return Sound(data, self.sync if sync is None else sync)

    # -- basic ops (all return new Sound)
    def copy(self):
        return self._new(self.data.copy())

    def gain(self, d):
        return self._new(self.data * np.float32(amp(d)))

    def __mul__(self, k):
        return self._new(self.data * np.float32(k))

    __rmul__ = __mul__

    def __add__(self, other):
        """Mix two sounds aligned at their starts (sync of self kept)."""
        o = as_array(other)
        a = as_array(self)
        if a.ndim != o.ndim:
            a, o = to_stereo(a), to_stereo(o)
        n = max(a.shape[-1], o.shape[-1])
        return self._new(fit(a, n) + fit(o, n))

    def stereo(self):
        return self._new(to_stereo(self.data))

    def mono(self):
        return self._new(to_mono(self.data))

    def pan(self, p=0.0):
        return self._new(pan_mono(self.data, p) if not self.is_stereo else balance(self.data, p))

    def width(self, w):
        return self._new(width(self.data, w))

    def fade(self, fin=0.0, fout=0.0):
        return self._new(fade(self.data, fin, fout))

    def reverse(self):
        """Reverse; sync point mirrors (a sync at the start becomes the end)."""
        return Sound(self.data[..., ::-1].copy(), self.dur - self.sync)

    def trim(self, start=0.0, end=None):
        a = ns(start)
        b = self.n if end is None else min(self.n, ns(end))
        return Sound(self.data[..., a:b], max(0.0, self.sync - start))

    def length(self, dur, fout=0.01):
        """Force exact duration (pad or cut with short fade)."""
        d = fit(self.data, ns(dur))
        if self.n > ns(dur) and fout > 0:
            d = fade(d, 0, fout)
        return self._new(d)

    def pad(self, before=0.0, after=0.0):
        a = as_array(self)
        pb, pa = ns(before), ns(after)
        padw = [(0, 0)] * (a.ndim - 1) + [(pb, pa)]
        return Sound(np.pad(a, padw), self.sync + before)

    def normalize(self, peak_db=-1.0):
        return self._new(normalize(self.data, peak_db))

    def loud(self, target=-18.0):
        """Normalise perceived loudness (short-window K-weighted RMS)."""
        return self._new(norm_loud(self.data, target))

    def at_sync(self, sync):
        return Sound(self.data, sync)

    def lpf(self, hz, order=2):
        from .filters import lpf
        return self._new(lpf(self.data, hz, order))

    def hpf(self, hz, order=2):
        from .filters import hpf
        return self._new(hpf(self.data, hz, order))

    def fx(self, *chain):
        """Apply callables f(ndarray)->ndarray or pedalboard plugins in order."""
        from .fx import apply_chain
        return self._new(apply_chain(self.data, chain))

    def pitch(self, semitones, keep_length=False):
        """Pitch shift by resampling (changes length) or pedalboard PitchShift (keep_length)."""
        from .fx import repitch, pitch_shift
        if keep_length:
            return self._new(pitch_shift(self.data, semitones))
        r = 2 ** (semitones / 12)
        return Sound(repitch(self.data, r), self.sync / r)

    def delay(self, sec):
        return self.pad(before=sec).at_sync(self.sync)

    def tail(self, sec):
        return self.pad(after=sec)


def as_sound(x, sync=None):
    if isinstance(x, Sound):
        return x if sync is None else Sound(x.data, sync)
    return Sound(x, 0.0 if sync is None else sync)


def layer(parts, stereo=True, sync=0.0):
    """Build a composite Sound: parts = [(sound, offset_sec, gain_db=0, pan=None), ...].

    Offsets may be negative (result is extended and sync shifted accordingly).
    """
    norm = []
    for p in parts:
        s, off = p[0], p[1]
        g = p[2] if len(p) > 2 else 0.0
        pn = p[3] if len(p) > 3 else None
        a = as_array(s)
        if pn is not None:
            a = pan_mono(a, pn) if a.ndim == 1 else balance(a, pn)
        if stereo:
            a = to_stereo(a)
        norm.append((a * amp(g), ns(off)))
    lo = min(0, min(o for _, o in norm))
    hi = max(o + a.shape[-1] for a, o in norm)
    shape = (2, hi - lo) if stereo else (hi - lo,)
    out = np.zeros(shape)
    for a, o in norm:
        mix_into(out, a if stereo or a.ndim == 1 else to_mono(a), o - lo)
    return Sound(out, sync - lo / SR)


def concat(sounds, gap=0.0):
    parts = []
    t = 0.0
    for s in sounds:
        s = as_sound(s)
        parts.append((s, t))
        t += s.dur + gap
    return layer(parts)
