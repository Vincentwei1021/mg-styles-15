// Reel v5.1 only (?v5=1): the NIGHT grade of ISOPOLIS. Jury note: the film sat between two light films and its lilac
// matched 04-3d-render, so under v5 the city plays at night. Everything here re-grades the already-built scene
// (world.js stays read-only, the default path never imports this file):
//  - navy/indigo void + dim iso floor dots (the cyan ping and the hero wave glow stay),
//  - a cool moon key + navy hemisphere instead of the warm sun (the three iso faces keep their light/mid/dark read),
//  - deep indigo soil strata and tile/building albedos pulled toward navy,
//  - warm amber windows (a few lit while the city grows, ~86 % light up with the hero wave, as in the film),
//  - amber street lamps on the ring road that switch on as the hero wave passes them,
//  - a sustained light column after the hit, lower bloom threshold, darker vignette, navy-glass callout cards.
// Knobs (query, v5 only): nk = albedo scale, nsun/nhemi = moon/hemi intensity, nexp = exposure (applied in main.js).
import * as THREE from 'three';
import * as A from './anim.js';
import { LAYER_GLOW } from './render.js';

const C = (h) => new THREE.Color(h);

export function applyNight(world, acc, cues, q, o = {}) {
  const { scene, bgU, island, sun, onUpdate, hopPatch } = world;
  const num = (k, d) => (q.get(k) != null ? +q.get(k) : d);
  const K = num('nk', 0.8), SUN_I = num('nsun', 1.35), HEMI_I = num('nhemi', 1.25);
  const skip = o.skip || new Set();

  // ------------------------------------------------------------------ lights (re-set after every world.update)
  let hemi = null, fill = null;
  scene.traverse((ob) => { if (ob.isHemisphereLight) hemi = ob; else if (ob.isDirectionalLight && ob !== sun) fill = ob; });
  const MOON = C('#9DB0FF'), HEMI_SKY = C('#5360C4'), HEMI_GND = C('#17153F'), FILL = C('#7A5CE0');
  scene.environmentIntensity = 0.12;

  // ------------------------------------------------------------------ void + floor
  bgU.uTop.value.set('#' + (q.get('nbg') || '42489E')); bgU.uMid.value.set('#32368A'); bgU.uLow.value.set('#232770');
  bgU.uTopK.value.set('#40448E'); bgU.uMidK.value.set('#32357E'); bgU.uLowK.value.set('#252866'); // pre-wave: greyer, same weight
  bgU.uDot.value.set('#5B64C0');
  bgU.uHot.value.set('#46D2DC'); // the cyan ping/wave: a touch softer, it carries more contrast on navy
  const fu = acc.finalMat.uniforms;
  fu.uVigColor.value.set(0.42, 0.42, 0.72); fu.uVignette.value = 0.3;
  acc.bloom.threshold = num('nbt', 0.9); acc.bloom.strength = num('nbs', 0.2); acc.bloom.radius = num('nbr', 0.35);

  // ------------------------------------------------------------------ albedos
  // linear-space scale toward indigo: keeps each colour's hue identity (mint -> teal-navy, coral -> plum-rose) at night
  const TINT = new THREE.Color(0.78, 0.84, 1.0);
  // light colours are pulled down harder than mid tones (white clay 0.55 K, mint 0.72 K) so the island reads navy, not grey
  const nightCol = (c, k = K) => { const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; c.multiply(TINT).multiplyScalar(k * (1 - 0.45 * Math.min(l, 1))); return c; };
  const KC = K * num('nkc', 1.0); // clay phase (before the hero wave repaints the city): darker still, the unlit city
  const done = new Set();
  const coreSet = new Set(); world.v5.core.traverse((ob) => coreSet.add(ob));
  const instColored = new Set();
  scene.traverse((ob) => { if (ob.isInstancedMesh && ob.instanceColor) instColored.add(ob.material); });
  const winMats = [];
  scene.traverse((ob) => {
    if (!ob.isMesh || skip.has(ob)) return;
    const mats = Array.isArray(ob.material) ? ob.material : [ob.material];
    for (const m of mats) {
      if (!m || done.has(m) || !m.isMeshStandardMaterial) continue;
      done.add(m);
      const u = m.userData.u;
      const isCoreWin = u && u.uWinOn && coreSet.has(ob);
      if (isCoreWin) continue; // the CORE is already ink + cyan: it reads as the lit hero tower at night as it is
      if (!instColored.has(m)) nightCol(m.color);
      m.envMapIntensity *= 0.6;
      if (u && u.uClay) nightCol(u.uClay.value, KC);
      if (u && u.uWinOn) { // facade windows: amber at night
        u.uWinOn.value.set('#FFB85C'); u.uWinOff.value.set('#1C2052'); u.uClayWin.value.set('#23275A');
        u.uEmit.value = num('nwin', 1.5); u.uLitFrac.value = Math.min(u.uLitFrac.value, 0.42);
        winMats.push(m);
      }
      if (m.emissiveIntensity > 0 && m.emissive.getHex() !== 0) m.emissiveIntensity *= 1.6; // headlights, masts, drone eyes
    }
  });
  // cloud puffs: moonlit, faint
  scene.traverse((ob) => {
    if (ob.isMesh && ob.material && ob.material.emissive && ob.material.emissive.getHex() === C('#F1EEFF').getHex()) {
      ob.material.color.multiplyScalar(0.45); ob.material.emissive.set('#3A44A8'); ob.material.emissiveIntensity = 0.4; // faint blue moonlit puffs
    }
  });
  // instance colours (tiles, water, trees) + the tiles' clay face attribute
  const tmp = new THREE.Color();
  scene.traverse((ob) => {
    if (!ob.isInstancedMesh) return;
    if (ob.instanceColor) {
      for (let i = 0; i < ob.count; i++) { ob.getColorAt(i, tmp); ob.setColorAt(i, nightCol(tmp)); }
      ob.instanceColor.needsUpdate = true;
    }
    const ac = ob.geometry.attributes.aClay;
    if (ac && !ac.userData?.night) {
      for (let i = 0; i < ac.count; i++) { tmp.setRGB(ac.getX(i), ac.getY(i), ac.getZ(i)); nightCol(tmp, KC); ac.setXYZ(i, tmp.r, tmp.g, tmp.b); }
      ac.userData = { night: true }; ac.needsUpdate = true;
    }
  });
  // soil strata (the uniforms are created in onBeforeCompile: override them there)
  const STRATA = ['#3C4192', '#2C3076', '#23265F', '#1B1D4B'].map(C);
  scene.traverse((ob) => {
    const m = ob.material;
    if (!ob.isMesh || !m || !m.customProgramCacheKey || !String(m.customProgramCacheKey()).includes('soil-v1') || m.userData.night) return;
    m.userData.night = true;
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => { prev.call(m, sh, r); ['c1', 'c2', 'c3', 'c4'].forEach((k, i) => sh.uniforms[k].value.copy(STRATA[i])); };
    m.needsUpdate = true;
  });

  // ------------------------------------------------------------------ street lamps on the ring road (outer curb)
  const lampLoop = (() => { // same rounded-square loop as the road, offset to the outer curb
    const a = 3.5 + 0.43, rc = 0.5 + 0.43, st = 2 * (a - rc), arc = Math.PI / 2 * rc, seg = st + arc, L = 4 * seg;
    return { L, at(s) {
      s = ((s % L) + L) % L; const k = Math.floor(s / seg), r = s - k * seg;
      const starts = [[a, -(a - rc)], [a - rc, a], [-a, a - rc], [-(a - rc), -a]], dirs = [[0, 1], [-1, 0], [0, -1], [1, 0]];
      const corners = [[a - rc, a - rc], [-(a - rc), a - rc], [-(a - rc), -(a - rc)], [a - rc, -(a - rc)]];
      if (r < st) return { x: starts[k][0] + dirs[k][0] * r, z: starts[k][1] + dirs[k][1] * r };
      const ang = [0, Math.PI / 2, Math.PI, -Math.PI / 2][k] + (r - st) / rc;
      return { x: corners[k][0] + rc * Math.cos(ang), z: corners[k][1] + rc * Math.sin(ang) };
    } };
  })();
  const PULSE_T = world.v5.PULSE_T, PULSE_V = cues.pulse_speed;
  const postMat = new THREE.MeshStandardMaterial({ color: C('#2A2E62'), roughness: 0.5, envMapIntensity: 0.3 });
  hopPatch(postMat);
  const postGeo = new THREE.CylinderGeometry(0.014, 0.02, 0.5, 8).translate(0, 0.25, 0);
  const armGeo = new THREE.BoxGeometry(0.1, 0.018, 0.028).translate(0.04, 0.5, 0);
  const headGeo = new THREE.SphereGeometry(0.042, 14, 10);
  const poolGeo = new THREE.CircleGeometry(0.5, 40).rotateX(-Math.PI / 2);
  const poolVert = 'varying vec2 vP; void main(){ vP = position.xz / 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }';
  const poolFrag = 'uniform float uI; uniform vec3 uCol; varying vec2 vP; void main(){ float r = length(vP); float a = uI * pow(max(1.0 - r, 0.0), 1.8); gl_FragColor = vec4(uCol * a, a); }';
  const lamps = [];
  const NL = 20;
  for (let k = 0; k < NL; k++) {
    const p = lampLoop.at((k + 0.25) / NL * lampLoop.L);
    const g = new THREE.Group(); g.position.set(p.x, 0, p.z); island.add(g);
    const post = new THREE.Mesh(postGeo, postMat); post.castShadow = true; g.add(post);
    const arm = new THREE.Mesh(armGeo, postMat); arm.rotation.y = Math.atan2(p.x, p.z) + Math.PI / 2; g.add(arm); // arm leans over the road
    const hm = new THREE.MeshStandardMaterial({ color: C('#FFE2A8'), roughness: 0.3, emissive: C('#FFB14E'), emissiveIntensity: 0 });
    hopPatch(hm);
    const head = new THREE.Mesh(headGeo, hm);
    const inward = new THREE.Vector3(-p.x, 0, -p.z).normalize();
    head.position.set(inward.x * 0.08, 0.49, inward.z * 0.08); g.add(head);
    const pm = new THREE.ShaderMaterial({ uniforms: { uI: { value: 0 }, uCol: { value: C('#FFA94A') } }, vertexShader: poolVert, fragmentShader: poolFrag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pool = new THREE.Mesh(poolGeo, pm); pool.position.set(inward.x * 0.18, 0.004, inward.z * 0.18); pool.layers.set(LAYER_GLOW); g.add(pool);
    const r = Math.max(Math.abs(p.x), Math.abs(p.z));
    lamps.push({ g, hm, pm, t0: cues.roads + 0.1 + k * 0.012, ta: PULSE_T + Math.max(r - 1.0, 0) / PULSE_V });
  }
  onUpdate((T) => {
    for (const L of lamps) {
      const s = A.spring(T - L.t0, 22, 0.5, 9);
      L.g.visible = T > L.t0; L.g.scale.setScalar(Math.max(s, 1e-4));
      const u = T - L.ta;
      const on = u < 0 ? 0.18 : 1 + 1.6 * Math.exp(-u * 6); // dim before the hit, flash on as the wave passes, then steady
      L.hm.emissiveIntensity = (T > L.t0 + 0.3 ? 1 : 0) * on * 2.4;
      L.pm.uniforms.uI.value = u < 0 ? 0 : 0.55 * A.smooth(A.inv(0.12, 0.55, u));
    }
  });

  // ------------------------------------------------------------------ light column: brighter, and it keeps burning
  const beam = world.v5.beam;
  const beam2 = world.v5.core.children.find((c) => c !== beam && c.material && c.material.uniforms && c.material.uniforms.uI && c.geometry.type === 'CylinderGeometry');
  const hold = (T) => { const u = T - PULSE_T; return u <= 0 ? 0 : 0.8 * A.smooth(A.inv(0.15, 0.6, u)) * (1 - A.smooth(A.inv(7.72, 8.02, T))); };
  const env = (T) => { const u = T - PULSE_T; return u < 0 ? 0 : (u < 0.012 ? u / 0.012 : Math.exp(-(u - 0.012) * 5.0)); };

  // ------------------------------------------------------------------ callout cards: navy glass
  const st = document.createElement('style');
  st.textContent = `
    .tg .face { background: rgba(26,29,78,0.94) !important; box-shadow: 0 0 0 1.5px rgba(125,246,247,0.35), 0 10px 0 -4px rgba(0,0,0,0.25) !important; }
    .tg .lab, .tg .val { color: #F4F1FF !important; } .tg .en { color: #9FA8F0 !important; } .tg .unit { color: rgba(244,241,255,0.7) !important; }
    .tg svg.lead polyline { stroke: rgba(190,198,255,0.75); } .tg svg.lead circle.kn { fill: #1A1D4E; stroke: rgba(190,198,255,0.75); }
    .tg svg.spark line { stroke: rgba(190,198,255,0.25); } .tg .dot { box-shadow: 0 0 0 3px rgba(26,29,78,0.92) !important; }`;
  document.head.appendChild(st);

  // pose-time overrides. Call AFTER world.update(T).
  function post(T) {
    const kc = 1 - A.smooth(A.inv(PULSE_T, PULSE_T + 0.4, T)); // clay phase (no city lights yet): brighter moon + sky fill
    sun.color.copy(MOON); sun.intensity = SUN_I * (1 + 0.45 * kc);
    if (hemi) { hemi.color.copy(HEMI_SKY); hemi.groundColor.copy(HEMI_GND); hemi.intensity = HEMI_I * (1 + 0.3 * kc); }
    if (fill) { fill.color.copy(FILL); fill.intensity = 0.35; }
    const u = T - PULSE_T;
    if (u > 0) {
      beam.material.uniforms.uI.value = env(T) * 3.4 + 0.1 + hold(T);
      if (beam2) beam2.material.uniforms.uI.value = env(T) * 0.6 + hold(T) * 0.35;
    }
  }
  // link alpha of the column (white core) for linkAt
  const columnA = (T) => Math.min(1, env(T) * 1.5 + hold(T) * 1.2);
  return { post, hold, columnA, lamps };
}
