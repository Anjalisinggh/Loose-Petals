import type { Air, Vec } from '../core/types';

const WIND_ACCEL = 520;
const GUST_GAIN = 2.6;
const STORM_ACCEL = 560;

export function createAir(): Air {
  return { time: 0, strength: 0.35, gusts: [], storm: 0, stormDir: 1, cx: 0, cy: 0 };
}

/**
 * Samples the air's acceleration (px/s²) at a point: a travelling ambient breeze,
 * cursor gusts, and the vortex of a petal storm.
 */
export function airAt(air: Air, x: number, y: number, out: Vec): Vec {
  const t = air.time;
  const s = air.strength * WIND_ACCEL;
  const a = Math.sin(t * 0.53 - x * 0.0031);
  const b = Math.sin(t * 1.31 - x * 0.0093 + y * 0.004);
  const c = Math.sin(t * 2.9 - x * 0.021 - y * 0.011);
  let wx = s * (0.2 + 0.55 * a + 0.3 * b + 0.15 * c);
  let wy = s * 0.2 * b * Math.sin(t * 0.9 + x * 0.006);

  const gusts = air.gusts;
  for (let i = 0; i < gusts.length; i++) {
    const g = gusts[i];
    const dx = x - g.x;
    const dy = y - g.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < g.r * g.r) {
      const f = 1 - Math.sqrt(d2) / g.r;
      const k = f * f * GUST_GAIN;
      wx += g.vx * k;
      wy += g.vy * k;
    }
  }

  if (air.storm > 0) {
    const dx = x - air.cx;
    const dy = y - air.cy;
    const d = Math.hypot(dx, dy) + 1;
    const k = (air.storm * STORM_ACCEL * Math.min(1, d / 220)) / d;
    wx += -dy * k * air.stormDir - (dx / d) * air.storm * 70;
    wy += dx * k * air.stormDir - (dy / d) * air.storm * 70;
    wx += air.storm * 160 * Math.sin(t * 5.1 + y * 0.02);
    wy += air.storm * 160 * Math.cos(t * 4.3 + x * 0.02);
  }

  out.x = wx;
  out.y = wy;
  return out;
}
