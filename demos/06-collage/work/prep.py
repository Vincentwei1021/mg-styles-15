"""Asset prep for 06-collage: halftone + polygonal scissor-cut white border baked into every cutout.
Run: python3 demos/06-collage/work/prep.py   (deterministic, seeded)  -> demos/06-collage/assets/gen/*.png + layout.json
"""
import json, os
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..')) + '/'
IM = ROOT + 'assets/images/'
TX = ROOT + 'assets/textures/'
D = ROOT + 'demos/06-collage/'
OUT = D + 'assets/gen/'
os.makedirs(OUT, exist_ok=True)
RNG = np.random.default_rng(606)
PAPER_W = np.array([244, 239, 228], np.float32) / 255
INK = np.array([28, 24, 20], np.float32) / 255
layout = {}


def load_rgba(p):
    return np.asarray(Image.open(p).convert('RGBA')).astype(np.float32) / 255


def resize(a, w, h):
    return cv2.resize(a, (int(w), int(h)), interpolation=cv2.INTER_AREA if w < a.shape[1] else cv2.INTER_CUBIC)


def spot(h, w, period, angle):
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    a = np.deg2rad(angle)
    u = (x * np.cos(a) + y * np.sin(a)) / period
    v = (-x * np.sin(a) + y * np.cos(a)) / period
    return (np.cos(2 * np.pi * u) + np.cos(2 * np.pi * v)) * 0.25 + 0.5


def screen(cov, period, angle):
    T = spot(cov.shape[0], cov.shape[1], period, angle)
    aa = 1.6 / period
    return np.clip((cov - T) / aa + 0.5, 0, 1)


def lum(rgb):
    return rgb[..., 0] * 0.3 + rgb[..., 1] * 0.59 + rgb[..., 2] * 0.11


def halftone_mono(rgb, period=6.5, angle=45, lo=0.06, hi=0.93, gamma=0.95, tone=0.3, tint=(0.93, 0.88, 0.78)):
    L = np.clip((lum(rgb) - lo) / (hi - lo), 0, 1) ** gamma
    ink = screen(1 - L, period, angle)[..., None]
    paper = PAPER_W * np.array(tint, np.float32) / np.array(tint).max()
    base = paper * (1 - tone + tone * L[..., None])      # faint continuous tone under the dots (newspaper repro)
    return base * (1 - ink) + INK * ink


def halftone_cmyk(rgb, period=6.0, mix=0.6, sat=1.1):
    g = lum(rgb)[..., None]
    rgb = np.clip(g + (rgb - g) * sat, 0, 1)
    C, M, Y = 1 - rgb[..., 0], 1 - rgb[..., 1], 1 - rgb[..., 2]
    K = np.minimum(np.minimum(C, M), Y)
    den = 1 - K + 1e-5
    C, M, Y = (C - K) / den, (M - K) / den, (Y - K) / den
    out = np.ones_like(rgb) * PAPER_W
    for cov, ang, col in ((C, 15, (0.0, 0.62, 0.88)), (M, 75, (0.9, 0.12, 0.48)), (Y, 0, (1.0, 0.9, 0.05)),
                          (K * 0.95, 45, (0.11, 0.1, 0.09))):
        ink = screen(cov, period, ang)[..., None]
        out = out * (1 - ink + ink * np.array(col, np.float32))
    return rgb * (1 - mix) + out * mix


def scissor_border(alpha, r=5, eps=None, close=None, seed=0):
    """Polygonal scissor cut around the silhouette: dilate, close concavities, approxPolyDP -> straight facets."""
    rng = np.random.default_rng(seed)
    H, W = alpha.shape
    a = (alpha > 0.45).astype(np.uint8) * 255
    a = cv2.morphologyEx(a, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    d = cv2.dilate(a, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1)))
    c = close or r * 3
    d = cv2.morphologyEx(d, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * c + 1, 2 * c + 1)))
    cnts, _ = cv2.findContours(d, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    ss = 3
    out = np.zeros((H * ss, W * ss), np.uint8)
    for cn in cnts:
        if cv2.contourArea(cn) < 80:
            continue
        ap = cv2.approxPolyDP(cn, eps or max(2.0, r * 0.7), True)[:, 0, :].astype(np.float32)
        ap += rng.uniform(-0.7, 0.7, ap.shape)
        cv2.fillPoly(out, [np.round(ap * ss).astype(np.int32)], 255, lineType=cv2.LINE_AA)
    out = cv2.resize(out, (W, H), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    return np.maximum(out, alpha * (cv2.dilate(a, np.ones((3, 3), np.uint8)) > 0))


def pad(rgba, p):
    return np.pad(rgba, ((p, p), (p, p), (0, 0)))


def sticker(rgba, r=5, seed=0, edge=PAPER_W):
    """rgba (already halftoned) -> white-bordered piece."""
    rgba = pad(rgba, r * 3 + 4)
    b = scissor_border(rgba[..., 3], r=r, seed=seed)
    a = rgba[..., 3:4]
    rgb = rgba[..., :3] * a + edge * (1 - a)
    return np.dstack([rgb, b])


def save(name, rgba, **meta):
    Image.fromarray(np.clip(rgba * 255 + 0.5, 0, 255).astype(np.uint8), 'RGBA').save(OUT + name + '.png', optimize=True)
    layout[name] = dict(w=rgba.shape[1], h=rgba.shape[0], **meta)
    print('saved', name, rgba.shape[1], rgba.shape[0])


def cut_item(path, h=None, w=None, mode='cmyk', r=5, seed=1, period=6.0, mix=0.6, crop=None, flip=False, **kw):
    a = load_rgba(path)
    ys, xs = np.where(a[..., 3] > 0.1)
    a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    if crop:
        H0, W0 = a.shape[:2]
        a = a[int(crop[1] * H0):int(crop[3] * H0), int(crop[0] * W0):int(crop[2] * W0)]
    if flip:
        a = a[:, ::-1]
    s = (h / a.shape[0]) if h else (w / a.shape[1])
    a = resize(a, a.shape[1] * s, a.shape[0] * s)
    rgb = halftone_cmyk(a[..., :3], period, mix, **kw) if mode == 'cmyk' else halftone_mono(a[..., :3], period, **kw)
    return sticker(np.dstack([rgb, a[..., 3]]), r=r, seed=seed)


# ---------------------------------------------------------------- portrait (Pierre Petit, Met CC0)
orig = cv2.imread(IM + 'originals/vintage_portraits/cdv_man_standing_petit.jpg')
cut = load_rgba(IM + 'cutouts/vintage_portraits/cdv_man_standing_petit.png')
tpl = (cut[500:700, 380:580, 2::-1] * 255).astype(np.uint8)
res = cv2.matchTemplate(orig, tpl, cv2.TM_CCOEFF_NORMED)
_, mx, _, loc = cv2.minMaxLoc(res)
ox, oy = loc[0] - 380, loc[1] - 500
print('petit offset', ox, oy, 'score', round(mx, 3))

S = 1.15
CX0, CY0, CX1, CY1 = 640, 410, 1300, 1250           # crop in ORIGINAL coords
full = np.zeros((orig.shape[0], orig.shape[1], 4), np.float32)
h, w = cut.shape[:2]
full[oy:oy + h, ox:ox + w] = cut
bust = full[CY0:CY1, CX0:CX1]
BW, BH = int((CX1 - CX0) * S), int((CY1 - CY0) * S)
bust = resize(bust, BW, BH)
P = lambda x, y: ((x - CX0) * S, (y - CY0) * S)       # orig -> bust px
bust_rgb = halftone_mono(bust[..., :3], period=6.5, angle=45, lo=0.10, hi=0.86, gamma=1.05, tone=0.35)
bust_piece = sticker(np.dstack([bust_rgb, bust[..., 3]]), r=6, seed=7)
PADB = 6 * 3 + 4
Q = lambda x, y: [P(x, y)[0] + PADB, P(x, y)[1] + PADB]  # orig -> padded piece px
H2, W2 = bust_piece.shape[:2]

cut_pts = [(560, 648), (700, 641), (790, 650), (880, 639), (975, 646), (1070, 637), (1160, 645), (1400, 652)]
lid_poly = [Q(*p) for p in cut_pts] + [Q(1400, 300), Q(560, 300)]
jaw_poly = [Q(842, 792), Q(905, 787), Q(1048, 793), Q(1090, 852), Q(1066, 928), Q(994, 958), Q(902, 958), Q(836, 928), Q(806, 852)]


def poly_mask(poly, H, W):
    m = np.zeros((H * 3, W * 3), np.uint8)
    cv2.fillPoly(m, [np.round(np.array(poly) * 3).astype(np.int32)], 255, lineType=cv2.LINE_AA)
    return cv2.resize(m, (W, H), interpolation=cv2.INTER_AREA).astype(np.float32) / 255


lidm = poly_mask(lid_poly, H2, W2)
jawm = poly_mask(jaw_poly, H2, W2)
facem = np.clip(1 - lidm - jawm, 0, 1)
A = bust_piece[..., 3]
save('p_lid', np.dstack([bust_piece[..., :3], A * lidm]))
save('p_jaw', np.dstack([bust_piece[..., :3], A * jawm]))
save('p_face', np.dstack([bust_piece[..., :3], A * facem]))
# mouth cavity (dark), same frame as the pieces
cav = np.zeros((H2, W2, 4), np.float32)
cav[..., :3] = np.array([40, 14, 12], np.float32) / 255
cav[..., 3] = jawm * A
save('p_cavity', cav)
layout['portrait'] = dict(S=S, pad=PADB, cut=[Q(*p) for p in cut_pts], hinge=Q(700, 641), jaw_hinge=Q(945, 800),
                          head_center=Q(944, 690), head_top=Q(944, 440), mouth=Q(945, 792), chin=Q(945, 950))

# ---------------------------------------------------------------- deep space wedge (Hubble 1995 PD)
sp = load_rgba(D + 'assets/eagle_pillars.jpg')[..., :3]
sp = sp[0:2400, 0:1200]
WW, WH = 1920, 620                                     # wedge canvas == screen x 0..1920, y -120..500
spr = resize(sp, 1560, 3120)[520:520 + WH, :]
spr = np.pad(spr, ((0, 0), (180, 180), (0, 0)), mode='reflect')[:, :WW]
spr = np.clip((spr - 0.03) * 1.25, 0, 1) ** 1.1
spr = halftone_cmyk(spr, period=6.0, mix=0.45, sat=1.25)
yy = np.linspace(0, 1, WH)[:, None, None]
spr = spr * (0.55 + 0.45 * yy)                         # deeper at the top
# wedge polygon (screen coords shifted by +120 in y)
base_l, base_r, by = 625, 1065, 620
top_l, top_r, ty = 80, 1780, 0


def torn_edge(p0, p1, n, amp, rng):
    t = np.linspace(0, 1, n)
    pts = np.outer(1 - t, p0) + np.outer(t, p1)
    nrm = np.array([-(p1[1] - p0[1]), p1[0] - p0[0]], np.float32)
    nrm /= np.linalg.norm(nrm)
    off = np.zeros(n)
    for k, a in ((3, 1.0), (9, 0.5), (27, 0.25), (81, 0.12)):
        ph = rng.uniform(0, 6.28)
        off += a * np.sin(t * k * 3.1 + ph) * rng.uniform(0.6, 1.0)
    off += rng.normal(0, 0.15, n)
    return pts + np.outer(off * amp, nrm)


rng = np.random.default_rng(11)
L = torn_edge(np.array([base_l, by + 40.]), np.array([top_l, ty - 40.]), 160, 9, rng)
R = torn_edge(np.array([top_r, ty - 40.]), np.array([base_r, by + 40.]), 160, 9, rng)
poly = np.vstack([L, [[top_l, -60], [top_r, -60]], R, [[base_r, by + 60], [base_l, by + 60]]])
m = poly_mask(poly, WH, WW)
rim = poly_mask(np.vstack([torn_edge(np.array([base_l - 12, by + 40.]), np.array([top_l - 16, ty - 40.]), 160, 10, rng),
                           [[top_l - 16, -60], [top_r + 16, -60]],
                           torn_edge(np.array([top_r + 16, ty - 40.]), np.array([base_r + 12, by + 40.]), 160, 10, rng),
                           [[base_r + 12, by + 60], [base_l - 12, by + 60]]]), WH, WW)
fib = cv2.GaussianBlur(RNG.random((WH, WW)).astype(np.float32), (0, 0), 1.2)
rim = np.clip(rim * (0.75 + 0.5 * fib), 0, 1)
wedge = np.zeros((WH, WW, 4), np.float32)
wedge[..., :3] = spr * m[..., None] + PAPER_W * (1 - m[..., None])
wedge[..., 3] = np.maximum(m, rim)
save('space_wedge', wedge, anchor=[(base_l + base_r) / 2, by], y0=-120)

# ---------------------------------------------------------------- spilled items
save('earth', cut_item(IM + 'cutouts/space/earth_blue_marble_1972.png', h=230, mix=0.55, seed=21))
save('astro', cut_item(IM + 'cutouts/space/astronaut_mccandless_mmu_black.png', h=150, mix=0.5, seed=22, r=4))
save('bird_warbler', cut_item(IM + 'cutouts/birds/audubon_bay_breasted_warbler.png', h=250, seed=23))
save('bird_hawk', cut_item(IM + 'cutouts/birds/audubon_red_shouldered_hawk.png', h=230, seed=24, flip=True, crop=(0, 0, 1, 0.47)))
save('bird_whip', cut_item(IM + 'cutouts/birds/audubon_whip_poor_will.png', h=150, seed=25, crop=(0, 0, 1, 0.40)))
save('rose_purple', cut_item(IM + 'cutouts/botanical/redoute_rosa_gallica_purple.png', h=360, seed=26))
save('rose_centi', cut_item(IM + 'cutouts/botanical/redoute_rosa_centifolia.png', h=270, seed=27))
save('bfly_a', cut_item(IM + 'cutouts/butterflies_plates/butterflies_plate07_part1.png', w=190, seed=28, r=4))
save('bfly_b', cut_item(IM + 'cutouts/butterflies_plates/butterflies_plate11_part2.png', w=160, seed=29, r=4))
save('bfly_c', cut_item(IM + 'cutouts/butterflies_plates/butterflies_plate19_part1.png', w=170, seed=30, r=4))


# ---------------------------------------------------------------- cut-paper rocket (drawn, then halftoned)
def rocket_img(flame_variant=None):
    ss = 4
    W, H = 150, 340
    im = Image.new('RGBA', (W * ss, H * ss), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    cx = W / 2
    body = []
    for i in range(0, 101):
        tt = i / 100
        yv = 20 + tt * 250
        r = 42 * (np.sqrt(min(tt / 0.42, 1.0)) if tt < 0.42 else (1.0 if tt < 0.86 else 1 - (tt - 0.86) * 1.3))
        body.append((cx + r, yv))
    pts = body + [(2 * cx - x, y) for x, y in body[::-1]]
    sc = lambda p: [(x * ss, y * ss) for x, y in p]
    red, cream, dark = (206, 40, 30, 255), (238, 228, 204, 255), (40, 34, 30, 255)
    dr.polygon(sc([(cx - 40, 205), (cx - 74, 292), (cx - 70, 312), (cx - 34, 272)]), fill=red)   # fins
    dr.polygon(sc([(cx + 40, 205), (cx + 74, 292), (cx + 70, 312), (cx + 34, 272)]), fill=red)
    dr.polygon(sc([(cx - 26, 268), (cx + 26, 268), (cx + 20, 292), (cx - 20, 292)]), fill=dark)      # nozzle
    dr.polygon(sc(pts), fill=cream)
    nose = [p for p in pts if p[1] < 95]
    dr.polygon(sc(nose), fill=red)
    dr.rectangle(sc([(cx - 42, 180), (cx + 42, 192)]), fill=red)
    dr.ellipse(sc([(cx - 21, 116), (cx + 21, 158)]), fill=dark)
    dr.ellipse(sc([(cx - 14, 123), (cx + 14, 151)]), fill=(70, 120, 150, 255))
    dr.polygon(sc([(cx - 3, 190), (cx + 3, 190), (cx + 5, 300), (cx - 5, 300)]), fill=(150, 26, 20, 255))  # centre fin
    im = im.resize((W, H), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32) / 255
    x = np.linspace(-1, 1, W)[None, :, None]
    shade = np.clip(1.05 - 0.45 * np.clip(x + 0.2, 0, 2) ** 1.4, 0.35, 1.1)
    a[..., :3] = np.clip(a[..., :3] * shade, 0, 1)
    rgb = halftone_cmyk(a[..., :3], 5.5, 0.75)
    return sticker(np.dstack([rgb, a[..., 3]]), r=5, seed=31)


def flame_img(v):
    rng = np.random.default_rng(40 + v)
    W, H, ss = 110, 170, 4
    im = Image.new('RGBA', (W * ss, H * ss), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    for col, sc_, n in (((236, 110, 30, 255), 1.0, 9), ((250, 206, 60, 255), 0.62, 7), ((255, 246, 214, 255), 0.3, 5)):
        pts = []
        for i in range(n + 1):
            tt = i / n
            ang = np.pi * tt
            rr = (48 if i % 2 == 0 else 30) * sc_ * rng.uniform(0.85, 1.15)
            ln = (150 if i % 2 == 0 else 95) * sc_ * rng.uniform(0.8, 1.1) * np.sin(ang) ** 0.5
            pts.append((W / 2 - np.cos(ang) * rr, 8 + ln))
        pts = [(W / 2 - 34 * sc_, 6)] + pts + [(W / 2 + 34 * sc_, 6)]
        dr.polygon([(x * ss, y * ss) for x, y in pts], fill=col)
    im = im.resize((W, H), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32) / 255
    rgb = halftone_cmyk(a[..., :3], 5.5, 0.5)
    return sticker(np.dstack([rgb, a[..., 3]]), r=4, seed=41 + v)


save('rocket', rocket_img())
save('flame0', flame_img(0))
save('flame1', flame_img(1))

# ---------------------------------------------------------------- newsprint scraps (1854 Tribune + torn masks/rims)
news = load_rgba(IM + 'originals/newspapers/newspaper_ny_daily_tribune_1854.jpg')[..., :3]


def news_piece(crop, mask, rim, out_w, name, rot=0):
    nm = np.asarray(Image.open(TX + 'torn/' + mask).convert('L')).astype(np.float32) / 255
    nr = np.asarray(Image.open(TX + 'torn/' + rim).convert('RGBA')).astype(np.float32) / 255
    H0, W0 = nm.shape
    x0, y0, x1, y1 = crop
    pc = news[y0:y1, x0:x1]
    pc = resize(pc, W0, H0)
    g = lum(pc)[..., None]
    pc = np.clip(0.18 + (g - 0.15) * 1.25, 0, 1) * np.array([0.92, 0.89, 0.8], np.float32)
    s = out_w / W0
    pc, nm, nr = resize(pc, out_w, H0 * s), resize(nm, out_w, H0 * s), resize(nr, out_w, H0 * s)
    rgb = pc * nm[..., None] + nr[..., :3] * (1 - nm[..., None])
    a = np.maximum(nm, nr[..., 3])
    save(name, np.dstack([rgb, a]))


news_piece((150, 700, 1350, 1300), 'torn_mask_04_2400x1350.png', 'torn_rim_04_2400x1350.png', 760, 'news_a')
news_piece((1200, 1500, 2000, 2560), 'torn_mask_02_1536x2048.png', 'torn_rim_02_1536x2048.png', 420, 'news_b')

# ---------------------------------------------------------------- pages
kraft = load_rgba(TX + 'paper/Paper006_4K_color.jpg')[..., :3]
kraft = resize(kraft[400:400 + 2304, 0:4096], 1920, 1080)
yy, xx = np.mgrid[0:1080, 0:1920].astype(np.float32)
vig = 1 - 0.28 * (((xx - 960) / 1100) ** 2 + ((yy - 540) / 800) ** 2)
kraft = np.clip(kraft * 1.02 * vig[..., None], 0, 1)
Image.fromarray((kraft * 255).astype(np.uint8)).save(OUT + 'page_kraft.jpg', quality=93)
ink = np.asarray(Image.open(TX + 'riso/riso_ink_coverage_02_2048.png').convert('L')).astype(np.float32)[:1080, :1920] / 255
fine = load_rgba(TX + 'paper/Paper001_4K_color.jpg')[..., :3]
fine = resize(fine[:2304, :4096], 1920, 1080)
red = np.array([210, 38, 28], np.float32) / 255
cov = 0.84 + 0.16 * ink
endp = (PAPER_W * (1 - cov[..., None]) + red * cov[..., None]) * (fine / fine.mean((0, 1)))
endp = np.clip(endp * (1 - 0.22 * (((xx - 960) / 1150) ** 2 + ((yy - 540) / 820) ** 2))[..., None], 0, 1)
Image.fromarray((endp * 255).astype(np.uint8)).save(OUT + 'page_red.jpg', quality=93)

json.dump(layout, open(OUT + 'layout.json', 'w'), indent=1)

# contact sheet
names = [k for k in layout if os.path.exists(OUT + k + '.png')]
sheet = Image.new('RGB', (1800, 1100), (120, 110, 100))
x = y = 0
rowh = 0
for n in names:
    im = Image.open(OUT + n + '.png')
    im.thumbnail((360, 360))
    if x + im.width > 1800:
        x, y = 0, y + rowh + 6
        rowh = 0
    sheet.paste(im, (x, y), im)
    x += im.width + 6
    rowh = max(rowh, im.height)
sheet.save(D + 'work/prep_sheet.jpg', quality=85)
