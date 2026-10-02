"""Ink-coloured 1920x1080 versions of the shared CC0 procedural dust plates (assets/textures/dust)."""
import numpy as np
from PIL import Image
import os
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
for k in range(1, 5):
    im = Image.open(f'{ROOT}/assets/textures/dust/dust_0{k}_3840x2160.png').resize((1920, 1080), Image.LANCZOS)
    a = np.asarray(im, np.float32)[..., 3] / 255.0
    out = np.zeros((1080, 1920, 4), np.uint8)
    out[..., 0], out[..., 1], out[..., 2] = 0x1c, 0x16, 0x13
    out[..., 3] = np.clip(a * 255 * 0.9, 0, 255).astype(np.uint8)
    Image.fromarray(out).save(f'{ROOT}/demos/05-cel-boil/assets/dust_ink_0{k}.png')
print('ok')
