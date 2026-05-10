// tests/e2e/fixtures.ts
import { chromium, type BrowserContext, type Worker } from '@playwright/test';
import { test as base } from '@playwright/test';
import path from 'path';

const EXT_PREFIX = 'chrome-extension://';

async function findExtensionWorker(context: BrowserContext): Promise<Worker> {
  const present = context.serviceWorkers().find(w => w.url().startsWith(EXT_PREFIX));
  if (present) return present;
  return await context.waitForEvent('serviceworker', {
    predicate: (w: Worker) => w.url().startsWith(EXT_PREFIX),
    timeout: 30_000
  });
}

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  extensionWorker: Worker;
}>({
  context: async ({}, use) => {
    const pathToExt = path.resolve('dist');
    const headless = !!process.env.HEADLESS;
    const ctx = await chromium.launchPersistentContext('', {
      headless,
      args: [
        `--disable-extensions-except=${pathToExt}`,
        `--load-extension=${pathToExt}`
      ]
    });
    // Forward page console + page errors so test failures show context.
    ctx.on('page', (page) => {
      page.on('console', (m) => console.log(`[page:${m.type()}]`, m.text()));
      page.on('pageerror', (e) => console.log('[page:error]', e.message));
    });
    await use(ctx);
    await ctx.close();
  },
  extensionWorker: async ({ context }, use) => {
    const sw = await findExtensionWorker(context);
    await use(sw);
  },
  extensionId: async ({ extensionWorker }, use) => {
    const id = new URL(extensionWorker.url()).host;
    await use(id);
  }
});

export const expect = test.expect;
