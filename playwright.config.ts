import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against the PRODUCTION build: the webServer below builds the
 * app and serves it with `vite preview` on port 4173 — never the dev
 * server. Two projects share it: a desktop Chromium and a phone-sized,
 * touch-capable Chromium (Pixel 7 held in landscape).
 *
 * channel: 'chrome' is NOT needed here — the bundled Chromium from the
 * Playwright cache (chromium-1248) is installed; only fall back to the
 * system Chrome if that download is ever missing.
 */
export default defineConfig({
  testDir: 'e2e',
  reporter: [['html'], ['list']],
  // Every test drives the REAL renderer, and the two projects render in
  // parallel (the mobile emulation at 2.625× scale): wall time scales with
  // the machine, so the 30s default is too tight. Heavy geometry tests
  // override it further with test.setTimeout(180_000).
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
    },
  },
  projects: [
    {
      name: 'desktop',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'mobile',
      use: {
        browserName: 'chromium',
        ...devices['Pixel 7'],
        // Pixel 7 in landscape: the portrait viewport with width/height swapped
        viewport: { width: 915, height: 412 },
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'pnpm build && pnpm preview --port 4173',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    // a cold `tsc -b && vite build` needs more than the 60s default
    timeout: 120_000,
  },
});
