'use client';
import { useState } from 'react';
export default function ComparisonView({ original, redacted, width, height, disabled, onDownload }: { original: string; redacted: string; width: number; height: number; disabled: boolean; onDownload: () => void }) {
  const [position, setPosition] = useState(50);
  return <section className="comparison" aria-label="Before and after comparison">
    <div className="feature-heading"><div><h3>Inspect the actual PNG</h3><p>Original on the left · flattened redactions on the right</p></div><button className="secondary" disabled={disabled} onClick={onDownload}>Download reviewed PNG</button></div>
    <div className="comparison-images" style={{ aspectRatio: `${width}/${height}` }}>
      {/* Both URLs are local session blobs. The redacted one is the downloadable PNG. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={redacted} alt="Actual flattened redacted PNG" width={width} height={height} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={original} alt="Original image, deliberately shown for comparison" width={width} height={height} style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }} />
      <div className="comparison-divider" style={{ left: `${position}%` }} aria-hidden="true"><span>↔</span></div>
      <span className="comparison-tag original-tag">ORIGINAL · PRIVATE</span><span className="comparison-tag redacted-tag">FLATTENED PNG</span>
    </div>
    <label className="comparison-slider">Original visible: {position}%<input aria-label="Before and after slider" type="range" min="0" max="100" value={position} disabled={disabled} onChange={e => setPosition(Number(e.target.value))} /></label>
    <p className="feature-note">This view deliberately reveals part of the original. Move to 0% to inspect only the redacted pixels. Edits invalidate this preview.</p>
  </section>;
}
