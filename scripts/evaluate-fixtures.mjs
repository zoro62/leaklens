import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const measured = [];
try {
  await page.goto(process.env.LEAKLENS_TEST_URL || 'http://127.0.0.1:3000');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await mkdir('docs/screenshots', { recursive: true });
  await page.screenshot({ path: 'docs/screenshots/desktop.png', fullPage: true });
  for (const name of ['Developer terminal', 'Travel ticket', 'Shopping receipt', 'Control image']) {
    await page.getByRole('button', { name: new RegExp(name) }).click();
    await page.getByText('Analysis complete · review before sharing', { exact: true }).waitFor({ timeout: 120_000 });
    const labels = await page.locator('.finding-top strong').allTextContents();
    const groups = await page.locator('.group h3').allTextContents();
    measured.push({ fixture: name, findings: labels.reduce((counts, label) => ({ ...counts, [label]: (counts[label] || 0) + 1 }), {}), groups, stages: await page.locator('.scan-detail').innerText() });
    if (name === 'Developer terminal') {
      await page.getByRole('button', { name: 'Preview before downloading', exact: true }).click();
      await page.getByRole('region', { name: 'Before and after comparison' }).waitFor();
      await page.getByRole('link', { name: 'Exposure map', exact: true }).click();
      await page.getByRole('button', { name: 'Why are these connected?', exact: true }).click();
      await page.screenshot({ path: 'docs/screenshots/feature-review.png', fullPage: true });
    }
    if (name === 'Travel ticket') { await page.locator('.review-content').evaluate(el => { el.scrollTop = 0; }); await page.screenshot({ path: 'docs/screenshots/travel-review.png', fullPage: true }); }
  }
  await page.getByRole('button', { name: 'Clear session' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'docs/screenshots/mobile.png', fullPage: true });
  await writeFile('docs/fixture-results.json', JSON.stringify({ note: 'Synthetic fixture evaluation, not a real-world accuracy benchmark. Times vary by machine.', measured }, null, 2) + '\n');
  console.log(JSON.stringify(measured, null, 2));
} finally { await browser.close(); }
