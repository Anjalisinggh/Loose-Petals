import type { Plant, Vec } from '../core/types';
import type { Rng } from '../core/math';

export const LETTER_FONT = '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
export const MAX_LETTERS = 16;

/** One typed character and the plants rooted in it. */
export interface Letter {
  ch: string;
  /** Left edge and baseline, eased toward the target layout. */
  x: number;
  y: number;
  size: number;
  tx: number;
  ty: number;
  tsize: number;
  /** Advance width in ems. */
  em: number;
  age: number;
  fresh: boolean;
  plants: Plant[];
  /** Root points on the glyph, in ems from (left, baseline), and the live positions they drive. */
  pins: { pin: Vec; ux: number; uy: number }[];
}

let scratch: CanvasRenderingContext2D | null = null;
const BOX = 112;
const PX = 64;
const OX = 24;
const OY = 80;

function ctx(): CanvasRenderingContext2D {
  if (!scratch) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = BOX;
    scratch = canvas.getContext('2d', { willReadFrequently: true })!;
  }
  return scratch;
}

export function letterEm(ch: string): number {
  const c = ctx();
  c.font = `100px ${LETTER_FONT}`;
  return c.measureText(ch).width / 100;
}

/**
 * Picks points on a glyph's ink for stems to grow from. The first few sit on the top
 * contour (so stems rise out of the letter); later ones land anywhere inside it.
 */
export function sampleGlyph(ch: string, rng: Rng, count: number): { ux: number; uy: number }[] {
  const c = ctx();
  c.clearRect(0, 0, BOX, BOX);
  c.font = `${PX}px ${LETTER_FONT}`;
  c.fillStyle = '#000';
  c.textBaseline = 'alphabetic';
  c.fillText(ch, OX, OY);
  const data = c.getImageData(0, 0, BOX, BOX).data;
  const inked = (x: number, y: number) => data[(y * BOX + x) * 4 + 3] > 120;

  const columns: number[] = [];
  for (let x = 0; x < BOX; x++) {
    for (let y = 0; y < BOX; y++) {
      if (inked(x, y)) {
        columns.push(x);
        break;
      }
    }
  }
  if (!columns.length) return [];

  const out: { ux: number; uy: number }[] = [];
  for (let k = 0; k < count; k++) {
    const x = columns[Math.floor(rng() * columns.length)];
    const rows: number[] = [];
    for (let y = 0; y < BOX; y++) if (inked(x, y)) rows.push(y);
    const y = k < 2 ? Math.min(rows[0] + 2, rows[rows.length - 1]) : rows[Math.floor(rng() * rows.length)];
    out.push({ ux: (x - OX) / PX, uy: (y - OY) / PX });
  }
  return out;
}

/** Sets each letter's target position so the word sits centred and fits the page. */
export function layoutLetters(letters: Letter[], w: number, h: number) {
  let ems = 0;
  for (const l of letters) ems += l.em;
  if (ems <= 0) return;
  const size = Math.max(16, Math.min(h * 0.24, (w * 0.84) / ems, 230));
  let x = (w - ems * size) / 2;
  const y = h * 0.5 + size * 0.3;
  for (const l of letters) {
    l.tx = x;
    l.ty = y;
    l.tsize = size;
    if (l.fresh) {
      l.x = x;
      l.y = y;
      l.size = size;
    }
    x += l.em * size;
  }
}
