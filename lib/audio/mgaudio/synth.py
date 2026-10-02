"""Subtractive / virtual-analog synth: generic voice + presets (leads, pads, plucks, stabs, basses,
808, supersaw), a legato mono-line engine (glide/slide) and a TB-303 style acid line."""
from __future__ import annotations

import numpy as np

from .core import SR, Sound, ns, adsr, amp, rng, to_stereo, fade, lfo, pan_mono
from .theory import hz, midi, mtof
from . import osc as O
from . import filters as F
from . import fx as FX


def _voices(kind, f, n, unison, detune, spread, seed, pw):
    if unison > 1:
        return O.unison(kind, f, n, unison, detune, spread, seed=seed, pw=pw)
    r = rng(seed)
    s = O.wave(kind, f, phase=r.random() if kind != 'sine' else 0.0, pw=pw)
    return np.stack([s, s])


def voice(note, dur, vel=0.9, osc='saw', osc2=None, osc2_semi=0.0, osc2_cents=7.0, osc2_level=0.7,
          unison=1, detune=18.0, spread=0.7, sub=0.0, sub_wave='sine', noise=0.0, pw=0.5, pwm=0.0,
          cutoff=2000.0, res=0.15, filt='ladder', fenv=(0.002, 0.3, 0.25, 0.3), fenv_amt=2.0,
          key_track=0.5, vel_cutoff=0.6, env=(0.004, 0.25, 0.8, 0.25), glide_from=None, glide=0.06,
          vib_rate=0.0, vib_cents=0.0, vib_delay=0.25, drive=1.0, pitch_env=None, hp=None, tail=0.0,
          drift=3.0, seed=None, freq=None):
    """Generic analog-style voice -> stereo Sound.

    osc/osc2: 'saw' 'square' 'pulse' 'tri' 'sine'.  fenv/env = (a, d, s, r) seconds/level.
    fenv_amt in octaves.  pitch_env=(semitones, time) initial pitch drop.  filt: 'ladder'|'svf'|None."""
    a, d, s, r = env
    total = dur + r + tail
    n = ns(total)
    if freq is None:
        f = O.pitch_curve(note, n, glide_from=glide_from, glide=glide, vib_rate=vib_rate, vib_cents=vib_cents,
                          vib_delay=vib_delay, drift_cents=drift, seed=seed)
    else:
        f = np.asarray(freq, dtype=np.float64)[:n]
        if f.shape[0] < n:
            f = np.pad(f, (0, n - f.shape[0]), mode='edge')
    if pitch_env is not None:
        semis, tpe = pitch_env
        f = f * 2 ** (semis * np.exp(-np.arange(n) / (SR * tpe)) / 12)
    pwa = pw + pwm * 0.5 * lfo(n, 0.7, 'tri') if pwm else pw
    st = _voices(osc, f, n, unison, detune, spread, seed, pwa)
    if osc2:
        f2 = f * 2 ** ((osc2_semi + osc2_cents / 100) / 12)
        st = st + osc2_level * _voices(osc2, f2, n, unison, detune, spread,
                                       None if seed is None else seed + 1, pwa)
    if sub:
        sb = O.wave(sub_wave, f / 2, pw=0.5)
        st = st + sub * np.stack([sb, sb])
    if noise:
        nz = rng(seed).standard_normal(n) * 0.3
        st = st + noise * np.stack([nz, nz])
    # filter
    if filt:
        fe = adsr(dur, *fenv, total=total)
        kt = (f / 261.6) ** key_track
        vc = (0.35 + 0.65 * vel) ** vel_cutoff
        fc = np.clip(cutoff * kt * vc * 2 ** (fenv_amt * fe), 20, 20000)
        if filt == 'ladder':
            st = F.ladder(st, fc, res, drive=drive)
        else:
            st = F.svf(st, fc, 0.707 + res * 6, 'lp')
    elif drive > 1:
        st = FX.saturate(st, 20 * np.log10(drive))
    if hp:
        st = F.hpf(st, hp)
    e = adsr(dur, a, d, s, r, total=total)
    out = st * e * vel * 0.5
    return Sound(fade(out, 0.0005, 0.004))


# ----------------------------------------------------------------------------- polyphony helper
def poly(notes, dur, fn, vel=0.9, strum=0.0, **kw):
    """Play several notes with voice function fn(note, dur, vel, **kw) -> summed stereo Sound.
    strum: seconds between successive notes (guitar-like)."""
    parts = []
    for i, nt in enumerate(notes):
        s = fn(nt, dur - i * strum if strum else dur, vel, **kw)
        parts.append((s, i * strum))
    from .core import layer
    out = layer(parts)
    return Sound(out.data / np.sqrt(max(1, len(notes))) * 1.2, 0.0)


# ----------------------------------------------------------------------------- presets
def lead(note, dur, vel=0.9, kind='saw', glide_from=None, vib=True, seed=None):
    """Lead synths: 'saw' (bright 2-osc), '80s' (Jupiter-ish), 'square', 'soft' (flute-like), 'sync',
    'chip' (thin pulse)."""
    v = dict(vib_rate=5.4, vib_cents=14 if vib else 0, vib_delay=0.28)
    if kind == 'saw':
        return voice(note, dur, vel, 'saw', 'saw', 0, 9, 0.8, cutoff=2600, res=0.2, fenv=(0.003, 0.35, 0.4, 0.3),
                     fenv_amt=1.4, env=(0.006, 0.3, 0.85, 0.22), glide_from=glide_from, drive=1.3, seed=seed, **v)
    if kind == '80s':
        return voice(note, dur, vel, 'saw', 'pulse', 12, 4, 0.35, unison=3, detune=10, spread=0.5, cutoff=3000,
                     res=0.18, fenv=(0.01, 0.4, 0.5, 0.3), fenv_amt=1.0, env=(0.01, 0.3, 0.85, 0.35),
                     glide_from=glide_from, pw=0.3, seed=seed, **v)
    if kind == 'square':
        return voice(note, dur, vel, 'pulse', 'pulse', 0, 6, 0.6, pw=0.5, cutoff=2400, res=0.1,
                     fenv=(0.002, 0.2, 0.5, 0.2), fenv_amt=1.0, env=(0.004, 0.15, 0.8, 0.15),
                     glide_from=glide_from, seed=seed, **v)
    if kind == 'soft':
        return voice(note, dur, vel, 'tri', 'sine', 12, 0, 0.25, filt='svf', cutoff=2400, res=0.0,
                     fenv_amt=0.3, env=(0.03, 0.2, 0.85, 0.3), glide_from=glide_from, seed=seed, **v)
    if kind == 'sync':
        # faux hard-sync sweep: bright pulse with fast filter sweep & drive
        return voice(note, dur, vel, 'saw', 'square', 7, 0, 0.5, cutoff=1800, res=0.35,
                     fenv=(0.001, 0.18, 0.35, 0.2), fenv_amt=3.2, env=(0.002, 0.2, 0.8, 0.2),
                     glide_from=glide_from, drive=2.0, seed=seed, **v)
    if kind == 'chip':
        return voice(note, dur, vel, 'pulse', None, pw=0.25, filt=None, env=(0.002, 0.05, 0.9, 0.06),
                     glide_from=glide_from, drift=0, seed=seed, **v)
    raise ValueError(kind)


def pluck(note, dur=0.4, vel=0.9, kind='saw', seed=None):
    """Plucks: 'saw' (classic), 'future' (supersaw pluck), 'soft' (round), 'house' (organ-ish),
    'square' (hollow), 'bell' (bright w/ fm-ish)."""
    if kind == 'saw':
        return voice(note, dur, vel, 'saw', 'saw', 0, 8, 0.7, cutoff=380, res=0.25, fenv=(0.001, 0.22, 0.0, 0.2),
                     fenv_amt=4.4, env=(0.001, 0.45, 0.0, 0.25), key_track=0.7, seed=seed)
    if kind == 'future':
        return voice(note, dur, vel, 'saw', None, unison=6, detune=24, spread=0.9, cutoff=500, res=0.2,
                     fenv=(0.001, 0.18, 0.05, 0.2), fenv_amt=4.5, env=(0.001, 0.35, 0.12, 0.3), key_track=0.6,
                     seed=seed)
    if kind == 'soft':
        return voice(note, dur, vel, 'tri', 'saw', 12, 3, 0.2, filt='svf', cutoff=900, res=0.0,
                     fenv=(0.001, 0.15, 0.0, 0.2), fenv_amt=2.2, env=(0.002, 0.5, 0.0, 0.3), key_track=0.5,
                     seed=seed)
    if kind == 'square':
        return voice(note, dur, vel, 'pulse', 'pulse', 12, 5, 0.3, pw=0.5, cutoff=600, res=0.3,
                     fenv=(0.001, 0.12, 0.0, 0.15), fenv_amt=3.5, env=(0.001, 0.3, 0.0, 0.2), seed=seed)
    if kind == 'house':
        return voice(note, dur, vel, 'square', 'saw', 12, 0, 0.5, cutoff=700, res=0.3,
                     fenv=(0.001, 0.12, 0.1, 0.1), fenv_amt=3.0, env=(0.001, 0.2, 0.2, 0.1), seed=seed)
    if kind == 'bell':
        from .fm import bell
        return bell(note, dur, vel, kind='pluck')
    raise ValueError(kind)


def pad(notes, dur, vel=0.8, kind='warm', attack=None, release=None, seed=None, chorus=True):
    """Pads (poly): 'warm', 'strings', '80s', 'dark', 'choir', 'air', 'glass' -> stereo Sound."""
    notes = [notes] if np.ndim(notes) == 0 and not isinstance(notes, (list, tuple)) else list(notes)
    r = rng(seed)
    if kind == 'glass':
        from .fm import glass_pad
        return glass_pad(notes, dur, vel, attack=attack or 0.6, release=release or 1.5)
    if kind == 'air':
        return _air_pad(notes, dur, vel, attack or 1.0, release or 1.5, seed)
    cfg = {
        'warm': dict(osc='saw', osc2='saw', osc2_cents=11, osc2_level=0.9, cutoff=900, res=0.1,
                     fenv=(0.9, 1.5, 0.6, 1.2), fenv_amt=1.1, env=(0.7, 0.8, 0.9, 1.4), sub=0.25, sub_wave='tri'),
        'strings': dict(osc='saw', unison=3, detune=14, spread=0.8, cutoff=2600, res=0.05,
                        fenv=(0.4, 1.0, 0.7, 1.0), fenv_amt=0.6, env=(0.35, 0.5, 0.9, 0.9), vib_rate=5.2,
                        vib_cents=6, vib_delay=0.4),
        '80s': dict(osc='saw', osc2='pulse', osc2_semi=0, osc2_cents=6, osc2_level=0.7, pw=0.35, pwm=0.3,
                    unison=2, detune=12, cutoff=1700, res=0.15, fenv=(0.25, 1.2, 0.6, 0.8), fenv_amt=0.9,
                    env=(0.18, 0.6, 0.85, 0.9)),
        'dark': dict(osc='saw', osc2='square', osc2_semi=-12, osc2_level=0.5, cutoff=520, res=0.2,
                     fenv=(1.0, 1.5, 0.5, 1.0), fenv_amt=1.2, env=(0.6, 1.0, 0.85, 1.4), drive=1.6),
        'choir': dict(osc='saw', unison=3, detune=9, spread=0.8, cutoff=3200, res=0.0, filt='svf',
                      fenv_amt=0.0, env=(0.45, 0.6, 0.9, 1.1), vib_rate=4.8, vib_cents=9, vib_delay=0.3),
    }[kind]
    if attack is not None or release is not None:
        e = list(cfg['env'])
        if attack is not None:
            e[0] = attack
        if release is not None:
            e[3] = release
        cfg['env'] = tuple(e)
    parts = []
    from .core import layer
    for i, nt in enumerate(notes):
        s = voice(nt, dur, vel, seed=int(r.integers(1 << 30)), **cfg)
        parts.append((s, 0.0))
    out = layer(parts).data / np.sqrt(len(notes))
    if kind == 'choir':
        out = F.formant(out, 'a', q=6, mix=0.85)
    out = F.hpf(out, 90)
    if chorus:
        out = FX.chorus(out, rate=0.5, depth_ms=2.5, mix=0.5)
    return Sound(out)


def _air_pad(notes, dur, vel, attack, release, seed):
    n = ns(dur + release)
    r = rng(seed)
    out = np.zeros((2, n))
    for nt in notes:
        f = hz(nt)
        for k, a in [(1, 1.0), (2, 0.35), (3, 0.12)]:
            for ch in range(2):
                ph = r.random() * 6.28
                det = 1 + (r.random() - 0.5) * 0.004
                out[ch] += a * np.sin(2 * np.pi * f * k * det * np.arange(n) / SR + ph)
        nz = r.standard_normal((2, n)) * 0.3
        out += 0.6 * F.bpf(nz, f * 2, q=18)
    e = adsr(dur, attack, 0.5, 0.9, release, total=dur + release)
    out = out * e * vel * 0.18 / np.sqrt(len(notes))
    return Sound(FX.chorus(out, 0.3, 3, mix=0.5))


def supersaw(notes, dur, vel=0.85, voices=7, detune=22.0, cutoff=5500.0, env=(0.003, 0.3, 0.8, 0.35),
             fenv_amt=0.6, seed=None, hp=150):
    """Big stereo supersaw chord (future-bass / trance)."""
    notes = [notes] if np.ndim(notes) == 0 and not isinstance(notes, (list, tuple)) else list(notes)
    r = rng(seed)
    from .core import layer
    parts = [(voice(nt, dur, vel, 'saw', None, unison=voices, detune=detune, spread=1.0, cutoff=cutoff, res=0.08,
                    filt='svf', fenv=(0.001, 0.4, 0.5, 0.3), fenv_amt=fenv_amt, env=env, key_track=0.2,
                    seed=int(r.integers(1 << 30))), 0.0) for nt in notes]
    out = layer(parts).data / np.sqrt(len(notes))
    return Sound(F.hpf(out, hp))


def stab(notes, dur=0.3, vel=0.9, kind='dub', seed=None):
    """Chord stabs: 'dub' (minimal techno), 'rave' (90s), 'brass' (80s), 'organ' (house)."""
    notes = [notes] if np.ndim(notes) == 0 and not isinstance(notes, (list, tuple)) else list(notes)
    if kind == 'dub':
        return poly(notes, dur, voice, vel, osc='saw', osc2='square', osc2_semi=0, osc2_cents=5, osc2_level=0.5,
                    cutoff=500, res=0.35, fenv=(0.001, 0.12, 0.05, 0.1), fenv_amt=3.0,
                    env=(0.001, 0.18, 0.15, 0.12), seed=seed)
    if kind == 'rave':
        return poly(notes, dur, voice, vel, osc='saw', unison=5, detune=30, cutoff=1500, res=0.25,
                    fenv=(0.001, 0.2, 0.3, 0.2), fenv_amt=2.2, env=(0.001, 0.2, 0.6, 0.2), drive=1.5, seed=seed)
    if kind == 'brass':
        return poly(notes, dur, voice, vel, osc='saw', osc2='saw', osc2_cents=8, cutoff=600, res=0.1,
                    fenv=(0.06, 0.3, 0.5, 0.2), fenv_amt=2.2, env=(0.02, 0.2, 0.85, 0.2), unison=2, detune=8,
                    seed=seed)
    if kind == 'organ':
        def org(nt, d, v, **k):
            nn = ns(d + 0.08)
            f = hz(nt)
            y = O.additive(f, nn, [1.0, 0.8, 0.0, 0.6, 0.0, 0.35, 0.0, 0.25])
            y = F.lpf(y, 5000) * adsr(d, 0.002, 0.1, 0.8, 0.06, total=d + 0.08) * v * 0.3
            return Sound(pan_mono(y, 0))
        return poly(notes, dur, org, vel)
    raise ValueError(kind)


# ----------------------------------------------------------------------------- basses
def bass(note, dur, vel=0.9, kind='analog', glide_from=None, seed=None):
    """Basses: 'analog' (Moog-ish), 'saw80s' (synthwave driving), 'reese' (detuned, dark),
    'sub' (sine + harmonics for phones), 'pluck' (short), 'fm' (see fm.bass), 'square' (hollow)."""
    if kind == 'analog':
        s = voice(note, dur, vel, 'saw', 'square', -12, 0, 0.5, cutoff=260, res=0.25,
                  fenv=(0.001, 0.18, 0.25, 0.1), fenv_amt=2.6, env=(0.002, 0.2, 0.8, 0.08), key_track=0.8,
                  glide_from=glide_from, drive=1.8, drift=1.0, seed=seed)
    elif kind == 'saw80s':
        s = voice(note, dur, vel, 'saw', 'saw', 0, 6, 0.6, cutoff=420, res=0.2,
                  fenv=(0.001, 0.12, 0.2, 0.08), fenv_amt=2.4, env=(0.001, 0.15, 0.7, 0.05), key_track=0.6,
                  glide_from=glide_from, drive=1.5, drift=1.0, seed=seed)
    elif kind == 'reese':
        s = voice(note, dur, vel, 'saw', 'saw', 0, 22, 1.0, unison=2, detune=12, spread=0.3, cutoff=700,
                  res=0.15, fenv=(0.01, 0.4, 0.8, 0.2), fenv_amt=0.6, env=(0.004, 0.2, 0.9, 0.12),
                  glide_from=glide_from, drive=2.2, seed=seed)
    elif kind == 'sub':
        n = ns(dur + 0.06)
        f = O.pitch_curve(note, n, glide_from=glide_from, glide=0.06)
        y = O.sine(f)
        y = np.tanh(2.2 * y) / np.tanh(2.2)          # add 3rd harmonic for small speakers
        y += 0.18 * O.sine(f * 2)
        y *= adsr(dur, 0.004, 0.1, 0.9, 0.06, total=dur + 0.06) * vel * 0.5
        s = Sound(np.stack([y, y]))
    elif kind == 'pluck':
        s = voice(note, dur, vel, 'saw', 'tri', -12, 0, 0.8, cutoff=300, res=0.2,
                  fenv=(0.001, 0.1, 0.0, 0.1), fenv_amt=3.2, env=(0.001, 0.22, 0.2, 0.08), key_track=0.7,
                  glide_from=glide_from, drive=1.4, seed=seed)
    elif kind == 'square':
        s = voice(note, dur, vel, 'pulse', 'sine', -12, 0, 0.6, pw=0.4, cutoff=500, res=0.15,
                  fenv=(0.001, 0.12, 0.3, 0.1), fenv_amt=2.0, env=(0.002, 0.15, 0.8, 0.06),
                  glide_from=glide_from, seed=seed)
    elif kind == 'fm':
        from .fm import bass as fmbass
        return fmbass(note, dur, vel)
    else:
        raise ValueError(kind)
    # keep the low end mono
    return Sound(_mono_lows(s.data))


def _mono_lows(st, f=160):
    lo = F.lpf(st, f, 4)
    hi = st - lo
    m = 0.5 * (lo[0] + lo[1])
    return np.stack([m + hi[0], m + hi[1]])


def b808(note, dur=0.8, vel=0.95, glide_from=None, glide=0.07, drive=0.35, decay=None, punch=0.6, freq=None):
    """Trap 808: sine with pitch punch, long decay, saturation (audible on phones), optional glide."""
    decay = dur if decay is None else decay
    tot = dur + 0.12
    n = ns(tot)
    if freq is None:
        f = O.pitch_curve(note, n, glide_from=glide_from, glide=glide)
    else:
        f = np.asarray(freq)[:n]
        if f.shape[0] < n:
            f = np.pad(f, (0, n - f.shape[0]), mode='edge')
    t = np.arange(n) / SR
    f = f * 2 ** ((punch * 7) * np.exp(-t / 0.018) / 12)
    y = O.sine(f)
    e = np.exp(-t * 6.9 / max(decay * 1.6, 0.05))
    rel = np.clip((tot - t) / 0.1, 0, 1) if dur < decay * 1.6 else 1.0
    gate = np.where(t < dur, 1.0, np.clip(1 - (t - dur) / 0.1, 0, 1))
    y = y * e * gate * (1 - np.exp(-t / 0.0015))
    g = 1 + 9 * drive
    y = np.tanh(g * y) / np.tanh(g)
    # click
    click = F.hpf(np.random.default_rng(3).standard_normal(ns(0.004)) * np.linspace(1, 0, ns(0.004)), 1500)
    y[:click.shape[0]] += click * 0.12 * punch
    y = F.hpf(fade(y, 0.0003, 0.0), 28, 2)
    return Sound(np.stack([y, y]) * vel * 0.55)


# ----------------------------------------------------------------------------- mono legato engine
def mono_line(events, kind='saw', osc2=None, osc2_semi=0.0, osc2_cents=7.0, osc2_level=0.7, pw=0.5,
              cutoff=800.0, res=0.3, fenv=(0.001, 0.25, 0.0, 0.1), fenv_amt=3.0, env=(0.003, 0.2, 0.8, 0.12),
              glide=0.07, vib_rate=0.0, vib_cents=0.0, vib_delay=0.3, drive=1.4, key_track=0.4,
              accent_boost=0.5, accent_decay=0.12, unison=1, detune=12.0, filt='ladder', hp=None, seed=None,
              sub=0.0, bend_depth=None):
    """Monophonic legato phrase.  events: [(t, dur, note, vel, slide), ...] t/dur in seconds, relative.
    slide=True glides from the previous note without retriggering envelopes (303/808/lead legato).
    vel > 1.0 counts as an 'accent' (303 style: louder, snappier filter).  Returns stereo Sound
    whose t=0 is the phrase start."""
    ev = sorted([(e[0], e[1], midi(e[2]), e[3] if len(e) > 3 else 0.9, bool(e[4]) if len(e) > 4 else False)
                 for e in events])
    a, d, s, r = env
    T = max(e[0] + e[1] for e in ev) + r + 0.05
    n = ns(T)
    t = np.arange(n) / SR
    semi = np.zeros(n)
    # pitch path
    for i, (t0, du, m, v, sl) in enumerate(ev):
        i0 = ns(t0)
        i1 = ns(ev[i + 1][0]) if i + 1 < len(ev) else n
        seg = np.full(i1 - i0, m)
        if sl and i > 0:
            pm = ev[i - 1][2]
            tt = np.arange(i1 - i0) / SR
            seg = m + (pm - m) * np.exp(-3.0 * tt / max(glide, 1e-3))
        semi[i0:i1] = seg
    if ev[0][0] > 0:
        semi[:ns(ev[0][0])] = ev[0][2]
    if vib_rate > 0:
        semi += (vib_cents / 100) * np.sin(2 * np.pi * vib_rate * t) * np.clip((t % 1e9 - vib_delay) / 0.3, 0, 1)
    f = 440 * 2 ** ((semi - 69) / 12)
    # legato groups
    groups = []
    for e in ev:
        if e[4] and groups:
            groups[-1].append(e)
        else:
            groups.append([e])
    amp_env = np.zeros(n)
    f_env = np.zeros(n)
    for g in groups:
        g0 = g[0][0]
        gend = max(e[0] + e[1] for e in g)
        gd = gend - g0
        i0 = ns(g0)
        ae = adsr(gd, a, d, s, r, total=gd + r)
        # velocity contour within group
        vc = np.ones(ae.shape[0])
        for e in g:
            k0 = ns(e[0] - g0)
            vc[k0:] = min(e[3], 1.0)
        ae = ae * vc
        m = min(n - i0, ae.shape[0])
        amp_env[i0:i0 + m] = np.maximum(amp_env[i0:i0 + m], ae[:m])
        acc = g[0][3] > 1.0
        fd = accent_decay if acc else fenv[1]
        fe = adsr(gd, fenv[0], fd, fenv[2], fenv[3], total=gd + r) * (1 + accent_boost if acc else 1.0)
        if acc:
            amp_env[i0:i0 + m] *= 1.0 + 0.4 * np.exp(-np.arange(m) / (SR * 0.15))
        mm = min(n - i0, fe.shape[0])
        f_env[i0:i0 + mm] = np.maximum(f_env[i0:i0 + mm], fe[:mm])
    st = _voices(kind, f, n, unison, detune, 0.6, seed, pw)
    if osc2:
        st = st + osc2_level * _voices(osc2, f * 2 ** ((osc2_semi + osc2_cents / 100) / 12), n, unison, detune,
                                       0.6, None if seed is None else seed + 1, pw)
    if sub:
        sb = O.sine(f / 2)
        st = st + sub * np.stack([sb, sb])
    if filt:
        base = F._curve(cutoff, n, log=True)
        fc = np.clip(base * (f / 261.6) ** key_track * 2 ** (fenv_amt * f_env), 20, 19000)
        if filt == 'ladder':
            st = F.ladder(st, fc, res, drive=drive)
        else:
            st = F.svf(st, fc, 0.707 + 6 * res, 'lp')
    if hp:
        st = F.hpf(st, hp)
    y = st * amp_env * 0.5
    return Sound(fade(y, 0.0005, 0.01))


def acid_line(steps, bpm, t0=0.0, div=16, cutoff=320.0, res=0.82, env_mod=2.8, decay=0.28, drive=2.2,
              wave='saw', gate=0.55, tune=0.0, distortion=True, cutoff_curve=None):
    """TB-303 style line.  steps: list of per-step items: None (rest) or (note, accent, slide)
    or note.  cutoff_curve: optional breakpoints [(t, hz)] relative to phrase start for knob sweeps."""
    st = 240.0 / bpm / div
    events = []
    for i, it in enumerate(steps):
        if it is None:
            continue
        if not isinstance(it, (list, tuple)):
            it = (it, False, False)
        note, acc, sl = (list(it) + [False, False])[:3]
        nxt = steps[i + 1] if i + 1 < len(steps) else None
        next_slide = isinstance(nxt, (list, tuple)) and len(nxt) > 2 and nxt[2]
        du = st * (1.02 if next_slide else gate)
        events.append((t0 + i * st, du, midi(note) + tune, 1.25 if acc else 0.8, bool(sl)))
    cc = cutoff if cutoff_curve is None else [(t0 + a, b) for a, b in cutoff_curve]
    s = mono_line(events, kind=wave, cutoff=cc, res=res, fenv=(0.001, decay, 0.0, 0.05), fenv_amt=env_mod,
                  env=(0.002, 0.08, 0.85, 0.02), glide=0.055, drive=1.0, key_track=0.3, accent_boost=0.55,
                  accent_decay=0.14, filt='ladder')
    y = s.data
    if distortion:
        y = FX.saturate(y, 20 * np.log10(drive) + 4, 'diode')
    y = F.hpf(y, 45)
    return Sound(_mono_lows(y, 120))
