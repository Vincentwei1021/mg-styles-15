"""Breathy winds: flute, dizi (笛子, bright membrane buzz), xiao (箫, soft & breathy).

Phrases are rendered legato (one continuous breath) with ornaments:
  events = [(t, dur, note, vel, orn), ...]  orn in None | 'grace' (叠音 upper grace) | 'da' (打音 lower tap)
         | 'trill' (颤音) | 'slide' (滑音 from below) | 'fall' (end fall) | 'tongue' (re-articulate)
"""
from __future__ import annotations

import numpy as np

from .core import SR, Sound, ns, rng, fade
from .theory import hz, midi
from . import filters as F
from . import _dsp

_KINDS = {
    #          harmonics                                             breath buzz  vib_c vib_r  bright
    'flute': ([1.0, 0.32, 0.14, 0.07, 0.035, 0.02], 0.10, 0.0, 14, 5.2, 0.4),
    'dizi': ([1.0, 0.62, 0.48, 0.33, 0.25, 0.18, 0.12, 0.09, 0.07, 0.05], 0.08, 0.22, 20, 5.6, 0.8),
    'xiao': ([1.0, 0.16, 0.06, 0.03], 0.22, 0.0, 10, 4.8, 0.2),
}


def wind_line(events, kind='dizi', breath=None, vibrato=True, legato=True, seed=None, octave_shift=0,
              reverb_hint=False):
    """Render a legato wind phrase -> stereo Sound (t=0 = phrase start)."""
    harm, br0, buzz, vib_c, vib_r, bright = _KINDS[kind]
    breath = br0 if breath is None else breath
    r = rng(seed)
    ev = []
    for e in events:
        t0, du, nt = e[0], e[1], midi(e[2]) + 12 * octave_shift
        v = e[3] if len(e) > 3 else 0.8
        orn = e[4] if len(e) > 4 else None
        ev.append((t0, du, nt, v, orn))
    ev.sort(key=lambda x: x[0])
    T = max(e[0] + e[1] for e in ev) + 0.25
    n = ns(T)
    t = np.arange(n) / SR
    semi = np.full(n, ev[0][2], dtype=np.float64)
    ampc = np.zeros(n)
    art = np.ones(n)
    for i, (t0, du, m, v, orn) in enumerate(ev):
        i0, i1 = ns(t0), min(n, ns(t0 + du))
        nxt = ev[i + 1] if i + 1 < len(ev) else None
        seg_end = ns(nxt[0]) if (nxt is not None and legato and nxt[0] - (t0 + du) < 0.08) else i1
        seg_end = min(n, max(seg_end, i1))
        tt = np.arange(seg_end - i0) / SR
        p = np.full(seg_end - i0, m, dtype=np.float64)
        if i > 0 and legato and ev[i - 1][0] + ev[i - 1][1] >= t0 - 0.08:
            pm = ev[i - 1][2]
            p = m + (pm - m) * np.exp(-tt / 0.012)   # quick finger change
        if orn == 'grace':      # 叠音: upper neighbour grace ~45 ms
            k = tt < 0.045
            p[k] = m + 2
        elif orn == 'da':       # 打音: lower tap mid-note
            k = (tt > 0.06) & (tt < 0.1)
            p[k] = m - 2
        elif orn == 'trill':    # 颤音
            tr = (np.floor(tt * 22) % 2 == 1) & (tt > 0.05) & (tt < du - 0.05)
            p = np.where(tr, m + 2, p)
        elif orn == 'slide':    # 滑音 from below
            p = m - 2.5 * np.exp(-np.maximum(tt, 0) / 0.07)
        elif orn == 'fall':
            k = tt > du * 0.65
            p[k] = m - 3 * ((tt[k] - du * 0.65) / (du * 0.35 + 1e-6)) ** 2
        semi[i0:seg_end] = p
        ampc[i0:seg_end] = np.maximum(ampc[i0:seg_end], v)
        # articulation: tongued notes (non legato / 'tongue') get a short dip at onset
        if i > 0 and (orn == 'tongue' or not legato or ev[i - 1][0] + ev[i - 1][1] < t0 - 0.08):
            dip = ns(0.018)
            art[max(0, i0 - dip):i0] *= np.linspace(1, 0.15, len(art[max(0, i0 - dip):i0]))
            art[i0:i0 + dip] *= np.linspace(0.15, 1, len(art[i0:i0 + dip]))
    # gaps between non-legato notes: silence the breath
    gate = np.zeros(n)
    for (t0, du, m, v, orn) in ev:
        gate[ns(t0):min(n, ns(t0 + du))] = 1.0
    if legato:
        for i in range(len(ev) - 1):
            a0 = ns(ev[i][0] + ev[i][1])
            b0 = ns(ev[i + 1][0])
            if b0 - a0 < ns(0.08):
                gate[a0:b0] = 1.0
    env = _dsp.env_follow(gate, 0.035, 0.07, float(SR))
    env = env * F.onepole_lp_array(ampc, 12.0) * art
    # vibrato (delayed per note)
    if vibrato:
        vd = np.zeros(n)
        for (t0, du, m, v, orn) in ev:
            i0, i1 = ns(t0), min(n, ns(t0 + du))
            tt = np.arange(i1 - i0) / SR
            vd[i0:i1] = np.clip((tt - 0.22) / 0.3, 0, 1)
        vd = F.onepole_lp_array(vd, 8.0)
        semi = semi + vd * (vib_c / 100) * np.sin(2 * np.pi * vib_r * t + r.random() * 6)
        env = env * (1 + 0.07 * vd * np.sin(2 * np.pi * vib_r * t + 1.0))
    # onset scoop (breath catches the pitch from slightly below)
    f = 440 * 2 ** ((semi - 69) / 12)
    ph = 2 * np.pi * np.cumsum(f) / SR
    dyn = np.clip(env, 0, 1.2)
    tone = np.zeros(n)
    for k, a in enumerate(harm, start=1):
        mask = (f * k) < SR * 0.45
        # louder -> brighter
        ak = a * (0.55 + 0.45 * dyn) ** (k - 1 if bright > 0.5 else (k - 1) * 1.5)
        tone += ak * np.sin(k * ph + r.random() * 6.28) * mask
    # breath through a resonator tuned to f (breathy harmonics) + broadband hiss
    nz = r.standard_normal(n)
    res = _dsp.comb_resonator(nz * 0.05, f, 0.72, 0.45, float(SR))
    res = F.bpf(res, 800, 7000, 2)
    hiss = F.bpf(nz, 2500, 9000, 2) * 0.06
    # chiff at note onsets
    chiff = np.zeros(n)
    for (t0, du, m, v, orn) in ev:
        i0 = ns(t0)
        L = ns(0.035)
        if i0 + L < n:
            chiff[i0:i0 + L] += np.exp(-np.arange(L) / (L * 0.3)) * v
    chiff = F.bpf(nz * chiff, 1500, 6000, 2) * 0.5
    y = tone * 0.5 + breath * (res * 3.0 + hiss) * (0.4 + dyn) + chiff * breath * 2
    if buzz > 0:
        # 笛膜 membrane buzz: bright rasp on upper harmonics, amplitude-dependent
        bz = np.zeros(n)
        for k in range(5, 20):
            mask = (f * k) < SR * 0.45
            bz += np.sin(k * ph + r.random() * 6.28) * mask / k ** 0.7
        bz = F.bpf(bz, 2500, 9000, 2) * (0.6 + 0.4 * np.sign(np.sin(ph)))
        y += buzz * bz * dyn ** 1.5 * 0.35
    y = y * env
    y = F.hpf(y, 150)
    y = F.peak_eq(y, 3000, -2.0 if kind != 'dizi' else 1.0, 1.0)
    y = fade(y, 0.002, 0.05) * 0.6
    # slight stereo air (tiny decorrelated breath)
    yr = y + 0.02 * F.hpf(r.standard_normal(n), 4000) * env * breath
    return Sound(np.stack([y, yr]))


def dizi(note, dur=1.0, vel=0.8, orn=None, seed=None):
    return wind_line([(0.0, dur, note, vel, orn)], 'dizi', seed=seed)


def flute(note, dur=1.0, vel=0.8, orn=None, seed=None):
    return wind_line([(0.0, dur, note, vel, orn)], 'flute', seed=seed)


def xiao(note, dur=1.5, vel=0.7, orn=None, seed=None):
    return wind_line([(0.0, dur, note, vel, orn)], 'xiao', seed=seed)
