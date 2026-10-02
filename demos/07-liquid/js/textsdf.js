// Per-letter signed distance fields (px) rendered from a web font, one letter per RGBA channel.
// Sub-pixel accurate (TinySDF-style alpha seeding) + Felzenszwalb EDT + gentle Gaussian smoothing so the
// medial-axis ridges never show up as creases in the liquid height field.
const INF = 1e20;

function edt1d(f, d, v, z, n) {
  v[0] = 0; z[0] = -INF; z[1] = INF;
  let k = 0;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const r = q - v[k]; d[q] = r * r + f[v[k]]; }
}
function edt2d(grid, w, h) {
  const n = Math.max(w, h);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    edt1d(f, d, v, z, h);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    edt1d(f, d, v, z, w);
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x];
  }
}
function blur1(src, dst, w, h, sigma, horiz) {
  const r = Math.ceil(sigma * 3), ker = [];
  let s = 0;
  for (let i = -r; i <= r; i++) { const k = Math.exp(-i * i / (2 * sigma * sigma)); ker.push(k); s += k; }
  for (let i = 0; i < ker.length; i++) ker[i] /= s;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let i = -r; i <= r; i++) {
      let xx = horiz ? x + i : x, yy = horiz ? y : y + i;
      xx = xx < 0 ? 0 : xx >= w ? w - 1 : xx; yy = yy < 0 ? 0 : yy >= h ? h - 1 : yy;
      acc += src[yy * w + xx] * ker[i + r];
    }
    dst[y * w + x] = acc;
  }
}

export function toHalf(val) {
  const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
  return (v) => {
    f32[0] = v; const x = u32[0];
    const sign = (x >> 16) & 0x8000; let e = ((x >> 23) & 0xff) - 127 + 15; let m = x & 0x7fffff;
    if (e <= 0) return sign;
    if (e >= 31) return sign | 0x7c00;
    return sign | (e << 10) | (m >> 13);
  };
}

// opts: { word, font (css font shorthand without size), size, tracking(px), pad, sigma, variation }
export function buildLetterSDF(opts) {
  const { word, family, weight = 900, size, tracking = 0, pad = 170, sigma = 5.0, variation = '' } = opts;
  const c0 = document.createElement('canvas');
  const cx = c0.getContext('2d');
  const fontStr = `${weight} ${size}px ${family}`;
  cx.font = fontStr;
  if (variation) c0.style.fontVariationSettings = variation;
  // letter x positions (kerning-aware via prefix widths)
  const xs = [];
  let total = 0;
  for (let i = 0; i < word.length; i++) {
    const pre = cx.measureText(word.slice(0, i + 1)).width, one = cx.measureText(word[i]).width;
    xs.push(pre - one + tracking * i);
    total = pre + tracking * i;
  }
  const m = cx.measureText(word);
  const asc = Math.ceil(m.actualBoundingBoxAscent), desc = Math.ceil(m.actualBoundingBoxDescent);
  const left = Math.ceil(m.actualBoundingBoxLeft);
  const W = Math.ceil(total + left + pad * 2 + 20), H = asc + desc + pad * 2;
  const baseX = pad + left, baseY = pad + asc;
  const out = new Float32Array(W * H * 4);
  const letters = [];
  const tmp = new Float64Array(W * H), tmp2 = new Float64Array(W * H);
  const outer = new Float64Array(W * H), inner = new Float64Array(W * H);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  for (let i = 0; i < word.length && i < 4; i++) {
    g.clearRect(0, 0, W, H);
    g.font = fontStr; g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
    g.fillText(word[i], baseX + xs[i], baseY);
    const img = g.getImageData(0, 0, W, H).data;
    let minx = W, maxx = 0, miny = H, maxy = 0;
    for (let j = 0; j < W * H; j++) {
      const a = img[j * 4 + 3] / 255;
      if (a >= 1) { outer[j] = 0; inner[j] = INF; }
      else if (a <= 0) { outer[j] = INF; inner[j] = 0; }
      else { const d = 0.5 - a; outer[j] = d > 0 ? d * d : 0; inner[j] = d < 0 ? d * d : 0; }
      if (a > 0.5) { const x = j % W, y = (j / W) | 0; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
    }
    edt2d(outer, W, H); edt2d(inner, W, H);
    for (let j = 0; j < W * H; j++) tmp[j] = Math.max(-200, Math.min(200, Math.sqrt(outer[j]) - Math.sqrt(inner[j])));
    // sharp (edge) and heavily smoothed (interior dome) versions, blended by depth so the silhouette stays
    // true while the medial-axis ridge disappears from the height field
    const sharp = new Float64Array(W * H), soft = new Float64Array(W * H);
    blur1(tmp, tmp2, W, H, 2.0, true); blur1(tmp2, sharp, W, H, 2.0, false);
    blur1(tmp, tmp2, W, H, sigma, true); blur1(tmp2, soft, W, H, sigma, false);
    for (let j = 0; j < W * H; j++) {
      const a = sharp[j], b = Math.min(soft[j], 0);
      let w = (-a - 3) / 18; w = w < 0 ? 0 : w > 1 ? 1 : w; w = w * w * (3 - 2 * w);
      out[j * 4 + i] = a > 0 ? Math.min(a, Math.max(soft[j], a * 0.5)) : a + (Math.min(b, a * 0.2) - a) * w;
    }
    letters.push({ ch: word[i], bbox: [minx, miny, maxx, maxy], pivot: [(minx + maxx) / 2, (miny + maxy) / 2] });
  }
  for (let i = word.length; i < 4; i++) for (let j = 0; j < W * H; j++) out[j * 4 + i] = 200;
  return { W, H, data: out, letters, baseX, baseY, asc, desc, width: total };
}
