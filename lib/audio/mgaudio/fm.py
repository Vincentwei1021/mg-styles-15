"""FM synthesis (phase modulation, 2x oversampled): e-piano (DX 'tine' Rhodes), bells, glass pad,
metallic plucks, FM bass, mallets, brass."""
from __future__ import annotations

import numpy as np
from scipy.signal import resample_poly

from .core import SR, Sound, ns, adsr, rng, pan_mono, fade
from .theory import hz
from . import filters as F
from . import fx as FX

_OS = 2


def _env(d, a, dcy, s, r, total, n):
    e = adsr(d, a, dcy, s, r, total=total)
    return np.interp(np.arange(n) / _OS, np.arange(e.shape[0]), e)


def op_stack(f0, dur, ops, total=None, detune_cents=0.0, seed=None):
    """Render a chain/sum of FM pairs at 2x oversampling.

    ops: list of dicts, each a carrier with optional modulator:
      {'ratio':1, 'level':1, 'env':(a,d,s,r), 'mod_ratio':1, 'index':2, 'index_env':(a,d,s,r),
       'mod2_ratio':None, 'index2':0, 'fixed':None}
    Returns mono float64 at SR."""
    total = dur + 0.5 if total is None else total
    n = ns(total)
    m = n * _OS
    t = np.arange(m) / (SR * _OS)
    out = np.zeros(m)
    r = rng(seed)
    fdet = f0 * 2 ** (detune_cents / 1200)
    for op in ops:
        fc = fdet * op.get('ratio', 1.0) if op.get('fixed') is None else op['fixed']
        ae = _env(dur, *op.get('env', (0.002, 0.5, 0.0, 0.3)), total, m)
        pm = 0.0
        if op.get('index', 0):
            fm_ = fdet * op.get('mod_ratio', 1.0) + op.get('mod_offset', 0.0)
            ie = _env(dur, *op.get('index_env', op.get('env', (0.002, 0.5, 0.0, 0.3))), total, m)
            mod_in = 0.0
            if op.get('index2', 0):
                f2 = fdet * op.get('mod2_ratio', 1.0)
                ie2 = _env(dur, *op.get('index2_env', (0.001, 0.2, 0.0, 0.2)), total, m)
                mod_in = op['index2'] * ie2 * np.sin(2 * np.pi * f2 * t + r.random() * 6.28)
            pm = op['index'] * ie * np.sin(2 * np.pi * fm_ * t + mod_in)
        car = np.sin(2 * np.pi * fc * t + pm)
        out += op.get('level', 1.0) * ae * car
    return resample_poly(out, 1, _OS)[:n]


def epiano(note, dur, vel=0.8, bright=0.5, tremolo=0.0, stereo=True, release=0.35):
    """DX7-style tine e-piano. vel shapes the bark (index) as on a real Rhodes."""
    f = hz(note)
    # key scaling: higher notes decay faster
    ks = np.clip((f / 440.0) ** 0.5, 0.4, 2.5)
    decay = 3.8 / ks
    iv = (0.4 + 1.6 * vel) * (0.6 + 0.8 * bright)
    ops = [
        {'ratio': 1.0, 'level': 1.0, 'env': (0.001, decay, 0.0, release), 'mod_ratio': 1.0, 'index': 1.1 * iv,
         'index_env': (0.001, 0.9 / ks, 0.18, release)},
        {'ratio': 1.0, 'level': 0.35 * vel, 'env': (0.001, 0.5 / ks, 0.0, release), 'mod_ratio': 14.0,
         'index': 0.9 * iv, 'index_env': (0.0005, 0.08, 0.0, 0.05)},
        {'ratio': 2.0, 'level': 0.08, 'env': (0.001, 1.2 / ks, 0.0, release)},
    ]
    total = dur + release + 0.1
    y = op_stack(f, dur, ops, total=total)
    y2 = op_stack(f, dur, ops, total=total, detune_cents=4)
    y = fade(y * vel * 0.4, 0, 0.02)
    y2 = fade(y2 * vel * 0.4, 0, 0.02)
    st = np.stack([y, y2]) if stereo else np.stack([y, y])
    if tremolo:
        from .core import pan_curve
        tt = np.arange(st.shape[1]) / SR
        p = tremolo * np.sin(2 * np.pi * 4.5 * tt)
        st = pan_curve(0.5 * (st[0] + st[1]), p)
    return Sound(st)


def bell(note, dur=2.0, vel=0.8, kind='bell'):
    """Bells: 'bell' (inharmonic 3.5), 'tubular', 'glock', 'celesta', 'pluck' (short metallic), 'chime'."""
    f = hz(note)
    if kind == 'bell':
        ops = [{'ratio': 1.0, 'env': (0.001, dur * 1.2, 0.0, 0.5), 'mod_ratio': 3.5, 'index': 3.2,
                'index_env': (0.001, dur * 0.6, 0.0, 0.4)},
               {'ratio': 2.0, 'level': 0.3, 'env': (0.001, dur * 0.5, 0.0, 0.4), 'mod_ratio': 1.41, 'index': 1.5,
                'index_env': (0.001, dur * 0.3, 0.0, 0.3)}]
    elif kind == 'tubular':
        ops = [{'ratio': 1.0, 'env': (0.001, dur * 1.5, 0.0, 0.6), 'mod_ratio': 2.76, 'index': 2.4,
                'index_env': (0.001, dur * 0.5, 0.1, 0.4)},
               {'ratio': 5.4, 'level': 0.2, 'env': (0.001, dur * 0.3, 0.0, 0.3)}]
    elif kind == 'glock':
        ops = [{'ratio': 1.0, 'env': (0.0005, dur, 0.0, 0.3), 'mod_ratio': 3.0, 'index': 1.2,
                'index_env': (0.0005, 0.15, 0.1, 0.2)},
               {'ratio': 2.76, 'level': 0.25, 'env': (0.0005, dur * 0.25, 0.0, 0.2)},
               {'ratio': 5.4, 'level': 0.12, 'env': (0.0005, dur * 0.1, 0.0, 0.1)}]
    elif kind == 'celesta':
        ops = [{'ratio': 1.0, 'env': (0.001, dur * 0.8, 0.0, 0.3), 'mod_ratio': 4.0, 'index': 1.4,
                'index_env': (0.001, 0.12, 0.05, 0.2)},
               {'ratio': 2.0, 'level': 0.2, 'env': (0.001, dur * 0.4, 0.0, 0.3)}]
    elif kind == 'pluck':
        ops = [{'ratio': 1.0, 'env': (0.0008, min(dur, 0.6), 0.0, 0.2), 'mod_ratio': 1.41, 'index': 4.0,
                'index_env': (0.0005, 0.08, 0.0, 0.1)}]
    elif kind == 'chime':
        ops = [{'ratio': 1.0, 'env': (0.001, dur, 0.0, 0.5), 'mod_ratio': 7.0, 'index': 1.6,
                'index_env': (0.001, 0.2, 0.05, 0.3)},
               {'ratio': 3.0, 'level': 0.25, 'env': (0.001, dur * 0.6, 0.0, 0.4)}]
    else:
        raise ValueError(kind)
    total = dur + 0.4
    y = op_stack(f, dur, ops, total=total)
    y = fade(y, 0.0, 0.05) * vel * 0.35
    return Sound(np.stack([y, y]))


def glass_pad(notes, dur, vel=0.7, attack=0.6, release=1.5):
    notes = [notes] if np.ndim(notes) == 0 and not isinstance(notes, (list, tuple)) else list(notes)
    total = dur + release
    outs = []
    for ch, det in enumerate([-5, 5]):
        acc = 0
        for nt in notes:
            ops = [{'ratio': 1.0, 'env': (attack, 1.0, 0.8, release), 'mod_ratio': 2.0, 'index': 0.9,
                    'index_env': (attack * 1.5, 2.0, 0.5, release)},
                   {'ratio': 3.0, 'level': 0.12, 'env': (attack * 0.5, 0.8, 0.4, release), 'mod_ratio': 1.0,
                    'index': 0.5}]
            acc = acc + op_stack(hz(nt), dur, ops, total=total, detune_cents=det)
        outs.append(acc)
    st = np.stack(outs) * vel * 0.25 / np.sqrt(len(notes))
    st = FX.chorus(st, 0.35, 3.0, mix=0.5)
    return Sound(st)


def bass(note, dur, vel=0.9, kind='punch'):
    """FM bass: 'punch' (DX slap-ish), 'wood' (round), 'growl' (for wobble/dubstep)."""
    f = hz(note)
    if kind == 'punch':
        ops = [{'ratio': 1.0, 'env': (0.001, 0.6, 0.6, 0.08), 'mod_ratio': 1.0, 'index': 2.8 * vel,
                'index_env': (0.001, 0.12, 0.25, 0.08)},
               {'ratio': 0.5, 'level': 0.6, 'env': (0.002, 0.5, 0.8, 0.08)}]
    elif kind == 'wood':
        ops = [{'ratio': 1.0, 'env': (0.002, 0.5, 0.4, 0.08), 'mod_ratio': 2.0, 'index': 1.4,
                'index_env': (0.001, 0.09, 0.1, 0.06)}]
    elif kind == 'growl':
        ops = [{'ratio': 1.0, 'env': (0.003, 0.4, 0.9, 0.08), 'mod_ratio': 0.5, 'index': 4.5,
                'index_env': (0.005, 0.3, 0.7, 0.1)}]
    else:
        raise ValueError(kind)
    y = op_stack(f, dur, ops, total=dur + 0.1)
    y = np.tanh(1.6 * y) * vel * 0.45
    y = fade(y, 0.001, 0.01)
    return Sound(np.stack([y, y]))


def mallet(note, dur=1.0, vel=0.8, kind='marimba'):
    """Synthetic mallets (fallback when samples absent): 'marimba', 'vibes', 'xylo', 'kalimba'."""
    f = hz(note)
    if kind == 'marimba':
        ops = [{'ratio': 1.0, 'env': (0.001, 0.7, 0.0, 0.2), 'mod_ratio': 4.0, 'index': 1.2 * vel,
                'index_env': (0.0005, 0.03, 0.0, 0.05)},
               {'ratio': 4.0, 'level': 0.18, 'env': (0.0005, 0.12, 0.0, 0.05)},
               {'ratio': 10.0, 'level': 0.05, 'env': (0.0005, 0.03, 0.0, 0.02)}]
    elif kind == 'vibes':
        ops = [{'ratio': 1.0, 'env': (0.001, 2.5, 0.0, 0.4), 'mod_ratio': 4.0, 'index': 0.6,
                'index_env': (0.0005, 0.05, 0.0, 0.05)},
               {'ratio': 4.0, 'level': 0.15, 'env': (0.0005, 0.6, 0.0, 0.3)}]
    elif kind == 'xylo':
        ops = [{'ratio': 1.0, 'env': (0.0005, 0.35, 0.0, 0.1), 'mod_ratio': 3.0, 'index': 1.5,
                'index_env': (0.0005, 0.03, 0.0, 0.02)},
               {'ratio': 3.0, 'level': 0.35, 'env': (0.0005, 0.15, 0.0, 0.05)}]
    elif kind == 'kalimba':
        ops = [{'ratio': 1.0, 'env': (0.001, 1.0, 0.0, 0.2), 'mod_ratio': 5.6, 'index': 0.9,
                'index_env': (0.0005, 0.02, 0.0, 0.02)},
               {'ratio': 6.2, 'level': 0.12, 'env': (0.0005, 0.08, 0.0, 0.05)}]
    else:
        raise ValueError(kind)
    y = op_stack(f, dur, ops, total=dur + 0.2) * vel * 0.4
    return Sound(np.stack([y, y]))


def brass(note, dur, vel=0.85):
    """FM brass (index follows amplitude)."""
    f = hz(note)
    ops = [{'ratio': 1.0, 'env': (0.04, 0.2, 0.85, 0.15), 'mod_ratio': 1.0, 'index': 3.2 * vel,
            'index_env': (0.06, 0.25, 0.6, 0.15)}]
    y = op_stack(f, dur, ops, total=dur + 0.2) * vel * 0.4
    y = F.lpf(y, 5000)
    return Sound(np.stack([y, y]))
