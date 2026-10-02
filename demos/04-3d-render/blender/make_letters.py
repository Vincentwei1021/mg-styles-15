"""Build inflated 'soft' letter meshes (system python: numpy/scipy/skimage/PIL).
Pipeline: Fredoka (OFL) wght 700 glyph -> hi-res mask -> signed distance -> pillow heightfield
-> implicit volume |z| - h(x,y) -> marching cubes -> PLY per glyph (units: x-height = 1.0)."""
import numpy as np, json, os, sys
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage
from skimage import measure

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
V5 = os.environ.get('V5') == '1'   # v5 reel title: slots s/o/f/t get the glyphs 3/D/渲/染 (ResourceHanRounded Heavy)
OUT = f'{ROOT}/demos/04-3d-render/assets/mesh' + ('_v5' if V5 else '')
os.makedirs(OUT, exist_ok=True)
FONT = f'{ROOT}/assets/fonts/latin/fredoka/Fredoka-VF.ttf'
PX = 1000                      # font px size for raster
HI = 2                         # hi-res factor
if V5:
    FONT = f'{ROOT}/assets/fonts/cjk/resourcehanrounded/ResourceHanRoundedCN-Heavy.ttf'
    f = ImageFont.truetype(FONT, PX * HI)
else:
    f = ImageFont.truetype(FONT, PX * HI)
    f.set_variation_by_axes([700, 100])
XH = (992 - 465) * HI          # x-height in hi-res px  -> 1.0 unit
BASE = 992 * HI                # baseline y in raster coords (from getbbox)
S = XH                         # px per unit (hi-res)
VOX = 1 / 170.0                # marching-cubes voxel (units)

R = 0.22      # rim radius (units) -> round tube profile
H = 0.23      # max half-thickness
PUFF = 0.05   # extra pillow bulge at wide areas
EMB = 0.0     # outline offset (units): v5 fattens the thin CJK strokes a little (balloon look, counters stay open)
CHARS = {c: c for c in 'soft'}
if V5:
    CHARS = {'s': '3', 'o': 'D', 'f': '渲', 't': '染'}
    bb_ = f.getbbox('渲')
    S = (bb_[3] - bb_[1]) / 1.05   # ideograph height 1.05 u (x-height of the old 's' = 1.0 u) -> same camera framing
    BASE = f.getbbox('D')[3]       # Latin baseline; every glyph is re-seated on its own lowest point below
    R, H, PUFF, EMB = 0.085, 0.15, 0.03, 0.012

meta = {}
S0 = S
for ch in 'soft':
    gch = CHARS[ch]
    S = S0 / (1.1 if V5 and ch in 'so' else 1.0)   # v5: Latin 3/D optically enlarged 10 % next to the ideographs
    bb = f.getbbox(gch)
    pad = int(0.35 * S)
    w = bb[2] - bb[0] + 2 * pad; h = bb[3] - bb[1] + 2 * pad
    im = Image.new('L', (w, h), 0)
    ImageDraw.Draw(im).text((pad - bb[0], pad - bb[1]), gch, font=f, fill=255)
    m = np.asarray(im).astype(np.float32) / 255.0
    inside = m > 0.5
    din = ndimage.distance_transform_edt(inside)
    dout = ndimage.distance_transform_edt(~inside)
    sd = (dout - din) / S                         # signed distance, units (neg inside)
    sd = ndimage.gaussian_filter(sd, 1.2) - EMB
    # downsample to voxel grid
    step = S * VOX
    ny, nx = int(h / step), int(w / step)
    yy = (np.arange(ny) + 0.5) * step; xx = (np.arange(nx) + 0.5) * step
    sdv = ndimage.map_coordinates(sd, np.meshgrid(yy, xx, indexing='ij'), order=1)
    din_u = np.clip(-sdv, 0, None)
    s = np.clip(din_u / R, 0, 1)
    prof = np.sqrt(np.clip(1 - (1 - s) ** 2, 0, 1)) * H
    wide = ndimage.gaussian_filter((sdv < 0).astype(np.float32), 0.18 / VOX)
    prof = prof + PUFF * np.clip(wide - 0.35, 0, None) / 0.65 * s
    zmax = H + PUFF + 0.05
    nz = int(2 * zmax / VOX) + 1
    zz = (np.arange(nz) - (nz - 1) / 2) * VOX
    # implicit: |z| - prof inside; outside positive
    phi = np.abs(zz)[None, None, :] - prof[:, :, None]
    phi = np.where((sdv > 0)[:, :, None], np.abs(zz)[None, None, :] + sdv[:, :, None], phi)
    phi = np.pad(phi, 2, constant_values=1.0)
    verts, faces, normals, _ = measure.marching_cubes(phi.astype(np.float32), 0.0, spacing=(VOX, VOX, VOX))
    # verts in (row=y_img, col=x_img, z) with pad offset 2 voxels
    vy = verts[:, 0] - 2 * VOX; vx = verts[:, 1] - 2 * VOX; vz = verts[:, 2] - 2 * VOX - (nz - 1) / 2 * VOX
    # world: X = right, Z = up (image y down), Y = depth (thickness)
    X = vx - (pad - bb[0]) / S               # glyph origin (pen position) at x=0
    Z = (BASE - (vy * S - (pad - bb[1]) + 0) ) / S  # placeholder, fixed below
    # image row coordinate in raster px: row_px = vy*S ; raster row r corresponds to font y = r - (pad - bb[1])
    font_y = vy * S - (pad - bb[1])
    Z = (BASE - font_y) / S                  # height above baseline, units
    if V5:
        Z = Z - Z.min()                      # v5: each glyph rests on its own lowest point (CJK sit below the Latin baseline)
    Y = vz
    V = np.stack([X, Y, Z], 1)
    # Taubin smoothing (no shrink) to remove marching-cubes terracing that shows in glossy highlights
    from scipy.sparse import coo_matrix, diags
    nv = len(V)
    E = np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]])
    E = np.concatenate([E, E[:, ::-1]])
    Adj = coo_matrix((np.ones(len(E)), (E[:, 0], E[:, 1])), shape=(nv, nv)).tocsr()
    Adj.data[:] = 1.0
    deg = np.asarray(Adj.sum(1)).ravel()
    Wn = diags(1 / np.maximum(deg, 1)) @ Adj
    for it in range(14):
        for lam in (0.55, -0.58):
            V = V + lam * (Wn @ V - V)
    # faces orientation: marching cubes on (y,x,z) index order -> flip to keep outward normals in (x,y,z)
    F = faces[:, ::-1]
    # sanity: compute signed volume, flip if negative
    a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    vol = np.einsum('ij,ij->i', a, np.cross(b, c)).sum() / 6
    if vol < 0: F = F[:, ::-1]
    path = f'{OUT}/glyph_{ch}.ply'
    with open(path, 'wb') as fp:
        fp.write(f'ply\nformat binary_little_endian 1.0\nelement vertex {len(V)}\nproperty float x\nproperty float y\nproperty float z\nelement face {len(F)}\nproperty list uchar int vertex_indices\nend_header\n'.encode())
        fp.write(V.astype('<f4').tobytes())
        rec = np.zeros(len(F), dtype=[('n', 'u1'), ('a', '<i4'), ('b', '<i4'), ('c', '<i4')])
        rec['n'] = 3; rec['a'] = F[:, 0]; rec['b'] = F[:, 1]; rec['c'] = F[:, 2]
        fp.write(rec.tobytes())
    meta[ch] = dict(**({"char": gch} if V5 else {}), advance=f.getlength(gch) / S, xmin=float(X.min()), xmax=float(X.max()), zmin=float(Z.min()), zmax=float(Z.max()),
                    ymin=float(Y.min()), ymax=float(Y.max()), verts=len(V), faces=len(F), vol=float(abs(vol)))
    print(ch, meta[ch])
json.dump(meta, open(f'{OUT}/glyphs.json', 'w'), indent=1)
