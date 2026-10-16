# Verification record

Verified locally on Windows using Node.js 25.8.1, npm 11.11.0, and installed Google Chrome through Playwright.

| Command | Observed outcome |
| --- | --- |
| `node scripts/prepare-assets.mjs` | Same-origin OCR/QR assets and engine licence files copied successfully |
| `npm run fixtures` | Six raster PNG fixtures generated successfully (four demos plus railway and thorough regressions) |
| `npm test` | 34 unit tests passed |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed without warnings |
| `npm run build` | Passed; `/` statically prerendered, client workers bundled |
| `npm run test:e2e` against development server | Prior baseline suite and targeted new-feature tests passed; development-only mount cleanup race was corrected during follow-up |
| `npm run test:e2e` against `npm start` production server | All 18 browser tests passed, including new comparison, presets, batches, exposure map, real full-resolution tiles, failed-tile propagation and tile cancellation |
| `node scripts/evaluate-fixtures.mjs` | All four fixtures completed OCR and QR; observations saved to `fixture-results.json` |

The browser suite verifies opaque manual redaction pixels, an unchanged source pixel, full export dimensions, and one QR before / zero QR after export using independent ZXing decoding. It also exercises source-image replacement, independent OCR failure, clear session, delayed demo invalidation, upload errors, JPEG orientation, static WebP, mobile layout and no third-party HTTP requests during a control scan.

Initial npm network access and a Playwright browser download were denied by the execution environment. The user installed npm dependencies manually; tests used already-installed Chrome. An attempted offline lockfile refresh lacked an optional platform package in cache; dependency resolutions were retained and only root project name/licence metadata was updated to match `package.json`.

Fixture generation emitted Fontconfig warnings about unwritable system font caches, but completed and the PNGs were visually inspected. This may affect font-cache performance, not the measured browser checks. Desktop and mobile screenshots were visually reviewed.

This is local synthetic verification, not a security certification, universal QR-unreadability guarantee, or real-world accuracy benchmark. No external credential service or private screenshot was used.

## Railway follow-up

A user-supplied ticket was subsequently checked locally in memory to reproduce missed reference/train fields. Both new findings were detected and selected; every pixel in their detected word boxes was independently confirmed opaque black in the exported PNG. The source image, its OCR contents and its identifiers were not saved into the project. Automated regression tests use an entirely synthetic railway fixture with a covered PNR label. Production build, type checking and lint passed after this change. No live booking system was contacted.

## Review-feature follow-up

- The comparison test captures the actual PNG Blob passed to the browser object URL, compares its bytes to the downloaded file, and verifies that edits revoke its URL and reset the review prompts. It also checks mobile overflow.
- Preset and batch tests verify additive selection, undo, defaults and shared whole-QR selection.
- Exposure-map tests verify focus correspondence and linked-region highlights without raw values in the graph.
- A 3200×900 synthetic image produces a real overview plus two native-resolution tile passes. The test verifies one merged email finding, an original-coordinate box and full-resolution export, then confirms manual rectangles survive a rescan.
- A deliberately failed native OCR tile leaves the combined scan partial. Clear during a held tile prevents stale findings from returning.
- New unit coverage checks complete tile-edge coverage, bounded tile counts, offset restoration, spatial deduplication, QR identity merging and selection policy.

Thorough mode is additional processing, not a measured real-world accuracy improvement. Synthetic checks do not establish coverage on arbitrary screenshots.
