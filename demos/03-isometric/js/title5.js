// Reel v5 only (?v5=1): the style-name title 「等轴 2.5D」 + the link dot.
// Title: extruded glyphs standing upright on the lavender iso floor (bg group, parallax 0.6), reading along +X (screen
// down-right 30°, the sun-lit +Z face), parallel to the island's front-left edge. The letters grow like the city's walls
// (scaleY spring 14.8/0.61, ~9 % overshoot, 32nd-note stagger, cyan fresh-wall edge that fades). "ISOMETRIC" is a printed
// floor decal in front of them. 等轴 = AlimamaShuHeiTi Bold, 2.5D = Unbounded 800 (the film's wordmark face).
// Dot: a glossy coral ball. It falls in from above onto the CORE base as it lands, rides the telescoping CORE up to the
// antenna tip (it replaces the tiny cyan beacon; the hero light column fires from it), then on the pull-back it hops off
// and lands as the decimal point of "2.5D".
import * as THREE from 'three';
import { parse } from 'opentype';
import * as A from './anim.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LAYER_GLOW } from './render.js';

function glyphShapes(font, ch, size) {
  const path = font.getPath(ch, 0, 0, size);
  const sp = new THREE.ShapePath();
  for (const c of path.commands) {
    if (c.type === 'M') sp.moveTo(c.x, -c.y);
    else if (c.type === 'L') sp.lineTo(c.x, -c.y);
    else if (c.type === 'Q') sp.quadraticCurveTo(c.x1, -c.y1, c.x, -c.y);
    else if (c.type === 'C') sp.bezierCurveTo(c.x1, -c.y1, c.x2, -c.y2, c.x, -c.y);
  }
  return sp.toShapes(false);
}

export async function buildTitle5(world, cues, o) {
  const { bgGroup, onUpdate, PAL, scene, camera } = world;
  const [bufC, bufL] = await Promise.all([
    fetch('/assets/fonts/cjk/alimamashuheiti/AlimamaShuHeiTi-Bold.ttf').then((r) => r.arrayBuffer()),
    fetch('/demos/03-isometric/assets/fonts/Unbounded-800-static.ttf').then((r) => r.arrayBuffer()),
  ]);
  const fC = parse(bufC), fL = parse(bufL);
  const FLOOR = o.floorY;
  const SC = o.sizeC, SL = o.sizeL, DEPTH = o.depth;

  // plane basis: reading direction +X, letter-up +Y, extrusion toward the camera-left along +Z (front cap = lit +Z face)
  const root = new THREE.Group();
  root.matrixAutoUpdate = false;
  bgGroup.add(root);

  const faceMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(o.face || PAL.ink), roughness: 0.5, metalness: 0, envMapIntensity: 0.5 });
  const items = [
    { ch: '等', f: fC, s: SC }, { ch: '轴', f: fC, s: SC }, { gap: o.gap },
    { ch: '2', f: fL, s: SL }, { ch: '.', f: fL, s: SL, dot: true }, { ch: '5', f: fL, s: SL }, { ch: 'D', f: fL, s: SL },
  ];
  // ink floor offset per font: lift so the lowest ink of that font's glyphs rests on the floor (the floor is a bg quad
  // without depth, anything below it would show through)
  const minY = new Map();
  for (const it of items) {
    if (!it.ch || it.dot) continue;
    const bb = it.f.getPath(it.ch, 0, 0, it.s).getBoundingBox();
    minY.set(it.f, Math.max(minY.get(it.f) ?? -1e9, bb.y2)); // opentype y is down: y2 = lowest ink
  }
  let x = 0;
  const letters = [];
  let dotSlot = null, k = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.gap) { x += it.gap; continue; }
    const g = it.f.charToGlyph(it.ch);
    const adv = g.advanceWidth * it.s / it.f.unitsPerEm;
    const lift = minY.get(it.f) ?? 0;
    if (it.dot) {
      const bb = it.f.getPath('.', 0, 0, it.s).getBoundingBox();
      const r = (bb.x2 - bb.x1) / 2;
      dotSlot = { x: x + (bb.x1 + bb.x2) / 2, r, bottom: -bb.y2 + lift };
      x += adv + o.tracking * it.s;
      continue;
    }
    const geo = new THREE.ExtrudeGeometry(glyphShapes(it.f, it.ch, it.s),
      { depth: DEPTH, bevelEnabled: true, bevelThickness: o.bevel, bevelSize: o.bevel * 0.9, bevelSegments: 3, curveSegments: 12 });
    geo.translate(0, lift, -DEPTH / 2);
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const cx = (bb.min.x + bb.max.x) / 2;
    geo.translate(-cx, -bb.min.y, 0); // pivot: glyph centre, on the floor
    const sideMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(o.side), roughness: 0.6, metalness: 0, envMapIntensity: 0.4,
      emissive: new THREE.Color(PAL.data), emissiveIntensity: 0 });
    const fm = o.faceEmit ? faceMat.clone() : faceMat; // v5.1 night: each letter's face lights up on its own
    if (o.faceEmit) { fm.emissive = new THREE.Color(o.faceEmit); fm.emissiveIntensity = 0; }
    const m = new THREE.Mesh(geo, [fm, sideMat]);
    m.castShadow = true; m.receiveShadow = true;
    const pivot = new THREE.Group();
    pivot.position.set(x + cx, o.plinthH + bb.min.y, 0);
    pivot.add(m);
    root.add(pivot);
    letters.push({ pivot, m, sideMat, fm, t: o.t0 + k * o.step, h: bb.max.y - bb.min.y });
    k++;
    x += adv + o.tracking * it.s;
  }
  const width = x - o.tracking * SL;
  const hC = letters[0].h;

  // anchor = floor point under the middle of the baseline
  const anchor = o.anchor;
  root.matrix.makeTranslation(anchor.x - width / 2, FLOOR, anchor.z);
  root.matrixWorldNeedsUpdate = true;

  // shadow catcher under the title (the floor itself is a screen quad)
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ color: new THREE.Color(o.catcherCol || '#3A2F8F'), opacity: o.catcherOp ?? 0.3 }));
  catcher.receiveShadow = true;
  catcher.scale.set(width + 10, 1, 14);
  catcher.position.set(anchor.x + 1.5, FLOOR + 0.001, anchor.z - 3);
  bgGroup.add(catcher);

  // plinth: a low white-clay slab the letters stand on (drops in like the island's tiles); "ISOMETRIC" is printed on its
  // sun-lit front (+Z) face
  const PH = o.plinthH, PD = DEPTH + o.plinthD, PM = o.plinthM;
  const plinth = new THREE.Group(); root.add(plinth);
  const slabGeo = new RoundedBoxGeometry(width + 2 * PM, PH, PD, 3, 0.06); slabGeo.translate(width / 2, PH / 2, 0);
  const slab = new THREE.Mesh(slabGeo, new THREE.MeshStandardMaterial({ color: new THREE.Color(o.plinthCol), roughness: 0.62, envMapIntensity: 0.45 }));
  slab.castShadow = true; slab.receiveShadow = true; plinth.add(slab);
  const cw = 4096, chh = 256;
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = chh;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cw, chh);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PAL.data;
  ctx.beginPath(); ctx.arc(60, 128, 34, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = o.enCol || '#4A4394';
  ctx.font = `500 ${o.enPx}px 'JetBrains Mono'`;
  let mx = 140;
  for (const c of o.en) { ctx.fillText(c, mx, 136); mx += ctx.measureText(c).width + o.enPx * 0.32; }
  const decalUsed = mx / cw;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16;
  const decalU = { map: { value: tex }, uReveal: { value: 0 } };
  const decalMat = new THREE.ShaderMaterial({
    uniforms: decalU, transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: 'uniform sampler2D map; uniform float uReveal; varying vec2 vUv; void main(){ vec4 c = texture2D(map, vUv); float m = 1.0 - smoothstep(uReveal - 0.02, uReveal, vUv.x); gl_FragColor = vec4(c.rgb, c.a * m); }',
  });
  const dH = PH * 0.9, dW = dH * cw / chh;
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(dW, dH), decalMat);
  decal.position.set(-PM + 0.25 + dW / 2, PH / 2, PD / 2 + 0.004);
  decal.layers.set(LAYER_GLOW);
  plinth.add(decal);

  onUpdate((T) => {
    for (const L of letters) {
      const tau = T - L.t;
      const s = A.spring(tau, 14.8, 0.61);
      L.pivot.visible = tau > 0 && s > 0.004;
      L.pivot.scale.set(1, Math.max(s, 1e-4), 1);
      // fresh-wall cyan edge: on while growing, gone ~0.4 s after the letter starts
      L.sideMat.emissiveIntensity = tau > 0 ? 0.45 * Math.exp(-Math.max(0, tau - 0.16) / 0.12) : 0;
      if (o.faceEmit) { // neon-style switch-on once the letter stands: blink, blink, on (done ~0.2 s after the growth peak)
        const v = tau - 0.1;
        const on = v < 0 ? 0 : v < 0.035 ? 0.7 : v < 0.07 ? 0.08 : v < 0.1 ? 0.85 : v < 0.125 ? 0.25 : 1;
        L.fm.emissiveIntensity = o.faceEI * on * (v > 0.125 ? 1 + 0.35 * Math.exp(-(v - 0.125) / 0.12) : 1);
      }
    }
    decalU.uReveal.value = A.easeInOutCubic(A.inv(o.enT, o.enT + 0.45, T)) * Math.min(1.03, decalUsed + 0.03);
    decal.visible = T > o.enT - 0.01;
    // plinth drops in (tile drop: gravity fall, squash, two micro bounces)
    const pd = A.drop(T - o.plinthT, 0.24, 2.2, 0, 0.05);
    plinth.visible = pd.vis > 0;
    plinth.position.y = pd.y; plinth.scale.set(1, pd.sy, 1); // long slab: squash in Y only
  });

  // ------------------------------------------------------------------------------------------ the dot (coral ball)
  const V = world.v5;
  const R0 = o.dotR0, R1 = dotSlot.r * o.dotScale;
  const ballMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(o.dotCol), roughness: 0.26, metalness: 0, envMapIntensity: 1.0,
    emissive: new THREE.Color(o.dotEmit || o.dotCol), emissiveIntensity: 0 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), ballMat);
  ball.castShadow = true; ball.receiveShadow = true;
  ball.visible = false;
  scene.add(ball);
  let halo = null; // v5.1 night: a soft additive coral glow around the ball (glow layer: no depth/AO, hidden with nolink=dot)
  if (o.dotHalo) {
    const hc = document.createElement('canvas'); hc.width = hc.height = 128;
    const hx = hc.getContext('2d'); const gr = hx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    hx.fillStyle = gr; hx.fillRect(0, 0, 128, 128);
    const ht = new THREE.CanvasTexture(hc);
    halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: ht, color: new THREE.Color(o.dotHalo), transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, opacity: 0 }));
    halo.layers.set(LAYER_GLOW); halo.renderOrder = 5; halo.visible = false; scene.add(halo);
  }
  const hideDot = o.nolink.has('dot');
  const D = o.dot; // times: in0 (fall start), land (on the CORE base), hop0 (leaves the antenna), hop1 (lands as the period)
  const tmp = new THREE.Vector3(), pA = new THREE.Vector3(), pB = new THREE.Vector3();
  const state = { vis: false, p: new THREE.Vector3(), r: R0, sq: 1, glow: 0 };
  const slotLocal = () => new THREE.Vector3(dotSlot.x, PH + dotSlot.bottom, 0); // ball bottom touches the floor; centre added below

  function towerPoint(T, r, out) { // ball centre resting on the CORE stack top (world)
    V.core.updateWorldMatrix(true, false);
    const h = V.coreStackTop();
    out.set(0, h, 0);
    V.core.localToWorld(out);
    out.y += r * 0.92;
    return out;
  }
  function slotPoint(r, out) { // ball centre in the period slot (world)
    root.updateWorldMatrix(true, false);
    out.copy(slotLocal());
    root.localToWorld(out);
    out.y += r;
    return out;
  }
  // settle: squash on contact then two micro bounces (the film's tile/letter landing), returns [dy, sy]
  function land(tau, amp) {
    if (tau < 0) return [0, 1];
    const b1 = 0.14;
    const dy = tau < b1 ? amp * Math.sin(Math.PI * tau / b1) : (tau < b1 + 0.09 ? amp * 0.25 * Math.sin(Math.PI * (tau - b1) / 0.09) : 0);
    const sq = 1 - 0.3 * Math.exp(-tau / 0.045) * Math.cos(tau * 40);
    return [dy, sq];
  }
  // pose the ball for time T. Call AFTER world.update(T) (needs the CORE pose + bg group offset for this T).
  function post(T) {
    V.beacon.visible = false; // the ball is the beacon in v5
    let vis = T >= D.in0, r = R0, sq = 1;
    const p = state.p;
    if (T < D.land) {
      const u = A.clamp((T - D.in0) / (D.land - D.in0));
      towerPoint(T, r, p);
      p.y += D.h0 * (1 - u * u);
    } else if (T < D.hop0) {
      towerPoint(T, r, p);
      const [dy, s] = land(T - D.land, 0.16);
      p.y += dy; sq = s;
    } else if (T < D.hop1) {
      const u = (T - D.hop0) / (D.hop1 - D.hop0);
      r = A.lerp(R0, R1, A.smooth(u));
      towerPoint(T, R0, pA); slotPoint(r, pB);
      p.copy(pA).lerp(pB, u);
      p.y += 4 * D.arc * u * (1 - u);
    } else {
      r = R1;
      slotPoint(r, p);
      const [dy, s] = land(T - D.hop1, 0.35);
      p.y += dy; sq = s;
    }
    // glow: pre-blinks like the old beacon, flash on the hit, soft idle glow while it crowns the CORE
    const PT = V.PULSE_T;
    let glow = 0;
    if (T > cues.tower.antenna && T < PT) glow = 0.9 * Math.max(Math.exp(-Math.pow((T - 5.625) * 30, 2)), Math.exp(-Math.pow((T - 5.875) * 30, 2)));
    else if (T >= PT) glow = 0.12 + 1.6 * Math.exp(-(T - PT) * 3.0);
    if (T >= D.hop0) glow *= 1 - A.smooth(A.inv(D.hop0, D.hop1, T));
    ballMat.emissiveIntensity = Math.max(glow * (o.dotGlowK ?? 1), o.dotGlow0 || 0);
    ball.visible = vis && !hideDot;
    ball.position.copy(p);
    if (halo) {
      halo.visible = ball.visible; halo.position.copy(p); halo.scale.setScalar(r * (o.dotHaloS || 4.2));
      halo.material.opacity = (o.dotHaloA || 0.3) * (1 + 0.8 * Math.min(1, Math.max(glow * (o.dotGlowK ?? 1) - (o.dotGlow0 || 0), 0)));
    }
    ball.scale.set(r * (1 + (1 - sq) * 0.5), r * sq, r * (1 + (1 - sq) * 0.5));
    Object.assign(state, { vis, r, sq, glow });
  }

  // ------------------------------------------------------------------------------------------ linkAt helpers
  const toPx = (v) => { tmp.copy(v).project(camera); return [(tmp.x + 1) * 960, (1 - tmp.y) * 540]; };
  function links(T) {
    const out = [];
    const ppu = 60 * camera.zoom;
    // dot: sphere under ortho projection = circle of radius r * px/unit; on-screen check
    const [x, y] = toPx(state.p);
    const rr = state.r * ppu * (1 + (1 - state.sq) * 0.25);
    const on = state.vis && x > -rr && x < 1920 + rr && y > -rr && y < 1080 + rr;
    out.push({ id: 'dot', type: 'circle', x: +x.toFixed(1), y: +y.toFixed(1), r: +rr.toFixed(1), a: on ? 1 : 0, look: 'sphere',
      ...(() => { // measured rendered pixels; v5.1 night: the ball reads deeper before the hit, lighter under the sign's glow
        const lk = o.dotLooks ? (o.dotLooks.find((l) => T < l[0]) || o.dotLooks[o.dotLooks.length - 1]) : null;
        const fill = lk ? lk[1] : (o.dotFill || o.dotCol);
        return { fill, stroke: fill, sw: 0, grad: lk ? lk[2] : o.dotGrad };
      })(),
      note: T < D.hop0 ? 'glossy coral ball: CORE beacon orb (rides the telescoping tower, light column fires from it)'
        : 'glossy coral ball: the decimal point of the 3D title "2.5D"' });
    // light column (hero beam) as a line from the ball up out of frame
    const PT = V.PULSE_T, u = T - PT;
    const colA = o.colA ? o.colA(T) : null; // v5.1 night: the column keeps burning until the pull-back (night5.js)
    if (u > 0 && (colA != null ? colA > 0.01 : u < 0.6)) {
      const env = colA != null ? colA / 1.5 : (u < 0.012 ? u / 0.012 : Math.exp(-(u - 0.012) * 5.0));
      const top = state.p.clone(); top.y += 16;
      const [x1, y1] = toPx(top);
      out.push({ id: 'column', type: 'line', x0: +x.toFixed(1), y0: +y.toFixed(1), x1: +x1.toFixed(1), y1: +y1.toFixed(1),
        w: +(0.26 * ppu).toFixed(1), a: +Math.min(1, env * 1.5).toFixed(3), note: 'hero light column (white core, cyan rim)' });
    }
    // title block: parallelogram (baseline at -30°, verticals vertical); rect = its screen bounding box, poly = corners
    const vis = letters.filter((L) => L.pivot.visible);
    if (vis.length) {
      root.updateWorldMatrix(true, false);
      const hT = hC * Math.min(1, A.spring(T - letters[0].t, 14.8, 0.61));
      const c = [[0, PH], [width, PH], [width, PH + hT], [0, PH + hT]].map(([lx, ly]) => toPx(root.localToWorld(new THREE.Vector3(lx, ly, DEPTH / 2))));
      const xs = c.map((q) => q[0]), ys = c.map((q) => q[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const allUp = letters.every((L) => T - L.t > 0.25);
      out.push({ id: 'title', type: 'rect', x: +((x0 + x1) / 2).toFixed(1), y: +((y0 + y1) / 2).toFixed(1), w: +(x1 - x0).toFixed(1), h: +(y1 - y0).toFixed(1), rot: 0,
        poly: c.map((q) => q.map((v) => +v.toFixed(1))), a: allUp ? 1 : 0.5, note: '3D title 等轴 2.5D, a -30° parallelogram (poly = baseline-left, baseline-right, top-right, top-left)' });
    }
    return out;
  }
  return { root, letters, width, hC, decal, ball, post, links, dotSlot, state };
}
