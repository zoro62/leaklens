import type { Category, Evidence, ExposureGroup, Finding, Severity } from './model';
import { distance } from './geometry';

type Rule = { id: string; category: Category; label: string; pattern: RegExp; severity: Severity; explanation: string; uncertain?: boolean; when?: (input: Evidence) => boolean; accept?: (value: string, nearby: string, input: Evidence, start: number) => boolean };
// A hidden PNR label cannot be recovered. Require multiple railway-document
// cues before treating an otherwise unlabelled ten-digit value as a possible PNR.
const railwayDocument = (input: Evidence) => /\b(?:IRCTC|Indian\s+Railways?|Electronic\s+Reservation\s+Slip)\b/i.test(input.text) && /\b(?:Passenger\s+Details|Booking\s+Status|Train|Booked\s+from)\b/i.test(input.text);
// Patterns are intentionally small and inspectable. They recognise shapes, never validity.
const rules: Rule[] = [
  { id: 'email', category: 'email', label: 'Email address', pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, severity: 'medium', explanation: 'An email-shaped string is visible. It may identify or contact someone.' },
  { id: 'assignment', category: 'credential', label: 'Possible credential', pattern: /\b(?:API[_-]?KEY|ACCESS[_-]?TOKEN|TOKEN|SECRET|PASSWORD)\s*[=:][ \t]*["']?([^\s"';,]{8,})/gi, severity: 'high', explanation: 'An explicit secret assignment has a plausible value. This does not establish that it is active.', accept: v => { const value = v.slice(v.search(/[=:]/) + 1).trim().replace(/^["']/, ''); return !/^(?:\*+|x+|<[^>]+>|your[_-].*|changeme|undefined|null)$/i.test(value) && !/^(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)[=:]/i.test(value); } },
  { id: 'provider', category: 'credential', label: 'Possible provider token', pattern: /\b(?:AKIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{50,255}|sk_live_[A-Za-z0-9]{24,})\b/g, severity: 'high', explanation: 'Matches a documented AWS access-key ID, GitHub token, or Stripe live-key shape. No credential is validated.' },
  { id: 'jwt', category: 'credential', label: 'Possible JWT', pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{16,}\b/g, severity: 'high', explanation: 'A three-part JWT-like string is visible. Its signature, contents, and validity have not been checked.' },
  // Indian mobile prefixes and explicit international + formatting avoid arbitrary long integers.
  { id: 'phone', category: 'phone', label: 'Possible phone number', pattern: /(?<![\w\d])(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)|(?<!\w)\+[1-9]\d{0,2}[ -](?:\d[ ()-]?){7,12}\d(?!\d)/g, severity: 'medium', explanation: 'A phone-shaped number appears with a country prefix or a nearby contact label.', accept: (v, nearby) => v.startsWith('+') || /\b(phone|mobile|contact|tel)\b/i.test(nearby) },
  { id: 'booking', category: 'booking', label: 'Booking reference', pattern: /\b(?:PNR|booking\s*(?:reference|ref)|reservation\s*(?:reference|ref))\s*[:#=-]?\s*([A-Z0-9-]{5,16})\b/gi, severity: 'medium', explanation: 'A reference appears next to a booking/PNR label. Provider access behaviour is unknown.' },
  { id: 'railway-pnr', category: 'booking', label: 'Possible railway PNR', pattern: /(?<![\w\d])\d{10}(?![\w\d])/g, severity: 'medium', uncertain: true, when: railwayDocument, accept: (_, _nearby, input, start) => !/\b(?:phone|mobile|contact|tel)\s*[:=-]?\s*\+?[\d -]*$/i.test(input.text.slice(Math.max(0, start - 40), start)), explanation: 'A ten-digit value appears in a railway reservation document. It may be a PNR even when its label is obscured. This is an inference, not a validated booking reference.' },
  { id: 'train-number', category: 'travel', label: 'Train number / name', pattern: /\b(?:Train\s*(?:No\.?|Number|#)?\s*[:=-]?\s*\d{5}(?:\s*\/\s*[^\n]{2,55})?|\d{5}\s*\/\s*[A-Z][A-Z .-]{2,55})/gi, severity: 'medium', when: railwayDocument, explanation: 'A train-labelled number or a five-digit number/name pair is visible in a railway reservation document. Selected to hide journey details; a train number alone is public information, not a credential.' },
  { id: 'order', category: 'order', label: 'Order identifier', pattern: /\bOrder\s*(?:ID|reference|ref|number|no\.?)\s*[:#=-]?\s*([A-Z0-9][A-Z0-9-]{4,24})\b/gi, severity: 'medium', explanation: 'An identifier appears next to an order label.' },
  // Label plus a street number is a conservative address heuristic, not address validation.
  { id: 'address', category: 'address', label: 'Possible delivery address', pattern: /\b(?:delivery\s+address|shipping\s+address|address)\s*:\s*\d{1,5}[^\n;]{8,120}/gi, severity: 'medium', uncertain: true, explanation: 'A labelled address-like line is visible. The address heuristic can miss or overmatch text; review the region.' },
  { id: 'url', category: 'context', label: 'Service / URL context', pattern: /\bhttps?:\/\/[^\s<>"']+/gi, severity: 'context', explanation: 'A URL is visible. A URL alone is not evidence of a secret or a publicly accessible service.' },
  { id: 'ip', category: 'context', label: 'IP address context', pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, severity: 'context', explanation: 'An IP-shaped address is visible. Private addresses do not prove public accessibility.', accept: v => v.split('.').every(n => Number(n) <= 255) },
  { id: 'travel', category: 'travel', label: 'Travel details', pattern: /\b(?:boarding\s+pass|flight\s*[:#]?\s*[A-Z]{2}\s*\d{2,4}|itinerary|departure\s*:\s*[^\n]{3,45})/gi, severity: 'context', explanation: 'Travel-related text is directly visible; associated disclosures should be reviewed together.' },
];
export function detect(input: Evidence): Finding[] {
  const found: { finding: Finding; start: number; end: number }[] = [];
  for (const rule of rules) {
    if (rule.when && !rule.when(input)) continue;
    for (const match of input.text.matchAll(new RegExp(rule.pattern.source, rule.pattern.flags))) {
      const start = match.index!, end = start + match[0].length;
      const nearby = input.text.slice(Math.max(0, start - 32), Math.min(input.text.length, end + 32));
      if (rule.accept && !rule.accept(match[0], nearby, input, start)) continue;
      if (found.some(f => f.finding.category === rule.category && f.start < end && start < f.end)) continue;
      const boxes = input.source === 'QR' && input.qrBox ? [input.qrBox] : input.words.filter(w => w.end > start && w.start < end).map(w => w.box);
      if (!boxes.length) continue;
      found.push({ start, end, finding: { id: `${input.qrId || 'ocr'}-${rule.id}-${start}`, category: rule.category, detectorId: rule.id, label: rule.label, explanation: rule.explanation + (input.source === 'QR' ? ' Payload text has no independent coordinates: the whole QR region is used.' : ''), severity: rule.severity, confidenceBand: rule.uncertain ? 'moderate' : 'strong', evidenceSource: input.source, boxes, relatedGroupIds: [], selectedForRedaction: rule.severity !== 'context', dismissed: false, observation: rule.uncertain ? 'inference' : 'direct', evidence: match[0], qrId: input.qrId } });
    }
  }
  return found.map(f => f.finding);
}
export function qrFinding(text: string, box: Finding['boxes'][number], id: string): Finding {
  const type = /^WIFI:/i.test(text) ? 'Wi-Fi configuration' : /^https?:\/\//i.test(text) ? 'URL' : 'plain text';
  return { id, category: 'qr', detectorId: 'qr-decode', label: `QR · ${type}`, explanation: 'Decoded locally. Never opened. Select to cover the entire QR; partially covered codes may remain readable.', severity: 'medium', confidenceBand: 'strong', evidenceSource: 'QR', boxes: [box], relatedGroupIds: [], selectedForRedaction: true, dismissed: false, observation: 'direct', evidence: text, qrId: id };
}
export function groupExposures(findings: Finding[]): ExposureGroup[] {
  const groups: ExposureGroup[] = [];
  const near = (a: Finding, b: Finding) => a.qrId && a.qrId === b.qrId || a.boxes.some(x => b.boxes.some(y => distance(x, y) < 280));
  const add = (ruleId: string, title: string, explanation: string, members: Finding[], limitations: string) => {
    const overlapping = groups.find(g => g.ruleId === ruleId && members.some(f => g.memberFindingIds.includes(f.id)));
    if (overlapping) { overlapping.memberFindingIds = [...new Set([...overlapping.memberFindingIds, ...members.map(f => f.id)])]; return; }
    const id = `${ruleId}-${groups.length}`;
    groups.push({ id, ruleId, title, explanation, memberFindingIds: [...new Set(members.map(f => f.id))], severity: ruleId === 'developer' ? 'high' : 'medium', limitations });
  };
  for (const anchor of findings) {
    if (anchor.category === 'credential') {
      const context = findings.filter(f => f.category === 'context' && near(anchor, f));
      if (context.length) add('developer', 'Credential + system context', 'Credential-like content and nearby service context are visible together.', [anchor, ...context], 'This does not establish an active credential, server accessibility, or compromise.');
    }
    if (anchor.category === 'address') {
      const contacts = findings.filter(f => ['email', 'phone'].includes(f.category) && near(anchor, f));
      const orders = findings.filter(f => f.category === 'order' && near(anchor, f));
      if (contacts.length && orders.length) add('delivery', 'Contact + delivery details', 'An address-like line, contact information, and an order identifier appear in the same nearby region.', [anchor, ...contacts, ...orders], 'The address heuristic is uncertain; this does not establish identity or order access.');
    }
    if (anchor.category === 'travel') {
      const refs = findings.filter(f => ['booking', 'qr'].includes(f.category) && near(anchor, f));
      if (refs.length) add('travel', 'Travel details + reference', 'Travel-labelled details and a booking reference or QR are visible together.', [anchor, ...refs], 'No claim is made that these details allow booking access for this provider.');
    }
  }
  for (const f of findings) f.relatedGroupIds = groups.filter(g => g.memberFindingIds.includes(f.id)).map(g => g.id);
  return groups;
}
export function masked(value: string) { return value.length < 5 ? '••••' : `${value.slice(0, 2)}${'•'.repeat(Math.min(18, value.length - 4))}${value.slice(-2)}`; }
