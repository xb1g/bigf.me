// Playwright e2e for the private Anchor PWA (spec quality gate 3).
// Run: npx playwright test -c playwright.anchor.config.ts
import { defineConfig, chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 4399;
const SYSTEM_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/**
 * Use Playwright's bundled Chromium when it is installed. Otherwise (e.g. the installed browser
 * revision doesn't match this Playwright version) fall back to the system Chrome channel, or to
 * ANCHOR_E2E_CHROME=/path/to/chrome.
 */
function browserLaunch(): { channel?: string; launchOptions?: { executablePath: string } } {
  const custom = process.env.ANCHOR_E2E_CHROME;
  if (custom) return { launchOptions: { executablePath: custom } };
  let bundled = '';
  try { bundled = chromium.executablePath(); } catch { bundled = ''; }
  if (bundled && existsSync(bundled)) return {};
  return existsSync(SYSTEM_CHROME) ? { channel: 'chrome' } : {};
}

export default defineConfig({
  testDir: 'tests',
  testMatch: 'anchor.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  // Keep traces/screenshots of failures out of the repo.
  outputDir: join(tmpdir(), 'anchor-e2e-results'),
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'en-US',
    timezoneId: 'Asia/Bangkok',
    colorScheme: 'dark',
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium', ...browserLaunch() },
    },
  ],
  webServer: {
    command: `npx astro dev --port ${PORT}`,
    url: `http://localhost:${PORT}/anchor/`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
