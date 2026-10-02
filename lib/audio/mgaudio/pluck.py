"""Plucked strings: extended Karplus-Strong (fractional delay, dispersion, pick position, body
resonance, pitch bends) + sampled Dan Tranh for the guzheng.  Chinese ornaments:

  guzheng(note, dur, orn='rou')          揉弦  delayed, upward-only vibrato (press-release)
  guzheng(note, dur, orn='slide_up')     上滑音 pluck then press up by `interval` semitones
  guzheng(note, dur, orn='slide_down')   下滑音 pre-pressed, releases down to the note
  guzheng(note, dur, orn='huihua')       回滑音 up then back
  guzheng_gliss(lo, hi, dur, key)        刮奏  pentatonic string sweep
  guzheng_tremolo(note, dur)             摇指  rapid repeated plucks
  pipa(note, dur, tremolo=True)          轮指
"""
from __future__ import annotations

import numpy as np

from .core import SR, Sound, ns, rng, fade, adsr, layer, pan_mono
from .theory import hz, midi, SCALES, pc
from . import filters as F
from . import fx as FX
from . import _dsp


def _bend_curve(orn, n, interval=2.0, depth=0.45, rate=5.5, onset=0.18, slide_t=0.14, slide_len=0.22):
    """Return pitch offset (semitones) curve for guzheng/pipa ornaments."""
    t = np.arange(n) / SR
    b = np.zeros(n)
    s_curve = lambda x: 0.5 - 0.5 * np.cos(np.pi * np.clip(x, 0, 1))
    if orn in (None, '', 'none'):
        return b
    if orn == 'rou':        # 揉弦: upward only, fades in
        fi = np.clip((t - onset) / 0.25, 0, 1)
        b = depth * fi * (0.5 - 0.5 * np.cos(2 * np.pi * rate * np.maximum(t - onset, 0)))
    elif orn == 'vib':      # symmetric vibrato
        fi = np.clip((t - onset) / 0.25, 0, 1)
        b = depth * 0.5 * fi * np.sin(2 * np.pi * rate * t)
    elif orn == 'slide_up':
        b = interval * s_curve((t - slide_t) / slide_len)
    elif orn == 'slide_down':
        b = interval * (1 - s_curve((t - slide_t) / slide_len))
    elif orn == 'huihua':   # 回滑: up and back
        up = s_curve((t - slide_t) / slide_len)
        dn = s_curve((t - slide_t - slide_len - 0.12) / slide_len)
        b = interval * (up - dn)
    elif orn == 'slide_up_rou':
        b = interval * s_curve((t - slide_t) / slide_len)
        t2 = np.maximum(t - slide_t - slide_len, 0)
        b += depth * 0.8 * np.clip(t2 / 0.2, 0, 1) * (0.5 - 0.5 * np.cos(2 * np.pi * rate * t2))
    else:
        raise ValueError(orn)
    return b


def ks(note, dur, vel=0.8, decay=2.5, bright=0.6, pos=0.18, disp=0.0, exc='noise', exc_lp=None,
       bend=None, twang=0.006, body=None, seed=None, release=0.08, stereo_spread=0.0):
    """Generic extended Karplus-Strong pluck -> mono ndarray.

    decay: T60 (s) of the fundamental. bright: loop brightness 0..1. pos: pluck position (0..0.5).
    bend: semitone offset curve (array) or None. twang: initial tension pitch overshoot (ratio)."""
    r = rng(seed)
    f0 = hz(note)
    n = ns(dur + release)
    t = np.arange(n) / SR
    semi = np.zeros(n) if bend is None else np.pad(bend[:n], (0, max(0, n - len(bend))), mode='edge')
    f = f0 * 2 ** (semi / 12) * (1 + twang * vel * np.exp(-t / 0.06))
    P = int(SR / f0)
    # excitation
    L = max(8, int(P * (1.0 if exc == 'noise' else 0.6)))
    if exc == 'noise':
        e = r.uniform(-1, 1, L)
    elif exc == 'pick':      # sharp plectrum: short bright impulse-ish
        e = r.uniform(-1, 1, L) * np.exp(-np.arange(L) / (L * 0.25))
        e[:3] += np.array([1.0, -0.6, 0.3])
    else:                    # 'finger': smooth half-sine displacement
        e = np.sin(np.pi * np.arange(L) / L) + 0.2 * r.uniform(-1, 1, L)
    lp = exc_lp if exc_lp is not None else 1200 + 9000 * vel ** 1.5
    e = F.lpf(e, min(lp, 20000), 1)
    # pick position comb
    d = max(1, int(pos * P))
    e = e - np.concatenate([np.zeros(d), e[:-d]]) if d < L else e
    e = e - e.mean()
    exc_full = np.zeros(n)
    exc_full[:L] = e
    y = _dsp.karplus(exc_full, f, float(decay), float(bright), float(disp), float(SR), 1.0)
    # release damping (finger mute) after dur
    g = ns(dur)
    if g < n:
        y[g:] *= np.exp(-np.arange(n - g) / (SR * release * 0.3))
    if body:
        acc = y * 0.6
        for (bf, bq, bg) in body:
            acc = acc + F.bpf(y, bf, q=bq) * bg
        y = acc
    y = F.hpf(y, 40, 2)
    return fade(y, 0.0003, 0.004) * vel         # 0.3 ms: keeps the pick transient, removes the sample-0 step


def _to_st(y, spread=0.0, seed=None):
    """Mono -> stereo with width `spread` (0..1), MONO-COMPATIBLE: L = y + s, R = y - s where s is a
    high-passed, slightly delayed copy.  L+R = 2y exactly, so nothing cancels on a phone speaker.
    (The old Haas copy - R delayed ~1 ms - notched the 400-600 Hz body of plucks by up to 7 dB in mono.)"""
    if spread <= 0:
        return np.stack([y, y])
    d = ns(0.0007 + spread * 0.0009)
    s = np.concatenate([np.zeros(d), y[:-d]])
    s = F.hpf(s, 350, 2) * (0.22 + 0.33 * spread)
    return np.stack([y + s, y - s])


def guitar(note, dur=2.0, vel=0.8, kind='nylon', bend=None, seed=None):
    """'nylon' (warm classical), 'steel' (bright acoustic), 'muted' (palm mute), 'uke' (ukulele)."""
    cfg = {
        'nylon': dict(decay=3.0, bright=0.45, pos=0.16, disp=0.0, exc='finger',
                      body=[(105, 3, 0.6), (220, 3, 0.35), (420, 2, 0.2)]),
        'steel': dict(decay=4.0, bright=0.72, pos=0.12, disp=0.08, exc='pick',
                      body=[(110, 3, 0.5), (240, 3, 0.35), (2800, 1.5, 0.1)]),
        'muted': dict(decay=0.25, bright=0.35, pos=0.12, disp=0.0, exc='pick', body=[(150, 2, 0.5)]),
        'uke': dict(decay=1.6, bright=0.55, pos=0.2, disp=0.0, exc='finger',
                    body=[(260, 3, 0.5), (520, 2, 0.3), (1100, 2, 0.12)]),
    }[kind]
    y = ks(note, dur, vel, bend=bend, seed=seed, **cfg)
    return Sound(_to_st(y, 0.5) * 0.9)


def strum(chord_notes, dur=1.5, vel=0.8, kind='uke', down=True, spread=0.018, seed=None):
    """Strum a chord (guitar/uke). down=True low->high."""
    notes = sorted(chord_notes) if down else sorted(chord_notes, reverse=True)
    r = rng(seed)
    parts = []
    for i, nt in enumerate(notes):
        v = vel * (0.85 + 0.15 * r.random()) * (1.0 if down else 0.8)
        parts.append((guitar(nt, dur - i * spread, v, kind, seed=int(r.integers(1 << 30))), i * spread))
    s = layer(parts)
    return Sound(s.data / np.sqrt(len(notes)) * 1.2)


def harp(note, dur=2.5, vel=0.75, engine='auto', seed=None):
    from . import samples as S
    if engine in ('auto', 'sample') and S.available('harp'):
        return S.inst('harp').play(note, dur, vel, release=0.6)
    y = ks(note, dur, vel, decay=3.2, bright=0.5, pos=0.5 * 0.9, exc='finger',
           body=[(180, 2, 0.4), (500, 2, 0.2)], seed=seed)
    return Sound(_to_st(y, 0.7))


def pizz(note, dur=0.5, vel=0.8, seed=None):
    """Pizzicato string (short, woody, body formants). Good for playful/variety bounces."""
    y = ks(note, dur, vel, decay=0.45 + 60 / hz(note) * 0.3, bright=0.32, pos=0.22, exc='finger',
           exc_lp=2500 + 3000 * vel, body=[(290, 3, 0.8), (470, 3, 0.5), (1100, 2, 0.25), (2600, 2, 0.2)],
           twang=0.002, release=0.05, seed=seed)
    y = F.peak_eq(y, 3500, -3, 1)
    return Sound(_to_st(y, 0.6))


# ============================================================================ Chinese plucked
_GZ_BODY = [(190, 2.5, 0.55), (380, 3, 0.35), (760, 2.5, 0.22), (1500, 2, 0.12)]


def guzheng(note, dur=2.5, vel=0.8, orn=None, interval=2.0, depth=0.45, rate=5.5, engine='auto',
            onset=0.18, slide_t=0.12, slide_len=0.22, seed=None):
    """Guzheng (古筝) pluck with ornaments (see module doc).  engine: 'auto' (sampled Dan Tranh when
    available, synthetic KS otherwise) | 'sample' | 'synth'."""
    n = ns(dur + 0.5)
    b = _bend_curve(orn, n, interval, depth, rate, onset, slide_t, slide_len)
    from . import samples as S
    m = midi(note)
    if engine in ('auto', 'sample') and S.available('dantranh') and 38 <= m <= 88:
        ins = S.inst('dantranh', match=r'^[A-Ga-g]#?\d_(f|ff|mf)_')
        s = ins.play(note, dur, vel, bend=b if orn else None, release=0.45)
        # a touch of body + air
        y = F.peak_eq(s.data, 200, 1.5, 1.0)
        y = F.high_shelf(y, 7000, 1.5)
        return Sound(_to_st(y[0] if y.ndim == 2 else y, 0.6))
    f0 = hz(note)
    decay = float(np.clip(5.0 * (220 / f0) ** 0.45, 1.2, 7.0))
    y = ks(note, dur, vel, decay=decay, bright=0.78, pos=0.09, disp=0.12, exc='pick', bend=b,
           twang=0.012, body=_GZ_BODY, seed=seed, release=0.25)
    # plectrum click
    r = rng(seed)
    c = F.hpf(r.standard_normal(ns(0.004)) * np.linspace(1, 0, ns(0.004)) ** 2, 2500) * 0.25 * vel
    y[:c.shape[0]] += c
    return Sound(_to_st(fade(y, 0.0003, 0.0), 0.6))


def guzheng_gliss(lo='D4', hi='D6', dur=0.6, key='D', mode='gong', vel=0.7, up=True, ring=2.5,
                  engine='auto', curve=1.3, seed=None):
    """刮奏 glissando across pentatonic strings from lo to hi (or hi->lo if up=False).
    Sync point = the last string (top of the sweep)."""
    k = pc(key)
    iv = SCALES[mode]
    pcs = [(k + i) % 12 for i in iv]
    a, b = int(midi(lo)), int(midi(hi))
    strings = [m for m in range(a, b + 1) if m % 12 in pcs]
    if not up:
        strings = strings[::-1]
    N = len(strings)
    parts = []
    r = rng(seed)
    for i, m in enumerate(strings):
        x = i / max(1, N - 1)
        t = dur * x ** curve
        v = vel * (0.55 + 0.45 * x if up else 1 - 0.45 * x) * (0.9 + 0.2 * r.random())
        parts.append((guzheng(m, ring, v, engine=engine), t, 0.0, (x - 0.5) * 0.6))
    s = layer(parts)
    return Sound(s.data / np.sqrt(N) * 1.6, sync=dur)


def guzheng_tremolo(note, dur=1.2, vel=0.7, rate=13.0, engine='auto', crescendo=True):
    """摇指 (fast repeated plucks)."""
    k = int(dur * rate)
    parts = []
    for i in range(k):
        x = i / max(1, k - 1)
        v = vel * (0.55 + 0.45 * x if crescendo else 0.85) * (0.85 + 0.15 * ((i % 2) == 0))
        parts.append((guzheng(note, 1.0 / rate + 0.35, v, engine=engine), i / rate))
    s = layer(parts)
    return Sound(s.data * 0.7)


def pipa(note, dur=1.2, vel=0.8, tremolo=False, orn=None, interval=2.0, rate=16.0, seed=None):
    """Pipa (琵琶): bright, nasal, shorter sustain, strong twang; tremolo=True for 轮指."""
    f0 = hz(note)
    decay = float(np.clip(2.2 * (220 / f0) ** 0.4, 0.6, 3.0))
    body = [(420, 2.5, 0.5), (900, 2.5, 0.4), (1900, 2, 0.25), (3200, 2, 0.12)]
    if not tremolo:
        n = ns(dur + 0.3)
        b = _bend_curve(orn, n, interval) if orn else None
        y = ks(note, dur, vel, decay=decay, bright=0.8, pos=0.08, disp=0.18, exc='pick', bend=b, twang=0.02,
               body=body, seed=seed, release=0.12)
        return Sound(_to_st(y, 0.4))
    k = max(2, int(dur * rate))
    parts = []
    for i in range(k):
        v = vel * (0.7 + 0.3 * np.sin(np.pi * i / k))
        y = ks(note, 1.0 / rate + 0.3, v, decay=decay, bright=0.8, pos=0.08, disp=0.18, exc='pick', twang=0.02,
               body=body, release=0.1)
        parts.append((Sound(_to_st(y, 0.4)), i / rate))
    return Sound(layer(parts).data * 0.6)


def koto_harmonic(note, dur=2.0, vel=0.6):
    """泛音 harmonic: bell-like octave tone (touch node at string midpoint)."""
    y = ks(midi(note) + 12, dur, vel, decay=3.0, bright=0.5, pos=0.5, exc='finger', twang=0.0,
           body=_GZ_BODY)
    return Sound(_to_st(y, 0.6) * 0.8)
