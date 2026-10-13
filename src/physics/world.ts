import Matter from 'matter-js';

const { Engine, Bodies, Composite, Body } = Matter;

/** Fixed physics step in seconds. Everything is integrated at this rate. */
export const STEP = 1 / 120;
/** Gravity in px/s² when the gravity control is at 1. */
export const G_MAX = 1500;
export const G_DEFAULT = 0.35;
/** Matter integrates with milliseconds; our forces are in px/s². */
export const FORCE_SCALE = 1e-6;

export const CAT = { wall: 0x0001, head: 0x0002, petal: 0x0004 };
export const HEAD_MASK = CAT.wall | CAT.head | CAT.petal;

export interface World {
  engine: Matter.Engine;
  walls: Matter.Body[];
}

export function createWorld(): World {
  // Gravity is applied by hand so each kind of object can weigh differently.
  const engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 } });
  engine.positionIterations = 6;
  engine.velocityIterations = 4;
  return { engine, walls: [] };
}

/** Rebuilds the invisible box that keeps heads and loose petals on the page. */
export function setBounds(world: World, w: number, h: number) {
  if (world.walls.length) Composite.remove(world.engine.world, world.walls);
  const t = 240;
  const opts = {
    isStatic: true,
    friction: 0.9,
    restitution: 0.15,
    collisionFilter: { category: CAT.wall, mask: 0xffff, group: 0 },
  };
  world.walls = [
    Bodies.rectangle(w / 2, h - 3 + t / 2, w + 1200, t, opts),
    Bodies.rectangle(w / 2, 3 - t / 2, w + 1200, t, opts),
    Bodies.rectangle(-40 - t / 2, h / 2, t, h + 1200, opts),
    Bodies.rectangle(w + 40 + t / 2, h / 2, t, h + 1200, opts),
  ];
  Composite.add(world.engine.world, world.walls);
}

/** Matter's Verlet state; present at runtime but missing from the published typings. */
type Verlet = Matter.Body & { positionPrev: Matter.Vector; anglePrev: number };

export const velX = (b: Matter.Body) => (b.position.x - (b as Verlet).positionPrev.x) / STEP;
export const velY = (b: Matter.Body) => (b.position.y - (b as Verlet).positionPrev.y) / STEP;
export const angVel = (b: Matter.Body) => (b.angle - (b as Verlet).anglePrev) / STEP;

/** Adds to a body's velocity, in px/s. */
export function kick(b: Matter.Body, dvx: number, dvy: number) {
  Body.setVelocity(b, { x: (velX(b) + dvx) / 60, y: (velY(b) + dvy) / 60 });
}

/** Adds to a body's angular velocity, in rad/s. */
export function spin(b: Matter.Body, dw: number) {
  Body.setAngularVelocity(b, (angVel(b) + dw) / 60);
}
