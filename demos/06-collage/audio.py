"""06-collage soundtrack: dusty 90 bpm boom-bap (lofi recipe, piano) + paper/cartoon sound design locked to cues.json.
Run: python3 demos/06-collage/audio.py  -> out/audio.wav (+ out/audio_spec.png)"""
import sys, json, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'lib', 'audio'))
import mgaudio as mg
from mgaudio import recipes, sfx, fm, drums, filters
D = os.path.dirname(os.path.abspath(__file__))
C = json.load(open(os.path.join(D, 'cues.json')))
OUTRO = C['end_masthead']
import numpy as np, soundfile as sf
from mgaudio.core import Sound
from mgaudio import samples
# --- recorded public-domain foley (Wikimedia Commons, see CREDITS.md), sliced at measured onsets
FOL = {k: sf.read(os.path.join(D, 'assets/sfx', k + '.wav'))[0] for k in ('scissors', 'pages', 'tape', 'crumple', 'clear', 'cough')}
def foley(name, t0, dur, pre=0.012, fade=0.05, peak=-3.0):
    x = FOL[name]; sr = 48000; a = max(0, int((t0 - pre) * sr)); seg = x[a:a + int((dur + pre) * sr)].copy()
    r = int(0.002 * sr); seg[:r] *= np.linspace(0, 1, r); f = int(fade * sr); seg[-f:] *= np.linspace(1, 0, f) ** 2
    seg = seg / (np.abs(seg).max() + 1e-9) * 10 ** (peak / 20)
    return Sound(seg, sync=pre)
SNIP = [1.02, 1.74, 3.11, 4.76, 6.40, 17.51, 2.53]          # scissor-cut transients
PAGE = [13.84, 25.97, 23.28, 4.39, 5.78, 17.76, 26.13]      # page slaps / flips
TAPE = [0.37, 2.99, 9.09, 6.13, 9.42]                       # tape pulls (rips)
def paper_slap(t, gain=0, pan=0.0, i=0, body=-8):           # real paper hit + a soft synth thump underneath for weight
    m.sfx(foley('pages', PAGE[i % len(PAGE)], 0.22), at=t, gain=gain, pan=pan)
    m.sfx(sfx.impact('thud'), at=t, gain=body + gain, pan=pan)
m = recipes.lofi(bpm=90, key='F', drop=C['pop'], build=C['build'], outro=OUTRO, keys='piano', flavor='boombap', vinyl=True)
f = m.form
print('form', f.summary() if hasattr(f, 'summary') else '', 'tracks', list(m.tracks))

def start_at(s, t):          # place a sound so its START is at t (for sweeps whose sync is not their onset)
    return t + getattr(s, 'sync', 0.0)

# --- structure: an 8th of dead air (3.667-4.0) before the POP, record-scratch stop into the tear
m.mute(C['gap'][0], C['pop'] - C['gap'][0])
# r3 mix: bed -3 dB under the talking jaw, final chord -2 dB (the POP must be the loudest window)
m.group('music').automate('gain', [(1.22, 0), (1.3, -3), (2.25, -3), (2.33, 0), (8.2, 0), (8.3, -2), (10, -2)])
m.mute(C['tear'][0] + 0.03, OUTRO - C['tear'][0] - 0.05)

# --- act 1: the giant hand slides the portrait in and slaps it down
m.sfx(foley('pages', PAGE[3], 0.34, fade=0.12), at=0.02, gain=-3, pan=0.45)
paper_slap(C['slap_portrait'], gain=3, i=0, body=-5)
m.sfx(sfx.impact('thud'), at=C['slap_portrait'], gain=-3)
paper_slap(C['slap_circle'], gain=0, pan=-0.1, i=1)
m.sfx(foley('pages', PAGE[4], 0.25), at=C['slap_news'], gain=-3, pan=0.55)
paper_slap(C['slap_news'] + 1 / 12, gain=-4, pan=0.7, i=2)
# the portrait "speaks": muted-horn lick on the jaw flaps + ransom-note speech scraps slapped on each downbeat
horn = m.track('horn', level=-25, sends={'plate': -12}, lp=2200, group='sfx')
for i, (t, n, d) in enumerate(zip(C['jaw'], ['A4', 'C5', 'G4'], [0.2, 0.2, 0.34])):
    horn.add(fm.brass(n, d, 0.8), t)
    paper_slap(t, gain=-4 + i, pan=0.5, i=4 + i, body=-10)
# the mouth sounds like a mouth: a real PD throat-clear on AHEM, a real double cough on 咳咳 (Wikimedia Commons, CREDITS.md)
m.sfx(foley('clear', 3.08, 0.30, fade=0.08), at=C['jaw'][0], gain=-2, pan=0.35)
m.sfx(foley('cough', 0.34, 0.17, fade=0.06), at=C['jaw'][1], gain=-3, pan=0.35)
m.sfx(foley('cough', 0.78, 0.2, fade=0.08), at=C['jaw'][1] + 1 / 6, gain=-6, pan=0.35)
m.sfx(sfx.stamp('rubber', seed=6), at=C['stamp_cut'], gain=1, pan=0.3)
paper_slap(C['chip06'], gain=-3, pan=0.7, i=5, body=-9)                                     # Nº06 chip slaps in
m.sfx(foley('tape', TAPE[0], 0.32, fade=0.1), at=C['stamp_cut'] + 0.01, gain=-2, pan=0.6)   # speech scraps torn away
# build: real scissor snips on 16ths + a snare roll (16ths -> 32nds, +9 dB), bed low-pass sweep 450 Hz -> 5 kHz, reverse cymbal
for i, t in enumerate(C['snips']):
    m.sfx(foley('scissors', SNIP[i], 0.24), at=t, gain=1 + i * 0.6, pan=-0.25 + 0.12 * i)
roll = m.track('roll', level=-12, sends={'plate': -16}, group='music')
rt = [2.6666667 + i / 6 for i in range(4)] + [3.3333333 + i / 12 for i in range(4)]
for i, t in enumerate(rt):
    roll.add(drums.snare('tight', vel=0.34 + 0.66 * (i / (len(rt) - 1)) ** 1.2), t, gain=3 if i >= 4 else 0)
for name, tr in m.tracks.items():
    if name in ('keys', 'mel', 'hat', 'shaker', 'snare', 'vinyl'):
        tr.automate('lpf', [(C['stamp_cut'] - 0.01, 18000), (C['stamp_cut'], 450), (3.70, 5000), (3.72, 18000)])
rc = sfx.reverse_cymbal(dur=1.3); print('revcym sync', rc.sync, 'dur', rc.dur)
m.sfx(rc, at=C['gap'][0], gain=-2)
for i, t in enumerate(C['rattle']):
    m.sfx(sfx.click('wood').pitch(i * 1.5), at=t, gain=-4 + 3 * i, pan=-0.2)
    if i < 2: m.sfx(samples.hit('woodblock', vel=0.5 + 0.2 * i, maxdur=0.06).fade(0.02), at=t + 1 / 24, gain=-9 + 2 * i, pan=-0.2)
    else: m.sfx(sfx.tick('wood').pitch(i), at=t + 1 / 24, gain=-10 + 2 * i, pan=-0.2)   # short tick: silence from 3.75

# --- act 2: POP — the lid launches, the burst, the lid slaps back onto its brad, the mind spills out
m.sfx(sfx.cork_pop(), at=C['pop'], gain=3)
m.sfx(sfx.impact('punch'), at=C['pop'], gain=-2, verb=-12)
_n = int(0.45 * 48000); _t = np.arange(_n) / 48000; _f = 55 * (35 / 55) ** (_t / 0.45)              # sub-drop 55 -> 35 Hz
_sub = np.sin(2 * np.pi * np.cumsum(_f) / 48000) * np.minimum(1, _t / 0.004) * np.exp(-_t * 3.2) * 0.7
m.sfx(Sound(_sub), at=C['pop'], gain=-6)
m.sfx(foley('crumple', 2.89, 0.4, fade=0.15), at=C['pop'] + 0.01, gain=-2, pan=0.1)       # paper confetti burst
m.sfx(foley('pages', PAGE[1], 0.2), at=C['burst'][1], gain=-6, pan=-0.3)
m.sfx(samples.hit('slapstick', vel=0.7), at=C['lid_land'], gain=-3, pan=-0.45)            # lid slaps back on its hinge
m.sfx(samples.hit('woodblock', vel=0.8), at=C['lid_land'], gain=-6, pan=-0.45)
s = sfx.slide_whistle(up=True, dur=0.5); m.sfx(s, at=start_at(s, C['rocket']), gain=-4, pan=0.45)
m.sfx(foley('crumple', 9.82, 0.3, fade=0.12), at=C['rocket'] + 1 / 12, gain=-9, pan=0.4)  # paper smoke puffs
m.sfx(sfx.pop('soft', pitch=0.8), at=C['earth'], gain=-3, pan=-0.2)
m.sfx(foley('pages', PAGE[5], 0.2), at=C['earth'] + 0.5, gain=-9, pan=-0.2)               # Earth lands
for i, t in enumerate(C['birds']):
    m.sfx(foley('pages', PAGE[6], 0.18), at=t, gain=-5, pan=0.6)
m.sfx(sfx.pop('mouth', pitch=1.15), at=C['roses'], gain=-4, pan=-0.1)
m.sfx(sfx.pop('mouth', pitch=1.3), at=C['roses'] + 1 / 12, gain=-5, pan=0.2)
m.sfx(foley('pages', PAGE[2], 0.3, fade=0.12), at=C['butterflies'], gain=-9, pan=0.3)
m.sfx(foley('pages', PAGE[3], 0.3, fade=0.12), at=C['manicules'] - 2 / 12, gain=-6, pan=-0.6)
for i, t in enumerate(C['manicule_taps']):
    m.sfx(samples.hit('woodblock', vel=0.6), at=t, gain=-6, pan=-0.35)
    m.sfx(foley('pages', PAGE[i + 4], 0.08, fade=0.03), at=t, gain=-8, pan=-0.35)          # paper tick of the fingertip
paper_slap(C['band'], gain=3, i=0, body=-4)
ch = f.chord_at(C['hero'][0])
notes = sorted(ch)[-4:] if len(ch) >= 4 else list(ch) + [ch[0] + 12]
glock = m.track('glock', level=-26, sends={'plate': -10}, group='sfx')
for i, t in enumerate(C['hero']):
    paper_slap(t, gain=0 + i * 0.7, pan=[0.35, 0.6, 0.35, 0.6][i], i=i, body=-9)
    glock.add(fm.bell(notes[i] + 12, 0.5, 0.7, 'glock'), t)

# --- act 3: record scratch, the page rips (real tape pull) and the halves peel off, the button
m.sfx(sfx.record_scratch(kind='stop'), at=C['tear'][0], gain=1)
m.sfx(foley('tape', TAPE[2], 0.13, fade=0.04), at=C['tear'][0] + 0.02, gain=1, pan=0.0)   # the pinch: short tension rip, ends before the crack
m.sfx(foley('tape', TAPE[1], 0.42, fade=0.12), at=C['tear'][1] + 0.01, gain=-1, pan=0.1)   # the peel rip carries the curl
m.sfx(foley('tape', TAPE[3], 0.06, pre=0.004, fade=0.02, peak=-1), at=C['shake'], gain=4, pan=0.0)   # the crack: fast rip transient
m.sfx(sfx.impact('thud'), at=C['shake'], gain=-3)                                                  # + low thump under the 6 px shake
s = sfx.whoosh(0.56, 'soft', direction=-1, peak=0.55, seed=64); m.sfx(s, at=start_at(s, C['tear'][1] + 0.02), gain=-4, pan=-0.55)
s = sfx.whoosh(0.6, 'air', direction=1, peak=0.55, seed=65); m.sfx(s, at=start_at(s, C['tear'][1] + 0.06), gain=-6, pan=0.55)
m.sfx(foley('pages', PAGE[1], 0.25, fade=0.1), at=C['tear'][1] + 2 / 12, gain=-6, pan=-0.4)   # verso flips over
m.sfx(foley('pages', PAGE[6], 0.25, fade=0.1), at=C['tear'][1] + 3 / 12, gain=-7, pan=0.4)
paper_slap(C['end_masthead'], gain=3, i=0, body=-5)
m.sfx(sfx.stamp('rubber', seed=63), at=C['end_masthead'] + 2 / 12, gain=-3)
tada = m.track('tada', level=-23, sends={'plate': -10}, lp=3200, group='sfx')
tada.add(fm.brass('C5', 0.12, 0.75), C['end_jaw'] - 1 / 6)
for n in ['F4', 'A4', 'C5']:
    tada.add(fm.brass(n, 0.7, 0.8), C['end_jaw'])
paper_slap(C['end_button'], gain=0, pan=-0.4, i=2)
m.sfx(samples.hit('woodblock', vel=0.9), at=C['end_lid'], gain=-3, pan=0.35)               # the lid SNAPS SHUT on its brad
m.sfx(samples.hit('slapstick', vel=0.55), at=C['end_lid'], gain=-8, pan=0.35)
m.sfx(sfx.impact('thud'), at=C['end_lid'], gain=-8, pan=0.3)
m.sfx(foley('scissors', SNIP[5], 0.26), at=C['end_snip'], gain=0, pan=-0.4)                # final button: the ✂ snips once

res = m.export(os.path.join(D, 'out/audio.wav'), spectrogram=os.path.join(D, 'out/audio_spec.png'))
print({k: res[k] for k in ('duration', 'lufs', 'true_peak', 'stereo_corr', 'longest_gap') if k in res})
print('bands', res.get('bands')); print('warnings', res.get('warnings'))
hits = [C['slap_portrait'], C['slap_circle'], C['slap_news'], *C['jaw'], C['stamp_cut'], *C['snips'], *C['rattle'], C['pop'],
        C['lid_land'], C['rocket'], C['earth'], C['band'], *C['hero'], C['tear'][0], C['end_masthead'], C['end_jaw'], C['end_button'], C['end_snip'], C['chip06'], C['shake'], C['end_lid'], *C['manicule_taps']]
json.dump(hits, open(os.path.join(D, 'out/hits.json'), 'w'))
al = mg.hit_alignment(os.path.join(D, 'out/audio.wav'), hits)
print('alignment', al if not isinstance(al, list) else al[:3], '...')
