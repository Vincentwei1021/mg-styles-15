// Three.js holographic wireframe Earth (Natural Earth 50m coastlines), pure function of t
import * as THREE from 'three';
import { DEG, TARGET, CND, LOCK, E, prog, clamp, lerp, hermite, hash } from './util.js';

const ll = (lat, lon, r = 1) => {
  const a = lat * DEG, b = lon * DEG;
  return new THREE.Vector3(Math.cos(a) * Math.sin(b) * r, Math.sin(a) * r, Math.cos(a) * Math.cos(b) * r);
};

const VS = `
attribute float aU; attribute float aS;
uniform vec3 uCam;
varying float vU; varying float vS; varying float vFace; varying vec3 vW; varying float vLat;
void main(){
  vLat = position.y;
  vec4 wp = modelMatrix * vec4(position,1.0);
  vec3 n = normalize(wp.xyz);
  vFace = dot(n, normalize(uCam - wp.xyz));
  vW = wp.xyz; vU = aU; vS = aS;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const FS = `
uniform float uGrow, uSpread, uAlpha, uBack, uHead, uScanY, uFaceMode, uDash, uTime;
uniform vec3 uColor; uniform vec3 uTgt; uniform float uPulse, uPulseAmp, uFocus, uLimb;
varying float vU; varying float vS; varying float vFace; varying vec3 vW; varying float vLat;
void main(){
  float g = uGrow * (1.0 + uSpread) - vS * uSpread;
  if (vU > g) discard;
  if (uDash > 0.0 && fract(vU * uDash - uTime * 0.15) > 0.55) discard;
  float head = smoothstep(g - 0.035, g, vU) * uHead * (1.0 - step(0.9999, uGrow));
  float f0 = vFace > 0.0 ? mix(0.5, 1.0, smoothstep(0.0, 0.45, vFace)) : uBack;
  float f1 = vFace > 0.0 ? mix(0.16, 1.0, smoothstep(0.15, 0.5, vFace)) * mix(1.0, 0.6, smoothstep(0.83, 0.88, vLat)) : uBack * 0.6;
  float face = uFaceMode > 0.5 ? mix(f0, f1, uLimb) : 1.0;
  float scan = exp(-pow((vW.y - uScanY) / 0.045, 2.0));
  float ang = acos(clamp(dot(normalize(vW), uTgt), -1.0, 1.0));
  float pulse = uPulseAmp * exp(-pow((ang - uPulse) / 0.006, 2.0));
  float focus = mix(1.0, 0.35 + 1.1 * exp(-ang * ang / 0.012), uFocus);
  float a = uAlpha * face * focus;
  vec3 c = uColor * a + vec3(0.75, 1.0, 1.0) * (head * 0.9 + (scan * 0.55 + pulse) * face);
  gl_FragColor = vec4(c, 1.0);
}`;
const PVS = `
attribute float aS;
uniform vec3 uCam; uniform float uSize;
varying float vFace; varying float vS; varying vec3 vW; varying float vLat;
void main(){
  vLat = position.y;
  vec4 wp = modelMatrix * vec4(position,1.0);
  vFace = dot(normalize(wp.xyz), normalize(uCam - wp.xyz)); vS = aS; vW = wp.xyz;
  vec4 mv = viewMatrix * wp;
  gl_PointSize = uSize * clamp(2.2 / -mv.z, 0.6, 2.4);
  gl_Position = projectionMatrix * mv;
}`;
const PFS = `
uniform float uGrow, uAlpha; uniform vec3 uColor; uniform vec3 uTgt; uniform float uFocus, uScanY, uLimb;
varying float vFace; varying float vS; varying vec3 vW; varying float vLat;
void main(){
  if (vS > uGrow) discard;
  vec2 d = gl_PointCoord - 0.5; float r = length(d);
  float m = smoothstep(0.5, 0.2, r);
  float face = vFace > 0.0 ? smoothstep(0.0, 0.35, vFace) * mix(1.0, smoothstep(0.15, 0.5, vFace) * mix(1.0, 0.6, smoothstep(0.83, 0.88, vLat)), uLimb) : 0.0;
  float ang = acos(clamp(dot(normalize(vW), uTgt), -1.0, 1.0));
  float focus = mix(1.0, 0.3 + 1.2 * exp(-ang * ang / 0.01), uFocus);
  float scan = exp(-pow((vW.y - uScanY) / 0.045, 2.0));
  gl_FragColor = vec4(uColor * m * face * uAlpha * focus + vec3(0.6,1.0,1.0) * scan * m * face * 0.5, 1.0);
}`;

function lineMat(o) {
  return new THREE.ShaderMaterial({
    vertexShader: VS, fragmentShader: FS, transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uCam: { value: new THREE.Vector3() }, uGrow: { value: 0 }, uSpread: { value: o.spread ?? 0.6 },
      uAlpha: { value: o.alpha ?? 1 }, uBack: { value: o.back ?? 0.12 }, uHead: { value: o.head ?? 1 },
      uScanY: { value: 9 }, uFaceMode: { value: o.face ?? 1 }, uDash: { value: o.dash ?? 0 }, uTime: { value: 0 },
      uColor: { value: new THREE.Color(...(o.color || [0, 0.9, 1])) }, uTgt: { value: new THREE.Vector3(0, 0, 1) },
      uPulse: { value: 0 }, uPulseAmp: { value: 0 }, uFocus: { value: 0 }, uLimb: { value: 1 },
    },
  });
}
// polylines -> LineSegments with per-vertex aU (0..1 along line) and per-line aS (start offset)
function buildLines(lines, mat, seed = 1) {
  const pos = [], U = [], S = [];
  lines.forEach((pts, li) => {
    let L = 0; const cum = [0];
    for (let i = 1; i < pts.length; i++) { L += pts[i].distanceTo(pts[i - 1]); cum.push(L); }
    if (L <= 0) return;
    const s = hash(seed, li);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z); U.push(cum[i - 1] / L, cum[i] / L); S.push(s, s);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aU', new THREE.Float32BufferAttribute(U, 1));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(S, 1));
  const m = new THREE.LineSegments(g, mat); m.frustumCulled = false; return m;
}

// post-dive map intelligence: cities (static) + sea tracks (moving, deg/s)
const CITIES = [['YTY', '扬州', 32.39, 119.41], ['YNZ', '盐城', 33.35, 120.16], ['JHA', '金华', 29.08, 119.65], ['HYN', '台州', 28.66, 121.42], ['WNZ', '温州', 28.00, 120.70]];
export const H0 = 6.35;
const TRACKS = [['TRK 11', 33.05, 123.25, -0.040, -0.050], ['TRK 12', 32.25, 122.55, 0.030, 0.055], ['TRK 14', 28.95, 122.75, 0.045, -0.030]];
export function createHolo(topo, landMask) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.005, 100);
  const tilt = new THREE.Group(); const spin = new THREE.Group();
  tilt.rotation.order = 'XYZ'; tilt.add(spin); scene.add(tilt);
  const mats = [];
  const reg = (m) => (mats.push(m), m);

  // coastlines
  const land = topojson.feature(topo, topo.objects.land);
  const rings = [];
  for (const f of land.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) for (const ring of poly) {
      if (ring.length < 4) continue;
      rings.push(ring.map(([lon, lat]) => ll(lat, lon, 1.0015)));
    }
  }
  const coastMat = reg(lineMat({ alpha: 0.9, back: 0.09, spread: 0.55 }));
  spin.add(buildLines(rings, coastMat, 3));

  // graticule 10°
  const grat = [];
  for (let lat = -80; lat <= 80; lat += 10) { const p = []; for (let lon = -180; lon <= 180; lon += 2) p.push(ll(lat, lon)); grat.push(p); }
  for (let lon = -180; lon < 180; lon += 10) { const p = []; for (let lat = -90; lat <= 90; lat += 2) p.push(ll(lat, lon)); grat.push(p); }
  const gratMat = reg(lineMat({ color: [0, 0.495, 1], alpha: 0.2, back: 0.05, spread: 0.2, head: 0.4 }));
  spin.add(buildLines(grat, gratMat, 5));
  // fine 1° grid around target (fades in with zoom)
  const fine = [];
  for (let lat = 22; lat <= 41; lat += 1) { const p = []; for (let lon = 110; lon <= 133; lon += 0.5) p.push(ll(lat, lon, 1.0005)); fine.push(p); }
  for (let lon = 110; lon <= 133; lon += 1) { const p = []; for (let lat = 22; lat <= 41; lat += 0.5) p.push(ll(lat, lon, 1.0005)); fine.push(p); }
  const fineMat = reg(lineMat({ color: [0, 0.495, 1], alpha: 0.0, back: 0.0, spread: 0.3, head: 0.6 }));
  spin.add(buildLines(fine, fineMat, 9));

  // dotted land (fibonacci) + dense patch near target
  const inLand = (lat, lon) => {
    const x = Math.floor((lon + 180) / 360 * landMask.w) % landMask.w, y = Math.floor((90 - lat) / 180 * landMask.h);
    return landMask.data[(y * landMask.w + x) * 4 + 3] > 128;
  };
  const mkPoints = (arr, size, alpha) => {
    const pos = [], S = [];
    arr.forEach(([lat, lon], i) => { const v = ll(lat, lon, 1.001); pos.push(v.x, v.y, v.z); S.push(hash(11, i)); });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aS', new THREE.Float32BufferAttribute(S, 1));
    const m = new THREE.ShaderMaterial({ vertexShader: PVS, fragmentShader: PFS, transparent: true, depthTest: false,
      depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uCam: { value: new THREE.Vector3() }, uSize: { value: size }, uGrow: { value: 0 }, uAlpha: { value: alpha },
        uColor: { value: new THREE.Color(0, 0.4125, 0.9) }, uTgt: { value: new THREE.Vector3(0, 0, 1) }, uFocus: { value: 0 }, uScanY: { value: 9 }, uLimb: { value: 1 } } });
    const p = new THREE.Points(g, m); p.frustumCulled = false; spin.add(p); return m;
  };
  const fib = []; const N = 16000, ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i + 0.5) / N * 2, lat = Math.asin(y) / DEG, lon = ((i * ga / DEG) % 360) - 180;
    if (inLand(lat, lon)) fib.push([lat, lon]);
  }
  const dotsMat = reg(mkPoints(fib, 2.0, 0.26));
  const dense = [];
  for (let lat = 18; lat <= 44; lat += 0.13) for (let lon = 104; lon <= 138; lon += 0.13 / Math.cos(lat * DEG)) if (inLand(lat, lon)) dense.push([lat, lon]);
  const denseMat = reg(mkPoints(dense, 1.35, 0.0));

  // atmosphere fresnel shell
  const shellMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    uniforms: { uCam: { value: new THREE.Vector3() }, uA: { value: 0 } },
    vertexShader: `uniform vec3 uCam; varying float vF; void main(){ vec4 wp = modelMatrix*vec4(position,1.0);
      vF = dot(normalize(wp.xyz), normalize(uCam-wp.xyz)); gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `uniform float uA; varying float vF; void main(){ float f = pow(1.0-clamp(vF,0.0,1.0), 3.5);
      gl_FragColor = vec4(vec3(0.0,0.55,0.7)*(f*0.38+0.012)*uA, 1.0); }` });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1.0, 96, 64), shellMat); scene.add(shell);

  // orbit rings (scene space, not spinning with globe)
  const orbit = (r, rx, rz) => { const p = []; for (let a = 0; a <= 360; a += 1) p.push(new THREE.Vector3(Math.cos(a * DEG) * r, 0, Math.sin(a * DEG) * r)); 
    const m = reg(lineMat({ alpha: 0.5, face: 0, spread: 0, head: 0.8, dash: 90 })); const o = buildLines([p], m, 21);
    o.rotation.set(rx, 0, rz); scene.add(o); return { m, o, r }; };
  const orbits = [orbit(1.32, 1.25, 0.32), orbit(1.5, 1.42, -0.5)];

  // target beam + surface rings (in spin space)
  const T = ll(TARGET.lat, TARGET.lon, 1.0);
  const beamMat = reg(lineMat({ alpha: 1.0, face: 0, spread: 0, head: 0 }));
  const beam = buildLines([[T.clone().multiplyScalar(1.0), T.clone().multiplyScalar(1.07)]], beamMat, 31); spin.add(beam);
  const circ = (rad) => { const n = T.clone().normalize(); const u = new THREE.Vector3(0, 1, 0).cross(n).normalize(); const v = n.clone().cross(u);
    const p = []; for (let a = 0; a <= 360; a += 3) p.push(T.clone().multiplyScalar(1.002).addScaledVector(u, Math.cos(a * DEG) * rad).addScaledVector(v, Math.sin(a * DEG) * rad)); return p; };
  const tRingMat = reg(lineMat({ alpha: 0.0, face: 0, spread: 0, head: 0 }));
  spin.add(buildLines([circ(0.012), circ(0.024), circ(0.045)], tRingMat, 41));

  const GA = ll(-9, 28, 1), GB = T.clone().normalize(), GN = GA.clone().cross(GB).normalize();
  const GU = GA.clone().normalize(), GV = GN.clone().cross(GU).normalize();   // circle: cos(a)·GU + sin(a)·GV, a grows toward the target
  const aT = Math.atan2(GB.dot(GV), GB.dot(GU));
  const gc = (a, r = 1) => GU.clone().multiplyScalar(Math.cos(a) * r).addScaledVector(GV, Math.sin(a) * r);
  const allLineMats = mats.filter((m) => m.uniforms.uTgt && m.uniforms.uPulse);
  const tmp = new THREE.Vector3();

  function update(t) {
    // --- globe orientation: auto drift → hermite turn onto target (4.4–5.4)
    const L = TARGET.lon, t0 = 4.4;
    let lonC;
    if (t < t0) lonC = L - 70 + 8 * (t - t0);
    else if (t < 5.4) lonC = L - 70 + hermite((t - t0) / 1.0, 0, 70, 8, 0);
    else lonC = L;
    const tiltV = t < t0 ? 0.36 : lerp(0.36, TARGET.lat * DEG, E.inOutC(prog(t, t0, 1.0)));
    spin.rotation.y = -lonC * DEG; tilt.rotation.x = tiltV;
    tilt.updateMatrixWorld(true);
    const Tw = T.clone().applyMatrix4(spin.matrixWorld);

    // --- camera: orbit framing → dive at lock
    const z = E.outC(prog(t, LOCK, 1.45));           // dive progress
    const zs = E.inOutC(prog(t, LOCK, 1.9));          // pitch
    const h = Math.exp(lerp(Math.log(H0), Math.log(0.3), z)) + 0.02 * Math.sin(t * 0.7) * z;
    const pitch = lerp(0, 38, zs) * DEG;
    const drift = 0.7 * Math.sin(t * 0.9) * DEG * z;
    const dir = new THREE.Vector3(Math.sin(drift), -Math.sin(pitch), Math.cos(pitch)).normalize();
    const look = Tw.clone().multiplyScalar(lerp(0, 1, E.inOutC(prog(t, LOCK, 0.9))));
    // before lock look at origin (globe centred); after, look at the target point (which sits on the z axis)
    camera.position.copy(Tw.clone().normalize().multiplyScalar(1).addScaledVector(dir, h));
    if (t < LOCK) camera.position.set(0, 0, H0 + 1);
    camera.lookAt(t < LOCK ? new THREE.Vector3(0, 0, 0) : look);
    camera.updateMatrixWorld(true); camera.updateProjectionMatrix();

    const cam = camera.position;
    for (const m of mats) { if (m.uniforms.uCam) m.uniforms.uCam.value.copy(cam); if (m.uniforms.uTime) m.uniforms.uTime.value = t; }
    shellMat.uniforms.uCam.value.copy(cam);

    // --- build-on
    const grow = E.inOutC(prog(t, 1.35, 1.25));
    coastMat.uniforms.uGrow.value = grow;
    gratMat.uniforms.uGrow.value = E.outC(prog(t, 1.2, 1.0));
    dotsMat.uniforms.uGrow.value = E.outC(prog(t, 2.0, 1.2));
    shellMat.uniforms.uA.value = E.outC(prog(t, 1.2, 1.0)) * (1 - z);
    orbits.forEach((o, i) => { o.m.uniforms.uGrow.value = E.outC(prog(t, 1.9 + i * 0.25, 0.8)); o.m.uniforms.uAlpha.value = 0.55 * (1 - z);
      o.o.rotation.y = t * (0.18 + i * 0.07); });
    // focus / zoom detail
    fineMat.uniforms.uGrow.value = E.outC(prog(t, LOCK + 0.25, 0.9)); fineMat.uniforms.uAlpha.value = 0.46 * z;
    denseMat.uniforms.uGrow.value = E.outC(prog(t, LOCK + 0.15, 1.0)); denseMat.uniforms.uAlpha.value = 0.62 * z;
    dotsMat.uniforms.uAlpha.value = 0.26 * (1 - 0.8 * z);
    gratMat.uniforms.uAlpha.value = 0.2 * (1 - 0.4 * z);
    const focus = 0.85 * z;
    for (const m of mats) if (m.uniforms.uLimb) m.uniforms.uLimb.value = 1 - z;
    // scan band sweeps: every 2 s pre-lock
    const sp = ((t - 1.4) % 2.0) / 2.0;
    const scanY = t > 1.4 && t < LOCK ? lerp(1.25, -1.25, E.inOutC(sp)) : 9;
    // surface pulse from target after lock (angular radius)
    const pt = t - LOCK;
    const pulse = pt > 0 ? (pt % 1.0) * 0.12 : 0, pAmp = pt > 0.25 ? 0.7 * (1 - (pt % 1.0)) : 0;
    const tn = Tw.clone().normalize();
    for (const m of allLineMats) { m.uniforms.uScanY.value = scanY; m.uniforms.uTgt.value.copy(tn); m.uniforms.uPulse.value = pulse;
      m.uniforms.uPulseAmp.value = pAmp; m.uniforms.uFocus.value = focus; }
    for (const m of [dotsMat, denseMat]) { m.uniforms.uTgt.value.copy(tn); m.uniforms.uFocus.value = focus; m.uniforms.uScanY.value = scanY; }
    beamMat.uniforms.uGrow.value = E.outE(prog(t, LOCK, 0.35)); beamMat.uniforms.uAlpha.value = 1.0;
    tRingMat.uniforms.uGrow.value = E.outC(prog(t, LOCK, 0.5)); tRingMat.uniforms.uAlpha.value = 0.9;

    // --- projections for the 2D HUD
    const proj = (v) => { tmp.copy(v).project(camera); return { x: (tmp.x + 1) * 960, y: (1 - tmp.y) * 540, z: tmp.z }; };
    const faceOf = (v) => v.clone().normalize().dot(cam.clone().sub(v).normalize());
    const out = { target: { ...proj(Tw), face: faceOf(Tw) }, cnd: [] , zoom: z, globeR: 0, lonC, tiltDeg: tiltV / DEG, h };
    for (const c of CND) { const w = ll(c.lat, c.lon, 1).applyMatrix4(spin.matrixWorld); out.cnd.push({ ...proj(w), face: faceOf(w) }); }
    // satellite: angular distance to target (rad) closes 1.35 -> 0.26 (1648 km) over 3.2..6.4 s
    const sa = aT - lerp(1.35, 0.26, E.outC(prog(t, 3.2, 3.2)));
    const trk = [];
    for (let i = 0; i <= 120; i++) { const a = sa - 1.7 + i * (2.6 / 120), w = gc(a, 1.002).applyMatrix4(spin.matrixWorld); trk.push({ ...proj(w), face: faceOf(w), a: a - sa }); }
    const satW = gc(sa, 1.08).applyMatrix4(spin.matrixWorld), nadW = gc(sa, 1.0).applyMatrix4(spin.matrixWorld);
    const fp = []; for (let i = 0; i <= 32; i++) { const q = i / 32 * Math.PI * 2, rr = 0.075;
      const v = gc(sa + Math.cos(q) * rr, 1).addScaledVector(GN, Math.sin(q) * rr).normalize().multiplyScalar(1.002).applyMatrix4(spin.matrixWorld); fp.push({ ...proj(v), face: faceOf(v) }); }
    out.sat = { ...proj(satW), face: faceOf(nadW), nad: proj(nadW), trk, fp, dist: sa - aT };
    out.cities = CITIES.map((c) => { const w = ll(c[2], c[3], 1).applyMatrix4(spin.matrixWorld); return { id: c[0], cn: c[1], ...proj(w), face: faceOf(w) }; });
    const tt = t - 7.0;
    out.tracks = TRACKS.map((c) => { const w = ll(c[1] + c[3] * tt, c[2] + c[4] * tt, 1).applyMatrix4(spin.matrixWorld), w2 = ll(c[1] + c[3] * (tt - 1.5), c[2] + c[4] * (tt - 1.5), 1).applyMatrix4(spin.matrixWorld);
      const p2 = proj(w2); return { id: c[0], ...proj(w), bx: p2.x, by: p2.y, face: faceOf(w), kn: Math.round(Math.hypot(c[3], c[4]) * 260) }; });
    return out;
  }
  return { scene, camera, update };
}
