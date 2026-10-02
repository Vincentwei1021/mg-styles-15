"""Effects: reverb (synthesised stereo IRs + convolution), delays, chorus/flanger/phaser, saturation,
bitcrush, dynamics, tape/VHS, stutter/glitch, varispeed, pitch.  All accept mono/stereo arrays or Sound
and return float64 ndarrays (use Sound.fx(...) to stay in Sound land)."""
from __future__ import annotations

from functools import lru_cache

import numpy as np
from scipy import signal
from scipy.signal import resample_poly, fftconvolve

from .core import (SR, as_array, to_stereo, to_mono, amp, db, ns, rng, fit, pink, white, lfo,
                   breakpoints, fade)
from .filters import (lpf, hpf, sos_filter, lowpass_sos, highpass_sos, bandpass_sos, peak_eq,
                      high_shelf, low_shelf, svf, _curve)
from . import _dsp


def _pc(x, fn):
    a = as_array(x)
    if a.ndim == 2:
        return np.stack([fn(a[0], 0), fn(a[1], 1)])
    return fn(a, 0)


def apply_chain(x, chain):
    a = as_array(x)
    for fx in chain:
        if fx is None:
            continue
        if hasattr(fx, 'process') and not callable(getattr(fx, '__call__', None)) or \
                type(fx).__module__.startswith('pedalboard'):
            a = pb(a, fx)
        else:
            a = as_array(fx(a))
    return a


def pb(x, *plugins, tail=0.0):
    """Run pedalboard plugin(s) on mono/stereo array. tail: seconds of zero padding to keep tails."""
    import pedalboard
    a = as_array(x)
    mono = a.ndim == 1
    a2 = a[None, :] if mono else a
    if tail > 0:
        a2 = np.pad(a2, ((0, 0), (0, ns(tail))))
    board = pedalboard.Pedalboard(list(plugins))
    y = board(a2.astype(np.float32), SR).astype(np.float64)
    return y[0] if mono else y


# ============================================================================ REVERB
REVERBS = {
    #          decay predelay damp  build  er    width
    'room':    (0.55, 0.004, 0.55, 0.004, 0.9, 0.9),
    'ambience': (0.35, 0.002, 0.5, 0.002, 0.7, 1.0),
    'chamber': (1.2, 0.012, 0.45, 0.008, 0.5, 1.0),
    'plate':   (1.9, 0.006, 0.25, 0.002, 0.0, 1.0),
    'hall':    (2.6, 0.022, 0.45, 0.02, 0.35, 1.0),
    'big':     (4.2, 0.035, 0.5, 0.035, 0.25, 1.0),
    'cathedral': (6.5, 0.045, 0.55, 0.05, 0.2, 1.0),
    'gated':   (0.30, 0.004, 0.2, 0.001, 0.0, 1.0),
    'spring':  (1.8, 0.0, 0.5, 0.0, 0.0, 0.8),
}


@lru_cache(maxsize=48)
def make_ir(kind='hall', decay=None, predelay=None, damp=None, width=None, seed=7, bright=0.0):
    """Synthesise a stereo impulse response (2, n). Energy-normalised per channel.

    Multi-band exponential decay (HF dies faster by `damp`), density build-up, early reflections."""
    d0, p0, dm0, build, er, w0 = REVERBS[kind]
    decay = d0 if decay is None else decay
    predelay = p0 if predelay is None else predelay
    damp = dm0 if damp is None else damp
    width = w0 if width is None else width
    r = np.random.default_rng(seed)
    if kind == 'spring':
        return _spring_ir(decay, r)
    if kind == 'gated':
        n_t = ns(decay + 0.06)
    else:
        n_t = ns(decay * 1.25 + 0.05)
    t = np.arange(n_t) / SR
    edges = [0, 250, 900, 3000, 7500, 24000]
    # T60 multipliers per band: lows longer, highs shorter (damp controls tilt)
    mult = np.array([1.15, 1.0, 1.0 - 0.3 * damp, 1.0 - 0.6 * damp, 1.0 - 0.8 * damp])
    mult = np.clip(mult + bright * 0.2, 0.08, 2)
    chans = []
    for ch in range(2):
        nz = r.standard_normal(n_t)
        out = np.zeros(n_t)
        for b in range(5):
            lo, hi = edges[b], edges[b + 1]
            if lo == 0:
                band = sos_filter(nz, lowpass_sos(hi, 4))
            elif hi >= 24000:
                band = sos_filter(nz, highpass_sos(lo, 4))
            else:
                band = sos_filter(nz, bandpass_sos(lo, hi, 3))
            T = decay * mult[b]
            if kind == 'gated':
                env = np.where(t < decay, 1.0 - 0.25 * t / decay, 0.75 * np.exp(-(t - decay) / 0.012))
            else:
                env = np.exp(-6.91 * t / T)
            out += band * env
        if build > 0:
            out *= 1 - np.exp(-t / build)
        if er > 0 and kind != 'gated':
            k = 14 if kind != 'room' else 20
            taps = np.sort(r.uniform(0.003, 0.012 + 0.07 * min(decay, 2.5) / 2.5, k))
            e = np.zeros(n_t)
            for i, tp in enumerate(taps):
                idx = int(tp * SR)
                if idx < n_t:
                    e[idx] += r.choice([-1, 1]) * (0.8 ** i) * (1.6 if kind == 'room' else 1.0)
            e = sos_filter(e, lowpass_sos(7000 - 3000 * damp, 2))
            out = out / (np.sqrt(np.sum(out ** 2)) + 1e-12) + er * 0.35 * e / (np.sqrt(np.sum(e ** 2)) + 1e-12)
        chans.append(out)
    L, R = chans
    # width via M/S
    M, S = 0.5 * (L + R), 0.5 * (L - R) * width
    L, R = M + S, M - S
    pd = ns(predelay)
    ir = np.stack([np.pad(L, (pd, 0)), np.pad(R, (pd, 0))])
    ir /= np.sqrt(np.sum(ir ** 2, axis=1, keepdims=True)) + 1e-12
    ir = sos_filter(ir, highpass_sos(80 if kind not in ('hall', 'big', 'cathedral') else 50, 2))
    ir /= np.sqrt(np.sum(ir ** 2, axis=1, keepdims=True)) + 1e-12
    ir.flags.writeable = False
    return ir


def _spring_ir(decay, r):
    n = ns(decay)
    chans = []
    for ch in range(2):
        imp = np.zeros(ns(0.12))
        imp[0] = 1.0
        chirp = _dsp.allpass_chain(imp, 0.62 + 0.02 * ch, 90)
        chirp = sos_filter(chirp, bandpass_sos(250, 5000, 2))
        out = np.zeros(n)
        per = int(SR * (0.031 + 0.004 * ch))
        g = 1.0
        pos = 0
        while pos < n:
            seg = chirp * g
            m = min(len(seg), n - pos)
            out[pos:pos + m] += seg[:m]
            pos += per
            g *= 10 ** (-3 * per / SR / decay)
            chirp = sos_filter(chirp, lowpass_sos(6500, 1))
        out += r.standard_normal(n) * np.exp(-6.9 * np.arange(n) / SR / decay) * 0.08
        chans.append(out)
    ir = np.stack(chans)
    ir /= np.sqrt(np.sum(ir ** 2, axis=1, keepdims=True)) + 1e-12
    ir.flags.writeable = False
    return ir


def convolve(x, ir, keep_len=True):
    """Stereo convolution: mono in -> stereo out; stereo in -> L*irL, R*irR."""
    a = as_array(x)
    if a.ndim == 1:
        a = np.stack([a, a])
    n = a.shape[1]
    out = np.stack([fftconvolve(a[0], ir[0]), fftconvolve(a[1], ir[1])])
    return out[:, :n] if keep_len else out


def reverb(x, kind='hall', decay=None, predelay=None, mix=0.25, damp=None, width=None, hp=None, lp=None,
           seed=7, keep_len=True, pre_hp=None):
    """Convolution reverb with a synthesised IR.  mix = wet amount (0..1; 1 = wet only)."""
    a = as_array(x)
    src = a if pre_hp is None else hpf(a, pre_hp)
    ir = make_ir(kind, decay, predelay, damp, width, seed)
    wet = convolve(src, ir, keep_len=keep_len)
    if hp:
        wet = hpf(wet, hp)
    if lp:
        wet = lpf(wet, lp)
    if mix >= 1.0:
        return wet
    dry = to_stereo(a)
    if not keep_len:
        dry = fit(dry, wet.shape[1])
    return dry * (1 - mix) ** 0.5 + wet * mix ** 0.5 * (1.0 if mix < 1 else 1.0)


def shimmer(x, decay=4.5, amount=0.55, octaves=2, lp=9000, keep_len=True):
    """Shimmer reverb (octave-up feedback cascade). Returns wet only (stereo)."""
    a = as_array(x)
    base = reverb(a, 'big', decay=decay, mix=1.0, keep_len=keep_len)
    out = base.copy()
    cur = base
    for k in range(octaves):
        up = pitch_shift(cur, 12)
        cur = reverb(up, 'big', decay=decay, mix=1.0, keep_len=True, seed=11 + k) * amount
        out[:, :cur.shape[1]] += cur[:, :out.shape[1]]
    return lpf(out, lp)


def reverse_reverb(x, kind='hall', decay=2.0, pre=None):
    """Pre-verb swell: reverse(reverb(reverse(x))) -> swells INTO the sound. Returns Sound-ready array
    of length len(x)+tail with the original onset at index `tail`; use core.Sound(sync=tail)."""
    a = as_array(x)
    rev = a[..., ::-1]
    wet = reverb(rev, kind, decay=decay, mix=1.0, keep_len=False)
    return wet[..., ::-1]


# ============================================================================ DELAY / MOD
def delay(x, time=0.375, feedback=0.35, mix=1.0, pingpong=True, lp=6500, hp=180, sat=0.0, time_r=None):
    """Stereo feedback delay (ping-pong by default). time in seconds; returns wet*mix + dry*(1-mix)."""
    a = to_stereo(as_array(x))
    tl = time
    tr = time if time_r is None else time_r
    if pingpong:
        # feed mono input into left only for a true ping-pong
        m = 0.5 * (a[0] + a[1])
        xl, xr = m * 1.4, m * 0.0
    else:
        xl, xr = a[0], a[1]
    yl, yr = _dsp.pingpong(np.ascontiguousarray(xl), np.ascontiguousarray(xr), float(tl * SR),
                           float(tr * SR), float(feedback), 1.0 if pingpong else 0.0, float(lp), float(hp),
                           float(sat), float(SR))
    wet = np.stack([yl, yr])
    return a * (1 - mix) + wet * mix if mix < 1 else wet


def beat(bpm, frac=0.25):
    """Seconds of a note value: frac=0.25 quarter, 0.125 eighth, 0.1875 dotted eighth, 1/12 triplet 8th.
    (frac of a whole note)."""
    return 240.0 / bpm * frac


def _mod_delay(c, dl, fb=0.0, mix=1.0):
    return _dsp.moddelay(np.ascontiguousarray(c), np.ascontiguousarray(dl), float(fb), float(mix))


def chorus(x, rate=0.55, depth_ms=2.2, base_ms=8.0, mix=0.45, voices=2, spread=1.0, seed=3):
    """Stereo chorus (Juno-style: opposite LFO phase per channel)."""
    a = to_stereo(as_array(x))
    n = a.shape[1]
    t = np.arange(n) / SR
    outs = []
    for ch in range(2):
        wet = np.zeros(n)
        for v in range(voices):
            ph = (v / voices) + (0.5 * spread if ch else 0.0)
            l = np.sin(2 * np.pi * (rate * (1 + 0.13 * v) * t + ph))
            d = (base_ms + v * 3.1 + depth_ms * l) * SR / 1000
            wet += _mod_delay(a[ch], d)
        wet /= voices
        outs.append(a[ch] * (1 - mix) + wet * mix)
    y = np.stack(outs)
    # level compensate (comb losses)
    return y * (1 + 0.25 * mix)


def flanger(x, rate=0.15, depth_ms=2.0, base_ms=0.8, feedback=0.55, mix=0.5):
    a = to_stereo(as_array(x))
    n = a.shape[1]
    t = np.arange(n) / SR
    out = []
    for ch in range(2):
        l = 0.5 + 0.5 * np.sin(2 * np.pi * rate * t + ch * 0.6)
        d = (base_ms + depth_ms * l) * SR / 1000
        out.append(_mod_delay(a[ch], d, feedback, mix))
    return np.stack(out)


def vibrato(x, rate=5.0, depth_ms=0.4):
    a = as_array(x)
    n = a.shape[-1]
    t = np.arange(n) / SR
    d = (depth_ms * 1.2 + depth_ms * np.sin(2 * np.pi * rate * t)) * SR / 1000 + 2
    return _pc(a, lambda c, i: _mod_delay(c, d))


def phaser(x, rate=0.3, depth=0.6, feedback=0.3, mix=0.5, centre=1200):
    import pedalboard
    return pb(x, pedalboard.Phaser(rate_hz=rate, depth=depth, centre_frequency_hz=centre,
                                   feedback=feedback, mix=mix))


def tremolo(x, rate=6.0, depth=0.5, shape='sine', phase=0.0, rate_end=None):
    a = as_array(x)
    l = lfo(a.shape[-1], rate, shape, phase, rate_end)
    g = 1 - depth * (0.5 + 0.5 * l)
    return a * g


def autopan(x, rate=0.5, depth=0.8, shape='sine'):
    from .core import pan_curve
    a = as_array(x)
    return pan_curve(a, depth * lfo(a.shape[-1], rate, shape))


def haas(x, ms=12.0, side='R'):
    a = to_mono(as_array(x)) if as_array(x).ndim == 2 else as_array(x)
    d = ns(ms / 1000)
    dl = np.pad(a, (d, 0))[:a.shape[0]]
    return np.stack([a, dl]) if side == 'R' else np.stack([dl, a])


def widen(x, amount=0.5, ms=9.0):
    """Stereo widener: decorrelated side from a short delayed/filtered copy (mono compatible-ish)."""
    a = as_array(x)
    m = to_mono(a) if a.ndim == 2 else a
    d = ns(ms / 1000)
    s = np.pad(m, (d, 0))[:m.shape[0]]
    s = hpf(s, 300) * amount
    base = to_stereo(a)
    return np.stack([base[0] + s, base[1] - s])


def stereo_spread(x, amount=0.6):
    from .core import width as _w
    return _w(to_stereo(as_array(x)), 1 + amount)


# ============================================================================ SATURATION / LOFI
def _os_apply(c, fn, os=2):
    if os <= 1:
        return fn(c)
    u = resample_poly(c, os, 1)
    return resample_poly(fn(u), 1, os)[:c.shape[0]]


def saturate(x, drive_db=6.0, kind='tanh', mix=1.0, bias=0.0, os=2, trim=True):
    """Soft saturation. kinds: tanh, tape (warm, asym), tube (even harmonics), hard, fold, diode.
    Unity gain for small signals (trim=True)."""
    a = as_array(x)
    g = amp(drive_db)

    def f(c):
        u = c * g
        if kind == 'tanh':
            y = np.tanh(u)
        elif kind == 'tape':
            y = np.tanh(u + 0.12 * u * u / (1 + np.abs(u))) - np.tanh(0.0)
        elif kind == 'tube':
            y = np.where(u >= 0, np.tanh(u), np.tanh(0.7 * u) / 0.7 * 0.9)
            y = y + 0.08 * np.tanh(u) ** 2
        elif kind == 'hard':
            y = np.clip(u, -1, 1)
        elif kind == 'fold':
            y = np.sin(np.clip(u, -50, 50) * np.pi / 2)
        elif kind == 'diode':
            y = np.sign(u) * (1 - np.exp(-np.abs(u) * 1.4))
        else:
            raise ValueError(kind)
        if bias:
            y = y + bias * y * y
        return y / g if trim else y

    wet = _pc(a, lambda c, i: _os_apply(c, f, os))
    if bias or kind in ('tape', 'tube'):
        wet = hpf(wet, 10, 1)
    return a * (1 - mix) + wet * mix


def tape(x, drive_db=3.0, wow=0.15, flutter=0.06, hiss_db=-66.0, lp=14000, bump_db=1.2, seed=5):
    """Tape machine: gentle saturation, head bump, HF loss, wow/flutter and hiss."""
    a = as_array(x)
    y = saturate(a, drive_db, 'tape')
    y = low_shelf(y, 90, bump_db)
    y = lpf(y, lp, 2)
    if wow or flutter:
        y = wow_flutter(y, wow, flutter, seed=seed)
    if hiss_db > -120:
        n = y.shape[-1]
        h = hpf(pink(n, seed=seed + 1), 1500) * amp(hiss_db) * 4
        y = y + (np.stack([h, np.roll(h, 777)]) if y.ndim == 2 else h)
    return y


def wow_flutter(x, wow=0.3, flutter=0.1, wow_rate=0.55, flutter_rate=7.5, drift=0.5, seed=5):
    """Pitch wobble via modulated delay. wow/flutter depth ~ ms of delay modulation."""
    a = as_array(x)
    n = a.shape[-1]
    t = np.arange(n) / SR
    r = rng(seed)
    k = max(4, int(n / SR * 3) + 4)
    dr = np.interp(np.linspace(0, k - 1, n), np.arange(k), r.standard_normal(k))
    dr = sos_filter(dr, lowpass_sos(2.0, 1))
    m = (wow * (np.sin(2 * np.pi * wow_rate * t + r.random() * 6) + drift * dr) +
         flutter * np.sin(2 * np.pi * flutter_rate * t + r.random() * 6) * (0.7 + 0.3 * np.sin(2 * np.pi * 0.7 * t)))
    d = (2.0 * (wow + flutter) + 1.5 + m) * SR / 1000
    d = np.maximum(d, 1.0)
    return _pc(a, lambda c, i: _mod_delay(c, d))


def bitcrush(x, bits=8, rate=None, mix=1.0, dither=False):
    """Bit depth reduction + optional sample-rate reduction (Hz, may be array/breakpoints)."""
    a = as_array(x)
    n = a.shape[-1]
    y = a
    if rate is not None:
        rr = _curve(rate, n, log=True)
        y = _pc(y, lambda c, i: _dsp.sample_hold(np.ascontiguousarray(c), rr, float(SR)))
    if bits is not None and bits < 24:
        q = 2 ** (bits - 1)
        if dither:
            y = y + (np.random.default_rng(1).random(y.shape) - 0.5) / q
        y = np.round(y * q) / q
    return a * (1 - mix) + y * mix


def lofi(x, sr=12000, bits=10, lp=None, mix=1.0):
    """Cheap sampler vibe: resample down/up (with aliasing-free LP) + bit reduction."""
    a = as_array(x)
    lp = lp if lp is not None else sr * 0.45
    y = lpf(a, lp, 4)
    y = bitcrush(y, bits, rate=sr)
    y = lpf(y, lp, 2)
    return a * (1 - mix) + y * mix


def telephone(x, lo=350, hi=3400, gsm=False):
    y = sos_filter(as_array(x), bandpass_sos(lo, hi, 3))
    if gsm:
        import pedalboard
        y = pb(y, pedalboard.GSMFullRateCompressor())
    return saturate(y, 6, 'tanh')


def mp3_artifacts(x, quality=9.0):
    """Low-bitrate MP3 artefacts (pedalboard). quality 0 best .. 10 worst."""
    import pedalboard
    return pb(x, pedalboard.MP3Compressor(vbr_quality=quality))


# ============================================================================ DYNAMICS
def compress(x, thr=-18.0, ratio=3.0, attack=0.01, release=0.12, knee=6.0, makeup=0.0, sidechain=None,
             mix=1.0, rms_ms=0.0):
    """Linked stereo feed-forward compressor. sidechain: optional key signal (array)."""
    a = as_array(x)
    key = as_array(sidechain) if sidechain is not None else a
    det = np.max(np.abs(key), axis=0) if key.ndim == 2 else np.abs(key)
    if rms_ms > 0:
        w = max(1, ns(rms_ms / 1000))
        det = np.sqrt(np.convolve(det ** 2, np.ones(w) / w, mode='same'))
    det = fit(det, a.shape[-1])
    gdb = _dsp.compressor_gain(db(det + 1e-12), float(thr), float(ratio), float(knee), float(attack),
                               float(release), float(SR))
    y = a * amp(gdb + makeup)
    return a * (1 - mix) + y * mix


def transient(x, attack_db=4.0, sustain_db=0.0, fast=0.002, slow=0.05):
    """Transient shaper: boost/cut attacks and sustain independently."""
    a = as_array(x)
    m = np.max(np.abs(a), axis=0) if a.ndim == 2 else np.abs(a)
    ef = _dsp.env_follow(m, fast, 0.03, float(SR))
    es = _dsp.env_follow(m, slow, 0.15, float(SR))
    d = np.clip(db(ef + 1e-9) - db(es + 1e-9), 0, 24) / 12
    gdb = attack_db * d + sustain_db * (1 - np.clip(d, 0, 1))
    return a * amp(gdb)


def gate(x, thresh_db=-40.0, attack=0.001, release=0.05, hold=0.02, floor_db=-80.0):
    a = as_array(x)
    m = np.max(np.abs(a), axis=0) if a.ndim == 2 else np.abs(a)
    e = _dsp.env_follow(m, 0.0005, hold + 0.01, float(SR))
    open_ = (db(e + 1e-12) > thresh_db).astype(np.float64)
    g = _dsp.env_follow(open_, attack, release, float(SR))
    g = amp(floor_db) + (1 - amp(floor_db)) * g
    return a * g


def duck_env(n, times, depth_db=6.0, attack=0.004, hold=0.01, release=0.2, shape=2.0, t0=0.0):
    """Sidechain 'pump' gain curve (linear, length n) from trigger times (seconds).
    shape>1 = snappier recovery curve (classic EDM pump)."""
    g = np.ones(n)
    floor = amp(-abs(depth_db))
    A, H, R = ns(attack), ns(hold), ns(release)
    seg_len = A + H + R
    seg = np.ones(seg_len)
    if A > 0:
        seg[:A] = 1 - (1 - floor) * (np.arange(A) / A)
    seg[A:A + H] = floor
    x = np.arange(R) / max(R, 1)
    seg[A + H:] = floor + (1 - floor) * (1 - (1 - x) ** shape)
    for t in times:
        s = ns(t - t0) - A
        a0, b0 = max(0, s), min(n, s + seg_len)
        if b0 > a0:
            g[a0:b0] = np.minimum(g[a0:b0], seg[a0 - s:b0 - s])
    return g


def sidechain(x, key, depth_db=6.0, thresh_db=-30.0, attack=0.003, release=0.18, ratio=4.0):
    """Envelope-follower ducking of x by key signal (depth capped)."""
    a = as_array(x)
    k = as_array(key)
    km = np.max(np.abs(k), axis=0) if k.ndim == 2 else np.abs(k)
    km = fit(km, a.shape[-1])
    e = _dsp.env_follow(km, attack, release, float(SR))
    over = np.clip(db(e + 1e-12) - thresh_db, 0, None) * (1 - 1 / ratio)
    gr = -np.minimum(over, abs(depth_db))
    return a * amp(gr)


def trance_gate(x, pattern='x.x.xx.x', bpm=120, div=16, attack=0.003, release=0.04, depth=1.0, t0=0.0):
    a = as_array(x)
    n = a.shape[-1]
    step = 240.0 / bpm / div
    t = t0 + np.arange(n) / SR
    idx = np.floor(t / step).astype(int)
    pat = np.array([0 if c in '.-_' else 1 for c in pattern if c not in ' |'], dtype=float)
    g = pat[idx % len(pat)]
    g = _dsp.env_follow(g, attack, release, float(SR))
    return a * (1 - depth + depth * g)


# ============================================================================ TIME / PITCH
def varispeed(x, rate):
    """Play x with time-varying speed `rate` (array len = output length, or scalar). rate 1 = normal."""
    a = as_array(x)
    if np.ndim(rate) == 0:
        m = int(a.shape[-1] / max(rate, 1e-3))
        rate = np.full(m, float(rate))
    pos = np.cumsum(np.asarray(rate, dtype=np.float64)) - rate[0]
    return _pc(a, lambda c, i: _dsp.varispeed(np.ascontiguousarray(c), pos))


def repitch(x, ratio):
    """Resample to change speed+pitch by ratio (2 = octave up, half length). Band-limited."""
    a = as_array(x)
    from fractions import Fraction
    fr = Fraction(1 / ratio).limit_denominator(200)
    if fr.numerator == 1 and fr.denominator == 1:
        return a.copy()
    if abs(float(fr) - 1 / ratio) < 1e-4:
        return resample_poly(a, fr.numerator, fr.denominator, axis=-1)
    return varispeed(a, float(ratio))


def pitch_shift(x, semitones):
    """Pitch shift keeping duration (pedalboard PitchShift)."""
    import pedalboard
    a = as_array(x)
    return fit(pb(a, pedalboard.PitchShift(semitones=float(semitones))), a.shape[-1])


def time_stretch(x, rate):
    import librosa
    a = as_array(x)
    return _pc(a, lambda c, i: librosa.effects.time_stretch(c, rate=rate))


def tape_stop(x, start=0.0, dur=0.6, curve=1.6, keep_len=True):
    """Tape stop from `start` seconds: speed ramps 1 -> 0 over `dur` (pitch falls), silence after."""
    a = as_array(x)
    n = a.shape[-1]
    s = ns(start)
    d = ns(dur)
    rate = np.ones(n)
    k = np.arange(d) / max(d, 1)
    rr = (1 - k) ** curve
    rate[s:s + d] = rr[:max(0, min(d, n - s))]
    rate[s + d:] = 0.0
    pos = np.concatenate([[0.0], np.cumsum(rate)[:-1]])
    y = _pc(a, lambda c, i: _dsp.varispeed(np.ascontiguousarray(c), pos))
    fo = ns(0.01)
    e = np.ones(n)
    if s + d < n:
        e[s + d:] = 0
    e[max(0, s + d - fo):s + d] = np.linspace(1, 0, len(e[max(0, s + d - fo):s + d]))
    return y * e


def tape_start(x, dur=0.5, curve=1.6):
    """Tape start: speed 0 -> 1 over dur (output is longer than input by ~dur/2)."""
    a = as_array(x)
    d = ns(dur)
    k = np.arange(d) / d
    rr = k ** curve
    rate = np.concatenate([rr, np.ones(a.shape[-1])])
    pos = np.concatenate([[0.0], np.cumsum(rate)[:-1]])
    m = np.searchsorted(pos, a.shape[-1] - 1)
    pos = pos[:m]
    return _pc(a, lambda c, i: _dsp.varispeed(np.ascontiguousarray(c), pos))


def stutter(x, slice_sec=0.0625, repeats=4, start=0.0, decay_db=0.0, pitch_step=0.0, xfade=0.003,
            gate=0.9):
    """Buffer-repeat: repeat [start, start+slice) `repeats` times. pitch_step semitones per repeat."""
    a = as_array(x)
    s = ns(start)
    L = ns(slice_sec)
    seg = a[..., s:s + L]
    if seg.shape[-1] < L:
        seg = fit(seg, L)
    outs = []
    for k in range(repeats):
        g = amp(decay_db * k)
        sg = seg
        if pitch_step:
            sg = repitch(seg, 2 ** (pitch_step * k / 12))
        gl = min(int(L * gate), sg.shape[-1])
        sg = fit(fade(sg[..., :gl], xfade, xfade), L)      # fade at the gate point, not after the silence
        outs.append(sg * g)
    return np.concatenate(outs, axis=-1)


def reverse(x):
    return as_array(x)[..., ::-1].copy()


def scratch(x, motion=None, dur=None, rate_scale=1.0):
    """Turntable scratch: motion = [(t, rate), ...] breakpoints of playback rate (neg = backwards).
    Default: a classic 'baby scratch' forward-back-forward."""
    a = as_array(x)
    if motion is None:
        motion = [(0, 0), (0.06, 1.8), (0.12, 0.0), (0.18, -1.8), (0.24, 0), (0.30, 2.2), (0.36, 0)]
    dur = dur or motion[-1][0]
    n = ns(dur)
    r = breakpoints(motion, n) * rate_scale
    pos = np.cumsum(r)
    pos = pos - pos.min() + 2
    y = _pc(a, lambda c, i: _dsp.varispeed(np.ascontiguousarray(c), pos))
    # vinyl friction: lowpass when slow
    return y * np.clip(np.abs(r) / 0.5, 0, 1) ** 0.5
