// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  // MV3 extension service workers do not reliably wake up in Playwright
  // headless mode, so E2E defaults to headed. Set HEADLESS=1 to opt in.
  use: { headless: !!process.env.HEADLESS }
});
