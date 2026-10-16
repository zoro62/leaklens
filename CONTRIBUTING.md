# Contributing to LeakLens

Use Node.js 22+ and npm, then run `npm ci` and `npm run dev`.

Before opening a pull request, run:

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

The browser tests default to installed Chrome; see the README for alternate Playwright browser channels. Demo assets can be regenerated with `npm run fixtures`.

Keep image handling, OCR/QR, detection and redaction on-device. Do not introduce analytics, content logs, screenshot persistence, automatic QR navigation or live credential checks. Render evidence as text and preserve original raster coordinates. Any new relationship rule must link to concrete findings and explain its limits.

Add synthetic positive and negative examples for detector changes. Use meaningful export/coordinate regressions for changes that affect coverage. Never commit real credentials, tickets, private screenshots, addresses or customer records. Generated engines, dependency folders, build output and test artifacts stay ignored.

Describe implemented behaviour and measured checks accurately. Do not describe a clean scan or completed review prompts as a guarantee that an image is safe.
