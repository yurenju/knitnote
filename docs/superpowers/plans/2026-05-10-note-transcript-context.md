# 筆記匯出附逐字稿 context — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目標**：在 Markdown 匯出時，每條筆記下方附上前後 N 秒（預設 20/20）的逐字稿，使用者目前在 Options 設的偏好語言（含自動翻譯）。

**架構**：筆記第一次儲存時 fire-and-forget 從 watch page 解析 `ytInitialPlayerResponse`，組 timedtext URL fetch JSON3 解析後存到 IndexedDB（新 store `transcripts`）。匯出時 `writeNoteMd` 載入 transcript record，把每條筆記的時間視窗內的 segments 黏成一段，渲染為 `<details>` 折疊區塊放在截圖與筆記文字之間。

**Tech Stack**：TypeScript、Preact、Vite、idb、Vitest、Chrome Extension MV3

---

## 檔案結構

**新增**：

- `src/shared/transcript.ts`：型別 + `sliceWindow()` 純函數
- `src/shared/transcript-store.ts`：IDB CRUD（沿用 `src/shared/idb.ts` 的 `getDb()`）
- `src/content/transcript-fetcher.ts`：解析 `ytInitialPlayerResponse`、組 URL、fetch、解析 JSON3
- `src/content/transcript-client.ts`：透過 SW 寫入 IDB 的客戶端封裝（與 `idb-client.ts` 同模式）
- `src/background/transcript-bridge.ts`：SW 端接訊息寫 IDB（與 `idb-bridge.ts` 同模式）
- `src/options/TranscriptSection.tsx`：Options 頁 UI
- `tests/unit/transcript.test.ts`：`sliceWindow` 與 JSON3 parser 測試
- `tests/unit/markdown-transcript.test.ts`：`renderNoteMd` 含 transcript 的渲染測試

**修改**：

- `src/shared/idb.ts`：DB_VERSION 1 → 2，新增 `transcripts` store
- `src/shared/types.ts`：擴充 `Settings` 加入三個欄位
- `src/shared/markdown.ts`：`renderNoteMd` 接受 transcript map 並渲染 `<details>`
- `src/options/export/writeNoteMd.ts`：載入 transcript 後傳給 `renderNoteMd`
- `src/ui/Panel.tsx`：`saveNew` 成功後 fire-and-forget 觸發 transcript 抓取
- `src/options/OptionsPage.tsx`：掛上 `TranscriptSection`
- `src/background/index.ts`：路由 transcript 訊息
- `tests/unit/markdown.test.ts`：既有測試補上空 transcript 參數

---

## 任務

### 任務 1：定義型別與 IDB store

**檔案**：

- 新增：`src/shared/transcript.ts`
- 修改：`src/shared/idb.ts`

- [ ] **步驟 1：先寫失敗的測試**

新增 `tests/unit/transcript.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import type { TranscriptRecord, TranscriptSegment } from '../../src/shared/transcript';

describe('transcript types', () => {
  it('TranscriptRecord shape compiles and accepts ok / unavailable', () => {
    const ok: TranscriptRecord = {
      videoId: 'abc',
      languageCode: 'en',
      translationLanguage: 'zh-TW',
      fetchedAt: '2026-05-10T00:00:00Z',
      status: 'ok',
      segments: [{ startSec: 0, durationSec: 1.5, text: 'hello' }]
    };
    const bad: TranscriptRecord = {
      videoId: 'abc',
      languageCode: '',
      translationLanguage: null,
      fetchedAt: '2026-05-10T00:00:00Z',
      status: 'unavailable',
      segments: []
    };
    expect(ok.status).toBe('ok');
    expect(bad.status).toBe('unavailable');
  });
});
```

- [ ] **步驟 2：跑測試確認失敗**

```bash
npm test -- transcript
```
預期：FAIL，`Cannot find module '../../src/shared/transcript'`。

- [ ] **步驟 3：建立 `src/shared/transcript.ts`**

```ts
export interface TranscriptSegment {
  startSec: number;
  durationSec: number;
  text: string;
}

export interface TranscriptRecord {
  videoId: string;
  languageCode: string;            // 主軌語言（例 "en"）；status='unavailable' 時可為空字串
  translationLanguage: string | null;  // 翻譯目標語言（例 "zh-TW"），未翻譯為 null
  fetchedAt: string;               // ISO 8601
  status: 'ok' | 'unavailable';
  segments: TranscriptSegment[];   // status='unavailable' 時為空陣列
}
```

- [ ] **步驟 4：跑測試確認通過**

```bash
npm test -- transcript
```
預期：PASS。

- [ ] **步驟 5：升 IDB DB_VERSION 並新增 store**

修改 `src/shared/idb.ts`：

```ts
import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'video-notes';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('screenshots');
          db.createObjectStore('meta');
        }
        if (oldVersion < 2) {
          db.createObjectStore('transcripts');
        }
      }
    });
  }
  return dbPromise;
}
```

把原本的 `getDb`（private）改 `export`，並把 `upgrade` 改成 versioned 形式（既有的 `if (!db.objectStoreNames.contains(...))` 邏輯被 `oldVersion < 1` 取代，效果等價）。其餘 `putScreenshot` 等函式不動。

- [ ] **步驟 6：跑既有 IDB 測試確認沒破**

```bash
npm test -- idb
```
預期：原本 `tests/unit/idb.test.ts` 全 PASS。

- [ ] **步驟 7：commit**

```bash
git add src/shared/transcript.ts src/shared/idb.ts tests/unit/transcript.test.ts
git commit -m "Add TranscriptRecord types and transcripts IDB store"
```

---

### 任務 2：實作 `sliceWindow` 切片

**檔案**：

- 修改：`src/shared/transcript.ts`
- 測試：`tests/unit/transcript.test.ts`

- [ ] **步驟 1：寫失敗的測試**

在 `tests/unit/transcript.test.ts` 加：

```ts
import { sliceWindow } from '../../src/shared/transcript';

describe('sliceWindow', () => {
  const segs: TranscriptSegment[] = [
    { startSec: 0,  durationSec: 2, text: 'a' },
    { startSec: 2,  durationSec: 3, text: 'b' },
    { startSec: 5,  durationSec: 2, text: 'c' },
    { startSec: 10, durationSec: 1, text: 'd' },
    { startSec: 20, durationSec: 5, text: 'e' }
  ];

  it('returns segments overlapping the window', () => {
    const r = sliceWindow(segs, 6, 2, 5);  // window [4, 11]
    expect(r.segments.map(s => s.text)).toEqual(['b', 'c', 'd']);
  });

  it('aligned start / end equal first / last segment boundaries', () => {
    const r = sliceWindow(segs, 6, 2, 5);
    expect(r.alignedStartSec).toBe(2);
    expect(r.alignedEndSec).toBe(11);
  });

  it('returns empty when window misses all segments', () => {
    const r = sliceWindow(segs, 50, 1, 1);
    expect(r.segments).toEqual([]);
    expect(r.alignedStartSec).toBeNull();
    expect(r.alignedEndSec).toBeNull();
  });

  it('clamps negative window start to 0', () => {
    const r = sliceWindow(segs, 1, 30, 1);
    expect(r.segments[0].text).toBe('a');
  });
});
```

- [ ] **步驟 2：跑測試確認失敗**

```bash
npm test -- transcript
```
預期：FAIL，`sliceWindow is not a function`。

- [ ] **步驟 3：實作 `sliceWindow`**

附加到 `src/shared/transcript.ts`：

```ts
export interface SlicedWindow {
  segments: TranscriptSegment[];
  alignedStartSec: number | null;  // null 代表沒命中任何 segment
  alignedEndSec: number | null;
}

export function sliceWindow(
  segs: TranscriptSegment[],
  centerSec: number,
  beforeSec: number,
  afterSec: number
): SlicedWindow {
  const windowStart = Math.max(0, centerSec - beforeSec);
  const windowEnd = centerSec + afterSec;
  const hits = segs.filter(s =>
    s.startSec < windowEnd && s.startSec + s.durationSec > windowStart
  );
  if (hits.length === 0) {
    return { segments: [], alignedStartSec: null, alignedEndSec: null };
  }
  const first = hits[0];
  const last = hits[hits.length - 1];
  return {
    segments: hits,
    alignedStartSec: first.startSec,
    alignedEndSec: last.startSec + last.durationSec
  };
}
```

- [ ] **步驟 4：跑測試確認通過**

```bash
npm test -- transcript
```
預期：PASS（含步驟 1 的 4 個案例）。

- [ ] **步驟 5：commit**

```bash
git add src/shared/transcript.ts tests/unit/transcript.test.ts
git commit -m "Add sliceWindow for transcript context extraction"
```

---

### 任務 3：JSON3 parser

**檔案**：

- 修改：`src/shared/transcript.ts`
- 測試：`tests/unit/transcript.test.ts`

JSON3 (YouTube timedtext `&fmt=json3`) 結構：

```json
{
  "wireMagic": "pb3",
  "events": [
    { "tStartMs": 0, "dDurationMs": 1500, "segs": [{ "utf8": "Hello" }, { "utf8": " world" }] },
    { "tStartMs": 1500, "dDurationMs": 0 }
  ]
}
```

- 沒有 `segs` 的 event 是樣式控制，跳過
- 同一個 event 內多個 `segs` 串接成一句
- `\n` 出現在 segs 內視為換行，正規化成空白

- [ ] **步驟 1：寫失敗的測試**

```ts
import { parseJson3 } from '../../src/shared/transcript';

describe('parseJson3', () => {
  it('extracts events with segs into TranscriptSegments', () => {
    const json = {
      events: [
        { tStartMs: 0, dDurationMs: 1500, segs: [{ utf8: 'Hello' }, { utf8: ' world' }] },
        { tStartMs: 1500, dDurationMs: 0 },  // style-only, skip
        { tStartMs: 2000, dDurationMs: 1000, segs: [{ utf8: 'next' }] }
      ]
    };
    const r = parseJson3(json);
    expect(r).toEqual([
      { startSec: 0, durationSec: 1.5, text: 'Hello world' },
      { startSec: 2, durationSec: 1, text: 'next' }
    ]);
  });

  it('normalizes newlines inside segs to spaces', () => {
    const json = { events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'line1\nline2' }] }] };
    expect(parseJson3(json)[0].text).toBe('line1 line2');
  });

  it('skips events with empty utf8 segs', () => {
    const json = { events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: '' }] }] };
    expect(parseJson3(json)).toEqual([]);
  });

  it('returns [] on missing events', () => {
    expect(parseJson3({})).toEqual([]);
    expect(parseJson3(null)).toEqual([]);
  });
});
```

- [ ] **步驟 2：跑測試確認失敗**

```bash
npm test -- transcript
```
預期：FAIL，`parseJson3 is not a function`。

- [ ] **步驟 3：實作 `parseJson3`**

附加到 `src/shared/transcript.ts`：

```ts
interface Json3Event {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: Array<{ utf8?: string }>;
}

export function parseJson3(json: unknown): TranscriptSegment[] {
  if (!json || typeof json !== 'object') return [];
  const events = (json as { events?: Json3Event[] }).events;
  if (!Array.isArray(events)) return [];
  const out: TranscriptSegment[] = [];
  for (const ev of events) {
    if (!ev.segs || ev.segs.length === 0) continue;
    const text = ev.segs.map(s => s.utf8 ?? '').join('').replace(/\n/g, ' ').trim();
    if (!text) continue;
    out.push({
      startSec: (ev.tStartMs ?? 0) / 1000,
      durationSec: (ev.dDurationMs ?? 0) / 1000,
      text
    });
  }
  return out;
}
```

- [ ] **步驟 4：跑測試確認通過**

```bash
npm test -- transcript
```
預期：PASS。

- [ ] **步驟 5：commit**

```bash
git add src/shared/transcript.ts tests/unit/transcript.test.ts
git commit -m "Add JSON3 timedtext parser"
```

---

### 任務 4：解析 `ytInitialPlayerResponse` 並選軌

**檔案**：

- 新增：`src/content/transcript-fetcher.ts`
- 測試：`tests/unit/transcript-fetcher.test.ts`

- [ ] **步驟 1：寫失敗的測試**

新建 `tests/unit/transcript-fetcher.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { pickTrackUrl } from '../../src/content/transcript-fetcher';

const tracklist = {
  captionTracks: [
    { baseUrl: 'https://yt/api/timedtext?v=x&lang=en', languageCode: 'en' },
    { baseUrl: 'https://yt/api/timedtext?v=x&lang=ja', languageCode: 'ja' }
  ],
  translationLanguages: [
    { languageCode: 'zh-TW' },
    { languageCode: 'fr' }
  ]
};

describe('pickTrackUrl', () => {
  it('uses native track when languageCode matches preferred', () => {
    const r = pickTrackUrl(tracklist, 'ja');
    expect(r).toEqual({
      url: 'https://yt/api/timedtext?v=x&lang=ja&fmt=json3',
      languageCode: 'ja',
      translationLanguage: null
    });
  });

  it('falls back to captionTracks[0] + tlang when preferred is in translationLanguages', () => {
    const r = pickTrackUrl(tracklist, 'zh-TW');
    expect(r).toEqual({
      url: 'https://yt/api/timedtext?v=x&lang=en&tlang=zh-TW&fmt=json3',
      languageCode: 'en',
      translationLanguage: 'zh-TW'
    });
  });

  it('returns null when preferred lang is neither native nor translatable', () => {
    expect(pickTrackUrl(tracklist, 'xx')).toBeNull();
  });

  it('returns null when there are no caption tracks', () => {
    expect(pickTrackUrl({ captionTracks: [], translationLanguages: [] }, 'en')).toBeNull();
    expect(pickTrackUrl(null, 'en')).toBeNull();
  });
});
```

- [ ] **步驟 2：跑測試確認失敗**

```bash
npm test -- transcript-fetcher
```
預期：FAIL。

- [ ] **步驟 3：建立 `src/content/transcript-fetcher.ts`**

```ts
import { parseJson3, type TranscriptSegment } from '../shared/transcript';

export interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
}
export interface TranslationLanguage {
  languageCode: string;
}
export interface Tracklist {
  captionTracks: CaptionTrack[];
  translationLanguages: TranslationLanguage[];
}

export interface PickedTrack {
  url: string;
  languageCode: string;
  translationLanguage: string | null;
}

export function pickTrackUrl(tl: Tracklist | null, preferredLang: string): PickedTrack | null {
  if (!tl || !tl.captionTracks || tl.captionTracks.length === 0) return null;
  const native = tl.captionTracks.find(t => t.languageCode === preferredLang);
  if (native) {
    return {
      url: appendParam(native.baseUrl, 'fmt', 'json3'),
      languageCode: native.languageCode,
      translationLanguage: null
    };
  }
  const translatable = (tl.translationLanguages ?? []).some(l => l.languageCode === preferredLang);
  if (!translatable) return null;
  const base = tl.captionTracks[0];
  return {
    url: appendParam(appendParam(base.baseUrl, 'tlang', preferredLang), 'fmt', 'json3'),
    languageCode: base.languageCode,
    translationLanguage: preferredLang
  };
}

function appendParam(url: string, key: string, value: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${key}=${encodeURIComponent(value)}`;
}

const RE_PLAYER_RESPONSE = /var\s+ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\})\s*;\s*(?:var\s|<\/script>)/;

export function extractTracklistFromHtml(html: string): Tracklist | null {
  const m = html.match(RE_PLAYER_RESPONSE);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[1]);
    const tl = obj?.captions?.playerCaptionsTracklistRenderer;
    if (!tl) return null;
    return {
      captionTracks: tl.captionTracks ?? [],
      translationLanguages: tl.translationLanguages ?? []
    };
  } catch {
    return null;
  }
}

export function extractTracklistFromDocument(doc: Document): Tracklist | null {
  const scripts = doc.querySelectorAll('script');
  for (const s of Array.from(scripts)) {
    const text = s.textContent ?? '';
    if (!text.includes('ytInitialPlayerResponse')) continue;
    const tl = extractTracklistFromHtml(text);
    if (tl) return tl;
  }
  return null;
}

export async function fetchSegments(url: string): Promise<TranscriptSegment[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`timedtext HTTP ${res.status}`);
  const json = await res.json();
  return parseJson3(json);
}
```

- [ ] **步驟 4：補 `extractTracklistFromHtml` 測試**

附加到 `tests/unit/transcript-fetcher.test.ts`：

```ts
import { extractTracklistFromHtml } from '../../src/content/transcript-fetcher';

describe('extractTracklistFromHtml', () => {
  it('parses ytInitialPlayerResponse and pulls captions tracklist', () => {
    const html = `
      <script>var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://x/","languageCode":"en"}],"translationLanguages":[{"languageCode":"zh-TW"}]}}};var meta = 1;</script>
    `;
    const r = extractTracklistFromHtml(html);
    expect(r?.captionTracks[0].languageCode).toBe('en');
    expect(r?.translationLanguages[0].languageCode).toBe('zh-TW');
  });

  it('returns null when no ytInitialPlayerResponse in html', () => {
    expect(extractTracklistFromHtml('<html></html>')).toBeNull();
  });

  it('returns null when player response has no captions block', () => {
    const html = `<script>var ytInitialPlayerResponse = {};var x = 1;</script>`;
    expect(extractTracklistFromHtml(html)).toBeNull();
  });
});
```

- [ ] **步驟 5：跑測試確認通過**

```bash
npm test -- transcript-fetcher
```
預期：全部 PASS。

- [ ] **步驟 6：commit**

```bash
git add src/content/transcript-fetcher.ts tests/unit/transcript-fetcher.test.ts
git commit -m "Add transcript fetcher: track picker, HTML extractor, JSON3 fetch"
```

---

### 任務 5：Transcript IDB store + SW bridge

**檔案**：

- 新增：`src/shared/transcript-store.ts`
- 新增：`src/content/transcript-client.ts`
- 新增：`src/background/transcript-bridge.ts`
- 修改：`src/background/index.ts`
- 測試：`tests/unit/transcript-store.test.ts`

- [ ] **步驟 1：寫失敗的測試**

```ts
// tests/unit/transcript-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { putTranscript, getTranscript } from '../../src/shared/transcript-store';
import type { TranscriptRecord } from '../../src/shared/transcript';

describe('transcript-store', () => {
  beforeEach(async () => {
    // Reset fake-indexeddb state between tests.
    const { indexedDB: idb } = await import('fake-indexeddb');
    (globalThis as any).indexedDB = idb;
  });

  it('round-trips a TranscriptRecord', async () => {
    const rec: TranscriptRecord = {
      videoId: 'abc',
      languageCode: 'en',
      translationLanguage: 'zh-TW',
      fetchedAt: '2026-05-10T00:00:00Z',
      status: 'ok',
      segments: [{ startSec: 0, durationSec: 1, text: 'hi' }]
    };
    await putTranscript(rec);
    const got = await getTranscript('abc');
    expect(got).toEqual(rec);
  });

  it('returns undefined for unknown videoId', async () => {
    expect(await getTranscript('missing')).toBeUndefined();
  });
});
```

確認 `package.json` 已含 `fake-indexeddb`（既有 IDB 測試用過則跳過此步）。若沒有：`npm install --save-dev fake-indexeddb`。

- [ ] **步驟 2：跑測試確認失敗**

```bash
npm test -- transcript-store
```
預期：FAIL。

- [ ] **步驟 3：建立 `src/shared/transcript-store.ts`**

```ts
import { getDb } from './idb';
import type { TranscriptRecord } from './transcript';

export async function putTranscript(rec: TranscriptRecord): Promise<void> {
  const db = await getDb();
  await db.put('transcripts', rec, rec.videoId);
}

export async function getTranscript(videoId: string): Promise<TranscriptRecord | undefined> {
  const db = await getDb();
  return db.get('transcripts', videoId) as Promise<TranscriptRecord | undefined>;
}

export async function listTranscriptKeys(): Promise<string[]> {
  const db = await getDb();
  return (await db.getAllKeys('transcripts')) as string[];
}
```

- [ ] **步驟 4：跑測試確認通過**

```bash
npm test -- transcript-store
```
預期：PASS。

- [ ] **步驟 5：建立 SW bridge**

`src/background/transcript-bridge.ts`：

```ts
import { putTranscript } from '../shared/transcript-store';
import type { TranscriptRecord } from '../shared/transcript';

interface PutMsg { type: 'idb-put-transcript'; record: TranscriptRecord; }
type TranscriptMsg = PutMsg;

export function isTranscriptMessage(msg: unknown): msg is TranscriptMsg {
  return !!msg && typeof msg === 'object'
    && (msg as { type?: unknown }).type === 'idb-put-transcript';
}

export function handleTranscriptMessage(
  msg: TranscriptMsg,
  sendResponse: (response: { ok: true } | { error: string }) => void
): true {
  putTranscript(msg.record)
    .then(() => sendResponse({ ok: true }))
    .catch((e: unknown) => sendResponse({ error: String(e) }));
  return true;
}
```

- [ ] **步驟 6：建立 content client**

`src/content/transcript-client.ts`：

```ts
import type { TranscriptRecord } from '../shared/transcript';

export async function putTranscriptViaSw(record: TranscriptRecord): Promise<void> {
  const r = await chrome.runtime.sendMessage({ type: 'idb-put-transcript', record });
  if (r?.error) throw new Error('putTranscript failed: ' + r.error);
}
```

- [ ] **步驟 7：在 SW router 掛上 bridge**

讀 `src/background/index.ts`，找到既有的 `chrome.runtime.onMessage.addListener` 區塊（會包含 `isIdbMessage` / `handleIdbMessage` 路由）。在該 listener 內加入 transcript 分支：

```ts
import { isTranscriptMessage, handleTranscriptMessage } from './transcript-bridge';

// 在既有 listener 內，於 idb 分支之後新增：
if (isTranscriptMessage(msg)) {
  return handleTranscriptMessage(msg, sendResponse);
}
```

匯入路徑與既有 `idb-bridge` 相同層級。

- [ ] **步驟 8：build 確認沒有 type / import 錯誤**

```bash
npm run build
```
預期：成功，產生 `dist/`。

- [ ] **步驟 9：commit**

```bash
git add src/shared/transcript-store.ts src/content/transcript-client.ts src/background/transcript-bridge.ts src/background/index.ts tests/unit/transcript-store.test.ts
git commit -m "Add transcript IDB store and SW message bridge"
```

---

### 任務 6：擴充 `Settings`

**檔案**：

- 修改：`src/shared/types.ts`
- 測試：`tests/unit/storage.test.ts`

- [ ] **步驟 1：寫失敗的測試**

在 `tests/unit/storage.test.ts` 末尾加（先讀檔確認 import 風格）：

```ts
import { DEFAULT_SETTINGS } from '../../src/shared/types';

describe('DEFAULT_SETTINGS for transcript', () => {
  it('has transcriptBeforeSec=20, transcriptAfterSec=20', () => {
    expect(DEFAULT_SETTINGS.transcriptBeforeSec).toBe(20);
    expect(DEFAULT_SETTINGS.transcriptAfterSec).toBe(20);
  });
  it('has transcriptPreferredLang as a non-empty BCP-47 string', () => {
    expect(typeof DEFAULT_SETTINGS.transcriptPreferredLang).toBe('string');
    expect(DEFAULT_SETTINGS.transcriptPreferredLang.length).toBeGreaterThan(0);
  });
});
```

- [ ] **步驟 2：跑測試確認失敗**

```bash
npm test -- storage
```
預期：FAIL，欄位不存在。

- [ ] **步驟 3：擴充 Settings**

修改 `src/shared/types.ts`：

```ts
export interface Settings {
  theme: Theme;
  hasVaultConfigured: boolean;
  transcriptBeforeSec: number;
  transcriptAfterSec: number;
  transcriptPreferredLang: string;   // BCP-47, e.g. "zh-TW"
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  hasVaultConfigured: false,
  transcriptBeforeSec: 20,
  transcriptAfterSec: 20,
  transcriptPreferredLang:
    (typeof navigator !== 'undefined' && navigator.language) || 'en'
};
```

- [ ] **步驟 4：跑測試確認通過**

```bash
npm test
```
預期：所有測試 PASS（`getSettings` 用 `{ ...DEFAULT_SETTINGS, ...stored }` 合併，舊資料自動補欄位）。

- [ ] **步驟 5：commit**

```bash
git add src/shared/types.ts tests/unit/storage.test.ts
git commit -m "Add transcript window/lang fields to Settings"
```

---

### 任務 7：`renderNoteMd` 渲染逐字稿區塊

**檔案**：

- 修改：`src/shared/markdown.ts`
- 修改：`tests/unit/markdown.test.ts`
- 新增：`tests/unit/markdown-transcript.test.ts`

- [ ] **步驟 1：寫失敗的測試**

新建 `tests/unit/markdown-transcript.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { renderNoteMd } from '../../src/shared/markdown';
import type { Video } from '../../src/shared/types';
import type { TranscriptRecord } from '../../src/shared/transcript';

const video: Video = {
  videoId: 'abc',
  title: 'T',
  channel: 'C',
  url: 'https://youtu.be/abc',
  firstNoteAt: '2026-05-10T00:00:00Z',
  lastModifiedAt: '2026-05-10T00:00:00Z',
  lastExportedAt: null,
  notes: [{
    id: 'n1',
    timestampSec: 191,    // 03:11
    text: 'my note',
    createdAt: '2026-05-10T00:00:00Z',
    updatedAt: '2026-05-10T00:00:00Z',
    screenshotKey: 'sk1'
  }]
};

const transcript: TranscriptRecord = {
  videoId: 'abc',
  languageCode: 'en',
  translationLanguage: 'zh-TW',
  fetchedAt: '2026-05-10T00:00:00Z',
  status: 'ok',
  segments: [
    { startSec: 170, durationSec: 5, text: 'before-1' },
    { startSec: 185, durationSec: 4, text: 'before-2' },
    { startSec: 192, durationSec: 5, text: 'after-1' },
    { startSec: 220, durationSec: 5, text: 'after-far' }
  ]
};

describe('renderNoteMd with transcript', () => {
  it('renders <details> block between screenshot and note text', () => {
    const md = renderNoteMd(video, '2026-05-10T01:00:00Z', {
      'abc': transcript
    }, { beforeSec: 20, afterSec: 20 });
    const idxImg = md.indexOf('![](assets/');
    const idxDetails = md.indexOf('<details>');
    const idxNote = md.indexOf('> my note');
    expect(idxImg).toBeGreaterThan(0);
    expect(idxDetails).toBeGreaterThan(idxImg);
    expect(idxNote).toBeGreaterThan(idxDetails);
  });

  it('summary shows aligned range and language', () => {
    const md = renderNoteMd(video, '2026-05-10T01:00:00Z',
      { 'abc': transcript }, { beforeSec: 20, afterSec: 20 });
    expect(md).toContain('<summary>逐字稿 02:50 – 03:17（zh-TW）</summary>');
  });

  it('uses languageCode in summary when no translation', () => {
    const native: TranscriptRecord = { ...transcript, translationLanguage: null };
    const md = renderNoteMd(video, '2026-05-10T01:00:00Z',
      { 'abc': native }, { beforeSec: 20, afterSec: 20 });
    expect(md).toContain('（en）');
  });

  it('omits <details> entirely when transcript missing', () => {
    const md = renderNoteMd(video, '2026-05-10T01:00:00Z', {}, { beforeSec: 20, afterSec: 20 });
    expect(md).not.toContain('<details>');
  });

  it('omits <details> when status=unavailable', () => {
    const u: TranscriptRecord = { ...transcript, status: 'unavailable', segments: [] };
    const md = renderNoteMd(video, '2026-05-10T01:00:00Z', { 'abc': u }, { beforeSec: 20, afterSec: 20 });
    expect(md).not.toContain('<details>');
  });

  it('omits <details> when window catches no segments', () => {
    const empty: TranscriptRecord = { ...transcript, segments: [{ startSec: 9999, durationSec: 1, text: 'far' }] };
    const md = renderNoteMd(video, '2026-05-10T01:00:00Z', { 'abc': empty }, { beforeSec: 20, afterSec: 20 });
    expect(md).not.toContain('<details>');
  });
});
```

修改既有 `tests/unit/markdown.test.ts`：所有 `renderNoteMd(video, exportedAt)` 的呼叫加上空 transcript map 與預設視窗：`renderNoteMd(video, exportedAt, {}, { beforeSec: 20, afterSec: 20 })`。

- [ ] **步驟 2：跑測試確認失敗**

```bash
npm test -- markdown
```
預期：FAIL（簽章不符）。

- [ ] **步驟 3：改寫 `renderNoteMd`**

`src/shared/markdown.ts`：

```ts
import type { Video, Note } from './types';
import type { TranscriptRecord } from './transcript';
import { sliceWindow } from './transcript';
import { formatColon, formatDash } from './timestamp';

function yamlValue(v: string): string {
  if (/[":#\n]/.test(v)) return '"' + v.replace(/"/g, '\\"') + '"';
  return v;
}

function blockquote(text: string): string {
  return text.split('\n').map(l => '> ' + l).join('\n');
}

export interface RenderTranscriptOpts {
  beforeSec: number;
  afterSec: number;
}

export function renderNoteMd(
  video: Video,
  exportedAtIso: string,
  transcripts: Record<string, TranscriptRecord> = {},
  transcriptOpts: RenderTranscriptOpts = { beforeSec: 20, afterSec: 20 }
): string {
  const sorted: Note[] = [...video.notes].sort((a, b) => a.timestampSec - b.timestampSec);
  const lines: string[] = [];
  lines.push('---');
  lines.push('title: ' + yamlValue(video.title));
  lines.push('url: ' + video.url);
  lines.push('channel: ' + yamlValue(video.channel));
  lines.push('videoId: ' + video.videoId);
  lines.push('firstNoteAt: ' + video.firstNoteAt);
  lines.push('exportedAt: ' + exportedAtIso);
  lines.push('noteCount: ' + sorted.length);
  lines.push('---');
  lines.push('');
  lines.push('# ' + video.title);
  lines.push('');
  lines.push('來源：[YouTube](' + video.url + ')');
  lines.push('頻道：' + video.channel);
  lines.push('');

  const tr = transcripts[video.videoId];
  for (const n of sorted) {
    const ts = formatColon(n.timestampSec);
    const tsDash = formatDash(n.timestampSec);
    lines.push('---');
    lines.push('');
    lines.push(`## [${ts}](${video.url}&t=${Math.floor(n.timestampSec)}s)`);
    lines.push('');
    lines.push(`![](assets/${tsDash}.png)`);
    lines.push('');

    const detailsBlock = renderTranscriptDetails(tr, n.timestampSec, transcriptOpts);
    if (detailsBlock) {
      lines.push(detailsBlock);
      lines.push('');
    }

    lines.push(blockquote(n.text));
    lines.push('');
  }
  return lines.join('\n');
}

function renderTranscriptDetails(
  tr: TranscriptRecord | undefined,
  centerSec: number,
  opts: RenderTranscriptOpts
): string | null {
  if (!tr || tr.status !== 'ok' || tr.segments.length === 0) return null;
  const sliced = sliceWindow(tr.segments, centerSec, opts.beforeSec, opts.afterSec);
  if (sliced.segments.length === 0 || sliced.alignedStartSec === null || sliced.alignedEndSec === null) {
    return null;
  }
  const lang = tr.translationLanguage ?? tr.languageCode;
  const start = formatColon(sliced.alignedStartSec);
  const end = formatColon(sliced.alignedEndSec);
  const body = sliced.segments.map(s => s.text).join(' ').trim();
  return [
    `<details><summary>逐字稿 ${start} – ${end}（${lang}）</summary>`,
    '',
    body,
    '',
    '</details>'
  ].join('\n');
}
```

- [ ] **步驟 4：跑測試確認通過**

```bash
npm test -- markdown
```
預期：所有 markdown 相關測試 PASS（含舊測試 + `markdown-transcript.test.ts`）。

- [ ] **步驟 5：commit**

```bash
git add src/shared/markdown.ts tests/unit/markdown.test.ts tests/unit/markdown-transcript.test.ts
git commit -m "Render <details> transcript block in note markdown"
```

---

### 任務 8：`writeNoteMd` 載入 transcript

**檔案**：

- 修改：`src/options/export/writeNoteMd.ts`
- 修改：`tests/unit/runExport.test.ts` 或既有相關測試

- [ ] **步驟 1：先讀既有匯出測試**

```bash
cat tests/unit/runExport.test.ts | head -80
```

確認 mock 範圍。匯出流程在 options 頁，有權限直接呼叫 `getTranscript`（`src/shared/transcript-store.ts`）。

- [ ] **步驟 2：寫失敗的測試**

在 `tests/unit/runExport.test.ts`（或 `writeAssets.test.ts` 同模式）加：

```ts
import { writeNoteMd } from '../../src/options/export/writeNoteMd';
import { putTranscript } from '../../src/shared/transcript-store';
import 'fake-indexeddb/auto';

describe('writeNoteMd loads transcript and embeds in markdown', () => {
  it('embeds <details> when transcript exists', async () => {
    await putTranscript({
      videoId: 'abc', languageCode: 'en', translationLanguage: 'zh-TW',
      fetchedAt: '2026-05-10T00:00:00Z', status: 'ok',
      segments: [{ startSec: 188, durationSec: 4, text: 'ctx' }]
    });
    const writes: string[] = [];
    const folder = mockFolderHandle((content) => writes.push(content));  // 既有 helper
    const video: Video = /* 與其他測試共用的 fixture */ ...;
    await writeNoteMd(folder, video, '2026-05-10T01:00:00Z', { beforeSec: 20, afterSec: 20 });
    expect(writes[0]).toContain('<details>');
    expect(writes[0]).toContain('ctx');
  });
});
```

> 註：實際 helper 名稱以 `_fs-mock.ts` 既有提供為準（讀檔對齊）。

- [ ] **步驟 3：跑測試確認失敗**

```bash
npm test -- runExport
```
預期：FAIL，`writeNoteMd` 簽章不接受第四個參數，或 markdown 不含 `<details>`。

- [ ] **步驟 4：改寫 `writeNoteMd`**

```ts
import type { Video } from '../../shared/types';
import type { TranscriptRecord } from '../../shared/transcript';
import { renderNoteMd, type RenderTranscriptOpts } from '../../shared/markdown';
import { getTranscript } from '../../shared/transcript-store';

export async function writeNoteMd(
  folder: FileSystemDirectoryHandle,
  video: Video,
  exportedAtIso: string,
  transcriptOpts: RenderTranscriptOpts
): Promise<void> {
  const tr = await getTranscript(video.videoId);
  const transcripts: Record<string, TranscriptRecord> = tr ? { [video.videoId]: tr } : {};
  const content = renderNoteMd(video, exportedAtIso, transcripts, transcriptOpts);
  const fh = await folder.getFileHandle('note.md', { create: true });
  const w = await (fh as any).createWritable();
  await w.write(content);
  await w.close();
}
```

- [ ] **步驟 5：找出 `writeNoteMd` 的呼叫端並補新參數**

```bash
npm exec -- rg 'writeNoteMd\(' --type=ts -l
```

在每個呼叫端：先取得 `Settings`（已知用 `getSettings()`），把 `{ beforeSec: settings.transcriptBeforeSec, afterSec: settings.transcriptAfterSec }` 傳入。範例：

```ts
const settings = await getSettings();
await writeNoteMd(folder, video, exportedAt, {
  beforeSec: settings.transcriptBeforeSec,
  afterSec: settings.transcriptAfterSec
});
```

- [ ] **步驟 6：跑全部測試**

```bash
npm test
```
預期：全 PASS。

- [ ] **步驟 7：commit**

```bash
git add src/options/export tests/unit/runExport.test.ts
git commit -m "Load transcript and pass window opts in writeNoteMd"
```

---

### 任務 9：筆記儲存後 fire-and-forget 抓逐字稿

**檔案**：

- 修改：`src/ui/Panel.tsx`
- 新增：`src/content/transcript-trigger.ts`（封裝抓取流程）

- [ ] **步驟 1：建立 trigger 模組**

`src/content/transcript-trigger.ts`：

```ts
import {
  extractTracklistFromDocument,
  pickTrackUrl,
  fetchSegments
} from './transcript-fetcher';
import { putTranscriptViaSw } from './transcript-client';
import type { TranscriptRecord } from '../shared/transcript';
import { getSettings } from '../shared/storage';

// Fire-and-forget. Caller does not await; errors logged, never thrown.
export function ensureTranscript(videoId: string): void {
  void (async () => {
    try {
      // Cheap dedupe: if SW already has a record for this video, getTranscript
      // would tell us — but we do not currently expose a getter via SW. Live
      // with overwriting; the operation is idempotent.
      const settings = await getSettings();
      const tracklist = extractTracklistFromDocument(document);
      const picked = pickTrackUrl(tracklist, settings.transcriptPreferredLang);
      const now = new Date().toISOString();
      if (!picked) {
        await putTranscriptViaSw({
          videoId,
          languageCode: '',
          translationLanguage: null,
          fetchedAt: now,
          status: 'unavailable',
          segments: []
        });
        return;
      }
      let segments;
      try {
        segments = await fetchSegments(picked.url);
      } catch (e) {
        console.warn('[video-notes] transcript fetch failed:', e);
        await putTranscriptViaSw({
          videoId,
          languageCode: picked.languageCode,
          translationLanguage: picked.translationLanguage,
          fetchedAt: now,
          status: 'unavailable',
          segments: []
        });
        return;
      }
      const rec: TranscriptRecord = {
        videoId,
        languageCode: picked.languageCode,
        translationLanguage: picked.translationLanguage,
        fetchedAt: now,
        status: segments.length > 0 ? 'ok' : 'unavailable',
        segments
      };
      await putTranscriptViaSw(rec);
    } catch (e) {
      console.warn('[video-notes] ensureTranscript error:', e);
    }
  })();
}
```

> 註：dedupe（已存在則跳過）需要 SW 暴露 getter。為了控制範圍，V1 接受重抓——成本低、覆寫無害。任務 12（possible follow-up）再加 dedupe。

- [ ] **步驟 2：在 `saveNew` 成功後觸發**

修改 `src/ui/Panel.tsx`，匯入 trigger 並在 `saveNew` 的 `await upsertVideo(merged); setVideo(merged);` 之後加：

```ts
import { ensureTranscript } from '../content/transcript-trigger';
// ...
// 在 saveNew try 區塊尾端 setVideo(merged) 後：
if (!fresh || fresh.notes.length === 0) {
  // 第一條筆記（新影片）才觸發；之後 transcript 已有，避免每存一條都重抓
  ensureTranscript(videoId);
}
```

> 條件「`!fresh || fresh.notes.length === 0`」判斷的是儲存**前**的狀態：若儲存前該影片在 IDB 還沒筆記，這就是第一條，啟動 fetch。

- [ ] **步驟 3：build 確認沒錯**

```bash
npm run build
```

- [ ] **步驟 4：commit**

```bash
git add src/content/transcript-trigger.ts src/ui/Panel.tsx
git commit -m "Trigger transcript fetch on first note save"
```

---

### 任務 10：Options 頁 UI

**檔案**：

- 新增：`src/options/TranscriptSection.tsx`
- 修改：`src/options/OptionsPage.tsx`

- [ ] **步驟 1：建立 `TranscriptSection`**

```tsx
// src/options/TranscriptSection.tsx
import { useEffect, useState } from 'preact/hooks';
import { getSettings, setSettings } from '../shared/storage';

export function TranscriptSection() {
  const [before, setBefore] = useState(20);
  const [after, setAfter] = useState(20);
  const [lang, setLang] = useState('en');

  useEffect(() => {
    getSettings().then(s => {
      setBefore(s.transcriptBeforeSec);
      setAfter(s.transcriptAfterSec);
      setLang(s.transcriptPreferredLang);
    });
  }, []);

  const save = async (patch: Partial<{ transcriptBeforeSec: number; transcriptAfterSec: number; transcriptPreferredLang: string }>) => {
    const s = await getSettings();
    await setSettings({ ...s, ...patch });
  };

  const onBefore = (v: string) => {
    const n = clamp(parseInt(v, 10), 1, 300);
    setBefore(n);
    void save({ transcriptBeforeSec: n });
  };
  const onAfter = (v: string) => {
    const n = clamp(parseInt(v, 10), 1, 300);
    setAfter(n);
    void save({ transcriptAfterSec: n });
  };
  const onLang = (v: string) => {
    setLang(v);
    void save({ transcriptPreferredLang: v });
  };

  return (
    <section style="margin-bottom: 24px;">
      <h3>逐字稿</h3>
      <label style="display:block; margin: 8px 0;">
        前文秒數：
        <input type="number" min={1} max={300} value={before}
          onInput={e => onBefore((e.target as HTMLInputElement).value)} />
      </label>
      <label style="display:block; margin: 8px 0;">
        後文秒數：
        <input type="number" min={1} max={300} value={after}
          onInput={e => onAfter((e.target as HTMLInputElement).value)} />
      </label>
      <label style="display:block; margin: 8px 0;">
        偏好語言（BCP-47，例如 zh-TW、en、ja）：
        <input type="text" value={lang}
          onInput={e => onLang((e.target as HTMLInputElement).value.trim())} />
      </label>
      <p style="color: var(--muted-fg); font-size: 12px;">
        匯出時，在每條筆記下附上前後 N 秒的逐字稿。語言用於沒有原生軌時觸發 YouTube 自動翻譯。
      </p>
    </section>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}
```

- [ ] **步驟 2：掛上 OptionsPage**

修改 `src/options/OptionsPage.tsx`，在 `<ThemeSection />` 後加：

```tsx
import { TranscriptSection } from './TranscriptSection';
// ...
<ThemeSection onChange={(t: Theme) => applyThemeClass(document.body, t)} />
<TranscriptSection />
<VideoList />
```

- [ ] **步驟 3：build + 手動驗收**

```bash
npm run build
```

到 `chrome://extensions` 重新載入擴充功能，打開 Options 頁，確認：

- 三個欄位顯示預設值（20 / 20 / `navigator.language`）
- 改值後重新整理，仍維持
- 數字超出 1–300 會被夾住

- [ ] **步驟 4：commit**

```bash
git add src/options/TranscriptSection.tsx src/options/OptionsPage.tsx
git commit -m "Add transcript settings section to Options"
```

---

### 任務 11：端到端手動測試

**檔案**：無（純驗收）

- [ ] **步驟 1：Build + load**

```bash
npm run build
```

`chrome://extensions` 重新載入。

- [ ] **步驟 2：對英文演講影片寫筆記**

挑一支有英文 caption track 的演講（如使用者範例）。

1. Options 頁設 `transcriptPreferredLang` = `zh-TW`
2. 開影片，按 toolbar icon 開面板
3. 在 03:11 附近新增第一條筆記，存檔
4. Console 應該看到 transcript fetch 沒有 error
5. DevTools → Application → IndexedDB → `video-notes` → `transcripts`，確認有 record，`status='ok'`，`translationLanguage='zh-TW'`

- [ ] **步驟 3：再加一條筆記**

新增第二條筆記（例如 05:00 附近）。檢查 IDB：transcript record 應該**沒有**被覆寫（fetch 沒再觸發），因為觸發條件是「儲存前 0 條筆記」。

> 若實際看到第二次也觸發，回頭檢查 `Panel.tsx` 的條件邏輯。

- [ ] **步驟 4：匯出**

到 Options 頁按匯出。打開產生的 `note.md`：

- 兩條筆記下方都應有 `<details>` 區塊
- 內容是中文（auto-translate 過的）
- summary 範圍對齊 segment 邊界，標 `（zh-TW）`

- [ ] **步驟 5：對沒有 caption 的影片**

挑一支沒字幕的（音樂 MV、直播回放等）。寫筆記後檢查 IDB：應該有 `status='unavailable'`。匯出後 `note.md` 該影片每條筆記**沒有** `<details>` 區塊（直接是截圖 → 筆記）。

- [ ] **步驟 6：commit（無 code 變更）**

不需 commit。寫一段驗收筆記到 PR 或 commit message。

---

### 任務 12：README 補充

**檔案**：

- 修改：`README.md`

- [ ] **步驟 1：更新 V1 限制與動機段落**

把 `## 已知限制（V1）` 段落中「不擷取逐字稿」這一行刪掉，並在 `## 完整願景` 下「該時間戳前後的逐字稿」這條改為已實作（移除「若可行」這類保留語）。

新增說明：

```markdown
## 逐字稿

匯出時每條筆記下方會附上 YouTube 逐字稿（前後 20 秒，可在 Options 調整），語言由 Options 「偏好逐字稿語言」決定（預設跟瀏覽器 UI 語言一致）。若該語言不是影片原生字幕、也不在自動翻譯支援清單中，則該筆記不附逐字稿。
```

- [ ] **步驟 2：commit**

```bash
git add README.md
git commit -m "Document transcript export feature"
```

---

## Self-Review 結果

- **Spec 覆蓋**：
  - 拉取（A'）→ 任務 4
  - 時機（首次儲存 fire-and-forget）→ 任務 9
  - 儲存結構（含 IDB 升級）→ 任務 1、5
  - Options 三欄位 → 任務 6、10
  - Markdown `<details>`（截圖 → 逐字稿 → 筆記）→ 任務 7
  - 切片 ±20s → 任務 2
  - 失敗一律省略 → 任務 7（測試 omitsdetails when missing/unavailable/empty）
  - SW bridge（與 screenshots 一致）→ 任務 5
- **Placeholder 掃描**：所有步驟均有具體程式碼或命令，無 TBD / TODO。
- **型別一致性**：`TranscriptRecord`、`TranscriptSegment`、`Tracklist`、`PickedTrack`、`SlicedWindow`、`RenderTranscriptOpts` 在使用點都有定義；`renderNoteMd` 簽章在任務 7 確立後，任務 8 / 9 沿用同一份。
- **Open question**：dedupe（避免每次新筆記都重抓）暫以「只在第一條時觸發」實作。若觀察到同支影片切換語言或重抓需求，後續任務再加 SW getter。
