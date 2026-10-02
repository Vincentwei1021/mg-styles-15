// PIXEL QUEST 像素冒险 — 20-pixel demo.
// Indexed 320x180 frame (semantic slots -> per-stage LUT -> QUEST-32 master palette), WebGL2 CRT pass x6.
// Every frame is a pure function of the frame number f = round(t*30).
const W = 320, H = 180, FPS = 30;
const Q = new URLSearchParams(location.search);
const SHEET = Q.has('sheet');
const NOCRT = Q.has('nocrt') || SHEET;
// reel v5 (?v5=1): 「像素风」 title logo, round crystal ORB = the reel dot, window.linkAt(t), ?nolink=dot,sun,pool,title
const V5 = Q.get('v5') === '1';
const NOLINK = new Set(V5 ? (Q.get('nolink') || '').split(',').map(s => s.trim()).filter(Boolean) : []);
let linkPass = false;                                   // linkAt() redraws the frame with every element present
const hidden = id => !linkPass && NOLINK.has(id);
const cues = await (await fetch('/demos/20-pixel/cues.json')).json();
const F = t => Math.round(t * FPS);

// ------------------------------------------------------------------ palette
const HEX = ['0d0b1a','1b1a33','2a2f5a','3d4a8a','4f6fc0','5b9bea','8cc8f5','c8ecff','ffffff','3b1f47','6b2d5c','b0415f',
  'e8665a','f59a4a','ffd166','fff3b0','0f2a2a','1d4a3a','2e7a45','4fae4a','93d65a','2b1a1f','5a3326','8a5236','c07a45',
  'e8b27c','7a1f2e','d23c3c','ffc9a0','4a5270','7d88a8','b8c2d9'];
const MP = HEX.map(h => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]);
const NSLOT = 128;
const SM = []; for (let i = 0; i < NSLOT; i++) SM[i] = [0, 0, 0, 0, 0, 0];
const M = i => 64 + i;                                  // direct (sprite) colours
for (let i = 0; i < 32; i++) SM[64 + i] = [i, i, i, i, i, i];
const E = {}; let nS = 1;
const env = (n, a) => { E[n] = nS; SM[nS] = a; nS++; };
//            DAY AFT GOLD SUNS DUSK NIGHT
env('s0',   [ 4,  4,  3,  3,  2,  1]);
env('s1',   [ 5,  5,  4, 10,  3,  2]);
env('s2',   [ 6,  6, 25, 11, 10,  3]);
env('s3',   [ 7, 15, 14, 12, 11,  9]);
env('s4',   [ 7, 14, 13, 13, 12, 10]);
env('sun',  [15, 15, 15, 14, 13, 13]);
env('sunG', [ 8, 15, 14, 13, 12, 11]);
env('clL',  [ 8,  8, 15, 13, 11,  3]);
env('clD',  [31, 25, 24, 11, 10,  2]);
env('mD',   [ 5,  5, 29, 10,  9,  1]);
env('mL',   [ 6, 25, 24, 11, 10,  2]);
env('mS',   [ 8, 15, 15, 12, 11,  3]);
env('mist', [ 6, 15, 14, 12, 10,  2]);
env('rD',   [29, 22, 22,  9,  9,  1]);
env('rM',   [30, 23, 24, 10, 10,  2]);
env('rL',   [31, 25, 28, 11, 11,  3]);
env('fD',   [17, 17, 17,  9,  9,  0]);
env('fM',   [18, 18, 18, 17, 16, 16]);
env('fL',   [19, 20, 20, 24, 17, 17]);
env('hD',   [17, 17, 17,  9, 16,  0]);
env('hM',   [18, 18, 18, 17, 17, 16]);
env('hL',   [19, 20, 20, 24, 18, 17]);
env('gD',   [18, 18, 18, 17, 16, 16]);
env('gM',   [19, 19, 19, 18, 17, 17]);
env('gL',   [20, 20, 20, 24, 18,  3]);
env('dD',   [22, 22, 22, 21, 21,  0]);
env('dM',   [23, 23, 23, 22, 22, 21]);
env('dL',   [24, 24, 24, 23, 23, 22]);
env('flw',  [ 8,  8, 15, 14, 11,  3]);
env('rvB',  [ 5,  5,  5, 10,  2,  1]);                  // river body (not cycled)
env('rvD',  [ 4,  4,  4,  9,  1,  0]);
env('rvG',  [ 8,  8, 15, 15, 11,  6]);                  // rare glint dash
const WAT = [[4, 4, 4, 10, 2, 1], [5, 5, 5, 11, 3, 2], [6, 6, 15, 10, 10, 2], [8, 8, 8, 12, 11, 30]];
WAT.forEach((a, k) => env('w' + k, a));
const WS = [E.w0, E.w1, E.w2, E.w3];
for (let k = 0; k < 4; k++) env('st' + k, [8, 8, 8, 8, 8, 8]);
const WFSEQ = [[0, 1, 1, 2, 3, 3, 2, 1], [1, 0, 0, 1, 1, 2, 3, 1]];     // per-group colour sequence (index into WAT ramp)
const WFG = WFSEQ.map((q, g) => q.map((_, k) => { env('wf' + g + k, [0, 0, 0, 0, 0, 0]); return nS - 1; }));
const STS = [E.st0, E.st1, E.st2, E.st3];
const STAR_SEQ = [8, 31, 29, 31];

function nearest(r, g, b) {
  let bi = 0, bd = 1e18;
  for (let i = 0; i < 32; i++) { const p = MP[i]; const d = 0.3 * (p[0] - r) ** 2 + 0.59 * (p[1] - g) ** 2 + 0.11 * (p[2] - b) ** 2; if (d < bd) { bd = d; bi = i; } }
  return bi;
}
const mixIdx = (a, b, t) => { const A = MP[a], B = MP[b]; return nearest(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
const FLASH = F(cues.chest_open);
const TRANS = [[F(cues.palette.afternoon), 0, 1], [F(cues.palette.golden), 1, 2], [F(cues.palette.sunset), 2, 3]];
const FNIGHT = F(cues.palette.night);
function stageOf(f) {
  for (const [T, a, b] of TRANS) if (f >= T && f < T + 4) return [a, b, f < T + 2 ? 1 / 3 : 2 / 3];
  const s = f < TRANS[0][0] ? 0 : f < TRANS[1][0] ? 1 : f < TRANS[2][0] ? 2 : f < FLASH ? 3 : 4;
  return [s, s, 0];
}
function makeLUT(f, st = null, out = null) {
  const lut = out || new Uint8Array(NSLOT);
  const [a, b, t] = st === null ? stageOf(f) : st;
  for (let s = 0; s < NSLOT; s++) lut[s] = t ? mixIdx(SM[s][a], SM[s][b], t) : SM[s][a];
  const ph = Math.floor(f / 3);                                   // colour cycling @10 fps
  for (let k = 0; k < 4; k++) lut[WS[k]] = t ? mixIdx(SM[WS[(k - ph) & 3]][a], SM[WS[(k - ph) & 3]][b], t) : SM[WS[(k - ph) & 3]][a];
  const sp = Math.floor(f / 4);
  for (let k = 0; k < 4; k++) lut[STS[k]] = STAR_SEQ[(k + sp) & 3];
  for (let g = 0; g < 2; g++) for (let k = 0; k < 8; k++) { const w = WAT[WFSEQ[g][(k - f) & 7]]; lut[WFG[g][k]] = t ? mixIdx(w[a], w[b], t) : w[a]; }
  if (V5 && (f === FLASH || f === FLASH + 1)) { const k = f === FLASH ? 0.5 : 0.25; for (let s = 0; s < 64; s++) lut[s] = mixIdx(lut[s], 15, k); }   // v5: palette lift, no white wash
  else {
  if (f === FLASH) { for (let s = 0; s < NSLOT; s++) lut[s] = s === M(0) ? 0 : 8; }
  if (f === FLASH + 1) { for (let s = 0; s < 64; s++) lut[s] = 15; }
  }
  return lut;
}

// ------------------------------------------------------------------ buffer + helpers
const IB = new Uint8Array(W * H);
const px = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) IB[y * W + x] = c; };
const rect = (x, y, w, h, c) => { for (let j = Math.max(0, y); j < Math.min(H, y + h); j++) for (let i = Math.max(0, x); i < Math.min(W, x + w); i++) IB[j * W + i] = c; };
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x, y) => (BAY[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function rng(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ------------------------------------------------------------------ sprites
const LEG = { k: M(0), w: M(8), r: M(27), R: M(26), o: M(12), s: M(28), S: M(25), b: M(4), B: M(3), y: M(14), Y: M(13),
  u: M(15), l: M(23), L: M(22), e: M(21), t: M(24), p: M(11), P: M(10), g: M(19), G: M(18), q: M(20), c: M(5), v: M(6),
  z: M(7), C: M(3), n: M(2), m: M(9), i: M(29), I: M(30), h: M(31), x: M(1) };
function spr(rows) { const h = rows.length, w = Math.max(...rows.map(r => r.length)); const d = new Uint8Array(w * h);
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const c = LEG[r[x]]; if (c) d[y * w + x] = c; } }); return { w, h, d }; }
function outline(s, col = M(0)) {
  const w = s.w + 2, h = s.h + 2, d = new Uint8Array(w * h);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.d[y * s.w + x]) d[(y + 1) * w + x + 1] = s.d[y * s.w + x];
  const o = d.slice();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!d[y * w + x]) {
    if ((x > 0 && d[y * w + x - 1]) || (x < w - 1 && d[y * w + x + 1]) || (y > 0 && d[(y - 1) * w + x]) || (y < h - 1 && d[(y + 1) * w + x])) o[y * w + x] = col;
  }
  return { w, h, d: o };
}
function blit(s, x, y, flip = false, remap = null) {
  for (let j = 0; j < s.h; j++) { const yy = y + j; if (yy < 0 || yy >= H) continue;
    for (let i = 0; i < s.w; i++) { const c = s.d[j * s.w + (flip ? s.w - 1 - i : i)]; if (!c) continue; const xx = x + i; if (xx < 0 || xx >= W) continue;
      IB[yy * W + xx] = remap ? (remap[c] ?? c) : c; } }
}
const O = rows => outline(spr(rows));

const HEAD = spr([
  '...rrrrr...',
  '.rrrorrrrr.',
  'rrrorrrrrrr',
  'rrrrrRRRRrr',
  'rRrrRssssRr',
  'rRrRsssskss',
  'RRrRsssskss',
  '.RRRSssssS.',
  '..RRRSSSS..',
]);
const HEAD_BLINK = { ...HEAD, d: HEAD.d.map(c => (c === M(0) ? M(25) : c)) };

// pose: bob, back foot [dx,dy], front foot, back hand, front hand, tail mode
const RUN = [
  { bob: 0, bf: [-3, 3], ff: [3, 4], bh: [3, 1], fh: [-2, 2] },
  { bob: 1, bf: [-3, 2], ff: [1, 4], bh: [2, 2], fh: [-1, 3] },
  { bob: 0, bf: [0, 2], ff: [-1, 4], bh: [0, 3], fh: [1, 3] },
  { bob: 0, bf: [3, 4], ff: [-3, 3], bh: [-2, 2], fh: [3, 1] },
  { bob: 1, bf: [1, 4], ff: [-3, 2], bh: [-1, 3], fh: [2, 2] },
  { bob: 0, bf: [-1, 4], ff: [0, 2], bh: [1, 3], fh: [0, 3] },
];
const POSE = {
  up:    { bob: 0, bf: [-2, 2], ff: [2, 3], bh: [-3, -1], fh: [3, -3], tail: 'up' },
  down:  { bob: 0, bf: [-2, 4], ff: [2, 3], bh: [-3, -2], fh: [2, -3], tail: 'down' },
  land:  { bob: 2, bf: [-2, 4], ff: [2, 4], bh: [-3, 2], fh: [3, 2], tail: 'hang' },
  skid:  { bob: 1, bf: [-1, 4], ff: [4, 4], bh: [-3, 0], fh: [-2, 1], tail: 'run1', lean: -1 },
  idle0: { bob: 0, bf: [-1, 4], ff: [1, 4], bh: [0, 3], fh: [0, 3], tail: 'hang' },
  idle1: { bob: 1, bf: [-1, 4], ff: [1, 4], bh: [0, 3], fh: [0, 3], tail: 'hang' },
  cheer: { bob: 0, bf: [-2, 4], ff: [2, 4], bh: [-5, -5], fh: [5, -5], tail: 'hang' },
  get0:  { bob: 0, bf: [-2, 4], ff: [2, 4], be: [-5, -8], bh: [-2, -14], fe: [6, -8], fh: [2, -14], tail: 'hang', noHands: 1, lit: 1 },   // item-get: crystal overhead
  get1:  { bob: 1, bf: [-2, 4], ff: [2, 4], be: [-5, -7], bh: [-2, -14], fe: [6, -7], fh: [2, -14], tail: 'hang', noHands: 1, hdy: -1, lit: 1 },   // head tilts up 1 px
  flinch0: { bob: 2, bf: [-2, 4], ff: [2, 3], bh: [-2, 1], fe: [4, -3], fh: [3, -6], tail: 'hang', hdx: -1 },   // brace: 2 px down, head away, arm up
  flinch1: { bob: 2, bf: [-2, 4], ff: [2, 3], bh: [-2, 1], fe: [4, -4], fh: [3, -8], tail: 'hang', hdx: -1 },
};
const TAILS = {
  run0: [0, 0, 1, 1, 1, 2], run1: [0, 1, 1, 2, 2, 3], run2: [0, 0, 0, 1, 2, 2],
  up: [0, 1, 2, 3, 4, 5], down: [0, -1, -1, -2, -2, -3],
};
function line(x0, y0, x1, y1, fn) { let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx + dy;
  for (;;) { fn(x0, y0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } } }
function heroSprite(p, tailMode, blink) {
  const w = 26, h = 28, OX = 5, OY = 6, d = new Uint8Array(w * h);
  const P = (x, y, c) => { x += OX; y += OY; if (x >= 0 && x < w && y >= 0 && y < h) d[y * w + x] = c; };
  const b = p.bob, lean = p.lean || 0;
  // hood tail
  const tm = p.tail || tailMode;
  if (tm === 'hang') { const pts = [[3, 5], [2, 6], [2, 7], [1, 8], [1, 9]]; pts.forEach(([x, y], i) => { P(x + lean, y + b, M(27)); if (i < 4) P(x - 1 + lean, y + b, M(26)); }); }
  else { const dy = TAILS[tm]; dy.forEach((v, i) => { const x = 3 - i + lean, y = 4 + b + v; P(x, y, M(27)); if (i < 5) P(x, y + 1, M(26)); }); }
  // back arm
  const arm = (sx, rx, e, hnd, c, cs, hc, hs, side) => { const y0 = 12 + b;
    const seg = (x0, y_0, x1, y1) => { const vert = Math.abs(y1 - y_0) >= Math.abs(x1 - x0); line(x0, y_0, x1, y1, (x, y) => { P(x, y, c); if (vert) P(x + side, y, cs); else P(x, y + 1, cs); }); };
    const hx_ = rx + hnd[0], hy = y0 + hnd[1]; if (e) { seg(sx, y0, rx + e[0], y0 + e[1]); seg(rx + e[0], y0 + e[1], hx_, hy); } else seg(sx, y0, hx_, hy);
    if (!p.noHands) { P(hx_, hy, hc); P(hx_ + side, hy, hc); P(hx_, hy + 1, hs); P(hx_ + side, hy + 1, hs); } };
  const L = p.lit;                                       // item-get: sleeves/shoulders/hair crest lit by the crystal overhead
  arm(5, 6, p.be, p.bh, L ? M(5) : M(3), L ? M(4) : M(2), M(25), M(24), -1);
  // back leg
  const bfx = 6 + p.bf[0], bfy = 15 + p.bf[1];
  line(6, 15 + b, bfx, bfy - 1, (x, y) => { P(x, y, M(22)); P(x + 1, y, M(22)); });
  P(bfx, bfy, M(21)); P(bfx + 1, bfy, M(21)); P(bfx + 2, bfy, M(21)); P(bfx, bfy - 1, M(21)); P(bfx + 1, bfy - 1, M(21));
  // torso
  const T = ['bbbbbb', 'Bbbbbb', 'yyyuyy', 'BbbbbB'];
  T.forEach((r, j) => { for (let i = 0; i < 6; i++) P(5 + i, 11 + b + j, LEG[r[i]]); });
  if (L) for (let i = 1; i < 5; i++) P(5 + i, 11 + b, M(5));
  // front leg
  const ffx = 8 + p.ff[0], ffy = 15 + p.ff[1];
  line(8, 15 + b, ffx, ffy - 1, (x, y) => { P(x, y, M(23)); P(x + 1, y, M(23)); });
  P(ffx, ffy, M(22)); P(ffx + 1, ffy, M(22)); P(ffx + 2, ffy, M(22)); P(ffx, ffy - 1, M(22)); P(ffx + 1, ffy - 1, M(22));
  // head
  const hd = blink ? HEAD_BLINK : HEAD;
  const hdx = p.hdx || 0, hdy = p.hdy || 0;
  for (let j = 0; j < hd.h; j++) for (let i = 0; i < hd.w; i++) { const c = hd.d[j * hd.w + i]; if (c) P(3 + i + lean + hdx, 2 + b + j + hdy, c); }
  if (L) for (let i = 0; i < hd.w; i++) { const c = hd.d[i]; if (c === M(27)) P(3 + i + lean + hdx, 2 + b + hdy, i === 5 ? M(28) : M(12)); }
  // front arm
  arm(10, 9, p.fe, p.fh, L ? M(6) : M(5), L ? M(5) : M(4), M(28), M(25), 1);
  return outline({ w, h, d });                            // sprite origin = box(0,0) at (-OX-1, -OY-1)
}
const HERO_OX = 6, HERO_OY = 7;                         // box (0,0) offset inside outlined sprite
const heroCache = new Map();
function hero(key, p, tail, blink) { const k = key + '|' + tail + '|' + (blink ? 1 : 0); if (!heroCache.has(k)) heroCache.set(k, heroSprite(p, tail, blink)); return heroCache.get(k); }

const COIN = [
  O(['.yyyy.', 'uyyyyY', 'uyYYyY', 'uyYYyY', 'uyYYyY', 'uyYYyY', 'uyyyYY', '.YYYY.']),
  O(['.yy.', 'uyyY', 'uyYY', 'uyYY', 'uyYY', 'uyYY', 'uyyY', '.YY.']),
  O(['uY', 'uY', 'uY', 'uY', 'uY', 'uY', 'uY', 'uY']),
  O(['.yy.', 'Yyyu', 'YYyu', 'YYyu', 'YYyu', 'YYyu', 'Yyyu', '.YY.']),
];
const SLIME_A = O([
  '....pppp....',
  '..pppppppp..',
  '.pwwpppppppP',
  '.pwppkppkppP',
  'pppppkppkpPP',
  'ppppppppppPP',
  'PpppppppppPP',
  '.PPPPPPPPPP.',
]);
const SLIME_B = O([
  '...pppppp...',
  '.pwwppppppP.',
  'pwpppkppkppP',
  'pppppkppkpPP',
  'PpppppppppPP',
  '.PPPPPPPPPP.',
]);
const SLIME_F = O(['..pppppppp..', 'ppkkpppkkppP', '.PPPPPPPPPP.']);
const CH_LID = ['.hIuuttttttttttIh.', 'ihuttttttttttttlhi', 'iItttttttttttllLIi', 'iILlllllllllllLLIi', 'iiiiiiiuyyYiiiiiii'];
const CH_BODY = ['iItttttyykYtttttIi', 'ihlllllYYkYlllllhi', 'iIllllllllllllllIi', 'iILLLLLLLLLLLLLLIi', 'iItlllllllllllllIi',
  'ihllllllllllllllhi', 'iIlllllllllllllLIi', 'iILLLLLLLLLLLLLLIi', 'iieeeeeeeeeeeeeeii'];
const CHEST = O([...CH_LID, ...CH_BODY]);
const CHEST_TALK = O([...CH_LID, 'ekkkkwkkkkkkwkkkke', ...CH_BODY]);
const GLOW = ['.uwwwwwwwwwwwwwwu.'];
const CHEST_CRACK = O([...CH_LID, ...GLOW, ...CH_BODY]);
const CHEST_CRACK2 = O([...CH_LID, '.uuwwwwwwwwwwwwuu.', ...GLOW, ...CH_BODY]);
const CHEST_HALF = O(['..iIttttttttttIi..', '.iILLLLLLLLLLLLIi.', '.iieeeeeeeeeeeeii.', '..uuuwwwwwwwwuuu..', ...GLOW, ...CH_BODY]);
// open: lid swung back (inner face, 2 px narrower, one ramp darker) + back rim + glowing interior + front body
const CHEST_OPEN = O(['...iILLLLLLLLIi...', '..iIeLLLLLLLLeIi..', '..ihLLLLLLLLLLhi..', '.iIeeeeeeeeeeeeIi.',
  'iIuwwwwwwwwwwwwuIi', 'iIyuywyyuyywyuyyIi', 'iIYyYYyYYyYYyYyYIi', ...CH_BODY]);
const TAIL = outline(outline(outline(spr(['nnnnnnn', '.nnnnnn', '..nnnnn', '...nnnn', '....nnn', '.....nn', '......n']), M(3)), M(8)), M(0));
const BUBBLE_Q = O(['..wwwww..', '.wwBBBww.', 'wwBwwwBww', 'wwwwwwBww', 'wwwwBBwww', 'wwwwBwwww', 'wwwwwwwww', '.wwwBwww.', '..wwww...', '..ww.....', '..w......']);
const GEM = O(['...w...', '..zwv..', '.zzvvc.', 'zzzvvcC', '.zvvcC.', '..vcC..', '...C...']);
// v5: the crystal is a round ORB (9 px disc + 1 px outline = 11 logical px), lit from the top left
const ORB = O(['..zzvvc..', '.zwwzvvc.', 'zwwwzvvcc', 'zwwzvvvcc', 'zzvvvvccb', 'vvvvvccbb', 'vvvvccbbC', '.vvccbCC.', '..cbbCC..']);
const SPARK = [
  spr(['.u.', 'uwu', '.u.']),
  spr(['..w..', '..u..', 'wuwuw', '..u..', '..w..']),
  spr(['...w...', '...u...', '...u...', 'wuuwuuw', '...u...', '...u...', '...w...']),
];
const PUFF = [spr(['.ww.', 'wwww', 'wwww', '.ww.']), spr(['..ww..', '.wwwww', 'ww..ww', '.wwww.']), spr(['.w..w.', 'w....w', '.w..w.'])];
const BUBBLE = O(['..wwwww..', '.wwwrwww.', 'wwwwrwwww', 'wwwwrwwww', 'wwwwrwwww', 'wwwwwwwww', 'wwwwrwwww', '.wwwwwww.', '..wwww...', '..ww.....', '..w......']);
const BUBBLE_S = O(['.www.', 'wwrww', 'wwrww', 'wwwww', 'wwrww', '.www.', '.w...']);
const DIG = { 0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 5: ['111', '100', '111', '001', '111'] };
function tinyNum(str, x, y, c, sh) { let cx = x; for (const ch of str) { const g = DIG[ch]; for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j][i] === '1') { if (sh) px(cx + i + 1, y + j + 1, sh); } for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j][i] === '1') px(cx + i, y + j, c); cx += 4; } }

// ------------------------------------------------------------------ fonts -> 1-bit masks
const gcache = new Map();
function glyph(ch, fam, size) {
  const key = fam + size + ch; if (gcache.has(key)) return gcache.get(key);
  const c = document.createElement('canvas'); c.width = size * 2; c.height = size * 2; const x = c.getContext('2d');
  x.font = `${size}px "${fam}"`; x.fillStyle = '#fff'; x.textBaseline = 'alphabetic'; x.fillText(ch, 0, size);
  const id = x.getImageData(0, 0, c.width, c.height).data; const m = new Uint8Array(c.width * c.height);
  for (let i = 0; i < m.length; i++) m[i] = id[i * 4 + 3] > 110 ? 1 : 0;
  const g = { w: c.width, h: c.height, m, adv: Math.round(x.measureText(ch).width), size }; gcache.set(key, g); return g;
}
function text(str, x, base, fam, size, col, sh, spacing = 0, n = Infinity) {
  let cx = x, i = 0;
  for (const ch of str) { if (i++ >= n) break; const g = glyph(ch, fam, size);
    for (let pass = 0; pass < 2; pass++) { const c = pass ? col : sh; if (!c) continue; const ox = pass ? 0 : sh === col ? 0 : 1, oy = pass ? 0 : 1;
      for (let j = 0; j < g.h; j++) for (let k = 0; k < g.w; k++) if (g.m[j * g.w + k]) px(cx + k + ox, base - size + j + oy, c); }
    cx += g.adv + spacing; }
  return cx - x;
}
const textW = (str, fam, size, spacing = 0) => { let w = 0; for (const ch of str) w += glyph(ch, fam, size).adv + spacing; return w - spacing; };

// ------------------------------------------------------------------ logo (custom 6x7-cell block glyphs, 4-px cells)
const LG = {
  P: ['11111.', '11..11', '11..11', '11111.', '11....', '11....', '11....'],
  I: ['111111', '..11..', '..11..', '..11..', '..11..', '..11..', '111111'],
  X: ['11..11', '11..11', '.1111.', '..11..', '.1111.', '11..11', '11..11'],
  E: ['111111', '11....', '11....', '11111.', '11....', '11....', '111111'],
  L: ['11....', '11....', '11....', '11....', '11....', '11....', '111111'],
  Q: ['.1111.', '11..11', '11..11', '11..11', '11.111', '.1111.', '....11'],
  U: ['11..11', '11..11', '11..11', '11..11', '11..11', '11..11', '.1111.'],
  S: ['.11111', '11....', '11....', '.1111.', '....11', '....11', '11111.'],
  T: ['111111', '..11..', '..11..', '..11..', '..11..', '..11..', '..11..'],
};
const CELL = 4, LW_ = 5 * 6 * CELL + 4 * CELL, LH_ = 7 * CELL, EXT = 4, GAP = 5;
function buildLogo() {
  const w = LW_ + 2, h = (LH_ + EXT) * 2 + GAP + 2, mask = new Uint8Array(w * h), fill = new Uint8Array(w * h), row = new Int16Array(w * h).fill(-1);
  ['PIXEL', 'QUEST'].forEach((word, li) => {
    const oy = 1 + li * (LH_ + EXT + GAP);
    [...word].forEach((ch, ci) => { const g = LG[ch]; const ox = 1 + ci * 7 * CELL;
      for (let j = 0; j < 7; j++) for (let i = 0; i < 6; i++) if (g[j][i] === '1')
        for (let yy = 0; yy < CELL; yy++) for (let xx = 0; xx < CELL; xx++) { const p = (oy + j * CELL + yy) * w + ox + i * CELL + xx; mask[p] = 1; row[p] = j * CELL + yy; } });
  });
  const out = new Uint8Array(w * h);
  const at = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (!mask[y * w + x]) continue; const r = row[y * w + x]; let c;
    if (r < 2) c = M(15); else if (r < 10) c = M(14); else if (r < 14) c = ((x + y) & 1) ? M(14) : M(13); else if (r < 21) c = M(13); else if (r < 24) c = ((x + y) & 1) ? M(13) : M(12); else c = M(12);
    if (!at(x, y - 1)) c = M(15); else if (!at(x - 1, y) && r < 16) c = M(15);
    out[y * w + x] = c; fill[y * w + x] = 1; }
  for (let y = h - 1; y >= 0; y--) for (let x = 0; x < w; x++) if (mask[y * w + x]) for (let d = 1; d <= EXT; d++) { const yy = y + d; if (yy < h && !mask[yy * w + x] && !out[yy * w + x]) out[yy * w + x] = d < EXT ? M(26) : M(9); }
  const o2 = out.slice();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!out[y * w + x]) { const n = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && out[yy * w + xx];
    if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) o2[y * w + x] = M(0); }
  return { w, h, d: o2, fill };
}
const LOGO0 = buildLogo(), LOGO = LOGO0;
// v5 title 「像素风」: Fusion Pixel 12 glyph bitmaps, 1 font px = C5×C5 logical px, same fill ramp / top bevel / drop / outline
const C5 = 4, EXT5 = 2, SP5 = 1, Y5 = 18, RIB5 = 72;
function buildLogo5(str) {
  const gs = [...str].map(ch => glyph(ch, 'Fusion Pixel 12', 12)), cols = []; let t = 99, b = -1;
  for (const g of gs) { let l = 99, r = -1; for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.m[y * g.w + x]) { t = Math.min(t, y); b = Math.max(b, y); l = Math.min(l, x); r = Math.max(r, x); } cols.push([l, r]); }
  const LH = (b - t + 1) * C5, gw = cols.map(([l, r]) => (r - l + 1) * C5);
  const w = gw.reduce((a, c) => a + c, 0) + (gs.length - 1) * (1 + SP5) * C5 + 2, h = LH + EXT5 + 2;
  const mask = new Uint8Array(w * h), fill = new Uint8Array(w * h), row = new Int16Array(w * h).fill(-1);
  let ox = 1;
  gs.forEach((g, gi) => { const [l, r] = cols[gi];
    for (let j = t; j <= b; j++) for (let i = l; i <= r; i++) if (g.m[j * g.w + i])
      for (let yy = 0; yy < C5; yy++) for (let xx = 0; xx < C5; xx++) { const p = (1 + (j - t) * C5 + yy) * w + ox + (i - l) * C5 + xx; mask[p] = 1; row[p] = (j - t) * C5 + yy; }
    ox += gw[gi] + (1 + SP5) * C5; });
  const out = new Uint8Array(w * h), at = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x], sc = 28 / LH;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (!mask[y * w + x]) continue; const r = row[y * w + x] * sc; let c;
    if (r < 2) c = M(15); else if (r < 10) c = M(14); else if (r < 14) c = ((x + y) & 1) ? M(14) : M(13); else if (r < 21) c = M(13); else if (r < 24) c = ((x + y) & 1) ? M(13) : M(12); else c = M(12);
    if (!at(x, y - 1)) c = M(15); else if (!at(x - 1, y) && r < 16) c = M(15);
    out[y * w + x] = c; fill[y * w + x] = 1; }
  for (let y = h - 1; y >= 0; y--) for (let x = 0; x < w; x++) if (mask[y * w + x]) for (let d = 1; d <= EXT5; d++) { const yy = y + d; if (yy < h && !mask[yy * w + x] && !out[yy * w + x]) out[yy * w + x] = d < EXT5 ? M(26) : M(9); }
  const o2 = out.slice();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!out[y * w + x]) { const n = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && out[yy * w + xx];
    if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) o2[y * w + x] = M(0); }
  const cn = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x] && !at(x, y - 1) && !at(x - 1, y)) cn.push([x, y]);   // top-left stroke corners → glint spots
  cn.sort((a, b2) => a[0] - b2[0]); const glint = [0.04, 0.78, 0.36, 0.96, 0.58].map(u => cn[Math.min(cn.length - 1, Math.floor(u * cn.length))]);
  return { w, h, d: o2, fill, glint, gh: LH };
}
const LOGO5 = V5 ? buildLogo5('像素风') : null;

// ------------------------------------------------------------------ background layers (precomputed slot bitmaps)
function layer(w, fn) { const d = new Uint8Array(w * H); for (let y = 0; y < H; y++) for (let x = 0; x < w; x++) d[y * w + x] = fn(x, y) || 0; return { w, d }; }
function blitLayer(L, off, y0 = 0, y1 = H) { for (let y = y0; y < y1; y++) { const r = y * L.w + off, o = y * W; for (let x = 0; x < W; x++) { const s = L.d[r + x]; if (s) IB[o + x] = s; } } }
const CAM_END = 260, X0 = 150, GROUND = 150;
// far mountains (x0.125)
const MT = (() => {
  const w = 380, R = rng(7), top = new Float32Array(w), peaks = [];
  let x = -10, hi = true; const pts = [];
  while (x < w + 40) { const y = hi ? 64 + R() * 18 : 94 + R() * 10; pts.push([x, y]); if (hi) peaks.push([x, y]); x += 16 + R() * 22; hi = !hi; }
  for (let i = 0; i < pts.length - 1; i++) { const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    for (let xx = Math.ceil(ax); xx < bx; xx++) if (xx >= 0 && xx < w) top[xx] = Math.round(ay + (by - ay) * (xx - ax) / (bx - ax) + (hash(xx, 3) < 0.25 ? 1 : 0)); }
  return layer(w, (x, y) => {
    const t = top[x]; if (y < t) return 0;
    let pk = peaks[0]; for (const p of peaks) if (Math.abs(p[0] - x) < Math.abs(pk[0] - x)) pk = p;
    const lit = x >= pk[0] - Math.floor((y - pk[1]) * 0.35);
    if (y > 112) { const m = (y - 112) / 14; if (m > bay(x, y)) return E.mist; }
    if (pk[1] < 76 && y < pk[1] + 6 - Math.abs(x - pk[0]) * 0.3 + (hash(x, 9) < 0.3 ? 1 : 0)) return E.mS;
    return lit ? E.mL : E.mD;
  });
})();
// mid layer: mesas, pines, waterfall (x0.3)
const WF_X = 137, WF_W = 9;
const MID = (() => {
  const w = 420, R = rng(11);
  const ridge = x => Math.round(111 + 4 * Math.sin(x * 0.043) + 3 * Math.sin(x * 0.11 + 1.3));
  const CL0 = 118, CL1 = 166, CLT = 96;                 // rock cliff carrying the waterfall
  // canopy silhouette: a row of pine tips of random width/height
  const canopy = new Int16Array(w), tipc = new Int16Array(w), tiph = new Int8Array(w);
  for (let x = 0; x < w;) { const tw = 4 + Math.floor(R() * 4), th = 3 + Math.floor(R() * 5); for (let i = 0; i < tw && x + i < w; i++) { const u = Math.abs(i - (tw - 1) / 2) / ((tw + 1) / 2); canopy[x + i] = Math.round(th * (1 - u)); tipc[x + i] = x + (tw >> 1); tiph[x + i] = th; } x += tw; }
  const jit = x => Math.floor(hash(x, 21) * 4);
  const bush = new Int16Array(w).fill(999), bushC = new Int16Array(w), R2 = rng(12);     // 2nd staggered bush-silhouette row
  for (let bx = -3, k = 0; bx < w + 6; k++) { const r = 3 + Math.floor(R2() * 3), cy = 127 + ((k & 1) ? 3 : 0) + Math.floor(R2() * 2);
    for (let i = -r; i <= r; i++) { const xx = bx + i; if (xx < 0 || xx >= w) continue; const t = Math.round(cy - Math.sqrt(Math.max(0, (r + 0.4) ** 2 - i * i)) * 0.85);
      if (t < bush[xx]) { bush[xx] = t; bushC[xx] = bx; } } bx += r + 1 + Math.floor(R2() * 3); }
  const L = layer(w, (x, y) => {
    if (x >= CL0 && x < CL1) { const t = CLT + (x < CL0 + 4 ? CL0 + 4 - x : 0) + (x >= CL1 - 5 ? x - (CL1 - 5) : 0);
      if (y >= t) {
        const FY = 124;                                   // foam band where the fall hits the plunge pool
        if (y >= FY && y < FY + 3 && x >= WF_X - 2 && x < WF_X + WF_W + 2) { const k = y - FY; return (k === 0 || (k === 1 && ((x + y) & 1)) || (k === 2 && bay(x, y) < 0.25)) ? E.w3 : WS[(x + y) & 3]; }
        if (y >= FY + 3 && y < FY + 6 && x >= WF_X - 3 && x < WF_X + WF_W + 3) return y === FY + 5 ? E.w0 : WS[(Math.floor((x + (y & 1) * 2) / 3)) & 3];
        if (x >= WF_X && x < WF_X + WF_W && y >= CLT + 1 && y < FY) { if (y < CLT + 3) return E.w3; const g = (x === WF_X || x === WF_X + WF_W - 1) ? 1 : hash(x, 41) < 0.5 ? 0 : 1; return WFG[g][(y + Math.floor(hash(x, 43) * 8)) & 7]; }
        if (y < t + 2) return y === t ? E.fL : E.fM;
        if (x >= CL1 - 7 || (x > WF_X + WF_W && x < WF_X + WF_W + 2)) return E.rL; if (x < CL0 + 6 || (x >= WF_X - 2 && x < WF_X)) return E.rD;
        if ((y - t) % 6 === 3 && hash(x >> 2, y) < 0.65) return E.rD;
        if (y > 126 && (y - 126) / 18 > bay(x, y)) return E.rD;
        return hash(x, y) < 0.07 ? E.rL : E.rM; } }
    const top = ridge(x) - canopy[x]; if (y < top) return 0;
    const lit = x > tipc[x] && y < ridge(x) + 2;
    if (y < ridge(x) + 1) return lit ? E.fL : x < tipc[x] ? E.fD : E.fM;
    if (y >= bush[x]) { const lit = x > bushC[x]; if (y === bush[x]) return lit && hash(x, 51) < 0.7 ? E.fL : E.fM;
      if (y === bush[x] + 1 && lit && hash(x, 52) < 0.35) return E.fL; return (y - bush[x] - 4) / 6 > bay(x, y) ? E.fD : E.fM; }
    if (y > 120 && (y - 120) / 12 > bay(x, y)) return E.fD;
    const cg = Math.floor((x + 60) / 6), dy = y - ridge(x) - 1 + Math.floor(hash(cg, 31) * 5), row = Math.floor(dy / 5), r = dy % 5, q = (x + 60) % 6;
    if (r === 0 && q === 3 && hash(cg, row) < 0.7) return E.fL; if (r === 1 && (q === 2 || q === 4)) return E.fM; if (r === 4 && q !== 3) return E.fD;
    return E.fM;
  });
  // taller lone pines on the ridge and on the cliff top
  for (let x = 6; x < w; x += 12 + Math.floor(R() * 22)) { if (x > WF_X - 4 && x < WF_X + WF_W + 3) continue; const onCliff = x >= CL0 + 4 && x < CL1 - 5; const base = onCliff ? CLT + 1 : ridge(x) - 1, h = (onCliff ? 12 : 9) + Math.floor(R() * 10);
    const tier = Math.ceil(h / 3);
    for (let r = 0; r < h; r++) { const k = Math.floor(r / tier), within = r % tier, half = Math.floor((within + 1) * (0.7 + k * 0.35));
      const yy = base - h + r; for (let dx = -half; dx <= half; dx++) { const xx = x + dx; if (xx < 0 || xx >= w || yy < 0) continue; L.d[yy * w + xx] = dx === half && dx > 0 ? E.fL : dx >= 0 ? E.fM : E.fD; } }
    if (base >= 0) L.d[base * w + x] = E.rD;
  }
  return L;
})();
// near hills (x0.55)
const HILLS = (() => {
  const w = 480, R = rng(23), bumps = [];
  for (let x = -10; x < w + 20; x += 20 + R() * 20) bumps.push([x, 12 + R() * 11]);
  const L = layer(w, (x, y) => {
    let best = null;
    for (const [cx, r] of bumps) { const cy = GROUND + r * 0.3; const d = Math.hypot(x - cx, (y - cy) * 1.15); if (d <= r && (!best || d - r < best.e)) best = { cx, cy, r, d, e: d - r }; }
    if (!best) return 0;
    const rim = best.r - best.d;
    if (rim < 1.5 && x > best.cx - best.r * 0.3) return E.hL;
    if (rim < 2.5 && (x + y) % 3 === 0 && x > best.cx) return E.hL;
    if (y > 138 && (y - 138) / 14 > bay(x, y)) return E.hD;
    if (hash(x >> 1, y >> 1) < 0.08) return E.hL;
    return E.hM;
  });
  return L;
})();

// ------------------------------------------------------------------ world state (closed-form)
const SKID = [0, 2, 3, 4, 5, 6, 7, 7, 8, 8, 8, 8, 8];
const fStop = F(cues.stop), fSkid = F(cues.skid);
const hx = f => f <= fSkid ? X0 + 2 * f : X0 + 2 * fSkid + SKID[Math.min(f - fSkid, 12)];
const cam = f => { const r = hx(f) - 96; return r < CAM_END - 6 ? r : Math.min(CAM_END, CAM_END - 6 + Math.max(0, f - (CAM_END - 6 - (hx(0) - 96)) / 2)); };
const J1 = F(cues.jumps[0]), J2 = F(cues.jumps[1]), STOMP = F(cues.stomp), L2 = F(cues.lands[1]);
const BR0 = 316, BR1 = 380;
const bridgeSag = wx => (wx >= BR0 && wx < BR1) ? Math.round(2 * Math.sin(Math.PI * (wx - BR0) / (BR1 - BR0))) : 0;
function heroH(f) {
  if (f >= J1 && f < J1 + 18) { const s = (f - J1) / 18; return Math.round(112 * s * (1 - s)); }
  if (f >= J2 && f <= STOMP) { const s = (f - J2) / 13.21; return Math.round(96 * s * (1 - s)); }
  if (f > STOMP && f < L2) { const u = (f - STOMP) / (L2 - STOMP); return Math.round(8 * (1 - u) + 72 * u * (1 - u)); }
  return 0;
}
function heroPose(f) {
  const h = heroH(f), hp = heroH(f - 1);
  if (f >= FGET) { const k = f < FGET + 24 ? Math.floor((f - FGET) / 6) : Math.floor((f - FGET) / 12); return (k & 1) ? ['get1', POSE.get1, 'hang'] : ['get0', POSE.get0, 'hang']; }
  if (f >= FCHEER) return ['cheer', POSE.cheer, 'hang'];
  if (f >= FLASH) return ['land', POSE.land, 'hang'];
  if (f >= FLINCH) return f < FLINCH + 1 ? ['flinch0', POSE.flinch0, 'hang'] : ['flinch1', POSE.flinch1, 'hang'];
  if (f >= fStop) return ((Math.floor(f / 12) & 1) ? ['idle1', POSE.idle1, 'hang'] : ['idle0', POSE.idle0, 'hang']);
  if (f >= fSkid) return ['skid', POSE.skid, 'run1'];
  if (h > 0) return h >= hp && f !== STOMP ? ['up', POSE.up, 'up'] : ['down', POSE.down, 'down'];
  if ((f >= J1 - 2 && f < J1) || (f >= J2 - 2 && f < J2)) return ['land', POSE.land, 'run1'];   // anticipation crouch
  if ((f >= J1 + 18 && f < J1 + 20) || (f >= L2 && f < L2 + 2)) return ['land', POSE.land, 'hang'];
  const ph = Math.floor(f / 3) % 6; return ['run' + ph, RUN[ph], 'run' + (Math.floor(f / 3) % 3)];
}
const COINS = cues.coins.map(t => { const f = F(t), x = hx(f) + 8, y = GROUND - heroH(f) - 10 + bridgeSag(x); return { f, x, y }; });
const SLIME_X = hx(STOMP) + 8;
const CHEST_X = 422, FGET = F(cues.item_get), FCHEER = F(cues.cheer), FLINCH = F(cues.flinch);
const LH1 = F(cues.lid_hops[0]), LH2 = F(cues.lid_hops[1]), fShk = F(cues.chest_shake[0]);
const fType = F(cues.type[0]), fBoxO = F(cues.box_open), fBoxC = F(cues.box_close), fLogo = F(cues.logo), fShine = F(cues.shine), fSub = F(cues.subtitle[0]), fPress = F(cues.press_start);
function scoreAt(f) { let s = 0, c = 0; for (const k of COINS) if (f >= k.f) { s += 100; c++; } if (f >= STOMP) s += 500; return [s, c]; }
// chest fountain (precomputed ballistic, integer positions)
const FOUNT = (() => { const R = rng(99), a = [];
  const VX = [-3.2, 2.8, -2.4, 2.0, -1.6, 1.6, -2.0, 2.4, -2.8, 3.2];
  VX.forEach((vx, i) => a.push({ kind: 'coin', vx: vx + (R() - 0.5) * 0.2, vy: -6 - R() * 3, g: 0.5, ph: i, t0: 1 + i, sx: vx < 0 ? -7 : 7 }));
  for (let i = 0; i < 14; i++) a.push({ kind: 'spark', vx: (R() - 0.5) * 3.2, vy: -2.5 - R() * 3, g: 0.1, life: 12 + Math.floor(R() * 10), d: Math.floor(R() * 4) });
  return a; })();
function fountPos(p, tau, x0, y0) { let x = x0 + p.vx * tau, y = y0 + p.vy * tau + 0.5 * p.g * tau * tau, life = 1;
  if (p.kind === 'coin') { const yg = GROUND - 6, tl = (-p.vy + Math.sqrt(p.vy * p.vy + 2 * p.g * (yg - y0))) / p.g;
    if (tau > tl) { const t2 = tau - tl, v2 = -(p.vy + p.g * tl) * 0.4, t3 = 2 * v2 / p.g; x = x0 + p.vx * (tl + Math.min(t2, t3) * 0.7);
      y = t2 < t3 ? yg - (v2 * t2 - 0.5 * p.g * t2 * t2) : yg; life = t2 < t3 ? 1 : t2 - t3 < 10 ? 2 : 0; } }
  return [Math.round(x), Math.round(y), life]; }
const STARS = (() => { const R = rng(5), a = []; for (let i = 0; i < 80; i++) a.push({ x: Math.floor(R() * W), y: 3 + Math.floor(R() * 96), k: Math.floor(R() * 4), big: R() < 0.08, early: R() < 0.4 }); return a; })();
const CLOUDS = (() => { const R = rng(3), a = []; const ys = [34, 52, 28, 60, 44, 38];
  for (let i = 0; i < 6; i++) { const w = 30 + Math.floor(R() * 28); const n = 3 + Math.floor(R() * 2), bumps = [];
    for (let b = 0; b < n; b++) { const u = (b + 0.5) / n; bumps.push([w * (0.12 + 0.76 * u), (0.16 + 0.16 * Math.sin(Math.PI * u) + R() * 0.06) * w]); }
    const h = Math.ceil(Math.max(...bumps.map(b => b[1]))) + 2;
    a.push({ x: i * 68 + Math.floor(R() * 24), y: ys[i] - h, w, h, bumps }); } return a; })();
const FG = [[20, 9], [70, 12], [150, 8], [236, 11], [330, 10], [372, 13], [420, 9], [520, 12], [610, 10], [646, 13], [700, 8]];
const FIREFLY = (() => { const R = rng(17), a = []; for (let i = 0; i < 7; i++) a.push({ x: 20 + Math.floor(R() * 280), y: 112 + Math.floor(R() * 30), p: R() * 6.28, q: R() * 6.28, o: Math.floor(R() * 20) }); return a; })();

// ------------------------------------------------------------------ frame
function drawSky(f) {
  const sk = [E.s0, E.s1, E.s2, E.s3, E.s4];
  for (let y = 0; y < H; y++) { const v = clamp((y - 4) / 116 * 4, 0, 4), b = Math.floor(v), fr = v - b, fr2 = clamp((fr - 0.5) * 2.2 + 0.5, 0, 1);
    for (let x = 0; x < W; x++) IB[y * W + x] = sk[Math.min(4, b + (fr2 > bay(x, y) ? 1 : 0))]; }
  // stars
  const wr = waveR(f), lp = lightAt(f);
  if (f >= FLASH + 2) for (const s of STARS) { if (!s.early && (wr === null || Math.hypot(s.x - lp[0], s.y - lp[1]) < wr + 3)) continue;
    if (lp && Math.hypot(s.x - lp[0], s.y - lp[1]) < lp[2] + 3) continue; const c = STS[s.k]; px(s.x, s.y, c);
    if (s.big) { px(s.x - 1, s.y, M(3)); px(s.x + 1, s.y, M(3)); px(s.x, s.y - 1, M(3)); px(s.x, s.y + 1, M(3)); } }
  // sun
  const sy = Math.round(44 + f * 0.41), sx = 236;
  if (sy < 140 && !hidden('sun')) for (let y = sy - 22; y <= sy + 22; y++) for (let x = sx - 22; x <= sx + 22; x++) { const d = Math.hypot(x - sx, y - sy), b = bay(x, y);
    if (d <= 10) px(x, y, E.sun); else if (d <= 16 && b < 0.5 - (d - 10) * 0.02) px(x, y, E.sunG); else if (d <= 22 && b < 0.25 - (d - 16) * 0.025) px(x, y, E.sunG); }
  // clouds
  const off = Math.floor(cam(f) * 0.06) + Math.floor(f / 4);
  for (const c of CLOUDS) { const x0 = ((c.x - off) % 420 + 420) % 420 - 50;
    for (let j = 0; j < c.h; j++) for (let i = 0; i < c.w; i++) { const by = c.h - 1; let inn = false, rim = 0;
      for (const [bx, r] of c.bumps) { const d = Math.hypot(i - bx, (j - by) * 1.25); if (d <= r) { inn = true; rim = Math.max(rim, r - d); } }
      if (!inn) continue; const shade = j >= by - 1 || (j >= by - 3 && bay(x0 + i, j) < 0.5); px(x0 + i, c.y + j, shade ? E.clD : E.clL); } }
}
function drawGround(f, cx) {
  for (let y = 140; y < H; y++) for (let x = 0; x < W; x++) { const wx = x + cx; let s = 0;
    if (wx >= BR0 && wx < BR1) {
      const sag = bridgeSag(wx), py = y - sag;
      if (py >= 150 && py <= 153) s = (wx - BR0) % 4 === 3 ? E.dD : py === 150 ? E.dL : py === 153 ? E.dD : E.dM;
      else if (y >= 154 + sag) { const deep = y - 156, dash = ((y * 7 + (wx >> 2)) & 3) === 0;
        if (dash && hash(wx >> 2, y) < 0.17 && ((Math.floor(wx / 3) + (f >> 2)) & 3) === 0) s = E.rvG;
        else if (dash || (y === 154 + sag && (wx & 3) < 2)) s = WS[(Math.floor((wx + (y & 1) * 2) / 3)) & 3]; else s = deep > 10 ? E.rvD : E.rvB; }
      const rope = 143 + Math.round(4 * Math.sin(Math.PI * (wx - BR0) / (BR1 - BR0)));
      if (y === rope) s = E.dD; if ((wx - BR0) % 8 === 4 && y > rope && py < 150) s = E.dD;
      if ((wx - BR0 < 2 || BR1 - wx <= 2) && y >= 141 && y < 154) s = (wx - BR0 === 0 || BR1 - wx === 1) ? E.dL : E.dD;
    } else if (y < 150) {
      if (y === 149 && hash(wx, 1) < 0.35) s = E.gM; else if (y === 148 && hash(wx, 1) < 0.1) s = E.gL;
      if (hash(wx >> 0, 77) < 0.035) { if (y === 147) s = E.flw; else if (y >= 148) s = E.gD; }
    } else {
      const bank = wx === BR0 - 1 || wx === BR1;
      if (y === 150) s = hash(wx, 2) < 0.15 ? E.gM : E.gL; else if (y <= 152) s = hash(wx, y) < 0.08 ? E.gL : E.gM; else if (y === 153) s = E.gD;
      else { const drip = Math.floor(hash(wx >> 1, 5) * 3); if (y < 154 + drip && y <= 155) s = E.gD;
        else { const ty = y - 156, row = Math.floor(ty / 12), tx = (wx + (row & 1) * 8) & 15;
          if (tx === 0 || ty % 12 === 11 || ty < 0) s = E.dD; else if (tx === 1 || ty % 12 === 0) s = E.dL; else s = hash(wx, y) < 0.05 ? E.dL : hash(wx + 1, y - 1) < 0.05 ? E.dD : E.dM; } }
      if (bank && y > 150) s = E.dD;
    }
    if (s) IB[y * W + x] = s; }
}
const FRAYS = F(cues.rays_off);
const raysStep = f => f < FRAYS ? -1 : Math.floor((f - FRAYS) / 3);     // -1 full, 0 R34, 1 R18, 2+ gone
const RIM_DIM = [{ [M(8)]: M(15), [M(15)]: M(14) }, { [M(8)]: M(14), [M(15)]: M(13) }, { [M(8)]: M(13), [M(15)]: M(24) }];
function drawRays(f) {
  const tau = f - FLASH; if (tau < 0) return; const rs = raysStep(f); if (rs >= 2) return;
  const cx = CHEST_X - CAM_END + 10, cy = GROUND - 11;
  const R = rs === 0 ? 34 : rs === 1 ? 18 : tau < 6 ? 30 + tau * 26 : Math.max(50, 190 - (tau - 6) * 7) + ((Math.floor(f / 6) & 1) ? 2 : 0), core = rs === 0 ? 8 : rs === 1 ? 0 : 14;
  const rot = Math.floor(f / 3) * 0.035;
  for (let y = Math.max(0, cy - R); y < GROUND; y++) for (let x = Math.max(0, cx - R); x < Math.min(W, cx + R); x++) {
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy); if (d > R) continue;
    const a = Math.atan2(dy, dx) + rot, band = Math.floor((a / (2 * Math.PI) + 1) * 18) & 1; const fall = 1 - d / R;
    if (d < core) continue;
    if (band && fall * 1.3 > bay(x, y)) px(x, y, d < R * 0.4 ? M(15) : M(14));
  }
}
function drawHero(f, cx) {
  const [key, p, tail] = heroPose(f); let h = heroH(f);
  if (key === 'cheer') h = 2;
  const x = hx(f) - cx, bx = hx(f) + 8, sag = bridgeSag(bx);
  const blink = (f >= 150 && f < 152) || (f >= 276 && f < 278) || key.startsWith('flinch');
  const s = hero(key, p, tail, blink); blit(s, x - HERO_OX, GROUND - 20 - h + sag - HERO_OY + 1);
}
function drawEntities(f, cx) {
  // coins
  for (const c of COINS) { if (f < c.f) blit(COIN[(Math.floor(f / 3) + c.x) & 3], c.x - cx - 4, c.y - 5);
    else if (f < c.f + 9) { const a = f - c.f; const s = SPARK[a < 3 ? 1 : a < 6 ? 2 : 0]; blit(s, c.x - cx - (s.w >> 1), c.y - (s.h >> 1)); } }
  // slime
  const sx = SLIME_X - cx;
  if (f < STOMP) { const A = (Math.floor(f / 5) & 1) === 0; blit(A ? SLIME_A : SLIME_B, sx - 7, GROUND - (A ? 9 : 7)); }
  else if (f < STOMP + 7) blit(SLIME_F, sx - 7, GROUND - 4);
  else if (f < STOMP + 16) { const a = f - STOMP - 7, s = PUFF[Math.min(2, Math.floor(a / 3))]; blit(s, sx - (s.w >> 1), GROUND - 6 - Math.floor(a / 3)); }
  // dust puffs
  const puffs = [[J1, hx(J1) + 4], [J1 + 18, hx(J1 + 18) + 6], [J2, hx(J2) + 4], [L2, hx(L2) + 6]];
  for (let k = fSkid; k < fStop; k += 3) puffs.push([k, hx(k) + 12]);
  for (const [f0, wx] of puffs) { const a = f - f0; if (a < 0 || a >= 9) continue; const s = PUFF[Math.floor(a / 3)]; blit(s, wx - cx - (s.w >> 1) - Math.floor(a / 3), GROUND - s.h - Math.floor(a / 4)); }
  // chest
  const chx = CHEST_X - cx; let shake = 0;
  if (f >= fShk && f < FLASH) shake = [1, -1, 0, 1, -1, 1, 0, -1, 1, -1, 1, 0][(f - fShk) % 12];
  if (f >= FLASH) {
    const tau = f - FLASH, gp = gemPos(f); let nsp = 0;
    for (const p of FOUNT) {
      if (p.kind === 'coin') { const tt = tau - p.t0; if (tt < 0) continue; const [x, y, life] = fountPos(p, tt, chx + 10 + p.sx, GROUND - 12);
        if (!life || (life === 2 && (f & 1))) continue; blit(COIN[(Math.floor(f / 2) + p.ph) & 3], x - 3, y - 4); }
      else { const [x, y] = fountPos(p, tau, chx + 10, GROUND - 12); if (tau > p.life) continue; if (gp && Math.hypot(x - gp[0], y - gp[1]) < 20 && ++nsp > 6) continue; const s = SPARK[tau < p.life * 0.3 ? 2 : tau < p.life * 0.7 ? 1 : 0]; blit(s, x - (s.w >> 1), y - (s.h >> 1)); } }
    const cs = f === FLASH ? CHEST_HALF : CHEST_OPEN, rs = raysStep(f); blit(cs, chx, GROUND - cs.h + 1, false, rs < 0 ? null : RIM_DIM[Math.min(2, rs)]);
  } else {
    const talking = f >= fType && f < fType + 27 && (Math.floor((f - fType) / 3) % 2 === 0);
    const hop = talking ? 1 : 0;
    let cs = talking ? CHEST_TALK : CHEST;
    let L = 0;
    if (f >= LH1 && f < LH1 + 2) { cs = CHEST_CRACK; shake = 0; L = 4; } else if (f === LH1 + 2) shake = -1;
    else if (f >= LH2 && f < FLASH) { cs = CHEST_CRACK2; shake = (f & 1) ? 1 : 0; L = 8 + (f - LH2) * 7; }
    if (L) { const sy = GROUND - 10;                             // light leaking from the seam
      for (const [x0, ddx, ddy] of [[1, -1, -0.55], [5, -0.35, -1], [10, 0, -1], [14, 0.35, -1], [18, 1, -0.55]]) {
        line(chx + x0, sy, chx + x0 + Math.round(ddx * L), sy + Math.round(ddy * L), (x, y) => { const d = Math.hypot(x - chx - x0, y - sy); if (d < L * 0.55 || bay(x, y) < 0.5) px(x, y, d < L * 0.55 ? M(15) : M(14)); }); } }
    blit(cs, chx + shake, GROUND - cs.h + 1);
    if (f >= fShk) for (const k of [fShk, fShk + 3, LH1, LH2]) { const a = f - k; if (a < 0 || a > 4) continue;      // dust flecks
      for (const sd of [-1, 1]) px(chx + (sd < 0 ? 0 : 19) + sd * (1 + a + (k & 1)), GROUND - [1, 2, 2, 1, 0][a], E.dL); }
  }
  drawStar(f);
  drawHero(f, cx);
  drawGem(f);
  // alert bubble
  if (f >= F(cues.question) && f < FLASH) { const ex = f >= LH2, b = ex ? BUBBLE : BUBBLE_Q, pop = f < (ex ? LH2 : F(cues.question)) + 2 ? 1 : 0; blit(b, hx(f) - cx + 9 + (ex ? 1 : 0), GROUND - 20 - b.h - 1 - pop); }
  if (f >= fStop && f < fStop + 16) { const hxs = hx(f) - cx; const b = f < fStop + 2 ? BUBBLE_S : BUBBLE; blit(b, hxs + 9, GROUND - 20 - b.h - 1); }
}
const HERO_SX = hx(fStop) - CAM_END;                    // hero screen x once the camera has stopped
function gemPos(f) {
  const tau = f - FLASH; if (tau < 1) return null;
  const x0 = CHEST_X - CAM_END + 10, y0 = GROUND - 12, top = y0 - 34;
  if (tau <= 6) { const u = tau / 6; return [x0, Math.round(y0 - 34 * (1 - (1 - u) * (1 - u)))]; }
  if (f < FCHEER) return [x0, top];
  const hold = [HERO_SX + 8, GROUND - 19 - 4 - (V5 ? 1 : 0)];     // v5: the bigger orb sits 1 px higher
  if (f < FGET) { const u = (f - FCHEER + 1) / (FGET - FCHEER + 1); return [Math.round(x0 + (hold[0] - x0) * u), Math.round(top + (hold[1] - 2 - top) * u - 12 * u * (1 - u))]; }
  const [, p] = heroPose(f); return [hold[0], hold[1] + p.bob];
}
function drawGem(f) {
  const g = gemPos(f); if (!g) return; const [gx, gy] = g;
  if (V5) { if (!hidden('dot')) blit(ORB, gx - 5, gy - 5);
    if (f >= FGET) for (const sd of [-1, 1]) { const x0 = sd < 0 ? gx - 5 : gx + 4, xo = sd < 0 ? x0 - 1 : x0 + 2;   // 2x2 hands on the orb's lower sides (kept with nolink=dot)
      px(x0, gy + 2, M(28)); px(x0 + 1, gy + 2, M(28)); px(x0, gy + 3, M(25)); px(x0 + 1, gy + 3, M(25)); px(xo, gy + 2, M(0)); px(xo, gy + 3, M(0)); px(x0, gy + 1, M(0)); px(x0 + 1, gy + 1, M(0)); }
    return; }
  blit(GEM, gx - 4, gy - 4);
  if (f >= FGET) for (const sd of [-1, 1]) { const x0 = sd < 0 ? gx - 4 : gx + 3;                 // 2x2 hands wrapped on the lower facets
    px(x0, gy, M(28)); px(x0 + 1, gy, M(28)); px(x0, gy + 1, M(25)); px(x0 + 1, gy + 1, M(25)); px(sd < 0 ? x0 - 1 : x0 + 2, gy, M(0)); px(sd < 0 ? x0 - 1 : x0 + 2, gy + 1, M(0)); px(x0, gy - 1, M(0)); px(x0 + 1, gy - 1, M(0)); }
}
function drawStar(f) {
  if (hidden('dot')) return;                              // the orb's star / sparkles leave with it
  const g = gemPos(f); if (!g) return; const [gx, gy] = g;
  const sl = starLen(f); if (sl) { const a0 = (Math.floor(f / 4) & 3) * Math.PI / 8;
    for (let q = 0; q < 4; q++) { const ca = Math.cos(a0 + q * Math.PI / 2), sa = Math.sin(a0 + q * Math.PI / 2);
      for (let r = 5; r <= sl; r++) { const x = gx + Math.round(ca * r), y = gy + Math.round(sa * r), u = (r - 4) / (sl - 4); 
        if (u < 0.4) px(x, y, M(8)); else if (u < 0.72) px(x, y, M(7)); else if (bay(x, y) < 1.5 - u) px(x, y, M(6)); } } }
  if (f >= FGET && f < FGET + 6) { const a = f - FGET, s = SPARK[a < 2 ? 2 : a < 4 ? 1 : 0];            // catch burst
    blit(s, gx - (s.w >> 1), gy - (s.h >> 1)); for (const [vx, vy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) px(gx + vx * (5 + a * 2), gy + vy * (5 + a * 2), M(15)); }
  else if (f >= FGET + 6 && f < FRAYS) { const a = (f - FGET) % 8; if (a < 4) { const s = SPARK[a === 0 || a === 3 ? 0 : 1]; blit(s, gx + 4 - (s.w >> 1), gy - 4 - (s.h >> 1)); } }
  else if (f - FLASH > 6 && ((f >> 1) & 1)) px(gx + 3, gy - 3, M(8));
}
function starLen(f) { const rs = raysStep(f); if (rs < 0) return 0; if (rs < 3) return [7, 11, 15][rs]; return 12 + [6, 4, 2, 1][(f - FGET) % 12] || 12; }
function lightAt(f) {                                   // crystal light pool (cool palette re-light), [x, y, r, r1]
  if (f < FGET) return null; const g = gemPos(f), k = Math.floor((f - FGET) / 2);
  const r = [10, 20, 30, 37, 38][Math.min(4, k)], r1 = Math.min(22, Math.round(r * 0.58)) + (k >= 4 && ((f - FGET) % 12) < 2 ? 2 : k >= 4 && ((f - FGET) % 12) >= 6 && ((f - FGET) % 12) < 8 ? -2 : 0);
  return [g[0], g[1], r, r1];
}
const NWR = cues.night_wave_r, FNW = cues.night_wave.map(F);
const waveR = f => { if (f < FNW[0]) return null; let r = NWR[0]; for (let k = 0; k < FNW.length; k++) if (f >= FNW[k]) r = NWR[k]; return r; };
function drawPopups(f, cx) {
  if (f >= STOMP && f < STOMP + 30 && (f < STOMP + 20 || (f & 1))) tinyNum('500', SLIME_X - 6 - cx, GROUND - 19 - heroH(STOMP) - 11 - Math.floor((f - STOMP) / 2), M(8), M(0));
}
function drawFG(f, cx) {
  const off = Math.floor(cx * 1.4);
  for (const [fx, hgt] of FG) { const x0 = fx - off + 40; if (x0 < -12 || x0 > W + 12) continue;
    for (let b = 0; b < 5; b++) { const bx = x0 + b * 2 - 4, bh = hgt - Math.abs(b - 2) * 3 + (b & 1); for (let j = 0; j < bh; j++) { const lean = Math.floor(j * (b - 2) / 6); px(bx + lean, H - 1 - j, j > bh - 3 ? E.hM : E.hD); px(bx + lean + 1, H - 1 - j, E.hD); } } }
}
function drawFireflies(f) {
  if (f < fLogo + 6) return;
  for (const q of FIREFLY) { if (((f + q.o) % 22) >= 15) continue; const fs = Math.floor(f / 2) * 2; const x = q.x + Math.round(7 * Math.sin(fs * 0.045 + q.p)), y = q.y + Math.round(4 * Math.sin(fs * 0.07 + q.q));
    px(x, y, M(15)); if (((f + q.o) % 22) < 9) { px(x - 1, y, M(13)); px(x + 1, y, M(13)); px(x, y - 1, M(13)); px(x, y + 1, M(13)); } }
}
function drawHUD(f) {
  if (f >= fBoxO) return;
  const [s, c] = scoreAt(f);
  text('SCORE', 16, 17, 'Press Start 2P', 8, M(8), M(0));
  text(String(s).padStart(6, '0'), 16, 27, 'Press Start 2P', 8, M(14), M(0));
  blit(COIN[Math.floor(f / 3) & 3], 262, 8);
  text('x' + String(c).padStart(2, '0'), 272, 17, 'Press Start 2P', 8, M(8), M(0));
}
function drawBox(f) {
  let h = 0; const full = 30;
  if (f >= fBoxO && f < fBoxC) h = f < fBoxO + 2 ? 10 : f < fBoxO + 4 ? 20 : full;
  else if (f >= fBoxC && f < fBoxC + 3) h = [20, 10, 4][f - fBoxC];
  if (!h) return;
  const x0 = 72, w = 176, y0 = 99 - (h >> 1);
  rect(x0, y0, w, h, M(0)); rect(x0 + 1, y0 + 1, w - 2, h - 2, M(8)); rect(x0 + 2, y0 + 2, w - 4, h - 4, M(3)); rect(x0 + 3, y0 + 3, w - 6, h - 6, M(2));
  for (let y = y0 + 3; y < y0 + Math.min(h - 3, 9); y++) for (let x = x0 + 3; x < x0 + w - 3; x++) if (bay(x, y) < 0.5 - (y - y0 - 3) * 0.08) px(x, y, M(3));
  if (h < full) return;
  const tx = 165; blit(TAIL, tx - 3, y0 + h - 6); rect(tx - 3, y0 + h - 6, 13, 3, M(2)); rect(tx, y0 + h - 3, 7, 3, M(2));   // speech tail -> chest
  // name tag
  const ty = y0 - 8; { const tx = 82; rect(tx, ty, 56, 13, M(0)); rect(tx + 1, ty + 1, 54, 11, M(26)); rect(tx + 1, ty + 1, 54, 1, M(27));
  text('神秘宝箱', tx + 4, ty + 11, 'Fusion Pixel 12', 12, M(14), M(0)); }
  const n = f < fType ? 0 : Math.min(9, Math.floor((f - fType) / 3) + 1);
  const talk = f >= fType && f < fType + 27 && (Math.floor((f - fType) / 3) % 2 === 0);
  rect(x0 + 5, y0 + 5, 24, 20, M(1)); blit(talk ? CHEST_TALK : CHEST, x0 + 7, y0 + (talk ? 6 : 7));
  text('欢迎来到像素世界！', x0 + 34, y0 + 22, 'Fusion Pixel 12', 12, M(8), M(1), 1, n);
  if (f >= fType + 27 && ((f >> 2) & 1) === 0) { const ax = x0 + w - 14, ay = y0 + h - 9; for (let j = 0; j < 3; j++) for (let i = j; i < 5 - j; i++) px(ax + i, ay + j, M(14)); }
}
function drawLogo(f) {
  if (f < fLogo - 12) return 0;
  const LOGO = V5 ? LOGO5 : LOGO0;
  const X = (W - LOGO.w) >> 1, Y = V5 ? Y5 : 16;
  const BOUNCE = { 0: 0, 1: -5, 2: -2, 3: 0 };
  const i = f - (fLogo - 12), dy = f < fLogo ? Math.round(-128 * (1 - (i / 12) ** 2)) : (BOUNCE[Math.floor((f - fLogo) / 2)] ?? 0);   // gravity: spacing grows every frame
  const flash = f === fLogo ? M(8) : f === fLogo + 1 ? M(15) : 0;
  const shineS = f >= fShine && f < fShine + 12 ? -30 + (f - fShine) * (V5 ? 20 : 18) : -999;
  const SQT = { 0: [6, 6], 1: [3, 3], 2: [-4, -2], 3: [-4, -2] }, [SQ, SW] = SQT[f - fLogo] || [0, 0];   // squash 6/12 px, stretch +4 on the rebound
  const LHs = LOGO.h - SQ, LWs = LOGO.w + 2 * SW;
  for (let jj = 0; jj < LHs; jj++) { const j = Math.floor(jj * LOGO.h / LHs), y = Y + dy + SQ + jj; if (y < 0 || y >= H) continue;
    for (let ii = 0; ii < LWs; ii++) { const i = Math.floor(ii * LOGO.w / LWs); let c = LOGO.d[j * LOGO.w + i]; if (!c) continue;
      if (LOGO.fill[j * LOGO.w + i]) { if (flash) c = flash; const u = i + j * 0.7; if (u >= shineS && u < shineS + 6) c = M(8); else if (u >= shineS + 9 && u < shineS + 11) c = M(15); }
      px(X - SW + ii, y, c); } }
  if (f >= fLogo && f < fLogo + 10) { const a = f - fLogo, yb = Y + LOGO.h - 2;                 // dithered dust puffs from the bottom corners
    for (const [ox, sd] of [[X + 6, -1], [X + LOGO.w - 6, 1]]) { const pcx = ox + sd * (3 + a * 2), r = 3 + a * 0.7, dens = 0.9 - a * 0.085;
      for (let y = Math.floor(yb - r); y <= yb + r; y++) for (let x = Math.floor(pcx - r * 1.4); x <= pcx + r * 1.4; x++) { const d = Math.hypot((x - pcx) / 1.4, y - yb);
        if (d <= r && bay(x, y) < dens * (1 - d / (r + 1) * 0.5)) px(x, y, d < r * 0.5 && a < 5 ? M(15) : M(31)); } } }
  // glints in the hold
  if (f >= fSub + 6) { const G = V5 ? LOGO.glint.map(([gx, gy]) => [X + gx, Y + gy]) : [[X + 3, Y + 2], [X + LOGO.w - 26, Y + 38], [X + 58, Y + 1], [X + LOGO.w - 4, Y + 4], [X + 30, Y + 37]];
    const g = Math.floor((f - fSub) / 9) % G.length, a = (f - fSub) % 9; if (a < 6) { const s = SPARK[a < 2 ? 0 : a < 4 ? 2 : 1]; blit(s, G[g][0] - (s.w >> 1), G[g][1] - (s.h >> 1)); } }
  if (f >= fLogo && f < fLogo + 9) { const a = f - fLogo, Yl = Y + dy;
    const y1 = V5 ? LOGO.h - 4 : 64, y2 = V5 ? Math.round(LOGO.h * 0.25) : 18, y3 = V5 ? Math.round(LOGO.h * 0.65) : 46;
    const EM = [[X + 12, Yl + y1, -2, 1], [X + LOGO.w - 12, Yl + y1, 2, 1], [X - 2, Yl + y2, -3, -1], [X + LOGO.w + 2, Yl + y2, 3, -1], [X + 44, Yl - 2, -1, -2], [X + LOGO.w - 44, Yl - 2, 1, -2], [X - 2, Yl + y3, -3, 1], [X + LOGO.w + 2, Yl + y3, 3, 1]];
    for (const [ex, ey, vx, vy] of EM) { const s = SPARK[a < 3 ? 2 : a < 6 ? 1 : 0]; blit(s, ex + vx * a - (s.w >> 1), ey + vy * a - (s.h >> 1)); } }
  return logoShake(f);
}
const logoShake = f => f >= fLogo && f < fLogo + 6 ? [3, -3, 2, -1, 1, 0][f - fLogo] : 0;
const shakeAt = f => logoShake(f) || (f >= FLASH && f < FLASH + 4 ? [2, -2, 1, -1][f - FLASH] : 0) || ({ [LH1]: 0.5, [LH1 + 1]: -0.5, [LH2]: 1, [LH2 + 1]: -0.5 }[f] ?? 0);
function drawRibbon(f) {
  if (f < fSub) return;
  const k = f - fSub, full = 88, w = k < 1 ? 16 : k < 2 ? 40 : k < 3 ? 64 : full, cx = 160, y0 = V5 ? RIB5 : 88, h = 15, x0 = cx - (w >> 1);
  if (w === full) { for (const side of [-1, 1]) { const ex = side < 0 ? x0 - 10 : x0 + w; rect(ex, y0 + 4, 10, h, M(0)); rect(ex + 1, y0 + 5, 8, h - 2, M(26));
      for (let j = 0; j < 5; j++) for (let i = 0; i < 5 - j; i++) px(side < 0 ? ex + i : ex + 9 - i, y0 + 6 + j + 3, M(0)); } }
  rect(x0, y0, w, h, M(0)); rect(x0 + 1, y0 + 1, w - 2, h - 2, M(27)); rect(x0 + 1, y0 + 1, w - 2, 1, M(12)); rect(x0 + 1, y0 + h - 2, w - 2, 1, M(26));
  if (V5) { const str = 'PIXEL ART', n = [2, 5, 7, 9][Math.min(3, Math.floor(k / 3))], tw = textW(str, 'Press Start 2P', 8);   // v5: small English line, the logo is the name
    if (w === full) text(str, cx - (tw >> 1), y0 + 11, 'Press Start 2P', 8, M(8), M(26), 0, n); return; }
  const str = '像素冒险', n = Math.min(4, Math.floor(k / 3) + 1), tw = textW(str, 'Fusion Pixel 12', 12, 5);
  if (w === full) text(str, cx - (tw >> 1), y0 + 12, 'Fusion Pixel 12', 12, M(8), M(26), 5, n);
}
function drawPress(f) {
  if (f < fPress || ((f - fPress) % 24) >= 12) return;
  const s = 'PRESS START', w = textW(s, 'Press Start 2P', 8), x = 160 - (w >> 1), b = 168;
  rect(x - 4, b - 11, w + 8, 14, M(0)); rect(x - 3, b - 10, w + 6, 12, M(1));
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) text(s, x + ox, b + oy, 'Press Start 2P', 8, M(0), 0);
  text(s, x, b, 'Press Start 2P', 8, M(8), 0);
}
let shakeY = 0;
const F_CAMSTOP = (() => { let f = 0; while (cam(f) < CAM_END) f++; return f; })();
function drawFrame(f) {
  const cx = cam(f);
  drawSky(f);
  blitLayer(MT, Math.floor(cx * 0.125) + Math.floor(Math.max(0, f - F_CAMSTOP) / 16), 60, 150);
  blitLayer(MID, Math.floor(cx * 0.3), 80, 150);
  blitLayer(HILLS, Math.floor(cx * 0.55), 110, 150);
  drawRays(f);
  drawGround(f, cx);
  drawEntities(f, cx);
  drawFG(f, cx);
  drawPopups(f, cx);
  drawFireflies(f);
  drawHUD(f);
  drawBox(f);
  if (V5) { if (!hidden('title')) drawLogo(f); shakeY = shakeAt(f); } else
  shakeY = drawLogo(f) || (f >= FLASH && f < FLASH + 4 ? [2, -2, 1, -1][f - FLASH] : 0) || ({ [LH1]: 0.5, [LH1 + 1]: -0.5, [LH2]: 1, [LH2 + 1]: -0.5 }[f] ?? 0);
  drawRibbon(f);
  drawPress(f);
}
function drawSheet() {
  IB.fill(M(7)); let x = 4, y = 4;
  const put = s => { if (x + s.w > W - 4) { x = 4; y += 30; } blit(s, x, y); x += s.w + 3; };
  RUN.forEach((p, i) => put(hero('run' + i, p, 'run' + (i % 3), false)));
  for (const k of ['up', 'down', 'land', 'skid', 'idle0', 'idle1', 'cheer', 'get0', 'get1', 'flinch0', 'flinch1']) put(hero(k, POSE[k], POSE[k].tail || 'hang', false));
  put(hero('idle0', POSE.idle0, 'hang', true));
  x = 4; y += 30; COIN.forEach(put); [SLIME_A, SLIME_B, SLIME_F, CHEST, CHEST_TALK, CHEST_CRACK, CHEST_CRACK2, CHEST_HALF, CHEST_OPEN, GEM, BUBBLE, BUBBLE_Q, BUBBLE_S, ...SPARK, ...PUFF].forEach(put);
  x = 4; y += 26; blit(LOGO, x, y);
  text('欢迎来到像素世界！', 150, y + 14, 'Fusion Pixel 12', 12, M(0), 0, 1); text('神秘宝箱 像素冒险', 150, y + 30, 'Fusion Pixel 12', 12, M(26), 0, 5);
  text('SCORE 001100', 150, y + 44, 'Press Start 2P', 8, M(0)); text('PRESS START', 150, y + 56, 'Press Start 2P', 8, M(3));
}

// ------------------------------------------------------------------ WebGL2 CRT
const cv = document.getElementById('c');
const gl = cv.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, alpha: false });
const vs = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`;
const fs = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform vec2 uSrc, uOut, uShake; uniform float uOn, uOnX, uCrt, uWhite, uGain, uRoll, uWob;
out vec4 o;
vec3 sharp(vec2 uv){ vec2 t = uv*uSrc; vec2 fl = floor(t); vec2 s = t - fl; float sc = uOut.y/uSrc.y; float reg = 0.5 - 0.5/sc;
  vec2 cd = s - 0.5; vec2 f = (cd - clamp(cd, -reg, reg))*sc + 0.5; return texture(uTex, (fl + f)/uSrc).rgb; }
void main(){
  vec2 uv = gl_FragCoord.xy/uOut; uv.y = 1.0 - uv.y;
  if (uCrt < 0.5) { o = vec4(sharp(uv), 1.0); return; }
  vec2 c = uv*2.0 - 1.0; float k = 0.03;
  vec2 cc = c*(1.0 + k*dot(c,c))/(1.0 + k);
  vec2 u = cc*0.5 + 0.5;
  vec2 e = min(u, 1.0 - u); float bez = smoothstep(0.0, 0.0022, e.x)*smoothstep(0.0, 0.004, e.y);
  float dy = u.y - 0.5, dx0 = u.x - 0.5; float on = smoothstep(uOn*0.5 + 0.0015, uOn*0.5 - 0.0015, abs(dy))*smoothstep(uOnX*0.5 + 0.002, uOnX*0.5 - 0.002, abs(dx0));
  u.y = 0.5 + dy/max(uOn, 0.004);
  float blank = 1.0;
  if (uRoll > 0.0) { u.y = fract(u.y + uRoll); blank = smoothstep(0.0, 0.012, u.y)*smoothstep(0.0, 0.012, 1.0 - u.y); }
  if (uWob != 0.0) u.x += (mod(floor(u.y*uSrc.y), 2.0) < 1.0 ? 1.0 : -1.0)*uWob/uSrc.x;
  u += uShake/uSrc;
  vec2 uc = clamp(u, 0.0, 1.0);
  vec3 col = sharp(uc);
  float lum = dot(col, vec3(0.3, 0.59, 0.11));
  float sy = fract(uc.y*uSrc.y) - 0.5;
  float bw = mix(0.30, 0.47, lum);
  float scan = mix(0.64, 1.0, smoothstep(bw + 0.13, bw - 0.05, abs(sy)));
  vec3 g = vec3(0.0); vec2 ts = 1.0/uSrc;
  for (int i = 0; i < 8; i++) { float a = float(i)*0.785398; vec2 d = vec2(cos(a), sin(a));
    g += texture(uTex, uc + d*ts*1.6).rgb + texture(uTex, uc + d*ts*3.4).rgb*0.6; }
  g /= 12.8;
  vec3 glow = max(g - 0.30, 0.0)*0.55;
  col = col*scan*1.10 + glow;
  float r = length(c)/1.4142; col *= 1.0 - 0.24*pow(r, 2.6);
  col = mix(col, vec3(1.0), uWhite)*uGain*blank;
  if (uWob != 0.0) col *= vec3(1.0 + 0.05*uWob, 1.0, 1.0 - 0.05*uWob);
  vec3 ph = vec3(0.10, 0.12, 0.17)*uWhite*exp(-abs(dy)*6.0)*mix(exp(-abs(dx0)*9.0), 1.0, min(uOnX, 1.0));
  o = vec4((col*on + ph*(1.0 - on))*bez, 1.0);
}`;
function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(prog); gl.useProgram(prog);
const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
const U = n => gl.getUniformLocation(prog, n);
gl.uniform2f(U('uSrc'), W, H); gl.uniform2f(U('uOut'), cv.width, cv.height); gl.uniform1i(U('uTex'), 0);
const RGBA = new Uint8Array(W * H * 4);
//            dot    line  line   6 ln   60 ln  180    roll  wobble x4
const PWR = { on:  [0.012, 0.007, 0.006, 0.034, 0.334, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
              onx: [0.018, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
              wh:  [1.0, 1.0, 0.85, 0.6, 0.35, 0.16, 0.05, 0, 0, 0, 0],
              gain:[1.0, 1.45, 1.2, 1.1, 1.05, 1.02, 1.35, 1.1, 1.05, 1.02, 1.0],
              roll:[0, 0, 0, 0, 0, 0, 8 / 180, 0, 0, 0, 0],
              wob: [0, 0, 0, 0, 0, 0, 0, 1, -0.75, 0.5, -0.25] };
const ZOOM = cues.zoom.map((t, k) => [F(t), cues.zoom_scale[k]]);
const zoomAt = f => { if (f >= FLASH) return 6; let z = 6; for (const [f0, v] of ZOOM) if (f >= f0) z = v; return z; };
const LUT_L1 = new Uint8Array(NSLOT), LUT_L2 = new Uint8Array(NSLOT), LUT_M = new Uint8Array(NSLOT), LUT_N = new Uint8Array(NSLOT);
// crystal light = cool blue-white: surfaces re-lit by material (day colour), sky/far layers lifted 1-2 steps on the blue ramp
const lum = c => 0.3 * MP[c][0] + 0.59 * MP[c][1] + 0.11 * MP[c][2];
const BLUE = [0, 1, 2, 3, 4, 5, 6, 7], bRank = c => { let bi = 0; for (let k = 0; k < 8; k++) if (Math.abs(lum(BLUE[k]) - lum(c)) < Math.abs(lum(BLUE[bi]) - lum(c))) bi = k; return bi; };
const MAT = { fD: [3, 2], fM: [4, 3], fL: [5, 3], hD: [3, 2], hM: [4, 3], hL: [6, 3], gD: [3, 2], gM: [4, 3], gL: [18, 3],
  dD: [2, 1], dM: [29, 2], dL: [30, 3], rD: [3, 2], rM: [29, 3], rL: [30, 29], flw: [7, 5] };
const SKYN = ['s0', 's1', 's2', 's3', 's4', 'sun', 'sunG', 'clL', 'clD', 'mD', 'mL', 'mS', 'mist', 'st0', 'st1', 'st2', 'st3'];
const PL1 = new Int16Array(64).fill(-1), PL2 = new Int16Array(64).fill(-1), SKYF = new Uint8Array(NSLOT);
for (const [n, v] of Object.entries(MAT)) { PL1[E[n]] = v[0]; PL2[E[n]] = v[1]; }
for (const n of SKYN) { const r = bRank(SM[E[n]][5]); PL1[E[n]] = Math.min(3, r + 1); PL2[E[n]] = Math.min(3, r + 1); SKYF[E[n]] = 1; }
const CB1 = c => { const l = lum(c); return l < 45 ? 3 : l < 90 ? 4 : l < 150 ? 5 : 6; }, CB2 = c => lum(c) < 60 ? 2 : lum(c) < 120 ? 3 : 4;   // water: by current colour

window.DEMO = { width: 1920, height: 1080, fps: 30, duration: 10, motionBlur: { samples: 1, shutter: 0.5 } };
window.renderAt = async (t) => {
  const f = Math.min(299, Math.max(0, Math.round(t * FPS)));
  let lut;
  if (SHEET) { drawSheet(); lut = makeLUT(0); } else { drawFrame(f); lut = makeLUT(f); }
  const lw = SHEET || Q.has('nolight') ? null : lightAt(f), lt = V5 && hidden('pool') ? null : lw;   // lw: light centre (night front), lt: pool
  const wv = SHEET ? null : waveR(f);                                          // night front rolling in toward the crystal
  if (wv !== null) { makeLUT(f, [4, 5, 0.5], LUT_M); makeLUT(f, [5, 5, 0], LUT_N); }
  if (lt) for (let sl = 0; sl < NSLOT; sl++) { if (sl >= 64) { LUT_L1[sl] = LUT_L2[sl] = lut[sl]; continue; }
    const c = wv !== null ? LUT_N[sl] : lut[sl]; LUT_L1[sl] = PL1[sl] >= 0 ? PL1[sl] : CB1(c); LUT_L2[sl] = PL2[sl] >= 0 ? PL2[sl] : CB2(c); }
  const z = SHEET ? 6 : zoomAt(f), cw = 1920 / z, ch = 1080 / z, [zx, zy] = cues.zoom_center;
  const ox = clamp(Math.round(zx - cw / 2), 0, W - cw), oy = clamp(Math.round(zy - ch / 2), 0, H - ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const X = x + ox, Y = y + oy, i = Y * W + X; let L = lut;
    let d = -1;
    if (wv !== null) { d = Math.hypot(X - lw[0], Y - lw[1]); const q = Math.round(clamp((d - wv) / 12 + 0.5, 0, 1) * 2 + bay(X, Y) - 0.5); L = q <= 0 ? lut : q === 1 ? LUT_M : LUT_N; }
    if (lt && !(SKYF[IB[i]] && L === lut && wv === null)) { if (d < 0) d = Math.hypot(X - lt[0], Y - lt[1]); const r1 = lt[3];
      if (d < r1) L = LUT_L1; else if (d < lt[2]) { const u = (d - r1) / (lt[2] - r1); L = bay(X, Y) > u ? (u < 0.5 ? LUT_L1 : LUT_L2) : (bay(X + 2, Y + 1) > u ? LUT_L2 : L); } }
    const m = MP[L[IB[i]]], o = (y * cw + x) * 4; RGBA[o] = m[0]; RGBA[o + 1] = m[1]; RGBA[o + 2] = m[2]; RGBA[o + 3] = 255; }
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cw, ch, 0, gl.RGBA, gl.UNSIGNED_BYTE, RGBA);
  gl.uniform2f(U('uSrc'), cw, ch);
  gl.viewport(0, 0, cv.width, cv.height);
  gl.uniform1f(U('uCrt'), NOCRT ? 0 : 1);
  const pw = (k, d) => (f < PWR.on.length && !SHEET ? PWR[k][f] : d);
  gl.uniform1f(U('uOn'), pw('on', 1)); gl.uniform1f(U('uOnX'), pw('onx', 1)); gl.uniform1f(U('uWhite'), pw('wh', 0));
  gl.uniform1f(U('uGain'), pw('gain', 1)); gl.uniform1f(U('uRoll'), pw('roll', 0)); gl.uniform1f(U('uWob'), pw('wob', 0));
  gl.uniform2f(U('uShake'), 0, SHEET ? 0 : shakeY);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.finish();
};
window.__frame = f => { drawFrame(f); return IB; };

// ------------------------------------------------------------------ reel v5: link elements in 1920x1080 output px (pure in t)
if (V5) {
  const KB = 0.03;                                       // CRT barrel k (shader); 1 logical px = zoomAt(f) output px (6, or 8/10/12 in the push-in)
  const crop = f => { const z = zoomAt(f), cw = 1920 / z, ch = 1080 / z, [zx, zy] = cues.zoom_center;
    return [clamp(Math.round(zx - cw / 2), 0, W - cw), clamp(Math.round(zy - ch / 2), 0, H - ch), cw, ch]; };
  const toOut = (X, Y, f) => {                           // logical (continuous) -> output px: zoom crop, shake, power-on roll, barrel inverse
    const [ox, oy, cw, ch] = crop(f); const ux = (X - ox) / cw; let uy = (Y - oy) / ch;
    if (NOCRT) return [ux * 1920, uy * 1080];
    uy -= shakeAt(f) / ch; if (f < PWR.roll.length && PWR.roll[f]) uy = ((uy - PWR.roll[f]) % 1 + 1) % 1;
    const tx = ux * 2 - 1, ty = uy * 2 - 1; let cx = tx, cy = ty;
    for (let i = 0; i < 12; i++) { const k = (1 + KB) / (1 + KB * (cx * cx + cy * cy)); cx = tx * k; cy = ty * k; }
    return [(cx * 0.5 + 0.5) * 1920, (cy * 0.5 + 0.5) * 1080];
  };
  const r1 = v => Math.round(v * 10) / 10;
  const circ = (id, X, Y, r, f, ex) => { const [x, y] = toOut(X, Y, f), [xl] = toOut(X - r, Y, f), [xr] = toOut(X + r, Y, f), [, yt] = toOut(X, Y - r, f), [, yb] = toOut(X, Y + r, f);
    return { id, type: 'circle', x: r1(x), y: r1(y), r: r1((xr - xl + yb - yt) / 4), ...ex }; };
  const box = (id, X0, Y0, X1, Y1, f, ex) => { const [a, b] = toOut(X0, Y0, f), [c, d] = toOut(X1, Y1, f);
    return { id, type: 'rect', x: r1((a + c) / 2), y: r1((b + d) / 2), w: r1(c - a), h: r1(d - b), rot: 0, ...ex }; };
  const ORB_PAL = ['#0d0b1a', '#3d4a8a', '#4f6fc0', '#5b9bea', '#8cc8f5', '#c8ecff', '#ffffff'];
  window.linkAt = (t) => {
    const f = Math.min(299, Math.max(0, Math.round(t * FPS))), on = f >= 5, zpx = zoomAt(f), els = [];
    const keepIB = IB.slice(), keepSh = shakeY; linkPass = true; drawFrame(f); linkPass = false;     // scratch redraw (sun occlusion), then restore
    // dot: the crystal ORB (11 logical px incl. outline); before the burst: a=0 at the chest mouth where it pops out (6.43)
    const g = gemPos(f), gp = g || [CHEST_X - CAM_END + 10, GROUND - 22];
    els.push(circ('dot', gp[0] + 0.5, gp[1] + 0.5, 5.5, f, { a: g ? 1 : 0, look: 'pixel', fill: '#8cc8f5', stroke: '#0d0b1a', sw: r1(zpx),
      grad: ['#ffffff', '#3d4a8a'], pixel: r1(zpx), palette: ORB_PAL,
      note: g ? (f < FCHEER ? 'crystal orb rising out of the chest' : f < FGET ? 'crystal orb lobbing into the hero\'s hands' : 'crystal orb held overhead (item get), 4-point star + light pool') : 'crystal orb not out yet (pops out of the chest at 6.43)' }));
    // sun: pixel disc r 10 logical + dithered halo; a = visible fraction of the solid disc (mountains / clouds / zoom crop)
    const sy = Math.round(44 + f * 0.41), sx = 236; let tot = 0, vis = 0;
    if (sy < 140) for (let y = sy - 10; y <= sy + 10; y++) for (let x = sx - 10; x <= sx + 10; x++) if (Math.hypot(x - sx, y - sy) <= 10) { tot++; if (y >= 0 && y < H && IB[y * W + x] === E.sun) vis++; }
    if (tot) { const [ox, oy, cw, ch] = crop(f); const inView = sx + 10 > ox && sx - 10 < ox + cw && sy + 10 > oy && sy - 10 < oy + ch;
      els.push(circ('sun', sx + 0.5, sy + 0.5, 10.5, f, { a: on && inView ? r1(vis / tot) : 0, look: 'pixel', fill: '#' + HEX[makeLUT(f)[E.sun]], stroke: '#' + HEX[makeLUT(f)[E.sunG]], sw: 0, pixel: r1(zpx),
        halo: r1(22 * zpx), note: 'pixel sun, solid disc + 2-level dithered halo to r 22 logical; sinks behind the ridge' })); }
    // pool: the orb's light (palette re-light, 2-level Bayer edge)
    const lt = lightAt(f); if (lt) els.push(circ('pool', lt[0] + 0.5, lt[1] + 0.5, lt[2], f, { a: 1, look: 'pixel', fill: '#4f6fc0', stroke: '#3d4a8a', sw: 0, r_inner: r1(lt[3] * zpx), note: 'crystal light pool (blue palette re-light, dithered rim)' }));
    // title 「像素风」 logo block
    if (f >= fLogo - 12) { const L = LOGO5, X = (W - L.w) >> 1, i = f - (fLogo - 12);
      const dy = f < fLogo ? Math.round(-128 * (1 - (i / 12) ** 2)) : ({ 0: 0, 1: -5, 2: -2, 3: 0 }[Math.floor((f - fLogo) / 2)] ?? 0), y0 = Y5 + dy;
      const a = f >= fLogo ? 1 : clamp((y0 + L.h) / L.h, 0, 1);
      els.push(box('title', X, y0, X + L.w, y0 + L.h, f, { a: r1(a), note: '「像素风」 pixel logo (Fusion Pixel 12 x4 cells)' })); }
    if (f >= fSub + 3) els.push(box('ribbon', 160 - 54, RIB5, 160 + 54, RIB5 + 19, f, { a: 1, note: 'red ribbon "PIXEL ART"' }));
    // chest (18x14 sprite + outline) while on screen
    const chx = CHEST_X - cam(f); if (chx + 20 > 0 && chx < W) { const open = f >= FLASH; els.push(box('chest', chx, open ? 133 : 135, chx + 20, 151, f, { a: on ? 1 : 0, note: open ? 'open chest' : 'treasure chest' })); }
    // dialogue box (text block) 4.6–5.8
    { let h = 0; if (f >= fBoxO && f < fBoxC) h = f < fBoxO + 2 ? 10 : f < fBoxO + 4 ? 20 : 30; else if (f >= fBoxC && f < fBoxC + 3) h = [20, 10, 4][f - fBoxC];
      if (h) els.push(box('dialog', 72, 99 - (h >> 1), 248, 99 - (h >> 1) + h, f, { a: h === 30 ? 1 : 0.5, note: 'dialogue box 神秘宝箱: 欢迎来到像素世界！' })); }
    // ground: grass top row (horizon-like line)
    { const [x0, y0] = toOut(8, 150, f), [x1, y1] = toOut(312, 150, f), [, ym] = toOut(160, 150, f);
      if (ym > 0 && ym < 1080) els.push({ id: 'ground', type: 'line', x0: r1(x0), y0: r1(y0), x1: r1(x1), y1: r1(y1), ym: r1(ym), w: r1(zpx), a: on ? 1 : 0, note: 'grass top of the ground (y 150 logical)' }); }
    // CRT power-on (f0 centre dot 36x14 px -> f1-f3 scan line -> opens by f5): an IN target at the very start
    if (!NOCRT && f === 0) els.push({ id: 'crt', type: 'circle', x: 959.5, y: 539.5, r: 7, rx: 18, ry: 7, a: 1, look: 'glow', fill: '#ffffff', stroke: '#b8c2d9', sw: 0, note: 'CRT power-on dot (squashes to the scan line at f1)' });
    else if (!NOCRT && f <= 3) els.push({ id: 'crt', type: 'line', x0: 40, y0: 539.5, x1: 1880, y1: 539.5, w: r1(PWR.on[f] * 1080), a: 1, note: 'CRT power-on scan line (opens to full picture by f5)' });
    IB.set(keepIB); shakeY = keepSh;
    return els;
  };
}
