"""Filters & EQ.  Static filters use RBJ biquads (scipy sosfilt); swept filters use numba TPT SVF / ladder.

Every function accepts mono (n,) or stereo (2,n) arrays or Sound and returns ndarray (float64).
Cutoff arguments may be a number, a per-sample array, or breakpoints [(t,hz),...].
"""
from __future__ import annotations

import numpy as np
from functools import lru_cache
from scipy import signal

from .core import SR, as_array, breakpoints
from . import _dsp


# ----------------------------------------------------------------------------- helpers
def _per_channel(x, fn):
    a = as_array(x)
    if a.ndim == 2:
        return np.stack([fn(a[0]), fn(a[1])])
    return fn(a)


def _curve(v, n, log=True):
    """number | array | breakpoints -> float64 array of length n."""
    if isinstance(v, (list, tuple)) and len(v) and isinstance(v[0], (list, tuple)):
        return breakpoints(v, n, log=log)
    a = np.asarray(v, dtype=np.float64)
    if a.ndim == 0:
        return np.full(n, float(a))
    if a.shape[0] != n:
        return np.interp(np.linspace(0, 1, n), np.linspace(0, 1, a.shape[0]), a)
    return a


def sos_filter(x, sos):
    return _per_channel(x, lambda c: signal.sosfilt(sos, c))


# ----------------------------------------------------------------------------- RBJ biquads
def _biquad(b, a):
    b = np.asarray(b, float) / a[0]
    a = np.asarray(a, float) / a[0]
    return np.array([[b[0], b[1], b[2], 1.0, a[1], a[2]]])


@lru_cache(maxsize=512)
def peak_sos(f0, gain_db, q=1.0):
    A = 10 ** (gain_db / 40)
    w = 2 * np.pi * min(f0, SR * 0.49) / SR
    al = np.sin(w) / (2 * q)
    return _biquad([1 + al * A, -2 * np.cos(w), 1 - al * A], [1 + al / A, -2 * np.cos(w), 1 - al / A])


@lru_cache(maxsize=512)
def lowshelf_sos(f0, gain_db, s=0.7):
    A = 10 ** (gain_db / 40)
    w = 2 * np.pi * f0 / SR
    al = np.sin(w) / 2 * np.sqrt((A + 1 / A) * (1 / s - 1) + 2)
    c = np.cos(w)
    b = [A * ((A + 1) - (A - 1) * c + 2 * np.sqrt(A) * al), 2 * A * ((A - 1) - (A + 1) * c),
         A * ((A + 1) - (A - 1) * c - 2 * np.sqrt(A) * al)]
    a = [(A + 1) + (A - 1) * c + 2 * np.sqrt(A) * al, -2 * ((A - 1) + (A + 1) * c),
         (A + 1) + (A - 1) * c - 2 * np.sqrt(A) * al]
    return _biquad(b, a)


@lru_cache(maxsize=512)
def highshelf_sos(f0, gain_db, s=0.7):
    A = 10 ** (gain_db / 40)
    w = 2 * np.pi * min(f0, SR * 0.49) / SR
    al = np.sin(w) / 2 * np.sqrt((A + 1 / A) * (1 / s - 1) + 2)
    c = np.cos(w)
    b = [A * ((A + 1) + (A - 1) * c + 2 * np.sqrt(A) * al), -2 * A * ((A - 1) + (A + 1) * c),
         A * ((A + 1) + (A - 1) * c - 2 * np.sqrt(A) * al)]
    a = [(A + 1) - (A - 1) * c + 2 * np.sqrt(A) * al, 2 * ((A - 1) - (A + 1) * c),
         (A + 1) - (A - 1) * c - 2 * np.sqrt(A) * al]
    return _biquad(b, a)


@lru_cache(maxsize=512)
def lowpass_sos(f, order=2):
    f = min(f, SR * 0.49)
    return signal.butter(order, f, 'low', fs=SR, output='sos')


@lru_cache(maxsize=512)
def highpass_sos(f, order=2):
    return signal.butter(order, max(f, 1.0), 'high', fs=SR, output='sos')


@lru_cache(maxsize=512)
def bandpass_sos(lo, hi, order=2):
    return signal.butter(order, [max(lo, 1.0), min(hi, SR * 0.49)], 'band', fs=SR, output='sos')


@lru_cache(maxsize=512)
def reso_lp_sos(f, q=0.707):
    w = 2 * np.pi * min(f, SR * 0.49) / SR
    al = np.sin(w) / (2 * q)
    c = np.cos(w)
    return _biquad([(1 - c) / 2, 1 - c, (1 - c) / 2], [1 + al, -2 * c, 1 - al])


@lru_cache(maxsize=512)
def reso_bp_sos(f, q=1.0):
    """Constant 0 dB peak band-pass."""
    w = 2 * np.pi * min(f, SR * 0.49) / SR
    al = np.sin(w) / (2 * q)
    c = np.cos(w)
    return _biquad([al, 0, -al], [1 + al, -2 * c, 1 - al])


# ----------------------------------------------------------------------------- simple API
def lpf(x, hz, order=2):
    """Low-pass. hz scalar -> Butterworth; array/breakpoints -> swept SVF (12 dB/oct, order ignored)."""
    if np.ndim(hz) == 0 and not isinstance(hz, (list, tuple)):
        return sos_filter(x, lowpass_sos(float(hz), order))
    return svf(x, hz, 0.707, 'lp')


def hpf(x, hz, order=2):
    if np.ndim(hz) == 0 and not isinstance(hz, (list, tuple)):
        return sos_filter(x, highpass_sos(float(hz), order))
    return svf(x, hz, 0.707, 'hp')


def bpf(x, lo, hi=None, q=None, order=2):
    """Band-pass. bpf(x, lo, hi) Butterworth band; bpf(x, f, q=Q) resonant (swept allowed)."""
    if hi is not None:
        return sos_filter(x, bandpass_sos(float(lo), float(hi), order))
    q = 1.0 if q is None else q
    if np.ndim(lo) == 0 and not isinstance(lo, (list, tuple)):
        return sos_filter(x, reso_bp_sos(float(lo), float(q)))
    return svf(x, lo, q, 'bpn')


def peak_eq(x, f0, gain_db, q=1.0):
    return sos_filter(x, peak_sos(float(f0), float(gain_db), float(q)))


def low_shelf(x, f0, gain_db, s=0.7):
    return sos_filter(x, lowshelf_sos(float(f0), float(gain_db), float(s)))


def high_shelf(x, f0, gain_db, s=0.7):
    return sos_filter(x, highshelf_sos(float(f0), float(gain_db), float(s)))


def eq(x, bands):
    """Multi-band EQ: bands = [('hp', 30), ('lp', 16000), ('ls', 100, +2), ('hs', 8000, -2),
    ('pk', 3000, -3, 1.2), ...]"""
    a = as_array(x)
    for b in bands:
        kind = b[0]
        if kind == 'hp':
            a = hpf(a, b[1], b[2] if len(b) > 2 else 2)
        elif kind == 'lp':
            a = lpf(a, b[1], b[2] if len(b) > 2 else 2)
        elif kind == 'ls':
            a = low_shelf(a, b[1], b[2], b[3] if len(b) > 3 else 0.7)
        elif kind == 'hs':
            a = high_shelf(a, b[1], b[2], b[3] if len(b) > 3 else 0.7)
        elif kind == 'pk':
            a = peak_eq(a, b[1], b[2], b[3] if len(b) > 3 else 1.0)
        else:
            raise ValueError(kind)
    return a


_SVF_MODES = {'lp': 0, 'bp': 1, 'hp': 2, 'notch': 3, 'bpn': 4, 'ap': 5}


def svf(x, cutoff, q=0.707, mode='lp'):
    """Time-varying state-variable filter. cutoff/q: scalar, per-sample array or breakpoints."""
    a = as_array(x)
    n = a.shape[-1]
    fc = _curve(cutoff, n, log=True)
    qq = _curve(q, n, log=False)
    m = _SVF_MODES[mode]
    return _per_channel(a, lambda c: _dsp.svf(np.ascontiguousarray(c), fc, qq, m, float(SR)))


def ladder(x, cutoff, res=0.3, drive=1.0, comp=0.5, os=None):
    """Moog-style 4-pole ladder LP (24 dB/oct) w/ saturation. cutoff may sweep. res 0..1.
    os=None: 2x oversampling, 4x when drive >= 1.5 (the tanh stage aliases ~9 dB less at 4x on bright leads)."""
    from scipy.signal import resample_poly
    if os is None:
        os = 4 if drive >= 1.5 else 2
    a = as_array(x)
    n = a.shape[-1]
    fc = _curve(cutoff, n, log=True)
    rs = np.clip(_curve(res, n, log=False), 0, 1.05)

    def run(c):
        if os > 1:
            cu = resample_poly(c, os, 1)
            fcu = np.repeat(fc, os)[:cu.shape[0]]
            rsu = np.repeat(rs, os)[:cu.shape[0]]
            y = _dsp.ladder(cu, fcu, rsu, float(drive), float(SR * os), float(comp))
            return resample_poly(y, 1, os)[:n]
        return _dsp.ladder(np.ascontiguousarray(c), fc, rs, float(drive), float(SR), float(comp))

    return _per_channel(a, run)


def onepole_lp_array(x, hz):
    """One-pole LP for control signals (numpy array)."""
    x = np.asarray(x, dtype=np.float64)
    return _dsp.onepole_lp(x, np.full(x.shape[0], float(hz)), float(SR))


def tilt(x, db_per_oct_hi=0.0, pivot=1000.0):
    """Gentle tilt EQ via opposing shelves."""
    g = db_per_oct_hi * 3
    return high_shelf(low_shelf(x, pivot / 4, -g / 2), pivot * 4, g / 2)


def formant(x, vowel='a', q=8.0, mix=1.0):
    """Parallel formant filter bank (vowels a e i o u)."""
    F = {'a': [(800, 0), (1150, -4), (2900, -20)], 'e': [(400, 0), (1600, -10), (2700, -16)],
         'i': [(270, 0), (2140, -12), (2950, -26)], 'o': [(450, 0), (800, -9), (2830, -16)],
         'u': [(325, 0), (700, -12), (2530, -30)]}[vowel]
    a = as_array(x)
    out = 0
    for f, g in F:
        out = out + sos_filter(a, reso_bp_sos(f, q)) * 10 ** (g / 20)
    return a * (1 - mix) + out * mix * 2.0
