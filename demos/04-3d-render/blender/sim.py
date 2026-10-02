"""Deterministic motion for 'soft.' — every value is a closed-form / precomputed function of time.
Run with system python:  python3 blender/sim.py   ->  work/anim.npz  +  out/events.json
Coordinates: X right, Y depth (away from the front camera), Z up. Word baseline on z=0 (= rest top of the capsules)."""
import numpy as np, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from common import *
from scipy import ndimage
from scipy.spatial import cKDTree

C = cues()
G = 16.0                                          # one gravity for everything (units/s^2)
rng = np.random.default_rng(7)
fr = np.arange(-PAD, NF + PAD)                    # frame indices
T = fr / FPS                                      # times
NT = len(T)
XS, CEN, BALL_X = layout()
GL = glyphs()


def smooth(a, b, x):
    u = np.clip((x - a) / (b - a), 0, 1)
    return u * u * (3 - 2 * u)


def expo_out(u, k=7.2, soft=0.0):
    """long-tail ease: (1-(1-u)^k); k=7.2 -> 80 % of the travel in the first 20 % of the time.
    soft>0 blends in a short ease-in (fraction of the duration) so a move does not start with a hard kick."""
    u = np.clip(u, 0, 1)
    if soft > 0:
        # reparametrise time with a smooth start: w(u) has zero slope at 0, slope 1 after `soft`
        w = np.where(u < soft, u * u / (2 * soft), u - soft / 2) / (1 - soft / 2)
        u = w
    return 1 - (1 - u) ** k


# r2 crown hang: the capsule field (NOT the ball, letters or camera) runs on its own clock tf = R(t):
# 1x -> 0.35x (ramp 6.42-6.48), held to 6.70 (~5 near-frozen apex frames), then a catch-up bump (peak ~1.35x)
# that puts the field back on the timeline by 7.8.  Rinv maps field-clock events (landings) back to real time.
def _plateau(t, a, b, c, d):
    return smooth(a, b, t) * (1 - smooth(c, d, t))
_tt = np.arange(-1.0, 12.0, 1 / 4800.0)
_w = 1 - 0.65 * _plateau(_tt, 6.42, 6.48, 6.70, 6.76)   # hold on the crown apex: field 6.46-6.54 (apexF p50 6.51)
_hann = np.where((_tt > 6.76) & (_tt < 7.80), np.sin(np.pi * np.clip((_tt - 6.76) / 1.04, 0, 1)) ** 2, 0)   # catch-up peak ~1.35x
_w = _w + _hann * np.sum(1 - _w) / np.sum(_hann)
_R = _tt[0] + np.concatenate([[0], np.cumsum((_w[1:] + _w[:-1]) / 2) / 4800.0])
W_PEAK = float(_w.max())
def R(t):
    return np.interp(t, _tt, _R)
def Rinv(tf):
    return np.interp(tf, _R, _tt)


# ---------------------------------------------------------------- capsule grid (hex cloner)
def build_grid():
    rows = []
    dy = PITCH * np.sqrt(3) / 2
    ys = np.arange(-7.6, 12.6, dy)
    for j, y in enumerate(ys):
        xs = np.arange(-12.5, 9.6, PITCH)   # r2: grid extended 30 % in -X (camera B saw its end) + (j % 2) * PITCH / 2
        rows.append(np.stack([xs, np.full_like(xs, y)], 1))
    return np.concatenate(rows)


P = build_grid()
N = len(P)
px, py = P[:, 0], P[:, 1]
rnd = rng.random((N, 6))
# r1: 1 in 40 capsules tipped over, lying on the carpet (shows the pill shape + two-tone before the hero); none near the word/ball
_L = -2.217 - 0.7
if V5:
    _L = XS['s'] + GL['s']['xmin'] + 0.035 - 0.7     # v5: the wider 3D渲染 word starts further left
# v5: every shot aimed at the first glyph's landing spot follows it (old 's' centre -1.844), the hero focus follows the ball
V5_DX = (XS['s'] + (GL['s']['xmin'] + GL['s']['xmax']) / 2 + 1.844216173957376) if V5 else 0.0
V5_DB = (BALL_X - 1.8774196131089154) if V5 else 0.0
# r2: tipped strays only in the near field (py < -3.4: out of the end frame, foreground for the macro / cam A / B);
# 1 in 200 everywhere else (they used to stack up in perspective on the horizon above the end-frame word)
_pst = np.where(py < -3.4, 1 / 40, 1 / 200)
STRAY = (rng.random(N) < _pst) & ~((np.abs(py) < 1.35) & (px > _L) & (px < 3.4)) & (py < 8.0) & (px > -9.5) & (px < 7.5)
JIT_S = 1 + 0.06 * (2 * rng.random(N) - 1)                          # +-6 % scale
JIT_TX = np.radians(4) * (2 * rng.random(N) - 1); JIT_TY = np.radians(4) * (2 * rng.random(N) - 1)   # +-4 deg tilt
# colour variants from low-frequency value noise: cream majority, lilac & peach islands, a few sprinkles
def vnoise(x, y, s, seed):
    r = np.random.default_rng(seed)
    g = r.random((64, 64))
    g = ndimage.gaussian_filter(g, 1.2, mode='wrap')
    g = (g - g.mean()) / g.std()
    return ndimage.map_coordinates(g, [(y / s) % 64, (x / s) % 64], order=1, mode='wrap')
n1 = vnoise(px, py, 0.55, 11); n2 = vnoise(px + 40, py - 13, 0.7, 23)
var = np.zeros(N, np.int32)                                       # 0 lilac (field), 1 cream, 2 peach
if False:
    var[(n1 > 0.55) | (rnd[:, 0] < 0.07)] = 1
    var[((n2 > 0.75) & (n1 <= 0.55)) | ((rnd[:, 0] > 0.955))] = 2
spin_phi = rnd[:, 1] * 2 * np.pi                                   # horizontal spin axis per capsule

# ---------------------------------------------------------------- letter geometry: bottom-height maps
def load_ply(path):
    with open(path, 'rb') as f:
        head = b''
        while not head.endswith(b'end_header\n'):
            head += f.readline()
        nv = int(head.split(b'element vertex ')[1].split(b'\n')[0])
        V = np.frombuffer(f.read(nv * 12), '<f4').reshape(nv, 3)
    return V

CELL = 0.02
LET = {}
for ch in LETTERS:
    V = load_ply(f'{MESH}/glyph_{ch}.ply').astype(np.float64)
    cx = (GL[ch]['xmin'] + GL[ch]['xmax']) / 2
    lx, ly, lz = V[:, 0] - cx, V[:, 1], V[:, 2]
    x0, y0 = lx.min() - 0.3, ly.min() - 0.3
    W = int((lx.max() - x0 + 0.3) / CELL) + 1; H = int((ly.max() - y0 + 0.3) / CELL) + 1
    B = np.full((H, W), 9.0)
    ix = ((lx - x0) / CELL).astype(int); iy = ((ly - y0) / CELL).astype(int)
    np.minimum.at(B, (iy, ix), lz)
    B = ndimage.grey_closing(B, size=3)                            # fill tiny holes in the scatter
    B = ndimage.minimum_filter(B, footprint=np.hypot(*np.mgrid[-4:5, -4:5]) <= PILL_R / CELL + 0.5)  # min over capsule disc
    foot = B < 0.12
    dist_out = ndimage.distance_transform_edt(~foot) * CELL
    LET[ch] = dict(B=B, x0=x0, y0=y0, cx=XS[ch] + cx, dist=dist_out, height=GL[ch]['zmax'],
                   width=GL[ch]['xmax'] - GL[ch]['xmin'])

def sample_map(M, x0, y0, lx, ly, fill):
    ix = np.round((lx - x0) / CELL).astype(int); iy = np.round((ly - y0) / CELL).astype(int)
    ok = (ix >= 0) & (iy >= 0) & (ix < M.shape[1]) & (iy < M.shape[0])
    out = np.full(lx.shape, fill, float)
    out[ok] = M[iy[ok], ix[ok]]
    return out

# per-pill static letter maps (letters never move in xy)
for ch, L in LET.items():
    lx, ly = px - L['cx'], py
    L['Bp'] = sample_map(L['B'], L['x0'], L['y0'], lx, ly, 9.0)
    L['dp'] = sample_map(L['dist'], L['x0'], L['y0'], lx, ly, 9.0)
    L['near'] = np.where((np.abs(lx) < L['width'] / 2 + 1.0) & (np.abs(ly) < 1.2))[0]

# ---------------------------------------------------------------- letter dynamics (1-D contact ODE, deterministic)
def bed_force(z, v, A=1.43, lam=0.02, Cd=85.0):
    """soft capsule bed: exponential stiffening spring (rest sink = SINK under 1 g) + damping, one-sided"""
    pen = -z
    if pen <= 0:
        return 0.0
    return max(A * (np.exp(min(pen / lam, 30)) - 1) - Cd * v, 0.0)


def letter_track(t_land, z0, hops=()):
    """bottom height z(t) and jelly squash s(t) from a 1-D contact ODE (deterministic, dt=1/2400).
    squash: damped oscillator kicked by the bed's deceleration (follow-through)."""
    dt = 1 / 2400.0
    t0 = t_land - np.sqrt(2 * z0 / G)
    ts = np.arange(t0, T[-1] + 0.05, dt)
    z, v, s, sv = z0, 0.0, 0.0, 0.0
    ws, zs, beta = 2 * np.pi * 3.3, 0.14, 0.56      # r1: more squash kick (softer bed decelerates less)
    zz = np.empty(len(ts)); ss = np.empty(len(ts))
    contacts, incontact, hop_i = [], False, 0
    for i, t in enumerate(ts):
        if hop_i < len(hops) and t >= hops[hop_i][0]:
            v = hops[hop_i][1]; hop_i += 1
        f = bed_force(z, v, Cd=47.0)          # r1: bouncier bed -> the rebound hop survives the lower drop
        if z < 0 and not incontact:
            contacts.append((t, abs(v))); incontact = True
        if z >= 0.004:
            incontact = False
        sa = -ws * ws * s - 2 * zs * ws * sv - beta * ((f - G) if z < 0 else 0.0)
        v += (-G + f) * dt; z += v * dt
        sv += sa * dt; s += sv * dt
        zz[i] = z; ss[i] = s
    zi = np.interp(T, ts, zz); si = np.interp(T, ts, ss)
    zi = np.where(T < t0, z0, zi); si = np.where(T < t0, 0, si)
    return zi, si, contacts


FALL_Z = {'s': 1.8, 'o': 2.9, 'f': 2.9, 't': 2.9}      # r1: released just above frame -> fall readable ~7 frames
letters = {}
events = {'letter_contacts': {}, 'ball_contacts': [], 'pill_land': [], 'pill_launch': [], 'hops': {}}
drop_rot = {  # (axis, total angle) that decays to 0 at landing  -> variety between the four drops
    's': np.array([0.0, 0.0, 0.0]),
    'o': np.array([-2 * np.pi, 0.0, 0.0]),       # forward tumble
    'f': np.array([0.0, 0.0, np.pi]),           # half spin about vertical
    't': np.array([0.0, 0.55, 0.0]),            # arrives tilted, rights itself
}
# letters hop when the shockwave front reaches them (front leaves the ball edge at shock_speed)
HOPS_F = {}                                          # field clock (front position)
for ch in LETTERS:
    dx = abs(LET[ch]['cx'] - BALL_X) - BALL_R - 0.25 * LET[ch]['width']
    HOPS_F[ch] = C['hero'] + 0.02 + max(dx, 0) / C['shock_speed']
HOPS = {ch: float(Rinv(v)) for ch, v in HOPS_F.items()}   # r2: letters (1x) hop when the slowed front really reaches them
# r2 build: the counter-sweep now travels +X (reading order) and lifts each letter in turn on the 16ths (s-o-f-t re-spelled)
CS_D = np.array([0.97, 0.24]); CS_D /= np.linalg.norm(CS_D)
CS_T0, CS_T3 = C['lifts'][0], C['lifts'][1]                      # crest under the 's' / under the 't'
CS_SP = (LET['t']['cx'] - LET['s']['cx']) * CS_D[0] / (CS_T3 - CS_T0)
CS_TM = CS_T0 - LET['s']['cx'] * CS_D[0] / CS_SP                 # crest crosses the origin
LIFT = {ch: CS_TM + LET[ch]['cx'] * CS_D[0] / CS_SP + 0.02 for ch in LETTERS}
V_LIFT = 1.55
for ch in LETTERS:
    tl = C['drops'][ch]
    thop = HOPS[ch]
    vh = G * C['hop_air'] / 2
    z, s, cts = letter_track(tl, FALL_Z[ch], hops=[(LIFT[ch], V_LIFT), (thop, vh)])
    tf0 = tl - np.sqrt(2 * FALL_Z[ch] / G)
    s = s + 0.2 * np.exp(-((T - (cts[0][0] - 1 / 24)) / 0.022) ** 2) * (T < cts[0][0])   # r1: 1-frame pre-contact stretch
    u = np.clip((T - tf0) / (tl - tf0), 0, 1)
    rot = np.outer((1 - u) ** 2.2, drop_rot[ch])
    # post-landing wobble (bend at top), gets a kick at the hop landing too
    bend = np.zeros((NT, 2))
    for (tc, vc) in cts:
        tau = T - tc
        m = tau > 0
        amp = 0.045 * min(vc / 8.0, 1.6)
        dirv = np.array([0.45 if ch in 'ft' else -0.35, 0.9]); dirv /= np.linalg.norm(dirv)
        osc = np.where(m, amp * np.exp(-np.clip(tau, 0, None) / 0.42) * np.sin(2 * np.pi * 2.7 * np.clip(tau, 0, None)), 0)
        bend += np.outer(osc, dirv)
    # idle breathing in the end hold
    idle = 0.012 * np.sin(2 * np.pi * 0.55 * T + 1.3 * LETTERS.index(ch)) * smooth(7.6, 8.6, T)
    bend[:, 1] += idle
    letters[ch] = dict(z=z, s=np.clip(s, -0.42, 0.35), rot=rot, bend=bend)
    events['letter_contacts'][ch] = [(round(a, 4), round(b, 3)) for a, b in cts]
    events.setdefault('lift', {})[ch] = [round(LIFT[ch], 4), round(min(a for a, b in cts if a > LIFT[ch] + 0.03), 4),
                                         round(float(z[(T > LIFT[ch]) & (T < LIFT[ch] + 0.4)].max() - z[np.argmin(np.abs(T - LIFT[ch]))]), 3)]
    events.setdefault('hero_hop_land', {})[ch] = round(min(a for a, b in cts if a > thop + 0.03), 4)

# ---------------------------------------------------------------- chrome period ball
TH = C['hero']
BZ0 = 9.0
def herm(t, t0, t1, z0, z1, v0, v1):
    u = np.clip((t - t0) / (t1 - t0), 0, 1); d = t1 - t0
    h00 = 2 * u**3 - 3 * u**2 + 1; h10 = u**3 - 2 * u**2 + u; h01 = -2 * u**3 + 3 * u**2; h11 = u**3 - u**2
    return h00 * z0 + h10 * d * v0 + h01 * z1 + h11 * d * v1
TC = C['ball_contact']; HA, HB = C['hang']; TIN = C['ball_enter']
def ball_track():
    # r1 speed ramp: fast entry (5.30) decelerating into a hang (5.80-5.93, ~0.05 u/frame: the chrome reads),
    # then a 1-frame slam into the bed (contact TC, so frame 144 already shows the crater). Heights = ball bottom.
    ts = np.arange(TIN - 0.3, T[-1] + 0.05, 1 / 2400.0)
    pre = np.where(ts < HA, herm(ts, TIN, HA, 3.6, 0.95, -9.5, -1.0),
          np.where(ts < HB, herm(ts, HA, HB, 0.95, 0.80, -1.0, -1.4), herm(ts, HB, TC, 0.80, 0.0, -1.4, -30.0)))
    pre = np.where(ts < TIN, 3.6 - 9.5 * (ts - TIN), pre)
    dt = 1 / 2400.0
    z, v = 0.0, -17.0
    zz = pre.copy(); cts = [(TC, 17.0)]; inc = True
    for i, t in enumerate(ts):
        if t < TC:
            continue
        f = bed_force(z, v, A=1.0, lam=0.033, Cd=62.0)   # heavy: crater ~0.28 D, one small hop, rest sink 12 % D
        if z < 0 and not inc:
            cts.append((t, abs(v))); inc = True
        if z >= 0.004:
            inc = False
        v += (-G + f) * dt; z += v * dt; zz[i] = z
    zi = np.interp(T, ts, zz); zi = np.where(T < ts[0], 20.0, zi)
    return zi, cts
ball_zb, bcts = ball_track()
events['ball_contacts'] = [(round(a, 4), round(b, 3)) for a, b in bcts]
ball_z = ball_zb + BALL_R      # centre
ball_roll = -0.35 * smooth(TH, TH + 1.2, T)   # tiny settle roll (reflections slide)

# ---------------------------------------------------------------- capsule field
def sweep(x, y, t, d, t_mid, speed, sigma, xc=0.0, yc=0.0):
    if isinstance(d, str):          # radial ring starting at t_mid, fading as it grows
        r = np.hypot(x - xc, y - yc)
        tau = t - t_mid
        u = r - speed * tau
        return np.exp(-(u / sigma) ** 2) * (tau > 0) * np.exp(-np.clip(tau, 0, None) / 1.1) * np.clip(r / 0.8, 0, 1)
    d = np.asarray(d, float); d = d / np.linalg.norm(d)
    u = (x - xc) * d[0] + (y - yc) * d[1] - speed * (t - t_mid)
    return np.exp(-(u / sigma) ** 2)

def ring(r, tau, c, lam, amp, decay):
    """travelling ripple packet (damped cosine under a gaussian envelope) — rings expanding at speed c"""
    rho = r - c * tau
    env = np.exp(-(rho / (1.1 * lam)) ** 2) * (tau > 0)
    return amp * env * np.cos(2 * np.pi * rho / lam) * np.exp(-np.clip(tau, 0, None) / decay) / np.sqrt(1 + r / 0.6)

def seg_dist(x, y, cx, half):
    dx = np.clip(np.abs(x - cx) - half, 0, None)
    return np.hypot(dx, y)

SW = [  # (direction, t_mid, speed, sigma, amp, tint, centre)
    ((0.34, -0.94), 0.12, 3.4, 0.80, 0.26, 1.0, (-1.8 + V5_DX, 0.2)),   # hook sweep: band crosses the 's' spot at 0.12 s rolling toward the lens
    (tuple(CS_D), CS_TM, CS_SP, 0.75, 0.10, 0.55, (0.0, 0.0)),    # r2 build: counter-sweep in reading order (lifts the letters)
    ('radial', C['ping'], 3.0, 0.80, 0.30, 0.85, (-1.81 + V5_DX, 0.0)),       # r1 'ping': the 's' landing fires a spherical-field ring (2.3x, ~11 frames wide)
    ((0.0, -1.0), 9.3, 1.2, 1.10, 0.06, 0.19, (0.0, 3.0)),      # end-hold breathing: horizontal band approaching from behind the word
]

def wave_height(x, y, t, tr):
    """continuous surface height (effector sweeps + contact ripples) — used for dz and for tilt via gradient"""
    h = np.zeros_like(x)
    for (d, tm, sp, sg, amp, tint, c) in SW:
        h += amp * sweep(x, y, t, d, tm, sp, sg, *c)
    for ch in LETTERS:
        L = LET[ch]
        r = seg_dist(x, y, L['cx'], L['width'] * 0.28)
        for k, (tc, vc) in enumerate(events['letter_contacts'][ch]):
            a = 0.105 * min(vc / 11.0, 1.2)
            h += ring(r, tr - tc, 3.4, 0.95, a, 0.85)
    rb = np.hypot(x - BALL_X, y)
    for k, (tc, vc) in enumerate(events['ball_contacts']):
        a = 0.16 if k == 0 else 0.05
        h += ring(rb, t - R(tc), 4.4, 1.15, a, 1.1)
    return h

def tint_field(x, y, t):
    f = np.zeros_like(x)
    for (d, tm, sp, sg, amp, tint, c) in SW:
        f += tint * sweep(x, y, t, d, tm, sp, sg * 0.9, *c)
    return np.clip(f, 0, 1)

# hero shockwave: every capsule does a flip-hop when the front passes (odd half-turns -> two-tone capsules change colour)
rb0 = np.hypot(px - BALL_X, py)
CS = C['shock_speed']
rr_ = np.clip(rb0 - BALL_R, 0, None)
t_launch = TC + rr_ / CS                                               # r1: shock starts at the visible contact
VMIN = 1.55                                                           # pinned capsules (under letters / ball): quick half flip
VRIDGE = (2.55 - 0.45 * smooth(3.0, 9.0, rr_)) * (0.96 + 0.08 * rnd[:, 3])  # r1: flip-wave front = a travelling ridge ~0.5 capsule high
# r1 crown: ~400 capsules clear half a capsule, the inner ring flies to ~1.5 x-heights; kept low right next to letters (no interpenetration)
_dl = np.min(np.stack([sample_map(LET[ch]['dist'], LET[ch]['x0'], LET[ch]['y0'], px - LET[ch]['cx'], py, 9.0) for ch in LETTERS]), 0)
_cd = np.array([4.1 - BALL_X, -4.3]); _cd /= np.linalg.norm(_cd)               # toward hero camera B (xy)
_front = ((px - BALL_X) * _cd[0] + py * _cd[1]) / np.maximum(rb0, 1e-6)
FDIR = 1 - 0.5 * smooth(-0.1, 0.75, _front)   # r2: camera side at 50 % of the back launch -> the crown ring closes
# r2: taller, wider crown (8.0 / 2.4 instead of 6.9 / 2.0)
v0 = np.maximum(8.0 * np.exp(-rr_ / 2.4) * (0.85 + 0.30 * rnd[:, 2]) * (0.25 + 0.75 * smooth(0.05, 0.55, _dl)) * FDIR, VRIDGE)
V_CAP = np.sqrt(2 * G * 0.6 * 1.0)                                    # r2: camera-side apex <= 0.6 x-heights (x-height ~1.0 u)
v0 = np.minimum(v0, V_CAP + 99 * (1 - smooth(0.05, 0.45, _front)))
# capsules pinned under letters flip while their letter is airborne; under the ball while it rebounds
under_ball = rb0 < BALL_R + 0.13
zb_after = np.where(T > TH + 0.02, ball_zb, -1)
t_ball_up = T[np.argmax(zb_after > 0.0)]
t_launch = np.where(under_ball, R(t_ball_up) + 0.01, t_launch)   # t_launch is on the field clock
v0 = np.where(under_ball, VMIN, v0)
for ch, L in LET.items():
    m_ = (L['dp'] < 0.16) & ~under_ball
    t_launch = np.where(m_, HOPS_F[ch] + 0.03, t_launch)
    v0 = np.where(m_, VMIN, v0)
launch = np.ones(N, bool)
Tair = 2 * v0 / G
k_spin = np.where(v0 > 4.2, 3, 1)                                     # odd half-turns
omega = k_spin * np.pi / Tair
v1 = 0.22 * v0; T1 = 2 * v1 / G                                       # little second bounce on landing
flare = 0.42 * np.clip((v0 - 2.6) / 4.6, 0, 1) ** 1.3 * FDIR                        # outward arc for the big ones (returns to the slot)
ux, uy = (px - BALL_X) / np.maximum(rb0, 1e-6), py / np.maximum(rb0, 1e-6)
events['pill_launch'] = sorted(float(x) for x in Rinv(t_launch[launch]))          # real time
events['pill_land'] = sorted(float(x) for x in Rinv((t_launch + Tair)[launch]))
events['crown_hang'] = [6.42, 6.48, 6.70, 6.76, round(W_PEAK, 3)]
_apex = Rinv(t_launch + v0 / G); _hh = v0 ** 2 / (2 * G)
events['crown_stats'] = dict(n_half=int((_hh > PILL_L / 2).sum()), n_xh=int((_hh > 1.0).sum()), n_front_half=int(((_hh > PILL_L / 2) & (_front > 0.3)).sum()),
                             apex_p25_p50_p75=[round(float(x), 3) for x in np.percentile(_apex[_hh > 0.5], [25, 50, 75])],
                             apexF_p10_p50_p90=[round(float(x), 3) for x in np.percentile((t_launch + v0 / G)[_hh > 0.5], [10, 50, 90])], n_05=int((_hh > 0.5).sum()), hmax=round(float(_hh.max()), 2))

# anticipation nest under the incoming ball
def nest(t):
    return smooth(5.25, 5.97, t)

EDGE = (1 - smooth(8.0, 12.5, py)) * (1 - smooth(7.8, 9.6, px)) * (1 - smooth(10.7, 12.5, -px))   # r2: asymmetric (grid extended in -X)
EDGE = EDGE ** 0.8
LOC = np.zeros((NT, N, 3), np.float32); ROT = np.zeros((NT, N, 3), np.float32); SCL = np.zeros((NT, N, 3), np.float32)
EPS = 0.04
tremble_seed = rnd[:, 4] * 100
TF = R(T)
for k, t in enumerate(T):
    tf = float(TF[k])                          # r2: field clock (crown hang)
    h = wave_height(px, py, tf, t)
    hx = (wave_height(px + EPS, py, tf, t) - wave_height(px - EPS, py, tf, t)) / (2 * EPS)
    hy = (wave_height(px, py + EPS, tf, t) - wave_height(px, py - EPS, tf, t)) / (2 * EPS)
    tilt_x = np.arctan(1.35 * hy)            # rotation about X tips the capsule toward +Y
    tilt_y = -np.arctan(1.35 * hx)
    dz = h.copy()
    sc = np.ones(N); sz = np.ones(N)
    sw = np.zeros(N)
    for (d, tm, sp, sg, amp, tint, c) in SW:
        sw += (amp / 0.2) * sweep(px, py, tf, d, tm, sp, sg, *c)
    sc += 0.28 * sw; sz += 0.34 * sw
    fx = tint_field(px, py, tf)
    # --- anticipation: tremble + nest opening under the ball's shadow
    a = smooth(5.0, 5.9, t) * (t < TH + 0.02)
    near = np.exp(-(rb0 / 1.05) ** 2)
    dz += a * near * 0.018 * np.sin(2 * np.pi * 17 * t + tremble_seed)
    ne = nest(t) * (1 - smooth(TH, TH + 0.05, t))
    dz += -0.11 * ne * np.exp(-(rb0 / 0.48) ** 2) + 0.05 * ne * np.exp(-((rb0 - 0.64) / 0.22) ** 2)
    tilt_x += 0.35 * ne * np.exp(-((rb0 - 0.5) / 0.3) ** 2) * uy
    tilt_y += -0.35 * ne * np.exp(-((rb0 - 0.5) / 0.3) ** 2) * ux
    # --- ballistic launch + second bounce
    tau = tf - t_launch
    fl = launch & (tau > 0) & (tau < Tair)
    zfl = np.where(fl, v0 * tau - 0.5 * G * tau ** 2, 0)
    tau2 = tau - Tair
    b2 = launch & (tau2 > 0) & (tau2 < T1)
    zfl += np.where(b2, v1 * tau2 - 0.5 * G * tau2 ** 2, 0)
    spin = np.where(fl, omega * tau, 0)
    spin = np.where(launch & (tau >= Tair), k_spin * np.pi, spin)
    fo = np.where(fl, flare * np.sin(np.pi * np.clip(tau / np.maximum(Tair, 1e-6), 0, 1)), 0)
    # landing squash (tiny) + wobble after the second bounce
    tl2 = tau - Tair - T1
    wob = np.where(launch & (tl2 > 0), 0.22 * (v0 / 5.4) * np.exp(-np.clip(tl2, 0, None) / 0.18) * np.sin(2 * np.pi * 5.0 * np.clip(tl2, 0, None)), 0)
    tilt_x += wob * np.sin(spin_phi); tilt_y += wob * np.cos(spin_phi)
    sq_land = np.where(launch & (tau2 > 0) & (tau2 < 0.09), 0.14 * (v0 / 5.4) * np.sin(np.pi * np.clip(tau2 / 0.09, 0, 1)), 0)
    sz -= sq_land; sc += 0.5 * sq_land
    dz += zfl
    # --- contact pressing: letters
    for ch, L in LET.items():
        idx = L['near']
        zl = letters[ch]['z'][k]; sl = letters[ch]['s'][k]
        kxy = 1 / np.sqrt(max(1 + sl, 0.3))
        lx = (px[idx] - L['cx']) / kxy; ly = py[idx] / kxy
        Bp = sample_map(L['B'], L['x0'], L['y0'], lx, ly, 9.0) * (1 + sl)
        allow = zl + Bp - 0.004
        pen = np.clip(-zl, 0, None)
        dz[idx] = np.minimum(dz[idx], allow)
        # bulge + outward lean around the footprint while pressed
        dp = sample_map(L['dist'], L['x0'], L['y0'], lx, ly, 9.0)
        bul = 0.9 * pen * np.exp(-dp / 0.12) * (Bp > 0.15)
        dz[idx] += bul
        lean = 2.2 * pen * np.exp(-dp / 0.16) * (Bp > 0.15)
        gx = np.sign(px[idx] - L['cx']) * 0.25; gy = np.sign(py[idx])
        nrm = np.hypot(gx, gy) + 1e-6
        tilt_x[idx] += lean * gy / nrm
        tilt_y[idx] -= lean * gx / nrm
    # --- contact pressing: ball
    zc = ball_z[k]
    inside = rb0 < BALL_R + PILL_R * 0.7
    rr = np.minimum(rb0, BALL_R * 0.999)
    surf = zc - np.sqrt(BALL_R ** 2 - rr ** 2)
    dz = np.where(inside, np.minimum(dz, surf - 0.004), dz)
    penb = np.clip(-ball_zb[k], 0, None)
    rim = np.exp(-np.clip(rb0 - BALL_R, 0, None) / 0.13) * (~inside)
    dz += 0.6 * penb * rim
    tilt_x += 2.4 * penb * rim * uy
    tilt_y += -2.4 * penb * rim * ux
    # --- field edge falloff (MoGraph-style scale falloff into the cyc floor)
    sc *= 0.8 + 0.2 * EDGE; sz *= 0.8 + 0.2 * EDGE
    dz -= (1 - EDGE) * (PILL_L * 1.1)          # sink into the floor rather than shrink (no spiky silhouettes)
    # --- assemble
    cx_ = px + fo * ux; cy_ = py + fo * uy
    sc *= JIT_S; sz *= JIT_S
    LOC[k, :, 0] = cx_; LOC[k, :, 1] = cy_
    LOC[k, :, 2] = np.where(STRAY, dz + 0.05 + PILL_R * sc, dz - PILL_L / 2 * sz)
    ROT[k, :, 0] = tilt_x + JIT_TX; ROT[k, :, 1] = tilt_y + JIT_TY; ROT[k, :, 2] = spin + STRAY * (np.pi / 2)
    SCL[k, :, 0] = sc; SCL[k, :, 1] = sz; SCL[k, :, 2] = fx
    if k % 40 == 0:
        print('frame', fr[k], 'flying', int(fl.sum()))

# ---------------------------------------------------------------- camera
def look(p, q, roll=0.0):
    f = q - p; f /= np.linalg.norm(f)
    up = np.array([0, 0, 1.0])
    r = np.cross(f, up); r /= np.linalg.norm(r)
    u = np.cross(r, f)
    if roll:
        c, s = np.cos(roll), np.sin(roll)
        r, u = c * r + s * u, -s * r + c * u
    M = np.stack([r, u, -f], 1)       # columns = camera local x, y, z in world
    # euler XYZ (Blender): M = Rz * Ry * Rx
    ry = np.arcsin(-np.clip(M[2, 0], -1, 1))
    rx = np.arctan2(M[2, 1], M[2, 2])
    rz = np.arctan2(M[1, 0], M[0, 0])
    return np.array([rx, ry, rz])

def pose_vec(k):
    return np.array(list(k['pos']) + list(k['tgt']) + [k['lens'], k['fstop'], k.get('roll', 0.0)], float)

# key poses (pos, look-at target = focus point, lens mm, f-stop, roll)
# r1 framing (checked with work/proj.py): macro on the 's' spot; establishing keeps the word whole; hero B puts the dot on the
# right-third intersection (~1299, 641) with the 's' >= 430 px in; end frame word centre at 45 % height, far field edge at 5 %.
POSE0 = dict(pos=(-0.72, -2.75, 1.20), tgt=(-1.72, 0.10, 0.42), lens=40, fstop=0.5, roll=0.03)   # macro on the 's' landing spot
POSE0b = dict(pos=(-0.78, -2.62, 1.14), tgt=(-1.74, 0.10, 0.40), lens=40, fstop=0.5, roll=0.03)  # slow creep-in before the drop
POSE1 = dict(pos=(-2.1, -7.2, 3.3), tgt=(0.0, 0.1, 0.45), lens=45, fstop=0.8, roll=0.0)          # 3/4 establishing, whole word
POSE2 = dict(pos=(4.1, -4.3, 2.05), tgt=(0.4, 0.2, 0.42), lens=32, fstop=0.8, roll=-0.035)      # 3/4 from the right, dot on right third
POSE3 = dict(pos=(0.0, -9.9, 3.6), tgt=(0.0, 0.0, 0.30), lens=55, fstop=0.42, roll=0.0)           # frontal hero
if V5:
    def _sx(p, dx):
        return dict(p, pos=(p['pos'][0] + dx,) + tuple(p['pos'][1:]), tgt=(p['tgt'][0] + dx,) + tuple(p['tgt'][1:]))
    POSE0, POSE0b = _sx(POSE0, V5_DX), _sx(POSE0b, V5_DX)
    POSE2 = _sx(POSE2, 0.5 * V5_DB)
    # POSE1/POSE3 unchanged: the 5.5 % wider word still fits (end frame 3 -> ball 279..1628 px, ideographs ~295 px tall)
MOVES = [  # (t0, t1, target pose, k, soft)
    (-0.1, C['ping'] + 0.1, POSE0b, 1.6, 0.0),
    (C['camA'][0], C['camA'][1] + 0.9, POSE1, 5.2, 0.09),   # r2: ~5-frame ease-in (no first-frame jolt), starts after the squash peak
    (C['camB'][0], C['camB'][1] + 0.35, POSE2, 3.2, 0.3),
    (C['camC'][0], C['camC'][1] + 0.5, POSE3, 4.2, 0.12),
]
# focus targets (separate from the look target): the 's' spot, the word, the dot (hero), the word again
FOC_T = [(None, np.array([-1.80 + V5_DX, 0.0, 0.45])), (C['camA'], np.array([-0.2, 0.0, 0.5])), (C['camB'], np.array([1.55 + V5_DB, 0.0, 0.45])),
         (C['camC'], np.array([0.0, 0.0, 0.5]))]
CAM = np.zeros((NT, 9))
for i, t in enumerate(T):
    v = pose_vec(POSE0)
    for (a, b, pose, kk, soft) in MOVES:
        if t >= a:
            v = v + (pose_vec(pose) - v) * expo_out((t - a) / (b - a), kk, soft)
    CAM[i] = v
# hero kick (damped shake) after impact
tau = T - TH
kick = np.where(tau > 0, np.exp(-np.clip(tau, 0, None) / 0.16), 0)
CAM[:, 2] += 0.025 * kick * np.sin(2 * np.pi * 7.5 * np.clip(tau, 0, None) + 0.3) * (tau > 0)   # r1: the punch/shake lives in the harness
CAM[:, 0] += 0.01 * kick * np.sin(2 * np.pi * 5.3 * np.clip(tau, 0, None) + 1.1) * (tau > 0)
CAMROT = np.array([look(c[:3], c[3:6], c[8]) for c in CAM])
CAMROT[:, 2] = np.unwrap(CAMROT[:, 2])
# focus: distance to the tracked target (target point is where the eye should be)
FT = np.zeros((NT, 3))
for i, t in enumerate(T):
    v = FOC_T[0][1].copy()
    for (w, q) in FOC_T[1:]:
        if t >= w[0]:
            v = v + (q - v) * expo_out((t - w[0]) / (w[1] + 0.35 - w[0]), 3.5, 0.2)
    FT[i] = v
fwd = CAM[:, 3:6] - CAM[:, :3]; fwd /= np.linalg.norm(fwd, axis=1, keepdims=True)
FOC = np.einsum('ij,ij->i', FT - CAM[:, :3], fwd)          # focus plane distance along the view axis

np.savez_compressed(f'{WORK}/anim.npz', T=T, frames=fr, P=P, var=var, spin_phi=spin_phi, LOC=LOC, ROT=ROT, SCL=SCL,
                    CAM=CAM, CAMROT=CAMROT, FOC=FOC, ball_z=ball_z, ball_roll=ball_roll, BALL_X=BALL_X,
                    **{f'L_{ch}_z': letters[ch]['z'] for ch in LETTERS}, **{f'L_{ch}_s': letters[ch]['s'] for ch in LETTERS},
                    **{f'L_{ch}_rot': letters[ch]['rot'] for ch in LETTERS}, **{f'L_{ch}_bend': letters[ch]['bend'] for ch in LETTERS},
                    **{f'L_{ch}_x': np.array(XS[ch]) for ch in LETTERS}, **{f'L_{ch}_cx': np.array(LET[ch]['cx']) for ch in LETTERS})
events['hops'] = {k: round(v, 4) for k, v in HOPS.items()}
json.dump(events, open(f'{OUTD}/events.json', 'w'), indent=1)
print('hops', events['hops'], 'lifts', events['lift'], 'crown', events['crown_stats'], 'wpeak', W_PEAK, 'N', N, 'strays', int(STRAY.sum()))
print('N pills', N, 'launched', int(launch.sum()))
print('letter contacts', events['letter_contacts'])
print('ball contacts', events['ball_contacts'])
