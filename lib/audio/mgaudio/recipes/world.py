"""国风 / 国潮 recipe: guzheng (sampled 筝-like zither w/ 揉弦 滑音 刮奏 摇指), dizi (笛子) ornaments, pipa 轮指,
Chinese percussion (大鼓 堂鼓 锣 小锣 镲 梆子 木鱼), optional modern beat (国潮 hip-hop / trap)."""
from __future__ import annotations

import numpy as np

from ..core import Sound, ns, layer, fade
from .. import synth as S, drums as D, sfx as X, fx as FX, filters as F, pluck as P, wind as W, seq
from ..theory import pc, SCALES, midi
from .base import Form, LV, new_mix, bass_events, comp_events, place_notes, place_segments


def _penta(key, mode, lo, hi):
    k = pc(key)
    iv = SCALES[mode]
    return [n for n in range(int(lo), int(hi) + 1) if (n - k) % 12 in iv]


def _snap_penta(n, pool):
    return min(pool, key=lambda p: (abs(p - n), p))


def guofeng(duration=10.0, bpm=None, key='D', mode='gong', prog='I vi IV V', drop=None, build=None, outro=None,
            hits=(), energy=None, music_level=-20.0, sfx_duck=3.0, flavor='modern', final=None, dizi=True, **kw):
    """国风 / 国潮 (新中式, 水墨, 剪纸, 皮影).  Pentatonic (mode 'gong' 宫 = major-pentatonic colour, 'yu' 羽 =
    minor colour; harmony from the parent major/minor key).
      intro : guzheng 刮奏 glissando hook at t=0 -> dizi phrase with 滑音/叠音 over soft strings, guzheng answers
      build : 堂鼓 accelerating roll (急急风), 梆子 on the beats, reverse cymbal
      drop  : 大锣 + 大鼓 hit, guzheng 16th pentatonic ostinato with 揉弦, pipa 轮指 melody,
              flavor 'modern' adds kick/snare/hats + pentatonic 808 (国潮); 'classical' = taiko/tanggu groove only
      outro : downward 刮奏, 小锣 + 大鼓 button, final chord rings.
    bpm 76-110 (92 modern / 84 classical)."""
    f = Form(duration, bpm, drop, build, outro, hits, energy, key, mode, prog, **{**dict(chord_beats=4, octave=4), **kw},
             final=final, bpm_default=92 if flavor == 'modern' else 84, bpm_range=(76, 110))
    m = new_mix(f, music_level, sfx_duck, master=dict(air=1.0))
    g = m.grid
    B, Dp, O, E = f.build, f.drop, f.outro, f.end
    minor = mode in ('yu', 'jue', 'minor')
    pool = _penta(key, mode, 55, 96)
    top = max(n for n in pool if n <= 88)
    # ---- strings bed
    pd = m.track('pad', level=LV['pad'] - 1.5, sends={'hall': -8})
    place_segments(pd, f, 0.0, E, lambda v, d: S.pad(v, d, 0.65, 'strings', attack=0.4, release=1.2))
    pd.automate('lpf', f.curve(1800, 12000))
    # ---- guzheng
    gz = m.track('guzheng', level=LV['lead'] - 1, sends={'hall': -9, 'room': -16}, pan=-0.1)
    lo_g = min(n for n in pool if n >= 62)
    gl = P.guzheng_gliss(lo_g, top, dur=min(0.75, max(0.3, B * 0.5)), key=key, mode=mode, vel=0.8, ring=2.2)
    m.track('gliss', level=LV['lead'] + 0.5, sends={'hall': -7}, pan=-0.15).add(gl, min(0.75, max(0.3, B * 0.5)) if B > 0.6 else 0.3)
    # answering plucks in the intro/build (with 揉弦 on long notes)
    ans_t = seq.step_times(g, gl.sync + 0.6, Dp - 0.2, 4) if Dp > 1.5 else []
    for i, t in enumerate(ans_t[:6]):
        ch = f.chord_at(t + 1e-3)
        n = _snap_penta(ch[-1] + (12 if ch[-1] < 72 else 0), pool)
        gz.add(P.guzheng(n, 1.2, 0.65, orn='rou' if i % 2 else None), t)
    # drop ostinato: 16ths, pentatonic chord-tone cells
    cell = [0, 2, 1, 2, 3, 2, 1, 2]
    for a, b_, v, s in f.segments(Dp, O):
        tones = sorted(set(_snap_penta(n + 12, pool) for n in v))
        for j, t in enumerate(seq.step_times(g, a, b_, 16)):
            n = tones[cell[j % 8] % len(tones)]
            vel = 0.75 if j % 4 == 0 else 0.55
            gz.add(P.guzheng(n, 0.5, vel, orn='rou' if (j % 8 == 7) else None, depth=0.35), t)
    m['gliss'].add(P.guzheng_gliss(lo_g, top, dur=0.5, key=key, mode=mode, vel=0.75, up=False, ring=2.5), O + 0.5)
    gz.add(P.guzheng(_snap_penta(f.chord_at(O)[-1] + 12, pool), E - O, 0.8, orn='rou'), O)
    # ---- dizi phrase (intro) & pipa tremolo melody (drop)
    if dizi and B > 0.9:
        seq_notes = sorted(set(_snap_penta(n + 12, pool) for n in f.chord_at(0.1)))
        t0 = gl.sync + 0.25
        dur_avail = max(0.8, Dp - t0 - 0.1)
        n1, n2, n3 = seq_notes[-1], _snap_penta(seq_notes[-1] + 2, pool), seq_notes[len(seq_notes) // 2]
        ev = [(0.0, dur_avail * 0.35, n1, 0.75, 'slide'), (dur_avail * 0.36, dur_avail * 0.18, n2, 0.8, 'grace'),
              (dur_avail * 0.55, dur_avail * 0.45, n3, 0.7, 'fall')]
        m.track('dizi', level=LV['lead'] - 1.5, sends={'hall': -7}, pan=0.15).add(W.wind_line(ev, 'dizi', seed=4), t0)
    pp = m.track('pipa', level=LV['lead'] - 3, sends={'hall': -10}, pan=0.25)
    for a, b_, v, s in f.segments(Dp, O):
        n = _snap_penta(v[-1] + 12, pool)
        pp.add(P.pipa(n, (b_ - a) * 0.9, 0.7, tremolo=True, rate=16), a)
    # ---- percussion
    m.track('dagu', level=LV['kick'] - 1, sends={'hall': -10}).add(D.taiko('dagu', 1.0), Dp).add(D.taiko('dagu', 0.95), O)
    m.track('gong', level=LV['crash'] + 3, sends={'hall': -12}).add(D.gong('chinese', 0.9), Dp)
    m['gong'].add(D.gong('small', 0.8), O)
    if Dp - B > 0.3:
        m.track('tanggu', level=LV['tom'] - 1, sends={'room': -10}).hits(lambda v: D.taiko('tanggu', v, decay=0.35),
                                                                         seq.roll(B, Dp - 0.02, 8, 32, g, 0.3, 0.95))
        m.track('bangzi', level=LV['perc'], pan=0.35).hits(lambda v: D.woodblock('bangzi', v),
                                                           seq.step_times(g, B, Dp, 4))
        if B > 0.6:
            m.track('revcym', level=LV['riser']).add(X.reverse_cymbal(min(1.4, Dp - B)), Dp)
    m.track('bo', level=LV['perc'] - 1, pan=-0.3).loop(lambda v: D.bo('xiaobo', v, choke=True), '............x...', Dp, O)
    if flavor == 'modern':
        kick = lambda v=1.0: D.kick('punchy', v)
        m.track('kick', level=LV['kick']).loop(kick, 'x......x..x.....', Dp, O)
        m['kick'].add(kick(1.0), O)
        m.track('snare', level=LV['snare'], sends={'room': -10}).loop(lambda v: D.snare('tight', v), '....x.......x...', Dp, O)
        m.track('hat', level=LV['hat'], pan=0.2).loop(lambda v: D.hat('closed', v), 'x.x.x.x.x.x.x.xx', Dp, O, vel=0.65,
                                                     vel_jitter=0.15)
        b8 = m.track('808', level=LV['b808'] - 1.5)
        for a, b_, v, s in f.segments(Dp, E):
            b8.add(S.b808(f.bass_at(a, 1 if pc(key) >= 5 else 2), min(b_ - a, 1.8), 0.9, drive=0.3), a)
        b8.duck(by='kick', depth=3, release=0.1)
    else:
        m.track('taiko', level=LV['kick'] - 3, sends={'hall': -10}).loop(lambda v: D.taiko('taiko', v, decay=0.9),
                                                                         'x.....x.x.......', Dp + f.bar * 0.0, O, vel=0.85)
        m.track('tanggu2', level=LV['tom'] - 3, sends={'room': -10}, pan=0.2).loop(
            lambda v: D.taiko('tanggu', v, decay=0.3), '....x..x....x.xx', Dp, O, vel=0.7)
        m.track('muyu', level=LV['perc'] - 2, pan=-0.35).loop(lambda v: D.woodblock('muyu', v), 'x...x...x...x...', Dp, O, vel=0.6)
    return m
