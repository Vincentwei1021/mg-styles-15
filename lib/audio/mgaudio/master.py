"""Mastering: HPF, linked glue compression, optional tape warmth / tilt, true-peak lookahead limiter,
loudness normalisation to target LUFS (pyloudnorm, BS.1770-4) with an oversampled true-peak ceiling,
fades, 24-bit export at exact length."""
from __future__ import annotations

import numpy as np
from scipy.ndimage import minimum_filter1d, uniform_filter1d
from scipy.signal import resample_poly

from .core import SR, ns, amp, db, to_stereo, as_array, fade, fit
from . import filters as F
from . import fx as FX
from . import _dsp


def lufs(x):
    import pyloudnorm as pyln
    x = to_stereo(as_array(x))
    try:
        L = pyln.Meter(SR).integrated_loudness(x.T)
    except Exception:
        return -120.0
    return float(L) if np.isfinite(L) else -120.0


def true_peak(x, os=8):
    """True peak in dBTP: ideal band-limited (FFT) `os`x interpolation - the strictest reading, >= any
    BS.1770 4x meter (ffmpeg ebur128 etc.).  (A plain 4x polyphase estimate under-reads by up to ~0.8 dB on
    masters with energy near Nyquist, which is how a '-1.25 dBTP' file could really peak at -0.5.)"""
    from scipy.fft import next_fast_len
    from scipy.signal import resample
    x = to_stereo(as_array(x))
    n = x.shape[1]
    if n == 0:
        return -120.0
    pad = 256
    m = next_fast_len(n + 2 * pad)
    xp = np.zeros((2, m))
    xp[:, pad:pad + n] = x
    up = resample(xp, m * os, axis=1)
    return float(db(max(np.max(np.abs(up)), np.max(np.abs(x)))))


def _fir_lp(x, hz=20000.0, taps=255):
    """Linear-phase (zero-delay) FIR low-pass - removes the inaudible 20-24 kHz band that makes inter-sample
    peaks unpredictable for the limiter."""
    from scipy.signal import firwin, fftconvolve
    if hz is None or hz >= SR / 2 - 500:
        return x
    h = firwin(taps, hz, width=min(2500.0, SR / 2 - hz), fs=SR)
    return fftconvolve(x, h[None, :], mode='same', axes=1)


def _tp_env(x, os=4):
    n = x.shape[1]
    up = resample_poly(x, os, 1, axis=1)
    p = np.max(np.abs(up), axis=0)
    m = (p.shape[0] // os) * os
    pe = p[:m].reshape(-1, os).max(axis=1)
    pe = fit(pe, n)
    # neighbouring samples' inter-sample peaks also matter
    pe = np.maximum(pe, np.maximum(np.roll(pe, 1), np.roll(pe, -1)))
    return np.maximum(pe, np.max(np.abs(x), axis=0))


def limiter(x, ceiling_db=-1.2, lookahead=0.004, release=0.09, os=4):
    """Transparent lookahead brick-wall limiter using oversampled peak detection (offline, zero-latency)."""
    x = to_stereo(as_array(x))
    c = amp(ceiling_db)
    p = _tp_env(x, os)
    greq = np.minimum(1.0, c / np.maximum(p, 1e-12))
    if greq.min() >= 1.0:
        return x
    L = max(2, ns(lookahead))
    h = minimum_filter1d(greq, size=2 * L + 1, mode='nearest')
    rel = 1.0 - np.exp(-1.0 / (release * SR))
    g = _dsp.limiter_smooth(h, float(L) / 2.0, rel)
    g = uniform_filter1d(g, size=L + 1, mode='nearest')
    g = np.minimum(g, h)
    return x * g


def glue(x, ratio=2.0, attack=0.02, release=0.16, knee=6.0, target_gr=2.0):
    """Adaptive bus compressor: threshold set so loud passages get ~target_gr dB of gain reduction."""
    x = to_stereo(as_array(x))
    m = np.max(np.abs(x), axis=0)
    w = ns(0.05)
    env = np.sqrt(np.maximum(uniform_filter1d(m ** 2, w), 0.0))
    active = env[env > amp(-50)]
    if active.size < w:
        return x
    p90 = db(np.percentile(active, 92))
    thr = p90 - target_gr * ratio / (ratio - 1)
    return FX.compress(x, thr, ratio, attack, release, knee, rms_ms=5)


def master(x, lufs=-14.0, tp=-1.0, hp=28.0, glue_comp=True, glue_ratio=2.0, glue_gr=1.5, warmth=0.0,
           tilt=0.0, air=0.0, width=None, fade_in=0.004, fade_out=0.25, iterations=6, mono_bass=120.0, lp=20000.0):
    """Master a stereo pre-mix. Returns (y, info).  lufs: integrated target; tp: true-peak ceiling dBTP
    (guaranteed on the ideal band-limited reading, see true_peak).  warmth: tape saturation drive dB (0 = off).
    tilt: dB/oct around 1 kHz. air: high-shelf dB @ 10 kHz.  lp: linear-phase brick-wall above lp Hz (None = off)."""
    x = np.nan_to_num(to_stereo(as_array(x)).astype(np.float64))
    n = x.shape[1]
    y = F.hpf(x, hp, 4)
    y = y - np.mean(y, axis=1, keepdims=True)
    if mono_bass:
        lo = F.lpf(y, mono_bass, 4)
        m = 0.5 * (lo[0] + lo[1])
        y = y - lo + np.stack([m, m])
    if tilt:
        y = F.tilt(y, tilt)
    if air:
        y = F.high_shelf(y, 10000, air)
    if width is not None:
        from .core import width as _w
        y = _w(y, width)
    if glue_comp:
        y = glue(y, glue_ratio, target_gr=glue_gr)
    if warmth:
        y = FX.saturate(y, warmth, 'tape')
    y = _fir_lp(y, lp)
    y = fade(y, fade_in, fade_out)
    target = lufs
    L0 = measure_lufs(y)
    if L0 <= -70:
        return y, {'lufs': L0, 'true_peak': true_peak(y), 'gain_db': 0.0, 'gr_db': 0.0}
    g = target - L0
    ceil = tp - 0.25
    z = y
    for _attempt in range(3):
        for _ in range(iterations):
            z = limiter(y * amp(g), ceiling_db=ceil)
            L = measure_lufs(z)
            if abs(L - target) < 0.08:
                break
            g += (target - L)
        # the limiter detects peaks at 4x; verify on the ideal reading and tighten the ceiling if needed
        tpk = true_peak(z)
        if tpk <= tp - 0.1:
            break
        ceil -= (tpk - (tp - 0.15))
    # final safety
    tpk = true_peak(z)
    if tpk > tp - 0.05:
        z = z * amp(tp - 0.1 - tpk)
    z = fit(z, n)
    info = {'lufs': measure_lufs(z), 'true_peak': true_peak(z), 'gain_db': float(g),
            'limiter_gr_db': float(db(np.max(np.abs(y * amp(g)))) - db(np.max(np.abs(z)) + 1e-12))}
    return z.astype(np.float32), info


measure_lufs = lufs


def write(path, y, subtype='PCM_24'):
    import os
    import soundfile as sf
    y = to_stereo(as_array(y))
    d = os.path.dirname(os.path.abspath(path))
    os.makedirs(d, exist_ok=True)
    sf.write(path, np.clip(y.T, -1.0, 1.0).astype(np.float32), SR, subtype=subtype)
    return path


def normalize_file(path_in, path_out=None, lufs=-14.0, tp=-1.0, duration=None):
    """Master an existing WAV (e.g. a stem you built manually) to target loudness; optional exact duration."""
    import soundfile as sf
    x, sr = sf.read(path_in, always_2d=True)
    x = x.T
    if sr != SR:
        from math import gcd
        g = gcd(SR, sr)
        x = resample_poly(x, SR // g, sr // g, axis=1)
    if duration is not None:
        x = fit(x, ns(duration))
    y, info = master(x, lufs=lufs, tp=tp)
    write(path_out or path_in, y)
    return info
