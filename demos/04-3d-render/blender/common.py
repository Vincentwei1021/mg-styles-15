"""Shared constants for sim.py (system python) and scene.py (Blender python)."""
import json, os
ROOT = os.environ.get('MG_ROOT', os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..')))   # v5: overridable for the render box
DEMO = f'{ROOT}/demos/04-3d-render'
# v5 (reel title): env V5=1 swaps the four glyph meshes s/o/f/t -> 3/D/渲/染 (slot keys stay 's','o','f','t' so every
# timing / cue keyed by slot is unchanged) and redirects all outputs to v5 paths. Without V5 everything is as before.
V5 = os.environ.get('V5') == '1'
MESH = f'{DEMO}/assets/mesh_v5' if V5 else f'{DEMO}/assets/mesh'
WORK = f'{DEMO}/work/v5' if V5 else f'{DEMO}/work'
OUTD = f'{DEMO}/out/v5' if V5 else f'{DEMO}/out'
V5_CHARS = {'s': '3', 'o': 'D', 'f': '渲', 't': '染'}
V5_GAPS = {'o': 0.07, 'f': 0.19, 't': 0.08}      # gap before each slot: 3·D tight, a word space before 渲, 渲·染 tight
FPS = 24
NF = 240                 # frames 0..239  (t = f / 24)
PAD = 3                  # extra sim frames on each side (motion-blur subframes at the ends)
# pills
PILL_R = 0.094
PILL_L = 0.40            # total capsule height
PITCH = 0.228            # hex grid pitch
# word
LETTERS = 'soft'
GAP = 0.075
BALL_R = 0.375            # r1: 1.5x (the heavy full stop must read)
BALL_EXTRA = 0.07
SINK = 0.05              # resting sink of letters into the pill bed


def cues():
    return json.load(open(f'{DEMO}/cues.json'))


def glyphs():
    return json.load(open(f'{MESH}/glyphs.json'))


def layout():
    """x offset of each glyph origin so that outline gaps are GAP; returns dict + ball center x; word centred on 0."""
    g = glyphs()
    xs, cur = {}, 0.0
    for i, ch in enumerate(LETTERS):
        m = g[ch]
        if i == 0:
            off = -m['xmin']
        else:
            off = cur + (V5_GAPS[ch] if V5 else GAP) - m['xmin']
        xs[ch] = off
        cur = off + m['xmax']
    ball_x = cur + GAP + BALL_EXTRA + BALL_R      # r2: landing spot nudged right (no tangency with the 't' tail at f144)
    right = ball_x + BALL_R
    left = xs[LETTERS[0]] + g[LETTERS[0]]['xmin']
    shift = -(left + right) / 2
    for ch in xs:
        xs[ch] += shift
    # letter centres (for pivots): origin at bottom-centre of outline
    centers = {ch: xs[ch] + (g[ch]['xmin'] + g[ch]['xmax']) / 2 for ch in LETTERS}
    return xs, centers, ball_x + shift
