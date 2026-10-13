import type { LoosePetal, Mote, Plant } from '../core/types';
import type { Surface } from '../canvas/surface';
import { clamp, easeOutBack, easeOutCubic, lerp, smooth, TAU } from '../core/math';
import { drawSprite, drawSpriteCentred, shadowSprite } from '../canvas/sprites';
import { PALETTE, tone } from '../core/color';
import { LETTER_FONT, type Letter } from '../garden/lettering';

export interface Scene {
  surface: Surface;
  plants: Plant[];
  letters: Letter[];
  petals: LoosePetal[];
  motes: Mote[];
  time: number;
  /** True when the viewer prefers reduced motion. */
  still: boolean;
  /** True on touch screens, where the caret doubles as the place to tap for the keyboard. */
  touch: boolean;
  shake: number;
  hovered: Plant | null;
  /** Mouse position for the on-canvas cursor hint, or null when absent. */
  cursor: { x: number; y: number; mode: 'seed' | 'gust' } | null;
}

const PX = new Float32Array(64);
const PY = new Float32Array(64);
const INK = PALETTE.ink;

export function drawScene(c: CanvasRenderingContext2D, s: Scene, overlay: boolean) {
  const { w, h, dpr } = s.surface;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.globalAlpha = 1;
  c.drawImage(s.surface.paper, 0, 0, w, h);

  if (overlay && s.shake > 0.2) {
    c.translate(Math.sin(s.time * 71) * s.shake, Math.cos(s.time * 83) * s.shake * 0.7);
  }

  drawLetters(c, s.letters);
  for (let i = 0; i < s.plants.length; i++) drawStem(c, s.plants[i]);
  for (let i = 0; i < s.plants.length; i++) drawHead(c, s.plants[i]);
  drawPetals(c, s.petals);
  drawMotes(c, s.motes);

  if (overlay) drawOverlay(c, s);
  c.globalAlpha = 1;
}

/** Typed words sit on the paper like letterpress; everything grows over them. */
function drawLetters(c: CanvasRenderingContext2D, letters: Letter[]) {
  if (!letters.length) return;
  c.fillStyle = INK;
  c.textBaseline = 'alphabetic';
  for (let i = 0; i < letters.length; i++) {
    const l = letters[i];
    const t = Math.min(1, l.age * 4);
    c.globalAlpha = 0.92 * t;
    c.font = `${l.size.toFixed(1)}px ${LETTER_FONT}`;
    c.fillText(l.ch, l.x, l.y + (1 - t) * (1 - t) * l.size * 0.08);
  }
  c.globalAlpha = 1;
}

function drawStem(c: CanvasRenderingContext2D, p: Plant) {
  if (p.growth <= 0) return;
  const nodes = p.nodes;
  const n = nodes.length;
  for (let i = 0; i < n; i++) {
    PX[i] = nodes[i].x;
    PY[i] = nodes[i].y;
  }
  PX[n] = p.head.position.x;
  PY[n] = p.head.position.y;

  let len = 0;
  for (let i = 0; i < n; i++) len += Math.hypot(PX[i + 1] - PX[i], PY[i + 1] - PY[i]);
  const grow = easeOutCubic(clamp(p.growth, 0, 1));
  // A stretched stem thins out like pulled taffy.
  const ratio = len / Math.max(1, n * p.segLen * Math.max(0.03, grow));
  const thin = clamp(1 / Math.sqrt(Math.max(ratio, 0.2)), 0.4, 1.1);
  const w0 = p.stemW * (0.5 + 0.5 * grow) * thin;
  const w1 = p.stemW * 0.5 * thin;

  c.strokeStyle = p.stemColor;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (let k = 0; k <= n; k++) {
    c.beginPath();
    if (k === 0) {
      c.moveTo(PX[0], PY[0]);
      c.lineTo((PX[0] + PX[1]) / 2, (PY[0] + PY[1]) / 2);
    } else if (k === n) {
      c.moveTo((PX[n - 1] + PX[n]) / 2, (PY[n - 1] + PY[n]) / 2);
      c.lineTo(PX[n], PY[n]);
    } else {
      c.moveTo((PX[k - 1] + PX[k]) / 2, (PY[k - 1] + PY[k]) / 2);
      c.quadraticCurveTo(PX[k], PY[k], (PX[k] + PX[k + 1]) / 2, (PY[k] + PY[k + 1]) / 2);
    }
    c.lineWidth = lerp(w0, w1, k / n);
    c.stroke();
  }

  for (let k = 0; k < p.leaves.length; k++) {
    const lf = p.leaves[k];
    const s = smooth(clamp(grow * n * 1.2 - lf.node, 0, 1));
    if (s <= 0.01) continue;
    const L = lf.size * s;
    const W = L * lf.width * 1.6;
    const x = PX[lf.node];
    const y = PY[lf.node];
    c.save();
    c.translate(x, y);
    c.rotate(lf.abs);
    c.fillStyle = lf.color;
    c.beginPath();
    c.moveTo(0, 0);
    c.quadraticCurveTo(L * 0.32, -W, L, 0);
    c.quadraticCurveTo(L * 0.45, W * 0.72, 0, 0);
    c.fill();
    c.strokeStyle = 'rgba(16,40,26,0.35)';
    c.lineWidth = 0.5;
    c.beginPath();
    c.moveTo(0, 0);
    c.quadraticCurveTo(L * 0.5, -W * 0.12, L * 0.92, 0);
    c.stroke();
    c.restore();
    c.fillStyle = p.stemColor;
    c.beginPath();
    c.arc(x, y, p.stemW * 0.75 * thin, 0, TAU);
    c.fill();
  }
}

function drawHead(c: CanvasRenderingContext2D, p: Plant) {
  if (p.growth <= 0.04) return;
  const hx = p.head.position.x;
  const hy = p.head.position.y;
  const angle = p.head.angle;
  const R = p.radius;
  const t = clamp((p.growth - 0.5) / 0.5, 0, 1);
  const open = easeOutBack(t);

  // Until it opens, the flower is a tight green bud at the tip of the stem.
  if (t < 1) {
    const br = (1.5 + R * 0.13) * Math.min(1, p.growth * 3);
    c.globalAlpha = 1 - t;
    c.fillStyle = tone(PALETTE.forest, 0.14);
    c.save();
    c.translate(hx, hy);
    c.rotate(p.tipAngle);
    c.beginPath();
    c.ellipse(br * 0.4, 0, br * 1.5, br, 0, 0, TAU);
    c.fill();
    c.restore();
    c.globalAlpha = 1;
  }
  if (t <= 0) return;

  const hs = open * (1 + 0.05 * p.hover);
  const sh = shadowSprite();
  const sr = R * 1.25 * Math.min(1, open);
  c.globalAlpha = 0.55 * Math.min(1, t * 2);
  c.drawImage(sh.canvas, hx - sr + 3, hy - sr + 7, sr * 2, sr * 2);
  c.globalAlpha = 1;

  const art = p.art;
  const unfold = 0.42 + 0.58 * Math.min(1, open);
  const perk = 1 + 0.08 * p.hover;
  const slots = art.slots;
  for (let i = 0; i < slots.length; i++) {
    const sl = slots[i];
    if (sl.scale <= 0.02) continue;
    const ps = smooth(sl.scale);
    // Back layers trail further behind the head's motion than front ones.
    const f = 1 - sl.layer * 0.35;
    c.save();
    c.translate(hx + p.lx * f, hy + p.ly * f);
    c.rotate(angle + p.tw * f * sl.lag);
    c.scale(hs, hs);
    c.translate(sl.bx + Math.cos(sl.a) * sl.r0, sl.by + Math.sin(sl.a) * sl.r0);
    c.rotate(sl.a);
    drawSprite(c, art.sprites[sl.sprite], sl.sx * ps, sl.sy * ps * unfold * perk);
    c.restore();
  }
  if (art.centre) {
    c.save();
    c.translate(hx + p.lx * 0.25, hy + p.ly * 0.25);
    c.rotate(angle + p.tw * 0.3);
    drawSprite(c, art.centre, hs, hs);
    c.restore();
  }
}

function drawPetals(c: CanvasRenderingContext2D, petals: LoosePetal[]) {
  for (let i = 0; i < petals.length; i++) {
    const pt = petals[i];
    const b = pt.body;
    const fadeIn = Math.min(1, pt.age * 6);
    const fadeOut = clamp(pt.life - pt.age, 0, 1);
    c.globalAlpha = fadeIn * fadeOut;
    c.save();
    c.translate(b.position.x, b.position.y);
    c.rotate(b.angle);
    drawSpriteCentred(c, pt.sprite, pt.sx, pt.sy * (0.3 + 0.7 * Math.abs(Math.cos(pt.flip))));
    c.restore();
  }
  c.globalAlpha = 1;
}

function drawMotes(c: CanvasRenderingContext2D, motes: Mote[]) {
  c.lineCap = 'round';
  for (let i = 0; i < motes.length; i++) {
    const m = motes[i];
    const k = m.age / m.life;
    c.globalAlpha = Math.min(1, m.age * 8) * (1 - k * k);
    if (m.streak) {
      c.strokeStyle = m.color;
      c.lineWidth = m.r;
      c.beginPath();
      c.moveTo(m.x, m.y);
      c.lineTo(m.x - m.vx * 0.05, m.y - m.vy * 0.05);
      c.stroke();
    } else {
      c.fillStyle = m.color;
      c.beginPath();
      c.arc(m.x, m.y, m.r, 0, TAU);
      c.fill();
    }
  }
  c.globalAlpha = 1;
}

/**
 * A text caret waiting in the middle of the page, so it is obvious that typing does
 * something. It sits after the last letter once a word exists.
 */
function drawCaret(c: CanvasRenderingContext2D, s: Scene) {
  const { w, h } = s.surface;
  const last = s.letters[s.letters.length - 1];
  const size = last ? last.size : Math.min(h * 0.16, w * 0.2, 130);
  const x = last ? last.x + last.em * last.size + Math.max(3, size * 0.05) : w / 2;
  const base = last ? last.y : h * 0.5 + size * 0.3;
  // A slow breath rather than a hard blink; steady when motion is reduced.
  const pulse = s.still ? 0.6 : 0.5 + 0.5 * Math.sin(s.time * 4.2);
  c.globalAlpha = 0.14 + 0.5 * pulse * pulse;
  c.strokeStyle = INK;
  c.lineCap = 'round';
  c.lineWidth = Math.max(1.2, size * 0.022);
  c.beginPath();
  c.moveTo(x, base - size * 0.72);
  c.lineTo(x, base + size * 0.06);
  c.stroke();
  if (!last) {
    c.globalAlpha = 0.42;
    c.fillStyle = INK;
    c.font = `italic 13px ${LETTER_FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'top';
    c.fillText(s.touch ? 'tap here to type' : 'start typing', x, base + size * 0.06 + 14);
    c.textAlign = 'start';
    c.textBaseline = 'alphabetic';
  }
  c.globalAlpha = 1;
}

/** Interaction feedback that is never part of an exported image. */
function drawOverlay(c: CanvasRenderingContext2D, s: Scene) {
  drawCaret(c, s);
  for (let i = 0; i < s.plants.length; i++) {
    const p = s.plants[i];
    if (p.hover < 0.03) continue;
    const r = p.radius + 7 + 2 * p.hover;
    c.globalAlpha = clamp(p.hover, 0, 1) * 0.42;
    c.strokeStyle = INK;
    c.lineWidth = 0.9;
    c.setLineDash([1.5, 5]);
    c.lineDashOffset = -s.time * 9;
    c.beginPath();
    c.arc(p.head.position.x, p.head.position.y, r, 0, TAU);
    c.stroke();
    c.setLineDash([]);
  }
  if (s.cursor && !s.hovered) {
    const { x, y, mode } = s.cursor;
    c.strokeStyle = INK;
    c.lineWidth = 0.8;
    if (mode === 'gust') {
      c.globalAlpha = 0.22;
      c.setLineDash([2, 6]);
      c.lineDashOffset = s.time * 30;
      c.beginPath();
      c.arc(x, y, 28, 0, TAU);
      c.stroke();
      c.setLineDash([]);
    } else {
      c.globalAlpha = 0.3;
      c.beginPath();
      c.arc(x, y, 7 + Math.sin(s.time * 3) * 1.2, 0, TAU);
      c.stroke();
    }
  }
  c.globalAlpha = 1;
}
