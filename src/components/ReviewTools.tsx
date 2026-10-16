'use client';
import { batchSelection, reviewPrompts, sharingPresets, type PresetId } from '@/lib/review';
import type { Finding } from '@/lib/model';

export function SelectionTools({ findings, preset, onPreset, disabled, onChange }: { findings: Finding[]; preset: PresetId; onPreset: (id: PresetId) => void; disabled: boolean; onChange: (findings: Finding[]) => void }) {
  const selected = sharingPresets.find(p => p.id === preset)!;
  return <section className="selection-tools" aria-label="Sharing presets and batch selection">
    <label className="filter-label">What are you sharing?<select aria-label="Sharing purpose" value={preset} disabled={disabled} onChange={e => onPreset(e.target.value as PresetId)}>{sharingPresets.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
    <p className="feature-note">{selected.description} Suggestions only add selections; they never remove existing coverage.</p>
    <button className="secondary" disabled={disabled} onClick={() => onChange(batchSelection(findings, { type: 'categories', categories: selected.categories }))}>Add suggested selections</button>
    <div className="batch-actions"><button disabled={disabled} onClick={() => onChange(batchSelection(findings, { type: 'categories', categories: ['email', 'phone', 'address'] }))}>Select all contact details</button><button disabled={disabled} onClick={() => onChange(batchSelection(findings, { type: 'qr' }))}>Cover all QR codes</button><button disabled={disabled} onClick={() => onChange(batchSelection(findings, { type: 'defaults' }))}>Restore default selections</button></div>
    <small className="feature-note">Batch edits are undoable. Defaults preserve manual rectangles and leave dismissed findings dismissed.</small>
  </section>;
}
export function FinalReview({ checked, onCheck, hasPreview, disabled }: { checked: string[]; onCheck: (id: string, checked: boolean) => void; hasPreview: boolean; disabled: boolean }) {
  return <section id="final-review" className="final-review" aria-label="Guided final review"><div className="feature-heading"><h3>Your final review</h3><span>{checked.length}/{reviewPrompts.length}</span></div><p className="feature-note">Optional prompts, not an automated safety check. Redaction edits reset this review.</p>{reviewPrompts.map(p => <label key={p.id}><input aria-label={p.label} type="checkbox" checked={checked.includes(p.id)} disabled={disabled || p.id === 'artifact' && !hasPreview} onChange={e => onCheck(p.id, e.target.checked)} /><span><strong>{p.label}</strong><small>{p.hint}</small></span></label>)}<p className="feature-note">{checked.length === reviewPrompts.length ? 'Review prompts completed. ' : ''}These confirmations do not guarantee that all sensitive information has been removed.</p></section>;
}
