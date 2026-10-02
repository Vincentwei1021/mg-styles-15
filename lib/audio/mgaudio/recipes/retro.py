"""Retro recipes: synthwave (outrun), darksynth (cyber/HUD), vaporwave, chiptune."""
from __future__ import annotations

import numpy as np

from ..core import Sound, ns, layer, fade
from .. import synth as S, drums as D, sfx as X, fx as FX, filters as F, fm as FM, chip as C, seq
from ..mix import Mix
from .base import Form, LV, new_mix, bass_events, comp_events, chord_tone_melody, place_notes, place_segments


def _transition(m, f, riser='noise', reverse=True, crash=True, riser_level=None, crash_level=None, rev_len=1.4,
                gap=0.035):
    """Standard into-the-drop FX: riser over the build, reverse cymbal, crash on the drop.  Riser and reverse
    cymbal end `gap` s before the drop (a breath the ear doesn't hear as silence, but it keeps the drop's
    transient clean and detectable)."""
    rl = riser_level if riser_level is not None else LV['riser'] - 2.0
    if riser and f.drop - f.build > 0.3:
        d = f.drop - f.build - gap
        m.track('riser', level=rl, sends={'hall': -14}).add(X.riser(d, riser, seed=3), f.drop - gap)
    if reverse and f.drop > 0.6:
        m.track('revcym', level=rl - 1.5).add(X.reverse_cymbal(min(rev_len, f.drop - 0.05)), f.drop - gap)
    if crash:
        m.track('crash', level=crash_level or LV['crash'] + 1.5, sends={'hall': -16}).add(D.crash(0.95), f.drop)


def _drums_basic(m, f, k, kick='x...x...x...x...', snare='....x.......x...', hat=None, ohat=None,
                 t0=None, t1=None, lv=None):
    t0 = f.drop if t0 is None else t0
    t1 = f.outro if t1 is None else t1
    lv = lv or {}
    if kick:
        m.track('kick', level=lv.get('kick', LV['kick'])).loop(k['kick'], kick, t0, t1)
    if snare:
        m.track('snare', level=lv.get('snare', LV['snare']), sends={'plate': -18}).loop(k['snare'], snare, t0, t1)
    if hat:
        m.track('hat', level=lv.get('hat', LV['hat']), pan=0.15).loop(k['hat'], hat, t0, t1)
    if ohat:
        m.track('ohat', level=lv.get('ohat', LV['ohat']), pan=-0.15).loop(k['ohat'], ohat, t0, t1)


# ============================================================================ SYNTHWAVE
def synthwave(duration=10.0, bpm=None, key='A', mode='minor', prog='i VI III VII', drop=None, build=None,
              outro=None, hits=(), energy=None, music_level=-20.0, sfx_duck=3.0, lead=True, final=None, **kw):
    """Outrun synthwave: gated-reverb snare, 4-on-the-floor, 16th saw arpeggio w/ dotted-8th ping-pong,
    8th-note saw bass, Juno-chorused poly pad (all sidechained to the kick), 80s saw/pulse lead with glide,
    Simmons tom fill, tape warmth.  bpm range 84-118 (default 100)."""
    f = Form(duration, bpm, drop, build, outro, hits, energy, key, mode, prog, **{**dict(chord_beats=4, octave=4), **kw},
             final=final, bpm_default=100, bpm_range=(84, 118))
    m = new_mix(f, music_level, sfx_duck, master=dict(warmth=1.5))
    g = m.grid
    k = D.kit('synthwave')
    B, Dp, O, E = f.build, f.drop, f.outro, f.end
    # ---- drums
    _drums_basic(m, f, k, hat='x.x.x.x.x.x.x.x.', ohat='..............x.')
    m['hat'].loop(lambda v: D.hat('closed', v * 0.55), '.x.x.x.x.x.x.x.x', Dp, O)
    if B < Dp:
        m['kick'].loop(k['kick'], 'x.......x.......', B, Dp)
        roll_end = Dp - f.beat
        m['snare'].hits(lambda v: D.snare('tight', v), seq.roll(B, roll_end, 8, 16, g, 0.25, 0.7))
        tt = m.track('tom', level=LV['tom'], sends={'hall': -12})
        for i, p in enumerate(['high', 'high', 'mid', 'low']):
            tt.add(D.tom(p, 0.85 + 0.05 * i, 'synth'), roll_end + i * f.beat / 4, pan=0.4 - 0.25 * i)
    m['kick'].add(k['kick'](1.0), O)
    _transition(m, f, riser='noise')
    m['crash'].add(D.crash(0.8), O)
    # ---- bass: driving 8ths, octave kick on the last 8th
    bs = m.track('bass', level=LV['bass'])
    place_notes(bs, lambda n, d, v: S.bass(n, d, v, 'saw80s'), bass_events(f, g, B, O, 'r.r.r.r.r.r.r.o.', vel=0.85))
    bs.add(S.bass(f.bass_at(O), min(1.6 * f.beat * 2, E - O), 0.9, 'saw80s'), O)
    bs.automate('gain', [(0, -5), (Dp - 0.01, -5), (Dp, 0), (E, 0)])
    bs.duck(by='kick', depth=5, release=0.14)
    # ---- arp (16ths, two octaves up/down), filter opens with the energy curve
    ar = m.track('arp', level=LV['arp'], sends={'delay': -9, 'plate': -15}, pan=0.1)
    ev = seq.arp(g, lambda t: f.chord_at(t, 12), 0.0, O, div=16, pattern='updown', octaves=1, gate=0.5,
                 vel=0.8, accents='x...x...x.x.x...')
    place_notes(ar, lambda n, d, v: S.pluck(n, d, v, 'saw'), ev)
    ar.automate('lpf', f.curve(700, 16000))
    ar.duck(by='kick', depth=3, release=0.12)
    # ---- pad
    pd = m.track('pad', level=LV['pad'], sends={'hall': -10})
    place_segments(pd, f, 0.0, E, lambda v, d: S.pad(v, d, 0.8, '80s', attack=0.12 if d < 3 else 0.35))
    pd.automate('lpf', f.curve(1100, 14000))
    pd.duck(by='kick', depth=4, release=0.2)
    # ---- lead hook in the drop
    if lead and O - Dp > f.bar * 0.75:
        ld = m.track('lead', level=LV['lead'], sends={'delay': -8, 'hall': -12}, pan=-0.05)
        ev = chord_tone_melody(f, g, Dp, O, rhythm=(3, 1, 2, 2), order=('top', 'mid', 'low', 'mid'), octave=5, div=8)
        prev = None
        for t, n, d, v in ev:
            ld.add(S.lead(n, d, v, '80s', glide_from=prev), t)
            prev = n
        ld.add(S.lead(72 + f.root_pc(O), min(E - O, 1.4 * f.bar), 0.8, '80s', glide_from=prev), O)
    return m


# ============================================================================ DARKSYNTH / CYBER
def darksynth(duration=10.0, bpm=None, key='D', mode='phrygian', prog='i bII i bVII', drop=None, build=None,
              outro=None, hits=(), energy=None, music_level=-20.0, sfx_duck=3.0, final=None, **kw):
    """Darksynth / cyberpunk (HUD, FUI): pulsing 16th ladder-saw bass heavily sidechained, reese sub,
    huge gated snare, driven kick, brass stabs on accents, 16th square arp with delay, dark driven pad.
    Phrygian minor (bII) colour.  bpm range 96-124 (default 110)."""
    f = Form(duration, bpm, drop, build, outro, hits, energy, key, mode, prog, **{**dict(chord_beats=4, octave=4), **kw},
             final=final, bpm_default=110, bpm_range=(96, 124))
    m = new_mix(f, music_level, sfx_duck, master=dict(warmth=2.0, air=1.5))
    g = m.grid
    k = D.kit('synthwave')
    B, Dp, O, E = f.build, f.drop, f.outro, f.end
    kick = lambda v=1.0: D.kick('techno', v, decay=0.45)
    m.track('kick', level=LV['kick']).loop(kick, 'x...x...x...x...', Dp, O)
    m['kick'].add(kick(1.0), O)
    m.track('snare', level=LV['snare'] + 0.5, sends={'hall': -16}).loop(k['snare'], '....x.......x...', Dp, O)
    m.track('hat', level=LV['hat'] + 1.5, pan=0.2).loop(lambda v: D.hat('closed', v, tune=1.1), 'XxxxXxxxXxxxXxxx',
                                                       Dp, O, vel=0.7, vel_jitter=0.12)
    m.track('ohat', level=LV['ohat'] + 1, pan=-0.25).loop(lambda v: D.hat('open', v, decay=0.18), '..x...x...x...x.',
                                                         Dp, O)
    m.track('ride', level=LV['crash'] - 1.5, pan=0.35).loop(lambda v: D.cymbal('ride', v, decay=1.0), 'x...x...x...x...',
                                                            Dp, O, vel=0.7)
    if B < Dp:
        m['kick'].loop(kick, 'x...x...x...x...', B, Dp, vel=0.8)
        m['snare'].hits(lambda v: D.snare('tight', v), seq.roll(B + (Dp - B) / 2, Dp - 0.02, 8, 32, g, 0.3, 0.9))
    _transition(m, f, riser='hybrid')
    m['crash'].add(D.crash(0.8), O)
    # pulsing bass: 16ths with velocity accents; ladder filter follows energy
    bs = m.track('bass', level=LV['bass'] - 0.5)
    ev = bass_events(f, g, 0.0, O, 'RrrrRrrrRrrrRrro', vel=0.75, gate=0.7)
    place_notes(bs, lambda n, d, v: S.voice(n, d, v, 'saw', 'saw', 0, 12, 0.7, cutoff=300 + 500 * v, res=0.3,
                                            fenv=(0.001, 0.09, 0.1, 0.05), fenv_amt=2.2,
                                            env=(0.001, 0.08, 0.7, 0.03), drive=2.0, drift=1), ev)
    bs.automate('lpf', f.curve(350, 12000))
    bs.automate('gain', [(0, -4), (B, -3), (Dp - 0.01, -1), (Dp, 0), (E, 0)])
    bs.duck(by='kick', depth=8, release=0.13, shape=2.5)
    sub = m.track('sub', level=LV['sub'] - 2)
    for a, b_, v, s in f.segments(Dp, E):
        sub.add(S.bass(f.bass_at(a, 2), b_ - a, 0.8, 'sub'), a)
    sub.duck(by='kick', depth=9, release=0.16)
    # brass stabs
    st = m.track('stab', level=LV['chords'], sends={'hall': -10})
    place_notes(st, lambda n, d, v: S.stab(n, d, v, 'brass'), comp_events(f, g, Dp, O, 'X.........x.....', vel=0.9))
    st.add(S.stab(f.chord_at(O), 1.5, 0.95, 'brass'), O)
    # arp
    ar = m.track('arp', level=LV['arp'] + 0.5, sends={'delay': -8, 'hall': -16}, pan=-0.2)
    ev = seq.arp(g, lambda t: f.chord_at(t, 24), B, O, div=16, pattern='up', octaves=1, gate=0.35, vel=0.7)
    place_notes(ar, lambda n, d, v: S.pluck(n, d, v, 'square'), ev)
    ar.duck(by='kick', depth=4, release=0.1)
    # pad
    pd = m.track('pad', level=LV['pad'] - 1, sends={'hall': -9})
    place_segments(pd, f, 0.0, E, lambda v, d: S.pad(v, d, 0.75, 'dark'))
    pd.duck(by='kick', depth=5, release=0.2)
    return m


# ============================================================================ VAPORWAVE
def vaporwave(duration=10.0, bpm=None, key='F', mode='major', prog='IVmaj7 iii7 ii9 Imaj7', drop=None, build=None,
              outro=None, hits=(), energy=None, music_level=-20.0, sfx_duck=2.5, slow=4, tape_stop=True, final='Imaj9',
              **kw):
    """Vaporwave: a smooth-jazz / mall-muzak loop (FM e-piano maj7/9 chords, fretless-ish bass, soft drums)
    rendered `slow` semitones sharp and then SLOWED (speed & pitch drop, like a pitched-down tape), chopped
    (buffer-repeat stutters), wow/flutter, low-passed, drenched in hall reverb; tape-stop ending.
    bpm (after slowing) range 60-90 (default 72)."""
    ratio = 2 ** (-slow / 12)                 # playback speed
    f = Form(duration, bpm, drop, build, outro, hits, energy, key, mode, prog, **{**dict(chord_beats=4, octave=4), **kw},
             final=final, bpm_default=72, bpm_range=(60, 90))
    m = new_mix(f, music_level, sfx_duck, master=dict(warmth=1.0))
    from .. import theory as T
    # source form at the faster tempo, transposed up; times scale by `ratio`
    tsrc = lambda t: t * ratio
    src_key = T.NAMES_SHARP[(T.pc(key) + slow) % 12]
    fs = Form(duration * ratio + 0.5, f.bpm / ratio, f.drop * ratio, f.build * ratio, f.outro * ratio, (), None,
              src_key, mode, prog, **{**dict(chord_beats=4, octave=4), **kw}, final=final)
    src = new_mix(fs, None, 0)
    gs = src.grid
    B, Dp, O, E = fs.build, fs.drop, fs.outro, fs.end
    ep = src.track('keys', level=LV['keys'], sends={'room': -14})
    # chopped comping: 1, &2 (push), 4-and ... classic mall-jazz
    for t, v, d, vel in comp_events(fs, gs, 0.0, O, 'X-----x---x---x-', vel=0.75, gate=0.96):
        ep.add(_ep_chord(v, d, vel), t)
    ep.add(_ep_chord(fs.chord_at(O), 2.8, 0.8), O)
    bs = src.track('bass', level=LV['bass'] - 1)
    place_notes(bs, lambda n, d, v: FM.bass(n, d, v, 'wood'),
                bass_events(fs, gs, B, O, 'R-----r---f-p---', octave=2, vel=0.85, gate=0.95))
    bs.add(FM.bass(fs.bass_at(O), 2.0, 0.85, 'wood'), O)
    k = D.kit('lofi')
    src.track('kick', level=LV['kick'] - 1).loop(k['kick'], 'x.....x...x.....', Dp, O)
    src.track('snare', level=LV['snare'], sends={'hall': -6}).loop(lambda v: D.snare('fat', v), '....x.......x...', Dp, O)
    src.track('hat', level=LV['hat'] - 2).loop(lambda v: D.hat('closed', v), 'x.x.x.x.x.x.x.x.', B, O, vel=0.6)
    src.track('crash', level=LV['crash']).add(D.crash(0.8), Dp)
    src['kick'].add(k['kick'](1.0), O)
    raw = src.render()
    slowed = FX.repitch(raw, ratio)[:, :ns(duration)]
    slowed = np.pad(slowed, ((0, 0), (0, max(0, ns(duration) - slowed.shape[1]))))
    y = FX.wow_flutter(slowed, wow=0.7, flutter=0.12, wow_rate=0.45, seed=4)
    y = F.lpf(y, 7200, 2)
    y = FX.chorus(y, rate=0.35, depth_ms=2.0, mix=0.35)
    y = FX.saturate(y, 3, 'tape')
    tr = m.track('tape', level=-20, sends={'big': -5})
    tr.add(Sound(y), 0.0)
    # the chop: repeat half a beat into the drop and a quarter-beat stutter mid-drop
    if f.drop - f.build > f.beat:
        tr.region('stutter', f.drop - f.beat, f.beat, slice=f.beat / 2)
    if f.outro - f.drop > f.bar:
        tr.region('stutter', f.drop + f.bar - f.beat / 2, f.beat / 2, slice=f.beat / 4, decay_db=-1.5)
    if tape_stop:
        Ef = f.end
        ts = min(max(f.outro + 0.45 * (Ef - f.outro), Ef - 1.3), Ef - 0.55)
        tr.region('tape_stop', ts, min(1.0, Ef - ts - 0.12))
    m.track('hiss', level=LV['texture'] + 4).add(X.vhs_noise(duration, hum=False, seed=2), 0.0)
    return m


def _ep_chord(notes, dur, vel):
    parts = [(FM.epiano(n, dur, vel * (0.9 if i else 1.0), bright=0.35, release=0.5), 0.006 * i)
             for i, n in enumerate(sorted(notes))]
    s = layer(parts)
    return Sound(s.data / np.sqrt(len(notes)) * 1.3)


# ============================================================================ CHIPTUNE
def chiptune(duration=10.0, bpm=None, key='C', mode='major', prog='I V vi IV', drop=None, build=None, outro=None,
             hits=(), energy=None, music_level=-20.0, sfx_duck=3.0, final=None, **kw):
    """NES/GameBoy chiptune: 25% pulse lead w/ vibrato + echo channel, 12.5% pulse 60 Hz arpeggio chords,
    triangle bass (octave 8ths), LFSR noise drums, power-up arpeggio build, 'stage clear' cadence outro.
    bpm range 120-170 (default 150)."""
    f = Form(duration, bpm, drop, build, outro, hits, energy, key, mode, prog, **{**dict(chord_beats=4, octave=4), **kw},
             final=final, bpm_default=150, bpm_range=(120, 170))
    m = new_mix(f, music_level, sfx_duck, master=dict(mono_bass=200))
    m.group('music').fx = [lambda x: F.peak_eq(x, 3300, -3.0, 0.7)]   # tame square-wave presence (2-5 kHz)
    g = m.grid
    B, Dp, O, E = f.build, f.drop, f.outro, f.end
    st = f.bar / 16
    # triangle bass: root/octave 8ths
    tri = m.track('tri', level=LV['bass'] - 1)
    for t, n, d, v in bass_events(f, g, B, O, 'r.o.r.o.r.o.r.o.', octave=3, vel=0.9, gate=0.8):
        tri.add(C.triangle(n, d, 0.9), t)
    tri.add(C.triangle(f.bass_at(O, 3), min(0.9, E - O - 0.1), 0.9), O)
    # arpeggio chords (pulse 12.5%, fast 3-note frame arp) on 8ths: the classic "fake chord"
    ap = m.track('arp', level=LV['arp'], pan=-0.35)
    for t, v, d, vel in comp_events(f, g, 0.0, O, 'x-x-x-x-x-x-x-x-', vel=0.7, gate=0.85):
        ap.add(C.arp_chord([n + 12 for n in v[:3]], d, 0.125, 60, vel), t)
    # lead melody: chord-tone hook with pentatonic passing, 25% pulse + echo channel
    ld = m.track('lead', level=LV['lead'], pan=0.1)
    echo = m.track('echo', level=LV['lead'] - 9, pan=0.45)
    ev = chord_tone_melody(f, g, Dp, O, rhythm=(2, 1, 1, 2, 2), order=('top', 'mid', 'up', 'mid', 'low'),
                           octave=5, div=8, legato=0.9)
    for t, n, d, v in ev:
        s = C.pulse(n, d, 0.25, 0.8, env='sustain', vib=0.25, vib_delay=0.12)
        ld.add(s, t)
        echo.add(s, t + 3 * st)
    # build: power-up style rising arpeggio + noise snare roll
    if Dp - B > 0.2:
        pu = m.track('rise', level=LV['lead'] - 3, pan=0.1)
        nsteps = int(round((Dp - B) / st))
        pool = sorted(set(f.chord_at(B, 12)))
        for i in range(nsteps):
            n = pool[i % len(pool)] + 12 * (i // len(pool))
            while n > 100:
                n -= 12
            pu.add(C.pulse(n, st * 0.9, 0.5, 0.6 + 0.3 * i / nsteps, env='pluck'), B + i * st)
        nz = m.track('noise', level=LV['snare'])
        nz.hits(lambda v: C.snare(v), seq.roll(B, Dp - 0.01, 8, 16, g, 0.4, 0.9))
    # drums
    m.track('kick', level=LV['kick'] - 1).loop(lambda v: C.kick(v), 'x.......x.x.....', Dp, O)
    m.track('snare', level=LV['snare']).loop(lambda v: C.snare(v), '....x.......x...', Dp, O)
    m.track('hat', level=LV['hat'], pan=0.3).loop(lambda v: C.hat(v), 'x.x.x.x.x.x.x.xx', Dp, O, vel=0.7)
    m.track('crash', level=LV['crash'] + 2).add(C.crash(0.8), Dp)
    # outro: stage-clear cadence (triplet run into the tonic)
    fa = m.track('fanfare', level=LV['lead'] - 1)
    ton = f.chord_at(O, 12)
    run = [ton[0], ton[1 % len(ton)], ton[2 % len(ton)], ton[0] + 12]
    tr = f.beat / 3
    for i, n in enumerate(run):
        L = tr * 0.9 if i < 3 else min(E - O - 3 * tr - 0.05, 1.2)
        fa.add(C.pulse(n, L, 0.5, 0.85, env='sustain' if i == 3 else 'pluck', vib=0.3 if i == 3 else 0), O + i * tr)
    m['kick'].add(C.kick(1.0), O + 3 * tr)
    m['crash'].add(C.crash(0.7), O + 3 * tr)
    return m
