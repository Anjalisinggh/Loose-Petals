import type { Air, Plant, Sprite, Vec } from '../core/types';
import { clamp, pick, range, TAU } from '../core/math';
import { makeSprite } from '../canvas/sprites';
import { airAt } from '../physics/wind';
import type { Letter } from '../garden/lettering';

interface Butterfly {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  timer: number;
  flap: number;
  phase: number;
  size: number;
  /** The right-hand pair of wings; mirrored for the left. */
  wings: Sprite;
}

interface Firefly {
  x: number;
  y: number;
  heading: number;
  speed: number;
  phase: number;
  rate: number;
}

interface Bird {
  /** Offset from the flock's lead position. */
  ox: number;
  oy: number;
  flap: number;
  rate: number;
  size: number;
}

interface Flock {
  x: number;
  y: number;
  dir: number;
  speed: number;
  wait: number;
  birds: Bird[];
}

interface Mouse {
  x: number;
  y: number;
  dir: number;
  speed: number;
  running: boolean;
  timer: number;
  stride: number;
  scale: number;
}

/** The meadow's residents: butterflies and birds by day, fireflies by night, and one field mouse. */
export interface Creatures {
  butterflies: Butterfly[];
  fireflies: Firefly[];
  flock: Flock;
  mouse: Mouse;
  glow: Sprite;
}

export interface Habitat {
  w: number;
  h: number;
  horizon: number;
  letters: Letter[];
  plants: Plant[];
  air: Air;
  cursor: Vec | null;
  time: number;
}

const rnd = Math.random;

interface Species {
  base: string;
  inner: string;
  border: string;
  spots: string;
  veins: string;
}

const SPECIES: Species[] = [
  { base: '#f28a1e', inner: '#ffc45e', border: '#1c120c', spots: '#fff6e0', veins: 'rgba(28,16,8,0.75)' },
  { base: '#f6d23a', inner: '#fff1a0', border: '#231a10', spots: '#5b8fe6', veins: 'rgba(40,28,10,0.6)' },
  { base: '#f4f4ec', inner: '#ffffff', border: '#55585c', spots: '#3a3d40', veins: 'rgba(90,96,100,0.35)' },
  { base: '#3f86ea', inner: '#9fd0ff', border: '#0c1830', spots: '#eaf4ff', veins: 'rgba(8,20,50,0.55)' },
  { base: '#e8663e', inner: '#ffb07a', border: '#2a130c', spots: '#fff3e2', veins: 'rgba(40,16,8,0.6)' },
];

/** Bakes the right fore- and hindwing of a butterfly, with border, veins and margin spots. */
function wingSprite(sp: Species): Sprite {
  const S = 30;
  const w = S * 1.5;
  const h = S * 2.3;
  const ox = 3;
  const oy = S * 1.2;
  const fore = (c: CanvasRenderingContext2D) => {
    c.beginPath();
    c.moveTo(0, -S * 0.12);
    c.bezierCurveTo(S * 0.3, -S * 1.05, S * 1.3, -S * 1.12, S * 1.2, -S * 0.42);
    c.bezierCurveTo(S * 1.12, -S * 0.08, S * 0.5, S * 0.06, 0, S * 0.06);
    c.closePath();
  };
  const hind = (c: CanvasRenderingContext2D) => {
    c.beginPath();
    c.moveTo(0, 0);
    c.bezierCurveTo(S * 0.75, -S * 0.08, S * 1.08, S * 0.42, S * 0.66, S * 0.86);
    c.bezierCurveTo(S * 0.36, S * 1.04, S * 0.06, S * 0.56, 0, S * 0.22);
    c.closePath();
  };
  return makeSprite(w, h, ox, oy, (c) => {
    c.translate(ox, oy);
    for (const shape of [hind, fore]) {
      const fill = c.createRadialGradient(0, 0, S * 0.05, S * 0.3, 0, S * 1.25);
      fill.addColorStop(0, sp.inner);
      fill.addColorStop(0.55, sp.base);
      fill.addColorStop(1, sp.base);
      shape(c);
      c.fillStyle = fill;
      c.fill();
      c.save();
      c.clip();
      // Veins fan out from the wing root.
      c.strokeStyle = sp.veins;
      c.lineWidth = 0.9;
      const up = shape === fore;
      for (let i = 0; i < 7; i++) {
        const a = up ? -1.25 + i * 0.2 : 0.05 + i * 0.2;
        c.beginPath();
        c.moveTo(0, 0);
        c.quadraticCurveTo(Math.cos(a) * S * 0.6, Math.sin(a) * S * 0.6 + S * 0.05, Math.cos(a) * S * 1.5, Math.sin(a) * S * 1.5);
        c.stroke();
      }
      // A broad dark margin, then pale spots set into it.
      shape(c);
      c.strokeStyle = sp.border;
      c.lineWidth = S * 0.26;
      c.stroke();
      c.restore();
      shape(c);
      c.strokeStyle = sp.border;
      c.lineWidth = 1;
      c.stroke();
    }
    c.fillStyle = sp.spots;
    const dots: [number, number, number][] = [
      [1.12, -0.6, 0.05], [1.14, -0.42, 0.045], [1.02, -0.86, 0.05], [0.82, -0.98, 0.04], [1.02, -0.2, 0.04],
      [0.86, 0.5, 0.045], [0.72, 0.74, 0.045], [0.5, 0.86, 0.04], [0.92, 0.26, 0.04],
    ];
    for (const [dx, dy, r] of dots) {
      c.beginPath();
      c.arc(dx * S, dy * S, r * S, 0, TAU);
      c.fill();
    }
  });
}

function newFlock(w: number, h: number, horizon: number, soon: boolean): Flock {
  const dir = rnd() < 0.5 ? 1 : -1;
  const count = 3 + Math.floor(rnd() * 5);
  const scale = clamp(Math.min(w, h) / 760, 0.7, 1.2);
  const birds: Bird[] = [];
  for (let i = 0; i < count; i++) {
    const rank = Math.ceil(i / 2);
    const wing = i % 2 ? 1 : -1;
    birds.push({
      // A loose V behind the leader.
      ox: -dir * rank * range(rnd, 26, 38) * scale,
      oy: wing * rank * range(rnd, 10, 18) * scale + range(rnd, -4, 4),
      flap: rnd() * TAU,
      rate: range(rnd, 7.5, 10),
      size: range(rnd, 6.5, 9.5) * scale,
    });
  }
  return {
    x: dir > 0 ? -80 : w + 80,
    y: range(rnd, 0.08, 0.34) * h + 0 * horizon,
    dir,
    speed: range(rnd, 80, 130),
    wait: soon ? range(rnd, 1, 3) : range(rnd, 5, 12),
    birds,
  };
}

export function createCreatures(w: number, h: number, horizon: number): Creatures {
  const butterflies: Butterfly[] = [];
  const count = clamp(Math.round(w / 220), 4, 8);
  const sprites = SPECIES.map(wingSprite);
  for (let i = 0; i < count; i++) {
    butterflies.push({
      x: rnd() * w,
      y: range(rnd, horizon, h * 0.8),
      vx: 0,
      vy: 0,
      tx: rnd() * w,
      ty: h * 0.6,
      timer: 0,
      flap: rnd() * TAU,
      phase: rnd() * TAU,
      size: range(rnd, 9, 13) * clamp(Math.min(w, h) / 760, 0.75, 1.15),
      wings: sprites[i % sprites.length],
    });
  }
  const fireflies: Firefly[] = [];
  for (let i = 0; i < clamp(Math.round(w / 70), 10, 26); i++) {
    fireflies.push({
      x: rnd() * w,
      y: range(rnd, horizon - 20, h - 30),
      heading: rnd() * TAU,
      speed: range(rnd, 10, 26),
      phase: rnd() * TAU,
      rate: range(rnd, 1.2, 3),
    });
  }
  const glow = makeSprite(40, 40, 20, 20, (c) => {
    const g = c.createRadialGradient(20, 20, 0, 20, 20, 20);
    g.addColorStop(0, 'rgba(255,255,220,1)');
    g.addColorStop(0.18, 'rgba(226,255,140,0.85)');
    g.addColorStop(0.5, 'rgba(190,255,120,0.22)');
    g.addColorStop(1, 'rgba(190,255,120,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 40, 40);
  });
  return {
    butterflies,
    fireflies,
    flock: newFlock(w, h, horizon, true),
    mouse: {
      x: w * 0.4,
      y: h * 0.76,
      dir: 1,
      speed: 0,
      running: false,
      timer: 1,
      stride: 0,
      scale: clamp(Math.min(w, h) / 600, 0.85, 1.4),
    },
    glow,
  };
}

/** The word's bounding box, or null when nothing has been typed. */
function wordBox(letters: Letter[]) {
  if (!letters.length) return null;
  const first = letters[0];
  const last = letters[letters.length - 1];
  return { left: first.x, right: last.x + last.em * last.size, base: first.ty, size: first.size };
}

/** Where the ground lies just beneath the word. */
export const groundBelow = (base: number, size: number) => base + size * 0.16;

const tmp: Vec = { x: 0, y: 0 };

export function updateCreatures(cr: Creatures, el: number, env: Habitat) {
  const { w, h, horizon, cursor, time } = env;
  const box = wordBox(env.letters);

  for (const b of cr.butterflies) {
    b.timer -= el;
    if (b.timer <= 0 || Math.hypot(b.tx - b.x, b.ty - b.y) < 24) {
      b.timer = range(rnd, 1.8, 4.5);
      const roll = rnd();
      if (box && roll < 0.7) {
        // Mostly they orbit the word.
        b.tx = range(rnd, box.left - 70, box.right + 70);
        b.ty = range(rnd, box.base - box.size * 1.15, box.base + box.size * 0.5);
      } else if (env.plants.length && roll < 0.9) {
        const p = pick(rnd, env.plants);
        b.tx = p.head.position.x + range(rnd, -30, 30);
        b.ty = p.head.position.y - range(rnd, 6, 40);
      } else {
        b.tx = range(rnd, 40, w - 40);
        b.ty = range(rnd, horizon - 40, h * 0.82);
      }
      b.tx = clamp(b.tx, 20, w - 20);
      b.ty = clamp(b.ty, 40, h - 30);
    }
    airAt(env.air, b.x, b.y, tmp);
    let ax = (b.tx - b.x) * 0.9 - b.vx * 0.9 + Math.sin(time * 3.1 + b.phase) * 46 + tmp.x * 0.3;
    let ay = (b.ty - b.y) * 0.9 - b.vy * 0.9 + Math.cos(time * 4.3 + b.phase) * 62 + tmp.y * 0.3;
    if (cursor) {
      const dx = b.x - cursor.x;
      const dy = b.y - cursor.y;
      const d = Math.hypot(dx, dy) + 1;
      if (d < 130) {
        const f = (560 * (1 - d / 130)) / d;
        ax += dx * f;
        ay += dy * f;
      }
    }
    b.vx += ax * el;
    b.vy += ay * el;
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > 190) {
      b.vx *= 190 / speed;
      b.vy *= 190 / speed;
    }
    b.x += b.vx * el;
    b.y += b.vy * el;
    b.flap += el * (11 + speed * 0.05);
  }

  for (const f of cr.fireflies) {
    f.heading += (rnd() - 0.5) * 2.4 * el;
    f.x += Math.cos(f.heading) * f.speed * el;
    f.y += Math.sin(f.heading) * f.speed * 0.6 * el;
    if (f.x < -20) f.x = w + 20;
    if (f.x > w + 20) f.x = -20;
    if (f.y < horizon - 30 || f.y > h - 20) f.heading = -f.heading;
    f.y = clamp(f.y, horizon - 30, h - 20);
  }

  // A flock crosses the sky, leaves, and after a while another arrives.
  const flock = cr.flock;
  if (flock.wait > 0) {
    flock.wait -= el;
  } else {
    flock.x += flock.dir * flock.speed * el;
    flock.y += Math.sin(time * 0.7) * 6 * el;
    for (const b of flock.birds) b.flap += el * b.rate;
    if (flock.x < -320 || flock.x > w + 320) cr.flock = newFlock(w, h, horizon, false);
  }

  const m = cr.mouse;
  const ground = box ? Math.min(groundBelow(box.base, box.size), h - 40) : h * 0.72;
  m.y += (ground - m.y) * Math.min(1, el * 6);
  const left = clamp(box ? box.left - 120 : w * 0.12, 24, w - 24);
  const right = clamp(box ? box.right + 120 : w * 0.88, 24, w - 24);
  m.timer -= el;
  // It bolts when the cursor comes close.
  if (cursor && Math.abs(cursor.x - m.x) < 130 && Math.abs(cursor.y - m.y) < 90) {
    m.running = true;
    m.dir = m.x >= cursor.x ? 1 : -1;
    m.speed = 300;
    m.timer = 0.45;
  } else if (m.timer <= 0) {
    m.running = !m.running;
    if (m.running) {
      m.dir = rnd() < 0.5 ? -1 : 1;
      m.speed = range(rnd, 70, 160);
      m.timer = range(rnd, 0.6, 2.4);
    } else {
      m.timer = range(rnd, 0.5, 2.2);
    }
  }
  if (m.running) {
    m.x += m.dir * m.speed * el;
    m.stride += el * m.speed * 0.14;
    if (m.x < left) {
      m.x = left;
      m.dir = 1;
    } else if (m.x > right) {
      m.x = right;
      m.dir = -1;
    }
  }
}

export const mouseY = (cr: Creatures) => cr.mouse.y;

/** A field mouse with a lit back, soft belly, proper ear and a tapering tail. */
export function drawMouse(c: CanvasRenderingContext2D, cr: Creatures, night: number, time: number) {
  const m = cr.mouse;
  const dark = night > 0.5;
  const furLight = dark ? '#7d7a9c' : '#c2a077';
  const fur = dark ? '#4d4a68' : '#94734f';
  const furDark = dark ? '#2b2940' : '#5f4630';
  const belly = dark ? '#9d9ab8' : '#ecdcc4';
  const pink = dark ? '#9a85a4' : '#e9aaa0';
  const bob = m.running ? Math.sin(m.stride) * 1.1 : Math.sin(time * 4.5) * 0.35;
  const wag = Math.sin(time * (m.running ? 13 : 2.6)) * 2.4;
  const stride = m.running ? Math.sin(m.stride) : 0;

  c.save();
  c.translate(m.x, m.y);
  c.scale(m.dir * m.scale, m.scale);
  c.lineCap = 'round';
  c.lineJoin = 'round';

  c.fillStyle = dark ? 'rgba(0,8,16,0.35)' : 'rgba(10,50,12,0.3)';
  c.beginPath();
  c.ellipse(1, 0.6, 17, 3, 0, 0, TAU);
  c.fill();

  // Tail: thick at the root, hair-thin at the tip.
  for (const [width, end] of [[2.4, 0.5], [1.6, 0.8], [0.9, 1]] as const) {
    c.strokeStyle = pink;
    c.lineWidth = width;
    c.beginPath();
    c.moveTo(-13, -4.5);
    c.quadraticCurveTo(-13 - 12 * end, -3 - wag * end, -13 - 21 * end, -4.5 + (-7 + wag) * end * end);
    c.stroke();
  }

  // Feet.
  c.fillStyle = pink;
  c.beginPath();
  c.ellipse(-7 + stride * 3.2, -0.6, 3.4, 1.4, 0, 0, TAU);
  c.ellipse(7.5 - stride * 3.2, -0.6, 2.8, 1.3, 0, 0, TAU);
  c.fill();

  // Body: one rounded form from haunch to shoulder, lit from above.
  const coat = c.createLinearGradient(0, -17 + bob, 0, 0);
  coat.addColorStop(0, furLight);
  coat.addColorStop(0.45, fur);
  coat.addColorStop(1, furDark);
  c.fillStyle = coat;
  c.beginPath();
  c.moveTo(-14, -3 + bob);
  c.bezierCurveTo(-16, -15 + bob, -3, -18.5 + bob, 6, -15 + bob);
  c.bezierCurveTo(13, -14.5 + bob, 20, -11 + bob, 23.5, -6.4 + bob);
  c.bezierCurveTo(20, -2.4 + bob, 12, -0.6 + bob, 5, -0.8 + bob);
  c.bezierCurveTo(-3, -0.2 + bob, -12, 0 + bob, -14, -3 + bob);
  c.closePath();
  c.fill();

  c.fillStyle = belly;
  c.beginPath();
  c.moveTo(-10, -1.4 + bob);
  c.quadraticCurveTo(2, -5 + bob, 20, -3.6 + bob);
  c.quadraticCurveTo(12, -0.4 + bob, 4, -0.7 + bob);
  c.quadraticCurveTo(-4, -0.2 + bob, -10, -1.4 + bob);
  c.fill();

  // Short fur strokes following the curve of the back.
  c.strokeStyle = dark ? 'rgba(20,18,36,0.4)' : 'rgba(70,46,24,0.4)';
  c.lineWidth = 0.55;
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    const fx = -12 + t * 24;
    const fy = -13.5 + Math.pow(t - 0.4, 2) * 16 + bob + (i % 3) * 1.8;
    c.beginPath();
    c.moveTo(fx, fy);
    c.lineTo(fx - 2.6, fy + 1.3);
    c.stroke();
  }

  // Ear: a thin cupped disc, pink and slightly translucent inside.
  c.fillStyle = fur;
  c.beginPath();
  c.ellipse(9.5, -16.5 + bob, 4.8, 5.4, -0.25, 0, TAU);
  c.fill();
  const ear = c.createRadialGradient(10, -16 + bob, 0.5, 9.8, -16.5 + bob, 4.4);
  ear.addColorStop(0, pink);
  ear.addColorStop(1, dark ? '#5d5270' : '#c98a80');
  c.fillStyle = ear;
  c.beginPath();
  c.ellipse(9.9, -16.3 + bob, 3.2, 3.8, -0.25, 0, TAU);
  c.fill();

  // Eye with a catchlight, nose and whiskers.
  c.fillStyle = '#120d0b';
  c.beginPath();
  c.arc(16.2, -9.8 + bob, 1.55, 0, TAU);
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.9)';
  c.beginPath();
  c.arc(16.7, -10.3 + bob, 0.5, 0, TAU);
  c.fill();
  c.fillStyle = pink;
  c.beginPath();
  c.arc(23.3, -6.5 + bob, 1.25, 0, TAU);
  c.fill();
  c.strokeStyle = dark ? 'rgba(225,225,255,0.55)' : 'rgba(255,255,255,0.7)';
  c.lineWidth = 0.45;
  for (const dy of [-3, -0.6, 1.6]) {
    c.beginPath();
    c.moveTo(21.4, -5.6 + bob);
    c.quadraticCurveTo(25, -6 + dy * 0.5 + bob, 29.5, -6 + dy + bob);
    c.stroke();
  }
  c.restore();
}

/** Distant birds: a spindle body with two wings that sweep through the stroke. */
export function drawBirds(c: CanvasRenderingContext2D, cr: Creatures, night: number) {
  const flock = cr.flock;
  if (flock.wait > 0 || night >= 1) return;
  c.globalAlpha = 1 - night;
  for (const b of flock.birds) {
    const s = b.size;
    // Down-strokes are quick, the recovery glides.
    const beat = Math.sin(b.flap) + 0.25 * Math.sin(b.flap * 2);
    c.save();
    c.translate(flock.x + b.ox, flock.y + b.oy + beat * s * 0.12);
    c.scale(flock.dir, 1);

    const wing = (lift: number, shade: string) => {
      const tipY = -lift * s * 1.25;
      c.fillStyle = shade;
      c.beginPath();
      c.moveTo(s * 0.35, -s * 0.05);
      c.quadraticCurveTo(-s * 0.05, tipY * 0.75 - s * 0.25, -s * 0.9, tipY);
      c.quadraticCurveTo(-s * 0.45, tipY * 0.35 + s * 0.12, -s * 0.5, s * 0.02);
      c.closePath();
      c.fill();
    };
    wing(beat * 0.8 + 0.15, '#56606b');

    // Forked tail, body, pale underside, head and beak.
    c.fillStyle = '#2a323c';
    c.beginPath();
    c.moveTo(-s * 0.7, 0);
    c.lineTo(-s * 1.75, -s * 0.24);
    c.lineTo(-s * 1.2, 0);
    c.lineTo(-s * 1.75, s * 0.24);
    c.closePath();
    c.fill();
    c.beginPath();
    c.ellipse(0, 0, s, s * 0.3, 0, 0, TAU);
    c.fill();
    c.fillStyle = '#d9dfe2';
    c.beginPath();
    c.ellipse(s * 0.1, s * 0.1, s * 0.7, s * 0.17, 0, 0, TAU);
    c.fill();
    c.fillStyle = '#2a323c';
    c.beginPath();
    c.arc(s * 0.86, -s * 0.06, s * 0.27, 0, TAU);
    c.fill();
    c.fillStyle = '#c9762e';
    c.beginPath();
    c.moveTo(s * 1.08, -s * 0.12);
    c.lineTo(s * 1.42, -s * 0.03);
    c.lineTo(s * 1.08, s * 0.05);
    c.closePath();
    c.fill();

    wing(beat, '#1d242c');
    c.restore();
  }
  c.globalAlpha = 1;
}

/** Butterflies fade out as night falls and fireflies light up in their place. */
export function drawFlyers(c: CanvasRenderingContext2D, cr: Creatures, night: number, time: number) {
  if (night < 1) {
    c.globalAlpha = 1 - night;
    for (const b of cr.butterflies) {
      const k = b.size / 30;
      const open = 0.1 + 0.9 * Math.abs(Math.sin(b.flap));
      const wings = b.wings;
      c.save();
      c.translate(b.x, b.y);
      c.rotate(clamp(b.vx * 0.004, -0.6, 0.6));
      for (const side of [-1, 1]) {
        c.save();
        c.scale(side * open * k, k);
        c.drawImage(wings.canvas, -wings.ax, -wings.ay, wings.w, wings.h);
        c.restore();
      }
      // Head, thorax and tapering abdomen, with clubbed antennae.
      const s = b.size;
      c.fillStyle = '#1d1410';
      c.beginPath();
      c.ellipse(0, s * 0.3, s * 0.07, s * 0.36, 0, 0, TAU);
      c.ellipse(0, -s * 0.08, s * 0.1, s * 0.17, 0, 0, TAU);
      c.arc(0, -s * 0.3, s * 0.085, 0, TAU);
      c.fill();
      c.strokeStyle = '#1d1410';
      c.lineWidth = 0.6;
      c.lineCap = 'round';
      for (const side of [-1, 1]) {
        c.beginPath();
        c.moveTo(0, -s * 0.34);
        c.quadraticCurveTo(side * s * 0.1, -s * 0.6, side * s * 0.26, -s * 0.74);
        c.stroke();
        c.beginPath();
        c.arc(side * s * 0.26, -s * 0.74, 0.9, 0, TAU);
        c.fill();
      }
      c.restore();
    }
  }
  if (night > 0) {
    const g = cr.glow;
    for (const f of cr.fireflies) {
      const pulse = Math.max(0, Math.sin(time * f.rate + f.phase));
      c.globalAlpha = night * (0.25 + 0.75 * pulse);
      const r = 9 + 9 * pulse;
      c.drawImage(g.canvas, f.x - r, f.y - r, r * 2, r * 2);
    }
  }
  c.globalAlpha = 1;
}
