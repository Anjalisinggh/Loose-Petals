import Matter from 'matter-js';
import type { Air, LoosePetal, Mote, Plant } from '../core/types';
import { clamp, mulberry32, pick, range } from '../core/math';
import { Surface } from '../canvas/surface';
import { setSpriteScale } from '../canvas/sprites';
import { createAir } from '../physics/wind';
import { integratePlant, plantForces, resetForces } from '../physics/stems';
import { createWorld, FORCE_SCALE, G_DEFAULT, G_MAX, kick, setBounds, spin, STEP, type World } from '../physics/world';
import { agePetals, petalForces, spawnPetal } from '../particles/petals';
import { puff, spawnMote, stepMotes } from '../particles/pollen';
import { bindPointer } from '../input/pointer';
import { drawScene, type Scene } from '../render/draw';
import { saveCanvasPng } from '../export/png';
import { createPlant, type PlantOptions } from './plant';
import { composeGarden } from './composition';
import { BUD, VARIETIES } from './varieties';
import { layoutLetters, letterEm, MAX_LETTERS, sampleGlyph, type Letter } from './lettering';

const { Engine, Composite, Body, Events } = Matter;

const SEED = 20261013;
const MAX_PLANTS = 120;
/** Spring and damper pulling a held flower toward the pointer. */
const DRAG_K = 2000;
const DRAG_C = 70;

interface Pointer {
  id: number;
  type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  down: boolean;
  startX: number;
  startY: number;
  startT: number;
  moved: boolean;
  plant: Plant | null;
  /** Where on the head it was grabbed, in the head's own frame. */
  lx: number;
  ly: number;
  reversals: number[];
  sign: number;
}

export interface GardenOptions {
  reducedMotion: boolean;
  onCount(count: number): void;
}

/** The simulation: owns the world, the plants and particles, and the frame loop. */
export class Garden {
  private surface: Surface;
  private world: World = createWorld();
  private air: Air = createAir();
  private plants: Plant[] = [];
  private petals: LoosePetal[] = [];
  private letters: Letter[] = [];
  private motes: Mote[] = [];
  private heads = new Map<number, Plant>();
  private pointers = new Map<number, Pointer>();
  private rnd = Math.random;

  private gravity = G_DEFAULT;
  private gusts = false;
  private reduced: boolean;

  private nextId = 1;
  private nextVariety = 0;
  private sceneScale = 1;
  private time = 0;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private shakeAmp = 0;
  private lastShake = 0;
  private pollenAcc = 0;
  private hovered: Plant | null = null;
  private cursorStyle = '';
  private count = -1;
  private scene: Scene;
  private unbind: () => void;

  constructor(
    private canvas: HTMLCanvasElement,
    private opts: GardenOptions,
  ) {
    this.reduced = opts.reducedMotion;
    setSpriteScale(window.devicePixelRatio || 1);
    Events.on(this.world.engine, 'collisionStart', this.onCollide);
    this.surface = new Surface(canvas, this.onResize);
    this.scene = {
      surface: this.surface,
      plants: this.plants,
      letters: this.letters,
      petals: this.petals,
      motes: this.motes,
      time: 0,
      still: this.reduced,
      shake: 0,
      hovered: null,
      cursor: null,
    };
    this.unbind = bindPointer(canvas, {
      down: this.onDown,
      move: this.onMove,
      up: this.onUp,
      leave: this.onLeave,
      wheel: this.onWheel,
      shake: () => this.shake(),
    });
    this.surface.measure();
  }

  start() {
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.unbind();
    this.surface.destroy();
    Events.off(this.world.engine, 'collisionStart', this.onCollide);
    Engine.clear(this.world.engine);
  }

  // ── controls ────────────────────────────────────────────────────────────────

  setWind(strength: number) {
    this.air.strength = clamp(strength, 0, 1);
  }

  /** -1 (strong lift) … 0 (weightless) … 1 (heavy). */
  setGravity(value: number) {
    this.gravity = clamp(value, -1, 1);
  }

  setGusts(on: boolean) {
    this.gusts = on;
    if (on) {
      for (const ptr of this.pointers.values()) this.release(ptr);
    }
  }

  /**
   * Sets the word in the middle of the page. Letters that survive the edit keep their
   * flowers; removed ones drop theirs; new ones sprout.
   */
  setText(raw: string) {
    const chars = Array.from(raw).slice(0, MAX_LETTERS);
    const letters = this.letters;
    let keep = 0;
    while (keep < letters.length && keep < chars.length && letters[keep].ch === chars[keep]) keep++;
    for (const gone of letters.splice(keep)) {
      for (const p of gone.plants) {
        if (!this.plants.includes(p)) continue;
        this.shed(p, 99, 170);
        this.removePlant(p);
      }
    }
    for (let i = keep; i < chars.length; i++) {
      letters.push({
        ch: chars[i],
        x: 0,
        y: 0,
        size: 0,
        tx: 0,
        ty: 0,
        tsize: 0,
        em: letterEm(chars[i]),
        age: this.reduced ? 1 : 0,
        fresh: true,
        plants: [],
        pins: [],
      });
    }
    layoutLetters(letters, this.surface.w, this.surface.h);
    for (const l of letters) {
      if (!l.fresh) continue;
      l.fresh = false;
      this.sprout(l);
    }
  }

  /** Roots a few flowers in a letter: one nestled against it, the others reaching out. */
  private sprout(letter: Letter) {
    const want = 3 + (this.rnd() < 0.4 ? 1 : 0);
    const spots = sampleGlyph(letter.ch, this.rnd, want);
    const down = this.gravity < -0.12;
    for (let k = 0; k < spots.length; k++) {
      if (this.plants.length >= MAX_PLANTS) break;
      const { ux, uy } = spots[k];
      const pin = { x: letter.x + ux * letter.size, y: letter.y + uy * letter.size };
      const snug = k === 0 || k === 2;
      const reach = snug ? range(this.rnd, 10, 24) : clamp(range(this.rnd, 0.4, 1.05) * letter.size, 36, 210);
      const angle = (down ? 1 : -1) * Math.PI * 0.5 + range(this.rnd, -0.75, 0.75);
      const variety = snug
        ? pick(this.rnd, [VARIETIES[0], VARIETIES[1], VARIETIES[2], VARIETIES[3], VARIETIES[6]])
        : this.rnd() < 0.2
          ? BUD
          : pick(this.rnd, VARIETIES);
      const plant = this.addPlant({
        variety,
        rng: this.rnd,
        scale: clamp(letter.size / 190, 0.36, 0.8) * range(this.rnd, 0.8, 1.12),
        delay: 0.05 + k * 0.2,
        user: false,
        root: { x: pin.x, y: pin.y },
        target: { x: pin.x + Math.cos(angle) * reach, y: pin.y + Math.sin(angle) * reach },
        pin,
      });
      letter.plants.push(plant);
      letter.pins.push({ pin, ux, uy });
    }
  }

  reset() {
    const world = this.world.engine.world;
    for (const p of this.plants) Composite.remove(world, p.head);
    for (const pt of this.petals) Composite.remove(world, pt.body);
    this.plants.length = 0;
    this.letters.length = 0;
    this.petals.length = 0;
    this.motes.length = 0;
    this.heads.clear();
    for (const ptr of this.pointers.values()) ptr.plant = null;
    this.hovered = null;
    this.air.storm = 0;
    this.shakeAmp = 0;
    this.nextVariety = 0;
    this.plantGarden();
  }

  /** Tears petals off every flower and whirls them, with a few strays, around the page. */
  petalStorm() {
    const { w, h } = this.surface;
    this.air.storm = 1;
    this.air.stormDir = -this.air.stormDir;
    const donors: Plant[] = [];
    for (const p of this.plants) {
      const n = p.art.slots.length;
      this.shed(p, n ? Math.max(1, Math.round(n * 0.4)) : 5, 320);
      if (n && p.growth >= 1) donors.push(p);
    }
    const strays = donors.length ? (this.reduced ? 10 : 40) : 0;
    for (let i = 0; i < strays; i++) {
      const p = pick(this.rnd, donors);
      const sl = pick(this.rnd, p.art.slots);
      spawnPetal(
        this.world.engine.world,
        this.petals,
        p.art.sprites[sl.sprite],
        this.rnd() * w,
        range(this.rnd, 20, h * 0.65),
        this.rnd() * Math.PI * 2,
        range(this.rnd, -260, 260),
        range(this.rnd, -260, 260),
        sl.sx,
        sl.sy,
      );
    }
  }

  async savePNG() {
    this.render(false);
    await saveCanvasPng(this.canvas, this.surface.dpr, this.plants.length);
  }

  // ── setup ───────────────────────────────────────────────────────────────────

  private onResize = (w: number, h: number, prevW: number, prevH: number) => {
    setBounds(this.world, w, h);
    this.air.cx = w / 2;
    this.air.cy = h * 0.45;
    this.sceneScale = clamp(Math.min(w, h) / 760, 0.68, 1.08);
    layoutLetters(this.letters, w, h);
    if (prevW === 0 || this.plants.length === 0) {
      this.plantGarden();
      return;
    }
    // Keep the garden where it was relative to the new frame.
    const sx = w / prevW;
    const dyBottom = h - prevH;
    const shifts = new Map<Plant, { dx: number; dy: number }>();
    for (const p of this.plants) {
      const inherited = p.parent ? shifts.get(p.parent.plant) : undefined;
      // Plants rooted in letters follow the text as it re-centres.
      const dx = inherited ? inherited.dx : p.pin ? 0 : p.nodes[0].x * (sx - 1);
      const dy = inherited ? inherited.dy : p.pin ? 0 : p.anchor === 'bottom' ? dyBottom : 0;
      shifts.set(p, { dx, dy });
      for (const nd of p.nodes) {
        nd.x += dx;
        nd.y += dy;
      }
      Body.setPosition(p.head, { x: p.head.position.x + dx, y: p.head.position.y + dy });
    }
    for (const pt of this.petals) {
      const pos = pt.body.position;
      Body.setPosition(pt.body, { x: clamp(pos.x, 4, w - 4), y: clamp(pos.y, 8, h - 8) });
    }
  };

  private plantGarden() {
    const { w, h } = this.surface;
    if (w < 2 || h < 2) return;
    const rng = mulberry32(SEED);
    for (const spec of composeGarden(w, h, rng)) {
      const plant = this.addPlant({
        variety: spec.variety,
        rng,
        scale: spec.scale,
        delay: spec.delay,
        user: false,
        root: spec.root,
        target: spec.target,
      });
      const n = plant.nodes.length;
      let side = rng() < 0.5 ? 1 : -1;
      for (let b = 0; b < spec.buds; b++) {
        this.addPlant({
          variety: BUD,
          rng,
          scale: spec.scale,
          delay: spec.delay + 0.9 + b * 0.3,
          user: false,
          color: plant.color,
          parent: { plant, node: clamp(Math.round(n * range(rng, 0.5, 0.85)), 2, n - 1) },
          side,
          length: range(rng, 26, 58) * spec.scale,
        });
        side = -side;
      }
    }
  }

  private addPlant(o: Omit<PlantOptions, 'id' | 'instant'>): Plant {
    const plant = createPlant({ ...o, id: this.nextId++, instant: this.reduced });
    Composite.add(this.world.engine.world, plant.head);
    this.plants.push(plant);
    this.heads.set(plant.head.id, plant);
    return plant;
  }

  private removePlant(p: Plant) {
    Composite.remove(this.world.engine.world, p.head);
    this.heads.delete(p.head.id);
    const i = this.plants.indexOf(p);
    if (i >= 0) this.plants.splice(i, 1);
    for (const ptr of this.pointers.values()) if (ptr.plant === p) ptr.plant = null;
    if (this.hovered === p) this.hovered = null;
  }

  // ── simulation ──────────────────────────────────────────────────────────────

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    let elapsed = (now - this.last) / 1000;
    this.last = now;
    // After a pause (hidden tab, breakpoint) resume gently instead of catching up.
    if (elapsed > 0.25) elapsed = 1 / 60;
    elapsed = Math.min(elapsed, 1 / 20);

    this.buildGusts(elapsed);
    this.acc += elapsed;
    let steps = 0;
    while (this.acc >= STEP && steps < 8) {
      this.step(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps === 8) this.acc = 0;

    this.update(elapsed);
    this.render(true);
  };

  /** One fixed physics step: springs, air, contact, then integration. */
  private step(dt: number) {
    this.time += dt;
    const air = this.air;
    air.time = this.time;
    const g = this.gravity * G_MAX;
    const plants = this.plants;

    for (let i = 0; i < plants.length; i++) resetForces(plants[i]);
    for (let i = 0; i < plants.length; i++) plantForces(plants[i], air, g);

    for (let i = 0; i < plants.length; i++) {
      const a = plants[i];
      if (!a.solid) continue;
      const ap = a.head.position;
      for (let j = i + 1; j < plants.length; j++) {
        const b = plants[j];
        if (!b.solid) continue;
        const bp = b.head.position;
        const dx = bp.x - ap.x;
        const dy = bp.y - ap.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > 190 * 190 || d2 < 1e-4) continue;
        const d = Math.sqrt(d2);
        // Overlapping petals push back softly, well before the rigid cores touch.
        const overlap = (a.radius + b.radius) * 0.85 - d;
        if (overlap > 0) {
          const f = (70 * overlap * (a.head.mass + b.head.mass)) / 2 / d;
          a.fx -= dx * f;
          a.fy -= dy * f;
          b.fx += dx * f;
          b.fy += dy * f;
        }
        // A fast-moving head drags the air, and its neighbours, along with it.
        const k = 1 - d / 190;
        const wake = 1.3 * k * k;
        if (a.vx * a.vx + a.vy * a.vy > 14400) {
          b.fx += b.head.mass * a.vx * wake;
          b.fy += b.head.mass * a.vy * wake;
        }
        if (b.vx * b.vx + b.vy * b.vy > 14400) {
          a.fx += a.head.mass * b.vx * wake;
          a.fy += a.head.mass * b.vy * wake;
        }
      }
    }

    for (const ptr of this.pointers.values()) {
      const p = ptr.plant;
      if (!p) continue;
      const head = p.head;
      const c = Math.cos(head.angle);
      const s = Math.sin(head.angle);
      const rx = ptr.lx * c - ptr.ly * s;
      const ry = ptr.lx * s + ptr.ly * c;
      const m = head.mass;
      // Pulling from the grab point means an off-centre hold also twists the flower.
      const fx = m * (DRAG_K * (ptr.x - head.position.x - rx) - DRAG_C * (p.vx - p.w * ry));
      const fy = m * (DRAG_K * (ptr.y - head.position.y - ry) - DRAG_C * (p.vy + p.w * rx));
      p.fx += fx;
      p.fy += fy;
      p.tq += rx * fy - ry * fx;
    }

    for (let i = 0; i < plants.length; i++) {
      const p = plants[i];
      p.head.force.x += p.fx * FORCE_SCALE;
      p.head.force.y += p.fy * FORCE_SCALE;
      p.head.torque += p.tq * FORCE_SCALE;
    }
    petalForces(this.petals, air, g, this.surface.h, dt);

    Engine.update(this.world.engine, dt * 1000);

    for (let i = 0; i < plants.length; i++) integratePlant(plants[i], air, g, dt);
  }

  /** Per-frame housekeeping that does not need the fixed step. */
  private update(el: number) {
    const { w, h } = this.surface;
    const g = this.gravity * G_MAX;

    if (this.air.storm > 0) {
      this.air.storm *= Math.exp(-el / 2.4);
      if (this.air.storm < 0.01) this.air.storm = 0;
    }
    this.shakeAmp *= Math.exp(-el * 7);

    // Letters ease into place as the word grows or shrinks, carrying their roots along.
    const ease = this.reduced ? 1 : 1 - Math.exp(-el * 11);
    for (const l of this.letters) {
      l.age += el;
      l.x += (l.tx - l.x) * ease;
      l.y += (l.ty - l.y) * ease;
      l.size += (l.tsize - l.size) * ease;
      for (const s of l.pins) {
        s.pin.x = l.x + s.ux * l.size;
        s.pin.y = l.y + s.uy * l.size;
      }
    }

    let hovered: Plant | null = null;
    let grabbing = false;
    let cursor: Scene['cursor'] = null;
    for (const ptr of this.pointers.values()) {
      if (ptr.plant) {
        grabbing = true;
        if (ptr.type === 'mouse') hovered = ptr.plant;
      } else if (ptr.type === 'mouse' && !ptr.down) {
        if (!this.gusts) hovered = this.headAt(ptr.x, ptr.y, 3);
        cursor = { x: ptr.x, y: ptr.y, mode: this.gusts ? 'gust' : 'seed' };
      }
    }
    if (hovered !== this.hovered) {
      if (hovered && !hovered.grabbed && !this.reduced) {
        // A small flinch toward the cursor before it is touched.
        const ptr = this.mouse();
        if (ptr) {
          const dx = ptr.x - hovered.head.position.x;
          const dy = ptr.y - hovered.head.position.y;
          const d = Math.hypot(dx, dy) + 1;
          kick(hovered.head, (dx / d) * 34, (dy / d) * 34 - 12);
        }
        spin(hovered.head, this.rnd() < 0.5 ? -0.9 : 0.9);
      }
      this.hovered = hovered;
    }
    const style = grabbing ? 'grabbing' : hovered ? 'grab' : this.gusts ? 'crosshair' : 'default';
    if (style !== this.cursorStyle) {
      this.cursorStyle = style;
      this.canvas.style.cursor = style;
    }

    for (let i = 0; i < this.plants.length; i++) {
      const p = this.plants[i];
      p.hoverTarget = p === hovered || p.grabbed > 0 ? 1 : 0;
      const pos = p.head.position;
      const speed = Math.hypot(p.vx, p.vy);
      if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || Math.abs(pos.x) > 20000 || Math.abs(pos.y) > 20000) {
        this.rescue(p);
        continue;
      }
      if (speed > 5000) Body.setVelocity(p.head, { x: ((p.vx / speed) * 5000) / 60, y: ((p.vy / speed) * 5000) / 60 });
      // Whip a flower hard enough and it starts to lose petals.
      if ((speed > 1500 || Math.abs(p.w) > 24) && this.rnd() < el * 5) this.shed(p, 1, 140);
    }

    this.pollenAcc += el * (this.reduced ? 0.5 : 2.6);
    while (this.pollenAcc >= 1 && this.plants.length) {
      this.pollenAcc -= 1;
      const p = pick(this.rnd, this.plants);
      if (p.growth < 1) continue;
      const pos = p.head.position;
      spawnMote(
        this.motes,
        pos.x + range(this.rnd, -0.5, 0.5) * p.radius,
        pos.y + range(this.rnd, -0.5, 0.5) * p.radius,
        p.vx * 0.3 + range(this.rnd, -12, 12),
        p.vy * 0.3 + range(this.rnd, -16, 6),
        p.art.pollen,
        range(this.rnd, 3, 6.5),
        range(this.rnd, 0.6, 1.4),
      );
    }

    agePetals(this.world.engine.world, this.petals, el, w, h);
    stepMotes(this.motes, this.air, g, el);

    if (this.plants.length !== this.count) {
      this.count = this.plants.length;
      this.opts.onCount(this.count);
    }

    this.scene.time = this.time;
    this.scene.shake = this.shakeAmp;
    this.scene.hovered = hovered;
    this.scene.cursor = cursor;
  }

  private render(overlay: boolean) {
    drawScene(this.surface.ctx, this.scene, overlay);
  }

  /** Turns moving pointers into local gusts while gust mode is on. */
  private buildGusts(el: number) {
    const gusts = this.air.gusts;
    gusts.length = 0;
    const decay = Math.exp(-el * 8);
    for (const ptr of this.pointers.values()) {
      ptr.vx *= decay;
      ptr.vy *= decay;
      if (!this.gusts || !(ptr.type === 'mouse' || ptr.down)) continue;
      const speed = Math.hypot(ptr.vx, ptr.vy);
      if (speed < 40) continue;
      const k = Math.min(1, 2400 / speed);
      gusts.push({ x: ptr.x, y: ptr.y, vx: ptr.vx * k, vy: ptr.vy * k, r: 200 });
      if (this.rnd() < el * speed * 0.03) {
        spawnMote(
          this.motes,
          ptr.x + range(this.rnd, -60, 60),
          ptr.y + range(this.rnd, -60, 60),
          ptr.vx * k * 0.5,
          ptr.vy * k * 0.5,
          'rgba(31,58,43,0.45)',
          range(this.rnd, 0.4, 0.9),
          0.8,
          true,
        );
      }
    }
  }

  private onCollide = (e: Matter.IEventCollision<Matter.Engine>) => {
    for (const pair of e.pairs) {
      const a = this.heads.get(pair.bodyA.id);
      const b = this.heads.get(pair.bodyB.id);
      if (!a || !b) continue;
      const rel = Math.hypot(a.vx - b.vx, a.vy - b.vy);
      if (rel < 140) continue;
      const x = (a.head.position.x + b.head.position.x) / 2;
      const y = (a.head.position.y + b.head.position.y) / 2;
      const n = Math.min(7, Math.round(rel / 110));
      puff(this.motes, x, y, a.art.pollen, n, rel * 0.25);
      puff(this.motes, x, y, b.art.pollen, n, rel * 0.25);
    }
  };

  /** Detaches up to `count` petals from a flower; they regrow after a moment. */
  private shed(p: Plant, count: number, speed: number) {
    if (p.growth < 0.95) return;
    const world = this.world.engine.world;
    const head = p.head;
    const art = p.art;
    if (art.slots.length) {
      const attached = art.slots.filter((s) => s.scale >= 1);
      const c = Math.cos(head.angle);
      const s = Math.sin(head.angle);
      for (let k = 0; k < count && attached.length; k++) {
        const sl = attached.splice(Math.floor(this.rnd() * attached.length), 1)[0];
        sl.scale = -range(this.rnd, 0.2, 1.1);
        const sprite = art.sprites[sl.sprite];
        const a = head.angle + sl.a;
        const mid = sl.r0 + sprite.w * 0.5 * sl.sx;
        const out = speed * range(this.rnd, 0.4, 1);
        spawnPetal(
          world,
          this.petals,
          sprite,
          head.position.x + sl.bx * c - sl.by * s + Math.cos(a) * mid,
          head.position.y + sl.bx * s + sl.by * c + Math.sin(a) * mid,
          a,
          p.vx * 0.5 + Math.cos(a) * out,
          p.vy * 0.5 + Math.sin(a) * out,
          sl.sx,
          sl.sy,
        );
      }
    } else if (art.loose) {
      for (let k = 0; k < count; k++) {
        const a = this.rnd() * Math.PI * 2;
        const d = p.radius * this.rnd();
        const out = speed * range(this.rnd, 0.4, 1);
        spawnPetal(
          world,
          this.petals,
          art.loose,
          head.position.x + Math.cos(a) * d,
          head.position.y + Math.sin(a) * d,
          a,
          p.vx * 0.5 + Math.cos(a) * out,
          p.vy * 0.5 + Math.sin(a) * out,
          1,
          1,
        );
      }
    }
  }

  /** A hard shake: everything is thrown about and petals fly. */
  private shake() {
    const now = performance.now();
    if (now - this.lastShake < 900) return;
    this.lastShake = now;
    this.shakeAmp = this.reduced ? 0 : 9;
    for (const p of this.plants) {
      if (p.growth < 0.6) continue;
      kick(p.head, range(this.rnd, -560, 560), range(this.rnd, -460, 160));
      spin(p.head, range(this.rnd, -7, 7));
      for (let i = 1; i < p.nodes.length; i++) {
        p.nodes[i].vx += range(this.rnd, -220, 220);
        p.nodes[i].vy += range(this.rnd, -120, 120);
      }
      const n = p.art.slots.length;
      this.shed(p, n ? Math.max(1, Math.round(n * 0.28)) : 3, 280);
      puff(this.motes, p.head.position.x, p.head.position.y, p.art.pollen, 5, 160);
    }
  }

  /** Puts a plant that has left the simulation's sane range back at its root. */
  private rescue(p: Plant) {
    const root = p.nodes[0];
    for (let i = 0; i < p.nodes.length; i++) {
      const nd = p.nodes[i];
      nd.x = root.x;
      nd.y = root.y - i * 0.6;
      nd.vx = nd.vy = 0;
    }
    Body.setPosition(p.head, { x: root.x, y: root.y - p.nodes.length * 0.6 });
    Body.setVelocity(p.head, { x: 0, y: 0 });
    Body.setAngularVelocity(p.head, 0);
    p.growth = 0;
  }

  // ── growing ─────────────────────────────────────────────────────────────────

  /** Grows a flower at a point: a side shoot if it is on a stem, otherwise from the ground. */
  private bloom(x: number, y: number) {
    const { w, h } = this.surface;
    if (this.plants.length >= MAX_PLANTS) {
      const parents = new Set(this.plants.map((p) => p.parent?.plant));
      const oldest = this.plants.find((p) => p.user && !parents.has(p));
      if (!oldest) return;
      this.shed(oldest, 99, 200);
      this.removePlant(oldest);
    }

    let best: { plant: Plant; node: number; d: number } | null = null;
    for (const p of this.plants) {
      if (p.parent || p.pin || p.growth < 0.9) continue;
      for (let i = 2; i < p.nodes.length; i++) {
        const d = Math.hypot(p.nodes[i].x - x, p.nodes[i].y - y);
        if (d < 24 && (!best || d < best.d)) best = { plant: p, node: i, d };
      }
    }

    if (best) {
      const a = best.plant.nodes[best.node];
      const b = best.plant.nodes[best.node - 1];
      const cross = (a.x - b.x) * (y - a.y) - (a.y - b.y) * (x - a.x);
      const small = this.rnd() < 0.5;
      this.addPlant({
        variety: small ? pick(this.rnd, [VARIETIES[0], VARIETIES[2], VARIETIES[3], VARIETIES[6]]) : BUD,
        rng: this.rnd,
        scale: small ? this.sceneScale * 0.5 : this.sceneScale,
        delay: 0,
        user: true,
        color: small ? undefined : best.plant.color,
        parent: { plant: best.plant, node: best.node },
        side: cross >= 0 ? 1 : -1,
        length: range(this.rnd, 34, 68) * this.sceneScale,
      });
      puff(this.motes, a.x, a.y, '#3C7A4F', 6, 70);
      return;
    }

    // With gravity reversed, new flowers hang from the top of the page instead.
    const anchor = this.gravity < -0.12 ? 'top' : 'bottom';
    const rootY = anchor === 'top' ? -12 : h + 12;
    const ty = anchor === 'top' ? Math.max(y, 60) : Math.min(y, h - 60);
    const reach = Math.abs(rootY - ty);
    const variety = VARIETIES[this.nextVariety++ % VARIETIES.length];
    this.addPlant({
      variety,
      rng: this.rnd,
      scale: this.sceneScale * range(this.rnd, 0.85, 1.1),
      delay: 0,
      user: true,
      anchor,
      root: { x: clamp(x + range(this.rnd, -0.2, 0.2) * reach, 10, w - 10), y: rootY },
      target: { x, y: ty },
    });
    puff(this.motes, x, y, '#3C7A4F', 5, 50);
  }

  // ── pointer input ───────────────────────────────────────────────────────────

  private headAt(x: number, y: number, pad: number): Plant | null {
    let best: Plant | null = null;
    let bestD = Infinity;
    for (let i = this.plants.length - 1; i >= 0; i--) {
      const p = this.plants[i];
      if (p.growth < 0.7) continue;
      const d = Math.hypot(p.head.position.x - x, p.head.position.y - y);
      if (d < Math.max(p.radius, 12) + pad && d < bestD) {
        best = p;
        bestD = d;
      }
    }
    return best;
  }

  private mouse(): Pointer | null {
    for (const ptr of this.pointers.values()) if (ptr.type === 'mouse') return ptr;
    return null;
  }

  private pointer(id: number, x: number, y: number, type: string): Pointer {
    let ptr = this.pointers.get(id);
    if (!ptr) {
      ptr = {
        id,
        type,
        x,
        y,
        vx: 0,
        vy: 0,
        t: performance.now(),
        down: false,
        startX: x,
        startY: y,
        startT: 0,
        moved: false,
        plant: null,
        lx: 0,
        ly: 0,
        reversals: [],
        sign: 0,
      };
      this.pointers.set(id, ptr);
    }
    return ptr;
  }

  private release(ptr: Pointer) {
    const p = ptr.plant;
    if (!p) return;
    p.grabbed = Math.max(0, p.grabbed - 1);
    ptr.plant = null;
    puff(this.motes, p.head.position.x, p.head.position.y, p.art.pollen, 8, 90 + Math.hypot(p.vx, p.vy) * 0.2);
  }

  private onDown = (id: number, x: number, y: number, type: string) => {
    const ptr = this.pointer(id, x, y, type);
    ptr.x = x;
    ptr.y = y;
    ptr.t = performance.now();
    ptr.down = true;
    ptr.startX = x;
    ptr.startY = y;
    ptr.startT = ptr.t;
    ptr.moved = false;
    ptr.reversals.length = 0;
    if (this.gusts) return;
    const p = this.headAt(x, y, type === 'mouse' ? 3 : 14);
    if (!p) return;
    const head = p.head;
    const dx = x - head.position.x;
    const dy = y - head.position.y;
    const c = Math.cos(-head.angle);
    const s = Math.sin(-head.angle);
    ptr.plant = p;
    ptr.lx = dx * c - dy * s;
    ptr.ly = dx * s + dy * c;
    p.grabbed++;
  };

  private onMove = (id: number, x: number, y: number, type: string) => {
    const ptr = this.pointer(id, x, y, type);
    const now = performance.now();
    const dt = Math.max(4, now - ptr.t) / 1000;
    const ivx = (x - ptr.x) / dt;
    const ivy = (y - ptr.y) / dt;
    ptr.vx += (ivx - ptr.vx) * 0.5;
    ptr.vy += (ivy - ptr.vy) * 0.5;
    ptr.x = x;
    ptr.y = y;
    ptr.t = now;
    if (!ptr.down) return;
    if (Math.hypot(x - ptr.startX, y - ptr.startY) > 7) ptr.moved = true;

    // Scrubbing rapidly back and forth on empty paper shakes the whole canvas.
    if (!ptr.plant && Math.abs(ivx) > 650) {
      const sign = Math.sign(ivx);
      if (sign !== ptr.sign) {
        ptr.sign = sign;
        ptr.reversals.push(now);
      }
      while (ptr.reversals.length && now - ptr.reversals[0] > 900) ptr.reversals.shift();
      if (ptr.reversals.length >= 4) {
        ptr.reversals.length = 0;
        this.shake();
      }
    }
  };

  private onUp = (id: number, x: number, y: number, cancelled: boolean) => {
    const ptr = this.pointers.get(id);
    if (!ptr) return;
    if (ptr.plant) {
      this.release(ptr);
    } else if (!cancelled && ptr.down && !ptr.moved && performance.now() - ptr.startT < 500) {
      this.bloom(x, y);
    }
    ptr.down = false;
    if (ptr.type !== 'mouse') this.pointers.delete(id);
  };

  private onLeave = (id: number) => {
    const ptr = this.pointers.get(id);
    if (ptr && !ptr.down) this.pointers.delete(id);
  };

  private onWheel = (x: number, y: number, delta: number) => {
    const p = this.headAt(x, y, 4);
    if (p) spin(p.head, clamp(-delta * 0.03, -16, 16));
  };
}
