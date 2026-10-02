"""07-liquid soundtrack: glossy future-bass (150 bpm, D major) + liquid sound design locked to cues.json.

Structure (bar 0 = the logo snap / drop at 6.40 s):
  0.0-4.8  intro   filtered supersaw pad + chopped hook; every drop landing plays a tuned 'wet' note (arpeggio up the chord)
  3.2-4.0  leap    rubbery stretch up, thread pop, sphere lands -> flood
  4.0-5.1  flood   big splash, rising sheet whoosh, music goes *underwater* (low-pass) while the camera is submerged
  4.8-6.4  build   snare roll + riser; blobs pinch off; 6.2-6.4 pre-drop gap (silence + reverse swell)
  6.4-8.8  drop    chopped supersaws, 808, half-time drums; logo snap = impact + gloop + sub
  8.8-10   outro   final Dmaj9 rings under the drip plink + ripple
"""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'lib', 'audio'))
import numpy as np
import mgaudio as mg
from mgaudio import recipes, sfx, synth, fm, drums
from mgaudio.theory import midi

HERE = os.path.dirname(os.path.abspath(__file__))
cues = json.load(open(os.path.join(HERE, 'cues.json')))
der = json.load(open(os.path.join(HERE, 'out', 'cues_derived.json')))

DROP = cues['logo_snap']              # 6.4
m = recipes.future_bass(bpm=cues['bpm'], key='D', drop=DROP, build=4.8, outro=cues.get('outro', cues['drip_land']))   # r2: music outro stays at 8.8
f = m.form
print(f.summary())

# ---------------------------------------------------------------- music tweaks
m['pad'].gain = -1.0
m['introhook'].gain = -3.0                       # leave room for the tuned drop notes
m['snap'].gain = -2.0
# submerged: while the camera is inside the flood, the whole music bus goes under water
mus = m.group('music')
mus.automate('lpf', [(0, 20000), (4.05, 20000), (4.28, 700), (4.75, 900), (5.05, 20000), (10, 20000)])
# round 1: a real pre-drop hole. Music bus ducked 20 dB for 6.20-6.39 (riser / roll / hook all gone); only the reverse
# gloop swell and one high kalimba note (sfx bus) hang in the air, so the drop at 6.40 is the loudest moment of the film.
mus.automate('gain', [(0, -3), (3.85, -3), (3.98, -11.5), (5.1, -11.5), (5.6, -4), (6.185, -4), (6.205, -20), (6.285, -20), (6.30, -42), (6.392, -42), (6.399, 4.0), (6.9, 3.0), (7.4, 1.5), (8.8, 1.5), (9.2, 0), (10, 0)])
# session 2: everything before the gap sits 3 dB under the drop section (sfx bus too), so after LUFS normalisation +
# the master limiter the drop is still >= 3 dB above the 4.0 impact (the limiter was flattening the drop's transients)
# session 3: the flood's sfx sit a further 2.5 dB down (3.97-5.2) and the gap's reverse swell stays at -3 until the
# drop frame, so the final master has the drop >= 4 dB above the flood and the gap <= -22 dB (150 ms RMS)
m.group('sfx').automate('gain', [(0, -3), (3.9, -3), (3.97, -5.5), (5.2, -5.5), (5.45, -3), (6.27, -3), (6.30, -34), (6.392, -34), (6.398, 0), (10, 0)])   # r2 P7: near-silence 6.30-6.39
for tn, gdb in (('chords', 1.5), ('sub', 1.5), ('kick', 1.0)):
    if tn in m: m[tn].gain += gdb
# round 1: one clear 1-bar chopped-supersaw hook for the drop (6.4-8.8) replaces the generated chop line
from mgaudio import synth as SY, filters as FI
from mgaudio.core import Sound as SND
from mgaudio.recipes.base import LV
m['chop'].mute = True
hook = m.track('hook1', level=LV['lead'] - 0.5, sends={'delay': -10, 'hall': -14}, pan=-0.03)
STEP = cues['beat'] / 4
BAR = [(0, 'D6', 2), (2, 'B5', 1), (3, 'A5', 1), (4, 'F#5', 2), (6, 'A5', 2), (8, 'B5', 1), (9, 'A5', 1), (10, 'D6', 3), (13, 'E6', 1), (14, 'D6', 1), (15, 'B5', 1)]
for rep_i, t0 in enumerate([DROP, DROP + 16 * STEP]):
    for st, nn, ln in BAR:
        tt = t0 + st * STEP
        if tt >= cues.get('outro', cues['drip_land']) - 0.02: break
        n = midi(nn); d = ln * STEP * 0.72
        sv = SY.voice(n, d, 0.9 if st % 4 == 0 else 0.75, 'saw', 'pulse', 12, 5, 0.3, pw=0.3, cutoff=2600, res=0.1, fenv=(0.001, 0.15, 0.3, 0.1),
                      fenv_amt=1.5, env=(0.004, 0.10, 0.7, 0.08), glide_from=n - 2, glide=0.035, vib_rate=5.5, vib_cents=10)
        hook.add(SND(FI.formant(sv.data, 'a' if st % 3 else 'o', q=5, mix=0.7)), tt)

# ---------------------------------------------------------------- tuned wet notes on the four landings
notes = m.track('dropnotes', level=-21, sends={'hall': -9, 'delay': -15})
landings = cues['landings']
for i, L in enumerate(landings):
    ch = f.chord_at(L['t'] + 0.01)
    top = sorted(ch)[-1]
    n = [ch[0] + 12, ch[1] + 12, ch[2] + 12, top + 12][i] if len(ch) >= 3 else top + 12
    n = int(n)
    while n > midi('A5'): n -= 12
    while n < midi('D5'): n += 12
    v = 0.85 if i < 3 else 1.0
    s = mg.layer([(fm.mallet(n, 0.9, v, 'kalimba'), 0.0, 0.0), (fm.bell(n + 12, 0.7, 0.35 * v, 'glock'), 0.0, -9.0)])
    notes.add(s, L['t'] - 0.004, pan=(L['x'] - 960) / 1400)

# ---------------------------------------------------------------- SFX
pan = lambda x: float(np.clip((x - 960) / 1100, -0.8, 0.8))
# pour: the neck stretching and snapping at frame 5
m.sfx(sfx.stretch(0.22, up=True), at=0.06, gain=-12, pan=pan(640))
m.sfx(sfx.pop('mouth', pitch=1.25), at=cues['pour_snap'], gain=-8, pan=pan(640))
# landings: splash + gloop body (size-scaled), bigger for the fourth
for i, L in enumerate(landings):
    big = L['size'] > 1.2
    m.sfx(sfx.splash(1.1 if big else 0.7, seed=10 + i), at=L['t'] - 0.01, gain=(-1 if big else -4), pan=pan(L['x']), verb=-16)
    m.sfx(sfx.gloop(0.8 if big else 1.0 + 0.1 * i, 0.22, seed=20 + i), at=L['t'] + 0.012, gain=(-5 if big else -9), pan=pan(L['x']))
# secondary droplets landing (2-3 frames late) — tiny drips, only the ones that stay on the floor
rng = np.random.default_rng(7)
for j, c in enumerate(der['crown']):
    near = any(abs(c['t'] - L['t']) < 0.09 for L in landings)
    if near: continue
    if c['t'] < 3.95 and not c['melt'] and rng.random() < 0.55:
        m.sfx(sfx.drip(pitch=float(rng.uniform(1.1, 1.8)), seed=100 + j), at=c['t'], gain=float(-17 + c['r'] * 0.35), pan=pan(c['x']))
    elif c['t'] < 3.95 and c['melt'] and rng.random() < 0.4:
        m.sfx(sfx.bubble(size=float(rng.uniform(0.35, 0.7)), seed=200 + j), at=c['t'], gain=-18, pan=pan(c['x']))
# fuse: three merges (gloop rising), satellite thread snap
hop_pan = [pan(640), pan(405), pan(1250)]
for i, (tk, t) in enumerate(zip(cues['hop_takeoffs'], cues['merges'])):
    m.sfx(sfx.pop('bubble', pitch=0.8 + 0.1 * i), at=tk, gain=-9, pan=hop_pan[i])                  # take-off bloop
    m.sfx(sfx.stretch(0.2, up=True), at=tk - 0.02, gain=-19, pan=hop_pan[i])
    m.sfx(sfx.gloop(1.05 + 0.16 * i, 0.3, seed=30 + i), at=t, gain=-3, pan=hop_pan[i] * 0.4)   # lands in the mass
    m.sfx(sfx.squelch(0.22, seed=40 + i), at=t + 0.02, gain=-14, pan=hop_pan[i] * 0.4)
m.sfx(sfx.pop('soft', pitch=1.4), at=der['satSnap'], gain=-10, pan=pan(1250))
# leap: anticipation squish, rubbery stretch up, thread snap, apex bubble
m.sfx(sfx.squelch(0.2, seed=50), at=cues['leap'] - 0.12, gain=-9)
m.sfx(sfx.stretch(0.3, up=True), at=cues['leap'] + 0.02, gain=-9)
m.sfx(sfx.pop('mouth', pitch=0.9), at=cues['thread_snap'], gain=-6)
m.sfx(sfx.morph(0.45, up=True, note='D4'), at=cues['leap'] + 0.05, gain=-15)
# impact -> flood (the sphere slams the floor, a sheet of liquid rises through the camera)
T = der['impact']
m.sfx(sfx.boom(1.6, 44), at=T, gain=-9)                     # round 1: -3 dB (the drop must outweigh the flood)
m.sfx(sfx.splash(1.6, seed=60), at=T - 0.01, gain=-4.5, verb=-12)
m.sfx(sfx.gloop(0.6, 0.45, seed=61), at=T + 0.02, gain=-5.5)
for j, ts in enumerate(cues['sheets_in']):     # three sheets rise through the lens, 3 frames apart
    m.sfx(sfx.whoosh(0.62, ['heavy', 'swoosh', 'swish'][j], direction=0, peak=0.4, seed=62 + j), at=ts + 0.2, gain=[-4, -7, -9][j])
m.sfx(sfx.bubbles(1.1, density=22, seed=64), at=4.4, gain=-9)
# each sheet's front slapping past the lens centre / its back edge draining past it
# (timed to the measured visual peaks of each sheet, cues.json flood_hits_in/out)
for j, th in enumerate(cues['flood_hits_in']):
    m.sfx(sfx.splash(0.55 + 0.1 * j, seed=90 + j), at=th - 0.012, gain=-12.5 - 1.5 * j + 4 * (j > 0), verb=-18)
    m.sfx(sfx.pop('mouth' if j else 'bubble', pitch=0.7 + 0.12 * j), at=th - 0.006, gain=(-12 if j == 0 else -4), pan=[-0.3, 0.3, 0.0][j])
    if j: m.sfx(sfx.impact('punch', size=0.35, seed=97 + j), at=th - 0.004, gain=-10)
# r2 P7: a crisp wet slap on each sheet crossing (band-passed noise 300 Hz-2 kHz, 3 ms attack, 60 ms decay)
import numpy as _np
def wet_slap(seed):
    r = _np.random.default_rng(seed); n = int(0.16 * 48000); tt = _np.arange(n) / 48000
    x = FI.bpf(r.standard_normal(n), 300, 2000, order=2)
    env = _np.minimum(1.0, tt / 0.003) * _np.exp(-tt / 0.06 * 2.3)
    y = x * env
    return sfx._out(_np.stack([y, _np.roll(y, 23)]), level=-12)
for j, th in enumerate(der.get('slapT', [4.154, 4.267, 4.333])):
    m.sfx(wet_slap(700 + j), at=th - 0.004, gain=-4 - 1.5 * j, pan=[-0.2, 0.25, 0.0][j])
for j, th in enumerate(cues['flood_hits_out']):
    m.sfx(sfx.pop('mouth', pitch=0.8 + 0.15 * j), at=th - 0.006, gain=-9, pan=[0.25, -0.25, 0.0][j])
    m.sfx(sfx.gloop(0.7 + 0.15 * j, 0.25, seed=95 + j), at=th + 0.01, gain=-11)
# jelly waves through the logo on the snare / bar
for tj in der['jelly']:
    m.sfx(sfx.squelch(0.18, seed=int(tj * 10)), at=tj + 0.01, gain=-16)
# reveal: sheets drain upward, blobs pinch off
for j, ts in enumerate(cues['sheets_out']):
    m.sfx(sfx.whoosh(0.7, 'air', direction=0, peak=0.5, seed=70 + j), at=ts + 0.33, gain=[-7, -9, -8][j])
for i, t in enumerate(der['clusterFree']):
    m.sfx(sfx.pop('bubble', pitch=0.9 + 0.12 * i), at=t + 0.005 * i, gain=-10, pan=[-0.4, -0.13, 0.13, 0.4][i])
m.sfx(sfx.stretch(0.35, up=False), at=5.85, gain=-15)
# pre-drop gap: reversed swell sucking into the hit
m.sfx(sfx.swell(sfx.gloop(0.55, 0.5, seed=80), decay=1.4), at=DROP, gain=-14)   # r2 P7: -6 dB
m.sfx(fm.mallet(midi('A6'), 1.2, 0.7, 'kalimba'), at=6.205, gain=-16, verb=-6)      # the one note left in the hole
# THE SNAP
m.sfx(sfx.impact('punch', size=1.1, seed=81), at=DROP, gain=-1.5)   # s2: transient trimmed so the limiter stops eating the drop
m.sfx(sfx.sub_drop(1.1, 95, 34), at=DROP, gain=1.5)
m.sfx(sfx.boom(1.2, 50), at=DROP, gain=-10)
m.sfx(sfx.gloop(0.5, 0.35, seed=83), at=DROP + 0.02, gain=-5)                     # the bar splitting into letters
m.sfx(sfx.splash(0.9, seed=82), at=DROP + 0.01, gain=-6, verb=-14)
for i in range(3):   # liquid bridges between letters snapping apart
    m.sfx(sfx.pop('soft', pitch=1.3 + 0.15 * i), at=cues['letter_bridge_snap'] + i / 30, gain=-14, pan=[-0.3, 0.0, 0.3][i])
for j, d in enumerate(der['snapDrops']):
    m.sfx(sfx.drip(pitch=1.6 + 0.1 * j, seed=300 + j), at=d['t'], gain=-19, pan=pan(d['x']))
# glint
m.sfx(sfx.shimmer_hit(int(sorted(f.chord_at(cues['glint']))[-1]) + 12), at=cues['glint'], gain=-12)
# hero drip: slow stretch, pop at the snap, plink + ripple on landing
m.sfx(sfx.stretch(0.55, up=True), at=der['drip_snap'] - 0.3, gain=-17, pan=pan(der['heroX']))
m.sfx(sfx.pop('mouth', pitch=1.5), at=der['drip_snap'], gain=-9, pan=pan(der['heroX']))
m.sfx(sfx.drip(pitch=1.0, seed=400), at=cues['drip_land'] - 0.005, gain=2, pan=pan(der['heroX']), verb=-8)
m.sfx(sfx.bubble(size=1.3, seed=401), at=cues['drip_land'] + 0.05, gain=-8, pan=pan(der['heroX']))
m.sfx(fm.bell(int(sorted(f.chord_at(9.0))[-1]) + 12, 1.6, 0.6, 'celesta').loud(-18), at=cues['drip_land'] + 0.01, gain=-8, verb=-6)

res = m.export(os.path.join(HERE, 'out', 'audio.wav'), lufs=-14, tp=-2.8, spectrogram=os.path.join(HERE, 'out', 'audio_spec.png'), stems_dir=os.environ.get('STEMS'))
print({k: res[k] for k in ('duration', 'lufs', 'true_peak', 'bands', 'warnings') if k in res})
m.report()
hits = [L['t'] for L in landings] + [T] + cues['flood_hits_in'] + cues['flood_hits_out'] + [DROP, cues['drip_land']]
print(mg.hit_alignment(os.path.join(HERE, 'out', 'audio.wav'), hits))
