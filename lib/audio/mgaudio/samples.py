"""Sample engine for the bundled CC0 VCSL subset (see SAMPLES.md).

    from mgaudio.samples import inst, hit, available
    inst('piano').play('C4', dur=1.5, vel=0.7)          # pitched, velocity layers, bends
    hit('gong', vel=0.9, match='gong_f')               # one-shot percussion by name filter

Instruments (pitched): piano, dantranh (guzheng-like zither), harp, glock, marimba, kalimba,
vibraphone, tubularbells, wineglass.
One-shots: gong, gong2, crash, suscymbal (incl. 'cresc' swells), fingercym, triangle, woodblock,
claves, slapstick, vibraslap, flexatone, trainwhistle, whistle, ratchet, guiro, cabasa, shaker,
tambourine, claps, cowbell, agogo, slitdrum, sleighbells, belltree, tubularbells, framedrum,
bassdrum, bassdrum2, timpani, tom, bongo, conga, oceandrum, marktree.
"""
from __future__ import annotations

import json
import os
import re
from functools import lru_cache

import numpy as np
import soundfile as sf

from .core import SR, Sound, ns, rng, fade, breakpoints
from .theory import midi
from . import _dsp

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'samples')

_VEL = {'ppp': 0.12, 'pp': 0.2, 'p': 0.35, 'mp': 0.5, 'mf': 0.65, 'med': 0.6, 'medium': 0.6, 'f': 0.8,
        'loud': 0.85, 'ff': 0.92, 'fff': 1.0, 'soft': 0.35, 'quiet': 0.3, 'hard': 0.85,
        'v1': 0.3, 'v2': 0.5, 'v3': 0.72, 'v4': 0.9, 'v5': 0.95, 'v7': 1.0}


@lru_cache(maxsize=1)
def _index():
    p = os.path.join(ROOT, 'index.json')
    if not os.path.exists(p):
        return {}
    with open(p) as f:
        return json.load(f)


def available(key=None):
    idx = _index()
    if key is None:
        return sorted(idx.keys())
    return key in idx and len(idx[key]) > 0


def _align_pair(x, maxlag=64):
    """Many VCSL stereo files are spaced-pair (AB) recordings whose channels are offset by 0.2-1.3 ms: summed
    to mono they comb-filter (marimba/piano/agogo notes lost up to 7-9 dB, L/R correlation down to -0.8).
    Shift one channel by the lag (<= maxlag samples) that maximises L/R correlation - level differences
    (the stereo image) stay, the mono sum becomes clean."""
    from scipy.signal import fftconvolve
    n = min(x.shape[1], SR)
    a, b = x[0, :n].astype(np.float64), x[1, :n].astype(np.float64)
    if n < 4 * maxlag or np.std(a) < 1e-7 or np.std(b) < 1e-7:
        return x
    xc = fftconvolve(a, b[::-1], mode='full')[n - 1 - maxlag:n + maxlag]
    lag = int(np.argmax(xc)) - maxlag
    if lag == 0 or xc[lag + maxlag] <= xc[maxlag] * 1.05:
        return x
    y = x.copy()
    if lag > 0:    # L lags R -> delay R
        y[1, lag:] = x[1, :-lag]
        y[1, :lag] = 0
    else:
        y[0, -lag:] = x[0, :lag]
        y[0, :-lag] = 0
    return y


@lru_cache(maxsize=512)
def load(relpath):
    x, sr = sf.read(os.path.join(ROOT, relpath), dtype='float32', always_2d=True)
    x = x.T
    if x.shape[0] == 1:
        x = x[0]
    else:
        x = _align_pair(x)
    x = np.ascontiguousarray(x)
    x.flags.writeable = False
    return x


def _vel_of(name):
    toks = re.split(r'[_\-\s]+', name.lower())
    for t in toks:
        if t in _VEL:
            return _VEL[t]
    for t in toks:
        m = re.fullmatch(r'v(\d)', t)
        if m:
            return _VEL.get(t, 0.6)
    return 0.7


class Instrument:
    """Multi-sampled pitched instrument with velocity layers & round-robin."""

    def __init__(self, key, match=None, exclude=None, reliable_only=False):
        items = list(_index().get(key, []))
        if match:
            items = [i for i in items if re.search(match, i['name'])]
        if exclude:
            items = [i for i in items if not re.search(exclude, i['name'])]
        if reliable_only:
            items = [i for i in items if i.get('detected_midi') is not None and i.get('midi') is not None
                     and abs(i['detected_midi'] - i['midi']) < 0.01]
        items = [i for i in items if i.get('midi') is not None]
        if not items:
            raise RuntimeError(f'no samples for {key!r} (match={match!r})')
        self.key = key
        self.items = items
        for i in items:
            i['_vel'] = _vel_of(i['name'])
        top = max(i['_vel'] for i in items)
        pk = [i['peak'] for i in items if i['_vel'] >= top - 1e-6]
        self.gain = 0.5 / (np.median(pk) + 1e-9)
        self._rr = 0

    def pick(self, note, vel=0.7):
        m = midi(note)
        dist = np.array([abs(i['midi'] - m) for i in self.items])
        dmin = dist.min()
        cands = [i for i, d in zip(self.items, dist) if d <= dmin + 0.6]
        vd = np.array([abs(i['_vel'] - vel) for i in cands])
        best = [c for c, v in zip(cands, vd) if v <= vd.min() + 1e-6]
        self._rr += 1
        return best[self._rr % len(best)]

    def play(self, note, dur=None, vel=0.7, bend=None, release=0.3, stereo=True, tune_cents=0.0,
             attack=0.0, start=0.0):
        """Play note. dur=None -> natural length. bend: breakpoints [(t, semis)] or array (per sample).
        release: fade after dur."""
        it = self.pick(note, vel)
        x = np.asarray(load(it['file']), dtype=np.float64)
        if start:
            x = x[..., ns(start):]
        m = midi(note) + tune_cents / 100.0
        semis = m - it['midi']
        natural = x.shape[-1]
        if dur is None:
            out_n = int(natural / 2 ** (semis / 12)) if bend is None else natural
        else:
            out_n = min(ns(dur + release), int(natural / 2 ** (semis / 12)) + 1)
        if bend is None and abs(semis) < 1e-3:
            y = x[..., :out_n].copy()
        else:
            if bend is None:
                b = np.zeros(out_n)
            elif isinstance(bend, np.ndarray):
                b = np.pad(bend[:out_n], (0, max(0, out_n - bend.shape[0])), mode='edge')
            else:
                b = breakpoints(bend, out_n)
            rate = 2 ** ((semis + b) / 12)
            pos = np.concatenate([[0.0], np.cumsum(rate)[:-1]])
            if x.ndim == 2:
                y = np.stack([_dsp.varispeed(np.ascontiguousarray(x[0]), pos),
                              _dsp.varispeed(np.ascontiguousarray(x[1]), pos)])
            else:
                y = _dsp.varispeed(np.ascontiguousarray(x), pos)
        # velocity gain relative to layer
        g = self.gain * np.clip((vel / max(it['_vel'], 0.05)) ** 1.1, 0.35, 2.0) * (0.35 + 0.65 * vel)
        y = y * g
        if dur is not None:
            n_g = ns(dur)
            if y.shape[-1] > n_g:
                r = min(ns(release), y.shape[-1] - n_g)
                env = np.ones(y.shape[-1])
                env[n_g:n_g + r] = np.linspace(1, 0, r) ** 2
                env[n_g + r:] = 0
                y = y * env
                y = y[..., :n_g + r]
        # attack=0 still gets a 0.3 ms ramp: some files start mid-waveform (onset trim) -> step click
        y = fade(y, max(attack, 0.0003), 0.006)
        if stereo and y.ndim == 1:
            y = np.stack([y, y])
        return Sound(y)


@lru_cache(maxsize=64)
def inst(key, match=None, exclude=None, reliable_only=False):
    """Cached Instrument accessor. Examples:
    inst('piano'); inst('dantranh', match=r'_(f|ff|mf)_'); inst('glock', match='medium')"""
    return Instrument(key, match, exclude, reliable_only)


_hit_rr = {}


def hit(key, match=None, vel=0.8, rr=None, stereo=True, gain_by_vel=True, pitch=0.0, maxdur=None):
    """One-shot sample by instrument key (+ optional regex on file name).  Chooses the layer whose
    name-velocity is closest to vel; rotates round-robin.  pitch in semitones (resample)."""
    items = list(_index().get(key, []))
    if match:
        items = [i for i in items if re.search(match, i['name'], re.I)]
    if not items:
        raise RuntimeError(f'no samples for {key!r} match={match!r}')
    vs = np.array([_vel_of(i['name']) for i in items])
    d = np.abs(vs - vel)
    cands = [i for i, dd in zip(items, d) if dd <= d.min() + 1e-6]
    k = (key, match)
    _hit_rr[k] = _hit_rr.get(k, -1) + 1
    it = cands[(_hit_rr[k] if rr is None else rr) % len(cands)]
    x = np.asarray(load(it['file']), dtype=np.float64)
    if pitch:
        from .fx import repitch
        x = repitch(x, 2 ** (pitch / 12))
    if maxdur is not None and x.shape[-1] > ns(maxdur):
        x = fade(x[..., :ns(maxdur)], 0, min(0.2, maxdur / 3))
    top = max(float(np.max([i['peak'] for i in items])), 1e-6)
    g = 0.5 / top
    if gain_by_vel:
        g *= np.clip(vel / max(_vel_of(it['name']), 0.05), 0.4, 1.8) ** 0.8
    y = fade(x * g, 0.0003, 0.0)
    if stereo and y.ndim == 1:
        y = np.stack([y, y])
    return Sound(y)


def names(key):
    return [i['name'] for i in _index().get(key, [])]
