// composite (bg + hex grid + hologram + HUD + alert re-ink wave) and final (CRT/CA/scanline/grain) shaders
export const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export const COMP_FS = `
uniform sampler2D tHolo, tHud; uniform vec2 uRes; uniform float uT, uWave, uHex, uFlash, uZoom, uScope, uGain, uHexS, uDive;
uniform vec2 uTgt;
varying vec2 vUv;
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float hexDist(vec2 p){ p = abs(p); return max(dot(p, normalize(vec2(1.0,1.7320508))), p.x); }
vec3 reink(vec3 c){
  float I = max(c.r, max(c.g, c.b)); float w = min(c.r, min(c.g, c.b)) / max(I, 1e-4);
  vec3 o = mix(vec3(1.0, 0.40, 0.0), vec3(1.0, 0.86, 0.70), smoothstep(0.3, 0.95, w));
  return o * I * 1.05;
}
void main(){
  vec2 px = vUv * vec2(1920.0, 1080.0);             // CSS px, y up
  vec2 c = vec2(960.0, 540.0);
  float d0 = length((px - c) / 1080.0);
  vec3 bg = mix(vec3(0.012, 0.058, 0.070), vec3(0.004, 0.018, 0.024), smoothstep(0.0, 0.95, d0));
  vec3 bgA = mix(vec3(0.042, 0.014, 0.006), vec3(0.012, 0.005, 0.004), smoothstep(0.0, 0.95, d0));
  // --- hex grid, revealed by a wave from the scope centre
  vec2 pxh = c + (px - c) / uHexS;               // far plane: hex grid parallax (moves least)
  float S = 30.0; vec2 uv = pxh / S;
  vec2 r = vec2(1.0, 1.7320508), hh = r * 0.5;
  vec2 a = mod(uv, r) - hh, b = mod(uv - hh, r) - hh;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b; vec2 id = uv - gv;
  float e = 0.5 - hexDist(gv);
  float line = 1.0 - smoothstep(0.0, 1.1 / S, e);
  float dc = length(id * S - c) * uHexS;
  float rev = smoothstep(uHex, uHex - 40.0, dc);
  float front = exp(-pow((dc - uHex) / 70.0, 2.0)) * step(1.0, uHex);
  float cellR = h21(id + 3.1), tw = step(0.965, h21(id + floor(uT * 5.0) * 0.371));
  float mask = mix(0.55, 1.0, smoothstep(1.0, 0.3, d0)) * mix(0.35, 1.0, smoothstep(uScope - 90.0, uScope + 10.0, length(px - c)));
  vec3 hexc = vec3(0.05, 0.36, 0.42) * (line * (0.16 + 0.10 * step(0.8, cellR)) * rev * mask + line * front * 0.9 + tw * rev * 0.035 * mask);
  // --- hologram, scope-masked
  vec3 ho = texture2D(tHolo, vUv).rgb * uGain;
  // keep-cyan marker (g x 0.55: graticule, dot land) -> decode, exempt from the orange re-ink (duotone end frame)
  float kcO = step(ho.g, 0.7 * ho.b) * step(0.003, ho.b); ho.g = mix(ho.g, ho.g / 0.55, kcO);
  float rr = length(px - c);
  float sm = 1.0 - smoothstep(uScope - 18.0, uScope + 6.0, rr);
  ho *= max(sm, max(0.07 * uZoom, 0.5 * uDive));   // dive: the coast unmasks full-frame behind the columns
  // --- alert wave (radial from the target)
  float dw = length(px - uTgt);
  float inside = uWave < 0.0 ? 0.0 : 1.0 - smoothstep(uWave - 110.0, uWave, dw);
  float wf = uWave < 0.0 ? 0.0 : exp(-pow((dw - uWave) / 9.0, 2.0)) * (1.0 - smoothstep(1100.0, 1300.0, uWave));
  float wf2 = uWave < 0.0 ? 0.0 : exp(-pow((dw - uWave + 60.0) / 90.0, 2.0)) * (1.0 - smoothstep(1100.0, 1300.0, uWave));
  float ann = uWave < 0.0 ? 0.0 : exp(-pow((dw - uWave + 22.0) / 40.0, 2.0)) * (1.0 - smoothstep(900.0, 1300.0, uWave));   // re-ink glow = 40 px annulus, not a disc
  vec3 base = mix(bg, bgA, inside) + mix(hexc, reink(hexc), inside * 0.3) + mix(ho, reink(ho) * (1.1 + 0.5 * ann), inside * (1.0 - kcO));
  vec4 hu = texture2D(tHud, vUv);
  vec3 hc = hu.rgb;
  float kcH = step(hc.g, 0.7 * hc.b) * step(0.02, hc.b); hc.g = mix(hc.g, hc.g / 0.55, kcH);   // keep-cyan panels
  float keep = step(hc.g + 0.12, hc.r);             // true reds (REC) keep their colour
  hc = mix(hc, reink(hc), inside * (1.0 - keep) * (1.0 - kcH));
  vec3 col = mix(base, hc, hu.a);
  col += vec3(1.0, 0.72, 0.45) * wf * 0.32 + vec3(1.0, 0.38, 0.0) * line * wf2 * 0.75;
  col += vec3(0.85, 0.95, 1.0) * uFlash;
  gl_FragColor = vec4(col, 1.0);
}`;

export const FINAL_FS = `
uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uT, uOpen, uGlitch, uCA, uFrame, uRoll, uFlash, uClose;
varying vec2 vUv;
float h11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  // CRT power-off (last 6 frames): picture squashes to a hot line, the line shrinks to a dot
  float cz = uClose, csy = 1.0, csx = 1.0;
  if (cz > 0.0) { csy = max(pow(1.0 - min(cz / 0.6, 1.0), 2.2), 0.003); csx = cz > 0.6 ? max(1.0 - (cz - 0.6) / 0.4, 0.0) : 1.0; }
  vec2 uv = cz > 0.0 ? vec2(0.5 + (vUv.x - 0.5) / max(csx, 1e-3), 0.5 + (vUv.y - 0.5) / csy) : vUv; float g = uGlitch;
  // micro-glitch: horizontal slice displacement (seeded per frame)
  float bnd = floor(uv.y * 54.0), hb = h11(bnd * 1.7 + uFrame * 13.1);
  float sl = step(1.0 - 0.22 * g, hb);
  uv.x += sl * (h11(bnd * 3.1 + uFrame * 7.7) - 0.5) * 0.07 * g;
  // radial chromatic aberration
  vec2 dc = uv - 0.5; float r2 = dot(dc * vec2(1.78, 1.0), dc * vec2(1.78, 1.0));
  vec2 off = dc * (uCA * (0.3 + r2 * 1.2) + 0.008 * g * sl + 0.002 * g);
  vec3 col = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
  // soft shoulder: overbright bleeds to white-hot instead of clipping hue
  float mx = max(col.r, max(col.g, col.b));
  col += vec3(max(mx - 1.0, 0.0) * 0.45);
  col = col / (1.0 + max(col - 1.0, 0.0) * 0.5);
  // scanlines (3 css px), rolling interference band
  float yc = vUv.y * 1080.0;
  col *= 0.90 + 0.10 * cos(yc * 6.2831853 / 3.0);
  float band = exp(-pow((vUv.y - (1.15 - fract(uT * uRoll) * 1.3)) * 9.0, 2.0));
  col *= 1.0 + 0.07 * band; col += vec3(0.0, 0.012, 0.014) * band;
  // vignette
  float v = smoothstep(1.35, 0.35, length(dc * vec2(1.25, 1.0)) * 1.25);
  col *= mix(0.55, 1.0, v);
  // CRT power-on aperture: hot line opens vertically
  if (uOpen < 1.0) {
    float ah = uOpen * 0.5, dy = abs(vUv.y - 0.5);
    float m = smoothstep(ah + 0.002, ah - 0.002, dy);
    float hx = exp(-pow((vUv.x - 0.5) / (0.18 + 0.9 * uOpen), 2.0));
    float lineGlow = exp(-pow((dy - ah) * uRes.y / (3.0 + 6.0 * (1.0 - uOpen)), 2.0)) * (1.0 - uOpen) * 1.6 * hx;
    col = col * m + vec3(0.65, 1.0, 1.0) * lineGlow;
  }
  // impact flash: white-hot lines on CRUSHED black (never lift the blacks)
  if (uFlash > 0.0) {
    float lm = max(col.r, max(col.g, col.b)), lit = smoothstep(0.40, 0.75, lm);
    vec3 hot = min(col * 2.6 + vec3(0.3) * lit, vec3(1.6));
    col = mix(col, mix(col * 0.25, hot, lit), uFlash);
  }
  if (cz > 0.0) {
    float inb = step(abs(uv.x - 0.5), 0.5) * step(abs(uv.y - 0.5), 0.5);
    col *= inb * (1.0 + 2.0 * cz);
    float dyp = abs(vUv.y - 0.5) * 1080.0, dxn = abs(vUv.x - 0.5) * 2.0;
    float lineG = exp(-dyp * dyp / (4.0 + 400.0 * csy)) * smoothstep(csx + 0.03, csx - 0.03, dxn) * smoothstep(0.15, 0.55, cz);
    float dotG = exp(-(dxn * dxn * 900.0 + dyp * dyp / 30.0)) * smoothstep(0.55, 0.9, cz) * (1.0 - 0.6 * smoothstep(0.9, 1.0, cz));
    col += vec3(0.8, 0.97, 1.0) * (lineG * 1.1 + dotG * 1.4);
  }
  // grain + dither
  float gn = h21(vUv * uRes + uFrame * 17.13) - 0.5;
  col += gn * 0.028 + (h21(vUv * uRes * 1.37 + uFrame) - 0.5) / 255.0;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

// type layer, composited AFTER bloom: crisp glyphs + 1.5 px glow + dark knock-out halo, re-inked by the same wave
export const TEXT_FS = `
uniform sampler2D tDiffuse, tTxt; uniform vec2 uRes; uniform float uWave; uniform vec2 uTgt;
varying vec2 vUv;
vec3 reink(vec3 c){
  float I = max(c.r, max(c.g, c.b)); float w = min(c.r, min(c.g, c.b)) / max(I, 1e-4);
  vec3 o = mix(vec3(1.0, 0.40, 0.0), vec3(1.0, 0.86, 0.70), smoothstep(0.3, 0.95, w));
  return o * I * 1.05;
}
void main(){
  vec3 col = texture2D(tDiffuse, vUv).rgb;
  vec4 tx = texture2D(tTxt, vUv);
  float kcT = step(tx.g, 0.7 * tx.b) * step(0.02, tx.b); tx.g = mix(tx.g, tx.g / 0.55, kcT);   // keep-cyan type
  vec2 p1 = 1.0 / uRes;
  vec3 gc = vec3(0.0); float halo = 0.0;
  for (int i = 0; i < 8; i++) {
    float an = float(i) * 0.7853982 + 0.3927;
    vec2 d = vec2(cos(an), sin(an)) * p1;
    vec4 a1 = texture2D(tTxt, vUv + d * 1.5), a2 = texture2D(tTxt, vUv + d * 3.0);
    gc += a1.rgb * a1.a + a2.rgb * a2.a * 0.45; halo = max(halo, max(a1.a, a2.a * 0.8));
  }
  gc /= 11.6;
  float kcG = step(gc.g, 0.7 * gc.b) * step(0.004, gc.b); gc.g = mix(gc.g, gc.g / 0.55, kcG);
  vec2 px = vUv * vec2(1920.0, 1080.0);
  float dw = length(px - uTgt);
  float inside = uWave < 0.0 ? 0.0 : 1.0 - smoothstep(uWave - 110.0, uWave, dw);
  float keep = step(tx.g + 0.12, tx.r);
  vec3 tc = mix(tx.rgb, reink(tx.rgb), inside * (1.0 - keep) * (1.0 - kcT));
  vec3 gcol = mix(gc, reink(gc), inside * (1.0 - kcG));
  col *= 1.0 - 0.6 * halo;
  col = mix(col, tc * 1.06, tx.a) + gcol * 0.6;
  gl_FragColor = vec4(col, 1.0);
}`;
