"""Builds the paper plates for 05-cel-boil from ambientCG Paper001 (CC0).
paper_base.jpg  : 1920x1080 warm cream animation-bond paper (fibre tooth + soft edge falloff)
paper_tooth.png : 2048x1024 near-white tooth plate for a multiply pass over the whole frame (boils per drawing by offset)
"""
import numpy as np
from PIL import Image, ImageFilter
import os
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
src = Image.open(f'{ROOT}/assets/textures/paper/Paper001_4K_color.jpg').convert('L')
a = np.asarray(src, np.float32) / 255.0
# high-pass the luminance so only tooth / fibres remain
blur = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(24)), np.float32) / 255.0
hp = a - blur
hp = hp / (np.std(hp) + 1e-6)

def crop_resize(x, x0, y0, w, h, W, H):
    im = Image.fromarray(np.clip((x * 40 + 128), 0, 255).astype(np.uint8)).crop((x0, y0, x0 + w, y0 + h)).resize((W, H), Image.LANCZOS)
    return (np.asarray(im, np.float32) - 128) / 40

# --- base paper
W, H = 1920, 1080
d = crop_resize(hp, 200, 150, 3200, 1800, W, H)          # slightly downscaled: fine tooth
cream = np.array([246, 236, 212], np.float32) / 255.0     # #F6ECD4
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
nx, ny = (xx - W / 2) / (W / 2), (yy - H / 2) / (H / 2)
vig = 1.0 - 0.06 * np.clip((nx ** 2 * 0.8 + ny ** 2) - 0.25, 0, None)   # gentle edge falloff
# large soft mottling (hand-made sheet unevenness)
rng = np.random.default_rng(5)
m = rng.normal(0, 1, (9, 16)).astype(np.float32)
mot = np.asarray(Image.fromarray(((m - m.min()) / (np.ptp(m)) * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC), np.float32) / 255.0
mot = (mot - 0.5) * 0.025
lum = vig * (1 + 0.017 * d) + mot
img = np.clip(cream[None, None, :] * lum[..., None], 0, 1)
# a few warm fibre specks
Image.fromarray((img * 255).astype(np.uint8)).save(f'{ROOT}/demos/05-cel-boil/assets/paper_base.jpg', quality=95)

# --- tooth plate for multiply (near white, darker in the tooth valleys)
TW, TH = 2400, 1400
t = crop_resize(hp, 400, 300, 3200, 1866, TW, TH)
tooth = 1.0 - 0.10 * np.clip(-t, 0, None) - 0.03 * np.clip(t, -1, 1) * 0
tooth = np.clip(tooth, 0.6, 1.0)
Image.fromarray((tooth * 255).astype(np.uint8)).save(f'{ROOT}/demos/05-cel-boil/assets/paper_tooth.png')
print('ok', img.mean(axis=(0, 1)) * 255, tooth.mean())
