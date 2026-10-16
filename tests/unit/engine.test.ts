import { describe, expect, it } from 'vitest';
import { detect, groupExposures, masked, qrFinding } from '../../src/lib/detectors';
import { analysisDimensions, clampBox, displayPoint, polygonBox, scaleBox } from '../../src/lib/geometry';
import type { Evidence } from '../../src/lib/model';
import { uploadSchema } from '../../src/lib/image';

function evidence(text: string): Evidence {
  const words = [...text.matchAll(/\S+/g)].map(m => ({ text: m[0], start: m.index!, end: m.index! + m[0].length, block: 0, box: { x: (m.index! % 80) * 8, y: Math.floor(m.index! / 80) * 30, width: m[0].length * 8, height: 22 } }));
  return { text, words, source: 'OCR' };
}
const categories = (text: string) => detect(evidence(text)).map(f => f.category);
describe('detectors', () => {
  it('finds a hidden-label railway PNR and train number/name with ticket context', () => {
    const found = detect(evidence('Electronic Reservation Slip (ERS)\nPassenger Details\n1234500000 12345/EXAMPLE EXPRESS\nBooking Status'));
    expect(found.find(f => f.detectorId === 'railway-pnr')).toMatchObject({ selectedForRedaction: true, observation: 'inference', confidenceBand: 'moderate' });
    expect(found.find(f => f.detectorId === 'train-number')).toMatchObject({ selectedForRedaction: true, observation: 'direct', severity: 'medium' });
  });
  it('does not label arbitrary numbers or slash pairs as ticket details without railway cues', () => {
    expect(detect(evidence('Build 1234500000\n12345/EXAMPLE EXPRESS')).map(f => f.detectorId)).toEqual([]);
    expect(detect(evidence('IRCTC public update 1234500000')).map(f => f.detectorId)).toEqual([]);
  });
  it('avoids duplicate labelled PNRs and does not infer a labelled contact as PNR', () => {
    const found = detect(evidence('IRCTC\nPassenger Details\nPNR: 1234500000\nContact: 9876543210\nTransaction ID: 1234500000123'));
    expect(found.filter(f => f.category === 'booking')).toHaveLength(1);
  });
  it('finds ordinary email and separates confidence from severity', () => {
    const f = detect(evidence('Contact alex@example.com'))[0]; expect(f.category).toBe('email'); expect(f.confidenceBand).toBe('strong'); expect(f.severity).toBe('medium'); expect(f.observation).toBe('direct');
  });
  it('detects labelled Indian and explicit international numbers', () => {
    expect(categories('Mobile: 98765 43210')).toContain('phone'); expect(categories('Contact: +91 98765-43210')).toContain('phone'); expect(categories('+1 202 555 0123')).toContain('phone');
  });
  it('does not classify harmless long numbers as phones or IDs', () => {
    expect(categories('Build 9876543210 processed 48291027 rows in 1240 ms')).toEqual([]); expect(categories('DEMO7X ABCD12345')).toEqual([]);
  });
  it('recognises contextual assignments, provider shapes and JWTs', () => {
    expect(categories('API_KEY=DEMO_ONLY_NOT_A_REAL_KEY_7H2K9M')).toEqual(['credential']);
    expect(categories('ghp_' + 'a'.repeat(36))).toEqual(['credential']);
    expect(categories('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkZW1vIn0.signature_demo_only_12345')).toEqual(['credential']);
  });
  it('does not manufacture credentials from empty values or placeholders', () => {
    expect(categories('TOKEN= PASSWORD=short API_KEY=xxxxxxxx SECRET=your_key_here PASSWORD=changeme')).toEqual([]);
  });
  it('deduplicates overlapping credential rules', () => {
    expect(detect(evidence('TOKEN=ghp_' + 'a'.repeat(36))).filter(f => f.category === 'credential')).toHaveLength(1);
  });
  it('requires labels for booking/order/address and marks address as inference', () => {
    expect(categories('PNR: DEMO7X Order ID: DEMO-48291')).toEqual(['booking', 'order']);
    const f = detect(evidence('Delivery address: 42 Example Lane, Demo City'))[0]; expect(f.category).toBe('address'); expect(f.observation).toBe('inference'); expect(f.confidenceBand).toBe('moderate');
  });
  it('treats URL and private IP as context only', () => {
    const found = detect(evidence('https://example.com 10.0.0.1 999.1.1.1')); expect(found).toHaveLength(2); expect(found.every(f => f.severity === 'context' && !f.selectedForRedaction)).toBe(true);
  });
  it('maps spans across whitespace to individual word boxes', () => {
    const f = detect(evidence('Order\nreference:  DEMO-48291'))[0]; expect(f.boxes).toHaveLength(3);
  });
  it('handles empty and malformed strings without findings', () => { for (const t of ['', '\u0000', '@..', 'http://', 'API_KEY=***', 'PNR: ?']) expect(detect(evidence(t))).toEqual([]); });
  it('uses the entire QR for every payload entity', () => {
    const box = { x: 100, y: 120, width: 300, height: 300 }; const f = detect({ text: 'alex@example.com', words: [], source: 'QR', qrBox: box, qrId: 'qr-0' })[0]; expect(f.boxes).toEqual([box]); expect(f.qrId).toBe('qr-0'); expect(qrFinding('WIFI:T:WPA;S:Demo;P:12345678;;', box, 'qr-1').label).toContain('Wi-Fi');
  });
  it('masks default previews', () => { expect(masked('alex@example.com')).not.toContain('example'); });
});
describe('relationship rules', () => {
  it('links a possible credential and nearby service without unsupported impacts', () => {
    const findings = detect(evidence('API_KEY=DEMO_ONLY_123456789\nhttps://api.example.test')); const g = groupExposures(findings); expect(g).toHaveLength(1); expect(g[0].ruleId).toBe('developer'); expect(g[0].memberFindingIds).toHaveLength(2); expect(findings.every(f => f.relatedGroupIds.length === 1)).toBe(true); expect(g[0].limitations).toContain('does not establish');
  });
  it('does not connect distant regions', () => {
    const findings = detect(evidence('API_KEY=DEMO_ONLY_123456789 https://api.example.test')); findings[1].boxes = [{ x: 4000, y: 4000, width: 120, height: 30 }]; expect(groupExposures(findings)).toEqual([]);
  });
  it('requires all three delivery ingredients', () => {
    expect(groupExposures(detect(evidence('Address: 42 Example Lane\nContact: alex@example.com')))).toEqual([]);
    expect(groupExposures(detect(evidence('Address: 42 Example Lane\nContact: alex@example.com\nOrder ID: DEMO-48291')))[0].ruleId).toBe('delivery');
  });
  it('links travel labels with reference and QR evidence', () => {
    const f = detect(evidence('Boarding pass\nPNR: DEMO7X')); expect(groupExposures(f)[0].ruleId).toBe('travel');
  });
  it('merges travel groups sharing the same reference, without counting it twice', () => {
    const f = detect(evidence('Boarding pass\nFlight: LL123\nPNR: DEMO7X')); const groups = groupExposures(f); expect(groups).toHaveLength(1); expect(groups[0].memberFindingIds).toHaveLength(3);
  });
});
describe('coordinates and upload boundaries', () => {
  it('never rounds a narrow valid image down to a zero-sized analysis canvas', () => {
    expect(analysisDimensions(1, 10000)).toEqual({ width: 1, height: 2400 });
    expect(analysisDimensions(10000, 1)).toEqual({ width: 2400, height: 1 });
  });
  it('restores downscaled coordinates independently on both axes', () => { expect(scaleBox({ x: 10, y: 20, width: 30, height: 40 }, 2, 3)).toEqual({ x: 20, y: 60, width: 60, height: 120 }); });
  it('maps resized display coordinates and clamps pointer to image', () => { expect(displayPoint(150, 250, { left: 50, top: 50, width: 200, height: 400 }, 1200, 2400)).toEqual({ x: 600, y: 1200 }); });
  it('bounds a rotated QR and pads it inside the image', () => { const b = polygonBox([{ x: 20, y: 5 }, { x: 45, y: 20 }, { x: 30, y: 45 }, { x: 5, y: 30 }]); expect(clampBox(b, 48, 48, 12)).toEqual({ x: 0, y: 0, width: 48, height: 48 }); });
  it('clamps completely out-of-image rectangles to empty image-edge regions', () => { expect(clampBox({ x: 1000, y: 1000, width: 10, height: 10 }, 100, 100)).toEqual({ x: 100, y: 100, width: 0, height: 0 }); });
  it('rejects oversized files, SVG and animated MIME types', () => { expect(uploadSchema.safeParse({ size: 16 * 1024 * 1024, type: 'image/png' }).success).toBe(false); for (const type of ['image/svg+xml', 'image/gif']) expect(uploadSchema.safeParse({ size: 400, type }).success).toBe(false); });
});
