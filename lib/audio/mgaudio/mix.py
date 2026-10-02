"""Timeline / mixer: Grid (tempo map), Track (clips + inserts + automation + sidechain + sends),
Mix (groups 'music' & 'sfx', lazily-created send buses, region effects, render/master/export)."""
from __future__ import annotations

from collections import OrderedDict

import numpy as np

from .core import (SR, Sound, ns, amp, db, as_sound, as_array, to_stereo, pan_mono, balance, width as _width,
                   mix_into, breakpoints, fit, fade)
from . import filters as F
from . import fx as FX


def _stable_seed(*parts):
    """Process-independent seed (Python's hash() of str is randomised per process)."""
    import zlib
    return zlib.crc32(repr(parts).encode()) & 0x7FFFFFFF


# ============================================================================ GRID
class Grid:
    """Tempo grid.  anchor = time (s) of bar 0 beat 0 (bars may be negative before the anchor).

    g.bar(2) -> start of bar 2;  g.beat(5.5) -> beat 5.5;  g.step(3, div=16, bar=1);  g.snap(t, 8)."""

    def __init__(self, bpm=120.0, anchor=0.0, beats_per_bar=4, swing=0.0):
        self.bpm = float(bpm)
        self.anchor = float(anchor)
        self.bpb = int(beats_per_bar)
        self.swing = float(swing)

    @property
    def beat_len(self):
        return 60.0 / self.bpm

    @property
    def bar_len(self):
        return self.beat_len * self.bpb

    def beat(self, b):
        return self.anchor + float(b) * self.beat_len

    def bar(self, i, beat=0.0):
        return self.anchor + float(i) * self.bar_len + float(beat) * self.beat_len

    def step(self, i, div=16, bar=0):
        """Time of step i (div steps per bar) counted from `bar`; swing delays odd 8th/16th steps."""
        st = self.bar_len / div
        t = self.bar(bar) + i * st
        if self.swing and div in (8, 16) and int(i) % 2 == 1:
            t += self.swing * st
        return t

    def snap(self, t, div=16, mode='nearest'):
        st = self.bar_len / div
        k = (t - self.anchor) / st
        k = {'nearest': np.round, 'floor': np.floor, 'ceil': np.ceil}[mode](k)
        return self.anchor + k * st

    def bar_at(self, t):
        return int(np.floor((t - self.anchor) / self.bar_len + 1e-9))

    def bars_in(self, t0, t1):
        """Bar indices whose start lies in [t0, t1)."""
        a = int(np.ceil((t0 - self.anchor) / self.bar_len - 1e-9))
        b = int(np.ceil((t1 - self.anchor) / self.bar_len - 1e-9))
        return list(range(a, b))

    def beats_in(self, t0, t1, div=4):
        """Grid times in [t0, t1) at `div` per bar."""
        st = self.bar_len / div
        a = int(np.ceil((t0 - self.anchor) / st - 1e-9))
        b = int(np.ceil((t1 - self.anchor) / st - 1e-9))
        return [self.anchor + k * st for k in range(a, b)]

    def __repr__(self):
        return f'Grid(bpm={self.bpm}, anchor={self.anchor:.3f}, bar={self.bar_len:.3f}s)'


def fit_bpm(hits, lo=80.0, hi=160.0, div=2, step=0.05, anchor=None):
    """Find the BPM (and anchor) whose grid (div subdivisions per beat) best matches visual hit times.
    Returns (bpm, anchor, max_err_seconds).  anchor defaults to the first hit."""
    hits = np.asarray(sorted(hits), dtype=np.float64)
    a0 = hits[0] if anchor is None else anchor
    best = (None, 1e9, 1e9)
    for bpm in np.arange(lo, hi + 1e-9, step):
        st = 60.0 / bpm / div
        k = np.round((hits - a0) / st)
        err = np.abs(hits - (a0 + k * st))
        score = np.sqrt(np.mean(err ** 2))
        if score < best[1] - 1e-9:
            best = (bpm, score, err.max())
    return float(np.round(best[0], 3)), float(a0), float(best[2])


# ============================================================================ TRACK
class Track:
    def __init__(self, mix, name, gain=0.0, level=None, pan=0.0, width=1.0, sends=None, fx=None,
                 group='music', mute=False, hp=None, lp=None, is_bus=False):
        self.mix = mix
        self.name = name
        self.gain = float(gain)
        self.level = level
        self.pan = pan
        self.width = width
        self.sends = dict(sends or {})
        self.fx = list(fx or [])
        self.group = group
        self.mute = mute
        self.hp = hp
        self.lp = lp
        self.is_bus = is_bus
        self.clips = []            # (data(2,n) float64, start_sample, sync_time)
        self.autom = {}
        self.ducks = []
        self.regions = []
        self.post_fx = []

    # -- placement
    def add(self, sound, at=0.0, gain=0.0, pan=None):
        """Place a Sound so its sync point lands at `at` seconds. Returns self (chainable)."""
        s = as_sound(sound)
        d = s.data.astype(np.float64)
        if pan is not None:
            d = pan_mono(d, pan) if d.ndim == 1 else balance(d, pan)
        d = to_stereo(d)
        if gain:
            d = d * amp(gain)
        start = ns(at - s.sync)
        self.clips.append((d, start, float(at)))
        return self

    def add_beat(self, sound, beat, **kw):
        return self.add(sound, self.mix.grid.beat(beat), **kw)

    def notes(self, fn, events, unit='beat', **kw):
        """events: [(pos, note, dur, vel), ...]; pos/dur in beats (unit='beat') or seconds ('sec').
        fn(note, dur_seconds, vel, **kw) -> Sound."""
        g = self.mix.grid
        for e in events:
            pos, note, du = e[0], e[1], e[2]
            vel = e[3] if len(e) > 3 else 0.85
            t = g.beat(pos) if unit == 'beat' else pos
            ds = du * g.beat_len if unit == 'beat' else du
            self.add(fn(note, ds, vel, **kw), t)
        return self

    def pattern(self, fn, pat, bar=0, div=16, vel=1.0, t_min=None, t_max=None, humanize=0.0, **kw):
        """Step pattern ('x...x..X') on a bar; fn(vel) -> Sound (drums) is called per hit."""
        from .theory import steps
        vs = steps(pat)
        r = np.random.default_rng(_stable_seed(self.name, bar))
        for i, v in enumerate(vs):
            if not v:
                continue
            if len(vs) == div:
                t = self.mix.grid.step(i, div=div, bar=bar)          # swing-aware
            else:                                                     # pattern spans the bar evenly
                t = self.mix.grid.bar(bar) + i * self.mix.grid.bar_len / len(vs)
            if t_min is not None and t < t_min - 1e-6:
                continue
            if t_max is not None and t >= t_max - 1e-6:
                continue
            if humanize:
                t += r.normal(0, humanize)
            self.add(fn(v * vel, **kw), t)
        return self

    # -- automation / dynamics
    def automate(self, param, points):
        """param: 'gain' (dB) | 'lpf' (Hz) | 'hpf' (Hz) | 'pan' (-1..1) | 'width'.  points: [(t, v), ...]"""
        self.autom[param] = sorted(points)
        return self

    def duck(self, by=None, times=None, depth=6.0, attack=0.004, hold=0.01, release=0.18, shape=2.0,
             mode='trigger', thresh=-30.0):
        """Sidechain ducking.  by='kick' uses that track's clip times as triggers (mode='trigger'), or its
        rendered envelope (mode='env').  times=[...] explicit triggers."""
        self.ducks.append(dict(by=by, times=times, depth=depth, attack=attack, hold=hold, release=release,
                               shape=shape, mode=mode, thresh=thresh))
        return self

    def region(self, kind, at, dur, **kw):
        """Region effects: 'stutter' (slice=1/16 bar default), 'tape_stop', 'mute', 'reverse',
        'lofi', 'bitcrush', 'filter' (lp sweep: hz=...)."""
        self.regions.append((kind, float(at), float(dur), kw))
        return self

    def insert(self, *fx):
        self.fx.extend(fx)
        return self

    def loop(self, fn, pat, t0=0.0, t1=None, vel=1.0, humanize=0.0, vel_jitter=0.0, **kw):
        """Repeat a per-bar step pattern (e.g. 'x...x...x...x...') on every bar overlapping [t0, t1).
        Pattern length sets the division (16 chars = 16ths, 12 = 8th triplets, 8 = 8ths ...).
        fn(vel, **kw) -> Sound is called per hit.  Grid swing applies to 8/16-step patterns."""
        g = self.mix.grid
        t1 = self.mix.duration if t1 is None else t1
        from .theory import steps
        vs = steps(pat)
        r = np.random.default_rng(_stable_seed(self.name, pat, round(t0, 3)))
        for b in range(g.bar_at(t0), g.bar_at(t1 - 1e-9) + 1):
            for i, v in enumerate(vs):
                if not v:
                    continue
                if len(vs) in (8, 16):
                    t = g.step(i, div=len(vs), bar=b)
                else:
                    t = g.bar(b) + i * g.bar_len / len(vs)
                if t < t0 - 1e-6 or t >= t1 - 1e-6:
                    continue
                vv = v * vel * (1 + vel_jitter * r.uniform(-1, 1))
                tt = t + (r.normal(0, humanize) if humanize else 0.0)
                self.add(fn(float(np.clip(vv, 0.05, 1.3)), **kw), tt)
        return self

    def hits(self, fn, events, **kw):
        """Place drum/one-shot hits: events = [t, ...] or [(t, vel), ...]; fn(vel, **kw) -> Sound."""
        for e in events:
            t, v = (e, 1.0) if np.ndim(e) == 0 else (e[0], e[1] if len(e) > 1 else 1.0)
            self.add(fn(v, **kw), t)
        return self

    def triggers(self):
        if self.is_bus:
            return sorted(c[2] for t in self.mix.tracks.values() if t.group == self.name for c in t.clips)
        return sorted(c[2] for c in self.clips)

    # -- rendering
    def _sum(self, N):
        buf = np.zeros((2, N))
        for d, start, _ in self.clips:
            mix_into(buf, d, start)
        return buf

    def _process(self, buf, N, key_env=None):
        if self.fx:
            buf = FX.apply_chain(buf, self.fx)
            buf = fit(to_stereo(buf), N)
        if self.hp:
            buf = F.hpf(buf, self.hp)
        if self.lp:
            buf = F.lpf(buf, self.lp)
        if self.level is not None:
            L = _lufs(buf)
            if L > -70:
                buf = buf * amp(self.level - L)
        for kind, at, dur, kw in self.regions:
            buf = _apply_region(buf, kind, at, dur, kw, self.mix)
        a = self.autom
        if 'lpf' in a:
            buf = F.svf(buf, breakpoints(a['lpf'], N, log=True), 0.707, 'lp')
        if 'hpf' in a:
            buf = F.svf(buf, breakpoints(a['hpf'], N, log=True), 0.707, 'hp')
        if 'gain' in a:
            buf = buf * amp(breakpoints(a['gain'], N))
        if 'pan' in a:
            buf = balance(buf, breakpoints(a['pan'], N))
        if 'width' in a:
            w = breakpoints(a['width'], N)
            m = 0.5 * (buf[0] + buf[1])
            s = 0.5 * (buf[0] - buf[1]) * w
            buf = np.stack([m + s, m - s])
        for dk in self.ducks:
            if dk['mode'] == 'env' and dk['by'] is not None:
                key = self.mix._rendered.get(dk['by'])
                if key is not None:
                    buf = FX.sidechain(buf, key, dk['depth'], dk['thresh'], dk['attack'], dk['release'])
                continue
            times = dk['times']
            if times is None and dk['by'] is not None:
                src = self.mix.tracks.get(dk['by']) or self.mix.groups.get(dk['by'])
                times = src.triggers() if src is not None else []
            if times:
                buf = buf * FX.duck_env(N, times, dk['depth'], dk['attack'], dk['hold'], dk['release'], dk['shape'])
        if self.gain:
            buf = buf * amp(self.gain)
        if self.pan:
            buf = balance(buf, self.pan)
        if self.width != 1.0:
            buf = _width(buf, self.width)
        if self.post_fx:
            buf = fit(to_stereo(FX.apply_chain(buf, self.post_fx)), N)
        return buf


def _lufs(buf):
    import pyloudnorm as pyln
    x = to_stereo(buf)
    if x.shape[1] < ns(0.45):
        x = np.pad(x, ((0, 0), (0, ns(0.45) - x.shape[1])))
    try:
        L = pyln.Meter(SR).integrated_loudness(x.T)
    except Exception:
        L = -120.0
    if not np.isfinite(L):
        r = np.sqrt(np.mean(x ** 2) + 1e-20)
        L = 20 * np.log10(r + 1e-12) - 0.7 if r > 1e-7 else -120.0
    return float(L)


def _splice(buf, proc, a, b, xf):
    """Put `proc` (the processed [a, b) segment) into buf with short linear crossfades at both edges, so the
    region boundaries never step (an abrupt switch between two different signals is an audible click)."""
    out = buf.copy()
    L = b - a
    xf = int(max(1, min(xf, L // 2)))
    w = np.ones(L)
    r = np.linspace(0.0, 1.0, xf + 2)[1:-1]
    w[:xf] = r
    w[L - xf:] = r[::-1]
    out[:, a:b] = buf[:, a:b] * (1 - w) + proc * w
    return out


def _apply_region(buf, kind, at, dur, kw, mix):
    N = buf.shape[1]
    a, b = max(0, ns(at)), min(N, ns(at + dur))
    if b <= a:
        return buf
    XF = ns(kw.get('xfade', 0.003))
    out = buf.copy()
    if kind == 'mute':
        fo = ns(0.004)
        env = np.ones(N)
        env[a:b] = 0
        env[max(0, a - fo):a] = np.linspace(1, 0, a - max(0, a - fo))
        env[b:b + fo] = np.linspace(0, 1, len(env[b:b + fo]))
        return buf * env
    if kind == 'stutter':
        sl = kw.get('slice', mix.grid.bar_len / 16)
        L = max(8, ns(sl))
        seg0 = buf[:, a:a + L].copy()
        seg = fade(seg0, 0.001, 0.002)
        dec = kw.get('decay_db', 0.0)
        pitch = kw.get('pitch_step', 0.0)
        proc = np.zeros((2, b - a))
        k, i = 0, 0
        while k < b - a:
            if pitch and i:
                s2 = fade(fit(fade(FX.repitch(seg0, 2 ** (pitch * i / 12)), 0.001, 0.002), L), 0.0, 0.002)
            elif i == 0:
                s2 = fade(seg0, 0.0, 0.002)     # first slice IS the original audio: no fade-in needed
            else:
                s2 = seg
            m = min(L, b - a - k)
            proc[:, k:k + m] = s2[:, :m] * amp(dec * i)
            k += L
            i += 1
        return _splice(buf, proc, a, b, XF)
    if kind == 'tape_stop':
        # speed ramps 1 -> 0 over [at, at+dur]; the audio after the stop stays SILENT (endings / pre-drop gaps).
        # resume=True brings the original back after the region with a short fade-in.
        seg = buf[:, a:]
        y = FX.tape_stop(seg, 0.0, dur, kw.get('curve', 1.6))
        if kw.get('resume', False) and b < N:
            fi = min(ns(0.01), N - b)
            y[:, b - a:] = buf[:, b:]
            y[:, b - a:b - a + fi] *= np.linspace(0, 1, fi)
        out[:, a:] = y             # speed starts at 1.0, so the join at `at` is continuous
        return out
    if kind == 'reverse':
        return _splice(buf, fade(buf[:, a:b][:, ::-1], 0.005, 0.005), a, b, XF)
    if kind == 'lofi':
        return _splice(buf, FX.lofi(buf[:, a:b], kw.get('sr', 8000), kw.get('bits', 8)), a, b, XF)
    if kind == 'bitcrush':
        return _splice(buf, FX.bitcrush(buf[:, a:b], kw.get('bits', 6), kw.get('rate', 6000)), a, b, XF)
    if kind == 'filter':
        hz = kw.get('hz', [(0, 800), (dur, 800)])
        # run the filter from a little before the region so its state is warmed up (no start transient)
        pre = min(a, ns(0.05))
        pts = [(t + pre / SR, v) for t, v in hz]
        pts = [(0.0, pts[0][1])] + pts
        y = F.svf(buf[:, a - pre:b], breakpoints(pts, b - a + pre, log=True), kw.get('q', 0.9),
                  kw.get('mode', 'lp'))[:, pre:]
        return _splice(buf, y, a, b, XF)
    raise ValueError(kind)


# ============================================================================ SEND BUS FX
def _bus_fx(name, mix):
    bpm = mix.grid.bpm
    lib = {
        'room': lambda x: FX.reverb(x, 'room', mix=1.0),
        'ambience': lambda x: FX.reverb(x, 'ambience', mix=1.0),
        'plate': lambda x: FX.reverb(x, 'plate', mix=1.0, lp=11000),
        'hall': lambda x: FX.reverb(x, 'hall', mix=1.0, lp=10000),
        'verb': lambda x: FX.reverb(x, 'hall', decay=2.2, mix=1.0, lp=10000),
        'big': lambda x: FX.reverb(x, 'big', mix=1.0, lp=9000),
        'cathedral': lambda x: FX.reverb(x, 'cathedral', mix=1.0, lp=8000),
        'gated': lambda x: FX.reverb(x, 'gated', mix=1.0),
        'spring': lambda x: FX.reverb(x, 'spring', mix=1.0),
        'shimmer': lambda x: FX.shimmer(x, 4.0, 0.5),
        'delay': lambda x: FX.delay(x, FX.beat(bpm, 3 / 16), 0.38, mix=1.0, lp=5000, hp=250),
        'delay8': lambda x: FX.delay(x, FX.beat(bpm, 1 / 8), 0.35, mix=1.0, lp=5000, hp=250),
        'delay4': lambda x: FX.delay(x, FX.beat(bpm, 1 / 4), 0.4, mix=1.0, lp=4500, hp=250),
        'tape_delay': lambda x: FX.wow_flutter(FX.delay(x, FX.beat(bpm, 3 / 16), 0.45, mix=1.0, lp=3500,
                                                         hp=300, sat=0.6), 0.4, 0.1),
        'slap': lambda x: FX.delay(x, 0.095, 0.12, mix=1.0, pingpong=False, lp=6000, hp=200),
    }
    if name not in lib:
        raise KeyError(f'unknown send bus {name!r}; available: {sorted(lib)} (or define with mix.bus())')
    return lib[name]


# ============================================================================ MIX
class Mix:
    """Timeline of tracks.  duration is exact (10.0 s -> 480000 samples)."""

    def __init__(self, duration=10.0, bpm=120.0, anchor=0.0, beats_per_bar=4, swing=0.0):
        self.duration = float(duration)
        self.N = ns(duration)
        self.grid = Grid(bpm, anchor, beats_per_bar, swing)
        self.tracks = OrderedDict()
        self.groups = OrderedDict()
        self.bus_fx = {}
        self.bus_gain = {}
        self._rendered = {}
        self.stems = {}
        self.meta = {}
        self.master_kw = {}
        self.form = None
        for g in ('music', 'sfx'):
            self.groups[g] = Track(self, g, group=None, is_bus=True)

    # -- tracks
    def track(self, name, **kw):
        """Get or create a track. kwargs (on creation or update): gain level pan width sends fx group hp lp."""
        if name in self.tracks:
            t = self.tracks[name]
            for k, v in kw.items():
                setattr(t, k, v)
            return t
        t = Track(self, name, **kw)
        self.tracks[name] = t
        if t.group not in self.groups:
            self.groups[t.group] = Track(self, t.group, group=None, is_bus=True)
        return t

    def __getitem__(self, name):
        if name in self.tracks:
            return self.tracks[name]
        return self.groups[name]

    def __contains__(self, name):
        return name in self.tracks

    def group(self, name='music'):
        return self.groups[name]

    def bus(self, name, fx, group='music', gain=0.0):
        """Define/override a send bus fx (callable (2,n)->(2,n)) for tracks in `group`."""
        self.bus_fx[(group, name)] = fx
        self.bus_gain[(group, name)] = gain
        return self

    def sfx(self, sound, at, gain=0.0, pan=None, verb=None, send='room', track='sfx'):
        """Place a sound-design element (group 'sfx').  verb = send level dB to `send` bus (e.g. -12)."""
        name = track
        t = self.tracks.get(name)
        if t is None:
            t = self.track(name, group='sfx')
        if verb is not None:
            nm = f'{name}~{send}~{verb:+.0f}'
            t = self.tracks.get(nm) or self.track(nm, group='sfx', sends={send: verb})
        t.add(sound, at, gain=gain, pan=pan)
        return t

    # -- region ops on groups (music by default)
    def stutter(self, at, dur, slice=None, group='music', **kw):
        self.groups[group].region('stutter', at, dur, slice=slice or self.grid.bar_len / 16, **kw)
        return self

    def tape_stop(self, at, dur=0.6, group='music', **kw):
        """Tape stop on a group: silent after at+dur (endings / pre-drop gap) unless resume=True."""
        self.groups[group].region('tape_stop', at, dur, **kw)
        return self

    def mute(self, at, dur, group='music'):
        self.groups[group].region('mute', at, dur)
        return self

    # -- render
    def render(self, verbose=False):
        N = self.N
        self._rendered = {}
        group_in = {g: np.zeros((2, N)) for g in self.groups}
        send_in = {}
        # order: tracks that are env-sidechain keys first
        keys = {d['by'] for t in self.tracks.values() for d in t.ducks if d['mode'] == 'env' and d['by']}
        order = [n for n in self.tracks if n in keys] + [n for n in self.tracks if n not in keys]
        for name in order:
            t = self.tracks[name]
            if t.mute or not t.clips:
                continue
            buf = t._process(t._sum(N), N)
            self._rendered[name] = buf
            self.stems[name] = buf
            group_in.setdefault(t.group, np.zeros((2, N)))
            group_in[t.group] += buf
            for bus, sdb in t.sends.items():
                k = (t.group, bus)
                send_in.setdefault(k, np.zeros((2, N)))
                send_in[k] += buf * amp(sdb)
        for (g, bus), x in send_in.items():
            fxf = self.bus_fx.get((g, bus)) or _bus_fx(bus, self)
            pre = F.lpf(F.hpf(x, 180, 2), 12000)
            wet = fit(to_stereo(fxf(pre)), N)
            wet = wet * amp(self.bus_gain.get((g, bus), 0.0))
            self.stems[f'{g}.{bus}'] = wet
            group_in[g] += wet
        out = np.zeros((2, N))
        # render groups: sfx first (music may duck under it)
        gorder = [g for g in self.groups if g != 'music'] + ['music']
        for g in gorder:
            bus = self.groups[g]
            if bus.mute:
                continue
            y = bus._process(group_in[g], N)
            self._rendered[g] = y
            self.stems['group.' + g] = y
            out += y
        return np.nan_to_num(out)

    def master(self, lufs=-14.0, tp=-1.0, **kw):
        from .master import master as _m
        kw = {**self.master_kw, **kw}
        pre = self.render()
        y, info = _m(pre, lufs=lufs, tp=tp, **kw)
        self.meta['master'] = info
        return y

    def export(self, path, lufs=-14.0, tp=-1.0, spectrogram=None, analyze=True, stems_dir=None, **kw):
        """Render + master + write 24-bit WAV (exact duration). Returns QC dict (and prints a line)."""
        from .master import write
        y = self.master(lufs=lufs, tp=tp, **kw)
        write(path, y)
        res = {'path': path}
        if stems_dir:
            import os
            os.makedirs(stems_dir, exist_ok=True)
            for k, v in self.stems.items():
                write(os.path.join(stems_dir, f'{k}.wav'), v * 0.5)
        if analyze:
            from .qc import analyze as _an
            res = _an(path, expected=self.duration)
            print(f"[mgaudio] {path}: {res['duration']:.3f}s LUFS {res['lufs']:.2f} TP {res['true_peak']:.2f} dBTP"
                  + (f"  WARN: {'; '.join(res['warnings'])}" if res['warnings'] else ''))
        if spectrogram:   # green dashed = SFX sync points, cyan = form sections
            from .qc import spectrogram as _sp
            marks = self.groups['sfx'].triggers() if 'sfx' in self.groups else []
            secs = self.form.sections if self.form is not None else None
            _sp(path, spectrogram, marks=sorted(set(round(t, 4) for t in marks)), sections=secs)
        return res

    def report(self):
        """Per-stem loudness/peak table (after a render)."""
        if not self.stems:
            self.render()
        rows = []
        for k, v in self.stems.items():
            rows.append((k, _lufs(v), 20 * np.log10(np.max(np.abs(v)) + 1e-12)))
        w = max(len(r[0]) for r in rows)
        for k, L, p in rows:
            print(f'{k:<{w}}  {L:7.2f} LUFS  peak {p:6.2f} dBFS')
        return rows
