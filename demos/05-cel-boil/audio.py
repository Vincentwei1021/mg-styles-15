"""05-cel-boil soundtrack: a Mickey-moused jazzy cartoon cue (pizzicato walking bass, xylophone, brushes,
piano comping) + cartoon sound design, every hit read from cues.json.

120 bpm swing (beat = 12 frames at 24 fps), bar lines 0.5 / 2.5 / 4.5 / 6.5 / 8.5.
Form: pickup tiptoe -> strike + ignition 'ta!' -> wake-up (xylophone answers every glance) -> slide-whistle jump ->
band in (walking pizz, brushes, ride, Charleston piano) -> stop-time 'ta-da' -> chromatic spin build ->
0.125 s of silence -> BOOM -> xylophone run writes the title (one note per stroke, 16ths) -> F6/9 button + wink.
"""
import sys, os, json
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'lib', 'audio'))
import mgaudio as mg
from mgaudio import sfx, drums, synth, fm, samples, pluck, fx, filters as F
from mgaudio.core import Sound
from mgaudio.theory import midi

HERE = os.path.dirname(os.path.abspath(__file__))
C = json.load(open(os.path.join(HERE, 'cues.json')))
R2_CLAP_DB, R2_TIMP_DB, R2_KAB_DB = 0.0, 0.0, 0.0   # R2: BOOM mid-body layer trims
R2_BUSY_DB = -2.5    # R2: toss run 0.54-0.95 and twirl gliss 3.75 (top phone-band windows after the BOOM)
R2_CLIP = {'sfx': float(os.environ.get('R2CS', -9.0)), 'music': float(os.environ.get('R2CM', -12.0))}   # R2: BOOM-window soft-clip threshold per group bus (dBFS, pre-master)
R2_RUN_DB = -1.5      # R2: stroke-run xylophone level (was +2 dB; jury P1 asks -3.5 dB)
BPM = C['bpm']; BEAT = 60 / BPM; A0 = C['bar_anchor']
SW = BEAT * 2 / 3          # swung off-beat position inside a beat (triplet swing)

m = mg.Mix(duration=10.0, bpm=BPM, anchor=A0)
m.group('music').level = -20
m.sfx_duck = 2.0

MAR = samples.inst('marimba')
PNO = samples.inst('piano')
VIB = samples.inst('vibraphone')
GLK = samples.inst('glock')


def xylo(note, vel=0.8, dur=0.35):
    """Xylophone: marimba sample (bright, short) + FM xylo attack layer."""
    a = MAR.play(note, dur=dur, vel=vel, release=0.12)
    b = fm.mallet(note, dur * 0.8, vel * 0.9, 'xylo')
    return mg.layer([(a, 0, 0, 0), (b, 0, -7, 0)])


def pz(note, dur=0.32, vel=0.8, seed=None):
    return pluck.pizz(note, dur, vel, seed=seed)


def upright(note, dur=0.45, vel=0.85):
    """Walking bass: pizz + woody FM body."""
    a = pluck.pizz(note, dur, vel)
    b = Sound(F.lpf(fm.bass(note, min(dur, 0.3), vel * 0.8, 'wood').data, 900)).fade(0.002, 0.08)
    return mg.layer([(a, 0, 0, 0), (b, 0, -6, 0)])


def piano(notes, vel=0.6, dur=0.3):
    return mg.layer([(PNO.play(n, dur=dur, vel=vel, release=0.15), 0.004 * i, 0, 0) for i, n in enumerate(notes)])


def vibes(notes, vel=0.5, dur=1.0):
    return mg.layer([(VIB.play(n, dur=dur, vel=vel, release=0.6), 0.006 * i, 0, 0) for i, n in enumerate(notes)])


# ------------------------------------------------------------------ tracks
tx = m.track('xylo', level=-23, sends={'room': -12, 'plate': -20}, pan=0.12)
tb = m.track('bass', level=-22, sends={'room': -18})
tp = m.track('piano', level=-27, sends={'room': -12, 'plate': -18}, pan=-0.15)
tv = m.track('vibes', level=-29, sends={'plate': -12}, pan=0.2)
tz = m.track('pizz', level=-25, sends={'room': -12})
tbr = m.track('brush', level=-29, sends={'room': -12}, pan=-0.25)
trd = m.track('ride', level=-32, sends={'room': -16}, pan=0.3)
tk = m.track('kick', level=-26)
tg = m.track('glock', level=-28, sends={'plate': -12}, pan=0.25)
tperc = m.track('perc', level=-24, sends={'room': -10})

# ------------------------------------------------------------------ pickup: tiptoe (0.0 – 0.33)
for t, n in [(0.0, 'C3'), (0.083, 'E3'), (0.167, 'G3'), (0.25, 'A#3')]:
    tz.add(pz(n, 0.14, 0.55), t, pan=-0.3)

# ------------------------------------------------------------------ ignition 'ta!' (0.5)
IG = C['ignite']
tp.add(piano(['F2', 'C3', 'F3', 'A3', 'D4'], 0.78, 0.9), IG)
tb.add(upright('F2', 0.6, 1.0), IG)
tg.add(GLK.play('F6', vel=0.8), IG)
tg.add(GLK.play('A6', vel=0.6), IG + 0.042)
# toss: xylophone flies up with the match, falls back down onto the box
up = ['C5', 'D5', 'E5', 'F5', 'G5', 'A5']
for i, n in enumerate(up):
    tx.add(xylo(n, 0.55 + 0.05 * i, 0.2), 0.542 + i * 0.036, gain=R2_BUSY_DB)   # R2: loudest phone-band window
down = ['A5', 'F5', 'D5', 'C5']
for i, n in enumerate(down):
    tx.add(xylo(n, 0.55, 0.2), 0.792 + i * 0.05, gain=R2_BUSY_DB)
tperc.add(samples.hit('woodblock', match='wood_click_f', vel=0.9), C['match_land'] - 0.005)
tb.add(upright('C3', 0.3, 0.8), C['match_land'])
tv.add(vibes(['A3', 'C4', 'D4', 'F4'], 0.42, 1.5), C['match_land'] + 0.02)

# ------------------------------------------------------------------ wake-up: every glance gets a note
tg.add(GLK.play('C6', vel=0.6), C['eyes_open'])
tg.add(GLK.play('F6', vel=0.7), C['eyes_open'] + 0.083)
tz.add(pz('A3', 0.2, 0.7), C['look_left'], pan=-0.6)
tz.add(pz('C4', 0.2, 0.7), C['look_right'], pan=0.6)
# crouch: chromatic tremolo creeping up (32nds)
for i, n in enumerate(['C4', 'C#4', 'D4', 'D#4']):
    tz.add(pz(n, 0.1, 0.5 + 0.1 * i), C['crouch'] + i * 0.0625)
tbr.add(drums.snare('brush', 0.5), C['crouch'])
for i in range(8):
    tbr.add(drums.snare('brush', 0.25 + 0.06 * i), C['crouch'] + 0.03125 * i)

# ------------------------------------------------------------------ groove (2.5 – 6.5)
LAND = C['land']
# chords (1 per 2 beats): F6 | D7 | Bb6 (ta-da, stop time) | C7 (spin build)
comp = {2.5: ['A3', 'C4', 'D4', 'F4'], 3.5: ['F#3', 'A3', 'C4', 'D4'], 4.5: ['A#3', 'D4', 'F4', 'G4'], 5.5: ['A#3', 'C4', 'E4', 'G4']}
# walking bass
walk = [(2.5, 'F2'), (3.0, 'A2'), (3.5, 'D3'), (4.0, 'F#2'), (4.5, 'A#2'), (5.0, 'A#2'), (5.25, 'B2')]
for t, n in walk:
    tb.add(upright(n, 0.42, 0.95 if t in (2.5, 4.5) else 0.82), t)
for i in range(8):  # chromatic climb under the spin (8ths)
    tb.add(upright(['C3', 'C#3', 'D3', 'D#3', 'E3', 'F3', 'F#3', 'G3'][i], 0.12, 0.7 + 0.04 * i), 5.5 + i * 0.125)
# kick 'bonk' on the landing + light two-feel
tk.add(drums.kick('soft', 1.0), LAND)
for t in (3.5,):
    tk.add(drums.kick('soft', 0.6), t)
# brushes on 2 & 4 + ride swing (ding, ding-a) — rests during the ta-da stop time
for b in (2.5, 3.5):
    tbr.add(drums.snare('brush', 0.75), b + BEAT)
for b in (2.5, 3.5, 5.0):
    for off, v in [(0, 0.7), (BEAT, 0.55), (BEAT + SW, 0.4)]:
        if b + off < 5.5:
            trd.add(drums.cymbal('ride', v), b + off)
# Charleston piano comp
for b, ch in comp.items():
    if b == 4.5:
        tp.add(piano(ch + ['D5'], 0.85, 0.9), b)          # ta-da stab (held through the stop)
        continue
    if b == 5.5:
        continue
    tp.add(piano(ch, 0.6, 0.22), b)
    tp.add(piano(ch, 0.5, 0.18), b + BEAT + SW - BEAT)    # swung '& of 1'
# xylophone tune (lands with the hops at 3.0 / 3.5 / 4.0)
tune = [(2.833, 'G5', 0.6), (3.0, 'F5', 0.85), (3.333, 'A5', 0.6), (3.5, 'C6', 0.85), (3.667, 'A5', 0.55)]
for t, n, v in tune:
    tx.add(xylo(n, v, 0.3), t)
for i, n in enumerate(['D5', 'F#5', 'A5', 'C6', 'D6']):   # twirl gliss
    tx.add(xylo(n, 0.55 + 0.05 * i, 0.16), C['twirl'][0] + i * 0.05, gain=R2_BUSY_DB)   # R2
tx.add(xylo('F#5', 0.85, 0.3), C['hops'][2])
for i in range(8):                                        # shimmy trill
    tx.add(xylo('A5' if i % 2 else 'F#5', 0.45, 0.12), 4.083 + i * 0.052)
tx.add(xylo('D6', 0.95, 0.6), C['tada'])
tg.add(GLK.play('D6', vel=0.7), C['tada']); tg.add(GLK.play('F6', vel=0.6), C['tada'] + 0.03)
tv.add(vibes(['A#3', 'D4', 'F4', 'G4'], 0.5, 1.2), C['tada'] + 0.01)
tx.add(xylo('F5', 0.7, 0.25), C['bounce'][0]); tx.add(xylo('G5', 0.7, 0.25), C['bounce'][1])
tz.add(pz('A#2', 0.2, 0.8), C['bounce'][0]); tz.add(pz('B2', 0.2, 0.8), C['bounce'][1])
# spin build: xylophone 16ths accelerating to 32nds, rising
spin = []
t = 5.5; k = 0
seqn = ['C5', 'E5', 'G5', 'A#5']
while t < 6.36:
    step = 0.125 if t < 6.0 else 0.0625
    spin.append((t, midi(seqn[k % 4]) + 12 * (k // 8 if t < 6.0 else 1) + (k // 4) % 2))
    t += step; k += 1
for i, (t, n) in enumerate(spin):
    tx.add(xylo(int(min(n, midi('C7'))), 0.45 + 0.4 * i / len(spin), 0.1), t)
tbr.add(drums.snare('brush', 0.4), 5.5)
for i in range(28):                                       # snare roll crescendo into the gap
    tt = 5.75 + i * (0.625 / 28)
    if tt < 6.36:
        tbr.add(drums.snare('tight', 0.15 + 0.6 * i / 28), tt, gain=-3.0 if tt >= 6.2 else 0.0)   # R2: last 8 hits -3 dB

# ------------------------------------------------------------------ BOOM (6.5)
B = C['burst']
tperc.add(samples.hit('timpani', vel=1.0), B - 0.004)
tp.add(piano(['F1', 'C2', 'F2', 'A2', 'C3', 'F3'], 1.0, 1.4), B)
tb.add(upright('F1', 0.8, 1.0), B)
m.track('crash', level=-24, sends={'hall': -14}).add(drums.crash(0.95), B)
tg.add(GLK.play('C7', vel=0.6), B + 0.02)
# debris tinkle falling
for i, n in enumerate(['F6', 'D6', 'C6', 'A5', 'F5', 'D5']):
    tg.add(GLK.play(n, vel=0.35 - 0.03 * i), 6.66 + i * 0.07)

# ------------------------------------------------------------------ the title is written (7.25 – 8.5)
strokes = C['strokes']
run = ['F4', 'A#4', 'D5', 'F5', 'A5', 'A#5', 'C6', 'E6', 'G6', 'A#6', 'A6']
for i, (t, n) in enumerate(zip(strokes, run)):
    last = i == len(strokes) - 1
    tx.add(xylo(n, 0.82 + 0.015 * i if not last else 0.98, 0.3 if not last else 0.9), t,
           gain=R2_RUN_DB + (-2.0 if abs(t - 7.875) < 0.01 else 0.0))   # R2: was gain=2 (dB)
    tg.add(GLK.play(n, vel=0.30 + 0.015 * i), t + 0.004)
tv.add(vibes(['A#2', 'F3', 'A3', 'D4'], 0.36, 0.8), 7.25)
tv.add(vibes(['C3', 'G3', 'A#3', 'E4'], 0.36, 0.55), 8.0)
for t, n in [(7.25, 'A#2'), (7.5, 'D3'), (7.75, 'F3'), (8.0, 'C3'), (8.25, 'E3')]:
    tb.add(upright(n, 0.3, 0.7), t)
for t in (7.5, 8.0):
    tbr.add(drums.snare('brush', 0.55), t)
for t in (7.25, 7.75, 7.75 + SW, 8.25, 8.25 + SW):
    trd.add(drums.cymbal('ride', 0.45), t)

# ------------------------------------------------------------------ button (8.5 – 10)
E = C['title_settle']
tp.add(piano(['F2', 'C3', 'A3', 'D4', 'G4', 'C5'], 0.8, 1.45), E)
tb.add(upright('F2', 0.9, 0.95), E)
tv.add(vibes(['A3', 'D4', 'G4', 'C5'], 0.55, 1.4), E + 0.01)
tg.add(GLK.play('A6', vel=0.7), E); tg.add(GLK.play('C7', vel=0.5), E + 0.04)
m.track('sus', level=-31, sends={'hall': -10}).add(samples.hit('suscymbal', match='hit_f1', vel=0.5), E)
# the wink: classic cartoon 'plink' ending
W = C['wink']
tz.add(pz('F4', 0.3, 0.85), W); tz.add(pz('F5', 0.3, 0.7), W + 0.004)
tg.add(GLK.play('F6', vel=0.6), W + 0.01)

# ------------------------------------------------------------------ SOUND DESIGN (sfx group)
FR = 1 / 24
# strike: gritty scrape left->right across the striker, then the phosphor catches
def scrape(dur=0.13, seed=3):
    n = int(dur * 48000)
    rng = np.random.default_rng(seed)
    x = rng.standard_normal(n)
    x = F.bpf(x, 2600, 7000)
    cr = (rng.random(n) < 0.012) * rng.standard_normal(n) * 6
    env = np.clip(np.arange(n) / (0.01 * 48000), 0, 1) * np.exp(-np.arange(n) / (0.22 * 48000))
    y = (x + F.hpf(cr, 1500)) * env
    st = np.stack([y * np.linspace(1.2, 0.5, n), y * np.linspace(0.5, 1.2, n)])
    return sfx._out(st, 0.0)
m.sfx(scrape(), at=C['strike_start'] - FR, gain=0)
m.sfx(sfx.whoosh(0.45, 'fire', direction=1, peak=0.12), at=IG, gain=-1, pan=0.35)
m.sfx(sfx.impact('soft', 0.6), at=IG - FR, gain=-6)
m.sfx(sfx.swish(0.25, direction=1), at=0.62, gain=-8, pan=0.3)
m.sfx(sfx.pop('soft', 1.2), at=C['eyes_open'], gain=-8)
m.sfx(sfx.click('soft'), at=C['blink'], gain=-12)
m.sfx(sfx.stretch(0.25, up=True), at=C['crouch'], gain=-10)
m.sfx(sfx.slide_whistle(True, 0.25, 650, 1900), at=C['jump'], gain=-5)
m.sfx(sfx.zip_(True, 0.12), at=C['jump'] - FR, gain=-8)
tz.add(pz('F3', 0.2, 0.9), C['jump'])
m.sfx(sfx.slide_whistle(False, 0.24, 700, 1900), at=C['jump'] + 0.25, gain=-7)
m.sfx(sfx.boing(0.9, 0.5), at=LAND - FR, gain=-5)
m.sfx(sfx.paper('slide', 0.25, seed=2), at=LAND, gain=-10)
for i, t in enumerate(C['hops']):
    m.sfx(sfx.pop('mouth', 0.9 + 0.1 * i), at=t - FR, gain=-9, pan=[-0.4, 0.4, 0][i])
m.sfx(sfx.swish(0.25, direction=-1), at=C['twirl'][0] + 0.12, gain=-9)
m.sfx(samples.hit('vibraslap', vel=0.8).loud(-18), at=4.0, gain=-8, pan=0.2)
m.sfx(sfx.sparkle(0.7, 22, key='F', mode='major_pentatonic', seed=4), at=C['sparkles'][0], gain=-6)
# spin: accelerating whooshes + riser into the gap
for i, t in enumerate([5.55, 5.8, 5.98, 6.12, 6.22]):
    m.sfx(sfx.whoosh(0.28 - 0.03 * i, 'air', direction=1 if i % 2 else -1, peak=0.5), at=t, gain=-10 + i)
m.sfx(sfx.riser(0.8, 'noise'), at=6.375, gain=-10)   # R2: -3 dB (was -7)
# the burst (hero)
m.sfx(sfx.impact('punch', 1.2), at=B, gain=2)
m.sfx(sfx.boom(1.6, 42), at=B, gain=-3)
m.sfx(sfx.pop('cork', 0.7), at=B, gain=-4)
m.sfx(sfx.whoosh(0.5, 'heavy', direction=-1, peak=0.2), at=C['box_blown'] + 0.05, gain=-6, pan=-0.5)
m.sfx(sfx.whoosh(0.4, 'swish', direction=1, peak=0.2), at=C['box_blown'] + 0.1, gain=-9, pan=0.5)
m.sfx(sfx.sparkle(0.9, 30, key='F', mode='major_pentatonic', seed=9), at=6.7, gain=-8)
dbr = C['burst_debris']
m.sfx(sfx.impact('punch', 0.6), at=dbr[0], gain=-3)
m.sfx(mg.layer([(drums.snare('tight', 1.0), 0, 0, 0), (sfx.click('hard'), 0, -4, 0)]).loud(-18), at=dbr[0], gain=3, pan=-0.3)
m.sfx(sfx.pop('cork', 1.4), at=dbr[1], gain=-8, pan=0.3)
m.sfx(sfx.pop('soft', 0.6), at=dbr[2], gain=2)
tperc.add(samples.hit('timpani', vel=0.8, pitch=-3), dbr[2] - 0.004)
tp.add(piano(['F1', 'F2', 'C3'], 0.8, 0.6), dbr[2])
m.sfx(sfx.whoosh(0.4, 'fire', direction=0, peak=0.1), at=dbr[2], gain=-9)
# fuse sizzles per stroke + little ticks
for i, t in enumerate(strokes):
    m.sfx(sfx.pen('marker', 0.12, seed=20 + i), at=t, gain=-15, pan=-0.4 + 0.08 * i)
m.sfx(sfx.shimmer_hit('A5'), at=E, gain=-5)
m.sfx(sfx.stamp('rubber'), at=E - FR, gain=-9)
for i, t in enumerate(C['letters']):
    m.sfx(sfx.pop('bubble', 1.3 + 0.12 * i), at=t, gain=-13, pan=-0.3 + 0.2 * i)
m.sfx(sfx.pen('marker', C['tagline'][1] - C['tagline'][0], seed=7), at=C['tagline'][0], gain=-12)
m.sfx(sfx.pop('mouth', 1.25), at=C['spirit_pop'] - FR, gain=-6, pan=0.35)
m.sfx(sfx.blip('C7', 'sine', 0.06), at=W, gain=-12, pan=0.35)
m.sfx(sfx.sparkle(0.8, 9, key='F', mode='major_pentatonic', seed=12), at=8.95, gain=-15)

# a held breath before the burst: the whole band drops out for 3 frames
m.mute(6.385, 0.11)
# the inhale: a reverse cymbal sucks the air in and STOPS at 6.44 -> true dead air 6.445-6.497 (R1 fix)
m.sfx(sfx.reverse_cymbal(0.5), at=6.44, gain=-7)
m.mute(6.444, 0.052, group='sfx')
# R1 dynamics: the spin build starts 6 dB down and crescendos, so the BOOM is the loudest moment of the film
m.group('music').automate('gain', [(0.0, 0.0), (5.46, 0.0), (5.5, -6.5), (6.0, -4.5), (6.3, -2.5), (6.38, -2.5), (6.49, 0.0), (10.0, 0.0)])
m.group('sfx').automate('gain', [(0.0, 0.0), (1.98, 0.0), (2.0, -3.0), (2.22, -3.0), (2.32, 0.0), (5.46, 0.0), (5.5, -6.5), (6.0, -4.5), (6.3, -2.5), (6.44, -2.5), (6.49, 0.0), (10.0, 0.0)])
# BOOM reinforcement: second timpani, 40-55 Hz sub-drop (250 ms), heavier punch
tperc.add(samples.hit('timpani', vel=1.0, pitch=-5), B - 0.004, gain=3)
m.sfx(sfx.sub_drop(0.26, 56.0, 40.0), at=B, gain=-1)  # R1s2: -4 dB so the limiter leaves room for the mid body
# END (R1): pull-back reveals the sheet on the peg bar; red loop drawn round the counter; thumb riffles the stack
m.sfx(sfx.paper('slide', 0.3, seed=5), at=C['pullback'], gain=-11, pan=0.1)
m.sfx(sfx.paper('flip', 0.1, seed=6), at=C['pullback'] - 0.01, gain=-6, pan=0.1)
tz.add(pz('C4', 0.2, 0.75), C['pullback'], pan=0.2)
m.sfx(sfx.pen('marker', 0.16, seed=31), at=C['loop'], gain=-13, pan=0.45)
for i in range(6):
    m.sfx(sfx.paper('flip', 0.09, seed=40 + i), at=C['riffle'][0] + i / 24, gain=-9 + i * 0.4, pan=0.5)
# R1s2: the stack snaps flat when the thumb lets go -> a crisp paper slap + pizz tick (makes 9.542 an audible hit)
m.sfx(sfx.paper('flip', 0.06, seed=77), at=C['riffle'][1] - 0.004, gain=-3, pan=0.45)
m.sfx(sfx.click('soft'), at=C['riffle'][1], gain=-6, pan=0.5)
tz.add(pz('G4', 0.16, 0.8), C['riffle'][1], pan=0.35)
# R1s2 phone-speaker check: the BOOM lived almost entirely below 70 Hz. In a 350 Hz-7 kHz band (phone speaker)
# it measured -24 dB vs -20.5 for the build and -15 for the stroke-writing run, i.e. the hero hit vanished on a phone.
# Add a mid/high body that a small speaker can play: big-band style piano stab up top, a snare+click crack, a
# louder crash, and a crackle of firecracker pops through the debris. Pull the stroke-writing run down 2.5 dB and the
# crouch tremolo (1.75-2.0, the loudest phone-band window) down 4.5 dB; sub-drop -4 dB so the limiter leaves room for mids.
tp.add(piano(['F4', 'A4', 'C5', 'F5', 'A5', 'C6'], 1.0, 0.9), B, gain=7)
m.sfx(mg.layer([(drums.snare('tight', 1.0), 0, 0, 0), (sfx.click('hard'), 0, -2, 0), (drums.snare('tight', 0.9), 0.012, -4, 0)]).loud(-14), at=B, gain=8)
m.track('crash2', level=-16, sends={'hall': -12}).add(drums.crash(1.0), B + 0.004)
m.sfx(sfx.impact('cinematic', 0.8), at=B, gain=-2)
for i in range(9):
    m.sfx(sfx.pop('cork' if i % 3 else 'soft', 1.6 + 0.35 * ((i * 7) % 5)), at=6.54 + 0.043 * i + 0.012 * ((i * 5) % 3), gain=-6 - 0.9 * i, pan=(-0.6 + 0.15 * ((i * 4) % 9)))
m.group('music').automate('gain', [(0.0, 0.0), (1.70, 0.0), (1.75, -4.5), (1.985, -4.5), (2.0, -3.0), (2.22, -3.0), (2.32, 0.0),
    (4.96, 0.0), (5.0, -2.5), (5.46, -2.5), (5.5, -7.0), (6.0, -5.0), (6.2, -3.5), (6.38, -5.0), (6.49, 0.0),
    (7.2, 0.0), (7.3, -2.5), (8.45, -2.5), (8.55, 0.0), (10.0, 0.0)])
# ------------------------------------------------------------------ R2 (REVIEW_2 P1): the BOOM must win on a phone
# Jury (4-pole 350 Hz HPF + 9 kHz LPF): BOOM -16.8 < riser -16.0 < 7.88 xylo -13.5. The body of the hit lived < 200 Hz.
# 1) sfx bed: 5.0-5.5 -2.5 dB, riser/roll 6.25-6.38 a further -3 dB (the approach must not out-shout the hit)
m.group('sfx').automate('gain', [(0.0, 0.0), (1.98, 0.0), (2.0, -3.0), (2.22, -3.0), (2.32, 0.0), (4.96, 0.0), (5.0, -2.5),
    (5.46, -2.5), (5.5, -7.0), (6.0, -5.0), (6.2, -4.0), (6.3, -5.5), (6.44, -5.5), (6.49, 0.0), (10.0, 0.0)])
# 2) mid-band body for the BOOM on its own bus: squeezed (comp + tanh) so its 200 ms RMS is dense, not just peaky
from mgaudio.core import SR as _SR
def _kaboom(dur=0.42, f0=400.0, f1=140.0, seed=11):
    """Cartoon 'KA-BOOM' body in the 150-400 Hz band: falling tone + filtered noise, 4 dB of drive."""
    n = int(dur * _SR); tt = np.arange(n) / _SR
    f = f1 + (f0 - f1) * np.exp(-tt / 0.07)
    ph = 2 * np.pi * np.cumsum(f) / _SR
    rng = np.random.default_rng(seed)
    nz = F.bpf(rng.standard_normal(n), 150, 520)
    env = np.clip(tt / 0.003, 0, 1) * np.exp(-tt / 0.16)
    y = (np.sin(ph) + 0.35 * np.sin(2 * ph + 0.4) + 0.8 * nz / (np.std(nz) + 1e-9) * 0.35) * env
    y = np.tanh(y * 1.6) / np.tanh(1.6)
    return Sound(np.stack([y, _delay_s(y, 0.004)]))
def _delay_s(y, d):
    k = int(d * _SR); return np.concatenate([np.zeros(k), y[:len(y) - k]])
_timp = samples.hit('timpani', vel=1.0)
_td = np.asarray(_timp.data, dtype=np.float64)
_td = fx.tape(_td, drive_db=9.0, wow=0.0, flutter=0.0, hiss_db=-120.0)
_td = F.bpf(_td, 200, 2000, order=2)
_timp_mid = Sound(_td, _timp.sync).loud(-16)
_clap = mg.layer([(drums.clap('808', 1.0), 0, 0, 0), (drums.clap('808', 0.9), 0.009, -3, 0)]).loud(-15)
tbm = m.track('boom_mid', group='sfx', level=None, sends={'room': -14},
              fx=[lambda x: fx.compress(x, thr=-26.0, ratio=4.0, attack=0.004, release=0.09, makeup=6.0),
                  lambda x: fx.saturate(x, drive_db=4.0, kind='tanh')])
tbm.add(_clap, B - 0.002, gain=R2_CLAP_DB)
tbm.add(_timp_mid, B - 0.004, gain=R2_TIMP_DB)
tbm.add(_kaboom().loud(-16), B, gain=R2_KAB_DB)
tbm.add(_kaboom(0.3, 520, 190, seed=12).loud(-18), B + 0.083, gain=R2_KAB_DB - 3)   # second 'boom' of KA-BOOM
# 3) the real reason the BOOM lost: the master's lookahead limiter took ~13 dB of gain reduction across the whole
#    200 ms hit window (sfx bus peaked at +10 dBFS pre-master), ducking the hit's own mids. A region-limited tanh
#    clipper on each group bus (6.47-6.95 s, 6 ms fades) turns those peaks into dense 1-4 kHz harmonics instead, so
#    the limiter barely works and the hit keeps its level on a phone.
def _hit_clip(c_db, a=6.47, b=6.95, fade=0.006):
    c = 10 ** (c_db / 20)
    def fn(x):
        x = np.asarray(x, dtype=np.float64)
        n = x.shape[-1]; tt = np.arange(n) / 48000.0
        w = np.clip(np.minimum((tt - a) / fade, (b - tt) / fade), 0, 1)
        return x * (1 - w) + w * (c * np.tanh(x / c))
    return fn
for _g, _c in R2_CLIP.items():
    m.group(_g).insert(_hit_clip(_c))
res = m.export(os.path.join(HERE, 'out/audio.wav'), tp=-1.6, spectrogram=os.path.join(HERE, 'out/audio_spec.png'))
# R2 s1 (REVIEW_2 P1): post-master hit maximiser, see tools/hitmax.py (mid lift + oversampled clip inside the BOOM
# window only, 1-1.5 dB dips on competing phone-band moments, LUFS re-trim, TP limiter). audio_premax.wav keeps the input.
import shutil as _sh, importlib.util as _ilu, soundfile as _sf1
from mgaudio import master as _MS
_sh.copy(os.path.join(HERE, 'out/audio.wav'), os.path.join(HERE, 'out/audio_premax.wav'))
_spec = _ilu.spec_from_file_location('hitmax', os.path.join(HERE, 'tools/hitmax.py')); _hm = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_hm)
_x1, _sr1 = _sf1.read(os.path.join(HERE, 'out/audio_premax.wav'), always_2d=True)
_y1 = _hm.finish(_hm.process(_x1.T, _sr1))
_MS.write(os.path.join(HERE, 'out/audio.wav'), _y1)
res['lufs'], res['true_peak'] = round(_MS.lufs(_y1), 2), round(_MS.true_peak(_y1), 2)
for _k, _v in _hm.windows(_y1, _sr1).items():
    print(f'HITMAX {_k}: BOOM(6.50-6.70) {_v[0]}  margin {_v[2]:+.1f} dB  others {_v[3]}')
m.report()
print({k: res[k] for k in ('duration', 'lufs', 'true_peak', 'warnings') if k in res})
hits = [C['strike_start'], IG, C['match_land'], C['jump'], LAND, *C['hops'], C['tada'], B, *strokes, E, C['spirit_pop'], W]
print(mg.hit_alignment(os.path.join(HERE, 'out/audio.wav'), hits))

# R1: dynamic-contrast check (RMS dBFS windows) on the mastered file
import soundfile as _sf, numpy as _np
_y, _sr = _sf.read(os.path.join(HERE, 'out/audio.wav'))
def _rms(a, b):
    seg = _y[int(a * _sr):int(b * _sr)]
    return round(20 * _np.log10(_np.sqrt(_np.mean(seg ** 2)) + 1e-12), 1)
_st = [(round(a, 2), _rms(a, a + 0.2)) for a in _np.arange(0.0, 9.8, 0.05)]
_top = sorted(_st, key=lambda q: -q[1])[:4]
print({'build_5.5-6.38': _rms(5.5, 6.38), 'build_5.5-5.8': _rms(5.5, 5.8), 'build_6.05-6.25': _rms(6.05, 6.25),
       'gap_6.45-6.49': _rms(6.45, 6.489), 'boom_6.50-6.70': _rms(6.5, 6.7), 'loudest_200ms': _top})

# R2: jury-matched phone-band check (4-pole Butterworth HPF 350 Hz + 4-pole LPF 9 kHz), 200 ms windows / 50 ms hop
from scipy.signal import butter as _bu, sosfilt as _sosf
_mono = _y.mean(axis=1) if _y.ndim == 2 else _y
_ph = _sosf(_bu(4, 9000, 'lp', fs=_sr, output='sos'), _sosf(_bu(4, 350, 'hp', fs=_sr, output='sos'), _y, axis=0), axis=0)
def _win(sig, a, b):
    seg = sig[int(a * _sr):int(b * _sr)]
    return 20 * _np.log10(_np.sqrt(_np.mean(seg ** 2)) + 1e-12)
for _nm, _sig in (('FULL', _y), ('PHONE', _ph)):
    _ws = [(round(a, 2), round(_win(_sig, a, a + 0.2), 1)) for a in _np.arange(0.0, 9.81, 0.05)]
    _bm = max(v for a, v in _ws if 6.45 <= a <= 6.60)
    _oth = sorted([(a, v) for a, v in _ws if a < 6.30 or a >= 6.75], key=lambda q: -q[1])[:6]
    print(f'{_nm}: BOOM {_bm:.1f}  margin {_bm - _oth[0][1]:+.1f} dB  top others {_oth}')

if os.environ.get('R2DBG'):
    _bp = lambda x: _sosf(_bu(4, 9000, 'lp', fs=48000, output='sos'), _sosf(_bu(4, 350, 'hp', fs=48000, output='sos'), x, axis=-1), axis=-1)
    for (a, b) in ((6.5, 6.7), (3.85, 4.05), (0.65, 0.85)):
        rows = []
        for k, v in m.stems.items():
            seg = _np.asarray(v)[..., int(a * 48000):int(b * 48000)]
            rows.append((k, round(20 * _np.log10(_np.sqrt(_np.mean(_bp(seg) ** 2)) + 1e-12), 1), round(20 * _np.log10(_np.sqrt(_np.mean(seg ** 2)) + 1e-12), 1)))
        rows.sort(key=lambda r: -r[1])
        print((a, b), 'phone/full per stem:', rows[:9])
    _mix = sum(_np.asarray(v) for k, v in m.stems.items() if k.startswith('group.'))
    for (a, b) in ((6.5, 6.7), (3.85, 4.05), (0.65, 0.85), (8.45, 8.65)):
        pre = 20 * _np.log10(_np.sqrt(_np.mean(_mix[..., int(a * 48000):int(b * 48000)] ** 2)) + 1e-12)
        post = _rms(a, b)
        print('window', (a, b), 'pre-master', round(pre, 1), 'post', post, 'delta', round(post - pre, 1))
