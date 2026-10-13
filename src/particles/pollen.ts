import type { Air, Mote, Vec } from '../core/types';
import { airAt } from '../physics/wind';

const MAX_MOTES = 420;
const tmp: Vec = { x: 0, y: 0 };

export function spawnMote(
  list: Mote[],
  x: number,
  y: number,
  vx: number,
  vy: number,
  color: string,
  life: number,
  r: number,
  streak = false,
) {
  if (list.length >= MAX_MOTES) list.shift();
  list.push({ x, y, vx, vy, age: 0, life, r, color, streak });
}

/** A small burst of pollen, e.g. when a flower is released or two heads knock together. */
export function puff(list: Mote[], x: number, y: number, color: string, count: number, speed: number) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.25 + Math.random() * 0.75);
    spawnMote(list, x, y, Math.cos(a) * s, Math.sin(a) * s, color, 1.2 + Math.random() * 1.8, 0.7 + Math.random() * 1.1);
  }
}

/** Pollen is nearly weightless: it rides the air and barely notices gravity. */
export function stepMotes(list: Mote[], air: Air, g: number, dt: number) {
  const drag = Math.max(0, 1 - 2.2 * dt);
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    m.age += dt;
    if (m.age >= m.life) {
      list[i] = list[list.length - 1];
      list.pop();
      continue;
    }
    airAt(air, m.x, m.y, tmp);
    m.vx = (m.vx + tmp.x * 0.9 * dt) * drag;
    m.vy = (m.vy + (tmp.y * 0.9 + g * 0.05) * dt) * drag;
    m.x += m.vx * dt;
    m.y += m.vy * dt;
  }
}
