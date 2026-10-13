import type { Air, Vec } from '../core/types';
import { clamp, lerp, mulberry32, range } from '../core/math';
import { airAt } from '../physics/wind';

interface Blade {
  x: number;
  y: number;
  len: number;
  lean: number;
  w: number;
  shade: number;
  phase: number;
}

/** Individual grass blades that bend in the wind, sorted far to near. */
export interface Meadow {
  blades: Blade[];
  horizon: number;
}

const DAY = [
  [47, 143, 44],
  [61, 165, 53],
  [96, 190, 74],
  [37, 122, 39],
  [134, 206, 96],
  [28, 104, 34],
  [164, 196, 92],
];
const NIGHT = [
  [13, 74, 68],
  [18, 96, 90],
  [30, 124, 114],
  [10, 58, 56],
  [56, 150, 140],
  [8, 48, 46],
  [40, 110, 120],
];

const palette: string[] = [];
let paletteFor = -1;

function shades(night: number): string[] {
  if (night !== paletteFor) {
    paletteFor = night;
    for (let i = 0; i < DAY.length; i++) {
      const d = DAY[i];
      const n = NIGHT[i];
      palette[i] = `rgb(${Math.round(lerp(d[0], n[0], night))},${Math.round(lerp(d[1], n[1], night))},${Math.round(lerp(d[2], n[2], night))})`;
    }
  }
  return palette;
}

export function createMeadow(w: number, h: number, horizon: number): Meadow {
  const rng = mulberry32(2718);
  const blades: Blade[] = [];
  const count = clamp(Math.round(w * 0.75), 300, 1300);
  const top = horizon + 26 * (h / 800);
  for (let i = 0; i < count; i++) {
    // Denser and larger toward the viewer.
    const s = Math.pow(rng(), 0.55);
    blades.push({
      x: range(rng, -10, w + 10),
      y: lerp(top, h + 16, s),
      len: (5 + 70 * s * s) * range(rng, 0.6, 1.35) * clamp(h / 760, 0.7, 1.2),
      lean: range(rng, -0.3, 0.3),
      w: 0.8 + 3.2 * s,
      shade: Math.floor(rng() * DAY.length),
      phase: rng() * 6.28,
    });
  }
  blades.sort((a, b) => a.y - b.y);
  return { blades, horizon };
}

const tmp: Vec = { x: 0, y: 0 };

/** Draws the blades whose base lies in [fromY, toY) as tapered, bending leaves. */
export function drawBlades(
  c: CanvasRenderingContext2D,
  m: Meadow,
  fromY: number,
  toY: number,
  air: Air,
  time: number,
  night: number,
) {
  const colors = shades(night);
  const blades = m.blades;
  for (let i = 0; i < blades.length; i++) {
    const b = blades[i];
    if (b.y < fromY) continue;
    if (b.y >= toY) break;
    airAt(air, b.x, b.y, tmp);
    const a = b.lean + clamp(tmp.x * 0.0017, -1, 1) + Math.sin(time * 2.1 + b.phase) * 0.05;
    const tx = b.x + Math.sin(a) * b.len;
    const ty = b.y - Math.cos(a) * b.len;
    const cx = b.x + Math.sin(a * 0.35) * b.len * 0.5;
    const cy = b.y - b.len * 0.55;
    const hw = b.w * 0.5;
    c.fillStyle = colors[b.shade];
    c.beginPath();
    c.moveTo(b.x - hw, b.y);
    c.quadraticCurveTo(cx - hw * 0.7, cy, tx, ty);
    c.quadraticCurveTo(cx + hw * 0.7, cy, b.x + hw, b.y);
    c.closePath();
    c.fill();
  }
}
