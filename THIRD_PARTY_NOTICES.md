# Third-party engine assets

`scripts/prepare-assets.mjs` copies installed dependencies into the ignored `public/engine/` directory for same-origin delivery. The lockfile records the versions.

- Tesseract.js: Apache-2.0; see `node_modules/tesseract.js/LICENSE.md`.
- Tesseract.js-core / Tesseract: Apache-2.0; see `node_modules/tesseract.js-core/LICENSE`.
- English trained data: distributed by `@tesseract.js-data/eng` (package declares MIT); upstream Tesseract tessdata is Apache-2.0. See the package's linked source repository.
- ZXing WASM / ZXing-C++: MIT and Apache-2.0 components; see installed `zxing-wasm` licence and its bundled dependency notices.

These licences apply to their respective components, independently of the project's MIT licence. The preparation script copies available licence files beside the local engine assets.
