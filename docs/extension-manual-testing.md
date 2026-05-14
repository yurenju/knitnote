# Manual Extension Testing via playwright-cli

How to launch a chromium browser with the KnitNote extension auto-loaded
and drive it from the terminal. Use this whenever you change content
scripts, MAIN-world hooks, IndexedDB schema, or anything that needs a real
chromium environment to verify.

This is the workflow that finally surfaced two bugs that unit + e2e tests
missed: the `world: 'MAIN'` script not loading without bundled chromium,
and YouTube using XHR not fetch for `/api/timedtext`.

## Setup (once)

`.playwright-cli/config.json` already exists in this repo:

```json
{
  "browser": {
    "browserName": "chromium",
    "launchOptions": {
      "headless": false,
      "args": [
        "--disable-extensions-except=dist",
        "--load-extension=dist"
      ]
    }
  }
}
```

Two non-obvious requirements:

1. **No `channel: 'chrome'`** — must use Playwright's bundled chromium.
   Real Chrome silently drops `--load-extension` under Playwright control.
2. **playwright-cli's chromium must be installed**:
   `npx playwright-cli install-browser chromium` (one-off, ~110 MB).
3. **Run playwright-cli from the repo root** — the extension paths above
   are relative to the working directory.
4. **In a git worktree, the relative `dist` path does not resolve** — Chromium
   inherits its own binary directory as CWD, so it looks for `dist` next to
   `chrome.exe` and fails with "資訊清單檔案遺失" (manifest missing). Before
   launching, temporarily replace `dist` in `.playwright-cli/config.json` with
   the worktree's absolute `dist` path (`pwd` + `/dist`). Revert before
   committing — the relative form is correct for the main repo and we don't
   want a worktree-specific path baked into the shared config.

## Workflow

```bash
# 1. Build the extension into dist/
npm run build

# 2. Close any stale playwright sessions
npx playwright-cli close-all

# 3. Launch with extension + open the test video
npx playwright-cli open --persistent --config=.playwright-cli/config.json \
  https://www.youtube.com/watch?v=igO8iyca2_g

# 4. Verify extension loaded
npx playwright-cli --raw run-code \
  "async page => page.evaluate(() => !!document.getElementById('knitnote-panel-host'))"
# expect: false (panel not yet mounted, but script ran without error)

# 5. Confirm MAIN-world hook installed
npx playwright-cli console 2>&1 | grep knitnote
# expect: [LOG] [knitnote] main-world fetch hook installed
```

## Driving the panel without a real toolbar click

`chrome.action.onClicked` doesn't fire from playwright-cli. Trigger the
toggle-panel message via the SW instead:

```bash
npx playwright-cli --raw run-code "async page => {
  const sw = page.context().serviceWorkers().find(w => w.url().startsWith('chrome-extension://'));
  return sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id, { type: 'toggle-panel' });
    return 'sent';
  });
}"
```

The panel mounts inside a shadow DOM, so the standard `playwright-cli
snapshot` won't see it. Drive it through the shadow root:

```bash
# click "+ 新增筆記"
npx playwright-cli --raw run-code "async page => {
  await page.locator('#knitnote-panel-host').evaluate(el => {
    el.shadowRoot.querySelector('button.vn-add').click();
  });
  return 'clicked';
}"

# fill the textarea
npx playwright-cli --raw run-code "async page => {
  await page.locator('#knitnote-panel-host').evaluate(el => {
    const ta = el.shadowRoot.querySelector('textarea');
    ta.value = 'auto test';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return 'filled';
}"

# click Save
npx playwright-cli --raw run-code "async page => {
  await page.locator('#knitnote-panel-host').evaluate(el => {
    Array.from(el.shadowRoot.querySelectorAll('button'))
      .find(b => b.textContent?.trim() === 'Save').click();
  });
  return 'saved';
}"
```

## Inspecting state

```bash
# console log filtered to extension messages
npx playwright-cli console 2>&1 | grep knitnote

# all network requests (filter as needed, e.g. timedtext)
npx playwright-cli requests 2>&1 | grep timedtext

# response body of request N (1-indexed list from `requests`)
npx playwright-cli response-body 199

# read IndexedDB from the extension SW (where transcripts/screenshots live)
npx playwright-cli --raw run-code "async page => {
  const sw = page.context().serviceWorkers().find(w => w.url().startsWith('chrome-extension://'));
  return sw.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('knitnote', 2);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(['transcripts'], 'readonly');
    const store = tx.objectStore('transcripts');
    const all = await new Promise(resolve => {
      const r = store.getAll();
      r.onsuccess = () => resolve(r.result);
    });
    return all.map(r => ({
      videoId: r.videoId,
      status: r.status,
      languageCode: r.languageCode,
      translationLanguage: r.translationLanguage,
      segmentCount: r.segments.length
    }));
  });
}"
```

## Triggering captions for transcript capture

The transcript trigger only fires on the first note for a video, AND it
only succeeds if a `/api/timedtext` request with a valid `pot=` token has
been intercepted before the note is saved. So **enable CC before writing
the note**:

```bash
# find the CC button via snapshot, then click its ref
npx playwright-cli snapshot 2>&1 | grep -i 字幕
# example output: button "未提供字幕/隱藏式輔助字幕" [ref=e33]
npx playwright-cli click e33

# wait a moment, then verify the URL was captured
sleep 2
npx playwright-cli console 2>&1 | grep "captured timedtext"
# expect: [LOG] [knitnote] captured timedtext base URL for video <id>
```

## Copy-transcript button

1. Open a video with a transcript → toggle the panel → click the 📋 button
2. Button should briefly show `⏳`, then `✓ 已複製 N 段` for ~1.5s, then revert
3. Paste into a text editor; verify the format:
   - `# <title>` / `頻道: ...` / `網址: ...` header, blank line
   - One `[HH:MM:SS] text` line per segment
4. Open a video without a transcript (e.g. some Shorts) → click 📋 → button
   should show `⚠️ 此影片無逐字稿` for ~2.5s

If the button stays in `⏳`, check the console for `[knitnote]` errors —
likely YouTube changed the transcript panel DOM and the selectors in
`src/content/transcript-dom-scraper.ts` need updating.

## Cleanup

```bash
npx playwright-cli close-all
# profile dir at .playwright-cli/profile (gitignored) — delete if you
# want a fresh state next time
```

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `chrome://extensions` shows empty list | `channel: 'chrome'` in config — remove it |
| `Browser "chromium" is not installed` | `npx playwright-cli install-browser chromium` |
| `__knitnoteFetchHooked` is undefined in console | extension didn't load; check chrome://extensions first |
| Extension loaded but no `captured timedtext` log when CC enabled | YouTube changed transport; check `playwright-cli requests` for the timedtext URL and verify its `type:` |
| `ensureTranscript` reports cache miss | CC wasn't enabled before save, or cache reset across navigations |
