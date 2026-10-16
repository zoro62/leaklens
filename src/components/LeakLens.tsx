'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ScanLine, ShieldCheck, Upload, ArrowUpRight, Download, Trash2, Undo2, Redo2, SquareDashedMousePointer, ZoomIn, ZoomOut, Eye, EyeOff, X, Link2, Check, LoaderCircle, ImagePlus, LockKeyhole, ChevronRight, AlertTriangle } from 'lucide-react';
import type { AnalysisResult, Box, Category, Finding, ScanMode } from '@/lib/model';
import type { PresetId } from '@/lib/review';
import ComparisonView from './ComparisonView';
import ExposureMap from './ExposureMap';
import { FinalReview, SelectionTools } from './ReviewTools';
import type { NormalImage } from '@/lib/image';
import type { ScanControl } from '@/lib/analysis';
import { exportImage, normalise, redactionBox, releaseImage } from '@/lib/image';
import { masked } from '@/lib/detectors';
import { clampBox, displayPoint } from '@/lib/geometry';

const demos = [{ id: 'developer', title: 'Developer terminal', sub: 'A key with a little too much context', icon: '01' }, { id: 'travel', title: 'Travel ticket', sub: 'A covered name. An uncovered QR.', icon: '02' }, { id: 'receipt', title: 'Shopping receipt', sub: 'Contact and delivery details, connected', icon: '03' }, { id: 'control', title: 'Control image', sub: 'Harmless numbers and a public URL', icon: '04' }];
const categories: { value: 'all' | Category; label: string }[] = [{ value: 'all', label: 'All findings' }, { value: 'credential', label: 'Credentials' }, { value: 'email', label: 'Email' }, { value: 'phone', label: 'Phone' }, { value: 'qr', label: 'QR codes' }, { value: 'address', label: 'Addresses' }, { value: 'booking', label: 'Bookings' }, { value: 'order', label: 'Orders' }, { value: 'context', label: 'Context' }, { value: 'travel', label: 'Travel' }, { value: 'manual', label: 'Manual' }];
type History = { past: Finding[][]; current: Finding[]; future: Finding[][] };
const emptyHistory = (): History => ({ past: [], current: [], future: [] });

export default function LeakLens() {
  const [image, setImage] = useState<NormalImage | null>(null), imageRef = useRef<NormalImage | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<History>(emptyHistory);
  const [phase, setPhase] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | Category>('all'), [active, setActive] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set()), [manual, setManual] = useState(false), [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<Box | null>(null), start = useRef<{ x: number; y: number } | null>(null);
  const [exportMessage, setExportMessage] = useState(''), [exported, setExported] = useState<HTMLCanvasElement | null>(null);
  const [verification, setVerification] = useState(''), [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null), scan = useRef<ScanControl | null>(null), revision = useRef(0);
  const demoRequest = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const prepared = useRef<{ canvas: HTMLCanvasElement; blob: Blob; url: string } | null>(null);
  const [comparisonURL, setComparisonURL] = useState(''), [reviewChecks, setReviewChecks] = useState<string[]>([]);
  const [scanMode, setScanMode] = useState<ScanMode>('standard'), [preset, setPreset] = useState<PresetId>('bug');
  const [chosenGroup, setChosenGroup] = useState(''), [linkedGroup, setLinkedGroup] = useState('');
  const [coords, setCoords] = useState({ x: 0, y: 0, width: 100, height: 40 });
  const findings = history.current;
  const visible = findings.filter(f => !f.dismissed), selected = visible.filter(f => f.selectedForRedaction);
  const mapGroup = result?.exposureGroups.find(g => g.id === chosenGroup) || result?.exposureGroups[0];
  const linkedIds = new Set(result?.exposureGroups.find(g => g.id === linkedGroup)?.memberFindingIds || []);

  async function cancel() { demoRequest.current?.abort(); demoRequest.current = null; const current = scan.current; scan.current = null; if (current) { current.cancelled = true; current.cancel?.(); current.worker?.terminate(); current.qrWorker?.terminate(); } }
  useEffect(() => {
    const sessionRevision = revision;
    mounted.current = true;
    return () => {
      mounted.current = false;
      // React Strict Mode immediately remounts effects in development. Defer
      // disposal one microtask so its rehearsal does not invalidate an upload.
      // Async commits also check mounted, preventing real unmount side effects.
      queueMicrotask(() => {
        if (mounted.current) return;
        sessionRevision.current++; demoRequest.current?.abort();
        const c = scan.current; if (c) { c.cancelled = true; c.cancel?.(); c.worker?.terminate(); c.qrWorker?.terminate(); }
        releaseImage(imageRef.current);
        if (prepared.current) { URL.revokeObjectURL(prepared.current.url); prepared.current.canvas.width = 0; prepared.current.canvas.height = 0; }
      });
    };
  }, []);
  function sessionValid(id: number) { return mounted.current && id === revision.current; }
  function discardExport() {
    if (prepared.current) { URL.revokeObjectURL(prepared.current.url); prepared.current.canvas.width = 0; prepared.current.canvas.height = 0; prepared.current = null; }
    setComparisonURL(''); setExported(null); setExportMessage(''); setVerification(''); setReviewChecks([]);
  }
  function edit(next: Finding[] | ((previous: Finding[]) => Finding[])) {
    setHistory(h => ({ past: [...h.past.slice(-29), h.current], current: typeof next === 'function' ? next(h.current) : next, future: [] }));
    discardExport();
  }
  function undo() { setHistory(h => !h.past.length ? h : { past: h.past.slice(0, -1), current: h.past.at(-1)!, future: [h.current, ...h.future] }); discardExport(); }
  function redo() { setHistory(h => !h.future.length ? h : { past: [...h.past, h.current], current: h.future[0], future: h.future.slice(1) }); discardExport(); }
  function clear() {
    discardExport(); setChosenGroup(''); setLinkedGroup(''); setPreset('bug'); setScanMode('standard');
    revision.current++; void cancel(); releaseImage(imageRef.current); imageRef.current = null; setImage(null); setResult(null); setHistory(emptyHistory()); setBusy(false); setPhase(''); setError(''); setExportMessage(''); setExported(null); setVerification(''); setRevealed(new Set()); setManual(false); setZoom(1); setActive(null); setDrag(null); start.current = null; setFilter('all');
    if (fileInput.current) fileInput.current.value = '';
  }
  async function load(file: File) {
    const id = ++revision.current; await cancel(); if (!sessionValid(id)) return;
    discardExport(); setChosenGroup(''); setLinkedGroup(''); setBusy(true); setError(''); setPhase('Validating and normalising image…');
    releaseImage(imageRef.current); imageRef.current = null; setImage(null); setResult(null); setHistory(emptyHistory()); setExported(null); setVerification(''); setExportMessage(''); setRevealed(new Set()); setManual(false); setZoom(1); setFilter('all'); setDrag(null); start.current = null; setActive(null);
    let normalized: NormalImage;
    try { normalized = await normalise(file); } catch (e) { if (sessionValid(id)) { setError(e instanceof Error ? e.message : 'Image could not be loaded.'); setBusy(false); setPhase(''); } return; }
    if (!sessionValid(id)) { releaseImage(normalized); return; }
    imageRef.current = normalized; setImage(normalized);
    const control: ScanControl = { cancelled: false }; scan.current = control;
    try {
      const { analyse } = await import('@/lib/analysis');
      if (!sessionValid(id)) return;
      const data = await analyse(normalized.canvas, control, message => { if (sessionValid(id)) setPhase(message); }, { mode: scanMode });
      if (!sessionValid(id)) return;
      setResult(data); setHistory({ past: [], current: data.findings, future: [] }); setPhase(data.ocrStatus === 'complete' && data.qrStatus === 'complete' ? 'Analysis complete · review before sharing' : 'Partial analysis · checks failed');
    } catch (e) { if (sessionValid(id)) { setError(e instanceof Error ? e.message : 'Analysis failed.'); setPhase('Analysis incomplete · review manually'); } }
    finally { if (sessionValid(id)) { setBusy(false); scan.current = null; } }
  }
  async function rescan() {
    if (!image || busy) return;
    const id = ++revision.current, source = image.canvas, manualFindings = findings.filter(f => f.evidenceSource === 'manual');
    await cancel(); if (!sessionValid(id)) return;
    discardExport(); setChosenGroup(''); setLinkedGroup(''); setError(''); setBusy(true); setPhase('Preparing rescan…');
    const control: ScanControl = { cancelled: false }; scan.current = control;
    try {
      const { analyse } = await import('@/lib/analysis'); if (!sessionValid(id)) return;
      const data = await analyse(source, control, m => { if (sessionValid(id)) setPhase(m); }, { mode: scanMode });
      if (!sessionValid(id)) return;
      setResult(data); setHistory({ past: [], current: [...data.findings, ...manualFindings], future: [] });
      setPhase(data.ocrStatus === 'complete' && data.qrStatus === 'complete' ? 'Analysis complete · review before sharing' : 'Partial analysis · checks failed');
    } catch (e) { if (sessionValid(id)) { setError(e instanceof Error ? e.message : 'Rescan failed.'); setPhase('Rescan incomplete · previous results retained'); } }
    finally { if (sessionValid(id)) { setBusy(false); scan.current = null; } }
  }
  async function demo(id: string) {
    const request = ++revision.current; await cancel();
    if (!sessionValid(request)) return;
    const controller = new AbortController(); demoRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 20_000);
    setError(''); setBusy(true); setPhase('Loading synthetic demo…');
    try {
      const response = await fetch(`/demos/${id}.png`, { signal: controller.signal });
      if (!response.ok) throw new Error('Demo unavailable. Run npm run fixtures.');
      const blob = await response.blob();
      if (sessionValid(request)) await load(new File([blob], `${id}.png`, { type: 'image/png' }));
    } catch (e) {
      if (sessionValid(request)) { setError(controller.signal.aborted ? 'Demo download timed out. Retry or upload a local image.' : e instanceof Error ? e.message : 'Demo could not be loaded.'); setBusy(false); setPhase('Demo could not be loaded.'); }
    } finally { clearTimeout(timeout); if (demoRequest.current === controller) demoRequest.current = null; }
  }
  function toggle(finding: Finding) { edit(previous => previous.map(f => (finding.qrId ? f.qrId === finding.qrId : f.id === finding.id) ? { ...f, selectedForRedaction: !finding.selectedForRedaction } : f)); }
  function addManual(box: Box) {
    if (!image || busy) return;
    box = clampBox(box, image.width, image.height);
    if (box.width < 2 || box.height < 2) return;
    const finding: Finding = { id: `manual-${crypto.randomUUID()}`, category: 'manual', detectorId: 'manual-rectangle', label: 'Manual redaction', explanation: 'Region selected by you. No sensitive-content claim is made.', severity: 'context', confidenceBand: 'strong', evidenceSource: 'manual', boxes: [box], relatedGroupIds: [], selectedForRedaction: true, dismissed: false, observation: 'direct', evidence: 'User-selected region' };
    edit(previous => [...previous, finding]);
  }
  function downloadPrepared() {
    if (!prepared.current || !image || busy) return;
    const a = document.createElement('a'); a.href = prepared.current.url; a.download = 'leaklens-redacted.png'; a.click();
    setExportMessage(`PNG exported at ${image.width} × ${image.height}. ${selected.length} of ${visible.length} findings selected; ${findings.filter(f => f.dismissed).length} dismissed. Multiple findings can share one region.`);
  }
  async function prepareExport(downloadNow = true) {
    if (!image || busy) return;
    const id = revision.current; setBusy(true); setPhase('Flattening redactions into PNG…');
    try {
      const { blob, canvas } = await exportImage(image.canvas, findings);
      if (!sessionValid(id)) { canvas.width = 0; canvas.height = 0; return; }
      if (prepared.current) { URL.revokeObjectURL(prepared.current.url); prepared.current.canvas.width = 0; prepared.current.canvas.height = 0; }
      const url = URL.createObjectURL(blob); prepared.current = { canvas, blob, url }; setComparisonURL(url);
      if (downloadNow) { const a = document.createElement('a'); a.href = url; a.download = 'leaklens-redacted.png'; a.click(); }
      setExported(canvas); setVerification(''); setExportMessage(`${downloadNow ? 'PNG exported' : 'PNG preview ready'} at ${image.width} × ${image.height}. ${selected.length} of ${visible.length} findings selected; ${findings.filter(f => f.dismissed).length} dismissed. Multiple findings can share one region.`);
    } catch { if (sessionValid(id)) setError('PNG export failed. Try a smaller image or another browser.'); }
    finally { if (sessionValid(id)) { setBusy(false); setPhase(result?.ocrStatus === 'failed' || result?.qrStatus === 'failed' ? 'Partial analysis · checks failed' : result ? 'Analysis complete · review before sharing' : 'Analysis incomplete · review manually'); } }
  }
  async function verify() {
    if (!exported || busy) return;
    const id = revision.current, control: ScanControl = { cancelled: false }; scan.current = control; setBusy(true); setVerification('Rechecking the exported pixels…');
    try {
      const { analyse } = await import('@/lib/analysis'); const checked = await analyse(exported, control, message => { if (sessionValid(id)) setPhase(message); }, { mode: result?.scanMode });
      if (!sessionValid(id)) return;
      const targets = selected.filter(f => f.evidenceSource !== 'manual');
      const remains = targets.filter(t => checked.findings.some(f => f.evidenceSource === t.evidenceSource && f.category === t.category && f.evidence === t.evidence));
      const ctx = exported.getContext('2d')!;
      const manualTargets = selected.filter(f => f.evidenceSource === 'manual');
      const manualCovered = manualTargets.every(f => f.boxes.every(b => {
        const pixels = ctx.getImageData(Math.floor(b.x), Math.floor(b.y), Math.ceil(b.width), Math.ceil(b.height)).data;
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i] || pixels[i + 1] || pixels[i + 2] || pixels[i + 3] !== 255) return false;
        return true;
      }));
      setVerification(`${checked.ocrStatus === 'failed' || checked.qrStatus === 'failed' ? 'Recheck incomplete: a processing stage failed. ' : ''}${remains.length} selected text/QR targets still detected; ${checked.findings.length} total findings on exported image. Manual pixel coverage: ${!manualTargets.length ? 'not applicable (none selected)' : manualCovered ? 'opaque' : 'review needed'}. Rechecking can identify some missed redactions. It does not guarantee that all sensitive information has been removed.`);
    } catch { if (sessionValid(id)) setVerification('Recheck failed. Do not treat this as verification.'); }
    finally { if (sessionValid(id)) { setBusy(false); scan.current = null; setPhase('Review before sharing'); } }
  }
  function pointerPoint(e: React.PointerEvent<SVGSVGElement>) { return displayPoint(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect(), image!.width, image!.height); }
  function finishRectangle(e: React.PointerEvent<SVGSVGElement>) { if (!start.current) return; const p = pointerPoint(e), s = start.current; addManual({ x: Math.floor(Math.min(s.x, p.x)), y: Math.floor(Math.min(s.y, p.y)), width: Math.ceil(Math.abs(s.x - p.x)), height: Math.ceil(Math.abs(s.y - p.y)) }); start.current = null; setDrag(null); }

  return <div className="app-shell">
    <header className="topbar"><Link className="brand" href="/" aria-label="LeakLens home"><span className="brand-mark"><ScanLine size={23} /></span>LeakLens<span className="beta">LOCAL FIRST</span></Link><div className="header-right"><span className="local-tag"><span /> Your image stays on your device</span><button className="quiet" onClick={clear} disabled={!image && !busy && !error}><Trash2 size={15} /> Clear session</button></div></header>
    <main>
      <div className="intro"><div><div className="eyebrow">A SECOND LOOK BEFORE YOU SHARE</div><h1>Small details.<br className="mobile-break" /> Bigger disclosures.</h1><p>Find sensitive text, look inside QR codes, and connect the clues.<br className="desktop-break" /> Then cover what matters — permanently.</p></div><div className="privacy-note"><ShieldCheck size={25} /><div><strong>Private by design</strong><span>On-device analysis. No account.<br />No image uploads. No API key.</span></div></div></div>
      <input ref={fileInput} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Upload screenshot" onChange={e => { const f = e.target.files?.[0]; if (f) void load(f); e.target.value = ''; }} />
      {error && <div className="notice error" role="alert"><AlertTriangle size={18} />{error}<button aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}
      <section className="scan-options" aria-label="Analysis depth"><label>Scan depth<select aria-label="Scan depth" value={scanMode} disabled={busy} onChange={e => setScanMode(e.target.value as ScanMode)}><option value="standard">Standard · faster overview</option><option value="thorough">Thorough · full-resolution tiles</option></select></label><p>{scanMode === 'thorough' ? 'Overlapping original-resolution tiles help inspect tiny text. More processing; up to 24 tiles. Does not guarantee detection.' : 'A fast local overview. Use thorough scanning for screenshots with small text.'}<span>Applies to your next upload or rescan. Rescanning replaces automatic findings and keeps manual rectangles; review selections again.</span></p>{image && <button className="secondary" disabled={busy} onClick={() => void rescan()}>Rescan at selected depth</button>}</section>
      <div className="workflow"><span className="step active"><b>1</b> Add screenshot</span><ChevronRight size={14} /><span className={`step ${image ? 'active' : ''}`}><b>2</b> Review evidence</span><ChevronRight size={14} /><span className={`step ${result ? 'active' : ''}`}><b>3</b> Redact & export</span></div>
      <div className="workbench">
        <section className="workspace panel" aria-label="Image workspace">
          <div className="panel-heading"><div><span className="panel-dot" /> IMAGE WORKSPACE</div><button className="quiet" onClick={() => fileInput.current?.click()}><ImagePlus size={15} />{image ? 'Replace image' : 'Choose image'}</button></div>
          {!image ? <div className={`dropzone ${dragOver ? 'drag-over' : ''}`} onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) void load(f); }}>
            <div className="upload-icon"><ScanLine size={36} strokeWidth={1.3} /></div><h2>Your screenshot deserves<br />a second look.</h2><p>Drop an image here to see what you might be sharing.</p><button className="primary" onClick={() => fileInput.current?.click()}><Upload size={17} /> Upload screenshot <ArrowUpRight size={16} /></button><span className="file-hint">PNG, JPEG, WebP · up to 15 MB · 25 MP</span><span className="local-small"><LockKeyhole size={13} /> Processed in your browser, never uploaded</span>
          </div> : <>
            <div className="image-toolbar"><div className="file-meta"><strong>{image.name}</strong><span>{image.width} × {image.height} px · original resolution preserved</span></div><div className="tools"><button title="Zoom out" aria-label="Zoom out" onClick={() => setZoom(z => Math.max(.5, z - .25))}><ZoomOut size={17} /></button><span>{Math.round(zoom * 100)}%</span><button title="Zoom in" aria-label="Zoom in" onClick={() => setZoom(z => Math.min(3, z + .25))}><ZoomIn size={17} /></button><button className={manual ? 'tool-active' : ''} aria-label="Manual rectangle tool" aria-pressed={manual} disabled={busy} onClick={() => setManual(v => !v)}><SquareDashedMousePointer size={18} /></button><button aria-label="Undo redaction edit" disabled={!history.past.length || busy} onClick={undo}><Undo2 size={17} /></button><button aria-label="Redo redaction edit" disabled={!history.future.length || busy} onClick={redo}><Redo2 size={17} /></button></div></div>
            <div className={`image-scroll ${manual ? 'drawing' : ''}`}><div className="image-stage" style={{ width: `${zoom * 100}%` }}>
              {/* Canvas-normalised object URL; intrinsic dimensions keep SVG and raster aligned. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt="Uploaded screenshot for local review" width={image.width} height={image.height} draggable={false} />
              <svg aria-label="Finding regions and manual rectangle canvas" role="img" viewBox={`0 0 ${image.width} ${image.height}`} onPointerDown={e => { if (!manual || busy) return; e.currentTarget.setPointerCapture(e.pointerId); start.current = pointerPoint(e); setDrag({ ...start.current, width: 0, height: 0 }); }} onPointerMove={e => { if (!start.current) return; const p = pointerPoint(e), s = start.current; setDrag({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), width: Math.abs(s.x - p.x), height: Math.abs(s.y - p.y) }); }} onPointerUp={finishRectangle} onPointerCancel={() => { start.current = null; setDrag(null); }}>
                {visible.map(f => f.boxes.map((raw, i) => { const b = f.selectedForRedaction ? redactionBox(f, raw, image.width, image.height) : raw; return <rect key={`${f.id}-${i}`} x={b.x} y={b.y} width={b.width} height={b.height} className={`region ${f.selectedForRedaction ? 'selected' : ''} ${active === f.id ? 'focused' : ''} ${linkedIds.has(f.id) ? 'linked' : ''} ${f.severity}`} onMouseEnter={() => setActive(f.id)} onMouseLeave={() => setActive(null)} onClick={() => { if (!manual && !busy) toggle(f); }}><title>{f.label} · {f.selectedForRedaction ? 'selected' : 'not selected'}</title></rect>; }))}
                {drag && <rect {...drag} className="draft-region" />}
              </svg>
            </div></div>
            <div className="image-caption"><span><i className="legend-box" /> Selected for opaque redaction</span><span>{manual ? 'Drag a rectangle, or enter coordinates below.' : 'Click a region to select · zoom and scroll to inspect'}</span></div>
            {manual && <form className="manual-form" onSubmit={e => { e.preventDefault(); const x = Math.min(Math.max(0, coords.x), image.width - 1), y = Math.min(Math.max(0, coords.y), image.height - 1); addManual({ x, y, width: Math.min(coords.width, image.width - x), height: Math.min(coords.height, image.height - y) }); }}><span>Keyboard rectangle (pixels)</span>{(['x', 'y', 'width', 'height'] as const).map(key => <label key={key}>{key}<input aria-label={`Rectangle ${key}`} type="number" min={key === 'width' || key === 'height' ? 2 : 0} max={key === 'x' || key === 'width' ? image.width : image.height} value={coords[key]} required onChange={e => setCoords(c => ({ ...c, [key]: Number(e.target.value) }))} /></label>)}<button className="secondary" type="submit">Add rectangle</button></form>}
          </>}
          <div className="workspace-footer"><ShieldCheck size={15} /><span>English OCR + QR decoding run locally. Engine assets load from this app.</span></div>
          {image && comparisonURL && <ComparisonView key={comparisonURL} original={image.url} redacted={comparisonURL} width={image.width} height={image.height} disabled={busy} onDownload={downloadPrepared} />}
        </section>
        <aside className="review panel" aria-label="Findings review">
          <div className="panel-heading"><div><span className="panel-dot" /> REVIEW FINDINGS</div><span className="count-pill">{visible.length}</span></div>
          <div className="review-content">
            <div className={`scan-status ${busy ? 'processing' : ''}`} role="status" aria-live="polite">{busy ? <LoaderCircle size={17} className="spin" /> : result ? result.ocrStatus === 'failed' || result.qrStatus === 'failed' ? <AlertTriangle size={17} /> : <Check size={17} /> : <ScanLine size={17} />}<span>{phase || 'Ready when you are'}</span></div>
            {result && <nav className="review-nav" aria-label="Review sections"><a href="#findings-list">Findings</a>{!!result.exposureGroups.length && <a href="#exposure-map">Exposure map</a>}<a href="#final-review">Final review</a></nav>}
            {result && <><div className="scan-detail">{busy ? 'Last result · ' : ''}OCR: {result.ocrStatus} · QR: {result.qrStatus} · {(result.timing.totalMs / 1000).toFixed(1)}s · {result.scanMode || 'standard'}{result.scanMode === 'thorough' ? ` · ${result.tilesCompleted}/${result.tilesTotal} tiles` : ''}</div><p className="coverage-note">Names, unlabelled identifiers, and other details may be missed. Inspect the image and use manual rectangles for anything else you want hidden.</p>{result.warnings.map(w => <p className="warning" key={w}>{w}</p>)}<SelectionTools findings={findings} preset={preset} onPreset={setPreset} disabled={busy} onChange={edit} /></>}
            {!result && !busy ? <div className="review-empty"><div className="evidence-illustration"><div /><div /><div /><span><Link2 size={21} /></span></div><h3>See the details.<br />Understand the connections.</h3><p>Findings will appear here with their evidence, why they matter, and what to review.</p><div className="review-explainer"><span><span className="small-square" /> Directly observed text & codes</span><span><Link2 size={14} /> Related details, linked by clear rules</span><span><SquareDashedMousePointer size={14} /> You decide what gets covered</span></div></div> : <>
              <label className="filter-label">Show category<select aria-label="Filter findings by category" value={filter} onChange={e => setFilter(e.target.value as typeof filter)}>{categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
              <div id="findings-list" className="finding-list">{visible.filter(f => filter === 'all' || f.category === filter).map(f => <article key={f.id} className={`finding ${active === f.id ? 'is-active' : ''}`} onMouseEnter={() => setActive(f.id)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(f.id)} onBlur={() => setActive(null)}>
                <div className="finding-top"><label><input aria-label={`Redact ${f.label}`} type="checkbox" checked={f.selectedForRedaction} disabled={busy} onChange={() => toggle(f)} /><strong>{f.label}</strong></label><span className={`severity ${f.severity}`}>{f.severity}</span></div>
                <div className="evidence-preview"><code>{revealed.has(f.id) ? f.evidence : masked(f.evidence)}</code><button aria-label={`${revealed.has(f.id) ? 'Hide' : 'Reveal'} ${f.label}`} onClick={() => setRevealed(previous => { const next = new Set(previous); if (next.has(f.id)) next.delete(f.id); else next.add(f.id); return next; })}>{revealed.has(f.id) ? <EyeOff size={15} /> : <Eye size={15} />}</button></div>
                <p>{f.explanation}</p><div className="finding-bottom"><span>{f.evidenceSource} · {f.observation === 'direct' ? 'observed' : 'possible inference'} · {f.confidenceBand} match</span><button className="dismiss" disabled={busy} onClick={() => edit(previous => previous.map(item => item.id === f.id ? { ...item, dismissed: true, selectedForRedaction: false } : item))}>Dismiss</button></div>
              </article>)}</div>
              {result && !visible.length && <p className="no-findings">{findings.some(f => f.dismissed) ? 'All findings dismissed. Dismissal does not remove image content.' : result.ocrStatus === 'complete' && result.qrStatus === 'complete' ? 'No findings detected. This does not mean no sensitive information exists. Review the image and add manual redactions as needed.' : 'No findings available from completed checks. The scan is incomplete.'}</p>}
              {findings.some(f => f.dismissed) && <button className="quiet" disabled={busy} onClick={() => edit(previous => previous.map(f => ({ ...f, dismissed: false })))}>Restore dismissed findings</button>}
              {!!result?.exposureGroups.length && <><ExposureMap groups={result.exposureGroups} findings={findings} chosen={mapGroup?.id || ''} highlighted={linkedGroup === mapGroup?.id} onChoose={id => { setChosenGroup(id); setLinkedGroup(''); }} onHighlight={() => { setLinkedGroup(linkedGroup === mapGroup?.id ? '' : mapGroup?.id || ''); setFilter('all'); }} onFocus={setActive} /><details className="groups"><summary>Connected exposure details</summary>{result.exposureGroups.map(g => <article className="group" key={g.id}><h3>{g.title}</h3><span className="inference-tag">Rule-based interpretation</span><p>{g.explanation}</p><div className="group-links">{g.memberFindingIds.map(id => { const f = findings.find(item => item.id === id); return f && <button key={id} onFocus={() => setActive(id)} onMouseEnter={() => setActive(id)} onMouseLeave={() => setActive(null)} onClick={() => { setActive(id); setFilter('all'); }}>{f.label}{f.dismissed ? ' (dismissed)' : ''}</button>; })}</div><small>{g.limitations}</small></article>)}</details></>}
            </>}
          </div>
          <div className="export-area">{image && <FinalReview checked={reviewChecks} onCheck={(id, checked) => setReviewChecks(previous => checked ? [...new Set([...previous, id])] : previous.filter(item => item !== id))} hasPreview={!!comparisonURL} disabled={busy} />}<div><strong>{selected.length} findings selected</strong><span>{visible.length - selected.length} visible findings left uncovered · review before export</span></div><button className="secondary preview-button" disabled={!image || busy} onClick={() => void prepareExport(false)}>Preview before downloading</button><button className="primary" disabled={!image || busy} onClick={() => prepared.current ? downloadPrepared() : void prepareExport(true)}><Download size={17} /> Export redacted PNG <ArrowUpRight size={16} /></button><p>Solid, permanent redactions. Original pixel dimensions.</p>{exportMessage && <div className="export-feedback" role="status">{exportMessage}<button className="secondary" onClick={() => void verify()} disabled={busy}>Check redacted image</button></div>}{exported && verification && <p className="verification" role="status">{verification}</p>}</div>
        </aside>
      </div>
      <section className="demo-section" aria-label="Synthetic demo screenshots"><div className="demo-heading"><h2>Try a different kind of disclosure.</h2><span>Synthetic images. Real analysis.</span></div><div className="demo-grid">{demos.map(d => <button key={d.id} className="demo-card" onClick={() => void demo(d.id)}><span className={`demo-thumbnail ${d.id}`}><span className="mini-label">SYNTHETIC DEMO</span>{d.id === 'developer' ? <><i /><i /><i /></> : d.id === 'travel' ? <><span className="mini-ticket">BOARDING PASS</span><span className="mini-qr">▦</span><i /></> : <><i /><i /><i /><i /></>}</span><span className="demo-text"><span className="demo-number">{d.icon}</span><span><strong>{d.title}</strong><small>{d.sub}</small></span><ArrowUpRight size={17} /></span></button>)}</div></section>
      <footer className="footer"><span><ScanLine size={15} /> LeakLens <span className="muted">· Review before you share.</span></span><p>Detectors can miss tiny text, low contrast, or unsupported scripts. Severity describes exposure; match strength describes the rule, not certainty. Always review.</p></footer>
    </main>
  </div>;
}
