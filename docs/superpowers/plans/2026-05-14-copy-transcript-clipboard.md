# 複製逐字稿到剪貼簿 — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目標:** 在 Panel header 加一顆 📋 按鈕,點擊後抓取目前 YouTube 影片的原文逐字稿、格式化、寫入剪貼簿,供使用者貼到 AI 工具做摘要。

**架構:** DOM 抓取 YouTube 原生「Show transcript」面板(繞過 pot token、預設原文)→ 純函式格式化(header + `[HH:MM:SS] text` 每段一行)→ `navigator.clipboard.writeText`。完全獨立於既有 transcript / IDB / 筆記體系。

**技術棧:** TypeScript、Preact、Vitest、Playwright、Chrome MV3 content script。

**Spec:** [docs/superpowers/specs/2026-05-14-copy-transcript-clipboard-design.md](../specs/2026-05-14-copy-transcript-clipboard-design.md)

---

## 檔案結構

新檔:
- `src/shared/transcript-clipboard.ts` — 純函式格式化(可單元測試)
- `src/content/transcript-dom-scraper.ts` — DOM 抓取邏輯(content-script 範疇)
- `tests/unit/transcript-clipboard.test.ts` — 格式化單元測試
- `tests/e2e/copy-transcript.spec.ts` — Playwright E2E,跑真實 YouTube

修改:
- `src/ui/Panel.tsx` — header 新增 📋 按鈕與狀態管理
- `src/ui/panel.css` — header 按鈕樣式微調
- `src/content/panel-host.ts` — `PanelDeps` 注入 `copyTranscript`

---

## Task 1:格式化純函式 `formatForClipboard`

**檔案:**
- 新增: `src/shared/transcript-clipboard.ts`
- 測試: `tests/unit/transcript-clipboard.test.ts`

- [ ] **Step 1:撰寫失敗測試**

`tests/unit/transcript-clipboard.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatForClipboard } from '../../src/shared/transcript-clipboard';
import type { TranscriptSegment } from '../../src/shared/transcript';

const meta = {
  title: 'Rick Astley - Never Gonna Give You Up',
  channel: 'RickAstleyVEVO',
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
};

function seg(startSec: number, text: string): TranscriptSegment {
  return { startSec, durationSec: 0, text };
}

describe('formatForClipboard', () => {
  it('renders header + timestamped lines', () => {
    const out = formatForClipboard(meta, [
      seg(0, "We're no strangers to love"),
      seg(5, 'You know the rules and so do I')
    ]);
    expect(out).toBe(
      '# Rick Astley - Never Gonna Give You Up\n' +
      '頻道: RickAstleyVEVO\n' +
      '網址: https://www.youtube.com/watch?v=dQw4w9WgXcQ\n' +
      '\n' +
      '[00:00:00] We\'re no strangers to love\n' +
      '[00:00:05] You know the rules and so do I'
    );
  });

  it('formats hour-plus timestamps', () => {
    const out = formatForClipboard(meta, [seg(3725, 'late segment')]);
    expect(out).toContain('[01:02:05] late segment');
  });

  it('handles empty segments by returning header only', () => {
    const out = formatForClipboard(meta, []);
    expect(out).toBe(
      '# Rick Astley - Never Gonna Give You Up\n' +
      '頻道: RickAstleyVEVO\n' +
      '網址: https://www.youtube.com/watch?v=dQw4w9WgXcQ\n'
    );
  });

  it('preserves special characters in title', () => {
    const out = formatForClipboard(
      { ...meta, title: 'Title with "quotes" & #hash' },
      [seg(0, 'hi')]
    );
    expect(out).toContain('# Title with "quotes" & #hash');
  });
});
```

- [ ] **Step 2:跑測試確認失敗**

執行:`npm test -- transcript-clipboard`
預期:FAIL,訊息類似 `Cannot find module '../../src/shared/transcript-clipboard'`

- [ ] **Step 3:寫最小實作**

`src/shared/transcript-clipboard.ts`:

```ts
import type { TranscriptSegment } from './transcript';
import { formatColon } from './timestamp';

export interface ClipboardMeta {
  title: string;
  channel: string;
  url: string;
}

export function formatForClipboard(meta: ClipboardMeta, segments: TranscriptSegment[]): string {
  const header = [
    `# ${meta.title}`,
    `頻道: ${meta.channel}`,
    `網址: ${meta.url}`
  ].join('\n');
  if (segments.length === 0) return header + '\n';
  const body = segments.map(s => `[${formatColon(s.startSec)}] ${s.text}`).join('\n');
  return header + '\n\n' + body;
}
```

- [ ] **Step 4:跑測試確認通過**

執行:`npm test -- transcript-clipboard`
預期:PASS,4 個測試全綠。

- [ ] **Step 5:Commit**

```bash
git add src/shared/transcript-clipboard.ts tests/unit/transcript-clipboard.test.ts
git commit -m "Add formatForClipboard for transcript clipboard export"
```

---

## Task 2:DOM Scraper `scrapeTranscript`

**檔案:**
- 新增: `src/content/transcript-dom-scraper.ts`

此模組重度依賴 YouTube 真實 DOM,**不寫自動化單元測試**(mock YT 的 DOM 既脆弱又沒保護價值)。靠 Task 5 的 E2E 與手動驗證涵蓋。

- [ ] **Step 1:寫實作**

`src/content/transcript-dom-scraper.ts`:

```ts
import type { TranscriptSegment } from '../shared/transcript';

export type ScrapeResult =
  | { status: 'ok'; segments: TranscriptSegment[] }
  | { status: 'unavailable' }
  | { status: 'timeout' };

const SHOW_BUTTON_SELECTORS = [
  'ytd-video-description-transcript-section-renderer button',
  'button[aria-label*="transcript" i]',
  'button[aria-label*="逐字稿"]'
];

const PANEL_SELECTOR = 'ytd-transcript-renderer';
const SEGMENT_SELECTOR = 'ytd-transcript-segment-renderer';
const TIMESTAMP_SELECTOR = '.segment-timestamp';
const TEXT_SELECTOR = '.segment-text';

const PANEL_RENDER_TIMEOUT_MS = 5000;

export async function scrapeTranscript(): Promise<ScrapeResult> {
  const button = findShowTranscriptButton();
  if (!button) return { status: 'unavailable' };

  const panelWasOpen = !!document.querySelector(PANEL_SELECTOR);

  if (!panelWasOpen) {
    button.click();
    const opened = await waitForSegments(PANEL_RENDER_TIMEOUT_MS);
    if (!opened) return { status: 'timeout' };
  }

  const segments = readSegments();

  if (!panelWasOpen) {
    // Try to close the panel we opened. The same button toggles it.
    const closeBtn = findShowTranscriptButton();
    closeBtn?.click();
  }

  if (segments.length === 0) return { status: 'timeout' };
  return { status: 'ok', segments };
}

function findShowTranscriptButton(): HTMLButtonElement | null {
  for (const sel of SHOW_BUTTON_SELECTORS) {
    const el = document.querySelector(sel) as HTMLButtonElement | null;
    if (el) return el;
  }
  return null;
}

function waitForSegments(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const existing = document.querySelector(SEGMENT_SELECTOR);
    if (existing) { resolve(true); return; }

    const observer = new MutationObserver(() => {
      if (document.querySelector(SEGMENT_SELECTOR)) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(true);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(false);
    }, timeoutMs);
  });
}

function readSegments(): TranscriptSegment[] {
  const nodes = document.querySelectorAll(SEGMENT_SELECTOR);
  const out: TranscriptSegment[] = [];
  for (const n of Array.from(nodes)) {
    const tsText = n.querySelector(TIMESTAMP_SELECTOR)?.textContent?.trim() ?? '';
    const text = n.querySelector(TEXT_SELECTOR)?.textContent?.trim() ?? '';
    if (!tsText || !text) continue;
    const startSec = parseTimestamp(tsText);
    if (startSec === null) continue;
    out.push({ startSec, durationSec: 0, text });
  }
  return out;
}

export function parseTimestamp(s: string): number | null {
  const parts = s.split(':').map(p => p.trim());
  if (parts.some(p => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.length === 2) return nums[0] * 60 + nums[1];
  if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2];
  return null;
}
```

- [ ] **Step 2:確認 TypeScript 編譯通過**

執行:`npm run build`
預期:PASS,`dist/` 產出無錯誤。

- [ ] **Step 3:Commit**

```bash
git add src/content/transcript-dom-scraper.ts
git commit -m "Add transcript DOM scraper for YouTube transcript panel"
```

---

## Task 3:Panel header 加 📋 按鈕

**檔案:**
- 修改: `src/ui/Panel.tsx`
- 修改: `src/ui/panel.css`

- [ ] **Step 1:擴充 `PanelDeps` 與狀態型別**

在 `src/ui/Panel.tsx` 檔首附近(`PanelDeps` 介面內),加入新欄位。完整 `PanelDeps` 介面改寫如下:

```ts
export interface PanelDeps {
  videoId: string;
  getVideoMeta: () => { title: string; channel: string; url: string };
  getCurrentSec: () => number;
  pauseVideo: () => boolean;
  playVideo: () => void;
  seekVideo: (sec: number) => void;
  captureScreenshot: () => Promise<Blob>;
  copyTranscript: () => Promise<{ status: 'ok' | 'unavailable' | 'timeout' | 'error'; count?: number }>;
  onClose: () => void;
}
```

`Panel` 函式的解構參數同步加 `copyTranscript`:

```ts
export function Panel({ videoId, getVideoMeta, getCurrentSec, pauseVideo, playVideo, seekVideo, captureScreenshot, copyTranscript, onClose }: PanelDeps) {
```

- [ ] **Step 2:加入狀態與處理函式**

在 `Panel` 函式內、`useEffect` 之後加入:

```ts
type CopyState =
  | { kind: 'idle' }
  | { kind: 'copying' }
  | { kind: 'ok'; count: number }
  | { kind: 'unavailable' }
  | { kind: 'timeout' }
  | { kind: 'error' };

const [copyState, setCopyState] = useState<CopyState>({ kind: 'idle' });
const copyTimerRef = useRef<number | null>(null);

useEffect(() => {
  return () => {
    if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
  };
}, []);

const onCopyTranscript = async () => {
  if (copyState.kind === 'copying') return;
  setCopyState({ kind: 'copying' });
  const result = await copyTranscript();
  if (result.status === 'ok') {
    setCopyState({ kind: 'ok', count: result.count ?? 0 });
    scheduleResetCopyState(1500);
  } else {
    setCopyState({ kind: result.status });
    scheduleResetCopyState(2500);
  }
};

const scheduleResetCopyState = (ms: number) => {
  if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
  copyTimerRef.current = window.setTimeout(() => {
    setCopyState({ kind: 'idle' });
    copyTimerRef.current = null;
  }, ms);
};

const copyButtonLabel = (() => {
  switch (copyState.kind) {
    case 'idle': return '📋';
    case 'copying': return '⏳';
    case 'ok': return `✓ 已複製 ${copyState.count} 段`;
    case 'unavailable': return '⚠️ 此影片無逐字稿';
    case 'timeout': return '⚠️ 載入逾時,請重試';
    case 'error': return '⚠️ 複製失敗';
  }
})();
```

`useState`、`useRef`、`useEffect` 都已在 import 中,無需修改 import。

- [ ] **Step 3:渲染按鈕**

修改 header JSX(目前是 `<div class="vn-panel-header"> ... </div>`),改成:

```tsx
<div class="vn-panel-header">
  <strong>📝 {video && video.notes.length > 0 ? `${video.notes.length} 條筆記` : 'KnitNote'}</strong>
  <div class="vn-panel-header-actions">
    <button
      class="vn-btn-secondary vn-copy-transcript"
      onClick={onCopyTranscript}
      disabled={copyState.kind === 'copying'}
      title="複製逐字稿到剪貼簿"
    >
      {copyButtonLabel}
    </button>
    <button class="vn-btn-secondary" onClick={onClose}>✕</button>
  </div>
</div>
```

- [ ] **Step 4:CSS 微調**

在 `src/ui/panel.css` 結尾加入:

```css
.vn-panel-header-actions { display: flex; gap: 6px; align-items: center; }
.vn-copy-transcript { white-space: nowrap; }
```

- [ ] **Step 5:確認 typecheck 與既有測試通過**

執行(分兩步):

```bash
npm run build
npm test
```

預期:build PASS、所有單元測試 PASS。

- [ ] **Step 6:Commit**

```bash
git add src/ui/Panel.tsx src/ui/panel.css
git commit -m "Add copy-transcript button to Panel header"
```

---

## Task 4:`panel-host.ts` 接線

**檔案:**
- 修改: `src/content/panel-host.ts`

- [ ] **Step 1:Import scraper 與 formatter**

在 `src/content/panel-host.ts` 的 import 區塊新增:

```ts
import { scrapeTranscript } from './transcript-dom-scraper';
import { formatForClipboard } from '../shared/transcript-clipboard';
```

- [ ] **Step 2:在 `deps` 物件加入 `copyTranscript`**

在 `mountPanel` 函式內、`const deps: PanelDeps = { ... }` 中,於 `captureScreenshot` 與 `onClose` 之間插入:

```ts
copyTranscript: async () => {
  const result = await scrapeTranscript();
  if (result.status !== 'ok') return { status: result.status };
  const text = formatForClipboard(deps.getVideoMeta(), result.segments);
  try {
    await navigator.clipboard.writeText(text);
    return { status: 'ok', count: result.segments.length };
  } catch (err) {
    console.warn('[knitnote] clipboard write failed:', err);
    return { status: 'error' };
  }
},
```

注意:`deps.getVideoMeta()` 在這個 closure 中可用,因為 `deps` 已經是被定義的 const,JS closure 會延遲解析到實際呼叫時。

- [ ] **Step 3:確認編譯通過**

執行:`npm run build`
預期:PASS。

- [ ] **Step 4:Commit**

```bash
git add src/content/panel-host.ts
git commit -m "Wire copyTranscript through panel-host"
```

---

## Task 5:Playwright E2E 測試

**檔案:**
- 新增: `tests/e2e/copy-transcript.spec.ts`

- [ ] **Step 1:撰寫 E2E spec**

`tests/e2e/copy-transcript.spec.ts`:

```ts
// tests/e2e/copy-transcript.spec.ts
import { test, expect } from './fixtures';

test('copy transcript button copies text to clipboard', async ({ context, extensionWorker }) => {
  // Pre-grant clipboard permissions for the YouTube origin so writeText
  // does not silently reject in the test browser.
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'https://www.youtube.com'
  });

  const page = await context.newPage();
  await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.waitForSelector('#movie_player video');

  await extensionWorker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id!, { type: 'toggle-panel' });
  });

  const host = page.locator('#knitnote-panel-host');
  await expect(host).toBeVisible();

  // Click the copy-transcript button inside the shadow root.
  await host.evaluate((el) => {
    const btn = el.shadowRoot!.querySelector('.vn-copy-transcript') as HTMLButtonElement;
    btn.click();
  });

  // Wait for the button label to switch to the success state.
  await page.waitForFunction(() => {
    const h = document.getElementById('knitnote-panel-host');
    const btn = h?.shadowRoot?.querySelector('.vn-copy-transcript');
    return btn?.textContent?.includes('已複製');
  }, { timeout: 15_000 });

  // If clipboard read is available, sanity-check the content has the
  // expected header line. Skip the assertion silently if blocked.
  const clipboardText = await page.evaluate(async () => {
    try { return await navigator.clipboard.readText(); } catch { return null; }
  });
  if (clipboardText !== null) {
    expect(clipboardText).toContain('網址: https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(clipboardText).toMatch(/\[\d{2}:\d{2}:\d{2}\]/);
  }
});
```

- [ ] **Step 2:跑 E2E 確認通過**

執行:`npm run e2e`
預期:PASS。測試會自動 build 再跑;Playwright 預設 headed 模式,clipboard read 應可用。

注意:若 Rick Roll 影片的「Show transcript」按鈕在你執行時剛好被 YouTube A/B 實驗移除,本測試會 timeout。此時改抓 `aria-label` 備援選擇器命中的影片,或暫時 skip 此測試並回報。

- [ ] **Step 3:Commit**

```bash
git add tests/e2e/copy-transcript.spec.ts
git commit -m "Add E2E test for copy-transcript button"
```

---

## Task 6:手動驗證並更新文件

**檔案:**
- 修改: `docs/extension-manual-testing.md`(可選,若已有類似流程則不必新增章節)

- [ ] **Step 1:Build + 載入擴充功能**

```bash
npm run build
```

在 Chrome `chrome://extensions` → 開發者模式 → 載入解壓縮的擴充功能 → 選 `dist/`。

- [ ] **Step 2:驗證 happy path**

開啟一支有逐字稿的英文影片,點擴充功能 icon 開 panel,點 📋,預期:

- 按鈕短暫變 `⏳`,接著變 `✓ 已複製 N 段` 持續 1.5 秒。
- YouTube transcript 面板可能短暫閃開又閉合(若使用者原本沒開)。
- 貼到文字編輯器,確認格式為:`# 標題` → `頻道:` → `網址:` → 空行 → `[00:00:00] ...` 每段一行。

- [ ] **Step 3:驗證失敗路徑**

開啟一支沒有逐字稿的影片(例如某些 Shorts 或新上傳影片),點 📋,預期按鈕變 `⚠️ 此影片無逐字稿` 持續 2.5 秒後回 📋。

- [ ] **Step 4:驗證中文/多語影片**

開啟中文影片,確認複製出來的是原文(非翻譯),格式不破。

- [ ] **Step 5:(可選)更新手動測試文件**

若 `docs/extension-manual-testing.md` 適合加一節「複製逐字稿驗證」,新增條列即可:

```markdown
## 複製逐字稿按鈕

1. 開有逐字稿的影片 → 開 panel → 點 📋 → 確認按鈕變「✓ 已複製 N 段」
2. 貼到編輯器確認 header(# 標題、頻道、網址)+ `[HH:MM:SS] text` 每行一段
3. 開沒逐字稿的影片(Shorts)→ 點 📋 → 確認按鈕變「⚠️ 此影片無逐字稿」
```

- [ ] **Step 6:(若有改文件)Commit**

```bash
git add docs/extension-manual-testing.md
git commit -m "Document copy-transcript manual verification steps"
```

---

## 完成檢查

收尾跑一次完整驗證:

```bash
npm run build
npm test
npm run e2e
```

三者皆 PASS 即視為實作完成。
