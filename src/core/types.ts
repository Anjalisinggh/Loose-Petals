import type Matter from 'matter-js';
import type { Rng } from './math';

export interface Vec {
  x: number;
  y: number;
}

/** A pre-rendered bitmap with an anchor point, in CSS pixels. */
export interface Sprite {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
  ax: number;
  ay: number;
}

export interface PetalSlot {
  /** Direction the petal points, in the head's local frame. */
  a: number;
  /** Distance of the petal base from its pivot, along `a`. */
  r0: number;
  /** Pivot offset in the head's local frame. */
  bx: number;
  by: number;
  sprite: number;
  sx: number;
  sy: number;
  layer: number;
  /** 1 = attached. Below 1 the petal has been shed and is regrowing. */
  scale: number;
  /** How strongly this petal trails the head's rotation. */
  lag: number;
}

export interface HeadArt {
  slots: PetalSlot[];
  sprites: Sprite[];
  centre: Sprite | null;
  /** Sprite shed by heads that have no individual petals (e.g. allium florets). */
  loose: Sprite | null;
  pollen: string;
}

export interface LeafStyle {
  count: [number, number];
  size: [number, number];
  width: number;
  /** Portion of the stem (0 = root, 1 = tip) leaves are spread across. */
  from: number;
  to: number;
}

export interface Variety {
  key: string;
  palette: string[];
  radius: [number, number];
  /** Preferred head height as a fraction of the canvas height. */
  height: [number, number];
  mass: number;
  /** Stem stiffness relative to what is needed to stand at default gravity. */
  stiff: number;
  /** How much wind the head catches. */
  sail: number;
  /** Torsional spring holding the head in line with its stem (0 = spins freely). */
  align: number;
  angDamp: number;
  stemW: number;
  /** Target stem segment length. */
  seg: number;
  curl: number;
  leaves: LeafStyle;
  buds: number;
  build(rng: Rng, R: number, color: string): HeadArt;
}

export interface StemNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
}

export interface Leaf {
  node: number;
  side: number;
  size: number;
  width: number;
  rest: number;
  angle: number;
  vel: number;
  abs: number;
  color: string;
  /** Moonlit colour used after dark. */
  night: string;
}

export interface Plant {
  id: number;
  variety: Variety;
  user: boolean;
  anchor: 'bottom' | 'top';
  parent: { plant: Plant; node: number } | null;
  /** When set, the root follows this point (e.g. a spot on a typed letter). */
  pin: Vec | null;
  /** nodes[0] is the pinned root; the head body follows the last node. */
  nodes: StemNode[];
  /** restAngles[i] is the bend of segment i relative to the one before it. */
  restAngles: number[];
  baseAngle: number;
  segLen: number;
  curLen: number;
  kBend: number;
  kStretch: number;
  tipAngle: number;
  stemW: number;
  stemColor: string;
  stemNight: string;
  leaves: Leaf[];

  head: Matter.Body;
  color: string;
  radius: number;
  art: HeadArt;
  solid: boolean;
  grabbed: number;

  growth: number;
  growRate: number;

  // per-step force accumulators for the head
  fx: number;
  fy: number;
  tq: number;
  // head velocity cache (px/s, rad/s)
  vx: number;
  vy: number;
  w: number;

  // secondary motion: petals trail the head's acceleration and spin
  lx: number;
  ly: number;
  lvx: number;
  lvy: number;
  tw: number;
  twv: number;
  hover: number;
  hoverV: number;
  hoverTarget: number;
}

export interface LoosePetal {
  body: Matter.Body;
  sprite: Sprite;
  sx: number;
  sy: number;
  flip: number;
  flipSpeed: number;
  age: number;
  life: number;
}

export interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  r: number;
  color: string;
  streak: boolean;
}

export interface Gust {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export interface Air {
  time: number;
  strength: number;
  gusts: Gust[];
  storm: number;
  stormDir: number;
  cx: number;
  cy: number;
}
