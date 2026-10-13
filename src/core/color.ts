import type { Rng } from './math';

export const PALETTE = {
  paper: '#F7F3EA',
  ink: '#1F3A2B',
  forest: '#1E4A32',
  coral: '#F26B50',
  butter: '#F6C431',
  cobalt: '#2447C9',
  lavender: '#B6A1E3',
  red: '#D9342B',
} as const;

type RGB = [number, number, number];
const DARK: RGB = [34, 22, 18];
const LIGHT: RGB = [255, 250, 236];

function parse(hex: string): RGB {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Mixes a hex colour toward warm dark (amt < 0) or warm light (amt > 0). */
export function tone(hex: string, amt: number, alpha = 1): string {
  const c = parse(hex);
  const to = amt < 0 ? DARK : LIGHT;
  const t = Math.min(1, Math.abs(amt));
  const r = Math.round(c[0] + (to[0] - c[0]) * t);
  const g = Math.round(c[1] + (to[1] - c[1]) * t);
  const b = Math.round(c[2] + (to[2] - c[2]) * t);
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

/** Small per-plant colour variation so no two flowers are identical. */
export function jitterHex(hex: string, rng: Rng, amt: number): string {
  const c = parse(hex);
  const out = c.map((ch) => {
    const v = Math.round(ch + (rng() - 0.5) * 2 * amt * 255);
    return Math.max(0, Math.min(255, v));
  });
  return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('');
}
