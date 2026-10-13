import type { HeadArt, PetalSlot, Sprite, Variety } from '../core/types';
import { range, TAU, type Rng } from '../core/math';
import { jitterHex, PALETTE, tone } from '../core/color';
import { makeSprite } from '../canvas/sprites';

type PetalKind = 'round' | 'notch' | 'slim' | 'fringe' | 'cup';

/** Traces a petal outline from its base at the origin to its tip at (L, 0). */
function tracePetal(c: CanvasRenderingContext2D, kind: PetalKind, L: number, W: number, k: number) {
  c.beginPath();
  c.moveTo(0, 0);
  switch (kind) {
    case 'round':
      c.bezierCurveTo(L * 0.1, -W * 0.9, L * 0.68, -W * 1.18, L * 0.97, -W * (0.4 + k));
      c.quadraticCurveTo(L * 1.07, W * k, L * 0.96, W * (0.42 - k));
      c.bezierCurveTo(L * 0.68, W * 1.18, L * 0.1, W * 0.9, 0, 0);
      break;
    case 'notch':
      c.bezierCurveTo(L * 0.18, -W * 0.75, L * 0.62, -W * 1.06, L * 0.88, -W * 0.72);
      c.lineTo(L * 0.975, -W * 0.44);
      c.lineTo(L * 0.925, -W * 0.2);
      c.lineTo(L * 1.0, W * k);
      c.lineTo(L * 0.925, W * 0.22);
      c.lineTo(L * 0.965, W * 0.46);
      c.lineTo(L * 0.88, W * 0.72);
      c.bezierCurveTo(L * 0.62, W * 1.06, L * 0.18, W * 0.75, 0, 0);
      break;
    case 'slim':
      c.bezierCurveTo(L * 0.3, -W * 1.15, L * 0.8, -W * 0.95, L, W * k);
      c.bezierCurveTo(L * 0.8, W * 0.95, L * 0.3, W * 1.15, 0, 0);
      break;
    case 'fringe':
      c.bezierCurveTo(L * 0.35, -W * 0.14, L * 0.55, -W * 0.5, L * 0.78, -W);
      c.lineTo(L * 0.84, -W * 0.55);
      c.lineTo(L * 0.98, -W * 0.52);
      c.lineTo(L * 0.9, -W * 0.12);
      c.lineTo(L * 1.03, W * k);
      c.lineTo(L * 0.9, W * 0.16);
      c.lineTo(L * 0.97, W * 0.56);
      c.lineTo(L * 0.84, W * 0.5);
      c.lineTo(L * 0.78, W);
      c.bezierCurveTo(L * 0.55, W * 0.5, L * 0.35, W * 0.14, 0, 0);
      break;
    case 'cup':
      c.bezierCurveTo(L * 0.04, -W * 1.25, L * 0.72, -W * 1.05, L, W * k * 0.5);
      c.bezierCurveTo(L * 0.72, W * 1.05, L * 0.04, W * 1.25, 0, 0);
      break;
  }
  c.closePath();
}

interface PetalLook {
  veins?: number;
  /** Positive darkens the whole petal (back layers), negative lightens it. */
  dark?: number;
  blotch?: string;
}

/** Bakes one shaded petal: gradient along its length, a crease, veins and a soft edge. */
function petalSprite(kind: PetalKind, L: number, W: number, color: string, rng: Rng, look: PetalLook = {}): Sprite {
  const pad = 3;
  const w = L * 1.1 + pad * 2;
  const h = W * 2.6 + pad * 2;
  const k = range(rng, -0.12, 0.12);
  const d = look.dark ?? 0;
  const veins = look.veins ?? 4;
  return makeSprite(w, h, pad, h / 2, (c) => {
    c.translate(pad, h / 2);
    tracePetal(c, kind, L, W, k);
    const g = c.createLinearGradient(0, 0, L, 0);
    g.addColorStop(0, tone(color, -0.32 - d));
    g.addColorStop(0.45, tone(color, -d));
    g.addColorStop(1, tone(color, 0.18 - d));
    c.fillStyle = g;
    c.fill();

    c.save();
    c.clip();
    const s = c.createLinearGradient(0, -W, 0, W);
    s.addColorStop(0, 'rgba(255,250,235,0.20)');
    s.addColorStop(0.5, 'rgba(255,250,235,0)');
    s.addColorStop(0.52, 'rgba(40,20,10,0.06)');
    s.addColorStop(1, 'rgba(40,20,10,0.18)');
    c.fillStyle = s;
    c.fillRect(-pad, -h, w, h * 2);
    if (look.blotch) {
      const b = c.createRadialGradient(0, 0, 0, 0, 0, L * 0.34);
      b.addColorStop(0, look.blotch);
      b.addColorStop(0.4, look.blotch);
      b.addColorStop(1, 'rgba(30,10,25,0)');
      c.globalAlpha = 0.8;
      c.fillStyle = b;
      c.fillRect(-pad, -h, w, h * 2);
      c.globalAlpha = 1;
    }
    c.strokeStyle = tone(color, -0.5, 0.26);
    c.lineWidth = 0.5;
    for (let i = 0; i < veins; i++) {
      const t = veins > 1 ? (i / (veins - 1) - 0.5) * 2 : 0;
      c.beginPath();
      c.moveTo(L * 0.05, 0);
      c.quadraticCurveTo(L * 0.45, t * W * 0.8, L * range(rng, 0.8, 0.92), t * W * 0.62);
      c.stroke();
    }
    c.restore();

    tracePetal(c, kind, L, W, k);
    c.strokeStyle = tone(color, -0.42 - d, 0.4);
    c.lineWidth = 0.6;
    c.stroke();
  });
}

function slot(
  rng: Rng,
  a: number,
  r0: number,
  sprite: number,
  layer: number,
  sx = 1,
  sy = 1,
  bx = 0,
  by = 0,
): PetalSlot {
  return { a, r0, bx, by, sprite, sx, sy, layer, scale: 1, lag: range(rng, 0.5, 1.5) };
}

/** A square sprite anchored at its centre; `draw` runs with the origin at that centre. */
function disc(extent: number, draw: (c: CanvasRenderingContext2D) => void): Sprite {
  const s = extent * 2 + 6;
  return makeSprite(s, s, s / 2, s / 2, (c) => {
    c.translate(s / 2, s / 2);
    draw(c);
  });
}

function ball(c: CanvasRenderingContext2D, r: number, light: string, dark: string) {
  const g = c.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.08, 0, 0, r);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, r, 0, TAU);
  c.fill();
}

/** Sunflower-seed dot packing. */
function phyllo(c: CanvasRenderingContext2D, r: number, count: number, size: number, color: string) {
  c.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const rr = r * Math.sqrt((i + 0.5) / count);
    const th = i * 2.39996;
    c.beginPath();
    c.arc(Math.cos(th) * rr, Math.sin(th) * rr, size * (0.55 + (0.45 * rr) / r), 0, TAU);
    c.fill();
  }
}

function floret(c: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, color: string) {
  c.strokeStyle = color;
  c.lineWidth = Math.max(0.9, r * 0.42);
  c.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const a = rot + (i * Math.PI) / 3;
    c.beginPath();
    c.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r);
    c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    c.stroke();
  }
}

const noLeaves = { count: [0, 0] as [number, number], size: [0, 0] as [number, number], width: 0.2, from: 0, to: 1 };

/** Wiry, open-faced, eight notched petals. Light and whippy. */
const cosmos: Variety = {
  key: 'cosmos',
  palette: [PALETTE.butter, PALETTE.butter, PALETTE.butter, PALETTE.coral],
  radius: [30, 42],
  height: [0.42, 0.7],
  mass: 1.5,
  stiff: 2.3,
  sail: 1.25,
  align: 0,
  angDamp: 0.7,
  stemW: 1.7,
  seg: 30,
  curl: 0.55,
  leaves: { count: [1, 3], size: [14, 24], width: 0.13, from: 0.25, to: 0.75 },
  buds: 0.75,
  build(rng, R, color): HeadArt {
    const sprites = [
      petalSprite('notch', R, R * 0.33, color, rng, { veins: 5 }),
      petalSprite('notch', R * 0.95, R * 0.36, jitterHex(color, rng, 0.04), rng, { veins: 5, dark: 0.05 }),
    ];
    const slots: PetalSlot[] = [];
    const n = 8;
    const off = rng() * TAU;
    for (let i = 0; i < n; i++) {
      slots.push(
        slot(rng, off + (i / n) * TAU + range(rng, -0.08, 0.08), R * 0.07, i % 2, i % 2, range(rng, 0.88, 1.06), range(rng, 0.9, 1.1)),
      );
    }
    slots.sort((a, b) => b.layer - a.layer);
    const r = R * 0.2;
    const centre = disc(r * 1.2, (c) => {
      ball(c, r, '#E08A1E', '#7C3C10');
      phyllo(c, r * 0.86, 22, r * 0.13, 'rgba(70,30,8,0.55)');
      c.fillStyle = '#FBDD6E';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + rng();
        const rr = r * range(rng, 0.78, 1.08);
        c.beginPath();
        c.arc(Math.cos(a) * rr, Math.sin(a) * rr, r * 0.13, 0, TAU);
        c.fill();
      }
    });
    return { slots, sprites, centre, loose: null, pollen: '#F2B01E' };
  },
};

/** Big, heavy, crumpled-paper petals with a dark eye. Nods and flops. */
const poppy: Variety = {
  key: 'poppy',
  palette: [PALETTE.coral, PALETTE.coral, PALETTE.red],
  radius: [32, 44],
  height: [0.34, 0.58],
  mass: 2.6,
  stiff: 1.9,
  sail: 1.5,
  align: 0,
  angDamp: 1.1,
  stemW: 2.1,
  seg: 28,
  curl: 0.7,
  leaves: { count: [1, 2], size: [20, 30], width: 0.3, from: 0.1, to: 0.45 },
  buds: 0.35,
  build(rng, R, color): HeadArt {
    const blotch = 'rgba(38,14,32,0.85)';
    const sprites = [
      petalSprite('round', R, R * 0.62, color, rng, { veins: 7, dark: 0.12, blotch }),
      petalSprite('round', R * 0.86, R * 0.56, color, rng, { veins: 6, blotch }),
    ];
    const slots: PetalSlot[] = [];
    const off = rng() * TAU;
    const back = 3;
    const front = rng() < 0.5 ? 2 : 3;
    for (let i = 0; i < back; i++) {
      slots.push(slot(rng, off + (i / back) * TAU + range(rng, -0.14, 0.14), 0, 0, 0, range(rng, 0.92, 1.05), range(rng, 0.9, 1.08)));
    }
    for (let i = 0; i < front; i++) {
      slots.push(
        slot(rng, off + Math.PI / back + (i / front) * TAU + range(rng, -0.16, 0.16), 0, 1, 1, range(rng, 0.9, 1.05), range(rng, 0.9, 1.1)),
      );
    }
    const r = R * 0.17;
    const centre = disc(r * 2, (c) => {
      c.lineCap = 'round';
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * TAU + range(rng, -0.1, 0.1);
        const rr = r * range(rng, 1.35, 1.9);
        c.strokeStyle = 'rgba(40,18,36,0.7)';
        c.lineWidth = 0.6;
        c.beginPath();
        c.moveTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8);
        c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        c.stroke();
        c.fillStyle = i % 3 === 0 ? '#F6C431' : '#2A1626';
        c.beginPath();
        c.arc(Math.cos(a) * rr, Math.sin(a) * rr, 1.1, 0, TAU);
        c.fill();
      }
      ball(c, r, '#6E8A4A', '#1F3020');
      c.strokeStyle = 'rgba(214,226,170,0.55)';
      c.lineWidth = 0.7;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU;
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82);
        c.stroke();
      }
    });
    return { slots, sprites, centre, loose: null, pollen: '#3A1C30' };
  },
};

/** Ragged cobalt trumpets on an upright, springy stem. */
const cornflower: Variety = {
  key: 'cornflower',
  palette: [PALETTE.cobalt],
  radius: [22, 30],
  height: [0.3, 0.52],
  mass: 1.3,
  stiff: 3.3,
  sail: 0.9,
  align: 0,
  angDamp: 0.6,
  stemW: 1.8,
  seg: 26,
  curl: 0.3,
  leaves: { count: [2, 4], size: [16, 26], width: 0.11, from: 0.15, to: 0.8 },
  buds: 0.5,
  build(rng, R, color): HeadArt {
    const sprites = [
      petalSprite('fringe', R, R * 0.3, color, rng, { veins: 3, dark: 0.08 }),
      petalSprite('fringe', R * 0.62, R * 0.24, color, rng, { veins: 3, dark: -0.14 }),
    ];
    const slots: PetalSlot[] = [];
    const outer = 9 + Math.floor(rng() * 3);
    const off = rng() * TAU;
    for (let i = 0; i < outer; i++) {
      slots.push(slot(rng, off + (i / outer) * TAU + range(rng, -0.1, 0.1), R * 0.1, 0, 0, range(rng, 0.82, 1.06), range(rng, 0.85, 1.15)));
    }
    for (let i = 0; i < 7; i++) {
      slots.push(slot(rng, off + 0.3 + (i / 7) * TAU + range(rng, -0.12, 0.12), R * 0.06, 1, 1, range(rng, 0.85, 1.05), 1));
    }
    const r = R * 0.24;
    const centre = disc(r * 1.3, (c) => {
      c.lineCap = 'round';
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * TAU + range(rng, -0.15, 0.15);
        const rr = r * range(rng, 0.6, 1.15);
        c.strokeStyle = i % 2 ? '#3A2A86' : '#5B3FA6';
        c.lineWidth = 1.3;
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        c.stroke();
        c.fillStyle = '#D9CCF3';
        c.beginPath();
        c.arc(Math.cos(a) * rr, Math.sin(a) * rr, 0.9, 0, TAU);
        c.fill();
      }
      ball(c, r * 0.35, '#4B348F', '#22154F');
    });
    return { slots, sprites, centre, loose: null, pollen: '#8E7BD6' };
  },
};

/** A fine lavender daisy with a butter dome; many slim rays. */
const aster: Variety = {
  key: 'aster',
  palette: [PALETTE.lavender, PALETTE.lavender, '#C9B8EE'],
  radius: [22, 32],
  height: [0.24, 0.46],
  mass: 1.1,
  stiff: 2.7,
  sail: 1.0,
  align: 0,
  angDamp: 0.5,
  stemW: 1.5,
  seg: 24,
  curl: 0.45,
  leaves: { count: [2, 4], size: [12, 20], width: 0.2, from: 0.2, to: 0.85 },
  buds: 0.6,
  build(rng, R, color): HeadArt {
    const sprites = [
      petalSprite('slim', R, R * 0.12, color, rng, { veins: 1, dark: 0.1 }),
      petalSprite('slim', R * 0.88, R * 0.11, color, rng, { veins: 1, dark: -0.12 }),
    ];
    const slots: PetalSlot[] = [];
    const n = 15 + Math.floor(rng() * 5);
    const off = rng() * TAU;
    for (let layer = 0; layer < 2; layer++) {
      for (let i = 0; i < n; i++) {
        slots.push(
          slot(rng, off + ((i + layer * 0.5) / n) * TAU + range(rng, -0.05, 0.05), R * 0.14, layer, layer, range(rng, 0.85, 1.05), range(rng, 0.9, 1.15)),
        );
      }
    }
    const r = R * 0.26;
    const centre = disc(r, (c) => {
      ball(c, r, '#FBD75A', '#C4820F');
      phyllo(c, r * 0.9, 34, r * 0.1, 'rgba(140,80,6,0.6)');
      c.fillStyle = 'rgba(255,246,200,0.5)';
      c.beginPath();
      c.arc(-r * 0.3, -r * 0.32, r * 0.22, 0, TAU);
      c.fill();
    });
    return { slots, sprites, centre, loose: null, pollen: '#F6C431' };
  },
};

/** A side-on cup of overlapping petals on a thick stem; stays in line with it. */
const tulip: Variety = {
  key: 'tulip',
  palette: [PALETTE.red, PALETTE.coral, PALETTE.butter],
  radius: [20, 26],
  height: [0.2, 0.36],
  mass: 2.8,
  stiff: 3.6,
  sail: 0.7,
  align: 46,
  angDamp: 6,
  stemW: 2.9,
  seg: 28,
  curl: 0.22,
  leaves: { count: [2, 2], size: [44, 64], width: 0.16, from: 0.06, to: 0.2 },
  buds: 0,
  build(rng, R, color): HeadArt {
    const L = R * 1.8;
    const W = R * 0.5;
    const sprites = [
      petalSprite('cup', L, W, color, rng, { veins: 4, dark: 0.2 }),
      petalSprite('cup', L * 0.97, W, color, rng, { veins: 5, dark: 0.04 }),
      petalSprite('cup', L * 0.92, W * 1.05, color, rng, { veins: 5, dark: -0.1 }),
    ];
    const up = -Math.PI / 2;
    const by = R * 0.85;
    const j = () => range(rng, -0.04, 0.04);
    const slots: PetalSlot[] = [
      slot(rng, up - 0.4 + j(), 0, 0, 0, 1, 1, 0, by),
      slot(rng, up + 0.4 + j(), 0, 0, 0, 1, 1, 0, by),
      slot(rng, up - 0.2 + j(), 0, 1, 1, 1, 1, 0, by),
      slot(rng, up + 0.2 + j(), 0, 1, 1, 1, 1, 0, by),
      slot(rng, up + j(), 0, 2, 2, 1, 1, 0, by),
    ];
    return { slots, sprites, centre: null, loose: null, pollen: '#F6C431' };
  },
};

/** A firework globe of tiny florets on a tall rigid stalk. Bouncy, barely catches wind. */
const allium: Variety = {
  key: 'allium',
  palette: [PALETTE.lavender, PALETTE.cobalt],
  radius: [26, 36],
  height: [0.5, 0.76],
  mass: 1.7,
  stiff: 4.2,
  sail: 0.75,
  align: 0,
  angDamp: 0.35,
  stemW: 2.4,
  seg: 34,
  curl: 0.16,
  leaves: noLeaves,
  buds: 0,
  build(rng, R, color): HeadArt {
    const count = Math.round(R * 2.6);
    const centre = disc(R, (c) => {
      const pts: [number, number, number][] = [];
      for (let i = 0; i < count; i++) {
        const rr = R * 0.95 * Math.sqrt((i + 0.5) / count);
        const th = i * 2.39996 + range(rng, -0.1, 0.1);
        pts.push([Math.cos(th) * rr, Math.sin(th) * rr, rr / R]);
      }
      c.strokeStyle = tone(PALETTE.forest, 0.25, 0.4);
      c.lineWidth = 0.5;
      for (const [x, y] of pts) {
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(x, y);
        c.stroke();
      }
      pts.sort((a, b) => b[2] - a[2]);
      for (const [x, y, t] of pts) {
        floret(c, x, y, range(rng, 2.2, 3.4), rng() * Math.PI, tone(color, 0.28 - t * 0.5 + range(rng, -0.08, 0.08)));
        c.fillStyle = tone(color, 0.6);
        c.beginPath();
        c.arc(x, y, 0.7, 0, TAU);
        c.fill();
      }
    });
    const loose = makeSprite(10, 10, 5, 5, (c) => {
      floret(c, 5, 5, 3.4, 0.3, tone(color, 0.1));
    });
    return { slots: [], sprites: [], centre, loose, pollen: tone(color, 0.3) };
  },
};

/** Billy button: a small butter bobble on a hair-thin, very loose stem. */
const billy: Variety = {
  key: 'billy',
  palette: [PALETTE.butter],
  radius: [8, 12],
  height: [0.18, 0.42],
  mass: 0.55,
  stiff: 1.6,
  sail: 0.6,
  align: 0,
  angDamp: 0.5,
  stemW: 1.15,
  seg: 24,
  curl: 0.8,
  leaves: { count: [0, 1], size: [10, 16], width: 0.1, from: 0.1, to: 0.4 },
  buds: 0,
  build(rng, R, color): HeadArt {
    const centre = disc(R, (c) => {
      ball(c, R, tone(color, 0.3), tone(color, -0.3));
      phyllo(c, R * 0.92, Math.round(R * 4), R * 0.1, tone(color, -0.42, 0.55));
      phyllo(c, R * 0.7, Math.round(R * 1.5), R * 0.07, 'rgba(255,248,210,0.5)');
    });
    const loose = makeSprite(6, 6, 3, 3, (c) => {
      c.fillStyle = tone(color, -0.05);
      c.beginPath();
      c.arc(3, 3, 2.2, 0, TAU);
      c.fill();
    });
    void rng;
    return { slots: [], sprites: [], centre, loose, pollen: color };
  },
};

/** A closed bud for side shoots; drawn tip-up and held in line with its stalk. */
const bud: Variety = {
  key: 'bud',
  palette: [PALETTE.butter, PALETTE.coral, PALETTE.lavender, PALETTE.cobalt, PALETTE.red],
  radius: [6, 8.5],
  height: [0.1, 0.2],
  mass: 0.28,
  stiff: 3,
  sail: 0.5,
  align: 60,
  angDamp: 7,
  stemW: 1.1,
  seg: 16,
  curl: 0.3,
  leaves: noLeaves,
  buds: 0,
  build(rng, R, color): HeadArt {
    const centre = disc(R * 1.7, (c) => {
      const g = c.createLinearGradient(-R, 0, R, 0);
      g.addColorStop(0, tone(color, 0.12));
      g.addColorStop(1, tone(color, -0.28));
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(0, R * 0.9);
      c.bezierCurveTo(-R * 1.05, R * 0.7, -R * 0.75, -R * 0.8, 0, -R * 1.55);
      c.bezierCurveTo(R * 0.75, -R * 0.8, R * 1.05, R * 0.7, 0, R * 0.9);
      c.fill();
      c.strokeStyle = tone(color, -0.45, 0.4);
      c.lineWidth = 0.5;
      c.beginPath();
      c.moveTo(-R * 0.1, R * 0.5);
      c.quadraticCurveTo(R * 0.25, -R * 0.4, 0, -R * 1.45);
      c.stroke();
      c.fillStyle = tone(PALETTE.forest, 0.12);
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(0, R);
        c.quadraticCurveTo(s * R * 1.1, R * 0.7, s * R * 0.62, -R * 0.3);
        c.quadraticCurveTo(s * R * 0.3, R * 0.5, 0, R);
        c.fill();
      }
    });
    void rng;
    return { slots: [], sprites: [], centre, loose: null, pollen: color };
  },
};

export const VARIETIES: Variety[] = [cosmos, poppy, cornflower, aster, tulip, allium, billy];
export const BUD = bud;
