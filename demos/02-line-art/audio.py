# ATELIER LINEA — score + sound design, locked to cues.json and out/timing.json (path-derived corner/speed data).
# Round 1: felt piano + strings (E major, Imaj9 -> vi9 -> IVmaj9 -> V6/9 -> Imaj9 on the fill). Celesta ONLY on the
# structural punctuation (the three holds + 3 major corners), soft clicks + a louder pen whisper carry the rest.
# Ink hook on frame 0 (nib scratch + low E thump), harp glissando through the wave curl, an 8 dB breath before the
# fill, reverse sparkle for the light running back, B5 as the pen signs off, master fade from 9.3 s.
import sys, json, os
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'lib', 'audio'))
import mgaudio as mg
from mgaudio import sfx, synth, fm, samples, filters, pluck

HERE = os.path.dirname(os.path.abspath(__file__))
cues = json.load(open(os.path.join(HERE, 'cues.json')))
tim = json.load(open(os.path.join(HERE, 'out/timing.json')))
SR = 48000
P = {k: v[0] for k, v in tim['pieces'].items()}          # piece start times
T_END = tim['t_end']; FILL = cues['fill']['start']
POSTER = cues['camera']['poster_from']; WM = cues['wordmark']['start']; TAG = cues['wordmark']['tagline']
PULSE = cues['pulse']['start']; RULES = cues['rules'][0]
HOLDS = [h[0] for h in cues['holds']]                    # beam, tower crown, spire tip

EQ_WARM = lambda a: filters.eq(a, [('pk', 300, -3, 1.0)])          # take the mud out of piano / strings / air
EQ_AIR = lambda a: filters.eq(a, [('hs', 6000, 3)])                # lift celesta / shimmer
def air(s): return mg.Sound(np.asarray(EQ_AIR(np.asarray(s, dtype=np.float32)), dtype=np.float32))

m = mg.Mix(duration=10.0, bpm=72)
m.group('music').level = -20

CH = [  # (start, end, pad voicing, bass)
    (0.0, P['pavilion'], [52, 59, 63, 66, 68], 40),        # Emaj9
    (P['pavilion'], P['sky'], [49, 56, 59, 63, 64], 37),     # C#m9
    (P['sky'], P['horizon'], [45, 57, 61, 64, 68, 71], 33),  # Amaj9
    (P['horizon'], FILL, [47, 54, 59, 61, 66, 68], 35),      # B6/9 (suspended, open)
    (FILL, 10.0, [40, 52, 59, 63, 66, 71, 75], 28),          # Emaj9 — resolution on the fill
]
def chord_at(t):
    for a, b, v, bs in CH:
        if a <= t < b: return v
    return CH[-1][2]

# ---- felt piano
piano = samples.inst('piano')
pn = m.track('piano', level=-20, sends={'hall': -8}, hp=70, lp=5200, fx=[EQ_WARM])
def P_(t, note, vel=0.4, dur=2.5):
    pn.add(piano.play(note, dur=dur, vel=vel, release=0.8), t)
P_(0.0, 28, 0.5, 1.6); P_(0.0, 40, 0.36, 1.6)                                        # frame 0: low E thump under the nib
P_(P['seed'], 68, 0.36, 2.2)                                                          # G#4 as the whip brakes into the seed
leaf_tips = [c['t'] for c in tim['corners'] if c['piece'] in ('leaf1', 'leaf2', 'leaf3')][1::3] or [1.0, 1.35, 1.7]
for t, n in zip(leaf_tips[:3], [71, 73, 76]): P_(t, n, 0.4)                           # B4 C#5 E5 — growth
P_(HOLDS[0], 80, 0.36, 2.0)                                                          # G#5: branch becomes beam
P_(P['pavilion'], 37, 0.34, 3.0); P_(P['pavilion'], 64, 0.28, 2.5)
P_(P['sky'], 33, 0.34, 3.0); P_(P['sky'], 73, 0.3, 2.0)
P_(P['horizon'], 35, 0.38, 3.0); P_(P['horizon'], 47, 0.28, 3.0)
for i, (dt, n) in enumerate([(0.0, 59), (0.105, 66), (0.21, 73), (0.315, 78)]):     # ring: rising arpeggio (1/16 at 72 bpm ~ .2)
    P_(P['ring'] + dt, n, 0.30 + 0.05 * i, 2.0)
for n, v in [(28, 0.52), (40, 0.5), (59, 0.38), (63, 0.36), (68, 0.38), (83, 0.36)]: # FILL: Emaj9 resolve
    P_(FILL - 0.01, n, v, 2.6)
P_(POSTER + 0.585, 87, 0.40, 1.8)                                                    # D#6 (maj7) at the dolly-out's top speed = wordmark peak (r2s2: 8.385, audible onset)
P_(TAG, 80, 0.2, 1.6)                                                                # G#5 tagline
P_(RULES, 83, 0.26, 1.2)                                                             # B5: the pen signs off

# ---- strings + air bed (no swell on frame 0: the film opens on the ink)
st = m.track('strings', level=-23, sends={'hall': -6}, hp=160, fx=[EQ_WARM])
for a, b, v, bs in CH:
    st.add(synth.pad([n + 12 for n in v[1:4]] + [v[0]], (b - a) + 0.6, 0.7, 'strings', attack=0.5, release=0.8, seed=int(a * 10)), a)
st.automate('gain', [(0, -22), (0.6, -16), (P['pavilion'], -10), (P['sky'], -7), (P['horizon'], -4), (FILL - 0.2, 0), (FILL + 0.6, -2), (9.0, -5), (10, -12)])
st.automate('lpf', [(0, 1400), (P['horizon'], 3600), (FILL, 8000), (10, 5000)])
ai = m.track('air', level=-27, sends={'hall': -4}, fx=[EQ_WARM])
for a, b, v, bs in CH:
    ai.add(synth.pad(v, (b - a) + 0.8, 0.6, 'air', attack=0.6, release=0.9, seed=7 + int(a)), max(0.0, a - 0.05))
ai.automate('gain', [(0, -40), (0.25, -30), (0.9, 0), (10, 0)])
sub = m.track('sub', level=-26)
sub.add(synth.bass('E1', 2.0, 0.7, 'sub'), FILL)
# breath before the hit: the music bus dips 8 dB and comes back exactly on the fill; master fade from 9.3 s
m.group('music').automate('gain', [(0, 0), (7.02, 0), (7.2, -15), (7.47, -15), (7.495, 0), (9.3, 0), (9.7, -6), (10, -20)])

# ---- celesta only on the structural punctuation (holds + roof end + skyline start + horizon launch)
ce = m.track('celesta', level=-13.5, sends={'hall': -7, 'delay': -16})   # r2s2: +3.5 dB presence
accents = [(HOLDS[0], 92, 0.42), (HOLDS[1], 95, 0.44), (P['sky'], 85, 0.3), (HOLDS[2], 100, 0.46)]   # r2: pavilion + horizon celesta removed (thins the 2.1-2.6 / 4.7-5.2 clusters)
xs = {c['piece']: c['x'] for c in tim['corners']}
for t, n, v in accents:
    ce.add(air(fm.bell(int(n) - 12, 1.1, v, 'celesta')), t - 0.008)

# ---- harp glissando through the wave curl (the pen's one flourish)
c0, c1 = P['curl'], P['lift']
gl = [71, 73, 76, 78, 80, 83, 85, 88]
hp_ = m.track('harp', level=-22, sends={'hall': -5}, pan=0.35)
for i, n in enumerate(gl):
    hp_.add(pluck.harp(n, 1.4, 0.34 + 0.03 * i), c0 + (c1 - c0) * (i / len(gl)) ** 0.85)

# ---- pen-on-paper whisper, loudness follows tip speed (from the same path timing) — +6 dB vs v1
rng = np.random.default_rng(20260927)
n = int(10 * SR); tt = np.arange(n) / SR
spd = np.interp(tt, np.arange(len(tim['speed'])) / 120.0, np.array(tim['speed']))
env = np.clip(spd / 3000.0, 0, 1) ** 0.6 * (tt < T_END + 0.02)
env = filters.lpf(env.astype(np.float32), 30.0)
grainm = filters.lpf(rng.standard_normal(n).astype(np.float32), 70.0)
grainm = 1 + 0.9 * grainm / (np.abs(grainm).max() + 1e-9)
def band(seed):
    x = np.random.default_rng(seed).standard_normal(n).astype(np.float32)
    return filters.lpf(filters.hpf(x, 1600.0), 7500.0)
L = band(1) * env * grainm; R = band(2) * env * grainm
pen = mg.Sound(np.stack([L, R]).astype(np.float32)).loud(-18)
m.track('pen', level=-24, group='sfx').add(pen, 0.0)

# ---- sound design at the cues
m.sfx(sfx.pen('pen', 0.24, strokes=[(0.0, 0.2)], seed=11), at=0.0, gain=-8, pan=-0.2)               # dry nib scratch, frame 0
m.sfx(sfx.impact('soft', size=0.35, seed=12), at=cues['hook']['brake'] - 0.01, gain=-15)             # r2: thump on the brake (ink bead)
arch_c = [c for c in tim['corners'] if c['piece'] in ('pavilion', 'tower', 'tower2', 'sky', 'sky2')]
PITCHED = [0.0, P['seed'], HOLDS[0], P['pavilion'], HOLDS[1], P['sky'], HOLDS[2], P['horizon']]
for c in [c for c in arch_c[::2] if min(abs(c['t'] - q) for q in PITCHED) > 0.2]:   # r2: clicks sit under the pen whisper, never next to a note
    m.sfx(sfx.click('soft'), at=c['t'] - 0.005, gain=-23, pan=float(np.clip((c['x'] - 900) / 900, -0.6, 0.6)))
m.sfx(sfx.whoosh(0.6, 'air', direction=1, peak=0.5, seed=3), at=P['horizon'] + 0.05, gain=-9, pan=0.3)       # horizon sprint
foot = [c for c in tim['corners'] if c['piece'] == 'foot']
for c in foot[:1]:   # r2s2: the pen's last corner before the breath (visual peak 7.00) gets its tick
    P_(c['t'] - 0.01, 83, 0.27, 1.4)   # B5 completes the ring arpeggio (B3 F#4 C#5 F#5 -> B5) as the pen turns into the doorway
    m.sfx(sfx.click('wood'), at=c['t'] - 0.012, gain=-14, pan=float(np.clip((c['x'] - 900) / 900, -0.6, 0.6)), verb=-10)
m.sfx(fm.bell('B5', 1.6, 0.5, 'chime').loud(-18), at=P['ring'] - 0.012, gain=-5, pan=0.1, verb=-8)   # ring accent
m.sfx(sfx.whoosh(0.6, 'soft', direction=-1, peak=0.5, seed=5), at=P['ring'] + 0.25, gain=-10, pan=-0.1)
m.sfx(sfx.reverse_cymbal(1.1, seed=2), at=FILL, gain=-17)                                                      # its end = the fill
m.sfx(sfx.impact('soft', size=1.0, seed=4), at=FILL - 0.008, gain=0, verb=-8)
m.sfx(air(sfx.chime(('E6', 'G#6', 'B6', 'D#7'), step=0.05, kind='celesta')), at=FILL, gain=-2.5, verb=-8)   # r2s2 +1.5 dB presence
m.sfx(air(sfx.shimmer_hit('B5')), at=FILL + 0.03, gain=-7, verb=-6)
m.sfx(air(sfx.sparkle(0.9, density=16, key='E', mode='major_pentatonic', seed=6)), at=PULSE, gain=-10, verb=-8)   # light runs back
m.sfx(sfx.whoosh(1.0, 'air', direction=-1, peak=0.5, seed=9), at=POSTER, gain=-13)
m.sfx(air(fm.bell('E5', 1.8, 0.45, 'celesta')), at=tim['pulse_home'] - 0.01, gain=-8, pan=-0.35, verb=-7)   # the light comes home to the seed
m.sfx(air(fm.bell('D#6', 1.4, 0.4, 'celesta')), at=POSTER + 0.58, gain=-12, pan=0.2, verb=-8)   # r2s2: celesta doubles the D#6 as the wordmark lands
m.sfx(air(sfx.sparkle(0.5, density=9, key='E', mode='major_pentatonic', seed=17)), at=cues['breath']['start'], gain=-17, verb=-8)   # end breath                     # dolly-out breath
m.group('sfx').automate('gain', [(0, 0), (7.04, 0), (7.22, -10), (7.47, -10), (7.49, 0), (9.3, 0), (9.7, -6), (10, -20)])

m.master_kw.update(air=2.5)
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
res = m.export(os.path.join(HERE, 'out/audio.wav'), lufs=-14, tp=-1, spectrogram=os.path.join(HERE, 'out/audio_spec.png'))
print({k: res[k] for k in ('duration', 'lufs', 'true_peak', 'stereo_corr', 'longest_gap') if k in res})
print('bands', res.get('bands')); print('warnings', res.get('warnings'))
hits = [0.0, HOLDS[0], HOLDS[1], HOLDS[2], P['ring'], FILL, RULES]
print('align', mg.hit_alignment(os.path.join(HERE, 'out/audio.wav'), hits))
