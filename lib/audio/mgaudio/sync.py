"""Picture-sync helpers: frame quantisation, snapping visual events to the music grid (or the grid to the
events), exact SFX placement with variation, cues.json loading.

Typical:
    cues = load_cues('demos/x/cues.json')
    bpm, anchor, err = fit_bpm(cues['hits'], 100, 130)        # choose a tempo the hits sit on
    place(m, cues['pops'], lambda i: sfx.pop(pitch=1 + 0.05 * i), gain=-2, early_frames=1, fps=30)
"""
from __future__ import annotations

import json

import numpy as np

from .mix import fit_bpm  # noqa: F401  (re-export)


def frame(t, fps=30.0, mode='nearest'):
    """Quantise a time to a video frame boundary (the time the frame starts)."""
    k = {'nearest': np.round, 'floor': np.floor, 'ceil': np.ceil}[mode](np.asarray(t) * fps + 1e-9)
    return k / fps


def frames_to_sec(f, fps=30.0):
    return np.asarray(f, dtype=np.float64) / fps


def snap(times, grid, div=16, tol=0.05, mode='nearest'):
    """Snap event times to the grid (div steps per bar) when within tol seconds; otherwise keep them.
    Use to decide *visual* timing (move the animation keys) - never nudge audio off the picture."""
    out = []
    for t in np.atleast_1d(times):
        g = grid.snap(float(t), div, mode)
        out.append(float(g) if abs(g - t) <= tol else float(t))
    return out if np.ndim(times) else out[0]


def grid_report(times, grid, div=16):
    """[(t, nearest_grid_time, error_s, step_label)] - how well visual events sit on the music grid."""
    rows = []
    for t in times:
        g = grid.snap(t, div)
        k = int(round((g - grid.anchor) / (grid.bar_len / div)))
        bar, step = divmod(k, div)
        rows.append((round(t, 4), round(g, 4), round(t - g, 4), f'bar {bar} step {step + 1}/{div}'))
    return rows


def place(mix, times, make, gain=0.0, pan=None, early=0.0, early_frames=0, fps=30.0, track='sfx', verb=None,
          send='room', gains=None):
    """Place one SFX per time.  make: Sound | callable(i) -> Sound | callable() -> Sound (called per hit, so
    random/seeded variation is possible).  pan: scalar, list per hit, or callable(i).  early/early_frames shift
    the sync point earlier (e.g. 1 frame so a transient reads 'on' the hit).  Returns the track."""
    tr = None
    for i, t in enumerate(times):
        if callable(make):
            try:
                s = make(i)
            except TypeError:
                s = make()
        else:
            s = make
        p = pan(i) if callable(pan) else (pan[i % len(pan)] if isinstance(pan, (list, tuple)) else pan)
        g = gain + (gains[i % len(gains)] if gains else 0.0)
        tr = mix.sfx(s, float(t) - early - early_frames / fps, gain=g, pan=p, verb=verb, send=send, track=track)
    return tr


def load_cues(path):
    """Load a cues.json (any structure).  Convenience: returns dict."""
    with open(path) as f:
        return json.load(f)


def stagger(t0, n, step, ease=None):
    """n times starting at t0 spaced by step; ease='in' accelerates, 'out' decelerates (for cascades)."""
    x = np.arange(n, dtype=np.float64)
    if ease == 'in':
        x = x ** 0.8 * (n - 1) ** 0.2 if n > 1 else x
    elif ease == 'out':
        x = x ** 1.25 / max(n - 1, 1) ** 0.25 if n > 1 else x
    return list(t0 + x * step)
