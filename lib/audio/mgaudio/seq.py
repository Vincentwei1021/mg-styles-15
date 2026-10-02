"""Sequencing helpers: step times on a Grid, arpeggiator, chord segments, scale-degree melodies.

All event lists use seconds:  note events = [(t, note, dur, vel), ...]  (feed to Track.notes(fn, ev, unit='sec'))
                               hit events  = [(t, vel), ...]             (feed to Track.hits(fn, ev))
"""
from __future__ import annotations

import numpy as np

from .theory import midi, arp_notes, steps as _steps, SCALES, pc, euclid


def step_times(grid, t0, t1, div=16, pattern=None):
    """Grid step times in [t0, t1) at `div` steps per bar (swing-aware).  pattern: optional per-bar
    step string ('x..x') - only steps with a hit are returned, as (t, vel)."""
    out = []
    vs = _steps(pattern) if pattern else None
    d = len(vs) if vs else div
    for b in range(grid.bar_at(t0), grid.bar_at(t1 - 1e-9) + 1):
        for i in range(d):
            v = vs[i] if vs else 1.0
            if not v:
                continue
            t = grid.step(i, div=d, bar=b) if d in (8, 16) else grid.bar(b) + i * grid.bar_len / d
            if t0 - 1e-6 <= t < t1 - 1e-6:
                out.append((t, v) if vs else t)
    return out


def euclid_pattern(k, n=16, rot=0, accent='x', rest='.'):
    """Euclidean rhythm as a step string, e.g. euclid_pattern(5, 16) -> 'x..x..x..x..x...'."""
    return ''.join(accent if v else rest for v in euclid(k, n, rot))


def arp(grid, chord_fn, t0, t1, div=16, pattern='up', octaves=1, gate=0.55, vel=0.8, accents='x...',
        accent_amt=0.25, rest=None, transpose=0):
    """Arpeggiator.  chord_fn(t) -> list of MIDI notes (e.g. form.chord_at); the note order restarts at each
    chord change.  pattern: up down updown downup converge random or index list.  accents: per-step
    string cycled (X/x louder).  rest: optional per-bar step string; '.' steps are silent.
    Returns [(t, note, dur, vel), ...]."""
    st = grid.bar_len / div
    acc = _steps(accents) if accents else [1.0]
    rst = _steps(rest) if rest else None
    ev = []
    prev = None
    k = 0
    for b in range(grid.bar_at(t0), grid.bar_at(t1 - 1e-9) + 1):
        for i in range(div):
            t = grid.step(i, div=div, bar=b)
            if not (t0 - 1e-6 <= t < t1 - 1e-6):
                continue
            ch = tuple(chord_fn(t + 1e-4))
            if ch != prev:
                seq = arp_notes(list(ch), pattern, octaves)
                prev = ch
                k = 0
            if rst is not None and not rst[i % len(rst)]:
                k += 1
                continue
            a = acc[i % len(acc)]
            v = vel * (1 - accent_amt + accent_amt * (1.0 if a >= 0.75 else 0.0)) if acc else vel
            ev.append((t, seq[k % len(seq)] + transpose, st * gate, float(v)))
            k += 1
    return ev


def chord_events(chord_fn, times, dur, vel=0.8):
    """Chord stabs at given times -> [(t, [notes], dur, vel)]."""
    return [(t, list(chord_fn(t + 1e-4)), dur, vel) for t in times]


def degrees(key, mode, degs, octave=4):
    """Scale degrees (1-based, may exceed the scale length or be <1) -> MIDI list.  None stays None (rest)."""
    iv = SCALES[mode]
    k = pc(key)
    out = []
    for d in degs:
        if d is None:
            out.append(None)
            continue
        o, i = divmod(int(d) - 1, len(iv))
        out.append(12 * (octave + 1) + k + iv[i] + 12 * o)
    return out


def melody(grid, t0, notes, rhythm, vel=0.85, legato=0.95, div=8):
    """Build note events from a note list and a rhythm in steps (div per bar).
    notes: MIDI/names/None(rest); rhythm: step lengths, e.g. [3, 3, 2] (dotted-8th, dotted-8th, 8th) with div=16.
    Returns [(t, note, dur, vel)] starting at t0."""
    st = grid.bar_len / div
    t = t0
    ev = []
    for i, nt in enumerate(notes):
        L = rhythm[i % len(rhythm)] * st
        if nt is not None:
            v = vel[i % len(vel)] if isinstance(vel, (list, tuple)) else vel
            ev.append((t, midi(nt), L * legato, v))
        t += L
    return ev


def humanize(events, timing=0.006, vel=0.08, seed=0):
    """Random timing (s, gaussian sd) and velocity (± fraction) jitter for (t, ..., vel) events."""
    r = np.random.default_rng(seed)
    out = []
    for e in events:
        e = list(e)
        e[0] = e[0] + r.normal(0, timing)
        e[-1] = float(np.clip(e[-1] * (1 + r.uniform(-vel, vel)), 0.05, 1.3))
        out.append(tuple(e))
    return out


def roll(t0, t1, start_div=8, end_div=32, grid=None, vel0=0.35, vel1=1.0, curve=1.0):
    """Accelerating drum roll (snare build) from t0 to t1.  If grid is given, divisions are per bar.
    Returns [(t, vel)] - the last hit lands before t1 (the drop)."""
    bar = grid.bar_len if grid is not None else 2.0
    out = []
    t = t0
    while t < t1 - 1e-4:
        x = (t - t0) / max(t1 - t0, 1e-6)
        d = start_div * (end_div / start_div) ** (x ** curve)
        # quantise the division to musical values
        dq = min([4, 8, 16, 32, 64], key=lambda q: abs(np.log(q / d)))
        out.append((t, vel0 + (vel1 - vel0) * x))
        t += bar / dq
    return out
