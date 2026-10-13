import type { Variety, Vec } from '../core/types';
import { clamp, range, type Rng } from '../core/math';
import { VARIETIES } from './varieties';

export interface PlantSpec {
  variety: Variety;
  root: Vec;
  target: Vec;
  scale: number;
  delay: number;
  buds: number;
}

/**
 * The opening arrangement: a dense drift on the right, a smaller group left of centre and
 * a loner near the edge, leaving the top-left quiet. Deterministic for a given size.
 */
export function composeGarden(w: number, h: number, rng: Rng): PlantSpec[] {
  const scale = clamp(Math.min(w, h) / 760, 0.68, 1.08);
  const count = clamp(Math.round(w / 105), 6, 15);
  const zones =
    w < 640
      ? [
          { c: 0.7, s: 0.2, share: 0.68 },
          { c: 0.2, s: 0.1, share: 0.32 },
        ]
      : [
          { c: 0.76, s: 0.15, share: 0.58 },
          { c: 0.39, s: 0.08, share: 0.28 },
          { c: 0.1, s: 0.04, share: 0.14 },
        ];

  // Shuffle so every variety appears before any repeats.
  const order = VARIETIES.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  const specs: PlantSpec[] = [];
  for (let i = 0; i < count; i++) {
    const variety = order[i % order.length];
    const roll = (i + 0.5) / count;
    let acc = 0;
    let zone = zones[0];
    for (const z of zones) {
      acc += z.share;
      if (roll <= acc) {
        zone = z;
        break;
      }
    }
    const spread = (rng() + rng() + rng()) / 1.5 - 1;
    const x = clamp((zone.c + spread * zone.s) * w, 30, w - 70);
    const frac = range(rng, variety.height[0], variety.height[1]);
    const height = clamp(frac * h, 90, 660);
    const lean = range(rng, -0.2, 0.2) * height;
    specs.push({
      variety,
      root: { x, y: h + 12 },
      target: { x: clamp(x + lean, 50, w - 80), y: Math.max(96, h - height) },
      scale: scale * range(rng, 0.9, 1.08),
      delay: 0.15 + i * 0.13 + rng() * 0.2,
      buds: rng() < variety.buds ? (rng() < 0.4 ? 2 : 1) : 0,
    });
  }
  return specs;
}
