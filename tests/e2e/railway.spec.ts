import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import sharp from 'sharp';

test('railway numbers with covered labels are selected and exported as opaque pixels', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Upload screenshot', { exact: true }).setInputFiles({ name: 'railway.png', mimeType: 'image/png', buffer: await fs.readFile('public/demos/railway.png') });
  await expect(page.getByText('Analysis complete · review before sharing', { exact: true })).toBeVisible();
  for (const label of ['Possible railway PNR', 'Train number / name']) await expect(page.getByRole('checkbox', { name: `Redact ${label}`, exact: true })).toBeChecked();
  const boxes = await page.locator('svg rect.region.selected').evaluateAll(rectangles => rectangles.map(rectangle => ({ x: Number(rectangle.getAttribute('x')), y: Number(rectangle.getAttribute('y')), width: Number(rectangle.getAttribute('width')), height: Number(rectangle.getAttribute('height')) })));
  expect(boxes.length).toBeGreaterThanOrEqual(2);
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export redacted PNG' }).click();
  const output = await fs.readFile((await (await download).path())!);
  const { data, info } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (const box of boxes) for (let y = Math.floor(box.y); y < Math.ceil(box.y + box.height); y++) for (let x = Math.floor(box.x); x < Math.ceil(box.x + box.width); x++) {
    const at = (y * info.width + x) * 4;
    if (data[at] || data[at + 1] || data[at + 2] || data[at + 3] !== 255) throw new Error('Selected railway text was not fully covered in export.');
  }
});
