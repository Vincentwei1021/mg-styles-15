// Static look-development arrangements (used with ?look=N)
export function lookdev(t, look, W) {
  const S = baseState(t);
  const floorY = S.floorY;
  if (look === 0) {
    // end card
    W.letters.forEach((l, i) => S.letters.push({ ...l, x: l.sx0, y: l.sy0, grow: 0, u: [0.05, 0.3, 0.55, 0.85][i], sx: 1, sy: 1, on: true }));
    S.balls.push({ x: 1180, y: floorY - 9, r: 26, u: 0.8, s: 2.2, a: 0 });
    S.segs.push({ ax: 830, ay: 560, bx: 830, by: 600, ra: 9, rb: 5, u: 0.3 });
    S.balls.push({ x: 830, y: 604, r: 12, u: 0.3 });
    S.rip = { x: 1180, y: floorY, age: 0.45, amp: 1 };
  } else if (look === 1) {
    S.balls.push({ x: 420, y: floorY - 22, r: 52, u: 0.95, s: 2.0, a: 0 });
    S.balls.push({ x: 700, y: floorY - 28, r: 60, u: 0.05, s: 1.9, a: 0 });
    S.balls.push({ x: 1000, y: 470, r: 140, u: 0.4, s: 1.0, a: 0 });
    S.balls.push({ x: 1330, y: 300, r: 48, u: 0.55, s: 1.35, a: Math.PI / 2 });
    S.balls.push({ x: 1330, y: 238, r: 22, u: 0.55, s: 1.0, a: 0 });
    for (let i = 0; i < 7; i++) S.balls.push({ x: 560 + i * 34, y: floorY - 120 - 60 * Math.sin(i * 0.9), r: 7 + (i % 3) * 4, u: 0.1 + 0.1 * i, s: 1, a: 0 });
    S.balls.push({ x: 1185, y: 560, r: 55, u: 0.5 }); // neck with sphere
    S.segs.push({ ax: 700, ay: -40, bx: 700, by: 250, ra: 26, rb: 9, u: 0.1 });
    S.balls.push({ x: 700, y: 300, r: 50, u: 0.1, s: 1.15, a: Math.PI / 2 });
  } else if (look === 2) {
    S.balls.push({ x: 1200, y: 470, r: 140, u: 0.4 });
    S.flood = { on: true, front: 900, back: -400, phase: 1.3, amp: 110, freq: 0.0062, lean: 0.12, u: 0.9 };
    S.overlays = [
      { on: true, front: 620, back: -600, phase: 2.2, amp: 120, freq: 0.0055, lean: 0.10, u: 0.05 },
      { on: true, front: 330, back: -700, phase: 0.4, amp: 130, freq: 0.0058, lean: 0.08, u: 0.45 },
    ];
  } else if (look === 3) {
    S.flood = { on: true, front: 3000, back: -3000, phase: 1.3, amp: 110, freq: 0.0062, lean: 0.0, u: 0.5 };
  }
  return S;
}

export function baseState(t) {
  return {
    t, frame: Math.round(t * 30), k: 0.1, floorY: 872, horizon: 786,
    cam: { zoom: 1, px: 960, py: 540, ox: 0, oy: 0 },
    balls: [], segs: [], letters: [],
    flood: { on: false, front: 0, back: 0, phase: 0, amp: 0, freq: 0, lean: 0, u: 0 },
    overlays: [{ on: false, front: 0, back: 0, phase: 0, amp: 0, freq: 0, lean: 0, u: 0 }, { on: false, front: 0, back: 0, phase: 0, amp: 0, freq: 0, lean: 0, u: 0 }, { on: false, front: 0, back: 0, phase: 0, amp: 0, freq: 0, lean: 0, u: 0 }],
    rip: { x: 0, y: 0, age: 0, amp: 0 },
    key: { x: -0.78, y: -0.95, glint: -9999, glintAmp: 0 },
    bloom: 0.55, flash: 0,
  };
}
