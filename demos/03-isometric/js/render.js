// Progressive accumulation renderer: N sub-renders per output frame, each with sub-pixel jitter (AA),
// jittered sun direction (soft area shadows), sub-frame time (motion blur) and a rotated SSAO kernel.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { rng } from './anim.js';

const LAYER_SOLID = 0, LAYER_GLOW = 1, LAYER_BG = 2;
export { LAYER_SOLID, LAYER_GLOW, LAYER_BG };

const aoVert = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const aoFrag = /* glsl */`
precision highp float;
uniform sampler2D tBeauty; uniform sampler2D tNormal; uniform sampler2D tDepth;
uniform mat4 uProj; uniform mat4 uProjInv;
uniform vec3 uKernel[16];
uniform float uRadius, uStrength, uWeight, uSeed, uBias;
varying vec2 vUv;
vec3 viewPosAt(vec2 uv, float d){ vec4 v = uProjInv * vec4(uv*2.0-1.0, d*2.0-1.0, 1.0); return v.xyz / v.w; }
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main(){
  vec4 beauty = texture2D(tBeauty, vUv);
  float d = texture2D(tDepth, vUv).x;
  float ao = 1.0;
  if (d < 0.99999) {
    vec3 P = viewPosAt(vUv, d);
    vec3 N = normalize(texture2D(tNormal, vUv).xyz * 2.0 - 1.0);
    float a = (ign(gl_FragCoord.xy) + uSeed) * 6.2831853;
    vec3 rv = vec3(cos(a), sin(a), 0.37);
    vec3 T = normalize(rv - N * dot(rv, N));
    vec3 B = cross(N, T);
    mat3 tbn = mat3(T, B, N);
    float occ = 0.0;
    for (int i = 0; i < 16; i++) {
      vec3 Q = P + tbn * uKernel[i] * uRadius;
      vec4 q = uProj * vec4(Q, 1.0);
      vec2 quv = q.xy / q.w * 0.5 + 0.5;
      float sd = texture2D(tDepth, quv).x;
      if (sd >= 0.99999) continue;
      vec3 S = viewPosAt(quv, sd);
      float range = smoothstep(0.0, 1.0, uRadius / max(abs(P.z - S.z), 1e-4));
      occ += (S.z >= Q.z + uBias ? 1.0 : 0.0) * range;
    }
    ao = clamp(1.0 - uStrength * occ / 16.0, 0.0, 1.0);
  }
  gl_FragColor = vec4(beauty.rgb * ao * uWeight, uWeight);
}`;

const finalFrag = /* glsl */`
precision highp float;
uniform sampler2D tAccum; uniform float uTime; uniform vec2 uRes; uniform float uExposure; uniform float uGrain;
uniform float uVignette; uniform vec3 uVigColor;
varying vec2 vUv;
vec3 neutral(vec3 color){
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  const float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  vec3 c = texture2D(tAccum, vUv).rgb * uExposure;
  // vignette in linear light, tinted
  vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y;
  float v = smoothstep(0.35, 1.25, length(q));
  c = mix(c, c * uVigColor, v * uVignette);
  c = neutral(c);
  c = toSRGB(clamp(c, 0.0, 1.0));
  // film grain (seeded by frame time) + triangular dither against banding
  vec2 px = gl_FragCoord.xy;
  float fr = floor(uTime * 30.0 + 0.5);
  float g = h12(px + fr * 37.17) + h12(px * 1.37 + fr * 11.3) - 1.0;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  c += g * uGrain * (0.6 + 0.8 * lum * (1.0 - lum));
  float dth = (h12(px + 0.5 + fr) - h12(px + 7.3 - fr)) / 255.0;
  c += dth;
  gl_FragColor = vec4(c, 1.0);
}`;

export class Accumulator {
  constructor(renderer, width, height) {
    this.r = renderer;
    this.W = width; this.H = height;
    const opts = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.rtNormal = new THREE.WebGLRenderTarget(width, height, { ...opts, depthTexture: new THREE.DepthTexture(width, height, THREE.FloatType) });
    this.rtNormal.depthTexture.minFilter = THREE.NearestFilter;
    this.rtNormal.depthTexture.magFilter = THREE.NearestFilter;
    this.rtBeauty = new THREE.WebGLRenderTarget(width, height, { ...opts, depthBuffer: true });
    this.rtAccum = new THREE.WebGLRenderTarget(width, height, { type: THREE.FloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    this.normalMat = new THREE.MeshNormalMaterial();
    this.aoMat = new THREE.ShaderMaterial({
      vertexShader: aoVert, fragmentShader: aoFrag,
      uniforms: {
        tBeauty: { value: this.rtBeauty.texture }, tNormal: { value: this.rtNormal.texture },
        tDepth: { value: this.rtNormal.depthTexture },
        uProj: { value: new THREE.Matrix4() }, uProjInv: { value: new THREE.Matrix4() },
        uKernel: { value: Array.from({ length: 16 }, () => new THREE.Vector3()) },
        uRadius: { value: 0.55 }, uStrength: { value: 1.05 }, uWeight: { value: 1 }, uSeed: { value: 0 }, uBias: { value: 0.015 },
      },
      depthTest: false, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
    });
    this.aoQuad = new FullScreenQuad(this.aoMat);
    this.finalMat = new THREE.ShaderMaterial({
      vertexShader: aoVert, fragmentShader: finalFrag,
      uniforms: {
        tAccum: { value: this.rtAccum.texture }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(width, height) },
        uExposure: { value: 1.0 }, uGrain: { value: 0.022 }, uVignette: { value: 0.22 }, uVigColor: { value: new THREE.Color(0.78, 0.74, 0.95) },
      },
      depthTest: false, depthWrite: false,
    });
    this.finalQuad = new FullScreenQuad(this.finalMat);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.28, 0.35, 1.6);
    this.kernels = [];
    const R = rng(1234);
    for (let s = 0; s < 64; s++) {
      const k = [];
      for (let i = 0; i < 16; i++) {
        // cosine-ish hemisphere, samples concentrated near the origin
        let x, y, z, l;
        do { x = R() * 2 - 1; y = R() * 2 - 1; z = R(); l = x * x + y * y + z * z; } while (l > 1 || l < 0.01);
        const v = new THREE.Vector3(x, y, z + 0.08).normalize();
        let sc = (i + R()) / 16; sc = 0.12 + 0.88 * sc * sc;
        k.push(v.multiplyScalar(sc));
      }
      this.kernels.push(k);
    }
  }

  // halton sequence for sub-pixel jitter
  static halton(i, b) { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; }

  /**
   * render one output frame
   * @param scene, camera
   * @param n number of sub-samples
   * @param setup(i, n, sub) -> called before each sub-render; must update the scene for the sub-sample time,
   *        the camera and the sun. sub = {jx, jy, u, v} (jitter px, disc sample)
   */
  frame(scene, camera, n, setup, t) {
    const r = this.r;
    const W = this.W, H = this.H;
    r.autoClear = false;
    r.setRenderTarget(this.rtAccum);
    r.setClearColor(0x000000, 0);
    r.clear(true, false, false);
    for (let i = 0; i < n; i++) {
      const jx = Accumulator.halton(i + 1, 2) - 0.5, jy = Accumulator.halton(i + 1, 3) - 0.5;
      // disc sample (golden angle) for the light jitter
      const rr = Math.sqrt((i + 0.5) / n), th = i * 2.399963;
      const sub = { jx: jx * 1.15, jy: jy * 1.15, u: rr * Math.cos(th), v: rr * Math.sin(th), frac: (i + 0.5) / n };
      setup(i, n, sub);
      camera.setViewOffset(W, H, sub.jx, sub.jy, W, H);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      // normal + depth pass (solid only)
      r.shadowMap.needsUpdate = false;
      camera.layers.set(LAYER_SOLID);
      scene.overrideMaterial = this.normalMat;
      const bg = scene.background; scene.background = null;
      r.setRenderTarget(this.rtNormal);
      r.setClearColor(0x8080ff, 1);
      r.clear(true, true, false);
      r.render(scene, camera);
      scene.overrideMaterial = null;
      scene.background = bg;
      // beauty pass
      camera.layers.enableAll();
      r.shadowMap.needsUpdate = true;
      r.setRenderTarget(this.rtBeauty);
      r.setClearColor(0x000000, 1);
      r.clear(true, true, false);
      r.render(scene, camera);
      // ao + accumulate
      const u = this.aoMat.uniforms;
      u.uProj.value.copy(camera.projectionMatrix);
      u.uProjInv.value.copy(camera.projectionMatrixInverse);
      u.uKernel.value = this.kernels[i % 64];
      u.uSeed.value = (i * 0.618034) % 1;
      u.uWeight.value = 1 / n;
      r.setRenderTarget(this.rtAccum);
      this.aoQuad.render(r);
    }
    camera.clearViewOffset();
    // bloom adds into the accumulation buffer, then grade to screen
    this.bloom.render(r, null, this.rtAccum, 0, false);
    this.finalMat.uniforms.uTime.value = t;
    r.setRenderTarget(null);
    this.finalQuad.render(r);
  }
}
