# Soundtrack for 08-morph: future-bass bed (150 bpm, D) + sound design locked to cues.json
import sys, json
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'lib', 'audio'))
import mgaudio as mg
from mgaudio import recipes, sfx, drums, synth, seq
from mgaudio.theory import midi

cu = json.load(open('cues.json'))
L, FR = cu['land'], 1 / 30
m = recipes.future_bass(bpm=cu['bpm'], key='D', drop=cu['drop'], build=cu['build'], outro=cu['outro'], gap=True)
f = m.form
print('tracks', list(m.tracks)); print(f.summary())

# plucky arpeggio through the whole piece (the brief's signature bed), opening up at the drop
arp = m.track('arp2', level=-25, sends={'delay': -10}, pan=0.05)
for t, n, d, v in seq.arp(m.grid, lambda t: f.chord_at(t, 12), 0.0, 9.6, div=16, pattern='updown'):
    if cu['flight']['apex'] - 0.02 < t < cu['drop'] - 0.02: continue          # the hang: silence
    arp.add(synth.pluck(n, min(d, 0.22), v * (1.0 if int(round(t / 0.1)) % 4 == 0 else 0.72), 'future'), t)
arp.automate('lpf', [(0, 1400), (4.8, 2600), (6.3, 3200), (6.4, 9000), (8.8, 7000), (10, 4000)])
# the hang at the loop apex: pull the whole music bus out, then slam back in at the drop
m.mute(cu['flight']['apex'] + 0.02, cu['drop'] - cu['flight']['apex'] - 0.04)

def tone(t, idx=-1, octave=12):
    ch = f.chord_at(t); return ch[idx % len(ch)] + octave

# ---- sound design: ONE signature sound per object (round 1), whooshes only for the two big moves
lt = cu['letters']; FL = cu['flight']
# 0.40 the ink drop lands: water plik + in-key pluck on the landing frame; the crown droplets tick onto the rim
m.sfx(sfx.drip(pitch=1.25), at=L['cup'] - FR, gain=-2)
m.sfx(synth.pluck(tone(0.4, -1, 12), 0.3, 1.0, 'future'), at=L['cup'] - FR, gain=-4)
m.sfx(sfx.impact('soft'), at=L['cup'] - FR, gain=-12)
for j, tj in enumerate((0.60, 0.62, 0.64)):
    m.sfx(sfx.drip(pitch=1.7 + 0.25 * j), at=tj - FR, gain=-15 - 2 * j, pan=(-0.3, 0.0, 0.3)[j])
# cup: ceramic clink as the crouch releases into the morph (1.30)
m.sfx(sfx.ding(mg.theory.name(tone(1.3, -1, 24)), 'glock', dur=0.35), at=1.30 - FR, gain=-9, pan=-0.1, verb=-12)
m.sfx(sfx.stretch(0.28, up=False), at=1.0, gain=-16)
# cup -> sun: the first big move = a real whoosh + warm rising swell, sun sizzle on the bloom
m.sfx(sfx.whoosh(0.62, 'swoosh', direction=1, peak=0.5, seed=11), at=1.38, gain=-7, pan=-0.1)
m.sfx(sfx.morph(0.7, up=True, note=mg.theory.name(tone(1.65, 0, 0))), at=1.65, gain=-9, verb=-14)
m.sfx(drums.clap('808', 0.7, spread=True), at=1.80 - FR, gain=-9, verb=-12)
m.sfx(sfx.sparkle(0.6, key='D', lo=88, hi=104), at=1.80, gain=-17)
m.sfx(sfx.blip(mg.theory.name(tone(2.0, -1, 12)), 'tri', dur=0.09, glide=1.0), at=L['sun'] - FR, gain=-4, verb=-12)
for k in range(2):   # the rays click round one notch per beat
    m.sfx(sfx.tick('hi'), at=2.0 + 0.4 * k - FR, gain=-16, pan=0.2)
# sun -> sunset: water swash as the sea rises, a clap on the sky bloom
m.sfx(sfx.splash(size=0.7), at=2.62, gain=-11, pan=0.1)
m.sfx(drums.clap('808', 0.8, spread=False), at=2.60 - FR, gain=-5, verb=-12)
m.sfx(sfx.whoosh(0.7, 'air', direction=0, peak=0.7), at=2.95, gain=-12)
m.sfx(sfx.blip(mg.theory.name(tone(3.2, -1, 12)), 'sine', dur=0.08), at=L['sunset'] - FR, gain=-4, verb=-10)
# sunset -> gull: the sun breaks the surface (splash), the sea floods up, the gull flutters every eighth
m.sfx(sfx.splash(size=0.5, seed=4), at=3.86, gain=-10, pan=-0.1)
m.sfx(sfx.whoosh(0.5, 'air', direction=0, peak=0.8), at=cu['wipes']['flood'] + 0.21, gain=-12)
m.sfx(synth.pluck(tone(4.4, -1, 12), 0.25, 1.0, 'future'), at=L['gull'] - FR, gain=-4)
m.sfx(sfx.paper('flip', dur=0.18, seed=12), at=L['gull'] - FR, gain=-9, pan=0.15)
for k in range(5):
    m.sfx(sfx.swish(0.16, direction=1 if k % 2 else -1, seed=20 + k), at=4.2 + 0.2 * k, gain=-13 - (k == 0) * 3, pan=0.12)
# gull -> plane: paper flick at the circle, crisp fold on landing, a tiny paper stretch in the anticipation
m.sfx(sfx.paper('flip', dur=0.3, seed=5), at=5.02, gain=-9, pan=-0.2)
m.sfx(sfx.paper('crumple', dur=0.14, seed=6), at=L['plane'] - FR, gain=-11, pan=-0.3)
m.sfx(sfx.stretch(0.2, up=False), at=5.4, gain=-15)
# the launch on the beat + the loop climb (light), then the hang (music gap) and the dive (the second real whoosh)
m.sfx(sfx.paper('slide', dur=0.25, seed=8), at=FL['launch'] - FR, gain=-10, pan=-0.3)
m.sfx(sfx.whoosh(0.42, 'sci', direction=1, peak=0.45, seed=7), at=5.66, gain=-8, pan=0.25)
m.sfx(sfx.reverse_cymbal(0.5), at=cu['drop'] - 0.12, gain=-8)
m.sfx(sfx.whoosh(0.26, 'heavy', direction=-1, peak=0.6, seed=3), at=cu['drop'] - 0.16, gain=-6)
# DROP 6.40: ONE hit - the slam, a 150-400 Hz rubber-stamp thock and a 2-5 kHz paper crunch stacked on the contact frame
m.sfx(sfx.impact('cinematic'), at=cu['drop'] - 0.01, gain=0, verb=-12)
m.sfx(sfx.boom(1.4, 42), at=cu['drop'] - 0.01, gain=-8)   # round 2: -3 dB under 50 Hz at the drop
m.sfx(sfx.stamp('rubber'), at=cu['drop'] - 0.01, gain=-1)
m.sfx(sfx.stamp('seal'), at=cu['drop'] - 0.01, gain=-6)
m.sfx(sfx.paper('crumple', dur=0.12, seed=9), at=cu['drop'] - 0.01, gain=0)   # round 2: crunch +6 dB
m.sfx(sfx.blip(mg.theory.name(tone(6.73, -2, 24)), 'tri', dur=0.07, glide=0), at=6.73, gain=-13, verb=-6)
# pin: anticipation stretch + hop; the heart blooms out of the circle (warm swell), lands, beats
m.sfx(sfx.stretch(0.22, up=True), at=7.0, gain=-11)
m.sfx(sfx.morph(0.5, up=True, note=mg.theory.name(tone(7.3, 0, 0))), at=7.3, gain=-10, verb=-14)
m.sfx(drums.clap('808', 0.6, spread=True), at=7.40 - FR, gain=-11, verb=-12)
m.sfx(sfx.pop('bubble', pitch=1.1), at=L['heart'] - FR, gain=-3)
m.sfx(sfx.blip(mg.theory.name(tone(7.6, -1, 12)), 'tri', dur=0.09, glide=1.0), at=L['heart'] - FR, gain=-3, verb=-12)
m.sfx(drums.kick('soft', 1.0).loud(-18), at=cu['heartbeat'][0] - FR, gain=-3)
m.sfx(drums.kick('soft', 0.7).loud(-18), at=cu['heartbeat'][1] - FR, gain=-8)
# heart -> m: soft ink swell, stop-time before the m lands, then soft letter ticks + in-key run, full stop = shimmer
m.sfx(sfx.morph(0.6, up=False, note=mg.theory.name(tone(8.3, 0, 0))), at=8.3, gain=-11, verb=-14)
m.mute(L['m'] - 0.13, 0.1)
m.sfx(sfx.impact('soft'), at=L['m'] - FR, gain=-5)
m.sfx(sfx.blip(mg.theory.name(tone(8.6, -1, 12)), 'tri', dur=0.09), at=L['m'] - FR, gain=-3)
run = sorted(set(f.chord_at(8.8)))
for k in range(5):
    n = run[k % len(run)] + 12 * (1 + k // len(run))
    m.sfx(sfx.typewriter(vel=0.45, seed=30 + k), at=lt['t0'] + lt['step'] * k + 0.33, gain=-13, pan=-0.3 + 0.15 * k)
    m.sfx(sfx.blip(mg.theory.name(n + 12), 'sine', dur=0.07, glide=1.5), at=lt['t0'] + lt['step'] * k + 0.28, gain=-12, pan=-0.3 + 0.15 * k, verb=-10)
m.sfx(sfx.shimmer_hit(mg.theory.name(tone(8.9, -1, 12))), at=lt['t0'] + lt['step'] * 5 + 0.3, gain=-4)
# air on top from the build: open hats on the off-beats + a quiet sparkle bed (future-bass top end, 8-12 kHz)
for k in range(int((8.8 - 4.8) / 0.4)):
    tb = 4.8 + 0.4 * k + 0.2
    if FL['apex'] - 0.05 < tb < cu['drop']: continue
    m.sfx(drums.hat('open', 0.5, tune=1.15), at=tb, gain=-10 if tb < 6.4 else -8, pan=0.25 if k % 2 else -0.25)
m.sfx(sfx.sparkle(1.1, key='D', lo=96, hi=110, seed=3), at=4.85, gain=-12)
m.sfx(sfx.sparkle(1.4, key='D', lo=96, hi=110, seed=4), at=6.45, gain=-11)
m.master_kw.update(air=3.0)   # round 2 s2: +3 dB 10 kHz shelf (jury fix 6), hats +2 dB
# the full stop keeps the heart's lub-dub (same phase as 7.8 / 7.93): quiet, inside the tail
m.sfx(drums.kick('soft', 0.8).loud(-18), at=9.4 - FR, gain=-8)
m.sfx(drums.kick('soft', 0.6).loud(-18), at=9.53 - FR, gain=-12)
# end card: the seven chapter dots land in the full stop (index.html ED: 8.93 + 0.03 k + 0.27) - a rising glass run, right -> centre
for k in range(7):
    n = run[k % len(run)] + 24 + 12 * (k // len(run))
    m.sfx(sfx.blip(mg.theory.name(n), 'sine', dur=0.05, glide=1.2), at=cu['enddots']['arrive'][k] - FR, gain=-18, pan=0.4 - 0.06 * k, verb=-10)
# round 2: the seven dots rewind along the bottom before their sweep (8.44-8.7)
m.sfx(sfx.whoosh(0.3, 'heavy', direction=-1, peak=0.5, seed=11), at=cu['enddots']['t0'], gain=-17, pan=0.3)
res = m.export('out/audio.wav', lufs=-14, tp=-2.5, spectrogram='out/audio_spec.png')
print({k: res.get(k) for k in ('duration', 'lufs', 'true_peak', 'stereo_corr', 'bands', 'warnings')})
hits = [L[k] for k in ('cup', 'sun', 'sunset', 'gull', 'plane', 'pin', 'heart', 'm')]
print('align', mg.hit_alignment('out/audio.wav', hits))

on = res.get('onsets') or []
for w0, w1 in ((1.5, 2.1), (2.4, 2.8), (6.2, 6.8), (8.3, 8.9)):
    print('onsets', w0, w1, [round(o, 3) for o in on if w0 <= o <= w1])
print('bloom align', mg.hit_alignment('out/audio.wav', [1.8, 2.6, 6.4, 7.4, 8.2]))
