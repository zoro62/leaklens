import type { Box } from './model';
export function analysisDimensions(width: number, height: number, maxEdge = 2400) {
  const ratio = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}
export function clampBox(b: Box, width: number, height: number, padding = 0): Box {
  const x = Math.min(width, Math.max(0, Math.floor(b.x - padding)));
  const y = Math.min(height, Math.max(0, Math.floor(b.y - padding)));
  return { x, y, width: Math.max(0, Math.min(width, Math.ceil(b.x + b.width + padding)) - x), height: Math.max(0, Math.min(height, Math.ceil(b.y + b.height + padding)) - y) };
}
export function scaleBox(b: Box, scaleX: number, scaleY = scaleX): Box { return { x: b.x * scaleX, y: b.y * scaleY, width: b.width * scaleX, height: b.height * scaleY }; }
export function polygonBox(points: { x: number; y: number }[]): Box {
  const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
  return { x, y, width: Math.max(...points.map(p => p.x)) - x, height: Math.max(...points.map(p => p.y)) - y };
}
export function distance(a: Box, b: Box) { return Math.hypot(Math.max(0, a.x - b.x - b.width, b.x - a.x - a.width), Math.max(0, a.y - b.y - b.height, b.y - a.y - a.height)); }
export function displayPoint(x: number, y: number, bounds: { left: number; top: number; width: number; height: number }, width: number, height: number) { return { x: Math.max(0, Math.min(width, (x - bounds.left) * width / bounds.width)), y: Math.max(0, Math.min(height, (y - bounds.top) * height / bounds.height)) }; }
