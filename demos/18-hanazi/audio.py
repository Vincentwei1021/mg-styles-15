"""18-hanazi soundtrack: bouncy variety-show bed (pizz / tuba bass / glock / claps) + cartoon SFX locked to cues.json.
Run: python3 demos/18-hanazi/audio.py  ->  out/audio.wav (+ out/audio_spec.png)"""
import sys, json, os
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'lib', 'audio'))
import mgaudio as mg
from mgaudio import recipes, sfx

HERE = os.path.dirname(os.path.abspath(__file__))
C = json.load(open(os.path.join(HERE, 'cues.json')))
SR = 48000

m = recipes.variety(bpm=C['bpm'], key='F', drop=C['drop'], build=C['wipe'], outro=C['outro'], flavor='bouncy')
f = m.form
m.tracks['tuba'].gain += 2.5   # more bottom for phone speakers (bass band was ~22 %)
m.tracks['kick'].gain += 1.0
print(f.summary() if hasattr(f, 'summary') else (f.bpm, f.build, f.drop, f.outro))
print('levels', {k: round(v.level, 1) for k, v in m.tracks.items()}, 'whoosh sync', sfx.whoosh(0.5, 'swish', direction=-1).sync)
from mgaudio import drums, synth
from mgaudio.filters import formant

# --- round 1: the drop is a tutti and louder than the build; the build is pulled back
m.group('music').automate('gain', [(0, 0), (3.95, 0), (4.0, -3.0), (5.2, -4.5), (5.25, -7.5), (5.97, -7.5), (6.0, 3.5), (7.45, 3.5), (7.55, 0), (10, 0)])
fl = m.track('floor', level=m.tracks['kick'].level - 6.0)   # layered under the recipe kick: keep the stack from feeding the limiter
fl.loop(lambda v: drums.kick('house', v), 'x...x...x...x...', C['drop'], C['freeze'])
m.track('clap2', level=m.tracks['clap'].level + 1, sends={'plate': -12}).loop(lambda v: drums.clap('big', v), '....x.......x...', C['drop'], C['freeze'])
br = m.track('stab', level=m.tracks['brass'].level + 4, sends={'hall': -14})
for t in (C['drop'], C['drop'] + 1.0):
    br.add(synth.stab(f.chord_at(t + .01, 12), 0.42, 0.95, 'brass'), t)
m.track('crash2', level=m.tracks['crash'].level + 2).add(drums.crash(), C['drop'])
br.add(synth.stab(f.chord_at(C['drop'] + .51, 12), 0.4, 1.0, 'brass'), C['drop'] + 0.5)   # r2s2: off-beat stab keeps the drop above the push


def crowd(dur, vowels, contour, n=26, seed=0, laugh=False, lvl=-18):
    # synthetic studio audience: n detuned glottal voices -> vowel formants (crossfaded) + breath, two independent sides
    rng = np.random.default_rng(seed); N = int(dur * SR); tt = np.arange(N) / SR; out = np.zeros((N, 2))
    for side in range(2):
        y = np.zeros(N)
        for v in range(n):
            f0 = rng.choice([rng.uniform(190, 330), rng.uniform(105, 175)], p=[.6, .4])
            vib = 1 + .012 * np.sin(2 * np.pi * rng.uniform(4.5, 6.5) * tt + rng.uniform(0, 6))
            c = np.interp(tt / dur, *zip(*contour)) * (1 + rng.uniform(-.05, .05))
            ph = np.cumsum(f0 * c * vib) / SR; saw = 2 * (ph % 1) - 1
            on = rng.uniform(0, .09) if not laugh else rng.uniform(0, .18)
            env = np.clip((tt - on) / .07, 0, 1) * np.clip((dur - tt) / (.35 * dur), 0, 1) ** 1.3
            if laugh:   # 'ha-ha-ha' syllables, each voice at its own rate
                r = rng.uniform(4.2, 6.4); syl = ((tt - on) * r) % 1; env *= np.clip(1 - syl / .55, 0, 1) ** 1.5 * (syl < .55)
            y += saw * env * rng.uniform(.6, 1.0)
        nz = rng.standard_normal(N) * .35 * (np.abs(y) / (np.abs(y).max() + 1e-9) + .2)
        y = y + nz
        a, b = formant(y, vowels[0], q=6.0), formant(y, vowels[-1], q=6.0)
        k = np.clip(tt / .14, 0, 1) if len(vowels) > 1 else np.ones(N)
        out[:, side] = a * (1 - k) + b * k
    out /= np.abs(out).max() + 1e-9
    return mg.Sound(out, sync=0.0).loud(lvl)


from mgaudio.filters import eq as _eq
_crowd0 = crowd
def crowd(*a, **k):   # round 2: presence lift, less boxy low-mid
    return _eq(_crowd0(*a, **k), [('hp', 140), ('pk', 420, -2.5, .8), ('hs', 3000, 4.0)])
m.sfx(crowd(0.95, 'ua', [(0, .92), (.3, 1.16), (1, .86)], seed=3), at=C['drop'] + 0.05, gain=-3, verb=-8, send='hall')      # 哇～
m.sfx(crowd(0.55, 'a', [(0, 1.0), (.5, 1.1), (1, .95)], n=24, seed=23), at=C['drop'] + 0.42, gain=-3, verb=-9, send='hall')   # r2s2: sustained cheer 6.42-6.97
m.sfx(crowd(0.85, 'a', [(0, 1.05), (1, .9)], seed=7, laugh=True), at=3.62, gain=-13, verb=-10, send='hall')               # canned laugh
m.sfx(crowd(0.7, 'uo', [(0, .95), (.45, 1.14), (1, 1.0)], n=20, seed=11), at=C['charge'][2] + 0.1, gain=-11, verb=-10, send='hall')  # 噢～ on 满电

# record scratch kills the band -> dead air (crickets) until the candy wipe brings it back
m.mute(C['scratch'] + 0.03, C['wipe'] - C['scratch'] - 0.05)


def note_in_key(t, octave_up=12, idx=-1):
    return f.chord_at(t)[idx] + octave_up


def dur_of(s):
    d = getattr(s, 'data', None)
    return (d.shape[0] / SR) if d is not None else 0.6


def crickets(dur=0.95, seed=3):
    rng = np.random.default_rng(seed)
    n = int(dur * SR); y = np.zeros((n, 2))
    tt = np.arange(int(0.016 * SR)) / SR
    pulse = np.sin(2 * np.pi * 4700 * tt) * np.hanning(len(tt))
    for ch, (period, off, fr) in enumerate([(0.34, 0.02, 4700), (0.41, 0.17, 4380)]):
        p = np.sin(2 * np.pi * fr * tt) * np.hanning(len(tt))
        t0 = off
        while t0 < dur - 0.1:
            for k in range(3):
                i = int((t0 + k * 0.028) * SR)
                if i + len(p) < n:
                    y[i:i + len(p), ch] += p * (0.8 + 0.2 * rng.random())
                    y[i:i + len(p), 1 - ch] += p * 0.35
            t0 += period * (0.95 + 0.1 * rng.random())
    env = np.minimum(1, np.minimum(np.arange(n) / (0.08 * SR), (n - np.arange(n)) / (0.12 * SR)))[:, None]
    return mg.Sound(y * env * 0.3, sync=0.0).loud(-18)


# --- shot 1: 今日份快乐 per-char pops, rising; sparkle; whisper
for i, t in enumerate(C['title']):
    m.sfx(sfx.pop('mouth', pitch=1.0 + 0.09 * i), at=t - 1 / 30, gain=-3, pan=-0.45 + 0.22 * i)
m.sfx(sfx.shimmer_hit(note_in_key(C['sparkle1'])), at=C['sparkle1'], gain=-8, pan=0.3)
m.sfx(sfx.pop('soft', pitch=1.5), at=C['aside'], gain=-9, pan=-0.3)
m.sfx(sfx.squeak(seed=2), at=C['aside'] + 0.2, gain=-12, pan=-0.3)
m.sfx(sfx.swish(dur=0.14, direction=1, seed=7), at=C['ear'] - 0.02, gain=-15, pan=0.25)   # r2s2: ear flick
m.sfx(sfx.blip('A6', kind='sine', dur=0.05, glide=1.6), at=C['ear'] + 0.035, gain=-17, pan=0.25)

# battery gag: pop in, three rising charge blips (F triad), 'full' ding right before the scratch
m.sfx(sfx.pop('soft', pitch=1.25), at=C['battery'] - 1 / 30, gain=-8, pan=-0.4)
for j, t in enumerate(C['charge']):
    m.sfx(sfx.blip(note=['A5', 'C6', 'F6'][j], kind='sine', dur=0.08, glide=0), at=t, gain=-9, pan=-0.4)
m.sfx(sfx.ding(note='F6', kind='bell', dur=0.6), at=C['charge'][2] + 0.03, gain=-10, pan=-0.3)
# title hops on the quarter beats: tiny spring boings
for t in C['title_beats']:
    m.sfx(sfx.boing(pitch=1.5, dur=0.25), at=t, gain=-15, pan=0.1)

# --- shot 2: scratch, ??? boings, punch-in zip, crickets, sweat drips
m.sfx(sfx.record_scratch(kind='stop'), at=C['scratch'], gain=1)
for i, t in enumerate(C['qmarks']):
    m.sfx(sfx.boing(pitch=0.92 + 0.16 * i, dur=0.45), at=t - 1 / 30, gain=-4, pan=-0.35 + 0.35 * i)
m.sfx(sfx.zip_(True, 0.14), at=C['punch2'], gain=-7)
m.sfx(crickets(C['wipe'] - C['punch2'] - 0.05), at=C['punch2'] + 0.04, gain=-18)
for i, t in enumerate(C['sweat']):
    m.sfx(sfx.drip(pitch=1.0 + 0.2 * i, seed=i), at=t, gain=-15, pan=0.45)

# --- shot 3: wipe whoosh, alarm blips, slide whistle into the drop, hero hit
m.sfx(sfx.whoosh(0.5, 'swish', direction=-1), at=C['wipe_whoosh'], gain=-5)   # peak on the band's first full-cover frame
m.sfx(sfx.pop('bubble', pitch=0.9), at=3.967 - 1 / 30, gain=-4, pan=0.0)   # round 2: pop ON the full-cover frame                      # badge logo sting
m.sfx(sfx.shimmer_hit(note_in_key(C['sting'])), at=C['sting'] + 0.03, gain=-10)
for i, t in enumerate(C['warn_beeps']):
    m.sfx(sfx.blip(note=['C6', 'A5'][i % 2], kind='square', dur=0.09, glide=0), at=t, gain=-12, pan=0.1)
for i, t in enumerate(C['push']):   # 三连推: three rising low-tom + thud hits
    m.sfx(drums.tom(['F2', 'A2', 'C3'][i], 1.0), at=t, gain=-18.5 + 1.5 * i)
    m.sfx(sfx.impact('thud'), at=t, gain=-22.5 + 1.5 * i)
    m.sfx(sfx.blip(note=['C6', 'A5', 'C6'][i], kind='square', dur=0.07, glide=0), at=t, gain=-15, pan=0.1)
m.sfx(sfx.impact('punch'), at=C['warn'], gain=-8)
sw = sfx.slide_whistle(True, C['slide'][1] - C['slide'][0])
m.sfx(sw, at=C['slide'][0] + getattr(sw, 'sync', 0.0), gain=-15.5)
m.sfx(sfx.impact('punch', size=1.2) if 'size' in sfx.impact.__code__.co_varnames else sfx.impact('punch'), at=C['drop'], gain=2)
m.sfx(sfx.duang(1.0), at=C['drop'] + 0.02, gain=0)
for i, t in enumerate(C['shock'][1:]):
    m.sfx(sfx.pop('cork', pitch=0.9 + 0.15 * i), at=t - 1 / 30, gain=-5, pan=0.15 + 0.2 * i)
m.sfx(sfx.pop('bubble', pitch=0.8), at=C['wipe'] + 0.1, gain=-7)
m.sfx(sfx.pop('cork', pitch=1.15), at=3.952, gain=2)
m.sfx(sfx.click('soft'), at=3.962, gain=-4)      # crisp accent on the band's full-cover frame (3.967)
m.sfx(sfx.sticker_slap(seed=4), at=3.958, gain=1)
m.sfx(sfx.impact('punch', size=0.6, vel=0.9), at=3.957, gain=-2)   # r2s2: punch under the slap -> clear onset on 3.967   # r2s2: broadband transient so the full-cover frame is a real onset
m.sfx(sfx.sticker_slap(seed=9), at=6.085, gain=-2)   # r2s2: fur 'poof' slap as the sprite pops out (f182-183)
m.sfx(sfx.pop('cork', pitch=0.75), at=0.02, gain=-6)      # badge slam on frame 0
m.sfx(sfx.swish(0.3), at=0.1, gain=-7)
m.sfx(sfx.cork_pop(), at=C['subline'], gain=-3, pan=0.2)

# 嘉宾 name tag: pill pop, name char pops, ribbon slap, pop-out before the drop
m.sfx(sfx.pop('bubble', pitch=1.0), at=C['tag'][0] - 1 / 30, gain=-7, pan=-0.35)
for i, t in enumerate(C['tag'][1:3]):
    m.sfx(sfx.pop('mouth', pitch=1.1 + 0.15 * i), at=t - 1 / 30, gain=-6, pan=-0.35)
m.sfx(sfx.click('soft'), at=C['tag'][3], gain=-6, pan=-0.2)
m.sfx(sfx.swish(0.22), at=C['warn'] + 0.03, gain=-9, pan=-0.3)   # strip flung by the banner
m.sfx(sfx.pop('soft', pitch=1.6), at=C['tagOut'], gain=-10, pan=-0.3)

# --- freeze card: shutter, sparkle on 绝绝子, stamp, bye
m.sfx(sfx.shutter('phone'), at=C['freeze'], gain=0)
m.sfx(sfx.swish(0.3), at=C['freeze'] + 0.12, gain=-6)
for i, t in enumerate(C['jue']):
    m.sfx(sfx.pop('bubble', pitch=1.1 + 0.12 * i), at=t - 1 / 30, gain=-5, pan=-0.3 + 0.3 * i)
m.sfx(sfx.sparkle(0.9, key='F', shape='swell' ), at=C['jue'][0], gain=-7)
m.sfx(sfx.stamp('rubber'), at=C['stamp'], gain=2)
m.sfx(sfx.pop('mouth', pitch=1.35), at=C['bye'] - 1 / 30, gain=-8)

# --- round 2: 发量检测 meter gag on the 7.00 brass stab
m.sfx(sfx.pop('cork', pitch=0.7), at=C['meter'] - 1 / 30, gain=-4, pan=0.35)                     # sticker slam
m.sfx(sfx.zip_(True, 0.13), at=C['needle'][0], gain=-7, pan=0.35)                                # needle whip
m.sfx(sfx.ding(note='C7', kind='bell', dur=0.7), at=C['needle'][1] - 0.01, gain=-6, pan=0.35)   # 爆表 ding
m.sfx(crowd(0.8, 'uo', [(0, .95), (.45, 1.18), (1, 1.02)], n=24, seed=19), at=C['needle'][1] + 0.03, gain=-5, verb=-9, send='hall')  # 噢～
for i in range(3):
    m.sfx(sfx.pop('mouth', pitch=1.1 + .12 * i), at=C['bao'] + i / 30 - 1 / 30, gain=-11, pan=0.4)
# --- round 2: mix colour. Less 250-500 Hz mud on pizz/tuba/brass, bed high-passed at 110 Hz, presence on claps + SFX
for k, bands in {'pizz': [('hp', 110), ('pk', 350, -2.5, .8)], 'tuba': [('pk', 320, -3.0, .9)], 'brass': [('hp', 110), ('pk', 400, -2.0, .8)],
                 'stab': [('hp', 110), ('pk', 400, -2.0, .8)], 'xylo': [('hp', 110)], 'glock': [('hp', 110)], 'block': [('hp', 110)],
                 'clap': [('hs', 3500, 3.0)], 'clap2': [('hs', 3500, 3.0)], 'sfx': [('pk', 380, -1.5, .8), ('hs', 3500, 3.0)]}.items():
    m.tracks[k].insert(lambda x, b=bands: _eq(x, b))
m.master_kw = {**getattr(m, 'master_kw', {}), 'glue_gr': 2.5}
res = m.export(os.path.join(HERE, 'out/audio.wav'), tp=-1.6, spectrogram=os.path.join(HERE, 'out/audio_spec.png'))
print({k: res[k] for k in ('duration', 'lufs', 'true_peak', 'stereo_corr', 'longest_gap') if k in res})
print('bands', res.get('bands')); print('warnings', res.get('warnings'))
