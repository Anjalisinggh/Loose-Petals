import { mulberry32, range, TAU, type Rng } from '../core/math';

export interface Star {
  x: number;
  y: number;
  r: number;
  phase: number;
  speed: number;
}

/**
 * The landscape, baked once per size for both times of day. Sky and land are separate
 * layers so the sun and moon can travel between them.
 */
export interface Backdrop {
  skyDay: HTMLCanvasElement;
  skyNight: HTMLCanvasElement;
  landDay: HTMLCanvasElement;
  landNight: HTMLCanvasElement;
  horizon: number;
  sun: { x: number; y: number; r: number };
  moon: { x: number; y: number; r: number };
  /** The handful of stars that twinkle; the rest are baked into the night sky. */
  stars: Star[];
}

function layer(w: number, h: number, dpr: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const c = canvas.getContext('2d')!;
  c.scale(dpr, dpr);
  return [canvas, c];
}

function grain(canvas: HTMLCanvasElement, rng: Rng, strength: number) {
  const tile = document.createElement('canvas');
  tile.width = tile.height = 192;
  const tc = tile.getContext('2d')!;
  const img = tc.createImageData(192, 192);
  for (let i = 0; i < img.data.length; i += 4) {
    const dark = rng() < 0.55;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = dark ? 10 : 255;
    img.data[i + 3] = Math.pow(rng(), 2) * strength * (dark ? 1 : 0.8);
  }
  tc.putImageData(img, 0, 0);
  const c = canvas.getContext('2d')!;
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = c.createPattern(tile, 'repeat')!;
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.restore();
}

/** A wandering ridge line built from a few sine waves. */
function ridge(rng: Rng, w: number, base: number, amp: number) {
  const waves = [0, 1, 2, 3].map((i) => ({
    f: (range(rng, 0.8, 1.6) * (i + 1) * TAU) / w,
    p: rng() * TAU,
    a: amp / (i * 1.6 + 1),
  }));
  return (x: number) => {
    let y = base;
    for (const k of waves) y -= (Math.sin(x * k.f + k.p) * 0.5 + 0.5) * k.a;
    return y;
  };
}

function fillRidge(c: CanvasRenderingContext2D, w: number, bottom: number, f: (x: number) => number, fill: string | CanvasGradient) {
  c.fillStyle = fill;
  c.beginPath();
  c.moveTo(-2, bottom);
  for (let x = -2; x <= w + 2; x += 4) c.lineTo(x, f(x));
  c.lineTo(w + 2, bottom);
  c.closePath();
  c.fill();
}

function conifer(c: CanvasRenderingContext2D, rng: Rng, x: number, base: number, height: number, width: number) {
  const tiers = Math.max(4, Math.round(height / 9));
  c.beginPath();
  c.moveTo(x, base - height);
  for (let t = 1; t <= tiers; t++) {
    const yy = base - height + (t / tiers) * height;
    const half = width * 0.5 * Math.pow(t / tiers, 0.85) * range(rng, 0.8, 1.15);
    c.lineTo(x + half, yy);
    c.lineTo(x + half * 0.5, yy - (height / tiers) * 0.25);
  }
  c.lineTo(x, base);
  for (let t = tiers; t >= 1; t--) {
    const yy = base - height + (t / tiers) * height;
    const half = width * 0.5 * Math.pow(t / tiers, 0.85) * range(rng, 0.8, 1.15);
    c.lineTo(x - half * 0.5, yy - (height / tiers) * 0.25);
    c.lineTo(x - half, yy);
  }
  c.closePath();
  c.fill();
}

interface LandLook {
  far: string;
  near: string;
  haze: string;
  trees: string;
  pines: string;
  lake: [string, string];
  field: [string, string, string];
  strokes: string[];
}

const DAY: LandLook = {
  far: '#7a9fc9',
  near: '#4f79a6',
  haze: 'rgba(226,240,250,0.55)',
  trees: '#1f5a2c',
  pines: '#174a25',
  lake: ['#bfe3f5', '#7fbfe6'],
  field: ['#8ad05c', '#49ab3a', '#2c8c2c'],
  strokes: ['rgba(20,92,24,0.28)', 'rgba(170,232,110,0.3)', 'rgba(36,120,34,0.3)'],
};

const NIGHT: LandLook = {
  far: '#0c1a4d',
  near: '#08123a',
  haze: 'rgba(40,70,160,0.25)',
  trees: '#04101f',
  pines: '#020a14',
  lake: ['#1a3fa8', '#0c2470'],
  field: ['#1f6a66', '#11504b', '#0a3a35'],
  strokes: ['rgba(4,36,36,0.35)', 'rgba(70,170,160,0.26)', 'rgba(10,70,66,0.3)'],
};

function bakeLand(w: number, h: number, dpr: number, horizon: number, night: boolean, moonX: number): HTMLCanvasElement {
  const [canvas, c] = layer(w, h, dpr);
  const look = night ? NIGHT : DAY;
  // The same seed for both bakes keeps every ridge and tree in the same place.
  const rng = mulberry32(4401);
  const k = h / 800;

  // Three ranges receding into haze, each lit on one flank and furrowed with gullies.
  const ranges: [number, number, string, string][] = night
    ? [[44, 190, '#16286a', '#101e56'], [30, 150, '#0e1c52', '#0a1644'], [12, 95, '#0a1440', '#070f33']]
    : [[44, 190, '#b4cbe6', '#a3bedd'], [30, 150, '#8fb0d6', '#7499c4'], [12, 95, '#5f8ab8', '#44719e']];
  for (const [lift, amp, top, bottom] of ranges) {
    const f = ridge(rng, w, horizon - lift * k, amp * k);
    const body = c.createLinearGradient(0, horizon - (lift + amp) * k, 0, horizon + 4);
    body.addColorStop(0, top);
    body.addColorStop(1, bottom);
    fillRidge(c, w, horizon + 4, f, body);
    c.save();
    c.beginPath();
    c.moveTo(-2, horizon + 4);
    for (let x = -2; x <= w + 2; x += 4) c.lineTo(x, f(x));
    c.lineTo(w + 2, horizon + 4);
    c.closePath();
    c.clip();
    c.lineCap = 'round';
    for (let x = -40; x < w + 40; x += range(rng, 7, 20) * k) {
      const y0 = f(x) + range(rng, 0, 8) * k;
      const run = range(rng, 18, 60) * k;
      const lit = rng() < 0.5;
      c.strokeStyle = lit ? (night ? 'rgba(120,150,255,0.04)' : 'rgba(255,255,255,0.07)') : night ? 'rgba(0,0,20,0.12)' : 'rgba(20,50,100,0.06)';
      c.lineWidth = range(rng, 3, 10) * k;
      c.beginPath();
      c.moveTo(x, y0);
      c.quadraticCurveTo(x + (lit ? -1 : 1) * run * 0.2, y0 + run * 0.5, x + (lit ? -1 : 1) * run * 0.45, y0 + run);
      c.stroke();
    }
    c.restore();
  }
  const haze = c.createLinearGradient(0, horizon - 60 * k, 0, horizon + 4);
  haze.addColorStop(0, 'rgba(255,255,255,0)');
  haze.addColorStop(1, look.haze);
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = haze;
  c.fillRect(0, horizon - 60 * k, w, 64 * k + 4);
  c.globalCompositeOperation = 'source-over';

  c.fillStyle = look.trees;
  c.fillRect(0, horizon - 2, w, 14 * k + 6);
  for (let x = -10; x < w + 10; x += range(rng, 5, 13) * k) {
    if (rng() < 0.22) {
      c.beginPath();
      c.arc(x, horizon - range(rng, 4, 12) * k, range(rng, 7, 13) * k, 0, TAU);
      c.fill();
    } else {
      conifer(c, rng, x, horizon + 4, range(rng, 14, 48) * k, range(rng, 9, 17) * k);
    }
  }

  // A strip of water beyond the meadow; at night it carries the moon's reflection.
  const lx = w * 0.5;
  const lw = w * 0.27;
  const ly = horizon + 9 * k;
  const lh = 15 * k;
  const water = c.createLinearGradient(0, ly, 0, ly + lh);
  water.addColorStop(0, look.lake[0]);
  water.addColorStop(1, look.lake[1]);
  c.fillStyle = water;
  c.beginPath();
  c.ellipse(lx + lw / 2, ly + lh / 2, lw / 2, lh / 2, 0, 0, TAU);
  c.fill();
  if (night) {
    const glow = c.createRadialGradient(moonX, ly + lh / 2, 0, moonX, ly + lh / 2, lw * 0.3);
    glow.addColorStop(0, 'rgba(240,246,255,0.95)');
    glow.addColorStop(1, 'rgba(240,246,255,0)');
    c.save();
    c.beginPath();
    c.ellipse(lx + lw / 2, ly + lh / 2, lw / 2, lh / 2, 0, 0, TAU);
    c.clip();
    c.fillStyle = glow;
    c.fillRect(lx, ly, lw, lh);
    c.restore();
  }
  c.fillStyle = look.trees;
  for (let i = 0; i < 16; i++) {
    const x = lx + lw * (i < 8 ? range(rng, -0.04, 0.2) : range(rng, 0.8, 1.04));
    conifer(c, rng, x, ly + lh * range(rng, 0.7, 1.1), range(rng, 14, 30) * k, range(rng, 8, 13) * k);
  }

  const top = horizon + 14 * k;
  const field = c.createLinearGradient(0, top, 0, h);
  field.addColorStop(0, look.field[0]);
  field.addColorStop(0.35, look.field[1]);
  field.addColorStop(1, look.field[2]);
  c.fillStyle = field;
  c.beginPath();
  c.moveTo(0, h);
  c.lineTo(0, top + 6 * k);
  c.quadraticCurveTo(w * 0.3, top - 6 * k, w * 0.6, top + 2 * k);
  c.quadraticCurveTo(w * 0.85, top + 8 * k, w, top);
  c.lineTo(w, h);
  c.closePath();
  c.fill();

  // Texture: thousands of small grass strokes that grow with nearness.
  c.lineCap = 'round';
  const strokes = Math.round((w * h) / 300);
  for (let i = 0; i < strokes; i++) {
    const s = Math.pow(rng(), 0.8);
    const y = top + 8 * k + s * (h - top);
    const x = rng() * w;
    const len = (2 + 13 * s) * range(rng, 0.6, 1.3);
    c.strokeStyle = look.strokes[i % look.strokes.length];
    c.lineWidth = 0.5 + 1.3 * s;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + range(rng, -0.3, 0.3) * len, y - len);
    c.stroke();
  }

  // Wildflowers: a scatter of daisies by day, a glowing drift of white at night.
  const blooms = Math.round((w * h) / (night ? 700 : 5200));
  for (let i = 0; i < blooms; i++) {
    const s = Math.pow(rng(), 0.9);
    const y = top + 10 * k + s * (h - top - 10 * k);
    const x = rng() * w;
    const r = (0.5 + 2.4 * s) * range(rng, 0.6, 1.2);
    if (night) {
      c.fillStyle = 'rgba(190,240,255,0.16)';
      c.beginPath();
      c.arc(x, y, r * 2.6, 0, TAU);
      c.fill();
      c.fillStyle = rng() < 0.75 ? 'rgba(244,252,255,0.95)' : 'rgba(150,235,225,0.9)';
    } else {
      c.fillStyle = rng() < 0.6 ? 'rgba(255,255,255,0.9)' : 'rgba(255,224,90,0.9)';
    }
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.fill();
  }

  // Tall pines frame the view from the near edges.
  c.fillStyle = look.pines;
  const base = horizon + 70 * k;
  conifer(c, rng, w * 0.015, base + 30 * k, h * 0.36, 90 * k);
  conifer(c, rng, w * 0.07, base, h * 0.24, 62 * k);
  conifer(c, rng, w * 0.985, base + 20 * k, h * 0.3, 80 * k);

  grain(canvas, rng, night ? 26 : 20);
  return canvas;
}

function bakeSky(w: number, h: number, dpr: number, horizon: number, night: boolean): HTMLCanvasElement {
  const [canvas, c] = layer(w, h, dpr);
  const rng = mulberry32(night ? 918 : 917);
  const g = c.createLinearGradient(0, 0, 0, horizon + 10);
  if (night) {
    g.addColorStop(0, '#04071f');
    g.addColorStop(0.55, '#0a1a5e');
    g.addColorStop(1, '#17348a');
  } else {
    g.addColorStop(0, '#3f8fe0');
    g.addColorStop(0.6, '#8fc6f3');
    g.addColorStop(1, '#dff0f8');
  }
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);

  if (night) {
    const count = Math.round((w * horizon) / 2600);
    for (let i = 0; i < count; i++) {
      const y = Math.pow(rng(), 1.3) * horizon;
      c.fillStyle = `rgba(${rng() < 0.3 ? '190,210,255' : '255,255,255'},${range(rng, 0.35, 0.95)})`;
      c.beginPath();
      c.arc(rng() * w, y, range(rng, 0.3, 1.2), 0, TAU);
      c.fill();
    }
  } else {
    // A bank of cloud resting on the mountains.
    for (let i = 0; i < 26; i++) {
      const x = rng() * w;
      const y = horizon - range(rng, 30, 150) * (h / 800);
      const r = range(rng, 50, 150) * (h / 800);
      const puff = c.createRadialGradient(x, y, 0, x, y, r);
      puff.addColorStop(0, 'rgba(255,255,255,0.75)');
      puff.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = puff;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  grain(canvas, rng, 8);
  return canvas;
}

export function bakeBackdrop(w: number, h: number, dpr: number): Backdrop {
  const horizon = Math.round(h * 0.47);
  const unit = Math.min(w, h);
  const sun = { x: w * 0.22, y: h * 0.17, r: unit * 0.05 };
  const moon = { x: w * 0.69, y: h * 0.2, r: unit * 0.062 };
  const rng = mulberry32(5150);
  const stars: Star[] = [];
  for (let i = 0; i < 46; i++) {
    stars.push({
      x: rng() * w,
      y: Math.pow(rng(), 1.2) * horizon * 0.92,
      r: range(rng, 0.8, 1.9),
      phase: rng() * TAU,
      speed: range(rng, 0.8, 2.6),
    });
  }
  return {
    skyDay: bakeSky(w, h, dpr, horizon, false),
    skyNight: bakeSky(w, h, dpr, horizon, true),
    landDay: bakeLand(w, h, dpr, horizon, false, moon.x),
    landNight: bakeLand(w, h, dpr, horizon, true, moon.x),
    horizon,
    sun,
    moon,
    stars,
  };
}
