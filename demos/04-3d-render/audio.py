"""Soundtrack for 'soft.'  —  python3 audio.py  ->  out/audio.wav (+ out/audio_spec.png)
120 bpm, F major, vi9 - IVmaj9 - V6/9 | Imaj9 (hero) | Imaj9 (tagline).  Timing from cues.json + out/events.json
(the physics sim writes the exact contact / landing times, so every thud is frame-locked to its picture)."""
import sys, json, os
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'lib', 'audio'))
import mgaudio as mg
from mgaudio import sfx, drums, synth, seq, fm, samples, theory
from mgaudio.recipes import Form, bass_events, comp_events
from mgaudio.recipes.base import LV, new_mix, place_segments

HERE = os.path.dirname(os.path.abspath(__file__))
C = json.load(open(f'{HERE}/cues.json'))
E = json.load(open(f'{HERE}/out/events.json'))
FPS = C['fps']
TH, OUT = C['hero'], C['outro']
rng = np.random.default_rng(11)

f = Form(duration=10.0, bpm=120, drop=TH, build=C['build'], outro=OUT, key='F', mode='major',
         prog='Imaj9 vi9 IVmaj9 V6/9', final='Imaj9', chord_beats=4, octave=4)
m = new_mix(f, music_level=-20.5, sfx_duck=2.5, master=dict(air=1.5, warmth=1.0))
g = m.grid
B, Dp, O, END = f.build, f.drop, f.outro, f.end
print(f.summary())

# ---------------------------------------------------------------- music bed
# airy pad through the whole piece, filter opens toward the hero
pad = m.track('pad', level=LV['pad'] - 1.5, sends={'big': -7}, hp=240)
place_segments(pad, f, 0.0, END, lambda v, d: synth.pad(v, d, 0.7, 'air', attack=min(0.6, d * 0.3), release=1.6))
pad.automate('lpf', [(0, 1800), (B, 3200), (Dp, 12000), (END, 12000)])
glass = m.track('glass', level=LV['pad'] - 4, sends={'shimmer': -9}, hp=300)
place_segments(glass, f, 0.0, END, lambda v, d: synth.pad([n + 12 for n in v[-3:]], d, 0.55, 'glass', attack=0.4, release=1.8))
glass.automate('gain', [(0, -8), (B, -4), (Dp, 0), (END, 0)])

# bubbly kalimba arpeggio: the 'satisfying' ear-candy (8ths intro, 16ths in the drop)
kal = samples.inst('kalimba') if samples.available('kalimba') else None
ar = m.track('kalimba', level=LV['bells'] + 1.5, sends={'delay': -9, 'plate': -12}, pan=0.08)
def kalimba(n, d, v):
    return kal.play(n, None, v) if kal else fm.mallet(n, 0.6, v, 'kalimba')
for t, n, d, v in seq.arp(g, lambda t: f.chord_at(t, 12), 0.0, Dp, div=8, pattern='updown', octaves=1, gate=1.0, vel=0.55,
                          accents='x...'):
    ar.add(kalimba(n, d, v), t, pan=float(np.sin(t * 2.3)) * 0.45)
for t, n, d, v in seq.arp(g, lambda t: f.chord_at(t, 12), Dp, O, div=16, pattern='up', octaves=2, gate=1.0, vel=0.5,
                          accents='x..x..x.'):
    ar.add(kalimba(n, d, v), t, pan=float(np.sin(t * 3.1)) * 0.6)
ar.automate('gain', [(0, -3), (B, 0), (O, -2), (END, -6)])

# marimba chord comps from bar 2 (soft, round)
mar = samples.inst('marimba') if samples.available('marimba') else None
mk = m.track('marimba', level=LV['keys'] - 3, sends={'plate': -10}, hp=150)
for t, v, d, vel in comp_events(f, g, 2.0, O, 'x..x..x...x.....', vel=0.5, gate=1.0):
    for k, n in enumerate(v[-3:]):
        mk.add(mar.play(n, None, vel * (0.8 + 0.1 * k)) if mar else fm.mallet(n, 0.8, vel, 'marimba'), t + 0.004 * k)
mk.automate('gain', [(0, -6), (B, -2), (Dp, 0), (END, 0)])

# sub + round bass: enters at the build, bounces in the drop
sub = m.track('sub', level=LV['sub'] - 1)
for a, b_, v, s in f.segments(B, END):
    sub.add(synth.bass(f.bass_at(a, 2), b_ - a, 0.7, 'sub'), a)
sub.automate('gain', [(0, -10), (B, -8), (Dp, 0), (END, 0)])
bs = m.track('bass', level=LV['bass'] - 1.5)
for t, n, d, v in bass_events(f, g, Dp, O, '..r...r...r.o.r.', octave=2, vel=0.85, gate=0.55):
    bs.add(synth.bass(n, d, v, 'pluck'), t)

# drums: the letters ARE the kick in bar 1 (see SFX); soft groove from the build
kick = lambda v=1.0: drums.kick('soft', v, tune=-1)
kk = m.track('kick', level=LV['kick'] - 1)
kk.loop(kick, 'x.......x.......', B, Dp)                      # half-time in the build
kk.loop(kick, 'x...x...x...x...', Dp, O)
kk.add(kick(0.9), O)
bs.duck(by='kick', depth=5, release=0.12); sub.duck(by='kick', depth=4, release=0.15); pad.duck(by='kick', depth=2)
m.track('snap', level=LV['clap'] - 3, sends={'plate': -10}).loop(lambda v: drums.snap(v), '....x.......x...', B, O)
m.track('clap', level=LV['clap'] - 2, sends={'plate': -12}).loop(lambda v: drums.clap('tight', v), '....x.......x...', Dp, O)
m.track('shaker', level=LV['shaker'] + 1, pan=0.3).loop(lambda v: drums.shaker(v), 'x.xxx.xxx.xxx.xx', 2.0, O, vel=0.55,
                                                       vel_jitter=0.2)
m.track('hat', level=LV['ohat'], pan=-0.2).loop(lambda v: drums.hat('open', v, decay=0.12), '..x...x...x...x.', Dp, O)
# riser + reverse swell into the hero, crash-free (soft world): a shimmer bloom instead
m.track('riser', level=LV['riser'] - 1).add(sfx.riser(Dp - B, 'noise', intensity=0.8), Dp)
m.track('swell', level=LV['fx'] + 1).add(sfx.swell(synth.pad(f.chord_at(Dp, 12), 1.0, 0.8, 'glass', attack=0.01), decay=1.6), Dp)
m.track('bloom', level=LV['fx'] + 1, sends={'shimmer': -6}).add(sfx.shimmer_hit(f.chord_at(Dp)[-1] + 12), Dp)
# ending: sustained final chord (kalimba roll + glass) under the tagline
fin = m.track('final', level=LV['bells'] + 2, sends={'hall': -6})
for k, n in enumerate(sorted(f.chord_at(O, 12))):
    fin.add(kalimba(n, None, 0.55 - 0.05 * k), O + 0.035 * k)

# dynamics: intro breathes, the hero lifts
m.group('music').automate('gain', [(0, -3.0), (0.45, -3.0), (0.5, -2.0), (B, -1.5), (Dp - 0.02, -1.0), (Dp, 0.5), (O, 0.0), (END, 0.0)])

# ---------------------------------------------------------------- sound design locked to the picture
fr1 = 1.0 / FPS
# r1: 0.5 the 's' lands in the macro and fires the ping; the camera is kicked back by it (soft air pull-back)
m.sfx(sfx.whoosh(1.1, 'soft', direction=-1, peak=0.18), at=C['camA'][0] + 0.02, gain=-5, verb=-14)
m.sfx(sfx.chime([f.chord_at(0.5, 24)[i] for i in (0, 2, 3)], step=0.06, kind='celesta'), at=C['ping'] + 0.03, gain=-7, verb=-8)
m.sfx(sfx.bubble(1.6, rise=1.2), at=C['ping'] + 0.02, gain=-7)

# letter drops: fall whoosh -> thud (soft kick + gloop + squelch), pitch walks up s-o-f-t; rebound = bubble pop
pans = {'s': -0.35, 'o': -0.12, 'f': 0.1, 't': 0.3}
for i, ch in enumerate('soft'):
    cts = E['letter_contacts'][ch]
    t1, t2, t3 = cts[0][0], cts[1][0], cts[-1][0]          # drop, rebound hop, hero hop landing (r2: lift landing = cts[2])
    p = pans[ch]
    m.sfx(sfx.whoosh(0.45, 'swish', direction=-1, peak=0.85, seed=10 + i), at=t1 - 0.05, gain=-12, pan=p)
    thud = mg.layer([(drums.kick('soft', 1.0, tune=-3 + 1.5 * i).loud(-18), 0.0, 0.0, 0.0),
                     (sfx.gloop(0.9 + 0.12 * i, 0.28, seed=20 + i), 0.0, -3.0, 0.0),
                     (sfx.squelch(0.22, seed=30 + i), 0.012, -9.0, 0.0)])
    m.sfx(thud.loud(-18), at=t1 - fr1 * 0.5, gain=1.0, pan=p, verb=-16)
    m.sfx(sfx.pop('bubble', pitch=1.0 + 0.1 * i), at=t2 - fr1 * 0.5, gain=-6, pan=p, verb=-14)
    # hero hop landing (after the shockwave)
    m.sfx(sfx.squelch(0.18, seed=40 + i), at=t3, gain=-9, pan=p)
    m.sfx(sfx.pop('soft', pitch=0.8 + 0.08 * i), at=t3, gain=-8, pan=p)

# r2 build: the counter-sweep re-lifts the word in reading order on the 16ths -> rising bubble pops, soft touchdowns
for i, ch in enumerate('soft'):
    l0, l1 = E['lift'][ch][0], E['lift'][ch][1]
    m.sfx(sfx.pop('bubble', pitch=1.25 + 0.14 * i), at=l0, gain=-8, pan=pans[ch], verb=-14)
    m.sfx(sfx.pop('soft', pitch=1.0 + 0.1 * i), at=l1 - fr1 * 0.5, gain=-12, pan=pans[ch])
    m.sfx(sfx.squelch(0.12, seed=50 + i), at=l1, gain=-16, pan=pans[ch])

# anticipation: capsules tremble under the incoming shadow -> accelerating wood-tick roll (5.0 -> 5.95)
for t in seq.roll(C['tremble'][0], C['hang'][0] + 0.04, 8, 32, g, 0.25, 0.9):
    tt, v = (t if isinstance(t, (float, int)) else t[0]), (0.6 if isinstance(t, (float, int)) else t[1])
    m.sfx(sfx.tick('wood'), at=float(tt), gain=-20 + 10 * float(v), pan=0.35 + 0.1 * rng.uniform(-1, 1))
# r1: the chrome period enters fast (5.30), decelerates into the hang (5.80-5.93) = the world holds its breath,
# then slams (contact 5.975, first contact frame 144 = 6.000). Heavy whoosh ends into a 3-frame dead silence.
m.sfx(sfx.whoosh(0.6, 'heavy', direction=-1, peak=0.35, seed=5), at=C['ball_enter'] - 0.08, gain=-7, pan=0.3)
b1, b2 = E['ball_contacts'][0][0], E['ball_contacts'][1][0]
for gname in list(m.groups):
    m.mute(5.875, b1 - 5.875 + 0.004, group=gname)        # <= -40 dBFS for 5.875 -> contact
# HERO: heavy chrome ball into the soft world — thud + boom + gloop; transient on frame 144 (onset 5.98, peak ~6.0)
m.sfx(sfx.impact('thud', size=1.4), at=b1 + 0.005, gain=3, pan=0.25, verb=-8)
m.sfx(sfx.boom(2.2, 44), at=b1 + 0.005, gain=-2)
m.sfx(sfx.gloop(0.55, 0.5, seed=3), at=b1 + 0.01, gain=-4, pan=0.25)
m.sfx(mg.layer([(drums.kick('soft', 0.8, tune=4).loud(-18), 0, 0, 0), (sfx.click('wood'), 0, -8, 0)]).loud(-18),
      at=b2 - fr1 * 0.5, gain=-6, pan=0.25)          # rebound touchdown
m.sfx(sfx.whoosh(1.4, 'air', direction=1, peak=0.25, seed=8), at=TH + 0.3, gain=-9)   # shockwave air rush

# r2 crown hang: 3-frame reverse-reverb swell INTO the apex freeze, the groove stops for the held frames (stop-time),
# the rain (landing clicks below, on the field clock) resumes exactly as the remap ends
CH0, CH1 = C['crown_hang']
m.sfx(sfx.swell(sfx.shimmer_hit(f.chord_at(CH0)[-1] + 12), decay=0.14), at=CH0 + 0.06, gain=-5, verb=-8)
m.sfx(sfx.bubble(0.5, rise=1.8), at=CH0 + 0.06, gain=-10, pan=0.25)
m.mute(CH0 + 0.08, CH1 - CH0 - 0.10, group='music')
m.sfx(sfx.whoosh(0.35, 'air', direction=-1, peak=0.8, seed=12), at=CH1 - 0.22, gain=-13)

# capsule rain: every flip-hop landing is a tiny click; sample visible landings (seeded), density follows the sim
land = np.array(E['pill_land'])
land = land[(land < 8.9)]
sel = np.sort(rng.choice(land, size=min(150, len(land)), replace=False))
for k, t in enumerate(sel):
    decay = np.exp(-(t - TH) / 1.6)
    s = sfx.click('soft') if k % 3 else sfx.pop('soft', pitch=rng.uniform(1.6, 2.6))
    m.sfx(s, at=float(t), gain=float(-19 + 6 * decay + rng.uniform(-3, 1)), pan=float(rng.uniform(-0.8, 0.8)))
m.sfx(sfx.bubbles(1.4, 22, size=(0.25, 0.7), seed=4), at=TH + 0.35, gain=-12, verb=-12)

# tagline: shimmer in key + airy tail
m.sfx(sfx.shimmer_hit(f.chord_at(O)[-1] + 12), at=C['tagline'], gain=-6, verb=-6)
m.sfx(sfx.sparkle(1.5, 14, 'F', 'major_pentatonic', seed=2), at=C['tagline'] + 0.05, gain=-12, verb=-10)

res = m.export(f'{HERE}/out/audio.wav', lufs=-14, tp=-1, spectrogram=f'{HERE}/out/audio_spec.png')
m.report()
print({k: res[k] for k in ('duration', 'lufs', 'true_peak', 'bands', 'warnings') if k in res})
hits = [E['letter_contacts'][c][0][0] for c in 'soft'] + [b1]
print('alignment', mg.hit_alignment(f'{HERE}/out/audio.wav', hits))
