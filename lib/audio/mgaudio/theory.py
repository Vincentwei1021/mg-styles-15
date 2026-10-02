"""Music theory helpers: note names <-> MIDI <-> Hz, scales, chords, progressions, voice leading.

Notes can be given everywhere as MIDI numbers (int/float) or names ('A4', 'C#3', 'Eb5').
"""
from __future__ import annotations

import re
import numpy as np

_PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

SCALES = {
    'major': [0, 2, 4, 5, 7, 9, 11],
    'ionian': [0, 2, 4, 5, 7, 9, 11],
    'minor': [0, 2, 3, 5, 7, 8, 10],
    'aeolian': [0, 2, 3, 5, 7, 8, 10],
    'harmonic_minor': [0, 2, 3, 5, 7, 8, 11],
    'melodic_minor': [0, 2, 3, 5, 7, 9, 11],
    'dorian': [0, 2, 3, 5, 7, 9, 10],
    'phrygian': [0, 1, 3, 5, 7, 8, 10],
    'lydian': [0, 2, 4, 6, 7, 9, 11],
    'mixolydian': [0, 2, 4, 5, 7, 9, 10],
    'locrian': [0, 1, 3, 5, 6, 8, 10],
    'major_pentatonic': [0, 2, 4, 7, 9],
    'minor_pentatonic': [0, 3, 5, 7, 10],
    'blues': [0, 3, 5, 6, 7, 10],
    # Chinese pentatonic modes (五声调式) relative to their own tonic
    'gong': [0, 2, 4, 7, 9],     # 宫
    'shang': [0, 2, 5, 7, 10],   # 商
    'jue': [0, 3, 5, 8, 10],     # 角
    'zhi': [0, 2, 5, 7, 9],      # 徵
    'yu': [0, 3, 5, 7, 10],      # 羽
    'hirajoshi': [0, 2, 3, 7, 8],
    'whole_tone': [0, 2, 4, 6, 8, 10],
    'chromatic': list(range(12)),
}

CHORDS = {
    '': [0, 4, 7], 'maj': [0, 4, 7], 'M': [0, 4, 7], 'm': [0, 3, 7], 'min': [0, 3, 7],
    'dim': [0, 3, 6], '°': [0, 3, 6], 'aug': [0, 4, 8], '+': [0, 4, 8],
    '5': [0, 7], 'sus2': [0, 2, 7], 'sus4': [0, 5, 7], 'sus': [0, 5, 7],
    '6': [0, 4, 7, 9], 'm6': [0, 3, 7, 9], '7': [0, 4, 7, 10], 'maj7': [0, 4, 7, 11], 'M7': [0, 4, 7, 11],
    'm7': [0, 3, 7, 10], 'mM7': [0, 3, 7, 11], 'dim7': [0, 3, 6, 9], 'm7b5': [0, 3, 6, 10], 'ø': [0, 3, 6, 10],
    '7sus4': [0, 5, 7, 10], 'add9': [0, 4, 7, 14], 'madd9': [0, 3, 7, 14], '9': [0, 4, 7, 10, 14],
    'maj9': [0, 4, 7, 11, 14], 'M9': [0, 4, 7, 11, 14], 'm9': [0, 3, 7, 10, 14], '11': [0, 4, 7, 10, 14, 17],
    'm11': [0, 3, 7, 10, 14, 17], '13': [0, 4, 7, 10, 14, 21], 'maj13': [0, 4, 7, 11, 14, 21],
    '6/9': [0, 4, 7, 9, 14], '69': [0, 4, 7, 9, 14], '7b9': [0, 4, 7, 10, 13], '7#9': [0, 4, 7, 10, 15],
    'maj7#11': [0, 4, 7, 11, 18], 'm7add11': [0, 3, 7, 10, 17], 'sus2add4': [0, 2, 5, 7],
}


def pc(name):
    """Pitch class of a note letter with accidentals ('C#', 'Eb', 'Bb') -> 0..11"""
    m = re.fullmatch(r'([A-Ga-g])([#b♯♭]*)', name.strip())
    if not m:
        raise ValueError(f'bad pitch class {name!r}')
    v = _PC[m.group(1).upper()]
    for ch in m.group(2):
        v += 1 if ch in '#♯' else -1
    return v % 12


def midi(n):
    """'A4' -> 69, 'C#3' -> 49, numbers pass through."""
    if isinstance(n, (int, float, np.integer, np.floating)):
        return float(n)
    m = re.fullmatch(r'([A-Ga-g][#b♯♭]*)(-?\d+)', n.strip())
    if not m:
        raise ValueError(f'bad note {n!r}')
    return float(pc(m.group(1)) + 12 * (int(m.group(2)) + 1))


def hz(n):
    """Note name or MIDI -> Hz (A4 = 440)."""
    return 440.0 * 2 ** ((midi(n) - 69) / 12)


def mtof(m):
    return 440.0 * 2 ** ((np.asarray(m, dtype=np.float64) - 69) / 12)


def ftom(f):
    return 69 + 12 * np.log2(np.asarray(f, dtype=np.float64) / 440.0)


def name(m):
    m = int(round(midi(m)))
    return f'{NAMES_SHARP[m % 12]}{m // 12 - 1}'


def scale(root='C4', mode='major', octaves=1, include_top=True):
    """List of MIDI notes of a scale starting at root (e.g. scale('A3','minor_pentatonic',2))."""
    r = midi(root) if any(c.isdigit() for c in str(root)) else pc(root) + 60
    iv = SCALES[mode]
    out = [r + 12 * o + i for o in range(octaves) for i in iv]
    if include_top:
        out.append(r + 12 * octaves)
    return out


def degree(key='C', mode='major', deg=1, octave=4):
    """Scale degree (1-based, may exceed 7 or be <=0) -> MIDI. Works for pentatonic too."""
    iv = SCALES[mode]
    k = pc(key) if isinstance(key, str) and not any(c.isdigit() for c in key) else int(midi(key)) % 12
    d = deg - 1
    o, i = divmod(d, len(iv))
    return 12 * (octave + 1) + k + iv[i] + 12 * o


def snap_to_scale(m, key='C', mode='major'):
    k = pc(key)
    pcs = [(k + i) % 12 for i in SCALES[mode]]
    m = int(round(m))
    for d in [0, -1, 1, -2, 2]:
        if (m + d) % 12 in pcs:
            return m + d
    return m


# ----------------------------------------------------------------------------- chords
def parse_chord(sym):
    """'Am7' -> (root_pc, intervals, bass_pc|None).  Supports slash chords 'C/E'."""
    sym = sym.strip()
    bass = None
    if '/' in sym and not sym.endswith('6/9'):
        sym, b = sym.split('/')
        bass = pc(b)
    m = re.fullmatch(r'([A-G][#b]?)(.*)', sym)
    if not m:
        raise ValueError(f'bad chord {sym!r}')
    root = pc(m.group(1))
    q = m.group(2)
    if q not in CHORDS:
        raise ValueError(f'unknown chord quality {q!r} in {sym!r}')
    return root, CHORDS[q], bass


def chord(sym, octave=4, inversion=0):
    """Chord symbol -> MIDI notes (root position at octave, optional inversion)."""
    root, iv, bass = parse_chord(sym)
    notes = [12 * (octave + 1) + root + i for i in iv]
    for _ in range(inversion):
        notes = notes[1:] + [notes[0] + 12]
    if bass is not None:
        b = 12 * (octave + 1) + bass
        while b >= notes[0]:
            b -= 12
        notes = [b] + notes
    return notes


_ROMAN = {'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5, 'vi': 6, 'vii': 7}


NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
_PARENT = {'major': 0, 'ionian': 0, 'dorian': -2, 'phrygian': -4, 'lydian': -5, 'mixolydian': -7, 'minor': -9,
           'aeolian': -9, 'locrian': -11, 'harmonic_minor': -9, 'melodic_minor': -9, 'minor_pentatonic': -9,
           'major_pentatonic': 0, 'blues': -9, 'gong': 0, 'shang': -2, 'jue': -4, 'zhi': -7, 'yu': -9}


def uses_flats(key='C', mode='major'):
    """True if key/mode is conventionally spelled with flats (F major, D minor, D phrygian ...)."""
    parent = (pc(key) + _PARENT.get(mode, 0)) % 12
    return parent in (5, 10, 3, 8, 1, 6) or (parent == 6 and False)


def spell(pc_, key='C', mode='major'):
    """Pitch class -> note name using the key's sharp/flat convention."""
    return (NAMES_FLAT if uses_flats(key, mode) else NAMES_SHARP)[pc_ % 12]


def _seven(mode):
    if mode in SCALES and len(SCALES[mode]) == 7:
        return SCALES[mode]
    return SCALES['minor' if mode in ('yu', 'jue', 'minor_pentatonic', 'blues', 'hirajoshi') else 'major']


def roman(numeral, key='C', mode='major'):
    """Roman numeral -> chord symbol in key.

    Plain numerals are degrees of the key's own 7-note scale (so in A minor 'VI' = F, 'III' = C; in D phrygian
    'II' = Eb).  A b/# prefix is relative to the PARALLEL MAJOR (pop/jazz convention: 'bVI', 'bVII', 'bIII' in
    any key).  Case sets quality (IV major, iv minor); the suffix is appended ('V7', 'ii9', 'IVmaj7', 'vii°')."""
    m = re.fullmatch(r'([b#]?)([ivIV]+|[VI]+)(.*)', numeral.strip())
    if not m:
        raise ValueError(f'bad roman {numeral!r}')
    acc, rn, suf = m.groups()
    d = _ROMAN[rn.lower()]
    if acc:
        base = SCALES['major'][d - 1] + (1 if acc == '#' else -1)
    else:
        base = _seven(mode)[d - 1]
    root = (pc(key) + base) % 12
    upper = rn.isupper()
    if suf.startswith('°') or suf.startswith('dim'):
        qual = suf
    elif suf in ('ø', 'm7b5'):
        qual = 'm7b5'
    elif upper:
        qual = suf
    else:
        qual = 'm' + suf if not suf.startswith('m') else suf
        if qual == 'mmaj7':
            qual = 'mM7'
    return spell(root, key, mode) + qual


def progression(prog, key='C', mode='major', octave=4, voice_lead=True, center=None, spread=False):
    """'i VI III VII' or 'Am F C G' (or list) -> list of MIDI note lists, voice-led.

    center: MIDI note the voicing should hover around (default octave's E).
    spread: add root an octave below (open voicing)."""
    toks = prog.split() if isinstance(prog, str) else list(prog)
    syms = []
    for t in toks:
        if re.match(r'^[b#]?[ivIV]+', t) and not re.match(r'^[A-G]', t):
            syms.append(roman(t, key, mode))
        else:
            syms.append(t)
    out = []
    prev = None
    c = center if center is not None else 12 * (octave + 1) + 4
    for s in syms:
        root, iv, bass = parse_chord(s)
        pcs = _thin([(root + i) % 12 for i in iv], root, iv)
        if not voice_lead or prev is None:
            v = voice_near(pcs, c, root_pc=root)
        else:
            v = voice_lead_to(prev, pcs, c, root_pc=root)
        if spread:
            b = min(v) - 1
            while b % 12 != root:
                b -= 1
            v = [b] + v
        out.append(v)
        prev = v
    return out


def _thin(pcs, root, iv):
    """Extended chords (5+ notes): omit the perfect 5th, and the 11th over a major 3rd (jazz practice)."""
    if len(pcs) < 5:
        return pcs
    out = [p for p, i in zip(pcs, iv) if i != 7]
    if 4 in iv:
        out = [p for p, i in zip(out, [i for i in iv if i != 7]) if i not in (17, 5)]
    return out if len(out) >= 3 else pcs


def chord_symbols(prog, key='C', mode='major'):
    toks = prog.split() if isinstance(prog, str) else list(prog)
    return [roman(t, key, mode) if re.match(r'^[b#]?[ivIV]+', t) and not re.match(r'^[A-G]', t) else t
            for t in toks]


def _candidates(pcs, center, lo=-14, hi=3):
    """Close voicings of pcs in all inversions around center, plus drop-2 / drop-3 / drop-2&4 spreads."""
    out = []
    seen = set()
    for base in range(int(center) + lo, int(center) + hi):
        close = sorted(set(base + ((p - base) % 12) for p in pcs))
        vs = [close]
        k = len(close)
        if k >= 4:
            vs.append(sorted(close[:-2] + [close[-2] - 12] + close[-1:]))                 # drop 2
            vs.append(sorted(close[:-3] + [close[-3] - 12] + close[-2:]))                 # drop 3
            if k >= 5:
                d24 = list(close)
                d24[-2] -= 12
                d24[-4] -= 12
                vs.append(sorted(d24))                                                    # drop 2&4
        for v in vs:
            tv = tuple(v)
            if tv not in seen:
                seen.add(tv)
                out.append(v)
    return out


def _rough(v):
    """Voicing roughness: adjacent semitones (worst), whole tones in the low register, muddy low thirds."""
    r = 0.0
    for a, b in zip(v[:-1], v[1:]):
        iv = b - a
        if iv == 1:
            r += 2.5
        elif iv == 2 and a < 55:
            r += 1.0
        elif iv in (3, 4) and a < 48:
            r += 1.5
    return r


def voice_near(pcs, center, root_pc=None):
    """Smooth voicing of pitch classes centred on `center` (avoids semitone clusters and low mud)."""
    best, bs = None, 1e9
    for v in _candidates(pcs, center, -12, 1):
        score = (v[-1] - v[0]) * 0.3 + abs(np.mean(v) - center) * 0.7 + 3.0 * _rough(v)
        if score < bs:
            bs, best = score, v
    return best


def voice_lead_to(prev, pcs, center, root_pc=None):
    """Voicing of pcs minimising movement from prev (voice leading) while staying near center."""
    best, bs = None, 1e9
    pv = np.array(sorted(prev), dtype=float)
    for c in _candidates(pcs, center):
        cv = np.array(c, dtype=float)
        mv = np.sum([np.min(np.abs(pv - x)) for x in cv])
        score = mv + 0.35 * abs(np.mean(cv) - center) + 0.12 * (cv[-1] - cv[0]) + 3.0 * _rough(c)
        if score < bs:
            bs, best = score, c
    return best


def bass_note(sym_or_notes, octave=2, key='C', mode='major'):
    """Root (or slash bass) of a chord symbol/roman -> MIDI in octave."""
    if isinstance(sym_or_notes, (list, tuple)):
        return 12 * (octave + 1) + int(min(sym_or_notes)) % 12
    s = sym_or_notes
    if re.match(r'^[b#]?[ivIV]+', s) and not re.match(r'^[A-G]', s):
        s = roman(s, key, mode)
    root, iv, bass = parse_chord(s)
    return 12 * (octave + 1) + (bass if bass is not None else root)


def chord_tones(sym, key='C', mode='major'):
    if re.match(r'^[b#]?[ivIV]+', sym) and not re.match(r'^[A-G]', sym):
        sym = roman(sym, key, mode)
    root, iv, _ = parse_chord(sym)
    return [(root + i) % 12 for i in iv]


def arp_notes(notes, pattern='up', octaves=1, steps=None):
    """Arpeggio note order. pattern: up, down, updown, downup, random, 'converge', or index list."""
    base = sorted(notes)
    seq = [n + 12 * o for o in range(octaves) for n in base]
    if pattern == 'up':
        out = seq
    elif pattern == 'down':
        out = seq[::-1]
    elif pattern == 'updown':
        out = seq + seq[-2:0:-1]
    elif pattern == 'downup':
        out = seq[::-1] + seq[1:-1]
    elif pattern == 'converge':
        out = []
        lo, hi = 0, len(seq) - 1
        while lo <= hi:
            out.append(seq[lo])
            if lo != hi:
                out.append(seq[hi])
            lo += 1
            hi -= 1
    elif pattern == 'random':
        r = np.random.default_rng(len(seq))
        out = list(r.permutation(seq))
    elif isinstance(pattern, (list, tuple)):
        out = [seq[i % len(seq)] + 12 * (i // len(seq)) for i in pattern]
    else:
        raise ValueError(pattern)
    if steps is not None:
        out = [out[i % len(out)] for i in range(steps)]
    return out


def euclid(k, n, rot=0):
    """Euclidean rhythm (Bjorklund) as a list of 0/1 of length n."""
    if k <= 0:
        return [0] * n
    pat = [1 if (i * k) % n < k else 0 for i in range(n)]
    # standard bresenham form starts on onset
    pat = [(((i + rot) * k) // n) != ((((i + rot) - 1) * k) // n) for i in range(n)]
    return [int(p) for p in pat]


def steps(pattern):
    """'x..x..x.' / 'X-x-' -> list of velocities (X=1.0, x=0.75, o=0.5, .=0, '-'=0)."""
    v = {'X': 1.0, 'x': 0.78, 'o': 0.55, 'g': 0.3, '.': 0.0, '-': 0.0, '_': 0.0, ' ': None}
    out = []
    for ch in pattern:
        if ch == ' ' or ch == '|':
            continue
        out.append(v.get(ch, 0.8))
    return out
