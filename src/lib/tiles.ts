import type { AnalysisResult, Box, Finding } from './model';

export function planTiles(width: number, height: number, size = 1800, overlap = 240, maxTiles = 24): Box[] {
  if (width <= 0 || height <= 0 || size <= overlap || overlap < 0) throw new Error('Invalid tile dimensions.');
  const positions = (length: number) => {
    const last = Math.max(0, length - size), starts = [0];
    for (let at = size - overlap; at < last; at += size - overlap) { starts.push(at); if (starts.length > maxTiles) throw new Error('This image needs too many tiles. Crop it into smaller screenshots for thorough scanning.'); }
    if (last) starts.push(last);
    return starts;
  };
  const xs = positions(width), ys = positions(height);
  if (xs.length * ys.length > maxTiles) throw new Error('This image needs too many tiles. Crop it into smaller screenshots for thorough scanning.');
  return ys.flatMap(y => xs.map(x => ({ x, y, width: Math.min(size, width - x), height: Math.min(size, height - y) })));
}
function overlaps(a: Box, b: Box) {
  const intersection = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return intersection / Math.max(1, Math.min(a.width * a.height, b.width * b.height)) > .45;
}
const textKey = (value: string) => value.replace(/\s+/g, ' ').trim();
// Coordinates are always original pixels. Matching requires both the same
// evidence and overlapping regions, so identical data elsewhere stays separate.
export function mergePass(findings: Finding[], pass: AnalysisResult, offset: { x: number; y: number }, prefix: string) {
  const qrIds = new Map<string, string>();
  const candidates = pass.findings.map(f => ({ ...f, id: `${prefix}-${f.id}`, qrId: f.qrId ? `${prefix}-${f.qrId}` : undefined, relatedGroupIds: [], boxes: f.boxes.map(b => ({ ...b, x: b.x + offset.x, y: b.y + offset.y })) }));
  const same = (a: Finding, b: Finding) => a.category === b.category && a.evidenceSource === b.evidenceSource && textKey(a.evidence) === textKey(b.evidence) && a.boxes.some(x => b.boxes.some(y => overlaps(x, y)));
  for (const code of candidates.filter(f => f.category === 'qr')) {
    const existing = findings.find(f => same(f, code));
    if (existing && code.qrId && existing.qrId) qrIds.set(code.qrId, existing.qrId);
  }
  for (const f of candidates) {
    if (f.qrId) f.qrId = qrIds.get(f.qrId) || f.qrId;
    const existing = findings.find(old => same(old, f));
    if (existing) { existing.boxes = f.boxes; existing.selectedForRedaction ||= f.selectedForRedaction; }
    else findings.push(f);
  }
}
