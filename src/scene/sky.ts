import type { Sprite } from '../core/types';
import { mulberry32, range, TAU, type Rng } from '../core/math';
import { makeSprite } from '../canvas/sprites';
import type { Backdrop } from './backdrop';

interface Cloud {
  x: number;
  y: number;
  scale: number;
  speed: number;
  shape: number;
}

/** The moving parts of the sky: drifting clouds, and the sun and moon that trade places. */
export interface Sky {
  clouds: Cloud[];
  day: Sprite[];
  night: Sprite[];
  sun: Sprite;
  moon: Sprite;
}

const CLOUD_W = 280;
const CLOUD_H = 120;

function cloudSprite(rng: Rng, night: boolean): Sprite {
  return makeSprite(CLOUD_W, CLOUD_H, CLOUD_W / 2, CLOUD_H / 2, (c) => {
    const puffs = 11;
    for (let i = 0; i < puffs; i++) {
      const t = i / (puffs - 1);
      const x = 40 + t * (CLOUD_W - 80) + range(rng, -12, 12);
      const r = (22 + Math.sin(t * Math.PI) * 26) * range(rng, 0.8, 1.2);
      const y = CLOUD_H * 0.62 - r * 0.45 + range(rng, -6, 6);
      const g = c.createRadialGradient(x, y - r * 0.2, 0, x, y, r);
      if (night) {
        g.addColorStop(0, 'rgba(70,104,200,0.85)');
        g.addColorStop(0.6, 'rgba(28,48,130,0.6)');
        g.addColorStop(1, 'rgba(14,26,90,0)');
      } else {
        g.addColorStop(0, 'rgba(255,255,255,0.96)');
        g.addColorStop(0.65, 'rgba(244,249,255,0.7)');
        g.addColorStop(1, 'rgba(230,240,252,0)');
      }
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.fill();
    }
    // Clouds are lit from above: their undersides fall into blue-grey shade.
    const under = c.createLinearGradient(0, CLOUD_H * 0.35, 0, CLOUD_H * 0.9);
    under.addColorStop(0, 'rgba(0,0,0,0)');
    under.addColorStop(1, night ? 'rgba(2,6,40,0.55)' : 'rgba(104,132,176,0.5)');
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = under;
    c.fillRect(0, 0, CLOUD_W, CLOUD_H);
    c.globalCompositeOperation = 'source-over';
  });
}

export function createSky(w: number, h: number, backdrop: Backdrop): Sky {
  const rng = mulberry32(606);
  const day: Sprite[] = [];
  const night: Sprite[] = [];
  for (let i = 0; i < 3; i++) {
    const seed = 100 + i;
    day.push(cloudSprite(mulberry32(seed), false));
    night.push(cloudSprite(mulberry32(seed), true));
  }
  const clouds: Cloud[] = [];
  const count = Math.max(4, Math.round(w / 260));
  for (let i = 0; i < count; i++) {
    clouds.push({
      x: ((i + rng() * 0.8) / count) * (w + CLOUD_W) - CLOUD_W / 2,
      y: range(rng, 0.05, 0.36) * h,
      scale: range(rng, 0.55, 1.25) * Math.max(0.7, Math.min(w, h) / 760),
      speed: range(rng, 4, 11),
      shape: i % 3,
    });
  }

  const sr = backdrop.sun.r;
  const sun = makeSprite(sr * 8, sr * 8, sr * 4, sr * 4, (c) => {
    const g = c.createRadialGradient(sr * 4, sr * 4, sr * 0.6, sr * 4, sr * 4, sr * 4);
    g.addColorStop(0, 'rgba(255,250,214,0.95)');
    g.addColorStop(0.3, 'rgba(255,240,180,0.4)');
    g.addColorStop(1, 'rgba(255,240,180,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, sr * 8, sr * 8);
    c.fillStyle = '#fffbe6';
    c.beginPath();
    c.arc(sr * 4, sr * 4, sr, 0, TAU);
    c.fill();
  });

  const mr = backdrop.moon.r;
  const moon = makeSprite(mr * 7, mr * 7, mr * 3.5, mr * 3.5, (c) => {
    const o = mr * 3.5;
    const g = c.createRadialGradient(o, o, mr * 0.8, o, o, mr * 3.5);
    g.addColorStop(0, 'rgba(236,244,214,0.6)');
    g.addColorStop(0.35, 'rgba(170,200,255,0.2)');
    g.addColorStop(1, 'rgba(170,200,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, mr * 7, mr * 7);
    const face = c.createRadialGradient(o - mr * 0.3, o - mr * 0.3, mr * 0.1, o, o, mr);
    face.addColorStop(0, '#fffdf0');
    face.addColorStop(1, '#e6e8c8');
    c.fillStyle = face;
    c.beginPath();
    c.arc(o, o, mr, 0, TAU);
    c.fill();
    c.save();
    c.clip();
    const m = mulberry32(31);
    for (let i = 0; i < 9; i++) {
      c.fillStyle = `rgba(120,130,110,${range(m, 0.08, 0.2)})`;
      c.beginPath();
      c.arc(o + range(m, -0.8, 0.8) * mr, o + range(m, -0.8, 0.8) * mr, range(m, 0.08, 0.3) * mr, 0, TAU);
      c.fill();
    }
    c.restore();
  });

  return { clouds, day, night, sun, moon };
}

export function updateSky(sky: Sky, el: number, wind: number, w: number) {
  for (const cl of sky.clouds) {
    cl.x += cl.speed * (0.4 + wind * 2.4) * el;
    const half = (CLOUD_W / 2) * cl.scale;
    if (cl.x - half > w) cl.x = -half;
  }
}

/** Draws sky, stars, sun, moon and clouds, then the land in front of them. */
export function drawSky(
  c: CanvasRenderingContext2D,
  sky: Sky,
  b: Backdrop,
  w: number,
  h: number,
  night: number,
  time: number,
  still: boolean,
) {
  if (night < 1) c.drawImage(b.skyDay, 0, 0, w, h);
  if (night > 0) {
    c.globalAlpha = night;
    c.drawImage(b.skyNight, 0, 0, w, h);
    c.fillStyle = '#ffffff';
    for (const s of b.stars) {
      const tw = still ? 0.7 : 0.45 + 0.55 * Math.sin(time * s.speed + s.phase);
      c.globalAlpha = night * Math.max(0, tw);
      c.beginPath();
      c.arc(s.x, s.y, s.r, 0, TAU);
      c.fill();
    }
  }

  // Midway through, the low sky warms to a sunset glow.
  const dusk = Math.sin(Math.PI * night);
  if (dusk > 0.01) {
    const glow = c.createLinearGradient(0, b.horizon, 0, b.horizon * 0.15);
    glow.addColorStop(0, `rgba(255,150,84,${0.62 * dusk})`);
    glow.addColorStop(0.45, `rgba(240,120,130,${0.3 * dusk})`);
    glow.addColorStop(1, 'rgba(240,120,130,0)');
    c.globalAlpha = 1;
    c.fillStyle = glow;
    c.fillRect(0, 0, w, b.horizon + 12);
  }

  // The sun sinks behind the mountains as the moon climbs out from them.
  const travel = h * 0.5;
  if (night < 1) {
    c.globalAlpha = 1 - night;
    const s = sky.sun;
    c.drawImage(s.canvas, b.sun.x - s.ax, b.sun.y + night * travel - s.ay, s.w, s.h);
  }
  if (night > 0) {
    c.globalAlpha = night;
    const m = sky.moon;
    c.drawImage(m.canvas, b.moon.x - m.ax, b.moon.y + (1 - night) * travel - m.ay, m.w, m.h);
  }

  for (const cl of sky.clouds) {
    const cw = CLOUD_W * cl.scale;
    const ch = CLOUD_H * cl.scale;
    if (night < 1) {
      c.globalAlpha = 1 - night;
      c.drawImage(sky.day[cl.shape].canvas, cl.x - cw / 2, cl.y - ch / 2, cw, ch);
    }
    if (night > 0) {
      c.globalAlpha = night * 0.9;
      c.drawImage(sky.night[cl.shape].canvas, cl.x - cw / 2, cl.y - ch / 2, cw, ch);
    }
  }

  c.globalAlpha = 1;
  if (night < 1) c.drawImage(b.landDay, 0, 0, w, h);
  if (night > 0) {
    c.globalAlpha = night;
    c.drawImage(b.landNight, 0, 0, w, h);
    c.globalAlpha = 1;
  }
}
