// Iso callout tags as DOM layers, built with the literal SSR matrices:
//   right face : rotate(-30deg) skewX(-30deg) scaleY(0.86602)   (card x-axis runs up-right  = world -Z)
//   left face  : rotate(30deg)  skewX(30deg)  scaleY(0.86602)   (card x-axis runs down-right = world +X)
//   top face   : rotate(-30deg) skewX(30deg)  scaleY(0.86602)
// (times a uniform 0.8165 · px-per-unit factor, identical to the orthographic projection of the 3D scene).
// Round 1: leaders are world-space polylines (vertical stub + one iso-axis run) projected every frame, so a card can
// fly into the void on true 30-degree lines and its bottom-left corner sits on the leader end. Tags z-sort by screen y.
import * as THREE from 'three';
import * as A from './anim.js';

const SSR = {
  right: 'rotate(-30deg) skewX(-30deg) scaleY(0.86602)',
  left: 'rotate(30deg) skewX(30deg) scaleY(0.86602)',
  top: 'rotate(-30deg) skewX(30deg) scaleY(0.86602)',
};
const CW = 360, CH = 210;            // card px
const SPX = 160, SPY = 20, SPW = 180, SPH = 72; // spark-bar box (card px), right half of the card
// Bars, not a polyline: on a skewed iso face a card-space line under ~27 deg reads with the wrong sign on screen,
// while bar heights stay vertical (the SSR matrices keep card-y vertical), so the trend reads the same on either face.

const bh = (v) => 8 + v * (SPH - 14);

export function buildTags(world, cues, defs) {
  const ui = document.getElementById('ui');
  const style = document.createElement('style');
  style.textContent = `
    .tg { position:absolute; left:0; top:0; width:0; height:0; }
    .tg .ring { position:absolute; left:0; top:0; width:44px; height:44px; margin:-22px 0 0 -22px; border-radius:50%;
      border:3px solid var(--ac); box-sizing:border-box; transform-origin:50% 50%; }
    .tg .dot { position:absolute; left:0; top:0; width:14px; height:14px; margin:-7px 0 0 -7px; border-radius:50%; background:var(--ac);
      transform-origin:50% 50%; box-shadow: 0 0 0 3px rgba(255,255,255,0.92); }
    .tg svg.lead { position:absolute; left:0; top:0; width:1px; height:1px; overflow:visible; }
    .tg .card { position:absolute; left:0; top:0; width:${CW}px; height:${CH}px; transform-origin:0 0; }
    .tg .face { position:absolute; left:0; top:0; width:${CW}px; height:${CH}px; border-radius:16px; background:rgba(255,255,255,0.965);
      box-shadow: 0 0 0 1.5px rgba(44,41,96,0.07), 0 10px 0 -4px rgba(44,41,96,0.10); overflow:hidden; transform-origin: 0 50%; }
    .tg .bar { position:absolute; left:0; top:0; width:10px; height:${CH}px; background:var(--ac); }
    .tg .lab { position:absolute; left:32px; top:24px; font: 500 28px/1 'HarmonyOS Sans SC'; color:#2C2960; letter-spacing:0.04em; white-space:nowrap; }
    .tg .en { position:absolute; left:33px; top:62px; font: 500 23px/1 'JetBrains Mono'; color:#6B64B8; letter-spacing:0.12em; white-space:nowrap; }
    .tg .val { position:absolute; left:28px; top:108px; font: 800 76px/1 'Unbounded'; color:#2C2960; letter-spacing:-0.02em; white-space:nowrap; }
    .tg .unit { font: 500 31px/1 'JetBrains Mono'; color:rgba(44,41,96,0.66); margin-left:8px; letter-spacing:0.04em; }
    .tg svg.spark { position:absolute; left:${SPX}px; top:${SPY}px; width:${SPW}px; height:${SPH}px; overflow:visible; }
  `;
  document.head.appendChild(style);
  const tags = defs.map((d, di) => {
    const el = document.createElement('div'); el.className = 'tg'; el.style.setProperty('--ac', d.color);
    const n = d.spark.length, slot = SPW / n;
    const bars = d.spark.map((v, i) => `<rect class="b" x="${(i * slot + 2).toFixed(1)}" width="${(slot - 5).toFixed(1)}" rx="2.5" y="${SPH}" height="0" fill="${d.color}" fill-opacity="${i === n - 1 ? 1 : 0.24 + 0.36 * i / (n - 1)}"/>`).join('');
    const ex = (n - 1 + 0.5) * slot - 0.5, ey = SPH - bh(d.spark[n - 1]) - 11;
    el.innerHTML = `<svg class="lead"><polyline class="ln" fill="none" stroke="rgba(44,41,96,0.62)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <circle class="kn" r="4.5" fill="#fff" stroke="rgba(44,41,96,0.62)" stroke-width="2"/></svg>
      <div class="ring"></div><div class="dot"></div>
      <div class="card"><div class="face"><div class="bar"></div>
        <div class="lab">${d.label}</div><div class="en">${d.en}</div>
        <div class="val"><span class="num">0</span><span class="unit">${d.unit}</span></div>
        <svg class="spark" viewBox="0 0 ${SPW} ${SPH}">
          <line x1="0" y1="${SPH + 1}" x2="${SPW}" y2="${SPH + 1}" stroke="rgba(44,41,96,0.16)" stroke-width="2"/>
          ${bars}
          <circle class="halo" cx="${ex}" cy="${ey}" r="7" fill="none" stroke="${d.color}" stroke-width="2"/>
          <circle class="end" cx="${ex}" cy="${ey}" r="6.5" fill="${d.color}" stroke="#fff" stroke-width="2.5"/>
        </svg>
      </div></div>`;
    ui.appendChild(el);
    const q = (s) => el.querySelector(s);
    return { d, el, ring: q('.ring'), dot: q('.dot'), ln: q('.ln'), kn: q('.kn'), card: q('.card'), face: q('.face'), num: q('.num'),
      bars: [...el.querySelectorAll('.b')], end: q('.end'), halo: q('.halo'), ex, ey };
  });

  const v = new THREE.Vector3();
  const toPx = (p, cam) => { v.copy(p).project(cam); return [(v.x * 0.5 + 0.5) * 1920, (1 - (v.y * 0.5 + 0.5)) * 1080]; };
  const org = (el, x, y) => { el.style.transformOrigin = `${x}px ${y}px`; el.style.transformBox = 'view-box'; };
  tags.forEach((t) => { org(t.end, t.ex, t.ey); org(t.halo, t.ex, t.ey); });

  return function update(T, camera, zoom) {
    const S = 0.8165 * 60 * zoom * 0.01;    // 1 card px = 0.01 world units, then the iso foreshortening
    const order = [];
    for (const t of tags) {
      const d = t.d;
      const tau = T - d.t;
      const out = A.easeInCubic(A.inv(d.tOut, d.tOut + 0.22, T));
      const vis = tau > -0.2 && out < 1; // leader pre-rolls 0.2 s so the card unfolds ON the cue (UI notify)
      t.el.style.display = vis ? 'block' : 'none';
      if (!vis) continue;
      // world polyline: anchor -> +stub (vertical) -> +run (iso axis); projected every frame
      const P = [d.anchor.clone()];
      for (const s of d.path) P.push(P[P.length - 1].clone().add(s));
      const S2 = P.map((p) => toPx(p, camera));
      const [ax, ay] = S2[0];
      const rel = S2.map(([x, y]) => [x - ax, y - ay]);
      const seg = []; let L = 0;
      for (let i = 1; i < rel.length; i++) { const l = Math.hypot(rel[i][0] - rel[i - 1][0], rel[i][1] - rel[i - 1][1]); seg.push(l); L += l; }
      const lu = A.easeOutCubic(A.inv(-0.2, 0.0, tau)) * (1 - out);
      let rem = lu * L; const pts = [rel[0]]; let tip = rel[0];
      for (let i = 1; i < rel.length && rem > 0; i++) {
        const f = Math.min(1, rem / seg[i - 1]);
        tip = [rel[i - 1][0] + (rel[i][0] - rel[i - 1][0]) * f, rel[i - 1][1] + (rel[i][1] - rel[i - 1][1]) * f];
        pts.push(tip); rem -= seg[i - 1];
      }
      t.el.style.transform = `translate(${ax.toFixed(2)}px, ${ay.toFixed(2)}px)`;
      t.ln.setAttribute('points', pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' '));
      // round 2: hidden-line break where the run passes behind a mast (technical-illustration convention)
      let dash = 'none';
      if (d.gap && rel.length > 2) {
        const gx = toPx(d.gap, camera)[0] - ax;
        const f = (gx - rel[1][0]) / (rel[2][0] - rel[1][0]);
        if (f > 0 && f < 1) { const at = seg[0] + f * seg[1]; dash = `${(at - 9).toFixed(2)} 18 99999`; }
      }
      t.ln.style.strokeDasharray = dash;
      const kn = rel[1], knOn = lu * L > seg[0] + 1;
      t.kn.setAttribute('cx', kn[0].toFixed(2)); t.kn.setAttribute('cy', kn[1].toFixed(2));
      t.kn.style.opacity = knOn ? '1' : '0';
      // ground ring (top-face SSR) pulses
      const rp = (((tau + 0.2) * 1.2) % 1 + 1) % 1;
      const rs = (0.4 + rp * 1.1) * S * 1.6;
      t.ring.style.transform = `scale(${rs.toFixed(4)}) ${SSR.top}`;
      t.ring.style.opacity = ((1 - rp) * 0.9 * (1 - out)).toFixed(3);
      const dp = A.spring(tau + 0.2, 24, 0.5, 10) * (1 - out);
      t.dot.style.transform = `scale(${(Math.max(dp, 0) * S * 1.4).toFixed(4)}) ${SSR.top}`;
      // card: bottom-left corner on the leader end, unfolds along its face plane once the leader arrives
      const [lx, ly] = rel[rel.length - 1];
      const cu = Math.max(0, A.spring(tau, 20, 0.55, 8)) * (1 - out);
      t.card.style.transform = `translate(${lx.toFixed(2)}px, ${ly.toFixed(2)}px) scale(${S.toFixed(4)}) ${SSR[d.face]} translate(0px, -${CH}px)`;
      t.face.style.transform = `scaleX(${Math.max(cu, 0.0001).toFixed(4)})`;
      t.card.style.opacity = cu > 0.001 ? '1' : '0';
      // count-up, sparkline draw (+ area wipe), end dot pops when the draw completes
      const cnt = A.easeOutCubic(A.inv(0.04, 0.46, tau));
      t.num.textContent = d.fmt(d.value * cnt);
      t.bars.forEach((r, i) => {
        const g = A.easeOutBack(A.inv(0.06 + i * 0.035, 0.28 + i * 0.035, tau), 1.6);
        const hh = Math.max(0, bh(d.spark[i]) * g);
        r.setAttribute('y', (SPH - hh).toFixed(2)); r.setAttribute('height', hh.toFixed(2));
      });
      const es = Math.max(0, A.spring(tau - 0.6, 26, 0.45, 10));
      t.end.style.transform = `scale(${es.toFixed(4)})`;
      const hp = A.inv(0.62, 1.22, tau);
      t.halo.style.transform = `scale(${(1 + hp * 1.8).toFixed(3)})`;
      t.halo.style.opacity = hp > 0 && hp < 1 ? ((1 - hp) * 0.8).toFixed(3) : '0';
      order.push([ay, t.el]);
    }
    order.sort((a, b) => a[0] - b[0]).forEach(([, el], i) => { el.style.zIndex = String(10 + i); });
  };
}
