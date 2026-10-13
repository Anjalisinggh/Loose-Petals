import Matter from 'matter-js';
import type { Leaf, Plant, StemNode, Variety, Vec } from '../core/types';
import { clamp, lerp, pick, range, TAU, type Rng } from '../core/math';
import { jitterHex, tone } from '../core/color';
import { CAT, HEAD_MASK } from '../physics/world';
import { STEM_GRAV } from '../physics/stems';

const { Bodies, Body } = Matter;

/** Bending stiffness per unit of load that keeps a stem upright, with a slight nod, at default gravity. */
const STAND = 24;

const STEM_COLORS = ['#1E4A32', '#24553A', '#1A3F2B', '#2C5E3F', '#1F4A33'];
const LEAF_COLORS = ['#2F6B46', '#3C7A4F', '#285A3C', '#34704A'];
const STEM_NIGHT = ['#6fb9a2', '#5aa690', '#7fc4ae'];
const LEAF_NIGHT = ['#4f9c8a', '#62b09a', '#458a7c'];

export interface PlantOptions {
  id: number;
  variety: Variety;
  rng: Rng;
  scale: number;
  /** Seconds before the plant starts to grow. */
  delay: number;
  /** Skip the growth animation and start at rest. */
  instant: boolean;
  user: boolean;
  color?: string;
  // A plant rooted in the ground (or ceiling) and reaching for `target`…
  root?: Vec;
  target?: Vec;
  anchor?: 'bottom' | 'top';
  /** A live point the root should follow instead of staying put. */
  pin?: Vec;
  // …or a side shoot from another plant's stem.
  parent?: { plant: Plant; node: number };
  side?: number;
  length?: number;
}

export function createPlant(o: PlantOptions): Plant {
  const { variety: v, rng } = o;
  const R = range(rng, v.radius[0], v.radius[1]) * o.scale;
  const color = o.color ?? pick(rng, v.palette);
  const art = v.build(rng, R, jitterHex(color, rng, 0.035));

  const rest: number[] = [0];
  let n: number;
  let segLen: number;
  let baseAngle: number;
  let rootX: number;
  let rootY: number;
  let absAngle: number;

  if (o.parent) {
    const len = o.length ?? 50;
    const side = o.side ?? 1;
    n = clamp(Math.round(len / v.seg), 2, 4);
    segLen = len / n;
    baseAngle = side * range(rng, 0.55, 0.95);
    for (let i = 1; i <= n; i++) rest.push(i === 1 ? 0 : -side * range(rng, 0.1, 0.32));
    const pn = o.parent.plant.nodes;
    const a = pn[o.parent.node];
    const b = pn[o.parent.node - 1];
    rootX = a.x;
    rootY = a.y;
    const pa = Math.hypot(a.x - b.x, a.y - b.y) > 0.5 ? Math.atan2(a.y - b.y, a.x - b.x) : -Math.PI / 2;
    absAngle = pa + baseAngle;
  } else {
    const root = o.root!;
    const target = o.target!;
    const dx = target.x - root.x;
    const dy = target.y - root.y;
    const dist = Math.max(o.pin ? 12 : 40, Math.hypot(dx, dy));
    n = clamp(Math.round(dist / (v.seg * o.scale)), o.pin ? 2 : 4, 16);
    // A gentle wandering curve plus small kinks, then rotated and scaled so the
    // resting tip lands exactly on the target.
    const amp = v.curl * range(rng, 0.5, 1.2) * (rng() < 0.5 ? -1 : 1);
    const freq = range(rng, 0.5, 1.25);
    const phase = rng() * TAU;
    let a = 0;
    let x = 0;
    let y = 0;
    for (let i = 1; i <= n; i++) {
      const r = (amp * Math.sin((i / n) * TAU * freq + phase)) / (n * 0.45) + range(rng, -0.06, 0.06);
      rest.push(r);
      a += r;
      x += Math.cos(a);
      y += Math.sin(a);
    }
    baseAngle = Math.atan2(dy, dx) - Math.atan2(y, x);
    segLen = dist / Math.max(Math.hypot(x, y), n * 0.4);
    rootX = root.x;
    rootY = root.y;
    absAngle = baseAngle;
  }

  // Lay the points out along the resting curve; while growing they start bunched at the root.
  const spacing = o.instant ? segLen : 0.6;
  const nodes: StemNode[] = [];
  let px = rootX;
  let py = rootY;
  let ang = absAngle;
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      ang += rest[i];
      px += Math.cos(ang) * spacing;
      py += Math.sin(ang) * spacing;
    }
    nodes.push({ x: px, y: py, vx: 0, vy: 0, ax: 0, ay: 0 });
  }
  ang += rest[n];
  px += Math.cos(ang) * spacing;
  py += Math.sin(ang) * spacing;

  const mass = Math.max(0.2, v.mass * o.scale * o.scale);
  const head = Bodies.circle(px, py, Math.max(5, R * 0.55), {
    restitution: 0.45,
    friction: 0.08,
    frictionAir: 0.008,
    slop: 0.5,
    label: 'head',
    angle: v.align > 0 ? ang + Math.PI / 2 : rng() * TAU,
    collisionFilter: { category: CAT.head, mask: o.instant ? HEAD_MASK : 0, group: 0 },
  });
  Body.setMass(head, mass);
  Body.setInertia(head, mass * R * R * 0.5);

  // Enough bending stiffness to carry the head (and the stem itself) at default gravity,
  // scaled by how rigid this variety is meant to feel.
  const load = mass + n * STEM_GRAV * 0.5;
  const kBend = clamp((v.stiff * STAND * load * n * n) / segLen, 220, 5200);

  const leaves: Leaf[] = [];
  const count = o.parent ? 0 : Math.round(range(rng, v.leaves.count[0], v.leaves.count[1]));
  let side = rng() < 0.5 ? 1 : -1;
  for (let k = 0; k < count; k++) {
    const t = lerp(v.leaves.from, v.leaves.to, (k + rng() * 0.6) / Math.max(1, count));
    leaves.push({
      node: clamp(Math.round(t * (n - 1)), 1, n - 1),
      side,
      size: range(rng, v.leaves.size[0], v.leaves.size[1]) * o.scale,
      width: v.leaves.width * range(rng, 0.85, 1.2),
      rest: range(rng, 0.5, 0.95),
      angle: 0,
      vel: 0,
      abs: 0,
      color: tone(pick(rng, LEAF_COLORS), range(rng, -0.08, 0.08)),
      night: pick(rng, LEAF_NIGHT),
    });
    side = -side;
  }

  const rate = 1 / range(rng, 1.7, 2.5);
  return {
    id: o.id,
    variety: v,
    user: o.user,
    anchor: o.anchor ?? 'bottom',
    parent: o.parent ?? null,
    pin: o.pin ?? null,
    nodes,
    restAngles: rest,
    baseAngle,
    segLen,
    curLen: segLen,
    kBend,
    kStretch: 3000,
    tipAngle: ang,
    stemW: v.stemW * (0.75 + 0.25 * o.scale) * (o.parent ? 0.75 : 1),
    stemColor: pick(rng, STEM_COLORS),
    stemNight: pick(rng, STEM_NIGHT),
    leaves,
    head,
    color,
    radius: R,
    art,
    solid: o.instant,
    grabbed: 0,
    growth: o.instant ? 1 : -o.delay * rate,
    growRate: rate,
    fx: 0,
    fy: 0,
    tq: 0,
    vx: 0,
    vy: 0,
    w: 0,
    lx: 0,
    ly: 0,
    lvx: 0,
    lvy: 0,
    tw: 0,
    twv: 0,
    hover: 0,
    hoverV: 0,
    hoverTarget: 0,
  };
}
