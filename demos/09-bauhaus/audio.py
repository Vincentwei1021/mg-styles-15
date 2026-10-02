"""09-bauhaus soundtrack: minimal click-techno at 120 BPM (A minor), every visual action = a click/blip on its landing frame.
Reads cues.json (single source of truth). Writes out/audio.wav (48 kHz stereo, 10.000 s, -14 LUFS, TP <= -1 dBTP)."""
import sys, json, math, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'lib', 'audio'))
import mgaudio as mg
from mgaudio import recipes, sfx, drums, synth

HERE = os.path.dirname(os.path.abspath(__file__))
C = json.load(open(os.path.join(HERE, 'cues.json')))
EV = {e['id']: e for e in C['events']}
DROP, FREEZE = C['drop'], C['freeze']
pan_x = lambda x: max(-0.8, min(0.8, (x - 960) / 960 * 0.9))

m = recipes.techno(bpm=C['bpm'], key='A', drop=DROP, build=2.0, outro=FREEZE)
f = m.form
m['ping'].mute = True          # random pings replaced by event-locked tones below
m['kick'].add(drums.kick('techno', 0.95, decay=0.38), EV['group_turn']['t'])   # the group turn locks on a kick
m['kick'].automate('gain', [(0.0, -10.0), (3.97, -10.0), (4.0, 0.0), (10.0, 0.0)])   # r1: intro kick halved -> drop has contrast

def io2_inv(y):                 # inverse of power2.inOut
    return math.sqrt(y / 2) if y < 0.5 else 1 - math.sqrt((1 - y) / 2)

def ratchet(t0, t1, teeth, gain, pan, note0):
    for k in range(1, teeth):
        tt = t0 + (t1 - t0) * io2_inv(k / teeth)
        m.sfx(sfx.tick('hi'), at=tt, gain=gain - 2 + 2 * k / teeth, pan=pan)

A = lambda n: mg.theory.hz(n) if hasattr(mg, 'theory') else n

# ---------------------------------------------------------------- intro / assembly (one action per beat)
m.sfx(sfx.tick('wood'), at=EV['marks']['t'], gain=-7, pan=0)
G = C['grid']                                   # r1: every ruled line pair lands on a 16th = plotter tick
for d in range(8):
    tt = G['land0'] + d * G['step']
    m.sfx(sfx.tick('wood' if d % 2 == 0 else 'hi'), at=tt, gain=-9 + 0.3 * d, pan=(-1) ** d * min(0.6, 0.08 * d))
for i in range(1, 5):                           # r1: off-beat construction targets
    e = EV['target%d' % i]
    m.sfx(sfx.tick('clock'), at=e['t'], gain=-8, pan=pan_x(e['gx']) * 0.5)
m.sfx(sfx.impact('thud', size=0.8), at=EV['circle_land']['t'], gain=-3, pan=pan_x(720))
m.sfx(sfx.blip('A3', 'sine', dur=0.18, glide=1.0), at=EV['circle_land']['t'], gain=-5, pan=pan_x(720))
m.sfx(sfx.click('hard'), at=EV['bar_land']['t'], gain=-2, pan=pan_x(1440))
m.sfx(sfx.blip('E5', 'square', dur=0.06, glide=1.0), at=EV['tri_in']['t'], gain=-6, pan=0.6)
m.sfx(sfx.swish(0.22, direction=-1, seed=3), at=EV['tri_flip']['t'] - 0.1, gain=-8, pan=0.3)
m.sfx(sfx.click('switch'), at=EV['tri_flip']['t'], gain=-2, pan=0.2)
m.sfx(sfx.blip('C5', 'fm', dur=0.1, glide=0.5), at=EV['sq_scale']['t'], gain=-5, pan=pan_x(600))
m.sfx(sfx.tick('wood'), at=EV['pivot']['t'], gain=-3, pan=0)
m.sfx(sfx.click('soft'), at=EV['circle_slide']['t'], gain=-2, pan=pan_x(700))
m.sfx(sfx.swish(0.2, direction=1, seed=9), at=EV['circle_slide']['t'] - 0.08, gain=-10, pan=pan_x(660))
m.sfx(sfx.blip('A5', 'sine', dur=0.05, glide=1.0), at=EV['pivot']['t'], gain=-9, pan=0)
g = EV['group_turn']
ratchet(g['t0'], g['t'], 12, -8, 0.0, 69)
m.sfx(sfx.impact('punch', size=0.9), at=g['t'], gain=-1)
m.sfx(sfx.click('hard'), at=g['t'], gain=-3)
s = EV['semi_slide']
m.sfx(sfx.swish(0.25, direction=1, seed=5), at=s['t'] - 0.08, gain=-7, pan=0.5)
m.sfx(sfx.click('soft'), at=s['t'], gain=-3, pan=0.5)
m.sfx(sfx.blip('E4', 'tri', dur=0.12, glide=1.0), at=s['t'], gain=-7, pan=0.5)
q = EV['qd_sweep']
ratchet(q['t0'], q['t'], 4, -9, -0.5, 64)
m.sfx(sfx.click('hard'), at=q['t'], gain=-3, pan=-0.5)
m.sfx(sfx.zip_(True, dur=0.22), at=EV['rule']['t'], gain=-10, pan=0.2)
m.sfx(sfx.tick('clock'), at=EV['ticker_in']['t'], gain=-5, pan=-0.5)
m.sfx(sfx.blip('G5', 'square', dur=0.05, glide=1.0), at=EV['red_in']['t'], gain=-6, pan=0.7)
m.sfx(sfx.blip('A5', 'fm', dur=0.06, glide=1.0), at=EV['red_split']['t'], gain=-7, pan=0.75)
m.sfx(sfx.click('soft'), at=EV['red_split']['t'], gain=-5, pan=0.75)

# ---------------------------------------------------------------- drop: impact + each ripple has its own sound (r1)
m.mute(DROP - 0.125, 0.12)                      # 1/8-beat silence before the impact
m.sfx(sfx.impact('punch', size=1.2), at=DROP, gain=1)
m.sfx(sfx.sub_drop(1.0), at=DROP, gain=-10)
M, Y0 = C['M'], C['gridY0']
TX0, TY0, TX1, TY1 = C['trim']
RP = {r['id']: r for r in C['ripples']}
notes = ['A5', 'C6', 'D6', 'E6', 'G6', 'A6', 'G6', 'E6', 'D6', 'C6']

def run(lands, kind, g0, blip_every=3, ri=0):
    """lands: list of (time, x). Bins into ~10 steps and plays one transient per bin, panned with the wave."""
    t0 = min(l for l, _ in lands); t1 = max(l for l, _ in lands)
    bins = {}
    for l, x in lands:
        k = round((l - t0) / max(1e-6, t1 - t0) * 9)
        bins.setdefault(k, []).append((l, x))
    for k in sorted(bins):
        l = min(b[0] for b in bins[k]); x = sum(b[1] for b in bins[k]) / len(bins[k])
        if l >= FREEZE - 1e-6: l = FREEZE - 0.004
        m.sfx(kind(), at=l, gain=g0 + 0.4 * k, pan=pan_x(x))
        if blip_every and k % blip_every == 0:
            m.sfx(sfx.blip(notes[(k + ri * 2) % len(notes)], 'fm', dur=0.04, glide=1.0), at=l, gain=g0 - 3, pan=pan_x(x))

# R1 rotate: 120 tiles, radial from the circle -> fast hi-tick rattle
r = RP['R1']; ox, oy = r['origin']
tiles = [(x, y) for y in range(TY0 + 60, TY1, 120) for x in range(TX0 + 60, TX1, 120)]
mx = max(math.hypot(x - ox, y - oy) for x, y in tiles)
run([(r['start'] + math.hypot(x - ox, y - oy) / mx * r['span'] + r['dur'], x) for x, y in tiles], lambda: sfx.tick('hi'), -8, 3, 0)
# R2 flip: 240 cards tumble over, diagonal -> switch clicks + air
r = RP['R2']
blocks = [(x, y) for y in range(TY0 + 120, TY1, 240) for x in range(TX0 + 120, TX1, 240)]
mm = (TX1 - 120 - TX0) + (TY1 - 120 - TY0)
run([(r['start'] + ((x - TX0) + (y - TY0)) / mm * r['span'] + r['dur'], x) for x, y in blocks], lambda: sfx.click('switch'), -7, 4, 1)
m.sfx(sfx.swish(0.35, direction=1, seed=21), at=r['start'] + 0.3, gain=-9, pan=0)
# 7.0 reveal: the triad lands -> punch + dub stab (A minor 9) + crash
rv = EV['reveal']['t']
m.sfx(sfx.impact('punch', size=1.0), at=rv, gain=-1)
m.sfx(synth.stab(['A3', 'C4', 'E4', 'G4', 'B4'], 0.45, 0.9, 'dub'), at=rv, gain=-4)
m.sfx(drums.crash(), at=rv, gain=-10)
for i, (tt, n, x) in enumerate(zip(C['labels'], ['A5', 'C6', 'E6'], [360, 960, 1560])):   # r2: label stamps on 16ths
    m.sfx(sfx.tick('wood'), at=tt, gain=-8, pan=pan_x(x))
    m.sfx(sfx.blip(n, 'fm', dur=0.05, glide=1.0), at=tt, gain=-10, pan=pan_x(x))
# R3 slide: columns shunt one module, right -> left -> soft clacks + zip
r = RP['R3']
cols = list(range(TX0 + 120, TX1, 240))           # r2: column pairs (240 px), wave right -> left
run([(r['start'] + (TX1 - 120 - x) / (TX1 - 120 - (TX0 + 120)) * r['span'] + r['dur'], x) for x in cols], lambda: sfx.click('soft'), -6, 0, 2)
m.sfx(sfx.zip_(False, dur=0.25), at=r['start'] + r['dur'] + r['span'], gain=-10, pan=0)
# R4 converge: cards turn home, outside -> centre, last one on the freeze
r = RP['R4']
rs = [math.hypot(x - 960, y - 540) for x, y in blocks]; mxR, mnR = max(rs), min(rs)
run([(r['start'] + (mxR - math.hypot(x - 960, y - 540)) / (mxR - mnR) * r['span'] + r['dur'], x) for x, y in blocks], lambda: sfx.click('switch'), -7, 3, 3)

# ---------------------------------------------------------------- freeze + type + ticker
m.sfx(sfx.impact('punch', size=0.8), at=FREEZE, gain=-2)
m.sfx(sfx.stamp('wood'), at=FREEZE, gain=-4)
L = C['letters']
for i, n in enumerate(['A4', 'C5', 'D5', 'E5', 'G5', 'A5', 'C6']):
    tt = L['t0'] + i * L['step']
    m.sfx(sfx.blip(n, 'fm', dur=0.14, glide=1.0), at=tt, gain=-5 - (0 if i else 2), pan=-0.75)
    if i: m.sfx(sfx.tick('wood'), at=tt, gain=-9, pan=-0.75)
for i, tt in enumerate(C['ticker']):
    m.sfx(sfx.tick('clock' if i % 2 == 0 else 'tock'), at=tt, gain=-4, pan=-0.45)
m.sfx(sfx.blip('E6', 'sine', dur=0.3, glide=1.0), at=EV['type_small']['t'], gain=-9, pan=-0.6)
lk = EV['lock']['t']                           # r1: press lock = the final button
for k in range(16):                              # r2: closed-hat 16th run building into the lock (-22 -> -16 dB)
    tt = FREEZE + 0.5 + k * 0.0625
    m.sfx(drums.hat('closed', 0.7 + 0.02 * k), at=tt, gain=-22 + 6 * k / 15 + (1.5 if k % 4 == 0 else 0), pan=0.25 * (-1) ** k)
m.sfx(sfx.swish(0.5, direction=1, seed=33), at=lk - 0.45, gain=-14, pan=0)
m.sfx(sfx.impact('punch', size=0.7), at=lk, gain=-3)
m.sfx(sfx.click('hard'), at=lk, gain=-3)
m.sfx(sfx.stamp('wood'), at=lk, gain=-6)
m.sfx(synth.stab(['A2', 'E3', 'A3', 'C4', 'E4'], 0.5, 0.7, 'dub'), at=lk, gain=-7)
m.sfx(synth.pad(['A3', 'C4', 'E4', 'B4'], 10.0 - FREEZE, 0.6, 'warm'), at=FREEZE, gain=-15)
m.sfx(sfx.tick('tock'), at=C['tickerVisualOnly'][0], gain=-12, pan=-0.45)   # r2: ticker's last swing rests on frame 297   # ringing chord under the hold

try:
    m.group('sfx').automate('hpf', [(0.0, 35.0), (10.0, 35.0)])   # r1: keep SFX out of the sub below 35 Hz
except Exception as ex:
    print('sfx hpf skipped', ex)
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
res = m.export(os.path.join(HERE, 'out', 'audio.wav'), lufs=-14, tp=-1.8,
               spectrogram=os.path.join(HERE, 'out', 'audio_spec.png'))
print({k: res[k] for k in ('duration', 'lufs', 'true_peak', 'stereo_corr', 'bands', 'warnings') if k in res})
