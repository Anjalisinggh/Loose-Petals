import Matter from 'matter-js';
import type { Air, LoosePetal, Sprite, Vec } from '../core/types';
import { airAt } from '../physics/wind';
import { angVel, CAT, FORCE_SCALE, velX, velY } from '../physics/world';

const { Bodies, Body, Composite } = Matter;

export const MAX_PETALS = 260;
const tmp: Vec = { x: 0, y: 0 };

export function spawnPetal(
  world: Matter.World,
  list: LoosePetal[],
  sprite: Sprite,
  x: number,
  y: number,
  angle: number,
  vx: number,
  vy: number,
  sx: number,
  sy: number,
) {
  const body = Bodies.circle(x, y, 3.5, {
    restitution: 0.15,
    friction: 0.7,
    frictionAir: 0.01,
    angle,
    label: 'petal',
    // Petals bump into flowers and the frame, never into each other.
    collisionFilter: { category: CAT.petal, mask: CAT.wall | CAT.head, group: -1 },
  });
  Body.setMass(body, 0.06);
  Body.setInertia(body, 0.06 * 60);
  Body.setVelocity(body, { x: vx / 60, y: vy / 60 });
  Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.2);
  Composite.add(world, body);
  list.push({
    body,
    sprite,
    sx,
    sy,
    flip: Math.random() * Math.PI * 2,
    flipSpeed: 3 + Math.random() * 5,
    age: 0,
    life: 16 + Math.random() * 12,
  });
}

/** Light drag-dominated flight with a sideways flutter; called every physics step. */
export function petalForces(list: LoosePetal[], air: Air, g: number, h: number, dt: number) {
  for (let i = 0; i < list.length; i++) {
    const pt = list[i];
    const b = pt.body;
    const vx = velX(b);
    const vy = velY(b);
    const speed = Math.hypot(vx, vy);
    airAt(air, b.position.x, b.position.y, tmp);
    // Settled petals sit in the still air at the page edge unless a real gust arrives.
    const resting = g >= 0 ? b.position.y > h - 16 : b.position.y < 16;
    if (resting && Math.hypot(tmp.x, tmp.y) < 260) {
      tmp.x *= 0.1;
      tmp.y *= 0.1;
    }
    const lively = Math.min(1, speed / 60);
    pt.flip += dt * pt.flipSpeed * Math.min(1.5, speed / 90);
    const flutter = Math.cos(pt.flip) * 80 * lively;
    const m = b.mass;
    b.force.x += m * (tmp.x * 1.1 - 1.6 * vx + flutter) * FORCE_SCALE;
    b.force.y += m * (g * 0.3 + tmp.y * 1.1 - 1.6 * vy) * FORCE_SCALE;
    b.torque += b.inertia * (Math.sin(pt.flip * 0.7) * 5 * lively - 2.2 * angVel(b)) * FORCE_SCALE;
  }
}

/** Ages petals and removes the ones that have faded out or escaped. */
export function agePetals(world: Matter.World, list: LoosePetal[], dt: number, w: number, h: number) {
  const over = list.length - MAX_PETALS;
  for (let i = list.length - 1; i >= 0; i--) {
    const pt = list[i];
    pt.age += dt;
    if (i < over && pt.age < pt.life - 1) pt.age = pt.life - 1;
    const p = pt.body.position;
    const lost = !(p.x > -400 && p.x < w + 400 && p.y > -400 && p.y < h + 400);
    if (pt.age >= pt.life || lost) {
      Composite.remove(world, pt.body);
      list.splice(i, 1);
    }
  }
}
