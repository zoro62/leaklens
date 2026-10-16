import { availableAdvice, summarySchema, validateAdvice } from '@/lib/gemini';
import { geminiError } from '@/lib/gemini-errors';

export const runtime = 'nodejs';
let calls: number[] = [];
let running = false;
const reply = (error: string, status: number) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  // Next may normalise request.url to localhost; validate the actual Host/Origin pair.
  let url: URL;
  try { url = new URL(`http://${request.headers.get('host') || new URL(request.url).host}`); }
  catch { return reply('Invalid local host.', 403); }
  // Local-only feature: never expose an unrestricted paid endpoint on a public deployment.
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || request.headers.get('origin') !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site' || request.headers.has('forwarded') || (request.headers.has('x-forwarded-host') && request.headers.get('x-forwarded-host') !== url.host) || (request.headers.has('x-forwarded-for') && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.headers.get('x-forwarded-for')!))) return reply('Gemini coaching is available only on a directly connected local server.', 403);
  if (process.env.GEMINI_ENABLED !== 'true' || !process.env.GEMINI_API_KEY?.trim()) return reply('Gemini is not configured. Add GEMINI_API_KEY and GEMINI_ENABLED=true to .env.local, then restart the server. Local analysis remains available.', 503);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return reply('Expected JSON.', 415);
  let summary;
  try {
    const reader = request.body?.getReader();
    if (!reader) return reply('Missing summary.', 400);
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 4096) { await reader.cancel(); return reply('Summary too large.', 413); } chunks.push(part.value); } } finally { reader.releaseLock(); }
    const buffer = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
    summary = summarySchema.parse(JSON.parse(new TextDecoder().decode(buffer)));
  } catch { return reply('Invalid abstract summary.', 400); }
  calls = calls.filter(t => t > Date.now() - 3600000);
  if (running || calls.length >= 10) return reply('Local Gemini limit reached. Try later; deterministic advice remains available.', 429);
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  if (!/^gemini-[a-z0-9.-]{1,64}$/.test(model)) return reply('Invalid server model configuration.', 503);
  const available = availableAdvice(summary);
  running = true; calls.push(Date.now());
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY }, signal: AbortSignal.timeout(20000), cache: 'no-store',
      body: JSON.stringify({ contents: [{ parts: [{ text: `Rank these review advice IDs by practical priority for the abstract evidence summary. Return every allowed ID exactly once. Do not add findings. Allowed IDs: ${JSON.stringify(available)}. Summary: ${JSON.stringify(summary)}` }] }], generationConfig: { maxOutputTokens: 1024, responseFormat: { text: { mimeType: 'application/json', schema: { type: 'object', properties: { orderedAdviceIds: { type: 'array', items: { type: 'string', enum: available } } }, required: ['orderedAdviceIds'], additionalProperties: false } } } } }),
    });
    if (!response.ok) {
      let reason: string | undefined;
      const reader = response.body?.getReader();
      if (reader) {
        let body = '', size = 0;
        const decoder = new TextDecoder();
        try {
          while (true) {
            const part = await reader.read(); if (part.done) break;
            size += part.value.length; if (size > 8192) { await reader.cancel(); break; }
            body += decoder.decode(part.value, { stream: true });
          }
          const data = JSON.parse(body + decoder.decode());
          reason = data.error?.details?.find((detail: { reason?: unknown }) => typeof detail.reason === 'string')?.reason;
        } catch { /* Status-based advice still works for malformed provider errors. */ }
        finally { reader.releaseLock(); }
      }
      return reply(geminiError(response.status, reason), 502);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Empty response');
    const decoder = new TextDecoder(); let text = '', bytes = 0;
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        bytes += part.value.length;
        if (bytes > 32768) { await reader.cancel(); throw new Error('Response too large'); }
        text += decoder.decode(part.value, { stream: true });
      }
      text += decoder.decode();
    } finally { reader.releaseLock(); }
    const data = JSON.parse(text), candidate = data.candidates?.[0];
    if (candidate?.finishReason !== 'STOP') throw new Error('Incomplete response');
    const output = candidate.content?.parts?.filter((p: { thought?: boolean; text?: string }) => !p.thought && typeof p.text === 'string').map((p: { text: string }) => p.text).join('');
    return Response.json({ orderedAdviceIds: validateAdvice(JSON.parse(output), available) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return reply('Gemini timed out or returned an invalid response. Local explanations are unchanged.', 502); }
  finally { running = false; }
}
