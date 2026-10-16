# LeakLens threat model

## Assets and boundary

The source raster, decoded QR payload, OCR text, findings, and exported PNG are sensitive session data. The browser is the processing boundary. The app server serves source code, fixture images and engine assets; it has no image upload endpoint. An optional local-only Gemini route forwards consented abstract counts and rule IDs; it never receives image evidence. Third-party browser extensions, a compromised browser/OS, and maliciously modified app dependencies are outside this prototype's protection boundary.

## Threats and mitigations

| Threat | Implemented mitigation | Residual limitation |
| --- | --- | --- |
| Accidental disclosure through screenshot text or QR | Local OCR, QR decoding, conservative detectors, linked evidence, manual review | Tiny text, OCR mistakes, unsupported scripts and unrecognised data can be missed |
| Reversible cosmetic redaction | New original-size canvas, opaque black fills, flattened PNG export | User can leave a finding unselected or miss a region |
| QR remains readable after partial masking | Whole-code bounding rectangle, six-percent/minimum 12px padding; shared QR selections | Damaged, stylised or small codes may not be found |
| Untrusted decoded content runs instructions or navigation | React text rendering, no HTML injection, no automatic link opening, no live credential checks | Users can still manually copy text elsewhere |
| Content sent to a server or persisted | No upload endpoint, analytics, localStorage or IndexedDB writes; OCR cache disabled; self-hosted assets | Browser/dev-server fetch logs show public asset paths, not image content; browser memory and downloaded files remain under browser/OS control |
| Stale result overwrites another image | Monotonic revision invalidation, owned workers terminated on replacement/clear, separate export recheck state | Cancellation does not promise secure memory erasure |
| Malformed/large file exhausts resources | MIME and magic-byte validation, still-image format allowlist, chunk checks for PNG/WebP animation, 15MB compressed and 25MP decoded limits, analysis downscale, processing timeouts | Browser must decode before final pixel-limit validation; malicious codecs and resource exhaustion remain residual risks |
| Overconfident security advice | Severity separate from rule confidence, uncertain address heuristic marked as inference, independent failed-stage status, no safety score | Relationships are proximity heuristics, not verified account or identity impacts |
| Original content accidentally shared via comparison | Comparison explicitly labels original content private; only the flattened PNG blob is downloaded; edits/clear revoke preview URLs | Taking a screenshot of the comparison may reveal the original; share the PNG artifact instead |
| Preset removes existing coverage or checklist implies safety | Additive presets, undoable batches, linked whole-QR selections, explicit user-only optional review prompts | Users can still manually deselect or dismiss findings; completing prompts is not a safety guarantee |
| Thorough scan hides missing tiles or stale results | Bounded overlapping tiles, native-coordinate merging, failed-pass propagation, cancellation and partial statuses | Crop boundaries, time limits and OCR variations can still miss or duplicate findings |

## Deployment assumptions

Serve trusted builds over HTTPS except localhost. Keep the lockfile reviewed and dependencies updated. Retain engine licence notices. Do not add remote fonts, analytics, image proxies, or image logging without revisiting the privacy claim. The app is a hackathon prototype, not a forensic scrubber or guarantee that every leak is found.

Optional Gemini is disabled by default. The route requires a loopback URL and matching Origin, rejects nonlocal forwarding headers, accepts a strict bounded summary, limits calls to 10/hour per process with one in flight, and uses a 20-second provider timeout. AI can only reorder allowed advice IDs. Do not enable on a public deployment: local guards and process quotas are not authentication or distributed cost controls. See GEMINI.md.
