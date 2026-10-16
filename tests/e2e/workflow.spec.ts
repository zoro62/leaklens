import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
async function fixture(name: string) { return { name: `${name}.png`, mimeType: 'image/png', buffer: await fs.readFile(`public/demos/${name}.png`) }; }

test('real OCR review, dismissal, manual editing, opaque full-resolution export and clear', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Upload screenshot', { exact: true }).setInputFiles(await fixture('developer'));
  await expect(page.getByText('Analysis complete · review before sharing', { exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Redact Possible credential', exact: true })).toBeChecked();
  await page.getByRole('checkbox', { name: 'Redact Email address', exact: true }).uncheck();
  await page.getByRole('article').filter({ has: page.getByRole('checkbox', { name: 'Redact Email address', exact: true }) }).getByRole('button', { name: 'Dismiss', exact: true }).click();
  await page.getByRole('button', { name: 'Manual rectangle tool' }).click();
  await page.getByLabel('Rectangle x', { exact: true }).fill('10'); await page.getByLabel('Rectangle y', { exact: true }).fill('10');
  await page.getByLabel('Rectangle width', { exact: true }).fill('70'); await page.getByLabel('Rectangle height', { exact: true }).fill('25');
  await page.getByRole('button', { name: 'Add rectangle', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Redact Manual redaction' })).toBeChecked();
  await page.getByRole('button', { name: 'Undo redaction edit' }).click(); await expect(page.getByRole('checkbox', { name: 'Redact Manual redaction' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Redo redaction edit' }).click();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export redacted PNG' }).click();
  const file = await download; expect(file.suggestedFilename()).toBe('leaklens-redacted.png');
  const png = await fs.readFile((await file.path())!); const metadata = await sharp(png).metadata(); expect([metadata.width, metadata.height]).toEqual([1200, 620]);
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let y = 10; y < 35; y++) for (let x = 10; x < 80; x++) expect([...data.slice((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)]).toEqual([0, 0, 0, 255]);
  const source = await sharp('public/demos/developer.png').ensureAlpha().raw().toBuffer(); expect([...data.slice(0, 4)]).toEqual([...source.slice(0, 4)]);
  await page.getByRole('button', { name: 'Clear session' }).click(); await expect(page.getByText('Your screenshot deserves')).toBeVisible(); await expect(page.getByRole('checkbox')).toHaveCount(0);
});

test('travel QR is decoded locally and selected redaction prevents exported QR decode', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: /Travel ticket/ }).click();
  await expect(page.getByText('Analysis complete · review before sharing', { exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Redact QR · plain text', exact: true })).toBeChecked();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export redacted PNG' }).click(); const file = await download;
  const png = await fs.readFile((await file.path())!);
  prepareZXingModule({ overrides: { wasmBinary: new Uint8Array(await fs.readFile('public/engine/zxing_reader.wasm')) } });
  const original = await sharp('public/demos/travel.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const input = (p: typeof pixels) => ({ data: new Uint8ClampedArray(p.data), width: p.info.width, height: p.info.height, colorSpace: 'srgb' as const });
  expect(await readBarcodes(input(original), { formats: ['QRCode'] })).toHaveLength(1);
  expect(await readBarcodes(input(pixels), { formats: ['QRCode'] })).toHaveLength(0);
  await page.getByRole('button', { name: 'Check redacted image' }).click();
  await expect(page.getByText(/0 selected text\/QR targets still detected/)).toBeVisible();
  await expect(page.getByText(/Rechecking can identify some missed redactions/)).toBeVisible();
});

test('OCR asset failure stays visibly partial, never clean', async ({ page }) => {
  await page.route('**/engine/eng.traineddata.gz', route => route.abort());
  await page.goto('/'); await page.getByRole('button', { name: /Control image/ }).click();
  await expect(page.getByText('Partial analysis · checks failed', { exact: true })).toBeVisible();
  await expect(page.getByText(/OCR failed. Text could not be checked/)).toBeVisible();
  await expect(page.getByText('Analysis complete · review before sharing', { exact: true })).toHaveCount(0);
});

test('new image and clear invalidate previous asynchronous scans', async ({ page }) => {
  await page.goto('/'); await page.getByLabel('Upload screenshot', { exact: true }).setInputFiles(await fixture('developer'));
  await page.getByLabel('Upload screenshot', { exact: true }).setInputFiles(await fixture('control'));
  await expect(page.getByText('Analysis complete · review before sharing', { exact: true })).toBeVisible();
  await expect(page.getByText('control.png', { exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Redact Possible credential', exact: true })).toHaveCount(0);
  await page.getByLabel('Upload screenshot', { exact: true }).setInputFiles(await fixture('travel'));
  await page.getByRole('button', { name: 'Clear session' }).click(); await expect(page.getByText('Ready when you are')).toBeVisible();
});

test('corrupt and unsupported uploads show actionable errors', async ({ page }) => {
  await page.goto('/'); await page.getByLabel('Upload screenshot', { exact: true }).setInputFiles({ name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
  await expect(page.locator('.notice[role="alert"]')).toContainText('File contents do not match');
  await page.getByLabel('Upload screenshot', { exact: true }).setInputFiles({ name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(page.locator('.notice[role="alert"]')).toContainText('Supported formats');
});

test('control scan makes no third-party requests or secret findings, including on mobile', async ({ page }) => {
  const external: string[] = [];
  await page.route('**/*', route => { const url = new URL(route.request().url()); if (url.protocol.startsWith('http') && url.hostname !== '127.0.0.1') { external.push(url.origin); return route.abort(); } return route.continue(); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/'); await page.getByRole('button', { name: /Control image/ }).click();
  await expect(page.getByText('Analysis complete · review before sharing', { exact: true })).toBeVisible();
  await expect(page.locator('.finding-list').getByRole('checkbox')).toHaveCount(1);
  await expect(page.getByRole('checkbox', { name: 'Redact Service / URL context' })).not.toBeChecked();
  expect(external).toEqual([]);
  expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth, stored: localStorage.length }))).toEqual({ width: 390, viewport: 390, stored: 0 });
});

test('orientation-aware JPEG normalisation and WebP use the decoded raster dimensions', async ({ page }) => {
  await page.goto('/');
  const jpeg = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#ffffff' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  await page.getByLabel('Upload screenshot', { exact: true }).setInputFiles({ name: 'oriented.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(page.getByText('100 × 200 px · original resolution preserved')).toBeVisible();
  const webp = await sharp({ create: { width: 240, height: 160, channels: 3, background: '#ffffff' } }).webp().toBuffer();
  await page.getByLabel('Upload screenshot', { exact: true }).setInputFiles({ name: 'still.webp', mimeType: 'image/webp', buffer: webp });
  await expect(page.getByText('240 × 160 px · original resolution preserved')).toBeVisible();
  await page.getByRole('button', { name: 'Clear session' }).click();
});

test('delayed demo fetch cannot restore an image after clear', async ({ page }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/demos/travel.png', async route => { await gate; await route.continue(); });
  await page.goto('/'); await page.getByRole('button', { name: /Travel ticket/ }).click();
  await expect(page.getByText('Loading synthetic demo…')).toBeVisible();
  await page.getByRole('button', { name: 'Clear session' }).click(); release();
  await expect(page.getByText('Ready when you are')).toBeVisible();
  await expect(page.getByText('travel.png', { exact: true })).toHaveCount(0);
});
