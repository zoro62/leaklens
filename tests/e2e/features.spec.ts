import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import sharp from 'sharp';
type ArtifactProbe = { created: Map<string, Blob>; revoked: string[] };
async function upload(page: import('@playwright/test').Page, name: string) {
  await page.getByLabel('Upload screenshot', { exact: true }).setInputFiles({ name: `${name}.png`, mimeType: 'image/png', buffer: await fs.readFile(`public/demos/${name}.png`) });
  await expect(page.getByText('Analysis complete · review before sharing', { exact: true })).toBeVisible();
}
async function wideFixture() {
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="3200" height="900"><rect width="100%" height="100%" fill="white"/><text x="60" y="100" font-family="Arial" font-size="32">SYNTHETIC DEMO / THOROUGH SCAN</text><text x="1430" y="420" font-family="Arial" font-size="30">alex@example.com</text><text x="2700" y="650" font-family="Arial" font-size="30">PNR: DEMO7X</text></svg>`)).png().toBuffer();
}
test('presets and batch actions are additive, undoable and keep QR selections linked', async ({ page }) => {
  await page.goto('/'); await upload(page, 'travel');
  await page.getByRole('checkbox', { name: 'Redact QR · plain text', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Cover all QR codes', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Redact QR · plain text', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Undo redaction edit' }).click();
  await expect(page.getByRole('checkbox', { name: 'Redact QR · plain text', exact: true })).not.toBeChecked();
  await page.getByLabel('Sharing purpose', { exact: true }).selectOption('ticket');
  await page.getByRole('button', { name: 'Add suggested selections', exact: true }).click();
  for (const input of await page.locator('.finding-list input[type=checkbox]').all()) await expect(input).toBeChecked();
  await page.getByRole('button', { name: 'Restore default selections', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Redact QR · plain text', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Select all contact details', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Redact Email address', exact: true })).toBeChecked();
});

test('comparison uses the actual downloadable PNG and redaction edits invalidate it and review prompts', async ({ page }) => {
  await page.goto('/'); await upload(page, 'developer');
  await page.evaluate(() => {
    const state: ArtifactProbe = { created: new Map(), revoked: [] };
    (window as unknown as { artifactProbe: ArtifactProbe }).artifactProbe = state;
    const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
    URL.createObjectURL = blob => { const url = create(blob); if (blob instanceof Blob) state.created.set(url, blob); return url; };
    URL.revokeObjectURL = url => { state.revoked.push(url); revoke(url); };
  });
  let downloads = 0; page.on('download', () => { downloads++; });
  await expect(page.getByRole('checkbox', { name: 'Inspected the flattened PNG preview', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Preview before downloading', exact: true }).click();
  const comparison = page.getByRole('region', { name: 'Before and after comparison' }); await expect(comparison).toBeVisible(); expect(downloads).toBe(0);
  await page.getByRole('slider', { name: 'Before and after slider' }).fill('0');
  const image = page.getByRole('img', { name: 'Actual flattened redacted PNG', exact: true });
  const url = await image.getAttribute('src');
  const previewBytes = await page.evaluate(async source => Array.from(new Uint8Array(await (window as unknown as { artifactProbe: ArtifactProbe }).artifactProbe.created.get(source!)!.arrayBuffer())), url);
  await page.getByRole('checkbox', { name: 'Inspected the flattened PNG preview', exact: true }).check();
  const d = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download reviewed PNG' }).click();
  const exported = await fs.readFile((await (await d).path())!); expect(exported.equals(Buffer.from(previewBytes))).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('checkbox', { name: 'Redact Email address', exact: true }).uncheck();
  await expect(comparison).toHaveCount(0); await expect(page.getByRole('checkbox', { name: 'Inspected the flattened PNG preview', exact: true })).not.toBeChecked();
  expect(await page.evaluate(source => (window as unknown as { artifactProbe: ArtifactProbe }).artifactProbe.revoked.includes(source!), url)).toBe(true);
});

test('exposure map highlights linked evidence and supports keyboard focus', async ({ page }) => {
  await page.goto('/'); await upload(page, 'developer');
  const map = page.getByRole('region', { name: 'Exposure connection map' }); await expect(map).toBeVisible();
  await map.getByRole('button', { name: 'Why are these connected?', exact: true }).click();
  await expect(page.locator('rect.linked')).not.toHaveCount(0);
  await map.getByRole('button', { name: /Possible credential/ }).focus();
  await expect(page.locator('rect.focused')).not.toHaveCount(0);
  await expect(map).toContainText('does not establish an active credential');
  await map.getByRole('button', { name: 'Why are these connected?', exact: true }).click();
  await expect(page.locator('rect.linked')).toHaveCount(0);
});

test('thorough mode performs real full-resolution tile scans, restores coordinates and deduplicates overlap', async ({ page }) => {
  const png = await wideFixture();
  await page.goto('/'); await page.getByLabel('Scan depth', { exact: true }).selectOption('thorough');
  await page.getByLabel('Upload screenshot', { exact: true }).setInputFiles({ name: 'thorough.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByText('Analysis complete · review before sharing', { exact: true })).toBeVisible();
  await expect(page.locator('.scan-detail')).toContainText('thorough · 2/2 tiles');
  await expect(page.getByRole('checkbox', { name: 'Redact Email address', exact: true })).toHaveCount(1);
  await expect(page.getByRole('checkbox', { name: 'Redact Booking reference', exact: true })).toBeChecked();
  const email = await page.locator('rect').filter({ has: page.locator('title', { hasText: 'Email address' }) }).first().getAttribute('x');
  expect(Number(email)).toBeGreaterThan(1420);
  const d = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export redacted PNG', exact: true }).click();
  const output = await sharp(await fs.readFile((await (await d).path())!)).metadata(); expect([output.width, output.height]).toEqual([3200, 900]);
  await page.getByRole('button', { name: 'Manual rectangle tool' }).click(); await page.getByRole('button', { name: 'Add rectangle', exact: true }).click();
  await page.getByRole('button', { name: 'Rescan at selected depth', exact: true }).click();
  await expect(page.getByText('Analysis complete · review before sharing', { exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Redact Manual redaction', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Clear session' }).click();
  await expect(page.getByRole('region', { name: 'Before and after comparison' })).toHaveCount(0);
});

test('one failed thorough OCR tile leaves a partial scan even if other passes succeed', async ({ page }) => {
  let loads = 0;
  await page.route('**/engine/eng.traineddata.gz', route => ++loads === 2 ? route.abort() : route.continue());
  await page.goto('/'); await page.getByLabel('Scan depth', { exact: true }).selectOption('thorough');
  await page.getByLabel('Upload screenshot', { exact: true }).setInputFiles({ name: 'partial.png', mimeType: 'image/png', buffer: await wideFixture() });
  await expect(page.getByText('Partial analysis · checks failed', { exact: true })).toBeVisible();
  await expect(page.locator('.scan-detail')).toContainText('OCR: failed · QR: complete');
  await expect(page.getByText(/Tile 1: OCR failed/)).toBeVisible();
  await expect(page.getByText('Analysis complete · review before sharing', { exact: true })).toHaveCount(0);
});

test('clear during a thorough tile cancels the pass and prevents stale results', async ({ page }) => {
  let loads = 0, release: () => void = () => {}, started: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; }), reachedTile = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/engine/eng.traineddata.gz', async route => { if (++loads === 2) { started(); await gate; } await route.continue(); });
  try {
    await page.goto('/'); await page.getByLabel('Scan depth', { exact: true }).selectOption('thorough');
    await page.getByLabel('Upload screenshot', { exact: true }).setInputFiles({ name: 'cancel.png', mimeType: 'image/png', buffer: await wideFixture() });
    await reachedTile;
    await page.getByRole('button', { name: 'Clear session' }).click(); release();
    await expect(page.getByText('Ready when you are')).toBeVisible();
    await expect(page.locator('.finding-list input')).toHaveCount(0);
    await expect(page.getByLabel('Scan depth', { exact: true })).toHaveValue('standard');
  } finally { release(); }
});
