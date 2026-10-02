# popwise — "One Dot" soundtrack: mgaudio pop recipe (EDM-pop 120 BPM, F major) + SFX locked to cues.json frames
import sys, json, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'lib', 'audio'))
import mgaudio as mg
from mgaudio import recipes, sfx, theory, synth

HERE = os.path.dirname(os.path.abspath(__file__))
cues = json.load(open(os.path.join(HERE, 'cues.json')))
FR = cues['frames']; T = lambda k: FR[k] / 30.0; F = lambda n: n / 30.0

m = recipes.pop(bpm=cues['bpm'], key=cues['key'], build=cues['build'], drop=cues['drop'], outro=cues['outro'])
f = m.form
print(f.summary() if hasattr(f, 'summary') else f)
print('tracks:', list(m.tracks))
note = lambda t, i=-1, sh=12: f.chord_at(t, sh)[i]

from mgaudio import samples, seq, drums, fm
try:
    MAR = samples.inst('marimba'); mar = lambda n, d=0.6, v=0.9: MAR.play(n, dur=d, vel=v)
except Exception:
    mar = lambda n, d=0.6, v=0.9: fm.mallet(n, d, v, 'marimba')
# SONIC LOGO: 4-note motif F5-A5-C6-A5 = the phone ping (4.0), answered one note per landing in the drop, resolved to F6 on the tittle (8.50)
MOTIF = ['F5', 'A5', 'C6', 'A5']
mot = m.track('motif', level=-18, sends={'plate': -12, 'delay': -18}, group='music')
png = m.track('ping', level=-23, sends={'delay': -24}, group='music')   # R2: the 4.0 ping sits 5 dB lower, no plate send
for k, n in enumerate(MOTIF): png.add(mar(n, 0.5, 0.95 if k == 0 else 0.85), T('ping') + k * F(2.5))
for k, n in enumerate(MOTIF): mot.add(mar(n, 0.6, 1.0), T('burst%d' % (k + 1)))
# R2: the drop moves once per landing F-Am-Bb-C (bass under the recipe pad), motif doubled a 3rd above, 808 roots; V -> I on the tittle
DROP = [('A5', 'F1'), ('C6', 'A1'), ('D6', 'Bb1'), ('C6', 'C2')]
har = m.track('motif3', level=-22, sends={'plate': -18}, group='music')
sub = m.track('sub808', level=-12, group='music')
for k, (h3, root) in enumerate(DROP):
    har.add(mar(h3, 0.55, 0.8), T('burst%d' % (k + 1)))
    sub.add(synth.b808(root, 0.47, 0.95), T('burst%d' % (k + 1)))
sub.add(synth.b808('F1', 1.2, 1.0), T('dotLand2'))
if 'bass' in m.tracks: m['bass'].region('mute', cues['drop'], 2.0)
if 'kick' in m.tracks:
    for k in ('pad', 'arp', 'chords', 'lead', 'motif3'):
        if k in m.tracks: m[k].duck(by='kick', depth=6, release=0.18)
for k, n in enumerate(['F5', 'A5', 'C6']): mot.add(mar(n, 0.35, 0.7 + 0.08 * k), T('dotApex') + k * F(2))
mot.add(mar('F6', 1.4, 1.0), T('dotLand2'))
# ---- act 1: the dot (signature hits only)
m.sfx(sfx.whoosh(0.42, 'swish', direction=1, peak=0.4), at=F(7), gain=-16, pan=-0.2)          # ground sweep
m.sfx(sfx.pop('mouth', pitch=0.78), at=T('impact1') - F(1), gain=1)
m.sfx(sfx.impact('soft'), at=T('impact1'), gain=-9)
m.sfx(sfx.pop('bubble', pitch=1.15), at=T('impact2') - F(1), gain=-5)
m.sfx(sfx.whoosh(0.34, 'swish', direction=1, peak=0.5), at=T('launch') + F(3), gain=-4, pan=0.3)
m.sfx(sfx.shimmer_hit(note(T('sunLand'))), at=T('sunLand'), gain=-7, pan=0.45, verb=-12)
# ---- city: one rising marimba glissando across the skyline (instead of a pop per building), bus pass-by
gl = m.track('gliss', level=-24, pan=0, sends={'room': -12}, group='music')
for k, n in enumerate(['F4', 'A4', 'C5', 'F5', 'A5']):
    gl.add(mar(n, 0.3, 0.55 + 0.08 * k), T('bldStart') + F(k * 2 * FR['bldStagger'] + 1))
m.sfx(sfx.whoosh(0.7, 'air', direction=1, peak=0.5), at=2.23, gain=-18, pan=0.0)
m.sfx(sfx.sparkle(0.6, key=cues['key']), at=T('winStart'), gain=-12, verb=-10)
m.sfx(sfx.click('switch'), at=T('heroWin'), gain=-4)
# ---- push through the window
m.sfx(sfx.whoosh(0.6, 'air', direction=1, peak=0.7), at=T('glass') - F(4), gain=-9)
m.sfx(sfx.transition(0.5, 'swish_pop'), at=T('glass'), gain=-6)
m.sfx(sfx.pop('cork', pitch=1.1), at=T('glass'), gain=-1)
m.sfx(sfx.pop('bubble', pitch=1.35), at=T('glass') - F(2), gain=-8)
m.sfx(sfx.typing(6, rate=11, kind='keyboard'), at=T('arrive') + F(1), gain=-10)
# ---- interior: reaction (the ping itself is the motif)
m.sfx(sfx.swish(0.2), at=T('headSnap'), gain=-8)
m.sfx(sfx.pop('mouth', pitch=1.35), at=T('exclaim') - F(1), gain=-5, pan=0.15)
# ---- BUILD 4.8-6.0: real riser (noise sweep +8 dB, snare roll 8ths->16ths->32nds, filter opening); pre-drop dip kept
m.track('riser2', level=-24, group='music').add(sfx.riser(1.5, 'noise', intensity=1.0), T('burst1'))
m['riser2'].automate('gain', [(4.5, -6), (5.9, 2), (10, 2)])
rl = m.track('roll', level=-24, sends={'plate': -16}, group='music')
rl.hits(lambda v: drums.snare('tight', v), seq.roll(4.6, T('burst1') - F(2), 8, 32, m.grid, 0.3, 1.0))
rl.automate('gain', [(4.6, -9), (5.9, 0), (10, 0)])
for k in ('pad', 'arp'):
    if k in m.tracks: m[k].automate('lpf', [(0, 20000), (4.75, 20000), (4.8, 900), (5.95, 14000), (6.0, 20000), (10, 20000)])
# ---- shape wipes: comet bubble, capsule, half-disc slam
m.sfx(sfx.whoosh(0.5, 'swoosh', direction=1, peak=0.55), at=T('wipe') + F(4), gain=-11, pan=0.2)
m.sfx(sfx.pop('bubble', pitch=0.8), at=T('wipe2') + F(2), gain=-3, pan=0.1)
m.sfx(sfx.impact('thud'), at=T('slam'), gain=-6)
m.sfx(sfx.pop('soft', pitch=1.1), at=T('coreDot'), gain=-11)
m.sfx(sfx.pop('bubble', pitch=1.25), at=T('coreHit'), gain=-8)                                 # R2: dot contact cracks the grid open
# ---- drop: the dot lands on every beat (landing pop + the motif note); coin ding
for k, (kind, p, pan) in enumerate([('bubble', 0.95, -0.35), ('bubble', 1.05, 0.35), ('mouth', 0.9, 0.35), ('bubble', 1.15, -0.35)]):
    m.sfx(sfx.pop(kind, pitch=p), at=T('burst%d' % (k + 1)), gain=-3, pan=pan)
m.sfx(sfx.impact('punch'), at=T('burst1'), gain=-4)
m.sfx(sfx.ding(note(T('burst4'), -1, 24)), at=T('burst4') + F(5), gain=-8, pan=-0.35)
# ---- collapse -> merge -> lockup
m.sfx(sfx.whoosh(0.32, 'swish', direction=-1, peak=0.8), at=T('merge') - F(3), gain=-7)
m.sfx(sfx.pop('bubble', pitch=0.72), at=T('merge'), gain=0)
m.sfx(sfx.pop('mouth', pitch=1.3), at=F(238), gain=-4, pan=0.25); m.sfx(sfx.pop('bubble', pitch=1.1), at=F(239), gain=-9, pan=-0.2)   # zip absorptions
# R2 sync: pops (not switch clicks) on the three picture motion peaks that lost their transient
m.sfx(sfx.pop('cork', pitch=0.9), at=F(101), gain=-7)          # 3.367 push commits
m.sfx(sfx.pop('mouth', pitch=1.1), at=F(156), gain=-4, pan=0.1) # 5.20 capsule max coverage
m.sfx(sfx.pop('mouth', pitch=0.95), at=F(236), gain=-5)         # 7.867 fields snap into dots
m.sfx(sfx.whoosh(0.2, 'swish', direction=1, peak=0.9), at=T('dotLand2') - F(1), gain=-12)          # push-in onto the i
m.sfx(sfx.pop('soft', pitch=1.5), at=T('cnFlip'), gain=-13, pan=0.12)
m.sfx(sfx.impact('punch'), at=T('merge'), gain=-3)
m.sfx(sfx.pop('mouth', pitch=1.2), at=T('merge') + F(4), gain=-5)
m.sfx(sfx.pop('mouth', pitch=1.05), at=T('dotLand2') - F(1), gain=0, pan=0.08)
m.sfx(sfx.shimmer_hit(note(T('dotLand2'), -1, 12)), at=T('dotLand2'), gain=-6, pan=0.08, verb=-10)
m.sfx(sfx.sparkle(0.5, key=cues['key']), at=T('cnFlip'), gain=-14, verb=-10)                 # 点 dots flip coral

# ---- pre-hit "suck": the music bus dips for ~60 ms before each visual motion peak and slams back ON the hit
HITS = [T('glass') - F(2), T('wipe2') + F(2), T('slam'), T('burst1'), T('merge'), T('dotLand2')]
pts = [(0.0, 0.0)]
for h in HITS: pts += [(h - 0.095, 0.0), (h - 0.055, -9.0), (h - 0.006, -9.0), (h, 0.0)]
m.group('music').automate('gain', pts + [(10.0, 0.0)])
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
res = m.export(os.path.join(HERE, 'out/audio.wav'), lufs=-14, tp=-2.2, spectrogram=os.path.join(HERE, 'out/audio_spec.png'))
print({k: res[k] for k in ('duration', 'lufs', 'true_peak', 'stereo_corr', 'bands', 'warnings') if k in res})
m.report()
