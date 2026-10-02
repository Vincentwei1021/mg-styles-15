"""Playful / informative recipes: variety (综艺花字 bounce, 'cute' sticker-journal ukulele), explainer
(回形针-style tech explainer bed)."""
from __future__ import annotations

import numpy as np

from ..core import Sound, ns, layer, fade
from .. import synth as S, drums as D, sfx as X, fx as FX, filters as F, fm as FM, pluck as P, seq, samples as SM
from ..theory import pc, SCALES
from .base import Form, LV, new_mix, bass_events, comp_events, chord_tone_melody, place_notes, place_segments


def _mallet(key):
    ins = SM.inst(key) if SM.available(key) else None
    kind = {'glock': 'celesta', 'marimba': 'marimba', 'vibraphone': 'vibes', 'kalimba': 'kalimba'}.get(key, 'marimba')
    if key == 'glock':
        return lambda n, v, d=None: ins.play(n, d, v) if (ins and 79 <= n <= 108) else FM.bell(n, 1.0, v, 'glock')
    return lambda n, v, d=None: ins.play(n, d, v) if ins else FM.mallet(n, 1.0, v, kind)


# ============================================================================ VARIETY / 综艺
def variety(duration=10.0, bpm=None, key='F', mode='major', prog='I vi ii V', drop=None, build=None, outro=None,
            hits=(), energy=None, music_level=-20.0, sfx_duck=3.5, flavor='bouncy', final=None, **kw):
    """Variety-show bounce (综艺花字) and cute journal pop.
      'bouncy' : pizzicato oom-pah, tuba-like staccato FM bass with walk-ups, glockenspiel hook, claps +
                 snare backbeat, woodblock clip-clop, xylophone run + slide whistle into the drop,
                 V7 -> I 'ta-da' brass button.  bpm 116-140 (128).
      'cute'   : (贴纸手账 sticker journal) ukulele strums, glock melody, snaps/claps, bouncy pluck bass, shaker,
                 sparkle on the drop.  bpm 100-124 (112).
    Designed to sit under cartoon SFX (boing/duang/pop) placed by the builder."""
    cute = flavor == 'cute'
    f = Form(duration, bpm, drop, build, outro, hits, energy, key, mode, prog, **{**dict(chord_beats=4, octave=4), **kw},
             final=final, bpm_default=112 if cute else 128, bpm_range=(100, 124) if cute else (116, 140))
    m = new_mix(f, music_level, sfx_duck, master=dict(air=1.0))
    g = m.grid
    B, Dp, O, E = f.build, f.drop, f.outro, f.end
    glock = _mallet('glock')
    if cute:
        uk = m.track('uke', level=LV['chords'] - 0.5, sends={'room': -12}, pan=-0.1)
        strum_pat = [(0, True, 1.0), (2, True, 0.8), (3, False, 0.6), (5, False, 0.7), (6, True, 0.85), (7, False, 0.6)]
        for b in f.bars(0.0, O):
            for half in (0, 1):
                for st, down, v in strum_pat:
                    t = b + half * f.bar / 2 + st * f.bar / 16
                    if 0.0 <= t < O:
                        ch = [n + (12 if n < 60 else 0) for n in f.chord_at(t + 1e-3)][:4]
                        uk.add(P.strum(ch, 0.5, v * 0.8, 'uke', down=down, spread=0.012), t)
        uk.add(P.strum(f.chord_at(O, 12)[:4], 1.8, 0.85, 'uke'), O)
        bs = m.track('bass', level=LV['bass'] - 2)
        place_notes(bs, lambda n, d, v: S.bass(n, d, v, 'pluck'), bass_events(f, g, B, O, 'r..r..f.r...p...', vel=0.85, gate=0.6))
        bs.add(S.bass(f.bass_at(O), 0.8, 0.85, 'pluck'), O)
        m.track('snap', level=LV['clap'] - 1, sends={'room': -8}).loop(lambda v: D.snap(v), '....x.......x...', 0.0, Dp)
        m.track('clap', level=LV['clap'], sends={'plate': -12}).loop(lambda v: D.clap('808', v), '....x.......x...', Dp, O)
        m.track('kick', level=LV['kick'] - 2).loop(lambda v: D.kick('soft', v), 'x.......x.x.....', Dp, O)
        m.track('shaker', level=LV['shaker'], pan=0.3).loop(lambda v: D.shaker(v), 'x.xxx.xxx.xxx.xx', B, O, vel=0.6)
        m.track('sparkle', level=LV['fx']).add(X.sparkle(1.2, 26, key, 'major_pentatonic'), Dp)
    else:
        pz = m.track('pizz', level=LV['chords'] - 1, sends={'room': -10})
        for i, t in enumerate(seq.step_times(g, 0.0, O, 8)):
            ch = f.chord_at(t + 1e-3)
            if i % 2 == 0:   # oom: low chord tone
                pz.add(P.pizz(f.bass_at(t, 3) + (7 if (i // 2) % 2 else 0), 0.3, 0.85), t, pan=-0.2)
            else:            # pah: two upper chord tones
                for j, n in enumerate(sorted(ch)[-2:]):
                    pz.add(P.pizz(n, 0.25, 0.6), t + 0.004 * j, pan=0.25)
        bs = m.track('tuba', level=LV['bass'] - 1.5)
        place_notes(bs, lambda n, d, v: FM.bass(n, d, v, 'wood'), bass_events(f, g, B, O, 'R.......f.....p.', vel=0.9, gate=0.35))
        m.track('kick', level=LV['kick'] - 2).loop(lambda v: D.kick('soft', v), 'x.......x.......', Dp, O)
        m.track('snare', level=LV['snare'] - 1, sends={'room': -10}).loop(lambda v: D.snare('tight', v), '....x.......x...', Dp, O)
        m.track('clap', level=LV['clap'] - 1, sends={'plate': -12}).loop(lambda v: D.clap('808', v), '....x.......x...', B, O)
        m.track('block', level=LV['perc'], pan=0.4).loop(lambda v: D.woodblock('block', v), '..x...x...x...xx', 0.0, O, vel=0.7)
        m.track('shaker', level=LV['shaker'], pan=-0.3).loop(lambda v: D.shaker(v), 'x.x.x.x.x.x.x.x.', Dp, O, vel=0.6)
        # xylophone run + slide whistle into the drop
        if Dp - B > 0.4:
            run_t = seq.step_times(g, max(B, Dp - f.bar / 2), Dp, 32)
            pool = [n for n in range(72, 97) if (n - pc(key)) % 12 in SCALES['major']]
            mar = _mallet('marimba')
            xr = m.track('xylo', level=LV['bells'] + 2, pan=0.2)
            for j, t in enumerate(run_t):
                xr.add(mar(pool[min(j, len(pool) - 1)], 0.5 + 0.4 * j / max(1, len(run_t))), t)
            m.track('whistle', level=LV['fx'] - 1).add(X.slide_whistle(True, min(0.6, Dp - B)), Dp - min(0.6, Dp - B))
        # ta-da button
        br = m.track('brass', level=LV['chords'] + 1, sends={'hall': -10})
        from ..theory import roman, chord as _chord
        v7 = [n for n in _chord(roman('V7', key, mode), 4)]
        if O - f.beat > Dp:
            br.add(S.stab(v7, f.beat * 0.45, 0.85, 'brass'), O - f.beat / 2)
        br.add(S.stab(f.chord_at(O), 1.2, 1.0, 'brass'), O)
    # glock hook (both flavors)
    gl = m.track('glock', level=LV['bells'] + 2, sends={'plate': -12}, pan=0.1)
    ev = chord_tone_melody(f, g, Dp, O, rhythm=(1, 1, 2, 1, 1, 2), order=('low', 'mid', 'top', 'mid', 'top', 'up'),
                           octave=6, div=8, vel=0.8)
    for t, n, d, v in ev:
        gl.add(glock(n, v), t)
    gl.add(glock(f.bass_at(O, 6), 0.9), O)
    m.track('crash', level=LV['crash'], sends={'hall': -14}).add(D.crash(0.85), Dp).add(D.crash(0.8), O)
    m['kick'].add(D.kick('soft', 1.0), O)
    return m


# ============================================================================ EXPLAINER (回形针)
def explainer(duration=10.0, bpm=None, key='D', mode='major', prog='Imaj7 V vi7 IVmaj7', drop=None, build=None,
              outro=None, hits=(), energy=None, music_level=-20.0, sfx_duck=3.5, final='Imaj7', **kw):
    """Clean tech-explainer bed (回形针 / isometric / infographic): sampled marimba 16th ostinato with 8th delay,
    clock-tick intro (information / time), soft 4/4 kick + light clap + shaker in the drop, sub + pluck bass,
    warm low pad, glockenspiel accents on chord changes, pluck arpeggio build; mid-range kept clear for
    VO/SFX.  bpm 100-124 (112)."""
    f = Form(duration, bpm, drop, build, outro, hits, energy, key, mode, prog, **{**dict(chord_beats=4, octave=4), **kw},
             final=final, bpm_default=112, bpm_range=(100, 124))
    m = new_mix(f, music_level, sfx_duck, master=dict(air=0.8))
    g = m.grid
    B, Dp, O, E = f.build, f.drop, f.outro, f.end
    mar = _mallet('marimba')
    mt = m.track('marimba', level=LV['keys'] - 1, sends={'delay8': -11, 'room': -14}, pan=-0.1)
    cell = [0, 2, 1, 2, 0, 2, 1, 3]
    for a, b_, v, s in f.segments(0.0, O):
        tones = sorted(set(n + 12 for n in v))
        for j, t in enumerate(seq.step_times(g, a, b_, 16)):
            mt.add(mar(tones[cell[j % 8] % len(tones)], 0.62 if j % 4 == 0 else 0.45), t)
    for j, n in enumerate(sorted(f.chord_at(O, 12))):
        mt.add(mar(n, 0.6), O + 0.03 * j)
    mt.automate('lpf', f.curve(2500, 18000))
    m.track('tick', level=LV['perc'] - 1, pan=0.35).loop(lambda v: X.tick('clock' if v > 0.9 else 'hi', level=-24),
                                                        'X.x.X.x.X.x.X.x.', 0.0, Dp)
    pd = m.track('pad', level=LV['pad'] - 2.5, sends={'hall': -12})
    place_segments(pd, f, 0.0, E, lambda v, d: S.pad(v, d, 0.6, 'warm'))
    pd.automate('lpf', f.curve(900, 6000))
    sb = m.track('sub', level=LV['sub'] - 3.5)
    for a, b_, v, s in f.segments(B, E):
        sb.add(S.bass(f.bass_at(a, 2), b_ - a, 0.75, 'sub'), a)
    sb.duck(by='kick', depth=4, release=0.12)
    pb = m.track('pluckbass', level=LV['bass'] - 3)
    place_notes(pb, lambda n, d, v: S.bass(n, d, v, 'pluck'), bass_events(f, g, Dp, O, '..o...o...o...o.', octave=2, vel=0.7, gate=0.4))
    kick = lambda v=1.0: D.kick('soft', v, decay=0.28)
    m.track('kick', level=LV['kick'] - 1.5).loop(kick, 'x...x...x...x...', Dp, O)
    m['kick'].add(kick(1.0), O)
    m.track('clap', level=LV['clap'] - 3, sends={'room': -10}).loop(lambda v: D.clap('tight', v), '....x.......x...', Dp, O)
    m.track('shaker', level=LV['shaker'], pan=0.3).loop(lambda v: D.shaker(v), 'x.xxx.xxx.xxx.xx', Dp, O, vel=0.55, vel_jitter=0.2)
    m.track('rim', level=LV['perc'] - 3, pan=-0.4).loop(lambda v: D.rim(v), seq.euclid_pattern(3, 16, 3), Dp, O, vel=0.6)
    glock = _mallet('glock')
    gl = m.track('glock', level=LV['bells'], sends={'plate': -12})
    for a, b_, v, s in f.segments(Dp, E):
        gl.add(glock(v[-1] + 24 if v[-1] + 24 <= 100 else v[-1] + 12, 0.7), a)
    if Dp - B > 0.3:
        ar = m.track('arp', level=LV['arp'], sends={'delay8': -10})
        ev = seq.arp(g, lambda t: f.chord_at(t, 12), B, Dp, div=16, pattern='up', octaves=2, gate=0.5, vel=0.7)
        place_notes(ar, lambda n, d, v: S.pluck(n, d, v, 'soft'), ev)
        ar.automate('gain', [(B, -10), (Dp, 0)])
        m.track('riser', level=LV['riser'] - 2).add(X.riser(Dp - B, 'noise', seed=2), Dp)
    m.track('crash', level=LV['crash'] - 2, sends={'hall': -14}).add(D.cymbal('ride', 0.8, decay=1.6), Dp)
    return m
