# Refinement round 2: real 炸毛 fur-explosion sprites for the hero (6.0-7.5).
# The fur is pulled outward along the local contour normal in pointy tufts (arclength-parameterised triangle
# profile). The face ellipse is protected, so the eyes and muzzle never distort. Each sprite bakes the full sticker
# stack: spiky white 炸毛 aura + navy line, the aura's hard shadow, then the sticker's hard navy shadow (60 %, +8,+10),
# a navy 3 px line and a 16 px white border (boiled ±2 px), then the cat.
# Output: hero_<name>.png, 1800x1800 (same framing as tux_cut_r1.png at 0.75 scale).
import numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi
from scipy.spatial import cKDTree

N = 1800; SC = N / 2400
FACE = (1390 * SC, 925 * SC, 262, 240)          # cx, cy, rx, ry (1800 space): eyes at (954,655) / (1127,679)
NAVY = np.array([0x1E, 0x2A, 0x78], np.float32) / 255

def smoothstep(a, b, x):
    u = np.clip((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u)

src = np.array(Image.open('tux_cut_r1.png').convert('RGBA').resize((N, N), Image.LANCZOS)).astype(np.float32) / 255
A0 = src[..., 3]
m8 = (A0 > .5).astype(np.uint8)
cs, _ = cv2.findContours(m8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
ct = max(cs, key=cv2.contourArea)[:, 0, :].astype(np.float32)
# smooth contour, uniform arclength resample (3 px)
k = cv2.getGaussianKernel(61, 12)[:, 0]
ctw = np.concatenate([ct[-30:], ct, ct[:30]])
cts = np.stack([np.convolve(ctw[:, 0], k, 'same'), np.convolve(ctw[:, 1], k, 'same')], 1)[30:-30]
seg = np.linalg.norm(np.diff(np.vstack([cts, cts[:1]]), axis=0), axis=1); s_acc = np.concatenate([[0], np.cumsum(seg)])
PER = s_acc[-1]; su = np.arange(0, PER, 3.0)
P = np.stack([np.interp(su, s_acc, np.append(cts[:, 0], cts[0, 0])), np.interp(su, s_acc, np.append(cts[:, 1], cts[0, 1]))], 1)
tg = np.roll(P, -2, 0) - np.roll(P, 2, 0); tg /= np.linalg.norm(tg, axis=1, keepdims=True) + 1e-9
nrm = np.stack([tg[:, 1], -tg[:, 0]], 1)
# make normals point outward (test a probe point against the mask)
pr = (P + nrm * 6).astype(int).clip(0, N - 1)
if m8[pr[:, 1], pr[:, 0]].mean() > .5: nrm = -nrm
print('perimeter', int(PER), 'pts', len(P))

yy, xx = np.mgrid[:N, :N].astype(np.float32)
tree = cKDTree(P)
dist_in = ndi.distance_transform_edt(m8); dist_out = ndi.distance_transform_edt(1 - m8)
sd = dist_out - dist_in                                                         # signed distance, + outside
band = (sd > -320) & (sd < 170)
q = np.stack([xx[band], yy[band]], 1); _, idx = tree.query(q)
IDX = np.zeros((N, N), np.int32); IDX[band] = idx
NX = np.zeros((N, N), np.float32); NY = np.zeros((N, N), np.float32); NX[band] = nrm[idx, 0]; NY[band] = nrm[idx, 1]
NX = cv2.GaussianBlur(NX, (0, 0), 22); NY = cv2.GaussianBlur(NY, (0, 0), 22); nl = np.sqrt(NX ** 2 + NY ** 2) + 1e-6; NX /= nl; NY /= nl
S_ARC = su[IDX]
er = np.sqrt(((xx - FACE[0]) / FACE[2]) ** 2 + ((yy - FACE[1]) / FACE[3]) ** 2)
W_FACE = smoothstep(1.0, 1.45, er)
for ex, ey in ((840, 375), (1185, 435)):                                      # ears stay pointy
    W_FACE *= 1 - .88 * np.exp(-(((xx - ex) ** 2 + (yy - ey) ** 2) / 140 ** 2))
W_FLOOR = 1 - .75 * smoothstep(1380, 1480, P[:, 1])                            # the bottom (where it sits) puffs less

def tufts(seed, lam, jit):
    """per contour point triangle-wave tuft profile 0..1 with jittered period / height"""
    R = np.random.default_rng(seed); n = int(PER / lam) + 1
    edges = np.cumsum(np.concatenate([[0], lam * (1 + R.uniform(-.28, .28, n))])); edges *= PER / edges[-1]
    hts = R.uniform(.55, 1.0, n); hts[::3] *= 1.18
    i = np.searchsorted(edges, su, side='right') - 1; i = i.clip(0, n - 1)
    u = (su - edges[i]) / (edges[i + 1] - edges[i]); u = (u + jit) % 1
    return (.5 + .5 * np.cos(2 * np.pi * (u - .5))) ** 2.2 * hts[i]

def warp(L, seed, jit):
    R = np.random.default_rng(seed + 7); lf = np.interp(su, np.linspace(0, PER, 14), np.append(R.uniform(-1, 1, 13), 0))
    lf[-1] = lf[0]
    prof = (36 + 12 * lf + 14 * tufts(seed, 150, jit)) * W_FLOOR                           # px, per contour point
    m = L * prof[IDX] * W_FACE
    g = smoothstep(-300, 0, sd); pull = np.where(band, m * g, 0).astype(np.float32)
    mx = xx - pull * NX; my = yy - pull * NY
    out = cv2.remap(src, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    return out

def aura_mask(A, L, seed, jit):
    """spiky 炸毛 silhouette around the sticker, drawn at 2x"""
    mk = (cv2.GaussianBlur(A, (0, 0), 3) > .5).astype(np.uint8)
    mk = cv2.dilate(mk, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (61, 61)))
    cs, _ = cv2.findContours(mk, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(cs, key=cv2.contourArea)[:, 0, :].astype(np.float32)
    k = cv2.getGaussianKernel(81, 16)[:, 0]; cw = np.concatenate([c[-40:], c, c[:40]])
    c = np.stack([np.convolve(cw[:, 0], k, 'same'), np.convolve(cw[:, 1], k, 'same')], 1)[40:-40]
    sg = np.linalg.norm(np.diff(np.vstack([c, c[:1]]), axis=0), axis=1); sa = np.concatenate([[0], np.cumsum(sg)]); per = sa[-1]
    uu = np.arange(0, per, 2.0)
    Q = np.stack([np.interp(uu, sa, np.append(c[:, 0], c[0, 0])), np.interp(uu, sa, np.append(c[:, 1], c[0, 1]))], 1)
    t = np.roll(Q, -3, 0) - np.roll(Q, 3, 0); t /= np.linalg.norm(t, axis=1, keepdims=True) + 1e-9
    n = np.stack([t[:, 1], -t[:, 0]], 1); pr = (Q + n * 8).astype(int).clip(0, N - 1)
    if mk[pr[:, 1], pr[:, 0]].mean() > .5: n = -n
    R = np.random.default_rng(seed + 50); lam = 88; cnt = int(per / lam) + 1
    ed = np.cumsum(np.concatenate([[0], lam * (1 + R.uniform(-.3, .3, cnt))])); ed *= per / ed[-1]
    h = R.uniform(44, 100, cnt); h[1::2] *= .6; h *= L
    i = (np.searchsorted(ed, uu, side='right') - 1).clip(0, cnt - 1); u = ((uu - ed[i]) / (ed[i + 1] - ed[i]) + jit) % 1
    off = h[i] * (1 - np.abs(2 * u - 1)) ** 1.15 * (1 - .8 * smoothstep(1360, 1470, Q[:, 1]))
    # hand-drawn wobble + slight lean of every spike (tangential shear)
    lean = (u - .5) * h[i] * .25
    poly = Q + n * off[:, None] + t * lean[:, None] + R.normal(0, .6, Q.shape)
    big = np.zeros((2 * N, 2 * N), np.uint8); cv2.fillPoly(big, [np.round(poly * 2).astype(np.int32)], 255, cv2.LINE_AA)
    return big

def comp(L, seed, jit, bseed):
    cat = warp(L, seed, jit); A = cv2.GaussianBlur(cat[..., 3], (0, 0), 4)
    D = ndi.distance_transform_edt(A < .5).astype(np.float32) - ndi.distance_transform_edt(A >= .5).astype(np.float32)
    R = np.random.default_rng(bseed); nz = cv2.GaussianBlur(R.normal(0, 1, (N, N)).astype(np.float32), (0, 0), 26); nz /= nz.std() + 1e-6
    w_edge = 1 - smoothstep(16.0 - .7, 16.0 + .7, D - 2.0 * nz)          # 16 px white, boiled ±2
    n_edge = 1 - smoothstep(19.5 - .7, 19.5 + .7, D - 2.0 * nz)          # + 3.5 px navy line
    big = aura_mask(A, L, seed, jit)
    aw = cv2.resize(big, (N, N), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    an = cv2.resize(cv2.dilate(big, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13))), (N, N), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    sh = lambda a, dx, dy: cv2.warpAffine(a, np.float32([[1, 0, dx], [0, 1, dy]]), (N, N))
    rgb = np.zeros((N, N, 3), np.float32); al = np.zeros((N, N), np.float32)
    def over(c, a):
        nonlocal rgb, al
        a = a[..., None]; c = np.broadcast_to(c, (N, N, 3)) if np.ndim(c) == 1 else c
        rgb = c * a + rgb * (1 - a); al = a[..., 0] + al * (1 - a[..., 0])
    over(NAVY, .38 * sh(an, 11, 14))        # aura hard shadow
    over(NAVY, an); over(np.ones(3, np.float32), aw)
    over(NAVY, .6 * sh(n_edge, 8.5, 10.6))  # sticker hard shadow (display ≈ +8,+10)
    over(NAVY, n_edge); over(np.ones(3, np.float32), w_edge)
    over(cat[..., :3], cat[..., 3])
    return np.dstack([rgb, al])

def save(name, im):
    Image.fromarray((im * 255 + .5).clip(0, 255).astype(np.uint8), 'RGBA').save(f'hero_{name}.png', compress_level=3); print('wrote', name)

if __name__ == '__main__':
    import sys
    looks = {'L06': (.6, 1, 0, 11), 'L12': (1.2, 1, .03, 12), 'B0': (1.0, 1, 0, 21), 'B1': (1.0, 2, .06, 22), 'B2': (1.0, 3, .11, 23), 'L135': (1.35, 1, .02, 31)}
    only = sys.argv[1:] or list(looks)
    for nm in only: save(nm, comp(*looks[nm]))
