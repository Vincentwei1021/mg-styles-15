"""Chiptune voices (NES / GameBoy flavour): pulse 12.5/25/50/75 %, 4-bit stepped triangle, LFSR noise,
60 Hz frame envelopes & arpeggio chords, plus chip drums and classic 8-bit SFX."""
from __future__ import annotations

import numpy as np
from scipy.signal import resample_poly

from .core import SR, Sound, ns, fade, rng
from .theory import hz, midi
from . import osc as O
from . import filters as F
from . import _dsp

FRAME = 1 / 60.0
NES_NOISE = [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068]
CPU = 1789773.0


def _frames(vals, n, smooth_ms=0.6):
    """Per-frame values (list/array, 60 Hz) -> per-sample stair curve (lightly smoothed)."""
    v = np.asarray(vals, dtype=np.float64)
    idx = np.minimum((np.arange(n) / SR / FRAME).astype(int), len(v) - 1)
    y = v[idx]
    if smooth_ms > 0:
        y = F.onepole_lp_array(y, 1000.0 / (2 * np.pi * smooth_ms))
    return y


def vol_env(dur, kind='decay', vol=15, decay_frames=12, sustain=None):
    """Volume per frame (0..15). kinds: 'decay' (linear to 0), 'sustain' (hold then fade),
    'pluck' (fast), 'swell'."""
    nf = max(1, int(np.ceil(dur / FRAME)))
    f = np.arange(nf)
    if kind == 'decay':
        v = vol * np.clip(1 - f / max(decay_frames, 1), 0, 1)
    elif kind == 'pluck':
        v = vol * np.clip(1 - f / 6, 0.25, 1)
    elif kind == 'sustain':
        s = vol * 0.7 if sustain is None else sustain
        v = np.where(f < 3, vol, s)
        v = np.where(f > nf - 3, s * 0.4, v)
    elif kind == 'swell':
        v = vol * np.clip(f / max(nf * 0.6, 1), 0, 1)
    else:
        v = np.full(nf, vol)
    return np.round(v)


def pulse(note, dur, duty=0.25, vel=0.8, env='sustain', vib=0.0, vib_rate=6.0, vib_delay=0.2, arp=None,
          arp_rate=60.0, sweep=0.0, duty_seq=None, slide_from=None, slide=0.05):
    """NES pulse channel note. arp: semitone offsets cycled at arp_rate Hz (e.g. [0,4,7]).
    sweep: semitones/second pitch sweep. duty_seq: per-frame duty list (e.g. [0.125,0.25,0.5])."""
    n = ns(dur)
    t = np.arange(n) / SR
    semi = np.full(n, midi(note))
    if slide_from is not None:
        semi += (midi(slide_from) - midi(note)) * np.exp(-3 * t / slide)
    if arp:
        k = (t * arp_rate).astype(int) % len(arp)
        semi += np.asarray(arp)[k]
    if sweep:
        semi += sweep * t
    if vib:
        semi += vib * np.sin(2 * np.pi * vib_rate * t) * np.clip((t - vib_delay) / 0.15, 0, 1)
    f = 440 * 2 ** ((semi - 69) / 12)
    if duty_seq is not None:
        pw = _frames(duty_seq, n, 0)
    else:
        pw = np.full(n, duty)
    y = O.pulse(f, pw=pw, dc=True)
    ve = vol_env(dur, env) if isinstance(env, str) else np.asarray(env)
    y = y * _frames(ve / 15.0, n) * vel * 0.3
    return Sound(fade(y, 0.0005, 0.002))


def triangle(note, dur, vel=0.9, slide_from=None, slide=0.05, vib=0.0, sweep=0.0, gate=1.0):
    """NES triangle: 4-bit stepped (32 steps), no volume control (full or off)."""
    n = ns(dur)
    os = 4
    m = n * os
    t = np.arange(m) / (SR * os)
    semi = np.full(m, midi(note))
    if slide_from is not None:
        semi += (midi(slide_from) - midi(note)) * np.exp(-3 * t / slide)
    if sweep:
        semi += sweep * t
    if vib:
        semi += vib * np.sin(2 * np.pi * 6 * t) * np.clip((t - 0.2) / 0.15, 0, 1)
    f = 440 * 2 ** ((semi - 69) / 12)
    ph = np.cumsum(f) / (SR * os) % 1.0
    step = np.floor(ph * 32).astype(int)
    tbl = np.concatenate([np.arange(15, -1, -1), np.arange(0, 16)]).astype(float)
    y = tbl[step] / 7.5 - 1.0
    y = resample_poly(y, 1, os)[:n]
    g = np.ones(n)
    gl = int(n * gate)
    g[gl:] = 0
    y = y * g * vel * 0.42
    return Sound(fade(y, 0.001, 0.003))


def noise(dur, period=8, short=False, vel=0.8, env='decay', decay_frames=8, period_seq=None, seed=1):
    """NES noise channel. period index 0 (bright/high) .. 15 (low rumble). short=True metallic mode."""
    n = ns(dur)
    if period_seq is not None:
        pidx = _frames(period_seq, n, 0)
        ps = np.array([SR / (CPU / NES_NOISE[int(np.clip(p, 0, 15))]) for p in pidx])
    else:
        ps = np.full(n, SR / (CPU / NES_NOISE[int(np.clip(period, 0, 15))]))
    y = _dsp.lfsr_noise(n, ps, bool(short), int(seed) * 7919 + 1)
    ve = vol_env(dur, env, decay_frames=decay_frames) if isinstance(env, str) else np.asarray(env)
    y = y * _frames(ve / 15.0, n) * vel * 0.25
    y = F.lpf(y, 14000, 2)
    return Sound(fade(y, 0.0005, 0.003))


def arp_chord(notes, dur, duty=0.25, rate=60.0, vel=0.7, env='sustain'):
    """Classic chip 'fake chord': cycle chord tones every frame on a single pulse channel."""
    root = min(midi(x) for x in notes)
    offs = [midi(x) - root for x in notes]
    return pulse(root, dur, duty, vel, env, arp=offs, arp_rate=rate)


def stereo(s, pan=0.0):
    from .core import pan_mono
    return Sound(pan_mono(s.data if s.data.ndim == 1 else s.data[0], pan))


# ----------------------------------------------------------------------------- chip drums
def kick(vel=0.9):
    tri = triangle(60, 0.12, vel, sweep=-260)       # fast downward sweep
    nz = noise(0.03, period=10, vel=0.4, decay_frames=2)
    y = np.zeros(ns(0.12))
    y[:tri.n] += tri.data
    y[:nz.n] += nz.data * 0.6
    return Sound(y * 1.2)


def snare(vel=0.85):
    nz = noise(0.16, period=5, vel=vel, decay_frames=9)
    p = pulse(55, 0.04, 0.5, 0.5, env='pluck', sweep=-60)
    y = nz.data.copy()
    y[:p.n] += p.data
    return Sound(y)


def hat(vel=0.6, open_=False):
    return noise(0.2 if open_ else 0.04, period=0 if not open_ else 1, vel=vel,
                 decay_frames=12 if open_ else 2)


def crash(vel=0.8):
    return noise(0.9, period=2, vel=vel, decay_frames=54)


# ----------------------------------------------------------------------------- 8-bit SFX
def coin(vel=0.8):
    """Classic coin: B5 then E6 (square)."""
    a = pulse('B5', 0.07, 0.5, vel, env=[15, 15, 15, 15, 15])
    b = pulse('E6', 0.45, 0.5, vel, env=vol_env(0.45, 'decay', decay_frames=26))
    y = np.zeros(a.n + b.n)
    y[:a.n] += a.data
    y[a.n:] += b.data
    return Sound(y)


def jump(vel=0.8):
    s = pulse('A3', 0.24, 0.25, vel, env=vol_env(0.24, 'decay', decay_frames=15), sweep=38)
    return s


def powerup(vel=0.8, steps=12, dur=0.7):
    """Rising arpeggiated sweep (power-up / level-up)."""
    parts = []
    base = midi('C4')
    seg = dur / steps
    y = np.zeros(ns(dur + 0.1))
    for i in range(steps):
        nt = base + [0, 4, 7, 12][i % 4] + 2 * (i // 4) + i * 0.6
        s = pulse(nt, seg * 1.3, 0.25 if i % 2 else 0.5, vel * (0.7 + 0.3 * i / steps), env='sustain')
        k = ns(i * seg)
        y[k:k + s.n] += s.data[:max(0, min(s.n, y.shape[0] - k))]
    return Sound(fade(y, 0, 0.05))


def oneup(vel=0.8):
    notes = ['E5', 'G5', 'E6', 'C6', 'D6', 'G6']
    y = np.zeros(ns(0.6))
    for i, nt in enumerate(notes):
        s = pulse(nt, 0.1, 0.5, vel, env='sustain')
        k = ns(i * 0.085)
        y[k:k + s.n] += s.data[:max(0, min(s.n, y.shape[0] - k))]
    return Sound(fade(y, 0, 0.03))


def laser(vel=0.8):
    return pulse('C7', 0.22, 0.125, vel, env=vol_env(0.22, 'decay', decay_frames=13), sweep=-110)


def explosion(vel=0.9, dur=0.9):
    nf = int(dur / FRAME)
    seq = np.linspace(8, 15, nf)
    return noise(dur, vel=vel, env=vol_env(dur, 'decay', decay_frames=nf), period_seq=seq)


def hit(vel=0.8):
    a = noise(0.08, period=6, vel=vel, decay_frames=5)
    b = pulse('C3', 0.08, 0.5, vel * 0.6, env='pluck', sweep=-80)
    return Sound(a.data + np.pad(b.data, (0, max(0, a.n - b.n)))[:a.n])


def select(vel=0.7):
    return pulse('A5', 0.06, 0.5, vel, env=[15, 12, 8, 4])


def blip(note='C6', vel=0.7):
    return pulse(note, 0.05, 0.25, vel, env=[15, 11, 7, 3])


def death(vel=0.8):
    return pulse('B4', 1.0, 0.5, vel, env=vol_env(1.0, 'decay', decay_frames=60), sweep=-14, vib=0.8,
                 vib_rate=12, vib_delay=0.0)
