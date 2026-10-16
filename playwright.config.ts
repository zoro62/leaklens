import { defineConfig } from '@playwright/test';
const baseURL = process.env.LEAKLENS_TEST_URL || 'http://127.0.0.1:3000';
export default defineConfig({ testDir: './tests/e2e', timeout: 180_000, expect: { timeout: 120_000 }, workers: 1, use: { baseURL, headless: true, viewport: { width: 1440, height: 1000 }, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' }, webServer: { command: `npm run dev -- --port ${new URL(baseURL).port || '3000'}`, url: baseURL, reuseExistingServer: true, timeout: 120_000 } });
