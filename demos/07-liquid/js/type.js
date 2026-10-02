// Front typography layer (Canvas2D, sRGB, premultiplied on upload). Pure function of t.
import { flung, inv, smooth, lerp } from './scene.js';

export function createType(W, H, cues, word, opts = {}) {
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  // pre-measure glyph runs so reveal can be per glyph
  function layout(text, font, xR, y, track) {
    g.font = font;
    const ws = [...text].map((c) => g.measureText(c).width);
    const total = ws.reduce((a, b) => a + b, 0) + track * (ws.length - 1);
    let cx = xR - total;                            // r2: flush-right on the p's bowl -> puddle, ripple and type lock up
    return [...text].map((c, i) => { const o = { c, x: cx, w: ws[i], y }; cx += ws[i] + track; return o; });
  }
  const LINES = [
    { text: '万物始于一滴', font: '600 44px "Noto Serif SC"', y: 958, track: 14, color: [255, 232, 240], alpha: 0.96, dx: 0 },
    { text: 'EVERYTHING BEGINS AS A DROP', font: '600 20px "Inter"', y: 999, track: 5.5, color: [255, 200, 224], alpha: 0.70, dx: -1 },
  ];
  // reel v5: the small English line carries the style name (the hero word above is 「液态流动」)
  if (opts.v5) LINES[1] = { text: 'LIQUID MOTION', font: '600 30px "Inter"', y: 1006, track: 10, color: [255, 206, 228], alpha: 0.82, dx: -1 };
  let laid = null;
  function draw(t, S, look) {
    g.clearRect(0, 0, W, H);
    const xR = word.letters[3].bbox[2] - 4;
    if (!laid) laid = LINES.map((l) => ({ ...l, glyphs: layout(l.text, l.font, xR + l.dx, l.y, l.track) }));
    const rip = opts.v5 ? S.tagRev : S.rip;   // v5.1: no puddle; the fat drip's wake reveals the tagline
    const showAll = look === 0;
    if (!showAll && !(rip && rip.amp > 0)) return;
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    laid.forEach((l, li) => {
      g.font = l.font;
      l.glyphs.forEach((gl) => {
        let a = 1, dy = 0, blur = 0;
        if (!showAll) {
          const cx = gl.x + gl.w / 2;
          const tPass = 0.02 + Math.abs(cx - rip.x) / 2000 + li * 0.06;   // r2: wave spreads outward from the splash, done in ~0.5 s
          const k = inv(tPass, tPass + 0.30, rip.age);
          a = smooth(k); dy = 8 * (1 - flung(k)); blur = 4 * (1 - smooth(inv(0, 0.7, k)));
        }
        if (a <= 0.001) return;
        g.globalAlpha = a * l.alpha;
        g.filter = blur > 0.3 ? `blur(${blur.toFixed(2)}px)` : 'none';
        g.fillStyle = `rgb(${l.color.join(',')})`;
        g.fillText(gl.c, gl.x, gl.y + dy);
      });
    });
    g.filter = 'none'; g.globalAlpha = 1;
  }
  return { canvas, draw };
}
