# 複製逐字稿到剪貼簿 — 設計文件

日期:2026-05-14

## 動機

使用者在看 YouTube 影片時,想要快速把整支影片的逐字稿複製出來,丟給 AI 工具做摘要。這是個「即時取得、用完即丟」的工具,跟現有筆記體系(Zettelkasten、IDB 持久化、Markdown 匯出)是獨立的兩條線。

跟現有 transcript 功能的關鍵差異:

- **語言**:現有功能會根據 `Settings.transcriptPreferredLang` 把字幕翻譯成使用者偏好語言(供自己閱讀)。本功能要的是**原文**,因為 AI 處理原文比處理翻譯版品質更好。
- **儲存**:現有功能會把 `TranscriptRecord` 寫入 IDB,本功能完全不存。
- **觸發時機**:現有功能在第一次儲存筆記時觸發,本功能由使用者主動點按鈕觸發。

## 範圍

- 在 Panel header 新增一個 📋 按鈕,點擊後抓取目前影片的完整原文逐字稿,格式化後寫入剪貼簿。
- 抓取方式採用 DOM 抓取 YouTube 自己的「Show transcript」面板,**不**重用現有的 MAIN-world `/api/timedtext` 攔截路徑。

## 非範圍

- 不做時間窗裁切(全段複製,不像筆記匯出只取筆記時間點前後窗)。
- 不做翻譯(原文即可)。
- 不寫入 IDB,不影響 Settings、Video、Note、TranscriptRecord 任何資料結構。
- 不加 manifest 權限(`navigator.clipboard.writeText` 在使用者手勢觸發下不需要)。

## 取得逐字稿的策略

採用 **DOM 抓取 YouTube transcript 面板**,理由:

1. 繞過 `pot` token 限制 —— YouTube 自家面板的渲染走內部 token,我們只讀 DOM 就好。
2. 預設是原文,不會被翻譯污染。
3. 影片只要有 transcript 就可用,不需要使用者先開啟 CC 字幕(這點跟 MAIN-world 路徑不同)。
4. 程式碼短,跟筆記體系完全解耦。

代價:DOM 依賴,YouTube 改版會壞。緩解方式是把選擇器集中在單一檔案,加上 aria-label 備援選擇器。

## 架構

### 新檔

- [src/content/transcript-dom-scraper.ts](../../src/content/transcript-dom-scraper.ts) — DOM 抓取,純 content-script 範疇。
- [src/shared/transcript-clipboard.ts](../../src/shared/transcript-clipboard.ts) — 格式化純函式,可單元測試。

### 修改

- [src/ui/Panel.tsx](../../src/ui/Panel.tsx) — header 新增 📋 按鈕與狀態管理。
- [src/content/panel-host.ts](../../src/content/panel-host.ts) — `PanelDeps` 注入 `copyTranscript`。

完全獨立於既有 transcript 管線(`transcript-cache.ts`、`transcript-trigger.ts`、`transcript-store.ts`、`main-world-interceptor.ts`、IDB)。

## DOM Scraper 細節

`scrapeTranscript(): Promise<ScrapeResult>` 流程:

1. **找按鈕** — 優先 `ytd-video-description-transcript-section-renderer button`;備援 `button[aria-label*="transcript" i], button[aria-label*="逐字稿"]`。找不到 → 回 `{ status: 'unavailable' }`(此影片沒有逐字稿)。
2. **記錄當前面板是否已開**(`ytd-transcript-renderer` 是否存在),用於事後決定是否關閉,讓 UI 回到原狀。
3. **點擊按鈕**(若面板尚未開啟),用 `MutationObserver` 等 `ytd-transcript-segment-renderer` 出現,超時 5 秒 → `{ status: 'timeout' }`。
4. **讀取 segments**:每個 `ytd-transcript-segment-renderer` 抓 `.segment-timestamp`(`m:ss` 或 `h:mm:ss` 字串)與 `.segment-text` 文字。把 timestamp 解析成秒數。
5. **回復面板狀態** — 若步驟 2 記錄為「原本沒開」,再點一次按鈕關掉。
6. 回傳 `{ status: 'ok', segments }`,其中 `segments` 只填 `startSec` 與 `text`,`durationSec` 設 0(本路徑無法取得 duration,但本功能也用不到)。

```ts
export type ScrapeResult =
  | { status: 'ok'; segments: TranscriptSegment[] }
  | { status: 'unavailable' }
  | { status: 'timeout' };

export function scrapeTranscript(): Promise<ScrapeResult>;
```

**選擇器壞掉時的失敗模式**:`unavailable`(找不到按鈕)或 `timeout`(按鈕在但面板沒渲染)。兩種都會在 UI 顯示明確訊息,使用者可以判斷是 YouTube 改版還是影片本身沒逐字稿。

## 剪貼簿格式

`formatForClipboard(meta, segments): string` 純函式。輸出範例:

```
# Rick Astley - Never Gonna Give You Up
頻道: RickAstleyVEVO
網址: https://www.youtube.com/watch?v=dQw4w9WgXcQ

[00:00:00] We're no strangers to love
[00:00:05] You know the rules and so do I
[00:00:09] A full commitment's what I'm thinking of
...
```

格式決策:

- **Header 三行 + 空行,人類可讀的 `key: value`**(不是 YAML frontmatter)。AI 仍可解析,但比較自然。
- **Timestamp 重用 [src/shared/timestamp.ts](../../src/shared/timestamp.ts) 的 `formatColon`**(零填充 `HH:MM:SS`,即使影片不到一小時也含小時段),與筆記匯出保持一致。
- **每段一行,無空行間隔** — 給 AI 看的,密度高一點,token 也省。
- **不做去重、不做斷句合併** — YouTube 自己面板給什麼就照抄。

```ts
export interface ClipboardMeta {
  title: string;
  channel: string;
  url: string;
}

export function formatForClipboard(meta: ClipboardMeta, segments: TranscriptSegment[]): string;
```

## UI 與 Wiring

### `PanelDeps` 新增

```ts
copyTranscript: () => Promise<{ status: 'ok' | 'unavailable' | 'timeout' | 'error'; count?: number }>;
```

### Panel header 配置

目前是 `📝 N 條筆記   ✕`,改成 `📝 N 條筆記   📋   ✕`(中間插入 📋)。

按鈕狀態(`useState<CopyState>` 在 Panel 內管理):

| 狀態 | 顯示 | 持續時間 |
|---|---|---|
| `idle` | 📋 | — |
| `copying` | ⏳(disabled) | 直到 promise resolve |
| `ok` | ✓ 已複製 N 段 | 1.5 秒 |
| `unavailable` | ⚠️ 此影片無逐字稿 | 2.5 秒 |
| `timeout` | ⚠️ 載入逾時,請重試 | 2.5 秒 |
| `error` | ⚠️ 複製失敗 | 2.5 秒 |

非 `idle` 與 `copying` 狀態到期後自動回 `idle`。`setTimeout` 用 `useRef` 持有,unmount 時清掉避免 leak。

### `panel-host.ts` 注入

```ts
copyTranscript: async () => {
  const result = await scrapeTranscript();
  if (result.status !== 'ok') return { status: result.status };
  const text = formatForClipboard(getVideoMeta(), result.segments);
  try {
    await navigator.clipboard.writeText(text);
    return { status: 'ok', count: result.segments.length };
  } catch {
    return { status: 'error' };
  }
}
```

### 權限

YouTube 是 https(secure context),content script 在使用者手勢觸發下呼叫 `navigator.clipboard.writeText` 不需要新增任何 manifest 權限。

## 測試策略

- **vitest 單元測試** — 測 `formatForClipboard`。涵蓋:基本格式、含特殊字元的 title、空 segments、`h:mm:ss` 跨小時 timestamp。
- **Playwright E2E 新增 spec** — 仿照 [tests/e2e/add-note.spec.ts](../../tests/e2e/add-note.spec.ts):`goto` 真實 YouTube(Rick Roll 那部片有逐字稿,可重用)→ 開 panel → 點 📋 → 驗證 button 變成 `✓ 已複製 N 段`。若 CI headless 模式下 `navigator.clipboard.readText` 受限,只驗證按鈕狀態變化,不讀剪貼簿內容。
- **DOM scraper 不寫自動化單元測試** — mock YouTube DOM 既脆弱又沒保護價值。改靠 [docs/extension-manual-testing.md](../../docs/extension-manual-testing.md) 流程手動驗證邊界 case(無逐字稿、長影片、跨小時 timestamp)。

## 風險與緩解

| 風險 | 緩解 |
|---|---|
| YouTube 改 transcript 面板 DOM 選擇器 | 選擇器集中在 `transcript-dom-scraper.ts`,改一處;備援 aria-label 選擇器 |
| 「Show transcript」按鈕在某些影片不存在(短片、無字幕影片) | 5 秒 timeout + 明確 `unavailable` 錯誤訊息 |
| 程式化開啟 transcript 面板時使用者會看到 UI 閃動 | 事後關閉面板,使用者只感覺到短暫閃爍;接受此 UX 成本 |
| `navigator.clipboard.writeText` 被瀏覽器拒絕(罕見) | catch 後回 `error` 狀態,UI 顯示「複製失敗」 |
| 極長影片(數千 segments)導致字串過大 | 不做特別處理。剪貼簿可容納數 MB 字串,實務上不會碰到上限 |

## 後續可能延伸(本次不做)

- 把 timestamp 加上影片 deep link(`https://youtube.com/watch?v=X&t=Ns`),讓 AI 摘要回頭引用時可點。
- 提供「複製當前段落附近 N 秒」的快捷,給只想摘要片段的場景。
- 自動偵測 YouTube 改版破壞時上報遙測。
