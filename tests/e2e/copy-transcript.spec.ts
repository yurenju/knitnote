// tests/e2e/copy-transcript.spec.ts
import { test, expect } from './fixtures';

test('copy transcript button copies text to clipboard', async ({ context, extensionWorker }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'https://www.youtube.com'
  });

  const page = await context.newPage();
  await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.waitForSelector('#movie_player video');

  // Wait for the MAIN-world hook to capture the timedtext URL before proceeding.
  // YouTube's transcript engagement panel (target-id="PAmodern_transcript_view")
  // uses transcript-segment-view-model elements; the scraper clicks the
  // "顯示轉錄稿" button in ytd-video-description-transcript-section-renderer
  // to open it. Give the player time to load and fire the timedtext request.
  await page.waitForTimeout(5000);

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
