// ISOPOLIS — scene construction + pure-time update.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as A from './anim.js';
import { LAYER_GLOW, LAYER_BG } from './render.js';

export const PAL = {
  bgTop: '#EEEAFC', bgMid: '#DAD3F7', bgLow: '#C4BAEF', dot: '#A79EE2',
  grass: ['#94DFBD', '#8CDBB6', '#9DE3C4', '#86D6B0'], grassDeep: '#74CBA3',
  plaza: '#F4F1FD', plaza2: '#ECE8FB', road: '#8781D0', mark: '#FBFAFF', water: '#8CC6FF',
  white: '#FBFAFF', peach: '#FFC4AC', sky: '#A8D2FF', mint: '#B7ECD6', lilac: '#D9D1FA', butter: '#FFE6A1',
  coral: '#FF9E86', deepSky: '#74A9F2', soil1: '#FFFFFF', soil2: '#CBC3F3', soil3: '#B2A8EC', soil4: '#9F95E1',
  clay: '#F1EEFA', clayWin: '#D0D4EE',
  clayGrass: '#E6E2F2', clayRoad: '#CFCBE6', clayWater: '#DDE3F4', clayPlaza: '#D9D1FA', clayPlaza2: '#D2C9F7',
  voidK: ['#EDE9F9', '#E0DBF5', '#D5CEF0'], voidOn: ['#E4D8FF', '#C5B2FC', '#A58CF0'],
  winOff: '#98ACEE', winOn: '#FFF0C8', data: '#62F0F2', ink: '#2C2960',
  leaf: ['#7FD3A6', '#93DDB5', '#6CC79A', '#A9E6C4'], blossom: '#FFB9A3', lilacLeaf: '#C9BDF6', trunk: '#C9A48F',
};
const C = (h) => new THREE.Color(h);

// 12 x 12 layout, row = j (+Z, screen left-down), column = i (+X, screen right-down)
const MAP = [
  'o..t.f..t...', // round 2: turbine (0,0) removed ('o' = bare grass): it sat on the CORE's screen column
  '.f.....f..ww',
  '..rrrrrrrrww',
  't.rbbbbbbrww',
  '..rbbppbbrw.',
  'f.rbpccpbr.f',
  '..rbpccpbr.h',
  'ssrbbppbbrh.',
  'ssrbbbbbbr.h',
  '..rrrrrrrrhf',
  'h.hfh.hfh..f',
  '.hfh.hfh.hf.',
];
const N = 12;
const tx = (i) => i - 5.5, tz = (j) => j - 5.5;

// ------------------------------------------------------------------ geometry / material helpers
const gcache = new Map();
function rbox(w, h, d, r = 0.05, seg = 2) {
  const k = `rb${w.toFixed(3)}_${h.toFixed(3)}_${d.toFixed(3)}_${r}_${seg}`;
  if (!gcache.has(k)) { const g = new RoundedBoxGeometry(w, h, d, seg, r); g.translate(0, h / 2, 0); gcache.set(k, g); }
  return gcache.get(k);
}
function cyl(rt, rb, h, seg = 32) {
  const k = `cy${rt}_${rb}_${h}_${seg}`;
  if (!gcache.has(k)) { const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1); g.translate(0, h / 2, 0); gcache.set(k, g); }
  return gcache.get(k);
}
const mcache = new Map();
function std(hex, o = {}) {
  const k = `${hex}_${o.rough ?? 0.72}_${o.env ?? 0.35}_${o.emissive ?? ''}_${o.ei ?? 1}_${o.metal ?? 0}`;
  if (!mcache.has(k)) {
    mcache.set(k, new THREE.MeshStandardMaterial({
      color: C(hex), roughness: o.rough ?? 0.72, metalness: o.metal ?? 0, envMapIntensity: o.env ?? 0.35,
      emissive: o.emissive ? C(o.emissive) : new THREE.Color(0), emissiveIntensity: o.ei ?? 1,
    }));
  }
  return mcache.get(k);
}
function mesh(geo, mat, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow; m.receiveShadow = true;
  return m;
}

// ------------------------------------------------------------------ window shader (object-space facade)
const WIN_VERT_PARS = 'varying vec3 vObj; varying vec3 vObjN;\n';
const WIN_FRAG_PARS = /* glsl */`
uniform float uTime, uLit0, uFlash, uStyle, uFloorH, uColW, uSeed, uLitFrac, uEmit, uBaseY;
uniform vec3 uSize, uWinOff, uWinOn, uClay, uClayWin; uniform float uGrow, uCyl, uSeam;
varying vec3 vObj; varying vec3 vObjN;
float hsh(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
`;
const WIN_FRAG_MAIN = /* glsl */`
float wMask = 0.0; vec3 wEmit = vec3(0.0);
// clay -> colour: when the ignition pulse reaches the building, colour climbs the facade with a scan line
float fy = vObj.y + uBaseY;
float fAge = uTime - uFlash;
float ff = fAge * 20.0;
float fill = fAge < 0.0 ? 0.0 : 1.0 - smoothstep(ff - 0.12, ff, fy);
float fline = fAge < 0.0 ? 0.0 : exp(-pow((fy - ff) * 12.0, 2.0)) * (1.0 - smoothstep(0.0, 0.2, fAge - (uBaseY + uSize.y) / 20.0));
diffuseColor.rgb = mix(uClay, diffuseColor.rgb, fill);
wEmit += fline * vec3(0.55, 1.0, 1.0) * 1.1;
{
  // blueprint edge: 1-2 px cyan outline on freshly grown walls, held while they grow, gone ~0.4 s later
  float gA = uTime - uGrow - 0.033;
  if (gA > 0.0 && fAge < 0.4) {
    float edy = min(vObj.y, uSize.y - vObj.y);
    float edv = uCyl > 0.5 ? 1e3 : max(uSize.x * 0.5 - abs(vObj.x), uSize.z * 0.5 - abs(vObj.z));
    // round 2: top faces only get their outline (before, the whole cap face read as 'edge' while the walls grew)
    float ee = abs(vObjN.y) > 0.6 ? (uCyl > 0.5 ? uSize.x * 0.5 - length(vObj.xz) : min(uSize.x * 0.5 - abs(vObj.x), uSize.z * 0.5 - abs(vObj.z))) : min(edy, edv);
    float ew = fwidth(ee);
    float eline = 1.0 - smoothstep(ew * 0.55, ew * 1.45, ee);
    float eenv = (gA < 0.35 ? 1.0 : 0.25 + 0.75 * exp(-(gA - 0.35) / 0.14)) * (1.0 - fill);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.38, 0.94, 0.95), eline * eenv * 0.7);
    wEmit += eline * eenv * vec3(0.38, 0.94, 0.95) * 1.2;
  }
}
{
  vec3 an = abs(vObjN);
  if (an.y < 0.6) {
    bool fx = an.x > an.z;
    float u = fx ? vObj.z : vObj.x;
    float fw = fx ? uSize.z : uSize.x;
    float v = vObj.y;
    float face = fx ? (vObjN.x > 0. ? 0. : 1.) : (vObjN.z > 0. ? 2. : 3.);
    float mx = min(0.11, fw * 0.12), my0 = 0.18, my1 = 0.12;
    float uu = u + fw * 0.5 - mx; float span = fw - 2. * mx;
    float nc = max(1.0, floor(span / uColW + 0.5));
    float cw = span / nc;
    float cu = uu / cw; float ci = floor(cu); float fu = cu - ci;
    float nr = max(1.0, floor((uSize.y - my0 - my1) / uFloorH));
    float fh = (uSize.y - my0 - my1) / nr;
    float rv = (v - my0) / fh; float ri = floor(rv); float fv = rv - ri;
    float insideU = uStyle > 0.5 && uStyle < 1.5 ? 1.0 : step(0., uu) * step(uu, span);
    float inside = insideU * step(0., rv) * step(rv, nr);
    vec2 dq = vec2(fwidth(cu), fwidth(rv)) * 0.9;
    float wx, wy;
    if (uStyle < 0.5) {
      wx = smoothstep(0.24 - dq.x, 0.24 + dq.x, fu) * (1. - smoothstep(0.76 - dq.x, 0.76 + dq.x, fu));
      wy = smoothstep(0.3 - dq.y, 0.3 + dq.y, fv) * (1. - smoothstep(0.84 - dq.y, 0.84 + dq.y, fv));
    } else if (uStyle < 1.5) {
      wx = 1.;
      ci = floor(atan(vObj.z, vObj.x) * 1.9);
      wy = smoothstep(0.34 - dq.y, 0.34 + dq.y, fv) * (1. - smoothstep(0.8 - dq.y, 0.8 + dq.y, fv));
      // round 2 (CORE): once the colour scan passes, the thick dormant band narrows to a 3-4 px lit seam on the ink body
      if (uSeam > 0.5) wy = mix(wy, smoothstep(0.47 - dq.y, 0.47 + dq.y, fv) * (1. - smoothstep(0.61 - dq.y, 0.61 + dq.y, fv)), fill);
    } else {
      wx = smoothstep(0.32 - dq.x, 0.32 + dq.x, fu) * (1. - smoothstep(0.68 - dq.x, 0.68 + dq.x, fu));
      wy = smoothstep(0.1 - dq.y, 0.1 + dq.y, fv) * (1. - smoothstep(0.9 - dq.y, 0.9 + dq.y, fv));
    }
    wMask = wx * wy * inside;
    float h = hsh(vec3(ci, ri, face + uSeed));
    float tOn = uLit0 + ri * 0.045 + h * 0.3;
    float on = smoothstep(tOn, tOn + 0.04, uTime) * step(h, uLitFrac);
    float pulse = step(uFlash, uTime);
    float tP = uFlash + ri * 0.012 + h * 0.05;
    on = max(on, smoothstep(tP, tP + 0.03, uTime) * step(h, max(uLitFrac, 0.86)));
    float flash = pulse * exp(-max(uTime - tP, 0.0) * 8.0) * step(tP, uTime);
    vec3 wc = mix(mix(uClayWin, uWinOn * 0.9, on), mix(uWinOff, uWinOn * 0.9, on), fill);
    diffuseColor.rgb = mix(diffuseColor.rgb, wc, wMask);
    float chase = uSeam > 0.5 ? 0.35 + 0.65 * pow(0.5 + 0.5 * cos(6.2832 * (fy * 0.4 - uTime * 0.5)), 3.0) : 1.0; // slow 2 s upward chase
    wEmit += wMask * (uWinOn * on * uEmit * chase + vec3(0.75, 1.0, 1.0) * flash * 0.75);
  }
}
`;
function winMat(U, hex, size, style = 0, o = {}) {
  const m = new THREE.MeshStandardMaterial({ color: C(hex), roughness: o.rough ?? 0.68, metalness: 0, envMapIntensity: o.env ?? 0.4 });
  const u = {
    uLit0: { value: 99 }, uFlash: { value: 99 }, uSize: { value: new THREE.Vector3(...size) }, uStyle: { value: style },
    uFloorH: { value: o.floorH ?? 0.3 }, uColW: { value: o.colW ?? 0.22 }, uSeed: { value: o.seed ?? 0.5 },
    uWinOff: { value: C(o.winOff ?? PAL.winOff) }, uWinOn: { value: C(o.winOn ?? PAL.winOn) }, uLitFrac: { value: o.litFrac ?? 0.7 }, uEmit: { value: o.emit ?? 0.28 }, uBaseY: { value: o.baseY ?? 0 },
    uClay: { value: C(o.clay ?? PAL.clay) }, uClayWin: { value: C(o.clayWin ?? PAL.clayWin) }, uGrow: { value: o.grow ?? 99 }, uCyl: { value: o.cyl ?? 0 }, uSeam: { value: o.seam ?? 0 },
  };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, { uTime: U.uTime });
    sh.vertexShader = WIN_VERT_PARS + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position; vObjN = normal;');
    sh.fragmentShader = WIN_FRAG_PARS + sh.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + WIN_FRAG_MAIN)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.28, wMask);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += wEmit;');
  };
  m.customProgramCacheKey = () => 'win-v6';
  return m;
}

// plain material that stays clay-white until the ignition pulse reaches it (+ delay)
function clayMat(U, hex, o = {}) {
  const m = new THREE.MeshStandardMaterial({ color: C(hex), roughness: o.rough ?? 0.6, metalness: 0, envMapIntensity: o.env ?? 0.35 });
  const u = { uFlash: { value: 99 }, uDelay: { value: o.delay ?? 0 }, uClay: { value: C(PAL.clay) } };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, { uTime: U.uTime });
    sh.fragmentShader = 'uniform float uTime, uFlash, uDelay; uniform vec3 uClay;\n' + sh.fragmentShader.replace('#include <color_fragment>',
      '#include <color_fragment>\ndiffuseColor.rgb = mix(uClay, diffuseColor.rgb, smoothstep(uFlash + uDelay, uFlash + uDelay + 0.05, uTime));');
  };
  m.customProgramCacheKey = () => 'clay-v1';
  return m;
}

// soil with strata bands (object space y)
function soilMat(U) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, envMapIntensity: 0.3 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.c1 = { value: C(PAL.soil1) }; sh.uniforms.c2 = { value: C(PAL.soil2) };
    sh.uniforms.c3 = { value: C(PAL.soil3) }; sh.uniforms.c4 = { value: C(PAL.soil4) };
    sh.vertexShader = 'varying vec3 vObj;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = 'uniform vec3 c1,c2,c3,c4; varying vec3 vObj;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float y = vObj.y; float aa = fwidth(y) * 0.8;
      vec3 col = c4;
      col = mix(col, c3, smoothstep(-0.95 - aa, -0.95 + aa, y));
      col = mix(col, c2, smoothstep(-0.62 - aa, -0.62 + aa, y));
      col = mix(col, c1, smoothstep(-0.2 - aa, -0.2 + aa, y));
      diffuseColor.rgb = col;`);
  };
  m.customProgramCacheKey = () => 'soil-v1';
  return m;
}

// ------------------------------------------------------------------ path along a rounded rectangle loop
function loopPath(a, rc) {
  const st = 2 * (a - rc), arc = Math.PI / 2 * rc, seg = st + arc, L = 4 * seg;
  // counter-clockwise when seen from above (+Y): start at (a, 0, -(a-rc)) heading +z
  const corners = [[a - rc, a - rc], [-(a - rc), a - rc], [-(a - rc), -(a - rc)], [a - rc, -(a - rc)]];
  const starts = [[a, -(a - rc)], [a - rc, a], [-a, a - rc], [-(a - rc), -a]];
  const dirs = [[0, 1], [-1, 0], [0, -1], [1, 0]];
  return {
    L,
    at(s) {
      s = ((s % L) + L) % L;
      const k = Math.floor(s / seg), r = s - k * seg;
      if (r < st) {
        const [sx, sz] = starts[k], [dx, dz] = dirs[k];
        return { x: sx + dx * r, z: sz + dz * r, ang: Math.atan2(dx, dz) };
      }
      const th = (r - st) / rc; // angle travelled on the corner
      const [cx, cz] = corners[k];
      const a0 = [0, Math.PI / 2, Math.PI, -Math.PI / 2][k]; // start angle (from +x toward +z)
      const ang = a0 + th;
      const dxz = [-Math.sin(ang), Math.cos(ang)];
      return { x: cx + rc * Math.cos(ang), z: cz + rc * Math.sin(ang), ang: Math.atan2(dxz[0], dxz[1]) };
    },
  };
}

// ------------------------------------------------------------------ build
export function buildWorld(renderer, cues, opts = {}) {
  const scene = new THREE.Scene();
  const U = { uTime: { value: 0 } };
  // growth front: screen-x (iso) -> time, piecewise linear (cues.sweep)
  const SW = cues.sweep;
  const sxOf = (x, z) => (x - z) / Math.SQRT2;
  const front = (sx) => {
    for (let k = 1; k < SW.length; k++) if (sx <= SW[k][0] || k === SW.length - 1) {
      const [a, ta] = SW[k - 1], [b, tb] = SW[k];
      return ta + (tb - ta) * A.clamp((sx - a) / (b - a), 0, 1.2);
    }
    return SW[SW.length - 1][1];
  };
  const updaters = [];
  const onUpdate = (f) => updaters.push(f);

  // environment for soft specular
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;

  // --- camera: true isometric
  const VH = 18, aspect = 16 / 9;
  const camera = new THREE.OrthographicCamera(-VH * aspect / 2, VH * aspect / 2, VH / 2, -VH / 2, 1, 400);
  const DIR = new THREE.Vector3(1, 1, 1).normalize();
  const camRight = new THREE.Vector3(1, 0, -1).normalize();
  const camUp = new THREE.Vector3(-1, 2, -1).normalize();

  // --- lights
  const hemi = new THREE.HemisphereLight(C('#F6F3FF'), C('#C9BFF0'), 0.75);
  scene.add(hemi);
  const sunDir0 = new THREE.Vector3(-0.42, 1.0, 0.62).normalize();
  const sun = new THREE.DirectionalLight(C('#FFF3E6'), 2.25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera; sc.left = -20; sc.right = 20; sc.top = 20; sc.bottom = -20; sc.near = 1; sc.far = 90;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.018;
  scene.add(sun); scene.add(sun.target);
  const fill = new THREE.DirectionalLight(C('#DCE4FF'), 0.3);
  fill.position.set(6, 3, -2); scene.add(fill);
  // round 2: clay-phase light (warm key x1.2, denser contact shadows, lavender fill) eases into the hero light after the wave
  const SUN_H = C('#FFF3E6'), SUN_K = C('#FFF6EC'), HEMI_G = C('#C9BFF0'), HEMI_GK = C('#B6A7EE'), FILL_H = C('#DCE4FF'), FILL_K = C('#CDBFFF');

  // --- background (screen quad: gradient + iso dot floor + island floor shadow)
  const bgU = {
    uInvVP: { value: new THREE.Matrix4() }, uFwd: { value: DIR.clone().negate() },
    uTop: { value: C(PAL.voidOn[0]) }, uMid: { value: C(PAL.voidOn[1]) }, uLow: { value: C(PAL.voidOn[2]) }, uDot: { value: C(PAL.dot) },
    uTopK: { value: C(PAL.voidK[0]) }, uMidK: { value: C(PAL.voidK[1]) }, uLowK: { value: C(PAL.voidK[2]) }, uVoidK: { value: 0 }, uWaveT: { value: 99 }, uWaveC: { value: new THREE.Vector2() },
    uFloorY: { value: -7.5 }, uOff: { value: new THREE.Vector2() }, uShadowC: { value: new THREE.Vector2() },
    uShadow: { value: 0 }, uDots: { value: 1 }, uTime: U.uTime, uZoom: { value: 1 }, uRipC: { value: new THREE.Vector2(0, 0) }, uRipT: { value: 99 }, uRipV: { value: 12 }, uRipD: { value: 8 }, uHot: { value: C(PAL.data) },
  };
  const bgMat = new THREE.ShaderMaterial({
    uniforms: bgU, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vNdc; void main(){ vNdc = position.xy; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
    fragmentShader: /* glsl */`
      uniform mat4 uInvVP; uniform vec3 uFwd; uniform vec3 uTop, uMid, uLow, uDot, uHot; uniform float uFloorY, uShadow, uDots, uZoom, uTime, uRipT, uRipV, uRipD; uniform vec2 uRipC;
      uniform vec2 uOff, uShadowC; varying vec2 vNdc;
      uniform vec3 uTopK, uMidK, uLowK; uniform float uVoidK, uWaveT; uniform vec2 uWaveC;
      float sdRoundBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      void main(){
        vec2 uv = vNdc * 0.5 + 0.5;
        float wa = uTime - uWaveT;
        float wr = length((vNdc - uWaveC) * vec2(1.7778, 1.0));
        float front = wa > 0.0 ? 0.15 + wa * 5.5 : -1.0;
        float on = 1.0 - smoothstep(front - 0.35, front, wr);
        float kk = uVoidK * (1.0 - on);
        vec3 cOn = mix(mix(uLow, uMid, smoothstep(0.0, 0.55, uv.y)), uTop, smoothstep(0.5, 1.0, uv.y));
        vec3 cK = mix(mix(uLowK, uMidK, smoothstep(0.0, 0.55, uv.y)), uTopK, smoothstep(0.5, 1.0, uv.y));
        vec3 col = mix(cOn, cK, kk);
        vec3 topC = mix(uTop, uTopK, kk);
        // soft light pool behind the island
        vec2 q = vNdc; q.x *= 1.7778;
        col = mix(col, topC * 1.03, 0.35 * exp(-dot(q - vec2(0.15, 0.1), q - vec2(0.15, 0.1)) * 0.9));
        col += uHot * exp(-pow((wr - front + 0.12) * 6.0, 2.0)) * 0.16 * exp(-max(wa, 0.0) * 2.2) * step(0.0, wa);
        // iso floor
        vec4 p = uInvVP * vec4(vNdc, -1.0, 1.0); p.xyz /= p.w;
        float tt = (uFloorY - p.y) / uFwd.y; vec3 w = p.xyz + uFwd * tt;
        vec2 g = w.xz + uOff;
        vec2 cc = g - floor(g + 0.5);
        float dd = length(cc);
        float aa = fwidth(dd) * 1.2 + 0.004;
        float ra = uTime - uRipT;
        vec2 rq = abs(floor(g + 0.5) - uRipC);
        float rr = max(rq.x, rq.y);
        // round 2: one cyan ping from the title to the island's floor shadow: 5 px dots at 70 % on the front, 0.5 s wake
        float dR = rr - ra * uRipV;
        float ring = ra > 0.0 ? (dR > 0.0 ? exp(-pow(dR * 1.4, 2.0)) : exp(dR / (uRipV * 0.5))) * (1.0 - smoothstep(uRipD + 1.0, uRipD + 4.0, ra * uRipV)) : 0.0;
        float r = mix(0.032 / sqrt(max(uZoom, 0.5)), 2.5 / (60.0 * uZoom), clamp(ring, 0.0, 1.0));
        float dotm = 1.0 - smoothstep(r - aa, r + aa, dd);
        float fade = exp(-dot(w.xz, w.xz) * 0.0035);
        col = mix(col, mix(uDot, uHot, clamp(ring * 1.5, 0.0, 1.0)), dotm * max(0.55 * fade, ring * 0.7) * uDots);
        // r2s2 bookend: the ping re-draws the opening's cyan blueprint grid (1.2 px lines) on its front only, so the end frame
        // answers the first frame. Lines run through the dots (integer g), like the opening blueprint crosses.
        float lineRing = ra > 0.0 ? exp(-pow(dR * 0.9, 2.0)) * (1.0 - smoothstep(uRipD + 0.5, uRipD + 3.0, ra * uRipV)) : 0.0;
        vec2 ce = abs(fract(g) - 0.5);
        float ld = 0.5 - max(ce.x, ce.y);
        float lw = 0.6 / (60.0 * uZoom); float la = fwidth(ld) * 1.0 + 1e-4;
        float lm = 1.0 - smoothstep(lw - la, lw + la, ld);
        col = mix(col, uHot, lm * lineRing * 0.5 * uDots);
        // floor shadow of the floating island
        float sd = sdRoundBox(w.xz - uShadowC, vec2(5.0), 1.8);
        float sh = 1.0 - smoothstep(-2.2, 2.8, sd);
        float core = 1.0 - smoothstep(-2.6, 0.9, sd);
        col = mix(col, col * vec3(0.70, 0.68, 0.88), (0.55 * sh + 0.4 * core) * uShadow);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const bgQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat);
  bgQuad.frustumCulled = false; bgQuad.renderOrder = -1000; bgQuad.layers.set(LAYER_BG);
  scene.add(bgQuad);

  // ================================================================= ISLAND
  const island = new THREE.Group(); scene.add(island);
  const ringT = cues.rings;
  const tiles = [];
  const R = A.rng(7);
  const cell = (i, j) => (j >= 0 && j < N && i >= 0 && i < N ? MAP[j][i] : ' ');
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const ch = cell(i, j);
    const dx = i - 5.5, dz = j - 5.5;
    const ring = Math.max(Math.abs(dx), Math.abs(dz)) - 0.5;
    const ang = (Math.atan2(dz, dx) / (2 * Math.PI) + 1) % 1;
    const tl = ringT[ring] + ang * 0.07 + (R() - 0.5) * 0.02;
    let radial;
    if (Math.abs(Math.abs(dx) - Math.abs(dz)) < 0.01) radial = new THREE.Vector3(Math.sign(dx), 0, Math.sign(dz)).normalize();
    else if (Math.abs(dx) > Math.abs(dz)) radial = new THREE.Vector3(Math.sign(dx), 0, 0);
    else radial = new THREE.Vector3(0, 0, Math.sign(dz));
    const axis = new THREE.Vector3(0, 1, 0).cross(radial).normalize();
    let type = 'grass';
    if (ch === 'r') type = 'road'; else if ('pbc'.includes(ch)) type = 'plaza'; else if (ch === 'w') type = 'water';
    tiles.push({ i, j, ch, type, x: tx(i), z: tz(j), tl, axis, ring, rot0: -(1.25 + R() * 0.3) });
  }
  // blueprint: the OS draws the 12x12 plan first; tiles snap onto it
  const bpMat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uA: { value: cues.blueprint[0] }, uB: { value: cues.blueprint[1] }, uCol: { value: C(PAL.data) }, uHot: { value: C('#FFFFFF') } },
    transparent: true, depthWrite: false,
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */`
      uniform float uTime, uA, uB; uniform vec3 uCol, uHot; varying vec3 vW;
      void main(){
        float r = max(abs(vW.x), abs(vW.z));
        float u = clamp((uTime - uA) / (uB - uA), 0.0, 1.0);
        float R = 1.9 + 4.3 * (1.0 - pow(1.0 - u, 2.0));
        vec2 g = abs(fract(vW.xz + 0.5) - 0.5);
        float lw = fwidth(vW.x);
        float line = max(1.0 - smoothstep(lw * 0.8, lw * 1.8, g.x), 1.0 - smoothstep(lw * 0.8, lw * 1.8, g.y));
        // cross ticks at intersections
        vec2 c = abs(vW.xz - floor(vW.xz + 0.5));
        float tick = (1.0 - smoothstep(lw * 1.3, lw * 2.4, min(c.x, c.y))) * step(max(c.x, c.y), 0.11);
        float border = 1.0 - smoothstep(lw * 1.4, lw * 2.6, abs(r - 6.0));
        float inside = 1.0 - smoothstep(R - 0.05, R, r);
        float frontGlow = exp(-pow((r - R) * 3.0, 2.0)) * (1.0 - u * 0.6);
        float head = exp(-pow((r - R) * 6.0, 2.0)) * (1.0 - u * 0.7);
        float a = (line * 0.8 + tick * 1.0 + border * 1.0) * inside * (r < 6.02 ? 1.0 : 0.0);
        a += head * 0.22 * (r < 6.02 ? 1.0 : 0.0);
        a *= 1.0 - smoothstep(1.55, 1.85, uTime);
        vec3 col = mix(uCol, uHot, clamp(frontGlow * 1.2 + head, 0.0, 1.0));
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0) * 0.95);
      }`,
  });
  const blueprint = new THREE.Mesh(new THREE.PlaneGeometry(12.6, 12.6).rotateX(-Math.PI / 2), bpMat);
  blueprint.position.y = -0.338; blueprint.layers.set(LAYER_GLOW); island.add(blueprint);
  onUpdate((T) => { blueprint.visible = T < 1.9; });

  const tileGeo = new RoundedBoxGeometry(0.955, 0.34, 0.955, 2, 0.075);
  const tileMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0, envMapIntensity: 0.3 });
  const waterMat = new THREE.MeshStandardMaterial({ color: C(PAL.water), roughness: 0.14, metalness: 0, envMapIntensity: 1.0 });
  // stylised pond: drifting broken wave dashes + slow tonal swell on the top faces (island-local coords, pure in uTime)
  waterMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime;
    sh.vertexShader = 'varying vec3 vWq; varying float vNy;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvec4 wq4 = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nwq4 = instanceMatrix * wq4;\n#endif\nvWq = wq4.xyz; vNy = normal.y;');
    sh.fragmentShader = 'uniform float uTime; varying vec3 vWq; varying float vNy;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec2 q = vWq.xz; float t = uTime;
        float top = smoothstep(0.75, 0.97, -vNy) * step(0.001, vFK.y); // round 2: the water face is the tile's underside
        float w1 = sin((q.x * 0.8 + q.y * 1.0) * 7.0 - t * 2.2 + sin(q.x * 2.1 - q.y * 1.7 + t * 0.9) * 1.4);
        float br = smoothstep(0.42, 0.78, sin(q.x * 3.1 - q.y * 2.3 + t * 0.6 + 1.7) * 0.5 + 0.5);
        float w2 = sin((q.x * 1.1 - q.y * 0.35) * 11.0 - t * 3.1 + 2.0);
        float br2 = smoothstep(0.6, 0.9, sin(q.x * 4.3 + q.y * 3.7 - t * 0.8) * 0.5 + 0.5);
        float dash = max(smoothstep(0.88, 0.97, w1) * br, smoothstep(0.93, 0.99, w2) * br2 * 0.6);
        float swell = sin(q.x * 1.3 + q.y * 0.9 + t * 0.5) * 0.5 + 0.5;
        diffuseColor.rgb *= mix(1.0, 0.93 + 0.1 * swell, top);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.97, 0.99, 1.0), dash * top * 0.75);
      }`);
  };
  waterMat.customProgramCacheKey = () => 'water-v1';
  const land = tiles.filter((t) => t.type !== 'water'), wet = tiles.filter((t) => t.type === 'water');
  const tileGeoW = tileGeo.clone();
  const tileIM = new THREE.InstancedMesh(tileGeo, tileMat, land.length);
  const waterIM = new THREE.InstancedMesh(tileGeoW, waterMat, wet.length);
  // round 2: two-faced tiles. The top (+y) is clay, the underside (-y) carries the colour; the hero wave flips empty tiles
  // onto their coloured face, the rest repaint under the hop. Per instance: clay colour, [flip mode, colour k], landing time.
  for (const [g, n] of [[tileGeo, land.length], [tileGeoW, wet.length]]) {
    g.setAttribute('aClay', new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aFK', new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2));
    g.setAttribute('aLand', new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
  }
  const TILE_FACE_GLSL = /* glsl */`#include <color_fragment>
      vec3 tEmit = vec3(0.0);
      {
        vec3 cF = diffuseColor.rgb;
        float up = smoothstep(0.3, 0.75, vTN.y), dn = smoothstep(0.3, 0.75, -vTN.y);
        vec3 side = mix(vClay, cF, vFK.y);
        vec3 fl = mix(mix(side, vClay, up), mix(vClay, cF, step(0.001, vFK.y)), dn);
        diffuseColor.rgb = vFK.x > 0.5 ? fl : mix(vClay, cF, vFK.y);
        // landing rim: 2 px cyan outline on the clay face, decays over ~6 frames after contact
        float ed = abs(0.385 - max(abs(vTP.x), abs(vTP.z)));
        float ew = fwidth(ed);
        float la = uTimeT - vLand;
        float rim = (1.0 - smoothstep(ew * 0.8, ew * 1.9, ed)) * smoothstep(0.9, 0.99, vTN.y) * step(0.0, la) * exp(-max(la, 0.0) / 0.075);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.38, 0.94, 0.95), rim * 0.85);
        tEmit = rim * vec3(0.38, 0.94, 0.95) * 1.3;
      }`;
  for (const m of [tileMat, waterMat]) {
    const prev = m.onBeforeCompile, k0 = m.customProgramCacheKey.call(m);
    m.onBeforeCompile = (sh, r) => {
      prev.call(m, sh, r);
      sh.uniforms.uTimeT = U.uTime;
      sh.vertexShader = 'attribute vec3 aClay; attribute vec2 aFK; attribute float aLand;\nvarying vec3 vClay; varying vec2 vFK; varying float vLand; varying vec3 vTN; varying vec3 vTP;\n' +
        sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvClay = aClay; vFK = aFK; vLand = aLand; vTN = normal; vTP = position;');
      sh.fragmentShader = 'uniform float uTimeT; varying vec3 vClay; varying vec2 vFK; varying float vLand; varying vec3 vTN; varying vec3 vTP;\n' + sh.fragmentShader
        .replace('#include <color_fragment>', TILE_FACE_GLSL)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += tEmit;');
    };
    m.customProgramCacheKey = () => k0 + '|faces2';
  }
  for (const im of [tileIM, waterIM]) { im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; island.add(im); }
  land.forEach((t, k) => {
    let col;
    if (t.type === 'grass') col = PAL.grass[Math.floor(A.hash(t.i * 13 + t.j * 7) * 4)];
    else if (t.type === 'road') col = PAL.road;
    else col = (t.i + t.j) % 2 ? PAL.plaza : PAL.plaza2;
    let clay = t.type === 'grass' ? PAL.clayGrass : t.type === 'road' ? PAL.clayRoad : ((t.i + t.j) % 2 ? PAL.clayPlaza : PAL.clayPlaza2);
    if (t.type === 'plaza') col = (t.i + t.j) % 2 ? '#FFF0DA' : '#FFE7CB';
    if (t.ch === 'c') { col = PAL.ink; clay = PAL.ink; }
    t.col = C(col); t.clay = C(clay);
    tileIM.setColorAt(k, t.col);
    t.im = tileIM; t.k = k;
  });
  wet.forEach((t, k) => { t.col = C(PAL.water); t.clay = C(PAL.clayWater); waterIM.setColorAt(k, t.col); t.im = waterIM; t.k = k; });
  waterMat.color.set('#ffffff');
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _off = new THREE.Matrix4().makeTranslation(0, 0.17, 0);
  const FLIP_D = 5 / 30;
  function tileMatrix(t, T) {
    if (t.flip && T > t.ta) {
      // hero flip: 180 deg about the axis parallel to the CORE-facing edge (inner edge rises first), 5 frames,
      // easeOutBack 1.4 (the overshoot is the micro-bounce), 0.15 u lift at mid-flip; pivot = tile centre
      const u = Math.min((T - t.ta) / FLIP_D, 1);
      _q.setFromAxisAngle(t.faxis, Math.PI * A.easeOutBack(u, 1.4) * t.fsgn);
      _s.set(1, 1, 1);
      _p.set(t.x, -0.17 + 0.15 * Math.sin(Math.PI * u), t.z);
      return _m.compose(_p, _q, _s);
    }
    const d = A.drop(T - t.tl, 0.3, 2.2, t.rot0, 0.075);
    if (!d.vis) { _m.makeScale(0, 0, 0); return _m; }
    _q.setFromAxisAngle(t.axis, d.rot);
    _s.set(d.sxz, d.sy, d.sxz);
    _p.set(t.x, -0.34 + d.y + pulseBump(t.x, t.z, T), t.z);
    _m.compose(_p, _q, _s).multiply(_off);
    return _m;
  }
  // tiny bump of the tiles when the hero pulse passes
  const PULSE_T = cues.drop - 0.015, PULSE_V = cues.pulse_speed, PULSE_R0 = 1.0; // wave is born at the CORE footprint edge
  function pulseBump(x, z, T) {
    const r = Math.max(Math.abs(x), Math.abs(z));
    const ta = PULSE_T + Math.max(r - PULSE_R0, 0) / PULSE_V;
    const u = T - ta;
    if (u < 0 || u > 0.35) return 0;
    return 0; // the hero hop now lives in the vertex shader (hopPatch) so every object on a tile rides the wave
  }
  for (const t of tiles) {
    const r = Math.max(Math.abs(t.x), Math.abs(t.z));
    t.ta = PULSE_T + Math.max(r - PULSE_R0, 0) / PULSE_V;
    const xd = Math.abs(t.x) >= Math.abs(t.z);
    t.faxis = xd ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    t.fsgn = xd ? -Math.sign(t.x) : Math.sign(t.z);
    t.flip = false; // decided once everything standing on the island exists (see "which tiles flip")
    const ga = t.im.geometry.attributes;
    ga.aClay.setXYZ(t.k, t.clay.r, t.clay.g, t.clay.b); ga.aLand.setX(t.k, t.tl);
  }
  onUpdate((T) => {
    // round 2: tiles land clay-side up (no drain); at the hero wave empty tiles flip onto their coloured face,
    // tiles carrying objects repaint as they hop
    for (const t of tiles) {
      t.im.setMatrixAt(t.k, tileMatrix(t, T));
      const k = t.flip ? A.clamp((T - t.ta) / FLIP_D) : A.smooth(A.inv(t.ta, t.ta + 0.06, T));
      t.im.geometry.attributes.aFK.setXY(t.k, t.flip ? 1 : 0, k);
    }
    tileIM.instanceMatrix.needsUpdate = true; waterIM.instanceMatrix.needsUpdate = true;
    tileGeo.attributes.aFK.needsUpdate = true; tileGeoW.attributes.aFK.needsUpdate = true;
  });

  // --- soil body (extrudes downward once the tiles are in)
  const soil = new THREE.Group(); island.add(soil);
  const sm = soilMat(U);
  const s1 = mesh(new RoundedBoxGeometry(12.0, 1.3, 12.0, 4, 0.16).translate(0, -0.65, 0), sm);
  const s2 = mesh(new RoundedBoxGeometry(9.2, 0.9, 9.2, 4, 0.2).translate(0, -0.45, 0), std(PAL.soil4, { rough: 0.9 }));
  s2.position.y = -1.3;
  const s3 = mesh(new RoundedBoxGeometry(6.0, 0.8, 6.0, 4, 0.22).translate(0, -0.4, 0), std('#8F85D6', { rough: 0.9 }));
  s3.position.y = -2.2;
  soil.add(s1, s2, s3);
  soil.position.y = -0.345;
  onUpdate((T) => {
    const u = A.easeOutCubic(A.inv(cues.soil, cues.soil + 0.45, T));
    const u2 = A.easeOutCubic(A.inv(cues.soil + 0.15, cues.soil + 0.6, T));
    const u3 = A.easeOutCubic(A.inv(cues.soil + 0.3, cues.soil + 0.75, T));
    s1.scale.set(1, Math.max(u, 1e-4), 1); s1.visible = u > 0;
    s2.position.y = -1.3 * u; s2.scale.set(1, Math.max(u2, 1e-4), 1); s2.visible = u2 > 0;
    s3.position.y = -1.3 * u - 0.9 * u2; s3.scale.set(1, Math.max(u3, 1e-4), 1); s3.visible = u3 > 0;
  });

  // --- road markings (dashes along the loop, drawn on as a sweep)
  const roadLoop = loopPath(3.5, 0.5);
  const dashGeo = new THREE.BoxGeometry(0.2, 0.012, 0.045).translate(0, 0.006, 0);
  const nD = 44;
  const dashIM = new THREE.InstancedMesh(dashGeo, std(PAL.mark, { rough: 0.6 }), nD);
  dashIM.receiveShadow = true; dashIM.frustumCulled = false; island.add(dashIM);
  onUpdate((T) => {
    for (let k = 0; k < nD; k++) {
      const s = (k + 0.5) / nD * roadLoop.L;
      const p = roadLoop.at(s);
      const u = A.easeOutCubic(A.inv(cues.roads + k * 0.008, cues.roads + k * 0.008 + 0.18, T));
      _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.ang + Math.PI / 2);
      _s.set(u, u > 0.001 ? 1 : 0, u > 0.001 ? 1 : 0); _p.set(p.x, 0.001, p.z);
      _m.compose(_p, _q, _s); dashIM.setMatrixAt(k, _m);
    }
    dashIM.instanceMatrix.needsUpdate = true;
  });

  // ================================================================= growth helpers
  const WALL = (tau) => A.spring(tau, 14.8, 0.61, 0); // round 2: peak at ~8 frames, 9 % overshoot
  let TGv = 0; // growth time: 90 deg shutter for the scale channels (set in update)
  function growState(T, t0) {
    const tau = T - t0;
    // base slab drops in 0.1 s before t0
    let bd;
    if (tau < -0.1) bd = { y: 0, sy: 1, sxz: 0, vis: 0 };
    else if (tau < 0) { const u = (tau + 0.1) / 0.1; bd = { y: 0, sy: 1, sxz: 0.12 + 0.88 * A.easeOutCubic(u), vis: 1 }; }
    else bd = A.drop(tau, 0.1, 0.3, 0, 0.03);
    const wall = tau > 1 / 30 ? WALL(tau - 1 / 30) : 0;
    const rl = cues.roof_lag;
    const rd = A.drop(tau - rl, 0.1, 0.3, 0, 0.025);
    return { bd, wall, rd, tau };
  }

  // generic building: sections [{w,d,h,col,style,colW,floorH}], roof {col, h, details}
  const buildings = [];
  const flashDelay = (x, z) => PULSE_T + Math.max(Math.max(Math.abs(x), Math.abs(z)) - PULSE_R0, 0) / PULSE_V;
  function makeBuilding(def) {
    const g = new THREE.Group();
    g.position.set(def.x, 0, def.z);
    island.add(g);
    const base = mesh(rbox(def.bw, 0.07, def.bd, 0.03), std(def.baseCol || '#E6E1F7', { rough: 0.8 }));
    g.add(base);
    const walls = new THREE.Group(); walls.position.y = 0.07; g.add(walls);
    let y = 0; const mats = []; const clayMats = [];
    for (const s of def.sections) {
      let m;
      if (s.shape === 'cyl') {
        m = mesh(cyl(s.w / 2, s.w / 2, s.h, 40), winMat(U, s.col, [s.w, s.h, s.w], 1, { floorH: s.floorH ?? 0.28, seed: def.seed + y, litFrac: 0.45, baseY: y, cyl: 1, grow: def.t0 }));
      } else {
        m = mesh(rbox(s.w, s.h, s.d, s.r ?? 0.05), winMat(U, s.col, [s.w, s.h, s.d], s.style ?? 0, { floorH: s.floorH ?? 0.3, colW: s.colW ?? 0.22, seed: def.seed + y, litFrac: s.litFrac ?? 0.7, baseY: y, grow: def.t0 }));
      }
      m.position.y = y;
      mats.push(m.material);
      walls.add(m);
      if (s.ledge) {
        const lm = clayMat(U, s.ledge, { rough: 0.7, delay: (y + s.h) / 9 }); clayMats.push(lm);
        const l = mesh(rbox(s.w + 0.06, 0.05, (s.d ?? s.w) + 0.06, 0.02), lm);
        l.position.y = y + s.h - 0.02; walls.add(l);
      }
      y += s.h;
    }
    const H = y;
    const roof = new THREE.Group(); g.add(roof);
    const top = def.sections[def.sections.length - 1];
    if (def.roofShape !== 'none') {
      const rm = clayMat(U, def.roofCol, { rough: 0.6, delay: H / 9 }); clayMats.push(rm);
      if (top.shape === 'cyl') roof.add(mesh(cyl(top.w / 2 + 0.04, top.w / 2 + 0.04, 0.08, 40), rm));
      else roof.add(mesh(rbox(top.w + 0.06, 0.08, top.d + 0.06, 0.035), rm));
    }
    const details = new THREE.Group(); details.position.y = 0.08; roof.add(details);
    (def.details || []).forEach((d) => details.add(d));
    const lit0 = def.t0 + 0.42;
    for (const m of mats) { m.userData.u.uLit0.value = lit0; m.userData.u.uFlash.value = flashDelay(def.x, def.z); }
    for (const m of clayMats) m.userData.u.uFlash.value = flashDelay(def.x, def.z);
    const b = { ...def, g, base, walls, roof, details, H, mats };
    buildings.push(b);
    return b;
  }
  onUpdate((T) => {
    for (const b of buildings) {
      if (b.custom) continue;
      const st = growState(TGv, b.t0);
      const vis = st.bd.vis;
      b.g.visible = !!vis;
      if (!vis) continue;
      b.base.position.y = st.bd.y; b.base.scale.set(st.bd.sxz, st.bd.sy, st.bd.sxz);
      b.walls.visible = st.wall > 0.002;
      const w = Math.max(st.wall, 1e-4);
      const pulse = pulseBump(b.x, b.z, T) * 0.5;
      b.walls.scale.set(1 - 0.06 * Math.max(0, st.wall - 1), w * (1 + pulse), 1 - 0.06 * Math.max(0, st.wall - 1));
      b.walls.visible = st.wall > 0.002;
      b.walls.position.y = 0.07 + st.bd.y;
      const topY = 0.07 + b.H * w * (1 + pulse);
      b.roof.visible = st.rd.vis > 0;
      b.roof.position.y = topY + st.rd.y;
      b.roof.scale.set(st.rd.sxz, st.rd.sy, st.rd.sxz);
      // rooftop details pop after the cap
      const dp = A.spring(TGv - b.t0 - cues.roof_lag - 0.05, 24, 0.5, 10);
      b.details.scale.setScalar(Math.max(dp, 1e-4)); b.details.visible = dp > 0.001;
    }
  });

  // rooftop detail factories
  const acUnit = (x, z, s = 1) => { const m = mesh(rbox(0.16 * s, 0.09 * s, 0.12 * s, 0.025), std('#E7E3F6', { rough: 0.6 })); m.position.set(x, 0, z); return m; };
  const mast = (x, z, h = 0.5) => {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    g.add(mesh(cyl(0.012, 0.018, h, 8), std('#E9E6F7', { rough: 0.5 })));
    const l = mesh(new THREE.SphereGeometry(0.03, 12, 8), std('#FF7A6A', { emissive: '#FF6B5B', ei: 2.2 }), false);
    l.position.y = h; g.add(l);
    return g;
  };
  const garden = (w, d) => {
    const g = new THREE.Group();
    g.add(mesh(rbox(w, 0.04, d, 0.015), std(PAL.grassDeep, { rough: 0.9 })));
    for (let k = 0; k < 3; k++) {
      const s = mesh(new THREE.SphereGeometry(0.07, 14, 10), std(PAL.leaf[k % 4], { rough: 0.9 }));
      s.position.set((k - 1) * w * 0.28, 0.08, (k % 2 ? 0.1 : -0.08) * d); g.add(s);
    }
    return g;
  };
  const solarRoof = (w, d) => {
    const g = new THREE.Group();
    for (let a = 0; a < 2; a++) for (let c = 0; c < 2; c++) {
      const p = mesh(rbox(w * 0.4, 0.02, d * 0.36, 0.008), std('#5E7BD6', { rough: 0.3, env: 0.9 }));
      p.position.set((a - 0.5) * w * 0.46, 0.06, (c - 0.5) * d * 0.44); p.rotation.x = -0.35; g.add(p);
    }
    return g;
  };
  const helipad = (r) => {
    const g = new THREE.Group();
    g.add(mesh(cyl(r, r, 0.03, 40), std('#6E6AB0', { rough: 0.7 })));
    const ring = mesh(new THREE.TorusGeometry(r * 0.72, 0.012, 6, 48), std('#FFFFFF', { rough: 0.5 }), false);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.032; g.add(ring);
    const hb1 = mesh(new THREE.BoxGeometry(0.03, 0.01, 0.2), std('#FFFFFF'), false); hb1.position.set(-0.06, 0.035, 0);
    const hb2 = hb1.clone(); hb2.position.x = 0.06;
    const hb3 = mesh(new THREE.BoxGeometry(0.12, 0.01, 0.03), std('#FFFFFF'), false); hb3.position.y = 0.035;
    g.add(hb1, hb2, hb3);
    return g;
  };

  // ================================================================= DOWNTOWN
  const dt = cues.downtown;
  const lot = (i0, j0, wi, dj) => ({ x: tx(i0) + (wi - 1) / 2, z: tz(j0) + (dj - 1) / 2, fw: wi, fd: dj });
  const defs = [];
  const add = (id, l, o) => defs.push({ id, t0: dt[id], seed: defs.length * 3.1, ...l, bw: l.fw - 0.1, bd: l.fd - 0.1, ...o });
  // A: stepped landmark, back corner
  add('A', lot(3, 3, 2, 2), {
    sections: [
      { w: 1.62, d: 1.62, h: 1.25, col: PAL.white, ledge: PAL.lilac, colW: 0.2 },
      { w: 1.28, d: 1.28, h: 0.7, col: '#EAF3FF', style: 1, floorH: 0.25, ledge: PAL.white, litFrac: 0.45 },
      { w: 0.9, d: 0.9, h: 0.45, col: PAL.white, colW: 0.18 },
    ], roofCol: PAL.deepSky, details: [mast(0.15, -0.1, 0.35), acUnit(-0.2, 0.18)],
  });
  add('B', lot(5, 3, 1, 1), { sections: [{ w: 0.78, d: 0.78, h: 2.6, col: '#EAF3FF', style: 1, floorH: 0.24, litFrac: 0.45 }], roofCol: PAL.white, details: [acUnit(0.12, 0.1), mast(-0.18, -0.15, 0.4)] });
  add('C', lot(6, 3, 1, 1), { sections: [{ w: 0.78, d: 0.78, h: 2.6, col: PAL.peach }], roofCol: PAL.coral, details: [garden(0.5, 0.5)] });
  add('D', lot(7, 3, 2, 2), {
    sections: [{ shape: 'cyl', w: 1.5, h: 1.2, col: PAL.sky }, { shape: 'cyl', w: 1.16, h: 2.4, col: '#EAF3FF' }],
    roofCol: PAL.white, details: [helipad(0.34)],
  });
  add('E', lot(3, 5, 1, 1), { sections: [{ w: 0.78, d: 0.78, h: 2.5, col: PAL.peach, ledge: PAL.white }], roofCol: PAL.white, details: [solarRoof(0.66, 0.66)] });
  add('F', lot(3, 6, 1, 1), { sections: [{ w: 0.78, d: 0.78, h: 1.9, col: PAL.mint }], roofCol: PAL.white, details: [acUnit(0, 0), acUnit(0.2, -0.18, 0.8)] });
  add('G', lot(8, 5, 1, 1), { sections: [{ w: 0.78, d: 0.78, h: 2.3, col: PAL.mint, ledge: PAL.peach }], roofCol: PAL.coral, details: [garden(0.52, 0.52)] });
  add('H', lot(8, 6, 1, 1), { sections: [{ w: 0.78, d: 0.78, h: 1.7, col: PAL.butter }], roofCol: PAL.white, details: [solarRoof(0.66, 0.66)] });
  add('I', lot(3, 7, 2, 2), {
    sections: [{ w: 1.62, d: 1.62, h: 1.25, col: PAL.white, colW: 0.24, ledge: PAL.peach }, { w: 1.1, d: 1.1, h: 0.6, col: PAL.lilac }],
    roofCol: PAL.peach, details: [garden(0.8, 0.8)],
  });
  add('J', lot(5, 8, 1, 1), { sections: [{ w: 0.78, d: 0.78, h: 1.15, col: PAL.sky, floorH: 0.26 }], roofCol: PAL.white, details: [acUnit(0.1, 0.1)] });
  add('K', lot(6, 8, 1, 1), { sections: [{ w: 0.78, d: 0.78, h: 1.45, col: PAL.peach }], roofCol: PAL.white, details: [acUnit(-0.1, 0.12), acUnit(0.15, -0.12, 0.8)] });
  // L: data center + dome
  const dome = mesh(new THREE.SphereGeometry(0.52, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), std(PAL.white, { rough: 0.35, env: 0.8 }));
  dome.position.set(0.25, 0, 0.25);
  const domeRing = mesh(new THREE.TorusGeometry(0.52, 0.03, 8, 48), std(PAL.deepSky, { rough: 0.5 }));
  domeRing.rotation.x = Math.PI / 2; domeRing.position.set(0.25, 0.01, 0.25);
  add('L', lot(7, 7, 2, 2), {
    sections: [{ w: 1.66, d: 1.66, h: 0.72, col: PAL.lilac, style: 2, colW: 0.12, floorH: 0.5, litFrac: 0.9 }],
    roofCol: PAL.white, details: [dome, domeRing, acUnit(-0.5, -0.45), acUnit(-0.5, -0.15), acUnit(-0.2, -0.5)],
  });
  defs.forEach((d) => makeBuilding(d));

  // ================================================================= HOUSES (grow in symmetric pairs)
  const housesTiles = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (MAP[j][i] === 'h') housesTiles.push([i, j]);
  // order by distance from centre (outermost first), paired
  housesTiles.sort((a, b) => (Math.hypot(tx(b[0]), tz(b[1])) - Math.hypot(tx(a[0]), tz(a[1]))));
  const roofCols = [PAL.coral, PAL.deepSky, PAL.peach, '#B9A8F3'];
  const wallCols = [PAL.white, PAL.butter, PAL.lilac, PAL.mint, PAL.peach, PAL.sky];
  housesTiles.forEach(([i, j], k) => {
    const t0 = cues.houses[`${i},${j}`];
    const rot = (A.hash(i * 3 + j * 11) > 0.5) ? 0 : Math.PI / 2;
    const w = 0.52, d = 0.42, h = 0.36;
    const g = new THREE.Group();
    g.position.set(tx(i) + (A.hash(i + j) - 0.5) * 0.12, 0, tz(j) + (A.hash(i * j + 3) - 0.5) * 0.12);
    island.add(g);
    const base = mesh(rbox(0.66, 0.05, 0.56, 0.02), std(PAL.plaza, { rough: 0.8 }));
    base.rotation.y = rot; g.add(base);
    const walls = new THREE.Group(); walls.position.y = 0.05; walls.rotation.y = rot; g.add(walls);
    const wm = winMat(U, wallCols[k % wallCols.length], [w, h, d], 0, { floorH: 0.16, colW: 0.17, seed: k * 1.7, litFrac: 0.8, grow: t0 });
    walls.add(mesh(rbox(w, h, d, 0.03), wm));
    // gable roof
    const sh = new THREE.Shape(); sh.moveTo(-d / 2 - 0.05, 0); sh.lineTo(d / 2 + 0.05, 0); sh.lineTo(0, 0.24); sh.closePath();
    const rg = new THREE.ExtrudeGeometry(sh, { depth: w + 0.08, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2 });
    rg.translate(0, 0, -(w + 0.08) / 2); rg.rotateY(Math.PI / 2);
    const roof = new THREE.Group(); roof.rotation.y = rot; g.add(roof);
    const hrm = clayMat(U, roofCols[k % 4], { rough: 0.6, delay: 0.4 / 9 });
    roof.add(mesh(rg, hrm));
    const chim = mesh(rbox(0.06, 0.12, 0.06, 0.01), std(PAL.white)); chim.position.set(0.12, 0.1, 0.06); roof.add(chim);
    wm.userData.u.uLit0.value = t0 + 0.4; wm.userData.u.uFlash.value = flashDelay(g.position.x, g.position.z);
    hrm.userData.u.uFlash.value = flashDelay(g.position.x, g.position.z);
    buildings.push({ id: 'h' + k, x: g.position.x, z: g.position.z, t0, g, base, walls, roof, details: new THREE.Group(), H: h, mats: [wm], house: true });
  });

  // ================================================================= TREES (instanced, pop in)
  const treeSpots = [];
  const TR = A.rng(99);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const ch = MAP[j][i]; const x = tx(i), z = tz(j);
    if (ch === 'f') {
      const n = 3 + Math.floor(TR() * 2);
      for (let k = 0; k < n; k++) treeSpots.push({ x: x + (TR() - 0.5) * 0.62, z: z + (TR() - 0.5) * 0.62, s: 0.8 + TR() * 0.45, kind: TR() < 0.35 ? 1 : 0 });
    } else if (ch === 'p') {
      TR(); TR(); TR(); // round 2: plaza trees removed so the plaza tiles can flip at the hit (RNG calls kept: other trees stay put)
    } else if (ch === '.' && TR() < 0.55) {
      const n = 1 + Math.floor(TR() * 2);
      for (let k = 0; k < n; k++) treeSpots.push({ x: x + (TR() - 0.5) * 0.6, z: z + (TR() - 0.5) * 0.6, s: 0.65 + TR() * 0.4, kind: TR() < 0.3 ? 1 : 0 });
    } else if (ch === 'h' && TR() < 0.6) {
      treeSpots.push({ x: x + 0.34 * (TR() > 0.5 ? 1 : -1), z: z + 0.34 * (TR() > 0.5 ? 1 : -1), s: 0.6, kind: 0 });
    }
  }
  treeSpots.forEach((s, k) => {
    s.t0 = front(sxOf(s.x, s.z)) + 0.05 + A.hash(k * 5.3) * 0.12; // pops as the growth front passes
    const r = A.hash(k * 2.1);
    s.col = r < 0.1 ? PAL.blossom : r < 0.18 ? PAL.lilacLeaf : PAL.leaf[k % 4];
  });
  const roundT = treeSpots.filter((s) => s.kind === 0), coneT = treeSpots.filter((s) => s.kind === 1);
  const foliageGeo = new THREE.IcosahedronGeometry(0.16, 3).translate(0, 0.3, 0);
  const coneGeo = mergeGeometries([new THREE.ConeGeometry(0.15, 0.3, 20).translate(0, 0.3, 0), new THREE.ConeGeometry(0.12, 0.24, 20).translate(0, 0.44, 0)]);
  const trunkGeo = cyl(0.022, 0.03, 0.2, 8);
  const leafMat = std('#ffffff', { rough: 0.85, env: 0.3 });
  const mkIM = (geo, list, mat) => { const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)); im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; island.add(im); return im; };
  const roundIM = mkIM(foliageGeo, roundT, leafMat), coneIM = mkIM(coneGeo, coneT, leafMat);
  const trunkIM = mkIM(trunkGeo, treeSpots, std(PAL.trunk, { rough: 0.9 }));
  roundT.forEach((s, k) => roundIM.setColorAt(k, C(s.col)));
  coneT.forEach((s, k) => coneIM.setColorAt(k, C(s.kind ? PAL.leaf[(k + 2) % 4] : s.col)));
  onUpdate((T) => {
    const place = (im, list) => list.forEach((s, k) => {
      const p = A.spring(T - s.t0, 22, 0.45, 13) * s.s;
      const wob = Math.sin((T - s.t0) * 9) * Math.exp(-(T - s.t0) * 5) * 0.12 * (T > s.t0 ? 1 : 0);
      _q.setFromEuler(new THREE.Euler(wob, 0, wob * 0.6));
      _s.setScalar(Math.max(p, 1e-4)); _p.set(s.x, pulseBump(s.x, s.z, T), s.z);
      _m.compose(_p, _q, _s); im.setMatrixAt(k, _m);
    });
    place(roundIM, roundT); place(coneIM, coneT); place(trunkIM, treeSpots);
    roundIM.instanceMatrix.needsUpdate = coneIM.instanceMatrix.needsUpdate = trunkIM.instanceMatrix.needsUpdate = true;
  });

  // ================================================================= WIND TURBINES
  const turbines = [];
  const tSpots = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (MAP[j][i] === 't') tSpots.push([i, j]);
  tSpots.forEach(([i, j], k) => {
    const g = new THREE.Group(); g.position.set(tx(i), 0, tz(j)); island.add(g);
    const H = 2.3 + (k % 2) * 0.35;
    const mast = mesh(cyl(0.035, 0.06, H, 16), std(PAL.white, { rough: 0.5 }));
    g.add(mast);
    const head = new THREE.Group(); head.position.y = H; g.add(head);
    head.rotation.y = Math.PI / 4; // rotor faces the camera diagonal
    head.add(mesh(rbox(0.1, 0.1, 0.24, 0.04).translate(0, -0.05, -0.05), std(PAL.white, { rough: 0.5 })));
    const rotor = new THREE.Group(); rotor.position.z = 0.1; head.add(rotor);
    rotor.add(mesh(new THREE.SphereGeometry(0.055, 16, 12), std(PAL.coral, { rough: 0.5 })));
    for (let b = 0; b < 3; b++) {
      const bl = mesh(rbox(0.07, 0.95, 0.02, 0.01).translate(0, 0.02, 0), std(PAL.white, { rough: 0.45 }));
      bl.rotation.z = b * Math.PI * 2 / 3; rotor.add(bl);
    }
    turbines.push({ g, mast, head, rotor, H, t0: Math.round(front(sxOf(tx(i), tz(j))) / 0.125) * 0.125, ph: k * 0.9 });
  });
  onUpdate((T) => {
    for (const tb of turbines) {
      const tau = T - tb.t0;
      const s = A.spring(tau, 16, 0.6, 5);
      tb.g.visible = tau > 0;
      tb.mast.scale.set(1, Math.max(s, 1e-4), 1);
      tb.head.position.y = tb.H * s;
      const hp = A.spring(tau - 0.25, 20, 0.5, 10);
      tb.head.scale.setScalar(Math.max(hp, 1e-4));
      // spin: accelerates in, then constant (closed form: integral of speed ramp)
      const w = 4.2; const ramp = 0.8; const u = Math.max(0, tau - 0.3);
      const ang = u < ramp ? w * u * u / (2 * ramp) : w * (u - ramp / 2);
      tb.rotor.rotation.z = -ang - tb.ph;
    }
  });

  // ================================================================= SOLAR FIELD (panels flip up)
  const solar = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (MAP[j][i] === 's') {
    for (let a = 0; a < 2; a++) for (let c = 0; c < 2; c++) {
      const g = new THREE.Group(); g.position.set(tx(i) + (a - 0.5) * 0.46, 0, tz(j) + (c - 0.5) * 0.44); island.add(g);
      g.add(mesh(cyl(0.015, 0.015, 0.1, 6), std('#DCD7F2')));
      const p = new THREE.Group(); p.position.y = 0.1; g.add(p);
      p.add(mesh(rbox(0.38, 0.025, 0.3, 0.01).translate(0, -0.012, 0), std('#5E7BD6', { rough: 0.25, env: 1.0 })));
      const fr = mesh(rbox(0.4, 0.012, 0.32, 0.006).translate(0, -0.022, 0), std(PAL.white)); p.add(fr);
      solar.push({ g, p, t0: front(sxOf(g.position.x, g.position.z)) + a * 0.04 + c * 0.03 });
    }
  }
  onUpdate((T) => {
    for (const s of solar) {
      const u = A.spring(T - s.t0, 20, 0.5, 8);
      s.g.visible = T > s.t0; s.g.scale.setScalar(Math.max(Math.min(u * 1.2, 1), 1e-4));
      s.p.rotation.z = -0.5 * u; // tilt toward the sun
    }
  });

  // ================================================================= POND details (dock + ripples)
  const dock = mesh(rbox(0.9, 0.05, 0.22, 0.02), std('#E9D9CF', { rough: 0.8 }));
  dock.position.set(tx(10) - 0.1, 0.0, tz(3)); island.add(dock);
  onUpdate((T) => { const u = A.spring(T - 2.2, 22, 0.5, 9); dock.visible = T > 2.2; dock.scale.setScalar(Math.max(u, 1e-4)); });
  const rippleMat = new THREE.MeshBasicMaterial({ color: C('#FFFFFF'), transparent: true, opacity: 0.0, depthWrite: false });
  const ripples = [];
  for (let k = 0; k < 3; k++) {
    const r = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 48).rotateX(-Math.PI / 2), rippleMat.clone());
    r.position.set(tx(10) + 0.5, 0.004, tz(2) + 0.6 + k * 0.4); r.layers.set(LAYER_GLOW); island.add(r); ripples.push(r);
  }
  onUpdate((T) => {
    ripples.forEach((r, k) => {
      const ph = ((T * 0.45 + k / 3) % 1);
      const on = A.smooth(A.inv(1.8, 2.3, T));
      r.scale.setScalar(0.08 + ph * 0.32);
      r.material.opacity = 0.5 * (1 - ph) * on;
    });
  });

  // ================================================================= MONORAIL (pillars chain-grow, beam, train)
  const railOff = -0.42; // over the inner curb
  const rail = loopPath(3.5 + railOff, 0.5 + railOff);
  const RAIL_H = 1.25;
  const pillars = [];
  const nP = 20;
  for (let k = 0; k < nP; k++) {
    const s = k / nP * rail.L;
    const p = rail.at(s);
    const g = new THREE.Group(); g.position.set(p.x, 0, p.z); island.add(g);
    g.add(mesh(cyl(0.035, 0.05, RAIL_H, 14), std('#ECE8FA', { rough: 0.55 })));
    pillars.push({ g, t0: cues.rail + k * 0.022 });
  }
  // beam: build from many short segments so it can be drawn on
  const nB = 96;
  const beamIM = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 0.075, 0.12, 1, 0.025).translate(0, -0.04, 0), std('#E4DFF7', { rough: 0.5 }), nB);
  beamIM.castShadow = true; beamIM.receiveShadow = true; beamIM.frustumCulled = false; island.add(beamIM);
  const segL = rail.L / nB;
  onUpdate((T) => {
    for (const p of pillars) {
      const u = A.spring(T - p.t0, 20, 0.6, 7);
      p.g.visible = T > p.t0; p.g.scale.set(1, Math.max(u, 1e-4), 1);
    }
    for (let k = 0; k < nB; k++) {
      const s = (k + 0.5) * segL;
      const p = rail.at(s);
      const t0 = cues.rail + 0.15 + k * 0.0048;
      const u = A.easeOutCubic(A.inv(t0, t0 + 0.12, T));
      _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.ang - Math.PI / 2);
      _s.set(Math.max(u, 1e-4) * segL * 1.04, u > 0.001 ? 1 : 0, u > 0.001 ? 1 : 0); _p.set(p.x, RAIL_H + (1 - u) * 0.3, p.z);
      _m.compose(_p, _q, _s); beamIM.setMatrixAt(k, _m);
    }
    beamIM.instanceMatrix.needsUpdate = true;
  });
  // train
  const train = [];
  const carLen = 0.78;
  for (let k = 0; k < 3; k++) {
    const g = new THREE.Group(); island.add(g);
    const body = new THREE.Group(); g.add(body);
    body.add(mesh(rbox(carLen, 0.22, 0.24, 0.09).translate(0, 0.02, 0), std(PAL.white, { rough: 0.35, env: 0.8 })));
    const band = mesh(rbox(carLen - 0.1, 0.07, 0.25, 0.03).translate(0, 0.12, 0), std('#6D83DA', { rough: 0.2, env: 1.0, emissive: '#FFE39C', ei: 0 }));
    body.add(band);
    const stripe = mesh(rbox(carLen - 0.04, 0.025, 0.245, 0.01).translate(0, 0.05, 0), std(PAL.coral, { rough: 0.5 }));
    body.add(stripe);
    train.push({ g, body, band, k });
  }
  onUpdate((T) => {
    const t0 = cues.train;
    const tau = T - t0;
    // closed-form motion: ramp to cruise speed v over 0.8 s
    const v = 3.2, ramp = 0.8;
    const u = Math.max(0, tau);
    const dist = u < ramp ? v * u * u / (2 * ramp) : v * (u - ramp / 2);
    const s0 = rail.L * 0.62;
    const appear = A.spring(tau + 0.15, 22, 0.55, 8);
    train.forEach((c) => {
      const s = s0 + dist - c.k * (carLen + 0.05);
      const p = rail.at(s);
      c.g.position.set(p.x, RAIL_H + 0.0, p.z);
      c.g.rotation.y = p.ang - Math.PI / 2;
      c.g.visible = tau > -0.15;
      c.g.scale.setScalar(Math.max(appear, 1e-4));
      c.band.material.emissiveIntensity = T > PULSE_T ? 0.8 : 0;
    });
  });

  // ================================================================= CARS on the ring road
  const cars = [];
  const carCols = [PAL.coral, PAL.white, PAL.deepSky, PAL.butter, PAL.peach, '#B9A8F3', PAL.white, PAL.mint];
  const lanes = [loopPath(3.5 + 0.2, 0.5 + 0.2), loopPath(3.5 - 0.2, 0.5 - 0.2)];
  for (let k = 0; k < 10; k++) {
    const g = new THREE.Group(); island.add(g);
    const lane = k % 2;
    const col = carCols[k % carCols.length];
    const body = new THREE.Group(); g.add(body);
    body.add(mesh(rbox(0.3, 0.085, 0.15, 0.035).translate(0, 0.02, 0), std(col, { rough: 0.35, env: 0.7 })));
    body.add(mesh(rbox(0.16, 0.07, 0.13, 0.03).translate(-0.02, 0.1, 0), std('#E8EEFF', { rough: 0.15, env: 1.0 })));
    const hl = mesh(rbox(0.012, 0.022, 0.12, 0.006).translate(0.152, 0.055, 0), std('#FFFFFF', { emissive: '#FFF2C4', ei: 1.5 }), false);
    body.add(hl);
    cars.push({ g, body, lane, s0: (k / 10) * lanes[lane].L + A.hash(k) * 1.2, v: (lane ? -1 : 1) * (1.7 + A.hash(k * 3) * 0.5), t0: cues.cars + (k % 5) * 0.05 });
  }
  onUpdate((T) => {
    for (const c of cars) {
      const tau = T - c.t0;
      const ramp = 0.7, u = Math.max(0, tau);
      const dist = u < ramp ? c.v * u * u / (2 * ramp) : c.v * (u - ramp / 2);
      const p = lanes[c.lane].at(c.s0 + dist);
      c.g.position.set(p.x, pulseBump(p.x, p.z, T), p.z);
      c.g.rotation.y = p.ang - Math.PI / 2 + (c.v < 0 ? Math.PI : 0);
      const ap = A.spring(tau, 24, 0.5, 10);
      c.g.visible = tau > 0; c.g.scale.setScalar(Math.max(ap, 1e-4));
    }
  });

  // ================================================================= CORE TOWER (telescopes up)
  const tw = cues.tower;
  const core = new THREE.Group(); island.add(core);
  const coreBase = mesh(cyl(0.92, 0.95, 0.2, 48), std(PAL.white, { rough: 0.5 }));
  core.add(coreBase);
  const coreBaseRing = mesh(new THREE.TorusGeometry(0.93, 0.025, 8, 64), std('#FFFFFF', { emissive: PAL.data, ei: 0 }), false);
  coreBaseRing.rotation.x = Math.PI / 2; coreBaseRing.position.y = 0.2; core.add(coreBaseRing);
  const SH1 = 2.3, SH2 = 2.0, SH3 = 1.6, SHA = 1.2;
  const coreWin = (seed) => ({ floorH: 0.24, seed, litFrac: 0.0, winOn: '#7DF6F7', winOff: '#4A45A0', emit: 2.5, seam: 1, clay: PAL.ink, clayWin: '#6F69C8', rough: 0.34, env: 0.9, cyl: 1, grow: tw.seg1 });
  const seg1 = mesh(cyl(0.6, 0.66, SH1, 48), winMat(U, PAL.ink, [1.2, SH1, 1.2], 1, coreWin(91)));
  const seg2 = mesh(cyl(0.44, 0.44, SH2, 48), winMat(U, '#34307A', [0.88, SH2, 0.88], 1, { ...coreWin(92), clay: '#34307A', grow: tw.seg2 }));
  const seg3 = mesh(cyl(0.3, 0.3, SH3, 40), winMat(U, PAL.ink, [0.6, SH3, 0.6], 1, { ...coreWin(93), grow: tw.seg3 }));
  const cap3 = mesh(cyl(0.34, 0.34, 0.07, 40), std('#FFFFFF', { rough: 0.4, emissive: PAL.data, ei: 0.6 }));
  const antenna = mesh(cyl(0.02, 0.035, SHA, 12), std(PAL.white, { rough: 0.4 }));
  const beacon = mesh(new THREE.SphereGeometry(0.07, 20, 14), std('#FFFFFF', { emissive: PAL.data, ei: 0 }), false);
  const halo = mesh(new THREE.TorusGeometry(0.78, 0.022, 12, 96), std('#FFFFFF', { rough: 0.3, emissive: PAL.data, ei: 0 }), false);
  halo.rotation.x = Math.PI / 2;
  const halo2 = mesh(new THREE.TorusGeometry(0.62, 0.013, 10, 96), std('#FFFFFF', { rough: 0.3, emissive: PAL.data, ei: 0 }), false);
  halo2.rotation.x = Math.PI / 2;
  core.add(seg1, seg2, seg3, cap3, antenna, beacon, halo, halo2);
  for (const s of [seg1, seg2, seg3]) { s.material.userData.u.uLit0.value = tw.ring; s.material.userData.u.uFlash.value = PULSE_T; }
  onUpdate((T) => {
    const bd = A.drop(T - tw.base, 0.1, 0.35, 0, 0.04);
    core.visible = bd.vis > 0;
    coreBase.position.y = bd.y; coreBase.scale.set(bd.sxz, bd.sy, bd.sxz);
    const s1 = A.spring(T - tw.seg1, 17, 0.6, 5);
    const s2 = A.spring(T - tw.seg2, 17, 0.6, 5);
    const s3 = A.spring(T - tw.seg3, 17, 0.6, 5);
    const sa = A.spring(T - tw.antenna, 18, 0.55, 6);
    const y0 = 0.2 + bd.y;
    seg1.position.y = y0; seg1.scale.set(1, Math.max(s1, 1e-4), 1); seg1.visible = s1 > 0.002;
    const top1 = y0 + SH1 * s1;
    // segment 2 slides up out of segment 1
    seg2.position.y = top1 - SH2 + SH2 * s2 - 0.02; seg2.visible = s2 > 0.002 && s1 > 0.9;
    const top2 = seg2.position.y + SH2;
    seg3.position.y = top2 - SH3 + SH3 * s3 - 0.02; seg3.visible = s3 > 0.002;
    const top3 = seg3.position.y + SH3;
    cap3.position.y = top3; cap3.visible = s3 > 0.2;
    antenna.position.y = top3 + 0.07 - SHA + SHA * sa; antenna.visible = sa > 0.002;
    beacon.position.y = top3 + 0.07 + SHA * sa; beacon.visible = sa > 0.3;
    // halo rings assemble
    const hr = A.spring(T - tw.ring, 16, 0.5, 6);
    halo.visible = hr > 0.002; halo.scale.setScalar(Math.max(hr, 1e-4));
    halo.position.y = top1 + 0.35 + Math.sin(T * 2.2) * 0.04;
    const hr2 = A.spring(T - tw.ring - 0.1, 16, 0.5, 6);
    halo2.visible = hr2 > 0.002; halo2.scale.setScalar(Math.max(hr2, 1e-4));
    halo2.position.y = top2 + 0.25 + Math.sin(T * 2.2 + 1) * 0.04;
    // ignite at the drop
    const ig = T >= PULSE_T ? 1 : 0;
    const fl = ig * Math.exp(-(T - PULSE_T) * 3.0);
    beacon.material.emissiveIntensity = ig * (2.5 + 6 * fl) * (0.8 + 0.2 * Math.sin(T * 9));
    halo.material.emissiveIntensity = ig * (1.0 + 2.2 * fl);
    halo2.material.emissiveIntensity = ig * (0.8 + 1.8 * fl);
    coreBaseRing.material.emissiveIntensity = ig * (1.2 + 3 * fl);
    // anticipation: the CORE crouches (-6 % Y, +3 % XZ) 5.90-5.967, holds, then releases into a stretch on the hit
    const crouch = T < PULSE_T ? A.smooth(A.inv(5.90, 5.967, T)) : 0;
    const punch = ig * Math.exp(-(T - PULSE_T) * 6) * Math.cos((T - PULSE_T) * 26) * 0.07;
    core.scale.set(1 + 0.03 * crouch - punch * 0.45, 1 - 0.06 * crouch + punch, 1 + 0.03 * crouch - punch * 0.45);
  });
  const coreTop = () => new THREE.Vector3(0, 0.2 + SH1 + 0.35, 0);
  // reel v5 (read-only helper, unused by the default path): local-space top of the telescoping CORE stack as it is
  // posed for the last update(T) -- what a ball resting on the tower touches (base -> seg1 -> seg2 -> seg3 cap -> antenna tip).
  const coreStackTop = () => {
    let h = coreBase.position.y + 0.2 * coreBase.scale.y;
    if (seg1.visible) h = Math.max(h, seg1.position.y + SH1 * seg1.scale.y);
    if (seg2.visible) h = Math.max(h, seg2.position.y + SH2);
    if (seg3.visible) h = Math.max(h, seg3.position.y + SH3 + (cap3.visible ? 0.07 : 0));
    if (antenna.visible) h = Math.max(h, beacon.position.y);
    return h;
  };

  // ---- ignition: light column + air shockwave + halo nodes
  const glowMatBase = (col, extra = {}) => new THREE.ShaderMaterial({
    uniforms: { uI: { value: 0 }, uCol: { value: C(col) }, ...extra },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: 'uniform float uI; uniform vec3 uCol; varying vec2 vUv; varying vec3 vN; void main(){ float f = pow(abs(vN.z), 1.6) * pow(1.0 - vUv.y, 1.3); float a = uI * f; gl_FragColor = vec4(uCol * a, a); }',
  });
  const beamGeo = new THREE.CylinderGeometry(0.1, 0.16, 16, 32, 1, true).translate(0, 8, 0);
  const beam = new THREE.Mesh(beamGeo, glowMatBase('#F2FFFF')); beam.layers.set(LAYER_GLOW); beam.frustumCulled = false;
  const beam2 = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.26, 16, 32, 1, true).translate(0, 8, 0), glowMatBase(PAL.data)); beam2.layers.set(LAYER_GLOW); beam2.frustumCulled = false;
  core.add(beam, beam2);
  const shockMat = new THREE.MeshBasicMaterial({ color: C('#9FFBFF'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const shock = new THREE.Mesh(new THREE.RingGeometry(0.978, 1.0, 128).rotateX(-Math.PI / 2), shockMat); shock.layers.set(LAYER_GLOW); core.add(shock);
  const shock2 = new THREE.Mesh(new THREE.RingGeometry(0.96, 1.0, 128).rotateX(-Math.PI / 2), shockMat.clone()); shock2.layers.set(LAYER_GLOW); core.add(shock2);
  const nodes = new THREE.Group(); halo.add(nodes);
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * Math.PI * 2;
    const nd = mesh(new THREE.SphereGeometry(0.06, 14, 10), std('#FFFFFF', { rough: 0.3, emissive: PAL.data, ei: 1.6 }), false);
    nd.position.set(Math.cos(a) * 0.78, Math.sin(a) * 0.78, 0); nodes.add(nd);
  }
  onUpdate((T) => {
    const u = T - PULSE_T;
    const env = u < 0 ? 0 : (u < 0.012 ? u / 0.012 : Math.exp(-(u - 0.012) * 5.0));
    const topY = beacon.position.y;
    beam.position.y = topY; beam2.position.y = topY;
    const grow = A.easeOutCubic(A.inv(0, 0.05, u));
    beam.scale.set(1, Math.max(grow, 1e-3), 1); beam2.scale.set(1, Math.max(grow, 1e-3), 1);
    beam.material.uniforms.uI.value = env * 2.8 + (u > 0 ? 0.1 : 0);
    beam2.material.uniforms.uI.value = env * 0.4;
    beam.visible = beam2.visible = u > 0;
    const su = A.easeOutCubic(A.inv(0, 0.45, u));
    shock.visible = u > 0 && u < 0.45;
    shock.position.y = halo.position.y; shock.scale.setScalar(0.9 + su * 9.5);
    shock.material.opacity = Math.pow(1 - su, 1.8) * 0.95;
    const su2 = A.easeOutCubic(A.inv(0.06, 0.55, u));
    shock2.visible = u > 0.06 && u < 0.55;
    shock2.position.y = halo2.position.y; shock2.scale.setScalar(0.7 + su2 * 7.0);
    shock2.material.opacity = Math.pow(1 - su2, 1.8) * 0.55;
    // halo spin (closed form) + pre-glow before the drop
    halo.rotation.z = T * 1.2 + A.smooth(A.inv(5.7, 6.1, T)) * 2.5;
    const pre = A.smooth(A.inv(tw.ring + 0.05, PULSE_T, T));
    if (T < PULSE_T) { halo.material.emissiveIntensity = pre * 1.1; halo2.material.emissiveIntensity = pre * 0.8; }
    nodes.visible = halo.visible;
    // beacon pre-blinks
    if (T < PULSE_T && T > tw.antenna) {
      const bl = Math.max(Math.exp(-Math.pow((T - 5.625) * 30, 2)), Math.exp(-Math.pow((T - 5.875) * 30, 2)));
      beacon.material.emissiveIntensity = bl * 4;
    }
  });

  // ================================================================= HERO PULSE (ground light wave)
  const pulseU = { uTime: U.uTime, uT0: { value: PULSE_T }, uV: { value: PULSE_V }, uCol: { value: C(PAL.data) } };
  const pulseMat = new THREE.ShaderMaterial({
    uniforms: pulseU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */`
      uniform float uTime, uT0, uV; uniform vec3 uCol; varying vec3 vW;
      void main(){
        float r = max(abs(vW.x), abs(vW.z));
        float age = uTime - uT0;
        float rt = 1.0 + age * uV;
        float d = r - rt;
        vec2 g = abs(fract(vW.xz + 0.5) - 0.5);
        float lw = fwidth(vW.x) * 1.5;
        float line = max(1.0 - smoothstep(0.018, 0.018 + lw, g.x), 1.0 - smoothstep(0.018, 0.018 + lw, g.y));
        float band = exp(-d * d * 5.0);
        float edge = exp(-d * d * 70.0);
        float after = step(d, 0.0) * exp(d * 0.7) * exp(-age * 1.4);
        float a = edge * 1.0 + band * 0.08 + line * (band * 2.0 + after * 0.35);
        a *= step(0.0, age) * (1.0 - smoothstep(5.96, 6.08, r)) * (1.0 - smoothstep(0.7, 1.15, age));
        gl_FragColor = vec4(uCol * a, a);
      }`,
  });
  const pulse = new THREE.Mesh(new THREE.PlaneGeometry(12.2, 12.2).rotateX(-Math.PI / 2), pulseMat);
  pulse.position.y = 0.012; pulse.layers.set(LAYER_GLOW); island.add(pulse);
  onUpdate((T) => { pulse.visible = T > PULSE_T - 0.01 && T < PULSE_T + 1.75; });

  // ================================================================= DATA ARCS (core -> roofs)
  const arcs = [];
  const arcMatBase = {
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: /* glsl */`
      uniform float uTime, uT0, uDur, uSpeed, uPh; uniform vec3 uCol; varying vec2 vUv;
      void main(){
        float x = vUv.x;
        float grow = clamp((uTime - uT0) / uDur, 0.0, 1.0);
        grow = 1.0 - pow(1.0 - grow, 3.0);
        if (x > grow) discard;
        float head = exp(-pow((grow - x) * 14.0, 2.0)) * step(grow, 0.999);
        float p = fract(x * 3.0 - (uTime - uT0) * uSpeed + uPh);
        float dash = smoothstep(0.0, 0.08, p) * (1.0 - smoothstep(0.12, 0.3, p));
        float a = 0.28 + dash * 1.5 + head * 2.6;
        gl_FragColor = vec4(uCol * a, a);
      }`,
  };
  const arcTargets = buildings.filter((b) => !b.house);
  arcTargets.forEach((b, k) => {
    const top = new THREE.Vector3(b.x, 0.07 + b.H + 0.12, b.z);
    const from = new THREE.Vector3(0, 0.2 + 1.7 + 0.35, 0);
    const mid = from.clone().lerp(top, 0.5); mid.y = Math.max(from.y, top.y) + 1.2 + A.hash(k) * 0.6;
    const curve = new THREE.QuadraticBezierCurve3(from, mid, top);
    const geo = new THREE.TubeGeometry(curve, 72, 0.021, 8, false);
    const m = new THREE.ShaderMaterial({
      ...arcMatBase,
      uniforms: { uTime: U.uTime, uT0: { value: PULSE_T + 0.05 + k * 0.035 }, uDur: { value: 0.45 }, uSpeed: { value: 1.3 + A.hash(k * 7) * 0.6 }, uPh: { value: A.hash(k * 3) }, uCol: { value: C(PAL.data) } },
    });
    const mm = new THREE.Mesh(geo, m); mm.layers.set(LAYER_GLOW); mm.frustumCulled = false; island.add(mm);
    // landing ring on the roof
    const ringM = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.13, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: C(PAL.data), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    ringM.position.copy(top).y -= 0.1; ringM.layers.set(LAYER_GLOW); island.add(ringM);
    arcs.push({ mesh: mm, ring: ringM, t0: m.uniforms.uT0.value, dur: 0.45, b });
  });
  onUpdate((T) => {
    for (const a of arcs) {
      a.mesh.visible = T > a.t0;
      const tl = a.t0 + a.dur;
      const u = T - tl;
      a.ring.visible = u > 0;
      if (u > 0) {
        const ph = (u * 0.9) % 1;
        a.ring.scale.setScalar(1 + ph * 2.2);
        a.ring.material.opacity = (1 - ph) * 0.9;
      }
    }
  });

  // ================================================================= DRONES with packets (hop between roofs)
  const drones = [];
  const byId = Object.fromEntries(buildings.filter((b) => !b.house).map((b) => [b.id, b]));
  const routes = [
    { t0: 6.12, hops: ['L', 'G', 'C', 'K', 'E'] },
    { t0: 6.28, hops: ['L', 'E', 'J', 'H', 'F'] },
    { t0: 6.44, hops: ['I', 'H', 'F', 'G', 'J'] },
    { t0: 6.6, hops: ['D', 'K', 'I', 'C', 'H'] },
    { t0: 6.76, hops: ['L', 'F', 'G', 'J', 'K'] },
  ];
  const HOP = 1.05, DWELL = 0.32;
  routes.forEach((rt, k) => {
    const g = new THREE.Group(); island.add(g);
    const body = new THREE.Group(); body.scale.setScalar(1.9); g.add(body);
    body.add(mesh(rbox(0.14, 0.045, 0.14, 0.02), std(PAL.white, { rough: 0.4 })));
    for (let a = 0; a < 4; a++) {
      const ax = (a < 2 ? 1 : -1) * 0.1, az = (a % 2 ? 1 : -1) * 0.1;
      const arm = mesh(new THREE.BoxGeometry(0.1, 0.012, 0.012), std('#DAD5F0'));
      arm.position.set(ax / 2, 0.03, az / 2); arm.rotation.y = Math.atan2(-az, ax); body.add(arm);
      const r = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.006, 20), std('#CFC8F0', { rough: 0.4 }), false);
      r.position.set(ax, 0.045, az); body.add(r);
    }
    const eye = mesh(new THREE.SphereGeometry(0.02, 10, 8), std('#FFFFFF', { emissive: PAL.data, ei: 2.2 }), false);
    eye.position.set(0.075, 0.0, 0.0); body.add(eye);
    const line = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.1, 4).translate(0, -0.05, 0), std('#8E86C8'), false);
    body.add(line);
    const pkt = mesh(rbox(0.1, 0.1, 0.1, 0.022).translate(0, -0.1, 0), std([PAL.coral, PAL.butter, PAL.deepSky, PAL.peach, PAL.mint][k % 5], { rough: 0.6 }));
    pkt.position.y = -0.1; body.add(pkt);
    drones.push({ g, body, pkt, line, rt, k });
  });
  const roofPt = (id, dy) => { const b = byId[id]; return new THREE.Vector3(b.x, 0.07 + b.H + 0.08 + dy, b.z); };
  onUpdate((T) => {
    for (const d of drones) {
      const tau = T - d.rt.t0;
      d.g.visible = tau > -0.02;
      if (!d.g.visible) continue;
      const cyc = HOP + DWELL;
      const n = Math.min(d.rt.hops.length - 2, Math.floor(Math.max(0, tau) / cyc));
      const ph = Math.max(0, tau) - n * cyc;
      const a = roofPt(d.rt.hops[n], 0.34), b = roofPt(d.rt.hops[n + 1], 0.34);
      const u = A.easeInOutSine(A.clamp(ph / HOP));
      const p = a.clone().lerp(b, u);
      const arch = 0.55 + a.distanceTo(b) * 0.12;
      p.y += arch * Math.sin(Math.PI * u);
      // first take-off rises from the roof
      if (n === 0) p.y -= 0.25 * (1 - A.easeOutCubic(A.inv(0, 0.3, tau)));
      const dw = Math.max(0, ph - HOP);
      p.y += Math.sin(dw * 7 + d.k) * 0.025 * Math.min(1, dw * 4) + Math.sin(T * 3.1 + d.k * 2) * 0.012;
      d.g.position.copy(p);
      const heading = Math.atan2(b.x - a.x, b.z - a.z);
      d.g.rotation.y = heading - Math.PI / 2;
      // bank: pitch forward accelerating, back when braking
      d.body.rotation.z = -Math.sin(Math.PI * 2 * A.clamp(ph / HOP)) * 0.28 * (ph < HOP ? 1 : 0);
      // packet: carried during the hop, dropped on arrival, re-picked at the next take-off
      const dropT = Math.max(0, ph - HOP + 0.02);
      d.pkt.position.y = -0.1 - Math.min(dropT * dropT * 10, 0.3);
      d.pkt.visible = ph < HOP + 0.16;
      const pickup = A.spring(ph, 26, 0.5, 10);
      d.pkt.scale.setScalar(Math.max(n === 0 ? 1 : pickup, 1e-4));
      d.g.scale.setScalar(Math.max(A.spring(tau, 22, 0.55, 9), 1e-4));
    }
  });

  // ================================================================= CLOUDS (foreground, parallax 1.0)
  const cloudGeo = (() => {
    const parts = [[0, 0, 0, 0.55], [0.55, -0.08, 0.1, 0.42], [-0.55, -0.1, -0.05, 0.4], [0.2, 0.25, -0.1, 0.42], [-0.25, 0.18, 0.15, 0.38], [0.9, -0.2, 0, 0.28], [-0.9, -0.22, 0.05, 0.26]];
    const gs = parts.map(([x, y, z, r]) => new THREE.IcosahedronGeometry(r, 4).translate(x, y, z));
    const g = mergeGeometries(gs);
    const pos = g.attributes.position; // flatten the bottom
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) < -0.2) pos.setY(i, -0.2 + (pos.getY(i) + 0.2) * 0.35);
    g.computeVertexNormals();
    return g;
  })();
  const cloudMat = new THREE.MeshStandardMaterial({ color: C('#FFFFFF'), roughness: 0.95, envMapIntensity: 0.4, emissive: C('#F1EEFF'), emissiveIntensity: 0.25 });
  const clouds = [];
  // authored in camera-plane coordinates (sx right, sy up, world units); depth toward the camera
  const cloudDefs = opts.clouds;
  const fg = new THREE.Group(); scene.add(fg);
  const cR = new THREE.Vector3(1, 0, -1).normalize(), cU = new THREE.Vector3(-1, 2, -1).normalize();
  cloudDefs.forEach((c) => {
    const m = new THREE.Mesh(cloudGeo, cloudMat); m.castShadow = false; m.receiveShadow = false;
    m.scale.setScalar(c.s); fg.add(m); clouds.push({ m, ...c });
  });
  onUpdate((T) => {
    for (const c of clouds) {
      const sx = c.sx + T * c.v, sy = c.sy + Math.sin(T * 0.7 + c.sx) * 0.06;
      c.m.position.copy(cR).multiplyScalar(sx).addScaledVector(cU, sy).addScaledVector(DIR, 16);
    }
  });

  // ================================================================= BACKGROUND CUBES (parallax 0.6)
  const bgGroup = new THREE.Group(); scene.add(bgGroup);
  const bgCubes = [];
  const BR = A.rng(31);
  const bgCols = [PAL.lilac, PAL.white, PAL.sky, PAL.peach, PAL.mint];
  const spots = opts.bgCubes || [[-10, -3, -6], [9, -2, 8], [-8, 1.5, 9], [11, 0.5, -2], [-12, -1, 2], [6, -4, -11], [-3, -4, 12], [13, -3, 5], [-6, 2.5, -12], [2, -5, -13]];
  spots.forEach((p, k) => {
    const s = p[3] ?? (0.35 + BR() * 0.5);
    const m = mesh(rbox(s, s, s, s * 0.18).translate(0, -s / 2, 0), std(p[4] ?? bgCols[k % bgCols.length], { rough: 0.7 }), false);
    m.receiveShadow = false;
    bgGroup.add(m); bgCubes.push({ m, p, ph: BR() * 6, t0: 0.3 + BR() * 1.4 });
  });
  onUpdate((T) => {
    for (const c of bgCubes) {
      const a = A.spring(T - c.t0, 14, 0.6, 3);
      c.m.visible = T > c.t0;
      c.m.scale.setScalar(Math.max(a, 1e-4));
      c.m.position.set(c.p[0], c.p[1] + Math.sin(T * 1.1 + c.ph) * 0.12, c.p[2]);
      c.m.rotation.y = c.ph + T * 0.15;
    }
  });

  // ================================================================= HERO HOP (vertex shader, pure in uTime)
  const hopU = { uHopT: { value: PULSE_T }, uHopV: { value: PULSE_V } };
  const HOP_GLSL = `uniform float uTime; uniform float uHopT, uHopV;
vec2 hopAt(vec2 o) {
  float r = max(abs(o.x), abs(o.y));
  if (r < 1.02 || r > 6.6) return vec2(0.0);
  float u = uTime - (uHopT + (r - 1.0) / uHopV);
  if (u < 0.0 || u > 0.6) return vec2(0.0);
  float y; float q = 0.0;
  if (u < 0.1) { float a = u / 0.1; y = 1.0 - (1.0 - a) * (1.0 - a); q = -0.03 * sin(3.14159 * a); }
  else { float b = min((u - 0.1) / 0.1667, 1.0); float x = b - 1.0; y = 1.0 - (1.0 + 2.7 * x * x * x + 1.7 * x * x); }
  if (u > 0.16) q = 0.04 * sin(3.14159 * clamp((u - 0.16) / 0.26, 0.0, 1.0));
  return vec2(0.25 * y, q);
}
`;
  const HOP_PROJECT = `vec4 mvPosition = vec4( transformed, 1.0 );
vec4 hopO = vec4(0.0, 0.0, 0.0, 1.0);
#ifdef USE_INSTANCING
mvPosition = instanceMatrix * mvPosition; hopO = instanceMatrix * hopO;
#endif
vec4 hopW = modelMatrix * mvPosition; hopO = modelMatrix * hopO;
vec2 hq = hopAt(hopO.xz);
hopW.y = hopW.y * (1.0 - hq.y) + hq.x;
mvPosition = viewMatrix * hopW;
gl_Position = projectionMatrix * mvPosition;`;
  function hopPatch(m) {
    if (m.userData.hop) return; m.userData.hop = true;
    const prev = m.onBeforeCompile;
    const baseKey = m.customProgramCacheKey.call(m);
    m.onBeforeCompile = (sh, r) => {
      prev.call(m, sh, r);
      sh.uniforms.uTime = U.uTime; sh.uniforms.uHopT = hopU.uHopT; sh.uniforms.uHopV = hopU.uHopV;
      sh.vertexShader = HOP_GLSL + sh.vertexShader.replace('#include <project_vertex>', HOP_PROJECT);
    };
    m.customProgramCacheKey = () => baseKey + '|hop1';
    m.needsUpdate = true;
  }
  {
    const excluded = new Set();
    [core, ...drones.map((d) => d.g)].forEach((r) => r.traverse((o) => excluded.add(o)));
    const incl = new Set();
    island.traverse((o) => { if (o.isMesh && !excluded.has(o) && o.material && o.material.isMeshStandardMaterial) incl.add(o.material); });
    excluded.forEach((o) => { if (o.isMesh && incl.has(o.material)) o.material = o.material.clone(); });
    incl.forEach(hopPatch);
  }

  // round 2: which tiles flip at the hit: bare grass / plaza / pond tiles with nothing standing on them
  {
    const occ = new Set();
    const mark = (x, z) => occ.add(Math.round(x + 5.5) + ',' + Math.round(z + 5.5));
    treeSpots.forEach((q) => mark(q.x, q.z));
    pillars.forEach((q) => mark(q.g.position.x, q.g.position.z));
    mark(dock.position.x, dock.position.z); mark(dock.position.x - 0.45, dock.position.z); mark(dock.position.x + 0.45, dock.position.z);
    ripples.forEach((q) => mark(q.position.x, q.position.z));
    for (const t of tiles) t.flip = '.opw'.includes(t.ch) && !occ.has(t.i + ',' + t.j);
  }

  // ================================================================= update
  const pan = new THREE.Vector3();
  function setCamera(target, zoom) {
    camera.position.copy(target).addScaledVector(DIR, 120);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }
  // camera path: screen-space pan (sx, sy in world units along camRight / camUp), zoom
  const camKeys = opts.camKeys;
  function camAt(T) {
    const k = camKeys(T);
    return k;
  }
  function update(T, sub = { u: 0, v: 0 }, Tc, Tg) {
    U.uTime.value = T;
    TGv = Tg ?? T;
    const kc = 1 - A.smooth(A.inv(PULSE_T, PULSE_T + 0.4, T));
    sun.intensity = 2.25 * (1 + 0.2 * kc); sun.color.copy(SUN_H).lerp(SUN_K, kc);
    hemi.intensity = 0.75 * (1 - 0.3 * kc); hemi.groundColor.copy(HEMI_G).lerp(HEMI_GK, kc);
    fill.color.copy(FILL_H).lerp(FILL_K, kc); fill.intensity = 0.3 + 0.12 * kc;
    for (const f of updaters) f(T);
    // camera
    const k = camAt(Tc ?? T);
    const target = new THREE.Vector3().addScaledVector(camRight, k.x).addScaledVector(camUp, k.y);
    // project target onto the ground plane along DIR so the look-at stays on y=0 (pure translation anyway)
    setCamera(target, k.zoom);
    // parallax: fg (clouds) 1.0, city 0.8, bg 0.6  -> offsets relative to the city
    pan.copy(target);
    const flat = (v) => v.addScaledVector(DIR, -v.y / DIR.y); // same screen offset, but with y = 0
    fg.position.copy(pan).multiplyScalar(-0.25);
    bgGroup.position.copy(flat(pan.clone().multiplyScalar(0.25)));
    // bg floor offset (moves at 0.6)
    const pOff = bgGroup.position.clone().negate();
    bgU.uOff.value.set(pOff.x, pOff.z);
    bgU.uZoom.value = k.zoom;
    const invVP = new THREE.Matrix4().multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
    bgU.uInvVP.value.copy(invVP);
    // island floor shadow (projected along the sun)
    const fy = bgU.uFloorY.value;
    const sy = -1.5 - fy;
    bgU.uShadowC.value.set(0.9 - pOff.x, -0.9 - pOff.z);
    bgU.uShadow.value = A.smooth(A.inv(1.6, 2.4, T));
    bgU.uVoidK.value = 1; // round 2: lavender void (about 60 % of the final saturation) until the hero wave repaints it
    bgU.uWaveT.value = PULSE_T;
    const wc = new THREE.Vector3(0, 1.5, 0).project(camera); bgU.uWaveC.value.set(wc.x, wc.y);
    // island bob in the end
    island.position.y = Math.sin(Math.max(0, T - 8.6) * 1.6) * 0.06 * A.smooth(A.inv(8.6, 9.2, T));
    // sun jitter (soft shadows)
    const j = new THREE.Vector3(sub.u, 0, sub.v).multiplyScalar(0.045);
    const L = sunDir0.clone().add(new THREE.Vector3().addScaledVector(camRight, j.x).addScaledVector(new THREE.Vector3(0.62, 0.3, 0.42).normalize(), j.z)).normalize();
    sun.target.position.set(0, 0, 0);
    sun.position.copy(L).multiplyScalar(40);
    sun.target.updateMatrixWorld();
    sun.updateMatrixWorld();
  }

  return { hopPatch, scene, camera, update, U, buildings, byId, island, camRight, camUp, DIR, sunDir0, PAL, bgGroup, fg, onUpdate, sun, bgU,
    v5: { core, beacon, beam, coreStackTop, PULSE_T } };
}
