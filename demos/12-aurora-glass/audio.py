#!/usr/bin/env python3
"""Soundtrack for 12-aurora-glass — "Aurora, think in light".

Ambient-glass cue at 80 bpm in E major (bar = 3 s, bar 0 = the drop at 6.0 s):
  I - vi - IV - V (intro, 1.5 s per chord)  ->  I at the drop (the lens crosses the reply)  ->  vi  ->  I (final, 8.25 s).
FM glass pad + air pad, celesta/glock arpeggio into ping-pong delay + shimmer, a slow sub swell, a reverse swell
into the drop, a written celesta motif, and a 4-note sonic logo when the glass "o" settles into the wordmark.
Sound design (all from cues.json): card arrivals (air), bubble pop, streamed-reply blips in key, toggle, the knob
turning to glass (glass tick), the droplet neck snapping (liquid bloop), the lens glide (air whoosh), cards receding,
letters (sparkle) and the settle (shimmer + chime).
Also writes out/env.json: a 100 Hz loudness envelope that drives the voice-card waveform (picture follows the music).
"""
import sys, json, os
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'lib', 'audio'))
import mgaudio as mg
from mgaudio import recipes, sfx, synth, fm, theory, seq
from mgaudio import samples as SM
from mgaudio.recipes import place_segments
from mgaudio import filters as F
from mgaudio.core import Sound, noise_st

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
os.makedirs(OUT, exist_ok=True)
cues = json.load(open(os.path.join(HERE, 'cues.json')))
DROP, SETTLE = cues['drop'], cues['orb_settle']

m = recipes.ambient(bpm=cues['bpm'], key='E', mode='major', prog='Imaj9 vi9 IVmaj9 V6/9', drop=DROP, outro=SETTLE,
                    flavor='glass', chord_beats=2, final='Imaj9')
f, g = m.form, m.grid
print(f.summary())
for s in f.segments(0, 10):
    print('  chord', s)

# ---- r2: revoice the pad and the arpeggio up an octave (low-mid 60 % -> ~50 %); the sub swell keeps the weight
def revoice(v):
    return [n + 12 for n in v]      # the same Emaj9 voicing, one octave up
print('  pad voicing', f.chord_at(0.5), '->', revoice(f.chord_at(0.5)))
m['pad'].clips = []
place_segments(m['pad'], f, 0.0, f.end, lambda v, d: synth.pad(revoice(v), d, 0.75, 'glass', attack=min(0.5, d * 0.3), release=1.8))
m['pad'].hp = 220          # r2: HPF the pad at 220 Hz (12 dB/oct)
m['bells'].clips = []
_ins = SM.inst('glock') if SM.available('glock') else None
for t_, n_, d_, v_ in seq.arp(g, lambda t: f.chord_at(t, 24), 0.0, f.outro, div=8, pattern='updown', octaves=1, gate=1.0, vel=0.55, accents='x...'):
    snd = _ins.play(n_, None, v_) if (_ins and n_ >= 79) else fm.bell(n_, 1.4, v_, 'celesta')
    m['bells'].add(snd, t_, pan=float(np.sin(t_ * 2.1)) * 0.5)

# the recipe's arpeggio is a touch busy under UI ticks: keep it, but lower and let it bloom at the drop
m['bells'].gain = -3.5
m['bells'].automate('gain', [(0, -6), (3.0, -4.5), (DROP, -1), (SETTLE, -2), (10, -4)])
m['pad'].gain = -1.0
m['sparkle'].gain = -2
# round 1 mix: clear the low-mid mud, open the top (glass should sound like glass)
m['pad'].insert(lambda a: F.eq(a, [('pk', 350, -4.5, 0.8), ('pk', 750, -4.0, 0.7), ('pk', 180, -1.5, 0.9), ('pk', 1300, -2.0, 0.8)]))  # r1s2: deeper low-mid carve
for name in ('pulse', 'swell', 'bloom'):
    m[name].insert(lambda a: F.eq(a, [('pk', 500, -3.0, 0.6), ('hs', 5000, 2.0)]))
m['air'].insert(lambda a: F.eq(a, [('pk', 350, -3.0, 0.8), ('pk', 800, -2.5, 0.7), ('hs', 6000, 2.0)]))
HI = [('pk', 700, -2.0, 0.7), ('hs', 3000, 2.5), ('hs', 8000, 3.5)]  # r1s2: thin the bell fundamentals, open the top
for name in ('bells', 'sparkle'):
    m[name].insert(lambda a: F.eq(a, HI))
m['bells'].gain = -2.0
# dynamics: the intro breathes in, the drop opens up, the logo rings out
# r2: intro -1.5 dB more, the drop +1 dB (6.0-7.5), the logo +0.5 dB: contrast back above v1
m.group('music').automate('gain', [(0, -3.3), (1.5, -2.5), (4.5, -2.3), (5.9, -2.6), (6.05, 1.0), (7.5, 1.0), (8.2, 0.0), (8.3, 1.0), (10, 0.5)])
m['pad'].automate('lpf', [(0, 1800), (3.0, 3500), (5.9, 6000), (6.05, 14000), (10, 14000)])

# ---- a written celesta motif (answers the arpeggio; lands on the drop and on the logo)
PRES = HI + [('pk', 3500, 2.0, 1.0)]   # r2: presence on the melody and the logo only
mel = m.track('motif', level=-24, sends={'delay': -8, 'shimmer': -10}, pan=-0.15, fx=[lambda a: F.eq(a, PRES)])
motif = [(1.50, 'B5', 0.9, 0.55), (2.25, 'G#5', 0.7, 0.45), (3.00, 'F#5', 1.2, 0.5), (4.50, 'D#6', 0.6, 0.45),
         (5.25, 'C#6', 0.7, 0.5), (DROP, 'B5', 1.8, 0.62), (7.50, 'G#5', 0.8, 0.45)]
for t, n, d, v in motif:
    mel.add(fm.bell(theory.midi(n), d + 1.0, v, 'celesta'), t)

# ---- sonic logo: glass "o" settles -> E6 G#6 B6 E7
logo = m.track('logo', level=-23, sends={'shimmer': -6, 'hall': -8}, fx=[lambda a: F.eq(a, PRES)])
for i, n in enumerate(['E6', 'G#6', 'B6', 'E7']):
    logo.add(fm.bell(theory.midi(n), 2.6 - 0.3 * i, 0.62 - 0.06 * i, 'celesta'), SETTLE + 0.085 * i)

# the ring glint: one last celesta E7 rings across the glass "o"
logo.add(fm.bell(theory.midi('E7'), 1.6, 0.5, 'celesta'), cues['final_note'])

# ---- "the light turns gold": a soft C#7 shimmer (0.4 s attack) blooms inside the lens
gold = m.track('gold', level=-27, sends={'shimmer': -4, 'hall': -8}, pan=0.1, fx=[lambda a: F.eq(a, [('hp', 900), ('hs', 8000, 3.0)])])
gold.add(synth.pad([theory.midi('C#7'), theory.midi('G#6')], 2.2, 0.55, 'glass', attack=0.4, release=1.2), cues['gold'][0])

# ---- air layer: high, quiet noise that opens at the drop (presence / air for the glass)
n = int(48000 * 10.0)
hiss = F.eq(noise_st(n, 'white', seed=21, corr=0.2) * 0.25, [('hp', 7000), ('hp', 7000), ('lp', 16000)])
env = np.interp(np.arange(n) / 48000., [0, 5.7, 6.1, 8.2, 9.0, 10.0], [0.25, 0.3, 1.0, 0.75, 0.9, 0.0])
air = m.track('airhiss', level=-27, width=1.0)
air.add(Sound(hiss * env), 0.0)

# ---- sound design, locked to cues.json
def S(snd, at, gain=0.0, pan=None, verb=None):
    m.sfx(snd, at=at, gain=gain, pan=pan, verb=verb)

# card arrivals: soft air, panned with the cards (A centre-right, B top-left, C bottom-left)
S(sfx.whoosh(1.3, 'air', direction=1, peak=0.55, seed=3), at=0.2, gain=-9, pan=0.2, verb=-12)
S(sfx.whoosh(1.0, 'soft', direction=-1, peak=0.6, seed=5), at=cues['cardB_in'] + 0.45, gain=-12, pan=-0.45)
S(sfx.whoosh(1.0, 'soft', direction=-1, peak=0.6, seed=8), at=cues['cardC_in'] + 0.45, gain=-12, pan=-0.35)
# user bubble
S(sfx.pop('bubble', pitch=1.25), at=cues['user_bubble'] + 0.03, gain=-9, pan=0.3, verb=-14)
# typing dots: three barely-there ticks
for i in range(3):
    S(sfx.tick('hi'), at=cues['typing'] + 0.12 + i * 0.12, gain=-19, pan=-0.05)
# streamed reply: a blip per line, rising through the chord tones
for i, t in enumerate(cues['reply']):
    n = ['E6', 'G#6', 'B6', 'C#7'][i % 4]
    S(sfx.blip(n, 'sine', dur=0.09, glide=1.0), at=t + 0.02, gain=-15, pan=-0.05 + 0.04 * i, verb=-10)
# chips
S(sfx.click('soft'), at=cues['chips'] + 0.05, gain=-15, pan=-0.05)
S(sfx.click('soft'), at=cues['chips'] + 0.17, gain=-17, pan=0.05)
# Focus toggle
S(sfx.toggle(on=True), at=cues['toggle_on'] + 0.02, gain=-7, pan=-0.4)
# slider: a soft upward swipe
S(sfx.ui('swipe'), at=cues['slider'][0] + 0.35, gain=-16, pan=-0.3)
S(sfx.magic(0.8, 'E', up=True), at=cues['slider'][0] + 0.03, gain=-19, pan=-0.3, verb=-10)
# knob pressed -> turns to glass
S(sfx.click('soft'), at=cues['knob_press'], gain=-11, pan=-0.4)
S(sfx.ding('B7', 'bell', dur=0.9), at=cues['knob_glass'], gain=-13, pan=-0.4, verb=-8)
# droplet neck snaps (liquid glass bloop)
S(sfx.tick('hi'), at=cues['bead'] - 0.2, gain=-22, pan=-0.35)   # anticipation: the glass knob swells
S(sfx.gloop(1.35, 0.3, seed=2), at=cues['snap'], gain=-8, pan=-0.12, verb=-12)
S(sfx.bubble(0.55, rise=1.8, seed=4), at=cues['snap'] + 0.1, gain=-15, pan=-0.05)
# lens glide (air), passing left->right, peak as it crosses the reply
S(sfx.whoosh(1.9, 'air', direction=1, peak=0.45, seed=11), at=DROP + 0.35, gain=-11, pan=0.0, verb=-12)
# the glass parts: B and C slide out to the left, A to the right (pass-by peaks ~ when each pane crosses the frame edge)
pB, pC, pA = cues['part']
S(sfx.whoosh(1.2, 'air', direction=-1, peak=0.55, seed=13), at=pB + 0.66, gain=-13, pan=-0.55, verb=-12)
S(sfx.whoosh(1.2, 'air', direction=-1, peak=0.55, seed=17), at=pC + 0.66, gain=-14, pan=-0.45, verb=-12)
# pane A: slides over the wordmark and holds, then leaves right with a long tail
S(sfx.whoosh(0.9, 'air', direction=1, peak=0.6, seed=23), at=pA + 0.08, gain=-18, pan=0.35, verb=-12)
S(sfx.whoosh(1.2, 'soft', direction=1, peak=0.4, seed=19), at=cues['a_hold'][1] + 0.2, gain=-11, pan=0.55, verb=-10)
# a glass tink (Emaj9 maj7, the leading tone into the logo) as pane A clears the frame
S(sfx.ding('D#7', 'bell', dur=0.6), at=cues['a_clear'], gain=-18, pan=0.5, verb=-8)
# the caustic ring crosses the wordmark (9.0)
S(sfx.whoosh(1.1, 'air', direction=1, peak=0.35, seed=29), at=cues['wave'] + 0.3, gain=-21, pan=0.0, verb=-10)
# letters ripple out from the glass "o"
S(sfx.sparkle(1.0, 22, 'E', 'major_pentatonic', shape='fade', seed=7), at=cues['word'], gain=-11, verb=-10)
# settle
S(sfx.shimmer_hit(theory.midi('E5')), at=SETTLE, gain=-5, verb=-8)
# tagline
S(sfx.tick('hi'), at=cues['tagline'] + 0.05, gain=-20)

res = m.export(os.path.join(OUT, 'audio.wav'), lufs=-14, tp=-1.6, spectrogram=os.path.join(OUT, 'audio_spec.png'))
m.report()
print({k: res[k] for k in ('duration', 'lufs', 'true_peak', 'bands', 'warnings') if k in res})

# ---- loudness envelope for the voice-card waveform (100 Hz, 0..1)
import soundfile as sf
x, sr = sf.read(os.path.join(OUT, 'audio.wav'))
mono = x.mean(axis=1) if x.ndim > 1 else x
hop = sr // 100
win = int(sr * 0.05)
pad = np.pad(mono, (win // 2, win))
env = np.array([np.sqrt(np.mean(pad[i * hop:i * hop + win] ** 2)) for i in range(int(len(mono) / hop))])
env = 20 * np.log10(env + 1e-6)
vis = env[:650]   # the voice card is on screen until ~6.5 s: normalise to that span
lo, hi = np.percentile(vis, 6), np.percentile(vis, 97)
env = np.clip((env - lo) / (hi - lo), 0, 1) ** 1.3
# gentle attack/release smoothing (causal + anti-causal = zero phase)
for rev in (False, True):
    e = env[::-1] if rev else env
    out = np.zeros_like(e); a = 0.0
    for i, v in enumerate(e):
        a = a + (v - a) * (0.55 if v > a else 0.18); out[i] = a
    env = out[::-1] if rev else out
json.dump({'rate': 100, 'v': [round(float(v), 4) for v in env]}, open(os.path.join(OUT, 'env.json'), 'w'))
print('env', len(env), 'frames; hits', mg.hit_alignment(os.path.join(OUT, 'audio.wav'), [cues['toggle_on'], cues['user_bubble'], DROP, SETTLE]))
