# Prepares footage plates: resized photos + BiRefNet cutout of the tuxedo cat (for the ray-background hero shot)
from PIL import Image, ImageFilter
from rembg import remove, new_session
import numpy as np
import os
SRC=os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..')) + '/assets/images/originals/cats/'
import sys
if len(sys.argv)==1:
  tux=Image.open(SRC+'cat_black_white_fluffy.jpg').convert('RGB').resize((2400,2400),Image.LANCZOS)
  tux.save('tux.jpg',quality=92)
  grey=Image.open('cat_grey_face.jpg').convert('RGB').resize((3300,2200),Image.LANCZOS); grey.save('grey.jpg',quality=92)
  Image.open(SRC+'cat_white_sitting.jpg').convert('RGB').save('white.jpg',quality=94)
  s=new_session('birefnet-general')
  cut=remove(tux,session=s,post_process_mask=True)
  a=np.array(cut)[...,3].astype(np.float32)
# slight choke + feather so fur edge blends over rays
  am=Image.fromarray(a.astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
  out=tux.copy(); out.putalpha(am); out.save('tux_cut.png')
  print('ok', tux.size, grey.size)
# session 2: denoise + sharpen the soft white-cat plate
  w=Image.open('white.jpg').convert('RGB').filter(ImageFilter.MedianFilter(3)).filter(ImageFilter.UnsharpMask(radius=2.2,percent=85,threshold=2)).filter(ImageFilter.UnsharpMask(radius=0.8,percent=40,threshold=1))
  w.save('white_sharp.jpg',quality=95)
# session 2b: phone "portrait mode" depth on the white-cat plate: sharp BiRefNet cat over a depth-graded blurred ground
# (hides the source JPEG blockiness in the cobbles and makes the subject pop)
def white_dof():
    src=Image.open('white.jpg').convert('RGB'); W,H=src.size
    sharp=Image.open('white_sharp.jpg').convert('RGB')
    m=np.array(remove(src,session=new_session('birefnet-general'),post_process_mask=True))[...,3]
    am=Image.fromarray(m).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(2.0))
    base=src.filter(ImageFilter.MedianFilter(5))
    b1=np.array(base.filter(ImageFilter.GaussianBlur(2.5)),np.float32); b2=np.array(base.filter(ImageFilter.GaussianBlur(9)),np.float32)
    y=np.linspace(0,1,H)[:,None,None]; w=np.clip(np.abs(y-.80)/.45,0,1)**1.2   # in focus at the paws, softer far away
    bg=Image.fromarray((b1*(1-w)+b2*w).clip(0,255).astype(np.uint8))
    out=Image.composite(sharp,bg,am); out.save('white_dof.jpg',quality=95)
if __name__=='__main__' and 'dof' in __import__('sys').argv: white_dof()

# ---------- refinement round 1 ----------
def r1():
    """Clean the tux matte (islands, fringe), remove green crumbs, build 3 boiled sticker-outline masks,
    and retouch the grey cat's red scratch wounds. Writes *_r1 files so the originals stay intact."""
    import cv2
    from scipy import ndimage as ndi
    # --- tux: crumbs (saturated green specks inside the cat), matte islands, edge decontamination
    tux = cv2.imread('tux.jpg'); a = np.array(Image.open('tux_cut.png'))[..., 3].astype(np.float32) / 255
    hsv = cv2.cvtColor(tux, cv2.COLOR_BGR2HSV)
    H, S, V = hsv[..., 0].astype(int) * 2, hsv[..., 1] / 255, hsv[..., 2] / 255
    green = (H > 65) & (H < 170) & (S > .28) & (V > .15) & (a > .9)
    lab, n = ndi.label(green); sz = ndi.sum(green, lab, range(1, n + 1))
    yy, xx = np.mgrid[:a.shape[0], :a.shape[1]]                                          # keep the green irises only
    eyes = ((yy - 873) ** 2 + (xx - 1272) ** 2 < 70 ** 2) | ((yy - 905) ** 2 + (xx - 1503) ** 2 < 64 ** 2)
    crumbs = np.isin(lab, [i + 1 for i, s in enumerate(sz) if 3 <= s < 2500]) & ~eyes
    # dark dirt specks on the white chest (jury: (720,1070) / (515,1330) at 5.10 -> image ~(1602,1301) / (1377,1587))
    vmed = cv2.medianBlur(hsv[..., 2], 31) / 255; chest = np.zeros(a.shape, bool); chest[1100:1850, 1100:1850] = True
    specks = (vmed - V > .25) & (vmed > .62) & chest & (a > .9)
    lab2, n2 = ndi.label(specks); sz2 = ndi.sum(specks, lab2, range(1, n2 + 1))
    crumbs |= np.isin(lab2, [i + 1 for i, s in enumerate(sz2) if 2 <= s < 1500]); print('specks', int(np.sum((sz2 >= 2) & (sz2 < 1500))))
    info = [(int(s), [int(v) for v in ndi.center_of_mass(green, lab, i + 1)]) for i, s in enumerate(sz) if s >= 3]
    print('green comps (size,[y,x]) top:', sorted(info, reverse=True)[:12])
    cm = cv2.dilate(crumbs.astype(np.uint8), np.ones((7, 7), np.uint8))
    tuxc = cv2.inpaint(tux, cm, 7, cv2.INPAINT_TELEA); cv2.imwrite('tux_r1.jpg', tuxc, [cv2.IMWRITE_JPEG_QUALITY, 93])
    lab, n = ndi.label(a > .5, structure=np.ones((3, 3))); sz = ndi.sum(a > .5, lab, range(1, n + 1))
    keep = np.isin(lab, [i + 1 for i, s in enumerate(sz) if s >= .05 * sz.max()])
    print('matte comps', n, 'kept', int(np.sum(sz >= .05 * sz.max())))
    keep = ndi.binary_fill_holes(keep); keepd = cv2.dilate(keep.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(np.float32)
    a2 = a * keepd
    a2 = cv2.erode(a2, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))           # choke 2 px
    a2 = cv2.GaussianBlur(a2, (0, 0), 1.5)                                              # feather 1.5 px
    rgb = cv2.cvtColor(tuxc, cv2.COLOR_BGR2RGB).astype(np.float32)
    M = (a > .95).astype(np.float32)
    fill = cv2.GaussianBlur(rgb * M[..., None], (0, 0), 5) / np.maximum(cv2.GaussianBlur(M, (0, 0), 5), 1e-4)[..., None]
    band = np.clip((.97 - a) / .5, 0, 1)[..., None] * (a > .02)[..., None]              # edge band -> interior colour
    rgb2 = rgb * (1 - band) + fill * band
    g = rgb2.mean(2, keepdims=True); rgb2 = g + (rgb2 - g) * (1 - .7 * band)          # kill blue/green spill
    blue = ((H >= 170) & (H <= 260) & (S > .12) & ~eyes)[..., None]                       # cyan/blue wall spill in the fur
    rgb2 = np.where(blue, g + (rgb2 - g) * .12, rgb2)
    Image.fromarray(np.dstack([rgb2.clip(0, 255), a2 * 255]).astype(np.uint8)).save('tux_cut_r1.png')
    # --- sticker outline masks: 9 px dilation, boundary boiled by low-freq noise (3 drawings for a 12 fps boil)
    b = (a2 > .5).astype(np.uint8); dist = cv2.distanceTransform(1 - b, cv2.DIST_L2, 5)
    rng = np.random.default_rng(5)
    for k in range(3):
        nz = cv2.resize(rng.standard_normal((48, 48)).astype(np.float32), b.shape[::-1], interpolation=cv2.INTER_CUBIC)
        r = 10 + 3.2 * nz / (np.abs(nz).max() + 1e-6) * 1.6
        o = np.clip((r - dist) / 1.3 + .5, 0, 1)
        w = Image.new('RGBA', o.shape[::-1], (255, 255, 255, 0)); w.putalpha(Image.fromarray((o * 255).astype(np.uint8), 'L')); w.save(f'tux_outline{k}.png', optimize=True)
    # --- grey cat: inpaint the red scratch wounds + dark crust on the face, then re-grain
    gr = cv2.imread('grey.jpg'); hsv = cv2.cvtColor(gr, cv2.COLOR_BGR2HSV)
    H, S, V = hsv[..., 0].astype(int) * 2, hsv[..., 1] / 255, hsv[..., 2] / 255
    box = np.zeros(S.shape, bool); box[900:1950, 1450:2700] = True
    red = (((H >= 340) | (H <= 18)) & (S > .30) & (V > .12) & box) | (((H >= 340) | (H <= 30)) & (S > .38) & (V > .08) & box)
    red = ndi.binary_opening(red, iterations=1)
    lab, n = ndi.label(red); sz = ndi.sum(red, lab, range(1, n + 1))
    red = np.isin(lab, [i + 1 for i, s in enumerate(sz) if s >= 12])
    print('red px', int(red.sum()), 'comps', int(np.sum(sz >= 12)), 'bbox', np.argwhere(red).min(0) if red.any() else None, np.argwhere(red).max(0) if red.any() else None)
    rm = cv2.dilate(red.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13)))
    out = cv2.inpaint(gr, rm, 9, cv2.INPAINT_TELEA).astype(np.float32)
    hp = gr.astype(np.float32) - cv2.GaussianBlur(gr.astype(np.float32), (0, 0), 2)
    ring = (cv2.dilate(rm, np.ones((31, 31), np.uint8)) > 0) & (rm == 0)
    sd = hp[ring].std(); nz = cv2.GaussianBlur(np.random.default_rng(1).standard_normal(gr.shape[:2]).astype(np.float32), (0, 0), .8)
    out += (rm > 0)[..., None] * nz[..., None] * sd * 1.6
    cv2.imwrite('grey_r1.jpg', out.clip(0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 93])
    # debug sheet: tux cut on magenta w/ 200px grid | grey face before / after
    tc = np.array(Image.open('tux_cut_r1.png').convert('RGBA')).astype(np.float32)
    bg = np.zeros_like(tc[..., :3]); bg[:] = (255, 0, 200); comp = tc[..., :3] * (tc[..., 3:] / 255) + bg * (1 - tc[..., 3:] / 255)
    comp[::200, :] = 255; comp[:, ::200] = 255; comp = cv2.resize(comp.astype(np.uint8), (1000, 1000))
    fb = cv2.cvtColor(gr[900:1950, 1450:2700], cv2.COLOR_BGR2RGB); fa = cv2.cvtColor(out.clip(0, 255).astype(np.uint8)[900:1950, 1450:2700], cv2.COLOR_BGR2RGB)
    fb = cv2.resize(fb, (600, 504)); fa = cv2.resize(fa, (600, 504))
    sheet = np.full((1008, 1600, 3), 30, np.uint8); sheet[:1000, :1000] = comp; sheet[:504, 1000:] = fb; sheet[504:, 1000:] = fa
    Image.fromarray(sheet).save('/tmp/hz_r1_debug.jpg', quality=88)
if __name__ == '__main__' and 'r1' in __import__('sys').argv: r1()
