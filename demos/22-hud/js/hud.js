// Canvas2D FUI layer — every element is a pure function of t (+ hologram projection state S)
// Everything is inked in the cyan family; the composite shader re-inks it to alert orange with a radial wave.
import { clamp, lerp, prog, E, hash, roll, typed, frameOf, LOCK, REEL, V5, NOLINK } from './util.js';
import { BH, BW, BG, plateW, titleMetrics, slamScale } from './v5.js';
const CITY_KM = { YTY: 235, YNZ: 267, JHA: 296, HYN: 286, WNZ: 366 };

const W = 1920, H = 1080, CX = 960, CY = 540;
const CYA = '#00E5FF', DIM = '#0B7C8C', DEEP = '#0E3A42', HOT = '#E8FEFF', RED = '#FF2A1F', INK = '#020A0D';
const MONO = '"JetBrains Mono"', RAJ = 'Rajdhani', CHK = '"Chakra Petch"', HOS = '"HarmonyOS Sans SC"';
let ctx, tctx, sctx, dpr = 1, K, GA = 1;
let TXT_ON = true, KC = false, LBLA = 1, TXA = 1, LGX, LTX;
// defocus a whole plane: draw it unfiltered into offscreen layers, then ONE blurred drawImage (a per-call ctx.filter blur is pathologically slow)
function blurLayer(px, fn) {
  if (px < 0.3) { fn(); return; }
  const c0 = ctx, t0 = tctx;
  LGX.setTransform(1, 0, 0, 1, 0, 0); LGX.clearRect(0, 0, LGX.canvas.width, LGX.canvas.height); LGX.setTransform(c0.getTransform()); LGX.filter = 'none';
  if (TXT_ON) { LTX.setTransform(1, 0, 0, 1, 0, 0); LTX.clearRect(0, 0, LTX.canvas.width, LTX.canvas.height); }
  ctx = LGX; tctx = LTX;
  try { fn(); } finally { ctx = c0; tctx = t0; }
  const f = `blur(${(px * dpr).toFixed(2)}px)`;
  c0.save(); c0.setTransform(1, 0, 0, 1, 0, 0); c0.filter = f; c0.globalAlpha = 1; c0.drawImage(LGX.canvas, 0, 0); c0.restore();
  if (TXT_ON) { t0.save(); t0.setTransform(1, 0, 0, 1, 0, 0); t0.filter = f; t0.globalAlpha = 1; t0.drawImage(LTX.canvas, 0, 0); t0.restore(); }
}   // TXT_ON: text pass (once per frame, frame centre) · KC: keep-cyan duotone marker · LBLA: ring-label alpha          // GA = brightness tier of the element being drawn (100 / 60 / 30 %)
const SS = 1.26, H0 = 6.35;                  // scope scale (ring r 318 → 401 px, 42 % of frame width); camera h0 (see holo.js)
const DEG = Math.PI / 180;
export function initHUD(canvas, cues, pr, tcanvas) { const mk = () => { const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height; return c.getContext('2d'); }; sctx = mk(); LGX = mk(); LTX = mk(); ctx = canvas.getContext('2d'); tctx = tcanvas.getContext('2d'); dpr = pr; K = cues; }
// dive (frame-quantised so big numbers stay crisp under the 4-sample motion blur)
const zAt = (t) => E.outC(prog(t, LOCK, 1.45));
const magAt = (t) => H0 / Math.exp(lerp(Math.log(H0), Math.log(0.3), zAt(t)));
// HUD inertia: the planes surge forward on the lock kick and settle as the dive lands (end frame untouched)
const SURGE = (t) => { const d = t - LOCK; if (d <= 0) return 0; const u = d / 0.3; return u * Math.exp(1 - u); };
// round 2 · camera push THROUGH the scope ring: 6.43 → 7.10 the HUD flies past the lens (scope ×1 → ×1.62, columns out 120 px +
// 4 px defocus, top bar / tape out), the hologram unmasks full-frame; the 7.10 resolve flash (closed shutter) is a hard cut back to ×1.0
const DV0 = LOCK + 1 / 30, DV1 = 7.1;
export const DIVE = (t) => { if (t < DV0 - 0.02 || t >= DV1 - 1e-4) return 0; const u = clamp((t - DV0 + 0.02) / (DV1 - DV0 + 0.02)); return 0.8 * E.outC(u) + 0.2 * u; };
const PUSH = (t) => (t >= DV1 ? 0.02 * Math.exp(-(t - DV1) * 9) : 0) + 0.015 * prog(t, 8.4, 1.6);   // post-cut settle + 1.5 % end push
const sstep = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
function tier(t, keys) { let v = keys[0][1]; for (let i = 1; i < keys.length; i++) v = lerp(v, keys[i][1], sstep(keys[i][0] - 0.12, keys[i][0] + 0.12, t)); return v; }
// type goes to its own canvas (composited after bloom); plates erase the type they cover
function knock(x, y, w, h, a = 1) { if (!TXT_ON || w <= 0 || h <= 0) return; tctx.save(); tctx.setTransform(ctx.getTransform()); tctx.globalCompositeOperation = 'destination-out'; tctx.globalAlpha = clamp(a); tctx.fillStyle = '#000'; tctx.fillRect(x, y, w, h); tctx.restore(); }

// ---------- primitives
const MKC = { [CYA]: '#007EFF', [DIM]: '#0B448C', [DEEP]: '#0E2042', [HOT]: '#E88CFF' };
const kc = (c) => (KC && MKC[c]) || c;
const st = (c = CYA, w = 1, a = 1) => { ctx.strokeStyle = kc(c); ctx.lineWidth = w; ctx.globalAlpha = clamp(a) * GA; };
const fl = (c = CYA, a = 1) => { ctx.fillStyle = kc(c); ctx.globalAlpha = clamp(a) * GA; };
function T(s, x, y, o = {}) {
  if (!s) return 0;
  const ls = o.ls ?? 0;
  const c = tctx; c.setTransform(ctx.getTransform()); c.filter = ctx.filter;
  c.font = `${o.w ?? 500} ${o.s ?? 13}px ${o.f ?? MONO}`;
  c.letterSpacing = `${ls}px`;
  c.textAlign = o.al ?? 'left'; c.textBaseline = o.bl ?? 'alphabetic';
  c.fillStyle = kc(o.c ?? CYA); c.globalAlpha = clamp(o.a ?? 1) * GA * TXA;
  const xx = o.al === 'right' ? x + ls : o.al === 'center' ? x + ls / 2 : x; // trailing tracking compensation
  if (TXT_ON) c.fillText(s, xx, y);
  return c.measureText(s).width - ls;
}
const TW = (s, o = {}) => { ctx.font = `${o.w ?? 500} ${o.s ?? 13}px ${o.f ?? MONO}`; ctx.letterSpacing = `${o.ls ?? 0}px`; return ctx.measureText(s).width - (o.ls ?? 0); };
function L(x0, y0, x1, y1, p = 1) { if (p <= 0) return; p = Math.min(p, 1); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + (x1 - x0) * p, y0 + (y1 - y0) * p); ctx.stroke(); }
function ARC(x, y, r, a0, a1, p = 1) { if (p <= 0.0005) return; ctx.beginPath(); ctx.arc(x, y, r, a0, a0 + (a1 - a0) * Math.min(p, 1)); ctx.stroke(); }
const F = (t) => frameOf(t);
// appear flicker (4 frames) — classic FUI power-in
function flick(t, t0) { if (t < t0) return 0; const f = F(t) - F(t0); return f >= 4 ? 1 : [0.7, 0.1, 1.0, 0.45][f]; }
const blink = (t, hz, t0 = 0) => Math.floor((t - t0) * hz * 2) % 2 === 0;
const pad = (v, n, d) => { const s = Math.abs(v).toFixed(d); const [i, f] = s.split('.'); return (v < 0 ? '-' : '') + i.padStart(n, '0') + (d ? '.' + f : ''); };
const dms = (v, h1, h2) => { const a = Math.abs(v), d = Math.floor(a), m = Math.round((a - d) * 60); return `${v >= 0 ? h1 : h2}${String(d).padStart(2, '0')}°${String(m).padStart(2, '0')}′`; };
const GL = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789#%&/<>';
function scramble(t, t0, s, id, n = 5) {
  if (F(t0) === F(LOCK)) t0 = LOCK + 1 / 30;   // the white-hot impact frame shows only legible words; decodes start on the next frame
  const f = F(t) - F(t0); if (f < 0) return ''; if (f >= n) return s;
  let o = ''; for (let i = 0; i < s.length; i++) o += s[i] === ' ' ? ' ' : (hash(id, i, f) < f / n ? s[i] : GL[Math.floor(hash(id, i, f, 9) * GL.length)]);
  return o;
}
function brackets(x, y, hs, arm, lw, a, c = CYA) {
  st(c, lw, a); ctx.lineCap = 'square';
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const bx = x + sx * hs, by = y + sy * hs;
    ctx.beginPath(); ctx.moveTo(bx, by - sy * arm); ctx.lineTo(bx, by); ctx.lineTo(bx - sx * arm, by); ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

// ---------- panel chrome
function panel(t, t0, x, y, w, h, idx, label, cn) {
  const p = E.outC(prog(t, t0, 0.5)); if (p <= 0) return 0;
  const a = flick(t, t0);
  T(idx, x, y, { s: 13, c: DIM, a, w: 500 });
  T(scramble(t, t0, label, x + y), x + 24, y, { f: RAJ, w: 600, s: 14, ls: 2.6, a });
  T(cn, x + w, y, { f: HOS, w: 400, s: 14, ls: 1.5, c: DIM, al: 'right', a: a * E.outC(prog(t, t0 + 0.12, 0.3)) });
  st(CYA, 1, 0.85); L(x, y + 9.5, x + w, y + 9.5, p);
  fl(CYA, 1); ctx.fillRect(x, y + 8, 18 * p, 3);
  st(DIM, 1, 0.8); L(x + 0.5, y + 16, x + 0.5, y + h, E.outC(prog(t, t0 + 0.1, 0.5)));
  const q = E.outC(prog(t, t0 + 0.3, 0.3));
  if (q > 0) {
    st(DIM, 1, 0.9 * q);
    L(x + 0.5, y + h + 0.5, x + 12, y + h + 0.5); L(x + w - 12, y + h + 0.5, x + w, y + h + 0.5); L(x + w - 0.5, y + h - 12, x + w - 0.5, y + h + 0.5);
    fl(DIM, q); for (let i = 0; i < 3; i++) ctx.fillRect(x + w - 6 - i * 7, y + 14, 4, 4);
  }
  return a;
}

// ---------- top bar / frame
function frameCorners(t) {
  const p = E.outE(prog(t, 0.03, 0.2)); if (p <= 0) return;
  st(CYA, 1.5, 0.9); const m = 40, a = 34 * p;
  for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [W - m, H - m, -1, -1], [m, H - m, 1, -1]]) {
    ctx.beginPath(); ctx.moveTo(x, y + sy * a); ctx.lineTo(x, y); ctx.lineTo(x + sx * a, y); ctx.stroke();
  }
  // registration marks mid-edges
  st(DIM, 1, p); L(CX - 10, m + 0.5, CX + 10, m + 0.5); L(CX - 10, H - m - 0.5, CX + 10, H - m - 0.5);
  L(m + 0.5, CY - 10, m + 0.5, CY + 10); L(W - m - 0.5, CY - 10, W - m - 0.5, CY + 10);
}
function topBar(t, S) {
  const a = flick(t, 0.14); if (!a) return;
  const y = 76;
  // logo mark: hexagon + slash
  st(CYA, 1.5, a); ctx.beginPath();
  for (let i = 0; i < 6; i++) { const an = (i * 60 + 30) * Math.PI / 180; ctx.lineTo(108 + 11 * Math.cos(an), y - 7 + 11 * Math.sin(an)); }
  ctx.closePath(); ctx.stroke(); L(103, y - 1, 113, y - 13);
  const w1 = T('KESTREL-9', 128, y, { f: CHK, w: 600, s: 21, ls: 3.5, a });
  T('隼眼-9 · 轨道光学系统', 128 + w1 + 16, y - 1, { f: HOS, w: 500, s: 14, ls: 2, c: DIM, a });
  // top rule (grows out from centre)
  const p = E.inOutC(prog(t, 0.2, 0.7)); st(DIM, 1, 0.7);
  L(CX - 190, 100.5, 96, 100.5, p); L(CX + 190, 100.5, W - 96, 100.5, p);
  // centre mode box
  let mode = 'BOOT SEQUENCE', cn = '系统自检', hot = false;
  if (t >= K.data_live) { mode = 'SEARCH'; cn = '扫描中'; }
  if (t >= K.signal_detected) { mode = 'SIGNAL DETECTED'; cn = '信号捕获'; hot = true; }
  if (t >= LOCK) { mode = REEL ? 'SIGNAL LOCKED' : 'TARGET LOCKED'; cn = REEL ? '信号锁定' : '目标锁定'; }
  const bw = 360, bx = CX - bw / 2, by = 56;
  st(CYA, 1, a * 0.9); ctx.beginPath();
  ctx.moveTo(bx + 10, by + 0.5); ctx.lineTo(bx + bw - 10, by + 0.5); ctx.lineTo(bx + bw, by + 16); ctx.lineTo(bx + bw - 10, by + 31.5);
  ctx.lineTo(bx + 10, by + 31.5); ctx.lineTo(bx, by + 16); ctx.closePath(); ctx.stroke();
  const on = !hot || t >= LOCK || blink(t, 4, K.signal_detected);
  if (t >= LOCK) { fl(CYA, 0.22 + 0.12 * Math.exp(-((t - LOCK) % 0.5) * 8)); ctx.fill(); }
  const ch = [K.data_live, K.signal_detected, LOCK].filter((c) => t >= c).pop() ?? 0.14;
  const ms = ch === LOCK ? mode : scramble(t, ch, mode, 77 + Math.floor(ch * 10));
  const mw = TW(ms, { f: RAJ, w: 700, s: 17, ls: 3 }), cw = TW(cn, { f: HOS, w: 500, s: 15, ls: 3 });
  const x0 = CX - (mw + 14 + cw) / 2;
  if (on) { T(ms, x0, by + 22, { f: RAJ, w: 700, s: 17, ls: 3, a, c: t >= LOCK ? HOT : CYA }); T(cn, x0 + mw + 14, by + 21, { f: HOS, w: 500, s: 15, ls: 3, a, c: t >= LOCK ? HOT : CYA }); }
  // right: clock + rec
  const tt = 3 * 3600 + 14 * 60 + 52 + t, hh = Math.floor(tt / 3600), mm = Math.floor(tt / 60) % 60, ss = Math.floor(tt) % 60, ff = F(t) % 30;
  const clk = `UTC ${pad(hh, 2, 0)}:${pad(mm, 2, 0)}:${pad(ss, 2, 0)}.${pad(ff, 2, 0)}`;
  T(clk, W - 96, y, { s: 15, w: 500, al: 'right', a, ls: 1 });
  T(`F ${pad(F(t), 4, 0)} · 30P`, W - 96, y - 22, { s: 13, c: DIM, al: 'right', a, ls: 1 });
  const rx = W - 96 - TW(clk, { s: 15, w: 500, ls: 1 }) - 58;
  if (blink(t, 1)) { fl(RED, a); ctx.beginPath(); ctx.arc(rx, y - 5, 5, 0, 7); ctx.fill(); }
  T('REC', rx + 12, y, { f: RAJ, w: 700, s: 14, ls: 2, c: DIM, a });
}

// ---------- central scope
const SEGS = (() => { const r = []; let a = 0; let i = 0; while (a < 360 && i < 40) { const len = 4 + hash(3, i) * 30, gap = 3 + hash(4, i) * 10; r.push([a, Math.min(a + len, 360), hash(5, i) > 0.7]); a += len + gap; i++; } return r; })();
// acquisition spin-up: rings accelerate (cubic) from the first candidate hop to the snap, then brake hard
function SPIN(t) {
  const a = 4.9, b = 6.33, A = 55, v = 3 * A / (b - a);
  if (t < a) return 0; if (t < b) return A * ((t - a) / (b - a)) ** 3;
  return A + v * (1 - Math.exp(-(t - b) * 9)) / 9;
}
function scope(t, S) {
  const dv = DIVE(t), k = SS * (1 + 0.62 * dv + PUSH(t)); LBLA = 1 - sstep(0.06, 0.3, dv);
  ctx.save(); ctx.translate(CX, CY); ctx.scale(k, k); ctx.translate(-CX, -CY); TXA = LBLA; scopeInner(t, S); TXA = 1; ctx.restore();
}
function scopeInner(t, S) {
  // crosshair (first thing on screen)
  const pc = E.outE(prog(t, 0.04, 0.22));
  if (pc > 0) {
    st(HOT, 1.5, 0.95); const g = 16, l = 44;
    L(CX - g, CY + 0.5, CX - g - (l - g) * pc, CY + 0.5); L(CX + g, CY + 0.5, CX + g + (l - g) * pc, CY + 0.5);
    L(CX + 0.5, CY - g, CX + 0.5, CY - g - (l - g) * pc); L(CX + 0.5, CY + g, CX + 0.5, CY + g + (l - g) * pc);
    fl(HOT, pc); ctx.fillRect(CX - 1, CY - 1, 3, 3);
    st(CYA, 1, 0.22 * pc); L(CX - 60, CY + 0.5, CX - 232, CY + 0.5, pc); L(CX + 60, CY + 0.5, CX + 232, CY + 0.5, pc);
    L(CX + 0.5, CY - 60, CX + 0.5, CY - 232, pc); L(CX + 0.5, CY + 60, CX + 0.5, CY + 232, pc);
  }
  // boot hook (frame snap → ring draw-on): a range ping expands from the crosshair and lands on the outer ring as it
  // draws on at 0.40, while calibration rulers race out along both axes to the frame edge, then dim away by ~0.8 s
  const b0 = K.boot.frame;
  if (t >= b0 && t < 0.85) {
    const tq = F(t) / 30 + 1e-4;
    for (let e = 0; e < 4; e++) {
      const kp = prog(tq - e / 30, b0, K.boot.ring_outer - b0); if (kp <= 0 || kp >= 1) continue;
      const rr = Math.max(2, 318 * E.outC(kp)), fa = (1 - kp) ** 0.4 * [1, 0.42, 0.22, 0.1][e];
      if (!e) { st(CYA, 6, 0.4 * fa); ARC(CX, CY, rr, 0, Math.PI * 2); }
      st(HOT, e ? 1 : 1.6, fa); ARC(CX, CY, rr, 0, Math.PI * 2);
    }
    // landing: the ping leaves a faint full ring that the outer arcs draw over, then decays
    if (t >= K.boot.ring_outer) { const d = t - K.boot.ring_outer; st(HOT, 1.5, 0.55 * Math.exp(-d * 6)); ARC(CX, CY, 318, 0, Math.PI * 2); st(CYA, 8, 0.12 * Math.exp(-d * 9)); ARC(CX, CY, 318, 0, Math.PI * 2); }
    const ks = E.outE(prog(t, b0, 0.34)), fade = 1 - E.inOutC(prog(t, 0.45, 0.38));
    const RX = 860 * ks, RY = 440 * ks;
    st(CYA, 1, 0.8 * fade); L(CX - 240, CY + 0.5, CX - 240 - (RX - 240), CY + 0.5, ks > 0.28 ? 1 : 0); L(CX + 240, CY + 0.5, CX + RX, CY + 0.5, ks > 0.28 ? 1 : 0);
    L(CX + 0.5, CY - 240, CX + 0.5, CY - Math.max(240, RY)); L(CX + 0.5, CY + 240, CX + 0.5, CY + Math.max(240, RY));
    for (let d = 400; d <= RX; d += 20) {
      const big = d % 100 === 0; st(big ? CYA : DIM, 1, (big ? 0.95 : 0.75) * fade);
      for (const sx of [-1, 1]) { L(CX + sx * d + 0.5, CY + 3, CX + sx * d + 0.5, CY + 3 + (big ? 9 : 4)); if (d % 200 === 0) T(String(d), CX + sx * d, CY + 26, { f: RAJ, w: 600, s: 12, ls: 1, al: 'center', c: CYA, a: 0.9 * fade }); }
    }
    for (let d = 300; d <= RY; d += 20) { const big = d % 100 === 0; st(big ? CYA : DIM, 1, (big ? 0.7 : 0.55) * fade); for (const sy of [-1, 1]) L(CX + 3, CY + sy * d + 0.5, CX + 3 + (big ? 9 : 4), CY + sy * d + 0.5); }
    const ha = fade * (1 - ks) ** 0.5; fl(HOT, ha);
    if (RX > 240) { ctx.fillRect(CX + RX - 16, CY - 1, 16, 3); ctx.fillRect(CX - RX, CY - 1, 16, 3); }
    if (RY > 240) { ctx.fillRect(CX - 1, CY - RY, 3, 16); ctx.fillRect(CX - 1, CY + RY - 16, 3, 16); }
  }
  // outer ring R=318, four arcs with gaps, slow rotation
  const p1 = E.outC(prog(t, K.boot.ring_outer, 0.5));
  const rot = (t * 2.2 + 0.35 * SPIN(t)) * Math.PI / 180;
  st(CYA, 1.25, 0.95);
  if (!NOLINK.has('scope')) for (let q = 0; q < 4; q++) { const a0 = rot + (q * 90 + 5) * Math.PI / 180, a1 = rot + (q * 90 + 85) * Math.PI / 180; ARC(CX, CY, 318, a0, a1, p1); }
  // cardinal notches
  if (p1 > 0.5 && !NOLINK.has('scope')) { st(CYA, 2, (p1 - 0.5) * 2); for (let q = 0; q < 4; q++) { const an = rot + q * Math.PI / 2; L(CX + Math.cos(an) * 312, CY + Math.sin(an) * 312, CX + Math.cos(an) * 326, CY + Math.sin(an) * 326); } }
  // tick ring r=300 + bearing labels r=342
  const p2 = prog(t, K.boot.ring_ticks, 0.5);
  if (p2 > 0) {
    for (let i = 0; i < 120; i++) {
      const k = i / 120; if (k > p2) break;
      const an = (i * 3 - 90) * Math.PI / 180, big = i % 10 === 0, mid = i % 5 === 0, len = big ? 14 : mid ? 9 : 5;
      st(big ? CYA : DIM, big ? 1.5 : 1, big ? 1 : 0.9);
      L(CX + Math.cos(an) * 300, CY + Math.sin(an) * 300, CX + Math.cos(an) * (300 - len), CY + Math.sin(an) * (300 - len));
      if (big && i !== 60 && i !== 0) T(pad(i * 3, 3, 0), CX + Math.cos(an) * 344, CY + Math.sin(an) * 344 + 4, { f: RAJ, w: 600, s: 12, ls: 1, al: 'center', c: DIM, a: flick(t, K.boot.ring_ticks + k * 0.5) * LBLA });
    }
  }
  // segmented ring r=276 (counter-rotating), dashed ring r=258, halo ring r=232
  const p3 = E.outC(prog(t, K.boot.ring_inner, 0.6));
  if (p3 > 0) {
    const r2 = -(t * 7 + 20 * E.outQ(prog(t, K.signal_detected, 0.8)) + SPIN(t) + 45 * E.outQ(prog(t, LOCK, 0.9))) * Math.PI / 180;
    for (const [a0, a1, b] of SEGS) {
      if (a0 / 360 > p3) continue;
      st(b ? CYA : DIM, b ? 3 : 2.2, b ? 0.95 : 0.85);
      ARC(CX, CY, 276, r2 + a0 * Math.PI / 180, r2 + Math.min(a1, 360 * p3) * Math.PI / 180);
    }
    ctx.setLineDash([2, 7]); ctx.lineDashOffset = -t * 30; st(CYA, 1, 0.55 * p3); ARC(CX, CY, 258, 0, Math.PI * 2 * p3); ctx.setLineDash([]);
    st(CYA, 1, 0.28 * p3); ARC(CX, CY, 232, -Math.PI / 2, Math.PI * 1.5, p3);
  }
  // main-scope radar sweep: conic phosphor trail (2.0 s/rev, 0.6 s trail) over the globe; its passes reveal the candidates
  const sw = sstep(K.sweep[0], K.sweep[0] + 0.25, t) * (1 - sstep(K.sweep[1] - 0.25, K.sweep[1], t));
  if (sw > 0) {
    const a = (K.radar_theta0_deg + 180 * (t - K.radar_start) - 90) * DEG, tr = 0.6 * Math.PI, f = tr / (2 * Math.PI);
    const g = ctx.createConicGradient(a - tr, CX, CY);
    g.addColorStop(0, 'rgba(0,229,255,0)'); g.addColorStop(f * 0.5, 'rgba(0,229,255,0.06)'); g.addColorStop(f * 0.86, 'rgba(0,229,255,0.16)');
    g.addColorStop(f, 'rgba(0,229,255,0.38)'); g.addColorStop(f + 0.0008, 'rgba(0,229,255,0)'); g.addColorStop(1, 'rgba(0,229,255,0)');
    ctx.globalAlpha = sw * GA; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(CX, CY, 298, 0, Math.PI * 2); ctx.fill();
    st(HOT, 1.6, 0.95 * sw); L(CX + Math.cos(a) * 20, CY + Math.sin(a) * 20, CX + Math.cos(a) * 298, CY + Math.sin(a) * 298);
    st(CYA, 5, 0.18 * sw); L(CX + Math.cos(a) * 20, CY + Math.sin(a) * 20, CX + Math.cos(a) * 298, CY + Math.sin(a) * 298);
  }
  // sweep highlight on SIGNAL DETECTED (bright arc racing around the ring)
  if (t >= K.signal_detected && t < K.signal_detected + 0.6) {
    const k = E.outC(prog(t, K.signal_detected, 0.55)), an = -Math.PI / 2 + k * Math.PI * 2;
    st(HOT, 3, 1 - k * 0.6); ARC(CX, CY, 318, an - 0.5, an);
  }
  // scope corner readouts
  const pa = flick(t, 1.0); if (!pa) return;
  const mag = magAt(F(t) / 30 + 1e-4);
  const rd = [
    [CX - 262, CY - 262, 'right', 'MAG', `×${mag.toFixed(1).padStart(4, ' ')}`],
    [CX + 262, CY - 262, 'left', 'FOV', `${(12.4 / mag).toFixed(2)}°`],
    [CX - 262, CY + 272, 'right', 'HDG', `${pad(((S.lonC ?? 0) + 360) % 360, 3, 2)}°`],
    [CX + 262, CY + 272, 'left', 'TLT', `${pad(S.tiltDeg ?? 0, 2, 2)}°`],
  ];
  for (const [x, y, al, lab, v] of rd) {
    const lw = TW(lab + ' ', { f: RAJ, w: 600, s: 12, ls: 2 });
    if (al === 'right') { T(v, x, y, { s: 14, w: 600, al: 'right', a: pa }); T(lab, x - TW(v, { s: 14, w: 600 }) - 10, y, { f: RAJ, w: 600, s: 12, ls: 2, c: DIM, al: 'right', a: pa }); }
    else { T(lab, x, y, { f: RAJ, w: 600, s: 12, ls: 2, c: DIM, a: pa }); T(v, x + lw + 4, y, { s: 14, a: pa }); }
  }
}

// ---------- left column (x 96–396): boot log · RNG hero readout · telemetry · radar minimap
const LOG = [['OPTIC CORE v4.2.1', 'OK'], ['CRYO FPA 4096² · 77K', 'OK'], ['GYRO ALIGN Δ0.0003°', 'OK'],
  ['ORBIT LEO 512 KM', 'OK'], ['UPLINK QKD-7 9.6G', 'OK'], ['SIG DB 14 220 PROF', 'OK']];
const CW = 300;
function leftCol(t, S) {
  const x = 96, w = CW;
  GA = tier(t, [[0, 1], [2.6, 0.55], [4.4, 1], [5.1, 0.5], [6.45, 1], [7.3, 0.5]]);
  if (panel(t, 0.36, x, 128, w, 250, '01', 'SYS BOOT', '系统自检')) {
    const lt = [0.40, 0.66, 0.92, 1.18, 1.44, 1.70], y = 164, lh = 24;
    LOG.forEach(([s, ok], i) => {
      const ty = typed(t, lt[i], s, 110); if (!ty) return;
      T('>', x + 8, y + i * lh, { s: 14, c: DIM }); T(ty, x + 24, y + i * lh, { s: 14, w: 400, c: CYA, a: 0.95 });
      const done = lt[i] + s.length / 110;
      if (t >= done) {
        const lw = TW(s, { s: 14, w: 400 });
        ctx.setLineDash([1, 4]); st(DIM, 1, 0.7); L(x + 30 + lw, y + i * lh - 4, x + w - 42, y + i * lh - 4); ctx.setLineDash([]);
        T(`[${ok}]`, x + w - 4, y + i * lh, { s: 14, w: 600, al: 'right', a: flick(t, done + 0.03) });
      } else T('█', x + 24 + TW(ty, { s: 14, w: 400 }) + 1, y + i * lh, { s: 13, c: CYA });
    });
    const extra = [[1.98, '> SEARCH MODE ENGAGED', CYA], [K.signal_detected, '! SIGNAL · BRG 041°', HOT], [LOCK + 0.1, REEL ? '■ SIG-03 LOCKED' : '■ TGT-03 LOCKED', HOT]];
    extra.forEach(([t0, s, c], j) => {
      const ty = typed(t, t0, s, 120); if (!ty) return;
      const yy = y + (6 + j) * lh, last = j === 2 ? true : t < extra[j + 1][0];
      T(ty, x + 8, yy, { s: 14, w: 600, c, a: j === 1 && t < LOCK ? (blink(t, 4, t0) ? 1 : 0.55) : 1 });
      if (last && blink(t, 2.5)) T('█', x + 8 + TW(ty, { s: 14, w: 600 }) + 3, yy, { s: 13, c: CYA });
    });
  }
  // RNG — the typographic anchor (Chakra Petch 72 px). During the dive it becomes the effective optical range and plunges.
  GA = 1;
  const ra = flick(t, K.boot.panel_left + 0.25);
  if (ra && !(V5 && t >= LOCK)) {   // v5: the 72 px RNG readout sits under the title band → it gives way on the lock
    const yb = 424, tq = F(t) / 30 + 1e-4, dive = tq >= LOCK, mag = magAt(tq);
    const rng = lerp(1712.6, 1648.3, E.inOutC(prog(tq, K.data_live, 4.0))), val = dive ? rng / mag : rng;
    const lab = dive ? 'EFF RNG' : 'SLANT RNG', cn = dive ? '等效距离' : '斜距';
    T(scramble(t, dive ? LOCK : K.boot.panel_left + 0.25, lab, 61 + (dive ? 1 : 0), 5), x, yb, { f: RAJ, w: 700, s: 15, ls: 3, a: ra });
    T(cn, x + w, yb, { f: HOS, w: 500, s: 14, ls: 2, c: DIM, al: 'right', a: ra });
    st(CYA, 1, 0.85 * ra); L(x, yb + 9.5, x + w, yb + 9.5); fl(CYA, ra); ctx.fillRect(x, yb + 8, 18, 3);
    const fin = pad(val, 4, 1), s = t < K.data_live ? null : roll(t, K.data_live, fin, 88, 7);
    const nw = T(s ?? '----.-', x - 3, yb + 88, { f: CHK, w: 600, s: 72, ls: 1, c: s ? HOT : DIM, a: ra * (s ? 1 : 0.7) });
    T('KM', x + w, yb + 88, { f: RAJ, w: 700, s: 20, ls: 2, al: 'right', c: CYA, a: ra });
    // zoom meter: 30 ticks, fills with the dive (log-magnification)
    const zz = dive ? zAt(tq) : 0;
    for (let i = 0; i < 30; i++) { const on = i < Math.round(zz * 30); fl(on ? (i === Math.round(zz * 30) - 1 ? HOT : CYA) : DEEP, on ? 1 : 0.9); ctx.fillRect(x + i * 10, yb + 104, 7, on ? 6 : 4); }
    T(`MAG ×${mag.toFixed(1)}`, x, yb + 136, { s: 16, w: 600, c: dive ? HOT : CYA, a: ra });
    T(`FOV ${(12.4 / mag).toFixed(2)}°`, x + w, yb + 136, { s: 16, w: 500, al: 'right', c: CYA, a: ra * 0.85 });
    void nw;
  }
  GA = tier(t, [[0, 1], [3.9, 0.6], [6.45, 0.85], [7.4, 0.4]]);
  if (panel(t, K.boot.panel_left, x, 612, w, 186, '02', 'NAV TELEMETRY', '导航遥测')) {
    const rows = [
      ['AZM', ((S.lonC ?? 0) + 360) % 360, 3, 2, '°'], ['ELV', S.tiltDeg ?? 0, 3, 2, '°'], ['ALT', 512.08 + 0.02 * Math.sin(t * 3), 3, 2, 'KM'],
      ['VEL', 7.612 + 0.001 * Math.floor(hash(F(t) >> 2, 5) * 4), 1, 3, 'KM/S'],
      ['SNR', t < K.signal_detected ? 11.4 + hash(F(t) >> 2, 9) * 0.6 : lerp(11.4, 41.2, E.outC(prog(t, K.signal_detected, 0.6))), 2, 1, 'dB'],
    ];
    rows.forEach(([lab, v, n, d, u], i) => {
      const yy = 652 + i * 31, t0 = K.data_rolls[i];
      T(lab, x + 8, yy, { f: RAJ, w: 600, s: 14, ls: 2.5, c: DIM });
      const fin = pad(v, n, d), s = roll(t, t0, fin, 30 + i, 3 + (i % 3));
      T(s ?? fin.replace(/[0-9]/g, '-'), x + 156, yy + 1, { s: 18, w: 500, al: 'right', c: s ? HOT : DIM, a: s ? 1 : 0.6 });
      T(u, x + 162, yy, { s: 13, c: DIM });
      const m = clamp(0.25 + 0.6 * hash(i, 1) + 0.08 * Math.sin(t * (2 + i) + i)), mp = E.outC(prog(t, t0 + 0.1, 0.4));
      st(DEEP, 4, 1); L(x + 212, yy - 5, x + w - 6, yy - 5); st(CYA, 4, 0.9); L(x + 212, yy - 5, x + 212 + (w - 218) * m * mp, yy - 5);
      if (i < 4) { st(DEEP, 1, 0.9); L(x + 8, yy + 11.5, x + w - 6, yy + 11.5, mp); }
    });
  }
  GA = tier(t, [[0, 0.6], [2.4, 0.8], [4.6, 0.35], [7.4, 0.5]]); KC = true;
  if (panel(t, K.boot.panel_left + 0.12, x, 840, w, 160, '03', 'RDR · MINIMAP', '雷达')) radar(t, x + 66, 934, 52, x, w);
  GA = 1; KC = false;
}
function radar(t, rx, ry, R, x, w) {
  const p = E.outC(prog(t, K.boot.panel_left + 0.2, 0.6));
  st(DIM, 1, 0.9); for (const k of [1 / 3, 2 / 3, 1]) ARC(rx, ry, R * k, -Math.PI / 2, Math.PI * 1.5, p);
  st(DEEP, 1, 1); L(rx - R, ry + 0.5, rx + R, ry + 0.5, p); L(rx + 0.5, ry - R, rx + 0.5, ry + R, p);
  for (let i = 0; i < 36; i++) { if (i / 36 > p) break; const an = (i * 10 - 90) * DEG, l = i % 9 === 0 ? 7 : 3; st(i % 9 === 0 ? CYA : DIM, 1, 1); L(rx + Math.cos(an) * (R + 2), ry + Math.sin(an) * (R + 2), rx + Math.cos(an) * (R + 2 + l), ry + Math.sin(an) * (R + 2 + l)); }
  const lx = x + w - 4;
  T('CONTACTS', lx, 876, { f: RAJ, w: 600, s: 14, ls: 2, c: DIM, al: 'right', a: p });
  if (t < K.radar_start) return;
  const brg = K.radar_theta0_deg + 180 * (t - K.radar_start);
  const a = (brg - 90) * DEG, wedge = 1.1;
  const g = ctx.createConicGradient(a - wedge, rx, ry);
  g.addColorStop(0, 'rgba(0,229,255,0)'); g.addColorStop(wedge / (Math.PI * 2), KC ? 'rgba(0,126,255,0.34)' : 'rgba(0,229,255,0.34)'); g.addColorStop(wedge / (Math.PI * 2) + 0.001, 'rgba(0,229,255,0)'); g.addColorStop(1, 'rgba(0,229,255,0)');
  ctx.globalAlpha = GA; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(rx, ry, R, 0, Math.PI * 2); ctx.fill();
  st(HOT, 1.5, 0.95); L(rx, ry, rx + Math.cos(a) * R, ry + Math.sin(a) * R);
  const blips = [...K.radar_blips]; if (t >= K.signal_detected) blips.push({ brg: 41, r: 0.34, sig: true });
  blips.forEach((b, i) => {
    const since = (((brg - b.brg) % 360) + 360) % 360 / 180, age = t - K.radar_start - (((b.brg - K.radar_theta0_deg) % 360 + 360) % 360) / 180;
    let I = age >= 0 ? Math.exp(-since * 1.6) : 0;
    if (b.sig) I = Math.max(I, 0.55 + 0.45 * Math.cos((t - K.signal_detected) * 12));
    const ba = (b.brg - 90) * DEG, bx = rx + Math.cos(ba) * R * b.r, by = ry + Math.sin(ba) * R * b.r;
    if (I > 0.02) { fl(b.sig ? HOT : CYA, I); ctx.fillRect(bx - 2, by - 2, 4, 4); if (b.sig) { st(HOT, 1.2, 1); ctx.strokeRect(bx - 6.5, by - 6.5, 13, 13); } }
    const yy = 898 + i * 20, seen = age >= 0 || b.sig;
    if (seen) T(`${b.sig ? 'SIG' : 'B-' + (i + 1)} ${pad(b.brg, 3, 0)}° ${b.r.toFixed(2)}`, lx, yy, { s: 13, al: 'right', c: b.sig ? HOT : I > 0.3 ? CYA : DIM, a: flick(t, K.radar_start + (b.sig ? K.signal_detected - K.radar_start : ((((b.brg - K.radar_theta0_deg) % 360) + 360) % 360) / 180)) });
  });
}

// ---------- right column (x 1524–1824): three panels on their own rhythm + a 30 % footer strip
function spark(t, x, y, w, h, seed, t0, lab, unit, base, amp) {
  const p = E.inOutC(prog(t, t0, 0.7)); if (p <= 0) return;
  st(DEEP, 1, 1); for (let k = 0; k <= 2; k++) L(x, y + h * k / 2 + 0.5, x + w, y + h * k / 2 + 0.5);
  const N = 90, win = 3.0, pts = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N; if (u > p) break;
    const ts = t - (1 - u) * win, j = Math.floor(ts * 20);
    let v = 0.45 + 0.18 * Math.sin(ts * 3.1 + seed) + 0.12 * Math.sin(ts * 7.7 + seed * 2) + 0.14 * (hash(seed, j) - 0.5);
    if (ts > K.signal_detected) v += 0.42 * Math.exp(-(ts - K.signal_detected) * 1.2) + 0.12;
    if (ts > LOCK) v = 0.8 + 0.07 * Math.sin(ts * 9 + seed) + 0.05 * (hash(seed, j, 2) - 0.5);
    pts.push([x + u * w, y + h - clamp(v, 0.02, 0.98) * h]);
  }
  ctx.beginPath(); pts.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)));
  st(CYA, 1.4, 1); ctx.stroke();
  ctx.lineTo(pts[pts.length - 1][0], y + h); ctx.lineTo(x, y + h); ctx.closePath(); fl(CYA, 0.08); ctx.fill();
  const [ex, ey] = pts[pts.length - 1]; fl(HOT, 1); ctx.fillRect(ex - 2, ey - 2, 4, 4);
  const v = base + amp * (1 - (ey - y) / h);
  T(lab, x, y - 9, { f: RAJ, w: 600, s: 14, ls: 2, c: DIM });
  T(`${roll(t, t0, v.toFixed(1), seed, 4) ?? ''} ${unit}`, x + w, y - 9, { s: 16, w: 600, al: 'right', c: HOT });
}
const CND = REEL ? [['CND-01', 'QML', '70°30′S 020°00′E', 0.231], ['CND-02', 'WLK', '66°18′S 110°30′E', 0.418], ['CND-03', 'ERB', '77°32′S 167°09′E', 0.997]]
  : [['CND-01', 'BKK', '13°45′N 100°30′E', 0.231], ['CND-02', 'URC', '43°48′N 087°36′E', 0.418], ['CND-03', 'SHA', '31°14′N 121°29′E', 0.997]];
function rightCol(t, S) {
  const x = W - 96 - CW, w = CW;
  GA = tier(t, [[0, 0.6], [1.2, 1], [2.4, 0.6], [2.9, 1], [4.6, 0.55], [6.45, 1], [7.3, 0.5]]);
  if (panel(t, K.boot.panel_right, x, 128, w, 214, '04', 'SIGNAL ANALYSIS', '信号分析')) {
    spark(t, x + 6, 182, w - 12, 50, 3, K.sparkline, 'SIG PWR', 'dBm', -92, 40);
    spark(t, x + 6, 284, w - 12, 50, 8, K.sparkline + 0.2, 'COHERENCE', '%', 0, 100);
  }
  GA = tier(t, [[0, 0.6], [4.6, 1], [6.9, 0.55]]);
  if (panel(t, K.boot.panel_right + 0.1, x, 392, w, 236, '05', 'CANDIDATES', '候选目标')) {
    CND.forEach(([id, code, ll, m], i) => {
      const t0 = K.candidates[i], yy = 434 + i * 66;
      if (t < t0) { T(id, x + 8, yy, { s: 14, c: DIM, a: 0.7 }); T('AWAITING', x + w - 4, yy, { s: 14, c: DIM, al: 'right', a: 0.7 }); st(DEEP, 1, 1); L(x + 8, yy + 30.5, x + w - 6, yy + 30.5); return; }
      const a = flick(t, t0), match = i === 2;
      T(id, x + 8, yy, { s: 14, w: 600, c: match ? HOT : CYA, a });
      T(code, x + 84, yy, { f: RAJ, w: 700, s: 16, ls: 2, a });
      T(ll, x + 8, yy + 21, { s: 14, w: 400, c: DIM, a });
      const mp = E.outC(prog(t, t0, 0.3)), pct = (m * 100 * mp).toFixed(1) + '%';
      const res = t < t0 + 0.28 ? pct : match ? `MATCH ${pct}` : 'NO MATCH';
      T(res, x + w - 4, yy, { s: 16, w: 600, al: 'right', c: match ? HOT : DIM, a: match && t < LOCK ? (blink(t, 5) ? 1 : 0.4) : a });
      st(DEEP, 3, 1); L(x + 8, yy + 32, x + w - 6, yy + 32); st(match ? CYA : DIM, 3, 1); L(x + 8, yy + 32, x + 8 + (w - 14) * m * mp, yy + 32);
      if (!match && t > t0 + 0.28) { st(DIM, 1, 0.9); L(x + 8, yy - 5.5, x + 118, yy - 5.5); }
    });
  }
  GA = tier(t, [[0, 0.3], [4.4, 1], [5.0, 0.55], [7.4, 0.45]]); KC = true;
  if (panel(t, K.boot.panel_right + 0.2, x, 676, w, 190, '06', 'SPECTRUM', '频谱')) {
    const n = 28, bw = (w - 12) / n, p = E.outC(prog(t, K.boot.panel_right + 0.3, 0.6)), pkI = 18;
    for (let i = 0; i < n; i++) {
      const j = Math.floor(t * 15), v0 = 0.15 + 0.5 * Math.pow(hash(i, j, 3), 2) + 0.2 * Math.sin(i * 0.5 + t * 2) ** 2;
      let v = v0 * p; if (t > K.signal_detected && Math.abs(i - pkI) < 3) v = Math.max(v, (0.95 - Math.abs(i - pkI) * 0.22) * (0.85 + 0.15 * hash(i, j)));
      const nseg = Math.round(22 * clamp(v)), pk = i === pkI && t > K.signal_detected;
      for (let q = 0; q < nseg; q++) { fl(pk ? HOT : q > 15 ? CYA : DIM, pk ? 0.95 : q > 15 ? 0.75 : 0.8); ctx.fillRect(x + 6 + i * bw, 846 - q * 4.4, bw - 3, 2.6); }
      fl(DEEP, 1); ctx.fillRect(x + 6 + i * bw, 850, bw - 3, 2);
    }
    if (t > K.signal_detected) T('▲ 8.412 GHz', x + 6 + pkI * bw + bw / 2, 738, { s: 14, w: 600, al: 'center', c: HOT, a: flick(t, K.signal_detected) });
  }
  // footer: DATA LINK (keep-cyan) — label row, 4-row rolling hex dump (a new row every 6 frames), then the 9.40 UPLINK stamp
  GA = tier(t, [[0, 0.35], [1.6, 0.6], [6.45, 0.75], [7.3, 0.6]]);
  const fa = flick(t, K.boot.panel_right + 0.4);
  if (fa) {
    T('DATA LINK · QKD-7', x, 900, { f: RAJ, w: 600, s: 14, ls: 2, c: DIM, a: fa });
    for (let k = 0; k < 12; k++) { const on = hash(k, Math.floor(t * 8)) > 0.35 || k < 5; fl(on ? CYA : DEEP, fa); ctx.fillRect(x + 176 + k * 6, 890, 4, 10); }
    T('9.6 G', x + w, 900, { s: 14, w: 600, al: 'right', c: CYA, a: fa });
    st(DEEP, 1, 1); L(x, 909.5, x + w, 909.5, E.outC(prog(t, K.boot.panel_right + 0.4, 0.5)));
    const fr = F(t), row0 = Math.floor(fr / 6), HX = '0123456789ABCDEF';
    // 8.80–9.00: the oldest row drops out and the dump slides up one row to make room for the UPLINK stamp (no collision)
    const du = E.inOutC(prog(t, 8.84, 0.16)), d0a = 1 - prog(t, 8.8, 0.08);
    for (let r = 0; r < 4; r++) {
      const id = row0 - 3 + r, fresh = r === 3 && fr % 6 < 2, ry = 930 + (r - (r ? du : 0)) * 19, ra = r ? 1 : d0a;
      if (ra <= 0) continue;
      let line = ((0x3F20 + id * 8) & 0xFFFF).toString(16).toUpperCase().padStart(4, '0') + ' ';
      for (let b = 0; b < 8; b++) { const v = Math.floor(hash(id, b, 11) * 256); line += ' ' + HX[v >> 4] + HX[v & 15]; }
      T(line, x, ry, { s: 14, w: 400, ls: 0.4, c: fresh ? HOT : r === 3 ? CYA : DIM, a: ra * fa * (fresh ? 1 : 0.85) });
      T(hash(id, 99) > 0.5 ? 'ACK' : 'ENC', x + w, ry, { s: 12, w: 500, al: 'right', c: DIM, a: ra * fa * 0.8 });
    }
  }
  KC = false;
  // UPLINK · 数据上传 (alert ink): bar fills 12 frames 9.00 → 9.40, stamps SENT ✓ / 已传送 on the 9.40 beat with a ping ring
  if (t >= 8.9) {
    GA = 1; const ua = flick(t, 8.9), y = 1003, bx0 = x + 128, bx1 = x + w - 92, n = 24;
    T('UPLINK', x, y, { f: RAJ, w: 700, s: 14, ls: 2, c: HOT, a: ua });
    T('数据上传', x + 62, y - 1, { f: HOS, w: 500, s: 12, ls: 1.5, c: CYA, a: ua });
    const lit = Math.floor(n * prog(F(t) / 30, 9.0, 0.4) + 1e-6), sw = (bx1 - bx0) / n;
    for (let q = 0; q < n; q++) { fl(q < lit ? (q === lit - 1 && lit < n ? HOT : CYA) : DEEP, ua); ctx.fillRect(bx0 + q * sw, y - 10, sw - 2, 10); }
    if (t < 9.4) T(`${pad(Math.floor(100 * lit / n), 3, 0)}%`, x + w, y, { s: 14, w: 600, al: 'right', c: CYA, a: ua });
    else {
      const d = t - 9.4, sk = 1 + 0.35 * Math.exp(-d * 22), sx0 = x + w - 84, sy0 = y - 15;
      ctx.save(); ctx.translate(sx0 + 42, sy0 + 10); ctx.scale(sk, sk); ctx.translate(-(sx0 + 42), -(sy0 + 10));
      fl(HOT, 0.16 + 0.5 * Math.exp(-d * 12)); ctx.fillRect(sx0, sy0, 84, 20); st(HOT, 1.5, 1); ctx.strokeRect(sx0 + 0.5, sy0 + 0.5, 83, 19);
      T('SENT', sx0 + 7, y, { f: RAJ, w: 700, s: 15, ls: 2, c: HOT });
      st(HOT, 2, 1); ctx.beginPath(); ctx.moveTo(sx0 + 60, sy0 + 10); ctx.lineTo(sx0 + 65, sy0 + 15); ctx.lineTo(sx0 + 75, sy0 + 5); ctx.stroke();
      ctx.restore();
      T('已传送', x + w, y + 20, { f: HOS, w: 700, s: 12, ls: 2, al: 'right', c: HOT, a: clamp(d * 12) });
      if (d < 0.6) { const u = E.outC(d / 0.6); st(HOT, 1.5, 0.9 * (1 - u)); ctx.strokeRect(sx0 - 40 * u, sy0 - 14 * u, 84 + 80 * u, 20 + 28 * u); }
    }
  }
  GA = 1;
}

// ---------- bottom heading tape
function tape(t, S) {
  const p = E.inOutC(prog(t, K.boot.panel_right, 0.6)); if (p <= 0) return;
  const lon = S.lonC ?? 0, y = 986, half = 330 * p, ppd = 7;
  ctx.save(); ctx.beginPath(); ctx.rect(CX - half, y - 20, half * 2, 60); ctx.clip();
  for (let d = Math.floor(lon - 50); d <= lon + 50; d++) {
    const xx = CX + (d - lon) * ppd, a = clamp(1 - Math.abs(xx - CX) / 330) ** 0.7;
    const big = d % 10 === 0, mid = d % 5 === 0;
    st(big ? CYA : DIM, 1, a); L(Math.round(xx) + 0.5, y, Math.round(xx) + 0.5, y + (big ? 14 : mid ? 9 : 5));
    if (big) { const dd = ((d % 360) + 540) % 360 - 180; T(`${dd >= 0 ? 'E' : 'W'}${pad(Math.abs(dd), 3, 0)}`, xx, y + 30, { f: RAJ, w: 600, s: 14, ls: 1, al: 'center', c: DIM, a }); }
  }
  ctx.restore();
  st(CYA, 1, 0.8 * p); L(CX - half, y - 0.5, CX + half, y - 0.5);
  fl(HOT, p); ctx.beginPath(); ctx.moveTo(CX, y + 2); ctx.lineTo(CX - 6, y - 8); ctx.lineTo(CX + 6, y - 8); ctx.closePath(); ctx.fill();
  const hd = ((lon % 360) + 540) % 360 - 180;
  T(`${hd >= 0 ? 'E' : 'W'}${pad(Math.abs(hd), 3, 2)}°`, CX, y - 16, { s: 16, w: 600, al: 'center', c: HOT, a: p });
}

// ---------- acquisition: candidate hops + lock brackets
// bearing line: dashed ray from the reticle out to the scope ring, notch on the ring + live BRG readout (triangulation)
function bearing(t, x, y, hs, a) {
  const dx = x - CX, dy = y - CY, d = Math.hypot(dx, dy); if (d < 1 || d + hs + 16 > 292 * SS) return;
  const ux = dx / d, uy = dy / d, aa = a * clamp((d - 30) / 50);
  if (aa <= 0.01) return;
  ctx.setLineDash([5, 5]); ctx.lineDashOffset = t * 45; st(CYA, 1, 0.6 * aa);
  L(x + ux * (hs + 6), y + uy * (hs + 6), CX + ux * 296 * SS, CY + uy * 296 * SS); ctx.setLineDash([]);
  st(HOT, 2.5, aa); L(CX + ux * 304 * SS, CY + uy * 304 * SS, CX + ux * 332 * SS, CY + uy * 332 * SS);
  const brg = (Math.atan2(uy, ux) * 180 / Math.PI + 90 + 360) % 360;
  const dg = 1 - clamp(Math.abs(((brg % 90) + 90) % 90 - 45) / 20), rl = (386 + 30 * dg) * SS;   // clear the MAG/FOV/HDG/TLT diagonals
  T(`BRG ${pad(brg, 3, 1)}°`, CX + ux * rl, CY + uy * rl + 4, { s: 15, w: 600, c: HOT, al: ux > 0.35 ? 'left' : ux < -0.35 ? 'right' : 'center', a: aa });
}
// draw vector work on the post-bloom (type) layer: crisp edges + dark knock-out halo; only in the text pass
function onText(fn) { if (!TXT_ON) return; const c0 = ctx; tctx.setTransform(c0.getTransform()); tctx.filter = 'none'; ctx = tctx; try { fn(); } finally { ctx = c0; } }
function acquire(t, S) {
  if (t < 4.62) return;
  const pts = [{ x: CX, y: CY }, S.cnd[0], S.cnd[1], S.target], times = [4.62, ...K.candidates];
  // search reticle: hops between candidates (arrives exactly on each cue)
  if (t < K.candidates[2]) {
    let k = 0; while (k < 3 && t >= times[k + 1]) k++;
    const hopD = 0.2, ta = times[k + 1];
    let x, y;
    if (k >= 3) { x = pts[3].x; y = pts[3].y; } else {
      const u = E.inOutQ(clamp((t - (ta - hopD)) / hopD)), from = pts[k], to = pts[k + 1];
      x = lerp(from.x, to.x, u); y = lerp(from.y, to.y, u);
    }
    if (k > 0) { x = pts[k].x; y = pts[k].y; }
    const arrive = k > 0 ? times[k] : -9, pulse = 1 + 0.5 * Math.exp(-(t - arrive) * 14);
    const moving = k < 3 && t > times[k + 1] - 0.2;
    if (moving) { const u = E.inOutQ(clamp((t - (times[k + 1] - 0.2)) / 0.2)); x = lerp(pts[k].x, pts[k + 1].x, u); y = lerp(pts[k].y, pts[k + 1].y, u); }
    const hs = 22 * (moving ? 1.25 : pulse);
    brackets(x, y, hs, 7, 1.5, 0.95, CYA);
    bearing(t, x, y, hs, clamp((t - 4.62) * 6));
    if (moving) { const u = E.inOutQ(clamp((t - (times[k + 1] - 0.2)) / 0.2)), fr = pts[k]; st(HOT, 1.5, 0.7 * (1 - u * 0.5)); L(lerp(fr.x, x, 0.35 * u), lerp(fr.y, y, 0.35 * u), x, y); }
    st(CYA, 1, 0.5); L(x - hs - 10, y + 0.5, x - hs - 3, y + 0.5); L(x + hs + 3, y + 0.5, x + hs + 10, y + 0.5);
    if (k > 0 && !moving) {
      const [id, code, ll] = CND[k - 1], dt = t - arrive;
      T(`${id} · ${code}`, x + hs + 14, y - 6, { f: RAJ, w: 700, s: 16, ls: 2, a: flick(t, arrive) });
      T(dt < 0.25 ? scramble(t, arrive, 'ANALYSING', 50 + k, 7) : 'NO MATCH', x + hs + 14, y + 12, { s: 14, w: 600, c: dt < 0.25 ? CYA : DIM });
      if (dt > 0.25) { st(DIM, 1.5, 1); L(x - 8, y - 8, x + 8, y + 8); L(x + 8, y - 8, x - 8, y + 8); }
    }
  }
  // previous candidates keep a faint X marker
  for (let i = 0; i < 2; i++) if (t > K.candidates[i] + 0.25) { const c = S.cnd[i]; if (c.face > 0.05) { st(DIM, 1, 0.6 * clamp(1 - (t - K.candidates[i] - 0.8) * 2)); L(c.x - 5, c.y - 5, c.x + 5, c.y + 5); L(c.x + 5, c.y - 5, c.x - 5, c.y + 5); } }
  // ---- HERO lock: brackets fly in from the four frame corners, hunt with ±16 px jitter, snap to a 260 px box
  // (expo-out, 1-frame overshoot to 0.96, settled 6.333 → two clean frames with LOCK 100 %), then bite onto the target on the impact
  if (t >= K.brackets_in) {
    const tg = S.target, tb = K.brackets_in, sn = K.snap, stl = K.settle;
    const pulseK = t > LOCK ? Math.max(...K.alert_pulses.map((p) => (t >= p ? Math.exp(-(t - p) * 10) : 0))) : 0;
    let hx, hy, jit = 0;
    const TRV = tb + 8 / 30;   // 8-frame travel 5.90 → 6.167 (outCubic), then 2 frames of stepped hunting before the 6.233 snap
    const BST = (tt) => { const u = E.outC(prog(tt, tb, TRV - tb)); let bx = lerp(872, 176, u), by = lerp(476, 176, u);
      if (tt >= TRV) bx = by = ((F(tt) >> 1) & 1) ? 176 : 204; return { hx: bx, hy: by, jit: 18 }; };
    if (t < sn) { const b = BST(t); hx = b.hx; hy = b.hy; jit = b.jit; }
    else if (t < LOCK) {
      const fr = (t - sn) * 30, KF = [1.35, 1.08, 0.96, 1.0];
      const k = fr >= 3 ? 1.0 : lerp(KF[Math.floor(fr)], KF[Math.floor(fr) + 1], E.outC(fr - Math.floor(fr)));
      hx = hy = 130 * k;
    } else { const k = E.outE(prog(t, LOCK, 0.2)); hx = hy = lerp(130, 72, k) * (1 + 0.05 * pulseK); }
    const a = t < LOCK ? Math.max(flick(t, tb), 0.8) : 1, jf = F(t) >> 1, arm = clamp(0.3 * Math.min(hx, hy), 22, 64);
    const ofs = (q) => [(hash(jf, q, 1) - 0.5) * 2 * jit, (hash(jf, q, 2) - 0.5) * 2 * jit];
    const drawB = (bhx, bhy, bjit, bjf, ba, echo) => {
      const barm = clamp(0.3 * Math.min(bhx, bhy), 22, 64); ctx.lineCap = 'square';
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy], q) => {
        const bx = tg.x + sx * bhx + (hash(bjf, q, 1) - 0.5) * 2 * bjit, by = tg.y + sy * bhy + (hash(bjf, q, 2) - 0.5) * 2 * bjit;
        const path = () => { ctx.beginPath(); ctx.moveTo(bx, by - sy * barm); ctx.lineTo(bx, by); ctx.lineTo(bx - sx * barm, by); ctx.stroke(); };
        if (echo) { st(CYA, 4, ba); path(); } else { st(CYA, 6, ba); path(); st(HOT, 2, ba); path(); }
      });
      ctx.lineCap = 'butt';
    };
    if (t < sn) for (const [e, ea] of [[3, 0.12], [2, 0.25], [1, 0.45]]) { const te = t - e * 2 / 30; if (te < tb) continue; const b = BST(te); drawB(b.hx, b.hy, b.jit, F(te) >> 1, ea * a, true); }
    if (t >= LOCK) onText(() => drawB(hx, hy, jit, jf, a, false)); else drawB(hx, hy, jit, jf, a, false);
    if (t < LOCK) bearing(t, tg.x, tg.y, 34, flick(t, tb) * (1 - sstep(6.1, 6.3, t)));
    if (t >= LOCK) {
      const k = E.outC(prog(t, LOCK, 0.4)), rr = 30 + 6 * pulseK, spin = (t - LOCK) * 1.4;
      if (!NOLINK.has('reticle')) onText(() => { st(HOT, 1.5, k); for (let q = 0; q < 4; q++) ARC(tg.x, tg.y, rr, spin + q * Math.PI / 2 + 0.25, spin + q * Math.PI / 2 + Math.PI / 2 - 0.25, k);
        fl(HOT, k); ctx.beginPath(); ctx.moveTo(tg.x, tg.y - 5); ctx.lineTo(tg.x + 5, tg.y); ctx.lineTo(tg.x, tg.y + 5); ctx.lineTo(tg.x - 5, tg.y); ctx.closePath(); ctx.fill(); });
      { const d = t - LOCK; if (d < 0.25) { const u = E.outC(d / 0.25); st(HOT, 2, 0.9 * (1 - u)); ctx.strokeRect(tg.x - 150 - 70 * u, tg.y - 150 - 70 * u, 300 + 140 * u, 300 + 140 * u); } }
      for (const p0 of [LOCK, ...K.alert_pulses]) { const d = t - p0; if (d < 0 || d > 0.7) continue; const u = E.outC(d / 0.7); st(CYA, 1.5, (1 - u) * 0.9); ARC(tg.x, tg.y, 70 + u * 200, 0, Math.PI * 2); }
    }
    if (t < LOCK + 0.07) {
      // lock-progress ring (inside the box, subordinate to the brackets) fills with an accelerating ease → full on the settle
      const fillU = E.inQ(prog(t, tb, stl - tb)), nLit = Math.floor(36 * fillU + 1e-6), rp = 92;
      if (t < LOCK && !NOLINK.has('reticle')) for (let q = 0; q < 36; q++) {
        const a0 = -Math.PI / 2 + q * Math.PI / 18, lit = q < nLit, hot = q === nLit - 1 && nLit < 36;
        st(hot ? HOT : lit ? CYA : DIM, lit ? 3 : 1.5, (lit ? 0.8 : 0.5) * a); ARC(tg.x, tg.y, rp, a0 + 0.03, a0 + Math.PI / 18 - 0.05);
      }
      // corner tags ride the brackets, each on an ink plate
      // after the impact the tags stay pinned to the 260 px box (the brackets shrink away from them) and fade in 2 frames
      const la = a * sstep(300, 230, hx) * (t < LOCK ? 1 : 1 - prog(t, LOCK + 1 / 30, 0.04)), [j0x, j0y] = ofs(0), [j1x, j1y] = ofs(1), [j2x, j2y] = ofs(2), [j3x, j3y] = ofs(3);
      const hxT = Math.max(hx, 130), hyT = Math.max(hy, 130);
      if (la > 0.01) {
        const tag = (s, x, y, o) => { const w = TW(s, o), x0 = o.al === 'right' ? x - w : x; fl(INK, 0.75 * la); ctx.fillRect(x0 - 6, y - o.s + 1, w + 12, o.s + 7); T(s, x, y, { ...o, a: la }); };
        const pct = String(Math.min(100, Math.floor(fillU * 100 + 1e-6))).padStart(3, '0');
        tag('TGT-03', tg.x - hxT + j0x, tg.y - hyT + j0y - 14, { f: RAJ, w: 700, s: 17, ls: 2 });
        tag(`LOCK ${pct}%`, tg.x + hxT + j1x, tg.y - hyT + j1y - 14, { s: 17, w: 600, al: 'right', c: fillU >= 1 ? HOT : CYA });
        if (t < LOCK) tag(`T−${Math.max(0, LOCK - t).toFixed(2)} S`, tg.x - hxT + j3x, tg.y + hyT + j3y + 27, { s: 16, w: 500, c: CYA });
        tag(`MATCH ${roll(t, tb, '99.7', 91, 6) ?? ''}%`, tg.x + hxT + j2x, tg.y + hyT + j2y + 27, { s: 16, w: 600, al: 'right', c: HOT });
      }
    }
  }
}

// ---------- lock banner: rules + titles slam clean on the impact; the dark strip only opens after the dive lands (7.10)
function banner(t, S) {
  if (t < LOCK) return;
  const w = E.outE(prog(t, LOCK, 0.3)) * 470, gap = 96, hh = 66;
  const pulse = Math.max(...[LOCK, ...K.alert_pulses].map((p) => (t >= p ? Math.exp(-(t - p) * 7) : 0)));
  const wp = E.outE(prog(t, K.band_open, 0.32)) * 470;
  if (wp > gap) {
    fl(INK, 0.74); ctx.fillRect(CX - wp, CY - hh, wp - gap, hh * 2); ctx.fillRect(CX + gap, CY - hh, wp - gap, hh * 2);
    knock(CX - wp, CY - hh, wp - gap, hh * 2, 0.9); knock(CX + gap, CY - hh, wp - gap, hh * 2, 0.9);
    ctx.save(); ctx.beginPath(); ctx.rect(CX - wp, CY - hh, 34, hh * 2); ctx.rect(CX + wp - 34, CY - hh, 34, hh * 2); ctx.clip();
    st(CYA, 5, 0.35 + 0.4 * pulse); for (let k = -10; k < 20; k++) { const xx = CX - wp + k * 14; L(xx, CY + hh, xx + hh * 2, CY - hh); const x2 = CX + wp - 34 + k * 14 - 150; L(x2, CY + hh, x2 + hh * 2, CY - hh); }
    ctx.restore();
  }
  st(CYA, 1.5, 0.9 + 0.1 * pulse); L(CX - w, CY - hh + 0.5, CX + w, CY - hh + 0.5); L(CX - w, CY + hh - 0.5, CX + w, CY + hh - 0.5);
  st(CYA, 4, 1); L(CX - w, CY - hh - 3, CX - w + 60, CY - hh - 3, w / 470); L(CX + w, CY + hh + 3, CX + w - 60, CY + hh + 3, w / 470);
  // titles: LOCKED + 目标锁定 land clean on the impact frame (scale 1.15 → 1 over 3 frames, first frame white-hot); only the small lines scramble
  const k = E.outE(prog(t, LOCK, 0.1)), sc = lerp(1.15, 1, k), c1 = F(t) === F(LOCK) ? HOT : CYA;
  ctx.save(); ctx.translate(CX, CY); ctx.scale(sc, sc); ctx.translate(-CX, -CY);
  T(scramble(t, LOCK, REEL ? 'SIGNAL' : 'TARGET', 404, 6), CX + gap + 30, CY - 34, { f: RAJ, w: 700, s: 17, ls: 9, c: c1 });
  T('LOCKED', CX + gap + 26, CY + 30, { f: CHK, w: 600, s: 60, ls: 5, c: c1 });
  T(scramble(t, LOCK, '警报 · ALERT 03', 405, 6), CX - gap - 30, CY - 34, { f: HOS, w: 500, s: 15, ls: 3, al: 'right', c: c1 });
  T(REEL ? '信号锁定' : '目标锁定', CX - gap - 28, CY + 30, { f: HOS, w: 900, s: 58, ls: 7, al: 'right', c: c1 });
  ctx.restore();
  // coordinates (typewriter) under the band
  const coord = REEL ? 'S77°32′  E167°09′' : 'N31°14′  E121°29′', cw = TW(coord, { s: 26, w: 500, ls: 2 });
  const ty = typed(t, K.coords, coord, 34);
  if (ty) {
    const pk = E.outE(prog(t, K.coords - 0.08, 0.24)), pw = 236 * pk, py0 = CY + hh + 12, py1 = CY + hh + 102, ch = 12;
    if (pw > 2) {
      ctx.beginPath(); ctx.moveTo(CX - pw + ch, py0); ctx.lineTo(CX + pw - ch, py0); ctx.lineTo(CX + pw, py0 + ch); ctx.lineTo(CX + pw, py1);
      ctx.lineTo(CX - pw, py1); ctx.lineTo(CX - pw, py0 + ch); ctx.closePath(); fl(INK, 0.86); ctx.fill();
      st(DIM, 1, 0.9); ctx.stroke(); knock(CX - pw, py0, pw * 2, py1 - py0, 0.95);
      st(CYA, 2, 1); L(CX - pw, py1 + 3, CX - pw + 28, py1 + 3); L(CX + pw, py1 + 3, CX + pw - 28, py1 + 3);
      st(CYA, 1, 0.5); L(CX - 1.5, py0, CX - 1.5, py0 - 12 * pk); L(CX + 1.5, py0, CX + 1.5, py0 - 12 * pk);
    }
    T('COORD · 坐标', CX, CY + hh + 31, { f: HOS, w: 500, s: 14, ls: 3, al: 'center', c: DIM });
    T(ty, CX - cw / 2, CY + hh + 64, { s: 26, w: 500, ls: 2, c: HOT });
    if (blink(t, 2.5) || ty.length < coord.length) T('█', CX - cw / 2 + TW(ty, { s: 26, w: 500, ls: 2 }) + 6, CY + hh + 63, { s: 22, c: CYA });
    const r2 = typed(t, K.coords + 0.5, `RNG ${(1648.3 - (t - LOCK) * 23.7).toFixed(1)} KM · CONF 99.7 % · TRK 03`, 60);
    T(r2, CX, CY + hh + 91, { s: 14, al: 'center', c: DIM });
  }
}

// ---------- DATA LIVE act: main-sweep returns on the globe (become CND-01/02/03) + KESTREL-9 ground track (3.40)
function sweepBlips(t, S) {
  if (t < K.sweep[0] || t > 4.9) return;
  const brg = K.radar_theta0_deg + 180 * (t - K.radar_start), fade = 1 - sstep(4.45, 4.85, t);
  [S.cnd[0], S.cnd[1], S.target].forEach((c, i) => {
    const vis = sstep(0.03, 0.16, c.face) * fade; if (vis <= 0.01) return;
    const bb = (Math.atan2(c.y - CY, c.x - CX) / DEG + 90 + 360) % 360;
    const first = K.radar_start + (((bb - K.radar_theta0_deg) % 360) + 360) % 360 / 180; if (t < first) return;
    const since = (((brg - bb) % 360) + 360) % 360 / 180, I = Math.exp(-since * 2.2), a = vis * (0.35 + 0.65 * I);
    fl(HOT, a); ctx.fillRect(c.x - 3, c.y - 3, 6, 6);
    st(CYA, 1.5, vis * I); ARC(c.x, c.y, 7 + (1 - I) * 16, 0, Math.PI * 2);
    st(CYA, 1, 0.7 * a); L(c.x + 6, c.y - 6, c.x + 16, c.y - 16); L(c.x + 16, c.y - 16, c.x + 30, c.y - 16);
    const s = scramble(t, first, `UNK-0${i + 1}`, 120 + i, 5);
    const tw = TW(s, { f: RAJ, w: 700, s: 15, ls: 2 }); fl(INK, 0.75 * vis); ctx.fillRect(c.x + 30, c.y - 31, tw + 10, 21);
    T(s, c.x + 35, c.y - 15, { f: RAJ, w: 700, s: 15, ls: 2, c: I > 0.5 ? HOT : CYA, a: vis });
  });
}
function groundTrack(t, S) {
  const s = S.sat; if (!s || t < K.ground_track) return;
  const vis = 1 - sstep(5.5, 5.9, t); if (vis <= 0) return;
  const p = E.outC(prog(t, K.ground_track, 0.6)), fa = (q) => sstep(0.0, 0.2, q.face);
  // track: past solid, future dashed, drawn outward from the satellite in both directions
  for (const fut of [false, true]) {
    ctx.setLineDash(fut ? [7, 7] : []); ctx.lineDashOffset = -t * 30;
    for (let i = 1; i < s.trk.length; i++) {
      const a0 = s.trk[i - 1], a1 = s.trk[i]; if ((a1.a > 0) !== fut) continue;
      const lim = fut ? 0.9 : 1.7; if (Math.abs(a1.a) > lim * p) continue;
      const al = Math.min(fa(a0), fa(a1)) * vis; if (al <= 0.01) continue;
      st(fut ? CYA : HOT, fut ? 1.2 : 1.6, al * (fut ? 0.6 : 0.8)); L(a0.x, a0.y, a1.x, a1.y);
    }
  }
  ctx.setLineDash([]);
  const sv = sstep(0.0, 0.2, s.face) * vis * sstep(K.ground_track, K.ground_track + 0.12, t); if (sv <= 0.01) return;
  // footprint + sensor cone
  ctx.beginPath(); s.fp.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath();
  fl(CYA, 0.08 * sv); ctx.fill(); st(CYA, 1.2, 0.75 * sv); ctx.stroke();
  st(CYA, 1, 0.45 * sv); L(s.x, s.y, s.fp[8].x, s.fp[8].y); L(s.x, s.y, s.fp[24].x, s.fp[24].y);
  ctx.setLineDash([2, 4]); st(HOT, 1, 0.6 * sv); L(s.x, s.y, s.nad.x, s.nad.y); ctx.setLineDash([]);
  // satellite glyph: body + panels, oriented along track
  const i0 = s.trk.findIndex((q) => q.a >= 0), q0 = s.trk[Math.max(0, i0 - 1)], q1 = s.trk[Math.min(s.trk.length - 1, i0 + 1)];
  const an = Math.atan2(q1.y - q0.y, q1.x - q0.x);
  ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(an);
  fl(HOT, sv); ctx.fillRect(-4, -4, 8, 8); st(CYA, 2, sv); L(0, -6, 0, -18); L(0, 6, 0, 18); st(CYA, 5, sv); L(-3, -13, 3, -13); L(-3, 13, 3, 13);
  ctx.restore();
  const pg = t - K.ground_track; if (pg < 0.5) { st(HOT, 1.5, (1 - pg / 0.5) * sv); ARC(s.x, s.y, 10 + 60 * E.outC(pg / 0.5), 0, Math.PI * 2); }
  const lx = s.x + 24, ly = s.y - 30, nm = scramble(t, K.ground_track, 'KESTREL-9', 131, 6);
  st(CYA, 1, 0.8 * sv); L(s.x + 8, s.y - 8, lx - 4, ly + 6); L(lx - 4, ly + 6, lx + 140, ly + 6);
  fl(INK, 0.75 * sv); ctx.fillRect(lx - 2, ly - 16, 146, 42);
  T(nm, lx + 2, ly, { f: RAJ, w: 700, s: 17, ls: 2, c: HOT, a: sv });
  T('隼眼-9 · 512 KM', lx + 2, ly + 22, { f: HOS, w: 500, s: 14, ls: 1, c: CYA, a: sv * flick(t, K.ground_track + 0.1) });
}
// dive: radial speed streaks rush past inside the scope while the camera falls (strongest at the kick)
function diveStreaks(t) {
  const d = t - LOCK; if (d < 0.03 || d > 1.2) return;
  const sp = (1 - d / 1.2) ** 2;
  for (let i = 0; i < 44; i++) {
    const u = (hash(i, 1) + d * (1.3 + 0.9 * hash(i, 2))) % 1, an = hash(i, 3) * Math.PI * 2;
    const r = SS * (40 + 250 * u ** 1.5), len = SS * (14 + 90 * u) * sp, a = sp * Math.sin(Math.PI * u) * 0.8;
    if (Math.abs(Math.sin(an)) * r < 70 && t > K.band_open) continue;
    if (V5 && Math.abs(Math.sin(an)) * r < BH + 12) continue;
    st(hash(i, 4) > 0.7 ? HOT : CYA, 1.4, a);
    L(CX + Math.cos(an) * r, CY + Math.sin(an) * r, CX + Math.cos(an) * (r + len), CY + Math.sin(an) * (r + len));
  }
}

// ---------- post-dive map intelligence: city markers + sea tracks projected from the hologram
function clearOf(x, y) {   // signed clearance from the band, the coord plate and the scope edge → 0..1 visibility
  const dx = x - CX, dy = y - CY;
  const dBand = V5 ? Math.max(Math.abs(dy) - BH - 18, Math.abs(dx) - BW - 10) : Math.max(Math.abs(dy) - 84, Math.abs(dx) - 480), dPlate = V5 ? Math.max(BH - dy, dy - BH - 114, Math.abs(dx) - 248) : Math.max(66 - dy, dy - 180, Math.abs(dx) - 248), dScope = 292 * SS - Math.hypot(dx, dy);
  return Math.min(dBand, dPlate, dScope) > 10 ? 1 : 0;
}
function mapIntel(t, S) {
  if (t < 7.05 || !S.cities) return;
  S.cities.forEach((c, n) => {
    const t0 = 7.1 + 0.12 * n, a = flick(t, t0) * clearOf(c.x, c.y) * sstep(0.1, 0.3, c.face);
    if (a <= 0.01) return;
    const k = E.outE(prog(t, t0, 0.3)), sx = c.x < CX ? -1 : 1, sy = c.y < CY ? -1 : 1, x = c.x, y = c.y;
    st(HOT, 1.25, a); ctx.strokeRect(x - 3.5, y - 3.5, 7, 7); fl(HOT, a); ctx.fillRect(x - 1, y - 1, 2, 2);
    st(CYA, 1, 0.8 * a); const ex = x + sx * 14 * k, ey = y + sy * 14 * k; L(x + sx * 4, y + sy * 4, ex, ey); L(ex, ey, ex + sx * 40 * k, ey);
    if (k > 0.6) {
      const al = sx < 0 ? 'right' : 'left', lx = ex + sx * 4, iw = TW(c.id, { f: RAJ, w: 700, s: 15, ls: 2 }) + 8;
      const cw2 = TW(c.cn, { f: HOS, w: 500, s: 14 }), pw = iw + cw2 + 10;
      fl(INK, 0.75 * a); ctx.fillRect(sx < 0 ? lx - pw + 4 : lx - 5, ey - 21, pw, 39);
      T(c.id, lx, ey - 5, { f: RAJ, w: 700, s: 15, ls: 2, al, a });
      T(c.cn, lx + sx * iw, ey - 5, { f: HOS, w: 500, s: 14, al, a, c: HOT });
      T(`${roll(t, t0 + 0.1, String(CITY_KM[c.id] ?? 0).padStart(3, '0'), 70 + n, 5) ?? ''} KM`, lx, ey + 13, { s: 14, w: 500, al, c: CYA, a: a * 0.8 });
    }
  });
  S.tracks.forEach((c, n) => {
    const t0 = 7.35 + 0.1 * n, a = flick(t, t0) * clearOf(c.x, c.y) * sstep(0.1, 0.3, c.face);
    if (a <= 0.01) return;
    const hx = c.x - c.bx, hy = c.y - c.by, hl = Math.hypot(hx, hy) || 1, ux = hx / hl, uy = hy / hl;
    // wake: fading dots behind, then chevron pointing along heading
    for (let i = 1; i <= 5; i++) { fl(CYA, a * (0.7 - i * 0.12)); ctx.fillRect(c.x - ux * i * 7 - 1, c.y - uy * i * 7 - 1, 2, 2); }
    st(HOT, 1.5, a); ctx.beginPath(); ctx.moveTo(c.x + ux * 7, c.y + uy * 7); ctx.lineTo(c.x - ux * 4 - uy * 5, c.y - uy * 4 + ux * 5);
    ctx.lineTo(c.x - ux * 1.5, c.y - uy * 1.5); ctx.lineTo(c.x - ux * 4 + uy * 5, c.y - uy * 4 - ux * 5); ctx.closePath(); ctx.stroke();
    st(CYA, 1, 0.45 * a); L(c.x + ux * 10, c.y + uy * 10, c.x + ux * 30, c.y + uy * 30);   // velocity vector
    fl(INK, 0.75 * a); ctx.fillRect(c.x + 8, c.y - 26, 64, 34);
    T(c.id, c.x + 12, c.y - 11, { f: RAJ, w: 700, s: 14, ls: 1.5, a: a * 0.95 });
    T(`${String(c.kn).padStart(2, '0')} KN`, c.x + 12, c.y + 4, { s: 13, w: 500, c: CYA, a: a * 0.8 });
  });
}

// ?reel=1: the signal source is the showreel's coral dot (the reel's protagonist); it later flies out to become the decimal of "5.5"
function beacon(t, S) {
  const tg = S.target, a = clamp((t - 5.8) / 0.25), lk = t >= LOCK ? Math.exp(-(t - LOCK) / 0.12) : 0;
  const r = 13 * (1 + 0.6 * lk) * (1 + 0.08 * Math.sin((t - LOCK) * Math.PI * 4));
  ctx.save(); ctx.globalAlpha = a;
  const g = ctx.createRadialGradient(tg.x, tg.y, r * 0.5, tg.x, tg.y, r * 5); g.addColorStop(0, 'rgba(255,90,78,0.55)'); g.addColorStop(1, 'rgba(255,90,78,0)');
  ctx.fillStyle = g; ctx.fillRect(tg.x - r * 5, tg.y - r * 5, r * 10, r * 10);
  for (let k = 0; k < 2; k++) { const ph = ((t - 5.8) * 2 + k * 0.5) % 1; ctx.strokeStyle = `rgba(255,120,100,${0.6 * (1 - ph)})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(tg.x, tg.y, r + ph * 46, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = '#FF5A4E'; ctx.beginPath(); ctx.arc(tg.x, tg.y, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
// ---------- reel v5 (?v5=1): taller/wider lock band that carries the style-name title (drawn by v5.js on its own layer)
function bannerV5(t, S) {
  if (t < LOCK) return;
  const w = E.outE(prog(t, LOCK, 0.3)) * BW, hh = BH, gp = BG - 22;
  const pulse = Math.max(...[LOCK, ...K.alert_pulses].map((p) => (t >= p ? Math.exp(-(t - p) * 7) : 0)));
  const wp = plateW(t);
  if (wp > gp) {   // ink plate (centre gap keeps the reticle clear); dimmer during the dive so the coast still rushes through
    const pa = t < K.band_open ? 0.62 : 0.8;
    fl(INK, pa); ctx.fillRect(CX - wp, CY - hh, wp - gp, hh * 2); ctx.fillRect(CX + gp, CY - hh, wp - gp, hh * 2);
    knock(CX - wp, CY - hh, wp - gp, hh * 2, 0.92); knock(CX + gp, CY - hh, wp - gp, hh * 2, 0.92);
  }
  st(CYA, 1.5, 0.9 + 0.1 * pulse); L(CX - w, CY - hh + 0.5, CX + w, CY - hh + 0.5); L(CX - w, CY + hh - 0.5, CX + w, CY + hh - 0.5);
  st(CYA, 4, 1); L(CX - w, CY - hh - 3, CX - w + 80, CY - hh - 3, w / BW); L(CX + w, CY + hh + 3, CX + w - 80, CY + hh + 3, w / BW);
  // data ticks under the bottom rule, running out from the centre with the rules
  for (let d = 10; d <= w; d += 10) { const big = d % 50 === 0; st(big ? CYA : DIM, 1, big ? 0.9 : 0.6); for (const sx of [-1, 1]) L(CX + sx * d + 0.5, CY + hh, CX + sx * d + 0.5, CY + hh + (big ? 9 : 5)); }
  // the lock beat survives as small captions over the title words (信号锁定 / SIGNAL LOCKED)
  const c1 = F(t) === F(LOCK) ? HOT : CYA, cy = titleMetrics().top - 20;
  T(scramble(t, LOCK, 'SIGNAL LOCKED', 404, 6), CX + BG + 2, cy, { f: RAJ, w: 700, s: 28, ls: 8, c: c1 });
  T(scramble(t, LOCK, '信号锁定 · ALERT 03', 405, 6), CX - BG - 2, cy, { f: HOS, w: 500, s: 28, ls: 4, al: 'right', c: c1 });
  // data ticks right of HUD: readouts flicker/roll in after the impact (balances the lockup against the four CJK glyphs)
  { const m = titleMetrics(), x0 = m.r + 44, x1 = CX + BW - 52;
    [['TRK', 'SIG-03', 0.1], ['LOCK', '100%', 0.16], ['MATCH', '99.7%', 0.22], ['CONF', 'A+', 0.28]].forEach(([lab, v, dt], i) => {
      const t0 = LOCK + dt, a = flick(t, t0); if (!a) return; const yy = Math.round(m.top) + 24 + i * 40;
      T(lab, x0, yy, { f: RAJ, w: 600, s: 20, ls: 3, c: DIM, a });
      T(roll(t, t0, v, 140 + i, 5) ?? '', x1, yy, { s: 24, w: 600, al: 'right', c: i === 1 ? HOT : CYA, a });
      st(DEEP, 1, a); L(x0, yy + 11.5, x1, yy + 11.5); st(CYA, 2, a); L(x0, yy + 11, x0 + (x1 - x0) * E.outC(prog(t, t0, 0.3)) * [0.4, 1, 0.997, 0.8][i], yy + 11);
    }); }
  // coordinates (typewriter) under the band — as v4, moved down with the band
  const coord = 'S77°32′  E167°09′', cw = TW(coord, { s: 26, w: 500, ls: 2 });
  const ty = typed(t, K.coords, coord, 34);
  if (ty) {
    const pk = E.outE(prog(t, K.coords - 0.08, 0.24)), pw = 236 * pk, py0 = CY + hh + 16, py1 = CY + hh + 106, ch = 12;
    if (pw > 2) {
      ctx.beginPath(); ctx.moveTo(CX - pw + ch, py0); ctx.lineTo(CX + pw - ch, py0); ctx.lineTo(CX + pw, py0 + ch); ctx.lineTo(CX + pw, py1);
      ctx.lineTo(CX - pw, py1); ctx.lineTo(CX - pw, py0 + ch); ctx.closePath(); fl(INK, 0.86); ctx.fill();
      st(DIM, 1, 0.9); ctx.stroke(); knock(CX - pw, py0, pw * 2, py1 - py0, 0.95);
      st(CYA, 2, 1); L(CX - pw, py1 + 3, CX - pw + 28, py1 + 3); L(CX + pw, py1 + 3, CX + pw - 28, py1 + 3);
    }
    T('COORD · 坐标', CX, py0 + 19, { f: HOS, w: 500, s: 14, ls: 3, al: 'center', c: DIM });
    T(ty, CX - cw / 2, py0 + 52, { s: 26, w: 500, ls: 2, c: HOT });
    if (blink(t, 2.5) || ty.length < coord.length) T('█', CX - cw / 2 + TW(ty, { s: 26, w: 500, ls: 2 }) + 6, py0 + 51, { s: 22, c: CYA });
    const r2 = typed(t, K.coords + 0.5, `RNG ${(1648.3 - (t - LOCK) * 23.7).toFixed(1)} KM · CONF 99.7 % · TRK 03`, 60);
    T(r2, CX, py0 + 79, { s: 14, al: 'center', c: DIM });
  }
}
// v5 beacon: the reel's coral dot. Boot seed at the centre (the CRT opens around it, it fires the range ping at 0.12 and
// shrinks into the crosshair pip by 0.45); from 5.80 it pops onto the signal source (the brackets hunt it from 5.90).
export function beaconState(t, S) {
  if (t < 0.45) {
    const kick = t >= K.boot.frame ? 0.35 * Math.exp(-(t - K.boot.frame) / 0.05) : 0;
    const r = 13 * (1 + kick) * (1 - E.inQ(prog(t, 0.2, 0.25)));
    return r > 0.3 ? { x: CX, y: CY, r, a: 1, glow: 1 - prog(t, 0.2, 0.2), rings: 0, ph: 0 } : null;
  }
  if (t < 5.8) return null;
  const tg = S.target, d = t - 5.8, land = 0.3 * Math.exp(-d / 0.06), lk = t >= LOCK ? Math.exp(-(t - LOCK) / 0.12) : 0;
  const r = 13 * (1 + land) * (1 + 0.6 * lk) * (1 + 0.08 * Math.sin((t - LOCK) * Math.PI * 4));
  return { x: tg.x, y: tg.y, r, a: 1, glow: 1, rings: 1, ph: d };
}
function beaconV5(t, S) {
  const b = beaconState(t, S); if (!b) return;
  const { x, y, r } = b;
  ctx.save(); ctx.globalAlpha = b.a;
  if (b.glow > 0) { ctx.globalAlpha = b.a * b.glow; const g = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 5); g.addColorStop(0, 'rgba(255,90,78,0.55)'); g.addColorStop(1, 'rgba(255,90,78,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r * 5, y - r * 5, r * 10, r * 10); ctx.globalAlpha = b.a; }
  if (b.rings) for (let k = 0; k < 2; k++) { const ph = (b.ph * 2 + k * 0.5) % 1; ctx.strokeStyle = `rgba(255,120,100,${0.6 * (1 - ph)})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r + ph * 46, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = '#FF5A4E'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
// window.linkAt(t): link elements in 1920×1080 output px (pure function of t and the hologram state S = holo.update(t))
export function linksV5(t, S) {
  const out = [], tg = S.target;
  const b = beaconState(t, S);
  // visibility through the CRT: the power-on aperture opens from the centre line (0–0.3 s), the power-off squashes the
  // picture into the centre line / dot (9.767–9.967 s; sy = vertical squash of the whole picture)
  const cz = prog(t, K.power_off, 0.2), sy = cz > 0 ? Math.max(Math.pow(1 - Math.min(cz / 0.6, 1), 2.2), 0.003) : 1;
  const vis = clamp(E.outC(prog(t, 0, 0.3)) * 540 / 13) * (cz > 0 ? clamp(sy * 2) : 1);
  if (b) out.push({ id: 'dot', type: 'circle', x: b.x, y: b.y, r: b.r, a: b.a * vis, sy, look: 'flat', fill: '#FF5A4E', stroke: '#FF5A4E', sw: 0,
    glow: { color: '#FF5A4E', r: b.r * 5, a: 0.55 * b.glow }, note: t < 0.45 ? 'boot seed: coral pip at the crosshair, fires the range ping' : 'coral signal beacon (flat disc + radial glow + 2 pulse rings), locked by the HUD' });
  if (t >= K.brackets_in && t < LOCK) {
    const a = Math.max(flick(t, K.brackets_in), 0.8);
    out.push({ id: 'reticle', type: 'circle', x: tg.x, y: tg.y, r: 92, a, look: 'hud', fill: 'none', stroke: '#00E5FF', sw: 3, note: 'lock-progress ring: 36 segments, fills cyan 5.90→6.33' });
  } else if (t >= LOCK) {
    const pk = Math.max(...K.alert_pulses.map((p) => (t >= p ? Math.exp(-(t - p) * 10) : 0)));
    out.push({ id: 'reticle', type: 'circle', x: tg.x, y: tg.y, r: 30 + 6 * pk, a: E.outC(prog(t, LOCK, 0.4)), look: 'hud', fill: 'none', stroke: '#FF2A8A', sw: 1.5, note: 'lock ring: 4 spinning arcs + centre diamond (alert ink)' });
  }
  const p1 = E.outC(prog(t, K.boot.ring_outer, 0.5));
  if (p1 > 0) out.push({ id: 'scope', type: 'circle', x: CX, y: CY, r: 318 * SS * (1 + 0.62 * DIVE(t) + PUSH(t)), a: p1, look: 'hud', fill: 'none', stroke: t >= LOCK ? '#FF2A8A' : '#00E5FF', sw: 1.25 * SS, note: 'outer scope ring (4 rotating arcs); draws on 0.40–0.90, flies past the lens in the dive 6.43–7.10' });
  if (t >= LOCK) {
    const w = E.outE(prog(t, LOCK, 0.3)) * BW;
    out.push({ id: 'rule-top', type: 'line', x0: CX - w, y0: CY - BH + 0.5, x1: CX + w, y1: CY - BH + 0.5, w: 1.5, a: 1, note: 'title band top rule (shoots out from the centre on the lock)' });
    out.push({ id: 'rule-bot', type: 'line', x0: CX - w, y0: CY + BH - 0.5, x1: CX + w, y1: CY + BH - 0.5, w: 1.5, a: 1, note: 'title band bottom rule + data ticks' });
    const m = titleMetrics(), sc = slamScale(t), cx = (m.l + m.r) / 2, cy = (m.top + m.bot) / 2;
    out.push({ id: 'title', type: 'rect', x: CX + (cx - CX) * sc, y: CY + (cy - CY) * sc, w: (m.r - m.l) * sc, h: (m.bot - m.top) * sc, rot: 0, a: 1, note: '「赛博朋克」 ● HUD title lockup (glyph ink box, the dot sits in the gap)' });
  }
  return out;
}
export function drawHUD(t, S, mode = 'all') {
  const main = ctx; if (mode === 'txt') ctx = sctx; TXT_ON = mode !== 'geo';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.filter = 'none';
  ctx.clearRect(0, 0, W, H);
  if (TXT_ON) { tctx.setTransform(dpr, 0, 0, dpr, 0, 0); tctx.filter = 'none'; tctx.clearRect(0, 0, W, H); }
  ctx.globalAlpha = 1; ctx.lineJoin = 'miter'; GA = 1;
  const sg = SURGE(t), dv = DIVE(t), dx = 120 * dv, bl = 4 * dv;
  frameCorners(t);
  ctx.save(); ctx.translate(0, -46 * dv); blurLayer(2 * dv, () => topBar(t, S)); ctx.restore();
  scope(t, S); sweepBlips(t, S); groundTrack(t, S);
  // near plane: side columns slide outward + defocus on the lock kick (parallax vs. the scope)
  for (const [fn, sx] of [[leftCol, -1], [rightCol, 1]]) {
    ctx.save(); ctx.translate(sx * dx, 0); blurLayer(bl, () => fn(t, S)); ctx.restore(); GA = 1;
  }
  ctx.save(); ctx.translate(0, 46 * dv); blurLayer(2 * dv, () => tape(t, S)); ctx.restore(); mapIntel(t, S); diveStreaks(t); if (V5) bannerV5(t, S); else banner(t, S); acquire(t, S);
  if (V5) { if (mode !== 'txt' && !NOLINK.has('dot')) beaconV5(t, S); }
  else if (REEL && mode !== 'txt' && t >= 5.8) beacon(t, S);
  ctx.globalAlpha = 1; tctx.globalAlpha = 1; ctx.filter = 'none'; ctx = main; TXT_ON = true; KC = false;
  return { surge: sg, dive: dv, scopeR: 322 * SS * (1 + 0.62 * dv + PUSH(t)) };
}
