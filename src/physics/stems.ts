import type { Air, Plant, Vec } from '../core/types';
import { clamp, easeOutCubic, wrapAngle } from '../core/math';
import { airAt } from './wind';
import { angVel, HEAD_MASK, velX, velY } from './world';

/** Viscous damping between neighbouring stem points, so bends die out instead of ringing. */
const C_INT = 11;
const NODE_DRAG = 1.5;
const HEAD_DRAG = 1.25;
export const STEM_GRAV = 0.12;
const STEM_SAIL = 0.35;

const tmp: Vec = { x: 0, y: 0 };

export function resetForces(p: Plant) {
  const nodes = p.nodes;
  for (let i = 0; i < nodes.length; i++) {
    nodes[i].ax = 0;
    nodes[i].ay = 0;
  }
  p.fx = 0;
  p.fy = 0;
  p.tq = 0;
}

/**
 * Accumulates the spring forces along one stem and the environmental forces on its head.
 *
 * The stem is a chain of points ending in the head body. Each segment has two springs:
 * a stretch spring holding its length, and a bend spring pulling its far end toward where
 * it would sit if the stem kept its resting curve relative to the segment before it.
 */
export function plantForces(p: Plant, air: Air, g: number) {
  const nodes = p.nodes;
  const n = nodes.length;
  const head = p.head;
  const grow = easeOutCubic(clamp(p.growth, 0, 1));
  const L = p.segLen * Math.max(0.03, grow);
  p.curLen = L;

  const root = nodes[0];
  let prev = p.baseAngle;
  if (p.pin) {
    root.x = p.pin.x;
    root.y = p.pin.y;
  }
  if (p.parent) {
    const pn = p.parent.plant.nodes;
    const a = pn[p.parent.node];
    const b = pn[p.parent.node - 1];
    root.x = a.x;
    root.y = a.y;
    root.vx = a.vx;
    root.vy = a.vy;
    prev += Math.atan2(a.y - b.y, a.x - b.x);
  }

  const hx = head.position.x;
  const hy = head.position.y;
  const hvx = velX(head);
  const hvy = velY(head);
  p.vx = hvx;
  p.vy = hvy;

  for (let i = 1; i <= n; i++) {
    const a = nodes[i - 1];
    const b = i < n ? nodes[i] : null;
    const bx = b ? b.x : hx;
    const by = b ? b.y : hy;
    const bvx = b ? b.vx : hvx;
    const bvy = b ? b.vy : hvy;

    const ang = prev + p.restAngles[i];
    // Stiffer at the base, more supple toward the tip.
    const kb = p.kBend * (1.6 - (1.05 * (i - 1)) / Math.max(1, n - 1));
    let fx = kb * (a.x + Math.cos(ang) * L - bx);
    let fy = kb * (a.y + Math.sin(ang) * L - by);

    const dx = bx - a.x;
    const dy = by - a.y;
    const d = Math.hypot(dx, dy);
    if (d > 1e-3) {
      const s = (-p.kStretch * (d - L)) / d;
      fx += s * dx;
      fy += s * dy;
      prev = Math.atan2(dy, dx);
    } else {
      prev = ang;
    }

    fx += C_INT * (a.vx - bvx);
    fy += C_INT * (a.vy - bvy);

    if (b) {
      b.ax += fx;
      b.ay += fy;
    } else {
      p.fx += fx;
      p.fy += fy;
    }
    if (i > 1) {
      a.ax -= fx;
      a.ay -= fy;
    } else if (p.parent) {
      // A side shoot tugs on the stem it grows from.
      const pn = p.parent.plant.nodes[p.parent.node];
      pn.ax -= fx * 0.3;
      pn.ay -= fy * 0.3;
    }
  }
  p.tipAngle = prev;

  const m = head.mass;
  const v = p.variety;
  airAt(air, hx, hy, tmp);
  p.fx += m * (tmp.x * v.sail - HEAD_DRAG * hvx);
  p.fy += m * (g + tmp.y * v.sail - HEAD_DRAG * hvy);

  const w = angVel(head);
  p.w = w;
  let alpha = -v.angDamp * w;
  if (v.align > 0) alpha += v.align * wrapAngle(prev + Math.PI / 2 - head.angle);
  p.tq += head.inertia * alpha;
}

/** Advances stem points, leaves, growth and the petals' secondary motion by one step. */
export function integratePlant(p: Plant, air: Air, g: number, dt: number) {
  if (p.growth < 1) {
    p.growth = Math.min(1, p.growth + dt * p.growRate);
    if (!p.solid && p.growth > 0.85) {
      p.solid = true;
      p.head.collisionFilter.mask = HEAD_MASK;
    }
  }

  const nodes = p.nodes;
  const n = nodes.length;
  const damp = Math.max(0, 1 - NODE_DRAG * dt);
  for (let i = 1; i < n; i++) {
    const nd = nodes[i];
    airAt(air, nd.x, nd.y, tmp);
    nd.ax += tmp.x * STEM_SAIL;
    nd.ay += g * STEM_GRAV + tmp.y * STEM_SAIL;
    nd.vx = (nd.vx + nd.ax * dt) * damp;
    nd.vy = (nd.vy + nd.ay * dt) * damp;
    nd.x += nd.vx * dt;
    nd.y += nd.vy * dt;
  }

  const head = p.head;
  for (let k = 0; k < p.leaves.length; k++) {
    const lf = p.leaves[k];
    const nd = nodes[lf.node];
    const before = nodes[lf.node - 1];
    const after = lf.node + 1 < n ? nodes[lf.node + 1] : head.position;
    const tangent = Math.atan2(after.y - before.y, after.x - before.x);
    const th = tangent + lf.side * (lf.rest + lf.angle);
    lf.abs = th;
    airAt(air, nd.x, nd.y, tmp);
    // Leaves droop with gravity, lift in wind and flick when their stem jerks.
    const fx = tmp.x - nd.ax * 0.5;
    const fy = g * 0.6 + tmp.y - nd.ay * 0.5;
    const torque = Math.cos(th) * fy - Math.sin(th) * fx;
    lf.vel += (lf.side * torque * 0.02 - 70 * lf.angle - 7 * lf.vel) * dt;
    lf.angle = clamp(lf.angle + lf.vel * dt, -1.3, 1.3);
  }

  // Petals lag the head's linear and angular acceleration, then catch up.
  const ax = (velX(head) - p.vx) / dt;
  const ay = (velY(head) - p.vy) / dt;
  const aw = (angVel(head) - p.w) / dt;
  const maxLean = p.radius * 0.32;
  p.lvx += (-180 * p.lx - 16 * p.lvx - 0.5 * clamp(ax, -6000, 6000)) * dt;
  p.lvy += (-180 * p.ly - 16 * p.lvy - 0.5 * clamp(ay, -6000, 6000)) * dt;
  p.lx = clamp(p.lx + p.lvx * dt, -maxLean, maxLean);
  p.ly = clamp(p.ly + p.lvy * dt, -maxLean, maxLean);
  p.twv += (-120 * p.tw - 10 * p.twv - 0.45 * clamp(aw, -400, 400)) * dt;
  p.tw = clamp(p.tw + p.twv * dt, -0.55, 0.55);

  p.hoverV += (160 * (p.hoverTarget - p.hover) - 14 * p.hoverV) * dt;
  p.hover += p.hoverV * dt;

  const slots = p.art.slots;
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].scale < 1) slots[i].scale = Math.min(1, slots[i].scale + dt * 0.45);
  }
}
