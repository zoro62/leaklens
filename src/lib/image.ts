import { z } from 'zod';
import type { Box, Finding } from './model';
import { clampBox } from './geometry';
export const uploadSchema = z.object({ size: z.number().positive().max(15 * 1024 * 1024, 'Choose an image no larger than 15 MB.'), type: z.enum(['image/png', 'image/jpeg', 'image/webp'], { error: 'Supported formats: PNG, JPEG, and static WebP.' }) });
export type NormalImage = { canvas: HTMLCanvasElement; url: string; width: number; height: number; name: string };
export async function normalise(file: File): Promise<NormalImage> {
  const valid = uploadSchema.safeParse(file);
  if (!valid.success) throw new Error(valid.error.issues[0].message);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  const webp = ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
  if (!(file.type === 'image/png' && png || file.type === 'image/jpeg' && jpeg || file.type === 'image/webp' && webp)) throw new Error('File contents do not match a supported image format.');
  // Parse chunk headers rather than looking for arbitrary byte substrings in compressed data.
  const view = new DataView(bytes.buffer);
  if (png) for (let at = 8; at + 12 <= bytes.length;) {
    if (ascii(at + 4, at + 8) === 'acTL') throw new Error('Animated PNG is not supported. Choose a still image.');
    at += 12 + view.getUint32(at);
  }
  if (webp) for (let at = 12; at + 8 <= bytes.length;) {
    const chunk = ascii(at, at + 4), length = view.getUint32(at + 4, true);
    if (chunk === 'ANIM' || chunk === 'ANMF') throw new Error('Animated WebP is not supported. Choose a still image.');
    at += 8 + length + (length % 2);
  }
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { throw new Error('This image could not be decoded. It may be corrupt.'); }
  try {
    if (bitmap.width * bitmap.height > 25_000_000) throw new Error('Image exceeds 25 megapixels. Resize it before uploading.');
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!;
    // Flatten transparency against white to match OCR and exported appearance.
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0);
    const blob = await canvasBlob(canvas);
    return { canvas, url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height, name: file.name };
  } finally { bitmap.close(); }
}
export function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> { return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('PNG export failed.')), 'image/png')); }
export function redactionBox(finding: Finding, box: Box, width: number, height: number) {
  return clampBox(box, width, height, finding.qrId ? Math.max(12, Math.max(box.width, box.height) * .06) : finding.evidenceSource === 'manual' ? 0 : 4);
}
export async function exportImage(source: HTMLCanvasElement, findings: Finding[]) {
  const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
  const ctx = canvas.getContext('2d')!; ctx.drawImage(source, 0, 0); ctx.fillStyle = '#000';
  const selectedQr = new Set(findings.filter(f => f.selectedForRedaction && !f.dismissed && f.qrId).map(f => f.qrId));
  for (const f of findings) if (!f.dismissed && (f.selectedForRedaction || f.qrId && selectedQr.has(f.qrId))) for (const b of f.boxes) {
    const box = redactionBox(f, b, canvas.width, canvas.height);
    ctx.fillRect(box.x, box.y, box.width, box.height);
  }
  return { blob: await canvasBlob(canvas), canvas };
}
export function releaseImage(image: NormalImage | null) { if (image) { URL.revokeObjectURL(image.url); image.canvas.width = 0; image.canvas.height = 0; } }
