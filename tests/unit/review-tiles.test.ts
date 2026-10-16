import { describe, expect, it } from 'vitest';
import type { AnalysisResult, Finding } from '../../src/lib/model';
import { qrFinding } from '../../src/lib/detectors';
import { batchSelection } from '../../src/lib/review';
import { mergePass, planTiles } from '../../src/lib/tiles';
const finding = (id: string, category: Finding['category'], selected = false): Finding => ({ id, category, selectedForRedaction: selected, dismissed: false, detectorId: 'test', label: id, evidence: 'synthetic', boxes: [{ x: 10, y: 20, width: 100, height: 30 }], relatedGroupIds: [], evidenceSource: 'OCR', severity: category === 'context' ? 'context' : 'medium', confidenceBand: 'strong', observation: 'direct', explanation: 'Test fixture' });
const pass = (findings: Finding[]): AnalysisResult => ({ width: 1800, height: 1800, findings, exposureGroups: [], ocrStatus: 'complete', qrStatus: 'complete', warnings: [], timing: { totalMs: 1 } });
describe('review selection policy', () => {
  it('preset suggestions add coverage without removing previous selections', () => {
    const input = [finding('url', 'context', true), finding('email', 'email')];
    const output = batchSelection(input, { type: 'categories', categories: ['email'] });
    expect(output.map(f => f.selectedForRedaction)).toEqual([true, true]); expect(input[1].selectedForRedaction).toBe(false);
  });
  it('contact batch selections preserve dismissed findings and manual choices', () => {
    const input = [finding('email', 'email'), { ...finding('dismissed', 'phone'), dismissed: true }, { ...finding('manual', 'manual', true), evidenceSource: 'manual' as const }];
    const output = batchSelection(input, { type: 'categories', categories: ['email', 'phone', 'address'] });
    expect(output.map(f => f.selectedForRedaction)).toEqual([true, false, true]); expect(output[1].dismissed).toBe(true);
  });
  it('defaults reset context without removing manual rectangles', () => {
    const output = batchSelection([finding('url', 'context', true), finding('email', 'email'), { ...finding('manual', 'manual', true), evidenceSource: 'manual' as const }], { type: 'defaults' });
    expect(output.map(f => f.selectedForRedaction)).toEqual([false, true, true]);
  });
  it('any selected QR child selects all visible findings for that QR only', () => {
    const output = batchSelection([{ ...finding('email', 'email'), qrId: 'a' }, { ...finding('travel', 'travel'), qrId: 'a' }, { ...finding('other', 'travel'), qrId: 'b' }], { type: 'categories', categories: ['email'] });
    expect(output.map(f => f.selectedForRedaction)).toEqual([true, true, false]);
    expect(batchSelection(output, { type: 'qr' }).every(f => f.selectedForRedaction)).toBe(true);
  });
});
describe('full-resolution tile planning and merging', () => {
  it('covers image edges with overlapping original-resolution tiles and no gaps', () => {
    const tiles = planTiles(4000, 2400); expect(tiles).toHaveLength(6);
    for (let y = 0; y < 2400; y += 100) for (let x = 0; x < 4000; x += 100) expect(tiles.some(b => b.x <= x && x < b.x + b.width && b.y <= y && y < b.y + b.height)).toBe(true);
    expect(tiles.at(-1)).toEqual({ x: 2200, y: 600, width: 1800, height: 1800 });
  });
  it('does not add redundant tiles to small images and bounds extreme aspect ratios', () => {
    expect(planTiles(1200, 600)).toEqual([{ x: 0, y: 0, width: 1200, height: 600 }]);
    expect(() => planTiles(100000, 100)).toThrow('too many tiles'); expect(() => planTiles(100, 100, 200, 200)).toThrow('Invalid');
  });
  it('restores crop offsets and merges the same text only when image evidence overlaps', () => {
    const findings: Finding[] = [];
    mergePass(findings, pass([finding('first', 'email')]), { x: 1560, y: 600 }, 'tile0');
    expect(findings[0].boxes[0]).toEqual({ x: 1570, y: 620, width: 100, height: 30 });
    mergePass(findings, pass([finding('again', 'email')]), { x: 1562, y: 600 }, 'tile1'); expect(findings).toHaveLength(1);
    mergePass(findings, pass([finding('elsewhere', 'email')]), { x: 0, y: 0 }, 'tile2'); expect(findings).toHaveLength(2);
  });
  it('deduplicates QR parents and maps new payload findings onto the existing QR identity', () => {
    const code = qrFinding('Synthetic QR payload', { x: 20, y: 20, width: 300, height: 300 }, 'qr0');
    const findings: Finding[] = [];
    mergePass(findings, pass([code]), { x: 0, y: 0 }, 'overview');
    mergePass(findings, pass([code, { ...finding('child', 'email'), evidenceSource: 'QR', qrId: 'qr0', boxes: code.boxes }]), { x: 0, y: 0 }, 'tile');
    expect(findings.filter(f => f.category === 'qr')).toHaveLength(1);
    expect(findings[0].qrId).toBe(findings[1].qrId);
  });
});
