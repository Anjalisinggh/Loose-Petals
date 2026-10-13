import type { Sprite } from '../core/types';
import { clamp } from '../core/math';

let spriteScale = 2;

/** Sprites are baked once at this resolution; call before generating flowers. */
export function setSpriteScale(dpr: number) {
  spriteScale = clamp(dpr, 1, 2.5);
}

export function makeSprite(
  w: number,
  h: number,
  ax: number,
  ay: number,
  draw: (c: CanvasRenderingContext2D) => void,
): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w * spriteScale));
  canvas.height = Math.max(1, Math.ceil(h * spriteScale));
  const c = canvas.getContext('2d')!;
  c.scale(spriteScale, spriteScale);
  draw(c);
  return { canvas, w, h, ax, ay };
}

/** Draws a sprite with its anchor at the current origin. */
export function drawSprite(c: CanvasRenderingContext2D, s: Sprite, sx = 1, sy = 1) {
  c.drawImage(s.canvas, -s.ax * sx, -s.ay * sy, s.w * sx, s.h * sy);
}

/** Draws a sprite centred on the current origin. */
export function drawSpriteCentred(c: CanvasRenderingContext2D, s: Sprite, sx = 1, sy = 1) {
  c.drawImage(s.canvas, (-s.w * sx) / 2, (-s.h * sy) / 2, s.w * sx, s.h * sy);
}

let shadow: Sprite | null = null;

/** A shared soft contact shadow, scaled per flower. */
export function shadowSprite(): Sprite {
  if (!shadow) {
    shadow = makeSprite(64, 64, 32, 32, (c) => {
      const g = c.createRadialGradient(32, 32, 2, 32, 32, 32);
      g.addColorStop(0, 'rgba(70,48,22,0.26)');
      g.addColorStop(0.55, 'rgba(70,48,22,0.10)');
      g.addColorStop(1, 'rgba(70,48,22,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
    });
  }
  return shadow;
}
