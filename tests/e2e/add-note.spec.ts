// tests/e2e/add-note.spec.ts
import { test, expect } from './fixtures';

test('open panel and add a note on a YouTube watch page', async ({ context, extensionWorker }) => {
  const page = await context.newPage();
  await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.waitForSelector('#movie_player video');

  // Trigger toggle-panel from the SW directly. This bypasses the action
  // click, so activeTab is not granted and captureVisibleTab will fail —
  // saveNew falls back to a placeholder PNG, which is the production
  // behaviour we want to verify here too.
  await extensionWorker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id!, { type: 'toggle-panel' });
  });

  const host = page.locator('#knitnote-panel-host');
  await expect(host).toBeVisible();

  await host.evaluate((el) => (el.shadowRoot!.querySelector('button.vn-add') as HTMLButtonElement).click());

  await host.evaluate((el) => {
    const ta = el.shadowRoot!.querySelector('textarea') as HTMLTextAreaElement;
    ta.value = 'Hello from E2E';
    ta.dispatchEvent(new Event('input'));
  });
  await host.evaluate((el) => {
    const btn = Array.from(el.shadowRoot!.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Save') as HTMLButtonElement;
    btn.click();
  });

  await page.waitForFunction(() => {
    const h = document.getElementById('knitnote-panel-host');
    return h?.shadowRoot?.querySelector('.vn-note-text')?.textContent?.includes('Hello from E2E');
  }, { timeout: 10_000 });
});
