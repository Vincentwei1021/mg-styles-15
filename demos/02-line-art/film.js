// ATELIER LINEA — "One Line". The whole film is one continuous stroke.
// Canvas2D, every frame a pure function of t. World units = poster pixels (the final frame at zoom 1).
// Round 1 refinement: source-over champagne-gold line, ink hook, branch->beam morph, punctuation holds,
// breaking-wave curl (浪), swell-to-coin hero with camera kick + reverse light pulse, bevelled medallion, signed-off end.
const Q = new URLSearchParams(location.search);
// reel v5 (?v5=1): the line writes the title 线条动画, window.linkAt(t), ?nolink=dot,tip,line,title,door. Without v5 nothing changes.
const V5 = Q.get('v5') === '1';
const NOLINK = new Set(V5 ? (Q.get('nolink') || '').split(',').filter(Boolean) : []);
const W = 1920, H = 1080, FPS = 30, DUR = V5 ? 11 : 10;   // v5: +1 s of poster so the title holds readable
window.DEMO = { width: W, height: H, fps: FPS, duration: DUR, motionBlur: { samples: 4, shutter: 0.5 } };

const cues = await (await fetch('/demos/02-line-art/cues.json')).json();
if (V5) cues.camera.poster_center = [925, 590];   // v5: the poster rides up 30 px to make room for the big title

// ---------------------------------------------------------------- utils
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const smoother = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * t * (t * (t * 6 - 15) + 10); };
function cubicBezier(p1x, p1y, p2x, p2y) {
  const bx = (t) => 3 * p1x * t * (1 - t) ** 2 + 3 * p2x * t * t * (1 - t) + t ** 3;
  const by = (t) => 3 * p1y * t * (1 - t) ** 2 + 3 * p2y * t * t * (1 - t) + t ** 3;
  return (x) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let lo = 0, hi = 1;
    for (let i = 0; i < 28; i++) { const m = (lo + hi) / 2; if (bx(m) < x) lo = m; else hi = m; }
    return by((lo + hi) / 2);
  };
}
const easeIO = cubicBezier(0.65, 0, 0.35, 1);   // the style's signature ease
const easeOut = cubicBezier(0.16, 1, 0.3, 1);
const easeSwell = cubicBezier(0.24, 0.3, 0.2, 1);   // line swells into the coin: ~15/38/58/73 % over the first 4 frames (r2: readable, not a snap)
const easePulse = cubicBezier(0.45, 0, 0.2, 1);       // light runs back anchor -> seed (r2: slower, eased)
function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rngN = mulberry(20260927); const LAT = Array.from({ length: 4096 }, () => rngN() * 2 - 1);
const vnoise = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(LAT[i & 4095], LAT[(i + 1) & 4095], u); };
function monotone(xs, ys, m0scale = 1, mEnd = null) {
  const n = xs.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  m[0] = d[0] * m0scale; m[n - 1] = mEnd == null ? d[n - 2] : mEnd;
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else { const h0 = xs[i] - xs[i - 1], h1 = xs[i + 1] - xs[i], w1 = 2 * h1 + h0, w2 = h1 + 2 * h0; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
    let k = 0; while (x > xs[k + 1]) k++;
    const h = xs[k + 1] - xs[k], s = (x - xs[k]) / h, s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * ys[k] + (s3 - 2 * s2 + s) * h * m[k] + (-2 * s3 + 3 * s2) * ys[k + 1] + (s3 - s2) * h * m[k + 1];
  };
}

// ---------------------------------------------------------------- the one line (world coords)
// organic amplitude `a` = hand-drawn wobble (nature wobbles, architecture is ruled)
// r2 wave (left-breaking, toward the sun): the horizon runs to the toe, turns in a small rounded tip and comes back as a
// concave back (~7 deg off the sea at the toe, ~80 deg under the crest). It enters a ONE-turn counter-clockwise exponential
// spiral at its right point; the inner end exits straight up and the lift crosses the lip ONCE, at ~60 deg (checked numerically).
const WV = { cx: 1400, cy: 600, r0: 64, r1: 22, th0: 0, th1: -2 * Math.PI };
const wvPt = (u) => { const th = WV.th0 + u * (WV.th1 - WV.th0), r = WV.r0 * (WV.r1 / WV.r0) ** u; return [WV.cx + r * Math.cos(th), WV.cy + r * Math.sin(th)]; };
const wvDir = (u0, u1) => { const a = wvPt(u0), b = wvPt(u1), l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
const f3 = (v) => v.toFixed(3);
function curlD() { let d = ''; for (let k = 1; k <= 220; k++) { const [x, y] = wvPt(k / 220); d += `L${f3(x)},${f3(y)} `; } return d; }
function waveD() { const J = wvPt(0), dj = wvDir(0, 0.004), b0 = [1606, 721], l = Math.hypot(26, 3), bd = [-26 / l, -3 / l];
  return `C1628,740 1632,724 1606,721 C${f3(b0[0] + 75 * bd[0])},${f3(b0[1] + 75 * bd[1])} ${f3(J[0] - 55 * dj[0])},${f3(J[1] - 55 * dj[1])} ${f3(J[0])},${f3(J[1])}`; }
function liftD() { const E = wvPt(1), de = wvDir(0.996, 1); return `C${f3(E[0] + 110 * de[0])},${f3(E[1] + 110 * de[1])} 1150,440 925,465`; }
let L_TENDRIL = 60;
const PIECES = [
  { n: 'ground0', a: 0.22, d: 'M-160,740 L272,740' },   // r2: longer run-in so frame 0 is a full slice of ink
  { n: 'seed', a: 0.3, d: 'C284,740 287,726 291,719 C294,713 298,709 302,706 C306,713 313,724 312,732 C311,739 302,742 296,740 C293,734 296,722 302,706' },
  { n: 'stem1', a: 0.4, d: 'C301,700 297,696 297,690' },
  { n: 'leaf1', a: 0.4, d: 'C288,694 267,691 253,674 C268,667 287,672 298,683' },
  { n: 'stem2', a: 0.4, d: 'C301,672 305,660 304,648' },
  { n: 'leaf2', a: 0.4, d: 'C314,650 335,646 349,628 C334,623 315,630 305,640' },
  { n: 'stem3', a: 0.4, d: 'C303,628 300,616 301,606' },
  { n: 'leaf3', a: 0.4, d: 'C293,607 279,603 270,589 C281,585 294,591 302,599' },
  { n: 'shoot', a: 0.3, d: 'C305,588 310,572 322,564 C334,558 346,560 358,560' },
  { n: 'tendril', a: 0.3, d: 'C372,560 384,552 386,540 C388,528 378,522 372,528' },   // uncurls into the beam
  { n: 'roof', a: 0.08, d: () => `M${(358 + L_TENDRIL).toFixed(3)},560 L660,560` },
  { n: 'pavilion', a: 0.06, d: 'L660,569 L462,569 L462,740 L529,740 L529,696 A22,22 0 0 1 573,696 L573,740 L660,740' },
  { n: 'tower', a: 0.05, d: 'L660,500 L742,470' },
  { n: 'tower2', a: 0.05, d: 'L742,740' },
  { n: 'sky', a: 0.05, d: 'L770,740 L770,600 L808,600 L808,562 L852,562 L852,740 L874,740 L874,668 A37,37 0 0 1 948,668 L948,740 L972,740 L972,590 L990,590 L996,528' },
  { n: 'sky2', a: 0.05, d: 'L1002,590 L1020,590 L1020,740' },
  { n: 'horizon', a: 0.14, d: 'L1600,740' },
  { n: 'wave', a: 0.3, d: waveD },
  { n: 'curl', a: 0.22, d: curlD() },
  { n: 'lift', a: 0.14, d: liftD },
  { n: 'ring', a: 0, d: 'A135,135 0 1 1 925,195 A135,135 0 1 1 925,465' },
  { n: 'foot', a: 0, d: 'A135,135 0 0 1 873,454.58' },
  { n: 'arch', a: 0, d: 'L873,318 A52,52 0 0 1 977,318 L977,454.58' },
];
const LOGO = new Set(['ring', 'foot', 'arch']);
const STEP = 0.5;
const svg = document.getElementById('svg');
const X = [], Y = [], S = [], P = [];
const pieceStart = {}, pieceEnd = {};
{
  let s0 = 0, last = null;
  PIECES.forEach((pc, pi) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const dd = typeof pc.d === 'function' ? pc.d() : pc.d;
    const d = dd.startsWith('M') ? dd : `M${last[0]},${last[1]} ${dd}`;
    el.setAttribute('d', d); svg.appendChild(el);
    const L = el.getTotalLength(), n = Math.max(2, Math.ceil(L / STEP));
    pieceStart[pc.n] = s0;
    for (let k = (pi === 0 ? 0 : 1); k <= n; k++) {
      const p = el.getPointAtLength(L * k / n);
      X.push(p.x); Y.push(p.y); S.push(s0 + L * k / n); P.push(pi);
    }
    s0 += L; pieceEnd[pc.n] = s0; last = [X[X.length - 1], Y[Y.length - 1]];
    if (pc.n === 'tendril') L_TENDRIL = L;
  });
}
const N = X.length, TOTAL = S[N - 1];
const AMP = new Float32Array(N);
for (let i = 0; i < N; i++) AMP[i] = PIECES[P[i]].a;
{
  const tmp = Float32Array.from(AMP), R = 40;
  for (let i = 0; i < N; i++) { let acc = 0, c = 0; for (let k = -R; k <= R; k += 4) { const j = clamp(i + k, 0, N - 1); acc += tmp[j]; c++; } AMP[i] = acc / c; }
}
const WX = new Float32Array(N), WY = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const a = Math.max(0, i - 2), b = Math.min(N - 1, i + 2);
  let tx = X[b] - X[a], ty = Y[b] - Y[a]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
  const w = AMP[i] * (0.75 * vnoise(S[i] / 17) + 0.45 * vnoise(S[i] / 5.5 + 300));
  WX[i] = X[i] - ty * w; WY[i] = Y[i] + tx * w;
}
// corner density -> slow the pen into corners (tau = weighted length)
const ANG = new Float32Array(N), TURN = new Float32Array(N);
for (let i = 0; i < N; i++) { const a = Math.max(0, i - 1), b = Math.min(N - 1, i + 1); ANG[i] = Math.atan2(Y[b] - Y[a], X[b] - X[a]); }
for (let i = 1; i < N; i++) { let d = ANG[i] - ANG[i - 1]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; TURN[i] = Math.abs(d); }
const CORN = new Float32Array(N);
{
  const sig = 7 / STEP, R = Math.ceil(sig * 3), ker = [];
  for (let k = -R; k <= R; k++) ker.push(Math.exp(-k * k / (2 * sig * sig)));
  const ks = ker.reduce((a, b) => a + b, 0);
  for (let i = 0; i < N; i++) { let acc = 0; for (let k = -R; k <= R; k++) { const j = i + k; if (j >= 0 && j < N) acc += TURN[j] * ker[k + R]; } CORN[i] = acc / ks / STEP; }
}
const KCORN = 9;
const TAU = new Float64Array(N);
for (let i = 1; i < N; i++) TAU[i] = TAU[i - 1] + (S[i] - S[i - 1]) * (1 + KCORN * Math.min(CORN[i], 0.3));
function idxAtS(s) { let lo = 0, hi = N - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; } return lo; }
function tauAtS(s) { const i = idxAtS(s), j = Math.min(N - 1, i + 1), f = S[j] > S[i] ? (s - S[i]) / (S[j] - S[i]) : 0; return lerp(TAU[i], TAU[j], f); }
function sAtTau(tau) { let lo = 0, hi = N - 1; if (tau <= 0) return 0; if (tau >= TAU[N - 1]) return TOTAL; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (TAU[m] <= tau) lo = m; else hi = m; } const f = (tau - TAU[lo]) / (TAU[hi] - TAU[lo] || 1); return lerp(S[lo], S[hi], f); }
const markerTau = (m) => {
  let name = m, f = 0;
  if (m.endsWith('>')) { name = m.slice(0, -1); f = 1; } else if (m.includes('@')) { [name, f] = m.split('@'); f = +f; }
  return tauAtS(lerp(pieceStart[name], pieceEnd[name], f));
};
const DK = cues.draw;   // repeated markers = punctuation holds (monotone spline eases in/out of them)
const tauOfT = monotone(DK.map((k) => k[0]), DK.map((k) => markerTau(k[1])), 1.3, 0);
const T_END = DK[DK.length - 1][0];
const headS = (t) => sAtTau(tauOfT(t));
const TD = new Float32Array(N);
{
  let j = 0; const dt = 1 / 600;
  for (let t = 0; t <= T_END + dt; t += dt) { const s = headS(t); while (j < N && S[j] <= s) { TD[j] = t; j++; } }
  for (; j < N; j++) TD[j] = T_END;
}
// branch -> beam: during the shoot hold the tendril uncurls into the straight roof line
const iT0 = idxAtS(pieceStart.tendril), iT1 = idxAtS(pieceEnd.tendril);
const MX = new Float32Array(N);
for (let i = iT0; i <= iT1; i++) MX[i] = 358 + (S[i] - pieceStart.tendril);
const MORPH = cues.morph;
const morphAt = (t) => easeIO(clamp((t - MORPH[0]) / (MORPH[1] - MORPH[0])));
const PX = (i, m) => (m > 0 && i >= iT0 && i <= iT1) ? lerp(WX[i], MX[i], m) : WX[i];
const PY = (i, m) => (m > 0 && i >= iT0 && i <= iT1) ? lerp(WY[i], 560, m) : WY[i];
function pointAtS(s, t) {
  const m = morphAt(t), i = idxAtS(s), j = Math.min(N - 1, i + 1), f = S[j] > S[i] ? clamp((s - S[i]) / (S[j] - S[i])) : 0;
  return [lerp(PX(i, m), PX(j, m), f), lerp(PY(i, m), PY(j, m), f)];
}
const tipAt = (t) => pointAtS(headS(clamp(t, 0, T_END)), clamp(t, 0, T_END));
// brightness floor per point: landscape 0.4; the lift gathers light as it rises; logo stays lit
const FLOOR = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const nm = PIECES[P[i]].n;
  if (LOGO.has(nm)) FLOOR[i] = 0.96;
  else if (nm === 'lift') FLOOR[i] = lerp(0.4, 0.96, smoother(0.1, 1, (S[i] - pieceStart.lift) / (pieceEnd.lift - pieceStart.lift)));
  else FLOOR[i] = 0.4;
}

// ---------------------------------------------------------------- camera
const ZK = cues.zoom;
const logZ = monotone(ZK.map((k) => k[0]), ZK.map((k) => Math.log(k[1])));
const CAM = cues.camera, FILL = cues.fill, WM = cues.wordmark, PULSE = cues.pulse, SEC = cues.sections;
// r2 camera clock: dT/dt eases to 0 over 4 frames before each hold, stays 0 through it, then runs fast (~2x peak) to catch up
const CT_DT = 1 / 600, CT = new Float64Array(Math.ceil(DUR / CT_DT) + 2);
{
  const HA = 0.133, HR = 0.5;
  const vel = (t) => { let v = 1; for (const [h0, h1] of cues.holds) {
    const D = h1 - h0, c = (2 * D + HA + HR) / HR;
    if (t >= h0 - HA && t < h0) v = Math.min(v, 1 - easeIO((t - h0 + HA) / HA));
    else if (t >= h0 && t < h1) v = 0;
    else if (t >= h1 && t < h1 + HR) { const q = (t - h1) / HR; v = easeIO(q) + c * Math.sin(Math.PI * q) ** 2; }
  } return v; };
  for (let i = 1; i < CT.length; i++) CT[i] = CT[i - 1] + CT_DT * 0.5 * (vel((i - 1) * CT_DT) + vel(i * CT_DT));
}
const camClock = (t) => { const x = clamp(t / CT_DT, 0, CT.length - 2), i = Math.floor(x); return lerp(CT[i], CT[i + 1], x - i); };
function camera(t) {
  let cx = 0, cy = 0, ws = 0;
  const tc = camClock(t);
  for (let k = -16; k <= 16; k++) {
    const dt = k * 0.05, w = Math.exp(-dt * dt / (2 * CAM.sigma * CAM.sigma));
    const p = tipAt(tc + CAM.lead + dt); cx += p[0] * w; cy += p[1] * w; ws += w;
  }
  cx /= ws; cy /= ws;
  const hw = 1 - smooth(0.1, 0.5, t);   // r2 hook: the camera chases the whipping tip with a 2-frame lag, then settles
  if (hw > 0) { const q = tipAt(t - cues.hook.lag); cx = lerp(cx, q[0] + cues.hook.lead_px / 5.8, hw); cy = lerp(cy, q[1], hw); }
  const e1 = easeIO(clamp((t - CAM.logo_from) / (CAM.logo_to - CAM.logo_from)));
  const e2 = easeIO(clamp((t - CAM.poster_from) / (CAM.poster_to - CAM.poster_from)));
  cx = lerp(cx, CAM.logo_center[0], e1); cy = lerp(cy, CAM.logo_center[1], e1);
  const hold = smooth(CAM.poster_to - 0.4, 10, t);
  cx = lerp(cx, CAM.poster_center[0] + hold * 4, e2); cy = lerp(cy, CAM.poster_center[1] - hold * 2, e2);
  let z = Math.exp(logZ(tc));
  const kt = t - FILL.start;   // camera kick on the hit: x1.03, decays over ~9 frames
  if (kt > 0) z *= 1 + 0.03 * (1 - Math.exp(-kt / 0.012)) * Math.exp(-kt / 0.1);
  const pz = clamp(t - cues.end_push.from, 0, V5 ? DUR - cues.end_push.from : 1);   // continuous ~3 % push through the end hold (eases in, then constant speed)
  if (pz > 0) z *= 1 + cues.end_push.amount * (pz < 0.25 ? pz * pz / 0.5 : pz - 0.125) / 0.875;
  const roll = -0.016 * Math.sin(Math.PI * smooth(SEC.horizon - 0.2, SEC.ring + 0.9, t)) ** 2;   // slight bank through the wave
  return { cx, cy, z, roll };
}
const applyCam = (g, c) => { g.setTransform(1, 0, 0, 1, 0, 0); g.translate(W / 2, H / 2); g.rotate(c.roll); g.scale(c.z, c.z); g.translate(-c.cx, -c.cy); };
const toScreen = (c, x, y) => { const dx = (x - c.cx) * c.z, dy = (y - c.cy) * c.z, cs = Math.cos(c.roll), sn = Math.sin(c.roll); return [W / 2 + dx * cs - dy * sn, H / 2 + dx * sn + dy * cs]; };

// ---------------------------------------------------------------- assets
const grain = new Image(); grain.src = '/assets/textures/grain/grain_fine_2048.png'; await grain.decode();
await document.fonts.load("500 50px 'Cormorant Garamond'", 'ATELIER LINEA');
await document.fonts.load("300 26px 'Noto Serif SC'", '始于一线');
await document.fonts.ready;

// ---------------------------------------------------------------- canvases
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return [c, c.getContext('2d')]; };
const [lineC, lg] = mk();
const [fillC, fg] = mk();
const [pulseC, pg] = mk();
const GOLD = [233, 215, 165], AGED = [150, 125, 80], HOT = [255, 246, 220], NAVY = [11, 19, 32];
const LW = +(Q.get("lw") || 3);   // constant screen-space line width, whole film (the reel renders with ?lw=4.5)
const CHUNK = 12;
const MCX = 925, MCY = 330, MR = 135, FY = 454.58;

function lineColor(b) {
  if (b <= 1) { const k = clamp((b - 0.4) / 0.6); return [lerp(AGED[0], GOLD[0], k), lerp(AGED[1], GOLD[1], k), lerp(AGED[2], GOLD[2], k)]; }
  const k = clamp((b - 1) / 0.6); return [lerp(GOLD[0], HOT[0], k), lerp(GOLD[1], HOT[1], k), lerp(GOLD[2], HOT[2], k)];
}
function doorPath(g, closed) {
  const aR = Math.atan2(FY - MCY, 52), aL = Math.atan2(FY - MCY, -52);
  g.beginPath(); g.moveTo(873, FY); g.lineTo(873, 318); g.arc(925, 318, 52, Math.PI, Math.PI * 2); g.lineTo(977, FY);
  if (closed) { g.arc(MCX, MCY, MR, aR, aL, false); g.closePath(); }
}

function drawBackground(c, t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.filter = 'none';
  ctx.fillStyle = '#0B1320'; ctx.fillRect(0, 0, W, H);
  const rg = ctx.createRadialGradient(W * 0.5, H * 0.46, 0, W * 0.5, H * 0.5, W * 0.62);
  rg.addColorStop(0, 'rgba(26,40,62,0.55)'); rg.addColorStop(0.55, 'rgba(15,25,42,0.25)'); rg.addColorStop(1, 'rgba(4,8,14,0.0)');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  const gz = 1 + (c.z - 1) * 0.55, gcx = lerp(925, c.cx, 0.55), gcy = lerp(552, c.cy, 0.55);
  const sp = 48, r = 1.05;
  ctx.fillStyle = `rgba(160,180,210,${0.075 + 0.05 * (1 - smooth(0.2, 0.5, t))})`;
  const x0 = gcx - W / 2 / gz, x1 = gcx + W / 2 / gz, y0 = gcy - H / 2 / gz, y1 = gcy + H / 2 / gz;
  for (let gx = Math.floor(x0 / sp) * sp; gx <= x1; gx += sp) for (let gy = Math.floor(y0 / sp) * sp; gy <= y1; gy += sp) {
    const sx = W / 2 + (gx - gcx) * gz, sy = H / 2 + (gy - gcy) * gz;
    ctx.fillRect(sx - r, sy - r, 2 * r, 2 * r);
  }
}

const MOTES = Array.from({ length: 44 }, (_, i) => { const r = mulberry(4000 + i * 17); return { x: r() * 2300 - 230, y: r() * 1250 - 80, d: 0.3 + r() * 1.3, s: 0.7 + r() * 1.6, a: 0.05 + r() * 0.11, ph: r() * 6.283, sp: 3 + r() * 9 }; });
function drawMotes(c, t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'screen'; ctx.filter = 'none';
  const [px, py] = CAM.poster_center;
  for (const m of MOTES) {
    const zl = 1 + (c.z - 1) * m.d, lx = lerp(px, c.cx, m.d), ly = lerp(py, c.cy, m.d);
    const wx = m.x + 12 * Math.sin(t * 0.37 + m.ph), wy = m.y - t * m.sp + 6 * Math.sin(t * 0.61 + m.ph * 1.7);
    const sx = W / 2 + (wx - lx) * zl, sy = H / 2 + (wy - ly) * zl;
    if (sx < -60 || sx > W + 60 || sy < -60 || sy > H + 60) continue;
    const r = m.s * (0.7 + 0.8 * m.d) * Math.sqrt(zl) * (m.d > 1.1 ? 3.2 : 1.6);
    const a = m.a * (m.d > 1.1 ? 0.55 : 1) * (0.8 + 0.2 * Math.sin(t * 1.3 + m.ph));
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    g.addColorStop(0, `rgba(226,196,138,${a})`); g.addColorStop(1, 'rgba(226,196,138,0)');
    ctx.fillStyle = g; ctx.fillRect(sx - r, sy - r, 2 * r, 2 * r);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawLine(c, t, sHead) {
  lg.setTransform(1, 0, 0, 1, 0, 0); lg.clearRect(0, 0, W, H);
  applyCam(lg, c);
  lg.lineCap = 'round'; lg.lineJoin = 'round';
  const iHead = idxAtS(sHead), m = morphAt(t);
  const pu = clamp((t - PULSE.start) / (PULSE.end - PULSE.start));
  const sp = TOTAL * (1 - easePulse(pu));                       // reverse pulse: anchor -> seed
  const pAmp = t > PULSE.start ? 0.9 * (1 - smooth(PULSE.end - 0.08, PULSE.end + 0.3, t)) : 0;
  const BR = cues.breath, bu = clamp((t - BR.start) / (BR.end - BR.start)), bp = TOTAL * easeIO(bu) * 1.04 - 60;
  const bAmp = 0.55 * smooth(BR.start, BR.start + 0.12, t) * (1 - smooth(BR.end - 0.1, BR.end + 0.1, t));
  const logoW = 1 - smooth(FILL.start + 0.3, FILL.start + 0.6, t);   // logo strokes hand over to the bevel
  const AN = cues.anticip, an = smooth(AN[0], AN[1], t);            // r2 anticipation: the ring thins to 1.5 px and heats
  const anW = 1 - 0.5 * an * (1 - smooth(FILL.start, FILL.start + 0.1, t)), anH = an * (1 - smooth(FILL.start + 0.02, FILL.start + 0.25, t));
  const pf = smooth(cues.camera.poster_from + 0.1, cues.camera.poster_to - 0.1, t);   // r2: poster margin, ink tail dissolves on the left
  pg.setTransform(1, 0, 0, 1, 0, 0); pg.clearRect(0, 0, W, H); applyCam(pg, c); pg.lineCap = 'round'; pg.lineJoin = 'round';
  for (let i0 = 0; i0 < iHead; i0 += CHUNK) {
    const i1 = Math.min(iHead, i0 + CHUNK), im = (i0 + i1) >> 1;
    const age = t - TD[im];
    let b = FLOOR[im] + (1 - FLOOR[im]) * (1 - smooth(0.2, 1.5, age));
    if (t > PULSE.start) b = Math.max(b, lerp(FLOOR[im], 0.74, clamp((S[im] - sp) / 260)));   // the pulse leaves the line lit
    const pgs = pAmp > 0 ? pAmp * Math.exp(-(((S[im] - sp) / 300) ** 2)) : 0; b += pgs;
    if (bAmp > 0) b += bAmp * Math.exp(-(((S[im] - bp) / 240) ** 2));   // end breath: light flows forward into the coin
    let w = 1;
    if (NOLINK.size) { const nm = PIECES[P[im]].n; if ((NOLINK.has('dot') && (nm === 'ring' || nm === 'foot')) || (NOLINK.has('line') && nm === 'horizon') || (NOLINK.has('door') && nm === 'arch')) continue; }   // v5 ?nolink
    if (LOGO.has(PIECES[P[im]].n)) { w = logoW * anW; if (w <= 0.01) continue; b = Math.max(b, 1 + 0.6 * anH); }
    const taper0 = smooth(0, 130, S[im]), taper = taper0 * (P[im] === 0 ? lerp(1, smooth(185, 268, X[im]), pf) : 1);   // ink tail; poster margin
    const col = lineColor(b);
    const r = lerp(NAVY[0], col[0], taper), g = lerp(NAVY[1], col[1], taper), bl = lerp(NAVY[2], col[2], taper);
    lg.lineWidth = LW / c.z * w * (0.35 + 0.65 * taper0);
    lg.strokeStyle = `rgb(${r | 0},${g | 0},${bl | 0})`;
    lg.beginPath(); lg.moveTo(PX(i0, m), PY(i0, m));
    for (let i = i0 + 1; i <= i1; i++) lg.lineTo(PX(i, m), PY(i, m));
    if (i1 === iHead) { const p = pointAtS(sHead, t); lg.lineTo(p[0], p[1]); }
    lg.stroke();
    if (pgs > 0.03) {   // r2: the travelling light gets a 6 px hot glow so the eye can follow it home
      pg.lineWidth = 6 / c.z; pg.strokeStyle = `rgba(255,246,220,${(0.35 * pgs / 0.9 * taper).toFixed(3)})`;
      pg.beginPath(); pg.moveTo(PX(i0, m), PY(i0, m)); for (let i = i0 + 1; i <= i1; i++) pg.lineTo(PX(i, m), PY(i, m)); pg.stroke();
    }
  }
}

function drawFill(c, t) {
  if (t < FILL.start || NOLINK.has('dot')) return 0;   // v5 ?nolink=dot: no coin, bevel, echo or bloom
  const u = clamp((t - FILL.start) / FILL.swell), e = easeSwell(u);
  const ri = Math.max(0, MR * (1 - Math.min(1, e)));
  const OV = cues.overshoot, ov = t < OV[1] ? smooth(OV[0], OV[1], t) : 1 - smooth(OV[1], OV[2], t);
  const ro = MR + 1.5 / c.z + MR * 0.04 * ov;   // r2: 4 % outer overshoot, peaks 7.80, settled by 7.93
  fg.setTransform(1, 0, 0, 1, 0, 0); fg.clearRect(0, 0, W, H); fg.globalCompositeOperation = 'source-over';
  applyCam(fg, c);
  const lgr = fg.createLinearGradient(815, 205, 1035, 455);
  lgr.addColorStop(0, '#F2E0AE'); lgr.addColorStop(0.42, '#DDC284'); lgr.addColorStop(0.7, '#CCAB6C'); lgr.addColorStop(1, '#A8874E');   // r2: +8 %
  fg.beginPath(); fg.arc(MCX, MCY, ro, 0, Math.PI * 2);
  if (ri > 0.3) { fg.moveTo(MCX + ri, MCY); fg.arc(MCX, MCY, ri, 0, Math.PI * 2, true); }
  fg.fillStyle = lgr; fg.fill('evenodd');
  fg.globalCompositeOperation = 'destination-out'; doorPath(fg, true); fg.fillStyle = '#000'; fg.fill();   // the doorway stays carved
  fg.globalCompositeOperation = 'source-atop';
  const ra = 1 - smooth(0.62, 1, u);   // r2: a 6 px molten rim (#FFF6DC -> #E9D7A5) leads the inner edge
  if (ra > 0.01 && ri > 0.5) {
    const w6 = 6 / c.z, rim = fg.createRadialGradient(MCX, MCY, Math.max(0, ri - 0.5), MCX, MCY, ri + w6 + 22 / c.z);
    const k6 = w6 / (w6 + 22 / c.z);
    rim.addColorStop(0, `rgba(255,246,220,${ra})`); rim.addColorStop(k6, `rgba(255,246,220,${0.85 * ra})`);
    rim.addColorStop(Math.min(0.99, k6 + 0.25), `rgba(233,215,165,${0.3 * ra})`); rim.addColorStop(1, 'rgba(233,215,165,0)');
    fg.fillStyle = rim; fg.fillRect(760, 160, 340, 340);
  }
  {   // r2 struck metal: a faint anisotropic (conic) sheen so the coin reads as metal, not print
    const cg = fg.createConicGradient(-Math.PI / 4 + 0.25 * smooth(8.0, 10, t), MCX, MCY);
    [[0, 0.1], [0.12, 0], [0.37, -0.08], [0.5, 0.1], [0.62, 0], [0.87, -0.08], [1, 0.1]].forEach(([k, a]) => cg.addColorStop(k, a >= 0 ? `rgba(255,248,230,${a})` : `rgba(60,40,15,${-a})`));
    fg.fillStyle = cg; fg.fillRect(760, 160, 340, 340);
  }
  const sh = clamp((t - 9.2) / 0.76);   // r2 end sheen: a narrow 18-degree glint band (~40 px on screen, a 0.35)
  if (sh > 0 && sh < 1) {
    const x = lerp(760, 1090, easeIO(sh)), nx = Math.cos(0.314), ny = -Math.sin(0.314), hw2 = 20 / c.z;
    const sgr = fg.createLinearGradient(x - nx * hw2, MCY - ny * hw2, x + nx * hw2, MCY + ny * hw2);
    const sa = 0.35 * Math.sin(Math.PI * sh) ** 0.5;
    sgr.addColorStop(0, 'rgba(255,250,235,0)'); sgr.addColorStop(0.5, `rgba(255,250,235,${sa})`); sgr.addColorStop(1, 'rgba(255,250,235,0)');
    fg.fillStyle = sgr; fg.fillRect(760, 160, 340, 340);
  }
  // directional bevel: light from the top-left; the doorway is carved in, so its lit edge faces bottom-right
  const bev = smooth(FILL.start + 0.25, FILL.start + 0.55, t);
  if (bev > 0) {
    fg.globalCompositeOperation = 'source-over';
    // r2 bevel: 1.5 px #FFF6DC highlight on the lit (top-left) arc, 1 px #6E5428 edge opposite
    const gl = fg.createLinearGradient(MCX - 95, MCY - 95, MCX + 60, MCY + 60);
    gl.addColorStop(0, `rgba(255,246,220,${0.8 * bev})`); gl.addColorStop(0.55, `rgba(255,246,220,${0.35 * bev})`); gl.addColorStop(1, 'rgba(255,246,220,0)');
    fg.lineWidth = 1.5 / c.z; fg.strokeStyle = gl; fg.beginPath(); fg.arc(MCX, MCY, ro - 0.75 / c.z, Math.PI * 0.86, Math.PI * 1.86); fg.stroke();
    const gd = fg.createLinearGradient(MCX + 95, MCY + 95, MCX - 60, MCY - 60);
    gd.addColorStop(0, `rgba(110,84,40,${0.95 * bev})`); gd.addColorStop(0.6, `rgba(110,84,40,${0.4 * bev})`); gd.addColorStop(1, 'rgba(110,84,40,0)');
    fg.lineWidth = 1 / c.z; fg.strokeStyle = gd; fg.beginPath(); fg.arc(MCX, MCY, ro - 0.5 / c.z, Math.PI * 1.86, Math.PI * 2.86); fg.stroke();
    fg.lineWidth = 1.2 / c.z;
    const g2 = fg.createLinearGradient(873, 266, 977, 454);
    g2.addColorStop(0, `rgba(122,94,48,${0.95 * bev})`); g2.addColorStop(0.55, `rgba(200,170,110,${0.5 * bev})`); g2.addColorStop(1, `rgba(255,246,220,${0.9 * bev})`);
    fg.strokeStyle = g2; doorPath(fg, false); fg.stroke();
  }
  fg.globalCompositeOperation = 'source-over';
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(fillC, 0, 0);
  const EC = cues.echo, eq = clamp((t - EC[0]) / (EC[1] - EC[0]));   // r2 echo: a 1 px ring of the line leaves the coin edge
  if (eq > 0 && eq < 1) {
    applyCam(ctx, c); ctx.lineWidth = 1 / c.z; ctx.strokeStyle = `rgba(240,222,176,${(0.75 * (1 - eq) ** 1.4).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(MCX, MCY, MR * (1 + 0.6 * (1 - (1 - eq) ** 2)), 0, Math.PI * 2); ctx.stroke(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  return Math.max(u, 1e-3);
}

const glowAt = (sx, sy, r, a, col) => { if (a <= 0.002) return; const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`); ctx.fillStyle = g; ctx.fillRect(sx - r, sy - r, 2 * r, 2 * r); };
function drawTip(c, t) {
  const vis = 1 - smooth(cues.tip_fade[0], cues.tip_fade[1], t);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter'; ctx.filter = 'none';
  if (vis > 0) {
    const p = tipAt(t), [sx, sy] = toScreen(c, p[0], p[1]);
    const hp = cues.holds.reduce((a, h) => a + Math.exp(-(((t - h[0] - 0.02) / 0.06) ** 2)), 0);
    const fl = (1 + 0.05 * Math.sin(t * 29.0) + 0.04 * Math.sin(t * 13.7)) * (1 + 0.3 * hp);   // r2: glow pulse on the hold notes
    const bead = Math.exp(-(((t - cues.hook.brake) / 0.045) ** 2));   // r2: ink bead at the brake (thump)
    const ig = Math.exp(-t / 0.1);                         // tiny ignition spark on frame 0 (the ink is the hook)
    const cf = Math.exp(-(((t - FILL.start) / 0.06) ** 2)); // spark as the line closes on its anchor
    glowAt(sx, sy, 40, 0.3 * ig + 0.35 * cf, '232,200,138');
    glowAt(sx, sy, 56 * fl, 0.09 * vis, '214,178,112');
    const q = tipAt(t - 1 / 120), [qx, qy] = toScreen(c, q[0], q[1]), ns = Math.min(8, Math.max(1, Math.ceil(Math.hypot(sx - qx, sy - qy) / 5)));
    for (let j = 0; j < ns; j++) {
      const f2 = j / ns, x = lerp(sx, qx, f2), y = lerp(sy, qy, f2), wj = (ns > 1 ? 1.6 / ns : 1) * (1 - 0.5 * f2);
      glowAt(x, y, 15 * fl, 0.34 * vis * wj, '238,210,150');
      glowAt(x, y, 3.2 * (j === 0 ? 1 + 0.6 * bead : 1), 0.95 * vis * (j === 0 ? 1 : wj * 0.6), '255,250,236');
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawText(c, t) {
  if (t < WM.start) return;
  ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  applyCam(ctx, c);
  const word = 'ATELIER LINEA', size = 50, track = 0.46;
  ctx.font = `500 ${size}px 'Cormorant Garamond'`; ctx.textBaseline = 'alphabetic';
  const ws = [...word].map((ch) => ctx.measureText(ch).width);
  const fin = ws.reduce((a, b) => a + b, 0) + track * size * (word.length - 1);
  const cx = 925, y = 868, mid = (word.length - 1) / 2;
  let x = cx - fin / 2;
  [...word].forEach((ch, i) => {
    const d = Math.abs(i - mid);
    const u = clamp((t - WM.start - d * WM.stagger) / WM.dur), e = easeOut(u);
    const spread = (1 - e) * 0.22 * size * (i - mid);   // letters track in from wide
    ctx.globalAlpha = smooth(0, 0.8, u) * 0.95;
    ctx.fillStyle = '#E9D7A5';
    ctx.fillText(ch, x + spread, y + (1 - e) * 6);
    x += ws[i] + track * size;
  });
  const tu = clamp((t - WM.tagline) / 0.9), te = easeOut(tu);
  if (tu > 0) {
    const tag = '始于一线', ts = 26, tt = 0.5, ty = y + 36 + ts;   // r2: 0.5 em so 一 belongs to the word
    ctx.font = `300 ${ts}px 'Noto Serif SC'`;
    const tw = [...tag].map((ch) => ctx.measureText(ch).width);
    const tf = tw.reduce((a, b) => a + b, 0) + tt * ts * (tag.length - 1);
    let tx = cx - tf / 2;
    ctx.globalAlpha = te * 0.9; ctx.fillStyle = '#E9D7A5';
    [...tag].forEach((ch, i) => { ctx.fillText(ch, tx, ty + (1 - te) * 4); tx += tw[i] + tt * ts; });
    // the pen signs off: two hairline rules drawn outward from the tagline, each by a small glint
    const ru = easeIO(clamp((t - cues.rules[0]) / (cues.rules[1] - cues.rules[0]))), hl = 24 * ru, ry = ty - 9.5, gap = 1.2 * ts;   // r2: short 1 px rules, 1.2 em gap
    ctx.globalAlpha = 0.55; ctx.fillStyle = '#E9D7A5'; const rh = 1 / c.z;
    ctx.fillRect(cx - tf / 2 - gap - hl, ry - rh / 2, hl, rh); ctx.fillRect(cx + tf / 2 + gap, ry - rh / 2, hl, rh);
    const gv = smooth(cues.rules[0] - 0.08, cues.rules[0] + 0.02, t) * (1 - smooth(cues.rules[1] - 0.05, cues.rules[1] + 0.15, t));
    if (gv > 0) {
      ctx.globalAlpha = 1;
      const a = toScreen(c, cx - tf / 2 - gap - hl, ry), b = toScreen(c, cx + tf / 2 + gap + hl, ry);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter';
      for (const [sx, sy] of [a, b]) { glowAt(sx, sy, 12, 0.3 * gv, '240,214,160'); glowAt(sx, sy, 2.2, 0.9 * gv, '255,250,236'); }   // r2: no flare halo
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  ctx.globalAlpha = 1; ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// ---------------------------------------------------------------- v5 title: the gold line writes 线条动画 as outline type
// Alimama ShuHeiTi Bold outlines (tools/v5_title_glyphs.py → v5_title.json), world units, under the skyline. Each glyph is
// traced by pens that start together at its top-left vertices and run at one shared speed (short counters close first);
// glyphs start 0.08 s apart; the whole title flares once as it closes, then holds. Same core colour, width and glow as the line.
const TT = { size: 165, track: 0.2, top: 790, cx: 925, start: 8.45, stagger: 0.08, dur: 0.56,
  lw: 7.5,                                     // v5.2: title pen 7.5 screen px (the film's line stays LW = 4.5), reads at feed size
  fill: 0.36, floodIn: 0.06, flood: 0.26,      // v5.2: each glyph floods inward with soft gold as it closes (echo of the coin)
  en: 'LINE ART', enSize: 33, enW: 600, enY: 992, enIn: 9.05, rules: [9.35, 9.7] };
const easeTitle = cubicBezier(0.45, 0, 0.25, 1);
let TITLE = null;
if (V5) {
  const J = await (await fetch('/demos/02-line-art/v5_title.json')).json();
  const k = TT.size / J.upm, raw = [];
  let x = 0, minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const g of J.glyphs) {
    raw.push(g.contours.map((c) => { const pts = []; for (let i = 0; i < c.length; i += 2) { const px = x + c[i] * k, py = c[i + 1] * k; pts.push([px, py]);
      minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py); } return pts; }));
    x += (g.adv + TT.track * J.upm) * k;
  }
  const ox = TT.cx - (minX + maxX) / 2, oy = TT.top - minY;
  TITLE = { glyphs: [], box: [minX + ox, minY + oy, maxX + ox, maxY + oy] };
  raw.forEach((cs, gi) => {
    const contours = cs.map((pts0) => {
      const pts = pts0.map(([px, py]) => [px + ox, py + oy]);
      let i0 = 0; pts.forEach((p, i) => { if (p[0] + p[1] < pts[i0][0] + pts[i0][1]) i0 = i; });   // pen starts top-left
      const p = [...pts.slice(i0), ...pts.slice(0, i0), pts[i0]], cum = [0];
      for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
      return { p, cum, L: cum[cum.length - 1] };
    });
    const path = new Path2D(); let gy0 = 1e9, gy1 = -1e9;   // v5.2: the glyph body (nonzero: counters are holes) for the inner fill
    for (const ct of contours) { path.moveTo(ct.p[0][0], ct.p[0][1]); for (const q of ct.p) { path.lineTo(q[0], q[1]); gy0 = Math.min(gy0, q[1]); gy1 = Math.max(gy1, q[1]); } path.closePath(); }
    TITLE.glyphs.push({ contours, path, gy0, gy1, Lmax: Math.max(...contours.map((c) => c.L)), t0: TT.start + gi * TT.stagger });
  });
  TITLE.end = TT.start + (J.glyphs.length - 1) * TT.stagger + TT.dur;
  await document.fonts.load(`${TT.enW} ${TT.enSize}px 'Cormorant Garamond'`, TT.en);
}
const titleS = (g, t) => easeTitle(clamp((t - g.t0) / TT.dur)) * g.Lmax;
function ctPoint(ct, s) {
  let lo = 0, hi = ct.cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ct.cum[m] <= s) lo = m; else hi = m; }
  const f = ct.cum[hi] > ct.cum[lo] ? clamp((s - ct.cum[lo]) / (ct.cum[hi] - ct.cum[lo])) : 0;
  return [lerp(ct.p[lo][0], ct.p[hi][0], f), lerp(ct.p[lo][1], ct.p[hi][1], f), lo];
}
function ctTrace(g2, ct, s0, s1) {
  const a = ctPoint(ct, s0), b = ctPoint(ct, s1);
  g2.beginPath(); g2.moveTo(a[0], a[1]);
  for (let i = a[2] + 1; i <= b[2]; i++) g2.lineTo(ct.p[i][0], ct.p[i][1]);
  g2.lineTo(b[0], b[1]);
}
const rgbS = (col, a = 1) => `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${a})`;
function drawTitleLines(c, t) {
  if (!TITLE || t < TT.start || NOLINK.has('title')) return;
  applyCam(lg, c); lg.lineCap = 'round'; lg.lineJoin = 'round'; lg.globalAlpha = 1;
  const flash = 0.5 * Math.exp(-(((t - TITLE.end - 0.04) / 0.1) ** 2));   // the title lands: one flare on close
  for (const g of TITLE.glyphs) {   // v5.2: soft gold body. As a glyph closes it floods inward from its outline, like the ring → coin
    const u = clamp((t - (g.t0 + TT.dur - TT.floodIn)) / TT.flood); if (u <= 0) continue;
    const e = easeOut(u), gr = lg.createLinearGradient(0, g.gy0, 0, g.gy1);
    const fa = TT.fill * (1 + 0.6 * flash);   // warm amber so the body reads gold, not grey, over the navy; lit from the top like the coin
    gr.addColorStop(0, `rgba(240,206,138,${fa.toFixed(3)})`); gr.addColorStop(1, `rgba(178,134,66,${(fa * 0.82).toFixed(3)})`);
    lg.fillStyle = gr; lg.strokeStyle = gr;
    if (u >= 1) { lg.fill(g.path, 'nonzero'); continue; }
    lg.save(); lg.clip(g.path, 'nonzero'); lg.lineWidth = 80 * e; lg.stroke(g.path); lg.restore();   // inner edge moves inward
  }
  lg.lineWidth = TT.lw / c.z;
  for (const g of TITLE.glyphs) {
    const s = titleS(g, t); if (s <= 0) continue;
    for (const ct of g.contours) {
      const sd = Math.min(s, ct.L), open = sd < ct.L;
      lg.strokeStyle = rgbS(lineColor(1 + flash)); ctTrace(lg, ct, 0, sd); if (!open) lg.closePath(); lg.stroke();
      if (open) { lg.strokeStyle = rgbS(HOT, 0.75); ctTrace(lg, ct, Math.max(0, sd - 55), sd); lg.stroke(); }   // fresh ink runs hot
    }
  }
  lg.setTransform(1, 0, 0, 1, 0, 0);
}
function drawTitleTips(c, t) {
  if (!TITLE || t < TT.start || t > TITLE.end + 0.05 || NOLINK.has('title')) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter'; ctx.filter = 'none';
  for (const g of TITLE.glyphs) {
    const s = titleS(g, t); if (s <= 0) continue;
    for (const ct of g.contours) {
      const a = clamp((ct.L - s) / 25) * clamp(s / 10); if (a <= 0) continue;
      const p = ctPoint(ct, s), [sx, sy] = toScreen(c, p[0], p[1]);
      glowAt(sx, sy, 22, 0.3 * a, '238,210,150'); glowAt(sx, sy, 5, 0.9 * a, '255,250,236');   // v5.2: nib sized to the 7.5 px pen
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}
function drawTextV5(c, t) {   // small secondary line under the title, set like the old tagline, the pen's rules sign off
  const tu = clamp((t - TT.enIn) / 0.9), te = easeOut(tu);
  if (tu <= 0 || NOLINK.has('title')) return;
  ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  applyCam(ctx, c);
  const tag = TT.en, ts = TT.enSize, tt = 0.5, ty = TT.enY, cx = TT.cx;
  ctx.font = `${TT.enW} ${ts}px 'Cormorant Garamond'`; ctx.textBaseline = 'alphabetic';
  const tw = [...tag].map((ch) => ctx.measureText(ch).width);
  const tf = tw.reduce((a, b) => a + b, 0) + tt * ts * (tag.length - 1);
  let tx = cx - tf / 2;
  ctx.globalAlpha = te * 0.95; ctx.fillStyle = '#E9D7A5';
  [...tag].forEach((ch, i) => { ctx.fillText(ch, tx, ty + (1 - te) * 4); tx += tw[i] + tt * ts; });
  const ru = easeIO(clamp((t - TT.rules[0]) / (TT.rules[1] - TT.rules[0]))), hl = 28 * ru, ry = ty - 0.3 * ts, gap = 1.1 * ts;
  ctx.globalAlpha = 0.55 * te; const rh = 1 / c.z;
  ctx.fillRect(cx - tf / 2 - gap - hl, ry - rh / 2, hl, rh); ctx.fillRect(cx + tf / 2 + gap, ry - rh / 2, hl, rh);
  const gv = smooth(TT.rules[0] - 0.08, TT.rules[0] + 0.02, t) * (1 - smooth(TT.rules[1] - 0.05, TT.rules[1] + 0.15, t));
  if (gv > 0) {
    ctx.globalAlpha = 1;
    const a = toScreen(c, cx - tf / 2 - gap - hl, ry), b = toScreen(c, cx + tf / 2 + gap + hl, ry);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter';
    for (const [sx, sy] of [a, b]) { glowAt(sx, sy, 12, 0.3 * gv, '240,214,160'); glowAt(sx, sy, 2.2, 0.9 * gv, '255,250,236'); }
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.globalAlpha = 1; ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function drawFinish(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.filter = 'none';
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.66);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  const f = Math.floor(t * FPS + 1e-4), r = mulberry(f * 7919 + 13);
  const ox = Math.floor(r() * 2048), oy = Math.floor(r() * 2048);
  ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.1;
  for (let x = -ox; x < W; x += 2048) for (let y = -oy; y < H; y += 2048) ctx.drawImage(grain, x, y);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}

window.renderAt = async (t) => {
  const c = camera(t);
  const sHead = headS(clamp(t, 0, T_END));
  drawBackground(c, t);
  drawMotes(c, t);
  const inh = smooth(cues.anticip[0], cues.anticip[1], t) * (1 - smooth(FILL.start + FILL.swell - 0.05, FILL.start + FILL.swell + 0.1, t));
  if (inh > 0 && !NOLINK.has('dot')) { applyCam(ctx, c); ctx.fillStyle = `rgba(2,4,9,${(0.14 * inh).toFixed(3)})`; ctx.beginPath(); ctx.arc(MCX, MCY, MR - 1, 0, Math.PI * 2); ctx.fill(); ctx.setTransform(1, 0, 0, 1, 0, 0); }   // r2 inhale
  const fu = drawFill(c, t);
  drawLine(c, t, sHead);
  if (V5) drawTitleLines(c, t);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'screen';            // warm glow under a true-colour core
  ctx.filter = 'blur(16px)'; ctx.globalAlpha = 0.2; ctx.drawImage(lineC, 0, 0);
  ctx.filter = 'blur(3px)'; ctx.globalAlpha = 0.3; ctx.drawImage(lineC, 0, 0);
  ctx.filter = 'none'; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(lineC, 0, 0);
  if (t > PULSE.start && t < PULSE.end + 0.4) { ctx.globalCompositeOperation = 'screen'; ctx.filter = 'blur(2px)'; ctx.drawImage(pulseC, 0, 0); ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over'; }
  if (fu > 0) {  // fill bloom: peaks one frame after the onset, settles to a soft halo
    const fb = 0.1 + 0.36 * Math.exp(-(((t - FILL.start - 0.033) / 0.11) ** 2));   // r2: bloom capped at 60 %
    ctx.globalCompositeOperation = 'screen';
    ctx.filter = 'blur(28px)'; ctx.globalAlpha = clamp(fb); ctx.drawImage(fillC, 0, 0);
    ctx.filter = 'blur(80px)'; ctx.globalAlpha = clamp(0.3 * Math.exp(-(((t - FILL.start - 0.05) / 0.2) ** 2))); ctx.drawImage(fillC, 0, 0);
  }
  ctx.filter = 'none'; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  if (!NOLINK.has('tip')) drawTip(c, t);
  if (V5) { drawTitleTips(c, t); drawTextV5(c, t); } else drawText(c, t);
  drawFinish(t);
};

// ---------------------------------------------------------------- v5 link elements (1920x1080 frame px), a pure function of t
const hex = (col) => '#' + col.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
if (V5) window.linkAt = (t) => {
  const c = camera(t), sHead = headS(clamp(t, 0, T_END)), out = [];
  const [dx, dy] = toScreen(c, MCX, MCY);
  if (t < FILL.start) {   // the gold ring the line draws around the sun (6.458–6.97), then the doorway inside it
    const ringFrac = clamp((sHead - pieceStart.ring) / (pieceEnd.ring - pieceStart.ring));
    const an = smooth(cues.anticip[0], cues.anticip[1], t);
    out.push({ id: 'dot', type: 'circle', x: dx, y: dy, r: MR * c.z, a: ringFrac, look: 'ring', fill: '#0B1320', stroke: hex(lineColor(1 + 0.6 * an)),
      sw: LW * (1 - 0.5 * an), drawn: ringFrac, note: 'gold ring drawn by the one line (sun); navy inside; a/drawn = fraction of the circle drawn' });
  } else {                // the ring floods inward into the gold coin (medallion with a carved doorway)
    const u = clamp((t - FILL.start) / FILL.swell), e = easeSwell(u);
    const OV = cues.overshoot, ov = t < OV[1] ? smooth(OV[0], OV[1], t) : 1 - smooth(OV[1], OV[2], t);
    out.push({ id: 'dot', type: 'circle', x: dx, y: dy, r: (MR + 1.5 / c.z + MR * 0.04 * ov) * c.z, a: 1, look: 'coin', fill: '#DDC284', stroke: '#FFF6DC', sw: 1.5,
      grad: ['#F2E0AE', '#A8874E'], fill_frac: e, note: 'gold coin: brushed-gold disc (gradient top-left #F2E0AE → bottom-right #A8874E), 1.5 px bevel, dark arched doorway carved in; fill_frac = swell (inner radius = r·(1−fill_frac))' });
  }
  const vis = 1 - smooth(cues.tip_fade[0], cues.tip_fade[1], t);
  if (vis > 0) { const p = tipAt(t), [sx, sy] = toScreen(c, p[0], p[1]);
    out.push({ id: 'tip', type: 'circle', x: sx, y: sy, r: 15, a: vis, look: 'glow', fill: '#FFFAEC', stroke: '#EED296', sw: 0, note: 'pen nib: hot core r≈3 px + 15 px gold glow; it draws the one line' }); }
  const lineAt = (s0, s1) => {   // the drawn part of a straight run of the line (world y 740), with its current colour
    const i = idxAtS((s0 + s1) / 2), age = t - TD[i], sp = TOTAL * (1 - easePulse(clamp((t - PULSE.start) / (PULSE.end - PULSE.start))));
    let b = FLOOR[i] + (1 - FLOOR[i]) * (1 - smooth(0.2, 1.5, age)); if (t > PULSE.start) b = Math.max(b, lerp(FLOOR[i], 0.74, clamp((S[i] - sp) / 260)));
    return hex(lineColor(b));
  };
  if (sHead > pieceStart.horizon) {   // the horizon: the longest clean straight stretch of the line
    const s1 = Math.min(sHead, pieceEnd.horizon), p0 = toScreen(c, X[idxAtS(pieceStart.horizon)], 740), p1 = toScreen(c, X[idxAtS(s1)], 740);
    out.push({ id: 'line', type: 'line', x0: p0[0], y0: p0[1], x1: p1[0], y1: p1[1], w: LW, a: clamp((s1 - pieceStart.horizon) / 40), stroke: lineAt(pieceStart.horizon, s1),
      note: 'horizon: the gold line runs flat from the last tower to the wave (drawn 5.135–5.393), left → right' });
  }
  if (sHead >= pieceEnd.horizon) {
    const pf = smooth(cues.camera.poster_from + 0.1, cues.camera.poster_to - 0.1, t), g0 = toScreen(c, lerp(-160, 226, pf), 740), g1 = toScreen(c, 1600, 740);
    out.push({ id: 'ground', type: 'line', x0: g0[0], y0: g0[1], x1: g1[0], y1: g1[1], w: LW, a: 1, stroke: lineAt(pieceStart.horizon, pieceEnd.horizon),
      note: 'the whole baseline (ground + horizon) the city stands on; buildings rise from it' });
  }
  if (TITLE && t >= TT.start) {
    const [x0, y0, x1, y1] = TITLE.box, [cx, cy] = toScreen(c, (x0 + x1) / 2, (y0 + y1) / 2);
    const prog = TITLE.glyphs.reduce((a, g) => a + titleS(g, t) / g.Lmax, 0) / TITLE.glyphs.length;
    out.push({ id: 'title', type: 'rect', x: cx, y: cy, w: (x1 - x0) * c.z, h: (y1 - y0) * c.z, rot: c.roll, a: prog, stroke: '#E9D7A5', sw: TT.lw,
      fill: '#E9D7A5', fill_a: TT.fill * TITLE.glyphs.reduce((a, g) => a + easeOut(clamp((t - (g.t0 + TT.dur - TT.floodIn)) / TT.flood)), 0) / TITLE.glyphs.length,
      note: '线条动画 outline type written by the gold line: ' + TT.lw + ' px gold outline (box = outline centreline) + soft gold inner fill (fill_a = fill opacity); a = fraction drawn (fully drawn ≥ ' + TITLE.end.toFixed(2) + ')' });
  }
  return out;
};

// timing export for audio (tools/dump_timing.mjs)
window.__timing = () => {
  const out = { total: TOTAL, t_end: T_END, speed: [], corners: [], pieces: {} };
  { const target = 1 - (pieceStart.seed + 30) / TOTAL; let tt = PULSE.start; while (tt < PULSE.end && easePulse((tt - PULSE.start) / (PULSE.end - PULSE.start)) < target) tt += 1 / 600; out.pulse_home = +tt.toFixed(4); }
  for (const pc of PIECES) out.pieces[pc.n] = [+TD[idxAtS(pieceStart[pc.n])].toFixed(4), +TD[Math.min(N - 1, idxAtS(pieceEnd[pc.n]))].toFixed(4), +(pieceEnd[pc.n] - pieceStart[pc.n]).toFixed(1), +(tauAtS(pieceEnd[pc.n]) - tauAtS(pieceStart[pc.n])).toFixed(1)];
  for (let k = 0; k <= 1200; k++) {
    const t = k / 120, c = camera(t);
    const a = tipAt(t - 1 / 240), b = tipAt(t + 1 / 240);
    out.speed.push(+(Math.hypot(b[0] - a[0], b[1] - a[1]) * 240 * c.z).toFixed(1));
  }
  let lastT = -1;
  for (let i = 1; i < N - 1; i++) {
    if (CORN[i] > 0.05 && CORN[i] >= CORN[i - 1] && CORN[i] >= CORN[i + 1] && TD[i] - lastT > 0.05) {
      out.corners.push({ t: +TD[i].toFixed(4), piece: PIECES[P[i]].n, k: +CORN[i].toFixed(3), x: +X[i].toFixed(1) });
      lastT = TD[i];
    }
  }
  return out;
};

if (Q.has('t')) await window.renderAt(+Q.get('t'));
window.__ready = true;
