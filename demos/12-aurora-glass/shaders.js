// GLSL for "Aurora — think in light". All passes are full-screen triangles; design space is 1920x1080, y down.

export const VS = `#version 300 es
void main(){ vec2 p = vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2)); gl_Position = vec4(p*2.-1., 0., 1.); }`;

const HEAD = `#version 300 es
precision highp float;
uniform vec2 uRes;   // current render-target size (device px)
uniform float uDPR;  // device px per design px
out vec4 o;
vec2 designP(){ return vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDPR; }
vec2 toUV(vec2 p){ return vec2(p.x / 1920., 1. - p.y / 1080.); }
float sdRoundBox(vec2 p, vec2 b, float r){ r = min(r, min(b.x, b.y)); vec2 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r; }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

const SNOISE = `
vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x*34.0)+10.0)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0); const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy)); vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz); vec3 l = 1.0 - g; vec3 i1 = min(g.xyz, l.zxy); vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx; vec3 x2 = x0 - i2 + C.yyy; vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857; vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z); vec4 x_ = floor(j * ns.z); vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy; vec4 y = y_ * ns.x + ns.yyyy; vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy); vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0; vec4 s1 = floor(b1)*2.0 + 1.0; vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy; vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x); vec3 p1 = vec3(a0.zw, h.y); vec3 p2 = vec3(a1.xy, h.z); vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0); m = m * m;
  return 105.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}`;

// camera ray / plane intersection shared by the aurora (shadows) and card passes
const CAM = `
uniform vec3 uCamO; uniform float uF;
vec3 rayDir(vec2 p){ return normalize(vec3(p.x - 960., p.y - 540., uF)); }
vec2 planeLocal(vec2 p, vec3 C, vec3 U, vec3 V, vec3 N){
  vec3 d = rayDir(p); float tt = dot(C - uCamO, N) / dot(d, N); vec3 P = uCamO + d * tt; vec3 r = P - C;
  return vec2(dot(r, U), dot(r, V));
}`;

// ---------------------------------------------------------------- aurora + card shadows + light motes
export const FS_AURORA = HEAD + SNOISE + CAM + `
uniform float uT;
uniform vec4 uBlob[7];   // xy centre (design px), z radius x, w intensity
uniform vec2 uBlobE[7];  // radius y, angle
uniform vec3 uBlobC[7];
uniform vec3 uBase;
uniform float uGain;     // global light level (bloom at the drop)
uniform float uWarp;
uniform vec4 uRipple;    // xy centre, radius, amplitude
uniform vec3 uSC[3]; uniform vec3 uSU[3]; uniform vec3 uSV[3]; uniform vec3 uSN[3]; uniform vec4 uSH[3]; // shadows: half.xy, radius, opacity
uniform float uMotes;
void main(){
  vec2 p = designP();
  vec2 q = p / 1080.;
  float t = uT;
  vec2 w = vec2(snoise(vec3(q * 0.9, t * 0.035)), snoise(vec3(q * 0.9 + vec2(5.2, 1.3), t * 0.035 + 11.)));
  vec2 w2 = vec2(snoise(vec3(q * 2.1 + 3.1, t * 0.06)), snoise(vec3(q * 2.1 + 8.4, t * 0.06 + 4.)));
  vec2 pw = p + w * uWarp + w2 * uWarp * 0.3;
  // slow light ripple (the drop)
  vec2 rd = p - uRipple.xy; float rl = length(rd);
  float ring = exp(-pow((rl - uRipple.z) / 170., 2.)) * uRipple.w;
  pw += rd / max(rl, 1.) * ring * 46.;
  vec3 acc = vec3(0.); float ws = 0.;
  for (int i = 0; i < 7; i++){
    vec2 d = pw - uBlob[i].xy;
    float ca = cos(uBlobE[i].y), sa = sin(uBlobE[i].y);
    d = vec2(ca * d.x + sa * d.y, -sa * d.x + ca * d.y) / vec2(uBlob[i].z, uBlobE[i].x);
    float g = exp(-dot(d, d)) * uBlob[i].w;
    acc += uBlobC[i] * g; ws += g;
  }
  vec3 mixc = acc / max(ws, 1e-4);
  float cov = pow(1. - exp(-ws * 1.5), 1.3);          // deeper indigo valleys between the pools of light
  vec3 col = mix(uBase, mixc, cov) + acc * 0.07;
  float core = smoothstep(0.75, 2.1, ws);             // where pools overlap the light gets hot, not muddy
  col = mix(col, col * 1.22 + vec3(0.035, 0.03, 0.07), core * 0.55);
  col *= uGain * (1. + ring * 0.2);
  col += vec3(0.50, 0.36, 1.0) * ring * 0.045 * cov;   // the drop: a slow violet wave of light
  // faint vertical silk in the light (aurora curtains), very low contrast
  float silk = snoise(vec3(p.x / 260. + w.x * 0.8, p.y / 1400., t * 0.05));
  col *= 1. + silk * 0.05 * cov;

  // light motes / bokeh (sharp enough that the frosted glass visibly blurs them)
  if (uMotes > 0.){
    vec3 m = vec3(0.);
    float lockK = smoothstep(7.0, 7.6, t);
    for (int i = 0; i < 10; i++){
      float fi = float(i);
      vec2 h = hash22(vec2(fi * 1.37 + 0.2, fi * 7.11 + 0.7));
      vec2 vel = (hash22(vec2(fi, 3.1)) - .5) * vec2(10., 6.) + vec2(2., -3.);   // <= 0.3 px / frame
      vec2 pos = h * vec2(1880., 1040.) + vec2(20.) + vel * t;
      float sig = mix(3., 5., hash12(vec2(fi, 4.4)));
      float amp = mix(0.12, 0.25, hash12(vec2(fi, 5.5)));
      float tw = 0.8 + 0.2 * sin(t * (0.5 + hash12(vec2(fi, 2.2))) + fi * 2.1);
      vec2 bd = abs(pos - vec2(960., 600.)) - vec2(380., 150.);
      float keep = mix(1., smoothstep(0., 70., max(bd.x, bd.y)), lockK);
      float d = length(p - pos);
      m += vec3(0.86, 0.9, 1.) * exp(-d * d / (2. * sig * sig)) * amp * tw * keep;
    }
    col += m * uMotes * (0.55 + 0.45 * cov);
  }

  // soft drop shadows of the glass cards onto the light field
  for (int k = 0; k < 3; k++){
    if (uSH[k].w <= 0.) continue;
    vec2 L = planeLocal(p - vec2(0., 34.), uSC[k], uSU[k], uSV[k], uSN[k]);
    float sd = sdRoundBox(L, uSH[k].xy, uSH[k].z);
    float sh = 1. - smoothstep(-46., 84., sd);
    col *= 1. - sh * 0.34 * uSH[k].w;
  }
  o = vec4(max(col, 0.), 1.);
}`;

// ---------------------------------------------------------------- 4x downsample (16-tap box via 4 bilinear taps)
export const FS_DOWN = HEAD + `
uniform sampler2D uSrc; uniform vec2 uSrcTexel; uniform float uThresh;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = texture(uSrc, uv + uSrcTexel * vec2(-1., -1.)).rgb + texture(uSrc, uv + uSrcTexel * vec2(1., -1.)).rgb
         + texture(uSrc, uv + uSrcTexel * vec2(-1., 1.)).rgb + texture(uSrc, uv + uSrcTexel * vec2(1., 1.)).rgb;
  c *= 0.25;
  if (uThresh > 0.) { float l = luma(c); c *= smoothstep(uThresh, uThresh + 0.35, l); }
  o = vec4(c, 1.);
}`;

// ---------------------------------------------------------------- separable gaussian (linear-sampled taps)
export const FS_BLUR = HEAD + `
uniform sampler2D uSrc; uniform vec2 uDir; uniform float uOff[16]; uniform float uW[16]; uniform int uN;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes; vec2 tx = uDir / uRes;
  vec3 c = texture(uSrc, uv).rgb * uW[0];
  for (int i = 1; i < 16; i++){ if (i >= uN) break; c += (texture(uSrc, uv + tx * uOff[i]).rgb + texture(uSrc, uv - tx * uOff[i]).rgb) * uW[i]; }
  o = vec4(c, 1.);
}`;

// ---------------------------------------------------------------- frosted glass card (perspective, analytic SDF)
export const FS_CARD = HEAD + CAM + `
uniform vec3 uC, uU, uV, uN; uniform vec2 uHalf; uniform float uRad;
uniform float uOpacity, uContentA, uLod, uFrost, uDefocus;
uniform sampler2D uBlurTex; uniform sampler2D uContent;
uniform vec2 uLight;  // 2D light direction (points toward the light), design space
uniform float uSheen; // sheen band position (-1..1)
uniform vec2 uGlint;  // travelling catch-light: position, amplitude
uniform float uEdge;  // lit-bevel boost (hook)
uniform vec2 uCatch;  // r2 hook: catch-light position along the top-right bevel (local px), amplitude
void main(){
  vec2 p = designP();
  vec2 L = planeLocal(p, uC, uU, uV, uN);
  float sd = sdRoundBox(L, uHalf, uRad);
  float pxw = max(fwidth(sd), 1e-4);         // local units per screen px
  float sdS = sd / pxw;                        // signed distance in screen px
  float dw = max(uDefocus, 0.5);               // defocus: soft edge when the pane passes the focal plane
  float cov = clamp(0.5 - sdS / (2. * dw), 0., 1.);
  if (cov <= 0.) discard;
  // analytic outward normal of the rounded box in local space
  float r = min(uRad, min(uHalf.x, uHalf.y));
  vec2 qq = abs(L) - uHalf + r;
  vec2 g = qq.x > 0. && qq.y > 0. ? normalize(qq) : (qq.x > qq.y ? vec2(1., 0.) : vec2(0., 1.));
  g *= sign(L + 1e-6);
  float inside = -sdS;                          // px from edge
  // thickness: backdrop pulled inward near the rim (glass edge refraction)
  float rim = 1. - smoothstep(0., 13., inside);
  vec2 offs = -g * pow(rim, 1.3) * 24.;
  vec3 bb = texture(uBlurTex, toUV(p + offs)).rgb;
  // classic recipe: blur + saturate(170%) + 7% white fill
  float l = luma(bb);
  bb = max(mix(vec3(l), bb, 1.0 + 0.38 * uFrost), 0.);
  vec3 col = bb * 1.02 + vec3(0.085) * uFrost + vec3(0.012, 0.012, 0.03);
  // inner glow along the rim (thickness catching light)
  float facing = clamp(dot(g, uLight) * 0.5 + 0.5, 0., 1.);
  col += vec3(1.) * (1. - smoothstep(0., 26., inside)) * (0.018 + 0.05 * pow(facing, 2.));
  // broad diagonal sheen (reflection of a soft box), moves with tilt
  vec2 uvn = L / uHalf;
  float band = dot(uvn, normalize(vec2(0.8, 0.6)));
  col += vec3(1.) * 0.045 * exp(-pow((band - uSheen) / 0.45, 2.));
  col += vec3(0.93, 0.95, 1.) * uGlint.y * exp(-pow((band - uGlint.x) / 0.16, 2.)) * (0.6 + 0.4 * smoothstep(0., 30., inside));
  col += vec3(1.) * 0.035 * (1. - clamp((uvn.y + uvn.x * 0.4 + 1.) * 0.5, 0., 1.)); // top-left a touch brighter
  // UI content (premultiplied)
  vec2 cuv = (L + uHalf) / (2. * uHalf);
  vec4 c = texture(uContent, cuv, uLod) * uContentA;
  col = col * (1. - c.a) + c.rgb;
  // 1px inner highlight stroke, ~30% white, brighter on the lit edge
  float sw = 0.9 + (dw - 0.5) * 1.5;
  float stroke = clamp(1. - abs(inside - sw) / sw, 0., 1.) * (0.9 / sw);
  float sa = min(mix(0.14, 0.7, pow(facing, 1.6)) * uEdge, 0.95);
  col = mix(col, vec3(1.), stroke * sa);
  if (uCatch.y > 0.) {   // a 1 px catch-light runs round the top-right corner radius, with a short comet tail
    vec2 cc = vec2(uHalf.x - r, -uHalf.y + r);
    float sP = L.x < cc.x ? L.x - cc.x : (L.y > cc.y ? r * 1.5708 + (L.y - cc.y) : r * (atan(L.y - cc.y, L.x - cc.x) + 1.5708));
    float dd = sP - uCatch.x;
    float along = exp(-dd * dd / 180.) + 0.4 * exp(dd / 55.) * step(dd, 0.);
    float bandC = clamp(1. - abs(inside - sw) / (sw + 0.35), 0., 1.);
    col += vec3(1., 0.97, 0.93) * along * uCatch.y * (bandC * 1.2 + 0.22 * exp(-inside / 6.));
  }
  o = vec4(col, 1.) * cov * uOpacity;
}`;

// ---------------------------------------------------------------- premultiplied texture overlay (wordmark)
export const FS_OVER = HEAD + `
uniform sampler2D uTex; uniform float uA;
void main(){ vec2 p = designP(); vec4 c = texture(uTex, vec2(p.x / 1920., p.y / 1080.)); o = c * uA; }`;

// ---------------------------------------------------------------- Liquid Glass lens: SDF slab, squircle bezel, spectral refraction
export const FS_LENS = HEAD + `
uniform sampler2D uScene; uniform sampler2D uBlur;
uniform vec2 uLC; uniform vec2 uLH; uniform float uLR; uniform mat2 uLM;  // centre, half size, radius, inverse stretch
uniform vec3 uBead; uniform float uBeadK; uniform float uBeadA;   // metaball bead (xy, r), blend radius, bead opacity
uniform float uOn;           // lens presence 0..1
uniform float uBezel, uDepth, uIor, uDisp, uMag, uRefrSign, uMaxDisp;
uniform float uLift;         // height above the cards (shadow)
uniform float uGlint;        // travelling glint phase
uniform vec3 uLight3;
uniform float uFrostRim, uRimGlow, uRing, uCaustic, uFres, uBzExp;
uniform float uRingW, uWarm, uCW; uniform vec2 uRGl; uniform vec3 uWave;   // ring "o", gold light, counter warmth, ring glint, caustic wave
uniform float uHide;         // reel v5 ?nolink=dot: the glass body, its shadow and its bend are skipped; the 9.0 wave stays (0 = pre-v5 path)
float smin(float a, float b, float k){ float h = max(k - abs(a - b), 0.) / k; return min(a, b) - h * h * k * 0.25; }
float outerSDF(vec2 p){
  vec2 q = uLM * (p - uLC);
  float d = sdRoundBox(q, uLH, uLR);
  if (uBead.z > 0.) { float d2 = length(p - uBead.xy) - uBead.z; d = uBeadK > 0.5 ? smin(d, d2, uBeadK) : min(d, d2); }
  return d;
}
float lensSDF(vec2 p){ float d = outerSDF(p); return uRingW > 0. ? max(d, -d - uRingW) : d; }
vec3 warmRamp(float h){ // rim magenta -> rose -> peach on the plateau
  vec3 a = vec3(0.878, 0.482, 0.847), b = vec3(1., 0.702, 0.780), c = vec3(1., 0.851, 0.659);
  return h < 0.5 ? mix(a, b, h * 2.) : mix(b, c, h * 2. - 1.);
}
float heightAt(vec2 p){
  float d = -lensSDF(p);
  float x = clamp(d / uBezel, 0., 1.);
  return pow(1. - pow(1. - x, uBzExp), 1. / uBzExp);   // convex squircle bezel, flat plateau
}
vec3 sceneAt(vec2 p){
  vec3 c = texture(uScene, toUV(p)).rgb;
  float s = lensSDF(p - vec2(0., 8. + 22. * uLift));
  float soft = 8. + 30. * uLift;
  float sh = (1. - smoothstep(-soft, soft * 1.8, s)) * (0.16 + 0.16 * uLift) * uOn * (1. - uHide);
  float rr = min(uLH.x, uLH.y);
  float ca = smoothstep(-0.25 * rr, -0.85 * rr, s) * uCaustic * uOn * (1. - uHide);   // light gathered by the glass
  return c * (1. - sh) + c * ca * mix(vec3(1.), vec3(1.3, 0.95, 0.68), uWarm);
}
void main(){
  vec2 p = designP();
  if (uOn <= 0.) { o = vec4(texture(uScene, toUV(p)).rgb, 1.); return; }
  float sd = lensSDF(p);
  // r2: the 9.0 wave is a REFRACTION ring (bends what it crosses ~2.5 px) with light on its crest
  vec2 wr = p - uLC; float wl = length(wr); float wx = (wl - uWave.x) / 9.;
  float wv = uWave.y * exp(-pow((wl - uWave.x) / 15., 2.));
  vec2 pw = uWave.z > 0. && wl > 1. ? p - wr / wl * uWave.z * wx * exp(-wx * wx) * (1. - 0.7 * smoothstep(628., 662., p.y)) : p;   // the thin tagline bends less
  vec3 base;
  if (uRingW > 0. && sd > 0. && sd < 16. && uHide < 0.5) {   // the ring bends its neighbours (the "r" stems) a touch
    vec2 gg = vec2(lensSDF(p + vec2(1., 0.)) - lensSDF(p - vec2(1., 0.)), lensSDF(p + vec2(0., 1.)) - lensSDF(p - vec2(0., 1.)));
    float nr = 1. - sd / 16.;
    base = sceneAt(pw + normalize(gg + 1e-5) * 2.4 * nr * nr);
  } else base = sceneAt(pw);
  if (uRingW > 0. && outerSDF(p) < 0. && uHide < 0.5) base = mix(base, warmRamp(0.75) * (luma(base) * 1.3 + 0.04), uCW);   // gold kept in the counter
  base += vec3(1., 0.96, 0.93) * wv;
  if (sd > 2. || uHide > 0.5) { o = vec4(base, 1.); return; }
  float e = 0.75;
  float hx = heightAt(p + vec2(e, 0.)) - heightAt(p - vec2(e, 0.));
  float hy = heightAt(p + vec2(0., e)) - heightAt(p - vec2(0., e));
  float hC = heightAt(p);
  vec3 N = normalize(vec3(-hx / (2. * e) * uDepth, -hy / (2. * e) * uDepth, 1.));
  vec2 gN = length(N.xy) > 1e-4 ? normalize(N.xy) : vec2(0.);   // outward in the bezel
  float edgeX = clamp(-sd / uBezel, 0., 1.);                   // 0 at rim .. 1 on the plateau
  vec2 C = uLC;
  vec3 I = vec3(0., 0., -1.);
  vec3 acc = vec3(0.);
  const vec3 SW[7] = vec3[7](vec3(0.00, 0.00, 0.30), vec3(0.00, 0.10, 0.40), vec3(0.00, 0.25, 0.25), vec3(0.05, 0.35, 0.05),
                             vec3(0.25, 0.25, 0.00), vec3(0.40, 0.05, 0.00), vec3(0.30, 0.00, 0.00));
  for (int i = 0; i < 7; i++){
    float k = (3. - float(i)) / 3.;              // +1 violet .. -1 red
    float ior = uIor + uDisp * k;
    vec3 R = refract(I, N, 1. / ior);
    vec2 disp = R.xy / max(-R.z, 0.25) * uDepth;
    float dl = length(disp);
    disp *= min(1., uMaxDisp * (1. + 0.25 * uDisp * k * 10.) / max(dl, 1e-3)) * uRefrSign;
    float mag = uMag * (1. + uDisp * 0.04 * k);
    vec2 s = C + (p - C) / mag + disp;
    acc += sceneAt(s) * SW[i];
  }
  vec3 col = acc;
  // r2: the light turns gold as LIGHT ADDED over clear glass (no mixing warm into the blue field -> no grey)
  float luPre = luma(col), glyph = 0.;
  if (uWarm > 0.) {
    glyph = smoothstep(0.72, 0.9, luPre) * uWarm;
    vec2 sc = C + (p - C) / uMag;   // a soft #FFC98A glow around the lit glyphs (dilated glyph mask)
    float dil = 0.;
    for (int j = 0; j < 8; j++) { vec2 dv = vec2(cos(float(j) * 0.785), sin(float(j) * 0.785));
      dil += smoothstep(0.72, 0.9, luma(texture(uScene, toUV(sc + dv * 3.5)).rgb)) + smoothstep(0.72, 0.9, luma(texture(uScene, toUV(sc + dv * 7.)).rgb)); }
    float halo = clamp(dil / 16. * 1.6 - glyph, 0., 1.) * uWarm;
    vec2 lr = (p - C) / max(uLH, vec2(1.));
    float rad = clamp(length(lr), 0., 1.);
    vec3 wc = mix(vec3(1., 0.851, 0.659), vec3(1., 0.702, 0.780), smoothstep(0.25, 0.8, rad));   // #FFD9A8 core -> #FFB3C7
    float wa = 0.17 * uWarm * pow(hC, 1.2) * (1. - smoothstep(0.3, 0.95, rad));   // a warm core, the glass stays clear
    col = 1. - (1. - col) * (1. - wc * wa);                     // screen
    col += wc * 0.03 * uWarm * pow(hC, 2.) * (1. - rad);        // + luminance at the core
    float bz = exp(-pow((-sd - 5.) / 3.2, 2.));                 // rose #E07BD8 only in the 8-10 px bezel band
    col = 1. - (1. - col) * (1. - vec3(0.878, 0.482, 0.847) * 0.34 * uWarm * bz);
    col = mix(col, vec3(1., 0.788, 0.541), halo * 0.3);
  }
  // clear, bright body; a whisper of frost only at the very rim
  vec3 bl = texture(uBlur, toUV(p - gN * 24.)).rgb;
  col = mix(col, bl * 1.1 + 0.03, uFrostRim * pow(1. - edgeX, 3.));
  col = mix(vec3(luma(col)), col, 1.08) * 1.035 + 0.01;
  col = mix(col, vec3(1., 0.902, 0.761), glyph * 0.95);   // 'gold.' lit #FFE6C2 at 95 %
  // fresnel: the bezel reflects the surrounding light
  float F = pow(1. - N.z, 1.6);
  vec3 refl = texture(uBlur, toUV(p + gN * 120.)).rgb * 1.35 + 0.1;
  col = mix(col, refl, clamp(F * uFres, 0., 0.5));
  // specular: key light (top-left) + softer bounce (bottom-right)
  vec3 V = vec3(0., 0., 1.);
  vec3 Lk = normalize(uLight3);
  vec3 Lb = normalize(vec3(-uLight3.x, -uLight3.y, uLight3.z));
  float sk = pow(max(dot(reflect(-Lk, N), V), 0.), 18.);
  float sb = pow(max(dot(reflect(-Lb, N), V), 0.), 26.);
  col += vec3(1.) * sk * 0.75 + vec3(0.85, 0.92, 1.) * sb * 0.28;
  if (uRGl.y > 0.) {   // one specular glint runs round the ring (final celesta note)
    float an = atan(p.y - C.y, p.x - C.x);
    float da = mod(an - uRGl.x + 3.14159, 6.28318) - 3.14159;
    float wg = uRingW > 0. ? 0.35 + 0.65 * hC : 0.1 + 0.9 * pow(1. - edgeX, 2.);   // r2s3: on the full lens (drop) the whip rides the bezel
    col += vec3(1.) * exp(-da * da / 0.09) * uRGl.y * wg;
  }
  col += vec3(1., 0.96, 0.93) * wv;
  // rim: thin bright edge + soft inner glow, brightest on the lit / bounce sides
  float facing = dot(gN, normalize(uLight3.xy));             // +1 toward the light
  float lit = pow(max(facing, 0.), 2.) + 0.55 * pow(max(-facing, 0.), 2.);
  float line = clamp(1. - abs(-sd - 0.8) / 1.0, 0., 1.);
  col = mix(col, vec3(1.), line * (0.28 + 0.62 * lit));
  col += vec3(1.) * exp(-(-sd) / 5.) * (0.05 + 0.14 * lit) * uRimGlow;
  col = mix(col, vec3(1.), uRing * smoothstep(6.5, 3.0, -sd) * (0.55 + 0.45 * lit));
  // inner shade on the far side gives the slab volume
  col *= 1. - 0.08 * (1. - edgeX) * max(-facing, 0.) * (1. - lit);
  // travelling glint across the plateau
  vec2 lp = (p - C) / max(uLH, vec2(1.));
  col += exp(-pow((dot(lp, normalize(vec2(1., -0.4))) - uGlint) / 0.1, 2.)) * edgeX * 0.05;
  float cov = clamp(0.5 - sd, 0., 1.) * uOn;
  if (uBead.z > 0.) {   // let the bead (the part left in the toggle) fade back to the white knob on its own
    float dMain = sdRoundBox(uLM * (p - uLC), uLH, uLR), dB = length(p - uBead.xy) - uBead.z;
    cov *= mix(1., uBeadA, smoothstep(-3., 3., dMain - dB));
  }
  o = vec4(mix(base, col, cov), 1.);
}`;

// ---------------------------------------------------------------- final: bloom, grain, vignette, dither
export const FS_FINAL = HEAD + `
uniform sampler2D uSrc; uniform sampler2D uBloom; uniform sampler2D uGrain;
uniform float uBloomAmt, uGrainAmt, uFrame, uVig, uFade;
void main(){
  vec2 p = designP();
  vec2 uv = toUV(p);
  vec3 c = texture(uSrc, uv).rgb;
  c += texture(uBloom, uv).rgb * uBloomAmt;
  // gentle highlight shoulder
  vec3 hi = max(c - 0.82, 0.);
  c = c - hi + hi / (1. + hi * 2.2);
  // vignette
  vec2 v = (p - vec2(960., 560.)) / vec2(1250., 900.);
  c *= 1. - uVig * pow(clamp(dot(v, v), 0., 1.6), 1.25);
  // film grain (seeded per frame), stronger in the mids
  vec2 go = hash22(vec2(uFrame * 0.618, uFrame * 1.303)) * 2048.;
  float g = texture(uGrain, (gl_FragCoord.xy + go) / 2048.).r - 0.5;
  float l = luma(c);
  c += g * uGrainAmt * (0.55 + 0.9 * l * (1.4 - l));
  // triangular dither against banding
  float d = hash12(gl_FragCoord.xy + uFrame * 17.31) + hash12(gl_FragCoord.xy * 1.37 + uFrame * 3.1) - 1.;
  c += d / 255.;
  c *= uFade;
  o = vec4(clamp(c, 0., 1.), 1.);
}`;

// ---------------------------------------------------------------- reel v5.1: frosted-glass letterforms (「玻璃拟态」)
// The glyph mask (canvas, premultiplied white; g = wave-catch) is the footprint. A narrow full-res blur of it is the bevel
// height, a wide quarter-res blur is the dome and the drop shadow. The body is the frosted aurora refracted through that
// surface; a lit rim, a specular edge line, a caustic on the far edge and an inner shade make it a solid glass object.
export const FS_GLYPH = HEAD + `
uniform sampler2D uScene;   // what lies behind the letters (crisp, render-target orientation)
uniform sampler2D uFrost;   // same, frosted (quarter res)
uniform sampler2D uMask;    // crisp glyph mask (canvas orientation)
uniform sampler2D uMN;      // narrow blur of the mask (full res, canvas orientation)
uniform sampler2D uMW;      // wide blur of the mask (quarter res, canvas orientation)
uniform vec2 uLight;        // toward the key light (design space, y down)
uniform float uRefr;        // refraction offset (px) at full slope
uniform vec3 uShadow;       // drop shadow offset xy (px), strength
uniform vec3 uSweep;        // specular sweep: position (px along the diagonal), width (px), amplitude
uniform float uLift;        // overall frost/white lift of the body
uniform vec4 uPool;         // v5.2: deep-indigo pool in the aurora behind the lockup: centre xy, half size xy (design px)
uniform vec3 uPoolK;        // v5.2: pool amount (0..1), corner radius, falloff (px)
uniform vec3 uHalo;         // v5.2: dark separation halo hugging the glyphs (strength), body gain, rim gain
uniform float uSat;         // saturation of the refracted aurora in the body (v5.1: 1.3)
vec2 cUV(vec2 p){ return vec2(p.x / 1920., p.y / 1080.); }
void main(){
  vec2 p = designP();
  vec3 bg = texture(uScene, toUV(p)).rgb;
  vec4 mk = texture(uMask, cUV(p));
  float m = clamp(mk.r, 0., 1.);
  // v5.2: the aurora deepens behind the lockup (a soft indigo pool, hue kept, a touch more saturated) and a soft dark halo
  // hugs each glyph, so the lit glass reads at feed size. The glass body below still refracts the UNdeepened aurora.
  if (uPoolK.x > 0.) {
    float sdp = sdRoundBox(p - uPool.xy, uPool.zw, uPoolK.y);
    float pool = uPoolK.x * (1. - smoothstep(-0.3 * uPoolK.z, uPoolK.z, sdp));
    bg = mix(bg, bg * vec3(0.50, 0.47, 0.72) + vec3(0.004, 0.003, 0.018), pool);
    float hw = texture(uMW, cUV(p)).r;
    bg *= 1. - uHalo.x * uPoolK.x * clamp(hw * 2.2, 0., 1.) * (1. - m);
  }
  // drop shadow (light from the top left -> falls down-right), soft and wide, only outside the glass
  float sh = texture(uMW, cUV(p - uShadow.xy)).r;
  float shN = texture(uMN, cUV(p - uShadow.xy * 0.45)).r;
  bg *= 1. - uShadow.z * clamp(sh * 0.75 + shN * 0.45, 0., 1.) * (1. - m);
  if (m <= 0.002) { o = vec4(bg, 1.); return; }
  float ck = mk.g / max(mk.r, 1e-3);                              // 0..1 wave catch
  // height field and slopes (design px)
  float e = 1.25, ew = 4.;
  float hN = texture(uMN, cUV(p)).r;
  vec2 gN = vec2(texture(uMN, cUV(p + vec2(e, 0.))).r - texture(uMN, cUV(p - vec2(e, 0.))).r,
                 texture(uMN, cUV(p + vec2(0., e))).r - texture(uMN, cUV(p - vec2(0., e))).r) / (2. * e);
  vec2 gW = vec2(texture(uMW, cUV(p + vec2(ew, 0.))).r - texture(uMW, cUV(p - vec2(ew, 0.))).r,
                 texture(uMW, cUV(p + vec2(0., ew))).r - texture(uMW, cUV(p - vec2(0., ew))).r) / (2. * ew);
  vec2 slope = -(gN * 7.5 + gW * 5.);                               // outward-pointing surface slope
  vec3 N = normalize(vec3(slope, 1.));
  float gl = length(gN);
  vec2 nd = gl > 1e-4 ? -gN / gl : vec2(0.);                         // outward direction of the nearest edge
  float bev = 1. - smoothstep(0.42, 0.97, hN);                       // 1 at the edge .. 0 on the flat top
  float facing = dot(nd, normalize(uLight));                         // +1 edge faces the light
  // body: the frosted aurora bent through the glass (+ slight dispersion toward the rim)
  vec2 off = -N.xy * uRefr;
  vec3 fr;
  fr.r = texture(uFrost, toUV(p + off * 1.08)).r;
  fr.g = texture(uFrost, toUV(p + off)).g;
  fr.b = texture(uFrost, toUV(p + off * 0.92)).b;
  float l = luma(fr);
  fr = max(mix(vec3(l), fr, uSat), 0.);
  vec3 col = fr * uHalo.y + vec3(uLift) + vec3(0.01, 0.012, 0.035);
  // vertical light falloff inside the body: top of each stroke catches the sky, bottom sits in shade
  col += vec3(1.) * 0.07 * clamp(-N.y * 3., -1., 1.);
  // inner shade: the far bevel refracts the dark underside
  col *= 1. - 0.42 * pow(bev, 0.8) * pow(max(-facing, 0.), 1.1);
  // lit rim: the bevel toward the key light reflects it
  col += vec3(1.) * bev * (0.07 + 0.55 * uHalo.z * pow(max(facing, 0.), 1.7));
  // caustic: light through the body focuses on the inner far edge (a thin warm line just inside it)
  float edgeBand = smoothstep(0.34, 0.5, hN) * (1. - smoothstep(0.5, 0.72, hN));
  col += vec3(1., 0.93, 0.86) * edgeBand * pow(max(-facing, 0.), 2.) * 0.42;
  // specular edge: a bright 1-2 px line along the lit outline, fainter all round (the glass edge)
  col = mix(col, vec3(1.), edgeBand * (0.22 + 0.7 * pow(max(facing, 0.), 1.4)));
  // key-light specular on the dome
  vec3 Lk = normalize(vec3(uLight, 0.9));
  float sp = pow(max(dot(reflect(-Lk, N), vec3(0., 0., 1.)), 0.), 24.);
  col += vec3(1.) * sp * 0.55;
  // travelling specular sweep (the glass catches the light) and the 9.0 wave catch
  if (uSweep.z > 0.) {
    float d = dot(p - vec2(960., 540.), normalize(vec2(0.86, 0.5))) - uSweep.x;
    col += vec3(1., 0.98, 0.95) * uSweep.z * exp(-d * d / (uSweep.y * uSweep.y)) * (0.35 + 0.65 * bev);
  }
  col += vec3(1., 0.965, 0.925) * ck * (0.16 + 0.4 * bev);
  o = vec4(mix(bg, col, m), 1.);
}`;
