// GLSL for 07-liquid. All lighting in linear HDR; post pass tonemaps + grades.
export const VS = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;

const COMMON = `
#define PI 3.14159265
// well-defined smoothstep for either edge order (GLSL smoothstep is UB when e0 >= e1)
float ss(float a, float b, float x){ float t = clamp((x - a)/(b - a), 0.0, 1.0); return t*t*(3.0 - 2.0*t); }
vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
// gradient noise with analytic derivatives (value, d/dx, d/dy)
vec3 noised(vec2 x){
  vec2 i = floor(x), f = fract(x);
  vec2 u = f*f*f*(f*(f*6.0-15.0)+10.0);
  vec2 du = 30.0*f*f*(f*(f-2.0)+1.0);
  vec2 ga = hash22(i)*2.0-1.0, gb = hash22(i+vec2(1,0))*2.0-1.0, gc = hash22(i+vec2(0,1))*2.0-1.0, gd = hash22(i+vec2(1,1))*2.0-1.0;
  float va = dot(ga, f), vb = dot(gb, f-vec2(1,0)), vc = dot(gc, f-vec2(0,1)), vd = dot(gd, f-vec2(1,1));
  float v = va + u.x*(vb-va) + u.y*(vc-va) + u.x*u.y*(va-vb-vc+vd);
  vec2 d = ga + u.x*(gb-ga) + u.y*(gc-ga) + u.x*u.y*(ga-gb-gc+gd) + du*(u.yx*(va-vb-vc+vd) + vec2(vb,vc) - va);
  return vec3(v, d);
}
`;

export const FS_SCENE = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 oCol;
${COMMON}
uniform vec2 uRes;
uniform float uT;
uniform vec4 uCam;          // zoom, pivot x, pivot y, 0  (+ offset in uCam2)
uniform vec2 uCam2;         // offset x,y
uniform float uK;           // smooth-union sharpness (1/px)
#define NB 72
#define NS 20
uniform int uNB; uniform vec4 uB[NB]; uniform vec4 uBX[NB];   // ball: cx cy r u | stretch angle 0 0
uniform int uNS; uniform vec4 uS[NS]; uniform vec4 uSX[NS];   // seg: ax ay bx by | ra rb u 0
uniform sampler2D uTex; uniform vec2 uTexSize;                // letter SDFs, one per channel (tex px units)
uniform vec4 uL[4];         // letter: screen pivot x,y, grow(px), u
uniform vec4 uLX[4];        // letter: sx, sy, angle, on
uniform vec4 uLM[4];        // letter morph source ellipse: centre x,y, semi-axes (world px); blend = uLX.w
uniform vec4 uLP[4];        // letter: texture pivot x,y, wobble amp, wobble phase
uniform vec4 uFl;           // main flood: front, back, phase, on
uniform vec4 uFlA;          // amp, freq, lean, u
uniform vec4 uFlB;          // dir x,y, bump amp, bump centre
uniform vec4 uOv[3];        // flood sheets (drawn over the scene, back to front)
uniform vec4 uOvA[3];
uniform vec4 uOvB[3];
uniform vec3 uOvV;          // overlay edge speed (px/frame) -> in-shader shutter blur of the edge
uniform float uFloorY;      // contact line of the action plane
uniform float uHorizon;     // backdrop / floor junction
uniform vec4 uRip;          // ripple x, y, age, amp
uniform vec4 uSw;           // s3: hero-sphere interior colour swirl: centre x,y, radius, amount
uniform vec4 uKey;          // key softbox centre (q-space) x,y + glint sweep pos, glint amp
uniform float uGoo;
uniform int uDbg;
uniform vec2 uSpot;
uniform vec4 uRing;          // r2: light ring from behind the bar: centre x,y, radius, amp
uniform vec4 uCrown;         // r2: backlit crown sheet behind the word: centre x, base y, height, alpha
uniform float uCaus;         // r2 P3: animated caustics thrown by the jelly letters onto the set (end card)
uniform vec4 uPar;           // r2: backdrop parallax offset xy, cyc spot drift xy
#define NBUB 32
uniform vec4 uBub[NBUB];     // carbonation bubbles inside the liquid: x, y, r, alpha
uniform int uNBub;         // backdrop light gain, logo halo         // extra flood-surface noise amount
uniform sampler2D uBack;    // background type layer (refracted)
uniform float uMbw;         // shutter fraction between MB samples (fast edges get that much in-shader blur)
uniform vec4 uLens;         // ball-lens bulb: centre x,y, semi-axes x,y (world px)
uniform vec4 uLens2;        // lens image: word centre in tex px, tex px per unit lens radius, amount
#ifdef V5
uniform vec4 uV5;           // reel v5.1 grade: x = set darkening (near-black plum), y = title liquid lift, z = violet -> pink-violet lift, w = floor-reflection kill
uniform vec4 uV5b;          // reflection kill band: centre x, half width (world px)
#endif

// ---------- palette: u in [0,1]  tangerine -> hot pink -> violet ----------
vec3 palThin(float u){ u=clamp(u,0.,1.);
  vec3 a=lin(vec3(1.00,0.74,0.30)), b=lin(vec3(1.00,0.50,0.66)), c=lin(vec3(0.84,0.52,1.00));
#ifdef V5
  c = mix(c, lin(vec3(0.98,0.74,1.00)), uV5.z);
#endif
  return u<0.5 ? mix(a,b,u*2.0) : mix(b,c,u*2.0-1.0); }
vec3 palMid(float u){ u=clamp(u,0.,1.);
  vec3 a=lin(vec3(1.00,0.36,0.06)), b=lin(vec3(1.00,0.10,0.44)), c=lin(vec3(0.56,0.12,1.00));
#ifdef V5
  c = mix(c, lin(vec3(0.88,0.36,1.00)), uV5.z);
#endif
  return u<0.5 ? mix(a,b,u*2.0) : mix(b,c,u*2.0-1.0); }
vec3 palDeep(float u){ u=clamp(u,0.,1.);
  vec3 a=lin(vec3(0.80,0.10,0.04)), b=lin(vec3(0.62,0.02,0.30)), c=lin(vec3(0.24,0.04,0.60));
#ifdef V5
  c = mix(c, lin(vec3(0.52,0.12,0.74)), uV5.z);
#endif
  return u<0.5 ? mix(a,b,u*2.0) : mix(b,c,u*2.0-1.0); }

// ---------- smooth union accumulator (log-sum-exp, stable) ----------
struct Fld { float m; float s; vec2 g; float u; };
void fadd(inout Fld f, float d, vec2 g, float u, float k){
  if (d < f.m){ float c = exp(-k*(f.m-d)); f.s = f.s*c+1.0; f.g = f.g*c+g; f.u = f.u*c+u; f.m = d; }
  else { float w = exp(-k*(d-f.m)); f.s += w; f.g += w*g; f.u += w*u; }
}
vec4 fres(Fld f, float k){ return vec4(f.m - log(max(f.s,1e-30))/k, f.g/max(f.s,1e-30), f.u/max(f.s,1e-30)); }

// wave front shape along coordinate b: returns (offset, derivative)
vec2 waveShape(float b, float amp, float fr, float ph, float lean){
  float s1 = sin(b*fr + ph), c1 = cos(b*fr + ph);
  float s2 = sin(b*fr*1.87 + ph*1.31 + 1.7), c2 = cos(b*fr*1.87 + ph*1.31 + 1.7);
  float s3 = sin(b*fr*3.13 - ph*0.63 + 4.1), c3 = cos(b*fr*3.13 - ph*0.63 + 4.1);
  float v = amp*(0.58*s1 + 0.30*s2 + 0.14*s3) + lean*(b-960.0);
  float d = amp*fr*(0.58*c1 + 0.30*1.87*c2 + 0.14*3.13*c3) + lean;
  return vec2(v, d);
}
// flood band between back(b) < a < front(b); a = travel coordinate along dir, b across.
// F = (front, back, phase, on)  A = (amp, freq, lean, u)  B = (dir.x, dir.y, bump amp, bump centre)
vec3 floodSD(vec2 p, vec4 F, vec4 A, vec4 B){
  vec2 dir = B.xy, perp = vec2(-B.y, B.x);
  float a = dot(p, dir), b = dot(p, perp);
  vec2 f1 = waveShape(b, A.x, A.y, F.z, A.z);
  float bb = (b - B.w)/250.0; float bump = B.z*exp(-0.5*bb*bb);
  f1 += vec2(bump, -bump*bb/250.0);
  vec2 f2 = waveShape(b, A.x*0.85, A.y*0.93, F.z*0.8 + 2.3, -A.z*0.6);
  float nf = sqrt(1.0 + f1.y*f1.y), nb = sqrt(1.0 + f2.y*f2.y);
  float dF = (a - (F.x + f1.x))/nf;
  float dB = ((F.y + f2.x) - a)/nb;
  vec2 gF = (dir - f1.y*perp)/nf, gB = (-dir + f2.y*perp)/nb;
  // r2 s2 (4.23 slashes): the front's waviness bends the normals only near the front. Deep inside, the old gradient kept
  // the wave's tilt as bands parallel to dir, and the env strip lights reflected in them as white slashes.
  gF = normalize(mix(gF, dir, ss(-24.0, -150.0, dF))); gB = normalize(mix(gB, -dir, ss(-24.0, -150.0, dB)));
  float k = 0.08; float m = max(dF, dB);
  float eF = exp(k*(dF - m)), eB = exp(k*(dB - m));
  return vec3(m + log(eF + eB)/k, (eF*gF + eB*gB)/(eF + eB));
}

vec4 field(vec2 p){
  Fld f = Fld(1e5, 0.0, vec2(0.0), 0.0);
  float gW[4]; float gU[4]; int gN = 0;
  for (int j=0;j<4;j++){ gW[j] = 0.0; gU[j] = 0.0; }
  float k = uK;
  for (int i=0;i<NB;i++){
    if (i>=uNB) break;
    vec4 b = uB[i]; vec4 bx = uBX[i];
    vec2 dp = p - b.xy;
    float ext = b.z*max(bx.x, 1.0/bx.x);
    if (dot(dp,dp) > (ext+140.0)*(ext+140.0)) continue;
    float ca = cos(bx.y), sa = sin(bx.y);
    vec2 q = vec2(ca*dp.x + sa*dp.y, -sa*dp.x + ca*dp.y);
    float ax = b.z*bx.x, ay = b.z/bx.x;
    vec2 qa = q/vec2(ax*ax, ay*ay);
    if (bx.z > 0.5){                       // colour-only 'ghost' swirl inside a bigger body
      float rho = sqrt(dot(q, q/vec2(ax*ax, ay*ay)));
      gW[gN] = (1.0 - ss(0.25, 1.0, rho))*bx.w; gU[gN] = b.w; gN = min(gN+1, 3);
      continue;
    }
    float d = 0.5*b.z*(dot(q,qa) - 1.0);
    vec2 gq = b.z*qa;
    fadd(f, d, vec2(ca*gq.x - sa*gq.y, sa*gq.x + ca*gq.y), b.w, k);
  }
  for (int i=0;i<NS;i++){
    if (i>=uNS) break;
    vec4 s = uS[i]; vec4 sx = uSX[i];
    vec2 a = s.xy, ba = s.zw - s.xy, pa = p - a;
    float h = clamp(dot(pa,ba)/max(dot(ba,ba),1e-4), 0.0, 1.0);
    vec2 v = pa - ba*h; float r = max(mix(sx.x, sx.y, h), 0.3);
    float d = (dot(v,v) - r*r)/(2.0*r);
    fadd(f, d, v/r, sx.z, k);
  }
  for (int i=0;i<4;i++){
    vec4 L = uL[i]; vec4 LX = uLX[i]; vec4 LP = uLP[i];
    if (LX.w <= 0.0) continue;
    vec2 dp = p - L.xy;
    float ca = cos(LX.z), sa = sin(LX.z);
    vec2 q = vec2(ca*dp.x + sa*dp.y, -sa*dp.x + ca*dp.y) / LX.xy;
    // jelly wobble: gentle travelling sine warp
    q.x += LP.z*sin(q.y*0.021 + LP.w);
    q.y += LP.z*0.6*sin(q.x*0.017 + LP.w*1.3);
    vec2 tq = q + LP.xy;
    vec4 msk = vec4(i==0, i==1, i==2, i==3);
    vec2 e = vec2(1.0, 0.0);
    float sd = dot(texture(uTex, tq/uTexSize), msk);
    float sxp = dot(texture(uTex, (tq+e.xy)/uTexSize), msk), sxm = dot(texture(uTex, (tq-e.xy)/uTexSize), msk);
    float syp = dot(texture(uTex, (tq+e.yx)/uTexSize), msk), sym = dot(texture(uTex, (tq-e.yx)/uTexSize), msk);
    vec2 gq = vec2(sxp-sxm, syp-sym)*0.5 / LX.xy;
    float sc = sqrt(LX.x*LX.y);
    vec2 g = vec2(ca*gq.x - sa*gq.y, sa*gq.x + ca*gq.y) * sc;
    float dl = sd*sc - L.z;
    if (LX.w < 0.999){                      // SDF morph: slot ellipse -> letter
      vec4 M = uLM[i]; vec2 eq = p - M.xy;
      float k0 = length(eq/M.zw), k1 = length(eq/(M.zw*M.zw));
      float de = k0*(k0 - 1.0)/max(k1, 1e-5);
      vec2 ge = normalize(eq/(M.zw*M.zw) + 1e-6);
      float m = smoothstep(0.0, 1.0, LX.w);
      dl = mix(de, dl, m); g = normalize(mix(ge, g, m) + 1e-6);
    }
    fadd(f, dl, g, L.w, k);
  }
  vec4 R = fres(f, k);
  for (int j=0;j<4;j++){ if (j >= gN) break; R.w = mix(R.w, gU[j], gW[j]); }
  if (uSw.w > 0.001){                     // curl-warped spiral bands of the 4 palette colours (colour only)
    vec2 dq = (p - uSw.xy)/uSw.z; float rho = length(dq);
    if (rho < 1.25){
      // r2 P5: reconstruct the sphere point, spin it ~40 deg/s about a tilted axis, colour by 3D warped bands of it
      float r1 = min(rho, 1.0);
      vec3 sp = vec3(dq/max(rho, 1.0), sqrt(max(0.0, 1.0 - r1*r1)));
      vec3 ax = normalize(vec3(0.35, 1.0, 0.28));
      float an = uT*0.70, ca = cos(an), sa = sin(an);
      sp = sp*ca + cross(ax, sp)*sa + ax*dot(ax, sp)*(1.0 - ca);
      vec3 nz = noised(sp.xz*1.35 + vec2(2.0, 5.0));
      vec3 nz2 = noised(sp.yx*1.1 + vec2(7.0, 1.0));
      float ph = 4.4*sp.y + 1.3*sin(3.1*sp.x + 2.2*sp.z) + 1.5*nz.x + 0.8*nz2.x;
      R.w = mix(R.w, 0.5 + 0.46*sin(ph), uSw.w*(1.0 - ss(0.82, 1.2, rho)));
    }
  }
  return R;
}

// ---------- studio environment (reflection) ----------
float softRect(vec2 q, vec2 hs, float soft){
  vec2 d = abs(q) - hs;
  float o = length(max(d,0.0)) + min(max(d.x,d.y),0.0);
  return 1.0 - ss(-soft, soft, o);
}
vec3 env(vec3 r){
  vec3 c = lin(vec3(0.10,0.03,0.12))*0.5;                     // dark plum studio
  float up = clamp(-r.y, 0.0, 1.0), dn = clamp(r.y, 0.0, 1.0);
  c += lin(vec3(0.60,0.40,0.75))*0.55*up*up;                  // overhead fill
  c += lin(vec3(1.0,0.30,0.32))*0.32*ss(0.2,0.95,dn);  // warm floor bounce
  float zf = max(r.z, 0.06);
  vec2 q = r.xy/zf;
  // key softbox (upper left) with a soft vertical falloff inside the panel
  vec2 kq = q - uKey.xy;
  float kb = softRect(kq, vec2(0.60,0.36), 0.10);
  c += lin(vec3(1.0,0.97,0.93))*30.0*kb*(0.75 + 0.25*ss(0.36,-0.36,kq.y));
  // small top-right softbox (second catch-light)
  c += lin(vec3(1.0,0.90,0.95))*12.0*softRect(q - vec2(0.95,-1.25), vec2(0.20,0.14), 0.07);
  // strip right
  c += lin(vec3(1.0,0.80,0.92))*14.0*softRect(q - vec2(1.55,-0.05), vec2(0.07,1.3), 0.04);
  // kicker lower left
  c += lin(vec3(1.0,0.80,0.70))*4.0*softRect(q - vec2(-1.7,0.7), vec2(0.08,0.45), 0.08);
  // grazing rims pick up the dim set + coloured bounce, not white
  float gr = pow(1.0 - clamp(r.z,0.0,1.0), 4.0);
  vec2 rd = normalize(r.xy + 1e-5);
  c += gr*(lin(vec3(1.0,0.72,0.70))*1.1*ss(0.2,-0.9,rd.x+rd.y) + lin(vec3(1.0,0.38,0.70))*0.9*ss(0.5,1.0,rd.x));
  return c;
}

// shade a liquid sample. F = (D, grad, u). returns rgb (linear HDR) and coverage in .a
vec4 shadeLiquid(vec2 p, vec4 F, float deepNoise, float mirror){
  float D = F.x; vec2 gD = F.yz; float u = F.w;
  float gl = max(length(gD), 0.2);
  float cov = clamp(0.5 - D/gl, 0.0, 1.0);
  if (cov <= 0.0) return vec4(0.0);
  const float R = 95.0, Hc = 210.0;
  float x = max(-D, 0.0);
  float h0 = sqrt(2.0*R*x + 2.0*R*0.6);
  float th = tanh(h0/Hc);
  float h = Hc*th;
  float dhdx = (1.0 - th*th)*R/h0;
  vec2 gh = -dhdx*gD;
  // deep-interior surface undulation (flood sheets / big pools)
  float deep = ss(90.0, 320.0, x)*deepNoise;
  float du = 0.0, sheen = 0.0;
  if (deep > 0.001){
    // marbled pour: domain-warped bands of the palette; each band boundary is a soft ridge that catches light
    vec2 q = p*0.00118 + vec2(uT*0.085, -uT*0.04);
    vec3 w1 = noised(q*0.8 + vec2(1.3, 4.1));
    vec3 w2 = noised(q + 1.25*w1.yz + vec2(uT*0.06, 2.0));
    vec3 m = noised(q*1.15 + 1.8*w2.yz + vec2(5.2, 1.1));
    float ph = 6.2*m.x + 1.8*w1.x;
    float band = sin(ph);
    vec2 gph = (6.2*m.yz*1.15 + 1.8*w1.yz*0.8)*0.00118;   // approx gradient of phase (warp jacobian ignored)
    float A = 26.0*deep;
    h += A*(0.5 + 0.5*band);
    gh += A*0.5*cos(ph)*gph;
    float vein = ss(0.35, 0.8, band) - ss(-0.35, -0.8, band);
    float fl = 1.0 - 0.85*ss(4.08, 4.16, uT)*(1.0 - ss(4.5, 4.62, uT));   // r2 P4: no marble slashes in the flood
    du = deep*(0.40*vein + 0.10*w2.x);
    h -= (1.0 - fl)*A*(0.5 + 0.5*band); gh -= (1.0 - fl)*A*0.5*cos(ph)*gph;
    sheen = deep*fl;
  }
  if (mirror > 0.5 && mirror < 1.5) gh.y = -gh.y;
  float ovl = step(1.5, mirror);          // r2: flood overlay sheet
  vec3 n = normalize(vec3(-gh, 1.0));
  float uu = u + du;
  // body colour: thickness drives the hue (thin -> light/warm, thick -> deep, saturated)
  vec3 body = mix(palThin(uu), palMid(uu), ss(0.0, 5.0, x));
  body = mix(body, palDeep(uu), ss(40.0, 260.0, x)*mix(0.55, 0.22, ss(200.0, 400.0, x)));
#ifdef V5
  float lift = uV5.y*(1.0 - step(1.5, mirror));
  body = mix(body, palThin(uu), 0.22*lift);
#endif
  vec3 L = normalize(vec3(-0.55, -0.7, 0.62));
  float ndl = dot(n, L);
  float side = 1.0 - n.z;
  vec3 col = body*(0.26 + 0.50*(0.5 + 0.5*ndl))*(0.50 + 0.50*n.z);   // edges fall off: glossy, not rubbery
#ifdef V5
  col *= 1.0 + 0.62*lift;
#endif
  // transmitted light: a saturated crescent glow inside the rim, opposite the key (light focused through the body)
  vec2 l2 = normalize(L.xy);
  float away = dot(normalize(n.xy + 1e-6), -l2);
  float trans = pow(max(away, 0.0), 1.2)*ss(0.10, 0.50, side)*(1.0 - 0.85*ss(0.70, 1.0, side));
  col += (palMid(uu)*1.4 + palThin(uu)*0.3)*trans*1.0;
  col += palMid(uu)*exp(-x/3.0)*0.22;                       // thin translucent lip
  vec3 V = vec3(0,0,1);
  vec3 r = reflect(-V, n);
  float fr = 0.04 + 0.96*pow(1.0 - clamp(n.z,0.0,1.0), 5.0);
  vec3 e = env(r);
  vec3 bodyOnly = col;
  float frc = mix(fr, min(fr, 0.05), ovl*ss(30.0, 48.0, x));   // r2 P4: sheet reflections only on the meniscus band (no slashes)
  col = col*(1.0 - frc) + e*frc;
  if (uDbg==1) return vec4(bodyOnly, cov);
  if (uDbg==2) return vec4(e*fr, cov);
  if (uDbg==3) return vec4(vec3(h/150.0), cov);
  if (uDbg==4) return vec4(n*0.5+0.5, cov);
  if (uDbg==6) return vec4(vec3(uu, u, du+0.5), cov);
  // broad glossy sheen on large flat liquid (flood sheets): a big soft light just above the lens axis
  if (sheen > 0.0){
    // crisp wet highlight lines where the marbling ridges tilt toward a light just off-axis
    vec3 Lb = normalize(vec3(-0.16, -0.22, 1.0));
    float sb = pow(max(dot(r, Lb), 0.0), 380.0);
    vec3 Lc = normalize(vec3(0.20, 0.10, 1.0));
    float sc = pow(max(dot(r, Lc), 0.0), 600.0);
    col += (lin(vec3(1.0,0.93,0.95))*sb*2.2 + lin(vec3(1.0,0.80,0.90))*sc*1.2)*sheen;
  }
  // wet hotspot
  vec3 Ls = normalize(vec3(-0.46, -0.62, 0.64));
  float sp = pow(max(dot(r, Ls), 0.0), 900.0);
#ifdef V5
  col += vec3(1.0,0.97,0.94)*sp*22.0*(1.0 + 0.8*lift);
  col += e*frc*0.6*lift;                                   // v5.1: hotter softbox reflections on the title
#else
  col += vec3(1.0,0.97,0.94)*sp*22.0;
#endif
  // glint sweep (hero): narrow diagonal band travelling across the liquid
  float gb = (p.x*0.8 - p.y*0.6) - uKey.z;
  col += vec3(1.0,0.95,0.98)*uKey.w*exp(-gb*gb/(2.0*34.0*34.0))*ss(0.35,0.75,side)*(1.0-ss(0.9,1.0,side))*1.1;
  return vec4(col, cov);
}

#ifdef V5
// v5.1: the set goes down to a near-black, desaturated plum so the jelly title has >= 90/255 luma over its ground
vec3 v5set(vec3 c){
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 d = mix(c, l*vec3(1.10, 0.80, 1.18), 0.5)*0.20;
  return mix(c, d, uV5.x);
}
#endif
vec3 backdrop(vec2 p){
  vec2 p0 = p; p += uPar.xy;
  float y = p.y/uRes.y;
  vec3 top = lin(vec3(0.070,0.018,0.090));
  vec3 hor = lin(vec3(0.205,0.058,0.235));
  vec3 c = mix(top, hor, ss(0.0, uHorizon/uRes.y, y));
  vec2 d = (p - vec2(960.0, 500.0) - uPar.zw)/vec2(1050.0, 620.0);
  c += lin(vec3(0.34,0.10,0.35))*0.55*uSpot.x*exp(-dot(d,d)*1.6);
  vec2 dh = (p0 - vec2(960.0, 470.0))/vec2(620.0, 300.0);
  c += lin(vec3(0.62,0.16,0.42))*0.42*uSpot.y*exp(-dot(dh,dh)*2.2);
#ifdef V5
  c = v5set(c);
#endif
  if (uRing.w > 0.001){                   // r2: radial light ring expanding from behind the bar (120 px soft edge)
    float rl = length((p0 - uRing.xy)*vec2(1.0, 1.18));
    float e = (rl - uRing.z)/120.0;
    c += lin(vec3(1.0,0.58,0.66))*uRing.w*(1.5*exp(-e*e) + 0.14*ss(uRing.z + 60.0, 0.0, rl));
  }
  if (uCrown.w > 0.001){                  // r2: backlit crown sheet kicking up behind the word (translucent, 9 flared points)
    float x = p0.x - uCrown.x, hw = 540.0, ax = abs(x)/hw;
    if (ax < 1.0){
      float env = 1.0 - ax*ax, h = 0.40 + 0.08*sin(x*0.011 + 1.7), bead = 0.0;   // continuous wall, points on its rim
      float up = clamp((uCrown.y - p0.y)/max(uCrown.z, 1.0), 0.0, 1.5);
      for (int k=0;k<7;k++){
        float fk = float(k), hk = fract(sin(fk*12.9898 + 4.1)*43758.5453);
        float xk = -450.0 + fk*150.0 + (hk - 0.5)*70.0;
        float wk = 20.0 + 18.0*fract(hk*7.13);
        float ak = (0.5 + 0.5*hk)*(1.0 - pow(abs(xk)/hw, 2.0));
        float g = ak*exp(-pow((x - xk - xk*0.2*up)/(wk*(1.0 + 1.6*max(0.0, 0.35 - up))), 2.0));
        h = h + g - h*g;
        vec2 bc = vec2(xk*(1.0 + 0.2*ak), uCrown.y - uCrown.z*ak - 16.0 - 40.0*(1.0 - uCrown.w));
        if (hk > 0.3) bead = max(bead, ss(7.0 + 5.0*hk, 4.5 + 5.0*hk, length(vec2(x, p0.y) - bc)));
      }
      float top = uCrown.y - uCrown.z*env*h;
      float sd = top - p0.y;                              // > 0 above the sheet edge
      float body = ss(1.2, -1.2, sd)*ss(uCrown.y + 30.0, uCrown.y - 40.0, p0.y);
      float depth = clamp((p0.y - top)/max(uCrown.z*0.5, 1.0), 0.0, 1.0);
      vec3 trans = mix(lin(vec3(1.0,0.74,0.50))*1.5, lin(vec3(0.80,0.14,0.42))*0.55, pow(depth, 0.45));
      c = mix(c, trans, max(body*mix(0.62, 0.30, depth), bead*0.8)*uCrown.w);
      c += lin(vec3(1.0,0.90,0.84))*1.3*exp(-sd*sd/10.0)*uCrown.w*env;
    }
  }
  return c;
}
vec3 floorCol(vec2 p){
  vec2 p0 = p; p += uPar.xy*0.6;
  float yy = (p.y - uHorizon)/(uRes.y - uHorizon);
  vec3 near = lin(vec3(0.034,0.009,0.044));
  vec3 far = lin(vec3(0.165,0.046,0.188));
  vec3 c = mix(far, near, pow(clamp(yy,0.0,1.0), 0.55));
  vec2 d = (p - vec2(960.0, uHorizon + 30.0))/vec2(950.0, 150.0);
  c += lin(vec3(0.32,0.09,0.32))*0.30*uSpot.x*exp(-dot(d,d)*1.5);
#ifdef V5
  c = v5set(c);
#endif
  if (uRing.w > 0.001){                   // r2: the light ring sweeps across the floor (foreshortened)
    float rl = length((p0 - vec2(uRing.x, uFloorY))*vec2(1.0, 3.6));
    float e = (rl - uRing.z)/140.0;
    c += lin(vec3(1.0,0.56,0.64))*uRing.w*(0.8*exp(-e*e) + 0.12*ss(uRing.z + 60.0, 0.0, rl));
  }
  return c;
}
float ripRings(vec2 p){
  if (uRip.w <= 0.0) return 0.0;
  vec2 rd = (p - uRip.xy)*vec2(1.0, 4.6);
  float rr = length(rd), ring = 0.0;
  for (int k=0;k<2;k++){
    float fk = uRip.z*470.0*(1.0 - 0.12*float(k)) - float(k)*22.0;
    if (fk > 0.0) ring += exp(-pow((rr-fk)/(2.6+fk*0.008), 2.0))*exp(-fk/380.0)*(1.0-0.3*float(k));
  }
  return ring*uRip.w*ss(952.0, 905.0, p.y);   // rings fade out before they reach the tagline
}

vec4 bubbleLayer(vec2 p, float u){
  vec3 bc = vec3(0.0); float ba = 0.0;
  for (int i=0;i<NBUB;i++){
    if (i >= uNBub) break;
    vec4 b = uBub[i];
    vec2 d = (p - b.xy)/b.z;
    float rr = length(d);
    if (rr > 1.6) continue;
    float rim = ss(0.55, 0.95, rr)*(1.0 - ss(0.95, 1.25, rr));
    float pip = exp(-dot(d - vec2(-0.35,-0.38), d - vec2(-0.35,-0.38))*22.0);
    bc += (palThin(u)*1.2*rim + vec3(1.0,0.97,0.95)*pip*2.4)*b.w;
    ba = max(ba, (0.55*rim + pip)*b.w);
  }
  return vec4(bc, ba);
}
void main(){
  vec2 sp = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);          // screen px, y down
  vec2 p = (sp - 0.5*uRes)/uCam.x + uCam.yz + uCam2;                // world px (camera: zoom, centre)
  vec4 F = field(p);
  vec3 col;
  bool onFloor = p.y > uHorizon;
  col = onFloor ? floorCol(p) : backdrop(p);
  // soft blend at the horizon
  float hzc = uHorizon - 42.0*pow((p.x - 960.0)/980.0, 2.0);   // curved cyc: junction bends up toward the edges
  float hb = ss(-85.0, 65.0, p.y - hzc);                       // 150 px falloff instead of a ruler line
  col = mix(backdrop(p), floorCol(p), hb);
  // soft shadow + coloured caustic of the liquid, cast down-right onto the set
  vec2 so = vec2(24.0, 32.0);
  vec4 Fs = field(p - so);
  float sh = ss(26.0, -34.0, Fs.x);
  col *= 1.0 - 0.50*sh;
  float ca = ss(-8.0, -60.0, Fs.x);
#ifdef V5
  col += (palMid(Fs.w)*0.075*ca + palThin(Fs.w)*0.05*ss(-30.0,-110.0,Fs.x))*(1.0 - 0.7*uV5.x);
#else
  col += palMid(Fs.w)*0.075*ca + palThin(Fs.w)*0.05*ss(-30.0,-110.0,Fs.x);
#endif
  if (uCaus > 0.001){   // r2 s2 P3: pool caustics thrown up onto the cyc by the liquid on the floor (replaces the letter ghost)
    float wy = hzc - p.y;                                          // height above the (curved) horizon
    float reg = ss(-40.0, 50.0, wy)*exp(-max(wy, 0.0)/260.0)*exp(-pow((p.x - 960.0)/820.0, 2.0));
    if (reg > 0.002){
      vec2 cq = vec2(p.x*0.0046, (p.y - uHorizon)*0.0105);        // squashed cells: projected at a grazing angle
      vec3 c1 = noised(cq + vec2(uT*0.42, -uT*0.33));
      vec3 c2 = noised(cq*1.9 + c1.yz*0.55 + vec2(-uT*0.37, uT*0.45));
      float web = pow(1.0 - abs(c2.x), 4.0)*(0.55 + 0.45*c1.x);
#ifdef V5
      col += lin(vec3(1.0,0.60,0.80))*web*reg*uCaus*0.09*(1.0 - 0.6*uV5.x);
#else
      col += lin(vec3(1.0,0.60,0.80))*web*reg*uCaus*0.09;
#endif
    }
  }
  if (p.y > uHorizon){
    // ripple rings (specular on the polished floor)
    float ring = ripRings(p);
    col += lin(vec3(1.0,0.66,0.82))*ring*0.55*exp(-uRip.z*2.2);
  }
  if (p.y > uFloorY){
    float dy = p.y - uFloorY;
    vec2 pm = vec2(p.x, 2.0*uFloorY - p.y);
    if (uRip.w > 0.0){
      vec2 rd = (p - uRip.xy)*vec2(1.0, 4.6);
      float rr = length(rd);
      float w = exp(-pow((rr - uRip.z*470.0)/50.0, 2.0))*uRip.w*exp(-uRip.z*1.6);
      pm.x += w*12.0*sin(rr*0.08); pm.y += w*9.0*cos(rr*0.08);
    }
    vec4 Fm = field(pm);
    vec4 lm = shadeLiquid(pm, Fm, 1.0, 1.0);
    float fade = exp(-dy/80.0)*0.50*ss(170.0, 90.0, dy);
#ifdef V5
    fade *= 1.0 - uV5.w*ss(uV5b.y, uV5b.y*0.6, abs(p.x - uV5b.x));
#endif
    col = mix(col, lm.rgb*0.75, lm.a*fade);
  }
  // contact darkening where liquid meets the floor
  {
    vec4 Fc = field(vec2(p.x, uFloorY - 3.0));
    float cont = ss(4.0, -10.0, Fc.x)*exp(-abs(p.y - uFloorY)/7.0);
    col *= 1.0 - 0.65*cont;
  }
  // horizon: faint polished edge
  float hl = exp(-abs(p.y - hzc)/34.0)*ss(0.0, 800.0, 980.0-abs(p.x-960.0));
  col += lin(vec3(0.60,0.30,0.62))*hl*0.035;
  // ---- liquid ----
  vec4 L = shadeLiquid(p, F, 1.0, 0.0);
  // soda carbonation: tiny bubbles inside the liquid (brighter rim, dark core edge, specular pip)
  if (L.a > 0.0 && uNBub > 0){ vec4 bb = bubbleLayer(p, F.w); L.rgb = L.rgb*(1.0 - 0.35*bb.a) + bb.rgb*0.8; }
  // ball lens (opening macro): a real, inverted, barrel-compressed image of the 'drop' wordmark inside the pour bulb
  if (uLens2.w > 0.0 && L.a > 0.0){
    vec2 q = (p - uLens.xy)/uLens.zw;
    float rq = length(q);
    if (rq < 0.95){
      // r2 P6: barrel refraction (about 1.3x at the centre, 0.6x at the limb), 1-1.5 px soft focus, 1-2 px chromatic
      // split toward the limb, swims +-3 px with the bulb; multiply-tinted #FFBD4D so it reads as an image, not a decal
      float pxs = uLens2.z/(uLens.z*uCam.x);          // tex px per screen px
      vec2 sw = vec2(sin(uT*11.0 + 0.7), cos(uT*8.3))*3.0*pxs;
      vec2 tq = uLens2.xy - q*(1.0 + 0.48*rq*rq)*uLens2.z/1.12 + sw;
      vec2 rdir = q/max(rq, 1e-3)*pxs*(0.6 + 1.6*rq);
      vec4 tA = texture(uTex, (tq + rdir)/uTexSize), tB = texture(uTex, tq/uTexSize), tC = texture(uTex, (tq - rdir)/uTexSize);
      vec3 sd3 = vec3(min(min(tA.r, tA.g), min(tA.b, tA.a)), min(min(tB.r, tB.g), min(tB.b, tB.a)), min(min(tC.r, tC.g), min(tC.b, tC.a)));
      float soft = 1.4*pxs*(1.0 + 0.6*rq);
      vec3 ink = vec3(ss(soft, -soft, sd3.x), ss(soft, -soft, sd3.y), ss(soft, -soft, sd3.z))*(1.0 - ss(0.55, 0.9, rq));
      vec3 tint = lin(vec3(1.0, 0.741, 0.302));
      float lum = dot(L.rgb, vec3(0.3, 0.55, 0.15));
      vec3 tgt = mix(L.rgb, L.rgb*0.35 + tint*(0.55 + 1.2*lum)*(1.25 - 0.45*rq), 0.6);
      L.rgb = mix(L.rgb, tgt, ink*uLens2.w);
    }
  }
  col = mix(col, L.rgb, L.a);
  // ---- overlay flood sheets ----
  for (int i=0;i<3;i++){
    if (uOv[i].w < 0.5) continue;
    // top sheet crisp, back sheets softer (depth); fast edges are additionally blurred by the distance they travel between
    // two shutter samples, so the averaged samples form one continuous streak instead of stacked strata
    float bw = max(i==2 ? 3.0 : (i==1 ? 5.0 : 8.0), uOvV[i]*uCam.x*uMbw*1.7);
    vec3 fsd = floodSD(p - so*1.4, uOv[i], uOvA[i], uOvB[i]);
    col *= 1.0 - 0.55*ss(30.0 + bw*0.5, -40.0 - bw*0.5, fsd.x);
    vec3 fd = floodSD(p, uOv[i], uOvA[i], uOvB[i]);
    float ca2 = ss(bw*0.5, -bw*0.5, fd.x*uCam.x);
    if (ca2 <= 0.0) continue;
    // motion-blurred edges also get a proportionally wider height ramp, so the Fresnel rim streaks instead of strobing
    vec4 O = shadeLiquid(p, vec4(min(fd.x/(1.0 + 0.12*bw/uCam.x), -0.6), fd.yz, uOvA[i].w), 0.0, 2.0);
    { // r2 P4: under-surface light field (lighter top, darker bottom, 4 slow caustic shafts) replaces the marble
      float inner = ss(50.0, 240.0, -fd.x);
      if (inner > 0.0){
        float sy = clamp((p.y - uCam.z + 540.0/uCam.x)/(1080.0/uCam.x), 0.0, 1.0);
        float uo = uOvA[i].w;
        vec3 lf = mix(palThin(uo)*1.05, palDeep(uo)*0.42, ss(0.0, 1.0, sy));
        float shf = 0.0;
        for (int k=0;k<4;k++){ float fk = float(k); float xk = 260.0 + 470.0*fk + 70.0*sin(uT*0.6 + fk*1.9);
          float dd = (p.x + (p.y - 200.0)*0.34 - xk)/(40.0 + 26.0*fract(fk*0.37)); shf += exp(-dd*dd)*(0.6 + 0.4*sin(uT*1.4 + fk*2.3)); }
        lf += palThin(uo)*shf*0.42*(1.0 - 0.75*sy);
        O.rgb = mix(O.rgb, lf, inner*0.72);
      }
    }
    // thick-liquid front: bright 8-12 px meniscus just inside the edge (widened, not multiplied, when motion-blurred)
    float mw = 3.4 + 0.5*bw/uCam.x;
    float men = exp(-pow((fd.x + 7.0 + 0.3*bw/uCam.x)/mw, 2.0))*(3.4/mw);
    O.rgb += (palThin(uOvA[i].w)*1.1 + lin(vec3(1.0,0.94,0.96))*0.75)*men;
    // subject: the liquid behind this sheet (the four seed blobs, the spray) as dense backlit silhouettes with a thin rim
    if (F.x < -3.0){       // only bodies deeper than the spray: small droplets stay hidden, the seeds read as the subject
      // r2 P4: thick backlit bodies: warm transmitted core offset toward the key, deep edges, 2-3 px rim, one sharp
      // specular, and the light field behind refracted through them (offset = normal x 25 px)
      float xin = -F.x;
      vec2 gn = F.yz/max(length(F.yz), 1e-3);
      float edge = exp(-xin/16.0);
      vec3 nb = normalize(vec3(gn*(0.25 + 1.5*edge), 1.0));
      vec2 kd = normalize(vec2(-0.55, -0.7));
      float coreK = ss(4.0, 46.0, xin)*(0.62 + 0.38*dot(-gn, -kd)*(1.0 - edge));
      vec3 bodyC = mix(palDeep(F.w)*0.55, palThin(F.w)*1.9 + lin(vec3(1.0,0.72,0.45))*0.5, coreK);
      vec2 pr = p - nb.xy*25.0;
      float shr = 0.0;
      for (int k=0;k<4;k++){ float fk = float(k); float xk = 260.0 + 470.0*fk + 70.0*sin(uT*0.6 + fk*1.9);
        float dd = (pr.x + (pr.y - 200.0)*0.34 - xk)/(40.0 + 26.0*fract(fk*0.37)); shr += exp(-dd*dd); }
      bodyC += palThin(F.w)*shr*0.5;
      float cb = ss(-1.0, -4.0, F.x);
      float rim = exp(-pow((F.x + 2.0)/1.2, 2.0));
      vec3 rb = reflect(vec3(0.0,0.0,-1.0), nb);
      float spk = pow(max(dot(rb, normalize(vec3(-0.5, -0.62, 0.6))), 0.0), 220.0);
      O.rgb = mix(O.rgb, bodyC, cb*0.88) + palThin(F.w)*rim*0.45 + lin(vec3(1.0,0.96,0.94))*spk*3.0*cb;
    }
    if (uNBub > 0){ vec4 bb = bubbleLayer(p, uOvA[i].w); O.rgb = O.rgb*(1.0 - 0.35*bb.a) + bb.rgb*0.55; }
    col = mix(col, O.rgb, ca2);
  }
  oCol = vec4(col, 1.0);
}`;

export const FS_BRIGHT = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
${COMMON}
uniform sampler2D uSrc; uniform vec2 uTexel;
void main(){
  vec3 c = vec3(0.0);
  for (int j=-1;j<=1;j++) for (int i=-1;i<=1;i++) c += texture(uSrc, vUv + vec2(i,j)*uTexel).rgb;
  c /= 9.0;
  float l = max(max(c.r,c.g),c.b);
  vec3 b = c*ss(0.85, 2.2, l);
  o = vec4(b, 1.0);
}`;

export const FS_POST = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
${COMMON}
uniform sampler2D uHdr; uniform sampler2D uBloom; uniform sampler2D uType;
uniform vec2 uRes; uniform float uFrame; uniform float uBloomAmt; uniform float uFlash;
vec3 bloomAt(vec2 uv){
  vec3 b = vec3(0.0);
  float w = 0.0;
  for (int l=1;l<7;l++){
    float lf = float(l);
    vec2 px = exp2(lf)/vec2(960.0,540.0);
    vec3 s = textureLod(uBloom, uv + px*vec2(0.5,0.5), lf).rgb + textureLod(uBloom, uv + px*vec2(-0.5,0.5), lf).rgb
           + textureLod(uBloom, uv + px*vec2(0.5,-0.5), lf).rgb + textureLod(uBloom, uv + px*vec2(-0.5,-0.5), lf).rgb;
    float wl = 1.0/(1.0+lf*0.6);
    b += s*0.25*wl; w += wl;
  }
  return b/w;
}
vec3 tonemap(vec3 x){
  // hue-preserving shoulder + highlight desaturation toward white
  float m = max(max(x.r,x.g),x.b);
  float k = 0.72;
  float mt = m < k ? m : k + (1.0-k)*(1.0 - exp(-(m-k)/(1.0-k)));
  vec3 c = x*(mt/max(m,1e-5));
  float wh = ss(1.0, 6.0, m);
  return mix(c, vec3(mt), wh*0.85);
}
void main(){
  vec3 hdr = texture(uHdr, vUv).rgb;
  hdr += bloomAt(vUv)*uBloomAmt;
  hdr *= exp2(uFlash);               // exposure in EV
  vec3 c = tonemap(hdr);
  // subtle vignette
  vec2 q = vUv - 0.5; q.x *= uRes.x/uRes.y;
  c *= 1.0 - 0.28*ss(0.35, 1.05, length(q));
  vec3 s = pow(max(c,0.0), vec3(1.0/2.2));
  // front typography (already sRGB, premultiplied)
  vec4 ty = texture(uType, vec2(vUv.x, 1.0-vUv.y));
  s = s*(1.0-ty.a) + ty.rgb;
  // film grain (boils per frame) + dither
  vec2 fc = gl_FragCoord.xy;
  float g = hash12(fc + uFrame*vec2(37.1, 91.7)) + hash12(fc*1.37 + uFrame*vec2(11.3, 53.9)) - 1.0;
  float lum = dot(s, vec3(0.299,0.587,0.114));
  s += g*(0.030*(1.0-lum)*ss(0.0,0.25,lum) + 0.012);
  o = vec4(s, 1.0);
}`;
