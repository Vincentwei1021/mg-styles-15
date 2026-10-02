"""Motion-graphics sound design.  Every generator returns a Sound, loudness-normalised (≈ -18 dB
short-window K-RMS, peaks <= -1 dBFS) so SFX sit consistently at gain 0 in a Mix, with a meaningful
sync point:

  whoosh ....... sync = pass-by peak          riser / reverse_cymbal / swell ... sync = end (the hit)
  impact/boom .. sync = transient (t=0)       everything else ...................... sync = onset

Categories: whoosh swish riser downlifter impact boom sub_drop reverse_cymbal swell | pop blip click
tick toggle ui (confirm/error/notify/hover/swipe) ding | bubble bubbles drip gloop splash squelch morph
stretch | paper tape_rip sticker_slap sticker_peel stamp pen shutter typewriter typing scissors |
glitch stutter bitcrush_burst digital_noise data_chirp | vhs_noise head_switch vinyl static crt_on
crt_off crt_whine tape_stop power_down | laser zap charge | sparkle shimmer_hit magic chime |
coin jump powerup oneup (8-bit) | hud_beep hud_scan lock_on hud_data hud_open hud_alert hud_ping |
boing sproing duang slide_whistle squeak zip cork_pop rimshot_joke | record_scratch heartbeat
text_hit transition
"""
from __future__ import annotations

import numpy as np

from .core import (SR, Sound, ns, rng, fade, pan_mono, pan_curve, layer, amp, norm_loud, to_stereo,
                   to_mono, pink, white, brown, noise_st, exp_ramp, width as _width)
from .theory import hz, midi, SCALES, pc
from . import osc as O
from . import filters as F
from . import fx as FX
from . import _dsp

LEVEL = -18.0   # default loudness-proxy target for all SFX


def _out(st, sync=0.0, level=None, peak_db=-1.0, max_limit_db=6.0):
    """Finalise an SFX: DC-block, declick (0.3 ms in / 4 ms out), loudness-normalise to `level` (short-window
    K-RMS, default LEVEL) with a -1 dBFS peak ceiling.  Spiky material (crackle, clicks) that would be
    peak-limited far below the target gets up to `max_limit_db` of transparent lookahead limiting."""
    from .core import loudness_proxy, amp as _amp, peak as _peak
    st = np.nan_to_num(np.asarray(st, dtype=np.float64))
    if st.ndim == 1:
        st = np.stack([st, st])
    st = st - np.mean(st, axis=1, keepdims=True) * 0.0
    st = F.sos_filter(st, F.highpass_sos(12.0, 1))
    st = fade(st, 0.0003, 0.004, curve='lin')
    tgt = LEVEL if level is None else level
    L = loudness_proxy(st)
    if L < -110:
        return Sound(st, sync)
    g = _amp(tgt - L)
    ceil = _amp(peak_db)
    pk = _peak(st) * g
    if pk > ceil:
        extra = min(pk / ceil, _amp(max_limit_db))
        if extra > _amp(0.5):
            from .master import limiter
            y = limiter(st * g / (pk / ceil) * extra, ceiling_db=peak_db - 0.1, lookahead=0.002, release=0.025, os=2)
        else:
            y = st * g / (pk / ceil)
        y = y * min(1.0, ceil / (_peak(y) + 1e-12))
        return Sound(y, sync)
    return Sound(st * g, sync)


def _t(dur):
    return np.arange(ns(dur)) / SR


def _dec(t, t60, hold=0.0):
    return np.exp(-6.91 * np.maximum(t - hold, 0) / max(t60, 1e-4))


def _delay(y, d):
    """Delay by d samples (no wrap-around, unlike np.roll)."""
    d = int(d)
    return y if d <= 0 else np.concatenate([np.zeros(d), y[:-d]])


def _wide(y, delay=0.003, amt=0.5, hp=300.0):
    """Mono -> MONO-COMPATIBLE stereo: L = y + s, R = y - s with s a high-passed delayed copy (L+R = 2y).
    Use instead of [y, roll(y, k)] for anything tonal: a delayed copy in one channel comb-filters / cancels
    tones in the mono sum (glitch 'stutter' was -0.96 correlated)."""
    s = F.hpf(_delay(y, ns(delay)), hp, 2) * amt
    return np.stack([y + s, y - s])


# ============================================================================ WHOOSH FAMILY
_WHOOSH = {
    #          lo    hi     q    color   rumble  tone
    'air':    (600, 5200, 1.3, 'pink', 0.0, 0.0),
    'swoosh': (450, 4200, 1.1, 'pink', 0.15, 0.0),
    'swish':  (1500, 9000, 1.8, 'white', 0.0, 0.0),
    'heavy':  (140, 1800, 0.9, 'pink', 0.7, 0.0),
    'sci':    (500, 6000, 2.2, 'pink', 0.2, 0.6),
    'cloth':  (500, 3800, 1.0, 'pink', 0.1, 0.0),
    'fire':   (250, 2800, 0.8, 'brown', 0.5, 0.0),
    'soft':   (350, 2500, 1.0, 'pink', 0.1, 0.0),
}


def whoosh(dur=0.7, kind='swoosh', direction=1, peak=0.62, doppler=0.35, lo=None, hi=None, seed=None,
           level=None, width=1.0):
    """Pass-by whoosh.  kind: air swoosh swish heavy sci cloth fire soft.  direction: 1 L->R, -1 R->L,
    0 centred.  peak: fraction of dur where the object passes (sync point).  doppler: pitch/cutoff
    shift amount (octaves) from approach to recede."""
    lo0, hi0, q, color, rumble, tone = _WHOOSH[kind]
    lo = lo or lo0
    hi = hi or hi0
    n = ns(dur)
    t = np.arange(n) / SR
    tp = peak * dur
    w_in = max(tp * 0.42, 0.02)
    w_out = max((dur - tp) * 0.38, 0.02)
    d = np.where(t < tp, (t - tp) / w_in, (t - tp) / w_out)
    prox = 1.0 / (1.0 + d ** 2)
    a = prox ** 1.6
    a *= np.clip(t / 0.02, 0, 1) * np.clip((dur - t) / 0.03, 0, 1)
    dop = 2 ** (doppler * np.tanh(-(t - tp) / (0.5 * (w_in + w_out))))
    fc = lo * (hi / lo) ** prox * dop
    r = rng(seed)
    src = noise_st(n, color, seed=int(r.integers(1 << 30)), corr=0.3)
    y = F.svf(src, fc, q, 'bpn') * 1.4 + F.svf(src, fc * 0.6, 0.6, 'lp') * 0.35
    if kind == 'cloth':
        fl = 0.6 + 0.4 * np.abs(np.sin(2 * np.pi * np.cumsum(18 + 20 * prox) / SR))
        y = y * fl
    if kind == 'fire':
        cr = (r.random(n) < 0.002 * prox).astype(float)
        cr = np.tanh(F.hpf(cr * r.standard_normal(n), 1500) * 1.2) * 0.6
        y = y + _wide(cr, 0.0019, 0.8, 1000.0)
    if rumble:
        br = brown(n, seed=int(r.integers(1 << 30)))
        br = F.lpf(br, 180 + 250 * prox) * rumble * 2.2
        y = y + np.stack([br, br])
    if tone:
        ft = fc * 0.5
        s = O.saw(ft) * 0.25 + O.sine(ft * 0.5) * 0.3
        s = F.svf(s, fc, 3.0, 'bpn')
        y = y + tone * np.stack([s, s])
    y = y * a
    if direction:
        pan = np.clip(direction * np.tanh((t - tp) / (0.6 * (w_in + w_out))) * 0.85, -1, 1)
        y = pan_curve(y, pan)
    if width != 1.0:
        y = _width(y, width)
    y = F.hpf(y, 60 if kind == 'heavy' else 120)
    return _out(y, sync=tp, level=level)


def swish(dur=0.28, direction=1, seed=None, level=None):
    """Short bright swish (UI swipes, fast motion)."""
    return whoosh(dur, 'swish', direction, peak=0.55, doppler=0.25, seed=seed, level=level)


def riser(dur=2.0, kind='hybrid', note='A3', intensity=1.0, end='cut', seed=None, level=None):
    """Tension riser, sync at END.  kind: 'noise' | 'tonal' | 'hybrid' | 'shepard' | 'sweep'.
    end: 'cut' (hard stop at the hit) | 'soft' (fade last 60 ms)."""
    n = ns(dur)
    t = np.arange(n) / SR
    x = t / dur
    r = rng(seed)
    out = np.zeros((2, n))
    if kind in ('noise', 'hybrid', 'sweep'):
        src = noise_st(n, 'white', seed=int(r.integers(1 << 30)), corr=0.35)
        hp = 150 * (6000 / 150) ** (x ** 1.4)
        bp = 400 * (9500 / 400) ** (x ** 1.2)
        y = F.svf(src, hp, 0.7, 'hp') * 0.5 + F.svf(src, bp, 3.5, 'bpn') * 0.9
        out += y * (x ** 2.2) * (1.0 if kind != 'hybrid' else 0.8)
    if kind in ('tonal', 'hybrid'):
        semis = 12 * x ** 1.7
        f0 = hz(note)
        f = f0 * 2 ** (semis / 12)
        st = np.zeros((2, n))
        for iv, g in [(0, 1.0), (7, 0.6), (12, 0.7), (19, 0.25)]:
            st += g * O.unison('saw', f * 2 ** (iv / 12), n, 5, 18, 0.9, seed=int(r.integers(1 << 30)))
        st = F.svf(st, 400 * (12000 / 400) ** (x ** 1.3), 1.2, 'lp')
        trem = FX.lfo(n, 3.0, 'tri', rate_end=22.0)
        st = st * (1 - 0.55 * x * (0.5 + 0.5 * trem))
        out += st * (x ** 1.8) * 0.45
    if kind == 'shepard':
        st = np.zeros(n)
        f_lo = 55.0
        for k in range(7):
            oct_pos = (k + x * 1.0) % 7
            f = f_lo * 2 ** oct_pos
            w = np.exp(-0.5 * ((oct_pos - 3.5) / 1.3) ** 2)
            st += np.sin(2 * np.pi * np.cumsum(f) / SR + k) * w
        st = st * (0.3 + 0.7 * x ** 1.2)
        out += _wide(st, 0.0044, 0.8, 200.0) * 0.35
        nz = F.svf(noise_st(n, 'pink', seed=3), 1000 * 8 ** x, 2.0, 'bpn') * x ** 2
        out += nz * 0.6
    # widening & intensity
    out = _width(out, 0.6 + 0.65 * x)     # width > ~1.3 on decorrelated noise turns L/R anti-correlated
    out *= intensity
    fo = 0.003 if end == 'cut' else 0.06
    out = fade(out, 0.02, fo)
    return _out(out, sync=dur, level=level)


def downlifter(dur=2.0, note='A2', seed=None, level=None):
    """Falling release after a hit, sync at START."""
    n = ns(dur)
    t = np.arange(n) / SR
    x = t / dur
    r = rng(seed)
    src = noise_st(n, 'white', seed=int(r.integers(1 << 30)), corr=0.2)
    y = F.svf(src, 9000 * (180 / 9000) ** (x ** 0.7), 1.2, 'lp') * (1 - x) ** 1.4
    f = hz(note) * 2 ** (-24 * x ** 0.8 / 12) * 2
    tone = O.unison('saw', f, n, 4, 15, 0.8, seed=5)
    tone = F.svf(tone, 6000 * (200 / 6000) ** x, 1.0, 'lp') * (1 - x) ** 2 * 0.4
    sub = O.sine(exp_ramp(n, 90, 28)) * (1 - x) ** 1.5 * 0.9
    out = y + tone + np.stack([sub, sub])
    out = fade(out, 0.004, 0.05)
    return _out(out, 0.0, level)


def impact(kind='cinematic', size=1.0, vel=1.0, seed=None, level=None):
    """Layered hit (sub thump + transient + body + tail).  kind: cinematic, punch (text slam / UI),
    soft, metal, glitch, thud (dull), trailer (huge)."""
    r = rng(seed)
    tail = {'cinematic': 2.4, 'punch': 0.6, 'soft': 1.2, 'metal': 2.8, 'glitch': 1.0, 'thud': 0.5,
            'trailer': 4.0}[kind] * size
    L = tail + 0.2
    n = ns(L)
    t = np.arange(n) / SR
    out = np.zeros((2, n))
    # sub thump
    f_sub = 34 + 30 * np.exp(-t / 0.12)
    sub = np.sin(2 * np.pi * np.cumsum(f_sub) / SR) * _dec(t, min(tail * 0.6, 1.6), 0.02)
    sub = np.tanh(2.0 * sub)
    out += sub * (0.9 if kind != 'soft' else 0.7)
    # body: pitched punch
    fb = 55 + 120 * np.exp(-t / 0.03)
    body = np.sin(2 * np.pi * np.cumsum(fb) / SR) * _dec(t, 0.25)
    nb = F.bpf(r.standard_normal(n), 120, 1400, 2) * _dec(t, 0.12)
    out += (body * 0.6 + nb * 0.5)
    # transient
    if kind != 'soft':
        k = ns(0.008)
        tr = F.hpf(r.standard_normal(k), 1200) * np.exp(-np.arange(k) / (SR * 0.0018))
        out[:, :k] += tr * (1.0 if kind in ('punch', 'glitch', 'metal') else 0.7)
    # tail: decorrelated noise with closing LP (reverb-like)
    if tail > 0.3:
        tn = noise_st(n, 'pink', seed=int(r.integers(1 << 30)), corr=0.0)
        lp = 300 + 5000 * np.exp(-t / (tail * 0.18))
        tn = F.svf(tn, lp, 0.7, 'lp') * _dec(t, tail) * (1 - np.exp(-t / 0.01))
        out += tn * (0.7 if kind != 'thud' else 0.2)
    if kind in ('metal', 'trailer'):
        m = np.zeros(n)
        for f in r.uniform(250, 3500, 14):
            m += np.sin(2 * np.pi * f * t + r.random() * 6) * _dec(t, tail * r.uniform(0.3, 0.9)) * r.uniform(0.3, 1)
        m = F.bpf(m, 200, 5000) / 4
        out += _wide(m, 0.0065, 0.7, 200.0) * 0.6
    if kind == 'glitch':
        g = glitch(0.35, 'digital', seed=int(r.integers(1 << 30))).data
        out[:, :g.shape[1]] += g * 0.5
    if kind == 'soft':
        out = F.lpf(out, 2500)
    if kind == 'trailer':
        out = out + FX.reverb(out, 'big', decay=tail * 0.8, mix=1.0) * 0.5
    out = FX.saturate(out, 3, 'tanh')
    out = F.hpf(out, 24, 4)
    return _out(fade(out, 0, 0.1) * vel, 0.0, (level if level is not None else LEVEL + 2))


def boom(dur=2.5, f0=48.0, seed=None, level=None):
    """Deep sub boom with rumble (big reveal / logo landing)."""
    n = ns(dur)
    t = np.arange(n) / SR
    f = f0 * 0.7 + f0 * 0.6 * np.exp(-t / 0.15)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * _dec(t, dur * 0.7, 0.03)
    s = np.tanh(2.5 * s) * 0.9
    rm = F.lpf(brown(n, seed=seed), 140) * _dec(t, dur) * 2.0
    out = np.stack([s + rm, s + rm])
    k = ns(0.01)
    out[:, :k] += F.lpf(rng(seed).standard_normal(k), 3000) * np.linspace(1, 0, k) * 0.6
    return _out(F.hpf(out, 22, 4), 0.0, (level if level is not None else LEVEL + 1))


def sub_drop(dur=1.2, f_start=110.0, f_end=32.0, level=None):
    """808-style falling sub (bass drop)."""
    n = ns(dur)
    t = np.arange(n) / SR
    f = f_end + (f_start - f_end) * np.exp(-t / (dur * 0.35))
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * _dec(t, dur, 0.05)
    s = np.tanh(2.0 * s)
    return _out(F.hpf(s, 22), 0.0, level)


def reverse_cymbal(dur=1.6, engine='auto', seed=None, level=None):
    """Reverse crash swelling into the hit (sync at END)."""
    from . import samples as S
    if engine in ('auto', 'sample') and S.available('crash'):
        c = S.hit('crash', match='crash1_ff', vel=1.0).data
    else:
        from .drums import cymbal
        c = cymbal('crash', 1.0, decay=3.0).data
    c = to_stereo(c)
    c = c[:, :ns(dur)]
    if c.shape[1] < ns(dur):
        c = np.pad(c, ((0, 0), (0, ns(dur) - c.shape[1])))
    rv = c[:, ::-1]
    x = np.linspace(0, 1, rv.shape[1])
    rv = rv * x ** 1.2
    rv = fade(rv, 0.05, 0.004)
    return _out(F.hpf(rv, 300), sync=dur, level=level)


def swell(sound, decay=2.0, kind='hall', level=None):
    """Reverse-reverb swell INTO `sound` (sync at the sound's onset). Returns swell + dry."""
    from .core import as_array
    a = to_stereo(as_array(sound))
    pre = FX.reverse_reverb(a, kind, decay)
    tail_n = pre.shape[1] - a.shape[1]
    out = pre.copy()
    out[:, tail_n:] += a * 0.9
    out = fade(out, 0.1, 0.05)
    return _out(out, sync=tail_n / SR, level=level)


# ============================================================================ UI
def pop(kind='mouth', pitch=1.0, level=None):
    """Pops: 'mouth' (falling), 'bubble' (rising), 'soft', 'cork'."""
    if kind == 'cork':
        return cork_pop(level=level)
    L = 0.09
    t = _t(L)
    if kind == 'bubble':
        f = 380 * pitch * (1 + 2.2 * (1 - np.exp(-t / 0.018)))
    elif kind == 'soft':
        f = 600 * pitch * (0.8 + 0.4 * np.exp(-t / 0.01))
    else:
        f = 260 * pitch + 900 * pitch * np.exp(-t / 0.008)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * _dec(t, 0.05) * (1 - np.exp(-t / 0.0007))
    k = ns(0.002)
    y[:k] += F.hpf(rng(3).standard_normal(k), 2000) * 0.2
    return _out(y, 0.0, level)


def blip(note='C6', kind='sine', dur=0.07, glide=2.0, level=None):
    """Short UI blip; glide = semitones of upward chirp."""
    L = dur + 0.03
    t = _t(L)
    f = hz(note) * 2 ** (glide * np.clip(t / 0.02, 0, 1) / 12)
    if kind == 'sine':
        y = np.sin(2 * np.pi * np.cumsum(f) / SR)
    elif kind == 'tri':
        y = O.tri(f)
    elif kind == 'square':
        y = F.lpf(O.pulse(f, pw=0.5), 5000)
    else:
        y = O.fm_pair(f, None, 2.0, 1.2)
    y = y * np.clip(t / 0.002, 0, 1) * _dec(t, dur, dur * 0.3)
    return _out(y, 0.0, (level if level is not None else LEVEL - 3))


def click(kind='soft', level=None):
    """Clicks: 'soft' (UI), 'hard' (switch), 'mouse', 'switch' (toggle clack), 'wood'."""
    r = rng(None)
    L = 0.05
    t = _t(L)
    if kind == 'mouse':
        y = F.bpf(r.standard_normal(ns(L)), 2000, 7000) * _dec(t, 0.004)
        y += np.sin(2 * np.pi * 3100 * t) * _dec(t, 0.006) * 0.4
        y2 = F.bpf(r.standard_normal(ns(L)), 1500, 5000) * _dec(t, 0.003) * 0.5
        y = y + np.pad(y2, (ns(0.045), 0))[:y.shape[0]]
    elif kind == 'hard':
        y = F.bpf(r.standard_normal(ns(L)), 800, 9000) * _dec(t, 0.006)
        y += np.sin(2 * np.pi * 1800 * t) * _dec(t, 0.01) * 0.5
    elif kind == 'switch':
        y = F.bpf(r.standard_normal(ns(L)), 400, 5000) * _dec(t, 0.012)
        y += np.sin(2 * np.pi * 900 * t) * _dec(t, 0.015) * 0.6
    elif kind == 'wood':
        y = np.sin(2 * np.pi * 1300 * t) * _dec(t, 0.025) + F.bpf(r.standard_normal(ns(L)), 2000, 8000) * _dec(t, 0.003)
    else:
        y = F.bpf(r.standard_normal(ns(L)), 2500, 9000) * _dec(t, 0.003) + \
            np.sin(2 * np.pi * 2400 * t) * _dec(t, 0.008) * 0.5
    return _out(y, 0.0, (level if level is not None else LEVEL - 4))


def tick(kind='clock', level=None):
    """Ticks: 'clock', 'hi' (UI counter), 'wood', 'tock'."""
    L = 0.04
    t = _t(L)
    f = {'clock': 3200, 'hi': 5200, 'wood': 1400, 'tock': 900}[kind]
    y = np.sin(2 * np.pi * f * t) * _dec(t, 0.012) + F.hpf(rng(9).standard_normal(ns(L)), 3000) * _dec(t, 0.002) * 0.6
    return _out(y, 0.0, (level if level is not None else LEVEL - 6))


def toggle(on=True, level=None):
    a = click('switch').data
    b = blip('E6' if on else 'A5', 'sine', 0.05, glide=3 if on else -3, level=LEVEL - 6).data
    return _out(layer([(a, 0), (b, 0.012, -4)]).data, 0.0, (level if level is not None else LEVEL - 3))


def ding(note='E6', kind='bell', dur=1.2, level=None):
    """Bright notification ding (FM bell)."""
    from .fm import bell
    s = bell(note, dur, 0.9, kind if kind in ('bell', 'glock', 'celesta', 'chime', 'tubular') else 'bell')
    y = s.data + FX.reverb(s.data, 'plate', decay=1.2, mix=1.0) * 0.25
    return _out(y, 0.0, level)


def ui(kind='confirm', level=None):
    """UI gestures: confirm/success, error, notify, hover, swipe, open, close, delete."""
    if kind in ('confirm', 'success'):
        parts = [(ding('G5', 'celesta', 0.5).data, 0), (ding('D6', 'celesta', 0.8).data, 0.09)]
    elif kind == 'error':
        def buzz(f):
            t = _t(0.12)
            return F.lpf(O.pulse(np.full(t.shape[0], f), pw=0.35), 2500) * _dec(t, 0.12, 0.06)
        parts = [(buzz(180), 0), (buzz(150), 0.14)]
    elif kind == 'notify':
        parts = [(ding('C6', 'glock', 0.5).data, 0), (ding('E6', 'glock', 0.5).data, 0.08),
                 (ding('A6', 'glock', 0.9).data, 0.16)]
    elif kind == 'hover':
        return tick('hi', level=level)
    elif kind == 'swipe':
        return swish(0.22, level=level)
    elif kind == 'open':
        parts = [(blip('C5', 'sine', 0.08, glide=7).data, 0), (blip('G5', 'sine', 0.12, glide=5).data, 0.05)]
    elif kind == 'close':
        parts = [(blip('G5', 'sine', 0.08, glide=-5).data, 0), (blip('C5', 'sine', 0.12, glide=-7).data, 0.05)]
    elif kind == 'delete':
        parts = [(whoosh(0.3, 'swish', -1).data, 0), (click('hard').data, 0.12)]
    else:
        raise ValueError(kind)
    return _out(layer(parts).data, 0.0, (level if level is not None else LEVEL - 2))


# ============================================================================ LIQUID
def bubble(size=1.0, rise=1.6, level=None, seed=None):
    """Single bubble (Minnaert resonance, rising pitch). size 0.3 (tiny, high) .. 3 (big, low)."""
    f0 = 1200.0 / size
    tau = 0.012 * size ** 0.8 + 0.006
    L = tau * 7 + 0.01
    t = _t(L)
    f = f0 * (1 + rise * t / (tau * 4))
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / tau) * (1 - np.exp(-t / 0.0008))
    return _out(y, 0.0, (level if level is not None else LEVEL - 4))


def bubbles(dur=1.5, density=18.0, size=(0.4, 2.0), level=None, seed=None):
    """Bubbling texture (random bubbles, stereo)."""
    r = rng(seed)
    k = max(1, int(dur * density))
    parts = []
    for i in range(k):
        s = bubble(np.exp(r.uniform(np.log(size[0]), np.log(size[1]))), r.uniform(1.0, 2.4), level=-20)
        parts.append((s, r.uniform(0, dur), r.uniform(-12, 0), r.uniform(-0.8, 0.8)))
    return _out(layer(parts).data, 0.0, level)


def drip(pitch=1.0, level=None, seed=None):
    """Liquid drip 'plink' (fast upward resonance + tiny splash)."""
    L = 0.25
    t = _t(L)
    f = 650 * pitch * (1 + 2.0 * (1 - np.exp(-t / 0.012)))
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.035) * (1 - np.exp(-t / 0.0006))
    sp = F.hpf(rng(seed).standard_normal(ns(L)), 4000) * _dec(t, 0.02) * 0.08
    y = y + sp
    st = np.stack([y, y])
    st = st + FX.reverb(st, 'room', decay=0.45, mix=1.0) * 0.18
    return _out(st, 0.0, level)


def gloop(pitch=1.0, dur=0.35, level=None, seed=None):
    """Thick liquid 'gloop / glug' (metaballs merging)."""
    L = dur + 0.1
    t = _t(L)
    f = 140 * pitch * (1 + 1.6 * (1 - np.exp(-t / (dur * 0.35))))
    wob = 1 + 0.12 * np.sin(2 * np.pi * 14 * t) * np.exp(-t / 0.15)
    ph = 2 * np.pi * np.cumsum(f * wob) / SR
    y = np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.15 * np.sin(3 * ph)
    y = F.svf(y, 300 + 1400 * np.exp(-t / 0.08), 3.0, 'lp')
    y = y * _dec(t, dur, 0.02) * (1 - np.exp(-t / 0.003))
    y = y + F.lpf(rng(seed).standard_normal(ns(L)), 900) * _dec(t, 0.05) * 0.3
    return _out(y, 0.0, level)


def splash(size=1.0, level=None, seed=None):
    r = rng(seed)
    L = 0.6 * size + 0.2
    n = ns(L)
    t = np.arange(n) / SR
    src = noise_st(n, 'white', seed=int(r.integers(1 << 30)))
    y = F.svf(src, 6000 * np.exp(-t / (0.2 * size)) + 800, 0.8, 'lp') * _dec(t, 0.45 * size) * (1 - np.exp(-t / 0.004))
    parts = [(y, 0.0)]
    for i in range(int(8 * size)):
        parts.append((drip(r.uniform(0.8, 2.2), level=-26), r.uniform(0.05, L * 0.8), -6, r.uniform(-0.8, 0.8)))
    return _out(layer(parts).data, 0.0, level)


def squelch(dur=0.4, level=None, seed=None):
    """Wet squish (slime, jelly press)."""
    r = rng(seed)
    n = ns(dur)
    t = np.arange(n) / SR
    nz = r.standard_normal(n)
    fc = 500 + 900 * (0.5 + 0.5 * np.sin(2 * np.pi * 11 * t + r.random() * 6))
    y = F.svf(nz, fc, 6.0, 'bpn') * np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 0.7
    y = FX.saturate(y, 6, 'tanh')
    return _out(y, 0.0, level)


def morph(dur=0.8, up=True, note='A3', level=None):
    """Tonal 'shape morph' sweep: vowel-shifting wub with pitch glide (for SVG/shape morphs)."""
    n = ns(dur)
    t = np.arange(n) / SR
    x = t / dur
    f0 = hz(note) * 2 ** ((7 if up else -7) * (x if up else x) / 12)
    y = O.saw(f0) * 0.5 + O.sine(f0 * 0.5)
    fc = (400 if up else 2400) * ((2400 / 400) if up else (400 / 2400)) ** x
    y = F.svf(y, fc, 4.0, 'bpn') + 0.3 * F.svf(y, fc * 2.2, 5.0, 'bpn')
    y = y * np.sin(np.pi * x) ** 0.8
    st = FX.chorus(np.stack([y, y]), 0.8, 3.0, mix=0.5)
    return _out(st, dur * 0.5, level)


def stretch(dur=0.5, up=True, level=None):
    """Rubbery elastic stretch squeak (cartoon squash & stretch)."""
    n = ns(dur)
    t = np.arange(n) / SR
    x = t / dur
    f = (300 if up else 900) * ((3.0 if up else 1 / 3.0) ** x) * (1 + 0.02 * np.sin(2 * np.pi * 40 * t))
    y = O.saw(f) * 0.5
    y = F.svf(y, f * 3, 6.0, 'bpn') * np.sin(np.pi * x) ** 0.5
    return _out(y, 0.0, level)


# ============================================================================ PAPER / STATIONERY / PHOTO
def _crinkle(n, rate, seed, lo=1200, hi=9000):
    """Random micro-impulse crackle with per-impulse colour -> mono."""
    r = rng(seed)
    y = np.zeros(n)
    rate = np.broadcast_to(np.asarray(rate, dtype=np.float64), (n,))
    p = rate / SR
    hits = np.where(r.random(n) < p)[0]
    amps = r.pareto(2.2, hits.shape[0]) + 0.3
    y[hits] = amps * r.choice([-1, 1], hits.shape[0])
    y = F.bpf(y, lo, hi, 2)
    # each impulse rings briefly
    k = ns(0.0015)
    y = np.convolve(y, np.exp(-np.arange(k) / (k / 4)) * r.standard_normal(k), mode='same')
    return y


def paper(kind='rustle', dur=0.6, level=None, seed=None):
    """Paper: 'rustle', 'flip' (page turn), 'crumple', 'slide'."""
    r = rng(seed)
    n = ns(dur)
    t = np.arange(n) / SR
    x = t / dur
    if kind == 'slide':
        e = np.sin(np.pi * x) ** 1.5
        y = F.bpf(r.standard_normal(n), 1200, 6000) * e * 0.5 + _crinkle(n, 80 * e, seed) * 0.3
    elif kind == 'crumple':
        e = np.clip(x * 4, 0, 1) * (1 - x) ** 0.5
        y = _crinkle(n, 1400 * e + 50, seed, 800, 10000) + F.bpf(r.standard_normal(n), 1000, 5000) * e * 0.3
    elif kind == 'flip':
        w = whoosh(dur * 0.9, 'cloth', 1, peak=0.5, seed=seed, level=-24).data
        w = np.pad(w, ((0, 0), (0, max(0, n - w.shape[1]))))[:, :n]
        e = np.exp(-((x - 0.25) / 0.12) ** 2) + 0.8 * np.exp(-((x - 0.75) / 0.06) ** 2)
        c = _crinkle(n, 600 * e + 20, seed)
        flap = np.zeros(n)
        i0 = int(0.78 * n)
        k = ns(0.03)
        flap[i0:i0 + k] = F.lpf(r.standard_normal(k), 1500)[:max(0, min(k, n - i0))] * np.exp(-np.arange(min(k, n - i0)) / (k / 5))
        y = to_mono(w) * 0.7 + c * 0.4 + flap * 0.8
    else:
        e = (0.35 + 0.65 * np.abs(np.sin(np.pi * x * 2.5)) ** 2) * np.sin(np.pi * x) ** 0.5
        y = _crinkle(n, 500 * e + 20, seed) + F.bpf(r.standard_normal(n), 1500, 6000) * e * 0.18
    st = _wide(y, 0.0008, 0.6, 500.0)
    return _out(st, 0.0, level, max_limit_db=10.0)


def tape_rip(dur=0.45, up=True, level=None, seed=None):
    """Adhesive tape pull/rip ('zzzrrip'), ends with a snap."""
    r = rng(seed)
    n = ns(dur)
    t = np.arange(n) / SR
    x = t / dur
    rate = (60 + 130 * x ** 1.5) if up else (180 - 100 * x)
    ph = np.cumsum(rate * (1 + 0.25 * r.standard_normal(n).clip(-2, 2) * 0.1)) / SR
    stick = (np.diff(np.floor(ph), prepend=0) > 0).astype(float)
    stick = stick * (0.6 + 0.4 * r.random(n))
    k = ns(0.004)
    stick = np.convolve(stick, np.exp(-np.arange(k) / (k / 3)), mode='same')
    nz = r.standard_normal(n)
    y = F.bpf(nz * (0.3 + stick), 700, 6000) + F.bpf(stick * r.standard_normal(n), 1600, q=2.5) * 0.8
    y = y * (0.4 + 0.6 * x) * np.clip((dur - t) / 0.01, 0, 1)
    snap = F.hpf(r.standard_normal(ns(0.01)), 1500) * np.exp(-np.arange(ns(0.01)) / 80)
    y[-snap.shape[0]:] += snap * 1.2
    return _out(_wide(y, 0.0005, 0.6, 500.0), 0.0, level)


def sticker_slap(level=None, seed=None):
    """Sticker / label slapped on: soft 'pap' thump + tacky contact."""
    r = rng(seed)
    L = 0.3
    t = _t(L)
    th = np.sin(2 * np.pi * np.cumsum(90 + 110 * np.exp(-t / 0.01)) / SR) * _dec(t, 0.07)
    sl = F.bpf(r.standard_normal(ns(L)), 400, 3500) * _dec(t, 0.025) * 0.9
    ck = F.hpf(r.standard_normal(ns(L)), 3000) * _dec(t, 0.004) * 0.4
    y = th * 0.9 + sl + ck
    st = np.stack([y, y])
    st = st + FX.reverb(st, 'room', decay=0.3, mix=1.0) * 0.15
    return _out(st, 0.0, level)


def sticker_peel(dur=0.35, level=None, seed=None):
    r = rng(seed)
    n = ns(dur)
    x = np.arange(n) / n
    y = _crinkle(n, 200 + 2500 * x ** 2, seed, 1500, 11000) * (0.3 + 0.7 * x)
    y = y + F.bpf(r.standard_normal(n), 2000, 7000) * 0.1 * x
    return _out(np.stack([y, y]), 0.0, level)


def stamp(kind='seal', level=None, seed=None):
    """印章 stamp: 'seal' (heavy Chinese seal: thunk + ink squish + tacky lift), 'rubber' (office stamp),
    'wood' (hard block)."""
    r = rng(seed)
    L = 0.7
    t = _t(L)
    n = ns(L)
    f0 = {'seal': 95, 'rubber': 130, 'wood': 160}[kind]
    th = np.sin(2 * np.pi * np.cumsum(f0 + 90 * np.exp(-t / 0.012)) / SR) * _dec(t, 0.12)
    table = sum(np.sin(2 * np.pi * f * t + r.random() * 6) * a * _dec(t, d)
                for f, a, d in [(210, 0.5, 0.18), (470, 0.35, 0.12), (930, 0.2, 0.08), (1720, 0.1, 0.05)])
    squish = F.lpf(r.standard_normal(n), 1100) * _dec(t, 0.05, 0.005) * 0.7
    ck = F.bpf(r.standard_normal(n), 1500, 6000) * _dec(t, 0.004) * (0.6 if kind == 'wood' else 0.3)
    y = th * 1.0 + table * 0.6 + squish + ck
    if kind == 'seal':
        # tacky lift ~0.38 s later
        lift = F.lpf(_crinkle(ns(0.08), 900, seed, 1200, 5000), 4000) * np.hanning(ns(0.08)) * 0.05
        i0 = ns(0.38)
        y[i0:i0 + lift.shape[0]] += lift
    y = FX.saturate(y, 3)
    st = np.stack([y, y])
    st = st + FX.reverb(st, 'room', decay=0.4, mix=1.0) * 0.12
    return _out(st, 0.0, (level if level is not None else LEVEL + 1))


def pen(kind='pen', dur=1.0, strokes=None, level=None, seed=None):
    """Writing / drawing: 'pen' (ballpoint), 'pencil' (grainy), 'marker' (squeaky felt), 'chalk'.
    strokes: [(start, dur), ...] seconds; default = natural handwriting rhythm."""
    r = rng(seed)
    n = ns(dur)
    t = np.arange(n) / SR
    if strokes is None:
        strokes = []
        s = 0.02
        while s < dur - 0.05:
            d = r.uniform(0.08, 0.28)
            strokes.append((s, min(d, dur - s - 0.01)))
            s += d + r.uniform(0.02, 0.09)
    e = np.zeros(n)
    for s0, d in strokes:
        i0, i1 = ns(s0), min(n, ns(s0 + d))
        m = i1 - i0
        if m <= 4:
            continue
        x = np.linspace(0, 1, m)
        speed = np.sin(np.pi * x) ** 0.6 * (0.7 + 0.3 * np.sin(2 * np.pi * r.uniform(2, 5) * x + r.random() * 6))
        e[i0:i1] = np.maximum(e[i0:i1], speed)
    lo, hi, grain = {'pen': (1800, 6500, 0.4), 'pencil': (2500, 10000, 0.9), 'marker': (900, 5000, 0.2),
                     'chalk': (1200, 7000, 1.2)}[kind]
    nz = r.standard_normal(n)
    gr = np.abs(F.lpf(r.standard_normal(n), 300)) * 3
    y = F.bpf(nz * (1 - grain * 0.5 + grain * gr), lo, hi) * e
    y += _crinkle(n, 400 * e * grain, seed, lo, hi) * 0.3
    if kind == 'marker':
        f = 1400 + 250 * F.lpf(r.standard_normal(n), 8) * 10
        sq = np.sin(2 * np.pi * np.cumsum(f) / SR) * e * 0.08
        y += sq
    return _out(_wide(y, 0.0004, 0.5, 500.0), 0.0, (level if level is not None else LEVEL - 3))


def shutter(kind='dslr', level=None, seed=None):
    """Camera shutter: 'dslr' (mirror clack-clack), 'film' (+ wind lever ratchet), 'phone' (digital)."""
    r = rng(seed)
    L = 0.25 if kind != 'film' else 0.75
    n = ns(L)
    y = np.zeros(n)

    def clk(at, lo, hi, dec, ring=None, g=1.0):
        k = ns(0.05)
        tt = np.arange(k) / SR
        c = F.bpf(r.standard_normal(k), lo, hi) * np.exp(-tt / dec)
        if ring:
            c += np.sin(2 * np.pi * ring * tt) * np.exp(-tt / (dec * 3)) * 0.3
        i0 = ns(at)
        m = min(k, n - i0)
        y[i0:i0 + m] += c[:m] * g

    if kind == 'phone':
        clk(0.0, 2000, 9000, 0.002, None, 1.0)
        clk(0.045, 1500, 7000, 0.003, None, 0.7)
    else:
        clk(0.0, 800, 7000, 0.004, 4200, 1.0)     # mirror up
        k = ns(0.02)
        th = np.sin(2 * np.pi * 280 * np.arange(k) / SR) * np.exp(-np.arange(k) / (SR * 0.006))
        y[:k] += th * 0.6
        clk(0.032, 3000, 11000, 0.0015, None, 0.8)  # curtain
        clk(0.085, 700, 5000, 0.005, 3100, 0.8)     # mirror down
        if kind == 'film':
            for i in range(9):
                clk(0.33 + i * 0.028, 1500 + 150 * i, 7000, 0.0015, None, 0.35)
    st = np.stack([y, y])
    st = st + FX.reverb(st, 'room', decay=0.25, mix=1.0) * 0.08
    return _out(st, 0.0, level)


def typewriter(kind='typewriter', vel=0.8, level=None, seed=None):
    """Single key: 'typewriter' (thock + metallic typebar strike), 'keyboard' (mechanical), 'soft'."""
    r = rng(seed)
    L = 0.12
    t = _t(L)
    n = ns(L)
    if kind == 'typewriter':
        thock = F.bpf(r.standard_normal(n), 150, 900) * _dec(t, 0.02) + np.sin(2 * np.pi * 180 * t) * _dec(t, 0.025) * 0.5
        strike = np.zeros(n)
        i0 = ns(0.011 + r.uniform(0, 0.004))
        tt = t[:n - i0]
        s = F.bpf(r.standard_normal(n - i0), 2000, 7000) * np.exp(-tt / 0.0015)
        s += (np.sin(2 * np.pi * 3150 * tt) * 0.4 + np.sin(2 * np.pi * 5230 * tt) * 0.25) * np.exp(-tt / 0.02)
        strike[i0:] = s
        y = thock * 0.6 + strike * 1.0
    elif kind == 'keyboard':
        y = F.bpf(r.standard_normal(n), 2500, 8000) * _dec(t, 0.004) * 0.7
        y += F.bpf(r.standard_normal(n), 700, 2500) * _dec(t, 0.012, 0.004) * 0.6
        y += np.sin(2 * np.pi * r.uniform(350, 450) * t) * _dec(t, 0.02) * 0.3
    else:
        y = F.bpf(r.standard_normal(n), 2000, 7000) * _dec(t, 0.003) + np.sin(2 * np.pi * 1800 * t) * _dec(t, 0.006) * 0.2
    return _out(y * vel, 0.0, (level if level is not None else LEVEL - 4))


def typing(n_keys=12, rate=11.0, kind='typewriter', bell=False, jitter=0.3, level=None, seed=None):
    """Sequence of key strokes (for type-on text). Returns Sound starting at first key."""
    r = rng(seed)
    parts = []
    tt = 0.0
    for i in range(n_keys):
        space = (i % r.integers(4, 7) == 0) and i > 0
        k = typewriter(kind, vel=r.uniform(0.7, 1.0) * (0.8 if space else 1.0), level=LEVEL - 4,
                       seed=int(r.integers(1 << 30)))
        if space:
            k = Sound(F.lpf(k.data, 3000))
        parts.append((k, tt, 0, r.uniform(-0.2, 0.2)))
        tt += (1 / rate) * (1 + r.uniform(-jitter, jitter))
    if bell:
        parts.append((ding('A6', 'bell', 1.0, level=LEVEL - 3), tt + 0.05))
    return _out(layer(parts).data, 0.0, level)


def scissors(level=None, seed=None):
    r = rng(seed)
    L = 0.25
    n = ns(L)
    t = _t(L)
    y = np.zeros(n)
    for at in (0.0, 0.11):
        i0 = ns(at)
        k = n - i0
        tt = t[:k]
        y[i0:] += F.bpf(r.standard_normal(k), 2500, 9000) * np.exp(-tt / 0.004)
        y[i0:] += np.sin(2 * np.pi * 4700 * tt) * np.exp(-tt / 0.015) * 0.3
    y += F.bpf(r.standard_normal(n), 3000, 8000) * np.clip((t - 0.01) / 0.1, 0, 1) * _dec(t, 0.2, 0.05) * 0.2
    return _out(y, 0.0, level)


# ============================================================================ GLITCH
def glitch(dur=0.3, kind='digital', seed=None, level=None):
    """Glitch bursts: 'digital' (random buzz/S&H/silence segments), 'data' (modem chirps),
    'error' (buzzy gate), 'crunch' (bitcrushed noise), 'stutter' (self-repeating click-tone)."""
    r = rng(seed)
    n = ns(dur)
    y = np.zeros(n)
    if kind == 'digital':
        i = 0
        while i < n:
            L = int(SR * r.uniform(0.004, 0.035))
            L = min(L, n - i)
            tt = np.arange(L) / SR
            c = r.integers(0, 5)
            if c == 0:
                seg = O.pulse(np.full(L, r.uniform(80, 2500)), pw=r.uniform(0.1, 0.5)) if L > 8 else np.zeros(L)
            elif c == 1:
                hsz = int(r.integers(4, 60))
                seg = np.repeat(r.uniform(-1, 1, L // hsz + 1), hsz)[:L]
            elif c == 2:
                seg = np.zeros(L)
            elif c == 3:
                seg = np.sin(2 * np.pi * np.cumsum(np.linspace(r.uniform(300, 3000), r.uniform(300, 6000), L)) / SR)
            else:
                seg = r.standard_normal(L) * 0.6
            y[i:i + L] = fade(seg, 0.0005, 0.0005) * r.uniform(0.4, 1.0)
            i += L
        y = FX.bitcrush(y, bits=6, rate=r.uniform(6000, 16000))
    elif kind == 'data':
        i = 0
        tones = [1200, 2200, 1650, 2750, 980]
        while i < n:
            L = min(int(SR / r.uniform(40, 90)), n - i)
            f = tones[r.integers(0, len(tones))] * r.choice([1, 1, 2])
            y[i:i + L] = np.sin(2 * np.pi * f * np.arange(L) / SR) * 0.7
            i += L
        y += F.hpf(r.standard_normal(n), 3000) * 0.08
    elif kind == 'error':
        t = np.arange(n) / SR
        y = O.pulse(np.full(n, 95.0), pw=0.3) * (np.sin(2 * np.pi * 18 * t) > -0.2)
        y = F.lpf(y, 3000)
    elif kind == 'crunch':
        y = FX.bitcrush(r.standard_normal(n) * 0.5, bits=4, rate=3000)
        y = F.bpf(y, 300, 8000)
    elif kind == 'stutter':
        base = blip('A5', 'square', 0.03, glide=0, level=-20).data[0]
        L = ns(0.032)
        seg = np.pad(base, (0, max(0, L - base.shape[0])))[:L]
        reps = int(dur / 0.032)
        y = np.concatenate([seg * (0.6 + 0.4 * (k % 2)) for k in range(reps)])[:n]
        y = np.pad(y, (0, n - y.shape[0]))
    else:
        raise ValueError(kind)
    y = fade(y, 0.001, 0.004)
    st = _wide(y, r.uniform(0.001, 0.004), 0.55)
    return _out(st, 0.0, (level if level is not None else LEVEL - 1))


def stutter(sound, slice_sec=0.06, repeats=6, pitch_step=0.0, decay_db=-1.0, level=None):
    """Buffer-repeat stutter of a given Sound (e.g. a vocal chop, impact, word hit)."""
    from .core import as_array
    y = FX.stutter(as_array(sound), slice_sec, repeats, 0.0, decay_db, pitch_step)
    return _out(y, 0.0, level)


def bitcrush_burst(dur=0.25, level=None, seed=None):
    r = rng(seed)
    n = ns(dur)
    t = np.arange(n) / SR
    tone = O.saw(np.full(n, r.uniform(90, 300))) * 0.5 + r.standard_normal(n) * 0.4
    y = FX.bitcrush(tone, bits=3, rate=[(0, 8000), (dur, 1500)])
    y = y * _dec(t, dur, dur * 0.3)
    return _out(_wide(y, 0.001, 0.6), 0.0, level)


def digital_noise(dur=0.6, level=None, seed=None):
    r = rng(seed)
    n = ns(dur)
    x = r.standard_normal(n)
    rate = 400 * (20000 / 400) ** r.random(int(dur * 30) + 2)
    rr = np.repeat(rate, n // len(rate) + 1)[:n]
    y = _dsp.sample_hold(x, rr, float(SR))
    gate = np.repeat(r.random(int(dur * 40) + 2) > 0.3, n // (int(dur * 40) + 2) + 1)[:n].astype(float)
    y = F.bpf(y * gate, 200, 12000) * 0.5
    return _out(np.stack([y, np.roll(y, 333)]), 0.0, level)


def data_chirp(n_chirps=6, level=None, seed=None):
    """Computer 'talk' chirps (R2-ish FM blips)."""
    r = rng(seed)
    parts = []
    tt = 0.0
    for i in range(n_chirps):
        d = r.uniform(0.03, 0.09)
        L = ns(d)
        t = np.arange(L) / SR
        f = np.exp(np.interp(t, [0, d], np.log(r.uniform(700, 3500, 2))))
        y = O.fm_pair(f, None, r.choice([0.5, 1.5, 2.0]), r.uniform(0.5, 3.0)) * np.hanning(L)
        parts.append((y, tt))
        tt += d + r.uniform(0.0, 0.04)
    return _out(layer(parts).data, 0.0, (level if level is not None else LEVEL - 3))


# ============================================================================ RETRO MEDIA TEXTURES
def vhs_noise(dur=10.0, hiss_db=-30.0, hum=True, flutter=True, level=None, seed=None):
    """VHS bed: hiss + 60 Hz hum harmonics + head-switch ticks. Returned at a LOW fixed level
    (≈ -40 dBFS RMS) - it's a texture, not a hit.  level overrides (loudness proxy)."""
    r = rng(seed)
    n = ns(dur)
    t = np.arange(n) / SR
    h = F.hpf(pink(n, seed=int(r.integers(1 << 30))), 1200) * amp(hiss_db)
    hh = np.zeros(n)
    if hum:
        for k, a in [(1, 1.0), (2, 0.5), (3, 0.6), (5, 0.3)]:
            hh += a * np.sin(2 * np.pi * 59.94 * k * t)
        hh *= amp(hiss_db - 14)
    hs = head_switch(dur, level=-60).data[0] * 0.3
    hr = F.hpf(pink(n, seed=int(r.integers(1 << 30))), 1200) * amp(hiss_db)
    st = np.stack([h + hh + hs, hr + hh + hs])       # hum must stay mono (a rolled copy put it out of phase)
    st = fade(st, 0.005, 0.03)
    if level is not None:
        return _out(st, 0.0, level)
    return Sound(st)


def head_switch(dur=1.0, level=None, seed=None):
    """VHS head-switching buzz (29.97 Hz ticks with noise bursts)."""
    r = rng(seed)
    n = ns(dur)
    y = np.zeros(n)
    per = SR / 29.97
    k = ns(0.0025)
    for i in range(int(n / per)):
        i0 = int(i * per)
        if i0 + k < n:
            y[i0:i0 + k] += r.standard_normal(k) * np.hanning(k) * r.uniform(0.5, 1)
    y = F.bpf(y, 1000, 9000)
    return _out(np.stack([y, y]), 0.0, (level if level is not None else LEVEL - 10))


def vinyl(dur=10.0, crackle=1.0, hiss_db=-42.0, rumble=True, level=None, seed=None):
    """Vinyl crackle texture (sparse pops + fine crackle + hiss + low rumble) at a low fixed level."""
    r = rng(seed)
    n = ns(dur)
    fine = _crinkle(n, 180 * crackle, int(r.integers(1 << 30)), 1500, 9000) * 0.02
    pops = np.zeros(n)
    idx = np.where(r.random(n) < 1.2 * crackle / SR)[0]
    pops[idx] = r.uniform(0.3, 1, idx.shape[0]) * r.choice([-1, 1], idx.shape[0])
    pops = F.bpf(pops, 300, 4000) * 0.15
    hs = F.hpf(pink(n, seed=int(r.integers(1 << 30))), 2500) * amp(hiss_db)
    y = fine + pops + hs
    st = np.stack([y, _delay(y, 911) * 0.9])
    if rumble:
        st = st + F.bpf(brown(n, seed=3), 18, 45) * amp(-40)    # mono rumble
    st = fade(st, 0.005, 0.03)
    if level is not None:
        return _out(st, 0.0, level)
    return Sound(st)


def static(dur=0.6, kind='tv', level=None, seed=None):
    """TV / radio static burst. kind 'tv' (white hiss + hum + crackle), 'radio' (tuning whistles)."""
    r = rng(seed)
    n = ns(dur)
    t = np.arange(n) / SR
    src = noise_st(n, 'white', seed=int(r.integers(1 << 30)))
    y = F.bpf(src, 300, 9000) * 0.6
    if kind == 'radio':
        f = 600 + 2500 * (0.5 + 0.5 * np.sin(2 * np.pi * 0.9 * t + r.random() * 6))
        wh = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.25
        y = y * 0.6 + np.stack([wh, wh])
    else:
        hum = O.pulse(np.full(n, 59.94), pw=0.2) * 0.08
        y = y + F.lpf(np.stack([hum, hum]), 2000)
    y = fade(y, 0.005, 0.02)
    return _out(y, 0.0, level)


def crt_whine(dur=10.0, db_level=-42.0, f=15734.0):
    """CRT flyback whine (very quiet high tone). Fixed low level, not normalised."""
    n = ns(dur)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * f * t) * amp(db_level) * (1 + 0.1 * np.sin(2 * np.pi * 0.3 * t))
    return Sound(fade(np.stack([y, y]), 0.01, 0.03))


def crt_on(level=None, seed=None):
    """CRT power-on: degauss 'thunk-bwong' + static crackle + rising whine."""
    r = rng(seed)
    L = 1.4
    n = ns(L)
    t = np.arange(n) / SR
    hum = np.sin(2 * np.pi * 50 * t) + 0.5 * np.sin(2 * np.pi * 100 * t + 1) + 0.3 * np.sin(2 * np.pi * 150 * t)
    hum = np.tanh(2 * hum) * _dec(t, 1.0, 0.05)
    tw = np.sin(2 * np.pi * np.cumsum(118 + 40 * np.exp(-t / 0.2)) / SR) * _dec(t, 0.8) * 0.5
    thunk = F.lpf(r.standard_normal(n), 600) * _dec(t, 0.04) * 1.5
    cr = _crinkle(n, 600 * _dec(t, 0.6), seed, 2000, 10000) * 0.4
    wh = np.sin(2 * np.pi * 15734 * t) * np.clip(t / 0.6, 0, 1) * 0.01
    y = hum * 0.5 + tw + thunk + cr + wh
    return _out(_wide(y, 0.0015, 0.5), 0.0, level)


def crt_off(level=None, seed=None):
    """CRT power-off: descending 'bzzt' collapse + whine fade."""
    L = 0.5
    n = ns(L)
    t = np.arange(n) / SR
    f = 900 * np.exp(-t / 0.08) + 60
    y = O.saw(f) * _dec(t, 0.35) * 0.6
    y = F.lpf(y, 4000) + np.sin(2 * np.pi * 15734 * t) * _dec(t, 0.3) * 0.01
    y += F.bpf(rng(seed).standard_normal(n), 2000, 8000) * _dec(t, 0.05) * 0.4
    return _out(y, 0.0, level)


def tape_stop(sound=None, dur=0.7, level=None):
    """Tape-stop a given Sound (or a default chord) - speed ramps to zero."""
    from .core import as_array
    if sound is None:
        from .synth import pad
        sound = pad([57, 60, 64, 67], 1.2, kind='80s')
    a = to_stereo(as_array(sound))
    y = FX.tape_stop(a, 0.0, min(dur, a.shape[1] / SR))
    return _out(y, 0.0, level)


def power_down(dur=1.0, level=None):
    """Electric power-down (falling tone + hum fade)."""
    n = ns(dur)
    t = np.arange(n) / SR
    f = 1200 * (40 / 1200) ** (t / dur) ** 0.7
    y = (O.saw(f) * 0.4 + O.sine(f * 0.5)) * (1 - t / dur) ** 1.3
    y = F.svf(y, 5000 * (200 / 5000) ** (t / dur), 1.0, 'lp')
    return _out(y, 0.0, level)


# ============================================================================ SCI-FI
def laser(kind='pew', level=None, seed=None):
    """'pew' (classic blaster), 'zap' (electric arc), 'beam' (sustained), 'charge' (see charge())."""
    if kind == 'charge':
        return charge(level=level)
    r = rng(seed)
    if kind == 'pew':
        L = 0.3
        t = _t(L)
        f = 180 + 2600 * np.exp(-t / 0.045)
        y = O.fm_pair(f, None, 1.5, 2.5 * np.exp(-t / 0.05)) * 0.6 + O.saw(f) * 0.25
        y = y * _dec(t, 0.25) * (1 - np.exp(-t / 0.001))
        st = np.stack([y, y])
        st = st + FX.delay(st, 0.07, 0.3, mix=1.0) * 0.3
        return _out(st, 0.0, level)
    if kind == 'zap':
        L = 0.4
        n = ns(L)
        t = np.arange(n) / SR
        buzz = O.saw(np.full(n, 120.0)) * (0.5 + 0.5 * (r.random(n) > 0.4))
        nz = F.bpf(r.standard_normal(n), 800, 7000)
        cr = _crinkle(n, 1500, seed, 2000, 10000)
        y = (buzz * 0.4 + nz * 0.4 + cr * 0.4) * _dec(t, 0.35) * (1 - np.exp(-t / 0.001))
        y = FX.saturate(y, 8)
        return _out(_wide(y, 0.0008, 0.5), 0.0, level)
    if kind == 'beam':
        L = 1.0
        n = ns(L)
        t = np.arange(n) / SR
        f = 440 * (1 + 0.02 * np.sin(2 * np.pi * 7 * t))
        y = O.saw(f) * 0.3 + O.saw(f * 1.5) * 0.2 + O.sine(f * 2) * 0.2
        y = F.svf(y, 1200 + 800 * np.sin(2 * np.pi * 3 * t), 4.0, 'bpn')
        y *= np.clip(t / 0.05, 0, 1) * np.clip((L - t) / 0.2, 0, 1)
        st = FX.phaser(np.stack([y, y]), 1.5, 0.8, 0.5, 0.6)
        return _out(st, 0.0, level)
    raise ValueError(kind)


def zap(level=None, seed=None):
    return laser('zap', level, seed)


def charge(dur=1.2, level=None):
    """Energy charge-up (rising tone, accelerating tremolo). Sync at END."""
    n = ns(dur)
    t = np.arange(n) / SR
    x = t / dur
    f = 150 * (2400 / 150) ** (x ** 1.3)
    y = O.saw(f) * 0.3 + O.sine(f) * 0.5
    y = F.svf(y, f * 3, 2.0, 'lp')
    y *= 1 - 0.6 * (0.5 + 0.5 * FX.lfo(n, 6, 'sine', rate_end=40))
    y *= x ** 1.5
    st = FX.chorus(np.stack([y, y]), 1.2, 1.5, mix=0.4)
    return _out(fade(st, 0.01, 0.004), sync=dur, level=level)


# ============================================================================ MAGIC / SPARKLE
def sparkle(dur=1.2, density=28.0, key='C', mode='major_pentatonic', lo=84, hi=108, level=None, seed=None,
            shape='swell'):
    """Glitter / sparkle: random high bell pings in-key, stereo scattered, with shimmer air."""
    r = rng(seed)
    k = pc(key)
    iv = SCALES[mode]
    pool = [m for m in range(int(lo), int(hi) + 1) if (m - k) % 12 in iv]
    count = max(3, int(dur * density))
    parts = []
    for i in range(count):
        tt = r.uniform(0, dur)
        x = tt / dur
        env = np.sin(np.pi * x) if shape == 'swell' else (1 - x) if shape == 'fade' else 1.0
        f = hz(pool[r.integers(0, len(pool))])
        L = r.uniform(0.12, 0.45)
        t = _t(L)
        y = (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * f * 2.76 * t) * _dec(t, L * 0.3)) * _dec(t, L)
        y *= 1 - np.exp(-t / 0.0015)
        parts.append((y, tt, 20 * np.log10(0.25 + 0.75 * env + 1e-6) + r.uniform(-8, 0), r.uniform(-0.9, 0.9)))
    st = layer(parts).data
    st = st + FX.reverb(st, 'plate', decay=2.0, mix=1.0) * 0.5
    st = F.hpf(st, 2000)
    return _out(st, 0.0, (level if level is not None else LEVEL - 2))


def shimmer_hit(note='E5', level=None):
    """Bell hit into shimmer reverb bloom (logo sparkle)."""
    from .fm import bell
    b = bell(note, 1.5, 0.9, 'celesta').data
    b2 = bell(midi(note) + 7, 1.5, 0.6, 'celesta').data
    st = b + b2 * 0.5
    wet = FX.shimmer(np.pad(st, ((0, 0), (0, ns(2.5)))), 3.5, 0.5)
    out = np.pad(st, ((0, 0), (0, wet.shape[1] - st.shape[1]))) * 0.7 + wet * 0.7
    return _out(fade(out, 0, 0.5), 0.0, level)


def magic(dur=1.2, key='C', mode='major_pentatonic', up=True, level=None, seed=None):
    """Magic wand: ascending in-key bell glissando + sparkle + shimmer tail (sync at START)."""
    from .fm import bell
    k = pc(key)
    iv = SCALES[mode]
    notes = [m for m in range(72, 100) if (m - k) % 12 in iv]
    if not up:
        notes = notes[::-1]
    parts = []
    for i, m in enumerate(notes):
        x = i / max(1, len(notes) - 1)
        parts.append((bell(m, 0.8, 0.7, 'celesta'), dur * 0.6 * x ** 1.2, -3 * (1 - x), (x - 0.5) * 1.2))
    st = layer(parts).data
    sp = sparkle(dur, 30, key, mode, level=-22, seed=seed).data
    st = np.pad(st, ((0, 0), (0, max(0, sp.shape[1] - st.shape[1]))))
    st[:, :sp.shape[1]] += sp * 0.7
    st = st + FX.reverb(st, 'hall', decay=2.5, mix=1.0) * 0.4
    return _out(fade(st, 0, 0.3), 0.0, level)


def chime(notes=('C6', 'E6', 'G6', 'C7'), step=0.07, kind='celesta', level=None):
    """Sequential bell chime (success / reveal)."""
    from .fm import bell
    parts = [(bell(nt, 1.2, 0.8, kind), i * step, 0, (i / max(1, len(notes) - 1) - 0.5) * 0.6)
             for i, nt in enumerate(notes)]
    st = layer(parts).data
    st = st + FX.reverb(st, 'plate', decay=1.6, mix=1.0) * 0.3
    return _out(st, 0.0, level)


# ============================================================================ 8-BIT
def coin(level=None):
    from . import chip
    return _out(chip.coin().data, 0.0, (level if level is not None else LEVEL - 3))


def jump(level=None):
    from . import chip
    return _out(chip.jump().data, 0.0, (level if level is not None else LEVEL - 3))


def powerup(level=None):
    from . import chip
    return _out(chip.powerup().data, 0.0, (level if level is not None else LEVEL - 3))


def oneup(level=None):
    from . import chip
    return _out(chip.oneup().data, 0.0, (level if level is not None else LEVEL - 3))


def explosion_8bit(level=None):
    from . import chip
    return _out(chip.explosion().data, 0.0, level)


# ============================================================================ HUD / FUI
def hud_beep(note='A6', dur=0.06, kind='sine', level=None):
    """Clean interface beep (sine+tiny square edge)."""
    L = dur + 0.02
    t = _t(L)
    f = hz(note)
    y = np.sin(2 * np.pi * f * t) * 0.8
    if kind == 'square':
        y = F.lpf(O.pulse(np.full(t.shape[0], f), pw=0.5), 6000) * 0.5
    elif kind == 'soft':
        y = np.sin(2 * np.pi * f * t) * 0.7 + np.sin(2 * np.pi * f * 2 * t) * 0.1
    y *= np.clip(t / 0.002, 0, 1) * np.clip((dur - t) / 0.004, 0, 1)
    return _out(y, 0.0, (level if level is not None else LEVEL - 5))


def hud_scan(dur=1.0, direction=1, level=None, seed=None):
    """Scanning sweep: sine sweep w/ ring-mod texture + S&H blips, panned across."""
    r = rng(seed)
    n = ns(dur)
    t = np.arange(n) / SR
    x = t / dur
    f = 400 * (3200 / 400) ** x
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * (0.5 + 0.5 * np.sin(2 * np.pi * 32 * t))
    sh = _dsp.sample_hold(r.uniform(-1, 1, n), np.full(n, 28.0), float(SR))
    bl = np.sin(2 * np.pi * np.cumsum(1500 + 1000 * sh) / SR) * (np.sin(2 * np.pi * 28 * t) > 0.6) * 0.3
    y = (y * 0.5 + bl) * np.sin(np.pi * x) ** 0.4
    st = pan_curve(y, direction * (2 * x - 1) * 0.8)
    return _out(st, 0.0, (level if level is not None else LEVEL - 3))


def lock_on(dur=1.2, note='E6', level=None):
    """Target lock: accelerating beeps -> held confirm tone a fifth up. Sync at the LOCK (end)."""
    parts = []
    tt = 0.0
    gap = 0.2
    while tt < dur - 0.25:
        parts.append((hud_beep(note, 0.04, level=-24), tt))
        tt += gap
        gap = max(0.045, gap * 0.78)
    lock = hud_beep(midi(note) + 7, 0.35, 'soft', level=-20)
    parts.append((lock, dur - 0.02))
    s = layer(parts)
    return _out(s.data, dur, level)


def hud_data(dur=0.8, rate=32.0, level=None, seed=None):
    """'Computing' blips - random short beeps at rate per second."""
    r = rng(seed)
    parts = []
    notes = [84, 86, 88, 91, 93, 96, 98, 100]
    k = int(dur * rate)
    for i in range(k):
        if r.random() < 0.8:
            parts.append((hud_beep(notes[r.integers(0, len(notes))], r.uniform(0.008, 0.02), level=-26),
                          i / rate, r.uniform(-6, 0), r.uniform(-0.6, 0.6)))
    return _out(layer(parts).data, 0.0, (level if level is not None else LEVEL - 4))


def hud_open(dur=0.8, level=None, seed=None):
    """Hologram / panel open: rising glassy tone + digital sparkle."""
    n = ns(dur)
    t = np.arange(n) / SR
    x = t / dur
    f = 330 * (1320 / 330) ** (x ** 0.5)
    y = O.fm_pair(f, None, 2.0, 1.2 * (1 - x)) * np.sin(np.pi * np.clip(x * 1.2, 0, 1)) ** 0.5
    st = FX.chorus(np.stack([y, y]), 1.5, 2.0, mix=0.5)
    sp = hud_data(dur * 0.8, 40, level=-26, seed=seed).data
    st[:, :sp.shape[1]] += sp[:, :n] * 0.5
    st = st + FX.reverb(st, 'plate', decay=1.0, mix=1.0) * 0.25
    return _out(st, 0.0, level)


def hud_alert(level=None, cycles=3):
    parts = []
    for i in range(cycles):
        parts.append((hud_beep('B5', 0.12, 'square', level=-20), i * 0.3))
        parts.append((hud_beep('G5', 0.12, 'square', level=-20), i * 0.3 + 0.15))
    return _out(layer(parts).data, 0.0, level)


def hud_ping(note='E6', level=None):
    """Sonar ping with echo tail."""
    y = hud_beep(note, 0.09, 'soft', level=-18).data
    y = np.pad(y, ((0, 0), (0, ns(1.5))))
    st = y + FX.delay(y, 0.23, 0.45, mix=1.0, lp=4000) * 0.5 + FX.reverb(y, 'hall', decay=1.5, mix=1.0) * 0.3
    return _out(st, 0.0, level)


# ============================================================================ CARTOON / VARIETY (综艺)
def boing(pitch=1.0, dur=0.7, level=None):
    """Jaw-harp 'boi-oi-oing' (formant wah + decaying pitch wobble)."""
    n = ns(dur)
    t = np.arange(n) / SR
    f0 = 170 * pitch
    wob = 1 + 0.32 * np.sin(2 * np.pi * 9 * t) * np.exp(-t / 0.22) + 0.08 * t / dur
    f = f0 * wob
    y = O.saw(f) * 0.5 + O.tri(f) * 0.5
    fc = 600 + 900 * (0.5 + 0.5 * np.sin(2 * np.pi * 9 * t)) * np.exp(-t / 0.3)
    y = F.svf(y, fc, 5.0, 'bpn') * 1.2 + y * 0.15
    y *= _dec(t, dur * 0.9) * (1 - np.exp(-t / 0.002))
    return _out(y, 0.0, level)


def sproing(level=None):
    """Spring 'sproing' (dispersive chirp + ringing spring)."""
    imp = np.zeros(ns(0.25))
    imp[0] = 1
    ch = _dsp.allpass_chain(imp, 0.72, 120)
    ch = F.bpf(ch, 200, 6000) * 8
    L = 0.8
    t = _t(L)
    ring = np.sin(2 * np.pi * np.cumsum(260 * (1 + 0.15 * np.sin(2 * np.pi * 11 * t) * np.exp(-t / 0.3))) / SR) * _dec(t, 0.7) * 0.5
    y = np.pad(ch, (0, ring.shape[0] - ch.shape[0])) + ring
    return _out(y, 0.0, level)


def duang(pitch=1.0, level=None):
    """'Duang~' comedic metallic bounce (综艺 classic): boing + metallic partials + wobble."""
    L = 1.0
    t = _t(L)
    f0 = 220 * pitch
    wob = 1 + 0.18 * np.sin(2 * np.pi * 7 * t) * np.exp(-t / 0.35)
    y = np.zeros(t.shape[0])
    for ra, a, d in [(1, 1.0, 0.8), (2.01, 0.5, 0.6), (2.76, 0.35, 0.45), (4.07, 0.25, 0.3), (5.4, 0.15, 0.2)]:
        y += a * np.sin(2 * np.pi * np.cumsum(f0 * ra * wob) / SR) * _dec(t, d)
    y *= 1 - np.exp(-t / 0.002)
    st = np.stack([y, y]) + FX.reverb(np.stack([y, y]), 'room', decay=0.5, mix=1.0) * 0.15
    return _out(st, 0.0, level)


def slide_whistle(up=True, dur=0.6, lo=550.0, hi=2100.0, level=None, seed=None):
    """Slide whistle (cartoon rise/fall)."""
    n = ns(dur)
    t = np.arange(n) / SR
    x = t / dur
    k = x ** 0.8 if up else x ** 1.2
    f = (lo * (hi / lo) ** k) if up else (hi * (lo / hi) ** k)
    f = f * (1 + 0.012 * np.sin(2 * np.pi * 6 * t))
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.sin(ph) + 0.08 * np.sin(2 * ph)
    br = F.bpf(rng(seed).standard_normal(n), 1500, 6000) * 0.05
    e = np.clip(t / 0.03, 0, 1) * np.clip((dur - t) / 0.05, 0, 1)
    y = (y + br) * e
    return _out(y, 0.0, level)


def squeak(level=None, seed=None):
    """Rubber toy squeak."""
    L = 0.25
    t = _t(L)
    f = 1900 + 500 * np.sin(np.pi * t / L) + 60 * np.sin(2 * np.pi * 55 * t)
    y = O.saw(f) * 0.3
    y = F.svf(y, f * 1.1, 6, 'bpn') * np.sin(np.pi * t / L) ** 0.6
    return _out(y, 0.0, level)


def zip_(up=True, dur=0.18, level=None):
    """Fast 'zip' sweep (cartoon speed-away / pop-in)."""
    n = ns(dur)
    t = np.arange(n) / SR
    x = t / dur
    f = 300 * (12 ** x) if up else 3600 * (1 / 12) ** x
    y = O.tri(f) * np.sin(np.pi * x) ** 0.5
    return _out(y, 0.0, level)


def cork_pop(level=None):
    L = 0.15
    t = _t(L)
    y = np.sin(2 * np.pi * np.cumsum(600 + 900 * (1 - np.exp(-t / 0.01))) / SR) * _dec(t, 0.06)
    y[:ns(0.003)] += F.hpf(rng(4).standard_normal(ns(0.003)), 1000)
    return _out(y, 0.0, level)


def rimshot_joke(level=None):
    """Ba-dum-tss (comedic sting)."""
    from .drums import snare, cymbal, tom
    parts = [(tom('high', 0.8), 0.0), (tom('low', 0.9), 0.14), (snare('tight', 0.9), 0.36),
             (cymbal('crash', 0.7, decay=1.2), 0.36)]
    return _out(layer(parts).data, 0.0, level)


# ============================================================================ MISC
def record_scratch(sound=None, kind='stop', level=None):
    """Record scratch.  sound: material to scratch (default: synthetic chord+noise).
    kind 'stop' (the 'rrrp' needle-stop), 'baby', 'chirp'."""
    from .core import as_array
    if sound is None:
        from .synth import pad
        src = pad([57, 64, 69, 72], 1.5, kind='80s').data
        src = src + noise_st(src.shape[1], 'pink', seed=5) * 0.05
    else:
        src = to_stereo(as_array(sound))
    motion = {'stop': [(0, 1.0), (0.04, -2.8), (0.1, -2.0), (0.16, 0.0), (0.2, 1.5), (0.26, 0.0)],
              'baby': [(0, 0), (0.06, 1.8), (0.12, 0.0), (0.18, -1.8), (0.24, 0), (0.30, 2.2), (0.36, 0)],
              'chirp': [(0, 0), (0.03, 2.5), (0.06, 0), (0.09, -2.5), (0.12, 0)]}[kind]
    y = FX.scratch(src[:, ns(0.3):], motion)
    y = y + F.hpf(noise_st(y.shape[1], 'white', seed=2), 3000) * 0.03
    return _out(fade(y, 0.002, 0.01), 0.0, level)


def heartbeat(bpm=72, beats=2, level=None):
    parts = []
    per = 60.0 / bpm
    for i in range(beats):
        for off, f0, g in [(0.0, 52, 0.0), (0.28, 62, -4.0)]:
            L = 0.18
            t = _t(L)
            y = np.sin(2 * np.pi * np.cumsum(f0 + 25 * np.exp(-t / 0.02)) / SR) * _dec(t, 0.12) * (1 - np.exp(-t / 0.004))
            y = F.lpf(y + F.lpf(rng(i).standard_normal(ns(L)), 200) * _dec(t, 0.05) * 0.3, 180)
            parts.append((y, i * per + off, g))
    return _out(layer(parts).data, 0.0, level)


def text_hit(kind='slam', level=None, seed=None):
    """快闪 text hits: 'slam' (punch impact + swish in), 'flash' (shutter + tick), 'pop' (pop + blip),
    'glitch' (digital crunch hit).  Sync at the hit."""
    if kind == 'slam':
        w = swish(0.18, 1, seed=seed, level=-24)
        p = impact('punch', 0.6, seed=seed)
        s = layer([(w, -w.sync, 0), (p, 0.0, 0)])
    elif kind == 'flash':
        s = layer([(shutter('phone', seed=seed), 0), (click('hard'), 0, -4)])
    elif kind == 'pop':
        s = layer([(pop('mouth'), 0), (blip('A6', 'sine', 0.05, glide=5), 0.0, -6)])
    elif kind == 'glitch':
        s = layer([(impact('punch', 0.4, seed=seed), 0), (glitch(0.15, 'digital', seed=seed), 0, -3)])
    else:
        raise ValueError(kind)
    return _out(s.data, s.sync, level)


def transition(dur=0.8, kind='whoosh_hit', seed=None, level=None):
    """Composite transition sounds, sync at the cut/hit: 'whoosh_hit', 'riser_hit', 'reverse_hit',
    'swish_pop'."""
    if kind == 'whoosh_hit':
        w = whoosh(dur, 'swoosh', 1, peak=0.8, seed=seed)
        h = impact('punch', 0.8, seed=seed)
        s = layer([(w, -w.sync - 0.2 * dur * 0.2, -7), (h, 0.0)])
    elif kind == 'riser_hit':
        r_ = riser(dur - 0.03, 'hybrid', seed=seed)
        h = impact('cinematic', 1.0, seed=seed)
        s = layer([(r_, -r_.sync - 0.03, -6), (h, 0.0)])
    elif kind == 'reverse_hit':
        r_ = reverse_cymbal(dur - 0.03)
        h = impact('cinematic', 0.8, seed=seed)
        s = layer([(r_, -r_.sync - 0.03, -6), (h, 0.0)])
    elif kind == 'swish_pop':
        w = swish(0.25, seed=seed)
        s = layer([(w, -w.sync), (pop('mouth'), 0.0)])
    else:
        raise ValueError(kind)
    return _out(s.data, s.sync, level)
