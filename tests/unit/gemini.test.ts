import { afterEach, describe, expect, it, vi } from 'vitest';
import { availableAdvice, reviewSummary, summarySchema, validateAdvice } from '../../src/lib/gemini';
import type { AnalysisResult, Finding } from '../../src/lib/model';

describe('Gemini privacy boundary', () => {
  it('excludes evidence, coordinates, labels and dismissed findings', () => {
    const finding = { id: 'secret-id', category: 'credential', evidence: 'DO_NOT_TRANSMIT', label: 'private label', boxes: [{ x: 11, y: 22, width: 33, height: 44 }], dismissed: false } as Finding;
    const result = { exposureGroups: [{ ruleId: 'developer', memberFindingIds: ['secret-id'] }], ocrStatus: 'complete', qrStatus: 'complete' } as AnalysisResult;
    expect(reviewSummary(result, [finding])).toEqual({ categories: [{ category: 'credential', count: 1 }], rules: ['developer'], incomplete: false });
    expect(reviewSummary(result, [{ ...finding, dismissed: true }])).toEqual({ categories: [], rules: [], incomplete: false });
  });
  it('rejects arbitrary text, duplicates and invalid counts', () => {
    const valid = { categories: [], rules: [], incomplete: false };
    expect(summarySchema.safeParse({ ...valid, evidence: 'secret' }).success).toBe(false);
    expect(summarySchema.safeParse({ ...valid, categories: [{ category: 'email', count: -1 }] }).success).toBe(false);
    expect(summarySchema.safeParse({ ...valid, rules: ['travel', 'travel'] }).success).toBe(false);
  });
  it('accepts only a complete unique ordering of applicable advice', () => {
    const ids = availableAdvice({ categories: [{ category: 'credential', count: 1 }], rules: ['developer'], incomplete: true });
    expect(validateAdvice({ orderedAdviceIds: [...ids].reverse() }, ids)).toEqual([...ids].reverse());
    for (const value of [{ orderedAdviceIds: ['final'] }, { orderedAdviceIds: ['qr', 'final'] }, { orderedAdviceIds: ids, explanation: 'safe' }, { orderedAdviceIds: [...ids, 'final'] }]) expect(() => validateAdvice(value, ids)).toThrow();
  });
});

// Import route with its alias resolved by Vitest's config.
import { POST } from '../../src/app/api/gemini/route';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const request = (value: unknown, origin = 'http://127.0.0.1:3000') => new Request('http://127.0.0.1:3000/api/gemini', { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
describe('Gemini endpoint', () => {
  it('fails closed without configuration and rejects cross-origin callers', async () => {
    vi.stubEnv('GEMINI_ENABLED', 'false'); const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect((await POST(request({}))).status).toBe(503);
    expect((await POST(request({}, 'https://example.com'))).status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('validates requests, forwards only abstract evidence, and validates provider output', async () => {
    vi.stubEnv('GEMINI_ENABLED', 'true'); vi.stubEnv('GEMINI_API_KEY', 'unit-test-key');
    const fetcher = vi.fn().mockResolvedValue(Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ orderedAdviceIds: ['final'] }) }] } }] })); vi.stubGlobal('fetch', fetcher);
    expect((await POST(request({ evidence: 'secret' }))).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
    const response = await POST(request({ categories: [], rules: [], incomplete: false }));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ orderedAdviceIds: ['final'] });
    expect(fetcher.mock.calls[0][1].headers['x-goog-api-key']).toBe('unit-test-key');
    expect(fetcher.mock.calls[0][0]).not.toContain('unit-test-key');
    fetcher.mockResolvedValueOnce(Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"orderedAdviceIds":["qr"]}' }] } }] }));
    expect((await POST(request({ categories: [], rules: [], incomplete: false }))).status).toBe(502);
  });
});
