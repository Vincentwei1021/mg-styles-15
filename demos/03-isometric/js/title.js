// Title card set on the isometric floor plane: extruded ISOPOLIS letters that fall flat onto the dotted void floor,
// plus a printed tagline decal. Everything lives in the bg (parallax 0.6) group, on the same plane as the dot grid.
import * as THREE from 'three';
import { parse } from 'opentype';
import * as A from './anim.js';
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

export async function buildTitle(world, cues, o) {
  const { bgGroup, onUpdate, PAL } = world;
  const buf = await (await fetch('/demos/03-isometric/assets/fonts/Unbounded-800-static.ttf')).arrayBuffer();
  const font = parse(buf);
  const FLOOR = o.floorY;
  const size = o.size;           // em size in world units
  const text = o.text;
  const tracking = o.tracking ?? 0.02;

  // plane basis: reading direction along -Z, letter-up along -X, thickness along +Y
  const root = new THREE.Group();
  root.matrixAutoUpdate = false;
  const ex = new THREE.Vector3(0, 0, -1), ey = new THREE.Vector3(-1, 0, 0), ez = new THREE.Vector3(0, 1, 0);
  const basis = new THREE.Matrix4().makeBasis(ex, ey, ez);
  bgGroup.add(root);

  const glyphs = font.stringToGlyphs(text);
  const scale = size / font.unitsPerEm;
  let x = 0;
  const letters = [];
  const inkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PAL.ink), roughness: 0.55, metalness: 0, envMapIntensity: 0.5 });
  const sideMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#4B45A0'), roughness: 0.6, metalness: 0, envMapIntensity: 0.4 });
  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i];
    const ch = text[i];
    const shapes = glyphShapes(font, ch, size);
    const geo = new THREE.ExtrudeGeometry(shapes, { depth: o.depth, bevelEnabled: true, bevelThickness: o.bevel, bevelSize: o.bevel * 0.9, bevelSegments: 3, curveSegments: 14 });
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const cx = (bb.min.x + bb.max.x) / 2;
    geo.translate(-cx, 0, 0); // pivot at the glyph centre on the baseline
    const m = new THREE.Mesh(geo, [inkMat, sideMat]);
    m.castShadow = true; m.receiveShadow = true;
    const pivot = new THREE.Group();
    pivot.position.set(x + cx, 0, 0);
    pivot.add(m);
    root.add(pivot);
    letters.push({ pivot, m, t: cues.letters_start + i * cues.letters_step, i, w: bb.max.x - bb.min.x });
    let adv = g.advanceWidth * scale;
    if (i < glyphs.length - 1) adv += font.getKerningValue(g, glyphs[i + 1]) * scale;
    x += adv + tracking * size;
  }
  const width = x - tracking * size;

  // position the block: anchor = world point on the floor where the text centre sits
  const anchor = o.anchor; // THREE.Vector3 on the floor (y = FLOOR)
  const originLocal = new THREE.Vector3(-width / 2, -size * 0.36, 0); // centre the text block (cap height ≈ 0.72 em)
  root.matrix.copy(new THREE.Matrix4().makeTranslation(anchor.x, FLOOR, anchor.z).multiply(basis).multiply(new THREE.Matrix4().makeTranslation(originLocal.x, originLocal.y, 0)));
  root.matrixWorldNeedsUpdate = true;

  // shadow catcher on the floor under the title
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ color: new THREE.Color('#3A2F8F'), opacity: 0.3 }));
  catcher.receiveShadow = true;
  catcher.scale.set(o.catcher[1], 1, o.catcher[0]);
  catcher.position.set(anchor.x + 1.6, FLOOR + 0.001, anchor.z);
  bgGroup.add(catcher);

  // printed tagline + mono line (canvas decal lying on the floor, below the wordmark)
  const cw = o.decalCW || 3072, chh = o.decalCH || 640;
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = chh;
  const ctx = cv.getContext('2d');
  const drawDecal = () => {
    ctx.clearRect(0, 0, cw, chh);
    ctx.fillStyle = PAL.ink;
    ctx.textBaseline = 'alphabetic';
    ctx.font = `700 ${o.tagPx}px 'HarmonyOS Sans SC'`;
    const zh = o.tagline;
    // manual tracking for CJK
    let tx = 8;
    for (const c of zh) { ctx.fillText(c, tx, o.tagPx * 1.02); tx += ctx.measureText(c).width + o.tagPx * 0.1; }
    // cyan status dot + mono line
    const my = o.tagPx * 1.02 + o.monoPx * (o.monoGap || 2.1);
    ctx.fillStyle = PAL.data;
    ctx.beginPath(); ctx.arc(8 + o.monoPx * 0.42, my - o.monoPx * 0.36, o.monoPx * 0.36, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4A4394'; // round 2: >= 4.5:1 on the lavender floor
    ctx.font = `500 ${o.monoPx}px 'JetBrains Mono'`;
    let mx = 8 + o.monoPx * 1.35;
    for (const c of o.mono) { ctx.fillText(c, mx, my); mx += ctx.measureText(c).width + o.monoPx * 0.06; }
  };
  drawDecal();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  const decalU = { map: { value: tex }, uReveal: { value: 0 }, uReveal2: { value: 0 }, uSplit: { value: (o.tagPx * 1.3) / chh } };
  const decalMat = new THREE.ShaderMaterial({
    uniforms: decalU, transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: /* glsl */`
      uniform sampler2D map; uniform float uReveal, uReveal2, uSplit; varying vec2 vUv;
      void main(){
        vec4 c = texture2D(map, vUv);
        bool top = (1.0 - vUv.y) < uSplit;
        float r = top ? uReveal : uReveal2;
        float m = 1.0 - smoothstep(r - 0.02, r, vUv.x);
        gl_FragColor = vec4(c.rgb, c.a * m);
      }`,
  });
  const dW = o.decalW, dH = dW * chh / cw;
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(dW, dH), decalMat);
  // decal plane lies on the floor in the title's plane basis: its local x = reading dir, y = letter-up
  decal.matrixAutoUpdate = false;
  const dLocal = new THREE.Vector3(-width / 2 + dW / 2 + o.decalX, -size * 0.36 - o.decalGap - dH / 2, 0);
  decal.matrix.copy(new THREE.Matrix4().makeTranslation(anchor.x, FLOOR + 0.002, anchor.z).multiply(basis).multiply(new THREE.Matrix4().makeTranslation(dLocal.x, dLocal.y, 0)));
  decal.layers.set(LAYER_GLOW);
  bgGroup.add(decal);

  // thin rule under the wordmark, drawn on
  const rule = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0, 0.5), new THREE.MeshStandardMaterial({ color: new THREE.Color(PAL.ink), roughness: 0.6 }));
  rule.matrixAutoUpdate = false;
  rule.castShadow = false; rule.receiveShadow = true;
  bgGroup.add(rule);

  onUpdate((T) => {
    for (const L of letters) {
      const tau = T - L.t;
      const fall = 0.26;
      let z = 0, tilt = 0, sq = 1, vis = true;
      if (tau < -fall) vis = false;
      else if (tau < 0) {
        const u = (tau + fall) / fall;
        z = 2.4 * (1 - u * u);
        tilt = 1.25 * Math.pow(1 - u, 1.6);        // standing up -> falls flat onto the plane
      } else {
        const b1 = 0.14;
        z = tau < b1 ? 0.12 * Math.sin(Math.PI * tau / b1) : (tau < b1 + 0.09 ? 0.03 * Math.sin(Math.PI * (tau - b1) / 0.09) : 0);
        const e = Math.exp(-tau / 0.05);
        sq = 1 - 0.35 * e * Math.cos(tau * 38);
      }
      L.pivot.visible = vis;
      L.pivot.position.z = z;
      L.pivot.rotation.x = tilt;
      L.m.scale.set(1 + 0.08 * (1 - sq), 1 + 0.08 * (1 - sq), sq);
    }
    decalU.uReveal.value = A.easeInOutCubic(A.inv(cues.final, cues.final + 0.42, T)) * 1.03;
    decalU.uReveal2.value = A.easeInOutCubic(A.inv(cues.final + 0.14, cues.final + 0.62, T)) * 1.03;
    decal.visible = T > cues.final - 0.01;
    // rule: grows along the reading direction
    const ru = A.easeInOutCubic(A.inv(cues.final - 0.12, cues.final + 0.4, T));
    rule.visible = ru > 0.001;
    const rl = new THREE.Vector3(-width / 2, -size * 0.36 - o.decalGap * 0.45, 0);
    rule.matrix.copy(new THREE.Matrix4().makeTranslation(anchor.x, FLOOR, anchor.z).multiply(basis)
      .multiply(new THREE.Matrix4().makeTranslation(rl.x, rl.y, 0))
      .multiply(new THREE.Matrix4().makeScale(Math.max(ru, 1e-4) * width, 0.035, 0.02)));
  });
  return { root, letters, width, catcher, decal, tex, redraw: () => { drawDecal(); tex.needsUpdate = true; } };
}
