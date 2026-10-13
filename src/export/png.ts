import { PALETTE } from '../core/color';

/** Copies the canvas, signs it quietly in the corner and downloads it as a PNG. */
export async function saveCanvasPng(source: HTMLCanvasElement, dpr: number, flowers: number): Promise<void> {
  const out = document.createElement('canvas');
  out.width = source.width;
  out.height = source.height;
  const c = out.getContext('2d')!;
  c.drawImage(source, 0, 0);

  c.scale(dpr, dpr);
  const h = source.height / dpr;
  c.fillStyle = PALETTE.ink;
  c.globalAlpha = 0.55;
  c.font = '600 9px ui-sans-serif, "Helvetica Neue", Arial, sans-serif';
  c.textBaseline = 'alphabetic';
  let x = 22;
  for (const ch of 'LOOSE PETALS') {
    c.fillText(ch, x, h - 20);
    x += c.measureText(ch).width + 2.6;
  }
  c.globalAlpha = 0.4;
  c.font = 'italic 10px "Iowan Old Style", Palatino, Georgia, serif';
  c.fillText(`${flowers} flowers`, x + 8, h - 20);

  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  link.href = url;
  link.download = `loose-petals-${stamp}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
