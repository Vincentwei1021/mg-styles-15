"""PIXEL QUEST — custom NES-style chiptune + 8-bit SFX, locked to cues.json. 150 bpm, C major."""
import sys, json
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'lib', 'audio'))
import mgaudio as mg
from mgaudio import chip, sfx, drums
from mgaudio.theory import midi
from mgaudio import filters
DIP = lambda x: filters.eq(x, [('pk', 3300, -4.5, 0.8)])

C = json.load(open(os.path.dirname(os.path.abspath(__file__)) + '/cues.json'))
m = mg.Mix(duration=10.0, bpm=150, anchor=0.0)
m.group('music').level = -20
S = 0.1  # 16th

# ---------------------------------------------------------------- harmony map
CH = [(0.0, 'C'), (0.8, 'G'), (1.6, 'Am'), (2.4, 'F'), (3.2, 'C'), (4.0, 'G'), (4.8, 'F'), (5.6, 'G'),
      (6.4, 'C'), (6.8, 'Ab'), (7.0, 'Bb'), (7.2, 'C'), (8.0, 'F'), (8.8, 'G'), (9.6, 'C')]
ROOT = {'C': 'C', 'G': 'G', 'Am': 'A', 'F': 'F', 'Ab': 'Ab', 'Bb': 'Bb'}
TRI = {'C': ['C4', 'E4', 'G4'], 'G': ['B3', 'D4', 'G4'], 'Am': ['C4', 'E4', 'A4'], 'F': ['C4', 'F4', 'A4'],
       'Ab': ['C4', 'Eb4', 'Ab4'], 'Bb': ['D4', 'F4', 'Bb4']}
def chord_at(t):
    c = CH[0][1]
    for t0, n in CH:
        if t >= t0 - 1e-6: c = n
    return c

# ---------------------------------------------------------------- lead (25 % pulse) + harmony (12.5 %)
lead = m.track('lead', level=-23.5, pan=-0.3, sends={'room': -16}, lp=5200, fx=[DIP])
LEAD = [  # (t, note, dur)
    (0.0, 'G5', .2), (0.4, 'E5', .2), (0.6, 'G5', .2), (0.8, 'D6', .4), (1.2, 'B5', .2), (1.4, 'G5', .2),
    (1.6, 'A5', .2), (2.0, 'E5', .2), (2.2, 'A5', .2), (2.4, 'C6', .4), (2.8, 'A5', .2), (3.0, 'F5', .2),
    (3.2, 'G5', .2), (3.4, 'C6', .2), (3.6, 'E6', .4), (4.0, 'D6', .3), (4.4, 'D6', .08),
    # item-get fanfare
    (6.4, 'G5', .1), (6.5, 'C6', .1), (6.6, 'E6', .1), (6.7, 'G6', .1), (6.8, 'Eb6', .2), (7.0, 'F6', .2),
    # title theme
    (7.2, 'G6', .2), (7.4, 'C6', .2), (7.6, 'E6', .2), (7.8, 'D6', .2), (8.0, 'C6', .2), (8.2, 'F6', .4), (8.6, 'E6', .2),
    (8.8, 'D6', .2), (9.0, 'B5', .2), (9.2, 'G5', .2), (9.4, 'B5', .2), (9.6, 'C6', .38),
]
for t, n, d in LEAD:
    lead.add(chip.pulse(n, d * 0.92, 0.25, 0.8, env='sustain', vib=0.25 if d >= .38 else 0.0, vib_delay=0.12), t)
# NES-style fake echo, ping-pong: dotted-8th (3/16 = 0.3 s) repeats at -10 / -16 dB, R then L (bass + kick stay centred)
echoR = m.track('echoR', level=-32, pan=0.9, lp=3600, fx=[DIP]); echoL = m.track('echoL', level=-37.5, pan=-0.9, lp=3000, fx=[DIP])
for t, n, d in LEAD:
    for trk, dt in ((echoR, 0.3), (echoL, 0.6)):
        if t + dt < 9.7 and not (6.0 < t + dt < 6.45) and not (7.1 < t + dt < 7.22):
            trk.add(chip.pulse(n, min(d, 0.2) * 0.92, 0.25, 0.7, env='sustain'), t + dt)
harm = m.track('harm', level=-31, pan=0.6, lp=4200, fx=[DIP])
for t, n, d in LEAD:
    if t >= 6.8:
        harm.add(chip.pulse(midi(n) - (4 if chord_at(t) in ('C', 'F', 'Ab', 'Bb') else 3), d * 0.9, 0.125, 0.6, env='sustain'), t)

# ---------------------------------------------------------------- fast NES arpeggio chords
arp = m.track('arp', level=-31.5, pan=0.75, lp=3800, fx=[DIP]); arpL = m.track('arpL', level=-31.5, pan=-0.75, lp=3800, fx=[DIP])
for t0, t1 in [(0.0, 4.4), (7.2, 9.6)]:
    t = t0
    while t < t1 - 1e-6:
        (arp if round(t / 0.2) % 2 == 0 else arpL).add(chip.arp_chord(TRI[chord_at(t)], 0.19, duty=0.125, rate=30, vel=0.55, env='sustain'), t)   # arp chords ping-pong
        t += 0.2
arp.add(chip.arp_chord(TRI['C'], 0.4, duty=0.125, rate=30, vel=0.55), 9.6)

# ---------------------------------------------------------------- triangle bass
bass = m.track('bass', level=-23.8)
def bassline(t0, t1, pat='oc'):
    t = t0; i = 0
    while t < t1 - 1e-6:
        r = ROOT[chord_at(t)]
        n = midi(r + '2') + (12 if pat[i % len(pat)] == 'c' else 0)
        if n < midi('E2'): n += 12
        bass.add(chip.triangle(n, 0.17, 0.9), t)
        t += 0.2; i += 1
bassline(0.0, 4.4)
bass.add(chip.triangle('G2', 0.08, 0.9), 4.4)
bassline(4.8, 6.4, 'o')
bass.add(chip.triangle('C2', 0.38, 0.9), 6.4)
for t, n in [(6.8, 'Ab2'), (6.9, 'Ab2'), (7.0, 'Bb2'), (7.1, 'Bb2')]:
    bass.add(chip.triangle(n, 0.08, 0.9), t)
bassline(7.2, 9.6)
bass.add(chip.triangle('C2', 0.36, 0.9), 9.6)

# ---------------------------------------------------------------- noise drums
kick = m.track('kick', level=-25); snare = m.track('snare', level=-26); hat = m.track('hat', level=-34, pan=0.45); hatL = m.track('hatL', level=-34, pan=-0.45)
def groove(t0, t1, k='x.......x.x.....', s='....x.......x...', h='x.x.x.x.x.x.x.x.'):
    t = t0; i = 0
    while t < t1 - 1e-6:
        st = i % 16
        if k[st] == 'x': kick.add(chip.kick(0.95), t)
        if s[st] == 'x': snare.add(chip.snare(0.85), t)
        if h[st] == 'x': (hat if (st // 2) % 2 == 0 else hatL).add(chip.hat(0.6 if st % 4 == 0 else 0.4), t)   # hats alternate +/-0.25 on 8ths
        t += S; i += 1
groove(0.0, 4.0)
for i in range(4): snare.add(chip.snare(0.55 + 0.12 * i), 4.0 + i * S)   # fill into the stop
kick.add(chip.kick(1.0), 4.4); snare.add(chip.snare(0.9), 4.4)
groove(4.8, 6.0, k='................', s='................', h='x.x.x.x.x.x.x.x.')
for i in range(6): snare.add(chip.snare(0.3 + 0.12 * i), 6.0 + i * S / 2)    # 32nd roll under the chest rattle, gap at 6.3
kick.add(chip.kick(1.0), 6.4)
m.track('crash', level=-29).add(chip.crash(0.9), 6.4)
for i, t in enumerate([6.8, 6.9, 7.0, 7.1]): snare.add(chip.snare(0.6 + 0.1 * i), t)
m['crash'].add(chip.crash(0.9), 7.2)
groove(7.2, 9.6)
kick.add(chip.kick(1.0), 9.6); m['crash'].add(chip.crash(0.8), 9.6)

# ---------------------------------------------------------------- SFX locked to picture
m.track('chipfx', group='sfx', lp=5500, fx=[DIP])
_sfx = m.sfx
def chipsfx(snd, at, **kw): return _sfx(snd, at=at, track='chipfx', **kw)
m.sfx(sfx.crt_on(), at=C['crt_on'], gain=-5)
m.sfx(chip.noise(0.09, period=2, vel=0.8, decay_frames=5).loud(-18), at=C['crt_on'] + 0.167, gain=-9)   # tube snaps fully open (f5)
m.sfx(chip.triangle('C2', 0.1, 0.9, slide_from='C3', slide=0.06).loud(-18), at=C['crt_on'] + 0.2, gain=-7)   # over-bright roll thump (f6)
for t in C['jumps']: chipsfx(sfx.jump(), at=t, gain=-7, pan=-0.15)
for i, t in enumerate(C['coins']): chipsfx(sfx.coin(), at=t, gain=-7 + (0.5 * (i % 3)), pan=-0.1 + 0.05 * (i % 3))
for t in C['lands']: m.sfx(chip.hit(0.5).loud(-18), at=t, gain=-10)
m.sfx(chip.hit(0.9).loud(-18), at=C['stomp'], gain=-1)
chipsfx(chip.pulse('C5', 0.09, 0.5, 0.8, env='decay', slide_from='C6', slide=0.07).loud(-18), at=C['stomp'], gain=-6)   # squish: pulse drop
m.sfx(chip.noise(0.4, period=3, vel=0.6, decay_frames=22).loud(-18), at=C['skid'], gain=-9, pan=0.1)
chipsfx(chip.blip('E6', 0.8).loud(-18), at=C['alert'], gain=-3)
chipsfx(chip.blip('A6', 0.8).loud(-18), at=C['alert'] + 0.07, gain=-3)
for i, n in enumerate(['C6', 'G6']): chipsfx(chip.blip(n, 0.7).loud(-18), at=C['box_open'] + i * 0.05, gain=-9)   # box open: 2 rising pulse blips
TYPE_N = ['A5', 'C6', 'F6', 'C6', 'A5', 'C6', 'F6', 'A6', 'F6']
for t, n in zip(C['type'], TYPE_N): chipsfx(chip.blip(n, 0.7).loud(-18), at=t, gain=-11, pan=0.05)
for i, n in enumerate(['G6', 'C6']): chipsfx(chip.blip(n, 0.6).loud(-18), at=C['box_close'] + i * 0.05, gain=-11)  # box close: falling pair
for i, t in enumerate(C['zoom']): m.sfx(chip.triangle('C3', 0.07, 0.9, slide_from='G3', slide=0.05).loud(-18), at=t, gain=-6 + 0.5 * i)   # zoom punch-ins
for i, t in enumerate(C['zoom']): chipsfx(chip.noise(0.03, period=3 + i, vel=0.8, decay_frames=2).loud(-18), at=t, gain=-12, pan=0.0)   # shutter tick on each integer zoom step
for i in range(8): chipsfx(chip.noise(0.035, period=4 + (i % 3), short=True, vel=0.7, decay_frames=2).loud(-18), at=C['chest_shake'][0] + i * 0.05, gain=-13 + i * 0.6, pan=0.3)   # metallic rattle ticks
chipsfx(chip.blip('E6', 0.6).loud(-18), at=C['question'], gain=-9, pan=-0.1)          # "?" bubble: rising query
chipsfx(chip.blip('B6', 0.6).loud(-18), at=C['question'] + 0.066, gain=-9, pan=-0.1)
for i, t in enumerate(C['lid_hops']):                                                  # lid clacks + light leak
    m.sfx(chip.hit(0.7).loud(-18), at=t, gain=-7 + 2 * i, pan=0.3)
    chipsfx(chip.noise(0.05, period=3, short=True, vel=0.8, decay_frames=3).loud(-18), at=t, gain=-7 + 2 * i, pan=0.3)
chipsfx(chip.noise(0.1, period=2, vel=0.5, decay_frames=6).loud(-18), at=C['lid_hops'][1], gain=-12, pan=0.3)
m.sfx(chip.explosion(0.9, 0.6).loud(-18), at=C['chest_open'], gain=-8, pan=0.25)
chipsfx(chip.pulse('C6', 0.36, 0.125, 0.7, env='decay', arp=[0, 4, 7, 12, 16, 19, 24], arp_rate=30).loud(-18), at=C['chest_open'] + 0.05, gain=-12, pan=0.25)   # burst: 12.5 % pulse arp sweep
chipsfx(chip.blip('G6', 0.7).loud(-18), at=C['item_get'], gain=-12); chipsfx(chip.blip('C7', 0.7).loud(-18), at=C['item_get'] + 0.033, gain=-12)   # catch
# logo slam, 2A03-only: triangle pitch-drop C4->C1 (70 ms) + noise burst, period swept 1->15 over 250 ms + 1-frame pulse click
m.sfx(chip.triangle('C1', 0.12, 1.0, slide_from='C4', slide=0.07).loud(-18), at=C['logo'], gain=-1)
m.sfx(chip.noise(0.25, period_seq=list(range(1, 16)), vel=0.9, decay_frames=14).loud(-18), at=C['logo'], gain=-4)
chipsfx(chip.pulse('C7', 1 / 60, 0.5, 0.9, env='sustain').loud(-18), at=C['logo'], gain=-8)
for k, g in enumerate([-10, -16, -22]):   # shine: 12.5 % pulse arp C7-E7-G7-C8 at 1/60 s + NES fake-echo repeats
    chipsfx(chip.pulse('C7', 0.07, 0.125, 0.7, env='decay', arp=[0, 4, 7, 12], arp_rate=60).loud(-18), at=C['shine'] + 0.1 * k, gain=g, pan=0.35 * (-1) ** k)
for t, n in zip(C['subtitle'], ['C6', 'E6', 'G6', 'C7']): chipsfx(chip.blip(n, 0.7).loud(-18), at=t, gain=-10)
chipsfx(chip.select(0.7).loud(-18), at=C['press_start'], gain=-13)
# night rolls in toward the crystal: 4 ring steps = descending noise 'hush' + soft falling triangle, L/R alternating
for i, t in enumerate(C['night_wave']):
    chipsfx(chip.noise(0.09, period=8 + 2 * i, vel=0.5, decay_frames=5).loud(-18), at=t, gain=-17 - i, pan=0.35 * (-1) ** i)
    m.sfx(chip.triangle(['G4', 'E4', 'C4', 'G3'][i], 0.08, 0.7).loud(-18), at=t, gain=-16)
for i, n in enumerate(['C7', 'G7']): chipsfx(chip.blip(n, 0.5).loud(-18), at=C['rays_off'] + 0.2 + i * 0.1, gain=-17, pan=0.2)   # crystal star ignites
chipsfx(chip.blip('E6', 0.6).loud(-18), at=C['flinch'], gain=-10, pan=-0.1)   # '!' pops on the 2nd lid hop
chipsfx(chip.blip('A6', 0.6).loud(-18), at=C['flinch'] + 0.05, gain=-10, pan=-0.1)

m.mute(C['logo'] - 0.07, 0.07)   # a breath before the logo slam
m.mute(C['chest_open'] - 0.06, 0.06)   # ... and before the chest burst
m.master_kw.update(width=1.35)   # M/S widen above the mono-bass split (120 Hz): SNES-style stereo, mono-safe
res = m.export(os.path.dirname(os.path.abspath(__file__)) + '/out/audio.wav',
               spectrogram=os.path.dirname(os.path.abspath(__file__)) + '/out/audio_spec.png', tp=-1.7)
print({k: res[k] for k in ('duration', 'lufs', 'true_peak', 'stereo_corr', 'bands', 'warnings') if k in res})
hits = [C['stomp'], C['chest_open'], C['logo']] + C['coins'][:3]
print(mg.hit_alignment(os.path.dirname(os.path.abspath(__file__)) + '/out/audio.wav', hits))
