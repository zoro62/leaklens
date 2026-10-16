import type { AnalysisResult, ScanMode, Word } from './model';
import { detect, groupExposures, qrFinding } from './detectors';
import { analysisDimensions, polygonBox, scaleBox } from './geometry';
import { canvasBlob } from './image';
import { mergePass, planTiles } from './tiles';

export type ScanControl = { cancelled: boolean; worker?: Worker; qrWorker?: Worker; cancel?: () => void };
export function cancelScan(c: ScanControl | null) { if (c) { c.cancelled = true; c.cancel?.(); c.worker?.terminate(); c.qrWorker?.terminate(); } }
async function analysePass(source: HTMLCanvasElement, control: ScanControl, progress: (message: string) => void): Promise<AnalysisResult> {
  const started = performance.now(), warnings: string[] = [];
  const dimensions = analysisDimensions(source.width, source.height);
  const small = document.createElement('canvas'); small.width = dimensions.width; small.height = dimensions.height;
  small.getContext('2d')!.drawImage(source, 0, 0, small.width, small.height);
  const sx = source.width / small.width, sy = source.height / small.height;
  const result: AnalysisResult = { width: source.width, height: source.height, findings: [], exposureGroups: [], ocrStatus: 'failed', qrStatus: 'failed', warnings, timing: { totalMs: 0 } };
  let rejectCancel: (e: Error) => void = () => {};
  const rejectTasks = new Set<(e: Error) => void>();
  const cancelled = new Promise<never>((_, reject) => { rejectCancel = reject; });
  control.cancel = () => { const error = new Error('Cancelled'); rejectCancel(error); rejectTasks.forEach(reject => reject(error)); rejectTasks.clear(); };
  const work = Promise.allSettled([
    (async () => {
      progress('Reading English text locally…');
      if (control.cancelled) throw new Error('Cancelled');
      // An owned outer worker also bounds Tesseract's startup lifetime. Terminating
      // it disposes its nested engine worker, including failed initialisations.
      const worker = new Worker(new URL('./ocr.worker.ts', import.meta.url)); control.worker = worker;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const blob = await canvasBlob(small);
        if (control.cancelled) throw new Error('Cancelled');
        const { text, words } = await new Promise<{ text: string; words: Word[] }>((resolve, reject) => {
          rejectTasks.add(reject);
          timer = setTimeout(() => reject(new Error('OCR timed out')), 90_000);
          worker.onmessage = event => { if (event.data.progress !== undefined) { if (!control.cancelled) progress(`Reading text · ${event.data.progress}%`); } else if (event.data.error) reject(new Error('OCR failed')); else resolve(event.data); };
          worker.onerror = () => reject(new Error('OCR worker unavailable'));
          worker.postMessage({ blob, origin: location.origin });
        });
        result.findings.push(...detect({ text, words: words.map(w => ({ ...w, box: scaleBox(w.box, sx, sy) })), source: 'OCR' })); result.ocrStatus = 'complete';
        if (!text.trim()) warnings.push('OCR completed but found no readable English text. This is not a clean-image guarantee.');
      } finally { clearTimeout(timer); worker.terminate(); control.worker = undefined; }
    })(),
    (async () => {
      const worker = new Worker(new URL('./qr.worker.ts', import.meta.url)); control.qrWorker = worker;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const pixels = small.getContext('2d')!.getImageData(0, 0, small.width, small.height);
        const codes = await new Promise<{ text: string; points: { x: number; y: number }[] }[]>((resolve, reject) => {
          rejectTasks.add(reject);
          timer = setTimeout(() => reject(new Error('QR timed out')), 30_000);
          worker.onmessage = event => event.data.error ? reject(new Error('QR decoder failed')) : resolve(event.data.codes);
          worker.onerror = () => reject(new Error('QR worker unavailable'));
          worker.postMessage({ pixels, origin: location.origin }, [pixels.data.buffer]);
        });
        for (const [i, code] of codes.entries()) {
          const box = scaleBox(polygonBox(code.points), sx, sy), id = `qr-${i}`;
          result.findings.push(qrFinding(code.text, box, id), ...detect({ text: code.text, words: [], source: 'QR', qrBox: box, qrId: id }));
        }
        result.qrStatus = 'complete';
      } finally { clearTimeout(timer); worker.terminate(); control.qrWorker = undefined; }
    })(),
  ]);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timeout = setTimeout(() => { cancelScan(control); reject(new Error('Analysis timed out. Try a smaller image or reload the local assets.')); }, 120_000); });
  try {
    const statuses = await Promise.race([work, cancelled, deadline]);
    if (control.cancelled) throw new Error('Cancelled');
    if (statuses[0].status === 'rejected') warnings.push('OCR failed. Text could not be checked. Review manually or retry.');
    if (statuses[1].status === 'rejected') warnings.push('QR decoding failed. Encoded content could not be checked.');
    const selectedQr = new Set(result.findings.filter(f => f.qrId && f.selectedForRedaction).map(f => f.qrId));
    result.findings.forEach(f => { if (f.qrId && selectedQr.has(f.qrId)) f.selectedForRedaction = true; });
    result.exposureGroups = groupExposures(result.findings); result.timing.totalMs = Math.round(performance.now() - started);
    return result;
  } finally { clearTimeout(timeout); rejectTasks.clear(); small.width = 0; small.height = 0; }
}

export async function analyse(source: HTMLCanvasElement, control: ScanControl, progress: (message: string) => void, options: { mode?: ScanMode } = {}): Promise<AnalysisResult> {
  if (options.mode !== 'thorough') return { ...await analysePass(source, control, progress), scanMode: 'standard' };
  const tiles = planTiles(source.width, source.height), started = performance.now();
  const result = await analysePass(source, control, m => progress(`Overview · ${m}`));
  result.scanMode = 'thorough'; result.tilesTotal = tiles.length; result.tilesCompleted = 0;
  // A small image is already scanned at original resolution by the overview.
  if (tiles.length === 1) { result.tilesCompleted = 1; return result; }
  const overview = { ...result, findings: result.findings }; result.findings = [];
  mergePass(result.findings, overview, { x: 0, y: 0 }, 'overview');
  for (const [i, tile] of tiles.entries()) {
    if (control.cancelled) throw new Error('Cancelled');
    if (performance.now() - started > 180_000) {
      result.warnings.push('Thorough scanning reached its time budget. Some tiles were not checked; review manually or crop the image.');
      result.ocrStatus = 'failed'; result.qrStatus = 'failed'; break;
    }
    const canvas = document.createElement('canvas'); canvas.width = tile.width; canvas.height = tile.height;
    canvas.getContext('2d')!.drawImage(source, tile.x, tile.y, tile.width, tile.height, 0, 0, tile.width, tile.height);
    try {
      const pass = await analysePass(canvas, control, m => progress(`Thorough tile ${i + 1}/${tiles.length} · ${m}`));
      if (control.cancelled) throw new Error('Cancelled');
      mergePass(result.findings, pass, tile, `tile-${i}`);
      if (pass.ocrStatus === 'failed') result.ocrStatus = 'failed';
      if (pass.qrStatus === 'failed') result.qrStatus = 'failed';
      result.warnings.push(...pass.warnings.map(w => `Tile ${i + 1}: ${w}`));
      result.tilesCompleted = i + 1;
    } finally { canvas.width = 0; canvas.height = 0; }
  }
  const selectedQr = new Set(result.findings.filter(f => f.qrId && f.selectedForRedaction).map(f => f.qrId));
  result.findings.forEach(f => { if (f.qrId && selectedQr.has(f.qrId)) f.selectedForRedaction = true; });
  result.exposureGroups = groupExposures(result.findings); result.timing.totalMs = Math.round(performance.now() - started);
  return result;
}
