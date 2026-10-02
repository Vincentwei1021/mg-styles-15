"""R2 (REVIEW_2 P1) post-master hit maximiser: make the BOOM the loudest 200 ms of the film on full range AND
on a phone band, without breaking -14 LUFS / TP <= -1.5.

Why a post-master stage: the master's lookahead limiter caps the hit's peak, so a hit whose energy is mostly
sub (crest ~10 dB) can never out-RMS a dense xylophone note at the same integrated loudness. Here, only inside
the BOOM window (6.49-6.95 s, smooth fades), the mastered signal gets (1) a zero-phase 0.7-4.5 kHz lift (the
'crack' that a phone reproduces), (2) drive into an oversampled tanh clipper (dense harmonics, crest -> ~5 dB).
A few competing phone-band moments are dipped 1-2 dB. Then LUFS is re-trimmed and a true-peak limiter runs.

    python3 tools/hitmax.py out/audio_premax.wav out/audio.wav
"""
import os
import sys
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfiltfilt, sosfilt, resample_poly

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'lib', 'audio'))
from mgaudio import master as MS  # noqa: E402

E = lambda k, d: float(os.environ.get(k, d))
B = 6.494              # BOOM onset in the mastered file (hit_alignment reads 6.494)
DRIVE = E('HM_DRIVE', 4.0)      # dB into the clipper at the hit
MIDK = E('HM_MIDK', 1.0)        # linear amount of 0.7-4.5 kHz band added
CEIL = E('HM_CEIL', -2.6)       # clipper ceiling (dBFS) before the final TP limiter
HOLD = E('HM_HOLD', 0.17)       # full drive until B+HOLD, then cosine release
REL = E('HM_REL', 0.30)         # release length (s)
DIPS = [(3.84, 4.10, E('HM_DIP1', -1.5)), (4.44, 4.76, E('HM_DIP2', -1.5)), (8.44, 8.98, E('HM_DIP3', -1.5)),
        (5.18, 5.50, E('HM_DIP4', -1.0))]


def ramp(t, a, b, fade):
    return np.clip(np.minimum((t - a) / fade + 1, (b - t) / fade + 1), 0, 1) if fade > 0 else ((t >= a) & (t < b)) * 1.0


def process(x, sr):
    n = x.shape[1]
    t = np.arange(n) / sr
    # region weight: 3 ms attack just before the onset, hold, cosine release
    w = np.clip((t - (B - 0.004)) / 0.003, 0, 1)
    r = np.clip((t - (B + HOLD)) / REL, 0, 1)
    w = w * (0.5 + 0.5 * np.cos(np.pi * r))
    # (1) phone-band crack lift (zero phase so transients do not smear)
    sos = butter(2, [700, 4500], 'bandpass', fs=sr, output='sos')
    mid = sosfiltfilt(sos, x, axis=1)
    xe = x + (MIDK * w) * mid
    # (2) drive + oversampled soft clip
    g = 10 ** (DRIVE * w / 20)
    xd = xe * g
    up = resample_poly(xd, 4, 1, axis=1)
    c = 10 ** (CEIL / 20)
    up = c * np.tanh(up / c)
    xc = resample_poly(up, 1, 4, axis=1)[:, :n]
    wb = np.clip(w * 4, 0, 1)            # blend: clipped signal only where the drive is active
    y = x * (1 - wb) + xc * wb
    # (3) dips on competing moments (broadband, 25 ms ramps)
    env_db = np.zeros(n)
    for a, b, d in DIPS:
        env_db += d * ramp(t, a, b, 0.025)
    y = y * 10 ** (env_db / 20)
    return y


def finish(y, lufs=-14.0, tp=-1.6):
    for _ in range(3):
        y = y * 10 ** ((lufs - MS.lufs(y)) / 20)
        y = MS.limiter(y, ceiling_db=tp - 0.15)
    return y


def windows(y, sr):
    ph = sosfilt(butter(4, 9000, 'lp', fs=sr, output='sos'), sosfilt(butter(4, 350, 'hp', fs=sr, output='sos'), y, axis=1), axis=1)
    out = {}
    for nm, s in (('FULL', y), ('PHONE', ph)):
        ws = [(round(a, 2), 20 * np.log10(np.sqrt(np.mean(s[:, int(a * sr):int((a + 0.2) * sr)] ** 2)) + 1e-12)) for a in np.arange(0, 9.81, 0.05)]
        bm = [v for a, v in ws if abs(a - 6.5) < 1e-6][0]
        bmax = max(v for a, v in ws if 6.45 <= a <= 6.60)
        oth = sorted([(a, round(v, 1)) for a, v in ws if a < 6.30 or a >= 6.80], key=lambda q: -q[1])[:5]
        out[nm] = (round(bm, 1), round(bmax, 1), round(bmax - oth[0][1], 1), oth)
    return out


if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    x, sr = sf.read(src, always_2d=True)
    x = x.T
    y = finish(process(x, sr))
    MS.write(dst, y)
    print('hitmax: LUFS %.2f  TP %.2f' % (MS.lufs(y), MS.true_peak(y)))
    for k, v in windows(y, sr).items():
        print(f'  {k}: BOOM(6.50-6.70) {v[0]}  max {v[1]}  margin {v[2]:+.1f} dB  others {v[3]}')
