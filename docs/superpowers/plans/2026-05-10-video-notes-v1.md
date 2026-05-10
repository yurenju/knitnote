# Video Notes V1 實作計畫

> **給 agentic worker：** 必要的 sub-skill 是 superpowers:subagent-driven-development（建議）或 superpowers:executing-plans，逐 task 執行。每個步驟用 checkbox（`- [ ]`）追蹤狀態。

**目標：** 實作 Chrome MV3 擴充功能，讓使用者在 YouTube 觀看頁面對特定時間戳寫筆記、自動截圖，並把結果匯出為符合卡片盒精神的 Markdown 文獻筆記到使用者授權的本機 vault 資料夾。

**架構：** Preact 面板透過 Shadow DOM 注入 `youtube.com/watch?v=*`。Service worker 處理截圖與 toolbar / badge。Options page 透過 File System Access API 寫檔。儲存切兩層：chrome.storage.local 放筆記 metadata，IndexedDB 放截圖 Blob 與已授權的 vault directory handle。

**技術棧：** TypeScript、Preact + Vite（`vite-plugin-web-extension`）、`idb` 操作 IndexedDB、Vitest + `fake-indexeddb` 跑單元測試、Playwright 跑擴充功能 E2E。

**Spec：** [docs/superpowers/specs/2026-05-10-video-notes-v1-design.md](../specs/2026-05-10-video-notes-v1-design.md) — 動工前先讀過。

---

## 檔案結構

跨 task 會建立的原始碼檔案：

```
package.json                          # npm scripts 與依賴
tsconfig.json
vite.config.ts                        # vite-plugin-web-extension 設定
src/
  manifest.ts                         # MV3 manifest 寫成 TS object
  background/
    index.ts                          # service worker 入口
    screenshot.ts                     # captureVisibleTab handler
    badge.ts                          # toolbar badge 更新
    commands.ts                       # toggle-panel 指令 + icon click
  content/
    index.ts                          # content script 入口、偵測 video、掛面板
    yt-navigation.ts                  # SPA navigation 偵測
    panel-host.ts                     # Shadow DOM host、掛/卸 Preact
    screenshot-client.ts              # 請 SW 截圖、用 canvas 裁切
  ui/
    Panel.tsx                         # 面板根元件（空狀態 / 列表 / 編輯三模式）
    EmptyState.tsx
    NoteList.tsx
    NoteCard.tsx                      # 單條筆記顯示（hover 顯示 編輯/刪除）
    NoteEditor.tsx                    # inline 新增/編輯卡片
    theme.ts                          # CSS 變數 token + theme 偵測
    panel.css                         # 面板基礎樣式
  options/
    index.html                        # options page 入口
    index.tsx                         # 掛 root
    OptionsPage.tsx                   # 根元件
    VaultSection.tsx                  # vault 顯示 + 變更
    ThemeSection.tsx
    VideoList.tsx
    VideoRow.tsx
    export/
      runExport.ts                    # 單支匯出協調流程
      writeNoteMd.ts                  # 寫/覆寫 note.md
      writeAssets.ts                  # 增量寫 assets + 清理孤兒檔
      ensureVault.ts                  # 確保 handle 存在且有權限
  shared/
    types.ts                          # Video / Note / Settings 等型別
    storage.ts                        # chrome.storage.local 包裝
    idb.ts                            # IndexedDB 包裝（screenshots、vaultHandle）
    sanitize.ts                       # 檔名 sanitization
    timestamp.ts                      # 秒數 <-> HH:MM:SS / HH-MM-SS
    markdown.ts                       # 產生 note.md 內容
    uuid.ts                           # crypto.randomUUID 包裝
tests/
  unit/
    sanitize.test.ts
    timestamp.test.ts
    markdown.test.ts
    storage.test.ts
    idb.test.ts
    runExport.test.ts
    writeAssets.test.ts
  e2e/
    fixtures.ts                       # Playwright 擴充功能 fixture
    add-note.spec.ts
    export.spec.ts
```

每個檔案職責單一；UI 元件保持小檔。`shared/` 是純邏輯，不依賴 Chrome / DOM API，全部可單元測試。

---

## 任務 1：專案 scaffold（Vite + Preact + TS + MV3 manifest）

**檔案：**
- 新增：`package.json`、`tsconfig.json`、`vite.config.ts`、`src/manifest.ts`、`src/background/index.ts`、`src/content/index.ts`、`src/options/index.html`、`src/options/index.tsx`
- 新增：`public/icon-16.png`、`public/icon-48.png`、`public/icon-128.png`（placeholder）

- [ ] **步驟 1：初始化 npm 專案**

```bash
npm init -y
```

- [ ] **步驟 2：用 npm CLI 安裝最新版套件（不要手寫 package.json 版本號）**

```bash
npm install preact idb
npm install -D typescript vite vite-plugin-web-extension @types/chrome @preact/preset-vite @testing-library/preact vitest fake-indexeddb @playwright/test happy-dom
```

- [ ] **步驟 3：寫 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "types": ["chrome", "vite/client"],
    "paths": { "react": ["./node_modules/preact/compat"], "react/jsx-runtime": ["./node_modules/preact/jsx-runtime"] }
  },
  "include": ["src", "tests"]
}
```

- [ ] **步驟 4：寫 `src/manifest.ts`**

```ts
export default {
  manifest_version: 3,
  name: 'Video Notes',
  version: '0.1.0',
  description: 'Take time-stamped notes on YouTube videos and export as Markdown literature notes.',
  background: { service_worker: 'src/background/index.ts', type: 'module' },
  action: { default_icon: { 16: 'icon-16.png', 48: 'icon-48.png', 128: 'icon-128.png' } },
  options_page: 'src/options/index.html',
  content_scripts: [
    {
      matches: ['https://www.youtube.com/*'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle'
    }
  ],
  permissions: ['activeTab', 'tabs', 'storage'],
  host_permissions: ['https://www.youtube.com/*'],
  commands: {
    'toggle-panel': {
      suggested_key: { default: 'Alt+N' },
      description: 'Toggle Video Notes panel'
    }
  },
  icons: { 16: 'icon-16.png', 48: 'icon-48.png', 128: 'icon-128.png' }
} satisfies chrome.runtime.ManifestV3;
```

- [ ] **步驟 5：寫 `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import webExtension from 'vite-plugin-web-extension';
import manifest from './src/manifest';

export default defineConfig({
  plugins: [
    preact(),
    webExtension({
      manifest: () => manifest,
      additionalInputs: { html: ['src/options/index.html'] }
    })
  ],
  build: { outDir: 'dist', emptyOutDir: true }
});
```

- [ ] **步驟 6：寫最小 stub 入口檔**

`src/background/index.ts`：
```ts
console.log('[video-notes] service worker boot');
```

`src/content/index.ts`：
```ts
console.log('[video-notes] content script boot');
```

`src/options/index.html`：
```html
<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Video Notes — Settings</title></head>
  <body><div id="root"></div><script type="module" src="./index.tsx"></script></body>
</html>
```

`src/options/index.tsx`：
```ts
import { render } from 'preact';
render(<div>Video Notes Options</div>, document.getElementById('root')!);
```

- [ ] **步驟 7：在 `package.json` 加入 npm scripts**

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test"
  }
}
```

- [ ] **步驟 8：建立 placeholder icon（任意 1×1 透明 PNG 即可）**

```bash
node -e "const fs=require('fs');const buf=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=','base64');fs.mkdirSync('public',{recursive:true});['icon-16.png','icon-48.png','icon-128.png'].forEach(n=>fs.writeFileSync(`public/${n}`,buf));"
```

- [ ] **步驟 9：驗證 build 可以跑**

```bash
npm run build
```

預期：產生 `dist/`，內含 `manifest.json`、`background/index.js`、`content/index.js`、`options/index.html`，無錯誤。

- [ ] **步驟 10：commit**

```bash
git add -A
git commit -m "Scaffold Vite + Preact + MV3 manifest"
```

---

## 任務 2：`shared/sanitize.ts` — 檔名 sanitization（TDD）

**檔案：**
- 新增：`src/shared/sanitize.ts`
- 測試：`tests/unit/sanitize.test.ts`

- [ ] **步驟 1：寫失敗測試**

```ts
// tests/unit/sanitize.test.ts
import { describe, it, expect } from 'vitest';
import { sanitizeFilename } from '../../src/shared/sanitize';

describe('sanitizeFilename', () => {
  it('replaces forbidden chars with dash', () => {
    expect(sanitizeFilename('a<b>c:d"e/f\\g|h?i*j')).toBe('a-b-c-d-e-f-g-h-i-j');
  });

  it('strips ASCII control chars', () => {
    expect(sanitizeFilename('a\x00b\x1Fc')).toBe('a-b-c');
  });

  it('trims leading/trailing whitespace', () => {
    expect(sanitizeFilename('  hello  ')).toBe('hello');
  });

  it('trims trailing dots', () => {
    expect(sanitizeFilename('hello...')).toBe('hello');
  });

  it('prefixes Windows reserved names with underscore', () => {
    expect(sanitizeFilename('CON')).toBe('_CON');
    expect(sanitizeFilename('PRN')).toBe('_PRN');
    expect(sanitizeFilename('COM1')).toBe('_COM1');
    expect(sanitizeFilename('LPT9')).toBe('_LPT9');
    expect(sanitizeFilename('con')).toBe('_con');
  });

  it('truncates to 100 chars', () => {
    const long = 'a'.repeat(150);
    expect(sanitizeFilename(long)).toHaveLength(100);
  });

  it('falls back to provided id when result is empty', () => {
    expect(sanitizeFilename('   ', 'abc123')).toBe('abc123');
    expect(sanitizeFilename('....', 'abc123')).toBe('abc123');
    expect(sanitizeFilename('', 'abc123')).toBe('abc123');
  });

  it('throws when result empty and no fallback given', () => {
    expect(() => sanitizeFilename('   ')).toThrow();
  });
});
```

- [ ] **步驟 2：跑測試確認失敗**

```bash
npm test -- sanitize
```

預期：FAIL，找不到模組。

- [ ] **步驟 3：實作**

```ts
// src/shared/sanitize.ts
const FORBIDDEN = /[<>:"/\\|?*\x00-\x1F]/g;
const RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

export function sanitizeFilename(input: string, fallbackId?: string): string {
  let out = input.replace(FORBIDDEN, '-').trim().replace(/\.+$/, '');
  if (out.length > 100) out = out.slice(0, 100);
  if (RESERVED.test(out)) out = '_' + out;
  if (out.length === 0) {
    if (fallbackId) return fallbackId;
    throw new Error('sanitizeFilename produced empty result and no fallback provided');
  }
  return out;
}
```

- [ ] **步驟 4：跑測試確認通過**

```bash
npm test -- sanitize
```

預期：PASS。

- [ ] **步驟 5：commit**

```bash
git add src/shared/sanitize.ts tests/unit/sanitize.test.ts
git commit -m "Add filename sanitization utility"
```

---

## 任務 3：`shared/timestamp.ts` — 秒數 <-> 字串（TDD）

**檔案：**
- 新增：`src/shared/timestamp.ts`
- 測試：`tests/unit/timestamp.test.ts`

- [ ] **步驟 1：寫失敗測試**

```ts
// tests/unit/timestamp.test.ts
import { describe, it, expect } from 'vitest';
import { formatColon, formatDash } from '../../src/shared/timestamp';

describe('formatColon', () => {
  it('formats sub-minute', () => { expect(formatColon(42)).toBe('00:00:42'); });
  it('formats sub-hour', () => { expect(formatColon(222)).toBe('00:03:42'); });
  it('formats hour-plus', () => { expect(formatColon(3725)).toBe('01:02:05'); });
  it('floors fractional seconds', () => { expect(formatColon(42.9)).toBe('00:00:42'); });
  it('handles zero', () => { expect(formatColon(0)).toBe('00:00:00'); });
});

describe('formatDash', () => {
  it('uses dashes instead of colons', () => { expect(formatDash(222)).toBe('00-03-42'); });
});
```

- [ ] **步驟 2：跑測試確認失敗**

```bash
npm test -- timestamp
```

- [ ] **步驟 3：實作**

```ts
// src/shared/timestamp.ts
export function formatColon(totalSec: number): string {
  const s = Math.floor(totalSec);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

export function formatDash(totalSec: number): string {
  return formatColon(totalSec).replace(/:/g, '-');
}
```

- [ ] **步驟 4：跑測試確認通過 + commit**

```bash
npm test -- timestamp
git add src/shared/timestamp.ts tests/unit/timestamp.test.ts
git commit -m "Add timestamp formatting utilities"
```

---

## 任務 4：`shared/types.ts` — 領域型別

**檔案：**
- 新增：`src/shared/types.ts`

- [ ] **步驟 1：定義型別**

```ts
// src/shared/types.ts
export interface Note {
  id: string;
  timestampSec: number;
  text: string;
  createdAt: string;        // ISO 8601 with timezone
  updatedAt: string;
  screenshotKey: string;    // IndexedDB key
}

export interface Video {
  videoId: string;
  title: string;
  channel: string;
  url: string;
  firstNoteAt: string;
  lastModifiedAt: string;
  lastExportedAt: string | null;
  notes: Note[];
}

export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  theme: Theme;
  hasVaultConfigured: boolean;
}

export interface StorageShape {
  videos: Record<string, Video>;
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = { theme: 'system', hasVaultConfigured: false };
```

- [ ] **步驟 2：commit**

```bash
git add src/shared/types.ts
git commit -m "Add domain types"
```

---

## 任務 5：`shared/storage.ts` — chrome.storage.local 包裝（TDD）

**檔案：**
- 新增：`src/shared/storage.ts`
- 新增：`tests/unit/_chrome-mock.ts`
- 測試：`tests/unit/storage.test.ts`

- [ ] **步驟 1：寫 chrome.storage mock**

```ts
// tests/unit/_chrome-mock.ts
type Listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => void;

export function installChromeMock(): { reset: () => void } {
  const data: Record<string, unknown> = {};
  const listeners: Listener[] = [];
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: (keys: string | string[] | null) => {
          if (keys === null || keys === undefined) return Promise.resolve({ ...data });
          const arr = Array.isArray(keys) ? keys : [keys];
          const out: Record<string, unknown> = {};
          arr.forEach(k => { if (k in data) out[k] = data[k]; });
          return Promise.resolve(out);
        },
        set: (items: Record<string, unknown>) => {
          const changes: Record<string, chrome.storage.StorageChange> = {};
          Object.entries(items).forEach(([k, v]) => {
            changes[k] = { oldValue: data[k], newValue: v };
            data[k] = v;
          });
          listeners.forEach(l => l(changes, 'local'));
          return Promise.resolve();
        },
        remove: (keys: string | string[]) => {
          const arr = Array.isArray(keys) ? keys : [keys];
          const changes: Record<string, chrome.storage.StorageChange> = {};
          arr.forEach(k => { if (k in data) { changes[k] = { oldValue: data[k], newValue: undefined }; delete data[k]; } });
          listeners.forEach(l => l(changes, 'local'));
          return Promise.resolve();
        }
      },
      onChanged: { addListener: (l: Listener) => listeners.push(l), removeListener: () => {} }
    }
  };
  return { reset: () => { for (const k of Object.keys(data)) delete data[k]; listeners.length = 0; } };
}
```

- [ ] **步驟 2：寫失敗測試**

```ts
// tests/unit/storage.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { installChromeMock } from './_chrome-mock';
import { getAllVideos, getVideo, upsertVideo, deleteVideo, getSettings, setSettings } from '../../src/shared/storage';
import type { Video } from '../../src/shared/types';

const mock = installChromeMock();

const sampleVideo = (id: string): Video => ({
  videoId: id, title: 'T', channel: 'C', url: 'https://www.youtube.com/watch?v=' + id,
  firstNoteAt: '2026-05-10T10:00:00+08:00', lastModifiedAt: '2026-05-10T10:00:00+08:00',
  lastExportedAt: null, notes: []
});

describe('storage', () => {
  beforeEach(() => mock.reset());

  it('returns empty videos and default settings on fresh storage', async () => {
    expect(await getAllVideos()).toEqual({});
    expect((await getSettings()).theme).toBe('system');
  });

  it('upsert + get a video', async () => {
    await upsertVideo(sampleVideo('a'));
    expect(await getVideo('a')).toMatchObject({ videoId: 'a' });
  });

  it('upsert preserves other videos', async () => {
    await upsertVideo(sampleVideo('a'));
    await upsertVideo(sampleVideo('b'));
    expect(Object.keys(await getAllVideos())).toEqual(['a', 'b']);
  });

  it('delete removes one video', async () => {
    await upsertVideo(sampleVideo('a'));
    await upsertVideo(sampleVideo('b'));
    await deleteVideo('a');
    expect(await getVideo('a')).toBeUndefined();
    expect(await getVideo('b')).toBeDefined();
  });

  it('setSettings persists', async () => {
    await setSettings({ theme: 'dark', hasVaultConfigured: true });
    expect(await getSettings()).toEqual({ theme: 'dark', hasVaultConfigured: true });
  });
});
```

- [ ] **步驟 3：跑測試確認失敗**

```bash
npm test -- storage
```

- [ ] **步驟 4：實作**

```ts
// src/shared/storage.ts
import { DEFAULT_SETTINGS, Settings, Video } from './types';

const VIDEOS_KEY = 'videos';
const SETTINGS_KEY = 'settings';

export async function getAllVideos(): Promise<Record<string, Video>> {
  const r = await chrome.storage.local.get(VIDEOS_KEY);
  return (r[VIDEOS_KEY] as Record<string, Video>) ?? {};
}

export async function getVideo(id: string): Promise<Video | undefined> {
  const all = await getAllVideos();
  return all[id];
}

export async function upsertVideo(video: Video): Promise<void> {
  const all = await getAllVideos();
  all[video.videoId] = video;
  await chrome.storage.local.set({ [VIDEOS_KEY]: all });
}

export async function deleteVideo(id: string): Promise<void> {
  const all = await getAllVideos();
  delete all[id];
  await chrome.storage.local.set({ [VIDEOS_KEY]: all });
}

export async function getSettings(): Promise<Settings> {
  const r = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...((r[SETTINGS_KEY] as Settings) ?? {}) };
}

export async function setSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: s });
}
```

- [ ] **步驟 5：跑測試確認通過 + commit**

```bash
npm test -- storage
git add src/shared/storage.ts tests/unit/storage.test.ts tests/unit/_chrome-mock.ts
git commit -m "Add chrome.storage wrapper"
```

---

## 任務 6：`shared/idb.ts` — IndexedDB 包裝（screenshots + vaultHandle，TDD）

**檔案：**
- 新增：`src/shared/idb.ts`
- 測試：`tests/unit/idb.test.ts`

- [ ] **步驟 1：寫失敗測試（用 fake-indexeddb）**

```ts
// tests/unit/idb.test.ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { putScreenshot, getScreenshot, deleteScreenshot, listScreenshotKeys } from '../../src/shared/idb';

describe('idb screenshots', () => {
  beforeEach(async () => {
    indexedDB.deleteDatabase('video-notes');
  });

  it('roundtrips a Blob', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    await putScreenshot('shot_a', blob);
    const got = await getScreenshot('shot_a');
    expect(got).toBeInstanceOf(Blob);
    expect(await got!.arrayBuffer()).toEqual(await blob.arrayBuffer());
  });

  it('returns undefined for missing key', async () => {
    expect(await getScreenshot('nope')).toBeUndefined();
  });

  it('delete removes', async () => {
    const blob = new Blob([new Uint8Array([1])]);
    await putScreenshot('shot_x', blob);
    await deleteScreenshot('shot_x');
    expect(await getScreenshot('shot_x')).toBeUndefined();
  });

  it('listScreenshotKeys returns all keys', async () => {
    await putScreenshot('shot_a', new Blob([new Uint8Array([1])]));
    await putScreenshot('shot_b', new Blob([new Uint8Array([2])]));
    const keys = await listScreenshotKeys();
    expect(keys.sort()).toEqual(['shot_a', 'shot_b']);
  });
});
```

- [ ] **步驟 2：跑測試確認失敗**

```bash
npm test -- idb
```

- [ ] **步驟 3：實作**

```ts
// src/shared/idb.ts
import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'video-notes';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('screenshots')) db.createObjectStore('screenshots');
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      }
    });
  }
  return dbPromise;
}

export async function putScreenshot(key: string, blob: Blob): Promise<void> {
  const db = await getDb();
  await db.put('screenshots', blob, key);
}

export async function getScreenshot(key: string): Promise<Blob | undefined> {
  const db = await getDb();
  return db.get('screenshots', key);
}

export async function deleteScreenshot(key: string): Promise<void> {
  const db = await getDb();
  await db.delete('screenshots', key);
}

export async function listScreenshotKeys(): Promise<string[]> {
  const db = await getDb();
  return (await db.getAllKeys('screenshots')) as string[];
}

export async function getVaultHandle(): Promise<FileSystemDirectoryHandle | undefined> {
  const db = await getDb();
  return db.get('meta', 'vaultHandle');
}

export async function setVaultHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await getDb();
  await db.put('meta', handle, 'vaultHandle');
}

export async function clearVaultHandle(): Promise<void> {
  const db = await getDb();
  await db.delete('meta', 'vaultHandle');
}
```

- [ ] **步驟 4：跑測試確認通過 + commit**

若測試之間互相干擾，可加一個 `_resetForTest` 並在 `beforeEach` 呼叫；否則直接：

```bash
npm test -- idb
git add src/shared/idb.ts tests/unit/idb.test.ts
git commit -m "Add IndexedDB wrapper for screenshots and vault handle"
```

---

## 任務 7：`shared/markdown.ts` — 產生 note.md（TDD）

**檔案：**
- 新增：`src/shared/markdown.ts`
- 測試：`tests/unit/markdown.test.ts`

- [ ] **步驟 1：寫失敗測試**

```ts
// tests/unit/markdown.test.ts
import { describe, it, expect } from 'vitest';
import { renderNoteMd } from '../../src/shared/markdown';
import type { Video } from '../../src/shared/types';

const video: Video = {
  videoId: 'abc123',
  title: 'How to learn',
  channel: 'Some Channel',
  url: 'https://www.youtube.com/watch?v=abc123',
  firstNoteAt: '2026-05-10T14:30:00+08:00',
  lastModifiedAt: '2026-05-10T15:12:00+08:00',
  lastExportedAt: null,
  notes: [
    {
      id: 'n1', timestampSec: 222, text: 'Active recall beats re-reading.',
      createdAt: '2026-05-10T14:30:00+08:00', updatedAt: '2026-05-10T14:30:00+08:00',
      screenshotKey: 'shot_1'
    },
    {
      id: 'n2', timestampSec: 725, text: 'Spacing matters.',
      createdAt: '2026-05-10T14:35:00+08:00', updatedAt: '2026-05-10T14:35:00+08:00',
      screenshotKey: 'shot_2'
    }
  ]
};

describe('renderNoteMd', () => {
  it('contains YAML frontmatter with required fields', () => {
    const md = renderNoteMd(video, '2026-05-10T15:30:00+08:00');
    expect(md).toMatch(/^---\n/);
    expect(md).toContain('title: How to learn');
    expect(md).toContain('videoId: abc123');
    expect(md).toContain('exportedAt: 2026-05-10T15:30:00+08:00');
    expect(md).toContain('noteCount: 2');
  });

  it('lists notes sorted by timestamp', () => {
    const out = renderNoteMd(video, '2026-05-10T15:30:00+08:00');
    expect(out.indexOf('00:03:42')).toBeLessThan(out.indexOf('00:12:05'));
  });

  it('embeds asset reference per note', () => {
    const out = renderNoteMd(video, '2026-05-10T15:30:00+08:00');
    expect(out).toContain('![](assets/00-03-42.png)');
    expect(out).toContain('![](assets/00-12-05.png)');
  });

  it('uses blockquote for note text', () => {
    const out = renderNoteMd(video, '2026-05-10T15:30:00+08:00');
    expect(out).toContain('> Active recall beats re-reading.');
  });

  it('links timestamp heading to YouTube with &t=Xs', () => {
    const out = renderNoteMd(video, '2026-05-10T15:30:00+08:00');
    expect(out).toContain('## [00:03:42](https://www.youtube.com/watch?v=abc123&t=222s)');
  });

  it('escapes YAML-unsafe title characters by quoting', () => {
    const tricky = { ...video, title: 'Title: with colon "quotes"' };
    const out = renderNoteMd(tricky, '2026-05-10T15:30:00+08:00');
    expect(out).toMatch(/title: ".*"/);
  });

  it('handles multi-line note text by indenting subsequent lines under blockquote', () => {
    const v2 = { ...video, notes: [{ ...video.notes[0], text: 'line one\nline two' }] };
    const out = renderNoteMd(v2, '2026-05-10T15:30:00+08:00');
    expect(out).toContain('> line one');
    expect(out).toContain('> line two');
  });
});
```

- [ ] **步驟 2：跑測試確認失敗**

```bash
npm test -- markdown
```

- [ ] **步驟 3：實作**

```ts
// src/shared/markdown.ts
import type { Video, Note } from './types';
import { formatColon, formatDash } from './timestamp';

function yamlValue(v: string): string {
  if (/[":#\n]/.test(v)) return '"' + v.replace(/"/g, '\\"') + '"';
  return v;
}

function blockquote(text: string): string {
  return text.split('\n').map(l => '> ' + l).join('\n');
}

export function renderNoteMd(video: Video, exportedAtIso: string): string {
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
  for (const n of sorted) {
    const ts = formatColon(n.timestampSec);
    const tsDash = formatDash(n.timestampSec);
    lines.push('---');
    lines.push('');
    lines.push(`## [${ts}](${video.url}&t=${Math.floor(n.timestampSec)}s)`);
    lines.push('');
    lines.push(`![](assets/${tsDash}.png)`);
    lines.push('');
    lines.push(blockquote(n.text));
    lines.push('');
  }
  return lines.join('\n');
}
```

- [ ] **步驟 4：跑測試確認通過 + commit**

```bash
npm test -- markdown
git add src/shared/markdown.ts tests/unit/markdown.test.ts
git commit -m "Add note.md renderer"
```

---

## 任務 8：`shared/uuid.ts` — id 產生器

**檔案：**
- 新增：`src/shared/uuid.ts`

- [ ] **步驟 1：實作**

```ts
// src/shared/uuid.ts
export function noteId(): string { return 'note_' + crypto.randomUUID(); }
export function shotId(): string { return 'shot_' + crypto.randomUUID(); }
```

- [ ] **步驟 2：commit**

```bash
git add src/shared/uuid.ts
git commit -m "Add uuid helpers"
```

---

## 任務 9：Service worker — 訊息協定 + 截圖 handler

**檔案：**
- 新增：`src/background/messages.ts`
- 新增：`src/background/screenshot.ts`
- 修改：`src/background/index.ts`

- [ ] **步驟 1：定義訊息型別**

```ts
// src/background/messages.ts
export type Message =
  | { type: 'capture-tab'; }
  | { type: 'toggle-panel'; }
  | { type: 'badge-set'; tabId: number; count: number };

export interface CaptureTabResponse { dataUrl: string; }
```

- [ ] **步驟 2：實作截圖 handler**

```ts
// src/background/screenshot.ts
export async function captureActiveTab(): Promise<string> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.windowId) throw new Error('No active tab');
  return await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
}
```

- [ ] **步驟 3：在 service worker 接線**

```ts
// src/background/index.ts
import type { Message, CaptureTabResponse } from './messages';
import { captureActiveTab } from './screenshot';

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  if (msg.type === 'capture-tab') {
    captureActiveTab()
      .then(dataUrl => sendResponse({ dataUrl } satisfies CaptureTabResponse))
      .catch(err => sendResponse({ error: String(err) }));
    return true; // keep port open for async response
  }
  return false;
});
```

- [ ] **步驟 4：build 並手動測試**

```bash
npm run build
```

到 `chrome://extensions` 載入 `dist/` 為未封裝。打開一支 YouTube 影片。打開 service worker 的 devtools（chrome://extensions → 「Inspect views: service worker」）。在 console：

```js
chrome.tabs.query({active:true,currentWindow:true}).then(([t]) => chrome.tabs.captureVisibleTab(t.windowId,{format:'png'})).then(d => console.log(d.slice(0,80)));
```

預期：印出 `data:image/png;base64,...` 開頭。

- [ ] **步驟 5：commit**

```bash
git add src/background
git commit -m "Add service worker screenshot handler"
```

---

## 任務 10：Service worker — toggle panel 指令 + icon 點擊

**檔案：**
- 新增：`src/background/commands.ts`
- 修改：`src/background/index.ts`

- [ ] **步驟 1：實作**

```ts
// src/background/commands.ts
export function sendTogglePanel(tabId: number): void {
  chrome.tabs.sendMessage(tabId, { type: 'toggle-panel' }).catch(() => {});
}
```

- [ ] **步驟 2：接線 icon click + command**

加到 `src/background/index.ts` top level（不是 message listener 內）：

```ts
import { sendTogglePanel } from './commands';

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) sendTogglePanel(tab.id);
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-panel') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id) sendTogglePanel(tab.id);
    });
  }
});
```

- [ ] **步驟 3：手動測試**

reload 擴充功能。在 YouTube 觀看頁點 toolbar icon → content script console 收到 `toggle-panel`（任務 14 之後才會看到面板實際開）。

- [ ] **步驟 4：commit**

```bash
git add src/background
git commit -m "Add toggle-panel command and icon click"
```

---

## 任務 11：Service worker — badge 隨 storage 變動更新

**檔案：**
- 新增：`src/background/badge.ts`
- 修改：`src/background/index.ts`

- [ ] **步驟 1：從 URL 抽 videoId**

```ts
// src/background/badge.ts
import { getAllVideos } from '../shared/storage';

export function videoIdFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname !== 'www.youtube.com' || u.pathname !== '/watch') return null;
    return u.searchParams.get('v');
  } catch { return null; }
}

export async function refreshBadgeForTab(tabId: number, url: string | undefined): Promise<void> {
  const videoId = videoIdFromUrl(url);
  if (!videoId) {
    await chrome.action.setBadgeText({ tabId, text: '' });
    return;
  }
  const videos = await getAllVideos();
  const count = videos[videoId]?.notes.length ?? 0;
  await chrome.action.setBadgeText({ tabId, text: count > 0 ? String(count) : '' });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: '#6a4dff' });
}
```

- [ ] **步驟 2：在 service worker 接線**

```ts
// src/background/index.ts 加入
import { refreshBadgeForTab } from './badge';

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') refreshBadgeForTab(tabId, tab.url);
});
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  refreshBadgeForTab(tabId, tab.url);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.videos) return;
  chrome.tabs.query({}).then(tabs => {
    tabs.forEach(t => { if (t.id) refreshBadgeForTab(t.id, t.url); });
  });
});
```

- [ ] **步驟 3：commit**

```bash
git add src/background
git commit -m "Add toolbar badge updater"
```

---

## 任務 12：Content script bootstrap — 偵測 video 元素 + SPA 導航

**檔案：**
- 新增：`src/content/yt-navigation.ts`
- 修改：`src/content/index.ts`

- [ ] **步驟 1：實作導航偵測**

```ts
// src/content/yt-navigation.ts
import { videoIdFromUrl } from '../background/badge';

export type NavCallback = (videoId: string | null) => void;

export function watchYouTubeNavigation(cb: NavCallback): () => void {
  let last: string | null = videoIdFromUrl(location.href);
  cb(last);
  const onChange = () => {
    const cur = videoIdFromUrl(location.href);
    if (cur !== last) { last = cur; cb(cur); }
  };
  document.addEventListener('yt-navigate-finish', onChange);
  window.addEventListener('popstate', onChange);
  // YouTube also pushes via pushState — observe via patching is overkill; the events above cover real navigation
  const interval = setInterval(onChange, 1000);
  return () => {
    document.removeEventListener('yt-navigate-finish', onChange);
    window.removeEventListener('popstate', onChange);
    clearInterval(interval);
  };
}

export function findVideoElement(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>('#movie_player video');
}
```

- [ ] **步驟 2：bootstrap content script**

```ts
// src/content/index.ts
import { watchYouTubeNavigation, findVideoElement } from './yt-navigation';

let currentVideoId: string | null = null;

watchYouTubeNavigation((videoId) => {
  currentVideoId = videoId;
  console.log('[video-notes] video changed:', videoId);
  // Panel mount logic comes in next task
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'toggle-panel') {
    console.log('[video-notes] toggle-panel; current video:', currentVideoId);
    // Panel toggle logic in next task
  }
});

// expose for debugging
(globalThis as any).__videoNotes = { findVideoElement };
```

- [ ] **步驟 3：手動測試**

reload 擴充功能。打開 `youtube.com/watch?v=...`。在 YouTube 頁的 console：

```js
__videoNotes.findVideoElement()
```

預期：回傳 `<video>` 元素。

點 toolbar icon → console 印 `toggle-panel; current video: <id>`。

- [ ] **步驟 4：commit**

```bash
git add src/content
git commit -m "Content script: detect video element and SPA nav"
```

---

## 任務 13：Theme tokens + theme 偵測

**檔案：**
- 新增：`src/ui/theme.ts`
- 新增：`src/ui/panel.css`

- [ ] **步驟 1：定義 theme tokens**

```css
/* src/ui/panel.css */
:host, .options-root {
  --vn-bg: #ffffff;
  --vn-bg-elevated: #f5f5f5;
  --vn-fg: #1a1a1a;
  --vn-fg-muted: #666;
  --vn-accent: #6a4dff;
  --vn-accent-fg: #fff;
  --vn-border: #e0e0e0;
  --vn-danger: #d33;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  color: var(--vn-fg);
  background: var(--vn-bg);
}
:host(.theme-dark), .options-root.theme-dark {
  --vn-bg: #1a1a1a;
  --vn-bg-elevated: #2a2238;
  --vn-fg: #ddd;
  --vn-fg-muted: #999;
  --vn-accent: #b09dff;
  --vn-accent-fg: #1a1525;
  --vn-border: #333;
}
.vn-panel { display: flex; flex-direction: column; padding: 12px; gap: 8px; }
.vn-panel-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 8px; border-bottom: 1px solid var(--vn-border); }
.vn-empty { display:flex; flex-direction:column; align-items:center; padding: 24px 12px; color: var(--vn-fg-muted); text-align:center; }
.vn-note { background: var(--vn-bg-elevated); border-radius: 4px; padding: 8px; margin-bottom: 6px; }
.vn-note-ts { color: var(--vn-accent); font-weight: 600; cursor: pointer; }
.vn-note-text { white-space: pre-wrap; margin-top: 4px; }
.vn-note-actions { display:none; gap: 8px; margin-top: 6px; }
.vn-note:hover .vn-note-actions { display: flex; }
.vn-btn-primary { background: var(--vn-accent); color: var(--vn-accent-fg); border: 0; padding: 6px 10px; border-radius: 4px; cursor: pointer; }
.vn-btn-secondary { background: transparent; color: var(--vn-fg); border: 1px solid var(--vn-border); padding: 6px 10px; border-radius: 4px; cursor: pointer; }
.vn-input { background: var(--vn-bg); color: var(--vn-fg); border: 1px solid var(--vn-border); border-radius: 4px; padding: 6px; width: 100%; min-height: 60px; resize: vertical; font-family: inherit; }
.vn-add { width: 100%; padding: 8px; background: var(--vn-accent); color: var(--vn-accent-fg); border: 0; border-radius: 4px; cursor: pointer; }
```

- [ ] **步驟 2：theme 解析**

```ts
// src/ui/theme.ts
import type { Theme } from '../shared/types';

export type Resolved = 'light' | 'dark';

export function resolveTheme(t: Theme): Resolved {
  if (t === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return t;
}

export function applyThemeClass(host: Element, t: Theme): void {
  const r = resolveTheme(t);
  host.classList.toggle('theme-dark', r === 'dark');
  host.classList.toggle('theme-light', r === 'light');
}

export function watchSystemTheme(cb: () => void): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
```

- [ ] **步驟 3：commit**

```bash
git add src/ui
git commit -m "Add theme tokens and resolution"
```

---

## 任務 14：面板 host — Shadow DOM + Preact 掛載

**檔案：**
- 新增：`src/content/panel-host.ts`
- 新增：`src/ui/Panel.tsx`（skeleton）
- 新增：`src/ui/EmptyState.tsx`
- 修改：`src/content/index.ts`

- [ ] **步驟 1：空狀態元件**

```tsx
// src/ui/EmptyState.tsx
export function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div class="vn-empty">
      <div style="font-size:32px; margin-bottom:8px;">📝</div>
      <div>還沒寫過筆記</div>
      <div style="margin-top:6px; opacity:0.7;">在精彩段落按下方按鈕<br/>就會自動暫停讓你寫</div>
      <button class="vn-add" style="margin-top:16px;" onClick={onAdd}>＋ 新增筆記</button>
    </div>
  );
}
```

- [ ] **步驟 2：Panel skeleton**

```tsx
// src/ui/Panel.tsx
import { useState } from 'preact/hooks';
import { EmptyState } from './EmptyState';

export interface PanelProps {
  videoId: string;
  onClose: () => void;
}

export function Panel({ videoId, onClose }: PanelProps) {
  const [_v, setV] = useState(0);  // 重繪 trigger placeholder；任務 16 會替換
  return (
    <div class="vn-panel">
      <div class="vn-panel-header">
        <strong>📝 Video Notes</strong>
        <button class="vn-btn-secondary" onClick={onClose}>✕</button>
      </div>
      <EmptyState onAdd={() => setV(v => v + 1)} />
      <div style="font-size:11px; color:var(--vn-fg-muted);">video: {videoId}</div>
    </div>
  );
}
```

- [ ] **步驟 3：Panel host**

```ts
// src/content/panel-host.ts
import { render, h } from 'preact';
import { Panel } from '../ui/Panel';
import { applyThemeClass } from '../ui/theme';
import { getSettings } from '../shared/storage';
import panelCss from '../ui/panel.css?raw';

const HOST_ID = 'video-notes-panel-host';

export async function mountPanel(videoId: string): Promise<void> {
  // Find target: YouTube #secondary (related videos) container
  const target = document.querySelector('#secondary') ?? document.body;
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'all: initial; display: block;';
    target.prepend(host);
  }
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  shadow.innerHTML = '';

  const styleEl = document.createElement('style');
  styleEl.textContent = panelCss;
  shadow.appendChild(styleEl);

  const root = document.createElement('div');
  shadow.appendChild(root);

  const settings = await getSettings();
  applyThemeClass(host, settings.theme);

  const onClose = () => unmountPanel();
  render(h(Panel, { videoId, onClose }), root);
}

export function unmountPanel(): void {
  document.getElementById(HOST_ID)?.remove();
}

export function isPanelMounted(): boolean {
  return !!document.getElementById(HOST_ID);
}
```

- [ ] **步驟 4：在 content/index.ts 接線 toggle**

```ts
// src/content/index.ts — 替換 toggle-panel handler
import { mountPanel, unmountPanel, isPanelMounted } from './panel-host';
// ... 在 chrome.runtime.onMessage.addListener 內：
if (msg.type === 'toggle-panel') {
  if (!currentVideoId) return;
  if (isPanelMounted()) unmountPanel();
  else mountPanel(currentVideoId);
}
```

- [ ] **步驟 5：手動測試**

build、reload、打開 YouTube 觀看頁、點 toolbar icon。面板應出現在右欄頂端，顯示空狀態。

```bash
npm run build
```

- [ ] **步驟 6：commit**

```bash
git add src/content src/ui
git commit -m "Mount Preact panel in Shadow DOM"
```

---

## 任務 15：NoteList + NoteCard 元件（純顯示）

**檔案：**
- 新增：`src/ui/NoteCard.tsx`
- 新增：`src/ui/NoteList.tsx`
- 修改：`src/ui/Panel.tsx`

- [ ] **步驟 1：NoteCard**

```tsx
// src/ui/NoteCard.tsx
import type { Note } from '../shared/types';
import { formatColon } from '../shared/timestamp';

export interface NoteCardProps {
  note: Note;
  onSeek: (sec: number) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function NoteCard({ note, onSeek, onEdit, onDelete }: NoteCardProps) {
  return (
    <div class="vn-note">
      <div class="vn-note-ts" onClick={() => onSeek(note.timestampSec)}>⏱ {formatColon(note.timestampSec)}</div>
      <div class="vn-note-text">{note.text}</div>
      <div class="vn-note-actions">
        <button class="vn-btn-secondary" onClick={() => onEdit(note.id)}>編輯</button>
        <button class="vn-btn-secondary" onClick={() => onDelete(note.id)}>刪除</button>
      </div>
    </div>
  );
}
```

- [ ] **步驟 2：NoteList**

```tsx
// src/ui/NoteList.tsx
import type { Note } from '../shared/types';
import { NoteCard } from './NoteCard';

export interface NoteListProps {
  notes: Note[];
  onSeek: (sec: number) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function NoteList({ notes, onSeek, onEdit, onDelete }: NoteListProps) {
  const sorted = [...notes].sort((a, b) => a.timestampSec - b.timestampSec);
  return (
    <div>
      {sorted.map(n => (
        <NoteCard key={n.id} note={n} onSeek={onSeek} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </div>
  );
}
```

- [ ] **步驟 3：元件測試**

```ts
// tests/unit/NoteList.test.tsx
import '@testing-library/preact';
import { render } from '@testing-library/preact';
import { describe, it, expect, vi } from 'vitest';
import { NoteList } from '../../src/ui/NoteList';
import type { Note } from '../../src/shared/types';

const n = (id: string, sec: number, text: string): Note => ({
  id, timestampSec: sec, text, createdAt: '', updatedAt: '', screenshotKey: 'k'
});

describe('NoteList', () => {
  it('renders notes sorted by timestamp', () => {
    render(<NoteList notes={[n('b', 200, 'B'), n('a', 100, 'A')]} onSeek={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);
    const tsTexts = Array.from(document.querySelectorAll('.vn-note-ts')).map(e => e.textContent);
    expect(tsTexts).toEqual(['⏱ 00:01:40', '⏱ 00:03:20']);
  });

  it('seek callback receives seconds', () => {
    const onSeek = vi.fn();
    render(<NoteList notes={[n('a', 222, 'x')]} onSeek={onSeek} onEdit={vi.fn()} onDelete={vi.fn()} />);
    (document.querySelector('.vn-note-ts') as HTMLElement).click();
    expect(onSeek).toHaveBeenCalledWith(222);
  });
});
```

設定 Vitest 用 happy-dom：

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
export default defineConfig({
  plugins: [preact()],
  test: { environment: 'happy-dom', globals: false }
});
```

- [ ] **步驟 4：跑、commit**

```bash
npm test -- NoteList
git add src/ui tests/unit/NoteList.test.tsx vitest.config.ts
git commit -m "Add NoteList and NoteCard components"
```

---

## 任務 16：NoteEditor（inline 新增/編輯）+ Panel state machine

**檔案：**
- 新增：`src/ui/NoteEditor.tsx`
- 修改：`src/ui/Panel.tsx`

- [ ] **步驟 1：NoteEditor**

```tsx
// src/ui/NoteEditor.tsx
import { useEffect, useState, useRef } from 'preact/hooks';
import { formatColon } from '../shared/timestamp';

export interface NoteEditorProps {
  initialText?: string;
  getCurrentSec: () => number;     // poll 反映 scrub
  onSave: (text: string, sec: number) => void;
  onCancel: () => void;
}

export function NoteEditor({ initialText = '', getCurrentSec, onSave, onCancel }: NoteEditorProps) {
  const [text, setText] = useState(initialText);
  const [sec, setSec] = useState(getCurrentSec());
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    taRef.current?.focus();
    const id = setInterval(() => setSec(getCurrentSec()), 250);
    return () => clearInterval(id);
  }, []);

  return (
    <div class="vn-note" style="border:1px solid var(--vn-accent);">
      <div class="vn-note-ts">⏱ {formatColon(sec)} (目前位置)</div>
      <textarea ref={taRef} class="vn-input" value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} placeholder="用自己的話寫下來…" />
      <div style="display:flex; gap:6px; justify-content:flex-end; margin-top:6px;">
        <button class="vn-btn-secondary" onClick={onCancel}>取消</button>
        <button class="vn-btn-primary" onClick={() => onSave(text, getCurrentSec())} disabled={!text.trim()}>Save</button>
      </div>
    </div>
  );
}
```

- [ ] **步驟 2：Panel 狀態機**

替換 `src/ui/Panel.tsx`：

```tsx
import { useEffect, useState, useCallback } from 'preact/hooks';
import { EmptyState } from './EmptyState';
import { NoteList } from './NoteList';
import { NoteEditor } from './NoteEditor';
import type { Video, Note } from '../shared/types';
import { getVideo, upsertVideo } from '../shared/storage';
import { putScreenshot, deleteScreenshot } from '../shared/idb';
import { noteId, shotId } from '../shared/uuid';

export interface PanelDeps {
  videoId: string;
  getVideoMeta: () => { title: string; channel: string; url: string };
  getCurrentSec: () => number;
  pauseVideo: () => void;
  seekVideo: (sec: number) => void;
  captureScreenshot: () => Promise<Blob>;
  onClose: () => void;
}

type Mode = { kind: 'list' } | { kind: 'new' } | { kind: 'edit'; id: string };

export function Panel({ videoId, getVideoMeta, getCurrentSec, pauseVideo, seekVideo, captureScreenshot, onClose }: PanelDeps) {
  const [video, setVideo] = useState<Video | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: 'list' });

  const load = useCallback(async () => {
    const v = await getVideo(videoId);
    setVideo(v ?? null);
  }, [videoId]);

  useEffect(() => { load(); }, [load]);

  const startNew = () => {
    pauseVideo();
    setMode({ kind: 'new' });
  };

  const saveNew = async (text: string, sec: number) => {
    const meta = getVideoMeta();
    const blob = await captureScreenshot();
    const sk = shotId();
    await putScreenshot(sk, blob);
    const now = new Date().toISOString();
    const note: Note = { id: noteId(), timestampSec: sec, text, createdAt: now, updatedAt: now, screenshotKey: sk };
    const existing = await getVideo(videoId);
    const updated: Video = existing
      ? { ...existing, lastModifiedAt: now, notes: [...existing.notes, note] }
      : { videoId, title: meta.title, channel: meta.channel, url: meta.url, firstNoteAt: now, lastModifiedAt: now, lastExportedAt: null, notes: [note] };
    await upsertVideo(updated);
    setVideo(updated);
    setMode({ kind: 'list' });
  };

  const saveEdit = async (text: string) => {
    if (mode.kind !== 'edit') return;
    const v = await getVideo(videoId); if (!v) return;
    const now = new Date().toISOString();
    const updated: Video = {
      ...v,
      lastModifiedAt: now,
      notes: v.notes.map(n => n.id === mode.id ? { ...n, text, updatedAt: now } : n)
    };
    await upsertVideo(updated);
    setVideo(updated);
    setMode({ kind: 'list' });
  };

  const onDelete = async (id: string) => {
    if (!confirm('確定要刪除這條筆記？')) return;
    const v = await getVideo(videoId); if (!v) return;
    const target = v.notes.find(n => n.id === id);
    if (target) await deleteScreenshot(target.screenshotKey);
    const now = new Date().toISOString();
    const updated: Video = { ...v, lastModifiedAt: now, notes: v.notes.filter(n => n.id !== id) };
    await upsertVideo(updated);
    setVideo(updated);
  };

  return (
    <div class="vn-panel">
      <div class="vn-panel-header">
        <strong>📝 {video && video.notes.length > 0 ? `${video.notes.length} 條筆記` : 'Video Notes'}</strong>
        <button class="vn-btn-secondary" onClick={onClose}>✕</button>
      </div>

      {mode.kind === 'new' && (
        <NoteEditor getCurrentSec={getCurrentSec} onSave={saveNew} onCancel={() => setMode({ kind: 'list' })} />
      )}

      {mode.kind === 'edit' && video && (() => {
        const target = video.notes.find(n => n.id === mode.id);
        if (!target) return null;
        return <NoteEditor initialText={target.text} getCurrentSec={() => target.timestampSec} onSave={(t) => saveEdit(t)} onCancel={() => setMode({ kind: 'list' })} />;
      })()}

      {mode.kind === 'list' && (
        <>
          {(!video || video.notes.length === 0)
            ? <EmptyState onAdd={startNew} />
            : (
              <>
                <NoteList notes={video.notes} onSeek={seekVideo} onEdit={(id) => setMode({ kind: 'edit', id })} onDelete={onDelete} />
                <button class="vn-add" onClick={startNew}>＋ 新增筆記</button>
              </>
            )}
        </>
      )}
    </div>
  );
}
```

- [ ] **步驟 3：更新 panel-host.ts 注入依賴**

```ts
// src/content/panel-host.ts — 替換 mountPanel 簽名與內容
import { render, h } from 'preact';
import { Panel, type PanelDeps } from '../ui/Panel';
import { applyThemeClass } from '../ui/theme';
import { getSettings } from '../shared/storage';
import panelCss from '../ui/panel.css?raw';
import { findVideoElement } from './yt-navigation';
import { captureAndCrop } from './screenshot-client';

const HOST_ID = 'video-notes-panel-host';

export async function mountPanel(videoId: string): Promise<void> {
  const target = document.querySelector('#secondary') ?? document.body;
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'all: initial; display: block;';
    target.prepend(host);
  }
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  shadow.innerHTML = '';
  const styleEl = document.createElement('style');
  styleEl.textContent = panelCss;
  shadow.appendChild(styleEl);
  const root = document.createElement('div');
  shadow.appendChild(root);

  const settings = await getSettings();
  applyThemeClass(host, settings.theme);

  const deps: PanelDeps = {
    videoId,
    getVideoMeta: () => ({
      title: document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent?.trim() ?? document.title.replace(/ - YouTube$/, ''),
      channel: document.querySelector('ytd-channel-name #text a')?.textContent?.trim() ?? '',
      url: location.href
    }),
    getCurrentSec: () => findVideoElement()?.currentTime ?? 0,
    pauseVideo: () => { const v = findVideoElement(); if (v && !v.paused) v.pause(); },
    seekVideo: (sec) => { const v = findVideoElement(); if (v) v.currentTime = sec; },
    captureScreenshot: () => captureAndCrop(),
    onClose: () => unmountPanel()
  };

  render(h(Panel, deps), root);
}

export function unmountPanel(): void {
  document.getElementById(HOST_ID)?.remove();
}

export function isPanelMounted(): boolean { return !!document.getElementById(HOST_ID); }
```

- [ ] **步驟 4：commit**

```bash
git add src/ui src/content/panel-host.ts
git commit -m "Wire NoteEditor and full panel state machine"
```

---

## 任務 17：`screenshot-client.ts` — 透過 SW 截圖 + canvas 裁切

**檔案：**
- 新增：`src/content/screenshot-client.ts`

- [ ] **步驟 1：實作**

```ts
// src/content/screenshot-client.ts
import { findVideoElement } from './yt-navigation';

export async function captureAndCrop(): Promise<Blob> {
  const video = findVideoElement();
  if (!video) throw new Error('Video element not found');
  video.scrollIntoView({ block: 'center' });
  await new Promise(r => setTimeout(r, 100));

  const resp = await chrome.runtime.sendMessage({ type: 'capture-tab' });
  if (!resp || !resp.dataUrl) throw new Error('Screenshot failed: ' + (resp?.error ?? 'unknown'));

  const img = await loadImage(resp.dataUrl);
  const rect = video.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const sx = rect.left * dpr, sy = rect.top * dpr;
  const sw = rect.width * dpr, sh = rect.height * dpr;

  const canvas = document.createElement('canvas');
  canvas.width = sw; canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob returned null')), 'image/png');
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = src;
  });
}
```

- [ ] **步驟 2：手動端到端 smoke test**

build、reload。打開 YouTube 觀看頁。點 toolbar icon → 面板開。點「+ 新增筆記」→ 編輯卡出現、影片暫停。打字、Save。在 devtools Application 分頁 → Storage → Extension → IndexedDB / chrome.storage 確認資料寫入。F5 重整頁面、再打開面板 → 筆記還在。

- [ ] **步驟 3：commit**

```bash
git add src/content/screenshot-client.ts
git commit -m "Add screenshot capture with crop"
```

---

## 任務 18：`options/export/ensureVault.ts` — vault handle 持久化

**檔案：**
- 新增：`src/options/export/ensureVault.ts`

- [ ] **步驟 1：實作**

```ts
// src/options/export/ensureVault.ts
import { getVaultHandle, setVaultHandle } from '../../shared/idb';

export async function pickVault(): Promise<FileSystemDirectoryHandle> {
  const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
  await setVaultHandle(handle);
  return handle;
}

export async function ensureVault(): Promise<FileSystemDirectoryHandle> {
  let h = await getVaultHandle();
  if (!h) h = await pickVault();
  const perm = await (h as any).queryPermission({ mode: 'readwrite' });
  if (perm !== 'granted') {
    const r = await (h as any).requestPermission({ mode: 'readwrite' });
    if (r !== 'granted') throw new Error('Vault permission denied');
  }
  return h;
}
```

- [ ] **步驟 2：commit**

```bash
git add src/options/export/ensureVault.ts
git commit -m "Add vault handle ensure/pick"
```

---

## 任務 19：`options/export/writeAssets.ts` — 增量 asset 寫入（TDD）

**檔案：**
- 新增：`src/options/export/writeAssets.ts`
- 測試：`tests/unit/writeAssets.test.ts`

- [ ] **步驟 1：定義記憶體 FS mock**

```ts
// tests/unit/_fs-mock.ts
export class FakeDir {
  files = new Map<string, Blob>();
  dirs = new Map<string, FakeDir>();
  name: string;
  constructor(name: string) { this.name = name; }
  async getDirectoryHandle(name: string, opts?: { create?: boolean }) {
    let d = this.dirs.get(name);
    if (!d) { if (!opts?.create) throw new Error('NotFound'); d = new FakeDir(name); this.dirs.set(name, d); }
    return d as any;
  }
  async getFileHandle(name: string, opts?: { create?: boolean }) {
    if (!this.files.has(name)) {
      if (!opts?.create) throw new Error('NotFound');
      this.files.set(name, new Blob());
    }
    const self = this;
    return {
      name,
      async createWritable() {
        return {
          async write(data: Blob | string) {
            const blob = typeof data === 'string' ? new Blob([data]) : data;
            self.files.set(name, blob);
          },
          async close() {}
        };
      },
      async getFile() { return self.files.get(name); }
    } as any;
  }
  async removeEntry(name: string) {
    if (!this.files.delete(name)) this.dirs.delete(name);
  }
  async *entries(): AsyncIterableIterator<[string, any]> {
    for (const [k] of this.files.entries()) yield [k, { kind: 'file', name: k }];
    for (const [k] of this.dirs.entries()) yield [k, { kind: 'directory', name: k }];
  }
}
```

- [ ] **步驟 2：寫失敗測試**

```ts
// tests/unit/writeAssets.test.ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { FakeDir } from './_fs-mock';
import { putScreenshot } from '../../src/shared/idb';
import { writeAssets } from '../../src/options/export/writeAssets';
import type { Note } from '../../src/shared/types';

const note = (id: string, sec: number, key: string): Note => ({
  id, timestampSec: sec, text: 't', createdAt: '', updatedAt: '', screenshotKey: key
});

describe('writeAssets', () => {
  beforeEach(() => indexedDB.deleteDatabase('video-notes'));

  it('writes a new asset with formatted name', async () => {
    await putScreenshot('s1', new Blob([new Uint8Array([1,2,3])], { type: 'image/png' }));
    const root = new FakeDir('root') as any;
    await writeAssets(root, [note('n1', 222, 's1')]);
    const assets = await root.getDirectoryHandle('assets');
    expect(assets.files.has('00-03-42.png')).toBe(true);
  });

  it('does not overwrite existing assets unchanged', async () => {
    await putScreenshot('s1', new Blob([new Uint8Array([9])], { type: 'image/png' }));
    const root = new FakeDir('root') as any;
    const assets = await root.getDirectoryHandle('assets', { create: true });
    assets.files.set('00-03-42.png', new Blob([new Uint8Array([1])]));
    const before = assets.files.get('00-03-42.png');
    await writeAssets(root, [note('n1', 222, 's1')]);
    expect(assets.files.get('00-03-42.png')).toBe(before);
  });

  it('removes orphan assets not referenced by any note', async () => {
    const root = new FakeDir('root') as any;
    const assets = await root.getDirectoryHandle('assets', { create: true });
    assets.files.set('00-99-99.png', new Blob());
    await writeAssets(root, []);
    expect(assets.files.has('00-99-99.png')).toBe(false);
  });

  it('handles duplicate-second timestamps with -2 suffix', async () => {
    await putScreenshot('s1', new Blob([new Uint8Array([1])]));
    await putScreenshot('s2', new Blob([new Uint8Array([2])]));
    const root = new FakeDir('root') as any;
    await writeAssets(root, [note('a', 222, 's1'), note('b', 222, 's2')]);
    const assets = await root.getDirectoryHandle('assets');
    expect(assets.files.has('00-03-42.png')).toBe(true);
    expect(assets.files.has('00-03-42-2.png')).toBe(true);
  });
});
```

- [ ] **步驟 3：跑測試確認失敗**

```bash
npm test -- writeAssets
```

- [ ] **步驟 4：實作**

```ts
// src/options/export/writeAssets.ts
import type { Note } from '../../shared/types';
import { formatDash } from '../../shared/timestamp';
import { getScreenshot } from '../../shared/idb';

export function assetNameFor(note: Note, indexAtSameSec: number): string {
  const base = formatDash(note.timestampSec);
  return indexAtSameSec === 0 ? `${base}.png` : `${base}-${indexAtSameSec + 1}.png`;
}

export function buildAssetPlan(notes: Note[]): Array<{ note: Note; filename: string }> {
  const sorted = [...notes].sort((a, b) => a.timestampSec - b.timestampSec || a.id.localeCompare(b.id));
  const counts = new Map<number, number>();
  return sorted.map(n => {
    const i = counts.get(n.timestampSec) ?? 0;
    counts.set(n.timestampSec, i + 1);
    return { note: n, filename: assetNameFor(n, i) };
  });
}

export async function writeAssets(folder: FileSystemDirectoryHandle, notes: Note[]): Promise<void> {
  const plan = buildAssetPlan(notes);
  const wanted = new Set(plan.map(p => p.filename));

  let assets: FileSystemDirectoryHandle;
  try {
    assets = await folder.getDirectoryHandle('assets', { create: true });
  } catch (e) {
    throw new Error('Cannot create assets/: ' + e);
  }

  const existing = new Set<string>();
  for await (const [name, handle] of (assets as any).entries()) {
    if (handle.kind === 'file') existing.add(name);
  }

  for (const { note, filename } of plan) {
    if (existing.has(filename)) continue;
    const blob = await getScreenshot(note.screenshotKey);
    if (!blob) continue;
    const fileHandle = await assets.getFileHandle(filename, { create: true });
    const w = await (fileHandle as any).createWritable();
    await w.write(blob);
    await w.close();
  }

  for (const name of existing) {
    if (!wanted.has(name)) {
      await (assets as any).removeEntry(name);
    }
  }
}
```

- [ ] **步驟 5：跑測試確認通過 + commit**

```bash
npm test -- writeAssets
git add src/options/export/writeAssets.ts tests/unit/writeAssets.test.ts tests/unit/_fs-mock.ts
git commit -m "Add incremental asset writer"
```

---

## 任務 20：`options/export/writeNoteMd.ts` — 寫 note.md

**檔案：**
- 新增：`src/options/export/writeNoteMd.ts`

- [ ] **步驟 1：實作**

```ts
// src/options/export/writeNoteMd.ts
import type { Video } from '../../shared/types';
import { renderNoteMd } from '../../shared/markdown';

export async function writeNoteMd(folder: FileSystemDirectoryHandle, video: Video, exportedAtIso: string): Promise<void> {
  const content = renderNoteMd(video, exportedAtIso);
  const fh = await folder.getFileHandle('note.md', { create: true });
  const w = await (fh as any).createWritable();
  await w.write(content);
  await w.close();
}
```

- [ ] **步驟 2：commit**

```bash
git add src/options/export/writeNoteMd.ts
git commit -m "Add note.md writer"
```

---

## 任務 21：`options/export/runExport.ts` — 單支匯出協調流程（TDD）

**檔案：**
- 新增：`src/options/export/runExport.ts`
- 測試：`tests/unit/runExport.test.ts`

- [ ] **步驟 1：寫失敗測試**

```ts
// tests/unit/runExport.test.ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { installChromeMock } from './_chrome-mock';
import { FakeDir } from './_fs-mock';
import { upsertVideo, getVideo } from '../../src/shared/storage';
import { putScreenshot } from '../../src/shared/idb';
import { runExportForVideo } from '../../src/options/export/runExport';
import type { Video } from '../../src/shared/types';

const mock = installChromeMock();

const baseVideo = (overrides: Partial<Video> = {}): Video => ({
  videoId: 'abc123', title: 'Hello: World*?', channel: 'C',
  url: 'https://www.youtube.com/watch?v=abc123',
  firstNoteAt: '2026-05-10T14:30:00+08:00',
  lastModifiedAt: '2026-05-10T15:00:00+08:00',
  lastExportedAt: null,
  notes: [{ id: 'n1', timestampSec: 222, text: 'x', createdAt: '', updatedAt: '', screenshotKey: 's1' }],
  ...overrides
});

describe('runExportForVideo', () => {
  beforeEach(async () => {
    mock.reset();
    indexedDB.deleteDatabase('video-notes');
    await putScreenshot('s1', new Blob([new Uint8Array([1])], { type: 'image/png' }));
  });

  it('creates folder named YYYY-MM-DD_<sanitized title>', async () => {
    await upsertVideo(baseVideo());
    const root = new FakeDir('root') as any;
    await runExportForVideo(root, 'abc123');
    expect(Array.from(root.dirs.keys())).toEqual(['2026-05-10_Hello- World--']);
  });

  it('writes note.md and assets', async () => {
    await upsertVideo(baseVideo());
    const root = new FakeDir('root') as any;
    await runExportForVideo(root, 'abc123');
    const folder = root.dirs.get('2026-05-10_Hello- World--');
    expect(folder.files.has('note.md')).toBe(true);
    expect(folder.dirs.get('assets').files.has('00-03-42.png')).toBe(true);
  });

  it('updates lastExportedAt', async () => {
    await upsertVideo(baseVideo());
    const root = new FakeDir('root') as any;
    await runExportForVideo(root, 'abc123');
    const after = await getVideo('abc123');
    expect(after?.lastExportedAt).toBeTruthy();
  });

  it('skips writing when nothing changed since last export', async () => {
    const root = new FakeDir('root') as any;
    await upsertVideo(baseVideo({ lastExportedAt: '2026-05-10T15:01:00+08:00' }));  // > lastModifiedAt
    const result = await runExportForVideo(root, 'abc123');
    expect(result.skipped).toBe(true);
    expect(root.dirs.size).toBe(0);
  });
});
```

- [ ] **步驟 2：跑測試確認失敗**

```bash
npm test -- runExport
```

- [ ] **步驟 3：實作**

```ts
// src/options/export/runExport.ts
import { getVideo, upsertVideo } from '../../shared/storage';
import { sanitizeFilename } from '../../shared/sanitize';
import { writeNoteMd } from './writeNoteMd';
import { writeAssets } from './writeAssets';

export interface ExportResult { skipped: boolean; folderName?: string; }

function folderName(video: { firstNoteAt: string; title: string; videoId: string }): string {
  const date = video.firstNoteAt.slice(0, 10);
  const safe = sanitizeFilename(video.title, video.videoId);
  return `${date}_${safe}`;
}

export async function runExportForVideo(vault: FileSystemDirectoryHandle, videoId: string): Promise<ExportResult> {
  const video = await getVideo(videoId);
  if (!video) throw new Error('Video not found: ' + videoId);

  if (video.lastExportedAt && Date.parse(video.lastModifiedAt) <= Date.parse(video.lastExportedAt)) {
    return { skipped: true };
  }

  const fname = folderName(video);
  const folder = await vault.getDirectoryHandle(fname, { create: true });
  const now = new Date().toISOString();

  await writeNoteMd(folder, video, now);
  await writeAssets(folder, video.notes);

  await upsertVideo({ ...video, lastExportedAt: now });
  return { skipped: false, folderName: fname };
}

export async function runExportAll(vault: FileSystemDirectoryHandle, ids: string[], onProgress?: (i: number, total: number) => void): Promise<{ exported: number; skipped: number }> {
  let exported = 0, skipped = 0;
  for (let i = 0; i < ids.length; i++) {
    onProgress?.(i, ids.length);
    const r = await runExportForVideo(vault, ids[i]);
    if (r.skipped) skipped++; else exported++;
  }
  onProgress?.(ids.length, ids.length);
  return { exported, skipped };
}
```

- [ ] **步驟 4：跑測試確認通過 + commit**

```bash
npm test -- runExport
git add src/options/export/runExport.ts tests/unit/runExport.test.ts
git commit -m "Add export orchestrator"
```

---

## 任務 22：Options page UI

**檔案：**
- 新增：`src/options/OptionsPage.tsx`、`src/options/VaultSection.tsx`、`src/options/ThemeSection.tsx`、`src/options/VideoList.tsx`、`src/options/VideoRow.tsx`、`src/options/options.css`
- 修改：`src/options/index.tsx`、`src/options/index.html`

- [ ] **步驟 1：VaultSection**

```tsx
// src/options/VaultSection.tsx
import { useEffect, useState } from 'preact/hooks';
import { getVaultHandle } from '../shared/idb';
import { pickVault } from './export/ensureVault';
import { setSettings, getSettings } from '../shared/storage';

export function VaultSection() {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => { (async () => {
    const h = await getVaultHandle();
    setName(h?.name ?? null);
  })(); }, []);

  const onChange = async () => {
    try {
      const h = await pickVault();
      setName(h.name);
      const s = await getSettings();
      await setSettings({ ...s, hasVaultConfigured: true });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <section style="margin-bottom: 24px;">
      <h3>Vault 資料夾</h3>
      <div class="vn-note" style="display:flex; justify-content:space-between; align-items:center;">
        <span>📁 {name ?? '尚未設定'}</span>
        <button class="vn-btn-secondary" onClick={onChange}>{name ? '變更' : '選擇'}</button>
      </div>
    </section>
  );
}
```

- [ ] **步驟 2：ThemeSection**

```tsx
// src/options/ThemeSection.tsx
import { useEffect, useState } from 'preact/hooks';
import { getSettings, setSettings } from '../shared/storage';
import type { Theme } from '../shared/types';

export function ThemeSection({ onChange }: { onChange: (t: Theme) => void }) {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => { getSettings().then(s => setTheme(s.theme)); }, []);

  const update = async (t: Theme) => {
    setTheme(t);
    const s = await getSettings();
    await setSettings({ ...s, theme: t });
    onChange(t);
  };

  return (
    <section style="margin-bottom: 24px;">
      <h3>主題</h3>
      <select value={theme} onChange={(e) => update((e.target as HTMLSelectElement).value as Theme)}>
        <option value="system">跟隨系統</option>
        <option value="light">淺色</option>
        <option value="dark">深色</option>
      </select>
    </section>
  );
}
```

- [ ] **步驟 3：VideoRow + VideoList**

```tsx
// src/options/VideoRow.tsx
import type { Video } from '../shared/types';

export interface VideoRowProps { video: Video; onExport: (id: string) => void; onDelete: (id: string) => void; }

export function VideoRow({ video, onExport, onDelete }: VideoRowProps) {
  const exportedLabel = video.lastExportedAt
    ? (Date.parse(video.lastModifiedAt) > Date.parse(video.lastExportedAt) ? '有未匯出變更' : '已匯出')
    : '未匯出';
  return (
    <div class="vn-note" style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
      <div>
        <div style="font-weight:600;">{video.title}</div>
        <div style="color:var(--vn-fg-muted); font-size:12px;">
          {video.notes.length} 條筆記 · 編輯於 {video.lastModifiedAt.slice(0, 10)} · {exportedLabel}
        </div>
      </div>
      <div style="display:flex; gap:6px;">
        <button class="vn-btn-secondary" onClick={() => onExport(video.videoId)}>匯出</button>
        <button class="vn-btn-secondary" style="color:var(--vn-danger);" onClick={() => onDelete(video.videoId)}>刪除</button>
      </div>
    </div>
  );
}
```

```tsx
// src/options/VideoList.tsx
import { useEffect, useState } from 'preact/hooks';
import { getAllVideos, deleteVideo } from '../shared/storage';
import { deleteScreenshot } from '../shared/idb';
import { VideoRow } from './VideoRow';
import { runExportForVideo, runExportAll } from './export/runExport';
import { ensureVault } from './export/ensureVault';
import type { Video } from '../shared/types';

export function VideoList() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const reload = async () => {
    const all = await getAllVideos();
    setVideos(Object.values(all).sort((a, b) => b.lastModifiedAt.localeCompare(a.lastModifiedAt)));
  };
  useEffect(() => { reload(); }, []);

  const exportOne = async (id: string) => {
    setBusy(true); setMsg(null);
    try {
      const vault = await ensureVault();
      const r = await runExportForVideo(vault, id);
      setMsg(r.skipped ? '已是最新，無需匯出' : '匯出完成：' + r.folderName);
      await reload();
    } catch (e) {
      setMsg('匯出失敗：' + (e as Error).message);
    } finally { setBusy(false); }
  };

  const exportAll = async () => {
    setBusy(true); setMsg(null);
    try {
      const vault = await ensureVault();
      const ids = videos.map(v => v.videoId);
      const r = await runExportAll(vault, ids, (i, total) => setMsg(`進行中 ${i}/${total}`));
      setMsg(`完成：匯出 ${r.exported}，跳過 ${r.skipped}`);
      await reload();
    } catch (e) {
      setMsg('匯出失敗：' + (e as Error).message);
    } finally { setBusy(false); }
  };

  const onDelete = async (id: string) => {
    if (!confirm('刪除這支影片的所有筆記？此操作不會動 vault 內已匯出的資料夾。')) return;
    const v = videos.find(x => x.videoId === id);
    if (v) {
      for (const n of v.notes) await deleteScreenshot(n.screenshotKey);
    }
    await deleteVideo(id);
    await reload();
  };

  return (
    <section>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h3>已筆記的影片 ({videos.length})</h3>
        <button class="vn-btn-primary" disabled={busy || videos.length === 0} onClick={exportAll}>匯出全部</button>
      </div>
      {msg && <div style="margin: 8px 0; color: var(--vn-fg-muted);">{msg}</div>}
      {videos.length === 0
        ? <div style="color:var(--vn-fg-muted);">還沒有任何筆記。</div>
        : videos.map(v => <VideoRow key={v.videoId} video={v} onExport={exportOne} onDelete={onDelete} />)}
    </section>
  );
}
```

- [ ] **步驟 4：OptionsPage + index**

```tsx
// src/options/OptionsPage.tsx
import { useEffect } from 'preact/hooks';
import { getSettings } from '../shared/storage';
import { applyThemeClass, watchSystemTheme } from '../ui/theme';
import { VaultSection } from './VaultSection';
import { ThemeSection } from './ThemeSection';
import { VideoList } from './VideoList';
import type { Theme } from '../shared/types';

export function OptionsPage() {
  useEffect(() => {
    (async () => {
      const s = await getSettings();
      applyThemeClass(document.body, s.theme);
    })();
    const stop = watchSystemTheme(async () => {
      const s = await getSettings();
      applyThemeClass(document.body, s.theme);
    });
    return stop;
  }, []);

  return (
    <div class="options-root" style="max-width: 720px; margin: 32px auto; padding: 0 16px;">
      <h1>Video Notes — 設定</h1>
      <VaultSection />
      <ThemeSection onChange={(t: Theme) => applyThemeClass(document.body, t)} />
      <VideoList />
    </div>
  );
}
```

```tsx
// src/options/index.tsx
import { render } from 'preact';
import { OptionsPage } from './OptionsPage';
import './options.css';
render(<OptionsPage />, document.getElementById('root')!);
```

```css
/* src/options/options.css */
@import '../ui/panel.css';
body { margin: 0; }
.options-root { background: var(--vn-bg); color: var(--vn-fg); min-height: 100vh; }
```

- [ ] **步驟 5：build + 手動 smoke**

```bash
npm run build
```

reload 擴充功能。在 `chrome://extensions` 點 Video Notes 的「選項」→ 頁面渲染。點「選擇」→ 跳資料夾選擇器。在某一行點「匯出」→ 檔案寫入磁碟。

- [ ] **步驟 6：commit**

```bash
git add src/options
git commit -m "Add options page UI"
```

---

## 任務 23：面板隨系統主題變動即時更新

**檔案：**
- 修改：`src/content/panel-host.ts`

- [ ] **步驟 1：在 panel-host 監聽系統主題**

在 `mountPanel` 內，套用初始 theme 後加入：

```ts
import { watchSystemTheme } from '../ui/theme';

let stopThemeWatch: (() => void) | null = null;

// 在 mountPanel 內，applyThemeClass(host, settings.theme) 之後：
stopThemeWatch = watchSystemTheme(async () => {
  const s = await getSettings();
  applyThemeClass(host!, s.theme);
});
```

修改 `unmountPanel` 釋放：

```ts
export function unmountPanel(): void {
  stopThemeWatch?.();
  stopThemeWatch = null;
  document.getElementById(HOST_ID)?.remove();
}
```

- [ ] **步驟 2：commit**

```bash
git add src/content/panel-host.ts
git commit -m "Live-update panel theme on system pref change"
```

---

## 任務 24：跨分頁同步 — 面板隨 storage 變動重繪

**檔案：**
- 修改：`src/ui/Panel.tsx`

- [ ] **步驟 1：訂閱 storage.onChanged**

在 `Panel` 內 `useEffect` 改成：

```tsx
useEffect(() => {
  load();
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes.videos) load();
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}, [load]);
```

- [ ] **步驟 2：commit**

```bash
git add src/ui/Panel.tsx
git commit -m "Sync panel state via storage.onChanged"
```

---

## 任務 25：Playwright E2E — 新增筆記

**檔案：**
- 新增：`playwright.config.ts`、`tests/e2e/fixtures.ts`、`tests/e2e/add-note.spec.ts`

- [ ] **步驟 1：Playwright 設定**

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { headless: false }
});
```

- [ ] **步驟 2：擴充功能 fixture**

```ts
// tests/e2e/fixtures.ts
import { chromium, type BrowserContext } from '@playwright/test';
import { test as base } from '@playwright/test';
import path from 'path';

export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  context: async ({}, use) => {
    const pathToExt = path.resolve('dist');
    const ctx = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${pathToExt}`,
        `--load-extension=${pathToExt}`
      ]
    });
    await use(ctx);
    await ctx.close();
  },
  extensionId: async ({ context }, use) => {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    const id = sw.url().split('/')[2];
    await use(id);
  }
});

export const expect = test.expect;
```

- [ ] **步驟 3：spec — 新增筆記**

```ts
// tests/e2e/add-note.spec.ts
import { test, expect } from './fixtures';

test('open panel and add a note on a YouTube watch page', async ({ context }) => {
  const page = await context.newPage();
  await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.waitForSelector('#movie_player video');

  const sw = context.serviceWorkers()[0];
  await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id!, { type: 'toggle-panel' });
  });

  const host = page.locator('#video-notes-panel-host');
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
    const h = document.getElementById('video-notes-panel-host');
    return h?.shadowRoot?.querySelector('.vn-note-text')?.textContent?.includes('Hello from E2E');
  }, { timeout: 10_000 });
});
```

- [ ] **步驟 4：build 後執行**

```bash
npm run build
npm run e2e
```

預期：spec 通過。瀏覽器開 YouTube、面板出現、筆記寫入。

**遇到不穩定時：** 如果連續 flaky（例如 selector 找不到、超時、廣告或 cookie consent 擋路），**不要逕自修 selector 或加重試**。改成 headed 模式（在 `playwright.config.ts` 把 `headless` 設 `false` 或改用 `HEADED=1` 環境變數），暫停執行並請使用者一起在瀏覽器看畫面釐清原因，再決定怎麼處理。

- [ ] **步驟 5：commit**

```bash
git add playwright.config.ts tests/e2e
git commit -m "Add Playwright E2E for add-note flow"
```

---

## 任務 26：README 補上開發指令與已知限制

**檔案：**
- 修改：`README.md`

- [ ] **步驟 1：在 README 末段附加章節**

在 README 末段加：

```markdown

## 開發指令

\`\`\`bash
npm install            # 第一次
npm run dev            # 開發模式（HMR；MV3 部分仍需到 chrome://extensions reload）
npm run build          # 產生 dist/，到 chrome://extensions 載入未封裝
npm test               # 單元測試
npm run e2e            # Playwright E2E（先 build）
\`\`\`

## 已知限制（V1）

- 截圖時若 YouTube 正在播廣告，會截到廣告畫面（V1 不偵測廣告）
- 不支援 YouTube Shorts、直播、嵌入頁
- 不擷取逐字稿；不做 AI 改寫
- 沒有跨裝置同步；資料只存當前瀏覽器
```

- [ ] **步驟 2：commit**

```bash
git add README.md
git commit -m "Add dev instructions and V1 limitations to README"
```

---

## Spec 對照表（self-review）

| Spec 章節 | 對應任務 |
|---|---|
| §1 範圍 | 任務 1（manifest match URL） |
| §2 使用流程 | 任務 14（面板掛載）、16（編輯器）、17（截圖）、22（匯出 UI） |
| §3 架構 | 任務 9–11（SW）、12–14（CS + 面板）、22（Options） |
| §4.1 chrome.storage | 任務 4、5、16 |
| §4.2 IndexedDB | 任務 6、16、18 |
| §4.3 衍生規則 | 任務 16（lastModifiedAt 更新）、19（assets 清孤兒）、22（VideoList 刪除） |
| §5.1 面板狀態 | 任務 14–16 |
| §5.2 Options page | 任務 22 |
| §5.3 Toolbar badge | 任務 11 |
| §5.4 Theme | 任務 13、22（ThemeSection）、23（live update） |
| §6 匯出邏輯 | 任務 18–22 |
| §6.3 sanitization | 任務 2 |
| §6.4 截圖檔名 | 任務 3 + 19 |
| §7 note.md 格式 | 任務 7 |
| §8.1 開啟面板 | 任務 10、14 |
| §8.2 新增筆記 | 任務 16 |
| §8.3 編輯 | 任務 16 |
| §8.4 刪除 | 任務 16 |
| §8.5 點時間戳跳轉 | 任務 15（NoteCard onSeek）+ 任務 16 接線 |
| §8.6 SPA 換影片 | 任務 12（重新載入）+ 任務 24（storage.onChanged） |
| §8.7 多分頁 | 任務 24 |
| §9 邊角情境 | 任務 2（sanitize）、17（scrollIntoView）、18（permission）、22（VideoList 錯誤訊息） |
| §10 權限 | 任務 1 manifest |
| §11 技術選型 | 任務 1 |

**型別一致性：** `Note`、`Video`、`Settings` 等型別在任務 4 定義，後續沿用；方法名 `runExportForVideo` / `runExportAll` 等跨檔案一致。

**Placeholder 掃描：** 沒有 TBD / TODO / 未填段落，每一步都附實際代碼或具體指令。

**已知限制已在 spec 標明：** §9（廣告畫面）、§12（Shorts/直播排除）。

---

## 計畫完成

計畫已存到 `docs/superpowers/plans/2026-05-10-video-notes-v1.md`。
