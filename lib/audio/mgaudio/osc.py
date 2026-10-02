"""Band-limited oscillators (PolyBLEP saw/pulse/tri via numba), sines, supersaw, pitch curves."""
from __future__ import annotations

import numpy as np
from scipy.signal import resample_poly

from .core import SR, ns, rng, exp_ramp
from .theory import hz, midi
from . import _dsp


def pitch_curve(note, n, glide_from=None, glide=0.05, vib_rate=0.0, vib_cents=0.0, vib_delay=0.2,
                vib_fade=0.3, bend=None, bend_curve=None, drift_cents=0.0, seed=None):
    """Per-sample frequency (Hz) for a note.

    glide_from: start note (portamento over `glide` s).  bend: [(t, semitones), ...] breakpoints
    added to pitch.  vib_*: vibrato (delayed, faded in).  drift_cents: slow random analog drift."""
    m0 = midi(note)
    t = np.arange(n) / SR
    semi = np.zeros(n)
    if glide_from is not None:
        g0 = midi(glide_from) - m0
        semi += g0 * np.exp(-3.0 * t / max(glide, 1e-4))
    if bend is not None:
        ts = [b[0] for b in bend]
        vs = [b[1] for b in bend]
        semi += np.interp(t, ts, vs)
    if bend_curve is not None:
        semi += bend_curve[:n] if len(bend_curve) >= n else np.pad(bend_curve, (0, n - len(bend_curve)), mode='edge')
    if vib_rate > 0 and vib_cents > 0:
        fade = np.clip((t - vib_delay) / max(vib_fade, 1e-3), 0, 1)
        semi += (vib_cents / 100.0) * fade * np.sin(2 * np.pi * vib_rate * t)
    if drift_cents > 0:
        r = rng(seed)
        k = max(2, int(n / (SR * 0.25)) + 2)
        pts = r.standard_normal(k)
        semi += np.interp(np.linspace(0, k - 1, n), np.arange(k), pts) * drift_cents / 100.0
    return 440.0 * 2 ** ((m0 + semi - 69) / 12)


def _f(freq, n=None):
    f = np.asarray(freq, dtype=np.float64)
    if f.ndim == 0:
        return np.full(n, float(f))
    return np.ascontiguousarray(f)


OS = 2  # oscillator oversampling factor (PolyBLEP @ 96 kHz + FIR decimation: aliases < -50 dB)


def _up(a, os):
    """Upsample a control curve by linear interpolation."""
    m = a.shape[0]
    return np.interp(np.arange(m * os) / os, np.arange(m), a)


def _down(y, os, m):
    if os == 1:
        return y
    return resample_poly(y, 1, os)[:m]


def saw(freq, n=None, phase=0.0, os=None):
    os = OS if os is None else os
    f = _f(freq, n)
    m = f.shape[0]
    y = _dsp.osc_saw(_up(f, os) if os > 1 else f, float(phase) % 1.0, float(SR * os))
    return _down(y, os, m)


def pulse(freq, n=None, pw=0.5, phase=0.0, dc=True, os=None):
    os = OS if os is None else os
    f = _f(freq, n)
    m = f.shape[0]
    w = _f(pw, m)
    y = _dsp.osc_pulse(_up(f, os) if os > 1 else f, _up(w, os) if os > 1 else w, float(phase) % 1.0,
                       float(SR * os), bool(dc))
    return _down(y, os, m)


def square(freq, n=None, phase=0.0):
    return pulse(freq, n, 0.5, phase)


def tri(freq, n=None, phase=0.0, os=None):
    os = OS if os is None else os
    f = _f(freq, n)
    m = f.shape[0]
    y = _dsp.osc_tri(_up(f, os) if os > 1 else f, float(phase) % 1.0, float(SR * os))
    return _down(y, os, m)


def sine(freq, n=None, phase=0.0):
    f = _f(freq, n)
    ph = 2 * np.pi * (phase + np.cumsum(f) / SR - f[0] / SR)
    return np.sin(ph)


def phase_of(freq, n=None, phase=0.0):
    f = _f(freq, n)
    return 2 * np.pi * (phase + np.cumsum(f) / SR - f[0] / SR)


def wave(kind, freq, n=None, phase=0.0, pw=0.5):
    if kind == 'saw':
        return saw(freq, n, phase)
    if kind in ('square', 'sqr'):
        return pulse(freq, n, 0.5, phase)
    if kind == 'pulse':
        return pulse(freq, n, pw, phase)
    if kind == 'tri':
        return tri(freq, n, phase)
    if kind == 'sine':
        return sine(freq, n, phase)
    raise ValueError(kind)


def additive(freq, n, partials, phases=None):
    """Sum of harmonics: partials = [amp1, amp2, ...] (harmonic k+1), auto band-limited."""
    f = _f(freq, n)
    ph = phase_of(f)
    out = np.zeros(f.shape[0])
    for k, a in enumerate(partials, start=1):
        if a == 0:
            continue
        mask = (f * k) < SR * 0.45
        if not mask.any():
            break
        p0 = 0.0 if phases is None else phases[k - 1]
        out += a * np.sin(k * ph + p0) * mask
    return out


def unison(kind, freq, n, voices=7, detune_cents=25.0, spread=1.0, seed=None, pw=0.5, center_gain=1.0):
    """Detuned unison stack -> stereo (2,n).  JP-8000 style supersaw when kind='saw'."""
    r = rng(seed)
    f = _f(freq, n)
    L = np.zeros(f.shape[0])
    R = np.zeros(f.shape[0])
    if voices <= 1:
        s = wave(kind, f, phase=r.random(), pw=pw)
        return np.stack([s, s])
    offs = np.linspace(-1, 1, voices)
    # slightly non-linear spread like the JP-8000 (outer voices further)
    offs = np.sign(offs) * np.abs(offs) ** 1.3
    pans = np.linspace(-1, 1, voices) * spread
    order = r.permutation(voices)
    pans = pans[order]
    for i, o in enumerate(offs):
        ratio = 2 ** (o * detune_cents / 1200)
        s = wave(kind, f * ratio, phase=r.random(), pw=pw)
        g = center_gain if abs(o) < 1e-9 else 1.0
        th = (pans[i] + 1) * np.pi / 4
        L += s * np.cos(th) * g
        R += s * np.sin(th) * g
    k = np.sqrt(2.0 / voices)
    return np.stack([L * k, R * k])


def fm_pair(fc, n, ratio=1.0, index=1.0, fb=0.0, mod_phase=0.0, os=2):
    """Two-operator FM (phase modulation), `os`x oversampled so bright sidebands don't alias.
    index may be an envelope array."""
    f = _f(fc, n)
    m = f.shape[0]
    idx = _f(index, m)
    fu, iu = (_up(f, os), _up(idx, os)) if os > 1 else (f, idx)
    sr = SR * os
    pm = 2 * np.pi * (mod_phase + np.cumsum(fu * ratio) / sr)
    mod = np.sin(pm)
    if fb:
        mod = np.sin(pm + fb * mod)
    y = np.sin(2 * np.pi * np.cumsum(fu) / sr + iu * mod)
    return _down(y, os, m)
