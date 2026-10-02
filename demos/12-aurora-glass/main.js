// Aurora — think in light.  12-aurora-glass
// Every frame is a pure function of t: renderAt(t) recomputes all state from cues.json + closed-form curves.
import { VS, FS_AURORA, FS_DOWN, FS_BLUR, FS_CARD, FS_OVER, FS_LENS, FS_FINAL, FS_GLYPH } from './shaders.js';

const W = 1920, H = 1080, FPS = 30;
const DPR = window.devicePixelRatio || 1;
const RW = Math.round(W * DPR), RH = Math.round(H * DPR);
const QW = Math.max(8, Math.round(RW / 4)), QH = Math.max(8, Math.round(RH / 4));
const Q = new URLSearchParams(location.search);
const NOUI = Q.has('noui');
// reel v5 (?v5=1): the style name is the end-card title, the glass ring is its 句号, window.linkAt(t) reports the dot.
// ?nolink=dot[,title] hides those elements and changes nothing else. Without v5=1 every code path is the pre-v5 one.
const V5 = Q.get('v5') === '1';
const NOLINK = new Set(V5 ? (Q.get('nolink') || '').split(',').map((s) => s.trim()).filter(Boolean) : []);
const HIDE_DOT = NOLINK.has('dot'), HIDE_TITLE = NOLINK.has('title');
// v5.2 (jury round 6): title contrast pass (deep pool + halo behind the glass title, brighter glass, clearer line 2). ?v52=0 = v5.1 look
const V52 = V5 && Q.get('v52') !== '0';

const cues = await (await fetch('/demos/12-aurora-glass/cues.json')).json();
let ENV = null;
try { const r = await fetch('/demos/12-aurora-glass/out/env.json'); if (r.ok) ENV = await r.json(); } catch (e) { ENV = null; }

// ------------------------------------------------------------------ math
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const inv = (a, b, x) => clamp((x - a) / (b - a));
const eSine = (t) => -(Math.cos(Math.PI * clamp(t)) - 1) / 2;
const eOutSine = (t) => Math.sin(clamp(t) * Math.PI / 2);
const eInSine = (t) => 1 - Math.cos(clamp(t) * Math.PI / 2);
const eOutCubic = (t) => 1 - Math.pow(1 - clamp(t), 3);
const eOutQuart = (t) => 1 - Math.pow(1 - clamp(t), 4);
const eOutQuint = (t) => 1 - Math.pow(1 - clamp(t), 5);
const eInOutCubic = (t) => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const seg = (t, a, b, e = eSine) => e(inv(a, b, t));
const TAU = Math.PI * 2;
const D2R = Math.PI / 180;

// time-parameterised cubic Hermite through keys [{t, v:[..], m?:[..]}] (Catmull-Rom tangents, zero at ends)
function hermite(keys) {
  const n = keys.length;
  keys.forEach((k, i) => {
    if (k.m) return;
    if (i === 0 || i === n - 1) { k.m = k.v.map(() => 0); return; }
    const a = keys[i - 1], b = keys[i + 1], s = k.s ?? 1;
    k.m = k.v.map((_, j) => s * (b.v[j] - a.v[j]) / (b.t - a.t));
  });
  return (t) => {
    if (t <= keys[0].t) return keys[0].v.slice();
    if (t >= keys[n - 1].t) return keys[n - 1].v.slice();
    let i = 0; while (t > keys[i + 1].t) i++;
    const a = keys[i], b = keys[i + 1], h = b.t - a.t, s = (t - a.t) / h;
    const s2 = s * s, s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    return a.v.map((_, j) => h00 * a.v[j] + h10 * h * a.m[j] + h01 * b.v[j] + h11 * h * b.m[j]);
  };
}
// monotone scalar keys (smoothstep between keys) — for sizes/levels where overshoot is unwanted
function keysS(list, ease = eSine) {
  return (t) => {
    if (t <= list[0][0]) return list[0][1];
    for (let i = 0; i < list.length - 1; i++) {
      const [t0, v0] = list[i], [t1, v1] = list[i + 1];
      if (t <= t1) return lerp(v0, v1, ease(inv(t0, t1, t)));
    }
    return list[list.length - 1][1];
  };
}

// 3D helpers
function rotM(rx, ry, rz) { // R = Rz * Ry * Rx (degrees)
  const a = rx * D2R, b = ry * D2R, c = rz * D2R;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  // columns = images of the basis vectors
  const Rx = [[1, 0, 0], [0, ca, -sa], [0, sa, ca]];
  const Ry = [[cb, 0, sb], [0, 1, 0], [-sb, 0, cb]];
  const Rz = [[cc, -sc, 0], [sc, cc, 0], [0, 0, 1]];
  const mul = (A, B) => A.map((r, i) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
  const M = mul(Rz, mul(Ry, Rx));
  return { U: [M[0][0], M[1][0], M[2][0]], V: [M[0][1], M[1][1], M[2][1]], N: [M[0][2], M[1][2], M[2][2]] };
}
const F = 2000; // focal length (px)
// one continuous, slow dolly: settle on the cluster -> lean in on the Focus toggle (the lens is born there)
// -> tilt up with the rising bead to the reply -> keep pushing while the glass parts.  (x,y: camera shift, z: dolly)
// r2: the hook HOLDS the macro (drift <= 2 px/frame while a catch-light runs round the bevel), then ONE in-out-sine
// pull-back 0.5 -> 2.8 in log-distance (a straight dolly line); corner speed peak 36.7 -> 19.8 px/frame (camera simulator)
const HOOK = { p0: [q('hx', 200), q('hy', -120), q('hz', 900)], drift: [-20, 8, -24], t1: 0.5, t2: 2.8 };
const LAYOUT = [10, 40, 300];   // r2s2: overview no longer pulls back past the layout (less out-and-in travel)
const CAM_KEYS = [
  { t: HOOK.t2, v: LAYOUT, m: [0, 0, 0] },
  { t: 3.4, v: [-16, 36, 350] },
  { t: 5.05, v: [-q('cx', 50), q('cy', 170), q('cz', 690)], m: [0, 0, 0] },   // lean in on the (1.25x) knob: bead birth
  // r2: the pull-back follows the bead up to the reply and is FINISHED by 5.95 ...
  { t: 5.95, v: [10, 30, 560], m: [0, 0, 40] },
  // ... then a slow in-out push (+3.6 %) toward the lens while the light turns gold: the bloom comes toward the viewer
  { t: 6.6, v: [6, 26, 612], m: [0, 0, 15] },
  { t: 7.3, v: [20, 12, 607] },
  { t: 8.6, v: [18, 0, 602] },
  { t: 10.6, v: [6, -8, 617] },
];
function q(k, d) { return Q.has(k) ? +Q.get(k) : d; }
const camK = hermite(CAM_KEYS);
function camera(t) {
  if (t < HOOK.t2) {
    const d = HOOK.drift, a = HOOK.p0, pa = a.map((v, j) => v + d[j] * Math.min(t, HOOK.t1));
    if (t <= HOOK.t1) return { x: pa[0], y: pa[1], z: pa[2] };
    const e = eSine(inv(HOOK.t1, HOOK.t2, t)), Db = F - pa[2], DL = F - LAYOUT[2];
    const D = Math.exp(lerp(Math.log(Db), Math.log(DL), e)), w = (D - Db) / (DL - Db), k = (t - HOOK.t1) * (1 - e);
    return { x: lerp(pa[0], LAYOUT[0], w) + d[0] * k, y: lerp(pa[1], LAYOUT[1], w) + d[1] * k, z: F - D + d[2] * k };
  }
  const v = camK(t); return { x: v[0], y: v[1], z: v[2] };
}
function camO(cam) { return [960 + cam.x, 540 + cam.y, -F + cam.z]; }
function project(P, O) { const dz = P[2] - O[2]; return [960 + F * (P[0] - O[0]) / dz, 540 + F * (P[1] - O[1]) / dz, F / dz]; }

// ------------------------------------------------------------------ palette
const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const PAL = {
  base: '#040312', violet: '#7050FF', blue: '#2F46F2', cyan: '#34CFF0', magenta: '#B653F0', indigo: '#3320A8', periwinkle: '#8C8CFF',
};

// ------------------------------------------------------------------ aurora blobs: slow bezier drifts (20–40 s loops, we see a slice)
function loopBezier(pts, period, phase) { // closed cubic bezier loop through 4 anchor points with smooth tangents
  const n = pts.length;
  return (t) => {
    let u = ((t / period + phase) % 1 + 1) % 1 * n;
    const i = Math.floor(u), s = u - i;
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    // Catmull-Rom → Bezier
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    const a = 1 - s;
    return [0, 1].map((k) => a * a * a * p1[k] + 3 * a * a * s * c1[k] + 3 * a * s * s * c2[k] + s * s * s * p2[k]);
  };
}
// col, rx, ry, angle(deg), intensity, path (closed bezier through 4 anchors, period s, phase)
const BLOBS = [
  { col: PAL.violet, rx: 470, ry: 300, ang: 18, i: 1.15, path: loopBezier([[600, 300], [780, 240], [840, 420], [560, 460]], 30, 0.05) },
  { col: PAL.magenta, rx: 400, ry: 230, ang: -28, i: 0.9, path: loopBezier([[1560, 170], [1720, 330], [1380, 360], [1300, 130]], 34, 0.6) },
  { col: PAL.cyan, rx: 360, ry: 260, ang: 32, i: 1.0, path: loopBezier([[1500, 860], [1320, 700], [1160, 660], [1420, 980]], 26, 0.12) },
  { col: PAL.blue, rx: 500, ry: 250, ang: -8, i: 0.95, path: loopBezier([[820, 880], [560, 800], [700, 980], [1060, 920]], 36, 0.5) },
  { col: PAL.indigo, rx: 560, ry: 380, ang: 0, i: 0.32, path: loopBezier([[1020, 540], [1160, 470], [1080, 640], [880, 600]], 40, 0.3) },
  { col: PAL.periwinkle, rx: 240, ry: 170, ang: 10, i: 0.45, path: loopBezier([[1180, 420], [1060, 520], [900, 560], [1120, 360]], 24, 0.1) },
  { col: '#3036D8', rx: 460, ry: 210, ang: -6, i: 0.55, path: loopBezier([[1180, 1090], [1320, 1040], [1060, 1010], [980, 1080]], 32, 0.2) },
];
const NB = BLOBS.length;
// ------------------------------------------------------------------ WebGL setup
const canvas = document.getElementById('gl');
canvas.width = RW; canvas.height = RH;
const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
if (!gl) throw new Error('webgl2 unavailable');
const hasFloat = !!gl.getExtension('EXT_color_buffer_float');
gl.getExtension('OES_texture_float_linear');
const IFMT = hasFloat ? gl.RGBA16F : gl.RGBA8, TYPE = hasFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

function compile(fs) {
  const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); throw new Error('shader compile'); } return s; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(p)); throw new Error('link'); }
  const loc = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p, i); const name = u.name.replace(/\[0\]$/, ''); loc[name] = gl.getUniformLocation(p, u.name); }
  return { p, loc };
}
const P = { aurora: compile(FS_AURORA), down: compile(FS_DOWN), blur: compile(FS_BLUR), card: compile(FS_CARD), over: compile(FS_OVER), lens: compile(FS_LENS), final: compile(FS_FINAL) };
if (V5) P.glyph = compile(FS_GLYPH);   // v5.1: frosted-glass letterforms
const vao = gl.createVertexArray();

function makeTarget(w, h, fmt = IFMT, type = TYPE) {
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, fmt, w, h, 0, gl.RGBA, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fb, w, h };
}
const T = { sceneA: makeTarget(RW, RH), sceneB: makeTarget(RW, RH), lens: makeTarget(RW, RH), q1: makeTarget(QW, QH), q2: makeTarget(QW, QH), qL: makeTarget(QW, QH), qB: makeTarget(QW, QH) };
if (V5) { T.g1 = makeTarget(RW, RH); T.g2 = makeTarget(RW, RH); }   // v5.1: bevel blur of the glass glyph mask

function canvasTex(mip) {
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}
function upload(tex, cv, mip) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
  if (mip) gl.generateMipmap(gl.TEXTURE_2D);
}

// grain texture
const grainImg = new Image(); grainImg.src = '/assets/textures/grain/grain_fine_2048.png';
await grainImg.decode();
const grainTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, grainTex);
gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, grainImg);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

// fonts
const FONT_UI = V5 ? "'Inter', 'HarmonyOS Sans SC'" : "'Inter'", FONT_WORD = "'Sora'", FONT_CN = "'HarmonyOS Sans SC'";
// v5 copy: Chinese UI micro-copy + the title lockup
// v5.1: the title is HarmonyOS Black (900) rendered as frosted glass (FS_GLYPH); line 2 is HarmonyOS Medium
const V5T = { title: '玻璃拟态', sub: '弥散渐变', en: 'AURORA · GLASS', size: 216, track: 10, base: 580, w: 900, subSize: 54, subW: 500, subBase: 704, enSize: 32, enTrack: 6 };
const UI = V5 ? {
  name: '极光', now: '刚刚', thinking: '思考中', ask: '帮我安排一个慢悠悠的周日。',
  reply: ['十点，慢慢吃早餐。', '四点，去湖边走一走，', '正好赶上光变成金色。', '其余的，我都替你推掉了。'],
  chips: ['加入日历', '3:30 提醒我'], listening: '聆听中', caption: '“……今晚留给家人”',
  focus: '专注', focusSub: '仅家人可以联系你', glow: '光晕',
} : null;
if (V5) {
  const cjk = V5T.title + '。' + V5T.sub + UI.name + UI.now + UI.thinking + UI.ask + UI.reply.join('') + UI.chips.join('') + UI.listening + UI.caption + UI.focus + UI.focusSub + UI.glow;
  await Promise.all([300, 400, 500, 700].map((w) => document.fonts.load(`${w} 200px ${FONT_CN}`, cjk)).concat(
    [document.fonts.load(`300 28px ${FONT_WORD}`, V5T.en), document.fonts.load(`${V5T.w} ${V5T.size}px ${FONT_CN}`, V5T.title + '。'),
     document.fonts.load(`${V5T.subW} ${V5T.subSize}px ${FONT_CN}`, V5T.sub), document.fonts.load(`${V5T.subW} ${V5T.enSize}px ${FONT_CN}`, V5T.en)]));
}
await Promise.all([
  document.fonts.load(`400 24px ${FONT_UI}`, 'Aa'), document.fonts.load(`500 24px ${FONT_UI}`, 'Aa'), document.fonts.load(`600 24px ${FONT_UI}`, 'Aa'),
  document.fonts.load(`200 150px ${FONT_WORD}`, 'Aurora'), document.fonts.load(`300 30px ${FONT_WORD}`, 'Think in light.'),
  document.fonts.load(`300 26px ${FONT_CN}`, '思考，自有光'),
]);
await document.fonts.ready;

// ------------------------------------------------------------------ gaussian taps
function gaussTaps(sigma) {
  const R = Math.min(29, Math.max(1, Math.ceil(sigma * 3)));
  const w = []; let sum = 0;
  for (let i = 0; i <= R; i++) { const v = Math.exp(-i * i / (2 * sigma * sigma)); w.push(v); sum += i ? 2 * v : v; }
  for (let i = 0; i <= R; i++) w[i] /= sum;
  const offs = [0], ws = [w[0]];
  for (let i = 1; i <= R; i += 2) { const a = w[i], b = i + 1 <= R ? w[i + 1] : 0, s = a + b; offs.push(s > 0 ? (i * a + (i + 1) * b) / s : i); ws.push(s); }
  while (offs.length < 16) { offs.push(0); ws.push(0); }
  return { offs: new Float32Array(offs.slice(0, 16)), ws: new Float32Array(ws.slice(0, 16)), n: Math.min(16, Math.ceil(R / 2) + 1) };
}
const TAPS_FROST = gaussTaps(30 * DPR / 4);   // backdrop-filter: blur(30px)
const TAPS_LENS = gaussTaps(22 * DPR / 4);
const TAPS_BLOOM = gaussTaps(40 * DPR / 4);

// ------------------------------------------------------------------ pass helpers
function use(prog, target) {
  gl.useProgram(prog.p);
  if (target) { gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb); gl.viewport(0, 0, target.w, target.h); }
  else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, RW, RH); }
  const w = target ? target.w : RW, h = target ? target.h : RH;
  if (prog.loc.uRes) gl.uniform2f(prog.loc.uRes, w, h);
  if (prog.loc.uDPR) gl.uniform1f(prog.loc.uDPR, DPR * (target ? target.w / RW : 1));
  return prog.loc;
}
function bindTex(unit, tex, loc) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(loc, unit); }
function draw() { gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, 0, 3); }
function blurInto(src, dst, taps, thresh = 0) {
  // src full-res → dst quarter (blurred)
  let L = use(P.down, T.q2); bindTex(0, src.tex, L.uSrc); gl.uniform2f(L.uSrcTexel, 1 / src.w, 1 / src.h); gl.uniform1f(L.uThresh, thresh); draw();
  L = use(P.blur, T.q1); bindTex(0, T.q2.tex, L.uSrc); gl.uniform2f(L.uDir, 1, 0); gl.uniform1fv(L.uOff, taps.offs); gl.uniform1fv(L.uW, taps.ws); gl.uniform1i(L.uN, taps.n); draw();
  L = use(P.blur, dst); bindTex(0, T.q1.tex, L.uSrc); gl.uniform2f(L.uDir, 0, 1); gl.uniform1fv(L.uOff, taps.offs); gl.uniform1fv(L.uW, taps.ws); gl.uniform1i(L.uN, taps.n); draw();
}

// ------------------------------------------------------------------ 2D UI drawing helpers
function rr(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function font(g, w, s, fam = FONT_UI) { g.font = `${w} ${s}px ${fam}`; }
function riseA(t, t0, dur = 0.75) { const k = inv(t0, t0 + dur, t); return { a: eSine(k), dy: 8 * (1 - eOutCubic(k)) }; }
const WHITE = (a) => `rgba(255,255,255,${a})`;

function orbIcon(g, x, y, r, t) { // small aurora orb avatar
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  gr.addColorStop(0, '#E9E4FF'); gr.addColorStop(0.35, '#9A7CFF'); gr.addColorStop(0.75, '#3F55F0'); gr.addColorStop(1, '#35C8EE');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.strokeStyle = WHITE(0.5); g.lineWidth = 1; g.beginPath(); g.arc(x, y, r - 0.5, 0, TAU); g.stroke();
}

// ------------------------------------------------------------------ cards
const S = 2; // content texture scale
function makeCard(def) {
  const cv = document.createElement('canvas'); cv.width = def.w * S; cv.height = def.h * S;
  return { ...def, cv, g: cv.getContext('2d'), tex: canvasTex(true) };
}

// A — conversation
const REPLY = V5 ? UI.reply : ['Slow breakfast at ten.', 'The lake path at four,', 'when the light turns gold.', 'I’ve cleared the rest.'];
function drawChat(c, t) {
  const g = c.g; g.setTransform(S, 0, 0, S, 0, 0); g.clearRect(0, 0, c.w, c.h);
  g.textBaseline = 'alphabetic';
  const P0 = 38;
  // header
  const hA = riseA(t, cues.cardA_in + 0.35, 0.9);
  g.globalAlpha = hA.a;
  orbIcon(g, P0 + 16, P0 + 16 + hA.dy, 16, t);
  font(g, 600, 20); g.fillStyle = WHITE(0.95); g.letterSpacing = '0px'; g.fillText(V5 ? UI.name : 'Aurora', P0 + 44, P0 + 23 + hA.dy);
  const thinking = inv(cues.typing - 0.1, cues.typing + 0.15, t) * (1 - inv(cues.reply[0] - 0.05, cues.reply[0] + 0.35, t));
  font(g, 400, 16); g.fillStyle = WHITE(0.5); g.textAlign = 'right';
  g.globalAlpha = hA.a * (1 - thinking); g.fillText(V5 ? UI.now : 'now', c.w - P0, P0 + 22 + hA.dy);
  g.globalAlpha = hA.a * thinking; g.fillText(V5 ? UI.thinking : 'thinking', c.w - P0, P0 + 22 + hA.dy);
  g.textAlign = 'left'; g.globalAlpha = 1;
  // user bubble (right aligned)
  const ub = riseA(t, cues.user_bubble - 0.25, 0.7); // r1s2: in medias res - the bubble is already landing on frame 0 (pop at 0.03)
  if (ub.a > 0) {
    font(g, 400, 21); const txt = V5 ? UI.ask : 'Plan a slow Sunday for me.'; const tw = g.measureText(txt).width;
    const bw = tw + 44, bh = 50, bx = c.w - P0 - bw, by = 100 + ub.dy;
    g.globalAlpha = ub.a;
    rr(g, bx, by, bw, bh, 25); g.fillStyle = WHITE(0.16); g.fill(); g.strokeStyle = WHITE(0.22); g.lineWidth = 1; g.stroke();
    g.fillStyle = WHITE(0.96); g.fillText(txt, bx + 22, by + 32);
    g.globalAlpha = 1;
  }
  // typing indicator
  const ty = inv(cues.typing, cues.typing + 0.3, t) * (1 - inv(cues.reply[0] - 0.1, cues.reply[0] + 0.2, t));
  if (ty > 0.001) {
    g.globalAlpha = eSine(ty);
    rr(g, P0, 178, 76, 40, 20); g.fillStyle = WHITE(0.12); g.fill();
    for (let i = 0; i < 3; i++) { const ph = 0.5 + 0.5 * Math.sin(t * 7.5 - i * 0.9); g.fillStyle = WHITE(0.35 + 0.5 * ph); g.beginPath(); g.arc(P0 + 22 + i * 16, 198 - 2 * ph, 4, 0, TAU); g.fill(); }
    g.globalAlpha = 1;
  }
  // reply: streamed word by word, each word opacity + 8px rise
  font(g, 400, 25); g.letterSpacing = '-0.2px';
  const LH = 40, Y0 = 212;
  REPLY.forEach((line, li) => {
    const t0 = cues.reply[Math.min(li, cues.reply.length - 1)] + (li >= cues.reply.length ? 0.375 : 0);
    const words = V5 ? [...line] : line.split(' '); let x = P0;   // v5: Chinese streams glyph by glyph
    words.forEach((wd, wi) => {
      const r = riseA(t, t0 + wi * (V5 ? 0.032 : 0.06), 0.7);
      const ww = g.measureText(V5 ? wd : wd + ' ').width;
      if (r.a > 0) { g.globalAlpha = r.a; g.fillStyle = li === 2 ? WHITE(1) : WHITE(0.9); g.fillText(wd, x, Y0 + li * LH + r.dy); }
      x += ww;
    });
  });
  g.globalAlpha = 1; g.letterSpacing = '0px';
  // action chips
  font(g, 500, 16);
  let cx = P0 + 48;   // r2: clear of card C's rim
  (V5 ? UI.chips : ['Add to calendar', 'Remind me at 3:30']).forEach((txt, i) => {
    const r = riseA(t, cues.chips + i * 0.12, 0.75);
    const tw = g.measureText(txt).width, bw = tw + 36;
    if (r.a > 0) {
      g.globalAlpha = r.a;
      rr(g, cx, c.h - P0 - 40 + r.dy, bw, 40, 20); g.fillStyle = WHITE(i === 0 ? 0.2 : 0.1); g.fill(); g.strokeStyle = WHITE(0.24); g.lineWidth = 1; g.stroke();
      g.fillStyle = WHITE(0.92); g.fillText(txt, cx + 18, c.h - P0 - 14 + r.dy);
    }
    cx += bw + 12;
  });
  g.globalAlpha = 1;
}

// B — voice
function envAt(t) {
  if (ENV && ENV.rate) { const i = t * ENV.rate; const a = Math.floor(i), f = i - a; const v = ENV.v; const x0 = v[clamp(a, 0, v.length - 1)], x1 = v[clamp(a + 1, 0, v.length - 1)]; return lerp(x0, x1, f); }
  return 0.45 + 0.25 * Math.sin(t * 5.1) * Math.sin(t * 1.7 + 1) + 0.15 * Math.sin(t * 11.3);
}
function drawVoice(c, t) {
  const g = c.g; g.setTransform(S, 0, 0, S, 0, 0); g.clearRect(0, 0, c.w, c.h);
  const P0 = 30;
  const hA = riseA(t, cues.cardB_in + 0.35, 0.9);
  g.globalAlpha = hA.a;
  // r2: label + timer (small), the live orb is now the waveform's source
  font(g, 500, 19); g.fillStyle = WHITE(0.95); g.fillText(V5 ? UI.listening : 'Listening', P0, P0 + 18 + hA.dy);
  const secs = Math.max(0, Math.floor(t - cues.voice_on + 3));
  const lw = g.measureText(V5 ? UI.listening : 'Listening').width; font(g, 400, 17); g.fillStyle = WHITE(0.5);
  g.fillText(`0:${String(secs).padStart(2, '0')}`, P0 + lw + 12, P0 + 18 + hA.dy);
  g.globalAlpha = 1;
  // waveform radiating from the orb (newest at the orb), driven by the soundtrack envelope.
  // The orb sits ON card A's left edge (B-local x ~ 180): half crisp outside, half blooming through A's frost.
  const OX = q('orbx', 178), cy = 122, maxH = 80, bw = 6, step = 11.5;
  const on = seg(t, cues.voice_on, cues.voice_on + 0.8);
  const bar = (x, dist, a) => {
    const tt = t - dist * 0.0042;
    const e = clamp(envAt(Math.max(0, tt)));
    const shape = Math.exp(-Math.pow(dist / 150, 2)) * 0.8 + 0.2;
    const jitter = 0.72 + 0.28 * Math.sin(x * 0.37 + tt * 3.1);
    const h = Math.max(5, maxH * on * (0.1 + 0.9 * Math.pow(e, 0.75) * shape * jitter));
    const gr = g.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
    gr.addColorStop(0, `rgba(170,238,255,${a})`); gr.addColorStop(0.5, `rgba(255,255,255,${a})`); gr.addColorStop(1, `rgba(196,176,255,${a})`);
    g.fillStyle = gr; rr(g, x - bw / 2, cy - h / 2, bw, h, bw / 2); g.fill();
  };
  for (let x = OX - 34, i = 0; x > P0; x -= step, i++) bar(x, OX - x, 0.5 + 0.45 * Math.exp(-i / 6));
  for (let x = OX + 34; x < c.w - P0; x += step) bar(x, x - OX, 0.95);            // the bars under A: chunky, 95 % white
  const e0 = clamp(envAt(t)), pr = 20 * (0.92 + 0.14 * e0) * (0.3 + 0.7 * on);
  const halo = g.createRadialGradient(OX, cy, 0, OX, cy, pr * 4.6);
  halo.addColorStop(0, `rgba(120,228,255,${0.95 * on})`); halo.addColorStop(0.28, `rgba(67,211,242,${0.64 * on})`); halo.addColorStop(0.6, `rgba(67,211,242,${0.26 * on})`); halo.addColorStop(1, 'rgba(67,211,242,0)');
  g.fillStyle = halo; g.beginPath(); g.arc(OX, cy, pr * 4.6, 0, TAU); g.fill();
  const core = g.createRadialGradient(OX - pr * 0.3, cy - pr * 0.35, 0, OX, cy, pr);
  core.addColorStop(0, '#FFFFFF'); core.addColorStop(0.35, '#BFF4FF'); core.addColorStop(1, '#43D3F2');
  g.globalAlpha = on; g.fillStyle = core; g.beginPath(); g.arc(OX, cy, pr, 0, TAU); g.fill(); g.globalAlpha = 1;
  // caption: short enough to stay left of A
  const cap = riseA(t, cues.voice_on + 0.9, 0.8);
  g.globalAlpha = cap.a * 0.6; font(g, 400, 15); g.fillStyle = WHITE(1); g.fillText(V5 ? UI.caption : '“…keep tonight free”', P0, c.h - P0 + 2 + cap.dy);
  g.globalAlpha = 1;
}

// C — modes (the Focus toggle knob becomes the Liquid Glass lens)
const TOG = { x: 440 - 32 - 80, y: 92 - 22.5, w: 80, h: 45 };   // r2: 1.25x (glass knob ~70 px at the lean-in)  // card-local, top-left origin
const KNOB_R = 18.75;
function toggleP(t) { return eInOutCubic(inv(cues.toggle_on, cues.toggle_on + 0.42, t)); }
function knobLocal(t) { // centre of the knob, card-local, relative to card centre
  const p = toggleP(t);
  const x = TOG.x + TOG.h / 2 + p * (TOG.w - TOG.h);
  return [x - 220, TOG.y + TOG.h / 2 - 125];
}
function knobVis(t) { // white knob opacity & scale in the canvas
  const press = seg(t, cues.knob_press - 0.12, cues.knob_press + 0.1);
  const glass = seg(t, cues.knob_glass - 0.07, cues.knob_glass + 0.08);
  const back = seg(t, 5.5, 5.85);
  return { a: (HIDE_DOT ? 0 : 1 - glass) + glass * back, s: 1 + 0.14 * press * (1 - back), dotA: 1 - glass };
}
function drawModes(c, t) {
  const g = c.g; g.setTransform(S, 0, 0, S, 0, 0); g.clearRect(0, 0, c.w, c.h);
  const P0 = 32;
  const hA = riseA(t, cues.cardC_in + 0.35, 0.9);
  g.globalAlpha = hA.a;
  // row 1: Focus
  const y1 = 92 + hA.dy;
  // moon icon
  g.save(); g.translate(P0 + 14, y1); g.fillStyle = WHITE(0.92);
  g.beginPath(); g.arc(0, 0, 12, 0, TAU); g.arc(6, -5, 10, 0, TAU, true); g.fill('evenodd'); g.restore();
  font(g, 500, 21); g.fillStyle = WHITE(0.95); g.fillText(V5 ? UI.focus : 'Focus', P0 + 42, y1 - 2);
  font(g, 400, 15); g.fillStyle = WHITE(0.5); g.fillText(V5 ? UI.focusSub : 'Only family can reach you', P0 + 42, y1 + 20);
  // toggle
  const p = toggleP(t);
  const tx = TOG.x, ty = TOG.y + hA.dy;
  rr(g, tx, ty, TOG.w, TOG.h, TOG.h / 2); g.fillStyle = WHITE(0.16); g.fill();
  if (p > 0) {
    g.save(); g.globalAlpha = hA.a * p;
    const gr = g.createLinearGradient(tx, 0, tx + TOG.w, 0); gr.addColorStop(0, '#5B7CFF'); gr.addColorStop(1, '#43D3F2');
    rr(g, tx, ty, TOG.w, TOG.h, TOG.h / 2); g.fillStyle = gr; g.fill(); g.restore(); g.globalAlpha = hA.a;
  }
  rr(g, tx + 0.5, ty + 0.5, TOG.w - 1, TOG.h - 1, TOG.h / 2); g.strokeStyle = WHITE(0.22); g.lineWidth = 1; g.stroke();
  const kv = knobVis(t);
  if (kv.a > 0.002) {
    const [kx, ky] = knobLocal(t);
    const stretch = 1 + 0.22 * Math.sin(Math.PI * inv(cues.toggle_on, cues.toggle_on + 0.42, t)); // knob elongates mid-slide
    g.save(); g.globalAlpha = hA.a * kv.a; g.translate(kx + 220, ky + 125 + hA.dy); g.scale(stretch * kv.s, kv.s);
    g.shadowColor = 'rgba(10,5,40,0.35)'; g.shadowBlur = 8; g.shadowOffsetY = 2;
    g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(0, 0, KNOB_R, 0, TAU); g.fill(); g.restore(); g.globalAlpha = hA.a;
  }
  // divider
  g.fillStyle = WHITE(0.1); g.fillRect(P0, 139 + hA.dy, c.w - 2 * P0, 1);
  // row 2: Glow slider
  const y2 = 190 + hA.dy;
  g.save(); g.translate(P0 + 14, y2 - 6); g.strokeStyle = WHITE(0.92); g.lineWidth = 2; g.lineCap = 'round';
  g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.stroke();
  for (let i = 0; i < 8; i++) { const a = i * TAU / 8; g.beginPath(); g.moveTo(Math.cos(a) * 10, Math.sin(a) * 10); g.lineTo(Math.cos(a) * 13, Math.sin(a) * 13); g.stroke(); }
  g.restore();
  font(g, 500, 21); g.fillStyle = WHITE(0.95); g.fillText(V5 ? UI.glow : 'Glow', P0 + 42, y2);
  const sx0 = 190, sx1 = c.w - P0, sy = y2 - 7;
  const v = lerp(0.3, 0.74, eInOutCubic(inv(cues.slider[0], cues.slider[1], t)));
  rr(g, sx0, sy - 2, sx1 - sx0, 4, 2); g.fillStyle = WHITE(0.18); g.fill();
  const gr2 = g.createLinearGradient(sx0, 0, sx1, 0); gr2.addColorStop(0, '#7A5CFF'); gr2.addColorStop(1, '#43D3F2');
  rr(g, sx0, sy - 2, (sx1 - sx0) * v, 4, 2); g.fillStyle = gr2; g.fill();
  g.save(); g.shadowColor = 'rgba(10,5,40,0.35)'; g.shadowBlur = 6; g.shadowOffsetY = 1;
  g.fillStyle = '#fff'; g.beginPath(); g.arc(sx0 + (sx1 - sx0) * v, sy, 10, 0, TAU); g.fill(); g.restore();
  font(g, 400, 15); g.fillStyle = WHITE(0.5); g.textAlign = 'right'; g.fillText(`${Math.round(v * 100)}%`, sx1, y2 + 22); g.textAlign = 'left';
  g.globalAlpha = 1;
}

const exitA = hermite([{ t: 6.92, v: [0], m: [0] }, { t: cues.a_hold[0], v: [0.22], m: [0.08] }, { t: cues.a_hold[1], v: [0.27], m: [0.25] },
  { t: 7.98, v: [0.52], m: [2.0] }, { t: 8.4, v: [1.0], m: [0] }]);
const CARDS = [
  makeCard({ id: 'A', w: 660, h: 470, r: 42, base: [1090, 500, 0], rot: [2, 6.5, 0], tin: cues.cardA_in, tout: 6.92, pdur: 1.5, exitFn: (t) => exitA(t)[0], fade: [cues.a_clear - 0.03, cues.a_clear + 0.45], dfT: [7.8, 8.2], cA: [6.9, 7.35, 1.0], drift: [920, -30, -560], prot: [2, -16], gd: 0.0, draw: drawChat, ph: 0.0 }),
  makeCard({ id: 'B', w: 400, h: 200, r: 38, base: [q('bx', 752), 292, 230], rot: [4, -10, 0], tin: cues.cardB_in, tout: cues.part[0], pdur: 1.65, drift: [-640, -400, -520], prot: [-8, 14], gd: 0.22, draw: drawVoice, ph: 1.7 }),
  makeCard({ id: 'C', w: 440, h: 250, r: 40, base: [652, 800, -120], rot: [-4, -9, 0], tin: cues.cardC_in, tout: cues.part[1], pdur: 1.65, drift: [-440, 330, -460], prot: [10, 14], gd: 0.14, draw: drawModes, ph: 3.1 }),
];

function cardState(c, t, lens) {
  const k = inv(c.tin, c.tin + 1.9, t);
  const e = eOutQuint(k);
  // exit: the glass parts like a curtain - each pane slides out along its own axis and toward the lens/camera
  const kp = inv(c.tout, c.tout + c.pdur, t);
  const eo = c.exitFn ? c.exitFn(t) : eInOutCubic(kp);
  // arrival: from deep z, below, tilted back; damped overshoot on the tilt (follow-through)
  const tau = Math.max(0, t - c.tin);
  const tilt = 20 * Math.exp(-3.2 * tau) * Math.cos(3.6 * tau);
  const fl = [Math.sin(TAU * t / 5.4 + c.ph) * 5, Math.sin(TAU * t / 6.3 + c.ph * 1.3) * 0.9, Math.sin(TAU * t / 7.7 + c.ph * 0.7) * 1.1];
  let x = c.base[0] + c.drift[0] * eo;
  let y = c.base[1] + 70 * (1 - e) + fl[0] + c.drift[1] * eo;
  let z = c.base[2] + 560 * (1 - e) + c.drift[2] * eo;
  let rx = c.rot[0] + (k > 0 ? tilt : 20) + fl[1] + c.prot[0] * eo;
  let ry = c.rot[1] + fl[2] + c.prot[1] * eo;
  // slow orbit of the whole cluster (true parallax + changing perspective on the glass)
  const yaw = lerp(8, 0, eOutCubic(inv(-0.8, 5.6, t))) - 2.5 * eSine(inv(5.6, 10.5, t));
  const pitch = lerp(-4, 0, eOutCubic(inv(-0.8, 5.6, t)));
  {
    const cy = Math.cos(yaw * D2R), sy = Math.sin(yaw * D2R), cp = Math.cos(pitch * D2R), sp = Math.sin(pitch * D2R);
    let dx = x - 960, dy = y - 540, dz = z - 80;
    let nx = cy * dx + sy * dz, nz = -sy * dx + cy * dz;
    let ny = cp * dy - sp * nz; nz = sp * dy + cp * nz;
    x = 960 + nx; y = 540 + ny; z = 80 + nz; ry += yaw; rx -= pitch;
  }
  // the lens "has weight": cards lean slightly away from it as it passes
  if (lens && lens.on > 0) {
    const dx = (lens.c[0] - x) / (c.w * 0.5), dy = (lens.c[1] - y) / (c.h * 0.5);
    const infl = Math.exp(-(dx * dx + dy * dy) * 0.5) * lens.on * seg(t, 5.5, 6.0);
    ry += -2.2 * dx * infl; rx += 2.2 * dy * infl;
  }
  const fd = c.fade || [c.tout + c.pdur * 0.82, c.tout + c.pdur];
  const op = eSine(inv(c.tin, c.tin + 0.8, t)) * (1 - seg(t, fd[0], fd[1]));
  const ca = c.cA || [c.tout - 0.05, c.tout + 0.7, 0.75];
  const contentA = 1 - ca[2] * eSine(inv(ca[0], ca[1], t));
  const dfk = c.dfT ? eSine(inv(c.dfT[0], c.dfT[1], t)) : eSine(inv(c.tout, c.tout + c.pdur * 0.7, t));   // defocus leads the travel (the pane leaves the focal plane first)
  const lod = 3.2 * (1 - eOutCubic(inv(c.tin, c.tin + 1.1, t))) + 3.2 * dfk;
  // catch-light: the glass catches the key light as it tilts into place, and again when the drop's light wave passes
  let glint = [0, 0];
  const g1 = inv(c.tin + 0.3, c.tin + 1.7, t), g2 = inv(cues.drop + 0.05 + c.gd, cues.drop + 1.05 + c.gd, t);
  if (g1 > 0 && g1 < 1) glint = [lerp(-1.9, 1.9, eSine(g1)), 0.11 * Math.sin(Math.PI * g1)];
  else if (g2 > 0 && g2 < 1) glint = [lerp(-1.9, 1.9, eSine(g2)), 0.085 * Math.sin(Math.PI * g2)];
  const defocus = 0.5 + 16 * dfk;           // px: the pane passes through the focal plane
  const frost = 1;
  const R = rotM(rx, ry, 0);
  const edge = c.id === 'A' ? 1 + 0.25 * seg(t, 0.0, 0.4) * (1 - seg(t, 1.3, 2.1)) : 1;   // the hook: bevel catch-light
  // r2 hook event: a catch-light runs round A's top-right bevel radius over 0.05-0.5 s (s: local px along the rim)
  const kc = inv(0.05, 0.5, t);
  const catchL = c.id === 'A' && kc > 0 && kc < 1 ? [lerp(-90, c.r * 1.5708 + 80, eSine(kc)), 1.0 * Math.sin(Math.PI * kc)] : [0, 0];
  return { C: [x, y, z], ...R, op, contentA, lod, frost, defocus, part: eo, glint, edge, catchL, sheen: -0.7 + 1.2 * inv(-1, 10, t) + (rx - c.rot[0]) * 0.07 + (ry - c.rot[1]) * 0.05 };
}

// projection of a card-local point (relative to the card centre, y down) -> [x, y, scale]
function cardLocalScreen(ci, t, lx, ly) {
  const st = cardState(CARDS[ci], t, null);
  const Pw = [0, 1, 2].map((i) => st.C[i] + st.U[i] * lx + st.V[i] * ly);
  return project(Pw, camO(camera(t)));
}
// knob screen position (projection of card C's knob) — lens birth point
function knobScreen(t) { const [lx, ly] = knobLocal(t); return cardLocalScreen(2, t, lx, ly); }

// ------------------------------------------------------------------ wordmark metrics (the lens becomes its "o")
const WORD = 'Aurora';
const wordCv = document.createElement('canvas'); wordCv.width = RW; wordCv.height = RH;
const wg = wordCv.getContext('2d');
const wordTex = canvasTex(false);
// v5.1: the four title glyphs go to their own mask canvas (premultiplied white, g = wave catch); FS_GLYPH turns them to glass
const glyphCv = V5 ? document.createElement('canvas') : null, gg = V5 ? glyphCv.getContext('2d') : null, glyphTex = V5 ? canvasTex(false) : null;
if (V5) { glyphCv.width = RW; glyphCv.height = RH; }
const WORD_SIZE = 178, WORD_BASE = 596, WORD_TRACK = 4;
wg.font = `200 ${WORD_SIZE}px ${FONT_WORD}`; wg.letterSpacing = `${WORD_TRACK}px`;
const wordW = wg.measureText(WORD).width - WORD_TRACK;
const WX0 = 960 - wordW / 2;
// optical kerning: close the open A-u diagonal, give the (rounder, larger) glass "o" room before "ra"; recentred
const KERN = [8, 0, 0, 0, 6, 6];
const LETTER_X = [...WORD].map((_, i) => WX0 + wg.measureText(WORD.slice(0, i)).width + KERN[i] - (KERN[0] + KERN[5]) / 2);
wg.letterSpacing = '0px';
const oM = wg.measureText('o');
// v5: 「玻璃拟态。」 — HarmonyOS Sans SC Light, the four glyphs centred (the 句号 hangs, 标点悬挂); the glass ring is the 句号
const V5L = (() => {
  if (!V5) return null;
  wg.font = `${V5T.w} ${V5T.size}px ${FONT_CN}`;
  const ch = [...V5T.title], adv = ch.map((c) => wg.measureText(c).width);
  const total = adv.reduce((a, b) => a + b, 0) + V5T.track * (ch.length - 1);
  const R = q('v5r', 30), gap = q('v5gap', 0.05) * V5T.size;
  const shift = -q('v5shift', 0.5) * (gap + R);                 // optical centring: half the hanging 句号 pulls the lockup left
  const x0 = 960 - total / 2 + shift;
  const xs = []; let x = x0; ch.forEach((c, i) => { xs.push(x); x += adv[i] + V5T.track; });
  const m = wg.measureText(V5T.title);
  const ink = { top: V5T.base - m.actualBoundingBoxAscent, bot: V5T.base + m.actualBoundingBoxDescent, l: x0 - m.actualBoundingBoxLeft, r: x0 + m.actualBoundingBoxRight + (ch.length - 1) * V5T.track };
  const cx = x0 + total + gap + R, cy = ink.bot - R - q('v5lift', 2);
  wg.font = `200 ${WORD_SIZE}px ${FONT_WORD}`;
  return { ch, adv, xs, ink, total, R, cx, cy };
})();
const O_CX = V5 ? V5L.cx : LETTER_X[3] + (oM.actualBoundingBoxRight - oM.actualBoundingBoxLeft) / 2 + (-oM.actualBoundingBoxLeft);
const O_CY = V5 ? V5L.cy : WORD_BASE - (oM.actualBoundingBoxAscent - oM.actualBoundingBoxDescent) / 2;
const O_R = V5 ? V5L.R : (oM.actualBoundingBoxAscent + oM.actualBoundingBoxDescent) / 2 + 1.5;
// letters ripple outward from the glass "o"
// r2: when the 9.0 refraction wave (r = 700 * outSine(k), 0.9 s) reaches each letter's centre
const LETTER_CATCH = [...WORD].map((ch, i) => { const w = wg.measureText(ch).width; const d = Math.hypot(LETTER_X[i] + w / 2 - O_CX, WORD_BASE - 60 - O_CY);
  return cues.wave + 0.9 * Math.asin(Math.min(1, d / 700)) * 2 / Math.PI; });
const LETTER_T = [0.3, 0.15, 0.0, null, 0.02, 0.17].map((d) => d === null ? null : cues.word + d);
// v5: the four glyphs ripple outward from the centre; each catches the 9.0 wave as it reaches it from the 句号
const V5_T = V5 ? [0.13, 0.0, 0.02, 0.15].map((d) => cues.word + d) : null;
const V5_RISE = 0.95, V5_SWEEP = [8.0, 8.8];   // (internal time) glyph rise; specular sweep once pane A has cleared
const V5_CATCH = V5 ? V5L.xs.map((x, i) => { const d = Math.hypot(x + V5L.adv[i] / 2 - O_CX, (V5L.ink.top + V5L.ink.bot) / 2 - O_CY);
  return cues.wave + 0.9 * Math.asin(Math.min(1, d / 700)) * 2 / Math.PI; }) : null;

// ------------------------------------------------------------------ lens choreography
const KN_T = cues.bead;
const SETTLE = cues.orb_settle;
// 1) the bead rises out of the toggle (card C local offset from the knob)
// first 0.3 s through clear aurora (right, off the chip), then up into the reply
const beadRise = hermite([{ t: KN_T, v: [0, 0], m: [150, -6] }, { t: 5.1, v: [q('b1x', 42), q('b1y', -5)] }, { t: cues.snap, v: [q('b2x', 100), q('b2y', -12)] }, { t: 6.0, v: [170, -190] }]);
// 2) ...and is caught by the reply: it glides along "when the light turns gold." (card A local, from the card centre)
const G0 = [q('g0x', -150), q('g0y', 36)], G1 = [q('g1x', -40), q('g1y', 40)];
const glideA = hermite([{ t: 5.3, v: [G0[0] - 70, G0[1] + 40] }, { t: 5.95, v: G0 }, { t: cues.lens_free, v: G1 }]);
function lensOnUI(t) {
  if (t <= KN_T) { const k = knobScreen(t); return [k[0], k[1]]; }
  const [kx, ky] = knobLocal(t), r = beadRise(t);
  const pc = cardLocalScreen(2, t, kx + r[0], ky + r[1]);
  const g = glideA(t), pa = cardLocalScreen(0, t, g[0], g[1]);
  const w = eSine(inv(5.3, 5.95, t));
  return [lerp(pc[0], pa[0], w), lerp(pc[1], pa[1], w)];
}
// 3) free flight: the glass leaves the parting UI and settles as the "o" of the wordmark (screen space, C1-continuous)
const T_FREE = cues.lens_free;
const P_FREE = lensOnUI(T_FREE);
const V_FREE = (() => { const a = lensOnUI(T_FREE - 0.01); return [(P_FREE[0] - a[0]) / 0.01, (P_FREE[1] - a[1]) / 0.01]; })();
const lensFree = hermite([
  { t: T_FREE, v: P_FREE, m: V_FREE },
  { t: SETTLE, v: [O_CX, O_CY], m: [0, 0] },
]);
const lensHX = keysS([[5.95, 200], [6.45, 224], [T_FREE, 190], [7.7, 112], [SETTLE, O_R]], eSine);   // r2: blooms toward the viewer
const lensHY = keysS([[5.95, 110], [6.45, 122], [T_FREE, 106], [7.7, 88], [SETTLE, O_R]], eSine);
const lensMag = keysS([[4.62, 1.0], [5.1, 1.14], [6.0, 1.36], [7.0, 1.32], [7.6, 1.26], [SETTLE, 1.2]], eSine);
function lensCentreRaw(t) { return t < T_FREE ? lensOnUI(t) : lensFree(t); }
// damped-spring squash & stretch driven by velocity (integrated from a fixed start → pure in t)
function lensStretch(t) {
  const t0 = 4.9, dt = 1 / 240; let sx = 0, sy = 0, vx = 0, vy = 0;
  const w = TAU * 2.0, z = 0.3;
  const n = Math.max(0, Math.floor((t - t0) / dt));
  let prev = lensCentreRaw(t0);
  for (let i = 1; i <= n; i++) {
    const tt = t0 + i * dt; const cur = lensCentreRaw(tt);
    const tvx = (cur[0] - prev[0]) / dt * 0.00016, tvy = (cur[1] - prev[1]) / dt * 0.00016; prev = cur;
    const ax = -w * w * (sx - tvx) - 2 * z * w * vx, ay = -w * w * (sy - tvy) - 2 * z * w * vy;
    vx += ax * dt; vy += ay * dt; sx += vx * dt; sy += vy * dt;
  }
  return [sx, sy];
}
function lensState(t) {
  const on = seg(t, cues.knob_glass - 0.08, cues.knob_glass + 0.08);
  if (on <= 0) return { on: 0 };
  const kn = knobScreen(t);
  const kr = KNOB_R * kn[2];
  const c0 = lensCentreRaw(t), ws = wordScale(t);
  const c = [960 + (c0[0] - 960) * ws, WC_Y + (c0[1] - WC_Y) * ws];
  // anticipation: the glass knob swells 8 % and sinks 4 px (6 frames) before the bead pulls out
  const ant = seg(t, cues.bead - 0.2, cues.bead) * (1 - seg(t, cues.bead, cues.bead + 0.25));
  c[1] += 4 * kn[2] * ant;
  const press = 1.14 * (1 + 0.08 * seg(t, cues.bead - 0.2, cues.bead));
  let hx, hy;
  if (t < KN_T) { // the knob itself has turned to glass, 'held' with a soft wobble
    const wob = Math.sin(TAU * 3.0 * (t - cues.knob_glass)) * Math.exp(-4 * Math.max(0, t - cues.knob_glass)) * 0.07;
    hx = kr * press * (1 + wob); hy = kr * press * (1 - wob);
  } else if (t < cues.snap) { // a bead of glass pulls away from the knob (0.65 s neck)
    const k = eSine(inv(KN_T, cues.snap, t)); hx = hy = kr * press * lerp(1, 2.0, k);
  } else if (t < 5.95) { // snap: a 3-frame overshoot wobble, then it swells into the capsule lens
    const k = eSine(inv(cues.snap, 5.95, t)); const r0 = kr * press * 2.0;
    const dt = t - cues.snap, wob = Math.sin(TAU * 7.5 * dt) * Math.exp(-14 * dt) * 0.12;
    hx = lerp(r0, 200, k) * (1 - wob); hy = lerp(r0, 110, k) * (1 + wob);
  } else { hx = lensHX(t); hy = lensHY(t); }
  // squash & stretch
  const [sx, sy] = lensStretch(t);
  const amt = clamp(Math.hypot(sx, sy) * 0.75, 0, 0.1);
  const ang = Math.atan2(sy, sx);
  const a = 1 + amt, b = 1 / Math.sqrt(1 + amt * 1.4);
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const i11 = ca * ca / a + sa * sa / b, i12 = ca * sa * (1 / a - 1 / b), i22 = sa * sa / a + ca * ca / b;
  // breathing at rest
  const br = 1 + 0.018 * Math.sin(TAU * (t - SETTLE - 0.35) / 2.2) * seg(t, SETTLE + 0.2, SETTLE + 0.9);
  hx *= br * ws; hy *= br * ws;
  // bead: the part of the knob that stays in the track (metaball neck while separating)
  const sep = seg(t, KN_T, cues.snap);
  const beadR = t < 5.9 ? kr * lerp(1.14, 1.0, sep) : 0;
  const beadA = 1 - seg(t, 5.5, 5.85);
  const beadK = t < 5.9 ? q('neck', 40) * kn[2] * (1 - seg(t, cues.snap - 0.16, cues.snap + 0.01)) + 0.6 : 0;
  const lift = seg(t, KN_T, 5.6) * (1 - 0.9 * seg(t, 7.6, SETTLE));
  const mag = lensMag(t);
  let bezel = Math.min(Math.min(hx, hy) * 0.55, q('bzmax', 60));
  // the drop opens into a ring: an annulus the weight of a Sora stroke (iris opening from the centre)
  const rk = eSine(inv(cues.ring_open[0], cues.ring_open[1], t));
  const RW_END = q('ringw', V5 ? 14 : 13) * ws;   // v5.1: a heavier 句号 ring to sit with the Black glass glyphs
  const ringW = rk > 0 ? lerp(Math.min(hx, hy) * 1.1, RW_END, rk) : 0;
  if (ringW > 0) bezel = Math.min(bezel, ringW * 0.5);
  // the light turns gold inside the glass (and a trace of it stays in the counter of the "o")
  // r2s3: sharp attack - ~50 % of the gold within 3 frames of the drop, then the slow build to the 6.45 peak
  const warm = Math.max(0.5 * seg(t, cues.gold[0] - 0.01, cues.gold[0] + 0.09, eOutCubic), seg(t, cues.gold[0], cues.gold[1])) * (1 - 0.88 * seg(t, cues.gold[1], 7.0));
  const cw = 0.12 * seg(t, 7.9, 8.5) + 0.06 * Math.sin(Math.PI * inv(cues.final_note, cues.final_note + 0.8, t));   // breathes 12 -> 18 % on the E7
  const kg = inv(cues.ring_glint[0], cues.ring_glint[1], t);
  let rgl = [lerp(-2.5, 0.9, eOutSine(kg)), kg > 0 && kg < 1 ? 1.0 * Math.sin(Math.PI * kg) : 0];
  // r2s3: on the drop a specular whips round the bezel (6.0 -> 6.2) and the rim flashes (attack 2 frames, decay ~8)
  const kd = inv(cues.drop - 0.015, cues.drop + 0.2, t);
  if (kd > 0 && kd < 1) rgl = [lerp(-2.3, 2.9, eOutCubic(kd)), 1.1 * Math.pow(Math.sin(Math.PI * Math.pow(kd, 0.55)), 1.5)];
  const flash = seg(t, cues.drop - 0.02, cues.drop + 0.04, eOutSine) * (1 - seg(t, cues.drop + 0.05, cues.drop + 0.32));
  const kw = inv(cues.wave, cues.wave + 0.9, t);
  const wk = kw > 0 && kw < 1 ? seg(kw, 0, 0.06) : 0;   // r2: a refraction wave - bends each letter ~2.5 px, light on its crest
  const wave = [700 * eOutSine(kw), 0.11 * Math.pow(1 - kw, 0.8) * wk, 6.5 * Math.pow(1 - kw, 0.45) * wk];
  return { on, c, hx, hy, r: Math.min(hx, hy), M: [i11, i12, i12, i22], bead: [kn[0], kn[1], beadR], beadK, beadA, lift, mag, bezel, ringW, warm, cw, rgl, wave, flash };
}

// the end card keeps breathing: a very slow push on the lockup (the glass "o" rides the same transform)
const WC_Y = V5 ? 560 : 590;
function wordScale(t) { return 1 + 0.022 * eSine(inv(7.2, 10.4, t)); }
function drawWord(t) {
  const g = wg; g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, W, H);
  const ws = wordScale(t); g.setTransform(DPR * ws, 0, 0, DPR * ws, DPR * 960 * (1 - ws), DPR * WC_Y * (1 - ws));
  if (t < cues.word - 0.05) return false;
  g.textBaseline = 'alphabetic';
  if (V5) { gg.setTransform(DPR, 0, 0, DPR, 0, 0); gg.clearRect(0, 0, W, H); gg.setTransform(DPR * ws, 0, 0, DPR * ws, DPR * 960 * (1 - ws), DPR * WC_Y * (1 - ws));
    drawTitleV5(g, t); return true; }
  g.font = `200 ${WORD_SIZE}px ${FONT_WORD}`; g.letterSpacing = '0px';
  for (let i = 0; i < WORD.length; i++) {
    if (LETTER_T[i] === null) continue;       // the "o" is the glass lens
    const r = riseA(t, LETTER_T[i], 0.95);
    if (r.a <= 0) continue;
    g.globalAlpha = r.a; g.fillStyle = '#FFFFFF';
    const ck = Math.exp(-Math.pow((t - LETTER_CATCH[i]) / 0.055, 2));
    if (ck > 0.01) { g.shadowColor = `rgba(255,246,236,${0.9 * ck})`; g.shadowBlur = 22 * DPR; }
    g.fillText(WORD[i], LETTER_X[i], WORD_BASE + r.dy);
    if (ck > 0.01) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = r.a * 0.35 * ck; g.fillText(WORD[i], LETTER_X[i], WORD_BASE + r.dy);
      g.globalCompositeOperation = 'source-over'; g.shadowBlur = 0; g.shadowColor = 'rgba(0,0,0,0)'; }
  }
  // tagline: English | Chinese
  const tg = riseA(t, cues.tagline, 0.95);
  if (tg.a > 0) {
    g.globalAlpha = tg.a;
    const y = 684 + tg.dy;
    g.font = `300 29px ${FONT_WORD}`; g.letterSpacing = '0.5px';
    const en = 'Think in light.'; const ew = g.measureText(en).width;
    // CJK line set in full cells: the native full-width comma keeps its own em (standard 全角 setting)
    g.font = `300 28px ${FONT_CN}`; g.letterSpacing = '0px';
    const TR = 2.5, adv = (c) => g.measureText(c).width;
    const cn = []; let px = 0;
    for (const ch of '思考，自有光') { cn.push([ch, px]); px += adv(ch) + TR; }
    const cw = px - TR;
    const gap = 28, total = ew + gap * 2 + 1 + cw, x0 = 960 - total / 2;
    g.font = `300 29px ${FONT_WORD}`; g.letterSpacing = '0.5px'; g.fillStyle = WHITE(0.88); g.fillText(en, x0, y);
    g.fillStyle = WHITE(0.32); g.fillRect(Math.round(x0 + ew + gap), y - 23, 1, 27);
    g.font = `300 28px ${FONT_CN}`; g.letterSpacing = '0px'; g.fillStyle = WHITE(0.88);
    const cx0 = x0 + ew + gap * 2 + 1; for (const [c, dx] of cn) g.fillText(c, cx0 + dx, y - 1);
  }
  g.globalAlpha = 1; g.letterSpacing = '0px';
  return true;
}

// v5 end card: 「玻璃拟态。」 big (the glass ring is the 句号, drawn by the lens pass) + 弥散渐变 ｜ AURORA · GLASS
// v5.1: the glyphs are drawn as a MASK into glyphCv (FS_GLYPH makes them frosted glass); line 2 stays flat white in wordCv
let GLYPHS_ON = false;
function drawTitleV5(g, t) {
  GLYPHS_ON = false;
  if (!HIDE_TITLE) {
    gg.font = `${V5T.w} ${V5T.size}px ${FONT_CN}`; gg.letterSpacing = '0px'; gg.textBaseline = 'alphabetic';
    V5L.ch.forEach((c, i) => {
      const r = riseA(t, V5_T[i], V5_RISE);
      if (r.a <= 0) return;
      GLYPHS_ON = true;
      const ck = Math.exp(-Math.pow((t - V5_CATCH[i]) / 0.055, 2));
      gg.globalAlpha = r.a; gg.fillStyle = `rgb(255,${Math.round(255 * ck)},255)`;
      gg.fillText(c, V5L.xs[i], V5T.base + r.dy * 1.6);
    });
    gg.globalAlpha = 1;
  }
  const tg = riseA(t, cues.a_clear - 0.13, 0.6);   // v5.1: 弥散渐变 rises as pane A clears (internal 8.02 = source 7.52), full by source ~8.17
  if (tg.a > 0) {
    g.globalAlpha = tg.a;
    const y = V5T.subBase + tg.dy;
    const fs = `${V5T.subW} ${V5T.subSize}px ${FONT_CN}`, fe = `${V5T.subW} ${V5T.enSize}px ${FONT_CN}`;
    g.font = fs; g.letterSpacing = '4px';
    const cw = g.measureText(V5T.sub).width - 4;
    g.font = fe; g.letterSpacing = `${V5T.enTrack}px`;
    const ew = g.measureText(V5T.en).width - V5T.enTrack;
    const gap = 30, total = cw + gap * 2 + 2 + ew, x0 = 960 - total / 2;
    // v5.2: line 2 brighter (0.94/0.4/0.84 -> 0.97/0.55/0.95) and set on a soft deep-indigo shadow, so it reads on the pool
    if (V52) { g.shadowColor = `rgba(6,4,36,${q('l2sh', 0.55)})`; g.shadowBlur = 12 * DPR; g.shadowOffsetY = 2 * DPR; }
    g.font = fs; g.letterSpacing = '4px'; g.fillStyle = WHITE(V52 ? 0.97 : 0.94); g.fillText(V5T.sub, x0, y);
    g.fillStyle = WHITE(V52 ? 0.55 : 0.4); g.fillRect(Math.round(x0 + cw + gap), y - 42, 2, 46);
    g.font = fe; g.letterSpacing = `${V5T.enTrack}px`; g.fillStyle = WHITE(V52 ? 0.95 : 0.84); g.fillText(V5T.en, x0 + cw + gap * 2 + 2, y - 7);
    if (V52) { g.shadowColor = 'rgba(0,0,0,0)'; g.shadowBlur = 0; g.shadowOffsetY = 0; }
  }
  g.globalAlpha = 1; g.letterSpacing = '0px';
}
// v5.1: the glass glyph pass (src -> dst). Bevel = narrow full-res blur of the mask; dome + shadow = wide quarter-res blur.
const TAPS_GN = V5 ? gaussTaps(4.5 * DPR) : null, TAPS_GW = V5 ? gaussTaps(12 * DPR / 4) : null, TAPS_GF = V5 ? gaussTaps(18 * DPR / 4) : null;
function glassGlyphs(t, src, dst) {
  upload(glyphTex, glyphCv, false);
  let L = use(P.blur, T.g1); bindTex(0, glyphTex, L.uSrc); gl.uniform2f(L.uDir, 1, 0); gl.uniform1fv(L.uOff, TAPS_GN.offs); gl.uniform1fv(L.uW, TAPS_GN.ws); gl.uniform1i(L.uN, TAPS_GN.n); draw();
  L = use(P.blur, T.g2); bindTex(0, T.g1.tex, L.uSrc); gl.uniform2f(L.uDir, 0, 1); gl.uniform1fv(L.uOff, TAPS_GN.offs); gl.uniform1fv(L.uW, TAPS_GN.ws); gl.uniform1i(L.uN, TAPS_GN.n); draw();
  blurInto({ tex: glyphTex, w: RW, h: RH }, T.qL, TAPS_GW);
  blurInto(src, T.qB, TAPS_GF);
  L = use(P.glyph, dst);
  bindTex(0, src.tex, L.uScene); bindTex(1, T.qB.tex, L.uFrost); bindTex(2, glyphTex, L.uMask); bindTex(3, T.g2.tex, L.uMN); bindTex(4, T.qL.tex, L.uMW);
  gl.uniform2f(L.uLight, -0.55, -0.83); gl.uniform1f(L.uRefr, q('grefr', 30)); gl.uniform3f(L.uShadow, 5, 11, q('gshadow', 0.34)); gl.uniform1f(L.uLift, q('glift', V52 ? 0.15 : 0.115));
  // v5.2 (jury r6: the glass was ~1.7:1 on lavender): a deep-indigo pool behind the lockup + a dark halo, a brighter body and
  // rim. The pool fades in with the glyph rise (internal 6.8 -> 8.0 = source ~6.72 -> 7.55, mostly under pane A's frost).
  const ws = wordScale(t), pk = V52 ? q('gpool', 0.85) * seg(t, cues.word - 0.1, cues.word + 1.1) : 0;
  gl.uniform4f(L.uPool, 960 + (985 - 960) * ws, WC_Y + (548 - WC_Y) * ws, q('poolw', 520) * ws, q('poolh', 190) * ws);
  gl.uniform3f(L.uPoolK, pk, 170 * ws, q('poolf', 240));
  gl.uniform3f(L.uHalo, q('ghalo', V52 ? 0.34 : 0), q('gbody', V52 ? 1.16 : 1.08), q('grim', V52 ? 1.35 : 1)); gl.uniform1f(L.uSat, q('gsat', V52 ? 1.42 : 1.3));
  // the glass catches the light once it is clear of the panes: a specular sweep left -> right
  const ks = inv(V5_SWEEP[0], V5_SWEEP[1], t);
  gl.uniform3f(L.uSweep, lerp(-620, 620, eInOutCubic(ks)), 70, ks > 0 && ks < 1 ? 0.42 * Math.sin(Math.PI * ks) : 0);
  draw();
}

// ------------------------------------------------------------------ global light & ripple
// r2s3: the drop is a light HIT - half the bloom lands in ~2 frames on the 6.01 onset, the rest builds to 6.3
const gainK0 = keysS([[0, 0.78], [1.3, 1.0], [5.8, 1.0], [5.985, 1.0], [6.055, 1.085], [6.3, 1.17], [7.4, 1.0], [8.3, 1.04], [8.95, 1.03], [9.3, 1.08], [10, 1.06]], eSine);
// the Glow slider really turns the light up (3.95-4.85)
const gainK = (t) => gainK0(t) + 0.08 * eInOutCubic(inv(cues.slider[0], cues.slider[1], t));
const RIP_C = lensCentreRaw(cues.drop);
function ripple(t) { const k = inv(cues.drop - 0.05, cues.drop + 1.9, t); return [RIP_C[0], RIP_C[1], 60 + 1500 * eOutSine(k), k > 0 ? 1.6 * Math.pow(1 - k, 1.5) * seg(k, 0, 0.035) : 0]; }   // r2s3: sharp attack (68 ms)

// ------------------------------------------------------------------ render
window.DEMO = { width: W, height: H, fps: FPS, duration: 10, motionBlur: { samples: 1, shutter: 0.5 } };

// reel v5.1 time warp (v5 only): source time t -> internal choreography time u. Identity up to the 6.0 drop; the act-3 build
// (parting, lens flight, title reveal) then plays ~1.3x so the title is fully readable by ~7.6 (internal 8.05); the hold runs
// ~0.8x to 10.0. C1-smooth (Hermite), monotone. linkAt uses the same warp.
const TW = V5 ? (() => {
  const h = hermite([{ t: 6.0, v: [6.0], m: [1] }, { t: 7.6, v: [q('tw76', 8.1)], m: [0.9] }, { t: 10.0, v: [10.0], m: [0.75] }]);
  return (t) => (t <= 6.0 || t >= 10.0 ? t : h(t)[0]);
})() : (t) => t;
window.__tw = TW;
const renderU = async (t) => {
  const frame = Math.round(t * FPS * 4);
  const cam = camera(t); const O = camO(cam);
  const lens = lensState(t);
  const states = CARDS.map((c) => ({ c, s: cardState(c, t, lens) }));

  // ---- aurora
  let L = use(P.aurora, T.sceneA);
  gl.uniform1f(L.uT, t);
  const blobs = new Float32Array(4 * NB), blobE = new Float32Array(2 * NB), cols = new Float32Array(3 * NB);
  const gain = gainK(t);
  BLOBS.forEach((b, i) => {
    const p = b.path(t);
    // gentle parallax of the light field against the camera
    blobs.set([p[0] - cam.x * 0.35, p[1] - cam.y * 0.35, b.rx, b.i], i * 4); blobE.set([b.ry, b.ang * D2R + 0.08 * Math.sin(t * 0.3 + i)], i * 2);
    cols.set(hex(b.col), i * 3);
  });
  gl.uniform4fv(L.uBlob, blobs); gl.uniform2fv(L.uBlobE, blobE); gl.uniform3fv(L.uBlobC, cols);
  gl.uniform4fv(L.uRipple, ripple(t));
  gl.uniform3fv(L.uBase, hex(PAL.base)); gl.uniform1f(L.uGain, gain); gl.uniform1f(L.uWarp, 150);
  gl.uniform3fv(L.uCamO, O); gl.uniform1f(L.uF, F);
  const SC = [], SU = [], SV = [], SN = [], SH = [];
  states.forEach(({ c, s }) => { SC.push(...s.C); SU.push(...s.U); SV.push(...s.V); SN.push(...s.N); SH.push(c.w / 2, c.h / 2, c.r, NOUI ? 0 : s.op * (1 - s.part)); });
  gl.uniform3fv(L.uSC, SC); gl.uniform3fv(L.uSU, SU); gl.uniform3fv(L.uSV, SV); gl.uniform3fv(L.uSN, SN); gl.uniform4fv(L.uSH, SH);
  gl.uniform1f(L.uMotes, Q.has('nomotes') ? 0 : 1);
  draw();

  // ---- cards, back to front, each frosting what is already behind it
  let cur = T.sceneA;
  // ---- wordmark + tagline: they live BEHIND the glass, so the parting panes frost them first
  if (!NOUI && drawWord(t)) {
    if (V5 && GLYPHS_ON) { glassGlyphs(t, cur, T.sceneB); cur = T.sceneB; }   // v5.1: frosted-glass letters
    upload(wordTex, wordCv, false);
    L = use(P.over, cur); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    bindTex(0, wordTex, L.uTex); gl.uniform1f(L.uA, 1); draw(); gl.disable(gl.BLEND);
  }
  const order = states.filter(({ s }) => s.op > 0.001 && !NOUI).sort((a, b) => (b.s.C[2] - a.s.C[2]));
  for (const { c, s } of order) {
    c.draw(c, t); upload(c.tex, c.cv, true);
    const thin = c.id === 'A' ? seg(t, 6.95, 7.4) * (1 - seg(t, 7.9, 8.2)) : 0;
    blurInto(cur, T.qB, thin > 0 ? gaussTaps(lerp(30, 9, thin) * DPR / 4) : TAPS_FROST);
    L = use(P.card, cur);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform3fv(L.uCamO, O); gl.uniform1f(L.uF, F);
    gl.uniform3fv(L.uC, s.C); gl.uniform3fv(L.uU, s.U); gl.uniform3fv(L.uV, s.V); gl.uniform3fv(L.uN, s.N);
    gl.uniform2f(L.uHalf, c.w / 2, c.h / 2); gl.uniform1f(L.uRad, c.r);
    gl.uniform1f(L.uOpacity, s.op); gl.uniform1f(L.uDefocus, s.defocus); gl.uniform1f(L.uContentA, s.contentA); gl.uniform1f(L.uLod, s.lod - 0.35); gl.uniform1f(L.uFrost, s.frost);
    gl.uniform2f(L.uLight, -0.55, -0.83); gl.uniform1f(L.uSheen, s.sheen); gl.uniform2f(L.uGlint, s.glint[0], s.glint[1]); gl.uniform1f(L.uEdge, s.edge); gl.uniform2f(L.uCatch, s.catchL[0], s.catchL[1]);
    bindTex(0, T.qB.tex, L.uBlurTex); bindTex(1, c.tex, L.uContent);
    draw();
    gl.disable(gl.BLEND);
  }

  // ---- Liquid Glass lens
  blurInto(cur, T.qL, TAPS_LENS);
  L = use(P.lens, T.lens);
  bindTex(0, cur.tex, L.uScene); bindTex(1, T.qL.tex, L.uBlur);
  gl.uniform1f(L.uOn, NOUI ? 0 : (lens.on || 0));
  if (lens.on > 0) {
    gl.uniform2f(L.uLC, lens.c[0], lens.c[1]); gl.uniform2f(L.uLH, lens.hx, lens.hy); gl.uniform1f(L.uLR, lens.r);
    gl.uniformMatrix2fv(L.uLM, false, new Float32Array(lens.M));
    gl.uniform3f(L.uBead, lens.bead[0], lens.bead[1], lens.bead[2]); gl.uniform1f(L.uBeadK, lens.beadK); gl.uniform1f(L.uBeadA, lens.beadA);
    gl.uniform1f(L.uBezel, lens.bezel); gl.uniform1f(L.uDepth, lens.bezel * 0.9);
    gl.uniform1f(L.uIor, 1.5); gl.uniform1f(L.uDisp, q('disp', 0.25)); gl.uniform1f(L.uMag, lens.mag);
    gl.uniform1f(L.uRefrSign, +(Q.get('rsign') || -1)); gl.uniform1f(L.uMaxDisp, lens.bezel * +(Q.get('maxd') || 0.85)); gl.uniform1f(L.uRimGlow, lerp(1, V52 ? 2.1 : 1.6, seg(t, 7.6, SETTLE))); gl.uniform1f(L.uRing, +(Q.get('ring') || (V52 ? 0.4 : 0.2)) * seg(t, 7.8, SETTLE + 0.2) + 0.9 * lens.flash);   // v5.2: the 句号 ring's lit edge a touch brighter on the deeper pool
    if (L.uHide) gl.uniform1f(L.uHide, HIDE_DOT ? 1 : 0);
    gl.uniform1f(L.uRingW, lens.ringW); gl.uniform1f(L.uWarm, lens.warm); gl.uniform1f(L.uCW, lens.cw);
    gl.uniform2f(L.uRGl, lens.rgl[0], lens.rgl[1]); gl.uniform3f(L.uWave, lens.wave[0], lens.wave[1], lens.wave[2]); gl.uniform1f(L.uCaustic, 0.22 * lens.lift);
    gl.uniform1f(L.uLift, lens.lift); gl.uniform1f(L.uGlint, t < 8 ? lerp(-1.8, 1.8, inv(5.5, 6.7, t)) : lerp(-1.8, 1.8, inv(8.7, 9.9, t)));
    gl.uniform3f(L.uLight3, -0.5, -0.78, 0.62); gl.uniform1f(L.uFrostRim, q('frim', 0.1)); gl.uniform1f(L.uFres, q('fres', 0.25)); gl.uniform1f(L.uBzExp, q('bzexp', 2.5));
  }
  draw();

  // ---- bloom + final
  blurInto(T.lens, T.qB, TAPS_BLOOM, 0.62);
  L = use(P.final, null);
  bindTex(0, T.lens.tex, L.uSrc); bindTex(1, T.qB.tex, L.uBloom); bindTex(2, grainTex, L.uGrain);
  gl.uniform1f(L.uBloomAmt, 0.22); gl.uniform1f(L.uGrainAmt, +(Q.get('grain') || 0.14)); gl.uniform1f(L.uFrame, frame); gl.uniform1f(L.uVig, 0.18);
  gl.uniform1f(L.uFade, 1);
  draw();
  gl.finish();
};
window.renderAt = V5 ? async (t) => renderU(TW(t)) : renderU;

// ------------------------------------------------------------------ reel v5: link elements (pure in t, 1920x1080 frame px)
if (V5) {
  const r1 = (v) => Math.round(v * 10) / 10;
  const toFrame = (x, y, ws) => [960 + (x - 960) * ws, WC_Y + (y - WC_Y) * ws];
  function cardRect(ci, t, lens, id, note) {
    const c = CARDS[ci], st = cardState(c, t, lens);
    if (st.op <= 0.01) return null;
    const O = camO(camera(t)), hw = c.w / 2, hh = c.h / 2;
    const P = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([lx, ly]) => project([0, 1, 2].map((i) => st.C[i] + st.U[i] * lx + st.V[i] * ly), O));
    const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const rot = Math.atan2(P[1][1] - P[0][1], P[1][0] - P[0][0]) / D2R;
    return { id, type: 'rect', x: r1((x0 + x1) / 2), y: r1((y0 + y1) / 2), w: r1(x1 - x0), h: r1(y1 - y0), rot: r1(rot), a: Math.round(st.op * 1000) / 1000,
      look: 'glass', fill: '#8E93F5', stroke: '#FFFFFF', sw: 1, corners: P.map((p) => [r1(p[0]), r1(p[1])]), note };
  }
  // the visible outline of the glass is the shader's outerSDF: capsule smooth-min'ed with the bead (metaball). While the bead
  // is attached (4.62-5.9) the smin inflates the shape by up to beadK/4, so the radius is measured on the same SDF (FS_LENS outerSDF).
  function outerSDFjs(L, px, py) {
    const dx = px - L.c[0], dy = py - L.c[1];
    const qx = L.M[0] * dx + L.M[2] * dy, qy = L.M[1] * dx + L.M[3] * dy;
    const rr = Math.min(L.r, L.hx, L.hy), ax = Math.abs(qx) - L.hx + rr, ay = Math.abs(qy) - L.hy + rr;
    let d = Math.hypot(Math.max(ax, 0), Math.max(ay, 0)) + Math.min(Math.max(ax, ay), 0) - rr;
    if (L.bead[2] > 0) {
      const d2 = Math.hypot(px - L.bead[0], py - L.bead[1]) - L.bead[2];
      if (L.beadK > 0.5) { const h = Math.max(L.beadK - Math.abs(d - d2), 0) / L.beadK; d = Math.min(d, d2) - h * h * L.beadK * 0.25; } else d = Math.min(d, d2);
    }
    return d;
  }
  function visR(L) {
    const bx = L.c[0] - L.bead[0], by = L.c[1] - L.bead[1], bl = Math.hypot(bx, by);
    const a0 = bl > 1 ? Math.atan2(by, bx) : -Math.PI / 2;
    const rs = [0, Math.PI / 2, -Math.PI / 2].map((da) => {
      const ux = Math.cos(a0 + da), uy = Math.sin(a0 + da); let lo = 0, hi = 4 * Math.max(L.hx, L.hy) + L.beadK;
      for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (outerSDFjs(L, L.c[0] + ux * m, L.c[1] + uy * m) < 0) lo = m; else hi = m; }
      return lo;
    });
    return rs.reduce((a, b) => a + b, 0) / rs.length;
  }
  window.linkAt = (tS) => {
    const t = TW(tS), out = [];
    const lens = lensState(t);
    const kv = knobVis(t);
    // --- the dot: Focus-toggle knob (flat white) -> glass knob 4.62 -> bead 4.8-5.45 -> capsule lens 5.95-7.75 -> ring 句号 8.3-10
    const hA = riseA(t, cues.cardC_in + 0.35, 0.9), knobA = cardState(CARDS[2], t, lens).op * hA.a;
    if (t < cues.knob_glass && knobA > 0.005) {
      // (the white knob cross-fades into the glass knob 4.55-4.70; the pair is always fully visible, so a = the knob's own presence)
      const [kx, ky] = knobLocal(t), kn = cardLocalScreen(2, t, kx, ky + hA.dy);
      const stretch = 1 + 0.22 * Math.sin(Math.PI * inv(cues.toggle_on, cues.toggle_on + 0.42, t));
      const r = KNOB_R * kv.s * kn[2];
      out.push({ id: 'dot', type: 'circle', x: r1(kn[0]), y: r1(kn[1]), r: r1(r), rx: r1(r * stretch), a: Math.round(knobA * 1000) / 1000, look: 'flat',
        fill: '#FFFFFF', stroke: '#FFFFFF', sw: 0, note: 'Focus toggle knob: flat white disc with a soft drop shadow, on a frosted card' });
    } else if (lens.on > 0) {
      const ring = lens.ringW > 0, capsule = Math.abs(lens.hx - lens.hy) > 0.12 * Math.min(lens.hx, lens.hy);
      const a = t < 4.8 ? Math.min(1, lens.on + kv.dotA * knobA) : lens.on;
      const rv = lens.bead[2] > 0 ? visR(lens) : Math.min(lens.hx, lens.hy);
      const e = { id: 'dot', type: 'circle', x: r1(lens.c[0]), y: r1(lens.c[1]), r: r1(rv), a: Math.round(a * 1000) / 1000, look: 'glass',
        fill: '#9AA8FF', stroke: '#FFFFFF', sw: ring ? r1(lens.ringW) : 1.5, grad: ['#C9D2FF', '#6F63F0'] };
      if (capsule) Object.assign(e, { shape: 'capsule', w: r1(2 * lens.hx), h: r1(2 * lens.hy) });
      e.note = t < KN_T ? 'glass knob (the toggle knob has turned to clear glass, rim light)'
        : t < cues.snap ? 'glass bead pulling out of the toggle (metaball neck)'
        : !ring ? (capsule ? 'Liquid-Glass capsule lens (magnifier, rim light); r = end-cap radius, w/h = full size' : 'glass bead swelling into the lens')
        : lens.ringW > 1.2 * O_R ? 'lens irising open into a ring' : 'clear glass ring (annulus, sw = glass stroke) = the 句号 of 玻璃拟态。';
      out.push(e);
    }
    // --- the title block and its second line
    if (t >= cues.word - 0.05) {
      const ws = wordScale(t), ra = V5_T.map((t0) => riseA(t, t0, 0.95).a), a = Math.min(...ra);
      if (!HIDE_TITLE && Math.max(...ra) > 0) {
        const [xa, ya] = toFrame(V5L.ink.l, V5L.ink.top, ws), [xb, yb] = toFrame(V5L.ink.r, V5L.ink.bot, ws);
        out.push({ id: 'title', type: 'rect', x: r1((xa + xb) / 2), y: r1((ya + yb) / 2), w: r1(xb - xa), h: r1(yb - ya), rot: 0, a: Math.round(a * 1000) / 1000, look: 'flat',
          fill: '#FFFFFF', note: '「玻璃拟态」 frosted-glass glyphs (HarmonyOS Sans SC Black 216 px), ink bbox; behind pane A until ~7.55 (source)' });
      }
    }
    // --- the frosted panes: A (conversation) and C (Focus/Glow controls)
    const A = cardRect(0, t, lens, 'cardA', 'frosted glass pane A (conversation); w/h = screen bbox of the projected card, corners = exact quad');
    const Cc = cardRect(2, t, lens, 'cardC', 'frosted glass pane C (Focus toggle + Glow slider)');
    if (A) out.push(A); if (Cc) out.push(Cc);
    return out;
  };
  // v5.2 debug (tests/v5_contrast.mjs): the glyph mask and line-2 canvases of the last renderAt, for glyph-vs-surround luma
  window.__v5dbg = { mask: () => glyphCv.toDataURL(), word: () => wordCv.toDataURL() };
}

await window.renderAt(0);
window.__ready = true;
