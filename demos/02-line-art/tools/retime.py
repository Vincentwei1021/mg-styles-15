# Retime the ONE line: fixed anchors (on the 72 bpm 1/8 grid where they are musical punctuation), and between anchors
# time per piece ∝ (corner-weighted length × zoom) / pace. Repeated markers = holds. Writes the whole cues.json.
# Run from the demo folder: python3 tools/retime.py   (needs out/timing.json from tools/dump_timing.mjs)
import json
G8 = 60 / 72 / 2   # 1/8 note at 72 bpm = 0.4167 s
d = json.load(open('out/timing.json'))['pieces']
plan = [('ground0', 5.8, 1.0), ('seed', 3.6, 0.74), ('stem1', 3.0, 0.8), ('leaf1', 2.9, 0.78), ('stem2', 2.8, 0.85), ('leaf2', 2.7, 0.8),
        ('stem3', 2.6, 0.85), ('leaf3', 2.5, 0.8), ('shoot', 2.35, 0.9), ('tendril', 2.25, 0.75), ('roof', 1.95, 1.0), ('pavilion', 1.45, 1.0),
        ('tower', 1.38, 1.0), ('tower2', 1.34, 1.1), ('sky', 1.3, 1.0), ('sky2', 1.26, 1.0), ('horizon', 1.16, 1.8), ('wave', 1.14, 1.0),
        ('curl', 1.16, 0.42), ('lift', 1.16, 1.25), ('ring', 1.2, 1.15), ('foot', 1.3, 0.9), ('arch', 1.36, 0.72)]
# anchors: piece-start -> time or (hold_in, hold_out). Holds are 0.15 s (4.5 frames); shoot hold + ring on the 1/8 / 1/16 grid.
anchors = {'ground0': 0.0, 'seed': 0.2, 'stem1': 0.75, 'shoot': 1.78, 'roof': (5 * G8, 5 * G8 + 0.15),
           'tower2': (3.5, 3.65), 'sky2': (4.75, 4.9), 'ring': 15.5 * G8, 'END': 18 * G8}
names = [p[0] for p in plan]
Z = {n: z for n, z, m in plan}
wt = {n: d[n][3] * z / m for n, z, m in plan}
t_in = {}; t_out = {}
keys = [n for n in names if n in anchors] + ['END']
for a, b in zip(keys[:-1], keys[1:]):
    A = anchors[a]; B = anchors[b]
    ta = A[1] if isinstance(A, tuple) else A; tb = B[0] if isinstance(B, tuple) else B
    seg = names[names.index(a): (names.index(b) if b != 'END' else len(names))]
    tot = sum(wt[n] for n in seg); t = ta
    for n in seg:
        if n == a: t_in[n] = A[0] if isinstance(A, tuple) else A; t_out[n] = ta
        else: t_in[n] = t_out[n] = t
        t += (tb - ta) * wt[n] / tot
draw = [[0.0, 'ground0@0.45']]; zoom = [[0.0, 5.8], [0.22, 3.49], [0.4, 3.6]]
for n in names[1:]:
    draw.append([round(t_in[n], 3), n])
    if t_out[n] > t_in[n] + 1e-6: draw.append([round(t_out[n], 3), n])
    if t_in[n] > 0.45: zoom.append([round(t_in[n], 3), Z[n]])
T_END = anchors['END']
draw.append([round(T_END, 3), 'arch>'])
zoom += [[round(T_END, 3), 1.46], [7.95, 1.6], [9.0, 1.1], [10, 1.1]]   # lean in on the coin; end push lives in film.js
sec = {'seed': t_in['seed'], 'sapling': t_in['stem1'], 'branch': t_in['shoot'], 'beam': t_in['roof'], 'building': t_in['pavilion'],
       'skyline': t_in['sky'], 'horizon': t_in['horizon'], 'wave': t_in['wave'], 'curl': t_in['curl'], 'lift': t_in['lift'],
       'ring': t_in['ring'], 'arch': t_in['arch'], 'fill': T_END, 'wordmark': 20 * G8, 'rules': 9.25, 'hold': 9.0}
holds = [[round(anchors[k][0], 3), round(anchors[k][1], 3), k] for k in ('roof', 'tower2', 'sky2')]
c = {"_doc": "Single source of timing. draw = [t, marker] keyframes of the ONE continuous line (marker = piece start, 'piece>' = piece end, "
             "'piece@f' = fraction; a repeated marker = a punctuation hold). Written by tools/retime.py. Visuals read this file; audio.py reads it "
             "plus out/timing.json (corner/speed data derived from the same path by tools/dump_timing.mjs). Grid: 72 bpm, 1/8 = 0.4167 s.",
     "draw": draw, "zoom": zoom, "holds": holds,
     "camera": {"sigma": 0.3, "lead": 0.08, "logo_from": 6.0, "logo_to": 7.3, "logo_center": [925, 392],
                "poster_from": 7.98, "poster_to": 9.0, "poster_center": [925, 560]},
     "sections": {k: round(v, 3) for k, v in sec.items()},
     "morph": [round(anchors['roof'][0] - 0.02, 3), round(anchors['roof'][0] + 0.14, 3)],
     "fill": {"start": round(T_END, 3), "swell": 0.233},
     "pulse": {"start": round(T_END + 0.02, 3), "end": 8.3},
     "wordmark": {"start": round(20 * G8, 3), "stagger": 0.045, "dur": 0.95, "tagline": 8.75},
     "rules": [9.25, 9.6],
     "tip_fade": [round(T_END, 3), round(T_END + 0.32, 3)]}
txt = json.dumps(c, separators=(', ', ': '))
for key in ['draw', 'zoom', 'holds', 'camera', 'sections', 'morph', 'fill', 'pulse', 'wordmark', 'rules', 'tip_fade']:
    txt = txt.replace(f', "{key}"', f',\n "{key}"')
open('cues.json', 'w').write(txt.replace('{"_doc"', '{\n "_doc"')[:-1] + '\n}\n'); json.load(open('cues.json'))
for n in names: print(f"{n}:{t_in[n]:.3f}" + (f"-{t_out[n]:.3f}" if t_out[n] > t_in[n] else ''), end='  ')
print()
