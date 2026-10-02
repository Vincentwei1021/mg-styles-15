import { VS, FS_SCENE, FS_BRIGHT, FS_POST } from './shaders.js';
import { toHalf } from './textsdf.js';

export const NB = 72, NS = 20;

function sh(gl, type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    const lines = src.split('\n');
    const m = /ERROR: 0:(\d+)/.exec(log);
    const ctx = m ? lines.slice(Math.max(0, +m[1] - 3), +m[1] + 2).join('\n') : '';
    throw new Error('shader: ' + log + '\n' + ctx);
  }
  return s;
}
function prog(gl, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl, gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS), u = {};
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); const name = info.name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}
function tex(gl, w, h, ifmt, fmt, type, filter, data = null, mips = false) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
function fbo(gl, t) { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return f; }

export function createEngine(canvas, W, H, opts = {}) {
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, alpha: false, premultipliedAlpha: false });
  if (!gl) throw new Error('no webgl2');
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('no EXT_color_buffer_float');
  gl.getExtension('OES_texture_float_linear');
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // reel v5.1: the v5 grade (dark plum set, lifted jelly title) is compiled in with #define V5; the default shader source is untouched
  const FSS = opts.v5 ? FS_SCENE.replace('precision highp float;\n', 'precision highp float;\n#define V5 1\n') : FS_SCENE;
  const P = { scene: prog(gl, FSS), bright: prog(gl, FS_BRIGHT), post: prog(gl, FS_POST) };
  const hdrT = tex(gl, W, H, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR), hdrF = fbo(gl, hdrT);
  const bw = W / 2, bh = H / 2;
  const brT = tex(gl, bw, bh, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR, null, true), brF = fbo(gl, brT);
  gl.bindTexture(gl.TEXTURE_2D, brT); gl.generateMipmap(gl.TEXTURE_2D);
  const typeT = tex(gl, W, H, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
  const backT = tex(gl, 4, 4, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
  let sdfT = null, sdfSize = [1, 1];

  const bufB = new Float32Array(NB * 4), bufBX = new Float32Array(NB * 4);
  const bufS = new Float32Array(NS * 4), bufSX = new Float32Array(NS * 4);

  function setSDF(sdf) {
    const h = toHalf(); const n = sdf.W * sdf.H * 4; const hd = new Uint16Array(n);
    for (let i = 0; i < n; i++) hd[i] = h(sdf.data[i]);
    sdfT = tex(gl, sdf.W, sdf.H, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR, hd);
    sdfSize = [sdf.W, sdf.H];
  }

  // In-page temporal supersampling: every sub-shutter state is rendered into the HDR target and averaged with
  // constant-colour blending (pre-bloom, pre-grain), so fast highlights streak continuously instead of ghosting.
  function render(Ss, typeCanvas) {
    if (!Array.isArray(Ss)) Ss = [Ss];
    const S = Ss[Math.floor(Ss.length / 2)];
    gl.bindFramebuffer(gl.FRAMEBUFFER, hdrF); gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.CONSTANT_COLOR, gl.ONE);
    const w = 1 / Ss.length; gl.blendColor(w, w, w, w);
    for (const Si of Ss) drawScene(Si);
    gl.disable(gl.BLEND);
    post(S, typeCanvas);
  }
  function drawScene(S) {
    // ---------- scene ----------
    const { p, u } = P.scene; gl.useProgram(p);
    gl.uniform2f(u.uRes, W, H); gl.uniform1f(u.uT, S.t);
    gl.uniform4f(u.uCam, S.cam.zoom, S.cam.px, S.cam.py, 0); gl.uniform2f(u.uCam2, S.cam.ox, S.cam.oy);
    gl.uniform1f(u.uK, S.k); gl.uniform1i(u.uDbg, S.dbg || 0); gl.uniform2f(u.uSpot, S.spot ?? 1, S.halo || 0);
    if (u.uV5) { const v = S.v5 || [0, 0, 0, 0], w = S.v5b || [0, 1, 0, 0]; gl.uniform4f(u.uV5, v[0], v[1], v[2], v[3]); gl.uniform4f(u.uV5b, w[0], w[1], w[2], w[3]); }   // v5.1 grade: set dark, title lift, violet lift
    bufB.fill(0); bufBX.fill(0); bufS.fill(0); bufSX.fill(0);
    const nb = Math.min(NB, S.balls.length);
    for (let i = 0; i < nb; i++) {
      const b = S.balls[i];
      bufB.set([b.x, b.y, Math.max(0.01, b.r), b.u], i * 4); bufBX.set([b.s || 1, b.a || 0, b.ghost ? 1 : 0, b.amt ?? 1], i * 4);
    }
    const ns = Math.min(NS, S.segs.length);
    for (let i = 0; i < ns; i++) {
      const s = S.segs[i];
      bufS.set([s.ax, s.ay, s.bx, s.by], i * 4); bufSX.set([s.ra, s.rb, s.u, 0], i * 4);
    }
    gl.uniform1i(u.uNB, nb); gl.uniform4fv(u.uB, bufB); gl.uniform4fv(u.uBX, bufBX);
    gl.uniform1i(u.uNS, ns); gl.uniform4fv(u.uS, bufS); gl.uniform4fv(u.uSX, bufSX);
    const L = new Float32Array(16), LX = new Float32Array(16), LP = new Float32Array(16), LM = new Float32Array(16);
    for (let i = 0; i < 4; i++) {
      const l = S.letters[i];
      if (!l) continue;
      L.set([l.x, l.y, l.grow, l.u], i * 4); LX.set([l.sx, l.sy, l.a || 0, l.on ? (l.m ?? 1) : 0], i * 4); LM.set(l.ell || [0, 0, 1, 1], i * 4); LP.set([l.px, l.py, l.wob || 0, l.wph || 0], i * 4);
    }
    gl.uniform4fv(u.uL, L); gl.uniform4fv(u.uLM, LM); gl.uniform4fv(u.uLX, LX); gl.uniform4fv(u.uLP, LP);
    gl.uniform2f(u.uTexSize, sdfSize[0], sdfSize[1]);
    const fl = S.flood;
    gl.uniform4f(u.uFl, fl.front, fl.back, fl.phase, fl.on ? 1 : 0); gl.uniform4f(u.uFlA, fl.amp, fl.freq, fl.lean, fl.u); gl.uniform4f(u.uFlB, fl.dx ?? 1, fl.dy ?? 0, fl.bump || 0, fl.bumpC || 0);
    const ov = new Float32Array(12), ova = new Float32Array(12), ovb = new Float32Array(12), ovv = [0, 0, 0];
    S.overlays.forEach((o, i) => { ov.set([o.front, o.back, o.phase, o.on ? 1 : 0], i * 4); ova.set([o.amp, o.freq, o.lean, o.u], i * 4); ovb.set([o.dx ?? 1, o.dy ?? 0, o.bump || 0, o.bumpC || 0], i * 4); ovv[i] = o.vel || 0; });
    gl.uniform4fv(u.uOv, ov); gl.uniform4fv(u.uOvA, ova); gl.uniform4fv(u.uOvB, ovb); gl.uniform3f(u.uOvV, ovv[0], ovv[1], ovv[2]);
    const bb = new Float32Array(32 * 4); const nbb = Math.min(32, (S.bubbles || []).length);
    for (let i = 0; i < nbb; i++) bb.set(S.bubbles[i], i * 4);
    gl.uniform4fv(u.uBub, bb); gl.uniform1i(u.uNBub, nbb);
    gl.uniform1f(u.uFloorY, S.floorY); gl.uniform1f(u.uHorizon, S.horizon);
    gl.uniform4f(u.uRip, S.rip.x, S.rip.y, S.rip.age, S.rip.amp);
    if (u.uMbw) gl.uniform1f(u.uMbw, S.mbw || 0);
    const ln = S.lens || [0, 0, 1, 1, 0, 0, 1, 0];
    if (u.uLens) { gl.uniform4f(u.uLens, ln[0], ln[1], ln[2], ln[3]); gl.uniform4f(u.uLens2, ln[4], ln[5], ln[6], ln[7]); }
    const sw = S.sw || [0, 0, 1, 0]; if (u.uSw) gl.uniform4f(u.uSw, sw[0], sw[1], sw[2], sw[3]);
    { const r = S.ring || [0, 0, 0, 0]; if (u.uRing) gl.uniform4f(u.uRing, r[0], r[1], r[2], r[3]);
      const c = S.crown || [0, 0, 0, 0]; if (u.uCrown) gl.uniform4f(u.uCrown, c[0], c[1], c[2], c[3]);
      const q = S.par || [0, 0, 0, 0]; if (u.uPar) gl.uniform4f(u.uPar, q[0], q[1], q[2], q[3]);
      if (u.uCaus) gl.uniform1f(u.uCaus, S.caus || 0); }   // r2
    gl.uniform4f(u.uKey, S.key.x, S.key.y, S.key.glint, S.key.glintAmp);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sdfT); gl.uniform1i(u.uTex, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, backT); gl.uniform1i(u.uBack, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function post(S, typeCanvas) {
    // ---------- bright pass ----------
    gl.bindFramebuffer(gl.FRAMEBUFFER, brF); gl.viewport(0, 0, bw, bh);
    gl.useProgram(P.bright.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, hdrT); gl.uniform1i(P.bright.u.uSrc, 0);
    gl.uniform2f(P.bright.u.uTexel, 1 / W, 1 / H);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, brT); gl.generateMipmap(gl.TEXTURE_2D);
    // ---------- post ----------
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
    const pp = P.post; gl.useProgram(pp.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, hdrT); gl.uniform1i(pp.u.uHdr, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, brT); gl.uniform1i(pp.u.uBloom, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, typeT);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, typeCanvas);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.uniform1i(pp.u.uType, 2);
    gl.uniform2f(pp.u.uRes, W, H); gl.uniform1f(pp.u.uFrame, S.frame); gl.uniform1f(pp.u.uBloomAmt, S.bloom); gl.uniform1f(pp.u.uFlash, S.flash || 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.finish();
  }
  return { gl, setSDF, render };
}
