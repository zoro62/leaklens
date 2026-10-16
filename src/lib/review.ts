import type { Category, Finding } from './model';

export const sharingPresets = [
  { id: 'bug', label: 'Report a bug', description: 'Add credentials, contact details and QR selections. Technical context stays available for your review.', categories: ['credential', 'email', 'phone', 'address', 'qr'] },
  { id: 'ticket', label: 'Share a ticket', description: 'Add booking references, journey details, contact information and QR selections. Check passenger names manually.', categories: ['booking', 'travel', 'email', 'phone', 'qr', 'credential'] },
  { id: 'receipt', label: 'Post a receipt', description: 'Add delivery address, contact, order and QR selections. Check names and payment details manually.', categories: ['address', 'email', 'phone', 'order', 'qr', 'credential'] },
] as const;
export type PresetId = typeof sharingPresets[number]['id'];
export type SelectionAction = { type: 'categories'; categories: readonly Category[] } | { type: 'qr' } | { type: 'defaults' };

// Suggestions only add coverage. Restoring defaults is an explicit, undoable
// action; it preserves manual rectangles and does not revive dismissed findings.
export function batchSelection(findings: Finding[], action: SelectionAction): Finding[] {
  const next = findings.map(f => {
    if (f.dismissed || f.evidenceSource === 'manual') return { ...f };
    const selected = action.type === 'defaults' ? f.severity !== 'context' : f.selectedForRedaction || (action.type === 'qr' ? !!f.qrId : action.categories.includes(f.category));
    return { ...f, selectedForRedaction: selected };
  });
  const codes = new Set(next.filter(f => !f.dismissed && f.selectedForRedaction && f.qrId).map(f => f.qrId));
  return next.map(f => f.qrId && !f.dismissed ? { ...f, selectedForRedaction: codes.has(f.qrId) } : f);
}
export const reviewPrompts = [
  { id: 'identity', label: 'Checked names and identifying details', hint: 'Names, usernames, IDs, account and payment details can be missed.' },
  { id: 'codes', label: 'Reviewed references and encoded content', hint: 'Review QR codes, ticket references, order IDs and contact details, including dismissed findings.' },
  { id: 'background', label: 'Inspected the rest of the screenshot', hint: 'Check other windows, notifications, profile pictures and anything visible in the background.' },
  { id: 'artifact', label: 'Inspected the flattened PNG preview', hint: 'Use the comparison slider and check the final pixels, including manually covered regions.' },
] as const;
