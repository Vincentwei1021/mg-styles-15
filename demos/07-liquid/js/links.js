// reel v5: link elements of the film state S (pure: S = film(t)), in 1920x1080 output-frame px.
// The film tags its primitives (scene.js tag()): lk = ids the primitive belongs to (hidden together by ?nolink=id),
// main = the principal body of that id (the one reported). Look: glossy liquid (tangerine -> hot pink -> violet palette).
const W = 1920, H = 1080;
// sRGB approximations of the shader palette at the body's u (palMid = mid-thickness body, palThin = thin rim / lit core)
const PM = [[1.00, 0.36, 0.06], [1.00, 0.10, 0.44], [0.56, 0.12, 1.00]], PT = [[1.00, 0.74, 0.30], [1.00, 0.50, 0.66], [0.84, 0.52, 1.00]];
const mixv = (a, b, k) => a.map((c, i) => c + (b[i] - c) * k);
const palv = (P, u) => { u = Math.min(1, Math.max(0, u)); const [a, b] = u < 0.5 ? [P[0], P[1]] : [P[1], P[2]], k = u < 0.5 ? u * 2 : u * 2 - 1; return mixv(a, b, k); };
const hex = (v) => '#' + v.map((c) => Math.round(255 * Math.min(1, Math.max(0, c))).toString(16).padStart(2, '0')).join('');
const pal = (P, u) => hex(palv(P, u));
// v5.1 grade (S.v5 = [set, lift, violet lift, refl]): the violet end lifts to pink-violet, the title liquid gets lighter
const PM5 = [0.88, 0.36, 1.00], PT5 = [0.98, 0.74, 1.00];
function cols(S, u) {
  const g = S.v5 || [0, 0, 0, 0];
  const pm = [PM[0], PM[1], mixv(PM[2], PM5, g[2])], pt = [PT[0], PT[1], mixv(PT[2], PT5, g[2])];
  const fill = mixv(palv(pm, u), palv(pt, u), 0.3 * g[1]), rim = palv(pt, u);
  return { fill: hex(fill), stroke: hex(rim), grad: [hex(rim), hex(fill)] };
}

export function linkElements(S, word) {
  const c = S.cam, z = c.zoom;
  const X = (x) => (x - c.px - c.ox) * z + W / 2, Y = (y) => (y - c.py - c.oy) * z + H / 2;
  // fraction of a box that is inside the frame
  const vis = (x0, y0, x1, y1) => Math.max(0, Math.min(1, (Math.min(x1, W) - Math.max(x0, 0)) / Math.max(1, x1 - x0))) *
    Math.max(0, Math.min(1, (Math.min(y1, H) - Math.max(y0, 0)) / Math.max(1, y1 - y0)));
  const out = [];
  const info = S.lnk || {};
  for (const id of ['dot', 'hop']) {
    let b = null;   // principal body; if two phases overlap in one state, the more visible one wins
    for (const q of S.balls) if (q.main === id && (!b || q.la > b.la || (q.la === b.la && q.r > b.r))) b = q;
    if (!b) continue;
    // shader ellipse: semi-axis r*s along angle a, r/s across; equal-area circle radius = r
    const ca = Math.cos(b.a), sa = Math.sin(b.a), A = b.r * b.s * z, B = b.r / b.s * z;
    const rx = Math.hypot(A * ca, B * sa), ry = Math.hypot(A * sa, B * ca);   // axis-aligned half extents
    const x = X(b.x), y = Y(b.y), r = b.r * z;
    const a = +(b.la * vis(x - rx, y - ry, x + rx, y + ry)).toFixed(3);
    const cc = cols(S, b.u);
    out.push({ id, type: 'circle', x: +x.toFixed(1), y: +y.toFixed(1), r: +r.toFixed(1), a, look: 'glossy',
      fill: cc.fill, stroke: cc.stroke, sw: 0, grad: cc.grad, hi: '#fff7f0',
      rx: +rx.toFixed(1), ry: +ry.toFixed(1), note: b.note });
  }
  if (info.bar) {   // the fused bar (6.1-6.4): union of the four slot ellipses -> a thick liquid line
    const bs = S.balls.filter((q) => q.lk && q.lk.includes('bar'));
    if (bs.length) {
      let x0 = 1e9, x1 = -1e9, ys = 0, hs = 0;
      for (const b of bs) { const hx = b.r / b.s, vy = b.r * b.s; x0 = Math.min(x0, b.x - hx); x1 = Math.max(x1, b.x + hx); ys += b.y; hs += vy; }
      const y = Y(ys / bs.length), w = 2 * hs / bs.length * z;
      out.push({ id: 'bar', type: 'line', x0: +X(x0).toFixed(1), y0: +y.toFixed(1), x1: +X(x1).toFixed(1), y1: +y.toFixed(1), w: +w.toFixed(1),
        a: +info.bar.a.toFixed(3), look: 'glossy', fill: '#ff1f73', note: info.bar.note });
    }
  }
  if (S.letters.length) {   // the title 「液态流动」 as a text block (ink box of the four liquid glyphs)
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, m = 1;
    S.letters.forEach((l, i) => {
      const L = word.letters[i], bb = L.bbox;
      x0 = Math.min(x0, l.x + (bb[0] - L.sx0) * l.sx); x1 = Math.max(x1, l.x + (bb[2] - L.sx0) * l.sx);
      y0 = Math.min(y0, l.y + (bb[1] - L.sy0) * l.sy); y1 = Math.max(y1, l.y + (bb[3] - L.sy0) * l.sy);
      m = Math.min(m, l.m ?? 1);
    });
    out.push({ id: 'title', type: 'rect', x: +((X(x0) + X(x1)) / 2).toFixed(1), y: +((Y(y0) + Y(y1)) / 2).toFixed(1),
      w: +((x1 - x0) * z).toFixed(1), h: +((y1 - y0) * z).toFixed(1), rot: 0, a: +m.toFixed(3), text: '液态流动', note: 'liquid title block' });
  }
  return out;
}
