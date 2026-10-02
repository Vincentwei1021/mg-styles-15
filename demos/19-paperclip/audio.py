# 19-paperclip soundtrack — marimba tech-explainer bed + UI sound design locked to cues.json
import sys, json
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'lib', 'audio'))
import mgaudio as mg
from mgaudio import recipes, sfx, sync, synth, samples
from mgaudio import filters as F
D = os.path.dirname(os.path.abspath(__file__)) + '/'
C = json.load(open(D + 'cues.json')); E = C['ev']
m = recipes.explainer(bpm=117.9, key='D', drop=4.07, outro=E['slam'])
print('bpm', m.form.bpm, 'tracks', list(m.tracks))
S = m.sfx
key_note = lambda t, i=0: m.form.chord_at(t)[i % len(m.form.chord_at(t))] + 12
def T(name, **kw):
    try: return m.track(name, group='sfx', **kw)
    except Exception: return m.track(name, **kw)
FOL = T('foley', level=-10)
GLS = T('glass', level=-16, hp=4000)
SCR = T('scrape', level=-20, hp=2500)
HIT = T('hit', level=-6)             # r2s2: the 4 hero slaps on one saturated+compressed bus (lower crest -> the master
from mgaudio import fx as FX         # limiter no longer flattens them; 7.90 slap +9 dB over its pre-roll)
HIT.insert(lambda x: FX.saturate(x, drive_db=9, kind='tanh'), lambda x: FX.compress(x, thr=-20, ratio=4, attack=.001, release=.08, makeup=6))
def hitS(at, gain=0, pan=0, seed=0, rr=0):
    HIT.add(sfx.sticker_slap(seed=seed), at=at, gain=gain + 4, pan=pan)
    HIT.add(samples.hit('slapstick', vel=.9, rr=rr, maxdur=.45), at=at, gain=gain, pan=pan)
def slapS(at, gain=0, pan=0, seed=0):
    FOL.add(samples.hit('slapstick', vel=.9, rr=seed, maxdur=.45), at=at, gain=gain, pan=pan)
# A — hook
S(sfx.swish(dur=.2, seed=6), at=.05, gain=-12, pan=.3)   # phone falls in from above
hitS(E['phone_land'], -5, .35, 1, 1)
S(sfx.swish(dur=.26, seed=2), at=E['title1'] + .12, gain=-9, pan=-0.3)
S(sfx.swish(dur=.26, seed=3), at=E['title2'] + .12, gain=-9, pan=-0.3)
S(sfx.pen('marker', dur=.3, seed=4), at=E['marker'][0] + .1, gain=-10, pan=-0.2)
S(sfx.click('soft'), at=E['kicker'], gain=-10)
# camera moves: whoosh peak ≈ middle of the fly
# `at` = pass-by peak, placed on the measured camera-speed peaks of each fly (preview QC)
# pass-by peak = measured camera-speed peak (node tools/speed.mjs)
# r2: the 4.34-4.56 whip and the 5.02-5.38 push are gone -> one slow centroid-tracking glide 4.48-5.22 (soft air swell)
for (a, b), g, pk, flip in [((1.25, 1.90), -3, 1.525, -8), ((2.80, 3.32), -4, 3.025, -6), ((4.48, 5.22), -12, 4.88, None),
                            ((5.62, 6.10), -4, 5.825, -8)]:
    S(sfx.whoosh(dur=b - a + .15, kind='swish', direction=1, peak=.45, seed=int(a * 10)), at=pk, gain=g)
    if flip is not None: S(sfx.paper('flip', dur=.2), at=pk - .03, gain=flip, pan=.25)   # page-turn accent on chapter whips
# B — parts slap down, labels pop
pans = [-.45, .45, -.45, .45]
for i, t in enumerate(E['parts'][:4]):
    S(sfx.sticker_slap(seed=10 + i), at=t, gain=-4, pan=pans[i])
for i, t in enumerate(E['leaders']):
    S(sfx.blip(note=key_note(t, i), kind='sine'), at=t + .10, gain=-11, pan=([-.4, .4, -.4, .4, .3])[i])
# C — table wipes in, first ten light, count-up ticks, lock on the drop
S(sfx.paper('slide', dur=.45, seed=30), at=E['table_in'][0] + .3, gain=-14)
S(sfx.sticker_peel(dur=.16), at=E['badge_peel'] + .02, gain=-10, pan=0)             # ten badges peel off their parts
bl = sorted(t for t in {round(t * 30) / 30 for t in E['badge_land'][:-1]} if t < E['first_lit'] - .05)   # one wood tick per FRAME
for k, t in enumerate(bl):                                                                   # of landings (counter 1..10);
    S(sfx.click('wood'), at=t, gain=-23 + 4 * k / max(1, len(bl) - 1), pan=-.4 + .8 * k / max(1, len(bl) - 1))  # 10th = the 3.50 slap
hitS(E['first_lit'], -4, 0, 33, 2)   # table lights
S(sfx.click('hard'), at=E['first_lit'], gain=-3)
S(sfx.ding(note=key_note(E['first_lit'], 0)), at=E['first_lit'], gain=-7)
a, b = E['cascade']
# counter = 10 + 60*easeOutCubic(p): tick every 5th value, then every value 61..70 (same lit times as index.html)
lt = [a + (b - a) * (1 - (1 - (i + 1) / 60) ** (1 / 3)) for i in range(60)]
ks = list(range(4, 50, 5)) + list(range(50, 60))
for n_, i in enumerate(ks):
    S(sfx.tick('hi'), at=lt[i], gain=-12 + 6 * n_ / (len(ks) - 1), pan=-.5 + n_ / (len(ks) - 1))
S(sfx.ding(note=key_note(b, 2)), at=b, gain=-3)
S(sfx.click('switch'), at=b, gain=-5)
# D — chips land (a light rain of clicks)
# chips fly per category in parallel: land at c0+fl+ci*.045+j*.016 (same formula as index.html)
c0, fl = E['chips'][0], E['chip_flight']; sizes = [23, 16, 12, 11, 8]; sj, sc = E['chip_stagger']
S(sfx.sticker_peel(dur=.2), at=E['chip_lift'] + .02, gain=-9, pan=-.1)   # 70 tiles lift off the table
RO = E['chip_rows']
lands = sorted(c0 + fl + RO.index(ci) * sc + j * sj for ci, n in enumerate(sizes) for j in range(n))
bins = sorted({round(t / .032) for t in lands})
for i, b in enumerate(bins):
    S(sfx.click('wood'), at=b * .032, gain=-15 + 5 * i / max(1, len(bins) - 1), pan=-.45 + .9 * i / max(1, len(bins) - 1))
for ci, n in enumerate(sizes):   # each bar's final count lands with a small marimba note
    t = c0 + fl + RO.index(ci) * sc + (n - 1) * sj
    S(sfx.blip(note=key_note(t, ci), kind='sine'), at=t, gain=-13, pan=[-.3, .3, -.15, .15, 0][ci])
# E — stickers pin, routes draw, pin pops
for i, t in enumerate(E['stickers']):
    S(sfx.sticker_slap(seed=80 + i), at=t, gain=-5, pan=[-.3, .35, .2, .1][i])
s0_, s1_, s2_ = E['re_pill']                                                              # rare-earth bar -> pill -> Inner Mongolia
S(sfx.tape_rip(dur=.22, up=False, seed=91), at=s0_ + .02, gain=-14, pan=-.2)
S(sfx.swish(dur=.24, seed=92), at=(s1_ + s2_) / 2, gain=-10, pan=.2)
S(sfx.pop('mouth', pitch=1.1), at=s2_, gain=-7, pan=.2); slapS(s2_, -12, .2, 3)
S(sfx.pen('pen', dur=.55, seed=90), at=E['routes'][0] + .05, gain=-12, pan=.3)
S(sfx.pop('bubble', pitch=1.0), at=E['pin'], gain=-4, pan=.4)
S(sfx.ding(note=key_note(E['pin'], 1)), at=E['pin'], gain=-9, pan=.4)
# HERO — two-stage pull-out, phone slaps onto the slate, the '70' peels out of the phone and slams
S(sfx.whoosh(dur=.5, kind='air', direction=0, peak=.3, seed=100), at=7.067, gain=-5)      # stage-1 speed peak
GLS.add(samples.hit('wineglass', vel=.8, maxdur=.42), at=E['aha'], gain=0, pan=.2)          # 'it's a screen' glass ping (hp 4 kHz)
S(sfx.ding(note=key_note(E['aha'], 2) + 12, dur=.9), at=E['aha'], gain=-10, pan=.2)
S(sfx.sticker_peel(dur=.3), at=E['lift'][0] + .04, gain=-6, pan=-.2)                         # phone lifts like a sticker
S(sfx.whoosh(dur=.45, kind='air', direction=0, peak=.45, seed=101), at=7.74, gain=-17)       # stage-2 speed peak
SCR.add(samples.hit('cabasa', vel=.6, maxdur=.3), at=E['lift'][0] + .02, gain=0, pan=-.2)      # paper lift texture
hitS(E['lift'][1], -6, -.3, 120, 4)
BODY = T('body', level=-8, lp=240)
BODY.add(synth.voice('F#2', .2, 1.0, osc='sine', cutoff=400, env=(0.001, .03, .5, .12)), at=E['lift'][1], gain=0)   # ~92 Hz body
S(sfx.sticker_peel(dur=.11), at=E['peel'] + .02, gain=-7, pan=-.1)                           # the in-phone 70 peels off
SCR.add(samples.hit('guiro', vel=.5, maxdur=.1), at=E['peel'] + .02, gain=-3, pan=-.1)
S(sfx.riser(dur=.9, kind='hybrid', end='cut'), at=E['slam'] - .11, gain=-9)                 # cut 110 ms early -> 3-frame gap
S(sfx.impact(kind='punch', size=1.0), at=E['slam'], gain=2)
S(sfx.boom(dur=1.4), at=E['slam'], gain=-3)
hitS(E['slam'], 0, .25, 121, 5)
S(sfx.click('hard'), at=E['slash'], gain=-8)
S(sfx.swish(dur=.3, seed=111), at=E['headline'] + .1, gain=-9)
S(sfx.pen('marker', dur=.3, seed=112), at=E['marker_end'][0] + .06, gain=-11, pan=.2)
WALK = m.track('walk', level=-23)
bt = 60 / 117.9
for i, (n, d) in enumerate([('D2', 2), ('A1', 2), ('B1', 1), ('C#2', 1), ('D2', .5), ('E2', .5), ('F#2', .5), ('A2', .5)]):
    t0 = sum(x[1] for x in [('D2', 2), ('A1', 2), ('B1', 1), ('C#2', 1), ('D2', .5), ('E2', .5), ('F#2', .5), ('A2', .5)][:i]) * bt
    st = 4.07 - 8 * bt + t0; dd = d * bt * .92
    if i == 0: st, dd = E['phone_land'], dd - E['phone_land']          # first note rides the phone landing (no onset at 0.03)
    WALK.add(synth.bass(n, dd, .75 + .03 * i, 'pluck'), at=max(0.0, st))
print('gains', {k: round(m[k].gain, 1) for k in m.tracks})
for k, dg in {'sub': -3, 'pluckbass': -2, 'pad': -3, 'glock': 3, 'arp': 2, 'shaker': 2, 'marimba': 1}.items():
    if k in m.tracks: m[k].gain += dg
# mix: pre-slam suck-out (bed -8 dB, then ~60 ms near-silence), de-box the marimba/pad, add snap to the SFX bus
sl = E['slam']
fl_ = E['first_lit']   # r2s2: 2-frame breath in the bed before the table lights (sharper 3.50 transient)
m.group('music').automate('gain', [(0, 0), (fl_ - .08, 0), (fl_ - .05, -12), (fl_ - .004, -12), (fl_, 0), (7.62, 0), (7.72, -8), (sl - .12, -8), (sl - .1, -45), (sl - .004, -45), (sl, 0), (10, 0)])
try:   # r2: hard 3-frame gap before the slam on the SFX bus too (tails of the phone slap / peel / riser)
    m.group('sfx').automate('gain', [(0, 0), (sl - .118, 0), (sl - .1, -45), (sl - .004, -45), (sl, 0), (10, 0)])
except Exception as ex: print('sfx group automation failed', ex)
for k in ('marimba', 'pad'):
    if k in m.tracks: m[k].insert(lambda x: F.eq(x, [('pk', 300, -3, 1.2)]))
m['sfx'].insert(lambda x: F.eq(x, [('pk', 2000, 2, .9), ('hs', 2500, 2)]))
if 'marimba' in m.tracks: m['marimba'].insert(lambda x: F.eq(x, [('pk', 560, -2.5, 1.0), ('pk', 2200, 2.5, 1.0)]))
if 'pluckbass' in m.tracks: m['pluckbass'].insert(lambda x: F.eq(x, [('ls', 120, -2), ('pk', 1400, 3, 1.0)]))   # r1s2: pick attack, less boom
if 'sub' in m.tracks: m['sub'].gain -= 1.5
for k in ('glock', 'arp'):
    if k in m.tracks: m[k].insert(lambda x: F.eq(x, [('pk', 1500, 2.5, .9)]))
m.master_kw.update(tilt=.5)
import os
res = m.export(D + 'out/audio.wav', tp=-1.5, spectrogram=D + 'out/qc_audio_spec.png', stems_dir=os.environ.get('STEMS'))
print(res if not isinstance(res, dict) else {k: v for k, v in res.items() if k != 'spectrum'})
print(mg.hit_alignment(D + 'out/audio.wav', [E['phone_land'], E['first_lit'], E['cascade'][1], E['pin'], E['lift'][1], E['slam']]))
