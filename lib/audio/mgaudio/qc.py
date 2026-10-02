"""QC helpers: analyze(wav) -> dict, spectrogram(wav, png), check_duration(wav), hit_alignment(wav, hits).

CLI:  python3 -m mgaudio.qc out/audio.wav [--png out/audio_spec.png] [--hits 1.2,3.4] [--dur 10]
"""
from __future__ import annotations

import json
import os
import sys

import numpy as np

from .core import SR, as_array, to_stereo, db, Sound

# bands for spectral balance (Hz)
BANDS = [('sub', 20, 60), ('bass', 60, 250), ('lowmid', 250, 2000), ('presence', 2000, 5000),
         ('brilliance', 5000, 12000), ('air', 12000, 20000)]
# warning thresholds on the share of total energy (%), calibrated on commercial masters
# Reference (modern pop master, 1/3-oct slope ~-2.7 dB/oct): sub ~30, bass ~48, lowmid ~18, presence ~2,
# brilliance ~0.7, air ~0.1 (%).  Warnings fire well outside that.
LIMITS = {'sub_max': 45.0, 'presence_max': 7.5, 'bright_min': 0.2, 'lowend_min': 18.0}


def _load(src):
    """path | Sound | ndarray -> (2, n) float64 at SR."""
    if isinstance(src, (str, os.PathLike)):
        import soundfile as sf
        x, sr = sf.read(str(src), always_2d=True, dtype='float64')
        x = x.T
        if sr != SR:
            from scipy.signal import resample_poly
            from math import gcd
            g = gcd(SR, sr)
            x = resample_poly(x, SR // g, sr // g, axis=1)
        return to_stereo(x), sr
    return to_stereo(as_array(src)), SR


def _momentary(x, win=0.4, hop=0.05):
    """Momentary loudness-ish curve (K-weighted RMS dB, 400 ms windows)."""
    from .filters import sos_filter, highshelf_sos, highpass_sos
    k = sos_filter(x, highshelf_sos(1500, 4.0, 0.7))
    k = sos_filter(k, highpass_sos(38, 2))
    p = np.mean(k ** 2, axis=0)
    w, h = int(win * SR), int(hop * SR)
    c = np.concatenate([[0.0], np.cumsum(p)])
    starts = np.arange(0, max(1, p.shape[0] - w + 1), h)
    ms = (c[np.minimum(starts + w, p.shape[0])] - c[starts]) / w
    return starts / SR + win / 2, -0.691 + 10 * np.log10(ms + 1e-20)


def detect_onsets(src, delta=0.07, refine=True):
    """Onset times (s).  librosa spectral-flux peaks (hop 256 @ 22.05 kHz), each refined to the steepest rise of a
    1 ms-resolution energy envelope within [-60 ms, +10 ms] - accurate to ~2-5 ms on drum/SFX transients
    (plain librosa peaks read 20-40 ms late)."""
    import librosa
    x, _ = _load(src)
    m = 0.5 * (x[0] + x[1])
    y22 = librosa.resample(m.astype(np.float32), orig_sr=SR, target_sr=22050)
    env = librosa.onset.onset_strength(y=y22, sr=22050, hop_length=256)
    on = librosa.onset.onset_detect(onset_envelope=env, sr=22050, hop_length=256, units='time', delta=delta)
    if not refine or len(on) == 0:
        return [round(float(v), 4) for v in on]
    from .filters import hpf
    hop = SR // 1000
    w = 2 * hop
    p = hpf(m, 40) ** 2
    c = np.concatenate([[0.0], np.cumsum(p)])
    idx = np.arange(0, p.shape[0] - w, hop)
    e = 10 * np.log10((c[idx + w] - c[idx]) / w + 1e-12)
    de = np.diff(e, prepend=e[0])
    out = []
    for o in on:
        a = max(0, int((o - 0.06) * 1000))
        b = min(len(de), int((o + 0.01) * 1000) + 1)
        if b - a < 3:
            out.append(float(o))
            continue
        k = a + int(np.argmax(de[a:b]))
        out.append(round(max(0.0, k / 1000.0), 4))
    return sorted(set(out))


def analyze(src, expected=10.0, onsets=True, verbose=False):
    """Loudness / peak / spectral / timing report of a WAV path, Sound or array.

    Returns dict: duration, samples, sr, lufs, true_peak, sample_peak, rms_db, crest_db, dc, nonfinite,
    clipped, bands (% energy per band), band_db, stereo_corr, side_ratio_db, longest_gap (s below -45 LUFS
    momentary, excluding first/last 0.3 s), onsets (s), warnings (list of str)."""
    from .master import lufs as _lufs, true_peak as _tp
    x, sr_file = _load(src)
    n = x.shape[1]
    res = {'duration': n / SR, 'samples': int(n), 'sr': int(sr_file)}
    fin = np.isfinite(x)
    res['nonfinite'] = int((~fin).sum())
    x = np.nan_to_num(x)
    res['lufs'] = round(_lufs(x), 2)
    res['true_peak'] = round(_tp(x), 2)
    res['sample_peak'] = round(float(db(np.max(np.abs(x)) + 1e-12)), 2)
    r = float(np.sqrt(np.mean(x ** 2)) + 1e-12)
    res['rms_db'] = round(float(db(r)), 2)
    res['crest_db'] = round(res['sample_peak'] - res['rms_db'], 2)
    res['dc'] = [round(float(v), 6) for v in np.mean(x, axis=1)]
    res['clipped'] = int(np.sum(np.abs(x) >= 0.9999))
    # spectral balance (Welch PSD of mid)
    from scipy.signal import welch
    m = 0.5 * (x[0] + x[1])
    f, P = welch(m, SR, nperseg=8192)
    tot = np.sum(P[(f >= 20) & (f <= 20000)]) + 1e-30
    bands, bdb = {}, {}
    for name, lo, hi in BANDS:
        e = np.sum(P[(f >= lo) & (f < hi)])
        bands[name] = round(100 * e / tot, 2)
        bdb[name] = round(10 * np.log10(e / tot + 1e-20), 1)
    res['bands'] = bands
    res['band_db'] = bdb
    # stereo
    if np.std(x[0]) > 1e-9 and np.std(x[1]) > 1e-9:
        res['stereo_corr'] = round(float(np.corrcoef(x[0], x[1])[0, 1]), 3)
    else:
        res['stereo_corr'] = 1.0
    s = 0.5 * (x[0] - x[1])
    res['side_ratio_db'] = round(float(db(np.sqrt(np.mean(s ** 2)) + 1e-12) - db(np.sqrt(np.mean(m ** 2)) + 1e-12)), 1)
    # gaps
    tt, mom = _momentary(x)
    sel = (tt > 0.3) & (tt < res['duration'] - 0.3)
    gap = 0.0
    run = 0.0
    for q in mom[sel]:
        run = run + 0.05 if q < -45 else 0.0
        gap = max(gap, run)
    res['longest_gap'] = round(gap, 2)
    res['momentary_max'] = round(float(mom.max()), 2) if mom.size else -120
    if onsets:
        try:
            res['onsets'] = detect_onsets(x)
        except Exception as e:  # pragma: no cover
            res['onsets'] = []
            res['onset_error'] = str(e)
    # warnings
    w = []
    if expected is not None and abs(n - round(expected * SR)) > 0:
        w.append(f'duration {n / SR:.4f}s != {expected:.3f}s')
    if res['nonfinite']:
        w.append('NaN/Inf samples')
    if abs(res['lufs'] + 14) > 0.6:
        w.append(f"LUFS {res['lufs']} (target -14)")
    if res['true_peak'] > -1.0:
        w.append(f"true peak {res['true_peak']} dBTP > -1")
    if max(abs(v) for v in res['dc']) > 0.002:
        w.append(f"DC offset {res['dc']}")
    if res['clipped']:
        w.append(f"{res['clipped']} clipped samples")
    if bands['sub'] > LIMITS['sub_max']:
        w.append(f"too much sub (<60 Hz = {bands['sub']}% of energy)")
    if bands['presence'] > LIMITS['presence_max']:
        w.append(f"harsh 2-5 kHz ({bands['presence']}% of energy)")
    if bands['brilliance'] + bands['air'] < LIMITS['bright_min']:
        w.append('dull (almost nothing above 5 kHz)')
    if bands['sub'] + bands['bass'] < LIMITS['lowend_min']:
        w.append('thin low end (<250 Hz)')
    if res['stereo_corr'] < 0.0:
        w.append(f"phase problem (L/R correlation {res['stereo_corr']})")
    if gap > 0.6:
        w.append(f'silence gap {gap:.2f}s')
    res['warnings'] = w
    if verbose:
        print(summary(res))
    return res


def summary(res):
    b = res['bands']
    return (f"{res['duration']:.3f}s  LUFS {res['lufs']:.2f}  TP {res['true_peak']:.2f}  crest {res['crest_db']:.1f}dB  "
            f"bands% sub {b['sub']:.0f} bass {b['bass']:.0f} lmid {b['lowmid']:.0f} pres {b['presence']:.1f} "
            f"brill {b['brilliance']:.1f} air {b['air']:.2f}  corr {res['stereo_corr']:.2f}"
            + (f"  WARN: {'; '.join(res['warnings'])}" if res['warnings'] else '  OK'))


def check_duration(src, dur=10.0):
    """True if the file/buffer is exactly `dur` seconds (sample-exact at 48 kHz). Raises AssertionError otherwise."""
    x, _ = _load(src)
    want = int(round(dur * SR))
    assert x.shape[1] == want, f'duration {x.shape[1]} samples ({x.shape[1] / SR:.4f}s) != {want} ({dur}s)'
    return True


def hit_alignment(src, hits, tol=0.04):
    """For each visual hit time, the nearest detected audio onset and the error (s).
    Returns list of dicts {hit, onset, err, ok}.  Onsets are librosa estimates (~±12 ms)."""
    res = analyze(src, expected=None, onsets=True)
    on = np.asarray(res['onsets'])
    out = []
    for h in hits:
        if on.size == 0:
            out.append({'hit': h, 'onset': None, 'err': None, 'ok': False})
            continue
        k = int(np.argmin(np.abs(on - h)))
        e = float(on[k] - h)
        out.append({'hit': round(float(h), 3), 'onset': float(on[k]), 'err': round(e, 3), 'ok': abs(e) <= tol})
    return out


def spectrogram(src, png, title=None, marks=None, sections=None, fmax=20000):
    """Save a log-frequency spectrogram PNG (with waveform envelope, onsets, optional hit marks
    [t...] and sections {'drop': 4.0, ...}).  Read it with an image viewer to check structure."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from scipy.signal import stft
    x, _ = _load(src)
    m = 0.5 * (x[0] + x[1])
    dur = m.shape[0] / SR
    f, t, Z = stft(m, SR, nperseg=2048, noverlap=2048 - 256)
    S = 20 * np.log10(np.abs(Z) + 1e-9)
    S -= S.max()
    fig, (a0, a1) = plt.subplots(2, 1, figsize=(16, 8), gridspec_kw={'height_ratios': [1, 4]}, sharex=True)
    # envelope (L/R peak per 10 ms)
    hop = int(0.01 * SR)
    k = x.shape[1] // hop
    env = np.abs(x[:, :k * hop]).reshape(2, k, hop).max(axis=2)
    te = (np.arange(k) + 0.5) * hop / SR
    a0.fill_between(te, env[0], -env[1], color='#3a7bd5', lw=0)
    a0.set_ylim(-1, 1)
    a0.set_yticks([])
    tt, mom = _momentary(x)
    a0b = a0.twinx()
    a0b.plot(tt, mom, color='#e67e22', lw=1)
    a0b.set_ylim(-50, 0)
    a0b.set_ylabel('LUFS-M')
    fm = f[1:]
    a1.pcolormesh(t, fm, S[1:], shading='auto', cmap='magma', vmin=-90, vmax=0)
    a1.set_yscale('log')
    a1.set_ylim(30, fmax)
    a1.set_yticks([50, 100, 250, 500, 1000, 2000, 5000, 10000, 20000])
    a1.set_yticklabels(['50', '100', '250', '500', '1k', '2k', '5k', '10k', '20k'])
    a1.set_xlim(0, dur)
    a1.set_xticks(np.arange(0, dur + 1e-6, 0.5))
    a1.set_xlabel('seconds')
    a1.grid(axis='x', color='w', alpha=0.15)
    try:
        for o in detect_onsets(x):
            a0.axvline(o, color='w', lw=0.5, alpha=0.6)
    except Exception:
        pass
    for h in (marks or []):
        a1.axvline(h, color='#2ecc71', lw=1.2, ls='--', alpha=0.9)
        a0.axvline(h, color='#2ecc71', lw=1.2, ls='--')
    for name, tv in (sections or {}).items():
        a1.axvline(tv, color='#00d2ff', lw=1.5, alpha=0.9)
        a1.text(tv + 0.03, 22000 if fmax >= 20000 else fmax * 0.9, name, color='#00d2ff', fontsize=9, va='top')
    if title is None and isinstance(src, (str, os.PathLike)):
        title = os.path.basename(str(src))
    try:
        r = analyze(x, expected=None, onsets=False)
        title = f"{title or ''}   LUFS {r['lufs']:.1f}  TP {r['true_peak']:.1f}  " \
                f"sub {r['bands']['sub']:.0f}% pres {r['bands']['presence']:.1f}%"
    except Exception:
        pass
    a0.set_title(title or '')
    fig.tight_layout()
    os.makedirs(os.path.dirname(os.path.abspath(png)), exist_ok=True)
    fig.savefig(png, dpi=80)
    plt.close(fig)
    return png


def sheet(sounds, png, cols=6, dur=None, title=None):
    """Contact sheet of small spectrograms for a dict {name: Sound|array|path} (SFX design review).
    Each tile shows log-frequency spectrogram (50 Hz-20 kHz), the sync point (green) and the peak level."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from scipy.signal import stft
    names = list(sounds)
    rows = int(np.ceil(len(names) / cols))
    fig, axes = plt.subplots(rows, cols, figsize=(3.2 * cols, 2.1 * rows), squeeze=False)
    for ax in axes.ravel():
        ax.axis('off')
    for i, k in enumerate(names):
        ax = axes.ravel()[i]
        s = sounds[k]
        sync = s.sync if isinstance(s, Sound) else 0.0
        x, _ = _load(s)
        m = 0.5 * (x[0] + x[1])
        if dur:
            m = m[:int(dur * SR)]
        f, t, Z = stft(m, SR, nperseg=1024, noverlap=1024 - 128)
        S = 20 * np.log10(np.abs(Z) + 1e-9)
        ax.pcolormesh(t, f[1:], S[1:], shading='auto', cmap='magma', vmin=S.max() - 80, vmax=S.max())
        ax.set_yscale('log')
        ax.set_ylim(50, 20000)
        if sync:
            ax.axvline(sync, color='#2ecc71', lw=1)
        ax.set_title(f"{k}  {db(np.max(np.abs(x)) + 1e-12):.0f}dB", fontsize=8)
        ax.axis('on')
        ax.set_yticks([])
        ax.tick_params(labelsize=6)
    if title:
        fig.suptitle(title)
    fig.tight_layout()
    fig.savefig(png, dpi=70)
    plt.close(fig)
    return png


def main(argv=None):
    import argparse
    ap = argparse.ArgumentParser(description='mgaudio QC')
    ap.add_argument('wav')
    ap.add_argument('--png')
    ap.add_argument('--hits', default='')
    ap.add_argument('--dur', type=float, default=10.0)
    a = ap.parse_args(argv)
    res = analyze(a.wav, expected=a.dur)
    print(summary(res))
    hits = [float(v) for v in a.hits.split(',') if v.strip()]
    if hits:
        for row in hit_alignment(a.wav, hits):
            print(row)
    if a.png:
        spectrogram(a.wav, a.png, marks=hits)
        print('spectrogram ->', a.png)
    print(json.dumps({k: v for k, v in res.items() if k != 'onsets'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
