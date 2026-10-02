// 07-liquid — choreography. Every primitive is a closed-form function of t (seeded, no state).
import { baseState } from './lookdev.js';

const PI = Math.PI;
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const inv = (a, b, x) => clamp((x - a) / (b - a));
export const smooth = (t) => t * t * (3 - 2 * t);
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (s) => ((ax * s + bx) * s + cx) * s, Y = (s) => ((ay * s + by) * s + cy) * s, dX = (s) => (3 * ax * s + 2 * bx) * s + cx;
  return (x) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let lo = 0, hi = 1, s = x;
    for (let i = 0; i < 12; i++) {
      const e = X(s) - x;
      if (Math.abs(e) < 1e-7) break;
      if (e > 0) hi = s; else lo = s;
      const d = dX(s);
      s = Math.abs(d) > 1e-6 ? s - e / d : (lo + hi) / 2;
      if (s <= lo || s >= hi) s = (lo + hi) / 2;
    }
    return Y(s);
  };
}
export const flung = bezier(0.22, 1, 0.36, 1);        // the brief's "thrown" ease
const inOut = bezier(0.65, 0, 0.35, 1);
const easeIn = bezier(0.5, 0, 0.9, 0.4);
const outSoft = bezier(0.33, 0.9, 0.4, 1);
const frontEase = bezier(0.28, 0.55, 0.42, 1);
// damped step response 0 -> 1 (overshoots)
function spring(t, f = 4, z = 0.3) {
  if (t <= 0) return 0;
  const w = 2 * PI * f, wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t));
}
function wob(t, f, decay) { return t <= 0 ? 0 : Math.exp(-t / decay) * Math.sin(2 * PI * f * t); }
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// camera keys: t, zoom, centre x, centre y  (Catmull-Rom, continuous velocity)
const CAM = [
  // round 1: open in macro on the pour bulb (~560 px wide), tilt down with the fall, crown fills ~38 % of the frame at
  // 0.40, then pull back across P2-P4 to the wide framing at 1.70
  [-0.5, 5.4, 640, 382], [0.0, 5.3, 640, 398], [0.167, 4.9, 640, 452], [0.30, 3.8, 642, 690], [0.42, 3.3, 648, 800],
  [0.8, 2.6, 1010, 832], [1.2, 2.15, 745, 812],   // r2 s2 P8: ~1.15-1.2x tighter over P2-P3
   [1.7, 1.6, 880, 758], [2.4, 1.64, 925, 764], [3.05, 1.72, 960, 764], [3.6, 1.46, 960, 590],
  [4.0, 1.42, 960, 640], [4.6, 1.2, 960, 560], [5.0, 1.13, 960, 548], [5.9, 1.0, 960, 540], [8.0, 1.0, 960, 540],
  [10.0, 1.0, 960, 540], [10.5, 1.0, 960, 540],
];
function camAt(t) {
  let i = 1;
  while (i < CAM.length - 2 && t > CAM[i + 1][0]) i++;
  const k0 = CAM[i - 1], k1 = CAM[i], k2 = CAM[i + 1], k3 = CAM[i + 2];
  const u = Math.min(1, Math.max(0, (t - k1[0]) / (k2[0] - k1[0])));
  const out = [];
  for (let c = 1; c < 4; c++) {
    // non-uniform Catmull-Rom tangents
    const m1 = (k2[c] - k0[c]) / (k2[0] - k0[0]) * (k2[0] - k1[0]);
    const m2 = (k3[c] - k1[c]) / (k3[0] - k1[0]) * (k2[0] - k1[0]);
    const u2 = u * u, u3 = u2 * u;
    out.push((2 * u3 - 3 * u2 + 1) * k1[c] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * k2[c] + (u3 - u2) * m2);
  }
  return out;
}
export const FY = 872, HOR = 786;           // contact line, horizon
const G = 5000;                              // gravity px/s^2 (droplets, leaps, drips)

// ball helper: vertical stretch sv (>1 tall, <1 flat), resting on floor if onFloor
function ball(S, x, y, r, u, sv = 1, ang = PI / 2) { if (r > 0.3) S.balls.push(S._lk ? { x, y, r, u, s: sv, a: ang, lk: S._lk, main: S._main, la: S._la, note: S._note } : { x, y, r, u, s: sv, a: ang }); }
function seg(S, ax, ay, bx, by, ra, rb, u) { if (Math.max(ra, rb) > 0.35) S.segs.push(S._lk ? { ax, ay, bx, by, ra, rb, u, lk: S._lk } : { ax, ay, bx, by, ra, rb, u }); }
// reel v5 link tags: tag(S, ['dot'], 'dot', a, note) marks the next primitives; the one pushed while main is set is the principal
function tag(S, lk, main = null, a = 1, note = '') { if (!S.lnk) return; S._lk = lk; S._main = main; S._la = a; S._note = note; }
function untag(S) { if (S.lnk) { S._lk = null; S._main = null; } }

// ballistic droplet that lands on the floor and becomes a bead (or melts into a puddle)
function makeDroplet(o) {
  // o: x0 y0 vx vy r u tEmit [tGrow] [melt(xHit) -> bool] [life]
  o.fy = o.fy ?? 0; o.r *= 1 + o.fy / 180;   // r2 s2: depth scale 0.8-1.17
  const dy = FY + o.fy - o.r - o.y0;
  const tf = (o.vy + Math.sqrt(o.vy * o.vy + 2 * G * dy)) / G;   // vy is upward positive here
  o.tHit = o.tEmit + tf; o.xHit = o.x0 + o.vx * tf;
  o.melt = o.melt ? o.melt(o.xHit, o.tHit) : false;
  o.vHit = -o.vy + G * tf;
  return o;
}
function emitDroplet(S, d, t, extra = {}) {
  const grow = d.tGrow ?? 0.066;
  if (t < d.tEmit - grow) return;
  let r = d.r;
  if (t < d.tEmit) { // crown bulging out of the parent before it detaches
    const k = inv(d.tEmit - grow, d.tEmit, t);
    r *= 0.4 + 0.6 * k;
    ball(S, d.x0, d.y0 + (1 - k) * 10, r, d.u, 1);
    return;
  }
  if (t < d.tHit) {
    const tt = t - d.tEmit;
    const x = d.x0 + d.vx * tt, y = d.y0 - d.vy * tt + 0.5 * G * tt * tt;
    const vx = d.vx, vy = -d.vy + G * tt, sp = Math.hypot(vx, vy);
    const sv = 1 + Math.min(0.45, sp / 5200);
    const ang = Math.atan2(vy, vx);
    ball(S, x, y, r, d.u, sv, ang);
    return;
  }
  const tl = t - d.tHit;
  if (d.melt) { r *= 1 - smooth(inv(0, 0.12, tl)); if (r < 0.5) return; }
  if (d.absorb !== undefined && t > d.absorb) r *= 1 - smooth(inv(d.absorb, d.absorb + 0.12, t));
  if (r < 0.5) return;
  const sv = 1.25 + (0.62 - 1.25) * spring(tl, 7, 0.38);
  let x = d.xHit;
  if (d.follow) x += d.follow(t);
  ball(S, x, FY + d.fy - r * sv + 0.5, r, d.u, sv);
}

export function createFilm(cues, word, opts = {}) {
  const V5 = !!opts.v5;
  const R = rng(20260927);
  const rr = (a, b) => a + (b - a) * R();

  // ================= RAIN: four drops =================
  const drops = [
    { id: 'P1', x: 640, r: 56, u: 0.05, tLand: cues.landings[0].t, z: 0.5 },
    { id: 'P2', x: 1250, r: 46, u: 0.62, tLand: cues.landings[1].t, z: 0.5 },
    { id: 'P3', x: 405, r: 42, u: 0.95, tLand: cues.landings[2].t, z: 0.5 },
    { id: 'P4', x: 960, r: 74, u: 0.36, tLand: cues.landings[3].t, z: 0.62 },
  ];
  const SV_PUD = 0.5;                              // resting puddle stretch (flat lens)
  // landing squash: contact frame already squashing; overshoot below the resting lens is halved (no "hot-dog" pancake)
  const svLand = (d, tl) => { const s = 1.3 + (SV_PUD - 1.3) * spring(tl + 1.3 / 30, 6, d.z); return s < SV_PUD ? SV_PUD - (SV_PUD - s) * 0.45 : s; };
  // splash crown: a fan of tapered tendrils flung out of the splat (edges lean out, centre stands up). Each tip beads
  // up on a thinning neck and pinches off 2-3 frames after impact (secondary droplets); the stub recoils with a rebound bump.
  const TEN_T = 0.27;
  const tendrils = drops.map((d) => {
    const big = d.id === 'P4', n = big ? 7 : 5, out = [];
    for (let k = 0; k < n; k++) {
      const c = (k / (n - 1)) * 2 - 1 + rr(-0.07, 0.07);
      const ang = c * 0.95 + rr(-0.12, 0.12);                               // radians from vertical
      const L = d.r * (0.9 + 0.5 * Math.abs(c)) * rr(0.72, 1.22) * (big ? 1.08 : 1);
      const tDet = 0.07 + rr(0, 1.1 / 30) + 0.02 * Math.abs(c);
      out.push({ c, ang, L, tDet, rb: d.r * rr(0.1, 0.135) * rr(0.6, 1.4) });
    }
    return out;
  });
  function tendrilState(d, w, tl) {
    if (tl < 0 || tl > TEN_T) return null;
    const sv = svLand(d, tl), ax = d.r / sv, ay = d.r * sv, cy = FY - ay + 1;
    const bx = d.x + w.c * ax * 0.46;
    const by = cy - ay * Math.sqrt(Math.max(0, 1 - (w.c * 0.46) ** 2)) + ay * 0.45;   // rooted just inside the splat top
    let len, pinch = 0, bead = 0;
    if (tl < w.tDet) {
      const k = inv(0, w.tDet, tl);
      len = w.L * flung(k); pinch = smooth(inv(0.45, 1, k)); bead = 0.55 + 0.45 * k;
    } else {
      const q = 1 - spring(tl - w.tDet, 5, 0.34);                            // recoil; negative lobe = rebound bump
      len = w.L * 0.62 * (q >= 0 ? q : -0.45 * q) * (1 - smooth(inv(0.17, TEN_T, tl)));
    }
    const dx = Math.sin(w.ang), dy = -Math.cos(w.ang);
    const droop = 0.22 * len * Math.abs(dx);                                 // gravity bends leaning tendrils into arcs
    const mx = bx + dx * len * 0.5, my = by + dy * len * 0.5 + droop * 0.25;
    const tx = bx + dx * len, ty = by + dy * len + droop;
    const ra = d.r * 0.16 * (1 - 0.3 * Math.abs(w.c)), rm = lerp(ra * 0.55, ra * 0.42, pinch), rt = lerp(rm * 0.8, d.r * 0.035, pinch);
    return { bx, by, mx, my, tx, ty, ra, rm, rt, bead: bead * w.rb, len };
  }
  const crown = [];
  drops.forEach((d, di) => {
    const big = d.id === 'P4';
    const melt = (xh) => Math.abs(xh - d.x) < d.r / SV_PUD * 0.85;
    tendrils[di].forEach((w) => {                                           // tip beads -> ballistic droplets
      const s = tendrilState(d, w, w.tDet - 1e-4);
      const ang = w.ang + rr(-0.21, 0.21), sp = rr(480, 760) * rr(0.75, 1.25) * (big ? 1.15 : 1);
      const x0 = s.tx + Math.sin(w.ang) * w.rb, y0 = s.ty - Math.cos(w.ang) * w.rb, fy = rr(-36, 30);   // r2 s2 P8: scattered in depth
      const T = rr(6, 8.5) / 30 * (big ? 1.15 : 1), vy = (0.5 * G * T * T - (FY + fy - w.rb - y0)) / T;
      crown.push(makeDroplet({
        x0, y0, vx: Math.sin(ang) * sp * 1.1, vy, fy,
        r: w.rb, u: d.u + rr(-0.05, 0.05), tEmit: d.tLand + w.tDet, tGrow: 0.001, owner: di, melt,
      }));
    });
    for (let i = 0; i < (big ? 3 : 2); i++) {                               // fine spray from the splat rim
      const side = i % 2 ? 1 : -1;
      crown.push(makeDroplet({
        x0: d.x + side * d.r * rr(0.9, 1.4), y0: FY - d.r * 0.55, vx: side * rr(320, big ? 820 : 640), vy: rr(520, big ? 1100 : 900),
        r: rr(3.5, big ? 8 : 6), u: d.u + rr(-0.05, 0.05), tEmit: d.tLand + 2 / 30 + rr(0, 1 / 30), tGrow: 0.03, owner: di, melt, fy: rr(-36, 30),
      }));
    }
  });
  // landed beads closer than 15 px merge (the later one soaks into the earlier one) -> no dashed rows
  { const land = crown.filter((c) => !c.melt).sort((a, b) => a.tHit - b.tHit);
    land.forEach((c, i) => { for (let j = 0; j < i; j++) { const o = land[j]; if (!o.melt && Math.hypot(c.xHit - o.xHit, c.fy - o.fy) < 15 + c.r + o.r) { c.melt = true; break; } } }); }

  // ================= FUSE: puddles hop into the centre mass =================
  const MX = 960, GH = 5000, TH = 0.34;
  const hops = [
    { who: 0, tc: cues.merges[0] },   // P1 from the left, triggered by P4's landing
    { who: 2, tc: cues.merges[1] },   // P3 from far left
    { who: 1, tc: cues.merges[2] },   // P2 from the right, trailing bead tied by a thread that snaps
  ];
  hops.forEach((h) => { const d = drops[h.who]; h.side = Math.sign(d.x - MX); h.tTake = h.tc - TH; h.x0 = d.x; h.x1 = MX + h.side * 42; h.vy = GH * TH / 2 + 60 / TH; });
  const hopOf = (i) => hops.find((h) => h.who === i);
  function mergeK(i, t) { const h = hopOf(i); return smooth(inv(h.tc - 0.02, h.tc + 0.16, t)); }
  function massShift(t) { let s = 0; for (const h of hops) s += h.side * 20 * wob(t - h.tc, 2.8, 0.22); return s; }
  function massR(t) { let a = drops[3].r ** 2; for (const h of hops) a += drops[h.who].r ** 2 * mergeK(h.who, t); return Math.sqrt(a); }
  // merged drops keep swirling inside the mass as coloured 'ghosts' (marbled interior, silhouette unchanged)
  function ghosts(S, t, cx, cy, R, sv, fade = 1) {
    hops.forEach((h, j) => {
      const k = smooth(inv(h.tc + 0.02, h.tc + 0.3, t)) * fade;
      if (k <= 0.01) return;
      const a = j * 2.1 + 1.5 * (t - h.tc) + h.side * 0.9;
      const rg = Math.min(drops[h.who].r * 0.9, R * 0.62);
      // streak along the orbit tangent -> marbled swirl
      const gx = cx + Math.cos(a) * 0.40 * R / sv, gy = cy + Math.sin(a) * 0.34 * R * sv;
      const gb = { x: gx, y: gy, r: rg, u: drops[h.who].u, s: 1.7, a: a + PI / 2 + (sv < 0.8 ? 0 : 0), ghost: true, amt: 0.85 * k };
      if (S._lk) gb.lk = S._lk;
      S.balls.push(gb);
    });
  }
  // ballistic hop: take-off centre height yb, lands onto the mass (slightly lower) at tc
  const hLow = (h) => ({ ...h, vy: h.vy * 0.8 });       // s3: trailing bead on a flatter arc
  function hopPos(h, r, tt) {
    const yb = FY - r * 0.92, yl = FY - 50;
    const x = lerp(h.x0, h.x1, tt / TH);
    const y = yb - h.vy * tt + 0.5 * GH * tt * tt + (yl - yb) * (tt / TH);
    const vx = (h.x1 - h.x0) / TH, vy = -h.vy + GH * tt + (yl - yb) / TH;
    return { x, y, vx, vy };
  }
  // floor beads get pulled into their owner as it gathers itself to jump (P4's at the big leap)
  crown.forEach((c) => {
    if (c.melt) return;
    const i = c.owner, d = drops[i];
    const tA = i === 3 ? cues.leap - 0.3 : hopOf(i).tTake - 0.14;
    c.follow = (t) => (d.x + Math.sign(c.xHit - d.x) * d.r * 1.2 - c.xHit) * flung(inv(tA, tA + 0.16, t));
    c.absorb = tA + 0.1;
    if (Math.abs(c.xHit - d.x) > 420) { c.follow = null; c.absorb = 99; }
  });
  const sat = { tSnap: hopOf(1).tTake + 0.13 };

  // ================= LEAP: the merged mass jumps, thread snaps, lands =================
  const tLeap = cues.leap, tApex = cues.apex, tImpact = 4.0;
  const GL = 3750;                                      // leap gravity (surface-tension jump reads floatier)
  const vLeap = GL * (tApex - tLeap);                 // apex exactly at tApex
  const massRLeap = 118, heroR = 132;
  const leapY0 = FY - massRLeap * 1.0;
  function sphereY(t) { const tt = t - tLeap; return leapY0 - vLeap * tt + 0.5 * GL * tt * tt; }
  const tThread = cues.thread_snap;
  const remR = 36;
  // impact crown: big spray that leads the flood
  const spray = [];
  for (let i = 0; i < 14; i++) {
    const side = i % 2 ? 1 : -1;
    spray.push({ x0: MX + side * rr(40, 260), y0: FY - rr(30, 90), vx: side * rr(80, 700), vy: rr(1500, 2700), r: rr(9, 26), u: rr(0.2, 0.9), t0: tImpact + rr(1, 3) / 30 });
  }

  // ================= FLOOD =================
  // round 1: three diagonal sheets launched from the impact point, alternating L->R / R->L / L->R; faster fronts and
  // earlier drain so full immersion lasts ~0.45 s
  const mkDir = (dx) => { const l = Math.hypot(dx, 1); return [dx / l, -1 / l]; };
  const dir = mkDir(0.42);                                   // violet (main) sheet: drives the blob reveal
  const aOf = (x, y) => x * dir[0] + y * dir[1];
  const bOf = (x, y) => -dir[1] * x + dir[0] * y;
  function sheet(delay, rdelay, u, amp, freq, ph0, lean, dx, dur = 0.46) {
    const d = dx === undefined ? dir : mkDir(dx);
    const A = (x, y) => x * d[0] + y * d[1], B = (x, y) => -d[1] * x + d[0] * y;
    const vis = [[220, 260], [1700, 260], [220, 1040], [1700, 1040]];
    const all = [[-40, -80], [1960, -80], [-40, 1200], [1960, 1200]];
    const aStart = Math.min(...vis.map(([x, y]) => A(x, y))) - 60, aImp = A(MX, FY - 20);
    const aEnd = Math.max(...all.map(([x, y]) => A(x, y))) + 330, aLow = Math.min(...all.map(([x, y]) => A(x, y))) - 400;
    const bs = all.map(([x, y]) => B(x, y)), bLo = Math.min(...bs) + 150, bHi = Math.max(...bs) - 150;
    const bump0 = Math.max(380, aImp - aStart + 170), bumpC = B(MX, FY);
    const t0 = tImpact + 0.035 + delay, t1 = t0 + dur;
    const r0 = cues.reveal_start + rdelay, r1 = r0 + 0.6;
    const frontAt = (t) => lerp(aStart, aEnd, frontEase(inv(t0, t1, t))) + 700 * smooth(inv(t1, t1 + 0.3, t));
    const backAt = (t) => lerp(aLow, aEnd + 260, inOut(inv(r0, r1, t)));
    return (t) => {
      if (t < t0 || t > r1 + 0.02) return { on: false, front: 0, back: 0, phase: 0, amp: 0, freq: 0, lean: 0, u };
      const front = frontAt(t), back = backAt(t);
      const bumpAt = (t) => bump0 * smooth(inv(t0 - 0.01, t0 + 0.13, t)) * (1 - smooth(inv(t0 + 0.1, t0 + 0.45, t)));  // s4: mound rises over ~4 f
      const bump = bumpAt(t);
      const vel = Math.max(Math.abs(frontAt(t + 1 / 60) - frontAt(t - 1 / 60)) + Math.abs(bumpAt(t + 1 / 60) - bumpAt(t - 1 / 60)),
        Math.abs(backAt(t + 1 / 60) - backAt(t - 1 / 60))) * 0.5 + 6;  // px per frame (+ wave travel)
      return { on: true, front, back, phase: ph0 + t * 5.2, amp, freq, lean, u, dx: d[0], dy: d[1], bump, bumpC, vel, bLo, bHi };
    };
  }
  const sheetV = sheet(0.0, 0.14, 0.9, 80, 0.0115, 0.3, 0.02, 0.42, 0.62);  // s4: slower front (peak diff /1.3)    // main field (violet) L->R, fuses with blobs
  const sheetO = sheet(0.07, 0.07, 0.06, 85, 0.0102, 2.1, -0.03, -0.55); // tangerine R->L
  const sheetP = sheet(0.14, 0.0, 0.46, 90, 0.0125, 4.4, 0.04, 0.3);     // hot pink L->R, top sheet (crisp)
  // droplets flung ahead of each sheet's front (coloured like their sheet, drawn in the main field)
  const lead = [];
  [[0.0, 0.88], [0.1, 0.08], [0.2, 0.48]].forEach(([delay, u], li) => {
    for (let i = 0; i < 7; i++) lead.push({ delay, u: u + rr(-0.05, 0.05), bf: rr(0.02, 0.98), ahead: rr(60, 220), r: rr(8, 22), ph: rr(0, 6) });
  });

  // ================= LOGO =================
  const L = word.letters;
  const letterU = [0.04, 0.26, 0.5, 0.86];
  const tSnap = cues.logo_snap;
  // blobs left behind by the receding violet sheet, one cluster per letter
  const clusters = L.map((l, i) => {
    const w = l.bbox[2] - l.bbox[0], h = l.bbox[3] - l.bbox[1];
    const cx = (l.bbox[0] + l.bbox[2]) / 2, cy = i === 1 || i === 2 ? (l.bbox[1] + l.bbox[3]) / 2 : (word.massY ?? word.baseY - 100);
    const main = [74, 52, 64, 64][i];
    return {
      i, cx, cy: i === 3 ? cy + 10 : cy, u: letterU[i],
      parts: [
        { dx: 0, dy: 0, r: main, sx: rr(-70, 70), sy: rr(-60, 20) },
        { dx: rr(-0.3, 0.3) * w, dy: -h * 0.28, r: main * 0.46, sx: rr(-120, 120), sy: rr(-150, -60) },
        { dx: rr(-0.3, 0.3) * w, dy: h * 0.22, r: main * 0.36, sx: rr(-120, 120), sy: rr(-40, 60) },
      ],
      tFree: 0,
    };
  });
  clusters.forEach((c) => {
    const aTop = aOf(c.cx, c.cy - c.parts[0].r) + 150;
    for (let tt = cues.reveal_start; tt < cues.reveal_start + 1.2; tt += 1 / 240) { const sh = sheetV(tt); if (sh.on && sh.back > aTop) { c.tFree = tt; break; } }
    if (!c.tFree) c.tFree = cues.reveal_start + 0.6;
  });
  // droplets thrown off the letters at the snap (secondary, 2-3 frames late)
  // the fused mass (6.2-6.4): four seed blobs squeezed into one horizontal bar centred on the x-height band
  const massY = word.massY ?? word.baseY - 100, SLOT = 0.55;   // v5 sets word.massY (CJK ink centre)
  const slotX = L.map((l) => 960 + (l.sx0 - 960) * SLOT);
  const MASS = { hx: 104, vy: 60 };                        // semi-axes of each slot's ellipse at the squat
  // r2 P1: on frames 189-191 the bar pinches three necks at the future letter gaps (each slot becomes a near-round bead)
  const hxP = slotX.map((x, i) => 0.5 * Math.min(i > 0 ? x - slotX[i - 1] : 1e9, i < 3 ? slotX[i + 1] - x : 1e9) * 0.96);
  const vyP = MASS.vy * 1.18;
  const snapDrops = [];
  for (let i = 0; i < 15; i++) {
    const li = i % 4, side = li < 2 ? (R() < 0.8 ? -1 : 1) : (R() < 0.8 ? 1 : -1);
    const x0 = lerp(L[li].bbox[0], L[li].bbox[2], rr(0.15, 0.85)), y0 = massY + rr(-60, 70), r = rr(4, 11);
    const T = rr(8, 14) / 30, dy = FY - r - y0, vy = (0.5 * G * T * T - dy) / T;
    snapDrops.push(makeDroplet({ x0, y0, vx: side * rr(260, 980), vy, r, u: letterU[li], tEmit: tSnap + rr(1, 2.2) / 30, tGrow: 0.03, melt: () => true, fy: rr(-4, 22) }));
  }
  // gooey bridges between neighbouring letters, stretched by the burst, snapping on the cue
  const tBridge = cues.letter_bridge_snap;
  const inkRow = (li, y, fromRight) => {
    const b = L[li].bbox;
    if (fromRight) { for (let x = Math.round(b[2]); x > b[0]; x--) if (word.sd(li, x, y) < -6) return x; }
    else { for (let x = Math.round(b[0]); x < b[2]; x++) if (word.sd(li, x, y) < -6) return x; }
    return fromRight ? b[2] : b[0];
  };
  const bridges = [0, 1, 2].map((i) => ({ i, j: i + 1, y: massY + [20, -10, 15][i], xa: inkRow(i, massY + [20, -10, 15][i], true) - 16, xb: inkRow(i + 1, massY + [20, -10, 15][i], false) + 16, r: [21, 18, 20][i] }));
  // hanging drips under letters (living micro-motion) + the hero drip from the p's descender
  const dripSpots = [
    { li: 0, fx: 0.40, len: 26, r: 10, t0: 7.0 },
    { li: 1, fx: 0.30, len: 16, r: 8, t0: 7.25 },
    { li: 2, fx: 0.52, len: 30, r: 11, t0: 7.1 },
  ].filter((d) => !(V5 && d.li === 1)).map((d) => {   // v5.1: 态's spot becomes the fat drip
    const l = L[d.li]; const x = lerp(l.bbox[0], l.bbox[2], d.fx);
    return { ...d, x, y: (word.bottomAt(d.li, x) ?? l.bbox[3]) - 4 };
  });
  const pL = L[3];
  let pxBest = (pL.bbox[0] + pL.bbox[2]) / 2, pyBest = -1;
  for (let x = pL.bbox[0]; x < pL.bbox[2]; x += 2) { const y = word.bottomAt(3, x); if (y !== null && y > pyBest) { pyBest = y; pxBest = x; } }
  // descender foot: find centre of the lowest run
  let x0r = pxBest, x1r = pxBest;
  while (word.bottomAt(3, x0r - 2) !== null && word.bottomAt(3, x0r - 2) >= pyBest - 3) x0r -= 2;
  while (word.bottomAt(3, x1r + 2) !== null && word.bottomAt(3, x1r + 2) >= pyBest - 3) x1r += 2;
  const hero = { x: (x0r + x1r) / 2, y: pyBest - 6, rMax: 25, tLand: cues.drip_land };
  // bulb position at snap, solve free fall so the drip lands exactly on the cue
  hero.ySnap = hero.y + 78; hero.vSnap = 240;
  { const dy = FY - hero.rMax * 1.1 - hero.ySnap; const tf = (-hero.vSnap + Math.sqrt(hero.vSnap ** 2 + 2 * G * dy)) / G; hero.tSnap = hero.tLand - tf; }
  hero.tStart = hero.tSnap - 0.85;
  // reel v5.1: the OUT hand-off is a fat glossy drop (>= 120 px across at the snap) that swells under 态's 心 hook
  // (x 760, where the next film's disc falls in), snaps at 8.27 and falls straight out through the bottom of the frame
  // (no puddle); the reel detaches it at ~8.35-8.45 while it is still falling on screen
  const fat = { x: 760, rMax: 64, tStart: 7.2, tSnap: 8.27, vSnap: 180, u: letterU[1] };
  fat.y = (word.bottomAt(1, fat.x) ?? L[1].bbox[3]) - 6;
  fat.ySnap = fat.y + 118;                                                     // bulb centre at the snap
  fat.at = (tt) => fat.ySnap + fat.vSnap * tt + 0.5 * G * tt * tt;
  fat.tFloor = fat.tSnap + (-fat.vSnap + Math.sqrt(fat.vSnap ** 2 + 2 * G * (FY - fat.ySnap))) / G;   // passes the floor line
  const splat = [];
  for (let i = 0; i < 4; i++) {
    const side = i % 2 ? 1 : -1;
    splat.push(makeDroplet({ x0: hero.x + side * rr(10, 30), y0: FY - 10, vx: side * rr(120, 330), vy: rr(260, 520), r: rr(3, 5.5), u: 0.84, tEmit: hero.tLand + 2 / 30, tGrow: 0.05 }));
  }
  // time each sheet's front / back edge crosses the frame centre (for sound transients)
  const aC = aOf(960, 560);
  const crossT = (fn, key) => { for (let tt = 3.9; tt < 6.2; tt += 1 / 240) { const sh = fn(tt); if (sh.on && sh[key] > aC) return tt; } return null; };
  const sheetCross = [sheetV, sheetO, sheetP].map((fn) => ({ in: crossT(fn, 'front'), out: crossT(fn, 'back') }));
  const floodBub = [];
  for (let i = 0; i < 30; i++) floodBub.push({ x: rr(260, 1660), y0: rr(560, 1120), sp: rr(240, 520), r: rr(1.6, 4.6), t0: rr(4.14, 4.62), dur: rr(0.45, 0.8), wob: rr(3, 10), wf: rr(8, 16), ph: rr(0, 6) });
  // soda carbonation: bubbles rising inside the letter stems, popping at the top
  const bubbles = [];
  L.forEach((l, li) => {
    const cols = [];
    for (let x = l.bbox[0] + 6; x < l.bbox[2] - 6; x += 3) {
      let y = l.bbox[3] - 4, bottom = null, top = null;
      for (; y > l.bbox[1]; y -= 2) { const d = word.sd(li, x, y); if (d < -9) { if (bottom === null) bottom = y; top = y; } else if (bottom !== null) break; }
      if (bottom !== null && bottom - top > 90) cols.push({ x, bottom, top });
    }
    for (let j = 0; j < 7 && cols.length; j++) {
      const c = cols[Math.floor(R() * cols.length)];
      bubbles.push({ li, x: c.x, y0: c.bottom - 4, y1: c.top + 10, sp: rr(38, 62), r: rr(3.4, 7.2), ph: R(), t0: tSnap + 0.35 + rr(0, 0.9), wob: rr(1.5, 3.5), wf: rr(5, 9) });
    }
  });
  const KICKS = [7.2, 7.4, 8.0];
  const JELLY_HITS = [[7.2, 0.07, 1], [7.6, 0.035, 1], [8.0, 0.05, 1], [8.4, 0.045, -1], [8.8, 0.03, 1], [9.2, 0.018, 1]];                       // half-time snare 7.2, kicks 7.4 / 8.0 in the drop
  window.__cuesOut = {
    sheetCross, jelly: [7.2, 8.0],
    drip_snap: hero.tSnap, drip_land: hero.tLand, heroX: hero.x,
    crown: crown.map((c) => ({ t: c.tHit, x: c.xHit, r: c.r, melt: c.melt })),
    snapDrops: snapDrops.map((c) => ({ t: c.tHit, x: c.xHit, r: c.r })),
    splat: splat.map((c) => ({ t: c.tHit, x: c.xHit, r: c.r })),
    clusterFree: clusters.map((c) => c.tFree), satSnap: sat.tSnap, impact: tImpact,
  };

  // =====================================================================
  return function film(t) {
    const S = baseState(t);
    S.floorY = FY; S.horizon = HOR;
    if (V5) S.lnk = {};
    // v5.1 grade (shader #define V5): the set sinks to near-black plum during the gather / held breath, the title liquid
    // (lighter body, brighter diffuse, hotter speculars; 动 violet -> bright pink-violet) switches on under the split flash
    if (V5) { const lift = smooth(inv(tSnap - 1 / 60, tSnap + 1.5 / 30, t));
      // w: the fat drip falls in front of the set, so its floor reflection fades out once it lets go (band around its x)
      S.v5 = [smooth(inv(6.05, 6.38, t)), lift, lift, smooth(inv(fat.tSnap, fat.tSnap + 0.1, t))]; S.v5b = [fat.x, 130, 0, 0]; }

    // ---------------- camera ----------------
    const cz = camAt(t);
    let punch = 0.016 * wob(t - tImpact, 3.0, 0.2);
    drops.forEach((d, i) => { punch += (i === 3 ? 0.022 : 0.013) * wob(t - d.tLand, 3.2, 0.16); });
    let zmul = 1;
    if (t >= tSnap) {
      const ts = t - tSnap;
      zmul = ts < 2 / 30 ? lerp(1, 1.07, outSoft(ts * 15)) : ts < 14 / 30 ? lerp(1.07, 1.02, inOut(inv(2 / 30, 14 / 30, ts))) : 1.02;  // s4: harder punch
      zmul += 0.045 * (0.5 - 0.5 * Math.cos(PI * inv(tSnap + 14 / 30, 10.0, t)));   // r2 P3: push to ~1.065    // easeInOutSine push
    }
    S.cam = { zoom: cz[0] * (1 + punch) * zmul, px: cz[1], py: cz[2] - 60 * (zmul - 1), ox: 0, oy: 0 };

    // ---------------- goo ----------------
    S.k = 0.1;
    if (t > 5.2) S.k = lerp(0.062, 0.105, smooth(inv(tSnap, tSnap + 0.2, t)));
    if (t > 5.2 && t < 5.9) S.k = lerp(0.1, 0.062, smooth(inv(5.2, 5.9, t)));

    // ================= POUR (P1) =================
    const P1 = drops[0];
    const tPS = cues.pour_snap;
    const pourGeo = (tt) => {
      const bottom = 454 + 45 * tt + 2500 * tt * tt, v = 45 + 5000 * tt;
      const neckPull = tt < tPS ? Math.pow(tt / tPS, 1.6) : 0;
      const sv = 1 + 0.26 * clamp(v / 2045) + 0.16 * neckPull;
      const cy = bottom - P1.r * sv, top = cy - P1.r * sv * 0.82;
      return { bottom, v, neckPull, sv, cy, top, pinchY: top - 34 - 30 * neckPull };
    };
    if (t < P1.tLand) {
      const bottom = 454 + 45 * t + 2500 * t * t, v = 45 + 5000 * t;
      const neckPull = t < tPS ? Math.pow(t / tPS, 1.6) : 0;
      const sv = 1 + 0.26 * clamp(v / 2045) + 0.16 * neckPull;
      const cy = bottom - P1.r * sv;
      tag(S, ['dot'], 'dot', 1, 'pour bulb (macro drop, ball lens)');
      ball(S, P1.x, cy, P1.r, P1.u, sv);
      tag(S, ['dot']);
      // round 1: the bulb is a ball lens — a small inverted 'drop' wordmark is refracted inside it (logo in frame 1)
      const wb = word.bbox, ww = wb[2] - wb[0];
      S.lens = [P1.x, cy, P1.r / sv, P1.r * sv, (wb[0] + wb[2]) / 2 - word.offX, (wb[1] + wb[3]) / 2 - word.offY, ww / 0.92, 0.72 * (1 - smooth(inv(0.25, 0.35, t)))];
      if (t < tPS) {
        // stretched neck: thick thread from above thinning into a pinch just above the bulb
        const top = cy - P1.r * sv * 0.82;
        const pinchY = top - 34 - 30 * neckPull;
        untag(S); seg(S, P1.x, -90, P1.x, pinchY, 25, lerp(8, 1.2, neckPull), P1.u + 0.02); tag(S, ['dot']);
        seg(S, P1.x, pinchY, P1.x, top + 8, lerp(8, 1.2, neckPull), lerp(16, 12, neckPull), P1.u);
      } else {
        // lower stub recoils into the bulb (2-3 frame rebound) — teardrop tail
        const k = spring(t - tPS, 7, 0.45);
        const top = cy - P1.r * sv * 0.8;
        const len = 42 * (1 - k);
        if (len > 1) seg(S, P1.x, top - len, P1.x, top + 6, 3.5 * (1 - k) + 1, 13, P1.u);
        ball(S, P1.x, top - len, 5 * (1 - k * 0.8), P1.u);
      }
      untag(S);
    }
    if (t >= tPS && t < 1.4) {
      // upper thread: snaps back up with overshoot, then the pour is pulled out of frame
      const endSnap = pourGeo(tPS - 1e-4).pinchY;
      const k = spring(t - tPS, 5.5, 0.32);
      const end = endSnap - 58 * k - 1500 * easeIn(inv(0.34, 1.2, t));
      if (end > -80) {
        seg(S, P1.x, -90, P1.x, end, 25 - 6 * inv(0.3, 1.2, t), 7 + 3 * k, P1.u + 0.02);
        ball(S, P1.x, end, 9 + 3 * k, P1.u + 0.02);
      }
    }

    // ================= drops falling, landing, hopping =================
    drops.forEach((d, i) => {
      if (i === 0 && t < d.tLand) return;
      if (t < d.tLand) {
        const tau = d.tLand - t, vL = 2500, Gd = 4200;
        if (tau > 0.52) return;
        const bottom = FY - vL * tau + 0.5 * Gd * tau * tau, v = vL - Gd * tau;
        const sv = 1 + 0.30 * clamp(v / vL);
        const cy = bottom - d.r * sv;
        if (i === 3) tag(S, ['dot'], 'dot', 1, 'falling drop P4 (becomes the mass)');
        ball(S, d.x, cy, d.r, d.u, sv);
        if (i === 3) tag(S, ['dot']);
        const lag = 0.03 * v;
        ball(S, d.x, cy - d.r * sv * 0.9 - lag, d.r * 0.32, d.u, 1.3);
        seg(S, d.x, cy - d.r * 0.3, d.x, cy - d.r * sv * 0.9 - lag, d.r * 0.5, d.r * 0.18, d.u);
        untag(S);
        return;
      }
      if (t >= 4.0) return;
      const tl = t - d.tLand;
      if (i === 3 && t <= tLeap - 0.25) tag(S, ['dot']);   // v5: P4's own crown goes with the dot
      // crown arms
      tendrils[i].forEach((w) => {
        const a = tendrilState(d, w, tl); if (!a || a.len < 1) return;
        seg(S, a.bx, a.by, a.mx, a.my, a.ra, a.rm, d.u); seg(S, a.mx, a.my, a.tx, a.ty, a.rm, a.rt, d.u);
        if (a.bead > 0.5) ball(S, a.tx + Math.sin(w.ang) * a.bead * 0.8, a.ty - Math.cos(w.ang) * a.bead * 0.8, a.bead, d.u, 1.12, w.ang - PI / 2);
      });
      untag(S);
      if (i === 3) {
        if (t > tLeap - 0.25) return;   // the mass is handled by the leap block
        const r = massR(t);
        let sv = svLand(d, tl);
        for (const h of hops) sv += 0.16 * wob(t - h.tc, 3.6, 0.2);
        tag(S, ['dot'], 'dot', 1, 'the mass: P4 puddle swallowing the hoppers (flat lens)');
        ball(S, MX + massShift(t), FY - r * sv + 1.0, r, d.u, sv);
        tag(S, ['dot']);
        ghosts(S, t, MX + massShift(t), FY - r * sv + 1.0, r, sv);
        untag(S);
        return;
      }
      const h = hopOf(i);
      const r = d.r;
      // trailing secondary droplet: same arc, 3 frames late, a third of the size
      const emitHopper = (rs, delay, uOff) => {
        const tt = t - delay - h.tTake, rr_ = r * rs;
        if (V5 && i === 1 && rs === 1 && tt >= 0) tag(S, ['hop'], 'hop', tt < TH ? 1 : 1 - smooth(inv(0, 0.12, t - delay - h.tc)), 'hopper P2 (ballistic blob merging into the mass)');
        const res = hopBody(rs, tt, rr_, uOff, delay);
        untag(S);
        return res;
      };
      const hopBody = (rs, tt, rr_, uOff, delay) => {
        if (tt < -0.1) {                                      // resting puddle
          if (rs < 1) return;                               // bead is part of the puddle until it launches
          const sv = svLand(d, tl);
          ball(S, h.x0, FY - rr_ * sv + 1, rr_, d.u, sv);
          return;
        }
        if (tt < 0) {                                        // anticipation: squat, gather toward the jump
          const k = inv(-0.1, 0, tt);
          const sv = lerp(rs < 1 ? 0.62 : SV_PUD, 0.40, smooth(k));
          const x = rs < 1 ? h.x0 - h.side * r * 1.25 : h.x0 + h.side * 8 * k;
          ball(S, x, FY - rr_ * sv + 1, rr_, d.u + uOff, sv);
          return;
        }
        if (tt < TH) {                                       // flight
          const P = hopPos(rs < 1 ? hLow(h) : h, rr_, tt);
          const sp = Math.hypot(P.vx, P.vy);
          let sv = 1 + 0.26 * Math.min(1, sp / 1400) + 0.35 * Math.exp(-tt / 0.05);
          sv = lerp(sv, 0.74, smooth(inv(TH - 0.06, TH, tt)));      // s3: flattens against the host on the way in
          ball(S, P.x, P.y, rr_, d.u + uOff, sv, Math.atan2(P.vy, P.vx));
          if (tt < 0.09 && rs === 1) {                        // take-off neck to the floor, snapping
            const k = tt / 0.09;
            seg(S, h.x0, FY - 6, lerp(h.x0, P.x, 0.5), lerp(FY - 6, P.y, 0.5), lerp(rr_ * 0.5, 8, k), lerp(rr_ * 0.4, 0.6, k), d.u);
          }
          return;
        }
        const tm = t - delay - h.tc;                        // merging into the mass
        // round 1: contact squash to 0.6 h in 2 f, sink into the host over 4-5 f (no head-and-beak bump on top), and a
        // bump travelling across the host's top (~33 px/frame)
        const k = smooth(inv(0, 0.15, tm)), ks = smooth(inv(0, 0.05, tm)), kd = smooth(inv(0.0, 0.15, tm));
        const P = hopPos(rs < 1 ? hLow(h) : h, rr_, TH);
        const x = lerp(P.x, MX + massShift(t), k * 0.8), y = lerp(P.y + rr_ * 0.35 * ks, FY - massR(t) * 0.42, kd);
        const rm = rr_ * Math.sqrt(1 - k);
        ball(S, x, y, rm, d.u + uOff, lerp(0.74, 0.55, ks) * (1 - 0.1 * k));
        if (rs === 1 && tm > 0.02 && tm < 0.2) {
          const kb = inv(0.02, 0.2, tm);
          ball(S, lerp(P.x, MX - h.side * 90, kb) + massShift(t), P.y + rr_ * 0.45 + 6 * kb, rr_ * 0.55 * Math.sin(PI * kb), d.u + uOff, 0.7);
        }
      };
      emitHopper(1, 0, 0);
      emitHopper(0.27, 0.17, 0.03);
      // P2: thread from the trailing bead to the jumping puddle stretches and snaps (2-3 frame rebound)
      if (i === 1) {
        const tt = t - h.tTake;
        if (V5) tag(S, ['hop']);
        if (tt > 0 && tt < 0.4) {
          const P = hopPos(h, r, Math.min(tt, TH));
          const bx = h.x0 - h.side * r * 1.25, by = FY - r * 0.34 * 0.5;
          if (t < sat.tSnap) {
            const k = inv(h.tTake, sat.tSnap, t);
            const mx = lerp(bx, P.x, 0.5), my = lerp(by, P.y, 0.5) + 10;
            const rm = lerp(6, 0.6, Math.pow(k, 0.8));
            seg(S, bx, by, mx, my, 7, rm, d.u + 0.03);
            seg(S, mx, my, P.x - h.side * -r * 0.3, P.y + r * 0.3, rm, 10, d.u);
          } else {
            const k = spring(t - sat.tSnap, 7, 0.4);
            const f = 0.45 * (1 - k);
            if (f > 0.02) {
              seg(S, bx, by, lerp(bx, P.x, f), lerp(by, P.y, f), 6, 2.5, d.u + 0.03);
              seg(S, P.x, P.y + r * 0.4, lerp(P.x, bx, f), lerp(P.y, by, f), 9, 2.5, d.u);
            }
          }
        }
        untag(S);
      }
    });
    // crown droplets / beads
    crown.forEach((c) => { if (t < 4.05) { if (c.owner === 3) tag(S, ['dot']); emitDroplet(S, c, t); untag(S); } });

    // ================= LEAP =================
    if (t >= tLeap - 0.25 && t < tImpact + 0.3) {
      const u = 0.36;
      if (t < tLeap) {
        // anticipation: gather into a dome, then a quick squat
        const k = inOut(inv(tLeap - 0.25, tLeap - 0.07, t));
        let sv = lerp(SV_PUD, 0.86, k);
        sv = lerp(sv, 0.55, smooth(inv(tLeap - 0.08, tLeap, t)));
        const r = lerp(massR(t), massRLeap, k);
        tag(S, ['dot'], 'dot', 1, 'the mass gathering into a dome');
        ball(S, MX, FY - r * sv + 1, r, u, sv);
        tag(S, ['dot']);
        ghosts(S, t, MX, FY - r * sv + 1, r, sv);
        untag(S);
      } else if (t < tImpact) {
        const tt = t - tLeap;
        const y = sphereY(t);
        const vy = -vLeap + GL * tt;
        const r = lerp(massRLeap, heroR, smooth(inv(tLeap, tApex, t)));
        let sv = 1 + 0.36 * Math.exp(-tt / 0.12) * Math.cos(tt * 18) + 0.10 * wob(tt - 0.08, 3.4, 0.35) + 0.14 * smooth(inv(tApex + 0.1, tImpact, t));
        // s3 P8: +-5 % jelly wobble at 3 Hz around the apex
        sv += 0.05 * Math.sin(2 * PI * 3 * (t - tApex)) * smooth(inv(tApex - 0.35, tApex - 0.12, t)) * (1 - smooth(inv(tApex + 0.2, tApex + 0.32, t)));
        // s3 P8: the four palette colours swirl through the interior as 3-4 curling bands (shader uSw)
        S.sw = [MX, y, r * 1.02, 0.82 * smooth(inv(tLeap + 0.04, tLeap + 0.3, t)) * (1 - smooth(inv(tImpact - 0.03, tImpact + 0.02, t)))];
        tag(S, ['dot'], 'dot', 1, 'hero sphere leaping (swirl bands inside)');
        ball(S, MX, y, r, u, sv);
        tag(S, ['dot']);
        ghosts(S, t, MX, y, r * 0.95, sv);
        // jelly wobble lobes (surface modes)
        const wa = 0.5 + 0.5 * Math.exp(-tt / 0.4);
        for (let j = 0; j < 3; j++) {
          const ang = j * 2.1 + tt * (1.6 + j * 0.4);
          ball(S, MX + Math.cos(ang) * r * 0.55, y + Math.sin(ang) * r * 0.55, r * 0.42 * wa, u + 0.04 * (j - 1), 1);
        }
        untag(S);
        // remnant puddle + stretched thread
        const remSv = 0.5 + 0.25 * wob(t - tThread, 6, 0.2);
        const remR2 = remR * (1 - smooth(inv(tImpact - 0.08, tImpact, t)));
        ball(S, MX, FY - remR2 * remSv + 1, remR2, u + 0.05, remSv);
        const sb = y + r * sv * 0.85, rt = FY - remR2 * remSv * 1.6;
        if (t < tThread) {
          const k = inv(tLeap, tThread, t);
          const my = lerp(sb, rt, 0.55);
          const rm = lerp(14, 0.7, Math.pow(k, 0.9));
          tag(S, ['dot']); seg(S, MX, sb - 10, MX, my, lerp(38, 16, k), rm, u); untag(S);
          seg(S, MX, my, MX, rt + 6, rm, lerp(22, 12, k), u + 0.04);
        } else {
          const k = spring(t - tThread, 6.5, 0.36);
          const up = (rt - sb) * 0.45 * (1 - k);
          if (up > 2) {
            tag(S, ['dot']); seg(S, MX, sb - 8, MX, sb + up, 14, 3, u); untag(S);
            seg(S, MX, rt - up, MX, rt + 6, 3, 12, u + 0.04);
            ball(S, MX, rt - up, 4, u + 0.04);
          }
        }
      } else {
        // impact: splat that feeds the rising flood
        const tl = t - tImpact;
        const sv = 1.15 + (0.3 - 1.15) * spring(tl, 5, 0.5);
        const drain = 1 - smooth(inv(0.05, 0.19, tl));             // s4: splat drains into the flood (no ellipse outline under the sheets)
        tag(S, ['dot'], 'dot', drain, 'impact splat draining into the flood');
        if (drain > 0.02) ball(S, MX, FY - heroR * sv * drain, heroR * (1 + 0.3 * smooth(inv(0, 0.2, tl))) * drain, 0.4, sv);
        untag(S);
      }
    }
    // impact spray
    spray.forEach((d) => {
      if (t < d.t0 || t > 5.0) return;
      const tt = t - d.t0;
      const x = d.x0 + d.vx * tt, y = d.y0 - d.vy * tt + 0.5 * G * tt * tt;
      const vy = -d.vy + G * tt;
      const r = d.r * smooth(inv(0, 0.05, tt));
      ball(S, x, y, r, d.u, 1 + Math.min(0.5, Math.hypot(d.vx, vy) / 5000), Math.atan2(vy, d.vx));
    });

    // ================= FLOOD =================
    S.flood = { on: false, front: 0, back: 0, phase: 0, amp: 0, freq: 0, lean: 0, u: 0 };
    const shV = sheetV(t);
    S.overlays = [shV, sheetO(t), sheetP(t)];
    // droplets leading each front
    lead.forEach((d) => {
      const sh = [sheetV, sheetO, sheetP][d.delay === 0 ? 0 : d.delay < 0.15 ? 1 : 2](t);
      if (!sh.on) return;
      const t0 = tImpact - 0.03 + d.delay;
      const tt = t - t0;
      if (tt < 0.05 || tt > 0.6) return;
      const b = lerp(sh.bLo, sh.bHi, d.bf);
      const ahead = d.ahead * Math.sin(PI * inv(0.05, 0.6, tt));
      const a = sh.front + ahead + 60;
      const x = a * sh.dx - b * sh.dy, y = a * sh.dy + b * sh.dx;
      ball(S, x, y, d.r * Math.sin(PI * inv(0.05, 0.6, tt)), d.u, 1.35, Math.atan2(sh.dy, sh.dx));
    });

    // ================= LOGO BLOBS (left behind by the violet sheet) =================
    const tRevealV = cues.reveal_start;           // violet back edge starts rising
    if (t > 4.12 && t < tSnap) {
      const fk = inOut(inv(tSnap - 0.3, tSnap - 1 / 30, t));            // fuse into the bar
      const squat = smooth(inv(tSnap - 0.2, tSnap - 1 / 30, t));
      clusters.forEach((c) => {
        const tFree = c.tFree;
        const gk = flung(inv(tFree - 0.05, tSnap - 0.2, t));     // gather
        const squeeze = smooth(inv(tSnap - 0.22, tSnap - 0.02, t));
        const vanish = smooth(inv(tSnap - 0.01, tSnap + 0.11, t));
        c.parts.forEach((p, j) => {
          const lagk = flung(inv(tFree - 0.05 + j * 0.08, tSnap - 0.2 + j * 0.03, t));  // secondary blobs 2-3 frames late
          const k = j === 0 ? gk : lagk;
          let x = c.cx + lerp(p.sx + p.dx, p.dx * 0.25, k);
          let y = c.cy + lerp(p.sy + p.dy, p.dy * 0.25, k);
          // tug upward by the receding sheet, then rebound
          const tug = t < tFree ? 1 : 0;
          const reb = t >= tFree ? wob(t - tFree, 3.2, 0.22) : 0;
          y += -30 * tug * inv(tFree - 0.3, tFree, t) - 22 * reb;
          let r = p.r * (1 - 0.14 * squeeze * 0) * (1 - vanish * 0);
          // round 1: the seeds are the subject of the immersion — they condense inside the violet sheet once its front
          // has passed, and drift up toward their letter slots, seen backlit through the sheets above
          if (t < tFree) {
            const shv = sheetV(t);
            r *= shv.on ? smooth(inv(0, 220, shv.front - aOf(c.cx, c.cy))) : 0;
            const pre = 1 - smooth(inv(4.12, tFree, t));
            x += (p.sx * 1.3 + (c.i - 1.5) * 70) * pre; y += 190 * pre;
          }
          let sv = 1 + 0.35 * tug * inv(tFree - 0.3, tFree, t) - 0.18 * reb - 0.16 * squeeze;
          if (fk > 0) {
            const hx0 = r / sv, vy0 = r * sv;
            const tx = slotX[c.i] + (j ? p.dx * 0.1 : 0), ty = massY;
            x = lerp(x, tx, fk); y = lerp(y, ty, fk);
            let hx = j ? hx0 * (1 - fk) : lerp(hx0, MASS.hx * (1 + 0.06 * squat), fk), vy = j ? vy0 * (1 - fk) : lerp(vy0, MASS.vy * (1 - 0.15 * squat), fk);
            const pn = inOut(inv(tSnap - 3.5 / 30, tSnap - 0.6 / 30, t));   // r2: pinch the necks
            if (!j && pn > 0) { hx = lerp(hx, hxP[c.i], pn); vy = lerp(vy, vyP, pn); }
            if (hx < 0.5) return;
            r = Math.sqrt(hx * vy); sv = Math.sqrt(vy / hx);
          }
          if (V5 && j === 0) {
            const lk = [];
            if (c.i === 3 && fk < 0.5) lk.push('dot');
            if (fk > 0) lk.push('bar');
            if (lk.length) tag(S, lk, c.i === 3 && fk < 0.5 ? 'dot' : null,
              lerp(0.4, 1, smooth(inv(tFree - 0.15, tFree + 0.05, t))) * (1 - smooth(inv(0.1, 0.5, fk))), 'seed blob of 动 (freed by the violet sheet)');
            if (fk > 0) S.lnk.bar = { a: smooth(inv(0.35, 0.8, fk)), note: 'fused liquid bar that splits into the title' };
          }
          if (V5 && j > 0) {   // the seed's satellite lobes go with it (and with the bar while fusing)
            const lk = [];
            if (c.i === 3 && fk < 0.5) lk.push('dot');
            if (fk > 0) lk.push('bar~');   // '~' = hidden with the bar, not part of its reported geometry
            if (lk.length) tag(S, lk);
          }
          ball(S, x, y, r, c.u, sv);
          if (S.lnk && j === 0 && !(c.i === 3 && fk < 0.5)) untag(S);
          if (S.lnk && j === 0 && c.i === 3 && fk < 0.5) S._main = null;
          if (j === 0 && t < tFree + 0.02 && t > tFree - 0.35) {
            // neck to the receding sheet above
            const sh = sheetV(t);
            if (sh.on) {
              const k2 = inv(tFree - 0.35, tFree, t);
              const topY = y - r * sv * 0.8;
              const edgeY = topY - lerp(20, 130, k2);
              const rm = lerp(18, 0.6, Math.pow(k2, 0.8));
              seg(S, x, topY + 6, x + 4, (topY + edgeY) / 2, lerp(26, 12, k2), rm, c.u);
              seg(S, x + 4, (topY + edgeY) / 2, x + 6, edgeY - 40, rm, lerp(30, 16, k2), 0.85);
            }
          }
          untag(S);
        });
      });
    }

    // ================= LETTERS =================
    // letterless until the drop. On frame 192 the bar splits: each slot's ellipse morphs into its letter SDF over 3 frames
    // (1-frame stagger L->R) while the letters are flung out to their places on a spring (overshoot 112% w / 92% h).
    if (t >= tSnap) {
      const ts = t - tSnap;
      const pos = [];
      L.forEach((l, i) => {
        // r2 P1 "split, don't grow": the word unfolds about (960, massY) from the bar (glyph scale = spacing scale, so glyphs
        // never overlap); each letter is born from its bead in 2 f (0.6 f stagger) -> frame 194 reads 'drop'
        const tl = ts;                                       // one shared unfold (a stagger would let o run into p)
        const m = clamp((ts * 30 - 0.6 * i + 1.5) / 2);
        const P = tl > 0 ? spring(tl, 4, 0.35) : 0;
        const x = 960 + (l.sx0 - 960) * lerp(SLOT, 1, P);
        const gs = lerp(SLOT, 1, P <= 1 ? P : 1 + 0.25 * (P - 1));
        const sq = m * smooth(clamp((P - 0.95) / 0.36));   // 112 % w / 92 % h about the letter's own centre, once apart
        // r2 s2 P3: the jelly word answers the groove: a wobble wave on each beat of the outro, L->R (R->L from the p when
        // the drip lands at 8.40), decaying toward the final hold -> the end card has events, not just slow drift
        let jelly = 0;
        for (const [tk, ak, dk] of JELLY_HITS) jelly += ak * wob(t - tk - (dk > 0 ? i : 3 - i) * 0.04, 3.4, 0.22);
        const breathe = 0.025 * Math.sin(2 * PI * 0.7 * (t - 6.9) - i * PI / 2) * smooth(inv(6.9, 7.6, t));   // r2 P3: +-2.5 %
        const sxJ = 1 + 0.12 * sq + jelly + breathe, syJ = 1 - 0.08 * sq + breathe - jelly * 0.6;
        let dy = tl > 0 ? -18 * (1 - spring(tl, 3.4, 0.45)) * m : 0;
        if (V5 && i === 1) dy += t < fat.tSnap ? 5 * smooth(inv(7.5, fat.tSnap, t)) : 5 * (1 - spring(t - fat.tSnap, 3.2, 0.28));   // v5.1
        const gooWob = 3.2 * Math.exp(-Math.max(0, tl) / 0.35) + 0.9 + 0.5 * smooth(inv(6.9, 7.5, t));   // r2 s2: livelier skin
        const yc = massY + (l.sy0 - massY) * gs + dy;
        const y = yc + (1 - syJ) * (l.bbox[3] - l.sy0) * 0.9 * gs;
        pos.push({ x, y: yc, gs });
        S.letters.push({
          x, y, px: l.px, py: l.py, grow: 3 * (1 - smooth(inv(0, 0.15, Math.max(0, tl)))), u: letterU[i], sx: gs * sxJ, sy: gs * syJ,
          a: tl > 0 ? 0.012 * wob(tl, 2.4, 0.4) * (i % 2 ? 1 : -1) : 0, on: true, m: Math.max(1e-3, m), wob: gooWob, wph: t * 7.0 + i * 1.7,
          ell: [x, massY + dy, hxP[i] * (1 + 0.4 * m), vyP * (1 + 0.4 * m)],
        });
      });
      // r2: the three necks thin and snap L->R one frame apart (between frames 192/193, 193/194, 194/195); stubs recoil
      bridges.forEach((br) => {
        const Pa = pos[br.i], Pb = pos[br.j], la = L[br.i], lb = L[br.j];
        const A = [Pa.x + (br.xa - la.sx0) * Pa.gs, Pa.y + (br.y - la.sy0) * Pa.gs];
        const B = [Pb.x + (br.xb - lb.sx0) * Pb.gs, Pb.y + (br.y - lb.sy0) * Pb.gs];
        const tBr = tSnap + (br.i + 0.5) / 30;
        if (t < tBr) {
          const k = inv(tSnap, tBr, t);
          const rm = lerp(br.r * 0.85, 1.0, Math.pow(k, 0.6));
          const M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2 + 6 * k];
          const ra = br.r * 1.1 * Pa.gs;
          seg(S, A[0], A[1], M[0], M[1], ra, rm, letterU[br.i]); seg(S, M[0], M[1], B[0], B[1], rm, ra, letterU[br.j]);
        } else if (t < tBr + 0.3) {
          const tt = t - tBr, k = spring(tt, 7, 0.35);
          const half = [(B[0] - A[0]) / 2, (B[1] - A[1]) / 2];
          const ra = br.r * (1 - 0.5 * smooth(inv(0, 0.25, tt)));
          seg(S, A[0], A[1], A[0] + half[0] * (1 - k) * 0.8, A[1] + half[1] * (1 - k) + 6, ra, 2.5 + 3 * (1 - k), letterU[br.i]);
          seg(S, B[0], B[1], B[0] - half[0] * (1 - k) * 0.8, B[1] - half[1] * (1 - k) + 6, ra, 2.5 + 3 * (1 - k), letterU[br.j]);
        }
      });
      snapDrops.forEach((d) => emitDroplet(S, d, t));
    }
    // hanging drips (grow slowly, never fall) — living hold
    dripSpots.forEach((d) => {
      if (t < d.t0) return;
      const k = outSoft(inv(d.t0, 10.2, t));
      const len = d.len * k, r = d.r * (0.4 + 0.6 * smooth(inv(d.t0, d.t0 + 0.6, t)));
      const sway = 1.5 * Math.sin(t * 3 + d.li);
      if (len + r < 3) return;
      seg(S, d.x, d.y - 8, d.x + sway * 0.5, d.y + len, r * 1.25, r * 0.55, letterU[d.li]);
      ball(S, d.x + sway, d.y + len + r * 0.35, r * (0.6 + 0.4 * k), letterU[d.li], 1.12);
    });
    // v5.1: fat drip under 态 (the dot's OUT): swell 7.2-8.27, neck thins and snaps 8.27, free fall out of the frame
    if (V5 && t > fat.tStart) {
      const u = fat.u;
      if (t < fat.tSnap) {
        const k = inv(fat.tStart, fat.tSnap, t), sag = easeIn(k);
        const br = fat.rMax * (0.25 + 0.75 * smooth(inv(0, 0.85, k)));
        const sv = 1 + 0.12 * sag;
        const by = lerp(fat.y + br * 0.95, fat.ySnap, sag);   // beads up under the stroke, then sags on a lengthening neck
        const top = by - br * sv * 0.8, A = fat.y - 12, M = (A + top) / 2;
        const rn = lerp(26, 2.5, Math.pow(inv(0.55, 1, k), 1.4));
        tag(S, ['dot']);
        if (top > A + 4) { seg(S, fat.x, A, fat.x, M, 30, rn, u); seg(S, fat.x, M, fat.x, top, rn, br * 0.6, u); }
        tag(S, ['dot'], 'dot', smooth(inv(0, 0.2, k)), 'fat drip swelling under 态 (OUT: snaps 8.27, falls out of frame)');
        ball(S, fat.x, by, br, u, sv);
        untag(S);
      } else {
        const tt = t - fat.tSnap, y = fat.at(tt), v = fat.vSnap + G * tt;
        if (y - fat.rMax * 1.3 < 1250) {
          const sv = 1 + 0.12 * Math.exp(-tt / 0.12) * Math.cos(2 * PI * 6 * tt) + 0.06 * clamp(v / 2500);   // teardrop -> round, jiggles
          tag(S, ['dot'], 'dot', 1, 'fat drip falling from 态 (out through the bottom edge)');
          ball(S, fat.x, y, fat.rMax, u, sv);
          tag(S, ['dot']);
          const len = 46 * (1 - spring(tt, 7, 0.45));                             // the snapped tail recoils into the drop
          if (len > 1) seg(S, fat.x, y - fat.rMax * sv - len, fat.x, y - fat.rMax * 0.6, 3, 16, u);
          untag(S);
        }
        if (tt < 0.6) {                                                           // stub on 态 recoils (rebound)
          const k = spring(tt, 6, 0.33), len = 44 * (1 - k) + 3;
          seg(S, fat.x, fat.y - 10, fat.x, fat.y + len, 24, 5 + 4 * (1 - k), u);
        }
        if (t > fat.tFloor) S.tagRev = { x: fat.x, y: FY, age: t - fat.tFloor, amp: 1 };   // tagline wipes in in its wake
      }
    }
    // hero drip from the p descender
    if (!V5 && t > hero.tStart) {
      const u = letterU[3];
      if (t < hero.tSnap) {
        const k = inv(hero.tStart, hero.tSnap, t);
        const kk = easeIn(k);
        const by = lerp(hero.y + 8, hero.ySnap, kk);
        const br = hero.rMax * (0.35 + 0.65 * smooth(inv(0, 0.55, k)));
        const neckY = lerp(hero.y + 6, by - br * 0.9, 0.5);
        const rn = lerp(16, 2.2, Math.pow(inv(0.35, 1, k), 1.2));
        seg(S, hero.x, hero.y - 10, hero.x, neckY, 22, rn, u);
        tag(S, ['dot']); seg(S, hero.x, neckY, hero.x, by - br * 0.5, rn, br * 0.7, u);
        tag(S, ['dot'], 'dot', smooth(inv(0, 0.25, k)), 'drip bulb swelling under 动');
        ball(S, hero.x, by, br, u, 1 + 0.18 * kk);
        untag(S);
      } else if (t < hero.tLand) {
        const tt = t - hero.tSnap;
        const y = hero.ySnap + hero.vSnap * tt + 0.5 * G * tt * tt;
        const v = hero.vSnap + G * tt;
        const sv = 1.12 + 0.2 * clamp(v / 1400);
        tag(S, ['dot'], 'dot', 1, 'drip falling from 动');
        ball(S, hero.x, y, hero.rMax, u, sv);
        tag(S, ['dot']);
        // tail recoils into the falling drop
        const k = spring(tt, 8, 0.45);
        const len = 30 * (1 - k);
        if (len > 1) seg(S, hero.x, y - hero.rMax * sv - len, hero.x, y - hero.rMax * 0.6, 2, 8, u);
        untag(S);
      } else {
        const tl = t - hero.tLand;
        const sv = 1.3 + (0.42 - 1.3) * spring(tl, 5.5, 0.4);
        const r = hero.rMax * (1 + 0.1 * smooth(inv(0, 0.3, tl)));
        tag(S, ['dot'], 'dot', 1, 'drip landed: glossy puddle lens + ripple');
        ball(S, hero.x, FY - r * sv + 0.5, r, u, sv);
        untag(S);
        S.rip = { x: hero.x, y: FY, age: tl, amp: 1 };
        if (V5) S.ripDot = true;
      }
      // stub on the descender recoils after the snap (rebound 2-3 frames)
      if (t >= hero.tSnap && t < hero.tSnap + 0.6) {
        const k = spring(t - hero.tSnap, 6, 0.33);
        const len = 40 * (1 - k) + 3;
        seg(S, hero.x, hero.y - 10, hero.x, hero.y + len, 18, 4 + 3 * (1 - k), u);
      }
    }
    if (!V5) splat.forEach((d) => emitDroplet(S, d, t));

    // ---------------- light: glint sweep after the snap ----------------
    const g2 = inv(9.0, 9.0 + 10 / 30, t);
    const glint1 = t > cues.glint - 0.1 && t < cues.glint + 0.8;
    const kd = smooth(inv(6.9, 10.0, t));   // r2 s2 P3: the key softbox travels during the end card -> speculars slide over the letters
    S.key = { x: -0.78 + 0.06 * Math.sin(t * 0.6) + 0.30 * kd, y: -0.95 + 0.12 * kd,
      glint: glint1 ? lerp(-900, 1700, inOut(inv(cues.glint - 0.1, cues.glint + 0.75, t))) : lerp(-300, 1900, inOut(g2)),
      glintAmp: glint1 ? 1 : (g2 > 0 && g2 < 1 ? 2.2 * Math.sin(PI * g2) : 0) };   // r2 P3: bold 9.0 glint
    { const f = (t - tSnap) * 30; if (f >= 0 && f < 2.5) { S.key.glint = lerp(-200, 1300, f / 2.5); S.key.glintAmp = 2.8 * (1 - 0.5 * f / 2.5); } }  // r2: 2 f specular pop
    const gA = inv(3.72, 3.72 + 6 / 30, t);           // s3 P8: strip light rakes the falling hero sphere (6 f)
    if (gA > 0 && gA < 1) { S.key.glint = 0.8 * MX - 0.6 * sphereY(t) + lerp(-300, 300, inOut(gA)); S.key.glintAmp = 2.4 * Math.sin(PI * gA); }
    S.bloom = 0.55 + 0.45 * Math.exp(-Math.max(0, t - tSnap) / 0.25) * (t > tSnap ? 1 : 0);
    const gap = smooth(inv(tSnap - 0.2, tSnap - 1 / 30, t)) * (t < tSnap ? 1 : 0);
    S.spot = 1.0 - 0.55 * gap;
    if (t >= tSnap) S.spot = 1.12 + 0.45 * Math.exp(-(t - tSnap) / 0.15);   // r2: small lift; the ring carries the hit
    { // r2 P1: radial light ring from behind the bar (0 -> 1400 px in 8 f, flung) + backlit crown sheet (gone in 10 f)
      const tr = t - tSnap;
      if (tr >= 0 && tr < 0.6) {
        const ur = inv(0, 10 / 30, tr), kr = 1 - (1 - ur) * (1 - ur);   // expo-ish out: energy spread over 4-5 f
        S.ring = [960, massY + 10, 40 + 1360 * kr, 0.62 * (1 - 0.45 * kr) * (1 - smooth(inv(5 / 30, 12 / 30, tr)))];
        const kc = flung(inv(0, 3 / 30, tr)), fc = smooth(inv(3 / 30, 9 / 30, tr));
        if (tr < 9 / 30) S.crown = [960, massY - 30, 350 * kc * (1 - 0.6 * fc), (1 - fc) * smooth(inv(0, 1 / 30, tr))];
      }
      // r2 P3: living end card: cyc spot drifts +-80 px, backdrop parallax 8 px against the letters
      const ek = 0.5 - 0.5 * Math.cos(PI * inv(6.6, 10.0, t));
      S.caus = smooth(inv(6.55, 7.2, t)) * (1 + (!V5 && t > cues.drip_land ? 1.6 * Math.exp(-(t - cues.drip_land) / 0.45) : 0));   // r2 s2: the drip's splash flares the wall caustics
      S.par = [8 * ek, -5 * ek, 80 * Math.sin(2 * PI * (t - 6.6) / 3.0) * smooth(inv(6.6, 7.4, t)), 18 * Math.sin(2 * PI * (t - 6.6) / 4.0) * smooth(inv(6.6, 7.4, t))];
    }
    for (const kt of KICKS) S.spot += 0.14 * Math.exp(-Math.max(0, t - kt) / 0.14) * (t >= kt ? 1 : 0);
    // exposure (EV) applied in post
    S.flash = -0.8 * gap;                                  // s4: deeper held breath (-0.8 EV)
    if (t >= tSnap) { const f = (t - tSnap) * 30; S.flash = f < 1 ? 0.9 : f < 2 ? 0.65 : 0.65 * (1 - smooth(inv(2, 8, f))); }  // r2: +0.6 EV (ring does the rest)
    S.bubbles = [];
    bubbles.forEach((b) => {
      if (t < b.t0) return;
      const len = b.y0 - b.y1, per = len / b.sp + 0.25;
      const ph = ((t - b.t0) / per + b.ph) % 1;
      const k = ph * per * b.sp / len;                   // 0..1 along the rise (last 0.25 s = gap)
      if (k > 1) return;
      const l = S.letters[b.li]; if (!l) return;
      const y = lerp(b.y0, b.y1, k) + (l.y - L[b.li].sy0), x = b.x + b.wob * Math.sin((t - b.t0) * b.wf + b.ph * 6);
      const a = smooth(inv(0, 0.12, k)) * (1 - smooth(inv(0.88, 1, k))) * smooth(inv(b.t0, b.t0 + 0.3, t));
      S.bubbles.push([x, y, b.r * (0.8 + 0.4 * k), a]);
    });
    // round 1: sharp micro-bubbles rising through the flood (drawn only where liquid covers the pixel)
    floodBub.forEach((b) => {
      const tt = t - b.t0; if (tt < 0 || tt > b.dur) return;
      const y = b.y0 - b.sp * tt - 160 * tt * tt, x = b.x + b.wob * Math.sin(tt * b.wf + b.ph);
      if (S.bubbles.length < 32) S.bubbles.push([x, y, b.r * (1 + 0.5 * tt), smooth(inv(0, 0.06, tt)) * (1 - smooth(inv(b.dur - 0.12, b.dur, tt)))]);
    });
    S.halo = t >= tSnap ? smooth(inv(tSnap, tSnap + 0.08, t)) * (0.55 + 0.45 * Math.exp(-(t - tSnap) / 0.3)) : 0;
    return S;
  };
}
