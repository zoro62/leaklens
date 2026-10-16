# Submission review

LeakLens is suitable to present as a hackathon prototype with human review. Do not describe it as automatic anonymisation or a guarantee that all identifying information is removed.

## Concrete defects fixed in the follow-up review

1. **Export race:** PNG encoding could finish after clear/replacement and trigger a stale download or restore old export state. Export now takes a session revision, locks edits during flattening, and discards stale output. A browser regression deliberately holds the actual PNG encoding callback, clears, then releases it and asserts no download/state restoration.
2. **Misleading preview:** selected rectangles were translucent and became lighter on focus. Selected preview fill is now opaque black even on focus, and uses the exact padded/clamped box helper used by export. Actual exports were already opaque; the fix makes their preview consistent.
3. **Misleading counts:** QR payload entities share a single code region. Counts now say findings rather than regions, and export feedback explains shared regions. Recheck no longer calls manual coverage opaque when there were no manual targets.
4. **Zero-sized downscale edge case:** an extremely narrow valid image could round down to a zero-width/height analysis canvas. Both dimensions now remain at least one pixel; geometry regressions cover each orientation.
5. **Coverage visibility:** the results panel now directly reminds users that names, unlabelled identifiers and other details may be missed, rather than leaving this only in documentation. Manual rectangles remain available.
6. **Unbounded demo download:** a stalled same-origin fixture request could leave the interface waiting indefinitely. Demo fetches now have a 20-second deadline and abort on replacement/clear.

## Remaining limits relevant to judges

- A visible passenger name, transaction identifier, or arbitrary personal detail may not have an automatic detector. These need manual review. Railway PNR inference requires multiple document cues and remains uncertain.
- English OCR and regular expressions can miss or misread text. QR coverage is attempted, not exhaustive. Recheck exact-text matching can miss changed OCR readings.
- A fixed 280px relationship gap is sensitive to document scale and layout. It is explainable but not a semantic document parser.
- The pixel limit is checked after browser decode, so pathological images can still stress memory. Compressed file limits and worker timeouts do not eliminate this.
- Desktop Chrome and a mobile viewport were exercised. This is not broad device/browser accessibility or security certification.
- No dependency-vulnerability audit was completed; network restrictions prevented normal package-network operations earlier. Lockfile presence and passing tests do not establish dependency security.

Use the synthetic demos in the presentation, include the control fixture to show restraint, show manual coverage of unrecognised text, and inspect the exported file. The project's core value is local processing, evidence-linked review, and permanent raster redaction with honest limitations.

Post-feature checks passed: 34 unit tests, all 18 browser tests against the production build, TypeScript checking, lint and production build. Passing these checks does not establish an absence of further defects.

The comparison deliberately shows the original, presets only add coverage, review confirmations are optional and do not certify safety, and thorough mode can still miss crop-boundary/context-dependent content. Its failed or skipped passes cannot be presented as a successful clean scan. Development mount cleanup was adjusted to avoid invalidating an initial upload during React Strict Mode's effect rehearsal while retaining cancellation and commit guards on real unmount.
