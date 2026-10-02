"""Synthesised drums & percussion (Western + Chinese) and genre kits.

Every function returns a Sound (stereo) with the transient at t=0.  vel in 0..1.
"""
from __future__ import annotations

import numpy as np

from .core import SR, Sound, ns, rng, fade, pan_mono, layer, amp
from . import osc as O
from . import filters as F
from . import fx as FX


def _t(dur):
    return np.arange(ns(dur)) / SR


def _sweep_sine(f_start, f_end, tau, dur, phase=0.0):
    t = _t(dur)
    f = f_end + (f_start - f_end) * np.exp(-t / tau)
    return np.sin(phase + 2 * np.pi * np.cumsum(f) / SR), t


def _noise(dur, seed=None):
    return rng(seed).standard_normal(ns(dur))


def _decay(t, t60, hold=0.0):
    return np.exp(-6.91 * np.maximum(t - hold, 0) / max(t60, 1e-4))


# ============================================================================ KICKS
_KICKS = {
    #            f_start f_end tau_p  t60   hold  click drive  lp     len
    'punchy':    (280, 52, 0.030, 0.42, 0.020, 0.30, 2.2, 9000, 0.55),
    'house':     (230, 50, 0.036, 0.50, 0.025, 0.40, 1.8, 7000, 0.6),
    'techno':    (300, 46, 0.032, 0.62, 0.030, 0.30, 4.0, 6000, 0.7),
    'soft':      (150, 56, 0.022, 0.30, 0.010, 0.00, 1.2, 1600, 0.4),
    'lofi':      (170, 55, 0.025, 0.34, 0.012, 0.08, 1.6, 2400, 0.45),
    '808':       (115, 49, 0.045, 1.30, 0.000, 0.10, 1.2, 5000, 1.4),
    'synthwave': (240, 55, 0.032, 0.40, 0.030, 0.35, 2.4, 8000, 0.5),
    'cinematic': (140, 40, 0.060, 1.60, 0.050, 0.20, 1.6, 3000, 1.8),
    'chip':      (180, 50, 0.030, 0.25, 0.010, 0.00, 3.0, 5000, 0.3),
}


def kick(kind='punchy', vel=1.0, tune=0.0, decay=None, click=None, drive=None):
    """Kicks: punchy, house (909-ish), techno (driven), soft, lofi, 808 (long), synthwave, cinematic.
    tune in semitones; decay = T60 seconds."""
    fs, fe, tp, t60, hold, ck, dr, lp, L = _KICKS[kind]
    k = 2 ** (tune / 12)
    t60 = decay if decay is not None else t60
    ck = ck if click is None else click
    dr = dr if drive is None else drive
    L = max(L, t60 * 1.1)
    body, t = _sweep_sine(fs * k, fe * k, tp, L)
    env = _decay(t, t60, hold) * (1 - np.exp(-t / 0.0006))
    y = body * env
    # sub reinforcement for long kicks
    y = np.tanh(dr * y) / np.tanh(dr)
    if ck > 0:
        nz = _noise(0.006, seed=11)
        c = F.bpf(nz, 1800, 9000, 2) * np.exp(-_t(0.006) / 0.0012)
        c += 0.6 * np.sin(2 * np.pi * 3200 * _t(0.006)) * np.exp(-_t(0.006) / 0.0008)
        y[:c.shape[0]] += c * ck
    y = F.lpf(y, lp, 2)
    y = F.hpf(y, 25, 2)
    y = fade(y, 0, 0.01)
    return Sound(np.stack([y, y]) * vel * 0.9)


# ============================================================================ SNARES / CLAPS
def snare(kind='tight', vel=1.0, tune=0.0, decay=None):
    """Snares: tight (modern pop), fat, 808, trap (crisp), lofi (dusty), synthwave (big, gated verb),
    brush, rimshot."""
    k = 2 ** (tune / 12)
    cfg = {
        'tight':  dict(f1=200, f2=340, bd=0.11, nhp=1800, nd=0.17, nb=0.62, bb=0.55, snap=0.35, lp=14000),
        'fat':    dict(f1=175, f2=300, bd=0.16, nhp=1200, nd=0.26, nb=0.55, bb=0.75, snap=0.25, lp=10000),
        '808':    dict(f1=238, f2=476, bd=0.10, nhp=900, nd=0.14, nb=0.5, bb=0.8, snap=0.1, lp=12000),
        'trap':   dict(f1=210, f2=420, bd=0.08, nhp=2000, nd=0.14, nb=0.8, bb=0.45, snap=0.5, lp=16000),
        'lofi':   dict(f1=185, f2=320, bd=0.13, nhp=1000, nd=0.2, nb=0.55, bb=0.7, snap=0.2, lp=6500),
        'synthwave': dict(f1=190, f2=330, bd=0.14, nhp=1400, nd=0.22, nb=0.6, bb=0.65, snap=0.35, lp=13000),
        'brush':  dict(f1=180, f2=300, bd=0.05, nhp=2500, nd=0.3, nb=0.6, bb=0.15, snap=0.0, lp=9000),
        'rimshot': dict(f1=420, f2=1650, bd=0.05, nhp=2000, nd=0.08, nb=0.35, bb=0.9, snap=0.6, lp=12000),
    }[kind]
    if decay:
        cfg['nd'] = decay
    L = max(0.35, cfg['nd'] * 1.4)
    t = _t(L)
    b1, _ = _sweep_sine(cfg['f1'] * k * 1.5, cfg['f1'] * k, 0.008, L)
    b2, _ = _sweep_sine(cfg['f2'] * k * 1.3, cfg['f2'] * k, 0.006, L)
    body = (b1 * _decay(t, cfg['bd']) + 0.5 * b2 * _decay(t, cfg['bd'] * 0.7))
    nz = _noise(L, seed=21)
    nz = F.hpf(nz, cfg['nhp'], 2)
    nz = F.peak_eq(nz, 5000, 4, 0.9)
    ne = _decay(t, cfg['nd']) * (1 - np.exp(-t / 0.0008))
    if kind == 'brush':
        ne = np.clip(t / 0.02, 0, 1) * _decay(t, cfg['nd'])
    y = cfg['bb'] * body + cfg['nb'] * nz * ne * 0.6
    if cfg['snap'] > 0:
        c = F.bpf(_noise(0.004, 5), 2000, 10000, 2) * np.exp(-_t(0.004) / 0.001)
        y[:c.shape[0]] += c * cfg['snap']
    y = np.tanh(1.6 * y) / np.tanh(1.6)
    y = F.lpf(F.hpf(y, 120), cfg['lp'])
    st = np.stack([y, y])
    if kind == 'synthwave':
        wet = FX.reverb(st, 'gated', decay=0.32, mix=1.0)
        st = st + wet * 0.9
    return Sound(fade(st, 0, 0.01) * vel * 0.85)


def clap(kind='808', vel=1.0, tail=None, spread=True):
    """Hand clap: 808 (classic multi-burst), tight, big (roomy), snap (finger snap)."""
    if kind == 'snap':
        return snap(vel)
    tail = {'808': 0.16, 'tight': 0.09, 'big': 0.32}[kind] if tail is None else tail
    L = 0.05 + tail * 1.3
    t = _t(L)
    outs = []
    for ch in range(2):
        offs = [0.0, 0.0105, 0.0215, 0.0315] if ch == 0 else [0.0, 0.0115, 0.0205, 0.033]
        nz = _noise(L, seed=31 + ch)
        e = np.zeros_like(t)
        for i, o in enumerate(offs):
            tt = t - o
            m = tt >= 0
            e[m] += np.exp(-tt[m] / (0.0032 if i < 3 else tail / 6.9)) * (0.8 if i < 3 else 1.0)
        y = F.bpf(nz, 1150, q=1.1) * 1.3 + F.hpf(nz, 3000) * 0.25
        y = y * e
        outs.append(y if spread else None)
    st = np.stack(outs)
    st = F.peak_eq(st, 2600, 3, 1.0)
    st = st / (np.max(np.abs(st)) + 1e-9) * 0.9
    if kind == 'big':
        st = st + FX.reverb(st, 'room', decay=0.5, mix=1.0) * 0.5
    return Sound(fade(st, 0.0003, 0.01) * vel)


def snap(vel=1.0):
    t = _t(0.12)
    nz = _noise(0.12, 41)
    y = F.bpf(nz, 1800, q=2.0) * np.exp(-t / 0.012) * 1.2
    y += F.bpf(nz, 3500, q=1.5) * np.exp(-t / 0.006) * 0.8
    y += np.sin(2 * np.pi * 1200 * t) * np.exp(-t / 0.004) * 0.3
    st = np.stack([y, y])
    st = st + FX.reverb(st, 'room', decay=0.35, mix=1.0) * 0.25
    return Sound(fade(st / (np.max(np.abs(st)) + 1e-9), 0.0003, 0.004) * 0.85 * vel)


# ============================================================================ HATS / CYMBALS
_METAL = np.array([205.3, 304.4, 369.6, 522.7, 540.0, 800.0])


def _metal(dur, tune=1.0):
    n = ns(dur)
    y = np.zeros(n)
    for f in _METAL * tune:
        y += O.pulse(np.full(n, f), pw=0.5)
    return y / 6


def hat(kind='closed', vel=0.8, tune=1.0, decay=None):
    """Hi-hats: closed, open, pedal, trap (tight & crisp), lofi (soft, dark), chip."""
    d = {'closed': 0.055, 'open': 0.42, 'pedal': 0.03, 'trap': 0.035, 'lofi': 0.07, 'half': 0.16}[kind]
    d = decay if decay is not None else d
    L = d * 1.3 + 0.01
    t = _t(L)
    m = _metal(L, tune * (1.25 if kind == 'trap' else 1.0))
    m = F.bpf(m, 7500, 11000, 2) + F.hpf(m, 9000) * 0.5
    nz = F.hpf(_noise(L, 51), 7500, 2)
    y = m * 1.1 + nz * 0.35
    env = _decay(t, d) * (1 - np.exp(-t / 0.0004))
    if kind in ('open', 'half'):
        env = 0.6 * _decay(t, 0.03) + 0.4 * _decay(t, d)
    y = y * env
    if kind == 'lofi':
        y = F.lpf(y, 7500)
    y = F.hpf(y, 5500 if kind != 'lofi' else 4000)
    y = y / (np.max(np.abs(y)) + 1e-9)
    return Sound(fade(np.stack([y, y]), 0, 0.005) * vel * 0.55)


def cymbal(kind='crash', vel=0.9, decay=None, tune=1.0, seed=None):
    """Noise-based cymbals: crash, ride, china, splash, bell (ride bell), reverse->see sfx."""
    d = {'crash': 2.4, 'ride': 1.8, 'china': 1.6, 'splash': 0.8, 'bell': 1.6}[kind]
    d = decay if decay is not None else d
    L = d * 1.1
    t = _t(L)
    r = rng(seed)
    outs = []
    for ch in range(2):
        nz = r.standard_normal(t.shape[0])
        m = _metal(L, tune * (1.7 if kind != 'china' else 1.3) * (1 + 0.01 * ch))
        ring = m * np.sin(2 * np.pi * 3170 * tune * t)  # ring-mod shimmer
        if kind == 'ride':
            body = F.bpf(nz, 3000, 12000, 2) * 0.4 + F.bpf(ring, 4000, 9000, 1) * 0.5
            ping = sum(np.sin(2 * np.pi * f * tune * t + r.random() * 6) * a
                       for f, a in [(3150, 0.4), (4270, 0.3), (5340, 0.2), (6620, 0.15)])
            y = body * (0.35 * _decay(t, 0.05) + 0.65 * _decay(t, d)) + ping * _decay(t, 0.6) * 0.5
        elif kind == 'bell':
            ping = sum(np.sin(2 * np.pi * f * tune * t + r.random() * 6) * a
                       for f, a in [(2550, 0.5), (3900, 0.4), (5200, 0.3), (6900, 0.2)])
            y = ping * _decay(t, d) + F.hpf(nz, 6000) * 0.1 * _decay(t, 0.2)
        else:
            body = F.bpf(nz, 2500, 16000, 2) * 0.6 + F.bpf(ring, 3000, 12000, 1) * 0.7
            env = 0.45 * _decay(t, 0.12) + 0.55 * _decay(t, d)
            y = body * env * (1 - np.exp(-t / 0.0015))
            # darken over time
            y = F.svf(y, np.clip(16000 * np.exp(-t / (d * 0.5)) + 3000, 3000, 18000), 0.707, 'lp')
            if kind == 'china':
                y = FX.saturate(y, 6, 'tanh')
        outs.append(F.hpf(y, 400))
    st = np.stack(outs)
    st = st / (np.max(np.abs(st)) + 1e-9)
    return Sound(fade(st, 0.0005, 0.1) * vel * 0.6)


def crash(vel=0.9, decay=None, engine='auto'):
    from . import samples as S
    if engine in ('auto', 'sample') and S.available('crash'):
        s = S.hit('crash', match='crash1_(ff|mf)', vel=vel, maxdur=decay or 3.5)
        return Sound(F.hpf(s.data, 300))
    return cymbal('crash', vel, decay)


# ============================================================================ TOMS / MISC PERC
def tom(pitch='mid', vel=0.9, kind='acoustic', tune=0.0):
    """Toms: pitch 'low'|'mid'|'high' or Hz; kind 'acoustic' | 'synth' (80s Simmons sweep)."""
    if isinstance(pitch, str) and pitch not in ('low', 'mid', 'high'):
        from .theory import hz as _hz
        pitch = _hz(pitch)                      # note names work too: tom('A2')
    f = {'low': 85.0, 'mid': 120.0, 'high': 170.0}.get(pitch, pitch) * 2 ** (tune / 12)
    L = 0.7
    t = _t(L)
    if kind == 'synth':
        body, _ = _sweep_sine(f * 2.2, f * 0.85, 0.09, L)
        y = body * _decay(t, 0.55) + F.bpf(_noise(L, 61), 800, 5000) * _decay(t, 0.05) * 0.2
    else:
        b1, _ = _sweep_sine(f * 1.35, f, 0.03, L)
        b2, _ = _sweep_sine(f * 1.6 * 1.3, f * 1.6, 0.02, L)
        y = b1 * _decay(t, 0.45) + 0.35 * b2 * _decay(t, 0.2)
        y += F.bpf(_noise(L, 62), 300, 3000) * _decay(t, 0.03) * 0.3
    y = np.tanh(1.5 * y) / np.tanh(1.5)
    y = F.hpf(y, 45)
    return Sound(fade(np.stack([y, y]), 0.0003, 0.02) * vel * 0.85)


def rim(vel=0.8):
    L = 0.08
    t = _t(L)
    y = np.sin(2 * np.pi * 1680 * t) * _decay(t, 0.02) + 0.6 * np.sin(2 * np.pi * 460 * t) * _decay(t, 0.03)
    y += F.bpf(_noise(L, 71), 2000, 8000) * _decay(t, 0.006) * 0.8
    y = F.hpf(y, 300)
    y /= np.max(np.abs(y)) + 1e-9
    return Sound(np.stack([y, y]) * vel * 0.7)


def shaker(vel=0.6, length=0.09, accent=False):
    L = length + 0.04
    t = _t(L)
    nz = _noise(L, None)
    grains = (rng().random(t.shape[0]) < 0.25).astype(float)
    y = F.bpf(nz * (0.6 + 0.4 * grains), 5000, 11000, 2)
    env = np.clip(t / (0.012 if not accent else 0.006), 0, 1) ** 1.5 * _decay(t, length, hold=0.01)
    y = y * env
    y /= np.max(np.abs(y)) + 1e-9
    return Sound(np.stack([y, y]) * vel * 0.5)


def cowbell(vel=0.8):
    L = 0.4
    t = _t(L)
    y = O.pulse(np.full(t.shape[0], 540.0)) + O.pulse(np.full(t.shape[0], 800.0))
    y = F.bpf(y, 800, q=2.5) * (0.6 * _decay(t, 0.03) + 0.4 * _decay(t, 0.35))
    y /= np.max(np.abs(y)) + 1e-9
    return Sound(np.stack([y, y]) * vel * 0.6)


def clave(vel=0.8):
    L = 0.12
    t = _t(L)
    y = np.sin(2 * np.pi * 2500 * t) * _decay(t, 0.05) + F.bpf(_noise(L, 81), 2000, 6000) * _decay(t, 0.003)
    y /= np.max(np.abs(y)) + 1e-9
    return Sound(np.stack([y, y]) * vel * 0.6)


def woodblock(kind='muyu', vel=0.8, pitch=None):
    """Wood percussion: 'block' (western woodblock), 'muyu' (木鱼 hollow), 'bangzi' (梆子 sharp
    high clapper of Chinese opera)."""
    f, d, m2 = {'block': (1100, 0.07, 2.7), 'muyu': (720, 0.09, 2.3), 'bangzi': (2150, 0.035, 2.9)}[kind]
    f = f if pitch is None else pitch
    L = d * 2 + 0.03
    t = _t(L)
    y = np.sin(2 * np.pi * f * t) * _decay(t, d) + 0.35 * np.sin(2 * np.pi * f * m2 * t) * _decay(t, d * 0.4)
    y += F.bpf(_noise(L, 91), 1500, 9000) * _decay(t, 0.004) * (0.9 if kind == 'bangzi' else 0.5)
    y = F.hpf(y, 200)
    y /= np.max(np.abs(y)) + 1e-9
    return Sound(np.stack([y, y]) * vel * 0.7)


def triangle_hit(vel=0.6, decay=1.6):
    L = decay
    t = _t(L)
    y = sum(np.sin(2 * np.pi * f * t) * a * _decay(t, decay * dk)
            for f, a, dk in [(1250, 1.0, 1.0), (3470, 0.5, 0.7), (5790, 0.35, 0.5), (8230, 0.2, 0.35)])
    y /= np.max(np.abs(y)) + 1e-9
    return Sound(np.stack([y, y]) * vel * 0.4)


# ============================================================================ CHINESE / CINEMATIC
_MEMBRANE = [(1.0, 1.0, 1.0), (1.594, 0.55, 0.55), (2.136, 0.42, 0.4), (2.296, 0.3, 0.35), (2.653, 0.24, 0.28),
             (2.918, 0.16, 0.22), (3.156, 0.12, 0.18), (3.501, 0.08, 0.14)]


def taiko(kind='taiko', vel=1.0, tune=0.0, decay=None, edge=False):
    """Big drums: 'taiko' (太鼓, huge), 'dagu' (大鼓 Chinese bass drum), 'tanggu' (堂鼓, higher 'tong'),
    'rim' (鼓边 'ka' click on the rim).  Add a hall send for size."""
    if kind == 'rim':
        L = 0.15
        t = _t(L)
        y = F.bpf(_noise(L, 101), 1200, 7000) * _decay(t, 0.02) * 1.2
        y += np.sin(2 * np.pi * 950 * t) * _decay(t, 0.04) * 0.6
        y /= np.max(np.abs(y)) + 1e-9
        return Sound(np.stack([y, y]) * vel * 0.7)
    f0, t60, stick = {'taiko': (62, 1.6, 0.35), 'dagu': (84, 1.3, 0.3), 'tanggu': (165, 0.8, 0.4)}[kind]
    f0 *= 2 ** (tune / 12)
    t60 = decay or t60
    L = t60 * 1.1
    t = _t(L)
    r = rng(None)
    tension = 1 + 0.14 * vel * np.exp(-t / 0.045)
    y = np.zeros(t.shape[0])
    for ratio, a, dk in _MEMBRANE:
        f = f0 * ratio * tension
        y += a * np.sin(2 * np.pi * np.cumsum(f) / SR + r.random() * 6) * _decay(t, t60 * dk)
    y *= (1 - np.exp(-t / 0.0015))
    # stick/skin attack
    nz = _noise(0.05, 102)
    att = F.lpf(nz, 2500 + 2500 * vel) * _decay(_t(0.05), 0.02)
    y[:att.shape[0]] += att * stick
    y += np.sin(2 * np.pi * 110 * t) * _decay(t, 0.06) * 0.4 * (kind == 'taiko')
    y = np.tanh(1.3 * y) / np.tanh(1.3)
    y = F.hpf(y, 30)
    y /= np.max(np.abs(y)) + 1e-9
    return Sound(fade(np.stack([y, y]), 0, 0.05) * vel * 0.9)


def gong(kind='chinese', vel=0.9, tune=0.0, decay=None, engine='synth'):
    """Gongs: 'chinese' (大锣, opera gong, falling pitch 'kuang'), 'small' (小锣, rising pitch 'tai'),
    'tamtam' (huge western wash), 'sample' (VCSL recorded gong)."""
    if kind == 'sample' or engine == 'sample':
        from . import samples as S
        s = S.hit('gong', match='gong_(f|fff|mf)$', vel=vel, maxdur=decay or 8.0)
        return Sound(F.hpf(s.data, 40))
    cfg = {'chinese': (215, 3.6, -1.1, 0.5, 0.35), 'small': (640, 1.7, +2.6, 0.18, 0.12),
           'tamtam': (78, 7.0, -0.3, 1.2, 1.0)}[kind]
    f0, t60, glide, gtau, wash = cfg
    f0 *= 2 ** (tune / 12)
    t60 = decay or t60
    L = t60 * 1.05
    t = _t(L)
    r = rng(7)
    ratios = [1.0, 1.51, 1.99, 2.44, 2.93, 3.47, 4.09, 4.82, 5.61, 6.47, 7.4, 8.6]
    amps = [1.0, 0.7, 0.55, 0.45, 0.38, 0.3, 0.22, 0.16, 0.12, 0.09, 0.06, 0.04]
    bend = 2 ** (glide * (1 - np.exp(-t / gtau)) / 12)
    phases = r.random((len(ratios), 2)) * 6      # same partial phases in L and R (mono-compatible);
    outs = []                                    # the slightly different beating decorrelates them over time
    for ch in range(2):
        y = np.zeros(t.shape[0])
        for j, (ra, a) in enumerate(zip(ratios, amps)):
            for q, det in enumerate((-0.6, 0.6)):   # close pairs -> beating shimmer
                f = f0 * ra * bend + det * (1 + ch * 0.3) * ra ** 0.5
                if f[0] > SR * 0.45:
                    continue
                dk = t60 * (1.0 / ra ** 0.35)
                y += 0.5 * a * np.sin(2 * np.pi * np.cumsum(f) / SR + phases[j, q]) * _decay(t, dk)
        # tam-tam style bloom wash
        nz = r.standard_normal(t.shape[0])
        bloom = np.clip(t / 0.35, 0, 1) ** 2 * _decay(t, t60 * 0.7)
        w = F.bpf(nz, 1200, 7000, 2) * bloom * wash * 0.25
        y = y + w
        # mallet
        att = F.lpf(r.standard_normal(ns(0.04)), 1800) * _decay(_t(0.04), 0.02)
        y[:att.shape[0]] += att * 0.5
        outs.append(y)
    st = fade(np.stack(outs), 0.003, 0)          # ~3 ms mallet contact: no step at sample 0
    st = F.hpf(st, 50)
    st /= np.max(np.abs(st)) + 1e-9
    return Sound(fade(st, 0, 0.3) * vel * 0.8)


def bo(kind='xiaobo', vel=0.85, decay=None, choke=False):
    """Chinese cymbals: 'xiaobo' (小镲 small bright), 'nao' (铙钹 bigger), choke=True for a damped 'cha'."""
    d = {'xiaobo': 0.9, 'nao': 1.6}[kind]
    d = decay or d
    if choke:
        d = 0.12
    L = d * 1.1 + 0.02
    t = _t(L)
    r = rng(None)
    outs = []
    lo, hi = (2600, 9500) if kind == 'xiaobo' else (1500, 7000)
    for ch in range(2):
        y = np.zeros(t.shape[0])
        fs = np.exp(r.uniform(np.log(lo), np.log(hi), 40))
        for f in fs:
            y += np.sin(2 * np.pi * f * t + r.random() * 6) * _decay(t, d * r.uniform(0.4, 1.0)) * r.uniform(0.3, 1)
        y /= 40 ** 0.5
        y += F.hpf(r.standard_normal(t.shape[0]), lo) * (0.5 * _decay(t, 0.05) + 0.3 * _decay(t, d))
        outs.append(y)
    st = F.hpf(np.stack(outs), 900)
    st /= np.max(np.abs(st)) + 1e-9
    return Sound(fade(st, 0.0005, 0.02) * vel * 0.6)


def boom(vel=1.0, f0=45.0, decay=1.8):
    """Deep cinematic drum boom (for trailers/hits) - see sfx.impact for layered hits."""
    return kick('cinematic', vel, tune=12 * np.log2(f0 / 40.0), decay=decay)


# ============================================================================ KITS
def kit(name='pop'):
    """Genre kits -> dict of callables(vel)->Sound: kick, snare, clap, hat, ohat, rim, perc, crash, tom.
    names: pop, 808, trap, house, techno, lofi, synthwave, chip, acoustic, cinematic, guofeng."""
    from . import chip as C
    k = {
        'pop': dict(kick=lambda v=1: kick('punchy', v), snare=lambda v=1: snare('tight', v),
                    clap=lambda v=1: clap('808', v), hat=lambda v=.7: hat('closed', v), ohat=lambda v=.7: hat('open', v),
                    rim=rim, perc=lambda v=.7: clave(v), crash=lambda v=.9: crash(v), tom=lambda v=.9, p='mid': tom(p, v)),
        '808': dict(kick=lambda v=1: kick('808', v), snare=lambda v=1: snare('808', v), clap=lambda v=1: clap('808', v),
                    hat=lambda v=.7: hat('closed', v), ohat=lambda v=.7: hat('open', v), rim=rim,
                    perc=lambda v=.7: cowbell(v), crash=lambda v=.9: cymbal('crash', v),
                    tom=lambda v=.9, p='mid': tom(p, v, 'synth')),
        'trap': dict(kick=lambda v=1: kick('punchy', v, decay=0.3), snare=lambda v=1: snare('trap', v),
                     clap=lambda v=1: clap('tight', v), hat=lambda v=.7: hat('trap', v), ohat=lambda v=.7: hat('half', v),
                     rim=rim, perc=lambda v=.7: snap(v), crash=lambda v=.9: crash(v),
                     tom=lambda v=.9, p='mid': tom(p, v)),
        'house': dict(kick=lambda v=1: kick('house', v), snare=lambda v=1: snare('tight', v),
                      clap=lambda v=1: clap('808', v), hat=lambda v=.7: hat('closed', v), ohat=lambda v=.7: hat('open', v, decay=0.25),
                      rim=rim, perc=lambda v=.7: shaker(v), crash=lambda v=.9: crash(v), tom=lambda v=.9, p='mid': tom(p, v)),
        'techno': dict(kick=lambda v=1: kick('techno', v), snare=lambda v=1: snare('tight', v, decay=0.12),
                       clap=lambda v=1: clap('tight', v), hat=lambda v=.7: hat('closed', v, decay=0.035),
                       ohat=lambda v=.7: hat('open', v, decay=0.2), rim=rim, perc=lambda v=.7: clave(v),
                       crash=lambda v=.9: cymbal('ride', v), tom=lambda v=.9, p='mid': tom(p, v, 'synth')),
        'lofi': dict(kick=lambda v=1: kick('lofi', v), snare=lambda v=1: snare('lofi', v), clap=lambda v=1: snap(v),
                     hat=lambda v=.6: hat('lofi', v), ohat=lambda v=.6: hat('open', v * 0.7, decay=0.25), rim=rim,
                     perc=lambda v=.6: shaker(v), crash=lambda v=.7: cymbal('ride', v),
                     tom=lambda v=.9, p='mid': tom(p, v)),
        'synthwave': dict(kick=lambda v=1: kick('synthwave', v), snare=lambda v=1: snare('synthwave', v),
                          clap=lambda v=1: clap('big', v), hat=lambda v=.7: hat('closed', v),
                          ohat=lambda v=.7: hat('open', v), rim=rim, perc=lambda v=.7: cowbell(v),
                          crash=lambda v=.9: crash(v), tom=lambda v=.9, p='mid': tom(p, v, 'synth')),
        'chip': dict(kick=lambda v=1: C.kick(v), snare=lambda v=1: C.snare(v), clap=lambda v=1: C.snare(v),
                     hat=lambda v=.6: C.hat(v), ohat=lambda v=.6: C.hat(v, True), rim=lambda v=.6: C.hat(v),
                     perc=lambda v=.6: C.blip('C6', v), crash=lambda v=.8: C.crash(v),
                     tom=lambda v=.9, p='mid': C.kick(v)),
        'acoustic': dict(kick=lambda v=1: kick('soft', v), snare=lambda v=1: snare('fat', v),
                         clap=lambda v=1: clap('big', v), hat=lambda v=.6: hat('closed', v),
                         ohat=lambda v=.6: hat('open', v), rim=rim, perc=lambda v=.6: shaker(v),
                         crash=lambda v=.9: crash(v), tom=lambda v=.9, p='mid': tom(p, v)),
        'cinematic': dict(kick=lambda v=1: kick('cinematic', v), snare=lambda v=1: snare('fat', v),
                          clap=lambda v=1: clap('big', v), hat=lambda v=.6: hat('closed', v),
                          ohat=lambda v=.6: hat('open', v), rim=rim, perc=lambda v=.8: taiko('tanggu', v),
                          crash=lambda v=.9: crash(v), tom=lambda v=.9, p='low': taiko('taiko', v)),
        'guofeng': dict(kick=lambda v=1: taiko('dagu', v), snare=lambda v=1: taiko('tanggu', v),
                        clap=lambda v=1: bo('xiaobo', v, choke=True), hat=lambda v=.6: woodblock('bangzi', v),
                        ohat=lambda v=.6: bo('xiaobo', v * 0.6), rim=lambda v=.7: taiko('rim', v),
                        perc=lambda v=.7: woodblock('muyu', v), crash=lambda v=.9: gong('chinese', v),
                        tom=lambda v=.9, p='low': taiko('taiko', v)),
    }
    return k[name]
