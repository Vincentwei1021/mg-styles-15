"""NEON DRIVE - soundtrack (refinement round 2). Reads cues.json; writes out/audio.wav (48k stereo, 10.000 s, -14 LUFS)."""
import sys, json, os
import numpy as np
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
sys.path.insert(0, ROOT + '/lib/audio')
import mgaudio as mg
from mgaudio import recipes, sfx, drums, synth, osc as O, filters as F
from mgaudio.core import as_array
HERE = os.path.dirname(os.path.abspath(__file__))
C = json.load(open(os.path.join(HERE, 'cues.json')))
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
SR = 48000
T = lambda d: np.arange(int(round(d * SR))) / SR
ramp = lambda t, pts: np.interp(t, [p[0] for p in pts], [p[1] for p in pts])
norm = lambda y, pk=.9: y * (pk / (np.max(np.abs(y)) + 1e-9))

m = recipes.synthwave(bpm=C['bpm'], key=C['key'], mode=C['mode'], drop=C['slam'], build=C['build'], outro=C['outro'])
f = m.form
print(f.summary()); print('tracks:', list(m.tracks))
mus = m.group('music')
mus.region('filter', 0.0, C['track_lock'] + 0.15, hz=[(0.0, 700), (C['track_lock'], 2400), (C['track_lock'] + 0.15, 16000)], mode='lp')
mus.region('stutter', C['tape_rewind'][0], C['music_gap'][0] - C['tape_rewind'][0], slice=1 / 15, pitch_step=-1)
mus.region('mute', C['music_gap'][0], C['music_gap'][1] - C['music_gap'][0])
if 'lead' in m.tracks:                       # lead enters on the neon strike (hero)
    m['lead'].region('mute', C['slam'], C['ignite'] - C['slam'] - 0.02)
m.tape_stop(C['stop'], dur=C['crt_off'][1] - C['stop'])      # the deck stops: the music winds down with the tape
for tc, l in C['neon_strike']:                               # the strike is audibly ON/OFF: the whole band drops out on the OFF frames
    if l < .2: mus.region('mute', tc, 1 / 30)

S = m.sfx
ig, S0, ST = C['ignite'], C['slam'], C['stop']
S(sfx.vhs_noise(1.35), at=0.0, gain=-3)
S(sfx.crt_on(), at=0.02, gain=-7)
S(sfx.head_switch(), at=C['track_lock'], gain=-1)
S(sfx.static(0.9, 'tv'), at=0.05, gain=-12)
for i, (tp, side) in enumerate(zip(C['palm_pass'], C['palm_side'])):
    S(sfx.whoosh(0.55, 'air', direction=side, seed=i), at=tp, gain=-5 if tp < S0 else -11, pan=0.55 * side)
for i, g in enumerate(C['glitches']):
    S(sfx.glitch(0.07, 'digital', seed=i), at=g, gain=-11 if g > S0 else -8)
S(sfx.glitch(0.3, 'stutter', seed=7), at=C['tape_rewind'][0], gain=-7)
lc0, lc1 = C['lane_change']                                  # lane change: swerve whoosh + a short tyre chirp
S(sfx.whoosh(lc1 - lc0 + .15, 'air', direction=-1, peak=.45, seed=51), at=lc0, gain=-6, pan=-0.35)
u = T(.16); chirp = F.bpf(np.random.default_rng(52).standard_normal(len(u)), 1400, 3800) * np.exp(-u / .05) * (1 - np.exp(-u * 400))
S(norm(chirp), at=lc0 + .04, gain=-19, pan=-0.2)
# --- oncoming near-miss (cues.oncoming): a head-on car's horn (A + C, the key's minor third) with real doppler + pass-by air
def _spd(t):
    return np.where(t < 1.0, 18 + 4 * t, np.where(t < 2.0, 22 + 26 * (lambda k: k * k * (3 - 2 * k))(np.clip(t - 1, 0, 1)), 48.0))
ON = C['oncoming']; tpass = ON['pass']; hs, he = 1.70, 2.62
u = T(he - hs); tt = hs + u
ahead = np.cumsum(_spd(tt[::-1]) + ON['v'])[::-1] / SR * -1 + 0.0     # metres ahead of the camera, 0 at tpass (integrated closing speed)
ahead = ahead - np.interp(tpass, tt, ahead); ahead = -ahead
b = 1.9; r = np.sqrt(ahead ** 2 + b ** 2); vrad = (_spd(tt) + ON['v']) * ahead / r
dop = 343.0 / (343.0 - vrad)
env = np.clip((tt - 1.74) / .02, 0, 1) * np.clip((2.40 - tt) / .06, 0, 1) * (1 / np.maximum(r, 1.6)) * (1 + .06 * np.sin(2 * np.pi * 23 * u))
horn = sum(np.tanh(1.6 * O.saw(f0 * dop * (1 + dt))) for f0 in (440.0, 523.25) for dt in (0, .004))
horn = F.bpf(horn, 260, 3600) * env
ramble = F.lpf(np.random.default_rng(81).standard_normal(len(u)), 900) * (1 / np.maximum(r, 1.2)) * .8     # tyre/engine rush
pn = np.clip(1.35 * b / r, 0, .85) * np.where(ahead < 0, 1, .7)
mono_onc = horn + ramble; LR = np.stack([mono_onc * np.sqrt((1 - pn) / 2) * 1.414, mono_onc * np.sqrt((1 + pn) / 2) * 1.414])
S(norm(LR), at=hs, gain=-8)
S(sfx.whoosh(0.5, 'heavy', direction=1, peak=.5, doppler=.35, seed=83), at=tpass - .25, gain=-6, pan=0.6)
tu0, tu1 = C['tilt_up']
S(sfx.whoosh(tu1 - tu0, 'heavy', direction=0, peak=.6, doppler=.2, seed=21), at=tu0 + .6 * (tu1 - tu0), gain=-9)

# --- the car: engine drone that follows the camera speed (muffled under the tape until the lock), dies with the tape drag
t = T(C['music_gap'][0] + 0.04)
rpm = ramp(t, [(0, .80), (1.0, .82), (1.75, .93), (1.95, 1.14), (2.3, 1.0), (2.6, 1.0), (3.8, 1.25), (3.87, 1.2), (4.06, .72)])
fq = 41.2 * rpm * (1 + .006 * np.sin(2 * np.pi * 6.1 * t))
eng = O.saw(fq) * .5 + O.saw(fq * 1.007) * .45 + O.sine(fq * .5) * .8 + O.sine(fq * 2) * .15
eng *= .8 + .2 * np.sin(np.cumsum(2 * np.pi * fq * .75) / SR)
eng = F.svf(eng, ramp(t, [(0, 260), (1.0, 300), (1.2, 620), (2.6, 700), (3.8, 1100), (4.06, 300)]), .9, 'lp')
eng *= ramp(t, [(0, 0), (.25, .7), (1.0, .8), (1.2, 1), (3.85, 1.1), (3.95, .5), (4.06, 0)])
S(norm(eng), at=0.0, gain=-15)
# post flutter: noise ticks at the reflector-post passing rate (both sides alternate) during the build
t0, t1 = 2.35, C['tape_rewind'][0]
u = T(t1 - t0); spd = ramp(u + t0, [(2.35, 48), (2.6, 48), (3.8, 61), (3.87, 60)])
ph = np.cumsum(spd / 8.0 * 2) / SR
nz = F.bpf(np.random.default_rng(9).standard_normal(len(u)), 1800, 7000)
pulse = (0.5 + 0.5 * np.cos(2 * np.pi * ph)) ** 10; side = (np.floor(ph) % 2)
env = ramp(u + t0, [(2.35, 0), (2.6, .6), (3.8, 1), (3.87, 1)])
S(norm(np.stack([nz * pulse * (1 - .65 * side), nz * pulse * (.35 + .65 * side)]) * env), at=t0, gain=-21)
# launch into the sun on the slam: rev-up roar then receding (pitch falls, level falls)
u = T(1.6)
fl = 55 * (1 + 2.2 * (1 - np.exp(-u * 6))) * (1 - .45 * np.clip(u / 1.3, 0, 1) ** 1.3)
yl = O.saw(fl) * .6 + O.saw(fl * 1.5) * .25 + O.sine(fl * .5) * .6
yl = F.svf(yl, 3200 * np.exp(-u * 1.8) + 250, 1.2, 'lp') + F.bpf(np.random.default_rng(4).standard_normal(len(u)), 250, 2600) * .45 * np.exp(-u * 3)
yl *= (1 - np.exp(-u * 60)) * np.exp(-u * 2.2)
S(norm(yl), at=S0, gain=-7)
S(sfx.whoosh(0.9, 'heavy', direction=0, peak=.35, doppler=.5, seed=41), at=S0 + .3, gain=-12)

# --- the slam
S(sfx.impact('cinematic'), at=S0, gain=1, verb=-12)
S(sfx.boom(1.6), at=S0, gain=-4)
S(sfx.shimmer_hit(f.chord_at(C['glint_star'])[-1] + 12), at=C['glint_star'], gain=-6, pan=-0.5)
S(sfx.sparkle(0.5, key=C['key'], mode=C['mode']), at=C['glint2_star'] - 0.1, gain=-11, pan=0.2)

# --- HERO 6.6: neon strike = gated snare + i-chord pad swell (LPF opening) + crash + gated 120 Hz buzz + relay clicks
S(sfx.charge(C['neon_trace'][1] - C['neon_trace'][0]), at=ig, gain=-6, pan=0.25)
def strike_env(x):                          # per-sample level following the neon: OFF frames duck to -18 dB, 1 ms edges
    x = as_array(x); n = x.shape[-1]; tt = ig + np.arange(n) / SR; g = np.ones(n)
    for tc, l in C['neon_strike']: g[tt >= tc] = 1.0 if l >= .8 else (.55 if l >= .2 else .125)
    g[tt >= C['neon_strike'][-1][0] + 1 / 30] = 1.0
    return x * np.convolve(g, np.ones(48) / 48, mode='same')
S(strike_env(drums.snare('synthwave', vel=1.0)), at=ig, gain=6, verb=-10)
S(strike_env(sfx.impact('cinematic', size=.7)), at=ig, gain=0)
S(strike_env(sfx.boom(1.3)), at=ig, gain=-5)
pad = as_array(synth.pad([57, 60, 64, 69, 76], 2.4, kind='80s'))
tp_ = np.arange(pad.shape[-1]) / SR
pad = F.svf(pad, np.interp(tp_, [0, .25, 2.4], [1100, 14000, 9000]), .8, 'lp')
S(strike_env(norm(pad)), at=ig, gain=5)
S(strike_env(drums.crash().loud(-18)), at=ig, gain=0)
st = C['neon_strike']; u = T(ST - ig)
gate = np.zeros(len(u))
for tc, l in st: gate[u >= tc - ig] = l if l >= .2 else 0.0
gate *= np.where(u + ig > 7.0, .45, 1.0) * np.clip((ST - .02 - (u + ig)) / .03, 0, 1)
gate = np.convolve(gate, np.ones(48) / 48, mode='same')            # hard gate, 1 ms edges
bz = F.bpf(O.saw(np.full(len(u), 120.0)) * .6 + O.sine(np.full(len(u), 240.0)) * .3, 110, 3200)
S(norm(bz * gate), at=ig, gain=-8, pan=0.25)
rg = np.random.default_rng(61); crk = F.bpf(rg.standard_normal(len(u)) * (rg.random(len(u)) < .03), 2000, 4000)   # electrode crackle
S(norm(crk * gate * np.where(u + ig < 7.0, 1.0, .3)), at=ig, gain=-15, pan=0.3)
def tink(seed):                              # bright glass tink on each re-strike (3-5 kHz, ~15 ms)
    u2 = T(.06); f0 = 3900 + 500 * np.random.default_rng(seed).random()
    return (np.sin(2 * np.pi * f0 * u2) + .6 * np.sin(2 * np.pi * f0 * 1.37 * u2 + 1) + .3 * np.sin(2 * np.pi * f0 * .79 * u2)) * np.exp(-u2 / .015) * (1 - np.exp(-u2 * 3000))
for i, tc in enumerate(C['neon_tinks']): S(norm(tink(70 + i)), at=tc, gain=-3, pan=0.3 - .15 * (i % 2))
u = T(.06); snap = F.bpf(np.random.default_rng(91).standard_normal(len(u)), 250, 7000) * np.exp(-u / .012) * (1 - np.exp(-u * 2500))
S(norm(snap), at=6.667, gain=0, pan=0.3)                    # the 6.667 re-strike gets its own broadband onset
for tc, l in []:                                             # (dropped: the HF drop-out ticks made the AAC encode overshoot to -0.1 dBTP)
    if l < .2: u = T(.006); S(norm(F.hpf(np.random.default_rng(int(tc * 100)).standard_normal(len(u)), 3000) * np.exp(-u / .0012) * (1 - np.exp(-u * 4000))), at=tc, gain=-13, pan=0.3)
prev = 0.0
for i, (tc, l) in enumerate(st):
    l2 = l if l >= .2 else 0.0
    if abs(l2 - prev) > .2: S(sfx.click('switch'), at=tc - 1 / 60, gain=-1 - .3 * i, pan=0.3)
    if i > 0 and l2 > prev + .2: S(sfx.zap(), at=tc, gain=-3, pan=0.3)            # audible re-strike on every ON frame
    prev = l2
S(sfx.crt_whine(2.6), at=ig, gain=-18, pan=0.3)
S(sfx.ui('swipe'), at=C['tagline'][0] + 0.1, gain=-10)
S(sfx.sparkle(0.45, key=C['key'], mode=C['mode'], seed=3), at=7.8, gain=-13, pan=-0.6)
# --- 9.0 combined beat: chrome sweep + neon pulse + grid wave
S(sfx.shimmer_hit(f.chord_at(C['outro'])[-1] + 12), at=C['outro'], gain=-9, pan=0.3)
S(sfx.sparkle(0.5, key=C['key'], mode=C['mode'], seed=5), at=9.2, gain=-14, pan=-0.3)
# --- STOP: deck clunk, motor wind-down, CRT off
S(sfx.click('switch'), at=ST, gain=1)
u = T(.14); S(norm(O.sine(np.full(len(u), 68.0)) * np.exp(-u / .035)), at=ST, gain=-5)
S(sfx.power_down(.30), at=ST + .01, gain=-15)
S(sfx.static(0.14, 'tv'), at=ST + .03, gain=-17)
S(sfx.crt_off(), at=C['crt_off'][0], gain=-5)

hits = [C['track_lock'], S0, C['glint_star'], ig, C['outro'], ST]
res = m.export(os.path.join(HERE, 'out/audio.wav'), lufs=-14, tp=-4.0, spectrogram=os.path.join(HERE, 'out/audio_spec.png'))
# AAC safety: a 16 kHz low-pass on the printed mix. Without it the AAC encode of the 6.6 hero hit overshoots to -0.1 dBTP (wav -4.2).
import soundfile as _sf
from scipy.signal import butter as _bt, sosfiltfilt as _sff
_x, _sr = _sf.read(os.path.join(HERE, 'out/audio.wav')); _sf.write(os.path.join(HERE, 'out/audio.wav'), _sff(_bt(4, 16000, 'low', fs=_sr, output='sos'), _x, axis=0), _sr, subtype='PCM_24')
print({k: res[k] for k in ('duration', 'lufs', 'true_peak', 'stereo_corr', 'bands', 'warnings') if k in res})
print('align', mg.hit_alignment(os.path.join(HERE, 'out/audio.wav'), hits))
try:
    import soundfile as sf; x, sr = sf.read(os.path.join(HERE, 'out/audio.wav'))
except Exception:
    from scipy.io import wavfile; sr, x = wavfile.read(os.path.join(HERE, 'out/audio.wav')); x = x / (np.abs(x).max() if x.dtype.kind == 'f' else float(np.iinfo(x.dtype).max))
mono = x.mean(axis=1) if x.ndim == 2 else x
for a in (1.0, 2.6, 3.6, 4.2, 6.6, 7.4, 9.0, 9.7):
    w = mono[int(a * sr):int((a + .2) * sr)]; print(f'RMS {a:.1f}-{a+.2:.1f}: {20*np.log10(np.sqrt(np.mean(w**2))+1e-12):6.1f} dB')
for a in [6.6 + k / 30 for k in range(9)]:      # per-frame strike contrast (ON / OFF)
    w = mono[int(a * sr):int((a + 1 / 30) * sr)]; print(f'frame {a:.3f}: {20*np.log10(np.sqrt(np.mean(w**2))+1e-12):6.1f} dB')
