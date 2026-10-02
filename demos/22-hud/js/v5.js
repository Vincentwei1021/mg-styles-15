// reel v5 (?v5=1): the style-name title 「赛博朋克」 ● HUD, drawn on its own post-bloom canvas so its cyberpunk yellow is
// never re-inked by the alert wave. Everything is a pure function of the (frame-centre) time t.
// Beat: impact 6.40 = white-hot outline slam (the lock) → 6.433–6.733 a scan line fills the glyphs top-down with a
// magenta/cyan glitch split that decays to a 2.5 px chromatic ghost; flicker-in on frames +1…+4; 1-frame slice glitches
// on the alert pulses 7.40 / 8.40. Band ends carry yellow hazard stripes; thin corner brackets snap onto the lockup.
import { clamp, lerp, prog, E, hash, frameOf, LOCK, NOLINK } from './util.js';

const W = 1920, CX = 960, CY = 540;
export const BH = 128, BW = 880, BG = 120;      // band half-height, band half-width, title gap from the centre (the reticle sits in it)
export const PLATE_T0 = LOCK + 1 / 30;           // band plate wipes open right after the impact frame
const CN = '赛博朋克', EN = 'HUD';
export const FONT_CN = '900 168px "HarmonyOS Sans SC"', FONT_EN = '700 206px "Chakra Petch"';
const LS_CN = 8, LS_EN = 6, BASE = 616;
const YEL = '#FCEE0A', YHOT = '#FFFBD6', MAG = '#FF2A8A', CYN = '#00E5FF', INK = 'rgba(2,10,13,';
const F = (t) => frameOf(t);
let c, A, B, dpr = 1, M = null;

export function initTitle(canvas, pr) {
  const mk = () => { const q = document.createElement('canvas'); q.width = canvas.width; q.height = canvas.height; return q.getContext('2d'); };
  c = canvas.getContext('2d'); A = mk(); B = mk(); dpr = pr;
}
// glyph metrics (ink boxes), measured once the fonts are loaded
export function titleMetrics() {
  if (M) return M;
  const q = c || document.createElement('canvas').getContext('2d');
  q.save(); q.setTransform(1, 0, 0, 1, 0, 0);
  q.font = FONT_CN; q.letterSpacing = `${LS_CN}px`; const m1 = q.measureText(CN);
  q.font = FONT_EN; q.letterSpacing = `${LS_EN}px`; const m2 = q.measureText(EN);
  q.restore();
  const xCn = CX - BG - m1.actualBoundingBoxRight, xEn = CX + BG + m2.actualBoundingBoxLeft;
  const top = BASE - Math.max(m1.actualBoundingBoxAscent, m2.actualBoundingBoxAscent), bot = BASE + Math.max(m1.actualBoundingBoxDescent, m2.actualBoundingBoxDescent);
  M = { xCn, xEn, l: xCn - m1.actualBoundingBoxLeft, r: xEn + m2.actualBoundingBoxRight, top, bot, cnL: xCn - m1.actualBoundingBoxLeft, enR: xEn + m2.actualBoundingBoxRight,
    cnTop: BASE - m1.actualBoundingBoxAscent, enTop: BASE - m2.actualBoundingBoxAscent };
  return M;
}
// shared timing (also used by linkAt)
export const slamScale = (t) => lerp(1.15, 1, E.outE(prog(t, LOCK, 0.1)));
export const scanP = (t) => E.outC(prog(t, LOCK + 1 / 30, 0.3));
export const plateW = (t) => E.outE(prog(t, PLATE_T0, 0.3)) * BW;
const PULSE_GL = [7.4, 8.4];

function glyphs(q, mode, col, a, dx = 0, lw = 2) {
  const m = titleMetrics();
  q.globalAlpha = clamp(a); q.textBaseline = 'alphabetic'; q.textAlign = 'left';
  q.font = FONT_CN; q.letterSpacing = `${LS_CN}px`;
  if (mode === 'fill') { q.fillStyle = col; q.fillText(CN, m.xCn + dx, BASE); } else { q.strokeStyle = col; q.lineWidth = lw; q.strokeText(CN, m.xCn + dx, BASE); }
  q.font = FONT_EN; q.letterSpacing = `${LS_EN}px`;
  if (mode === 'fill') { q.fillStyle = col; q.fillText(EN, m.xEn + dx, BASE); } else { q.strokeStyle = col; q.lineWidth = lw; q.strokeText(EN, m.xEn + dx, BASE); }
  q.letterSpacing = '0px';
}
const reset = (q) => { q.setTransform(1, 0, 0, 1, 0, 0); q.globalAlpha = 1; q.globalCompositeOperation = 'source-over'; q.filter = 'none'; q.shadowBlur = 0; q.shadowColor = 'rgba(0,0,0,0)'; q.clearRect(0, 0, q.canvas.width, q.canvas.height); };

export function drawTitle(t) {
  reset(c); if (t < LOCK) return;
  const m = titleMetrics(), f = F(t) - F(LOCK), d = t - LOCK;
  const sc = slamScale(t), p = scanP(t);
  const y0 = m.top - 14, y1 = m.bot + 14, sy = f <= 0 ? y0 : lerp(y0, y1, p);
  // glitch split: 16 px on the first frame after the impact, decays to a permanent 2.5 px chromatic ghost; kicks on pulses
  let sp = f <= 0 ? 0 : 2.5 + 16 * Math.exp(-(d - 1 / 30) / 0.07);
  let gl = f === 1 || f === 2 ? 1 - 0.4 * (f - 1) : 0;
  for (const pt of PULSE_GL) if (F(t) === F(pt)) { sp = Math.max(sp, 9); gl = 0.45; }
  const fk = [1, 0.9, 0.35, 1, 0.7][f] ?? 1;   // flicker-in (frames 0…4 after the impact)
  const S = (q) => { q.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * (CX - CX * sc), dpr * (CY - CY * sc)); };
  const show = !NOLINK.has('title');

  // ---- A: the filled title (dark halo, cyan + magenta split ghosts, yellow core with glow), clipped above the scan line
  reset(A);
  if (show && f >= 1) {
    S(A); A.save(); A.beginPath(); A.rect(0, 0, W, sy); A.clip();
    A.shadowColor = INK + '0.95)'; A.shadowBlur = 38 * dpr; glyphs(A, 'fill', INK + '0.7)', 1);
    A.shadowBlur = 0;
    glyphs(A, 'fill', CYN, 0.8 * fk, sp); glyphs(A, 'fill', MAG, 0.85 * fk, -sp);
    A.shadowColor = 'rgba(252,238,10,0.55)'; A.shadowBlur = 26 * dpr; glyphs(A, 'fill', YEL, fk);
    A.shadowBlur = 0; glyphs(A, 'fill', YEL, fk);
    // HUD word: hollow core (thin glowing line inside the fill) — reads as a HUD wireframe inside the yellow
    A.restore();
  }
  // ---- B: the outline title below the scan line (the impact frame is all outline, white-hot)
  reset(B);
  if (show && p < 1) {
    S(B); B.save(); B.beginPath(); B.rect(0, f <= 0 ? 0 : sy, W, 2000); B.clip();
    B.shadowColor = INK + '0.9)'; B.shadowBlur = 30 * dpr; glyphs(B, 'fill', INK + '0.45)', 1); B.shadowBlur = 0;
    B.shadowColor = 'rgba(255,251,214,0.7)'; B.shadowBlur = 10 * dpr; glyphs(B, 'stroke', f <= 0 ? YHOT : '#BFF7FF', f <= 0 ? 1 : 0.9, 0, f <= 0 ? 3 : 2);
    B.restore();
  }
  // ---- composite A (with horizontal slice glitch) + B onto the title canvas
  reset(c);
  c.drawImage(B.canvas, 0, 0);
  c.drawImage(A.canvas, 0, 0);
  if (gl > 0 && show) {
    const fr = F(t);
    for (let k = 0; k < 4; k++) {
      const yy = m.top - 4 + hash(fr, k, 1) * (m.bot - m.top), hh = 6 + hash(fr, k, 2) * 24, ox = (hash(fr, k, 3) - 0.5) * 2 * 30 * gl;
      const Y = Math.round(yy * dpr), Hh = Math.round(hh * dpr);
      c.clearRect(0, Y, c.canvas.width, Hh); c.drawImage(A.canvas, 0, Y, A.canvas.width, Hh, Math.round(ox * dpr), Y, A.canvas.width, Hh);
      c.drawImage(B.canvas, 0, Y, B.canvas.width, Hh, Math.round(ox * dpr), Y, B.canvas.width, Hh);
    }
  }
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  // scan line (+ a short phosphor trail above it)
  if (show && f >= 1 && p < 1) {
    const xl = m.l - 40, xr = m.r + 40;
    const g = c.createLinearGradient(0, sy - 46, 0, sy); g.addColorStop(0, 'rgba(252,238,10,0)'); g.addColorStop(1, 'rgba(252,238,10,0.22)');
    c.globalAlpha = 1; c.fillStyle = g; c.fillRect(xl, sy - 46, xr - xl, 46);
    c.shadowColor = 'rgba(252,238,10,0.9)'; c.shadowBlur = 14 * dpr; c.fillStyle = YHOT; c.fillRect(xl, sy - 1, xr - xl, 2); c.shadowBlur = 0;
  }
  // hazard stripes at the band ends (ride the plate wipe)
  const wp = plateW(t);
  if (wp > 40) {
    c.save(); c.beginPath(); c.rect(CX - wp, CY - BH, 30, BH * 2); c.rect(CX + wp - 30, CY - BH, 30, BH * 2); c.clip();
    c.globalAlpha = 0.9; c.strokeStyle = YEL; c.lineWidth = 6;
    for (let k = -2; k < 24; k++) { for (const x0 of [CX - wp, CX + wp - 30]) { const xx = x0 + k * 16 - 2 * BH; c.beginPath(); c.moveTo(xx, CY + BH); c.lineTo(xx + 2 * BH, CY - BH); c.stroke(); } }
    c.restore();
  }
  // thin corner brackets snap onto the lockup (1-frame overshoot, like the lock brackets)
  if (show && f >= 1) {
    const fr = (t - PLATE_T0) * 30, KF = [1.3, 1.06, 0.97, 1.0];
    const k = fr >= 3 ? 1 : lerp(KF[Math.floor(fr)], KF[Math.floor(fr) + 1], E.outC(fr - Math.floor(fr)));
    const bx = (m.r - m.l) / 2 + 26, by = (m.bot - m.top) / 2 + 14, mx = (m.l + m.r) / 2, my = (m.top + m.bot) / 2, arm = 30;
    c.globalAlpha = f === 1 ? 0.6 : 0.95; c.strokeStyle = YEL; c.lineWidth = 2; c.lineCap = 'square';
    for (const [sx, sy2] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const x = mx + sx * bx * k, y = my + sy2 * by * k;
      c.beginPath(); c.moveTo(x, y - sy2 * arm); c.lineTo(x, y); c.lineTo(x - sx * arm, y); c.stroke();
    }
    c.lineCap = 'butt';
  }
  c.globalAlpha = 1;
}

// post-bloom title composite (straight alpha over; CRT/CA/grain of the final pass still apply on top)
export const TITLE_FS = `
uniform sampler2D tDiffuse, tTtl; varying vec2 vUv;
void main(){ vec3 col = texture2D(tDiffuse, vUv).rgb; vec4 tx = texture2D(tTtl, vUv); gl_FragColor = vec4(mix(col, tx.rgb, tx.a), 1.0); }`;
// v5 alert ink: the lock wave re-inks the HUD hot magenta instead of amber (cyan → magenta flip reads cyberpunk). ?ink=amber keeps v4's orange.
export function magentaInk(src) {
  const R = [['vec3(1.0, 0.40, 0.0), vec3(1.0, 0.86, 0.70)', 'vec3(1.0, 0.10, 0.50), vec3(1.0, 0.80, 0.94)'],
    ['vec3(0.042, 0.014, 0.006)', 'vec3(0.034, 0.005, 0.028)'], ['vec3(0.012, 0.005, 0.004)', 'vec3(0.010, 0.003, 0.009)'],
    ['vec3(1.0, 0.72, 0.45) * wf', 'vec3(1.0, 0.60, 0.90) * wf'], ['vec3(1.0, 0.38, 0.0) * line', 'vec3(1.0, 0.12, 0.55) * line'],
    ['return o * I * 1.05;', 'return o * I * 1.2;']];   // magenta is darker than amber at equal intensity → +15 %
  for (const [a, b] of R) src = src.split(a).join(b);
  return src;
}
