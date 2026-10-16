'use client';
import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { advice, availableAdvice, validateAdvice, type AdviceId, type ReviewSummary } from '@/lib/gemini';

export default function GeminiCoach({ summary, disabled }: { summary: ReviewSummary; disabled: boolean }) {
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [ordered, setOrdered] = useState<AdviceId[] | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function generate() {
    if (!consent || busy || disabled) return;
    const current = new AbortController(); controller.current = current; setBusy(true); setError('');
    const timeout = setTimeout(() => current.abort(), 25000);
    try {
      const response = await fetch('/api/gemini', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(summary), signal: current.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Gemini unavailable.');
      if (!current.signal.aborted) setOrdered(validateAdvice(data, availableAdvice(summary)));
    } catch (e) { if (!current.signal.aborted) setError(e instanceof Error ? e.message : 'Gemini unavailable.'); else setError('Request cancelled or timed out. Local explanations are unchanged.'); }
    finally { clearTimeout(timeout); setBusy(false); }
  }
  return <section className="gemini-coach" aria-label="Gemini review coach">
    <h3><Sparkles size={17} /> Gemini review coach <small>Optional</small></h3>
    <p>Gemini prioritises grounded review tips. LeakLens supplies the wording; AI cannot change findings or redactions.</p>
    <p>Only category counts, relationship rule IDs and scan completeness go to Google. No image, detected values, OCR text or QR payload is sent.</p>
    <details><summary>See exactly what will be sent</summary><pre>{JSON.stringify(summary, null, 2)}</pre></details>
    <label className="gemini-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} /> I agree to send this abstract summary to Google Gemini.</label>
    <button type="button" disabled={!consent || busy || disabled} onClick={generate}>{busy ? 'Asking Gemini…' : 'Prioritise review with Gemini'}</button>
    <div role="status">{error}</div>
    {ordered && <><p>Gemini-prioritised plan · review suggestions, not new detections</p><ol>{ordered.map(id => <li key={id}><strong>{advice[id].title}</strong><p>{advice[id].text}</p></li>)}</ol></>}
  </section>;
}
