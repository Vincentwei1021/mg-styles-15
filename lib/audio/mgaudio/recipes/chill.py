"""Chill recipes: lofi (grain / collage / cel), ambient (aurora glass, 3D product, line-art piano)."""
from __future__ import annotations

import numpy as np

from ..core import Sound, ns, layer, fade
from .. import synth as S, drums as D, sfx as X, fx as FX, filters as F, fm as FM, seq, samples as SM
from ..theory import pc, SCALES
from .base import Form, LV, new_mix, bass_events, comp_events, chord_tone_melody, place_notes, place_segments


def _piano_chord(notes, dur, vel, strum=0.012, release=0.6, rr=None):
    """Sampled grand piano chord (VCSL Kawai), low note first (gentle strum), per-note velocity spread."""
    ins = SM.inst('piano')
    parts = []
    for i, n in enumerate(sorted(notes)):
        v = vel * (0.92 if i == 0 else 0.8) * (1.0 + (0.06 * rr.uniform(-1, 1) if rr is not None else 0))
        parts.append((ins.play(n, dur, float(np.clip(v, 0.1, 1.0)), release=release), i * strum))
    s = layer(parts)
    return Sound(s.data / np.sqrt(len(notes)) * 1.2)


def _rhodes_chord(notes, dur, vel, strum=0.01):
    parts = [(FM.epiano(n, dur, vel * (0.95 if i else 1.0), bright=0.3, tremolo=0.35, release=0.4), i * strum)
             for i, n in enumerate(sorted(notes))]
    s = layer(parts)
    return Sound(s.data / np.sqrt(len(notes)) * 1.3)


def _bb_snare(v=1.0):
    """Boom-bap snare: fat snare + tight clap layer (the classic sampled crack)."""
    return layer([(D.snare('fat', v), 0.0), (D.clap('tight', v), 0.002, -7)])


def _keys(kind):
    if kind == 'piano' and SM.available('piano'):
        rr = np.random.default_rng(5)
        return lambda v, d, vel: _piano_chord(v, d, vel, rr=rr)
    return _rhodes_chord


# ============================================================================ LOFI
def lofi(duration=10.0, bpm=None, key='F', mode='major', prog='ii9 V13 Imaj9 vi9', drop=None, build=None,
         outro=None, hits=(), energy=None, music_level=-20.0, sfx_duck=3.0, keys='rhodes', flavor='chill',
         swing=0.14, final='Imaj9', vinyl=True, **kw):
    """Lo-fi hip-hop (grain & texture / riso / collage / cel): swung dusty boom-bap, jazzy extended chords on
    Rhodes (keys='rhodes') or sampled piano (keys='piano'), round FM bass with walking approach notes, kalimba
    motif, vinyl crackle + tape wow, low-passed bus.  flavor 'boombap' = harder drums (collage / cut-out).
    bpm 70-96 (84)."""
    f = Form(duration, bpm, drop, build, outro, hits, energy, key, mode, prog, **{**dict(chord_beats=4, octave=4), **kw},
             final=final, swing=swing, bpm_default=84 if flavor != 'boombap' else 90, bpm_range=(70, 96))
    m = new_mix(f, music_level, sfx_duck, master=dict(warmth=2.0))
    g = m.grid
    B, Dp, O, E = f.build, f.drop, f.outro, f.end
    grp = m.group('music')
    grp.fx = [lambda x: FX.wow_flutter(x, 0.28, 0.05, seed=3)]
    grp.lp = 11500 if flavor != 'boombap' else 12500
    # keys
    kf = _keys(keys)
    kt = m.track('keys', level=LV['keys'], sends={'room': -12, 'plate': -18})
    for t, v, d, vel in comp_events(f, g, 0.0, O, 'X-------..x-----', vel=0.7, gate=0.97):
        kt.add(kf(v, d, vel), t + 0.004)
    kt.add(kf(f.chord_at(O), E - O, 0.72), O)
    kt.automate('lpf', f.curve(2600, 16000))
    # bass
    bs = m.track('bass', level=LV['bass'] - 1.5)
    place_notes(bs, lambda n, d, v: Sound(F.lpf(FM.bass(n, d, v, 'wood').data, 1400)),
                bass_events(f, g, B, O, 'R-----.r-.r...p-', octave=2, vel=0.85, gate=0.95))
    bs.add(Sound(F.lpf(FM.bass(f.bass_at(O), min(1.8, E - O), 0.85, 'wood').data, 1400)), O)
    # drums
    hard = flavor == 'boombap'
    kick = (lambda v=1.0: D.kick('punchy', v, decay=0.3, drive=1.6)) if hard else (lambda v=1.0: D.kick('lofi', v))
    snr = _bb_snare if hard else (lambda v=1.0: D.snare('lofi', v))
    kk = m.track('kick', level=LV['kick'] - (0.5 if hard else 1.5))
    kk.loop(kick, 'X.........x.x...' if not hard else 'X.....x...x..x..', Dp, O, humanize=0.004)
    kk.add(kick(0.9), O)
    sn = m.track('snare', level=LV['snare'] - (0 if hard else 1), sends={'room': -9})
    sn.loop(snr, '....x.......x..g', Dp, O, humanize=0.005)
    hh = m.track('hat', level=LV['hat'] - (1 if not hard else 0), pan=0.2)
    hh.loop(lambda v: D.hat('lofi', v), 'x.o.x.o.x.o.x.oo', B, O, vel=0.8, vel_jitter=0.2, humanize=0.004)
    hh.loop(lambda v: D.hat('lofi', v), 'x...x...x...x...', 0.0, B, vel=0.45, humanize=0.004)
    m.track('shaker', level=LV['shaker'] - 2, pan=-0.3).loop(lambda v: D.shaker(v), '..x...x...x...x.', Dp, O, vel=0.6)
    if B < Dp:
        sn.add(snr(0.6), Dp - f.beat)
    # melody (kalimba / vibes sample) in the drop
    mel = m.track('mel', level=LV['bells'] + 1, sends={'delay': -9, 'room': -12}, pan=-0.15)
    ins = SM.inst('kalimba') if SM.available('kalimba') else None
    ev = chord_tone_melody(f, g, Dp, O, rhythm=(3, 3, 4, 6), order=('top', 'mid', 'up', 'low'), octave=5, div=16,
                           vel=0.7)
    for t, n, d, v in ev:
        mel.add(ins.play(n, None, v) if ins else FM.mallet(n, 1.0, v, 'kalimba'), t)
    if vinyl:
        m.track('vinyl', level=LV['texture'] + 3).add(X.vinyl(duration, crackle=1.0, seed=8), 0.0)
    return m


def _air_noise(dur, seed=12):
    """'Air' layer: slowly breathing high-passed noise (the crystalline top end of glass/aurora beds)."""
    from ..core import noise_st, lfo
    n = ns(dur)
    x = F.hpf(noise_st(n, 'pink', seed=seed, corr=0.2), 7000, 4)
    x = x * (0.55 + 0.45 * (0.5 + 0.5 * lfo(n, 0.23, 'sine')))
    return Sound(fade(x, 0.4, 0.6))


# ============================================================================ AMBIENT / CINEMATIC
def ambient(duration=10.0, bpm=None, key='E', mode='major', prog='Imaj9 vi9 IVmaj9 V6/9', drop=None, build=None,
            outro=None, hits=(), energy=None, music_level=-20.0, sfx_duck=3.0, flavor='glass', final='Imaj9', **kw):
    """Ambient / cinematic.  flavor:
      'glass'   (aurora + glassmorphism): FM glass pad + air pad, celesta/glock arpeggio into ping-pong delay and
                shimmer, sub swell, reverse-swell into a shimmering bloom at the drop, soft pulse; no drums.
      'product' (3D product film / premium tech): piano + strings, pulsing sub plucks, heartbeat build,
                cinematic impact + boom at the drop, soft kick/clap groove, big hall.
      'piano'   (line-art draw-on / elegant minimal): solo sampled piano broken chords, soft strings, bell.
    bpm 60-110 (78 glass / 100 product / 72 piano)."""
    bdef = {'glass': 78, 'product': 100, 'piano': 72}[flavor]
    f = Form(duration, bpm, drop, build, outro, hits, energy, key, mode, prog, **{**dict(chord_beats=4, octave=4), **kw},
             final=final, bpm_default=bdef, bpm_range=(60, 110))
    m = new_mix(f, music_level, sfx_duck, master=dict(glue_gr=1.0, air={'glass': 2.5, 'product': 1.0, 'piano': 2.0}[flavor]))
    g = m.grid
    B, Dp, O, E = f.build, f.drop, f.outro, f.end
    # ---- pads (all flavors)
    pd = m.track('pad', level=LV['pad'] - (0.5 if flavor == 'glass' else 1), sends={'big': -8}, hp=170)
    if flavor == 'glass':
        place_segments(pd, f, 0.0, E, lambda v, d: S.pad(v, d, 0.75, 'glass', attack=min(0.5, d * 0.3), release=1.8))
        air = m.track('air', level=LV['pad'] - 1.5, sends={'shimmer': -8})
        place_segments(air, f, 0.0, E, lambda v, d: S.pad([n + 12 for n in v[-2:]], d, 0.6, 'air', attack=0.6, release=2.0))
    else:
        place_segments(pd, f, 0.0, E, lambda v, d: S.pad(v, d, 0.7, 'strings', attack=0.5 if flavor == 'piano' else 0.3,
                                                         release=1.5))
    pd.automate('lpf', f.curve(2500, 15000))
    # ---- sub swell
    sb = m.track('sub', level=LV['sub'] - (4 if flavor == 'glass' else 2))
    for a, b_, v, s in f.segments(Dp if flavor == 'piano' else B, E):
        sb.add(Sound(S.bass(f.bass_at(a, 2), b_ - a, 0.7, 'sub').data), a)
    sb.automate('gain', [(0, -9), (B, -9), (Dp, 0), (E, 0)] if flavor != 'product' else [(0, -6), (Dp, 0), (E, 0)])
    if flavor == 'glass':
        # celesta/glock arp -> delay + shimmer
        ar = m.track('bells', level=LV['bells'] + 3, sends={'delay': -6, 'shimmer': -9}, pan=0.1)
        ins = SM.inst('glock') if SM.available('glock') else None
        ev = seq.arp(g, lambda t: f.chord_at(t, 12), 0.0, O, div=8, pattern='updown', octaves=2, gate=1.0, vel=0.55,
                     accents='x...')
        for t, n, d, v in ev:
            s = ins.play(n, None, v) if (ins and n >= 79) else FM.bell(n, 1.4, v, 'celesta')
            ar.add(s, t, pan=float(np.sin(t * 2.1)) * 0.5)
        ar.automate('gain', [(0, -3), (Dp, 0), (O, 0), (E, -2)])
        # soft 8th pulse in the drop (sine pluck)
        pl = m.track('pulse', level=LV['pluck'] - 3, sends={'delay': -12})
        for t, n, d, v in bass_events(f, g, Dp, O, 'r.o.r.o.r.o.r.o.', octave=3, vel=0.7, gate=0.5):
            pl.add(S.pluck(n, d, v, 'soft'), t)
        # reverse swell into the drop + bloom
        if Dp > 1.0:
            sw = X.swell(S.pad(f.chord_at(Dp, 12), 1.0, 0.8, 'glass', attack=0.01).data, decay=min(2.5, Dp - 0.2))
            m.track('swell', level=LV['fx'] + 1).add(sw, Dp)
        m.track('bloom', level=LV['fx'] + 2).add(X.shimmer_hit(f.chord_at(Dp)[-1] + 12), Dp)
        m.track('boom', level=LV['sub'] - 4).add(X.boom(2.5, 44), Dp)
        m.track('air_noise', level=LV['texture'] + 7).add(_air_noise(duration), 0.0)
        m.track('sparkle', level=LV['fx'] - 1, sends={'shimmer': -12}).add(X.sparkle(min(2.0, O - Dp), 24, key, 'major_pentatonic', shape='fade'), Dp)
    elif flavor == 'product':
        pn = m.track('piano', level=LV['keys'], sends={'big': -12})
        kf = _keys('piano')
        for t, v, d, vel in comp_events(f, g, 0.0, O, 'x-------x-------', vel=0.55, gate=1.0):
            pn.add(kf([n + 12 for n in v[-3:]], d, vel), t)
        pn.add(kf(f.chord_at(O, 12), E - O, 0.6), O)
        pp = m.track('pulse', level=LV['bass'] - 1)
        for t, n, d, v in bass_events(f, g, 0.0, O, 'r.r.r.r.r.r.r.r.', octave=2, vel=0.7, gate=0.45):
            pp.add(S.bass(n, d, v, 'pluck'), t)
        pp.automate('lpf', f.curve(250, 6000))
        if Dp - B > 0.3:
            m.track('heart', level=LV['kick'] - 5).hits(lambda v: D.kick('soft', v), [(t, 0.6 + 0.4 * (t - B) / (Dp - B))
                                                                                     for t in seq.step_times(g, B, Dp, 4)])
        m.track('impact', level=LV['fx'] + 5).add(X.impact('cinematic', 1.0), Dp)
        m.track('boom', level=LV['sub'] - 2).add(X.boom(2.8, 42), Dp)
        m.track('kick', level=LV['kick'] - 2).loop(lambda v: D.kick('soft', v), 'x.......x.......', Dp + f.bar / 2, O)
        m.track('clap', level=LV['clap'] - 3, sends={'big': -10}).loop(lambda v: D.clap('big', v), '....x.......x...', Dp + f.bar / 2, O)
        m.track('shaker', level=LV['shaker'] - 1, pan=0.3).loop(lambda v: D.shaker(v), 'x.xxx.xxx.xxx.xx', Dp, O, vel=0.5)
        if Dp > 1.2:
            m.track('rev', level=LV['riser']).add(X.reverse_cymbal(min(1.6, Dp - 0.1)), Dp)
    else:  # piano
        pn = m.track('piano', level=LV['keys'] + 1, sends={'big': -10, 'room': -14},
                     fx=[lambda x: F.high_shelf(x, 5000, 4.0)])
        ins = SM.inst('piano')
        for a, b_, v, s in f.segments(0.0, O):
            notes = [f.bass_at(a, 2) + 12] + sorted(v)
            patt = [0, 2, 1, 3, 2, 4 % len(notes), 3, 1]
            k = 0
            for t in seq.step_times(g, a, b_, 8):
                n = notes[patt[k % len(patt)] % len(notes)]
                pn.add(ins.play(n, 1.4, 0.6 + 0.15 * (k % 4 == 0)), t)
                k += 1
        pn.add(_piano_chord([f.bass_at(O, 2)] + f.chord_at(O), E - O, 0.55), O)
        bl = m.track('bell', level=LV['bells'] + 1, sends={'big': -8, 'delay': -12}, pan=0.2)
        gk = SM.inst('glock') if SM.available('glock') else None
        for a, b_, v, s in f.segments(Dp, E):          # glockenspiel sparkle on each chord change
            for j, n in enumerate(sorted(v)[-2:]):
                nn = n + 24 if n + 24 <= 100 else n + 12
                bl.add(gk.play(nn, None, 0.5) if gk and nn >= 79 else FM.bell(nn, 2.0, 0.5, 'celesta'), a + 0.09 * j)
        m.track('air_noise', level=LV['texture'] + 3).add(_air_noise(duration, seed=4), 0.0)
    return m
