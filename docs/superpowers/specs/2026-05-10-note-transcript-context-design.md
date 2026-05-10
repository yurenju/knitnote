---
title: 筆記匯出附逐字稿 context
date: 2026-05-10
status: draft
---

# 筆記匯出附逐字稿 context

## 目標

匯出 Markdown 時，每條筆記下方附上**前後 20 秒**的逐字稿（使用者目前在 YouTube 上選的字幕語言，含自動翻譯），讓使用者回頭讀筆記時能快速抓到 context，而不必跳回影片本身。

## 動機

目前匯出的筆記只有：截圖 + timestamp + 使用者寫的文字。當使用者隔幾天後在 Obsidian / Logseq 裡讀這條筆記時，常需要回想「我為什麼當時這樣記？講者實際是怎麼講的？」。回頭找影片成本高。把寫筆記當下的逐字稿存起來、匯出時一併輸出，等於為這條筆記凍結了當時的聲音背景。

## 範圍

**包含**：

- 寫筆記時抓整支影片的逐字稿，存進 IndexedDB
- 語言跟著使用者目前 YouTube 字幕設定走（自動翻譯也算）
- 匯出 Markdown 時，每條筆記附前後 N 秒（預設 20/20）逐字稿
- Options 頁可調前 / 後秒數
- 抓不到逐字稿時，匯出**直接省略**逐字稿區塊，其他內容照常輸出（不顯示任何提示）

**不包含**：

- 面板 UI 不顯示逐字稿（只在匯出時用）
- 不支援逐字稿全文檢視 / 搜尋
- 不做 AI 摘要、潤稿
- 不偵測字幕語言切換、不重抓多語言版本（一支影片只存一份語言的）
- 不從覆蓋字幕（caption overlay）即時擷取作為 fallback

## 非目標

- 不取代 YouTube 自己的字幕介面
- 不為了相容更多語言去煩 InnerTube 完整流程；A' 失敗就直接擺爛

## 設計

### 1. 逐字稿來源：A'（hook player config）

在 content script 裡讀 `ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer`，可以拿到：

- `captionTracks[]`：每條原生字幕軌（`baseUrl`, `languageCode`, `name`, `kind`, `vssId`）
- `translationLanguages[]`：可翻譯目標語言清單

決定要拉哪一條的演算法：

1. 從 player 拿目前字幕設定：`player.getOption('captions', 'track')` 回傳 `{ languageCode, translationLanguage? }`
2. 從 `captionTracks[]` 找 `languageCode` 對應的 `baseUrl`
3. 若使用者有設 `translationLanguage`（自動翻譯），在 `baseUrl` 加 `&tlang=<code>&fmt=json3`
4. 若使用者**沒開字幕**，用 Options 頁的「偏好逐字稿語言」設定（預設與瀏覽器 UI 語言一致）作 fallback；找原生軌（若有匹配）或對 `captionTracks[0]` 加 `tlang`
5. 上述都失敗 → 標記為「逐字稿不可用」

`baseUrl` 已經帶有所有必要簽章參數（`pot`, `c`, `cver` 等），直接 `fetch()` 即可。

### 2. 拉取時機

筆記**第一次**儲存時觸發：

- 若該 videoId 已有 transcript 紀錄 → 跳過
- 否則背景拉一次完整 timedtext，存 IndexedDB
- 拉取失敗：在記錄裡標 `unavailable`，不再重試（避免使用者每次新筆記都打 API）；Options 頁的「強制重新匯出」一併重試

不在頁面載入時主動拉，因為很多影片使用者只是路過、不會記筆記。

### 3. 儲存結構

新增一個 IndexedDB object store：`transcripts`，key 為 `videoId`。

```ts
interface TranscriptRecord {
  videoId: string;
  languageCode: string;       // 主要語言，例如 "en"
  translationLanguage: string | null;  // 翻譯語言，例如 "zh-TW"
  fetchedAt: string;          // ISO 8601
  segments: TranscriptSegment[];
  status: 'ok' | 'unavailable';
}

interface TranscriptSegment {
  startSec: number;
  durationSec: number;
  text: string;
}
```

`status: 'unavailable'` 時 `segments` 為空。

IDB schema 升級：DB_VERSION 從 1 → 2，在 `upgrade` 裡新增 store。

### 4. Options 頁新增設定

```ts
interface Settings {
  theme: Theme;
  hasVaultConfigured: boolean;
  transcriptBeforeSec: number;        // 預設 20
  transcriptAfterSec: number;         // 預設 20
  transcriptPreferredLang: string;    // 預設取 navigator.language（如 "zh-TW"）
}
```

UI：

- 「逐字稿前文（秒）」：number input，1–300
- 「逐字稿後文（秒）」：number input，1–300
- 「偏好逐字稿語言」：text input（BCP-47 code，例 `zh-TW`），附說明「使用者沒開 YouTube 字幕時，匯出會用這個語言抓翻譯逐字稿」

### 5. 匯出排版

每條筆記在 Markdown 裡長這樣（修改 `src/shared/markdown.ts`）：

```markdown
---

## [00:03:11](https://youtu.be/...&t=191s)

![](assets/00-03-11.png)

<details><summary>逐字稿 02:51 – 03:31（zh-TW）</summary>

一直以來開發者頻寬都很昂貴。寫程式的吞吐量一直都是很貴的事情。當你想到我們交付軟體所有的流程，很多都是繞著這件事在轉⋯⋯

</details>

> 一直以來開發者資源一直都是很昂貴的，但是現在不一樣了，現在 claude code 讓開發者資源不在那麼昂貴，那開發的流程就不太一樣了。
```

順序：標題（timestamp 連結）→ 截圖 → 逐字稿（折疊）→ 筆記文字 blockquote。

逐字稿不可用時，整個 `<details>` 區塊省略，輸出變成「截圖 → 筆記文字」（與目前的格式一致）。

### 6. 切片邏輯

給 `noteTimestampSec`、`beforeSec`、`afterSec`：

- 視窗：`[noteTimestampSec - beforeSec, noteTimestampSec + afterSec]`
- 取所有 `segment` 滿足 `segment.startSec < windowEnd && segment.startSec + segment.durationSec > windowStart`
- 把這些 segment 的 `text` 用空白接成一段（YouTube timedtext 多半已經是斷句後的短句，連起來讀起來自然）
- 視窗起點 / 終點實際對齊到第一個 / 最後一個 segment 的邊界，summary 顯示對齊後的範圍

### 7. 失敗模式

| 情境 | 行為 |
|---|---|
| `ytInitialPlayerResponse` 拿不到 caption tracks | 記 `status: 'unavailable'` |
| `fetch(baseUrl)` 4xx/5xx | 記 `status: 'unavailable'` |
| 解析 JSON 失敗 | 記 `status: 'unavailable'` |
| IDB 寫入失敗 | 拋出，讓既有的錯誤處理流程顯示 |
| Options 設的偏好語言不在 `translationLanguages[]` | 寫入 `status: 'unavailable'`（不靜默 fallback 到原文，避免使用者拿到不是他要的語言還不知道） |

### 8. 涉及的檔案

**新增**：

- `src/shared/transcript.ts`：`TranscriptRecord` / `TranscriptSegment` 型別、`sliceWindow()` 切片邏輯
- `src/content/transcript-fetcher.ts`：讀 player config、組 URL、fetch、解析 JSON3 為 `segments[]`
- `src/shared/transcript-store.ts`：IDB CRUD wrapper（沿用 `src/shared/idb.ts` 的 `getDb()`，必要時透過 `src/background/idb-bridge.ts` 走 SW，與既有 screenshots 一致）

**修改**：

- `src/shared/idb.ts`：DB_VERSION → 2，新增 `transcripts` store
- `src/shared/types.ts`：擴充 `Settings`
- `src/shared/markdown.ts`：`renderNoteMd` 接受 transcript 並渲染 `<details>` 區塊
- `src/content/index.ts`：儲存筆記成功後觸發背景拉逐字稿（fire-and-forget）
- `src/options/*`：新增三個欄位
- `src/options/export/writeNoteMd.ts`：匯出前載入該影片的 transcript 紀錄，傳給 `renderNoteMd`

## 風險

| 風險 | 影響 | 緩解 |
|---|---|---|
| YouTube 改 `ytInitialPlayerResponse` 結構 | 全部影片拉不到 | 偵測失敗→`unavailable`；筆記其他內容不受影響；之後修 |
| `timedtext` 簽章機制再緊縮 | 同上 | 同上 |
| 自動翻譯品質差 | 逐字稿不通順 | 接受；那是 YouTube 的問題不是我們的 |
| `<details>` 在某些 PKM tool 不支援 | 折疊變平鋪 | 接受；內容仍可讀 |
| 使用者切換字幕語言後再寫新筆記 | 同支影片不同筆記期望不同語言 | V1 不處理；以最早抓到的為準 |

## 開放問題

無，等使用者 review。
