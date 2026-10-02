// 05-cel-boil — 「手作」 a matchstick, a flame spirit, and a title written by sparks.
import * as G from './engine.js';
const { PAL, K, E, hs, hr, lerp, clamp, inv, sstep, spline, resample, xf, circlePts, boil, outline, fillPoly,
  inkStroke, inkLoop, fillShape, hatch, Layers, blit, prefix, arclen, polyPath } = G;

export const W = 1920, H = 1080, FPS = 24;
// ---- reel v5 (?v5=1): title 逐帧手绘 / FRAME BY FRAME, window.linkAt(t), ?nolink=dot. Without v5 every code path is unchanged.
const QS = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
export const V5 = QS.get('v5') === '1';
const NOLINK = new Set(V5 ? (QS.get('nolink') || '').split(',').map((q) => q.trim()).filter(Boolean) : []);
const NODOT = NOLINK.has('dot');
let ctx, MAIN, SHEETC, NIGHTC, LY, IMG = {}, DPR = 1, FONT_TAG = null, CUES = null, TOTAL = 146;
const REG = { dx: -5, dy: 4 };          // colour-to-line registration offset (hand colouring)

// ------------------------------------------------------------------ exposure sheet (frames)
// [from, to, exposure]  2 = on twos, 1 = on ones, 3 = on threes
const SCHED = [[0, 8, 2], [8, 24, 1], [24, 48, 2], [48, 60, 1], [60, 108, 2], [108, 120, 3], [120, 132, 2],
  [132, 168, 1], [168, 224, 2], [224, 230, 1], [230, 240, 3]]  // R2: pull-back f218, riffle f224-229, end hold on 3s from f230;
export function drawing(f) {
  let id = 0;
  for (const [a, b, s] of SCHED) {
    if (f >= b) { id += Math.ceil((b - a) / s); continue; }
    const k = Math.floor((f - a) / s);
    return { fq: a + k * s, id: id + k, step: s };
  }
  return { fq: 239, id, step: 3 };
}
// boil variant: static things cycle through 4 drawings (classic boil loop), 3 on the hold
const bv = (D) => (D.step === 3 ? D.id % 3 : D.id % 4);

// ------------------------------------------------------------------ helpers
const dens = (poly, step = 4) => resample(poly, step, true);
function affineTo(c, O, X, Y, w, h) { // map text box (0..w, 0..h) to parallelogram O->X (x axis), O->Y (y axis)
  c.transform((X[0] - O[0]) / w, (X[1] - O[1]) / w, (Y[0] - O[0]) / h, (Y[1] - O[1]) / h, O[0], O[1]);
}
function camApply(c, cam) {
  c.translate(cam.x, cam.y);
}
const STAGE = { s: 1.4, px: 930, py: 880, X: 960, Y: 1002 };
const CLOSE = { s: 2.6, px: 872, py: 790, X: 960, Y: 600 }; // shot A: close-up on the striker (frames 0–11)
const MED = { s: 2.05, px: 845, py: 650, X: 960, Y: 560 };  // shot C: cut-in on the ta-da (frames 108–131)
const WAKE = { s: 1.75, px: 1150, py: 520, X: 1270, Y: 500 }; // step-in when the eyes pop (re-framed drawings, 2 drawings on 2s)
const LOW = { s: 1.5, px: 830, py: 700, X: 800, Y: 848 };    // R2s2 (P4): low re-staged angle; flame x=640 at 3.0, match + smoke curl fill the right third
const JT = [0, 25, 50, 68, 78, 80, 76, 64, 48, 30, 14, 4]; // R1s2: tilt follows only ~40% of the rise so the arc reads on screen // camera tilt following the jump arc (on 1s)
const mixShot = (A, B, u) => ({ s: lerp(A.s, B.s, u), px: lerp(A.px, B.px, u), py: lerp(A.py, B.py, u), X: lerp(A.X, B.X, u), Y: lerp(A.Y, B.Y, u) });
function shotFor(f) {
  if (f < 12) return CLOSE;
  if (f >= 30 && f < 48) return f < 32 ? mixShot(STAGE, WAKE, 0.6) : WAKE;
  if (f >= 48 && f < 60) return { ...STAGE, Y: STAGE.Y + JT[f - 48] };
  if (f >= 60 && f < 108) return LOW;
  if (f >= 108 && f < 132) return MED;
  return STAGE;
}
let SHOT = STAGE;
function stageApply(c) { c.translate(SHOT.X, SHOT.Y); c.scale(SHOT.s, SHOT.s); c.translate(-SHOT.px, -SHOT.py); }
function edge(c, a, b, seed, o = {}) { // hand-inked straight edge with corner overshoot
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
  const e0 = o.over ?? 7, e1 = o.over ?? 7;
  const s0 = e0 * (0.4 + hs(seed, 1)), s1 = e1 * (0.4 + hs(seed, 2));
  const A = [a[0] - ux * s0, a[1] - uy * s0], B = [b[0] + ux * s1, b[1] + uy * s1];
  const M = [lerp(A[0], B[0], 0.5) + (hs(seed, 3) - 0.5) * 2.5 * -uy * (L / 300), lerp(A[1], B[1], 0.5) + (hs(seed, 3) - 0.5) * 2.5 * ux * (L / 300)];
  inkStroke(c, [A, M, B], { seed, w: o.w ?? 6, t0: 12, t1: 16, jit: 0.3, heavy: 0, amp: o.amp ?? 1.8, min: 0.2 });
}

// ------------------------------------------------------------------ shapes
function starPts(n, rOut, rIn, seed, rot = 0, jit = 0.25) {
  const P = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2 + (hs(seed, i, 1) - 0.5) * (Math.PI / n) * 0.6;
    const ro = rOut * (1 - jit + jit * 2 * hs(seed, i, 2));
    P.push([Math.cos(a) * ro, Math.sin(a) * ro, 1]);
    const b = a + Math.PI / n + (hs(seed, i, 3) - 0.5) * (Math.PI / n) * 0.3;
    const ri = rIn * (0.85 + 0.3 * hs(seed, i, 4));
    P.push([Math.cos(b) * ri, Math.sin(b) * ri]);
  }
  return P;
}
function twinklePts(R, seed, rot = 0) {
  const P = [];
  for (let i = 0; i < 4; i++) {
    const a = rot + (i * Math.PI) / 2;
    const r = R * (i % 2 ? 0.78 : 1) * (0.92 + 0.16 * hs(seed, i));
    P.push([Math.cos(a) * r, Math.sin(a) * r, 1]);
    const b = a + Math.PI / 4;
    P.push([Math.cos(b) * R * 0.2, Math.sin(b) * R * 0.2]);
  }
  return P;
}
function drawTwinkle(c, x, y, R, seed, o = {}) {
  if (R < 2) return;
  const P = xf(twinklePts(R, seed, o.rot ?? 0), { x, y });
  const d = spline(P, true, 3);
  fillShape(c, d, o.fill ?? PAL.yel, { seed, amp: 1.2, dx: REG.dx * 0.6, dy: REG.dy * 0.6 });
  inkLoop(c, d, { seed, w: o.w ?? Math.max(2.5, R * 0.09), amp: 1.2, t0: 4, t1: 8, heavy: 0.2 });
}
// teardrop spark oriented along (vx,vy)
function drawSpark(c, x, y, vx, vy, size, seed, o = {}) {
  const sp = Math.hypot(vx, vy) || 1, ux = vx / sp, uy = vy / sp;
  const len = size * (1.4 + Math.min(5, sp / 450));
  const r = size * 0.55;
  const ang = Math.atan2(uy, ux);
  const P = [[r, 0], [r * 0.7, r * 0.72], [0, r], [-len, 0, 1], [0, -r], [r * 0.7, -r * 0.72]];
  const d = spline(xf(P, { x, y, r: ang }), true, 3);
  if (o.inkOnly) { fillShape(c, d, PAL.ink, { seed, amp: 1 }); return; }
  fillShape(c, d, o.fill ?? PAL.yel, { seed, amp: 1.2, dx: REG.dx * 0.5, dy: REG.dy * 0.5 });
  inkLoop(c, d, { seed, w: Math.max(2.2, size * 0.16), amp: 1, t0: 3, t1: 10, heavy: 0.2 });
}

// ------------------------------------------------------------------ paper + tooth
function drawPaper(c, cam) {
  c.save();
  const s = 1.045;
  c.drawImage(IMG.paper, cam.x + (W - W * s) / 2, cam.y + (H - H * s) / 2, W * s, H * s);
  c.restore();
}
function drawTooth(c, D) {
  // multiply pass of the paper tooth over everything (boils with the drawing: every cel is a new sheet)
  const v = bv(D);
  const ox = Math.floor(hs(v, 51) * 470), oy = Math.floor(hs(v, 52) * 310);
  c.save();
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.globalCompositeOperation = 'multiply';
  c.globalAlpha = 0.5;
  c.drawImage(IMG.tooth, ox, oy, W, H, 0, 0, W, H);
  // scanner dust / graphite specks that change with every drawing
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 0.22;
  const dm = IMG.dust[v % 4];
  c.save(); c.translate(W / 2, H / 2); c.scale(v % 2 ? -1 : 1, v % 3 ? 1 : -1); c.drawImage(dm, -W / 2, -H / 2, W, H); c.restore();
  c.restore();
}

// ------------------------------------------------------------------ MATCHBOX
const BOXP = { px: 930, py: 880 };
function boxState(t) {
  let sq = 0;
  for (const tl of [1.0, 2.5, 3.0, 3.5, 4.0, 5.0, 5.25]) {
    const d = t - tl;
    if (d >= 0 && d < 0.3) sq += (tl === 2.5 ? 0.06 : 0.035) * Math.exp(-d * 12) * Math.cos(d * 28);
  }
  const st = { x: 0, y: 0, r: 0, sy: 1 - sq, sx: 1 + sq * 0.4, vis: true, blown: 0 };
  if (t >= 6.54) {
    const u = t - 6.54;
    st.x = -1500 * u - 1400 * u * u; st.y = 380 * u + 2600 * u * u; st.r = -4.2 * u - 3 * u * u; st.blown = u;
    if (u > 0.5) st.vis = false;
  }
  return st;
}
function drawBox(c, t, D, st) {
  if (!st.vis) return;
  const sd = 100 + bv(D);
  const T = (P) => xf(P, { x: BOXP.px + st.x, y: BOXP.py + st.y, r: st.r, sx: st.sx, sy: st.sy });
  const low = SHOT === LOW; // R2s2 (P4): real low eye line for the dance shot - more front face, top plane foreshortened to ~62 %
  const x0 = -370, x1 = 370, y1 = low ? -112 : -90, y2 = 0, dx = low ? 40 : 46, dy = low ? -64 : -104;
  const a = [x0, y1], b = [x1, y1], cc = [x1 + dx, y1 + dy], d = [x0 + dx, y1 + dy], e = [x0, y2], g = [x1, y2], h = [x1 + dx, y2 + dy];
  const top = T([a, b, cc, d]), front = T([a, b, g, e]), right = T([b, cc, h, g]);
  // cast shadow (hatched) — only while resting
  if (!st.blown) {
    const S = [x0 + 30, y2], S2 = [x1, y2], S3 = [x1 + dx, y2 + dy], S4 = [x1 + dx + (low ? 34 : 70), y2 + dy + 40], S5 = [x1 + 60, y2 + 34], S6 = [x0 + 60, y2 + 30];
    const sh = T([S, S2, S3, S4, S5, S6]);
    hatch(c, dens(sh, 6), { seed: sd * 3, gap: 13, ang: -0.95, w: 2.6, amp: 1.2 });
  }
  const o = (k) => ({ seed: sd * 10 + k, amp: 1.8, dx: REG.dx, dy: REG.dy });
  fillShape(c, dens(top), PAL.red, o(1));
  fillShape(c, dens(front), PAL.yel, o(2));
  fillShape(c, dens(right), PAL.red, o(3));
  // right face shading hatch
  hatch(c, dens(right, 6), { seed: sd * 5, gap: 11, ang: 1.15, w: 2.2, amp: 1.0 });
  // striker band
  const band = T([[x0 + 22, y1 + 20], [x1 - 22, y1 + 20], [x1 - 22, y2 - 20], [x0 + 22, y2 - 20]]);
  fillShape(c, dens(band), PAL.ink, { seed: sd * 10 + 4, amp: 1.4 });
  // grit specks
  c.fillStyle = PAL.cream;
  for (let i = 0; i < 90; i++) {
    const px = lerp(x0 + 30, x1 - 30, hs(i, 3)), py = lerp(y1 + 26, y2 - 26, hs(i, 4));
    const [q] = boil(T([[px, py]]), sd, 1.0, 40);
    c.beginPath(); c.arc(q[0], q[1], 0.9 + 1.4 * hs(i, 5), 0, 7); c.fill();
  }
  // strike scratch (after the strike passes)
  const sp = matchStrikeProgress(t);
  if (sp > 0) {
    const L = T([[x0 + 40, (y1 + y2) / 2 + 2], [lerp(x0 + 40, x1 - 30, sp * 0.5), (y1 + y2) / 2 - 3], [lerp(x0 + 40, x1 - 30, sp), (y1 + y2) / 2 + 1]]);
    inkStroke(c, L, { seed: sd + 7, w: 4.5, t0: 30, t1: 60, amp: 1.0, color: PAL.cream, heavy: 0 });
  }
  // label on the top face (星火牌 安全火柴)
  const LP = (u, v) => [x0 + u * (x1 - x0) + v * dx, y1 + v * dy];
  const u0 = 0.25, u1 = 0.78, v0 = 0.2, v1 = 0.82;
  const lab = T([LP(u0, v0), LP(u1, v0), LP(u1, v1), LP(u0, v1)]);
  fillShape(c, dens(lab), PAL.hi, { seed: sd * 10 + 5, amp: 1.4, dx: REG.dx * 0.6, dy: REG.dy * 0.6 });
  const [O] = T([LP(u0, v1)]), [X] = T([LP(u1, v1)]), [Y] = T([LP(u0, v0)]);
  c.save();
  affineTo(c, O, X, Y, 540, 120);
  const jx = (hs(bv(D), 61) - 0.5) * 1.6, jy = (hs(bv(D), 62) - 0.5) * 1.6;
  c.translate(jx, jy);
  // little flame mark
  const fl = spline(xf(flameUnit(4, 0.1), { x: 62, y: 104, sx: 72, sy: 90 }), true, 3);
  fillShape(c, fl, PAL.red, { seed: 3, amp: 0.8 });
  c.fillStyle = PAL.ink;
  c.font = '64px "LXGW Marker Gothic"';
  c.textBaseline = 'alphabetic';
  c.fillText('星火牌', 118, 84);
  c.font = '30px "LXGW Marker Gothic"';
  c.fillText('安 全 火 柴', 330, 82);
  c.fillRect(118, 98, 400, 5);
  c.restore();
  inkLoop(c, dens(lab), { seed: sd * 10 + 6, w: 3.4, amp: 1.2, heavy: 0.2 });
  // edges
  const E9 = [[a, b], [b, cc], [cc, d], [d, a], [a, e], [e, g], [g, b], [g, h], [h, cc]];
  E9.forEach(([p, q], i) => { const [P2, Q2] = T([p, q]); edge(c, P2, Q2, sd * 20 + i, { w: 5.2 }); });
}

// ------------------------------------------------------------------ MATCH
// head centre (hx,hy), rotation r (0 = upright: stick hangs below the head), bend (px)
function matchStrikeProgress(t) {
  return clamp(K(t, [[0.333, 0], [0.375, 0.3, 'lin'], [0.417, 0.64, 'lin'], [0.458, 0.9, 'lin'], [0.5, 1.0, 'out2']]));
}
const STICK = 262, BUTT = [1150, 742];
function matchState(t) {
  const s = { hx: 0, hy: 0, r: 0, bend: 0, burnt: t >= 2.0, vis: true, smear: 0 };
  if (t < 0.333) { // anticipation: rear back, bow the stick
    const u = t / 0.333;
    s.hx = K(t, [[0, 660], [0.25, 590, 'out2'], [0.333, 586]]);
    s.hy = K(t, [[0, 800], [0.25, 752, 'out2'], [0.333, 760]]);
    s.r = K(t, [[0, 2.3], [0.25, 2.62, 'out2'], [0.333, 2.56]]);
    s.bend = K(t, [[0, -4], [0.25, -20], [0.333, -24]]);
    s.hx += Math.sin(u * 40) * 1.5; // nervous tremble
  } else if (t < 0.5) { // strike drag across the striker (on 1s)
    const p = matchStrikeProgress(t);
    s.hx = lerp(612, 1284, p); s.hy = 836 - 4 * Math.sin(p * Math.PI);
    s.r = lerp(2.2, 2.05, p); s.bend = 22; s.smear = t < 0.44 ? 1 : 0;
  } else if (t < 1.0) { // flip up + land upright on the box top
    const rE = -0.12, endX = BUTT[0] + Math.sin(rE) * STICK, endY = BUTT[1] - Math.cos(rE) * STICK;
    // tossed up spinning about its middle (~600 deg), rise ease-out, one hang drawing at the apex (f18), fall ease-in
    const fi = clamp(t * FPS - 12, 0, 12), H2 = STICK / 2;
    const c0x = 1290 - Math.sin(2.05) * H2, c0y = 832 + Math.cos(2.05) * H2;
    const c1x = endX - Math.sin(rE) * H2, c1y = endY + Math.cos(rE) * H2;
    const CY = [0, 110, 200, 270, 315, 340, 350, 351, 359, 375, 399, 434, 481].map((d) => c0y - d); // relative climb (stage units)
    const CYF = CY.map((y, i) => i <= 6 ? y : lerp(CY[6], c1y, [0, 0.004, 0.03, 0.11, 0.27, 0.55, 1][i - 6])); // R2: screen spacing ~7/21/43/75/120 px
    const i0 = Math.floor(fi), i1 = Math.min(12, i0 + 1), fr = fi - i0;
    const cy = lerp(CYF[i0], CYF[i1], fr), cx = lerp(c0x, c1x, fi / 12);
    const RT = [0, 0.115, 0.23, 0.34, 0.45, 0.555, 0.655, 0.745, 0.83, 0.9, 0.955, 0.99, 1]; // R2: spin decelerates -> falls near upright
    s.r = lerp(2.05, rE + Math.PI * 4, lerp(RT[i0], RT[i1], fr));
    if (i0 === 11) s.sy = 1.05; // last airborne drawing stretched along the fall
    s.hx = cx + Math.sin(s.r) * H2; s.hy = cy - Math.cos(s.r) * H2;
    s.bend = lerp(10, -6, fi / 12); s.toss = true;
  } else {
    const d = t - 1.0;
    const k = Math.round(d * 12); // R2: landing wobble about the butt on 2s: +8 deg, -4 deg, +1.5 deg, rest
    s.r = k < 3 ? [0.14, -0.07, 0.025][k] : 0;
    s.bend = k < 3 ? [7, -4, 1.5][k] : 0;
    if (k === 0) s.sy = 0.96;
    s.hx = BUTT[0] + Math.sin(s.r) * STICK; s.hy = BUTT[1] - Math.cos(s.r) * STICK; // rotate about the butt on the box
  }
  if (t >= 6.54) { // blown away
    const u = t - 6.54;
    s.hx += 1700 * u + 600 * u * u; s.hy += -900 * u + 1800 * u * u; s.r += 13 * u; s.bend = 10;
    if (u > 0.45) s.vis = false;
  }
  return s;
}
function matchLocal(bend) {
  // stick centreline from y=18 (under the head) to y=318 (butt)
  const cl = [];
  for (let i = 0; i <= 8; i++) { const u = i / 8; cl.push([bend * Math.sin(Math.PI * u), 18 + (STICK - 18) * u]); }
  return cl;
}
function drawMatchStick(c, s, D, seedBase) {
  if (!s.vis) return;
  const sd = seedBase + bv(D);
  const cl = matchLocal(s.bend);
  const T = (P) => xf(P, { x: s.hx, y: s.hy, r: s.r, sy: s.sy ?? 1 });
  // stick outline polygon (local)
  const L = [], R = [];
  cl.forEach(([x, y], i) => { const w = 10 + (i / 8) * 1.8; L.push([x - w, y]); R.push([x + w, y]); });
  const poly = T([...L, ...R.reverse()]);
  const d = dens(poly, 4);
  fillShape(c, d, PAL.hi, { seed: sd * 3, amp: 1.4, dx: REG.dx * 0.7, dy: REG.dy * 0.7 });
  // grain line
  inkStroke(c, T(cl.slice(2, 7).map(([x, y]) => [x + 3, y])), { seed: sd * 3 + 1, w: 2.2, t0: 20, t1: 30, amp: 1.2, heavy: 0 });
  inkLoop(c, d, { seed: sd * 3 + 2, w: 4.4, amp: 1.5, t0: 8, t1: 16, heavy: 0.3 });
}
// SMEAR / MULTIPLES frames of the strike (on 1s): f9 = stretch smear, f10 = multiples
function stickEnds(s) { return [[s.hx, s.hy], [s.hx - Math.sin(s.r) * STICK, s.hy + Math.cos(s.r) * STICK]]; }
function drawStrikeSmear(c, s, D, t) {
  const f = Math.round(t * FPS);
  const pv = matchState(t - 1 / FPS);
  const [H1, B1] = stickEnds(s), [H0, B0] = stickEnds(pv);
  const sd = 330 + f;
  if (f === 9) {
    // stick smear: the swept area, streaked
    const quad = [B0, H0, H1, B1];
    fillShape(c, dens(quad, 5), PAL.hi, { seed: sd, amp: 1.5, dx: REG.dx, dy: REG.dy });
    for (let k = 0; k < 6; k++) {
      const u = 0.12 + k * 0.15 + hs(sd, k) * 0.05;
      const a = [lerp(H0[0], B0[0], u), lerp(H0[1], B0[1], u)], b = [lerp(H1[0], B1[0], u), lerp(H1[1], B1[1], u)];
      inkStroke(c, [a, b], { seed: sd * 3 + k, w: 3, t0: 60, t1: 12, min: 0.05, amp: 1.2, heavy: 0 });
    }
    drawMatchStick(c, { ...s, smear: 0 }, D, 200);
    // head stretched ~300% back along the path
    const dx = H1[0] - H0[0], dy = H1[1] - H0[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
    if (!NODOT) {
    const back = L * 1.1, r = 27;
    const P = [[r, 0], [r * 0.6, r * 0.85], [-back * 0.45, r * 0.55], [-back, 0, 1], [-back * 0.45, -r * 0.55], [r * 0.6, -r * 0.85]];
    const d = spline(xf(P, { x: H1[0], y: H1[1], r: Math.atan2(uy, ux) }), true, 4);
    fillShape(c, d, PAL.red, { seed: sd + 1, amp: 1.5, dx: REG.dx, dy: REG.dy });
    inkLoop(c, d, { seed: sd + 2, w: 5.5, amp: 1.5 });
    }
  } else {
    // multiples: three drawn echoes between the previous and current pose
    for (let k = 0; k < 3; k++) {
      const u = 0.25 + k * 0.25;
      const e = { ...s, hx: lerp(pv.hx, s.hx, u), hy: lerp(pv.hy, s.hy, u), r: lerp(pv.r, s.r, u), bend: s.bend, smear: 0 };
      const [He, Be] = stickEnds(e);
      inkStroke(c, [Be, He], { seed: sd + 10 + k, w: 3.2, t0: 40, t1: 10, min: 0.1, amp: 1.2, heavy: 0 });
      const hd = headPts(e);
      if (!NODOT) {
      fillShape(c, hd, PAL.red, { seed: sd + 20 + k, amp: 1.2, dx: REG.dx, dy: REG.dy });
      inkLoop(c, hd, { seed: sd + 30 + k, w: 3.6, amp: 1.2 });
      }
    }
    drawMatchStick(c, { ...s, smear: 0 }, D, 200);
    const hd = headPts(s);
    if (!NODOT) {
    fillShape(c, hd, PAL.red, { seed: sd + 40, amp: 1.4, dx: REG.dx, dy: REG.dy });
    inkLoop(c, hd, { seed: sd + 41, w: 5.5, amp: 1.4, heavy: 0.4 });
    }
  }
  // speed lines trailing along the striker
  for (let k = 0; k < 4; k++) {
    const yy = s.hy - 26 + k * 17 + hs(sd, k) * 5;
    const x1 = Math.min(H0[0], H1[0]) - 30 - hs(sd, k, 2) * 50;
    inkStroke(c, [[x1 - 200 - hs(sd, k, 3) * 160, yy], [x1, yy]], { seed: sd + 50 + k, w: 4.2, t0: 120, t1: 8, min: 0.05, amp: 1.2, heavy: 0, color: PAL.hi });
  }
}
const HEAD_R = 27; // V5: the round match head (reported as the dot, r = 27 stage units)
function headPts(s, stretch = 1) {
  const P = (V5 ? circlePts(0, -2, 28, 28, 26) : circlePts(0, -2, 30, 28, 22)).map(([x, y]) => [x, y < 0 ? y * stretch : y]);
  return xf(P, { x: s.hx, y: s.hy, r: s.r });
}
function drawMatchHead(c, s, D, seedBase, t) {
  if (!s.vis) return;
  const sd = seedBase + bv(D);
  if (s.smear && t >= 0.36) { drawStrikeSmear(c, s, D, t); return; }
  if (t >= 0.44 && t < 0.5) { // last drag frame: speed lines + the phosphor starting to spit
    const sd2 = 340 + Math.round(t * FPS);
    for (let k = 0; k < 4; k++) {
      const yy = s.hy - 26 + k * 17 + hs(sd2, k) * 5, x1 = s.hx - 60 - hs(sd2, k, 2) * 40;
      inkStroke(c, [[x1 - 260 - hs(sd2, k, 3) * 160, yy], [x1, yy]], { seed: sd2 + 50 + k, w: 4.2, t0: 120, t1: 8, min: 0.05, amp: 1.2, heavy: 0, color: PAL.hi });
    }
    for (let k = 0; k < 5; k++) {
      const a = Math.PI + (k - 2) * 0.35, dd = 40 + 25 * hs(sd2, k, 4);
      drawSpark(c, s.hx + Math.cos(a) * dd, s.hy + Math.sin(a) * dd - 10, Math.cos(a) * 700, Math.sin(a) * 700, 6, sd2 * 3 + k);
    }
  }
  if (NODOT) return; // v5 ?nolink=dot: the match head is the reel's dot
  const d = headPts(s);
  fillShape(c, d, s.burnt ? PAL.ink : PAL.red, { seed: sd * 7, amp: 1.4, dx: REG.dx * 0.8, dy: REG.dy * 0.8 });
  inkLoop(c, d, { seed: sd * 7 + 1, w: 5.5, amp: 1.4, heavy: 0.4 });
  // highlight / ember
  const hl = xf([[-11, -14], [-5, -20]], { x: s.hx, y: s.hy, r: s.r });
  inkStroke(c, hl, { seed: sd + 5, w: 5, t0: 3, t1: 5, color: PAL.hi, amp: 0.8, heavy: 0 });
  if (s.burnt) {
    const em = xf([[6, -16]], { x: s.hx, y: s.hy, r: s.r })[0];
    c.fillStyle = PAL.red; c.beginPath(); c.arc(em[0], em[1], 4.5, 0, 7); c.fill();
  }
}

// ------------------------------------------------------------------ FLAME SPIRIT
// flame silhouette in unit space (bottom centre at 0,0; height 1 up = -y)
function flameUnit(seed, wild = 0.15, lick = 1) {
  const j = (k, a) => (hs(seed, k) - 0.5) * 2 * a;
  const hr_ = 0.66 + j(1, 0.06 + wild * 0.3) * lick;
  const hl_ = 0.76 + j(2, 0.06 + wild * 0.3) * lick;
  const tipx = j(3, 0.04 + wild * 0.2), tipy = -1.0 + j(4, 0.03 + wild * 0.12);
  return [
    [0, 0.0],
    [0.3, -0.035],
    [0.43, -0.2],
    [0.415, -0.4],
    [0.3 + j(5, 0.03 + wild * 0.1), -hr_, 1],
    [0.17, -0.55 + j(6, 0.04)],
    [tipx, tipy, 1],
    [-0.15, -0.6 + j(7, 0.04)],
    [-0.34 + j(8, 0.03 + wild * 0.1), -hl_, 1],
    [-0.44, -0.46],
    [-0.44, -0.24],
    [-0.31, -0.04],
  ];
}
function innerUnit(seed, wild) {
  const j = (k, a) => (hs(seed, k + 20) - 0.5) * 2 * a;
  return [
    [0, 0.0], [0.24, -0.04], [0.33, -0.18], [0.3, -0.36],
    [0.02 + j(1, 0.04 + wild * 0.1), -0.66 + j(2, 0.04), 1],
    [-0.3, -0.38], [-0.34, -0.18], [-0.24, -0.04],
  ];
}
// warp: shear + curl (top bends more) + squash/stretch about the base
function spiritXf(P, s) {
  const Hh = s.H;
  return P.map(([x, y, cr]) => {
    const up = -y; // 0..1
    let X = x * Hh * s.sx, Y = y * Hh * s.sy;
    X += (s.kx * up + s.curl * up * up) * Hh;
    if (s.spinW !== undefined) X *= s.spinW;
    const c = Math.cos(s.r || 0), sn = Math.sin(s.r || 0);
    return [s.x + X * c - Y * sn, s.y + X * sn + Y * c, cr];
  });
}
function spiritPt(s, x, y) { return spiritXf([[x, y]], s)[0]; }

function drawSpirit(c, s, D, t) {
  if (!s || s.H < 3) return;
  const sd = s.seed ?? (500 + D.id);
  const wild = s.wild ?? 0.12;
  if (s.smearUp) { // take-off smear: speed lines left behind under the stretched body
    for (let k = 0; k < 5; k++) {
      const x = s.x + (k - 2) * s.H * 0.11 + (hs(sd, k) - 0.5) * 10;
      const y0 = s.y + 10 + hs(sd, k, 2) * 30, L = s.H * (0.45 + 0.5 * hs(sd, k, 3));
      inkStroke(c, [[x, y0 + L], [x, y0]], { seed: sd + 200 + k, w: 4.5, t0: 60, t1: 8, min: 0.05, amp: 1, heavy: 0 });
    }
  }
  const outer = spline(spiritXf(flameUnit(sd, wild, s.lick ?? 1), s), true, 4);
  const inner = spline(spiritXf(innerUnit(sd, wild).map(([x, y, k]) => [x, y * 0.98 - 0.02, k]), s), true, 4);
  // detached flame droplet (fire FX): a lick breaks off and rises on some drawings
  const dph = Math.abs(Math.round(sd)) % 3;
  if (s.drops !== false && s.H > 120 && dph !== 2) { // lick cycle: low -> high -> gone (reads as fire, not a stuck speck)
    const k = dph * 0.8, hx = (dph ? 0.1 : -0.12) + (hs(sd, 92) - 0.5) * 0.08;
    const up = 1.08 + k * 0.28, sz = 0.07 * (1 - k * 0.6);
    const P = [[0, 0.06], [0.05, 0.0], [0, -0.13, 1], [-0.05, 0.0]].map(([x, y, cr]) => [hx + x * sz / 0.07, -up + y * sz / 0.07, cr]);
    const dd = spline(spiritXf(P, s), true, 3);
    fillShape(c, dd, PAL.red, { seed: sd + 3, amp: 1, dx: REG.dx * 0.5, dy: REG.dy * 0.5 });
    inkLoop(c, dd, { seed: sd + 4, w: Math.min(3.4, s.H * 0.016), amp: 1, t0: 3, t1: 6 });
  }
  fillShape(c, outer, PAL.red, { seed: sd * 2, amp: 1.8, dx: REG.dx, dy: REG.dy });
  fillShape(c, inner, PAL.yel, { seed: sd * 2 + 1, amp: 1.6, dx: REG.dx, dy: REG.dy });
  // paper-white glint on the inner flame
  if (s.H > 60) {
    const g = spiritXf([[-0.2, -0.16], [-0.23, -0.28], [-0.19, -0.4]], s);
    inkStroke(c, g, { seed: sd + 8, w: Math.max(3, s.H * 0.035), t0: 6, t1: 12, color: PAL.hi, amp: 1, heavy: 0 });
  }
  const lw = Math.max(3.0, Math.min(7, s.H * 0.024));
  inkLoop(c, outer, { seed: sd * 2 + 2, w: lw, amp: 1.8, splits: 2, heavy: 0.45, t0: 10, t1: 20 });
  // back-facing (during spin) -> no face
  if (s.face) drawFace(c, s, sd, lw);
  if (s.arms) drawArms(c, s, sd, lw);
}
function drawFace(c, s, sd, lw) {
  const f = s.face;
  const Hh = s.H;
  const lx = (f.look ?? 0) * 0.045, ly = (f.lookY ?? 0) * 0.03;
  const ex = 0.1 * (f.wide ?? 1), ey = -0.37 + (f.fy ?? 0);
  const eyeRX = 0.047, eyeRY = 0.078 * (f.pop ?? 1);
  for (const side of [-1, 1]) {
    const cx = side * ex + lx, cy = ey + ly;
    const mode = f.eyes ?? 'open';
    if (mode === 'open' || mode === 'fierce' || (mode === 'wink' && side < 0)) {
      if (mode === 'fierce') inkStroke(c, spiritXf([[cx + side * eyeRX * 1.5, cy - 0.12], [cx - side * eyeRX * 1.1, cy - 0.065]], s), { seed: sd + 46 + side, w: lw * 1.0, t0: 3, t1: 3, amp: 0.6, heavy: 0 });
      const P = circlePts(cx, cy, eyeRY, 18, eyeRX * (f.pop ?? 1)).map(([x, y]) => [x, y]);
      const d = spline(spiritXf(P, s), true, 3);
      fillShape(c, d, PAL.ink, { seed: sd + 30 + side, amp: 0.9 });
      const g = spiritPt(s, cx - eyeRX * 0.35, cy - eyeRY * 0.45);
      c.fillStyle = PAL.hi; c.beginPath(); c.arc(g[0], g[1], Math.max(1.6, Hh * 0.013), 0, 7); c.fill();
    } else if (mode === 'closed' || mode === 'wink') {
      inkStroke(c, spiritXf([[cx - eyeRX * 1.1, cy + 0.01], [cx, cy + 0.02], [cx + eyeRX * 1.1, cy + 0.01]], s), { seed: sd + 40 + side, w: lw * 0.9, t0: 4, t1: 4, amp: 0.8, heavy: 0 });
    } else if (mode === 'happy') { // ^ ^
      inkStroke(c, spiritXf([[cx - eyeRX * 1.2, cy + 0.02], [cx, cy - 0.04], [cx + eyeRX * 1.2, cy + 0.02]], s), { seed: sd + 40 + side, w: lw * 0.95, t0: 4, t1: 4, amp: 0.8, heavy: 0 });
    } else if (mode === 'squeeze') { // > <
      const k = side < 0 ? 1 : -1;
      inkStroke(c, spiritXf([[cx - eyeRX * k, cy - 0.035], [cx + eyeRX * k * 0.9, cy], [cx - eyeRX * k, cy + 0.035]], s), { seed: sd + 40 + side, w: lw * 0.9, t0: 4, t1: 4, amp: 0.8, heavy: 0 });
    } else if (mode === 'squint') {
      const P = circlePts(cx, cy + 0.015, eyeRY * 0.55, 14, eyeRX);
      fillShape(c, spline(spiritXf(P, s), true, 3), PAL.ink, { seed: sd + 30 + side, amp: 0.9 });
      inkStroke(c, spiritXf([[cx - eyeRX * 1.3, cy - 0.06 - side * 0.012], [cx + eyeRX * 1.3, cy - 0.06 + side * 0.012]], s), { seed: sd + 44 + side, w: lw * 0.8, t0: 3, t1: 3, amp: 0.6, heavy: 0 });
    }
  }
  const m = f.mouth ?? 'smile';
  const my = -0.245 + (f.fy ?? 0) + ly * 0.6, mx = lx * 0.8;
  if (m === 'smile') {
    inkStroke(c, spiritXf([[mx - 0.06, my - 0.01], [mx, my + 0.025], [mx + 0.06, my - 0.01]], s), { seed: sd + 50, w: lw * 0.85, t0: 3, t1: 3, amp: 0.7, heavy: 0 });
  } else if (m === 'o' || m === 'grin' || m === 'open') {
    const P = m === 'o' ? circlePts(mx, my + 0.005, 0.03, 14, 0.024)
      : [[mx - 0.075, my - 0.02], [mx + 0.075, my - 0.02], [mx + 0.05, my + 0.04], [mx, my + 0.06], [mx - 0.05, my + 0.04]];
    const d = spline(spiritXf(P, s), true, 3);
    fillShape(c, d, PAL.ink, { seed: sd + 52, amp: 0.8 });
    if (m !== 'o') {
      const tg = spline(spiritXf(circlePts(mx + 0.01, my + 0.04, 0.02, 12, 0.03), s), true, 3);
      c.save(); c.beginPath(); polyPath(c, d); c.clip();
      fillShape(c, tg, PAL.red, { seed: sd + 53, amp: 0.6 });
      c.restore();
    }
  } else if (m === 'grit') {
    inkStroke(c, spiritXf([[mx - 0.055, my], [mx + 0.055, my]], s), { seed: sd + 54, w: lw * 0.9, t0: 3, t1: 3, amp: 0.6, heavy: 0 });
  } else if (m === 'puff') {
    const d = spline(spiritXf(circlePts(mx, my, 0.02, 12, 0.045), s), true, 3);
    fillShape(c, d, PAL.ink, { seed: sd + 55, amp: 0.6 });
  }
  // cheeks
  if (f.cheeks) {
    for (const side of [-1, 1]) {
      const d = spline(spiritXf(circlePts(side * 0.2 + lx, -0.27 + (f.fy ?? 0), 0.025, 12, 0.04), s), true, 3);
      fillShape(c, d, PAL.red, { seed: sd + 60 + side, amp: 0.6 });
    }
  }
}
// rubber-hose arms with paper-white gloves
function drawArms(c, s, sd, lw) {
  const A = s.arms;
  for (const side of [-1, 1]) {
    const a = side < 0 ? A.L : A.R;
    if (!a) continue;
    const sh = [side * 0.4, -0.36];
    const ang = a.ang, len = (a.len ?? 0.42);
    // direction in unit space: outward = side*x, positive ang = up
    const dx = side * Math.cos(ang), dy = -Math.sin(ang);
    const bx = -dy * (a.bend ?? 0.3) * side, by = dx * (a.bend ?? 0.3) * side;
    const mid = [sh[0] + dx * len * 0.5 + bx * len * 0.35, sh[1] + dy * len * 0.5 + by * len * 0.35];
    const hand = [sh[0] + dx * len, sh[1] + dy * len];
    // arms don't squash with the body: build in a non-squashed frame
    const s2 = { ...s, sx: (s.sx + 1) / 2, sy: (s.sy + 1) / 2 };
    const P = spiritXf([sh, mid, hand], s2);
    inkStroke(c, P, { seed: sd + 70 + side, w: lw * 1.05, t0: 4, t1: 2, min: 0.6, jit: 0.2, amp: 1.2, heavy: 0 });
    const hp = P[2], R = s.H * 0.082 * (a.big ?? 1);
    const g = circlePts(hp[0], hp[1], R, 16, R * 1.08);
    fillShape(c, g, PAL.hi, { seed: sd + 80 + side, amp: 1, dx: REG.dx * 0.5, dy: REG.dy * 0.5 });
    inkLoop(c, g, { seed: sd + 82 + side, w: lw * 0.9, amp: 1, t0: 4, t1: 8 });
    // two finger lines
    const fa = Math.atan2(P[2][1] - P[1][1], P[2][0] - P[1][0]);
    for (const k of [-1, 1]) {
      const a0 = fa + k * 0.35;
      inkStroke(c, [[hp[0] + Math.cos(a0) * R * 0.2, hp[1] + Math.sin(a0) * R * 0.2], [hp[0] + Math.cos(a0) * R * 0.8, hp[1] + Math.sin(a0) * R * 0.8]], { seed: sd + 90 + k + side * 3, w: lw * 0.55, t0: 2, t1: 3, amp: 0.5, heavy: 0 });
    }
  }
}

// ------------------------------------------------------------------ choreography of the spirit
function hopEnv(t, hops) { // returns { y offset, sq (sy multiplier), spin }
  let y = 0, sq = 1, spin = 0;
  for (const h of hops) {
    const { t0, t1, h: hh } = h;
    if (t > t0 && t < t1) { const p = inv(t0, t1, t); y -= hh * 4 * p * (1 - p); if (h.spin) spin = p; }
    // anticipation squash before take-off, stretch after, squash on landing, overshoot
    sq *= 1 + K(t, [[t0 - 0.125, 0], [t0 - 0.02, -0.2, 'out2'], [t0 + 0.04, 0.22, 'out2'], [lerp(t0, t1, 0.5), 0.0], [t1 - 0.04, 0.14], [t1, -0.3, 'in2'], [t1 + 0.085, 0.1, 'out2'], [t1 + 0.18, 0]]) * ((t > t0 - 0.13 && t < t1 + 0.2) ? 1 : 0);
  }
  return { y, sq, spin };
}
const GROUND = 745;
const HOPS = [
  { t0: 2.833, t1: 3.0, h: 120 },
  { t0: 3.333, t1: 3.5, h: 115 },
  { t0: 3.75, t1: 4.0, h: 175, spin: true },
];
function spiritState(t, D, m) {
  if (t < 0.5 || t >= 6.5) return null;
  const s = { x: 0, y: 0, H: 100, sx: 1, sy: 1, kx: 0, curl: 0, r: 0, wild: 0.12, face: null, arms: null };
  if (t < 2.0) {
    // sitting on the match head
    const pm = matchState(Math.max(0, t - 1 / FPS));
    s.x = m.hx; s.y = m.hy + 18;
    s.H = K(t, [[0.5, 40], [0.542, 180, 'out3'], [0.625, 225, 'out2'], [0.792, 168], [1.0, 172], [1.25, 188, 'out2'], [1.75, 190]]);
    s.wild = K(t, [[0.5, 1.2], [0.8, 0.5], [1.1, 0.15]]);
    const vx = (m.hx - pm.hx) * FPS, vy = (m.hy - pm.hy) * FPS;
    s.kx = clamp(-vx * 0.00035, -0.7, 0.7);
    const sp = Math.hypot(vx, vy);
    s.sy = 1 + Math.min(0.45, sp * 0.00012); s.sx = 1 / Math.sqrt(s.sy);
    if (t >= 1.25) {
      const pop = K(t, [[1.25, 1.35], [1.333, 1.0, 'out2']]);
      const blink = t >= CUES.blink - 0.01 && t < CUES.blink + 0.07;
      const look = K(t, [[1.458, 0], [1.5, -1, 'out3'], [1.625, -1], [1.667, 1, 'out3'], [1.75, 1], [1.833, 0, 'out2']]);
      s.face = { eyes: blink ? 'closed' : 'open', look, pop, mouth: t < 1.5 ? 'o' : 'smile', fy: -0.1 };
      s.kx += look * 0.06;
      if (t >= 1.75) { // crouch: anticipation for the jump
        const q = K(t, [[1.75, 1], [1.917, 0.64, 'out2'], [2.0, 0.6]]);
        s.sy *= q; s.sx *= 1 / Math.pow(q, 0.8);
        s.face.eyes = 'fierce'; s.face.mouth = 'grit';
        s.x += (hs(D.id, 3) - 0.5) * 4;
      }
    }
    return s;
  }
  if (t < 2.5) { // JUMP (on 1s)
    const fi = clamp(Math.round(t * FPS) - 48, 0, 11);
    s.x = lerp(1150, 840, fi / 12);
    // R1s2 screen spacing: rise 80/52/27/10, hang (95% squash), fall 15/40/70/95/120/140 (ease-in)
    s.y = [478, 403, 348, 316, 301, 300, 314, 351, 412, 493, 590, 697][fi];
    s.H = K(t, [[2.0, 190], [2.4, 228, 'out2']]);
    s.sy = [2.6, 1.3, 1.18, 1.06, 1.0, 0.95, 1.0, 1.06, 1.12, 1.18, 1.24, 1.26][fi];
    if (fi === 0) s.smearUp = true;
    s.sx = 1 / Math.pow(s.sy, 0.8);
    s.kx = K(t, [[2.0, 0.25], [2.25, 0.05], [2.458, -0.15]]);
    s.r = K(t, [[2.0, -0.25], [2.25, 0.1], [2.458, 0.05]]);
    s.wild = 0.35;
    s.face = { eyes: t < 2.2 ? 'squeeze' : 'open', mouth: t < 2.2 ? 'grin' : 'o', pop: 1.1 };
    return s;
  }
  // ---- on the matchbox: landing, dance, spin, squash
  s.H = 250; s.y = GROUND;
  const xk = [[2.5, 840], [2.833, 840], [3.0, 690, 'io2'], [3.333, 690], [3.5, 965, 'io2'], [3.75, 965], [4.0, 810, 'io2'], [5.5, 820], [6.0, 860, 'io2']];
  s.x = K(t, xk);
  const vx = (K(t + 0.02, xk) - K(t - 0.02, xk)) / 0.04;
  const he = hopEnv(t, HOPS);
  s.y += he.y;
  // landing from the big jump
  let sq = he.sq * (1 + K(t, [[2.5, -0.44], [2.583, 0.14, 'out2'], [2.667, -0.05], [2.75, 0]]));
  // groove bounce on the beats while grounded
  if (t >= 4.0 && t < 4.5) sq *= 1 + 0.06 * Math.cos((t - 4.0) * Math.PI * 8);
  sq = Math.max(0.62, sq);
  s.sy = sq; s.sx = 1 / Math.pow(sq, 0.75);
  s.kx = clamp(-vx * 0.0006, -0.35, 0.35);
  s.curl = clamp(-vx * 0.0004, -0.3, 0.3);
  s.wild = 0.14;
  // arms pop out after landing
  const armOn = t >= 2.583;
  let AL = { ang: -0.6, bend: 0.3 }, AR = { ang: -0.6, bend: 0.3 };
  let face = { eyes: 'open', mouth: 'smile' };
  if (t < 2.75) { face = { eyes: t < 2.583 ? 'squeeze' : 'open', mouth: t < 2.583 ? 'grin' : 'open', pop: t < 2.667 ? 1.2 : 1 }; }
  // dance arms: swing with the hops
  const beatPh = (t - 2.5) * 2; // beats
  const swing = Math.sin(beatPh * Math.PI);
  AL = { ang: 0.2 + 0.9 * swing, bend: 0.5 }; AR = { ang: 0.2 - 0.9 * swing, bend: 0.5 };
  if (t >= 2.5 && t < 2.83) { AL = { ang: K(t, [[2.583, 1.3], [2.75, 0.5]]), bend: 0.3 }; AR = { ang: K(t, [[2.583, 1.3], [2.75, 0.5]]), bend: 0.3 }; }
  face.look = clamp(vx * 0.004, -1, 1);
  // twirl in hop 3
  if (he.spin > 0 && he.spin < 1) {
    s.spinW = Math.cos(he.spin * Math.PI * 2);
    if (Math.abs(s.spinW) < 0.35) s.spinW = Math.sign(s.spinW || 1) * 0.35;
    face = s.spinW > 0 ? { eyes: 'happy', mouth: 'open' } : null;
    AL = { ang: 1.4, bend: 0.2 }; AR = { ang: 1.4, bend: 0.2 };
  }
  if (t >= 4.0 && t < 4.5) { // shimmy: alternating lean every drawing
    const k = Math.round((t - 4.0) * 12) % 2 ? 1 : -1;
    s.kx += k * 0.14; s.curl += k * 0.08;
    AL = { ang: 1.0 + k * 0.35, bend: -0.4 * k }; AR = { ang: 1.0 - k * 0.35, bend: 0.4 * k };
    face = { eyes: 'happy', mouth: 'open', look: k * 0.5 };
  }
  if (t >= 4.5 && t < 5.0) { // TA-DA (held on 3s)
    const q = K(t, [[4.5, 1.18], [4.625, 1.08, 'out2']]);
    s.sy = q; s.sx = 1 / Math.pow(q, 0.8);
    s.kx = 0; s.curl = 0;
    AL = { ang: 0.85, bend: -0.15, len: 0.48, big: 1.15 }; AR = { ang: 0.85, bend: -0.15, len: 0.48, big: 1.15 };
    face = { eyes: 'happy', mouth: 'grin', cheeks: true };
  }
  if (t >= 5.0 && t < 5.5) { // gathering: dips on 5.0 and 5.25, arms pulled in
    const q = 1 + K(t, [[5.0, -0.2], [5.083, 0.05, 'out2'], [5.25, -0.24, 'in2'], [5.333, 0.08, 'out2'], [5.5, 0]]);
    s.sy = q; s.sx = 1 / Math.pow(q, 0.8);
    AL = { ang: K(t, [[5.0, 0.4], [5.4, -0.9]]), bend: 0.8 }; AR = { ang: K(t, [[5.0, 0.4], [5.4, -0.9]]), bend: 0.8 };
    face = { eyes: 'fierce', mouth: 'smile' };
  }
  if (t >= 5.5 && t < 6.25) { // SPIN wind-up (on 1s)
    const u = inv(5.5, 6.25, t);
    const ph = 1.3 * u + 3.2 * u * u; // turns
    s.spinW = Math.cos(ph * Math.PI * 2);
    const back = s.spinW < 0;
    if (Math.abs(s.spinW) < 0.22) s.spinW = (s.spinW < 0 ? -1 : 1) * 0.22;
    s.y -= 70 * E.out2(u);
    s.H = lerp(250, 330, E.io2(u));
    s.wild = lerp(0.2, 0.7, u);
    s.kx = 0.12 * Math.sin(ph * Math.PI * 2); s.curl = 0.25 * Math.sin(ph * Math.PI * 2 + 1);
    s.sy = 1 + 0.08 * Math.sin(ph * 12); s.sx = 1;
    face = back ? null : { eyes: 'fierce', mouth: 'grit' };
    AL = null; AR = null;
    s.spinU = u; s.spinPh = ph;
  }
  if (t >= 6.25) { // crouch, trembling, before the burst
    const u = inv(6.25, 6.5, t);
    s.y -= 70;
    s.H = 330 * (1 + 0.1 * u);
    const q = lerp(0.78, 0.6, E.out2(u));
    s.sy = q; s.sx = 1 / Math.pow(q, 0.7);
    s.x += (hs(D.id, 5) - 0.5) * 10 * (0.5 + u); s.y += (hs(D.id, 6) - 0.5) * 6;
    s.wild = 0.9;
    face = { eyes: 'squeeze', mouth: 'puff', cheeks: true };
    AL = null; AR = null;
  }
  s.face = face;
  s.arms = armOn && (AL || AR) ? { L: AL, R: AR } : null;
  return s;
}

// ------------------------------------------------------------------ small cel FX
function drawPuff(c, x, y, r, seed, o = {}) { // one little cloud puff (3–5 circles)
  const n = o.n ?? 4;
  const cs = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + hs(seed, i) * 1.2;
    const d = i === 0 ? 0 : r * 0.55;
    cs.push({ x: x + Math.cos(a) * d * (o.wide ?? 1), y: y + Math.sin(a) * d * 0.7 * (o.flat ?? 1), r: r * (i === 0 ? 0.8 : 0.5 + 0.25 * hs(seed, i, 2)) });
  }
  cloud(c, cs, { seed, fill: o.fill ?? PAL.hi, w: o.w ?? Math.max(3, r * 0.08), holes: o.holes });
}
// union-of-circles cloud with a single boiling ink outline + optional dissipation holes
function cloud(c, cs, o) {
  const { seed = 1, fill = PAL.hi, w = 6, amp = 1.8 } = o;
  const L = LY.get(0);
  L.save(); L.setTransform(c.getTransform());
  const circ = (k, x, y, r, rx) => boil(circlePts(x, y, Math.max(1, r), Math.max(12, Math.round((rx ?? r) / 3)), rx), seed + k * 7, amp, 60);
  // outer ink (radius varies per circle with a shadow-side bias)
  L.fillStyle = PAL.ink;
  cs.forEach((q, k) => {
    if (q.r < 1) return;
    const qrx = q.rx ?? q.r;
    const P = circlePts(0, 0, 1, Math.max(12, Math.round(Math.max(q.r, qrx) / 3))).map(([ca, sa]) => {
      const a = Math.atan2(sa, ca);
      const ww = w * (0.75 + 0.55 * Math.max(0, Math.cos(a - 0.9)) + 0.25 * G.N3(ca * 2, sa * 2, seed + k));
      return [q.x + ca * (qrx + ww * 0.5), q.y + sa * (q.r + ww * 0.5)];
    });
    L.beginPath(); polyPath(L, boil(P, seed + k * 7, amp, 60)); L.fill();
  });
  // colour (off-register) goes UNDER the ink: draw it on main first
  c.save();
  cs.forEach((q, k) => { if (q.r >= 1) fillShape(c, circlePts(q.x, q.y, q.r, Math.max(12, Math.round((q.rx ?? q.r) / 3)), q.rx), fill, { seed: seed + k * 7 + 3, amp, dx: REG.dx, dy: REG.dy }); });
  c.restore();
  // cut the inside of the ring
  L.globalCompositeOperation = 'destination-out';
  cs.forEach((q, k) => { if (q.r >= 1) { L.beginPath(); polyPath(L, circ(k, q.x, q.y, q.r - w * 0.5, q.rx !== undefined ? q.rx - w * 0.5 : undefined)); L.fill(); } });
  L.globalCompositeOperation = 'source-over';
  L.restore();
  if (o.holes && o.holes.length) {
    // dissipation: holes eat the colour + get their own inked rim
    c.save();
    // cut holes in colour on main by painting paper back is impossible -> use a second layer for the whole puff
    c.restore();
  }
  blit(c, L);
}

// ------------------------------------------------------------------ SMOKE group with dissipation (own layer)
function smokeGroup(c, puffs, o) {
  // puffs: [{x,y,r,holes:[{x,y,r}]}]; drawn onto layer 1 (fill + ink), holes cut + rimmed there, then composited
  const { seed = 1, w = 6, fill = PAL.hi } = o;
  const L = LY.get(1);
  L.save(); L.setTransform(c.getTransform());
  const ring = LY.get(2); ring.save(); ring.setTransform(c.getTransform());
  for (const [k, p] of puffs.entries()) {
    if (p.r < 2) continue;
    const cs = p.cs || [{ x: p.x, y: p.y, r: p.r }];
    cs.forEach((q, j) => {
      if (q.r < 1.5) return;
      const n = Math.max(12, Math.round(q.r / 3));
      fillShape(L, circlePts(q.x, q.y, q.r, n), fill, { seed: seed + k * 31 + j * 5, amp: 1.6, dx: REG.dx, dy: REG.dy });
      ring.fillStyle = PAL.ink;
      const P = circlePts(q.x, q.y, q.r, n).map(([x, y]) => {
        const a = Math.atan2(y - q.y, x - q.x);
        const ww = w * (0.7 + 0.6 * Math.max(0, Math.cos(a - 0.9)));
        return [q.x + Math.cos(a) * (q.r + ww * 0.5), q.y + Math.sin(a) * (q.r + ww * 0.5)];
      });
      ring.beginPath(); polyPath(ring, boil(P, seed + k * 31 + j * 5, 1.6, 60)); ring.fill();
    });
  }
  ring.globalCompositeOperation = 'destination-out';
  for (const [k, p] of puffs.entries()) {
    const cs = p.cs || [{ x: p.x, y: p.y, r: p.r }];
    cs.forEach((q, j) => { if (q.r >= 1.5) { ring.beginPath(); polyPath(ring, boil(circlePts(q.x, q.y, q.r - w * 0.5, Math.max(12, Math.round(q.r / 3))), seed + k * 31 + j * 5 + 1, 1.6, 60)); ring.fill(); } });
  }
  ring.globalCompositeOperation = 'source-over';
  ring.restore();
  // combine ring over fill in layer 1
  L.save(); L.setTransform(1, 0, 0, 1, 0, 0); L.drawImage(ring.canvas, 0, 0); L.restore();
  // volume: one inked shade arc inside each puff (lower-right), like a hand-drawn smoke cel
  for (const [k, p] of puffs.entries()) {
    if (p.r < 20) continue;
    const q = (p.cs || [p])[0];
    const P = [];
    const a0 = 0.15 + hs(seed, k, 5) * 0.3, a1 = a0 + 1.1 + hs(seed, k, 6) * 0.5;
    for (let i = 0; i <= 10; i++) { const a = lerp(a0, a1, i / 10); P.push([q.x + Math.cos(a) * q.r * 0.66, q.y + Math.sin(a) * q.r * 0.62]); }
    inkStroke(L, P, { seed: seed + 40 + k, w: w * 0.75, t0: 14, t1: 20, min: 0.1, amp: 1.2, heavy: 0 });
  }
  // holes: rim (source-atop) then cut
  for (const [k, p] of puffs.entries()) {
    for (const [j, hq] of (p.holes || []).entries()) {
      if (hq.r < 1) continue;
      const n = Math.max(10, Math.round(hq.r / 3));
      L.globalCompositeOperation = 'source-atop';
      L.fillStyle = PAL.ink; L.beginPath(); polyPath(L, boil(circlePts(hq.x, hq.y, hq.r + w * 0.9, n), seed + 900 + k * 17 + j, 1.4, 60)); L.fill();
      L.globalCompositeOperation = 'destination-out';
      L.beginPath(); polyPath(L, boil(circlePts(hq.x, hq.y, hq.r, n), seed + 950 + k * 17 + j, 1.4, 60)); L.fill();
    }
  }
  L.globalCompositeOperation = 'source-over';
  L.restore();
  blit(c, L);
}

// ------------------------------------------------------------------ smoke wisp from the burnt match
function drawWisp(c, x, y, t, D, amt = 1, big = 0) {
  if (amt <= 0) return;
  const ph = D.fq / FPS * 5;
  const Hh = 170 * (1 + 0.22 * big), dr = 250 * big; // R2s2 (P4): in the low shot the curl rises higher and drifts right into the empty third
  const strand = (sd, off, w, k) => {
    const P = [];
    for (let i = 0; i <= 8; i++) {
      const u = i / 8;
      const v = u * (off ? 0.72 : 1);
      P.push([x + off * v + Math.sin(v * 5 + ph + k) * (6 + (26 + 24 * big) * v) * amt + dr * v * v * amt, y - v * Hh * amt - off * 0.3 * v]);
    }
    inkStroke(c, P, { seed: sd + D.id, w, t0: 20, t1: 40, amp: 1.2, heavy: 0 });
    return P;
  };
  const P = strand(700, 0, 5, 0);
  if (big > 0) strand(710, 34 * big, 3.6, 1.7); // second, thinner strand
  // curl at the top
  const tp = P[P.length - 1];
  const r = (16 + 24 * big) * amt;
  const cp = [];
  for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + i * 0.55 + ph; const rr = r * (1 - i / 16); cp.push([tp[0] + Math.cos(a) * rr, tp[1] - r + Math.sin(a) * rr]); }
  inkStroke(c, cp, { seed: 720 + D.id, w: 4 + big, t0: 6, t1: 20, amp: 1, heavy: 0 });
}

// ------------------------------------------------------------------ TITLE 手作
// skeletons in unit char space (0..1, y down); type: h (横) v (竖) p (撇) g (竖钩)
const CHAR_SHOU = [
  { k: 'p', P: [[0.76, 0.055], [0.56, 0.13], [0.27, 0.185]] },
  { k: 'h', P: [[0.17, 0.385], [0.5, 0.36], [0.83, 0.335]] },
  { k: 'h', P: [[0.05, 0.61], [0.5, 0.58], [0.95, 0.545]] },
  { k: 'g', P: [[0.52, 0.15], [0.527, 0.55], [0.515, 0.875, 1], [0.32, 0.765]] },
];
const CHAR_ZUO = [
  { k: 'p', P: [[0.34, 0.04], [0.25, 0.26], [0.05, 0.48]] },
  { k: 'v', P: [[0.215, 0.31], [0.22, 0.62], [0.215, 0.95]] },
  { k: 'p', P: [[0.6, 0.05], [0.53, 0.2], [0.41, 0.35]] },
  { k: 'h', P: [[0.5, 0.235], [0.72, 0.225], [0.94, 0.215]] },
  { k: 'v', P: [[0.575, 0.25], [0.58, 0.6], [0.575, 0.95]] },
  { k: 'h', P: [[0.585, 0.47], [0.74, 0.465], [0.88, 0.46]] },
  { k: 'h', P: [[0.585, 0.7], [0.75, 0.695], [0.9, 0.69]] },
];
const TITLE = V5 ? { cx: 960, cy: 432, S: 300, gap: 8, w: 0.1, ink: 5.6 } : { cx: 960, cy: 440, S: 352, gap: 18 };
const V5CH = '逐帧手绘';
function charXf(i) {
  const S = TITLE.S;
  if (V5) { const J = [[-6, -0.04], [8, 0.03], [-5, -0.03], [7, 0.035]][i]; return { x: TITLE.cx + (i - 1.5) * (S + TITLE.gap), y: TITLE.cy + J[0], r: J[1], S }; }
  return i === 0
    ? { x: TITLE.cx - S / 2 - TITLE.gap / 2 - 8, y: TITLE.cy - 6, r: -0.045, S }
    : { x: TITLE.cx + S / 2 + TITLE.gap / 2 + 8, y: TITLE.cy + 8, r: 0.035, S: S * 1.0 };
}
function strokeList() {
  const L = [];
  [CHAR_SHOU, CHAR_ZUO].forEach((ch, ci) => ch.forEach((st, si) => L.push({ ...st, ci, si })));
  return L;
}
let STROKES = strokeList(); // V5: replaced in init() by the 32 strokes of 逐帧手绘 (Make Me a Hanzi medians, real stroke order)
// V5 stroke kinds from the median shape: d (点), g (hook at the end), p (撇, ends down-left), n (捺, ends down-right), b (bone)
function v5Kind(P) {
  const seg = [], L = [0];
  for (let i = 1; i < P.length; i++) { seg.push([P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]]); L.push(L[i - 1] + Math.hypot(...seg[i - 1])); }
  const tot = L.at(-1);
  if (tot < 0.13) return { k: 'd' };
  for (let i = seg.length - 1; i >= 1; i--) { // last sharp reversal near the end = hook
    const a = Math.atan2(seg[i - 1][1], seg[i - 1][0]), b = Math.atan2(seg[i][1], seg[i][0]);
    let dA = Math.abs(b - a); if (dA > Math.PI) dA = 2 * Math.PI - dA;
    const tail = tot - L[i];
    if (tail > 0.3 * tot) break;
    if (dA > 1.75 && tail > 0.03) return { k: 'g', h: L[i] / tot };
  }
  let j = 0; while (j < L.length - 1 && L[j] < 0.7 * tot) j++;
  const ex = P.at(-1)[0] - P[Math.min(j, P.length - 2)][0], ey = P.at(-1)[1] - P[Math.min(j, P.length - 2)][1], el = Math.hypot(ex, ey) || 1;
  if (ex < -0.3 * el && ey > 0.1 * el) return { k: 'p' };
  const sx = P.at(-1)[0] - P[0][0], sy = P.at(-1)[1] - P[0][1];
  if (ex > 0.4 * el && ey > 0.15 * el && sy > 0.12 && sx > 0.12 && tot > 0.25) return { k: 'n' };
  return { k: 'b' };
}
async function loadV5Strokes() {
  const out = [], per = 0.125, dur = 0.14, cStart = [7.25, 7.292, 7.333, 7.375]; // 4 fuses, one per character, on 1s; strokes on 16ths (+1-frame flam per character)
  for (const [ci, ch] of [...V5CH].entries()) {
    const d = await (await fetch(`/demos/05-cel-boil/assets/hanzi/${encodeURIComponent(ch)}.json`)).json();
    d.medians.forEach((m, si) => {
      const P = m.map(([x, y]) => [x / 1024, (900 - y) / 1024]);
      for (let i = 1; i < P.length - 1; i++) { // keep real corners (横折) sharp
        const ax = P[i][0] - P[i - 1][0], ay = P[i][1] - P[i - 1][1], bx = P[i + 1][0] - P[i][0], by = P[i + 1][1] - P[i][1];
        if (Math.hypot(ax, ay) < 0.035 || Math.hypot(bx, by) < 0.035) continue;
        let dA = Math.abs(Math.atan2(by, bx) - Math.atan2(ay, ax)); if (dA > Math.PI) dA = 2 * Math.PI - dA;
        if (dA > 1.0) P[i][2] = 1;
      }
      out.push({ P, ...v5Kind(P), ci, si, first: si === 0, t0: cStart[ci] + si * per, dur });
    });
  }
  return out;
}
function strokeWorld(st) {
  const X = charXf(st.ci);
  return xf(st.P.map(([x, y, cr]) => [(x - 0.5) * X.S, (y - 0.5) * X.S, cr]), { x: X.x, y: X.y, r: X.r });
}
function strokeWidth(k, u, W0, st) {
  if (V5 && st) {
    if (k === 'd') return W0 * (0.95 + 0.45 * Math.sin(Math.PI * Math.min(1, u * 1.1)));
    if (k === 'n') return W0 * (u < 0.82 ? 0.9 + 0.4 * sstep(0, 0.82, u) : lerp(1.3, 0.6, (u - 0.82) / 0.18));
    if (k === 'g') return W0 * (u < st.h ? 1.0 + 0.06 * Math.sin(u * Math.PI / st.h) : lerp(1.0, 0.45, (u - st.h) / (1 - st.h)));
  }
  if (k === 'p') return W0 * (1.12 - 0.62 * Math.pow(u, 1.4));
  if (k === 'g') return W0 * (u < 0.8 ? 1.0 + 0.08 * Math.sin(u * Math.PI) : lerp(1.0, 0.5, (u - 0.8) / 0.2));
  // bone: a touch fatter at both ends
  return W0 * (0.94 + 0.16 * Math.pow(Math.abs(u - 0.5) * 2, 2));
}
function titleDense(st, seed, amp) {
  const pts = resample(spline(strokeWorld(st), false, 5), 3.5);
  return boil(pts, seed, amp, 80);
}
// draws the title strokes (each with progress 0..1) with union ink outline, off-register fill, drop shadow
function drawTitle(c, prog, D, o) {
  const W0 = TITLE.S * (TITLE.w ?? 0.165), ink = TITLE.ink ?? 6.8;
  const sv = bv(D);
  const polys = (grow, seedOff, amp, prg = prog) => STROKES.map((st, i) => {
    const p = prg[i]; if (p <= 0) return null;
    const full = titleDense(st, 3000 + i * 11 + seedOff + sv * 101, amp);
    const part = prefix(full, E.out2(p) * 0.999 + 0.001 * p);
    if (part.length < 2) return null;
    const tot = arclen(full).at(-1);
    return outline(part, (u, s) => strokeWidth(st.k, s / tot, W0, st) + grow(s, i), true);
  }).filter(Boolean);
  // drop shadow (ink block shadow, pops at the settle)
  if (o.shadow > 0) {
    const sx = 9 * o.shadow, sy = 12 * o.shadow;
    c.save(); c.translate(sx, sy);
    for (const p of polys(() => ink * 2, 0, 1.6)) fillPoly(c, p, PAL.ink);
    c.restore();
  }
  // fill (off-register, independently boiled)
  c.save(); c.translate(REG.dx * 0.9, REG.dy * 0.9);
  for (const p of polys(() => 1.5, 55, 1.8)) fillPoly(c, p, PAL.yel);
  c.restore();
  // highlights
  if (o.shine > 0) {
    STROKES.forEach((st, i) => {
      if (prog[i] < 0.6) return;
      const full = titleDense(st, 5000 + i * 7 + sv * 13, 1.2);
      const n = full.length;
      const a = Math.floor(n * 0.14), b = Math.floor(n * (st.k === 'p' ? 0.4 : 0.36));
      const seg = full.slice(a, b).map((q, j, arr) => {
        const q0 = arr[Math.max(0, j - 1)], q1 = arr[Math.min(arr.length - 1, j + 1)];
        let tx = q1[0] - q0[0], ty = q1[1] - q0[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        // offset toward upper-left side
        let nx = -ty, ny = tx; if (nx + ny > 0) { nx = -nx; ny = -ny; }
        return [q[0] + nx * W0 * 0.24, q[1] + ny * W0 * 0.24];
      });
      if (seg.length > 2) inkStroke(c, seg, { seed: 5100 + i + sv, w: W0 * 0.16 * o.shine, t0: 10, t1: 18, color: PAL.hi, amp: 0.6, heavy: 0, dense: true });
    });
  }
  // ink ring = fat minus thin (union outline)
  const L = LY.get(0);
  L.save(); L.setTransform(c.getTransform());
  for (const p of polys((s, i) => ink * 2 * (0.8 + 0.35 * G.N3(s / 50, i, sv * 3.3)), 0, 1.6)) fillPoly(L, p, PAL.ink);
  L.globalCompositeOperation = 'destination-out';
  for (const p of polys(() => 0, 0, 1.6)) fillPoly(L, p, '#000');
  L.restore();
  blit(c, L);
}

// ------------------------------------------------------------------ hand-lettered HAND MADE (monoline marker caps)
const LET = {
  H: { w: 0.62, s: [[[0, 0], [0, 1]], [[0.62, 0], [0.62, 1]], [[0, 0.5], [0.62, 0.48]]] },
  A: { w: 0.7, s: [[[0, 1], [0.35, 0, 1], [0.7, 1]], [[0.15, 0.64], [0.55, 0.62]]] },
  N: { w: 0.62, s: [[[0, 1], [0, 0, 1], [0.62, 1, 1], [0.62, 0]]] },
  D: { w: 0.62, s: [[[0, 0], [0, 1]], [[0, 0, 1], [0.34, 0.02], [0.6, 0.28], [0.62, 0.52], [0.56, 0.8], [0.32, 0.99], [0, 1, 1]]] },
  M: { w: 0.8, s: [[[0, 1], [0.03, 0, 1], [0.4, 0.68, 1], [0.77, 0, 1], [0.8, 1]]] },
  E: { w: 0.54, s: [[[0.54, 0], [0, 0, 1], [0, 1, 1], [0.56, 1]], [[0, 0.5], [0.44, 0.49]]] },
  // V5 only (FRAME BY FRAME)
  F: { w: 0.54, s: [[[0.55, 0], [0, 0, 1], [0, 1]], [[0, 0.49], [0.42, 0.48]]] },
  R: { w: 0.6, s: [[[0, 1], [0, 0]], [[0, 0, 1], [0.34, 0.01], [0.56, 0.1], [0.6, 0.26], [0.5, 0.43], [0.28, 0.5], [0, 0.5, 1]], [[0.26, 0.5], [0.62, 1]]] },
  B: { w: 0.6, s: [[[0, 0], [0, 1]], [[0, 0, 1], [0.3, 0.01], [0.5, 0.09], [0.53, 0.25], [0.4, 0.43], [0.18, 0.48], [0, 0.48, 1]], [[0, 0.48, 1], [0.34, 0.5], [0.58, 0.61], [0.62, 0.8], [0.5, 0.95], [0.28, 1], [0, 1, 1]]] },
  Y: { w: 0.64, s: [[[0, 0], [0.32, 0.5, 1], [0.64, 0]], [[0.32, 0.5], [0.32, 1]]] },
};
function drawWord(c, word, x0, y0, h, D, o = {}) {
  const tr = o.track ?? 0.36;
  let x = x0;
  const out = [];
  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    if (ch === ' ') { x += h * 0.55; continue; }
    const L = LET[ch];
    out.push({ ch, x, L, i });
    x += (L.w + tr) * h;
  }
  const total = x - x0 - tr * h;
  const shift = o.center ? -total / 2 : 0;
  const SL = [];
  for (const g of out) {
    const pop = o.pop ? o.pop(g.i) : 1;
    if (pop <= 0) continue;
    const bounce = Math.sin(g.i * 2.1) * h * 0.06;
    const rot = (hs(g.i, 77) - 0.5) * 0.12;
    for (const [k, S] of g.L.s.entries()) {
      const P = xf(S.map(([u, v, cr]) => [(u - g.L.w / 2) * h, (v - 0.5) * h, cr]), { x: g.x + shift + g.L.w * h / 2, y: y0 + bounce, r: rot, sx: pop, sy: pop });
      SL.push({ P, st: { seed: 8000 + g.i * 13 + k + bv(D) * 101, w: h * (o.wk ?? 0.15), t0: 6, t1: 6, min: 0.75, jit: 0.15, heavy: 0, amp: 1.3, step: 3 } });
    }
  }
  if (o.outline) {
    const ow = o.outline * 2, sh = o.shadow ?? 0;
    if (sh) SL.forEach(({ P, st }) => inkStroke(c, P.map(([x, y, cr]) => [x + sh, y + sh, cr]), { ...st, w: st.w + ow, color: PAL.ink }));
    SL.forEach(({ P, st }) => inkStroke(c, P, { ...st, w: st.w + ow, color: PAL.ink }));
  }
  SL.forEach(({ P, st }) => inkStroke(c, P, { ...st, color: o.color ?? PAL.ink }));
}

// ------------------------------------------------------------------ tagline from real glyph outlines (boiled)
function glyphPolys(font, text, size, tracking) {
  const polys = [];
  let x = 0;
  for (const ch of text) {
    const g = font.charToGlyph(ch);
    const path = g.getPath(x, 0, size);
    let cur = [], lx = 0, ly = 0;
    for (const cmd of path.commands) {
      if (cmd.type === 'M') { if (cur.length > 2) polys.push(cur); cur = [[cmd.x, cmd.y]]; lx = cmd.x; ly = cmd.y; }
      else if (cmd.type === 'L') { cur.push([cmd.x, cmd.y]); lx = cmd.x; ly = cmd.y; }
      else if (cmd.type === 'Q') { for (let k = 1; k <= 6; k++) { const u = k / 6, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), cc = u * u; cur.push([a * lx + b * cmd.x1 + cc * cmd.x, a * ly + b * cmd.y1 + cc * cmd.y]); } lx = cmd.x; ly = cmd.y; }
      else if (cmd.type === 'C') { for (let k = 1; k <= 8; k++) { const u = k / 8, a = (1 - u) ** 3, b = 3 * u * (1 - u) ** 2, cc = 3 * u * u * (1 - u), d = u ** 3; cur.push([a * lx + b * cmd.x1 + cc * cmd.x2 + d * cmd.x, a * ly + b * cmd.y1 + cc * cmd.y2 + d * cmd.y]); } lx = cmd.x; ly = cmd.y; }
      else if (cmd.type === 'Z') { if (cur.length > 2) polys.push(cur); cur = []; }
    }
    if (cur.length > 2) polys.push(cur);
    x += g.advanceWidth * (size / font.unitsPerEm) + tracking;
  }
  return { polys, width: x - tracking };
}
let TAG = null;
function drawTagline(c, D, reveal, x, y) {
  if (!TAG || reveal <= 0) return;
  const sv = bv(D);
  const total = TAG.a.width + TAG.gap + TAG.b.width;
  const x0 = x - total / 2;
  c.save();
  // brush-reveal mask stepping left→right
  c.beginPath(); c.rect(x0 - 20, y - 90, (total + 40) * reveal, 160); c.clip();
  c.beginPath();
  for (const [run, ox] of [[TAG.a, x0], [TAG.b, x0 + TAG.a.width + TAG.gap]]) {
    for (const P of run.polys) {
      const Q = boil(resample(P.map(([px, py]) => [px + ox, py + y]), 2.2, true), 6000 + sv * 17, 0.9, 30);
      polyPath(c, Q);
    }
  }
  c.fillStyle = PAL.ink; c.fill('nonzero');
  c.restore();
  const tx = x0 + TAG.a.width + TAG.gap / 2;
  if (reveal > (tx - x0 + 10) / (total + 40)) drawTwinkle(c, tx, y - 21, 20 + 3 * (sv % 2), 6100 + sv, { w: 3 });
}

// ------------------------------------------------------------------ BURST / BADGE choreography
const C0 = [862, 614]; // burst centre (where the spirit crouches, in screen space)
const BADGE = V5 ? { x: 960, y: 460, rx: 700, ry: 300 } : { x: 960, y: 464, rx: 520, ry: 262 }; // V5: wider badge for 4 characters
let BADGE_PERIM = null;
// R2 (REVIEW_2 P2): fireball -> badge in 4 drawings on 2s (f168/170/172/174), ease-out spacing .32/.28/.22/.18
function morphP(t) { return t < 6.99 ? 0 : t < 7.07 ? 0.32 : t < 7.15 ? 0.6 : t < 7.24 ? 0.82 : 1; }
function badgeCircles(t, D) {
  // fire circles: explode out of C0, then migrate into a scalloped badge around the title
  const N = 22;
  if (!BADGE_PERIM) {
    const dense = circlePts(0, 0, BADGE.ry, 600, BADGE.rx);
    const per = arclen(dense, true).at(-1);
    BADGE_PERIM = resample(dense, per / N, true).slice(0, N);
  }
  const out = [];
  const tb = t - 6.583;
  for (let k = 0; k < N; k++) {
    const [px, py] = BADGE_PERIM[k];
    const a0 = Math.atan2(py / BADGE.ry, px / BADGE.rx);
    // exploded state (fireball lumps)
    const rr = 200 + 240 * hs(k, 2);
    const e = E.out3(clamp(tb / 0.4));
    const ex = C0[0] + Math.cos(a0 + 0.25) * rr * e, ey = C0[1] + Math.sin(a0 + 0.25) * rr * 0.8 * e;
    const er = (58 + 70 * hs(k, 3)) * E.outBack(clamp(tb / 0.25), 1.4);
    // badge state: evenly spaced scallops, alternating size
    const bx = BADGE.x + px, by = BADGE.y + py;
    const br = (k % 2 ? 84 : 100) + 14 * hs(k, 6);
    const sk = 0.14 * hs(k, 7); // small per-scallop stagger; all home on f174
    const mu = clamp((morphP(t) - sk) / (1 - sk));
    out.push({ x: lerp(ex, bx, mu), y: lerp(ey, by, mu), r: Math.max(0, lerp(er, br, mu)), mu });
  }
  // core: grows out of the starburst into the badge body (an ellipse)
  const coreU = E.out3(inv(6.62, 6.9, t));
  const mv = morphP(t);
  const cx = lerp(C0[0], BADGE.x, mv), cy = lerp(C0[1], BADGE.y, mv);
  const core = [{ x: cx, y: cy, r: lerp(260, BADGE.ry * 1.0, mv) * coreU * (1 + 0.06 * Math.sin(Math.PI * mv)), rx: lerp(260, BADGE.rx * 1.0, mv) * coreU }];
  // R1s3: while migrating, clamp every scallop so it overlaps the core ellipse by >= 0.5 r (no channel / bite / paper hole).
  // Weighted by mu so the exploded fireball lumps (mu = 0) stay free; at rest (centre on the rim) the clamp is a no-op.
  {
    const erx = core[0].rx, ery = core[0].r;
    if (erx > 1 && ery > 1) for (const s of out) {
      const w = clamp(s.mu / 0.3);
      if (w <= 0) continue;
      const dx = s.x - cx, dy = s.y - cy, d = Math.hypot(dx, dy);
      if (d < 1) continue;
      const ca = dx / d, sa = dy / d, Re = 1 / Math.hypot(ca / erx, sa / ery);
      const dt = Re + 0.5 * s.r;
      if (d > dt) { const dn = lerp(d, dt, w); s.x = cx + ca * dn; s.y = cy + sa * dn; }
    }
  }
  for (let k = 0; k < 6; k++) {
    const a = k * 1.047 + 0.4;
    const d = lerp(170, 120, mv);
    core.push({ x: cx + Math.cos(a) * d * lerp(1, 2.2, mv), y: cy + Math.sin(a) * d * lerp(1, 0.9, mv), r: 150 * coreU });
  }
  // R1s2: while the scallops migrate, bridge each neighbour pair with a circle pulled toward the core -> the union has no
  // inward bite (jury: notch at 7.20). At rest the bridges sit inside the badge ellipse, so the final outline is unchanged.
  const brg = [];
  for (let k = 0; k < N; k++) {
    const a = out[k], b = out[(k + 1) % N], w = clamp((Math.min(a.mu, b.mu) - 0.2) / 0.3);
    if (w <= 0) continue;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    brg.push({ x: lerp(mx, cx, 0.3), y: lerp(my, cy, 0.3), r: (a.r + b.r) * 0.5 * w });
  }
  const all = [...core, ...out, ...brg];
  if (t > 6.6 && t < 7.45) all.push(...holeFillers(all));
  return all;
}
// R1s3: coarse raster of the circle union; flood the outside from the border; any uncovered cell NOT reached is an
// enclosed paper hole -> plug it with a small circle (appended last, so no other circle's boil seed changes).
function holeFillers(cs) {
  const S = 6;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const q of cs) { if (q.r < 1) continue; const rx = q.rx ?? q.r; x0 = Math.min(x0, q.x - rx); x1 = Math.max(x1, q.x + rx); y0 = Math.min(y0, q.y - q.r); y1 = Math.max(y1, q.y + q.r); }
  if (x1 <= x0) return [];
  x0 -= 2 * S; y0 -= 2 * S;
  const W = Math.ceil((x1 - x0) / S) + 4, H = Math.ceil((y1 - y0) / S) + 4;
  const g = new Uint8Array(W * H); // 1 = covered, 2 = outside
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const px = x0 + (i + 0.5) * S, py = y0 + (j + 0.5) * S;
    for (const q of cs) {
      if (q.r < 1) continue;
      const rx = q.rx ?? q.r, u = (px - q.x) / rx, v = (py - q.y) / q.r;
      if (u * u + v * v <= 1) { g[j * W + i] = 1; break; }
    }
  }
  const st = [0];
  g[0] = 2;
  while (st.length) {
    const p = st.pop(), i = p % W, j = (p - i) / W;
    for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
      if (a < 0 || b < 0 || a >= W || b >= H) continue;
      const n = b * W + a;
      if (g[n] === 0) { g[n] = 2; st.push(n); }
    }
  }
  const f = [];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (g[j * W + i] === 0) f.push({ x: x0 + (i + 0.5) * S, y: y0 + (j + 0.5) * S, r: S * 1.3 + 6 });
  return f;
}
function drawBadge(c, t, D) {
  if (t < 6.583) return;
  const sv = bv(D);
  const cs = badgeCircles(t, D);
  // settle boing at 8.5
  const sc = 1 + K(t, [[8.5, 0], [8.54, 0.045, 'out2'], [8.625, -0.02], [8.75, 0.008], [8.875, 0]]);
  const ox = t >= 7.24 && t < 7.32 ? 1.03 : 1, oy = t >= 7.24 && t < 7.32 ? 0.99 : 1; // R2: +3 % width overshoot on f174
  const cs2 = cs.map((q) => ({ x: BADGE.x + (q.x - BADGE.x) * sc * ox, y: BADGE.y + (q.y - BADGE.y) * sc * oy, r: q.r * sc * oy, rx: (q.rx ?? q.r) * sc * ox }));
  cloud(c, cs2, { seed: 1200 + sv * 57 + (t < 7.0 ? D.id : 0), fill: PAL.red, w: 8.5, amp: 2.0 });
  const q = cs[0];
  // R2 (REVIEW_2 P2): 6 big fire lumps (90-140 px, tomato-on-tomato, ink C-curl, yellow highlight) slide OUT into the
  // scallops with the morph; 3 faint lumps keep boiling inside the badge 7.2-8.5
  if (t >= 6.7 && t < 7.3 && q.r > 20) {
    const lu = morphP(t);
    for (let k = 0; k < 6; k++) {
      const a = k * 1.05 + 0.5 + hs(k, 81) * 0.4, d0 = 0.34 + 0.2 * hs(k, 82);
      const rim = BADGE_PERIM[(k * 4 + 1) % BADGE_PERIM.length];
      const x = lerp(q.x + Math.cos(a) * (q.rx ?? q.r) * d0, BADGE.x + rim[0] * 0.9, lu);
      const y = lerp(q.y + Math.sin(a) * q.r * d0, BADGE.y + rim[1] * 0.9, lu);
      const r = (46 + 24 * hs(k, 83)) * (1 - 0.3 * lu) * E.outBack(clamp((t - 6.7) / 0.1), 1.5);
      fillShape(c, circlePts(x, y, r, 30), '#c9311f', { seed: 1340 + k + D.id, amp: 2.5 });
      fillShape(c, circlePts(x - r * 0.26, y - r * 0.28, r * 0.5, 20), PAL.yel, { seed: 1345 + k + D.id, amp: 1.5 });
      const P = [], c0 = hs(k, 84) * 6.28 + D.id * 0.3;
      for (let i = 0; i <= 14; i++) { const aa = c0 + (i / 14) * 3.9, rr = r * (0.95 - 0.4 * i / 14); P.push([x + Math.cos(aa) * rr, y + Math.sin(aa) * rr * 0.85]); }
      inkStroke(c, P, { seed: 1350 + k * 3 + D.id, w: 6, t0: 6, t1: 22, min: 0.2, amp: 1.2, heavy: 0 });
    }
  }
  if (t >= 7.2 && t < 8.5) {
    [[540, 470, 50], [1378, 410, 44], [1380, 548, 34]].forEach(([x, y, r0], k) => {
      const rr = r0 * E.outBack(clamp((t - 7.2) / 0.1), 1.4) * (1 + 0.08 * Math.sin(D.id * 1.9 + k * 2.1));
      fillShape(c, circlePts(x + 5 * Math.sin(D.id * 0.7 + k), y + 4 * Math.cos(D.id * 0.9 + k), rr, 26), '#d8392a', { seed: 1370 + k * 5 + bv(D), amp: 3 });
    });
  }
  // R2 (REVIEW_2 P2): yellow core holds in the fireball through f170, then travels in 2 drawings (f172, f174) to the start
  // of 手's first stroke, 100 -> 45 -> 20 %, with a 3-dot comet trail, and lights the fuse on arrival
  if (t < 7.3 && q.r > 20) {
    const p0 = strokeWorld(STROKES[0])[0];
    const stp = t < 7.12 ? 0 : t < 7.2 ? 1 : 2;
    const e = [0, 0.55, 1][stp], R = Math.min(q.r * 0.8, 240) * [1, 0.45, 0.2][stp];
    const ax = q.x + 6, ay = q.y + 4;
    const mx = (ax + p0[0]) / 2 - (p0[1] - ay) * 0.35, my = (ay + p0[1]) / 2 + (p0[0] - ax) * 0.35;
    const at = (u) => [(1 - u) * (1 - u) * ax + 2 * u * (1 - u) * mx + u * u * p0[0], (1 - u) * (1 - u) * ay + 2 * u * (1 - u) * my + u * u * p0[1]];
    const [gx, gy] = at(e), gs = stp === 0 && !V5 ? (q.rx ?? q.r) / q.r : 1; // V5: the core stays round (it is the reel's dot here)
    if (!NODOT) {
    if (stp > 0) for (let j = 1; j <= 3; j++) { // comet trail
      const [tx, ty] = at(Math.max(0, e - 0.13 * j)), tr = R * [0.62, 0.45, 0.3][j - 1];
      const T = circlePts(tx, ty, tr, 16);
      fillShape(c, T, PAL.yel, { seed: 1360 + j + D.id, amp: 1 });
      inkLoop(c, T, { seed: 1364 + j + D.id, w: 3, amp: 1, t0: 3, t1: 6 });
    }
    const P = spline(xf(starPts(9, R, R * 0.62, 1300 + D.id, D.id * 0.5, 0.3), { x: gx, y: gy, sx: gs }), true, 5);
    fillShape(c, P, PAL.yel, { seed: 1310 + D.id, amp: 2 });
    if (stp > 0) inkLoop(c, P, { seed: 1315 + D.id, w: 4, amp: 1.5, t0: 3, t1: 6 });
    const Q = spline(xf(starPts(7, R * 0.45, R * 0.28, 1320 + D.id, D.id * 0.9, 0.3), { x: gx, y: gy }), true, 4);
    fillShape(c, Q, PAL.hi, { seed: 1330 + D.id, amp: 2 });
    }
    if (stp === 2) drawTwinkle(c, p0[0], p0[1], 58, 1335 + D.id, { rot: 0.3, fill: PAL.hi }); // ignition
  }
}
function drawStarburst(c, t, D) {
  if (t < 6.583 || t > 6.88) return;
  const R = K(t, [[6.583, 1320], [6.625, 1240], [6.875, 250, 'in2']]);
  const sd = 1400 + D.id;
  const rot = D.id * 0.37;
  const ri = lerp(0.52, 0.3, inv(6.708, 6.875, t));
  const outer = spline(xf(starPts(15, R, R * ri, sd, rot, 0.28), { x: C0[0], y: C0[1] }), true, 6);
  fillShape(c, outer, PAL.yel, { seed: sd, amp: 2.5, dx: REG.dx, dy: REG.dy });
  const mid = spline(xf(starPts(11, R * 0.66, R * 0.36, sd + 1, rot + 0.2, 0.3), { x: C0[0], y: C0[1] }), true, 5);
  fillShape(c, mid, PAL.red, { seed: sd + 2, amp: 2.5, dx: REG.dx, dy: REG.dy });
  const core = spline(xf(starPts(9, R * 0.34, R * 0.2, sd + 3, rot + 0.5, 0.3), { x: C0[0], y: C0[1] }), true, 4);
  fillShape(c, core, PAL.hi, { seed: sd + 4, amp: 2 });
  inkLoop(c, outer, { seed: sd + 5, w: 9, amp: 2.5, heavy: 0.3, splits: 2 });
}
function speedLinesRadial(c, cx, cy, r0, r1, n, seed, w = 7, dir = 1) {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + hs(seed, k) * 0.5;
    const a0 = r0 * (0.9 + 0.3 * hs(seed, k, 2)), a1 = r1 * (0.8 + 0.4 * hs(seed, k, 3));
    const P = [[cx + Math.cos(a) * a0, cy + Math.sin(a) * a0], [cx + Math.cos(a) * a1, cy + Math.sin(a) * a1]];
    inkStroke(c, dir > 0 ? P : P.reverse(), { seed: seed * 7 + k, w: w * (0.6 + 0.8 * hs(seed, k, 4)), t0: 12, t1: 90, min: 0.05, amp: 1.5, heavy: 0 });
  }
}
// sparks from the burst: some of them become the fuse heads that write the strokes
const NSPARK = 30;
const SMOKE = (() => { // 7 clusters, irregular angles; lead puff class + 1-2 satellites
  const cl = [[-2.62, 1], [-1.72, 2], [-0.86, 0], [0.12, 2], [0.8, 1], [1.62, 0], [2.4, 2]];
  const out = [];
  cl.forEach(([a, c0], i) => {
    const n = 2 + (i % 2);
    for (let j = 0; j < n; j++) {
      const cls = j === 0 ? c0 : (c0 + 1 + j) % 3;
      out.push({ k: out.length, lead: j === 0, a: a + (j ? (j === 1 ? 0.2 : -0.24) : 0) + (hs(i, j, 42) - 0.5) * 0.12,
        dist: j ? 0.78 + 0.25 * hs(i, j, 43) : 1, R: [60, 120, 240][cls] * (0.85 + 0.3 * hs(i, j, 41)) * (j ? 0.8 : 1),
        td: 7.25 + (2 / 24) * ((i * 2 + j * 3) % 5) });
    }
  });
  return out;
})();
function sparkState(k, t) {
  const a = (k / NSPARK) * Math.PI * 2 + (hs(k, 11) - 0.5) * 0.87;
  const v0 = 1700 + 1500 * hs(k, 12);
  const u = Math.max(0, t - 6.583);
  const drag = 4.2;
  const d = 110 + 90 * hs(k, 14) + (v0 / drag) * (1 - Math.exp(-drag * u));
  const x = C0[0] + Math.cos(a) * d, y = C0[1] + Math.sin(a) * d * 0.85 + 260 * u * u;
  const sp = v0 * Math.exp(-drag * u);
  return { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.85 + 520 * u, size: [9, 15, 24][k % 3] * (0.85 + 0.3 * hs(k, 13)) };
}

// ------------------------------------------------------------------ light of the flame: stepped (cel) glow pool, multiplied into the paper
function drawLightPool(c, tq, D, ss) {
  if (tq < 0.5 || tq >= 6.5 || !ss) return;
  let R = K(tq, [[0.5, 60], [0.542, 330, 'out3'], [0.625, 380], [1.0, 310], [2.0, 315], [2.5, 345], [5.5, 350], [6.25, 430, 'io2'], [6.5, 470]]);
  const fv = bv(D) % 3;                       // 3 boil variants, radius flickers +-3 % on 2s
  R *= 1 + 0.03 * (fv - 1);
  const cx = ss.x, cy = ss.y - ss.H * 0.42 * ss.sy;
  const scal = (r, n, ph) => { // hand-cut scalloped edge (scissor bites)
    const P = [];
    for (let i = 0; i < 120; i++) { const a = (i / 120) * Math.PI * 2; const q = Math.abs(Math.sin(a * n / 2 + ph)); P.push([cx + Math.cos(a) * r * (0.975 + 0.035 * Math.sqrt(q)), cy + Math.sin(a) * r * (0.975 + 0.035 * Math.sqrt(q))]); }
    return P;
  };
  c.save();
  c.globalCompositeOperation = 'multiply';
  c.globalAlpha = 0.72; // R2s2 (P4): pool 28 % lighter so the character, not the disc, owns the frame
  fillShape(c, scal(R * 1.25, 22, fv * 0.7), '#fff7df', { seed: 8100 + bv(D), amp: 4, scale: 90 });
  fillShape(c, scal(R, 18, 1 + fv * 0.9), '#fff0b4', { seed: 8200 + bv(D), amp: 4, scale: 90 });
  c.restore();
}
function hopTrails(c, tq, D) {
  for (const h of HOPS) { // red-pencil dotted arc guide for the whole hop (the animator's path), R2s2: drawn on ahead of the hop
    if (tq < h.t0 - 0.25 || tq > h.t1 + 0.2) continue;
    const src = [];
    for (let i = 0; i <= 48; i++) { const st = spiritState(lerp(h.t0, h.t1, i / 48), D, null); src.push([st.x, st.y - st.H * 0.42 * st.sy]); }
    const step = 22 / SHOT.s, grow = clamp((Math.floor((tq - h.t0 + 0.25) * 12) + 1) / 3); // appears in 3 drawings (on 2s)
    let acc = 0, k = 0, tot = 0;
    for (let i = 1; i < src.length; i++) tot += Math.hypot(src[i][0] - src[i - 1][0], src[i][1] - src[i - 1][1]);
    let run = 0;
    for (let i = 1; i < src.length; i++) {
      const L = Math.hypot(src[i][0] - src[i - 1][0], src[i][1] - src[i - 1][1]);
      acc += L; run += L;
      while (acc >= step) {
        acc -= step; k++;
        if (run - acc > tot * grow) break;
        const f2 = 1 - acc / L, x = lerp(src[i - 1][0], src[i][0], f2) + (hs(k, D.id, 5) - 0.5) * 1.5, y = lerp(src[i - 1][1], src[i][1], f2) + (hs(k, D.id, 6) - 0.5) * 1.5;
        c.save(); c.globalAlpha = 0.8;
        fillShape(c, circlePts(x, y, (1.9 + 0.5 * hs(k, 7)) * 1.6 / SHOT.s * 1.1, 8), PAL.pencil, { seed: 8400 + k * 3 + bv(D), amp: 0.35 });
        c.restore();
      }
    }
  }
  for (const h of HOPS) {
    if (tq <= (h.t0 + h.t1) / 2 || tq > h.t1 + 0.05) continue;
    const b = Math.min(tq, h.t1) - 0.03, a = b - 0.16;
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const tt = lerp(a, b, i / 6);
      const st = spiritState(tt, D, null);
      pts.push([st.x, st.y - st.H * 0.4 * st.sy]);
    }
    const cur = spiritState(tq, D, null);
    const back = pts.filter(([x, y]) => Math.hypot(x - cur.x, y - (cur.y - cur.H * 0.4 * cur.sy)) > cur.H * 0.42);
    if (back.length < 3) continue;
    [-0.22, 0.05, 0.3].forEach((off, j) => {
      const P = back.map(([x, y], i, arr) => {
        const q = arr[Math.min(arr.length - 1, i + 1)], r = arr[Math.max(0, i - 1)];
        let tx = q[0] - r[0], ty = q[1] - r[1]; const tl = Math.hypot(tx, ty) || 1;
        return [x - ty / tl * off * cur.H, y + tx / tl * off * cur.H];
      });
      inkStroke(c, P, { seed: 8300 + D.id * 3 + j, w: 4.2, t0: 50, t1: 12, min: 0.05, amp: 1.2, heavy: 0 });
    });
  }
}

// ------------------------------------------------------------------ FRAME
let CAM = { x: 0, y: 0 };
function camera(f) {
  const t = f / FPS;
  let x = 0, y = 0;
  if (t >= 6.583 && t < 7.2) { const a = 18 * Math.pow(1 - (t - 6.583) / 0.62, 2); x = (hs(f, 1) - 0.5) * 2 * a; y = (hs(f, 2) - 0.5) * 2 * a; }
  if (t >= 0.5 && t < 0.62) { const a = 5; x = (hs(f, 3) - 0.5) * 2 * a; y = (hs(f, 4) - 0.5) * 2 * a; }
  if (t >= 2.5 && t < 2.6) { y = 5 * (1 - (t - 2.5) / 0.1); }
  return { x, y };
}

export async function init(canvas, dpr) {
  DPR = dpr;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  ctx = MAIN = canvas.getContext('2d');
  const off = () => { const cv = document.createElement('canvas'); cv.width = canvas.width; cv.height = canvas.height; return cv.getContext('2d'); };
  SHEETC = off(); NIGHTC = off();
  TOTAL = drawing(239).id + 1 - RIFFLE.length; // unique drawings in the film (the riffle re-shows old ones)
  LY = new Layers(W, H, dpr);
  const load = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
  IMG.paper = await load('/demos/05-cel-boil/assets/paper_base.jpg');
  IMG.tooth = await load('/demos/05-cel-boil/assets/paper_tooth.png');
  IMG.dust = [];
  for (let k = 1; k <= 4; k++) { const im = await load(`/demos/05-cel-boil/assets/dust_ink_0${k}.png`); await im.decode(); IMG.dust.push(im); }
  await IMG.paper.decode(); await IMG.tooth.decode();
  CUES = await (await fetch('/demos/05-cel-boil/cues.json')).json();
  const opentype = (await import('opentype')).default || (await import('opentype'));
  const buf = await (await fetch('/assets/fonts/cjk/lxgwmarkergothic/LXGWMarkerGothic-Regular.ttf')).arrayBuffer();
  const font = opentype.parse(buf);
  TAG = { a: glyphPolys(font, '一帧一帧', 60, 13), b: glyphPolys(font, '亲手点亮', 60, 13), gap: 92 };
  if (V5) STROKES = await loadV5Strokes();
}

// ------------------------------------------------------------------ END: pull back to the sheet on the peg bar; thumb riffles the stack
const RIFFLE = [150, 121, 108, 61, 30, 13];            // earlier drawings flashed by the riffle (backwards through the stack)
const PIV = [960, 540];
function pullScale(fq) { return fq < 218 ? 1 : fq < 220 ? 0.9 : fq < 222 ? 0.86 : 0.84; } // R2: starts f218 (full lockup held from f212) // 3 drawings on 2s, ease-out
export function render(t) {
  const f = Math.min(239, Math.max(0, Math.round(t * FPS)));
  const D = drawing(f);
  const sc = pullScale(D.fq);
  if (sc >= 1) { ctx = MAIN; drawFrame(f); return; }
  const rif = f >= 224 && f <= 229 ? f - 224 : -1;
  const part = V5 ? rif >= 0 : rif === 0 || rif === 5; // R2: on these the top sheet stays; only the lifted corner shows the drawing below (V5: on all six, so the title never leaves)
  ctx = SHEETC; drawFrame(rif >= 0 && !part ? RIFFLE[rif] : f); ctx = MAIN;
  drawDesk(MAIN, D, f, sc, rif, part);
}
const rectPts = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
let ONION = null;
function onionGhost() { // R2: two earlier poses of the tiny spirit, ink only, as blue col-erase pencil (cached: the sheets below do not boil)
  if (ONION) return ONION;
  const RX = 1250, RY = 0, RW = 420, RH = 420, cw = Math.round(RW * DPR), ch = Math.round(RH * DPR);
  ONION = [9.135, 9.25].map((tq) => {
    const sc = document.createElement('canvas'); sc.width = Math.round(W * DPR); sc.height = Math.round(H * DPR);
    const g = sc.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0);
    const D = drawing(Math.round(tq * FPS));
    drawSpirit(g, tinySpirit(tq, D), D, tq);
    const im = g.getImageData(Math.round(RX * DPR), Math.round(RY * DPR), cw, ch), d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255, a = d[i + 3] / 255;
      const k = a * clamp((0.42 - lum) / 0.25);
      d[i] = 0x5a; d[i + 1] = 0x7b; d[i + 2] = 0xb5; d[i + 3] = Math.round(255 * k);
    }
    const oc = document.createElement('canvas'); oc.width = cw; oc.height = ch; oc.getContext('2d').putImageData(im, 0, 0);
    return { cv: oc, RX, RY, RW, RH };
  });
  return ONION;
}
function drawDesk(c, D, f, s, rif, part) {
  const v = bv(D);
  c.setTransform(DPR, 0, 0, DPR, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  drawPaper(c, { x: 0, y: 0 });
  c.fillStyle = 'rgba(28,22,19,0.86)'; c.fillRect(0, 0, W, H);                    // the desk
  const x0 = PIV[0] - PIV[0] * s, y0 = PIV[1] - PIV[1] * s, w = W * s, h = H * s;
  // R2 (REVIEW_2 P3): the desk is a LIGHT TABLE - warm underlight glowing round the stack in hard cel steps
  [[124, 0.14], [80, 0.24], [44, 0.38]].forEach(([m, a], k) => {
    fillShape(c, dens(rectPts(x0 - m, y0 - m * 0.7, w + 2 * m + 18, h + 1.5 * m + 13), 24), `rgba(255,240,180,${a})`, { seed: 9170 + k * 3 + v, amp: 3 });
  });
  // peg bar taped to the desk; its pegs come up through the sheet's holes
  const by = y0 - 30, bar = dens(rectPts(PIV[0] - 700, by, 1400, 70), 6);
  fillShape(c, bar, '#4a3f38', { seed: 9100 + v, amp: 1 });
  inkLoop(c, bar, { seed: 9110 + v, w: 3.5, amp: 1 });
  inkStroke(c, [[PIV[0] - 680, by + 10], [PIV[0] + 680, by + 10]], { seed: 9120 + v, w: 3, t0: 40, t1: 40, min: 0.1, amp: 1, heavy: 0, color: PAL.hi });
  for (const sx of [-1, 1]) { // masking-tape tabs holding the bar
    const T = dens(xf(rectPts(-46, -24, 92, 48), { x: PIV[0] + sx * 700, y: by + 12, r: sx * 0.12 }), 6);
    fillShape(c, T, '#e9dcc0', { seed: 9125 + v + sx, amp: 1.2 }); inkLoop(c, T, { seed: 9127 + v + sx, w: 2.5, amp: 1 });
  }
  // hard (cel) shadow of the stack, then 3 sheets beneath, offset and each 3 % darker
  fillShape(c, dens(rectPts(x0 + 30, y0 + 24, w, h), 20), 'rgba(0,0,0,0.42)', { seed: 9130 + v, amp: 1.5 });
  [[18, 13, 0.09], [12, 9, 0.06], [6, 4, 0.03]].forEach(([dx, dy, dk], k) => {
    c.save(); c.beginPath(); c.rect(x0 + dx, y0 + dy, w, h); c.clip();
    c.drawImage(IMG.paper, x0 + dx, y0 + dy, w, h);
    c.fillStyle = `rgba(28,22,19,${0.02 + dk})`; c.fillRect(x0 + dx, y0 + dy, w, h);
    c.restore();
    c.globalAlpha = 0.55; inkLoop(c, dens(rectPts(x0 + dx, y0 + dy, w, h), 10), { seed: 9140 + k * 11 + v, w: 2, amp: 0.8 }); c.globalAlpha = 1;
  });
  // the top sheet = the film (on a riffle drawing it is lifted and slightly skewed)
  const ox = rif >= 0 ? (hs(f, 1) - 0.5) * 12 : 0, oy = rif >= 0 ? -6 - 8 * hs(f, 2) : 0, rot = rif >= 0 ? (hs(f, 3) - 0.5) * 0.014 : 0;
  c.save();
  c.translate(PIV[0] + ox, PIV[1] + oy); c.rotate(rot); c.translate(-PIV[0], -PIV[1]);
  c.drawImage(SHEETC.canvas, 0, 0, SHEETC.canvas.width, SHEETC.canvas.height, x0, y0, w, h);
  // R2: underlight through the sheet (+ tooth lifted 6 %) and the two drawings beneath as blue onion skin
  c.save(); c.beginPath(); c.rect(x0, y0, w, h); c.clip();
  c.globalCompositeOperation = 'screen'; c.fillStyle = 'rgba(255,240,180,0.16)'; c.fillRect(x0, y0, w, h);
  c.globalCompositeOperation = 'multiply'; c.globalAlpha = 0.06;
  c.drawImage(IMG.tooth, Math.floor(hs(v, 53) * 470), Math.floor(hs(v, 54) * 310), W, H, x0, y0, w, h);
  if (!(rif >= 0 && !part)) {
    onionGhost().forEach((O, k) => {
      const [dx, dy] = k ? [-5, 7] : [8, -4];
      c.globalAlpha = k ? 0.16 : 0.12;
      c.drawImage(O.cv, x0 + (O.RX + dx) * s, y0 + (O.RY + dy) * s, O.RW * s, O.RH * s);
    });
  }
  c.restore();
  c.globalAlpha = 0.6; inkLoop(c, dens(rectPts(x0, y0, w, h), 10), { seed: 9150 + v, w: 2.2, amp: 0.8 }); c.globalAlpha = 1;
  // Acme peg holes (round centre + two slots) with the pegs showing through
  const hy = y0 + 40 * s;
  const holes = [circlePts(PIV[0], hy, 15 * s, 24), ...[-1, 1].map((sx) => {
    const cx = PIV[0] + sx * 600 * s, hw = 62 * s, hr = 14 * s, P = [];
    for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + (i / 12) * Math.PI; P.push([cx + hw + Math.cos(a) * hr, hy + Math.sin(a) * hr]); }
    for (let i = 0; i <= 12; i++) { const a = Math.PI / 2 + (i / 12) * Math.PI; P.push([cx - hw + Math.cos(a) * hr, hy + Math.sin(a) * hr]); }
    return P;
  })];
  holes.forEach((P, k) => {
    const Q = dens(P, 3);
    fillShape(c, Q, '#4a3f38', { seed: 9160 + k + v, amp: 0.6 });
    inkLoop(c, Q, { seed: 9165 + k + v, w: 2.6, amp: 0.6, t0: 3, t1: 6 });
  });
  // R2 (REVIEW_2 P3): riffle = the lower-right corner lifts and curls as a flap (on 1s)
  let tip = [x0 + w, y0 + h];
  if (rif >= 0) {
    const cx = x0 + w, cy = y0 + h;
    const a = [350, 530, 475, 560, 495, 300][rif] * s, b = [250, 380, 340, 405, 358, 214][rif] * s;
    const P1 = [cx - a, cy], P2 = [cx, cy - b];
    const dx = P2[0] - P1[0], dy = P2[1] - P1[1], L2 = dx * dx + dy * dy;
    const tt = ((cx - P1[0]) * dx + (cy - P1[1]) * dy) / L2, fx = P1[0] + dx * tt, fy = P1[1] + dy * tt;
    const Cf = [lerp(fx, 2 * fx - cx, 0.8), lerp(fy, 2 * fy - cy, 0.8)]; // corner reflected over the fold, curled back 20 %
    const Q1 = [lerp(P1[0], Cf[0], 0.74) - 10, lerp(P1[1], Cf[1], 0.74) + 6], Q2 = [lerp(P2[0], Cf[0], 0.74) + 6, lerp(P2[1], Cf[1], 0.74) - 10]; // R2s2: wider free edge -> trapezoid flap, not a narrow curl
    tip = [Q2[0] + 8, Q2[1] + 4]; // the thumb pinches the free edge from the right
    const bow = (A, B, k) => { const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, nx = A[1] - B[1], ny = B[0] - A[0], l = Math.hypot(nx, ny) || 1; return [mx + nx / l * k, my + ny / l * k]; };
    // (1) what the lifted corner uncovers
    c.save(); c.beginPath(); c.moveTo(P1[0], P1[1]); c.lineTo(cx, cy); c.lineTo(P2[0], P2[1]); c.closePath(); c.clip();
    if (part) { ctx = SHEETC; drawFrame(RIFFLE[rif]); ctx = MAIN; c.drawImage(SHEETC.canvas, 0, 0, SHEETC.canvas.width, SHEETC.canvas.height, x0, y0, w, h); }
    else { c.drawImage(IMG.paper, x0, y0, w, h); c.fillStyle = 'rgba(28,22,19,0.06)'; c.fillRect(x0, y0, w, h); }
    c.restore();
    const F = dens([P1, bow(P1, Q1, 16), Q1, bow(Q1, Q2, 12), Q2, bow(Q2, P2, 16), P2], 4);
    // (2) hard cast shadow of the flap (#1c1613 @ 18 %), kept on the sheet
    c.save(); c.beginPath(); c.rect(x0, y0, w, h); c.clip();
    fillShape(c, xf(F, { x: 22 * s, y: 18 * s }), 'rgba(28,22,19,0.18)', { seed: 9180 + f, amp: 1.2 });
    c.restore();
    // (3) the flap: back of the page, a shade band along the fold, a heavy 12 px ink free edge
    fillShape(c, F, '#eadfc6', { seed: 9182 + f, amp: 1.2 });
    fillShape(c, dens([P1, P2, [lerp(P2[0], Cf[0], 0.18), lerp(P2[1], Cf[1], 0.18)], [lerp(P1[0], Cf[0], 0.18), lerp(P1[1], Cf[1], 0.18)]], 4), 'rgba(28,22,19,0.1)', { seed: 9184 + f, amp: 1 });
    inkLoop(c, F, { seed: 9186 + f, w: 4, amp: 1.2 });
    inkStroke(c, [Q1, bow(Q1, Q2, 12), Q2], { seed: 9188 + f, w: 12, t0: 16, t1: 16, min: 0.3, amp: 1, heavy: 0 });
    // (4) edge smear: dry streaks the free edge leaves behind as it sweeps up
    c.globalAlpha = 0.45;
    for (let k = 0; k < 3; k++) {
      const u = 0.22 + 0.28 * k, E0 = [lerp(Q1[0], Q2[0], u), lerp(Q1[1], Q2[1], u)], l = (60 + 50 * hs(f, k, 7)) * s;
      inkStroke(c, [[E0[0] + 14, E0[1] + 12], [E0[0] + 14 + l * 0.78, E0[1] + 12 + l * 0.62]], { seed: 9190 + f * 5 + k, w: 5, t0: 3, t1: 24, min: 0.1, amp: 1, heavy: 0 });
    }
    c.globalAlpha = 1;
  }
  c.restore();
  if (f >= 222 && f <= 232) drawThumb(c, D, f, tip[0], tip[1], rif);
}
function drawThumb(c, D, f, cx, cy, rif) {
  // white cartoon glove thumb at the stack's corner; lifted page corners fan up while it riffles
  const v = bv(D);
  const enter = f === 222 ? 1 : f === 223 ? 0.25 : f >= 230 ? [0.35, 0.8, 1.4][f - 230] : 0;
  const bob = rif >= 0 ? (rif % 2 ? -10 : 4) : 0;
  const tx = cx - 34 + enter * 190, ty = cy - 16 + bob + enter * 140;
  const ang = rif >= 0 ? -2.95 : -2.45; // R2: on the riffle the thumb comes in from the right so the flap stays readable
  c.save(); c.translate(tx, ty); c.scale(1.4, 1.4); c.translate(-tx, -ty); // R2: thumb 1.4x (reads at phone size)
  const thumb = dens(xf(circlePts(0, 0, 44, 60, 118), { x: tx - Math.cos(ang) * 96, y: ty - Math.sin(ang) * 96, r: ang }), 3);
  fillShape(c, thumb, PAL.hi, { seed: 9250 + v, amp: 1.2, dx: REG.dx, dy: REG.dy });
  inkLoop(c, thumb, { seed: 9255 + v, w: 6, amp: 1.2, heavy: 0.4 });
  // nail + knuckle crease
  const nx = tx - Math.cos(ang) * 38, ny = ty - Math.sin(ang) * 38;
  const nail = dens(xf(circlePts(0, 0, 20, 24, 30), { x: nx, y: ny, r: ang }), 3);
  inkLoop(c, nail, { seed: 9260 + v, w: 3, amp: 1, t0: 3, t1: 6 });
  const kx = tx - Math.cos(ang) * 120, ky = ty - Math.sin(ang) * 120;
  inkStroke(c, [[kx - Math.sin(ang) * 26, ky + Math.cos(ang) * 26], [kx + Math.cos(ang) * 8, ky + Math.sin(ang) * 8], [kx + Math.sin(ang) * 26, ky - Math.cos(ang) * 26]], { seed: 9265 + v, w: 3.5, t0: 8, t1: 8, amp: 1, heavy: 0 });
  c.restore();
}
function shakeMarks(c, ms, D, color, w) {
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const a = (side < 0 ? Math.PI : 0) + (k - 1) * 0.5 + (hs(D.id, k, side) - 0.5) * 0.2;
      const r0 = 48 + (D.id % 2) * 5, r1 = r0 + 24;
      inkStroke(c, [[ms.hx + Math.cos(a) * r0, ms.hy + Math.sin(a) * r0], [ms.hx + Math.cos(a) * r1, ms.hy + Math.sin(a) * r1]], { seed: 60 + D.id * 7 + k + side, w, t0: 6, t1: 6, amp: 0.8, heavy: 0, color });
    }
  }
}
// true night before the strike: ink wash + hand-cut vignette; only the line work catches a red rim light; chalk shake marks
function nightPass(c, D, f, ms) {
  const N = NIGHTC, cw = N.canvas.width, ch = N.canvas.height;
  N.setTransform(1, 0, 0, 1, 0, 0);
  N.globalCompositeOperation = 'copy'; N.drawImage(c.canvas, 0, 0);
  // R1s2: rim-light mask from luminance only -> just the ink line work catches the red (no green/blue tints from fills)
  N.globalCompositeOperation = 'saturation'; N.fillStyle = '#808080'; N.fillRect(0, 0, cw, ch);
  N.globalCompositeOperation = 'difference'; N.fillStyle = '#ffffff'; N.fillRect(0, 0, cw, ch);
  N.globalCompositeOperation = 'multiply'; N.drawImage(N.canvas, 0, 0); N.drawImage(N.canvas, 0, 0); // lum^4
  N.fillStyle = PAL.red; N.fillRect(0, 0, cw, ch);
  N.globalCompositeOperation = 'source-over';
  const dark = f <= 8 ? 0.62 : [0.56, 0.5, 0.42][f - 9];
  c.save();
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  // R1s2: kill the plate's colour first (the yellow strip went olive, the paper went grey)
  c.globalCompositeOperation = 'saturation'; c.globalAlpha = 0.85; c.fillStyle = '#808080'; c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = 'multiply'; c.globalAlpha = 1; c.fillStyle = '#6b5446'; c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = dark; c.fillStyle = PAL.ink; c.fillRect(0, 0, W, H);
  c.globalAlpha = 0.6; c.beginPath(); c.rect(0, 0, W, H);
  polyPath(c, boil(circlePts(1010, 610, 470, 90, 860), 9400 + bv(D), 7, 140)); c.fill('evenodd');
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'screen'; c.globalAlpha = 1; c.drawImage(N.canvas, 0, 0); c.globalAlpha = f <= 8 ? 0.6 : 0.8; c.drawImage(N.canvas, 0, 0);
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (f < 8) { camApply(c, CAM); SHOT = CLOSE; stageApply(c); shakeMarks(c, ms, D, PAL.hi, 5.5); }
  c.restore();
}
function flashFrame(c, ms) { // f12: a full-frame paper-white flash, star centred where the spark sits in the wide
  const hx = lerp(1296, ms.hx, 0.6), hy = lerp(828, ms.hy, 0.6);
  const X = lerp(STAGE.X + (hx - STAGE.px) * STAGE.s, 960, 0.35), Y = lerp(STAGE.Y + (hy - STAGE.py) * STAGE.s, 540, 0.35);
  c.save(); c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.fillStyle = PAL.hi; c.fillRect(0, 0, W, H);
  fillShape(c, spline(xf(starPts(12, 760, 330, 4401, 0.2, 0.3), { x: X, y: Y }), true, 6), PAL.yel, { seed: 4402, amp: 2 });
  fillShape(c, spline(xf(starPts(9, 330, 170, 4403, 0.5, 0.3), { x: X, y: Y }), true, 5), PAL.hi, { seed: 4404, amp: 2 });
  speedLinesRadial(c, X, Y, 800, 1500, 16, 4405, 8, 1);
  c.restore();
}
function drawFrame(f) {
  const D = drawing(f);
  const tq = D.fq / FPS;       // main drawing time (on 2s / 1s / 3s)
  const t1 = f / FPS;          // on-1s time for fast FX
  const c = ctx;
  CAM = camera(f);
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  drawPaper(c, CAM);
  c.save(); camApply(c, CAM);

  const bs = boxState(tq);
  const ms = matchState(tq);
  const ss = spiritState(tq, D, ms);

  // ---------------- stage (before the burst)
  SHOT = shotFor(f);
  const zr = Math.min(1, STAGE.s / SHOT.s);
  G.GLOBAL.ink = SHOT === CLOSE ? 0.58 : SHOT === MED ? 0.7 : 0.2 + 0.8 * zr;
  G.GLOBAL.amp = SHOT === CLOSE ? 0.55 : SHOT === MED ? 0.66 : 0.2 + 0.8 * zr;
  if (f >= 132) { // camera push on the spin (on 1s, accelerating), zooming about the spirit -> burst centre
    const u = E.in2(inv(5.5, 6.5, t1));
    const sc = lerp(STAGE.s, 2.05, u);
    SHOT = { s: sc, px: 860, py: 606, X: 862, Y: 618 };
    G.GLOBAL.ink = lerp(1, 0.8, u); G.GLOBAL.amp = lerp(1, 0.75, u);
  }
  c.save(); stageApply(c);
  drawLightPool(c, tq, D, ss);
  drawBox(c, tq, D, bs);
  if (ms.vis) {
    if (!(ms.smear && tq >= 0.36)) drawMatchStick(c, ms, D, 200);
    drawMatchHead(c, ms, D, 300, tq);
    if (f >= 24 && f < 28) { // R2: landing dust tick at the butt (woodblock at 1.0)
      const k = f < 26 ? 0 : 1;
      for (const sg of [-1, 1]) {
        drawPuff(c, BUTT[0] + sg * (30 + 18 * k), BUTT[1] - 8 - 5 * k, (15 + 4 * k) * (k ? 0.75 : 1), 7700 + (sg + 1) * 3 + k, { w: 3.5 });
        inkStroke(c, [[BUTT[0] + sg * 20, BUTT[1] - 20], [BUTT[0] + sg * (40 + 12 * k), BUTT[1] - 40 - 10 * k]], { seed: 7710 + sg + k * 5, w: 4, t0: 4, t1: 8, min: 0.3, amp: 0.8, heavy: 0 });
      }
    }
    if (ms.toss && f > 12 && f < 24) {
      for (let k = 1; k <= 4; k++) {
        const pm = matchState((f - k * 0.7) / FPS), ends = stickEnds(pm);
        ends.forEach(([x, y], e) => fillShape(c, circlePts(x, y, (6.5 - k * 1.1) * (e ? 0.8 : 1), 10), PAL.ink, { seed: 4500 + f * 9 + k * 2 + e, amp: 0.6 }));
      }
    }
    if (ss && tq < 2.0) drawSpirit(c, ss, D, tq);
    // (nervous shake marks are drawn in chalk after the night pass)
    if (ms.burnt && tq < 6.5) drawWisp(c, ms.hx + 4, ms.hy - 30, tq, D, sstep(2.0, 2.4, tq), SHOT === LOW ? 1 : 0);
  }
  // ignition burst on the head (on 1s)
  if (t1 >= 0.5 && t1 < 0.625) {
    const u = inv(0.5, 0.625, t1);
    const R = lerp(150, 215, E.out2(u)) * (u > 0.7 ? 0.75 : 1); // pops in big on the flash frame
    const hx = lerp(1296, ms.hx, 0.6), hy = lerp(828, ms.hy, 0.6);
    const P = spline(xf(starPts(10, R, R * 0.45, 40 + f, f * 0.4, 0.35), { x: hx, y: hy }), true, 4);
    if (f <= 13) speedLinesRadial(c, hx, hy, R * 1.12, R * (f === 12 ? 2.1 : 2.5), 13, 300 + f, 5);
    if (u < 0.75) {
      fillShape(c, P, PAL.yel, { seed: 41 + f, amp: 1.5, dx: REG.dx, dy: REG.dy });
      if (f <= 13) { // two-tone core on the first two drawings
        const Q = spline(xf(starPts(8, R * 0.5, R * 0.26, 45 + f, f * 0.4 + 0.3, 0.35), { x: hx, y: hy }), true, 4);
        fillShape(c, Q, f === 12 ? PAL.hi : PAL.red, { seed: 46 + f, amp: 1.5, dx: REG.dx, dy: REG.dy });
      }
      inkLoop(c, P, { seed: 42 + f, w: 6, amp: 1.5 });
    }
    for (let k = 0; k < 9; k++) {
      const a = -Math.PI * 0.95 + k * 0.33 + hs(f, k) * 0.2, d = R * (0.9 + u * 1.6) + hs(k, 3) * 60;
      drawSpark(c, hx + Math.cos(a) * d, hy + Math.sin(a) * d, Math.cos(a) * 900, Math.sin(a) * 900, 7 + 5 * hs(k, 4), 60 + f * 13 + k);
    }
  }
  // spirit on stage
  if (ss && tq >= 2.0) {
    // spin: whirlwind wrap lines, back halves behind the body, front halves over it (on 1s)
    const spinRings = [];
    if (tq >= 5.5 && tq < 6.25) {
      const u = inv(5.5, 6.25, t1);
      const n = 2 + Math.floor(u * 5);
      for (let k = 0; k < n; k++) {
        const hk = 0.1 + 0.8 * ((k + 0.5) / n) + (hs(f, k) - 0.5) * 0.08;
        const y = ss.y - ss.H * hk * ss.sy;
        const rx = ss.H * (0.5 + 0.12 * Math.sin(hk * 3)) * (1 + 0.25 * u), ry = rx * 0.16;
        const a0 = hs(f, k, 2) * 6.28, len = 2.2 + 2.5 * hs(f, k, 3);
        spinRings.push({ y, rx, ry, a0, len, k });
      }
      const arc = (R, front) => {
        const P = [];
        for (let i = 0; i <= 24; i++) { const a = R.a0 + (i / 24) * R.len; const sn = Math.sin(a); if ((sn > 0) === front) P.push([ss.x + Math.cos(a) * R.rx, R.y + sn * R.ry]); else if (P.length) break; }
        return P;
      };
      spinRings.forEach((R) => { const P = arc(R, false); if (P.length > 3) inkStroke(c, P, { seed: 900 + f * 5 + R.k, w: 5, t0: 10, t1: 40, min: 0.1, amp: 1.0, heavy: 0, dense: false }); });
      spinRings.front = (cc) => spinRings.forEach((R) => { const P = arc(R, true); if (P.length > 3) inkStroke(cc, P, { seed: 950 + f * 5 + R.k, w: 5.5, t0: 10, t1: 40, min: 0.1, amp: 1.0, heavy: 0 }); });
    }
    hopTrails(c, tq, D);
    // hatched contact shadow on the box top (shrinks as the spirit leaves the ground)
    if (tq >= 2.5 && bs.vis) {
      const lift = clamp((GROUND - ss.y) / 220);
      const rx = ss.H * 0.46 * (1 - 0.55 * lift) * Math.sqrt(ss.sx), ry = rx * 0.2;
      if (rx > 8) hatch(c, circlePts(ss.x + 14, GROUND + 3, ry, 40, rx), { seed: 7700 + bv(D), gap: 9, ang: -0.95, w: 2.4, amp: 0.9 });
    }
    drawSpirit(c, ss, D, tq);
    if (spinRings.front) spinRings.front(c);
    // dust puffs on landings
    for (const tl of [2.5, 3.0, 3.5, 4.0]) {
      const u = inv(tl, tl + 0.33, tq);
      if (tq > tl + 0.01 && u < 1) {
        const big = tl === 2.5 ? 1 : 0.6;
        if (tl === 2.5 && u >= 0.75) continue;
        for (const side of [-1, 1]) {
          for (let j = 0; j < 3; j++) {
            const uu = tl === 2.5 ? inv(2.5, 2.75, tq) : u;
            const d = ss.H * 0.36 + [40, 105, 190][j] * big * E.out2(Math.min(1, uu + 0.25));
            const x = ss.x + side * d, y = GROUND - 8 - [8, 24, 44][j] * big * (0.4 + uu);
            const r = [22, 36, 54][j] * big * (1 - uu * 0.55);
            const sd = 1000 + Math.round(tl * 10) * 7 + side * 3 + j * 11 + D.id;
            drawPuff(c, x, y, r, sd, { n: 4, w: 3.8, fill: PAL.cream, flat: 0.7, wide: 1.2 });
            const P = [], c0 = side > 0 ? 3.6 : -0.5;
            for (let i = 0; i <= 10; i++) { const a = c0 + side * (i / 10) * 3.4, rr = r * 0.5 * (1 - 0.5 * i / 10); P.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8]); }
            inkStroke(c, P, { seed: sd + 5, w: 3.2, t0: 4, t1: 10, min: 0.2, amp: 0.8, heavy: 0 });
          }
        }
      }
    }
    // ta-da sparkles (on 3s hold, popping)
    if (tq >= 4.5 && tq < 5.1) {
      const sp = [[-0.95, -1.1, 0.0], [0.98, -1.18, 0.083], [-1.2, -0.55, 0.208], [1.18, -0.62, 0.333], [0.1, -1.45, 0.167]];
      sp.forEach(([ux, uy, dt], k) => {
        const u = inv(4.5 + dt, 4.5 + dt + 0.4, tq);
        if (tq < 4.5 + dt || u >= 1) return;
        const R = 34 * Math.sin(Math.PI * Math.min(1, u * 1.15)) * (k === 4 ? 1.3 : 1);
        drawTwinkle(c, ss.x + ux * ss.H * 0.55, ss.y + uy * ss.H * 0.55, R, 1100 + k * 3 + D.id);
      });
    }
    // anticipation lines converging before the burst (on 1s)
    if (t1 >= 6.25 && t1 < 6.5) {
      const u = inv(6.25, 6.5, t1);
      speedLinesRadial(c, ss.x, ss.y - ss.H * 0.3, lerp(560, 330, u), lerp(900, 620, u), 18, 1500 + f, 6, -1);
    }
  }
  c.restore(); // stage
  G.GLOBAL.ink = 1; G.GLOBAL.amp = 1;

  // ---------------- BURST (hero)
  if (t1 >= 6.583) {
    // cream smoke: clusters of 2-3 puffs in 3 size classes; each dissipates over 4 drawings on 2s
    // (solid -> hole -> bigger hole -> broken ring -> gone)
    const puffs = [], tails = [];
    const u = tq - 6.583;
    for (const P of SMOKE) {
      const st = tq < P.td ? 0 : Math.floor((tq - P.td) / (2 / FPS)) + 1;
      if (st >= 4) continue;
      const dist = (330 + 600 * (1 - Math.exp(-3.2 * u)) * (0.8 + 0.4 * hs(P.k, 22))) * P.dist;
      const px = C0[0] + Math.cos(P.a) * dist * 1.25, py = C0[1] + Math.sin(P.a) * dist * 0.8 - 60 * u;
      const r = P.R * E.outBack(clamp(u / 0.3), 1.5) * (1 + 0.3 * u) * (1 - 0.08 * st);
      const cs = [0, 1, 2, 3, 4].map((j) => {
        const aa = j * 1.35 + P.k * 2.1 + hs(P.k, j, 31) * 0.8;
        return { x: px + Math.cos(aa) * r * (j ? 0.5 + 0.25 * hs(P.k, j, 32) : 0), y: py + Math.sin(aa) * r * (j ? 0.38 : 0), r: r * (j ? 0.38 + 0.3 * hs(P.k, j, 33) : 0.8) };
      });
      const ha = hs(P.k, 26) * 6.28;
      const holes = st === 0 ? [] : st === 1 ? [{ x: px + Math.cos(ha) * r * 0.25, y: py + Math.sin(ha) * r * 0.2, r: r * 0.3 }]
        : st === 2 ? [{ x: px + Math.cos(ha) * r * 0.15, y: py + Math.sin(ha) * r * 0.12, r: r * 0.62 }]
        : [{ x: px, y: py, r: r * 0.92 }, { x: px + Math.cos(ha + 2.6) * r * 0.9, y: py + Math.sin(ha + 2.6) * r * 0.6, r: r * 0.45 }, { x: px + Math.cos(ha - 0.6) * r * 0.95, y: py + Math.sin(ha - 0.6) * r * 0.5, r: r * 0.32 }];
      puffs.push({ x: px, y: py, r, cs, holes });
      if (P.lead && st <= 1 && r > 40) tails.push({ px, py, r, k: P.k });
    }
    // R2 (REVIEW_2 P7): dry-brush soot = 3 wide brush strokes (24-40 px), each 6-10 broken bristle sub-strokes (2-5 px),
    // ink @ 70 %, tapered frayed tails; grow on 1s, fade over 3 drawings on 2s (7.0 / 7.083 / 7.167)
    if (t1 >= 6.625 && tq < 7.25) {
      const fade = t1 < 7.0 ? 1 : [0.85, 0.55, 0.28][Math.min(2, Math.round((tq - 7.0) * 12))];
      const sv = t1 < 7 ? f : bv(D);
      c.save(); c.globalAlpha = 0.7 * fade;
      [[-0.42, 36], [2.45, 40], [4.05, 26]].forEach(([a0, BW], i) => {
        const g = E.out2(clamp((t1 - 6.625) / 0.2));
        const nb = 6 + Math.floor(hs(i, 50) * 5);
        const r0 = 340 + 40 * hs(i, 52), L = (320 + 170 * hs(i, 53)) * g, bend = (hs(i, 55) - 0.5) * 0.35;
        const at = (v, off) => {
          const ang = a0 + bend * v * v, rr = r0 + L * v, nx = -Math.sin(ang), ny = Math.cos(ang), o2 = off * (1 + 0.2 * v);
          return [C0[0] + Math.cos(ang) * rr * 1.1 + nx * o2, C0[1] + Math.sin(ang) * rr * 0.85 + ny * o2];
        };
        for (let j = 0; j < nb; j++) {
          const off = (j / (nb - 1) - 0.5) * BW + (hs(i, j, 51) - 0.5) * 4, edgeK = Math.abs(off) / (BW * 0.5);
          const vs = 0.05 * hs(i, j, 56), ve = 1 - (0.08 + 0.3 * edgeK) * hs(i, j, 57); // outer bristles run out first
          // broken dry-brush gaps: 1-2 gaps per bristle
          const cuts = [vs];
          const ng = 1 + (hs(i, j, 58) > 0.55 ? 1 : 0);
          for (let q = 0; q < ng; q++) { const m = lerp(vs, ve, (q + 1) / (ng + 1) + (hs(i, j, q, 59) - 0.5) * 0.2), gw = 0.03 + 0.05 * hs(i, j, q, 60); cuts.push(m - gw / 2, m + gw / 2); }
          cuts.push(ve);
          for (let q = 0; q + 1 < cuts.length; q += 2) {
            const va = cuts[q], vb = cuts[q + 1], last = q + 2 >= cuts.length;
            if (vb - va < 0.02) continue;
            const P = [0, 0.25, 0.5, 0.75, 1].map((u) => at(lerp(va, vb, u), off));
            inkStroke(c, P, { seed: 1900 + i * 97 + j * 7 + q + sv * 3, w: 2 + 3 * hs(i, j, 54), t0: 3, t1: last ? 45 : 5, min: last ? 0.05 : 0.4, amp: 1.2, heavy: 0 });
          }
        }
      });
      c.restore();
    }
    // radial speed lines, badge (fire), starburst, smoke
    if (t1 < 6.92) speedLinesRadial(c, C0[0], C0[1], lerp(560, 760, inv(6.583, 6.92, t1)), 1350, 26, 1700 + f, 9, 1);
    drawBadge(c, t1 < 7.0 ? t1 : tq, D);
    drawStarburst(c, t1, D);
    smokeGroup(c, puffs, { seed: 1600 + (t1 < 7.0 ? f : bv(D)) * 7, w: 6 });
    // inked curl tails on the lead puffs (point back at the blast)
    for (const T of tails) {
      const bx = C0[0] - T.px, by = C0[1] - T.py, bl = Math.hypot(bx, by) || 1, ux = bx / bl, uy = by / bl;
      const P = [];
      for (let i = 0; i <= 16; i++) {
        const v = i / 16, d = T.r * (0.85 + 0.75 * v), cr = T.r * 0.28 * v * v;
        const ca = 5.2 * v * v;
        P.push([T.px + ux * d + (-uy * Math.sin(ca) + ux * (Math.cos(ca) - 1)) * cr, T.py + uy * d + (ux * Math.sin(ca) + uy * (Math.cos(ca) - 1)) * cr]);
      }
      inkStroke(c, P, { seed: 1650 + T.k * 7 + (t1 < 7.0 ? f : bv(D)), w: 5.5, t0: 6, t1: 30, min: 0.15, amp: 1.3, heavy: 0 });
    }
    // flying sparks (on 1s)
    if (t1 < 7.35) {
      for (let k = 0; k < NSPARK; k++) {
        const s = sparkState(k, t1);
        const fade = 1 - inv(7.0, 7.35, t1);
        if (fade <= 0) continue;
        if (k % 4 === 3) drawTwinkle(c, s.x, s.y, s.size * 1.6 * fade, 1800 + k * 7 + f, { rot: f * 0.3 + k });
        else { const j = (hs(k, 15) - 0.5) * 0.87, cj = Math.cos(j), sj = Math.sin(j); drawSpark(c, s.x, s.y, s.vx * cj - s.vy * sj, s.vx * sj + s.vy * cj, s.size * fade, 1800 + k * 7 + f, { inkOnly: k % 4 === 1 }); }
      }
    }
  }
  // ---------------- TITLE
  if (t1 >= 7.2) {
    const st = CUES.strokes;
    const prog = V5 ? STROKES.map((S) => inv(S.t0, S.t0 + S.dur, t1)) : STROKES.map((S, i) => inv(st[i] - 0.04, st[i] + (S.k === 'p' ? 0.1 : 0.14), t1));
    const settle = K(t1, [[8.5, 0], [8.583, 1.25, 'out2'], [8.667, 0.9], [8.75, 1.0]]);
    // title bounce with the badge
    const sc = 1 + K(t1, [[8.5, 0], [8.54, 0.05, 'out2'], [8.625, -0.02], [8.75, 0.008], [8.875, 0]]);
    c.save(); c.translate(BADGE.x, BADGE.y); c.scale(sc, sc); c.translate(-BADGE.x, -BADGE.y);
    drawTitle(c, prog, t1 < 8.5 ? { id: f, step: 1 } : D, { shadow: settle, shine: inv(8.5, 8.6, t1) });
    // fuse heads writing the strokes
    STROKES.forEach((S, i) => {
      const p = prog[i];
      if (p <= 0 || p >= 1) return;
      const full = titleDense(S, 3000 + i * 11, 1.5);
      const part = prefix(full, E.out2(p));
      const tip = part[part.length - 1];
      const sb = spline(xf(starPts(8, 34 + 8 * hs(f, i), 16, 1990 + f + i, f * 0.7, 0.35), { x: tip[0], y: tip[1] }), true, 3);
      fillShape(c, sb, PAL.yel, { seed: 1995 + f + i, amp: 1 });
      inkLoop(c, sb, { seed: 1996 + f + i, w: 3.2, amp: 1, t0: 3, t1: 6 });
      drawTwinkle(c, tip[0], tip[1], 26 + 6 * hs(f, i), 2000 + f * 3 + i, { rot: f * 0.5, fill: PAL.hi });
      for (let k = 0; k < 3; k++) {
        const a = hs(f, i, k) * 6.28, d = 20 + 30 * hs(f, i, k, 2);
        drawSpark(c, tip[0] + Math.cos(a) * d, tip[1] + Math.sin(a) * d, Math.cos(a) * 600, Math.sin(a) * 600, 5, 2100 + f * 5 + k + i);
      }
    });
    c.restore();
    // incoming fuse sparks: travel from their burst position to the stroke starts (on 1s)
    STROKES.forEach((S, i) => {
      const tS = V5 ? S.t0 : st[i] - 0.04, tA = Math.max(7.0, tS - 0.3);
      if ((V5 ? !S.first || S.ci === 0 : i === 0) || t1 < tA || t1 >= tS) return; // V5: one incoming fuse per character
      const k = (i * 3 + 1) % NSPARK;
      const p0 = sparkState(k, tA), p1 = strokeWorld(S)[0];
      const u = E.io2(inv(tA, tS, t1));
      const mx = (p0.x + p1[0]) / 2 + (p1[1] - p0.y) * 0.3, my = (p0.y + p1[1]) / 2 - (p1[0] - p0.x) * 0.3;
      const x = (1 - u) * (1 - u) * p0.x + 2 * u * (1 - u) * mx + u * u * p1[0];
      const y = (1 - u) * (1 - u) * p0.y + 2 * u * (1 - u) * my + u * u * p1[1];
      const dx = 2 * (1 - u) * (mx - p0.x) + 2 * u * (p1[0] - mx), dy = 2 * (1 - u) * (my - p0.y) + 2 * u * (p1[1] - my);
      drawSpark(c, x, y, dx * 2, dy * 2, 11, 2200 + f * 7 + i);
    });
  }
  // ---------------- HAND MADE + tagline + tiny spirit
  if (t1 >= 8.5) {
    const pop = (i) => { const t0 = CUES.letters[Math.min(3, Math.floor(i / 2))] - 0.001; return tq < t0 ? 0 : K(tq, [[t0, 1.35], [t0 + 0.083, 0.92], [t0 + 0.167, 1.0]]); };
    if (V5) { // V5: FRAME BY FRAME in the same marker caps, popping in 4 groups on the same cues
      const popV = (i) => { const t0 = CUES.letters[Math.min(3, Math.floor(i / 3.5))] - 0.001; return tq < t0 ? 0 : K(tq, [[t0, 1.35], [t0 + 0.083, 0.92], [t0 + 0.167, 1.0]]); };
      drawWord(c, 'FRAME BY FRAME', BADGE.x, 690, 58, D, { center: true, pop: popV, color: PAL.hi, track: 0.34, wk: 0.16, outline: 3.0, shadow: 4.5 });
    } else
    drawWord(c, 'HAND MADE', BADGE.x, 716, 78, D, { center: true, pop, color: PAL.hi, track: 0.37, wk: 0.155, outline: 3.2, shadow: 5 });
    drawTagline(c, D, inv(CUES.tagline[0], CUES.tagline[1], tq), 960, 930);
    // twinkles popping around the lockup (held on 3s)
    const TW = [[392, 250, 8.583, 30], V5 ? [1470, 104, 8.75, 34] : [1640, 190, 8.75, 34], [1560, 748, 8.917, 26], [372, 712, 9.0, 24], [690, 140, 9.25, 20], [1640, 532, 9.375, 18]];
    TW.forEach(([x, y, t0, R], k) => {
      if (tq < t0) return;
      const cyc = [1.0, 0.55, 0.8][Math.floor((tq - t0) * 8) % 3];
      const pop = E.outBack(clamp((tq - t0) / 0.12), 2.2);
      drawTwinkle(c, x, y, R * pop * cyc, 6200 + k * 13 + bv(D), { rot: 0.1 * k });
    });
    // tiny spirit reborn on top of the badge
    const SP = CUES.spirit_pop, WK = CUES.wink;
    if (tq >= SP - 0.001) {
      drawSpirit(c, tinySpirit(tq, D), D, tq);
      if (V5 && !NODOT) { const em = emberState(tq, D); if (em) drawEmber(c, em, D); }
    }
  }
  c.restore();
  // ---------------- before the match is lit the sheet is in shadow; the strike flashes it on
  if (f < 12) nightPass(c, D, f, ms);
  else if (f === 12) flashFrame(c, ms);
  // ---------------- pencil annotations (on the sheet)
  drawPencil(c, D, f);
  drawTooth(c, D);
  // ---------------- IMPACT FRAMES (hero): two full-frame flat colour frames
  if (f === 156 || f === 157) impactFrame(c, f);
}

function tinySpirit(tq, D) { // tiny spirit reborn on top of the badge
  const SP = CUES.spirit_pop, WK = CUES.wink;
  const u = tq - SP;
  const sq = 1 + K(tq, [[SP, -0.45], [SP + 0.125, 0.22, 'out2'], [SP + 0.25, -0.06], [SP + 0.375, 0]]);
  return { x: V5 ? 1666 : 1430, y: (V5 ? 294 : 262) - K(tq, [[SP, 0], [SP + 0.125, 24, 'out2'], [SP + 0.25, 0]]), H: 178 * E.outBack(clamp((u + 0.04) / 0.16), 2), sx: 1 / Math.pow(sq, 0.8), sy: sq, kx: 0, curl: 0, r: 0.08, wild: 0.15,
    drops: false, face: { eyes: tq >= WK - 0.001 && tq < WK + 0.2 ? 'wink' : 'open', mouth: tq >= WK - 0.001 ? 'grin' : 'smile', look: -0.6 }, seed: 3000 + D.id,
    arms: u > 0.1 ? { L: { ang: -0.5, bend: 0.4 }, R: V5 ? { ang: 1.05, bend: -0.3 } : { ang: tq >= WK - 0.13 ? 1.25 + 0.35 * Math.sin(tq * 26) : 0.2, bend: -0.3 } } : null };
}
// V5: the tiny spirit holds up an ember (a fire lump from the badge: tomato disc, yellow highlight, boiling ink) = the film's closing dot
function armHand(s, side, a) {
  const sh = [side * 0.4, -0.36], len = a.len ?? 0.42, dx = side * Math.cos(a.ang), dy = -Math.sin(a.ang);
  return spiritXf([[sh[0] + dx * len, sh[1] + dy * len]], { ...s, sx: (s.sx + 1) / 2, sy: (s.sy + 1) / 2 })[0];
}
const EMBER_R = 46;
function emberState(tq, D) {
  const s = tinySpirit(tq, D), a = s.arms && s.arms.R;
  if (!a || s.H < 20) return null;
  const hp = armHand(s, 1, a), gR = s.H * 0.082 * (a.big ?? 1);
  const r = EMBER_R * E.outBack(clamp((tq - (CUES.spirit_pop + 0.075)) / 0.12), 2);
  return { x: hp[0] + 6, y: hp[1] - gR - r * 0.72, r };
}
function drawEmber(c, e, D) {
  const sv = bv(D), d = circlePts(e.x, e.y, e.r, 30);
  fillShape(c, d, PAL.red, { seed: 9600 + sv, amp: 1.5, dx: REG.dx * 0.7, dy: REG.dy * 0.7 });
  fillShape(c, circlePts(e.x - e.r * 0.26, e.y - e.r * 0.28, e.r * 0.5, 20), PAL.yel, { seed: 9605 + sv, amp: 1.3 });
  inkLoop(c, dens(d, 4), { seed: 9610 + sv, w: 5, amp: 1.4, heavy: 0.35, t0: 4, t1: 8 });
  inkStroke(c, [[e.x - e.r * 0.5, e.y - e.r * 0.06], [e.x - e.r * 0.36, e.y - e.r * 0.42]], { seed: 9615 + sv, w: 5, t0: 3, t1: 5, color: PAL.hi, amp: 0.8, heavy: 0 });
  [-2.35, -1.6, -0.85].forEach((a, k) => { // glow ticks
    const r0 = e.r * (1.3 + 0.08 * ((sv + k) % 2)), r1 = r0 + e.r * 0.34;
    inkStroke(c, [[e.x + Math.cos(a) * r0, e.y + Math.sin(a) * r0], [e.x + Math.cos(a) * r1, e.y + Math.sin(a) * r1]], { seed: 9620 + k + sv * 3, w: 4.5, t0: 4, t1: 5, amp: 0.8, heavy: 0 });
  });
}
function impactFrame(c, f) {
  c.save();
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.fillStyle = f === 156 ? PAL.ink : PAL.red;
  c.fillRect(0, 0, W, H);
  const P = spline(xf(starPts(14, f === 156 ? 520 : 700, f === 156 ? 250 : 330, 77 + f, f * 0.3, 0.3), { x: C0[0], y: C0[1] }), true, 6);
  if (f === 156) {
    fillShape(c, P, PAL.hi, { seed: f, amp: 2 });
    const Q = spline(xf(starPts(10, 260, 130, 99, 0.4, 0.3), { x: C0[0], y: C0[1] }), true, 5);
    fillShape(c, Q, PAL.yel, { seed: f + 1, amp: 2 });
  } else {
    speedLinesRadial(c, C0[0], C0[1], 380, 1300, 30, 2400, 16, 1);
    fillShape(c, P, PAL.yel, { seed: f, amp: 2 });
    inkLoop(c, P, { seed: f + 3, w: 12, amp: 2 });
    const Q = spline(xf(starPts(10, 360, 190, 98, 0.7, 0.3), { x: C0[0], y: C0[1] }), true, 5);
    fillShape(c, Q, PAL.hi, { seed: f + 1, amp: 2 });
  }
  c.restore();
}

function drawPencil(c, D, f) {
  c.save();
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  const jx = (hs(D.id, 71) - 0.5) * 1.2, jy = (hs(D.id, 72) - 0.5) * 1.2;
  const ex = D.step === 1 ? 'on 1s' : D.step === 2 ? 'on 2s' : 'on 3s';
  if (D.fq < 218) {
    if (f > 12) { // R2: hand-cut paper knock-out, always on, so the notes never sit on a coloured cel
      fillShape(c, dens(rectPts(W - 290, H - 156, 226, 126), 8), PAL.cream, { seed: 9500 + bv(D), amp: 2.5 });
    }
    c.globalAlpha = 0.8; c.fillStyle = PAL.pencil; c.textAlign = 'right';
    c.font = '600 42px "Caveat"';
    c.fillText('No. ' + String(D.id + 1).padStart(3, '0'), W - 88 + jx, H - 56 + jy);
    c.font = '500 30px "Caveat"';
    c.fillText(ex, W - 88 + jx, H - 98 + jy);
  } else {
    const x1 = W - 128 + jx, yb = H - 70 + jy;
    c.globalAlpha = 0.93; c.fillStyle = PAL.pencil; c.textAlign = 'right';
    c.font = '400 86px "Long Cang"'; c.fillText('张', x1, yb + 2); // R1s2: hero note 80->92 px (~77 px on screen after the 84 % pull-back)
    const zw = c.measureText('张').width;
    c.font = '700 92px "Caveat"'; const txt = String(TOTAL); c.fillText(txt, x1 - zw - 14, yb); // R2: '第 146 张' (was 'No. 146 张')
    const nw = c.measureText(txt).width;
    c.font = '400 86px "Long Cang"'; c.fillText('第', x1 - zw - 14 - nw - 16, yb + 2);
    const tw = c.measureText('第').width + 16 + nw + 14 + zw;
    const cx = x1 - tw / 2 - 4, cy = yb - 27, rx = tw / 2 + 40, ry = 68;
    const p = D.fq >= 220 ? 1 : 0.5; // R2: loop starts with the pull (f218), closes f220
    c.globalAlpha = 1;
    if (p > 0) { // red loop, drawn on across 2 drawings, overshooting its start
      const P = [], n = 44, m = Math.round(n * 1.16 * p);
      for (let i = 0; i <= m; i++) { const a = -2.7 + (i / n) * Math.PI * 2, g = 1 + 0.07 * (i / n); P.push([cx + Math.cos(a) * rx * g, cy + Math.sin(a) * ry * g - 5 * (i / n)]); }
      inkStroke(c, xf(P.map(([x, y]) => [x - cx, y - cy]), { x: cx, y: cy, r: -0.05 }), { seed: 9300 + (p < 1 ? 0 : bv(D)), w: 5.5, t0: 10, t1: 26, min: 0.35, amp: 1.2, heavy: 0, color: PAL.pencil });
    }
    if (D.fq >= 222) { // arrow to the tagline
      const A = [cx - rx - 8, cy - 22], B = [1318, 918];
      const M = [(A[0] + B[0]) / 2 + 6, Math.min(A[1], B[1]) - 46];
      inkStroke(c, [A, M, B], { seed: 9320 + bv(D), w: 5, t0: 8, t1: 6, min: 0.4, amp: 1.2, heavy: 0, color: PAL.pencil });
      const d = Math.atan2(B[1] - M[1], B[0] - M[0]);
      for (const sg of [-1, 1]) {
        const a = d + Math.PI + sg * 0.55;
        inkStroke(c, [B, [B[0] + Math.cos(a) * 30, B[1] + Math.sin(a) * 30]], { seed: 9330 + sg + bv(D), w: 5, t0: 4, t1: 8, min: 0.4, amp: 1, heavy: 0, color: PAL.pencil });
      }
    }
    c.globalAlpha = 0.78; c.font = '500 32px "Caveat"'; c.fillText(ex, W - 96 + jx, H - 160 + jy);
  }
  c.globalAlpha = 0.78; c.fillStyle = PAL.pencil; c.textAlign = 'left';
  c.font = '600 34px "Caveat"';
  if (f > 12 && D.fq < 218) { c.globalAlpha = 1; fillShape(c, dens(rectPts(80, 72, 150, 58), 8), PAL.cream, { seed: 9510 + bv(D), amp: 2 }); c.globalAlpha = 0.78; }
  c.fillStyle = PAL.pencil; // R2s2 fix: fillShape left fillStyle = cream, so the slate text was invisible
  c.fillText('SC. 05', 100 + jx, 114 + jy); // R2: moved top-left (was bottom-left, sat on the box corner)
  c.restore();
}

// ------------------------------------------------------------------ reel v5: link elements, a pure function of t (1920×1080 output px)
function shotAt(f) { // the stage transform drawFrame() uses for frame f (no globals touched)
  if (f >= 132) { const u = E.in2(inv(5.5, 6.5, f / FPS)); return { s: lerp(STAGE.s, 2.05, u), px: 860, py: 606, X: 862, Y: 618 }; }
  return shotFor(f);
}
export function linkAt(t) {
  const f = Math.min(239, Math.max(0, Math.round(t * FPS)));
  const D = drawing(f), tq = D.fq / FPS, t1 = f / FPS, cam = camera(f);
  const sc = pullScale(D.fq), rif = f >= 224 && f <= 229 ? f - 224 : -1;
  const ox = rif >= 0 ? (hs(f, 1) - 0.5) * 12 : 0, oy = rif >= 0 ? -6 - 8 * hs(f, 2) : 0, rot = rif >= 0 ? (hs(f, 3) - 0.5) * 0.014 : 0;
  const sheet = ([x, y]) => { // sheet px -> frame px (end pull-back onto the light table + riffle lift)
    if (sc >= 1) return [x, y];
    const X = (x - PIV[0]) * sc, Y = (y - PIV[1]) * sc, c = Math.cos(rot), s = Math.sin(rot);
    return [PIV[0] + ox + X * c - Y * s, PIV[1] + oy + X * s + Y * c];
  };
  const sh = shotAt(f);
  const stage = ([x, y]) => sheet([cam.x + sh.X + (x - sh.px) * sh.s, cam.y + sh.Y + (y - sh.py) * sh.s]);
  const onSheet = ([x, y]) => sheet([x + cam.x, y + cam.y]);
  const R1 = (v) => Math.round(v * 10) / 10;
  const out = [];
  // ---- dot 1: the match head (0 – 6.49 s). Red until 2.0 (night-darkened before 0.5), burnt ink-black after; hidden under the flame 0.5–2.0
  const ms = matchState(tq);
  if (ms.vis && tq < 6.5 && f !== 156 && f !== 157) {
    const [hc] = xf([[0, -2]], { x: ms.hx, y: ms.hy, r: ms.r });
    const [x, y] = stage(hc);
    const a = f <= 8 || f === 11 ? 1 : f === 9 || f === 10 ? 0.4 : f === 12 ? 0 : f < 49 ? 0 : 1;
    const night = f < 12;
    out.push({ id: 'dot', type: 'circle', x: R1(x), y: R1(y), r: R1(HEAD_R * sh.s * sc), a, look: 'ink',
      fill: ms.burnt ? PAL.ink : night ? '#44241b' : PAL.red, stroke: PAL.ink, sw: R1(5.5 * sh.s * (f < 12 ? 0.58 : 1)),
      note: ms.burnt ? 'burnt match head (ink disc, red ember speck), boiling ink outline' : night ? 'match head in the dark close-up (red, night-darkened), trembling' : a ? 'match head' : 'match head under the flame spirit / smear' });
  }
  // ---- dot 2: the explosion core (6.92 – 7.29 s): yellow starburst ball with a paper-white core; travels to 逐's first stroke and lights the fuse
  const tb = t1 < 7.0 ? t1 : tq;
  if (t1 > 6.88 && tb < 7.3) {
    const coreU = E.out3(inv(6.62, 6.9, tb)), mv = morphP(tb);
    const qx = lerp(C0[0], BADGE.x, mv), qy = lerp(C0[1], BADGE.y, mv), qr = lerp(260, BADGE.ry, mv) * coreU * (1 + 0.06 * Math.sin(Math.PI * mv));
    if (qr > 20) {
      const p0 = strokeWorld(STROKES[0])[0], stp = tb < 7.12 ? 0 : tb < 7.2 ? 1 : 2;
      const e = [0, 0.55, 1][stp], R = Math.min(qr * 0.8, 240) * [1, 0.45, 0.2][stp];
      const ax = qx + 6, ay = qy + 4, mx = (ax + p0[0]) / 2 - (p0[1] - ay) * 0.35, my = (ay + p0[1]) / 2 + (p0[0] - ax) * 0.35;
      const gx = (1 - e) * (1 - e) * ax + 2 * e * (1 - e) * mx + e * e * p0[0], gy = (1 - e) * (1 - e) * ay + 2 * e * (1 - e) * my + e * e * p0[1];
      const [x, y] = onSheet([gx, gy]);
      out.push({ id: 'dot', type: 'circle', x: R1(x), y: R1(y), r: R1(R * 0.8), a: 1, look: 'ink', fill: PAL.yel, stroke: stp ? PAL.ink : PAL.yel, sw: stp ? 4 : 0,
        grad: [PAL.hi, PAL.yel], note: `explosion core (9-point yellow star ball, paper-white centre; r = mean star radius)${stp ? ' flying to the first stroke, lights the fuse' : ''}` });
    }
  }
  // ---- dot 3 (V5): the ember the tiny spirit holds up at the end (9.25 – 10 s)
  if (tq >= CUES.spirit_pop - 0.001) {
    const em = emberState(tq, D);
    if (em && em.r > 1) {
      const [x, y] = onSheet([em.x, em.y]);
      out.push({ id: 'dot', type: 'circle', x: R1(x), y: R1(y), r: R1((em.r + 2.5) * sc), a: 1, look: 'ink', fill: PAL.red, stroke: PAL.ink, sw: R1(5 * sc),
        grad: [PAL.yel, PAL.red], note: 'ember held up by the tiny flame spirit (tomato disc, yellow highlight up-left, boiling ink outline, 3 glow ticks)' });
    }
  }
  // ---- other link candidates
  const ss = spiritState(tq, D, ms);
  if (ss && tq >= 0.5 && tq < 6.5 && f !== 156 && f !== 157) { // the stepped light pool behind the spirit (big pale disc)
    let R = K(tq, [[0.5, 60], [0.542, 330, 'out3'], [0.625, 380], [1.0, 310], [2.0, 315], [2.5, 345], [5.5, 350], [6.25, 430, 'io2'], [6.5, 470]]);
    R *= 1 + 0.03 * (bv(D) % 3 - 1);
    const [x, y] = stage([ss.x, ss.y - ss.H * 0.42 * ss.sy]);
    out.push({ id: 'pool', type: 'circle', x: R1(x), y: R1(y), r: R1(R * sh.s), a: f === 12 ? 0 : 1, look: 'flat', fill: '#f0d794', stroke: '#f0d794', sw: 0,
      note: 'flickering light pool of the flame (inner step; outer pale step at 1.25 r), multiplied into the paper' });
  }
  if (ms.vis && tq >= 1.0 && tq < 6.5 && f !== 156 && f !== 157) { // the (burnt) match stick, vertical
    const [H0, B0] = stickEnds(ms), [x0, y0] = stage(H0), [x1, y1] = stage(B0);
    out.push({ id: 'stick', type: 'line', x0: R1(x0), y0: R1(y0), x1: R1(x1), y1: R1(y1), w: R1(21 * sh.s), a: 1, note: 'match stick (head to butt)' });
  }
  const bs = boxState(tq);
  if (bs.vis && !bs.blown && f > 12 && tq < 6.5 && f !== 156 && f !== 157) { // matchbox top front edge = the stage line
    const y1 = shotFor(f) === LOW && f < 132 ? -112 : -90;
    const T = (P) => xf(P, { x: BOXP.px + bs.x, y: BOXP.py + bs.y, r: bs.r, sx: bs.sx, sy: bs.sy });
    const [A, B] = T([[-370, y1], [370, y1]]), [x0, y0] = stage(A), [x1, y1b] = stage(B);
    out.push({ id: 'box', type: 'line', x0: R1(x0), y0: R1(y0), x1: R1(x1), y1: R1(y1b), w: R1(5.2 * sh.s), a: 1, note: 'matchbox front top edge (red top / yellow front)' });
  }
  if (V5 && tq >= 7.33) { // the settled scalloped fire badge + the title block
    const bb = K(t1, [[8.5, 0], [8.54, 0.045, 'out2'], [8.625, -0.02], [8.75, 0.008], [8.875, 0]]) + 1;
    const [x, y] = onSheet([BADGE.x, BADGE.y]);
    out.push({ id: 'badge', type: 'rect', x: R1(x), y: R1(y), w: R1((BADGE.rx + 110) * 2 * bb * sc), h: R1((BADGE.ry + 100) * 2 * bb * sc), rot: R1(rot * 1000) / 1000, a: 1,
      fill: PAL.red, note: 'scalloped tomato fire badge (a boiling blob of circles) behind the title' });
    if (t1 >= 8.375) {
      const tb2 = TITLE_BOX(), ts = 1 + K(t1, [[8.5, 0], [8.54, 0.05, 'out2'], [8.625, -0.02], [8.75, 0.008], [8.875, 0]]);
      const [cx, cy] = onSheet([BADGE.x + (tb2.x - BADGE.x) * ts, BADGE.y + (tb2.y - BADGE.y) * ts]);
      out.push({ id: 'title', type: 'rect', x: R1(cx), y: R1(cy), w: R1(tb2.w * ts * sc), h: R1(tb2.h * ts * sc), rot: R1(rot * 1000) / 1000, a: 1,
        fill: PAL.yel, note: 'title 逐帧手绘 (yellow, ink outline, block shadow)' });
    }
  }
  return out;
}
let TBOX = null;
function TITLE_BOX() { // bounds of the written title (stroke centre-lines ± half width + ink ring)
  if (TBOX) return TBOX;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const m = TITLE.S * (TITLE.w ?? 0.165) * 0.65 + (TITLE.ink ?? 6.8);
  for (const st of STROKES) for (const [x, y] of spline(strokeWorld(st), false, 5)) { x0 = Math.min(x0, x - m); x1 = Math.max(x1, x + m); y0 = Math.min(y0, y - m); y1 = Math.max(y1, y + m); }
  TBOX = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
  return TBOX;
}
