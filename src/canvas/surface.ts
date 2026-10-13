import { bakeBackdrop, type Backdrop } from '../scene/backdrop';

/** Owns the canvas backing store: DPR scaling, resizing and the baked landscape. */
export class Surface {
  readonly ctx: CanvasRenderingContext2D;
  w = 0;
  h = 0;
  dpr = 1;
  backdrop: Backdrop = bakeBackdrop(2, 2, 1);
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
    this.backdrop = bakeBackdrop(w, h, dpr);
    this.onResize(w, h, prevW, prevH);
  };

  destroy() {
    this.observer.disconnect();
    window.removeEventListener('resize', this.measure);
  }
}
