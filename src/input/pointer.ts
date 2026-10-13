export interface PointerHandlers {
  down(id: number, x: number, y: number, type: string): void;
  move(id: number, x: number, y: number, type: string): void;
  up(id: number, x: number, y: number, cancelled: boolean): void;
  leave(id: number): void;
  wheel(x: number, y: number, delta: number): void;
  shake(): void;
}

/**
 * Translates mouse, pen and touch input on the canvas into garden-space pointer events.
 * Each touch is tracked separately so several flowers can be held at once.
 */
export function bindPointer(canvas: HTMLCanvasElement, h: PointerHandlers): () => void {
  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvas.getBoundingClientRect();
    // Divide out any CSS scaling so positions stay in the canvas's own coordinates.
    const sx = r.width ? canvas.offsetWidth / r.width : 1;
    const sy = r.height ? canvas.offsetHeight / r.height : 1;
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
  };

  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Capture can fail if the pointer is already gone; dragging still works without it.
    }
    const p = local(e);
    h.down(e.pointerId, p.x, p.y, e.pointerType);
  };
  const onMove = (e: PointerEvent) => {
    const p = local(e);
    h.move(e.pointerId, p.x, p.y, e.pointerType);
  };
  const onUp = (e: PointerEvent) => {
    const p = local(e);
    h.up(e.pointerId, p.x, p.y, e.type === 'pointercancel');
  };
  const onLeave = (e: PointerEvent) => h.leave(e.pointerId);
  const onWheel = (e: WheelEvent) => {
    const p = local(e);
    h.wheel(p.x, p.y, e.deltaY);
  };
  const onContext = (e: Event) => e.preventDefault();

  // Shaking the device itself scatters petals too.
  let lastShake = 0;
  const onMotion = (e: DeviceMotionEvent) => {
    const a = e.acceleration;
    if (!a) return;
    const mag = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0);
    const now = performance.now();
    if (mag > 22 && now - lastShake > 1200) {
      lastShake = now;
      h.shake();
    }
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('wheel', onWheel, { passive: true });
  canvas.addEventListener('contextmenu', onContext);
  window.addEventListener('devicemotion', onMotion);

  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    canvas.removeEventListener('pointerleave', onLeave);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('contextmenu', onContext);
    window.removeEventListener('devicemotion', onMotion);
  };
}
