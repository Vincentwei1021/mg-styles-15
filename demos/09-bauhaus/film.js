// 09-bauhaus — KONSTRUKTION · 20 SCHLÄGE   (refinement round 1)
// Canvas2D ink-separation plates (knockout) -> WebGL press pass (paper, misregistration, tooth, cascade).
// Cascade (6-8 s) is done in the shader as a two-sided card system: FRONT = poster + poster-derived field,
// BACK = giant ▲■● triad on a black ground. R1 turns 120 tiles, R2 flips 240 cards to the back, R3 slides
// columns, R4 flips the cards home converging on the frame centre. Every frame is a pure function of t.
const W = 1920, H = 1080, M = 120, Y0 = 60, CX = 960, CY = 540;
window.DEMO = { width: W, height: H, fps: 30, duration: 10, motionBlur: { samples: 8, shutter: 0.5 } };
const Q = new URLSearchParams(location.search);
const MB = +(Q.get('mb') || window.DEMO.motionBlur.samples);          // harness samples per frame (slice for in-shader taps)
// reel v5 (?v5=1): title bar 几何构成 · 包豪斯 on the poster + window.linkAt(t); ?nolink=dot,disc2,rule,pivot hides link
// elements. Without v5 every code path below is the v4 film, unchanged.
const V5 = Q.get('v5') === '1';
const NOLINK = new Set(V5 ? (Q.get('nolink') || '').split(',').map(s => s.trim()).filter(Boolean) : []);
const BASE = '/demos/09-bauhaus/';
const cues = await (await fetch(BASE + 'cues.json')).json();
const EV = Object.fromEntries(cues.events.map(e => [e.id, e]));
const RP = Object.fromEntries(cues.ripples.map(r => [r.id, r]));
const DROP = cues.drop, FREEZE = cues.freeze;

// ---------------------------------------------------------------- easing / helpers
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const io2 = u => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);   // power2.inOut
const snap = t => Math.round(t * 30) / 30;   // frame-snapped time: gates for hard cuts, so mb sub-samples never straddle a cut
const in2 = u => u * u;                                                    // power2.in (drops land dead)
const prog = (t, t0, t1) => clamp((t - t0) / (t1 - t0));
const lerp = (a, b, u) => a + (b - a) * u;
const DEG = Math.PI / 180;

// ---------------------------------------------------------------- plates
function mk() { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; }
const cA = mk(), cB = mk(), cC = mk(), cD = mk();
const a = cA.getContext('2d', { alpha: false });
const b = cB.getContext('2d', { alpha: false });
// plate A: R = yellow, G = red, B = blue.   plate B: R = black.   (opaque colours => exact knockout)
const INK = { Y: ['#ff0000', '#000000'], R: ['#00ff00', '#000000'], B: ['#0000ff', '#000000'], K: ['#000000', '#ff0000'], P: ['#000000', '#000000'] };
let CT = [a, b];                       // current plate pair (front sheet a/b, back sheet c/d at init)
function paint(ink, path, rule = 'nonzero') {
  const [ca, cb] = INK[ink];
  if (ink !== 'K') { CT[0].fillStyle = ca; CT[0].beginPath(); path(CT[0]); CT[0].fill(rule); }   // black overprints (trap)
  CT[1].fillStyle = cb; CT[1].beginPath(); path(CT[1]); CT[1].fill(rule);
}
const both = (fn) => { fn(CT[0]); fn(CT[1]); };
const P = {
  circle: (cx, cy, r) => c => c.arc(cx, cy, r, 0, Math.PI * 2),
  ring: (cx, cy, r0, r1) => c => { c.arc(cx, cy, r1, 0, Math.PI * 2); c.moveTo(cx + r0, cy); c.arc(cx, cy, r0, 0, Math.PI * 2, true); },
  rect: (x, y, w, h) => c => c.rect(x, y, w, h),
  poly: (pts) => c => { c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); },
  sector: (px, py, r, a0) => c => { c.moveTo(px, py); c.arc(px, py, r, a0, a0 + Math.PI / 2); c.closePath(); },
  semi: (cx, cy, r, a0) => c => { c.moveTo(cx + r * Math.cos(a0), cy + r * Math.sin(a0)); c.arc(cx, cy, r, a0, a0 + Math.PI); c.closePath(); },
};
function text(ink, str, x, y, font, track = 0, align = 'left', base = 'alphabetic') {
  for (const [c, col] of (ink === 'K' ? [[CT[1], INK.K[1]]] : [[CT[0], INK[ink][0]], [CT[1], INK[ink][1]]])) {
    c.font = font; c.letterSpacing = track + 'px'; c.textAlign = align; c.textBaseline = base; c.fillStyle = col;
    c.fillText(str, x, y); c.letterSpacing = '0px'; c.textAlign = 'left';
  }
}

// ---------------------------------------------------------------- type metrics
let TYPE = null;
function measureType() {
  const f = (s) => `900 ${s}px "Poppins"`;
  a.font = f(100);
  const capH = a.measureText('H').actualBoundingBoxAscent / 100;
  const size = M / capH;                       // cap height = exactly one module
  a.font = f(size);
  const word = 'BAUHAUS'.split('');
  const m = word.map(ch => a.measureText(ch));
  const adv = m.map(x => x.width);
  const bbL0 = m[0].actualBoundingBoxLeft, bbRn = m[word.length - 1].actualBoundingBoxRight;
  let sumAdv = 0; for (let i = 0; i < word.length - 1; i++) sumAdv += adv[i];
  const len = 8 * M;                           // ink extent = exactly eight modules
  const track = (len - (bbL0 + sumAdv + bbRn)) / (word.length - 1);
  const xs = []; let x = bbL0; for (let i = 0; i < word.length; i++) { xs.push(x); x += adv[i] + track; }
  // caption: German words along the rotated baseline; each Chinese pair is centred on its German word
  a.font = '600 24px "Poppins"'; a.letterSpacing = '7.2px';
  const cap = ['FORM', ' · ', 'FARBE', ' · ', 'FUNKTION'];
  let o = 0; const mids = [];
  for (const w of cap) { const wd = a.measureText(w).width; if (w.trim().length > 1) mids.push(o + (wd - 7.2) / 2); o += wd; }
  a.letterSpacing = '0px';
  a.font = '600 13px "Poppins"'; a.letterSpacing = '2.6px';
  const dw = a.measureText('0').width, lw = a.measureText('SCHLAG ').width;
  a.letterSpacing = '0px';
  TYPE = { size, word, xs, track, mids, dw, lw };
}

// ---------------------------------------------------------------- composition (final coords)
const GT0 = EV.group_turn.t0, GT1 = EV.group_turn.t;
// 12-detent escapement: the eased progress is quantised into 7.5° teeth (move in the last 65 % of each tooth, then hold);
// the teeth land exactly on the audio ratchet ticks (io2_inv(k/12)); fast in the middle, visibly stepped at both ends.
function groupAngle(t) {
  const P_ = io2(prog(t, GT0, GT1)), x = P_ * 12, k = Math.min(12, Math.floor(x + 1e-9)), f = x - k;
  return (-90 + 7.5 * (k + io2(clamp((f - 0.35) / 0.65)))) * DEG;
}
const cascOn = t => { const q = snap(t); return q >= DROP && q < FREEZE; };

function target(x, y) {       // construction target (Passkreuz) that pre-announces a landing on the off-beat
  paint('K', P.ring(x, y, 21, 25));
  paint('K', P.rect(x - 44, y - 2, 32, 4)); paint('K', P.rect(x + 12, y - 2, 32, 4));
  paint('K', P.rect(x - 2, y - 44, 4, 32)); paint('K', P.rect(x - 2, y + 12, 4, 32));
  paint('K', P.circle(x, y, 4));
}

function drawGroup(t, opt = {}) {           // everything inside the central 8x8 square, drawn in final coordinates
  both(c => { c.save(); c.translate(CX, CY); c.rotate(groupAngle(t)); c.translate(-CX, -CY); });
  // off-beat construction targets (1.25 / 1.75 / 2.25 / 2.75): drawn first, the landing ink knocks them out
  for (let i = 1; i <= 4; i++) { const e = EV['target' + i]; if (snap(t) >= e.t && snap(t) < e.until) target(e.gx, e.gy); }
  const e1 = EV.circle_land;
  if (t >= e1.t0 && (opt.keepDot || !NOLINK.has('dot'))) {        // v5 ?nolink=dot: the red disc is not printed
    const u = in2(prog(t, e1.t0, e1.t));
    const dx = (1 - u) * 6 * M;
    const sl = io2(prog(t, EV.circle_slide.t0, EV.circle_slide.t));   // slides one module into contact
    paint('R', P.circle(840 + dx, 300 - M * (1 - sl), 240));
  }
  const e4 = EV.sq_scale;
  if (t >= e4.t0) {
    const s = io2(prog(t, e4.t0, e4.t));
    if (s > 0.001) paint('B', P.rect(1080, 300 - 240 * s, 240 * s + 4 * s, 240 * s));   // +4 px trap under the bar
  }
  const e3 = EV.tri_in, e3f = EV.tri_flip;
  if (t >= e3.t0) {
    const sy = t < e3.t ? -io2(prog(t, e3.t0, e3.t)) : lerp(-1, 1, io2(prog(t, e3f.t0, e3f.t)));
    const apexY = 1020 - 480 * sy;
    if (Math.abs(sy) > 0.002) paint('Y', P.poly([[600, 1020], [1080, 1020], [840, apexY]]));
  }
  const e2 = EV.bar_land;
  if (t >= e2.t0) {
    const u = in2(prog(t, e2.t0, e2.t));
    paint('K', P.rect(1320, 60, 120, 960 * u));
  }
  // pivot: dot + ring stamp the frame centre at 3.00 (ring leaves after the turn); dot is off during the cascade
  if (snap(t) >= EV.pivot.t && !opt.noRule && !cascOn(t)) {
    if (!NOLINK.has('pivot')) paint('K', P.circle(CX, CY, 20));
    const rr = io2(prog(t, EV.pivot.t, GT0));
    if (t < GT1 + 0.25 && rr > 0.001) paint('K', c => { const a0 = -Math.PI / 2, a1 = a0 + Math.PI * 2 * rr;
      c.arc(CX, CY, 60, a0, a1); c.arc(CX, CY, 56, a1, a0, true); c.closePath(); });
  }
  both(c => c.restore());
}

function drawOuter(t, opt = {}) {
  const e5 = EV.semi_slide;
  if (t >= e5.t0) {
    const u = io2(prog(t, e5.t0, e5.t));
    both(c => { c.save(); c.beginPath(); c.rect(1436, 0, W - 1436, H); c.clip(); });   // 4 px trap under the bar
    paint('B', P.semi(1436 - 240 * (1 - u), 780, 244, -90 * DEG));
    both(c => c.restore());
  }
  const e6 = EV.qd_sweep;
  if (t >= e6.t0) {
    const u = io2(prog(t, e6.t0, e6.t));
    both(c => { c.save(); c.beginPath(); c.rect(120, 60, 1680, 960); c.clip(); });   // r2: swing stays inside the trim
    paint('K', P.sector(600, 1020, 240, (90 + 90 * u) * DEG));
    both(c => c.restore());
  }
  // horizon rule y=540, x 360 -> trim (1800); off during the cascade (it would be torn by the remap), back on the freeze
  const er = EV.rule;
  if (t >= er.t0 && !opt.noRule && !cascOn(t) && !NOLINK.has('rule')) {
    const u = io2(prog(t, er.t0, er.t));
    paint('K', P.rect(360, 537, (1800 - 360) * u, 6));
  }
  // RED 2x2 square cuts in on the bar/horizon corner at 5.50; at 5.75 its outer corner is swept round by the compass:
  // it becomes a quarter-disc pivoting at (1440,540), stacked on the blue semicircle, touching bar and rule
  const e7 = EV.red_in, e7s = EV.red_split;
  if (snap(t) >= e7.t) {
    const r = 240 * io2(prog(t, e7s.t0, e7s.t));
    paint('R', c => { c.moveTo(1436, 540); c.lineTo(1436, 300); c.lineTo(1440, 300);
      if (r < 0.5) c.lineTo(1680, 300); else c.arcTo(1680, 300, 1680, 540, r);
      c.lineTo(1680, 540); c.closePath(); });
  }
  // black overprints: re-print the bar over the colour traps (semicircle / red quarter-disc tuck 4 px under it)
  if (t >= GT1) paint('K', P.rect(1320, 60, 120, 960));
  // ticker — black quarter-disc R120 pivoting at (480,180); the 4th tick lands on the last frame (360° = resolved)
  if (snap(t) >= EV.ticker_in.t) {
    let q = 0;
    for (const tt of cues.ticker.concat(cues.tickerVisualOnly || [])) q += io2(prog(t, tt - 0.25, tt));
    paint('K', P.sector(480, 180, 120, (180 + 90 * q) * DEG));
  }
}

// ---------------------------------------------------------------- front field: every empty cell inside the trim takes
// the ink and form of its nearest poster shape (red petals round the circle, yellow half-squares by the triangle,
// blue squares / half-discs by the square and semicircle, black stripes by the bar, black quarter-discs by the black discs)
const sdBox = (x, y, x0, y0, x1, y1) => { const dx = Math.max(x0 - x, 0, x - x1), dy = Math.max(y0 - y, 0, y - y1); return Math.hypot(dx, dy); };
function sdSeg(px, py, ax, ay, bx, by) { const vx = bx - ax, vy = by - ay; const h = clamp(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy));
  return Math.hypot(px - ax - vx * h, py - ay - vy * h); }
const SH = [
  { ink: 'R', form: 'qd', cx: 840, cy: 300, w: 1.6, d: (x, y) => Math.max(0, Math.hypot(x - 840, y - 300) - 240) },
  { ink: 'R', form: 'qd', cx: 1440, cy: 540, d: (x, y) => sdBox(x, y, 1440, 300, 1680, 540) },
  { ink: 'B', form: 'sq', cx: 1200, cy: 180, d: (x, y) => sdBox(x, y, 1080, 60, 1320, 300) },
  { ink: 'B', form: 'semi', cx: 1440, cy: 780, d: (x, y) => x < 1440 ? sdBox(x, y, 1440, 540, 1440, 1020) : Math.max(0, Math.hypot(x - 1440, y - 780) - 240) },
  { ink: 'Y', form: 'hst', cx: 840, cy: 860, d: (x, y) => Math.min(sdSeg(x, y, 600, 1020, 840, 540), sdSeg(x, y, 1080, 1020, 840, 540), sdSeg(x, y, 600, 1020, 1080, 1020)) },
  { ink: 'K', form: 'bar', cx: 1380, cy: 540, d: (x, y) => sdBox(x, y, 1320, 60, 1440, 1020) },
  { ink: 'K', form: 'qd', cx: 600, cy: 1020, d: (x, y) => sdBox(x, y, 360, 780, 600, 1020) },
];
let FIELD = [];
function buildField() {
  renderPlates(DROP - 0.001, { noField: true, noRule: true, keepDot: true });   // field never depends on ?nolink
  const da = a.getImageData(0, 0, W, H).data, db = b.getImageData(0, 0, W, H).data;
  const [tx0, ty0, tx1, ty1] = cues.trim;
  for (let r = 0; r < 8; r++) for (let c = tx0 / M; c < tx1 / M; c++) {
    let ink = 0;
    for (let y = Y0 + r * M + 3; y < Y0 + (r + 1) * M - 2; y += 5) for (let x = c * M + 3; x < (c + 1) * M - 2; x += 5) {
      const i = (y * W + x) * 4; ink = Math.max(ink, da[i], da[i + 1], da[i + 2], db[i]);
    }
    if (ink > 8) continue;
    const x0 = c * M, y0 = Y0 + r * M, mx = x0 + M / 2, my = y0 + M / 2;
    let best = SH[0], bd = 1e9;
    for (const s of SH) { const d = s.d(mx, my) / (s.w || 1); if (d < bd - 1e-6) { bd = d; best = s; } }
    const kx = best.cx < mx ? x0 : x0 + M, ky = best.cy < my ? y0 : y0 + M;   // cell corner facing the shape
    const form = best.ink === 'K' && best.form === 'qd' && (r + c) % 2 === 1 ? 'bar' : best.form;   // r2: lighten the black block
    FIELD.push({ x0, y0, kx, ky, mx, my, ink: best.ink, form, sx: best.cx, sy: best.cy });
  }
}
function drawFieldCell(f) {
  const { x0, y0, kx, ky, mx, my } = f;
  if (f.form === 'qd') {
    const a0 = kx === x0 ? (ky === y0 ? 0 : 270) : (ky === y0 ? 90 : 180);
    paint(f.ink, P.sector(kx, ky, M, a0 * DEG));
  } else if (f.form === 'hst') {
    paint(f.ink, P.poly([[kx, ky], [kx === x0 ? x0 + M : x0, ky], [kx, ky === y0 ? y0 + M : y0]]));
  } else if (f.form === 'sq') {
    paint(f.ink, P.rect(kx === x0 ? x0 : x0 + M / 2, ky === y0 ? y0 : y0 + M / 2, M / 2, M / 2));
  } else if (f.form === 'semi') {
    const hz = Math.abs(f.sx - mx) >= Math.abs(f.sy - my);
    if (hz) paint(f.ink, P.semi(kx, my, M / 2, (kx === x0 ? -90 : 90) * DEG));
    else paint(f.ink, P.semi(mx, ky, M / 2, (ky === y0 ? 0 : 180) * DEG));
  } else if (f.form === 'bar') {
    paint(f.ink, P.rect(kx === x0 ? x0 : x0 + M / 2, y0, M / 2, M));
  }
}
function drawField(t) { if (cascOn(t)) for (const f of FIELD) drawFieldCell(f); }

// ---------------------------------------------------------------- back sheet: the giant Kandinsky triad (static)
function drawBack(nLab = 3) {
  CT = [cC.getContext('2d', { alpha: false }), cD.getContext('2d', { alpha: false })];
  for (const c of CT) { c.fillStyle = '#000'; c.fillRect(0, 0, W, H); }
  const [x0, y0, x1, y1] = cues.trim;
  paint('K', P.rect(x0, y0, x1 - x0, y1 - y0));
  const tri = [[120, 780], [600, 780], [360, 300]];
  paint('Y', P.poly(tri));                                    // ▲ 4x4 modules
  paint('R', P.rect(720, 300, 480, 480));                     // ■ 4x4
  const disc2 = !NOLINK.has('disc2');                         // v5 ?nolink=disc2: the back-sheet blue disc is not printed
  if (disc2) paint('B', P.circle(1560, 540, 240));            // ● Ø 4 modules
  const cc = CT[0]; cc.lineJoin = 'miter'; cc.lineWidth = 5;  // trap: colour spreads 2.5 px over the knocked-out black
  cc.strokeStyle = INK.Y[0]; cc.beginPath(); P.poly(tri)(cc); cc.stroke();
  cc.strokeStyle = INK.R[0]; cc.beginPath(); cc.rect(720, 300, 480, 480); cc.stroke();
  if (disc2) { cc.strokeStyle = INK.B[0]; cc.beginPath(); P.circle(1560, 540, 240)(cc); cc.stroke(); }
  const lab = [['GELB', '黄', 360], ['ROT', '红', 960], ['BLAU', '蓝', 1560]];
  for (const [de, zh, x] of lab.slice(0, nLab)) {              // knocked-out labels (paper shows through), stamped on 7.0
    text('P', de, x - 8, 900, '600 24px "Poppins"', 7.2, 'right');
    text('P', zh, x + 16, 901, '700 26px "Noto Sans SC"', 0, 'left');
  }
  CT = [a, b];
}

function drawType(t) {
  if (!TYPE) return;
  const L = cues.letters;
  const tg = snap(t);
  const n = Math.min(L.n, Math.floor((tg - L.t0) / L.step + 1e-6) + 1);
  if (tg >= L.t0 && n > 0) {
    for (const [c, col] of [[a, INK.K[0]], [b, INK.K[1]]]) {
      c.save(); c.translate(240, 1020); c.rotate(-Math.PI / 2);
      c.font = `900 ${TYPE.size}px "Poppins"`; c.fillStyle = col; c.textBaseline = 'alphabetic';
      for (let i = 0; i < n; i++) c.fillText(TYPE.word[i], TYPE.xs[i], 0);
      c.restore();
    }
  }
  if (tg >= EV.type_small.t) {
    // German caption rotated with the headline (reads bottom -> top, baseline x = 291)
    for (const [c, k] of [[a, 0], [b, 1]]) {
      c.save(); c.fillStyle = INK.K[k]; c.translate(0, 1020); c.rotate(-Math.PI / 2);
      c.font = `600 24px "Poppins"`; c.letterSpacing = '7.2px'; c.textBaseline = 'alphabetic';
      c.fillText('FORM · FARBE · FUNKTION', 0, 291);
      c.letterSpacing = '0px'; c.restore();
    }
    // Chinese upright (竖排), each pair anchored beside its German word: 形式 | FORM, 色彩 | FARBE, 功能 | FUNKTION
    const zh = [['形', '式'], ['色', '彩'], ['功', '能']];
    zh.forEach((pr, i) => { const yc = 1020 - TYPE.mids[i];
      text('K', pr[0], 324, yc - 3, '700 26px "Noto Sans SC"', 0, 'center', 'alphabetic');
      text('K', pr[1], 324, yc + 27, '700 26px "Noto Sans SC"', 0, 'center', 'alphabetic'); });
    // Kandinsky key ▲ ■ ● (1923): yellow triangle, red square, blue circle — top of column 2
    paint('Y', P.poly([[264, 84 + 24], [288, 84 + 24], [276, 84]]));
    paint('R', P.rect(264, 120, 24, 24));
    paint('B', P.circle(276, 168, 12));
  }
}

// ---------------------------------------------------------------- reel v5 title: 几何构成 · 包豪斯
// A black title bar ruled over the two bottom rows (x 360-1800, y 780-1020 = 12 x 2 modules), joined to the vertical bar,
// carrying 几何构成 knocked out to paper and 包豪斯 in yellow ink (Alimama ShuHeiTi, 180 px em = 1.5 modules per glyph,
// cells 420-1140 / 1200-1740). With the vertical Poppins BAUHAUS it locks up as an L. It is printed on the FRONT sheet
// from the front reset (7.1, while every card shows its back), so the R4 cards turning home reveal it (7.5-7.92); it
// freezes with the poster at 8.0, drifts with the plates 8.5-9.47 and is struck into register by the 9.5 press lock.
const TB = { x0: 360, y0: 780, x1: 1800, y1: 1020, em: 180, font: '700 180px "Alimama ShuHeiTi"',
  cells: [['几', 420], ['何', 600], ['构', 780], ['成', 960], ['包', 1200], ['豪', 1380], ['斯', 1560]] };
let TBY = 0;                                                 // common baseline: ink of the 7 glyphs centred on y 900
function measureTitleV5() {
  a.font = TB.font; let A = 0, D = 0;
  for (const [g] of TB.cells) { const m = a.measureText(g); A = Math.max(A, m.actualBoundingBoxAscent); D = Math.max(D, m.actualBoundingBoxDescent); }
  TBY = (TB.y0 + TB.y1) / 2 + (A - D) / 2;
}
const titleOn = t => V5 && snap(t) >= cues.frontReset;
function drawTitleV5(t) {
  if (!titleOn(t)) return;
  CT = [a, b];
  a.fillStyle = '#000'; a.fillRect(TB.x0, TB.y0 + 4, TB.x1 - TB.x0, TB.y1 - TB.y0 + 4);   // colours under the bar knocked out (4 px trap;
  // +4 px below the trim so the semicircle's r 244 overhang does not peek out under the bar)
  paint('K', P.rect(TB.x0, TB.y0, TB.x1 - TB.x0, TB.y1 - TB.y0));
  TB.cells.forEach(([g, x], i) => text(i < 4 ? 'P' : 'Y', g, x + TB.em / 2, TBY, TB.font, 0, 'center'));
  a.font = TB.font; a.textAlign = 'center'; a.lineJoin = 'miter'; a.lineWidth = 5; a.strokeStyle = INK.Y[0];   // yellow spreads 2.5 px (trap)
  for (const [g, x] of TB.cells.slice(4)) a.strokeText(g, x + TB.em / 2, TBY);
  a.textAlign = 'left';
}

function drawMarks(t) {
  for (const y of [30, 1050]) { paint('K', P.ring(CX, y, 10, 11.5)); paint('K', P.rect(CX - 18, y - 0.75, 36, 1.5)); paint('K', P.rect(CX - 0.75, y - 18, 1.5, 36)); }
  if (snap(t) >= EV.marks.t) for (const [x, y, sx] of [[120, 60, -1], [1800, 60, 1], [120, 1020, -1], [1800, 1020, 1]]) {
    const sy = y < 540 ? -1 : 1;
    paint('K', P.rect(sx < 0 ? x - 40 : x + 12, y - 0.75, 28, 1.5));
    paint('K', P.rect(x - 0.75, sy < 0 ? y - 40 : y + 12, 1.5, 28));
  }
  const firsts = [['Y', EV.tri_in.t], ['R', EV.circle_land.t0 + 0.05], ['B', EV.sq_scale.t0 + 0.05], ['K', EV.bar_land.t0 + 0.05]];
  firsts.forEach(([ink, tt], i) => { if (snap(t) >= tt) paint(ink, P.rect(1500 + i * 30, 1043, 24, 14)); });
  const F = '600 13px "Poppins"';
  text('K', 'BOGEN 09 — KONSTRUKTION IN 20 SCHLÄGEN · 120 BPM · M = 120 PX', 152, 1050, F, 2.6, 'left', 'middle');
  text('K', 'KINETISCHES PLAKAT · Nº 09 · WEIMAR 1919', 1768, 30, F, 2.6, 'right', 'middle');
  // beat counter (steps on every beat; 20/20 lands with the press lock at 9.5)
  if (TYPE) {
    const n = clamp(Math.floor(snap(t) / cues.beat + 1e-6) + 1, 1, 20), s = String(n).padStart(2, '0');
    text('K', 'SCHLAG', 152, 30, F, 2.6, 'left', 'middle');
    for (let i = 0; i < 2; i++) text('K', s[i], 152 + TYPE.lw + i * TYPE.dw, 30, F, 2.6, 'left', 'middle');
    text('K', '/ 20', 152 + TYPE.lw + 2 * TYPE.dw + 6, 30, F, 2.6, 'left', 'middle');
  }
}

function renderPlates(t, opt = {}) {
  CT = [a, b];
  a.setTransform(1, 0, 0, 1, 0, 0); b.setTransform(1, 0, 0, 1, 0, 0);
  a.fillStyle = '#000'; a.fillRect(0, 0, W, H);
  b.fillStyle = '#000'; b.fillRect(0, 0, W, H);
  drawGroup(t, opt);
  drawOuter(t, opt);
  if (!opt.noField) drawField(t);
  drawTitleV5(t);
  drawType(t);
  drawMarks(t);
}

// ---------------------------------------------------------------- WebGL press pass
const out = document.getElementById('out');
const gl = out.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false });
const VS = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`;
const FS = `#version 300 es
precision highp float;
uniform sampler2D tA, tB, tPaper, tGrain, tC, tD;
uniform float t, frame, slice, casc, resetT, reg, dens0, spread;
uniform vec3 uCam;
uniform int taps;
uniform vec4 uR1, uR2, uR3, uR4; uniform vec2 uR1o;
uniform float gV[15]; uniform float gH[9]; uniform float wV[15]; uniform float wH[9];
out vec4 o;
const vec2 RES = vec2(1920.,1080.);
const float PI = 3.14159265;
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float ease(float u){ return u<.5 ? 2.*u*u : 1.-pow(-2.*u+2.,2.)*.5; }
float lineCov(float d, float w){ return clamp(w*.5 + .5 - abs(d), 0., 1.); }
bool inTrim(vec2 p){ return p.x >= 120. && p.x < 1800. && p.y >= 60. && p.y < 1020.; }
// Tiling / coverage are computed from the un-offset point q0 (all plates agree on tile membership -> no divergent
// slivers), the per-plate misregistered point q is only moved within its tile.
// R1: front 120 tiles turn about their own centres, radial wave from the circle centre
vec3 rotTile(vec2 q0, vec2 q, float tt){
  if (tt >= resetT || tt < uR1.x || !inTrim(q0)) return vec3(q, 1.);
  vec2 c = vec2(0.,60.) + (floor((q0 - vec2(0.,60.)) / 120.) + .5) * 120.;
  float u = clamp((tt - uR1.x - length(c - uR1o) * uR1.z) / uR1.y, 0., 1.);
  if (u <= 0.) return vec3(q, 1.);
  float th = uR1.w * ease(u);
  float cs = cos(th), sn = sin(th);
  float s = 1. / (abs(cs) + abs(sn));
  vec2 l0 = q0 - c, l = q - c;
  vec2 r0 = vec2(cs*l0.x + sn*l0.y, -sn*l0.x + cs*l0.y) / s;
  vec2 r  = vec2(cs*l.x + sn*l.y, -sn*l.x + cs*l.y) / s;
  float gap = smoothstep(0., .035, abs(sin(2.*th)));            // sub-pixel gaps (near 0 / 90 deg) are filled, not AA'd to a seam
  float cov = clamp((60. - max(abs(r0.x), abs(r0.y))) * s + .5 + (1. - gap), 0., 1.);
  float turned = min(1., abs(sn) * 20.);                         // tap clamp only once the tile is really turned
  float lim = 60. - .75 * turned + 4. * (1. - turned);
  return vec3(c + clamp(r, vec2(-lim), vec2(lim)), cov);
}
// R3 (r2): back-sheet column PAIRS (240 px) slide one module, alternating up/down, wave right -> left; the label
// strip (y 840-960) is a static band so GELB 黄 / ROT 红 / BLAU 蓝 never tear
vec2 slideCol(vec2 q0, vec2 q, float tt){
  if (tt < uR3.x || !inTrim(q0) || (q0.y >= 840. && q0.y < 960.)) return q;
  float col = floor((q0.x - 120.) / 240.);
  float cx = 240. + col * 240.;
  float u = clamp((tt - uR3.x - (1680. - cx) * uR3.z) / uR3.y, 0., 1.);
  if (u <= 0.) return q;
  float dir = mod(col, 2.) < .5 ? -1. : 1.;
  q.x = clamp(q.x, cx - 119.25, cx + 119.25);
  q.y = clamp(q.y - dir * uR3.w * ease(u), 61., 1019.);          // no wrap: the card edge rows are black ground
  if (q0.y < 840. && q.y >= 840.) q.y = 839.;                    // the static strip also masks what slides into it
  if (q0.y >= 960. && q.y < 960.) q.y = 960.;
  return q;
}
float face(bool back, vec4 sel, bool isK, vec2 q){
  vec2 uv = q / RES;
  return back ? (isK ? texture(tD, uv).r : dot(texture(tC, uv), sel)) : (isK ? texture(tB, uv).r : dot(texture(tA, uv), sel));
}
float gShade;   // card face shading of the last inkAt call (0 = flat)
// one plate's ink at time tt. sel picks the channel (plate A/C rgb) or black (plate B/D r) when isK
// r2: a turning card is a foreshortened trapezoid (far edge 1-.22|sin|), shaded 1-.2|sin|, over a black press bed
// mid-turn that becomes the card's own face near rest, so a gap round a card never shows paper.
float inkAt(vec4 sel, bool isK, vec2 p0, vec2 off, float tt){
  vec2 q0 = p0, q = p0 + off;
  gShade = 0.;
  if (casc > .5 && inTrim(p0)) {
    vec2 c = vec2(120.,60.) + (floor((p0 - vec2(120.,60.)) / 240.) + .5) * 240.;
    float sc; bool ax;
    if (tt < uR4.x) {        // R2: cards tumble over their horizontal axis, diagonal wave from the top-left
      float u = clamp((tt - uR2.x - ((c.x - 120.) + (c.y - 60.)) * uR2.z) / uR2.y, 0., 1.);
      sc = cos(PI * ease(u)); ax = false;
    } else {                 // R4: cards turn home over their vertical axis, converging on the frame centre
      float u = clamp((tt - uR4.x - (uR4.w - length(c - vec2(960.,540.))) * uR4.z) / uR4.y, 0., 1.);
      sc = -cos(PI * ease(u)); ax = true;
    }
    float fB = face(true, sel, isK, slideCol(q0, q, tt));
    vec3 rr = rotTile(q0, q, tt); float fF = face(false, sel, isK, rr.xy) * rr.z;
    float aa = abs(sc), sn = sqrt(max(0., 1. - sc * sc));
    bool back = sc < 0.;
    if (aa > .9995) return back ? fB : fF;
    // board behind the card: mid-turn the cards turn over a BLACK press bed (ink, never paper); near rest the bed
    // becomes the face the card is settling on, so the closing gap is invisible (no paper, no slit)
    float board = mix(isK ? 1. : 0., back ? fB : fF, smoothstep(.72, .96, aa));
    if (aa < .002) return board;
    vec2 l0 = q0 - c, l = q - c;
    float a0 = ax ? l0.x : l0.y, b0 = ax ? l0.y : l0.x, a1 = ax ? l.x : l.y, b1 = ax ? l.y : l.x;
    float ca = clamp(a0 / aa, -120., 120.);                       // card coordinate along the turning axis
    float fs = ax ? (sc < 0. ? -1. : 1.) : (sc > 0. ? -1. : 1.);   // which screen edge is currently the far edge
    float xs = 1. - .22 * sn * (.5 + .5 * fs * ca / 120.);         // perspective width at this row
    float cov = clamp(120. * aa - abs(a0) + .5, 0., 1.) * clamp(120. * xs - abs(b0) + .5, 0., 1.);
    float la = clamp(a1 / aa, -119.6, 119.6), lb = clamp(b1 / xs, -119.6, 119.6);
    float la0 = clamp(a0 / aa, -119.6, 119.6), lb0 = clamp(b0 / xs, -119.6, 119.6);
    vec2 cq = c + (ax ? vec2(la, lb) : vec2(lb, la)), cq0 = c + (ax ? vec2(la0, lb0) : vec2(lb0, la0));
    float fv;
    if (back) fv = face(true, sel, isK, slideCol(cq0, cq, tt));
    else { vec3 r = rotTile(cq0, cq, tt); fv = face(false, sel, isK, r.xy) * r.z; }
    gShade = cov * sn;
    return mix(board, fv, cov);
  }
  return face(false, sel, isK, q);
}
void main(){
  vec2 p = vec2(gl_FragCoord.x, RES.y - gl_FragCoord.y);
  p = vec2(960., 540.) + (p - vec2(960., 540.)) / uCam.z + uCam.xy;   // r2: 7.0 punch (x1.03 -> 1) / 9.5 press jolt
  vec3 paperBase = vec3(241.,233.,218.)/255.;
  float pl = dot(texture(tPaper, p/2600.).rgb, vec3(.333));
  float tooth = pl - .78;
  float big = vnoise(p/340.) - .5;
  vec3 col = paperBase * (1. + tooth*.32 + big*.018);
  vec2 vc = (p/RES - .5); col *= 1. - dot(vc,vc)*.10;
  // ---- grid: each line pair is ruled as a 3px black pen stroke, lands on a 16th, relaxes to the hairline
  float g = 0.;
  for (int i = 0; i < 15; i++) {
    float x = float(i+1)*120.; float on = step(abs(p.y-540.), gV[i]*480.);
    float w = wV[i];
    g = max(g, lineCov(p.x - x, mix(1.1, 3.2, min(w, 1.)) + 2.8 * max(w - 1., 0.)) * on * mix(i==7 ? .28 : .17, .92, min(w, 1.)));
  }
  for (int j = 0; j < 9; j++) {
    float y = 60. + float(j)*120.; float on = step(abs(p.x-960.), gH[j]*960.);
    float w = wH[j];
    g = max(g, lineCov(p.y - y, mix(1.1, 3.2, min(w, 1.)) + 2.8 * max(w - 1., 0.)) * on * mix(j==4 ? .28 : .17, .92, min(w, 1.)));
  }
  // ---- inks: misregistered plates (print space), rough edges, cascade, in-shader temporal taps (motion blur)
  vec2 rough = (vec2(vnoise(p/5.), vnoise(p/5. + 17.3)) - .5) * 1.3 + (vec2(vnoise(p/1.6 + 3.1), vnoise(p/1.6 + 8.7)) - .5) * .35;
  vec2 oY = rough + vec2(spread, 0.), oR = rough + vec2(1.3,-0.9)*reg + vec2(0., spread), oB = rough + vec2(-1.0,1.2)*reg - vec2(0., spread), oK = rough + vec2(0.5,0.4)*reg;
  float mY = 0., mR = 0., mB = 0., mK = 0., shd = 0.;
  for (int i = 0; i < 8; i++) {
    if (i >= taps) break;
    float tt = t + ((float(i) + .5) / float(taps) - .5) * slice;
    mY += inkAt(vec4(1,0,0,0), false, p, oY, tt);
    mR += inkAt(vec4(0,1,0,0), false, p, oR, tt);
    mB += inkAt(vec4(0,0,1,0), false, p, oB, tt);
    mK += inkAt(vec4(0), true, p, oK, tt); shd += gShade;
  }
  float nt = float(taps); mY /= nt; mR /= nt; mB /= nt; mK /= nt; shd /= nt;
  col *= 1. - g*(1. - clamp(max(max(mY,mR),max(mB,mK))*1.2, 0., 1.));
  float mottle = vnoise(p/9.) * .5 + vnoise(p/37.) * .5;
  float dens = clamp(dens0 + .06*(mottle-.5) + tooth*.35, 0., dens0 > 1. ? 1.1 : 1.);
  vec3 Y = vec3(242.,183.,5.)/255., R = vec3(224.,60.,49.)/255., Bl = vec3(30.,79.,163.)/255., K = vec3(17.)/255.;
  col *= mix(vec3(1.), Y/paperBase, mY*dens);
  col *= mix(vec3(1.), R/paperBase, mR*dens);
  col *= mix(vec3(1.), Bl/paperBase, mB*dens);
  col *= mix(vec3(1.), K/paperBase, mK*min(1., dens+.03));
  col *= 1. - .2 * shd;                                            // r2: a turning card's face is shaded (1-.2|sin|)
  col = max(col, vec3(0.));
  vec2 go = vec2(h21(vec2(frame, 1.7)), h21(vec2(frame, 9.1))) * 2048.;
  float gr = texture(tGrain, (p + go)/2048.).r - .5;
  col += gr * .045;
  col += (h21(p + frame) - .5) / 255.;
  o = vec4(col, 1.);
}`;
function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
const prog_ = gl.createProgram();
gl.attachShader(prog_, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog_, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog_);
if (!gl.getProgramParameter(prog_, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog_));
gl.useProgram(prog_);
const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
const loc = gl.getAttribLocation(prog_, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
const U = n => gl.getUniformLocation(prog_, n);
function tex(unit, src, repeat) {
  const tx = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tx);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  if (src) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  return tx;
}
async function img(url) { const i = new Image(); i.src = url; await i.decode(); return i; }
const [paperImg, grainImg] = await Promise.all([img('/assets/textures/paper/Paper001_4K_color.jpg'), img('/assets/textures/grain/grain_fine_2048.png')]);
const txA = tex(0, null, false), txB = tex(1, null, false);
tex(2, paperImg, true); tex(3, grainImg, true);
gl.uniform1i(U('tA'), 0); gl.uniform1i(U('tB'), 1); gl.uniform1i(U('tPaper'), 2); gl.uniform1i(U('tGrain'), 3);
gl.uniform1i(U('tC'), 4); gl.uniform1i(U('tD'), 5);

// cascade parameters from cues (wave spans normalised by the farthest cell of each ripple)
{
  const [x0, y0, x1, y1] = cues.trim;
  const r1 = RP.R1, [ox, oy] = r1.origin; let maxD = 1;
  for (let y = y0 + 60; y < y1; y += 120) for (let x = x0 + 60; x < x1; x += 120) maxD = Math.max(maxD, Math.hypot(x - ox, y - oy));
  gl.uniform4f(U('uR1'), r1.start, r1.dur, r1.span / maxD, r1.angle * DEG); gl.uniform2f(U('uR1o'), ox, oy);
  const r2 = RP.R2; gl.uniform4f(U('uR2'), r2.start, r2.dur, r2.span / ((x1 - 120 - x0) + (y1 - 120 - y0)), 0);
  const r3 = RP.R3; gl.uniform4f(U('uR3'), r3.start, r3.dur, r3.span / (1680 - 240), r3.dy);
  const r4 = RP.R4; let mxR = 0, mnR = 1e9;
  for (let y = y0 + 120; y < y1; y += 240) for (let x = x0 + 120; x < x1; x += 240) { const r = Math.hypot(x - CX, y - CY); mxR = Math.max(mxR, r); mnR = Math.min(mnR, r); }
  gl.uniform4f(U('uR4'), r4.start, r4.dur, r4.span / (mxR - mnR), mxR);
  gl.uniform1f(U('resetT'), cues.frontReset);
}

function gridProg(t) {
  const G = cues.grid, gV = new Float32Array(15), gH = new Float32Array(9), wV = new Float32Array(15), wH = new Float32Array(9);
  const line = (d, arr, warr, i) => { const L = G.land0 + d * G.step; arr[i] = io2(prog(t, L - G.draw, L));
    const pk = d <= 1 ? 2 : 1, rl = d <= 1 ? 8 / 30 : G.relax;          // r2 hook: the first 4 axis lines rule at 6 px
    warr[i] = t < L ? (arr[i] > 0 ? pk : 0) : pk * (1 - io2(prog(t, L, L + rl))); };
  for (let i = 0; i < 15; i++) line(Math.abs(i - 7), gV, wV, i);
  for (let j = 0; j < 9; j++) line(Math.abs(j - 4), gH, wH, j);
  return [gV, gH, wV, wH];
}
// press (r2): during R2 the plates drift to ~3.5 px, the hero hit (7.0, frame 210) strikes them into register with a
// 1-frame ink kiss and a x1.03 punch; after the freeze they breathe apart to a 4.5 px Y/R/B spread and the PRESS LOCK
// (9.5, frame 285) snaps them to register with +10 % ink and a 2 px paper jolt settling over 2 frames.
function registration(t) {
  const q = snap(t), f = Math.round(t * 30), rv = EV.reveal.t, lock = EV.lock.t, R2 = RP.R2;
  let reg = 1, dens = 0.955, spread = 0;
  if (q >= R2.start && q < rv) reg = 1 + 1.3 * in2(prog(q, R2.start, rv - 1 / 30));
  else if (q >= rv && q < FREEZE) reg = 0.15 + 0.85 * io2(prog(q, RP.R4.start, FREEZE));
  else if (q >= FREEZE && q < lock) { const u = io2(prog(q, FREEZE + 0.5, lock - 1 / 30)); reg = 1 + 0.4 * u; spread = 4.5 * u; }
  if (q >= lock) { reg = 0.12; dens = 0.985; }
  const fr = f - Math.round(rv * 30), fl = f - Math.round(lock * 30);
  if (fr === 0) dens += 0.12; else if (fr === 1) dens += 0.05;
  if (fl === 0) dens += 0.10; else if (fl === 1) dens += 0.04;
  return [reg, dens, spread];
}
function camera(t) {
  const f = Math.round(t * 30), fr = f - Math.round(EV.reveal.t * 30), fl = f - Math.round(EV.lock.t * 30);
  const z = fr === 0 ? 1.03 : fr === 1 ? 1.012 : 1;
  const dy = fl === 0 ? 2 : fl === 1 ? 1 : 0;
  return [0, dy, z];
}
// shutter 0.5 -> 0.3 while the cards turn (R2 / R4), so a turning card reads as a card, not a smear
const FLIPS = ['R2', 'R4'].map(k => [RP[k].start, RP[k].start + RP[k].span + RP[k].dur]);
const shutK = t => { const q = snap(t); return FLIPS.some(([a0, a1]) => q >= a0 && q <= a1) ? 0.6 : 1; };
// back sheet labels stamp on the hero hit: GELB 黄 7.000 · ROT 红 7.067 · BLAU 蓝 7.133 (frames 210 / 212 / 214)
let backN = -1, txC = null, txD = null;
function labelsN(t) { const q = snap(t); return (cues.labels || []).filter(tt => q >= tt - 1e-6).length; }

function present(t, k = 1) {
  gl.viewport(0, 0, W, H);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, txA); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cA);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, txB); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cB);
  gl.uniform1f(U('t'), t); gl.uniform1f(U('frame'), Math.round(t * 30));
  const on = cascOn(t);
  gl.uniform1f(U('casc'), on ? 1 : 0); gl.uniform1i(U('taps'), on ? 6 : 1);
  gl.uniform1f(U('slice'), k * (window.DEMO.motionBlur.shutter / 30) / MB);
  const nL = labelsN(t);
  if (nL !== backN) { drawBack(nL); backN = nL;
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, txC); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cC);
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, txD); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cD); }
  const cam = camera(t); gl.uniform3f(U('uCam'), cam[0], cam[1], cam[2]);
  const [rg, dn, sp] = registration(t); gl.uniform1f(U('reg'), rg); gl.uniform1f(U('dens0'), dn); gl.uniform1f(U('spread'), sp);
  const [gV, gH, wV, wH] = gridProg(t);
  gl.uniform1fv(U('gV'), gV); gl.uniform1fv(U('gH'), gH); gl.uniform1fv(U('wV'), wV); gl.uniform1fv(U('wH'), wH);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.finish();
}

window.renderAt = async (t) => { const tc = snap(t), k = shutK(t); t = tc + (t - tc) * k; renderPlates(t); present(t, k); };

// ---------------------------------------------------------------- reel v5: link elements, a pure function of t
// Positions are in output-frame px: the plate point is moved by that plate's misregistration (the shader samples p + off,
// so the image sits at -off) and by the press camera (7.0 punch x1.03, 9.5 jolt 2 px).
const L4 = (() => {
  const [x0, y0, x1, y1] = cues.trim, r1 = RP.R1, [ox, oy] = r1.origin; let maxD = 1, mxR = 0, mnR = 1e9;
  for (let y = y0 + 60; y < y1; y += 120) for (let x = x0 + 60; x < x1; x += 120) maxD = Math.max(maxD, Math.hypot(x - ox, y - oy));
  for (let y = y0 + 120; y < y1; y += 240) for (let x = x0 + 120; x < x1; x += 240) { const r = Math.hypot(x - CX, y - CY); mxR = Math.max(mxR, r); mnR = Math.min(mnR, r); }
  return { ox, oy, z1: r1.span / maxD, z2: RP.R2.span / ((x1 - 120 - x0) + (y1 - 120 - y0)), z3: RP.R3.span / (1680 - 240), z4: RP.R4.span / (mxR - mnR), mxR };
})();
const PLATE_OFF = { R: [1.3, -0.9, 0, 1], B: [-1.0, 1.2, 0, -1], Y: [0, 0, 1, 0], K: [0.5, 0.4, 0, 0] };   // reg x, reg y, spread x, spread y
function toScreen(t, x, y, plate) {
  const [reg, , spread] = registration(t), [cx, cy, z] = camera(t), o = PLATE_OFF[plate];
  const px = x - (o[0] * reg + o[2] * spread) - cx, py = y - (o[1] * reg + o[3] * spread) - cy;
  return [CX + (px - CX) * z, CY + (py - CY) * z, z];
}
const r1Ang = (t, x, y) => 90 * io2(clamp((t - RP.R1.start - Math.hypot(x - L4.ox, y - L4.oy) * L4.z1) / RP.R1.dur));
const r2Cos = (t, x, y) => Math.cos(Math.PI * io2(clamp((t - RP.R2.start - ((x - 120) + (y - 60)) * L4.z2) / RP.R2.dur)));
const r4Cos = (t, x, y) => -Math.cos(Math.PI * io2(clamp((t - RP.R4.start - (L4.mxR - Math.hypot(x - CX, y - CY)) * L4.z4) / RP.R4.dur)));
const sstep = (e0, e1, x) => { const u = clamp((x - e0) / (e1 - e0)); return u * u * (3 - 2 * u); };
const mean = (xs, f) => xs.reduce((s, c) => s + f(c), 0) / xs.length;
// the front sheet's share of cards at rest (R4 turning home) / the back sheet's share of cards at rest (R2)
const frontHome = (t, cards) => t < RP.R4.start ? 0 : mean(cards, ([x, y]) => sstep(0.9, 1, r4Cos(t, x, y)));
const DOT_TILES = [660, 780, 900, 1020].flatMap(x => [120, 240, 360, 480].map(y => [x, y]));
const DOT_CARDS = [[720, 180], [960, 180], [720, 420], [960, 420]];
const BAND_CARDS = [480, 720, 960, 1200, 1440, 1680].map(x => [x, 900]);
const DISC2_CARDS = [[1440, 420], [1680, 420], [1440, 660], [1680, 660]];
function dotCentre(t) {                                      // red disc, plate coords (group transform applied)
  const e1 = EV.circle_land, u = in2(prog(t, e1.t0, e1.t)), sl = io2(prog(t, EV.circle_slide.t0, EV.circle_slide.t));
  const lx = 840 + (1 - u) * 6 * M, ly = 300 - M * (1 - sl), th = groupAngle(t), c = Math.cos(th), s = Math.sin(th);
  return [CX + c * (lx - CX) - s * (ly - CY), CY + s * (lx - CX) + c * (ly - CY)];
}
function dotVis(t) {
  if (t < EV.circle_land.t0) return 0;
  if (!cascOn(t)) return 1;
  if (t < RP.R4.start) return t >= cues.frontReset ? 0 : 1 - clamp(mean(DOT_TILES, ([x, y]) => r1Ang(t, x, y)) / 15);   // R1 breaks it
  return frontHome(t, DOT_CARDS);                            // R4: its 4 cards turn home, whole again on the 8.0 freeze
}
function linkAtV5(t) {
  const els = [];
  const [dx, dy, z] = toScreen(t, ...dotCentre(t), 'R');
  els.push({ id: 'dot', type: 'circle', x: +dx.toFixed(1), y: +dy.toFixed(1), r: +(240 * z).toFixed(1), a: +dotVis(t).toFixed(3),
    look: 'grain-flat', fill: '#EB3F33', stroke: '#EB3F33', sw: 0,   // fill = measured print colour (ink #E03C31 on cream)
    note: 'Bauhaus red disc Ø480 (primary red ink on cream paper: tooth, mottling, grain, 1-4 px plate misregistration)' });
  // back sheet: the giant blue disc of the ▲■● triad (6.97-7.2 whole; R3 shears it from 7.2)
  if (cascOn(t) && t >= RP.R2.start) {
    let av = t < RP.R4.start ? mean(DISC2_CARDS, ([x, y]) => sstep(0.9, 1, -r2Cos(t, x, y))) : 0;
    const sh = Math.max(...[1440, 1680].map(cx => io2(clamp((t - RP.R3.start - (1680 - cx) * L4.z3) / RP.R3.dur))));
    av *= 1 - clamp(sh * RP.R3.dy / 8);
    const [bx, by, bz] = toScreen(t, 1560, 540, 'B');
    els.push({ id: 'disc2', type: 'circle', x: +bx.toFixed(1), y: +by.toFixed(1), r: +(240 * bz).toFixed(1), a: +av.toFixed(3),
      look: 'grain-flat', fill: '#0942A3', stroke: '#0942A3', sw: 0, note: 'back-sheet blue disc of the giant ▲■● triad, on black' });
  }
  // pivot dot: black point on the horizon at the frame centre (the rotation pivot), stamps at 3.0
  if (snap(t) >= EV.pivot.t && !cascOn(t)) {
    const [px, py, pz] = toScreen(t, CX, CY, 'K');
    els.push({ id: 'pivot', type: 'circle', x: +px.toFixed(1), y: +py.toFixed(1), r: +(20 * pz).toFixed(1), a: 1,
      look: 'grain-flat', fill: '#1C1A12', stroke: '#1C1A12', sw: 0, note: 'black pivot dot on the horizon rule (frame centre)' });
  }
  // horizon rule y 540, ruled 360 -> 1800 over 5.0-5.25; off in the cascade, back on the 8.0 freeze
  if (t >= EV.rule.t0 && !cascOn(t)) {
    const u = io2(prog(t, EV.rule.t0, EV.rule.t)), [x0, y0] = toScreen(t, 360, 540, 'K'), [x1, y1, rz] = toScreen(t, 360 + 1440 * u, 540, 'K');
    els.push({ id: 'rule', type: 'line', x0: +x0.toFixed(1), y0: +y0.toFixed(1), x1: +x1.toFixed(1), y1: +y1.toFixed(1), w: +(6 * rz).toFixed(1),
      a: u > 0.01 ? 1 : 0, fill: '#1C1A12', note: 'horizon rule (6 px black), draws left to right' });
  }
  // black bar: extends 8 modules at 0.75-1.0 (horizontal along the top while the group is turned), swings upright 3.25-4.0
  if (t >= EV.bar_land.t0) {
    const u = in2(prog(t, EV.bar_land.t0, EV.bar_land.t)), th = groupAngle(t), c = Math.cos(th), s = Math.sin(th);
    const R = (x, y) => [CX + c * (x - CX) - s * (y - CY), CY + s * (x - CX) + c * (y - CY)];
    const [ax, ay] = toScreen(t, ...R(1380, 60), 'K'), [bx, by, bz] = toScreen(t, ...R(1380, 60 + 960 * u), 'K');
    els.push({ id: 'bar', type: 'line', x0: +ax.toFixed(1), y0: +ay.toFixed(1), x1: +bx.toFixed(1), y1: +by.toFixed(1), w: +(120 * bz).toFixed(1),
      a: cascOn(t) ? 0 : 1, fill: '#1C1A12', note: 'black bar 120 px wide (centre line); breaks into cards 6.0-8.0' });
  }
  // v5 title block: black bar with 几何构成 (paper) + 包豪斯 (yellow)
  if (titleOn(t)) {
    const [tx, ty, tz] = toScreen(t, (TB.x0 + TB.x1) / 2, (TB.y0 + TB.y1) / 2, 'K');
    els.push({ id: 'title', type: 'rect', x: +tx.toFixed(1), y: +ty.toFixed(1), w: +((TB.x1 - TB.x0) * tz).toFixed(1), h: +((TB.y1 - TB.y0) * tz).toFixed(1), rot: 0,
      a: +(cascOn(t) ? frontHome(t, BAND_CARDS) : 1).toFixed(3), fill: '#1C1A12',
      note: 'title bar 几何构成 · 包豪斯 (x 360-1800, y 780-1020), revealed by the R4 cards, then static' });
  }
  return els;
}
if (V5) window.linkAt = linkAtV5;

await document.fonts.load(`900 172px "Poppins"`, 'BAUHAUS');
await document.fonts.load(`600 24px "Poppins"`, 'FORM');
await document.fonts.load(`600 13px "Poppins"`, 'BOGEN');
await document.fonts.load(`700 26px "Noto Sans SC"`, '形式色彩功能黄红蓝');
if (V5) await document.fonts.load(TB.font, '几何构成包豪斯');
await document.fonts.ready;
measureType();
if (V5) measureTitleV5();
drawBack(0); backN = 0;
txC = tex(4, cC, false); txD = tex(5, cD, false);
buildField();
await window.renderAt(0);
window.__ready = true;
