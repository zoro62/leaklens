import { test, expect } from '@playwright/test';

test('real Gemini route accepts local origin and rejects a foreign origin without provider calls', async ({ request, baseURL }) => {
  // Malformed input cannot invoke the provider, even when a real key is configured.
  const local = await request.post('/api/gemini', { headers: { origin: baseURL! }, data: { unexpected: 'rejected' } });
  expect([400, 503]).toContain(local.status());
  const foreign = await request.post('/api/gemini', { headers: { origin: 'https://example.com' }, data: {} });
  expect(foreign.status()).toBe(403);
});

test('Gemini requires consent, sends only abstract evidence, and retains local findings on failure', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/gemini', async route => {
    calls++;
    const data = route.request().postDataJSON();
    expect(Object.keys(data).sort()).toEqual(['categories', 'incomplete', 'rules']);
    expect(JSON.stringify(data)).not.toMatch(/example\.com|API_KEY|boxes|evidence/);
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Gemini is not configured. Local analysis remains available.' }) });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Developer terminal/ }).click();
  const coach = page.getByRole('region', { name: 'Gemini review coach' });
  await expect(coach).toBeVisible();
  const button = coach.getByRole('button', { name: 'Prioritise review with Gemini' });
  await expect(button).toBeDisabled(); expect(calls).toBe(0);
  await coach.getByRole('checkbox').check(); await button.click();
  await expect(coach.getByRole('status')).toContainText('not configured'); expect(calls).toBe(1);
  await expect(page.getByRole('checkbox', { name: 'Redact Possible credential', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Clear session' }).click(); await expect(coach).toHaveCount(0);
});
