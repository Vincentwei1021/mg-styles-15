"""22-hud soundtrack: darksynth pulse (120 bpm, D phrygian, bar 0 = LOCK 6.40 s) + HUD sound design locked to cues.json."""
import sys, json, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'lib', 'audio'))
import mgaudio as mg
from mgaudio import recipes, sfx, drums, synth, fm

HERE = os.path.dirname(os.path.abspath(__file__))
K = json.load(open(os.path.join(HERE, 'cues.json')))
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
LOCK = K['lock']

m = recipes.darksynth(bpm=120, key='D', drop=LOCK, build=K['signal_detected'], outro=K['outro'])
f = m.form
print('tracks', list(m.tracks))
# build bed −3 dB, a 250 ms hole before the lock (music −9 dB, bass low-passed), then the drop opens +1.5 dB
m.group('music').automate('gain', [(0, 0), (4.3, 0), (4.6, -3), (6.12, -3), (6.17, -9), (6.385, -9), (6.40, 1.5), (8.4, 1.5), (9.2, 0)])
for nm in [n for n in m.tracks if 'bass' in n or 'sub' in n]:
    m.track(nm).automate('lpf', [(0, 20000), (6.12, 20000), (6.18, 180), (6.385, 180), (6.40, 20000)])

def note_at(t, idx=-1, up=12):
    return f.chord_at(t)[idx] + up

# --- hook: CRT power-on + sub thump, frame snaps in
m.sfx(sfx.crt_on(), at=0.0, gain=-1)
m.sfx(sfx.boom(0.9, 42), at=0.02, gain=-7)
m.sfx(sfx.hud_open(), at=K['boot']['frame'], gain=-4)
m.sfx(sfx.hud_ping(note=74), at=K['boot']['frame'], gain=-12)                 # range ping: ring expands from the crosshair
# KESTREL motif D-F-A (the optic's call sign): hook 0.12 · signal 4.40 (low) · end 8.90 answered downwards A-F-D
def motif(t0, notes, gain, step=0.065, pan=0.0):
    for i, n in enumerate(notes):
        m.sfx(fm.bell(n, 0.9 if i == len(notes) - 1 else 0.35, 0.8, 'glock').loud(-18), at=t0 + i * step, gain=gain - (0 if i == len(notes) - 1 else 2), pan=pan)
motif(K['boot']['frame'], [74, 77, 81], -8)

# --- BOOT: one beep per hierarchy layer, walking up the chord, panned with the element
layers = [(K['boot']['ring_outer'], 0.0), (K['boot']['ring_ticks'], 0.0), (K['boot']['ring_inner'], 0.0),
          (K['boot']['panel_left'], -0.55), (K['boot']['panel_right'], 0.55)]
for i, (t, pan) in enumerate(layers):
    m.sfx(sfx.hud_beep(note=62 + [0, 3, 7, 10, 12][i] + 12), at=t, gain=-7, pan=pan)
m.sfx(sfx.hud_scan(1.0, 1), at=K['boot']['hex'] + 0.5, gain=-8)           # hex grid wave
m.sfx(sfx.hud_data(1.2), at=K['boot']['globe'] + 0.6, gain=-12)           # coastline growth
# boot log typing (six lines) + [OK] ticks
log_t = [0.40, 0.66, 0.92, 1.18, 1.44, 1.70]
m.sfx(sfx.typing(40, 26, 'soft'), at=0.40, gain=-12, pan=-0.5)
for i, t in enumerate(log_t):
    m.sfx(sfx.tick('hi'), at=t + 0.23, gain=-14, pan=-0.45)
m.sfx(sfx.typing(10, 30, 'soft'), at=1.98, gain=-13, pan=-0.5)

# --- DATA LIVE: radar sweep pings + rolling data chirps
m.sfx(sfx.hud_ping(note=86), at=K['radar_start'], gain=-6, pan=-0.6)
th0 = K['radar_theta0_deg']
for b in K['radar_blips']:
    t = K['radar_start'] + ((b['brg'] - th0) % 360) / 180.0
    while t < LOCK - 0.2:
        m.sfx(sfx.blip(note=93, kind='sine'), at=t, gain=-16, pan=-0.6)
        t += 2.0
for i, t in enumerate(K['data_rolls']):
    m.sfx(sfx.data_chirp(4 + i % 3), at=t, gain=-13, pan=-0.4)
m.sfx(sfx.hud_scan(0.6, -1), at=K['sparkline'] + 0.35, gain=-11, pan=0.55)
# KESTREL-9 ground track draws on (beat 3 accent): ping + data chirp for the label
m.sfx(sfx.hud_ping(note=81), at=K['ground_track'], gain=-7, pan=0.2)
m.sfx(sfx.swish(0.25), at=K['ground_track'] - 0.05, gain=-13, pan=0.2)
m.sfx(sfx.data_chirp(6), at=K['ground_track'] + 0.1, gain=-12, pan=0.3)

# --- ACQUIRE: signal detected, candidate hops, rising lock-on
sd = K['signal_detected']
m.sfx(sfx.glitch(0.16, 'digital'), at=sd, gain=-5)
m.sfx(sfx.hud_alert(), at=sd, gain=-6)
motif(sd + 0.02, [62, 65, 69], -9, step=0.08)
m.sfx(sfx.impact('glitch', size=0.5), at=sd, gain=-8)
for i, t in enumerate(K['candidates'][:2]):
    m.sfx(sfx.swish(0.2), at=t - 0.07, gain=-12)
    m.sfx(sfx.hud_beep(note=74 + 5 * i), at=t, gain=-6)
    m.sfx(sfx.ui('error'), at=t + 0.28, gain=-11)
m.sfx(sfx.swish(0.2), at=K['candidates'][2] - 0.07, gain=-12)
m.sfx(sfx.hud_ping(note=90), at=K['brackets_in'], gain=-4)
# lock-progress ratchet: one tick per 3 lit segments (visual fill = inQ over brackets_in → snap), accelerating
_bi, _sn = K['brackets_in'], K['snap']
for k in range(1, 10):   # stop at k=9 (6.27 s) → ~110 ms of air before the lock impact keeps the hit a clean onset
    m.sfx(sfx.tick('hi'), at=_bi + (_sn - _bi) * (k / 12) ** 0.5, gain=-19 + 0.6 * k, pan=0.25 * (-1) ** k)
m.sfx(sfx.lock_on(LOCK - K['brackets_in'], note='D6'), at=LOCK, gain=-5)  # ascending lock tone resolves onto the drop root D
m.sfx(fm.bell(86, 1.4, 0.8, 'tubular').loud(-18), at=LOCK, gain=-13)        # the D rings out under the impact
# bracket fly-in 5.90-6.17: four panned whooshes (one per bracket, pass-by peaks staggered a frame apart)
for i, (dt, pan) in enumerate([(0.10, -0.85), (0.117, 0.85), (0.133, -0.45), (0.15, 0.45)]):
    m.sfx(sfx.whoosh(0.34, 'sci', direction=1 if pan < 0 else -1, seed=11 + i), at=K['brackets_in'] + dt, gain=-13, pan=pan)
m.sfx(sfx.riser(LOCK - sd, 'hybrid'), at=LOCK, gain=-8)

# --- HERO: bracket snap + LOCK impact + alarm
m.sfx(sfx.swish(0.14), at=K['snap'] - 0.02, gain=-6)                    # brackets snap in (3 frames)
m.sfx(sfx.hud_beep(note=86), at=K['settle'], gain=-9)                     # LOCK 100 % confirm, 2 frames before the impact
# lock stack thinned to impact + boom + alarm, slam on the title/CN arrival (same frame)
m.sfx(sfx.impact('cinematic', size=1.1), at=LOCK - 0.02, gain=0, verb=-12)
m.sfx(sfx.boom(1.4, 38), at=LOCK, gain=-5)
m.sfx(sfx.text_hit('slam'), at=K['title_cn'], gain=-8)
m.sfx(sfx.glitch(0.12, 'crunch'), at=LOCK + 1 / 30, gain=-14)
# dive lands: band strip opens + resolve flash
m.sfx(sfx.impact('glitch', size=0.45), at=K['resolve'], gain=-6)
m.sfx(sfx.hud_open(), at=K['resolve'], gain=-7)
m.sfx(sfx.click('hard'), at=K['resolve'], gain=-8)          # r1 s2: bright attack so the resolve flash reads as synced
m.sfx(sfx.tick('hi'), at=K['resolve'] + 0.004, gain=-12, pan=0.2)
for t in K['alarm']:
    m.sfx(sfx.hud_alert(), at=t, gain=-5 if t == LOCK else -8)
for t in K['alert_pulses']:
    m.sfx(sfx.hud_ping(note=note_at(t, -1, 24)), at=t, gain=-11)
m.sfx(sfx.typing(17, 34, 'soft'), at=K['coords'], gain=-11)
m.sfx(sfx.downlifter(1.1), at=LOCK + 0.3, gain=-16)                   # hologram dive (air)
# the dive is heard: saw+sub glides down one octave D3 -> D2 following MAG x1 -> x21 over 6.43-7.10, cut by the resolve
dive = synth.voice(38, 0.69, 0.9, osc='saw', osc2='saw', osc2_cents=12, sub=0.7, cutoff=1400, res=0.2, glide_from=50, glide=0.62,
                   env=(0.01, 0.2, 0.9, 0.03), drive=1.6).loud(-18)
m.sfx(dive, at=LOCK + 1 / 30, gain=-6)

# --- END: final ping in key
motif(K['end_hold'], [81, 77, 74], -8, step=0.09)                       # the end answers the hook
# UPLINK: data burst while the bar fills 9.00-9.40, SENT stamp on the 9.40 beat
m.sfx(sfx.data_chirp(8), at=9.0, gain=-14, pan=0.55)
m.sfx(sfx.ui('confirm'), at=9.4, gain=-8, pan=0.5)
m.sfx(sfx.hud_ping(note=86), at=9.4, gain=-10, pan=0.5)
m.sfx(sfx.click('hard'), at=9.4, gain=-13, pan=0.5)
# CRT power-off over the last 6 frames; the music tape-stops into it
m.sfx(sfx.crt_off(), at=9.767, gain=-5)
m.tape_stop(9.62, 0.3)

res = m.export(os.path.join(HERE, 'out/audio.wav'), lufs=-14, tp=-1.5, spectrogram=os.path.join(HERE, 'out/audio_spec.png'))
print({k: res[k] for k in ('duration', 'lufs', 'true_peak', 'stereo_corr', 'bands', 'warnings') if k in res})
m.report()
