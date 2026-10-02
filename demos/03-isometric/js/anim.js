// Pure, closed-form animation helpers (every value is a function of t only).
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const inv = (a, b, x) => clamp((x - a) / (b - a));
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const smoother = (t) => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
export const easeInCubic = (t) => { t = clamp(t); return t * t * t; };
export const easeOutCubic = (t) => { t = clamp(t); return 1 - Math.pow(1 - t, 3); };
export const easeInOutCubic = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const easeOutQuart = (t) => { t = clamp(t); return 1 - Math.pow(1 - t, 4); };
export const easeInOutQuart = (t) => { t = clamp(t); return t < 0.5 ? 8 * t ** 4 : 1 - Math.pow(-2 * t + 2, 4) / 2; };
export const easeOutExpo = (t) => { t = clamp(t); return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); };
export const easeInOutExpo = (t) => {
  t = clamp(t);
  if (t <= 0) return 0; if (t >= 1) return 1;
  return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
};
export const easeInOutSine = (t) => { t = clamp(t); return -(Math.cos(Math.PI * t) - 1) / 2; };
export const easeOutBack = (t, s = 1.70158) => { t = clamp(t); const c3 = s + 1; return 1 + c3 * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); };

// Damped spring 0 -> 1, starting at tau = 0 with initial velocity v0 (units / s).
export function spring(tau, w = 20, z = 0.55, v0 = 0) {
  if (tau <= 0) return 0;
  const wd = w * Math.sqrt(1 - z * z);
  const B = (v0 - z * w) / wd;
  return 1 + Math.exp(-z * w * tau) * (-Math.cos(wd * tau) + B * Math.sin(wd * tau));
}

// Tile style drop: returns {y, rot, sy, sxz} for time tau relative to the landing moment.
// fall: duration of the fall, h0: start height, rot0: start rotation (rad).
export function drop(tau, fall = 0.3, h0 = 1.6, rot0 = 1.7, bounce = 0.07) {
  if (tau < -fall) return { y: h0, rot: rot0, sy: 1, sxz: 1, vis: 0 };
  if (tau < 0) {
    const u = (tau + fall) / fall;           // 0..1
    const y = h0 * (1 - u * u);              // gravity-like acceleration
    const rot = rot0 * Math.pow(1 - u, 2.2); // rotation settles into flat right at contact
    const st = 1 + 0.06 * u * u;             // slight stretch while falling fast
    return { y, rot, sy: st, sxz: 1 / Math.sqrt(st), vis: 1 };
  }
  // after contact: squash then two micro bounces
  const b1 = 0.16, b2 = 0.1;
  let y = 0;
  if (tau < b1) y = bounce * Math.sin(Math.PI * tau / b1);
  else if (tau < b1 + b2) y = bounce * 0.3 * Math.sin(Math.PI * (tau - b1) / b2);
  const sq = Math.exp(-tau / 0.05);
  const sy = 1 - 0.3 * sq * Math.cos(tau * 40);
  return { y, rot: 0, sy, sxz: 1 + 0.12 * sq * Math.cos(tau * 40), vis: 1 };
}

// Scale pop: 0 -> overshoot -> 1
export function pop(tau, dur = 0.35, over = 1.9) {
  if (tau <= 0) return 0;
  return spring(tau, 22, 0.42, over * 10);
}

// seeded PRNG (mulberry32)
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// Piecewise keyframe track: keys = [[t, v, ease?], ...]; ease applies to segment ending at that key.
export function track(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, e] = keys[i];
    const [t0, v0] = keys[i - 1];
    if (t <= t1) {
      const u = (t - t0) / (t1 - t0);
      const f = e || smoother;
      if (Array.isArray(v0)) return v0.map((a, k) => a + (v1[k] - a) * f(u));
      return v0 + (v1 - v0) * f(u);
    }
  }
  return keys[keys.length - 1][1];
}
