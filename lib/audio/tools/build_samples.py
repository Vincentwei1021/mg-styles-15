"""Convert the downloaded VCSL subset (/tmp/vcsl_raw) into trimmed 48 kHz FLACs + index.json.

python3 tools/build_samples.py /tmp/vcsl_raw
"""
import json
import os
import re
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'samples')
PITCHED = {'dantranh', 'piano', 'harp', 'glock', 'marimba', 'kalimba', 'vibraphone', 'tubularbells',
           'wineglass'}
MAXDUR = {'piano': 9.0, 'dantranh': 8.0, 'gong': 14.0, 'gong2': 10.0, 'tubularbells': 9.0, 'vibraphone': 7.0,
          'harp': 7.0, 'suscymbal': 9.0, 'crash': 7.0, 'marktree': 9.0, 'wineglass': 7.0, 'oceandrum': 8.0,
          'timpani': 6.0, 'bassdrum2': 6.0, 'glock': 5.0}
NOTE_RX = re.compile(r'(?<![A-Za-z])([A-Ga-g][#b]?)(-?\d)(?![\d])')
_PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def name_midi(fn):
    m = NOTE_RX.search(fn)
    if not m:
        return None
    n = m.group(1)
    v = _PC[n[0].upper()] + (1 if '#' in n else -1 if (len(n) > 1 and n[1] == 'b') else 0)
    return v + 12 * (int(m.group(2)) + 1)


def process(args):
    key, path = args
    try:
        x, sr = sf.read(path, always_2d=True, dtype='float64')
    except Exception as e:
        return None
    x = x.T
    if sr != 48000:
        from math import gcd
        g = gcd(48000, sr)
        x = resample_poly(x, 48000 // g, sr // g, axis=1)
    x = x - np.mean(x, axis=1, keepdims=True) * 0  # keep DC handling to the engine
    mono = np.max(np.abs(x), axis=0)
    pk = float(mono.max())
    if pk < 1e-6:
        return None
    # onset trim: first sample above -50 dB rel peak, back off 1.5 ms
    idx = np.argmax(mono > pk * 10 ** (-50 / 20))
    idx = max(0, idx - 72)
    x = x[:, idx:]
    mono = mono[idx:]
    # tail trim at -66 dB rel peak (smoothed)
    k = 2400
    env = np.convolve(mono, np.ones(k) / k, mode='same')
    above = np.where(env > pk * 10 ** (-66 / 20))[0]
    end = int(above[-1]) + k if above.size else x.shape[1]
    end = min(end, x.shape[1], int(MAXDUR.get(key, 5.0) * 48000))
    x = x[:, :end]
    fo = min(int(0.08 * 48000), x.shape[1] // 4)
    if fo > 0:
        x[:, -fo:] *= np.linspace(1, 0, fo) ** 2
    # stereo -> keep; collapse near-mono stereo to mono
    if x.shape[0] == 2:
        d = np.sqrt(np.mean((x[0] - x[1]) ** 2)) / (np.sqrt(np.mean(x ** 2)) + 1e-12)
        if d < 0.05:
            x = x.mean(axis=0, keepdims=True)
    fn = os.path.splitext(os.path.basename(path))[0]
    safe = re.sub(r'[^A-Za-z0-9_#\-]+', '_', fn)
    outdir = os.path.join(ROOT, key)
    os.makedirs(outdir, exist_ok=True)
    out = os.path.join(outdir, safe + '.flac')
    sf.write(out, x.T.astype(np.float32), 48000, subtype='PCM_24')
    info = {'file': f'{key}/{safe}.flac', 'name': fn, 'dur': round(x.shape[1] / 48000, 3),
            'peak': round(float(np.max(np.abs(x))), 5), 'rms': round(float(np.sqrt(np.mean(x ** 2))), 6),
            'ch': int(x.shape[0])}
    nm = name_midi(fn)
    info['name_midi'] = nm
    if key in PITCHED:
        import librosa
        seg = x.mean(axis=0)[int(0.05 * 48000):int(1.2 * 48000)]
        try:
            f0, vf, vp = librosa.pyin(seg, fmin=40, fmax=4200, sr=48000, frame_length=4096, hop_length=512)
            f0 = f0[vf & np.isfinite(f0)]
            if f0.size >= 3:
                m = 69 + 12 * np.log2(np.median(f0) / 440)
                info['detected_midi'] = round(float(m), 3)
        except Exception:
            pass
    return info


def main(raw):
    jobs = []
    for key in sorted(os.listdir(raw)):
        d = os.path.join(raw, key)
        if not os.path.isdir(d):
            continue
        for f in sorted(os.listdir(d)):
            if f.lower().endswith(('.wav', '.mp3', '.flac')):
                jobs.append((key, os.path.join(d, f)))
    with ProcessPoolExecutor(8) as ex:
        res = list(ex.map(process, jobs, chunksize=4))
    index = {}
    for (key, _), r in zip(jobs, res):
        if r:
            index.setdefault(key, []).append(r)
    # resolve MIDI per pitched instrument: octave offset between name & detection
    for key, items in index.items():
        if key not in PITCHED:
            continue
        diffs = [it['detected_midi'] - it['name_midi'] for it in items
                 if it.get('name_midi') is not None and it.get('detected_midi') is not None]
        off = 0
        if diffs:
            off = int(12 * round(np.median(diffs) / 12))
        for it in items:
            nm = it.get('name_midi')
            if nm is None:
                it['midi'] = it.get('detected_midi')
                continue
            base = nm + off
            det = it.get('detected_midi')
            # fine tuning from detection if it agrees within a semitone
            if det is not None and abs(det - base) < 0.9:
                it['midi'] = round(float(det), 3)
            else:
                it['midi'] = float(base)
        print(key, 'octave offset', off, 'n', len(items))
    with open(os.path.join(ROOT, 'index.json'), 'w') as f:
        json.dump(index, f, indent=1)
    tot = sum(os.path.getsize(os.path.join(dp, fn)) for dp, _, fns in os.walk(ROOT) for fn in fns)
    print('samples dir size MB', tot / 1e6)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '/tmp/vcsl_raw')
