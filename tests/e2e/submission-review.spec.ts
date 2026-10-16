import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

test('clearing during PNG encoding prevents a stale download and export-state restoration', async ({ page }) => {
  await page.goto('/'); await page.getByLabel('Upload screenshot', { exact: true }).setInputFiles({ name: 'developer.png', mimeType: 'image/png', buffer: await fs.readFile('public/demos/developer.png') });
  await expect(page.getByText('Analysis complete · review before sharing', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      original.call(this, blob => { (window as unknown as { releaseExport: () => void }).releaseExport = () => callback(blob); }, type, quality);
    };
  });
  let downloads = 0; page.on('download', () => { downloads++; });
  await page.getByRole('button', { name: 'Export redacted PNG' }).click();
  await page.waitForFunction(() => typeof (window as unknown as { releaseExport?: () => void }).releaseExport === 'function');
  await expect(page.getByText('Flattening redactions into PNG…')).toBeVisible();
  await page.getByRole('button', { name: 'Clear session' }).click();
  await page.evaluate(async () => { (window as unknown as { releaseExport: () => void }).releaseExport(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  expect(downloads).toBe(0);
  await expect(page.getByText('Ready when you are')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check redacted image' })).toHaveCount(0);
  await expect(page.locator('.export-feedback')).toHaveCount(0);
});

test('selected previews stay opaque on focus and explain detection coverage', async ({ page }) => {
  await page.goto('/'); await page.getByLabel('Upload screenshot', { exact: true }).setInputFiles({ name: 'developer.png', mimeType: 'image/png', buffer: await fs.readFile('public/demos/developer.png') });
  await expect(page.getByText('Analysis complete · review before sharing', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Redact Possible credential', exact: true }).focus();
  await expect(page.locator('rect.selected.focused')).not.toHaveCount(0);
  for (const fill of await page.locator('rect.selected').evaluateAll(rects => rects.map(r => getComputedStyle(r).fill))) expect(fill).toBe('rgb(0, 0, 0)');
  await expect(page.getByText(/Names, unlabelled identifiers, and other details may be missed/)).toBeVisible();
});

test('stalled demo fetch times out with a recoverable error', async ({ page }) => {
  await page.clock.install();
  let release: () => void = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/demos/developer.png', async route => { await held; await route.abort(); });
  try {
    await page.goto('/'); await page.getByRole('button', { name: /Developer terminal/ }).click();
    await expect(page.getByText('Loading synthetic demo…')).toBeVisible();
    await page.clock.fastForward(20_001);
    await expect(page.locator('.notice[role="alert"]')).toContainText('Demo download timed out');
    await expect(page.getByRole('button', { name: 'Choose image' })).toBeEnabled();
    await page.getByRole('button', { name: 'Clear session' }).click();
    await expect(page.getByText('Ready when you are')).toBeVisible();
  } finally { release(); }
});
