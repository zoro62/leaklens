import { z } from 'zod';
import type { AnalysisResult, Finding } from './model';

const category = z.enum(['email', 'phone', 'credential', 'booking', 'order', 'address', 'context', 'travel', 'qr', 'manual']);
export const summarySchema = z.object({
  categories: z.array(z.object({ category, count: z.number().int().min(1).max(5000) }).strict()).max(10),
  rules: z.array(z.enum(['developer', 'travel', 'delivery'])).max(3),
  incomplete: z.boolean(),
}).strict().refine(s => new Set(s.categories.map(c => c.category)).size === s.categories.length && new Set(s.rules).size === s.rules.length);
export type ReviewSummary = z.infer<typeof summarySchema>;
export function reviewSummary(result: AnalysisResult, findings: Finding[]): ReviewSummary {
  const active = findings.filter(f => !f.dismissed), ids = new Set(active.map(f => f.id));
  const counts = new Map<Finding['category'], number>();
  active.forEach(f => counts.set(f.category, (counts.get(f.category) || 0) + 1));
  return summarySchema.parse({ categories: [...counts].map(([category, count]) => ({ category, count })), rules: [...new Set(result.exposureGroups.filter(g => g.memberFindingIds.every(id => ids.has(id))).map(g => g.ruleId))].filter(r => ['developer', 'travel', 'delivery'].includes(r)), incomplete: result.ocrStatus === 'failed' || result.qrStatus === 'failed' });
}
// The model ranks grounded advice; it cannot introduce free-form claims or findings.
export const advice = {
  credentials: { title: 'Review possible credentials first', text: 'Redact credential-like values before sharing. Detection does not establish whether a credential is active.' },
  personal: { title: 'Review contact and address details', text: 'Check email, phone and address regions, including nearby text that OCR may have missed.' },
  travel: { title: 'Review travel references together', text: 'Review booking references and visible itinerary details together. Booking access has not been established.' },
  delivery: { title: 'Review delivery details together', text: 'Contact information, an address and an order reference can disclose more when shared together.' },
  developer: { title: 'Review the surrounding system context', text: 'A credential-like value appears with system context. This does not establish compromise or public accessibility.' },
  qr: { title: 'Cover the entire QR code', text: 'Selecting a sensitive QR finding redacts its entire region. Review every visible code; partial coverage may leave a code readable.' },
  incomplete: { title: 'Complete the manual review', text: 'At least one analysis stage failed. Review the whole image manually; missing findings do not mean it is safe.' },
  final: { title: 'Check the exported pixels', text: 'Review selected and dismissed regions, preview the flattened PNG, and use Check redacted image. Rechecking cannot guarantee removal of all sensitive information.' },
} as const;
export type AdviceId = keyof typeof advice;
export function availableAdvice(summary: ReviewSummary): AdviceId[] {
  const has = (...types: string[]) => summary.categories.some(c => types.includes(c.category));
  const ids: AdviceId[] = [];
  if (has('credential')) ids.push('credentials');
  if (has('email', 'phone', 'address')) ids.push('personal');
  if (has('booking', 'travel') || summary.rules.includes('travel')) ids.push('travel');
  if (summary.rules.includes('delivery')) ids.push('delivery');
  if (summary.rules.includes('developer')) ids.push('developer');
  if (has('qr')) ids.push('qr');
  if (summary.incomplete) ids.push('incomplete');
  return [...ids, 'final'];
}
export function validateAdvice(value: unknown, available: AdviceId[]): AdviceId[] {
  const parsed = z.object({ orderedAdviceIds: z.array(z.enum(Object.keys(advice) as [AdviceId, ...AdviceId[]])).max(8) }).strict().parse(value);
  if (parsed.orderedAdviceIds.length !== available.length || new Set(parsed.orderedAdviceIds).size !== available.length || parsed.orderedAdviceIds.some(id => !available.includes(id))) throw new Error('Unsupported advice response');
  return parsed.orderedAdviceIds;
}
