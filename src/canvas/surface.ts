import { mulberry32, range, TAU } from '../core/math';
import { PALETTE } from '../core/color';

/** Owns the canvas backing store: DPR scaling, resizing and the paper background. */
export class Surface {
  readonly ctx: CanvasRenderingContext2D;
  w = 0;
  h = 0;
  dpr = 1;
  paper: HTMLCanvasElement = document.createElement('canvas');
  private observer: ResizeObserver;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private onResize: (w: number, h: number, prevW: number, prevH: number) => void,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.observer = new ResizeObserver(this.measure);
    this.observer.observe(canvas);
    window.addEventListener('resize', this.measure);
  }

  measure = () => {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    const prevW = this.w;
    const prevH = this.h;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.paper = makePaper(w, h, dpr);
    this.onResize(w, h, prevW, prevH);
  };

  destroy() {
    this.observer.disconnect();
    window.removeEventListener('resize', this.measure);
  }
}

/** Ivory paper with faint stains, fibres and grain, baked once per size. */
function makePaper(w: number, h: number, dpr: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const c = canvas.getContext('2d')!;
  const rng = mulberry32(77031);
  c.scale(dpr, dpr);
  c.fillStyle = PALETTE.paper;
  c.fillRect(0, 0, w, h);

  const big = Math.max(w, h);
  const stains: [number, number, number, number][] = [
    [0.04, 0.1, 0.34, 0.2],
    [0.2, 0.86, 0.3, 0.16],
    [0.88, 0.2, 0.42, 0.12],
    [0.62, 0.62, 0.36, 0.1],
    [0.4, 0.3, 0.26, 0.08],
  ];
  for (const [fx, fy, fr, a] of stains) {
    const x = fx * w;
    const y = fy * h;
    const r = fr * big;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(233,214,172,${a})`);
    g.addColorStop(1, 'rgba(233,214,172,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  }

  const v = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, big * 0.75);
  v.addColorStop(0, 'rgba(200,172,120,0)');
  v.addColorStop(1, 'rgba(200,172,120,0.13)');
  c.fillStyle = v;
  c.fillRect(0, 0, w, h);

  c.lineCap = 'round';
  const fibres = Math.round((w * h) / 5200);
  for (let i = 0; i < fibres; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const a = rng() * TAU;
    const len = range(rng, 4, 20);
    c.strokeStyle = rng() < 0.7 ? 'rgba(120,96,58,0.05)' : 'rgba(255,255,255,0.22)';
    c.lineWidth = range(rng, 0.3, 0.8);
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(
      x + Math.cos(a) * len * 0.5 + range(rng, -3, 3),
      y + Math.sin(a) * len * 0.5 + range(rng, -3, 3),
      x + Math.cos(a) * len,
      y + Math.sin(a) * len,
    );
    c.stroke();
  }

  const tile = document.createElement('canvas');
  tile.width = tile.height = 192;
  const tc = tile.getContext('2d')!;
  const img = tc.createImageData(192, 192);
  for (let i = 0; i < img.data.length; i += 4) {
    const dark = rng() < 0.62;
    const a = Math.pow(rng(), 2.2) * (dark ? 22 : 40);
    img.data[i] = dark ? 72 : 255;
    img.data[i + 1] = dark ? 54 : 255;
    img.data[i + 2] = dark ? 30 : 250;
    img.data[i + 3] = a;
  }
  tc.putImageData(img, 0, 0);
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = c.createPattern(tile, 'repeat')!;
  c.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}
