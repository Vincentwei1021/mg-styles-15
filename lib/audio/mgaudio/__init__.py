"""mgaudio - motion-graphics audio toolkit (48 kHz float stereo, numpy/numba/pedalboard).

    import sys; sys.path.insert(0, 'lib/audio')   # from the repo root
    import mgaudio as mg
    from mgaudio import sfx, drums, synth, recipes, sync, qc

See README.md for the API reference and examples.
"""
from .core import (SR, Sound, ns, amp, db, layer, concat, fade, rng, reset_rng, as_sound, silence, peak, rms,  # noqa
                   normalize, adsr, perc_env, ramp, exp_ramp, breakpoints, lfo, white, pink, brown, noise_st,
                   pan_mono, pan_curve, width, to_stereo, to_mono)
from . import core, theory, osc, filters, fx, synth, fm, pluck, wind, chip, drums, sfx, samples, mix, master  # noqa
from . import qc, seq, sync, recipes  # noqa
from .mix import Mix, Grid, fit_bpm  # noqa
from .theory import hz, midi, name, scale, chord, progression, roman, chord_symbols, degree  # noqa
from .qc import analyze, spectrogram, check_duration, hit_alignment, summary  # noqa
from .master import write, lufs, true_peak, master as master_buffer, normalize_file  # noqa
from .recipes import RECIPES, STYLES, recipe, for_style, Form  # noqa

__version__ = '1.0'
