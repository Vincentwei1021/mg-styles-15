"""ISOPOLIS — soundtrack. Custom mgaudio composition, D major, 120 bpm (bar = 2 s), drop = 6.00 s.
The city 'plays itself': every tile ring / building landing / letter drop is a note of the marimba line;
tactile wood clicks and pops are layered on top as SFX, all read from cues.json (single source of timing)."""
import sys, json, os, math
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'lib', 'audio'))
import numpy as np
import mgaudio as mg
from mgaudio import synth, drums, sfx, seq, fm, samples as SM
from mgaudio.theory import midi

HERE = os.path.dirname(os.path.abspath(__file__))
cues = json.load(open(os.path.join(HERE, 'cues.json')))
BPM, DROP = cues['bpm'], cues['drop']
B = 60 / BPM            # beat
BAR = 4 * B
S16 = BAR / 16

m = mg.Mix(10.0, bpm=BPM, anchor=DROP)
m.group('music').level = -20
g = m.grid

N = lambda s: midi(s) if isinstance(s, str) else s
MAR = SM.inst('marimba')
GLK = SM.inst('glock')
def mar(n, v=0.7, d=None):
    return MAR.play(N(n), d, v)
def glk(n, v=0.6):
    n = N(n)
    return GLK.play(n, None, v) if 79 <= n <= 108 else fm.bell(n, 1.2, v, 'glock')

# ------------------------------------------------------------------ harmony (explicit voicings)
CH = {
    'Gmaj7': ['G3', 'B3', 'D4', 'F#4'], 'Bm7': ['B2', 'D4', 'F#4', 'A4'], 'A': ['A2', 'C#4', 'E4', 'A4'],
    'Asus': ['A2', 'D4', 'E4', 'A4'], 'Dmaj7': ['D3', 'F#4', 'A4', 'C#5'], 'Gmaj9': ['G2', 'B3', 'F#4', 'A4'],
    'Dmaj9': ['D3', 'F#4', 'A4', 'C#5', 'E5'],
}
SEG = [(0.0, 2.0, 'Gmaj7'), (2.0, 4.0, 'Bm7'), (4.0, 5.0, 'Asus'), (5.0, 6.0, 'A'), (6.0, 7.75, 'Dmaj7'),
       (7.75, 9.0, 'Gmaj9'), (9.0, 10.0, 'Dmaj9')]
ROOT = {'Gmaj7': 'G1', 'Bm7': 'B1', 'Asus': 'A1', 'A': 'A1', 'Dmaj7': 'D2', 'Gmaj9': 'G1', 'Dmaj9': 'D2'}

pad = m.track('pad', level=-25, sends={'hall': -9}, width=1.0)
for a, b, c in SEG:
    pad.add(synth.pad([N(n) + (12 if c in ('Bm7',) and N(n) < 50 else 0) for n in CH[c]], b - a + 0.35, 0.75, 'glass'), a)
pad.duck(by='kick', depth=1.5, release=0.15)
pad.automate('lpf', [(0, 900), (2.0, 1600), (5.9, 4200), (6.0, 9000), (7.7, 9000), (8.2, 2600), (9.0, 7000), (10, 5000)])
pad.automate('gain', [(0, -8), (0.6, -2), (2, 0), (7.75, -1), (8.4, -4), (9.0, 0), (10, 0)])

# ------------------------------------------------------------------ intro: blueprint shimmer + ring notes
m.sfx(sfx.hud_scan(0.9, 1, seed=3), at=0.0, gain=-7, pan=-0.2)
m.sfx(sfx.swell(mar('D5', 0.5), 0.6), at=cues['rings'][0], gain=-12)
ev = m.track('events', level=-19.5, sends={'delay8': -13, 'room': -12})
ring_notes = ['D5', 'F#5', 'A5', 'B5', 'D6', 'E6']
for k, t in enumerate(cues['rings']):
    ev.add(mar(ring_notes[k], 0.62 + 0.05 * k), t, pan=-0.25 + 0.1 * k)
    ev.add(mar(N(ring_notes[k]) - 12, 0.35), t)
# tactile tile clacks: each ring's tiles land over ~70 ms (angular stagger) -> granular wood clicks
R = np.random.default_rng(11)
for k, t in enumerate(cues['rings']):
    n = 3 + k * 2
    for i in range(n):
        dt = (i / n) * 0.07 + R.uniform(-0.004, 0.004)
        m.sfx(sfx.click('wood'), at=t + dt, gain=-13 - (i > 0) * 3 + R.uniform(-1.5, 1.5), pan=float(np.sin(i * 2.4) * (0.2 + 0.1 * k)))
    m.sfx(sfx.pop('soft', pitch=0.9 + 0.06 * k), at=t, gain=-9)
# clock ticks under the intro (information / time)
tk = m.track('tick', level=-31, pan=0.3)
for t, v in seq.step_times(g, 0.0, 2.0, 8, 'X.x.X.x.'):
    tk.add(sfx.tick('clock' if v > 0.9 else 'hi', level=-24), t)
# soil locks in, roads draw on
m.sfx(sfx.impact('thud', size=0.6), at=cues['soil'] + 0.12, gain=-6)
m.sfx(sfx.sub_drop(0.45, 90, 45), at=cues['soil'] + 0.12, gain=-12)

# ------------------------------------------------------------------ build 1 (2-4): houses, downtown sweep
kick = lambda v=1.0: drums.kick('soft', v, decay=0.26)
kt = m.track('kick', level=-18)
kt.loop(kick, 'x.......x.......', 2.0, 4.0, vel=0.8).loop(kick, 'x...x...x...x...', 4.0, 5.0, vel=0.85)
kt.loop(kick, 'x...x...x.x.x...', 5.0, 6.0, vel=0.9)
kt.loop(kick, 'x...x...x...x...', 6.0, 7.75)
sh = m.track('shaker', level=-31, pan=0.3)
sh.loop(lambda v: drums.shaker(v), 'x.xxx.xxx.xxx.xx', 2.0, 7.75, vel=0.55, vel_jitter=0.2)
sh.automate('gain', [(2.0, -8), (5.9, 0), (7.75, 0)])
bs = m.track('bass', level=-22)
for a, b, c in SEG[1:6]:
    if a >= 7.75: break
    for t, v in seq.step_times(g, a, min(b, 7.75), 8, 'x..x..x.' if a < 6 else 'x.xx.x.x'):
        bs.add(synth.bass(N(ROOT[c]) + 12, 0.18, 0.8 * v, 'pluck'), t)
bs.duck(by='kick', depth=4, release=0.12)
sub = m.track('sub', level=-24)
for a, b, c in SEG[2:5]:           # sub only from the second build bar (keeps 2-4 s light and plucky)
    sub.add(synth.bass(N(ROOT[c]), b - a, 0.7, 'sub'), a)
sub.duck(by='kick', depth=5, release=0.14)

# houses: soft pitched pops (pentatonic, rising left -> right)
hs = sorted(set(cues['houses'].values()))
pent = [1.0, 1.122, 1.26, 1.335, 1.498, 1.682, 2.0, 2.245]
for k, t in enumerate(hs):
    n_here = sum(1 for v in cues['houses'].values() if v == t)
    m.sfx(sfx.pop('bubble', pitch=pent[k % len(pent)]), at=t - 1 / 30, gain=-6, pan=-0.6 + 1.2 * k / max(1, len(hs) - 1))
    ev.add(glk(['A6', 'B6', 'D7', 'E7', 'F#7', 'A7', 'B7', 'D8'][k % 8], 0.35), t, pan=-0.5 + k * 0.12)
# downtown: each landing = a marimba note (+ low octave on the 2x2 blocks), wood thock, roof-cap tick 1/16 later
BIG = {'A', 'D', 'I', 'L'}
line = {'I': ('B3', 'F#4'), 'F': ('D4',), 'E': ('F#4',), 'A': ('A4', 'B2'), 'B': ('B4',), 'C': ('C#5',), 'D': ('E5', 'A2')}
slots = sorted(set(cues['downtown'].values()))
by_t = {t: [k for k, v in cues['downtown'].items() if v == t] for t in slots}
for i, t in enumerate(slots):
    ids = by_t[t]
    lead = next((x for x in ids if x in line), ids[0])
    notes = line.get(lead, ('D4',))
    for j, n in enumerate(notes):
        ev.add(mar(n, 0.8 if j == 0 else 0.55), t)
    if len(ids) > 1:
        ev.add(mar(N(notes[0]) + 7 if N(notes[0]) + 7 < 84 else N(notes[0]) - 5, 0.45), t + 0.004)
    big = any(x in BIG for x in ids)
    m.sfx(sfx.click('wood'), at=t - 1 / 30, gain=-4 if big else -7, pan=-0.5 + i * 0.16)
    if big:
        m.sfx(drums.woodblock('block', 0.8).loud(-18), at=t - 1 / 30, gain=-8)
        m.sfx(sfx.impact('soft', size=0.5), at=t, gain=-10)
    m.sfx(sfx.tick('wood'), at=t + cues['roof_lag'] - 1 / 30, gain=-14, pan=-0.5 + i * 0.16)  # round 2: caps land 0.375 s after the base; softer so the next base note leads
# rail pillars chain + beam: a quick rising zipper of ticks
for k in range(12):
    m.sfx(sfx.tick('hi'), at=cues['rail'] + k * 0.04, gain=-17 + k * 0.4, pan=-0.6 + k * 0.1)
# trees / solar sparkle bed along the sweep
m.sfx(sfx.sparkle(2.3, 14, 'D', 'major_pentatonic', seed=5), at=2.1, gain=-12)
# turbines rise: airy whoosh
for t in [3.125, 3.625, 4.25, 4.625]:  # r1: turbine (0,5)->(0,3) frees the top-left void for COMMUTE
    m.sfx(sfx.whoosh(0.5, 'air', direction=1, seed=int(t * 10)), at=t + 0.18, gain=-13)

# ------------------------------------------------------------------ build 2 (4-6): the CORE telescopes up
tw = cues['tower']
m.sfx(sfx.impact('punch', size=0.7), at=tw['base'], gain=-5)
m.sfx(drums.tom('low', 0.9, 'synth').loud(-18), at=tw['base'], gain=-6)
seg_notes = [('seg1', 'A3'), ('seg2', 'C#4'), ('seg3', 'E4'), ('antenna', 'A4')]
for k, (key, n) in enumerate(seg_notes):
    t = tw[key]
    ev.add(mar(n, 0.85), t)
    ev.add(mar(N(n) - 12, 0.6), t)
    m.sfx(sfx.click('switch'), at=t - 1 / 30, gain=-6)
    m.sfx(sfx.whoosh(0.3, 'sci', direction=1, seed=20 + k), at=t + 0.1, gain=-12)
m.sfx(sfx.lock_on(0.5, note='A6'), at=tw['ring'], gain=-6)
for t in (5.625, 5.875):
    m.sfx(sfx.hud_beep('A6', 0.05), at=t, gain=-6)
m.track('riser', level=-24).add(sfx.riser(2.0, 'hybrid', note='A3', seed=2), DROP)
m.sfx(sfx.reverse_cymbal(1.2), at=DROP - 0.06, gain=-7)   # ends 2 frames early: a clean 60 ms gap before the hit
sn = m.track('snare', level=-24, sends={'room': -12})
for t, v in seq.roll(5.0, DROP, 8, 32, grid=g, vel0=0.3, vel1=0.9):
    sn.add(drums.snare('tight', v), t)
sn.automate('gain', [(5.0, -10), (5.95, 0)])
ar = m.track('arp', level=-27, sends={'delay8': -10})
for t, n, d, v in seq.arp(g, lambda t: [N(x) + 12 for x in CH['A']], 4.0, DROP, div=16, pattern='up', octaves=2, gate=0.5, vel=0.7):
    ar.add(synth.pluck(n, d, v, 'soft'), t)
ar.automate('gain', [(4.0, -12), (5.95, 0)])

# ------------------------------------------------------------------ DROP 6.00: ignition
m.sfx(sfx.impact('punch', size=0.9), at=DROP, gain=-2)          # crisp transient on the ignition frame
m.sfx(sfx.impact('cinematic', size=1.0), at=DROP, gain=0)
m.sfx(sfx.boom(2.0, 44), at=DROP, gain=-5)
m.sfx(sfx.shimmer_hit('A6'), at=DROP, gain=-3)
m.track('crash', level=-26, sends={'hall': -12}).add(drums.crash(0.9), DROP)
m.sfx(sfx.whoosh(0.9, 'sci', direction=1, peak=0.25, seed=8), at=DROP + 0.22, gain=-5)       # ground pulse sweep
m.sfx(sfx.magic(0.8, 'D', 'major_pentatonic', up=True, seed=6), at=DROP + 0.2, gain=-9)     # windows flash wave
m.sfx(sfx.data_chirp(8, seed=9), at=DROP + 0.35, gain=-11, pan=0.25)                         # data arcs launch
# drones lift off (soft rising blips)
for k, t in enumerate([6.12, 6.28, 6.44, 6.6, 6.76]):
    m.sfx(sfx.blip(['D6', 'F#6', 'A6', 'B6', 'D7'][k], 'tri', 0.09, glide=3), at=t, gain=-12, pan=-0.4 + 0.2 * k)
# callout tags: open + count-up ticks
for k, t in enumerate(cues['callouts']):
    m.sfx(sfx.ui('notify'), at=t + 0.16, gain=-5, pan=[0.5, -0.45, 0.05][k])
    for j in range(7):
        m.sfx(sfx.tick('hi'), at=t + 0.3 + j * 0.09, gain=-18 - j * 0.6, pan=[0.5, -0.45, 0.05][k])
# groove
cl = m.track('clap', level=-24, sends={'room': -10})
cl.loop(lambda v: drums.clap('tight', v), '....x.......x...', DROP, 7.75)
rim = m.track('rim', level=-30, pan=-0.35)
rim.loop(lambda v: drums.rim(v), seq.euclid_pattern(3, 16, 3), DROP, 7.75, vel=0.6)
ost = m.track('ostinato', level=-23, sends={'delay8': -12, 'room': -14}, pan=-0.1)
cell = [0, 2, 1, 2, 0, 2, 1, 3]
tones = sorted(set(N(n) + 12 for n in CH['Dmaj7']))
for j, t in enumerate(seq.step_times(g, DROP, 7.75, 16)):
    ost.add(mar(tones[cell[j % 8] % len(tones)], 0.62 if j % 4 == 0 else 0.44), t)
ost.duck(by='kick', depth=2, release=0.1)
m.track('glock', level=-27, sends={'plate': -12}).add(glk('F#7', 0.7), DROP).add(glk('A7', 0.5), DROP + BAR / 2)
kt.add(kick(1.0), DROP)
# round 2: a real 808 under the drop: D2 -> D1 glide in 120 ms, 0.8 s decay, tanh drive 2 so the 73/110 Hz harmonics translate
def sub808(dur=0.8, f0=73.42, f1=36.71, glide=0.12, drive=2.0):
    from mgaudio import sfx as _S
    n = _S.ns(dur); t = np.arange(n) / _S.SR
    f = f1 + (f0 - f1) * np.exp(-t / (glide / 3.0))
    env = np.exp(-t / (dur * 0.42)) * np.minimum(1.0, t / 0.002) * np.clip((dur - t) / 0.12, 0.0, 1.0)
    x = np.tanh(drive * np.sin(2 * np.pi * np.cumsum(f) / _S.SR) * env) / np.tanh(drive)
    return _S._out(_S.F.hpf(x, 22), 0.0, None)
m.sfx(sub808(), at=DROP, gain=-2)

# ------------------------------------------------------------------ outro: pull-back, letters, final chord
m.sfx(sfx.whoosh(1.2, 'air', direction=-1, peak=0.45, seed=12), at=cues['whoosh'], gain=-2)
m.sfx(sfx.reverse_cymbal(0.7), at=cues['letters_start'], gain=-10)
letter_notes = ['D5', 'E5', 'F#5', 'A5', 'B5', 'D6', 'E6', 'F#6']
for k in range(8):
    t = cues['letters_start'] + k * cues['letters_step']
    ev.add(mar(letter_notes[k], 0.6 + 0.04 * k), t, pan=-0.45 + 0.12 * k)
    if k < 7: m.sfx(sfx.click('wood'), at=t - 1 / 30, gain=-8, pan=-0.45 + 0.12 * k)  # round 2: last letter lands on the 9.00 chord, no pre-click
F = cues['final']
for j, n in enumerate(['D4', 'A4', 'C#5', 'E5', 'F#5']):
    ev.add(mar(n, 0.62), F + 0.018 * j)
m.track('glock2', level=-26, sends={'plate': -10}).add(glk('A7', 0.6), F).add(glk('E7', 0.4), F + 0.25)
m.sfx(sfx.shimmer_hit('F#6'), at=F, gain=-6)
m.sfx(sfx.swish(0.35, direction=1, seed=3), at=F + 0.08, gain=-11)
kt.add(kick(0.8), F)
sub.add(synth.bass(N('D2'), 1.0, 0.75, 'sub'), F)
for j in range(6):
    m.sfx(sfx.tick('hi'), at=F + 0.18 + j * 0.05, gain=-20)

# r2s2 additions live here, after every other event, so the RNG draws of the existing mix stay identical
# r2s2: the soil 'unlatch' transient sits on the extrusion's fastest frame (motion peak f50)
m.sfx(sfx.click('wood'), at=cues['soil'] + 0.03, gain=-9)
m.sfx(sfx.impact('punch', size=0.35), at=cues['soil'] + 0.03, gain=-15)
m.sfx(sfx.data_chirp(5, seed=4), at=cues['roads'] + 0.05, gain=-12, pan=0.2)
# r2s2: monorail departure chime (E6 -> A6, a 4th up, inside the A build chord) on the train start
m.sfx(sfx.hud_beep('E6', 0.05), at=cues['train'], gain=-5, pan=0.25)
m.sfx(sfx.hud_beep('A6', 0.05), at=cues['train'] + 0.0625, gain=-7, pan=0.3)
m.sfx(sfx.click('switch'), at=cues['train'] - 0.01, gain=-6, pan=0.25)

# dynamics: quieter intro, build swells, a short suck-in before the drop, drop opens up
m.group('music').automate('gain', [(0, -4.5), (1.9, -3.5), (2.0, -2.5), (4.0, -2.5), (4.95, -3.5), (5.05, -6.5), (5.8, -5.5), (5.9, -6.0), (5.935, -18), (5.996, -18), (6.0, -1.5), (6.08, -1.5), (6.2, 1.5),
                                   (7.7, 1.0), (7.8, -2.0), (8.9, -2.5), (9.0, 0.5), (10, 0.5)])
m.master_kw.update(air=0.8)
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
res = m.export(os.path.join(HERE, 'out', 'audio.wav'), spectrogram=os.path.join(HERE, 'out', 'audio_spec.png'))
m.report()
print({k: res[k] for k in ('duration', 'lufs', 'true_peak', 'bands', 'warnings') if k in res})
hits = cues['rings'] + sorted(set(cues['downtown'].values())) + [DROP, F]
print(mg.hit_alignment(os.path.join(HERE, 'out', 'audio.wav'), hits))
# round 2 check: build vs drop RMS gap and sub (< 60 Hz) energy
import soundfile as _sf
_y, _sr = _sf.read(os.path.join(HERE, 'out', 'audio.wav')); _y = _y.mean(axis=1)
_rms = lambda a, b: 20 * np.log10(np.sqrt(np.mean(_y[int(a * _sr):int(b * _sr)] ** 2)) + 1e-12)
def _sub(a, b):
    seg = _y[int(a * _sr):int(b * _sr)]; S = np.abs(np.fft.rfft(seg * np.hanning(len(seg)))) ** 2; fr = np.fft.rfftfreq(len(seg), 1 / _sr)
    return 10 * np.log10(S[fr < 60].sum() + 1e-12)
print({'build_rms': round(_rms(5.0, 5.93), 2), 'drop_rms': round(_rms(6.0, 6.6), 2), 'gap_db': round(_rms(6.0, 6.6) - _rms(5.0, 5.93), 2),
       'sub_build': round(_sub(5.33, 5.93), 1), 'sub_drop': round(_sub(6.0, 6.6), 1)})
