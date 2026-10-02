"""Club / electronic recipes: techno (minimal-click), acid, pop (bright EDM-pop), future_bass, trap, glitch_hop."""
from __future__ import annotations

import numpy as np

from ..core import Sound, ns, layer, fade
from .. import synth as S, drums as D, sfx as X, fx as FX, filters as F, fm as FM, seq
from ..theory import midi, SCALES, pc
from .base import Form, LV, new_mix, bass_events, comp_events, chord_tone_melody, place_notes, place_segments
from .retro import _transition


def _oct_for(pc_, lo=46.0):
    """Octave number so that pitch class pc_ has its fundamental in [lo, 2*lo) Hz (phone-audible 808s)."""
    for o in range(0, 5):
        f = 440 * 2 ** ((12 * (o + 1) + pc_ - 69) / 12)
        if f >= lo:
            return o
    return 2


# ============================================================================ MINIMAL TECHNO / CLICK
def techno(duration=10.0, bpm=None, key='A', mode='minor', prog='i9 i9 iv9 i9', drop=None, build=None, outro=None,
           hits=(), energy=None, music_level=-20.0, sfx_duck=3.0, final=None, **kw):
    """Minimal / click techno (Bauhaus, geometric): tight driven 4/4 kick from the first frame, euclidean
    rim/clave/tick clicks panned wide, off-beat open hats, dub-chord stabs into a feedback delay, rolling
    off-beat bass, glassy geometric pings; breakdown (kick out, clap roll + sweep) -> drop.  bpm 118-132 (124)."""
    f = Form(duration, bpm, drop, build, outro, hits, energy, key, mode, prog, **{**dict(chord_beats=4, octave=3), **kw},
             final=final, bpm_default=124, bpm_range=(118, 132), center=57)
    m = new_mix(f, music_level, sfx_duck)
    g = m.grid
    k = D.kit('techno')
    B, Dp, O, E = f.build, f.drop, f.outro, f.end
    kick = lambda v=1.0: D.kick('techno', v, decay=0.38)
    kk = m.track('kick', level=LV['kick'])
    kk.loop(kick, 'x...x...x...x...', 0.0, B)
    kk.loop(kick, 'x...x...x...x...', Dp, O)
    kk.add(kick(1.0), O)
    m.track('clap', level=LV['clap'], sends={'room': -10}).loop(k['clap'], '....x.......x...', Dp, O)
    if Dp - B > 0.3:
        m['clap'].hits(lambda v: D.clap('tight', v), seq.roll(B + (Dp - B) * 0.5, Dp - 0.01, 8, 16, g, 0.3, 0.85))
    m.track('ohat', level=LV['ohat'], pan=0.1).loop(lambda v: D.hat('open', v, decay=0.16), '..x...x...x...x.', 0.0, O)
    m.track('hat', level=LV['hat'] - 1, pan=-0.2).loop(lambda v: D.hat('closed', v, decay=0.025),
                                                      'x.xxx.xxx.xxx.xx', Dp, O, vel=0.55, vel_jitter=0.2)
    # euclidean clicks
    m.track('rim', level=LV['perc'], pan=-0.55, sends={'delay': -14}).loop(lambda v: D.rim(v), seq.euclid_pattern(5, 16, 2), 0.0, O, vel=0.8)
    m.track('clave', level=LV['perc'] - 2, pan=0.6).loop(lambda v: D.clave(v), seq.euclid_pattern(3, 8, 1) * 2, B - f.bar, O, vel=0.7)
    m.track('tick', level=LV['perc'] - 4, pan=0.3).loop(lambda v: X.tick('hi', level=-24), 'x.x.x.x.x.x.x.x.', Dp, O)
    # dub stabs -> feedback delay
    st = m.track('stab', level=LV['chords'] - 1.5, sends={'delay': -3, 'hall': -14})
    for t, v, d, vel in comp_events(f, g, 0.0, O, '...x.....x..x...', vel=0.85, gate=0.6):
        st.add(S.stab(v, d, vel, 'dub'), t)
    st.add(S.stab(f.chord_at(O), 0.5, 0.95, 'dub'), O)
    st.automate('lpf', f.curve(900, 14000))
    st.duck(by='kick', depth=4, release=0.15)
    m.bus('delay', lambda x: FX.delay(x, FX.beat(f.bpm, 3 / 16), 0.55, mix=1.0, lp=3200, hp=400, sat=0.3))
    # rolling off-beat bass
    bs = m.track('bass', level=LV['bass'])
    place_notes(bs, lambda n, d, v: S.bass(n, d, v, 'pluck'), bass_events(f, g, Dp, O, '..r...r.r.r...r.', octave=2, vel=0.85, gate=0.8))
    bs.add(S.bass(f.bass_at(O), 0.6, 0.9, 'pluck'), O)
    bs.duck(by='kick', depth=6, release=0.1)
    # geometric pings (glass FM, pentatonic)
    pg = m.track('ping', level=LV['bells'], sends={'delay': -6, 'plate': -12}, pan=0.25)
    pool = [n for n in range(76, 96) if (n - pc(key)) % 12 in SCALES['minor_pentatonic']]
    rr = np.random.default_rng(7)
    for t in seq.step_times(g, B - f.bar, O, 16):
        if rr.random() < 0.16:
            pg.add(FM.bell(int(pool[rr.integers(len(pool))]), 0.3, 0.6, 'glock'), t, pan=float(rr.uniform(-0.6, 0.6)))
    _transition(m, f, riser='sweep', reverse=False, crash=False)
    m.track('crash', level=LV['crash'] - 1, sends={'hall': -14}).add(D.cymbal('ride', 0.9, decay=1.5), Dp)
    return m


# ============================================================================ ACID
_ACID = [(0, 'A'), None, (12, 'S'), (0, ''), (10, ''), (0, 'A'), None, (12, 'S'), (3, 'A'), (0, ''), None, (7, 'S'),
         (0, 'A'), (12, ''), (10, 'S'), (7, '')]


def acid(duration=10.0, bpm=None, key='A', mode='minor', prog='i i bVI bVII', drop=None, build=None, outro=None,
         hits=(), energy=None, music_level=-20.0, sfx_duck=3.0, pattern=None, final=None, **kw):
    """Acid techno/house: TB-303 line (accents, slides, resonance 0.85, diode distortion) whose cutoff knob
    follows the arrangement (closed intro -> screaming build -> squelch drop), 909-style kick/clap/hats/ride,
    rave stab on the drop.  pattern: 16 steps of None | (semitones_from_root, 'A'ccent/'S'lide flags).
    bpm 124-140 (130)."""
    f = Form(duration, bpm, drop, build, outro, hits, energy, key, mode, prog, **{**dict(chord_beats=4, octave=4), **kw},
             final=final, bpm_default=130, bpm_range=(124, 140))
    m = new_mix(f, music_level, sfx_duck, master=dict(warmth=1.0))
    g = m.grid
    k = D.kit('house')
    B, Dp, O, E = f.build, f.drop, f.outro, f.end
    pat = pattern or _ACID
    # the 303 line (one continuous phrase so slides are legato)
    steps = []
    st = f.bar / 16
    t_start = f.bars(0.0, O)[0]
    nsteps = int(round((O - t_start) / st))
    for i in range(nsteps):
        t = t_start + i * st
        it = pat[i % 16]
        if it is None:
            steps.append(None)
            continue
        semi, fl = it
        root = f.bass_at(t + 1e-4, 2)
        steps.append((root + semi, 'A' in fl, 'S' in fl))
    steps.append((f.bass_at(O, 2), True, False))
    cut = [(0.0 - t_start + a, v) for a, v in
           [(0.0, 190), (B, 420), (Dp - 0.02, 2600), (Dp, 750), (Dp + (O - Dp) * 0.5, 1500), (O, 2200), (E, 900)]]
    ac = S.acid_line(steps, f.bpm, t0=0.0, cutoff=260, res=0.86, env_mod=2.6, decay=0.24, drive=2.4,
                                 cutoff_curve=cut)
    tb = m.track('303', level=LV['lead'] - 0.5, sends={'delay': -12}, pan=0.05)
    tb.add(ac, t_start)
    tb.duck(by='kick', depth=4, release=0.1)
    # drums
    kick = lambda v=1.0: D.kick('techno', v, decay=0.42, drive=3.0)
    kk = m.track('kick', level=LV['kick'])
    kk.loop(kick, 'x...x...x...x...', 0.0, B)
    kk.loop(kick, 'x...x...x...x...', Dp, O)
    kk.add(kick(1.0), O)
    m.track('clap', level=LV['clap'], sends={'room': -10}).loop(k['clap'], '....x.......x...', Dp, O)
    m.track('ohat', level=LV['ohat'] + 1).loop(lambda v: D.hat('open', v, decay=0.2), '..x...x...x...x.', 0.0, O)
    m.track('hat', level=LV['hat'], pan=0.2).loop(lambda v: D.hat('closed', v), 'xxxxxxxxxxxxxxxx', B, O, vel=0.55,
                                                 vel_jitter=0.2)
    m.track('ride', level=LV['crash'], pan=-0.3).loop(lambda v: D.cymbal('ride', v, decay=1.2), 'x.x.x.x.x.x.x.x.', Dp, O, vel=0.6)
    if Dp - B > 0.3:
        m.track('snare', level=LV['snare'] - 1).hits(lambda v: D.snare('tight', v, decay=0.12),
                                                     seq.roll(B, Dp - 0.01, 8, 32, g, 0.2, 0.9))
    # rave stab on the drop and the outro button
    rs = m.track('stab', level=LV['chords'], sends={'hall': -9})
    rs.add(S.stab(f.chord_at(Dp), 0.4, 1.0, 'rave'), Dp)
    rs.add(S.stab(f.chord_at(O), 0.8, 1.0, 'rave'), O)
    _transition(m, f, riser='noise', reverse=True)
    m['crash'].add(D.crash(0.8), O)
    return m


# ============================================================================ POP (bright EDM-pop / flat vector)
def pop(duration=10.0, bpm=None, key='C', mode='major', prog='I V vi IV', drop=None, build=None, outro=None,
        hits=(), energy=None, music_level=-20.0, sfx_duck=3.0, final=None, **kw):
    """Bright, upbeat EDM-pop (flat vector / kinetic brand films): filtered pluck chords + snaps intro, clap build
    with noise riser, drop = 4/4 kick, off-beat 'future house' bass, sidechained supersaw stabs, pluck hook with
    dotted-8th delay, shaker/hat groove, crash + button ending.  bpm 110-130 (122)."""
    f = Form(duration, bpm, drop, build, outro, hits, energy, key, mode, prog, **{**dict(chord_beats=4, octave=4), **kw},
             final=final, bpm_default=122, bpm_range=(110, 130))
    m = new_mix(f, music_level, sfx_duck, master=dict(air=1.0))
    g = m.grid
    k = D.kit('house')
    B, Dp, O, E = f.build, f.drop, f.outro, f.end
    # plucked chords (whole piece), LPF opens with energy
    pl = m.track('chords', level=LV['chords'], sends={'plate': -12, 'delay': -16})
    for t, v, d, vel in comp_events(f, g, 0.0, O, 'x..x..x...x..x..', vel=0.8, gate=0.9):
        pl.add(S.poly(v, 0.35, S.pluck, vel, kind='future'), t)
    pl.add(S.poly(f.chord_at(O), 1.2, S.pluck, 0.9, kind='future'), O)
    pl.automate('lpf', f.curve(800, 18000))
    pl.duck(by='kick', depth=5, release=0.16)
    m.track('snap', level=LV['clap'] - 2, sends={'room': -8}).loop(lambda v: D.snap(v), '....x.......x...', 0.0, B)
    m.track('shaker', level=LV['shaker'], pan=0.3).loop(lambda v: D.shaker(v), 'x.xxx.xxx.xxx.xx', 0.0, O, vel=0.6,
                                                        vel_jitter=0.2)
    # build: clap 8ths -> 16ths
    if Dp - B > 0.3:
        m.track('clapbuild', level=LV['clap'] - 1, sends={'plate': -12}).hits(
            lambda v: D.clap('808', v), seq.roll(B, Dp - 0.01, 4, 16, g, 0.35, 0.95))
    # drop drums
    kick = lambda v=1.0: D.kick('punchy', v)
    kk = m.track('kick', level=LV['kick'])
    kk.loop(kick, 'x...x...x...x...', Dp, O)
    kk.add(kick(1.0), O)
    m.track('clap', level=LV['clap'], sends={'plate': -14}).loop(k['clap'], '....x.......x...', Dp, O)
    m.track('ohat', level=LV['ohat'] + 1, pan=-0.1).loop(lambda v: D.hat('open', v, decay=0.18), '..x...x...x...x.', Dp, O)
    # off-beat bass
    bs = m.track('bass', level=LV['bass'])
    place_notes(bs, lambda n, d, v: S.bass(n, d, v, 'analog'), bass_events(f, g, Dp, O, '..r...r...r...o.', vel=0.9, gate=0.7))
    bs.add(S.bass(f.bass_at(O), 0.9, 0.9, 'analog'), O)
    bs.duck(by='kick', depth=6, release=0.12)
    # supersaw stabs
    ss = m.track('saw', level=LV['pad'] + 1, sends={'hall': -12})
    for t, v, d, vel in comp_events(f, g, Dp, O, 'x-.x-.x-.x-.x-x-', vel=0.85, gate=0.85):
        ss.add(S.supersaw(v, d, vel, env=(0.003, 0.2, 0.7, 0.15), cutoff=6500), t)
    ss.add(S.supersaw(f.chord_at(O), 1.4, 0.9, env=(0.003, 0.6, 0.5, 0.8), cutoff=6500), O)
    ss.duck(by='kick', depth=8, release=0.18)
    # hook
    ld = m.track('hook', level=LV['lead'] - 1, sends={'delay': -8, 'plate': -12}, pan=0.05)
    ev = chord_tone_melody(f, g, Dp, O, rhythm=(3, 3, 2), order=('top', 'mid', 'up'), octave=5, div=16, legato=0.8)
    place_notes(ld, lambda n, d, v: S.pluck(n, max(d, 0.18), v, 'future'), ev)
    _transition(m, f, riser='hybrid')
    m['crash'].add(D.crash(0.8), O)
    return m


# ============================================================================ FUTURE BASS
def future_bass(duration=10.0, bpm=None, key='D', mode='major', prog='IVmaj7 V iii7 vi9', drop=None, build=None,
                outro=None, hits=(), energy=None, music_level=-20.0, sfx_duck=3.0, gap=True, final='Imaj9', **kw):
    """Future bass (liquid / morph): half-time drums (snare on 3), trap hats with rolls, huge supersaw chords
    chopped by a 16th gate + pumping sidechain, sub/808 roots, formant 'vocal chop' pluck hook, snare-roll +
    riser build with a short pre-drop gap.  bpm 130-165 (150)."""
    f = Form(duration, bpm, drop, build, outro, hits, energy, key, mode, prog, **{**dict(chord_beats=4, octave=4), **kw},
             final=final, bpm_default=150, bpm_range=(130, 165))
    m = new_mix(f, music_level, sfx_duck, master=dict(air=1.0))
    g = m.grid
    k = D.kit('trap')
    B, Dp, O, E = f.build, f.drop, f.outro, f.end
    # intro/build: soft filtered chords (sustained supersaw pad) + sparse pluck
    pd = m.track('pad', level=LV['pad'], sends={'hall': -9})
    place_segments(pd, f, 0.0, Dp, lambda v, d: S.supersaw(v, d, 0.7, voices=5, env=(0.25, 0.4, 0.8, 0.6), cutoff=3500))
    pd.automate('lpf', f.curve(700, 12000))
    # intro/build hook: filtered chop line + snaps on 3 (so the cue moves from frame 1)
    ih = m.track('introhook', level=LV['pluck'] - 1, sends={'delay': -9, 'hall': -12}, pan=0.1)
    for t, n, d, v in chord_tone_melody(f, g, 0.0, B, rhythm=(3, 3, 2), order=('top', 'mid', 'up'), octave=5, div=16,
                                        legato=0.6, vel=0.7):
        ih.add(S.pluck(n, d, v, 'future'), t)
    ih.automate('lpf', f.curve(1200, 9000))
    m.track('snap', level=LV['clap'] - 2, sends={'hall': -10}).loop(lambda v: D.snap(v), '........x.......', 0.0, Dp)
    # drop chords: chopped supersaws
    ch = m.track('chords', level=LV['chords'] + 0.5, sends={'hall': -12})
    for a, b_, v, s in f.segments(Dp, O):
        c = S.supersaw(v, b_ - a, 0.9, voices=7, detune=26, env=(0.005, 0.3, 0.85, 0.2), cutoff=7000)
        c = Sound(FX.trance_gate(c.data, 'x.xx.xx.x.xxx.xx', f.bpm, 16, attack=0.002, release=0.03, depth=0.85, t0=a - Dp))
        ch.add(c, a)
    ch.add(S.supersaw(f.chord_at(O), min(1.8, E - O), 0.9, voices=7, detune=26, env=(0.004, 0.8, 0.5, 1.0)), O)
    ch.duck(by='kick', depth=9, release=0.22, shape=1.6)
    # sub
    sb = m.track('sub', level=LV['sub'])
    for a, b_, v, s in f.segments(Dp, E):
        sb.add(S.b808(f.bass_at(a, _oct_for(f.root_pc(a))), min(b_ - a, 1.8), 0.9, drive=0.25), a)
    sb.duck(by='kick', depth=4, release=0.12)
    # drums (half-time)
    kick = lambda v=1.0: D.kick('punchy', v)
    m.track('kick', level=LV['kick']).loop(kick, 'x.........x.....', Dp, O)
    m['kick'].add(kick(1.0), O)
    m.track('snare', level=LV['snare'], sends={'hall': -10}).loop(lambda v: D.snare('trap', v), '........x.......', Dp, O)
    m.track('clap', level=LV['clap'] - 1, sends={'plate': -10}).loop(lambda v: D.clap('808', v), '........x.......', Dp, O)
    hh = m.track('hat', level=LV['hat'], pan=0.2)
    hh.loop(lambda v: D.hat('trap', v), 'x.x.x.x.x.x.x.x.', Dp, O, vel=0.7, vel_jitter=0.15)
    for b in f.bars(Dp, O):
        t0 = b + 3 * f.beat
        if t0 + f.beat <= O:
            for i in range(6):
                hh.add(D.hat('trap', 0.45 + 0.08 * i), t0 + f.beat / 2 + i * f.beat / 12)
    # vocal-chop hook: formant plucks
    ld = m.track('chop', level=LV['lead'] - 1, sends={'delay': -9, 'hall': -14}, pan=-0.05)
    ev = chord_tone_melody(f, g, Dp, O, rhythm=(2, 1, 1, 2, 2), order=('top', 'mid', 'top', 'up', 'mid'), octave=5,
                           div=8, legato=0.7)
    for t, n, d, v in ev:
        s = S.voice(n, d, v, 'saw', 'pulse', 12, 5, 0.3, pw=0.3, cutoff=2400, res=0.1, fenv=(0.001, 0.15, 0.3, 0.1),
                    fenv_amt=1.5, env=(0.004, 0.12, 0.7, 0.12), glide_from=n - 2, glide=0.04, vib_rate=5.5, vib_cents=10)
        ld.add(Sound(F.formant(s.data, 'a' if (int(n) % 2) else 'o', q=5, mix=0.7)), t)
    # build
    if Dp - B > 0.3:
        m.track('roll', level=LV['snare'] - 1).hits(lambda v: D.snare('tight', v), seq.roll(B, Dp - (f.beat / 2 if gap else 0.01), 8, 32, g, 0.25, 1.0))
    _transition(m, f, riser='hybrid', crash=True)
    if gap and Dp - B > f.beat:
        for tn in ('pad', 'riser', 'revcym'):
            if tn in m:
                m[tn].region('mute', Dp - f.beat / 2, f.beat / 2 - 0.004)
    m['crash'].add(D.crash(0.75), O)
    return m


# ============================================================================ TRAP / HYPE
def trap(duration=10.0, bpm=None, key='E', mode='minor', prog='i VI iv V', drop=None, build=None, outro=None,
         hits=(), energy=None, music_level=-20.0, sfx_duck=3.0, gap=True, accent_hits=True, final=None, **kw):
    """Trap / hype (图文快闪 kinetic text): gliding saturated 808s (tuned for phone speakers), clap+snare on 3,
    8th hats with 1/32 & triplet rolls, dark bell/pluck melody, low string pad; build with hat rolls + snare
    roll + riser and a 1-beat silence before the drop.  accent_hits: extra 808+kick stab on visual hits in the
    drop.  bpm 130-160 (140)."""
    f = Form(duration, bpm, drop, build, outro, hits, energy, key, mode, prog, **{**dict(chord_beats=4, octave=4), **kw},
             final=final, bpm_default=140, bpm_range=(130, 160))
    m = new_mix(f, music_level, sfx_duck)
    g = m.grid
    B, Dp, O, E = f.build, f.drop, f.outro, f.end
    st = f.bar / 16
    # melody: bell arp (whole piece)
    ml = m.track('bells', level=LV['lead'] - 1.5, sends={'delay': -10, 'hall': -14})
    ev = seq.arp(g, lambda t: f.chord_at(t, 12), 0.0, O, div=16, pattern=[0, 2, 1, 2, 0, 2, 1, 3], gate=0.9, vel=0.8,
                 rest='x.xx.x.xx.x.x.x.')
    place_notes(ml, lambda n, d, v: FM.bell(n, 0.6, v, 'glock'), ev)
    ml.automate('lpf', f.curve(1400, 18000))
    # pad (dark strings)
    pd = m.track('pad', level=LV['pad'] - 2, sends={'hall': -10})
    place_segments(pd, f, 0.0, E, lambda v, d: S.pad(v, d, 0.7, 'strings'))
    # 808
    b8 = m.track('808', level=LV['b808'])
    oc = _oct_for(pc(key))
    for b in f.bars(Dp, O):
        r0 = f.bass_at(b + 1e-3, oc)
        nxt = f.bass_at(b + f.bar + 1e-3, oc) if b + f.bar < O else f.bass_at(O, oc)
        plan = [(0, 6, r0, None), (7, 2, r0, None), (10, 6, r0 + 12 if (b - Dp) / f.bar % 2 else r0, None)]
        for s0, L, nt, gf in plan:
            t = b + s0 * st
            if Dp - 1e-6 <= t < O - 1e-6:
                b8.add(S.b808(nt, L * st * 0.95, 0.95, glide_from=gf), t)
    b8.add(S.b808(f.bass_at(O, oc), min(E - O - 0.1, 1.6), 1.0, glide_from=f.bass_at(O, oc) + 12, glide=0.25), O)
    kick = lambda v=1.0: D.kick('punchy', v, decay=0.28)
    kk = m.track('kick', level=LV['kick'] - 1)
    kk.loop(kick, 'x......x..x.....', Dp, O)
    kk.add(kick(1.0), O)
    m.track('clap', level=LV['clap'], sends={'plate': -12}).loop(lambda v: D.clap('tight', v), '........x.......', Dp, O)
    m.track('snare', level=LV['snare'] - 1.5).loop(lambda v: D.snare('trap', v), '........x.......', Dp, O)
    hh = m.track('hat', level=LV['hat'] + 1, pan=0.15)
    hh.loop(lambda v: D.hat('trap', v), 'x.x.x.x.x.x.x.x.', B, O, vel=0.75, vel_jitter=0.1)
    for j, b in enumerate(f.bars(B, O)):
        t0 = b + 3 * f.beat
        if t0 + f.beat > O + 1e-6 or t0 < B:
            continue
        n_ = 6 if j % 2 else 8
        for i in range(n_):
            hh.add(D.hat('trap', 0.4 + 0.5 * i / n_), t0 + f.beat / 2 + i * (f.beat / 2) / n_)
    m.track('ohat', level=LV['ohat'], pan=-0.2).loop(lambda v: D.hat('half', v), '......x.......x.', Dp, O)
    if Dp - B > 0.3:
        m.track('roll', level=LV['snare'] - 2).hits(lambda v: D.snare('trap', v),
                                                  seq.roll(B, Dp - (f.beat if gap else 0.01), 8, 32, g, 0.25, 0.95))
    _transition(m, f, riser='noise', reverse=False)
    if gap and Dp - B > f.beat:
        for tn in ('bells', 'pad', 'hat', 'riser'):
            m[tn].region('mute', Dp - f.beat, f.beat - 0.004)
        m.track('revcym', level=LV['riser'] - 1).add(X.reverse_cymbal(f.beat * 0.95), Dp)
    if accent_hits:
        for h in f.hits_in(Dp + 0.05, O):
            b8.add(S.b808(f.bass_at(h, oc), f.beat * 0.9, 1.0), h)
            kk.add(kick(1.0), h)
    m['crash'].add(D.crash(0.7), O)
    return m


# ============================================================================ GLITCH-HOP / IDM
def glitch_hop(duration=10.0, bpm=None, key='E', mode='minor', prog='i VI iv v', drop=None, build=None, outro=None,
               hits=(), energy=None, music_level=-20.0, sfx_duck=3.0, final=None, **kw):
    """Glitch-hop / IDM (glitch art): swung breakbeat, wobbling FM/saw bass (1/8-1/16 filter LFO), 16th-gated
    chord chops, data-chirp & digital-noise ghost percussion, buffer-repeat stutters (accelerating roll into the
    drop), bitcrush bursts, tape-stop ending.  bpm 95-115 (105)."""
    f = Form(duration, bpm, drop, build, outro, hits, energy, key, mode, prog, **{**dict(chord_beats=4, octave=4), **kw},
             final=final, swing=0.12, bpm_default=105, bpm_range=(95, 115))
    m = new_mix(f, music_level, sfx_duck, master=dict(air=1.0))
    g = m.grid
    B, Dp, O, E = f.build, f.drop, f.outro, f.end
    kick = lambda v=1.0: D.kick('punchy', v, decay=0.32)
    kk = m.track('kick', level=LV['kick'])
    kk.loop(kick, 'x..x..x...x.....', Dp, O)
    kk.loop(kick, 'x.......x.......', 0.0, B, vel=0.8)
    kk.add(kick(1.0), O)
    sn = m.track('snare', level=LV['snare'], sends={'room': -8})
    sn.loop(lambda v: D.snare('tight', v), '....X..g....X.g.', Dp, O)
    sn.loop(lambda v: D.snare('tight', v), '....x.......x...', 0.0, B, vel=0.7)
    m.track('hat', level=LV['hat'], pan=0.25).loop(lambda v: D.hat('closed', v, decay=0.04), 'xxxxxxxxxxxxxxxx', 0.0, O,
                                                  vel=0.6, vel_jitter=0.35)
    # ghost glitch percussion
    gp = m.track('glitchperc', level=LV['perc'], pan=-0.3)
    rr = np.random.default_rng(11)
    for t in seq.step_times(g, 0.0, O, 16):
        if rr.random() < 0.13:
            s = X.data_chirp(2, seed=int(rr.integers(1 << 20))) if rr.random() < 0.5 else \
                X.glitch(0.06, 'digital', seed=int(rr.integers(1 << 20)))
            gp.add(s, t, pan=float(rr.uniform(-0.8, 0.8)))
    # wobble bass (drop): legato line, filter LFO automation
    bs = m.track('bass', level=LV['bass'] + 0.5)
    evs = []
    for a, b_, v, s in f.segments(Dp, O):
        evs.append((a - Dp, b_ - a, f.bass_at(a, 1) + 12, 0.95, False))
    if evs:
        line = S.mono_line(evs, kind='saw', osc2='square', osc2_semi=-12, osc2_level=0.6, cutoff=900, res=0.35,
                           fenv=(0.001, 0.2, 0.6, 0.1), fenv_amt=0.5, env=(0.003, 0.1, 0.95, 0.06), drive=2.5, sub=0.4)
        bs.add(line, Dp)
        pts = []
        t = Dp
        i = 0
        while t < O:
            rate = 8 if ((t - Dp) // f.bar) % 2 == 0 else 16
            pts += [(t, 250), (t + f.bar / rate * 0.35, 3200 if i % 2 == 0 else 1800)]
            t += f.bar / rate
            i += 1
        bs.automate('lpf', pts + [(O, 300), (E, 300)])
        bs.duck(by='kick', depth=5, release=0.1)
    # chord chops
    ch = m.track('chops', level=LV['chords'] - 1, sends={'delay8': -12, 'plate': -14}, pan=0.1)
    for a, b_, v, s in f.segments(0.0, O):
        c = S.pad(v, b_ - a, 0.8, '80s', attack=0.005, release=0.1, chorus=False)
        c = Sound(FX.trance_gate(c.data, 'x.xx..x.x.xx.x..', f.bpm, 16, attack=0.001, release=0.02, t0=a - Dp))
        ch.add(c, a)
    ch.automate('lpf', f.curve(1200, 16000))
    ch.add(S.pad(f.chord_at(O), 1.2, 0.8, '80s', attack=0.005, release=0.6), O)
    # glitch regions on the whole music group
    mg = m.group('music')
    if Dp - B >= f.beat:
        mg.region('stutter', Dp - f.beat, f.beat / 2, slice=f.bar / 16)
        mg.region('stutter', Dp - f.beat / 2, f.beat / 2, slice=f.bar / 32, pitch_step=1.0)
    for b in f.bars(Dp, O):
        t0 = b + f.bar - f.beat / 2
        if Dp < t0 < O - 0.05 and t0 + f.beat / 2 <= O + 1e-6:
            mg.region('stutter', t0, f.beat / 2, slice=f.bar / 32, decay_db=-1.0)
        t1 = b + 1.5 * f.beat
        if Dp < t1 < O - f.beat:
            mg.region('bitcrush', t1, f.beat / 4, bits=5, rate=5000)
    ts = O + 0.45 * (E - O)
    if E - ts > 0.5:
        mg.region('tape_stop', ts, min(0.8, E - ts - 0.1))
    m.track('crash', level=LV['crash']).add(D.crash(0.9), Dp)
    m['crash'].add(D.crash(0.7), O)
    return m
