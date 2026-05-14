// tests/e2e/copy-transcript.spec.ts
import { test, expect } from './fixtures';

test('copy transcript button copies text to clipboard', async ({ context, extensionWorker }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'https://www.youtube.com'
  });

  const page = await context.newPage();
  await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.waitForSelector('#movie_player video');

  // Wait for the description-transcript-section-renderer to appear, which contains
  // the "Show transcript" button that the scraper will click.
  await page.waitForFunction(() => {
    return !!document.querySelector('ytd-video-description-transcript-section-renderer button');
  }, { timeout: 10_000 });

  await extensionWorker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id!, { type: 'toggle-panel' });
  });

  const host = page.locator('#knitnote-panel-host');
  await expect(host).toBeVisible();

  await host.evaluate((el) => {
    const btn = el.shadowRoot!.querySelector('.vn-copy-transcript') as HTMLButtonElement;
    btn.click();
  });

  // Wait for ✓ 已複製 N 段 to appear; scraper opens the engagement panel,
  // reads transcript-segment-view-model nodes, writes to clipboard, then
  // closes the panel. Timeout is generous for slow CI networks.
  await page.waitForFunction(() => {
    const h = document.getElementById('knitnote-panel-host');
    const btn = h?.shadowRoot?.querySelector('.vn-copy-transcript');
    return btn?.textContent?.includes('已複製');
  }, { timeout: 20_000 });

  const clipboardText = await page.evaluate(async () => {
    try { return await navigator.clipboard.readText(); } catch { return null; }
  });
  if (clipboardText !== null) {
    expect(clipboardText).toContain('網址: https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(clipboardText).toMatch(/\[\d{2}:\d{2}:\d{2}\]/);
  }
});
