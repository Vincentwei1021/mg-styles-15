"""Arrangement primitives shared by all recipes.

Form  - maps a 10 s cue onto a tempo grid whose bar 0 starts exactly at the DROP (hero moment):
        sections intro [0, build) -> build [build, drop) -> drop [drop, outro) -> outro [outro, end),
        a chord progression (one chord per `chord_beats`), an energy curve and the visual hit list.
Pattern languages (per bar, one char per step; the string length sets the division):
  bass_events : R/r root  O/o octave up  F/f fifth  3 third  b fifth below  p approach-to-next-root
                - tie (extend previous)  . rest            (uppercase = accent)
  comp_events : X/x chord hit, - tie, . rest              (for stabs / comping / pads)
"""
from __future__ import annotations

import re

import numpy as np

from ..core import SR, Sound, ns
from ..mix import Mix, fit_bpm
from .. import theory as T

# Default stem loudness targets (integrated LUFS of each stem while it plays, before the music group is
# normalised).  Only the relative values matter.  Tuned for dance/pop balance at a -14 LUFS master.
LV = dict(kick=-17.0, snare=-20.5, clap=-21.5, hat=-29.0, ohat=-30.0, perc=-28.0, shaker=-31.0, crash=-27.5,
          tom=-23.0, bass=-21.0, sub=-23.0, b808=-20.0, pad=-25.0, chords=-22.5, keys=-22.0, arp=-25.5,
          lead=-21.5, pluck=-23.5, bells=-26.0, fx=-26.5, riser=-25.5, texture=-40.0)


class Form:
    """Arrangement map (see module doc).  All times in seconds.

    bpm=None: use `bpm_default`, or - if >=2 `hits` are given - the tempo in `bpm_range` whose 8th-note grid
    (anchored at the drop / first hit) best fits the hits.  prog: roman numerals ('i VI III VII') or chord
    symbols ('Am F C G'), cycled one chord per `chord_beats`; the chord that starts at the drop is prog[0], so
    the intro plays the END of the progression (a natural turnaround).  final: chord of the outro (default
    prog[0])."""

    def __init__(self, duration=10.0, bpm=None, drop=None, build=None, outro=None, hits=(), energy=None,
                 key='C', mode='major', prog='I V vi IV', chord_beats=4, octave=4, final=None, swing=0.0,
                 beats_per_bar=4, bpm_default=120.0, bpm_range=(90, 140), center=None, build_bars=None,
                 drop_bars=None):
        self.duration = float(duration)
        self.hits = sorted(float(h) for h in (hits or ()))
        self.key, self.mode = key, mode
        self.swing = float(swing)
        self.bpb = int(beats_per_bar)
        self.fit_err = None
        anchor = None
        if bpm is None:
            if len(self.hits) >= 2:
                a = float(drop) if drop is not None else self.hits[0]
                bpm, anchor, self.fit_err = fit_bpm(self.hits, bpm_range[0], bpm_range[1], div=2, anchor=a)
            else:
                bpm = bpm_default
        self.bpm = float(bpm)
        self.beat = 60.0 / self.bpm
        self.bar = self.beat * self.bpb
        bar, D = self.bar, self.duration
        if drop is None:
            a = anchor if anchor is not None else 0.0
            ks = np.arange(-40, 41)
            cand = a + ks * bar
            ok = cand[(cand >= min(0.8 * bar, 0.3 * D)) & (cand <= D - min(1.6 * bar, 0.4 * D))]
            drop = float(ok[np.argmin(np.abs(ok - 0.42 * D))]) if ok.size else 0.42 * D
        self.drop = float(drop)
        if build is None and build_bars is not None:
            build = self.drop - build_bars * bar
        if outro is None and drop_bars is not None:
            outro = self.drop + drop_bars * bar
        if build is None:
            if self.drop >= 1.6 * bar:
                build = self.drop - bar
            elif self.drop >= 0.9 * bar:
                build = self.drop - bar / 2
            else:
                build = max(0.0, self.drop - bar / 4)
        self.build = float(max(0.0, min(build, self.drop)))
        if outro is None:
            half = bar / 2
            k = max(1, int(np.floor((D - self.drop - 1.1) / half)))
            outro = self.drop + k * half
            if outro > D - 0.6:
                outro = max(self.drop + 0.25 * bar, D - 0.6)
        self.outro = float(min(outro, D))
        self.end = D
        # energy curve
        if energy is None:
            energy = [(0.0, 0.3), (self.build, 0.42), (self.drop - 0.02, 0.9), (self.drop, 1.0),
                      (self.outro - 0.02, 1.0), (self.outro, 0.6), (D, 0.3)]
        self.energy = sorted((float(t), float(v)) for t, v in energy)
        # harmony
        self.chord_len = chord_beats * self.beat
        self.syms = T.chord_symbols(prog, key, mode) if isinstance(prog, str) else list(prog)
        self.center = center if center is not None else 12 * (octave + 1) + 4
        self.voicings = T.progression(self.syms, key, mode, octave, voice_lead=True, center=self.center)
        fs = final if final is not None else self.syms[0]
        if re.match(r'^[b#]?[ivIV]+', fs) and not re.match(r'^[A-G]', fs):
            fs = T.roman(fs, key, mode)
        self.final_sym = fs
        prev = self.voicings[self.idx(self.outro - 1e-3)]
        self.final_voicing = T.voice_lead_to(prev, T.chord_tones(fs), self.center)

    # ------------------------------------------------------------------ harmony
    def idx(self, t):
        return int(np.floor((t - self.drop) / self.chord_len + 1e-9)) % len(self.syms)

    def chord_at(self, t, shift=0):
        """Voiced chord (MIDI list) sounding at t (the final chord from the outro on)."""
        v = self.final_voicing if t >= self.outro - 1e-9 else self.voicings[self.idx(t)]
        return [n + shift for n in v]

    def sym_at(self, t):
        return self.final_sym if t >= self.outro - 1e-9 else self.syms[self.idx(t)]

    def root_pc(self, t):
        root, iv, bass = T.parse_chord(self.sym_at(t))
        return bass if bass is not None else root

    def bass_at(self, t, octave=2):
        return 12 * (octave + 1) + self.root_pc(t)

    def tones_at(self, t):
        """Pitch classes of the chord at t."""
        return T.chord_tones(self.sym_at(t))

    def third_at(self, t, octave=2):
        root, iv, _ = T.parse_chord(self.sym_at(t))
        third = 4 if 4 in iv else 3 if 3 in iv else (5 if 5 in iv else 2)
        return self.bass_at(t, octave) + third

    def segments(self, t0=0.0, t1=None):
        """Chord segments [(start, end, voicing, symbol)] clipped to [t0, t1) (outro = one final segment)."""
        t1 = self.end if t1 is None else t1
        cuts = {t0, t1}
        k0 = int(np.floor((t0 - self.drop) / self.chord_len)) - 1
        k1 = int(np.ceil((t1 - self.drop) / self.chord_len)) + 1
        for k in range(k0, k1 + 1):
            c = self.drop + k * self.chord_len
            if t0 < c < t1 and c < self.outro:
                cuts.add(c)
        if t0 < self.outro < t1:
            cuts.add(self.outro)
        cs = sorted(cuts)
        return [(a, b, self.chord_at(a), self.sym_at(a)) for a, b in zip(cs[:-1], cs[1:]) if b - a > 1e-4]

    # ------------------------------------------------------------------ time
    def bars(self, t0=0.0, t1=None):
        """Start times of all bars overlapping [t0, t1) (the first may start before t0)."""
        t1 = self.end if t1 is None else t1
        k0 = int(np.floor((t0 - self.drop) / self.bar + 1e-9))
        k1 = int(np.ceil((t1 - self.drop) / self.bar - 1e-9))
        return [self.drop + k * self.bar for k in range(k0, k1)]

    def at(self, bar, beat=0.0):
        """Time of (bar, beat) relative to the drop (bar 0 = drop, bar -1 = the bar before)."""
        return self.drop + bar * self.bar + beat * self.beat

    def energy_at(self, t):
        ts, vs = zip(*self.energy)
        return float(np.interp(t, ts, vs))

    def curve(self, lo, hi, log=True, points=None):
        """Automation breakpoints following the energy curve: energy 0 -> lo, 1 -> hi."""
        pts = points or self.energy
        if log:
            return [(t, lo * (hi / lo) ** np.clip(e, 0, 1)) for t, e in pts]
        return [(t, lo + (hi - lo) * np.clip(e, 0, 1)) for t, e in pts]

    @property
    def sections(self):
        return {'intro': 0.0, 'build': self.build, 'drop': self.drop, 'outro': self.outro}

    def section(self, t):
        if t < self.build:
            return 'intro'
        if t < self.drop:
            return 'build'
        if t < self.outro:
            return 'drop'
        return 'outro'

    def hits_in(self, t0, t1):
        return [h for h in self.hits if t0 <= h < t1]

    def summary(self):
        return {'bpm': round(self.bpm, 3), 'bar': round(self.bar, 4), 'beat': round(self.beat, 4),
                'key': f'{self.key} {self.mode}', 'intro': 0.0, 'build': round(self.build, 3),
                'drop': round(self.drop, 3), 'outro': round(self.outro, 3), 'end': self.end,
                'chords': self.syms, 'final': self.final_sym, 'hits': self.hits,
                'hit_fit_err': None if self.fit_err is None else round(self.fit_err, 4)}

    def __repr__(self):
        s = self.summary()
        return (f"Form({s['bpm']} bpm, bar {s['bar']}s, {s['key']}, build {s['build']}, drop {s['drop']}, "
                f"outro {s['outro']}, chords {' '.join(s['chords'])} -> {s['final']})")


# ====================================================================== pattern languages
def _steps_of(pat):
    return [c for c in pat if c not in ' |']


def _approach(form, t_next, octave):
    """Nearest scale tone below the next chord's root (walking-bass approach note)."""
    nxt = form.bass_at(t_next + 1e-3, octave)
    iv = T.SCALES.get(form.mode, T.SCALES['major'])
    k = T.pc(form.key)
    for d in (1, 2, 3):
        if (nxt - d - k) % 12 in iv:
            return nxt - d
    return nxt - 1


def bass_events(form, grid, t0, t1, pat, octave=2, vel=0.9, gate=0.92, accent=1.12):
    """Bass line from a per-bar pattern (see module doc).  Returns [(t, midi, dur, vel)]."""
    st_ = _steps_of(pat)
    d = len(st_)
    step = form.bar / d
    ev = []
    for b in form.bars(t0, t1):
        bi = grid.bar_at(b + 1e-6)
        for i, c in enumerate(st_):
            if c in '.-':
                continue
            t = grid.step(i, div=d, bar=bi) if d in (8, 16) else b + i * step
            if not (t0 - 1e-6 <= t < t1 - 1e-6):
                continue
            L = 1
            while i + L < d and st_[i + L] == '-':
                L += 1
            root = form.bass_at(t, octave)
            lc = c.lower()
            if lc == 'r':
                nt = root
            elif lc == 'o':
                nt = root + 12
            elif lc == 'f':
                nt = root + 7
            elif lc == 'b':
                nt = root - 5
            elif lc == '3':
                nt = form.third_at(t, octave)
            elif lc == 'p':
                nt = _approach(form, t + L * step, octave)
            else:
                continue
            v = vel * (accent if c.isupper() else 1.0)
            ev.append((t, nt, L * step * gate, min(v, 1.3)))
    return ev


def comp_events(form, grid, t0, t1, pat, vel=0.85, gate=0.9, shift=0, accent=1.12):
    """Chord hits from a per-bar pattern ('x..x..x.', '-' ties).  Returns [(t, [midi...], dur, vel)]."""
    st_ = _steps_of(pat)
    d = len(st_)
    step = form.bar / d
    ev = []
    for b in form.bars(t0, t1):
        bi = grid.bar_at(b + 1e-6)
        for i, c in enumerate(st_):
            if c.lower() != 'x':
                continue
            t = grid.step(i, div=d, bar=bi) if d in (8, 16) else b + i * step
            if not (t0 - 1e-6 <= t < t1 - 1e-6):
                continue
            L = 1
            while i + L < d and st_[i + L] == '-':
                L += 1
            v = vel * (accent if c == 'X' else 1.0)
            ev.append((t, form.chord_at(t + 1e-4, shift), L * step * gate, min(v, 1.3)))
    return ev


def chord_tone_melody(form, grid, t0, t1, rhythm=(3, 1, 4), order=('top', 'mid', 'low'), octave=5, div=8,
                      vel=0.85, legato=0.96, pickup=True):
    """Simple hook: per chord, walk down its (re-voiced) tones in `order` with `rhythm` (steps of div per bar).
    Chord tones re-voiced into `octave` so the line sits in a singable register."""
    step = form.bar / div
    ev = []
    t = t0
    j = 0
    while t < t1 - 1e-6:
        pcs = form.tones_at(t + 1e-4)
        base = 12 * (octave + 1)
        tones = sorted(base + ((p - base) % 12) for p in pcs[:4])
        which = order[j % len(order)]
        nt = {'top': tones[-1], 'mid': tones[len(tones) // 2], 'low': tones[0],
              'root': base + (form.root_pc(t) - base) % 12, 'up': tones[-1] + (2 if pickup else 0)}.get(which, tones[0])
        L = rhythm[j % len(rhythm)] * step
        L = min(L, t1 - t)
        v = vel * (1.0 if j % len(rhythm) == 0 else 0.88)
        ev.append((t, nt, L * legato, v))
        t += rhythm[j % len(rhythm)] * step
        j += 1
    return ev


def new_mix(form, music_level=-20.0, sfx_duck=3.0, master=None):
    """Mix on the form's grid (bar 0 = drop). Music group normalised to music_level LUFS and (optionally)
    dipped by sfx_duck dB around every SFX sync point (mix.sfx(..., at=t)) so hits always read."""
    m = Mix(form.duration, form.bpm, anchor=form.drop, swing=form.swing)
    m.form = form
    m.meta['form'] = form.summary()
    g = m.group('music')
    g.level = music_level
    if sfx_duck:   # dip the music around every SFX sync point (hits read without pre-ducking whooshes/risers)
        g.duck(by='sfx', mode='trigger', depth=sfx_duck, attack=0.006, hold=0.05, release=0.25)
    if master:
        m.master_kw.update(master)
    return m


def place_notes(track, fn, events, **kw):
    """events [(t, note_or_chord, dur, vel)] -> track.add(fn(note, dur, vel, **kw), t)."""
    for t, nt, du, v in events:
        track.add(fn(nt, du, v, **kw), t)
    return track


def place_segments(track, form, t0, t1, fn, min_len=0.05, **kw):
    """For each chord segment in [t0, t1): track.add(fn(voicing, seg_dur, **kw), seg_start)."""
    for a, b, v, s in form.segments(t0, t1):
        if b - a >= min_len:
            track.add(fn(v, b - a, **kw), a)
    return track
