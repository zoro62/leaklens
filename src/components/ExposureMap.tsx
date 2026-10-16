'use client';
import type { ExposureGroup, Finding } from '@/lib/model';
export default function ExposureMap({ groups, findings, chosen, highlighted, onChoose, onHighlight, onFocus }: { groups: ExposureGroup[]; findings: Finding[]; chosen: string; highlighted: boolean; onChoose: (id: string) => void; onHighlight: () => void; onFocus: (id: string | null) => void }) {
  const group = groups.find(g => g.id === chosen) || groups[0];
  if (!group) return null;
  const members = group.memberFindingIds.map(id => findings.find(f => f.id === id)).filter((f): f is Finding => !!f);
  return <section id="exposure-map" className="exposure-map" aria-label="Exposure connection map">
    <div className="section-label">EVIDENCE CONNECTION MAP</div>
    <label className="filter-label">Explore a relationship<select aria-label="Choose exposure relationship" value={group.id} onChange={e => onChoose(e.target.value)}>{groups.map((g, i) => <option key={g.id} value={g.id}>{i + 1}. {g.title}</option>)}</select></label>
    <div className="map-graph">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{members.map((f, i) => <path key={f.id} d={`M43 ${(i + .5) * 100 / members.length} C50 ${(i + .5) * 100 / members.length} 50 50 57 50`} />)}</svg>
      <div className="map-members">{members.map(f => <button key={f.id} onMouseEnter={() => onFocus(f.id)} onMouseLeave={() => onFocus(null)} onFocus={() => onFocus(f.id)} onBlur={() => onFocus(null)} onClick={() => onFocus(f.id)}><strong>{f.label}</strong><small>{f.evidenceSource} · {f.observation === 'inference' ? 'possible inference' : 'observation'}{f.dismissed ? ' · dismissed' : ''}</small></button>)}</div>
      <div className="map-rule"><span>RULE: {group.ruleId}</span><strong>{group.title}</strong><small>Interpretation of linked evidence</small></div>
    </div>
    <button className="secondary" aria-pressed={highlighted} onClick={onHighlight}>Why are these connected?</button>
    <p>{group.explanation}</p><small className="feature-note">{group.limitations} Dismissed findings remain part of the original analysis, but are not redacted.</small>
  </section>;
}
