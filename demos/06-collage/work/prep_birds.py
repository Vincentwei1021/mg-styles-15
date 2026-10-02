# Session 2: re-cut the two ambiguous birds as tight single-bird crops (Audubon Bay-breasted Warbler plate, PD).
# Reuses the helper functions of prep.py (header only) and patches layout.json in place.
import json, sys
src = open(__file__.replace('prep_birds.py', 'prep.py')).read().split('# ---------------------------------------------------------------- portrait')[0]
exec(src)
layout.update(json.load(open(OUT + 'layout.json')))
W = IM + 'cutouts/birds/audubon_bay_breasted_warbler.png'
cu = [float(v) for v in (sys.argv[1:9] if len(sys.argv) > 8 else [0.19, 0.315, 0.66, 0.475, 0.50, 0.51, 0.96, 0.69])]
save('bird_warbler', cut_item(W, w=250, seed=23, crop=tuple(cu[0:4])))
save('bird_whip', cut_item(W, w=205, seed=25, crop=tuple(cu[4:8]), flip=True))
json.dump(layout, open(OUT + 'layout.json', 'w'), indent=1)
