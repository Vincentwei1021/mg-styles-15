"""Manicule cutout: rasterised PD engraving (assets/manicule.svg via qlmanage) -> filled paper silhouette + scissor border.
Run after prep.py:  qlmanage -t -s 1400 -o /tmp/c06 assets/manicule.svg ; python3 work/prep_hand.py
"""
import json, numpy as np, cv2
from PIL import Image
import os
src = open(os.path.dirname(os.path.abspath(__file__)) + '/prep.py').read()
exec(src.split('# ---------------------------------------------------------------- portrait')[0])
im = np.asarray(Image.open('/tmp/c06/manicule.svg.png').convert('RGB')).astype(np.float32) / 255
L = lum(im)
ink = (L < 0.6).astype(np.uint8)
ys, xs = np.nonzero(ink)
im, L, ink = [a[ys.min():ys.max() + 1, xs.min():xs.max() + 1] for a in (im, L, ink)]
d = cv2.morphologyEx(ink * 255, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
d = np.pad(d, 4)
ff = d.copy(); m = np.zeros((d.shape[0] + 2, d.shape[1] + 2), np.uint8)
cv2.floodFill(ff, m, (0, 0), 128)
sil = (ff != 128).astype(np.float32)[4:-4, 4:-4]
sil = cv2.GaussianBlur(sil, (3, 3), 0)
W = 640; H = int(round(sil.shape[0] * W / sil.shape[1]))
sil = cv2.resize(sil, (W, H), interpolation=cv2.INTER_AREA)
Ls = cv2.resize(L, (W, H), interpolation=cv2.INTER_AREA)
k = np.clip((0.75 - Ls) / 0.5, 0, 1)[..., None]            # ink coverage
paper = PAPER_W * np.array([1.0, 0.985, 0.95], np.float32)
rgb = paper * (1 - k) + INK * k
piece = sticker(np.dstack([rgb, sil]), r=5, seed=41)
save('manicule', piece)
lay = json.load(open(OUT + 'layout.json')); lay['manicule'] = layout['manicule']
# fingertip = right-most silhouette point (in padded piece coords)
a = piece[..., 3] > 0.5; ys, xs = np.nonzero(a); i = xs.argmax()
lay['manicule']['tip'] = [int(xs[i]), int(ys[i])]
json.dump(lay, open(OUT + 'layout.json', 'w'), indent=1)
print(lay['manicule'])
