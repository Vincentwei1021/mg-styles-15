# Refinement round 2, session 2: (a) ear-flick overlay sprites for shot 1 (white_dof.jpg, viewer-right ear rotated
# clockwise about its outer base with a smooth falloff; full-size transparent PNGs so #i1's placement applies 1:1),
# (b) grey_r2.jpg: grey-cat residue (brown tear stain at the inner eye corner + faint reddish scratch lines) removed.
# Run from demos/18-hanazi/assets.
import numpy as np, cv2
from PIL import Image

def ear():
    im = np.array(Image.open('white_dof.jpg').convert('RGB')).astype(np.float32)
    h, w = im.shape[:2]; yy, xx = np.mgrid[:h, :w].astype(np.float32)
    px, py = 1286., 440.                                   # pivot: centre of the right ear base
    up = np.clip((448. - yy) / 70., 0, 1); up = up * up * (3 - 2 * up)          # 0 at the base -> 1 above it
    r = np.sqrt(((xx - 1293) / 84.) ** 2 + ((yy - 345) / 128.) ** 2)
    lat = 1 - np.clip((r - .8) / .45, 0, 1); lat = lat * lat * (3 - 2 * lat)
    wgt = up * lat
    x0, x1, y0, y1 = 1080, 1520, 120, 520
    for deg in (6, 11, 16):
        th = -np.deg2rad(deg) * wgt                         # inverse map: sample the source at R(-th)(p - pivot)
        dx, dy = xx - px, yy - py
        sx = px + dx * np.cos(th) - dy * np.sin(th); sy = py + dx * np.sin(th) + dy * np.cos(th)
        out = cv2.remap(im, sx, sy, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
        a = np.zeros((h, w), np.float32); a[y0:y1, x0:x1] = 1
        a = cv2.GaussianBlur(a, (0, 0), 18) * (cv2.GaussianBlur((wgt > .002).astype(np.float32), (0, 0), 14) > .01)
        a = np.clip(cv2.GaussianBlur(np.maximum(a, (wgt > .002)), (0, 0), 10), 0, 1)
        Image.fromarray(np.dstack([out.clip(0, 255), a * 255]).astype(np.uint8)).save(f'white_ear{deg}.png', optimize=True)
        print('ear', deg, 'max shift px', float(np.max(np.hypot(sx - xx, sy - yy))))

def grey():
    bgr = cv2.imread('grey_r1.jpg'); im = bgr.astype(np.float32)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV); H = hsv[..., 0].astype(int) * 2; S = hsv[..., 1] / 255.; V = hsv[..., 2] / 255.
    h, w = V.shape; yy, xx = np.mgrid[:h, :w]
    g = im.mean(2, keepdims=True)
    # (1) brown tear stain at the inner eye corner
    circ = ((xx - 2068) ** 2 + (yy - 1425) ** 2) < 62 ** 2
    stain = circ & (H <= 40) & (S > .18) & (V < .62) & (V > .13)
    m = cv2.GaussianBlur(cv2.dilate(stain.astype(np.float32), np.ones((5, 5), np.uint8)), (0, 0), 3)[..., None]
    ok = (~stain & ((xx - 2068) ** 2 + (yy - 1425) ** 2 < 140 ** 2) & (V > .13)).astype(np.float32)
    L = g[..., 0]; Lb = cv2.GaussianBlur(L * ok, (0, 0), 16) / np.maximum(cv2.GaussianBlur(ok, (0, 0), 16), 1e-3)
    Ls = cv2.GaussianBlur(L, (0, 0), 16); lift = np.clip(Lb / np.maximum(Ls, 1), 1, 1.8)[..., None]
    tint = cv2.GaussianBlur(im * ok[..., None], (0, 0), 20) / np.maximum(cv2.GaussianBlur(ok, (0, 0), 20), 1e-3)[..., None]
    tint = tint - tint.mean(2, keepdims=True)
    fixed = g * lift + tint * .8
    im = im * (1 - m) + fixed * m
    # (2) faint reddish scratch lines / flecks: kill the red chroma in the face region, keep the luma texture
    reg = (xx > 1650) & (xx < 2260) & (yy > 850) & (yy < 1720)
    b_, g_, r_ = im[..., 0], im[..., 1], im[..., 2]
    red = reg & ((H >= 330) | (H <= 34)) & (S > .09) & (r_ - (g_ + b_) / 2 > 7)
    m2 = cv2.GaussianBlur(cv2.dilate(red.astype(np.float32), np.ones((3, 3), np.uint8)), (0, 0), 1.6)[..., None]
    g2 = im.mean(2, keepdims=True); im = im * (1 - m2) + (g2 + (im - g2) * .08) * m2
    print('stain px', int(stain.sum()), 'red px', int(red.sum()))
    cv2.imwrite('grey_r2.jpg', im.clip(0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 94])

ear(); grey()
a = Image.open('grey_r1.jpg').crop((1700, 880, 2200, 1680)); b = Image.open('grey_r2.jpg').crop((1700, 880, 2200, 1680))
e0 = Image.open('white_dof.jpg').crop((1100, 150, 1500, 550)); e1 = Image.open('white_ear16.png').convert('RGBA').crop((1100, 150, 1500, 550))
e1b = e0.convert('RGBA').copy(); e1b.alpha_composite(e1)
out = Image.new('RGB', (1000 + 20 + 400, 800), 'black'); out.paste(a, (0, 0)); out.paste(b, (500, 0))
out.paste(e0, (1020, 0)); out.paste(e1b.convert('RGB'), (1020, 400)); out.save('/tmp/hz_fix.png')
