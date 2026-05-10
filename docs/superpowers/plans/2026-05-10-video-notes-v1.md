# Video Notes V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Chrome MV3 extension that lets the user take time-stamped notes with auto screenshots on YouTube watch pages and export them as Markdown literature notes to a chosen local vault folder.

**Architecture:** Preact panel injected via Shadow DOM into `youtube.com/watch?v=*`. Service worker handles screenshots and toolbar/badge. Options page handles File System Access API export. Storage split: chrome.storage.local for note metadata, IndexedDB for screenshot Blobs and the persisted vault directory handle.

**Tech Stack:** TypeScript, Preact + Vite (`vite-plugin-web-extension`), `idb` for IndexedDB, Vitest for unit tests with `fake-indexeddb`, Playwright for extension E2E.

**Spec:** `docs/superpowers/specs/2026-05-10-video-notes-v1-design.md` — read before starting.

---

## File Structure

Source files (created across tasks):

```
package.json                          # npm scripts, deps
tsconfig.json
vite.config.ts                        # vite-plugin-web-extension config
src/
  manifest.ts                         # MV3 manifest as TS object
  background/
    index.ts                          # service worker entry
    screenshot.ts                     # captureVisibleTab handler
    badge.ts                          # toolbar badge updater
    commands.ts                       # toggle-panel command + icon click
  content/
    index.ts                          # content script entry — detect video, mount panel
    yt-navigation.ts                  # SPA navigation detection
    panel-host.ts                     # Shadow DOM host, mount/unmount Preact
    screenshot-client.ts              # request SW screenshot, crop in canvas
  ui/
    Panel.tsx                         # root panel component (states: empty/list/editing)
    EmptyState.tsx
    NoteList.tsx
    NoteCard.tsx                      # display one note (with hover edit/delete)
    NoteEditor.tsx                    # inline edit/new card
    theme.ts                          # CSS variable tokens + theme detection
    panel.css                         # base panel styles
  options/
    index.html                        # options page entry
    index.tsx                         # mount root
    OptionsPage.tsx                   # root component
    VaultSection.tsx                  # vault display + change
    ThemeSection.tsx
    VideoList.tsx
    VideoRow.tsx
    export/
      runExport.ts                    # orchestrate single export
      writeNoteMd.ts                  # write/overwrite note.md
      writeAssets.ts                  # incremental asset writes + cleanup
      ensureVault.ts                  # ensure handle + permission
  shared/
    types.ts                          # Video, Note, Settings types
    storage.ts                        # chrome.storage.local wrapper
    idb.ts                            # IndexedDB wrapper (screenshots, vaultHandle)
    sanitize.ts                       # filename sanitization
    timestamp.ts                      # seconds <-> HH:MM:SS / HH-MM-SS
    markdown.ts                       # render note.md content
    uuid.ts                           # crypto.randomUUID wrapper
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
    fixtures.ts                       # Playwright extension fixture
    add-note.spec.ts
    export.spec.ts
```

Each file has one responsibility; UI components stay small. `shared/` is pure logic with no Chrome / DOM APIs — fully unit-testable.

---

## Task 1: Project scaffold (Vite + Preact + TS + MV3 manifest)

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `src/manifest.ts`, `src/background/index.ts`, `src/content/index.ts`, `src/options/index.html`, `src/options/index.tsx`, `.gitignore` (already exists, append)
- Create: `public/icon-16.png`, `public/icon-48.png`, `public/icon-128.png` (placeholder)

- [ ] **Step 1: Initialize package**

```bash
npm init -y
```

- [ ] **Step 2: Install runtime + dev deps using npm CLI (latest versions, never hand-write versions in package.json)**

```bash
npm install preact idb
npm install -D typescript vite vite-plugin-web-extension @types/chrome @preact/preset-vite @testing-library/preact vitest fake-indexeddb @playwright/test happy-dom
```

- [ ] **Step 3: Write `tsconfig.json`**

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

- [ ] **Step 4: Write `src/manifest.ts`**

```ts
import type { Manifest } from 'webextension-polyfill';

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

- [ ] **Step 5: Write `vite.config.ts`**

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

- [ ] **Step 6: Write minimal stub entry files**

`src/background/index.ts`:
```ts
console.log('[video-notes] service worker boot');
```

`src/content/index.ts`:
```ts
console.log('[video-notes] content script boot');
```

`src/options/index.html`:
```html
<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Video Notes — Settings</title></head>
  <body><div id="root"></div><script type="module" src="./index.tsx"></script></body>
</html>
```

`src/options/index.tsx`:
```ts
import { render } from 'preact';
render(<div>Video Notes Options</div>, document.getElementById('root')!);
```

- [ ] **Step 7: Add npm scripts to `package.json`**

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

- [ ] **Step 8: Create placeholder icons (any 1×1 transparent PNG works for now)**

```bash
node -e "const fs=require('fs');const buf=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=','base64');fs.mkdirSync('public',{recursive:true});['icon-16.png','icon-48.png','icon-128.png'].forEach(n=>fs.writeFileSync(`public/${n}`,buf));"
```

- [ ] **Step 9: Verify build runs**

```bash
npm run build
```

Expected: `dist/` produced with `manifest.json`, `background/index.js`, `content/index.js`, `options/index.html`. No errors.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Scaffold Vite + Preact + MV3 manifest"
```

---

## Task 2: `shared/sanitize.ts` — filename sanitization (TDD)

**Files:**
- Create: `src/shared/sanitize.ts`
- Test: `tests/unit/sanitize.test.ts`

- [ ] **Step 1: Write failing tests**

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
    // case-insensitive
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

- [ ] **Step 2: Run, verify it fails**

```bash
npm test -- sanitize
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

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

- [ ] **Step 4: Run, verify pass**

```bash
npm test -- sanitize
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/sanitize.ts tests/unit/sanitize.test.ts
git commit -m "Add filename sanitization utility"
```

---

## Task 3: `shared/timestamp.ts` — seconds <-> string (TDD)

**Files:**
- Create: `src/shared/timestamp.ts`
- Test: `tests/unit/timestamp.test.ts`

- [ ] **Step 1: Write failing tests**

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

- [ ] **Step 2: Run, verify fails**

```bash
npm test -- timestamp
```

- [ ] **Step 3: Implement**

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

- [ ] **Step 4: Run, verify pass + commit**

```bash
npm test -- timestamp
git add src/shared/timestamp.ts tests/unit/timestamp.test.ts
git commit -m "Add timestamp formatting utilities"
```

---

## Task 4: `shared/types.ts` — domain types

**Files:**
- Create: `src/shared/types.ts`

- [ ] **Step 1: Define types**

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

- [ ] **Step 2: Commit**

```bash
git add src/shared/types.ts
git commit -m "Add domain types"
```

---

## Task 5: `shared/storage.ts` — chrome.storage.local wrapper (TDD)

**Files:**
- Create: `src/shared/storage.ts`
- Create: `tests/unit/_chrome-mock.ts`
- Test: `tests/unit/storage.test.ts`

- [ ] **Step 1: Write a chrome.storage mock**

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

- [ ] **Step 2: Write failing tests**

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

- [ ] **Step 3: Run, verify fails**

```bash
npm test -- storage
```

- [ ] **Step 4: Implement**

```ts
// src/shared/storage.ts
import { DEFAULT_SETTINGS, Settings, Video, StorageShape } from './types';

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

- [ ] **Step 5: Run, verify pass + commit**

```bash
npm test -- storage
git add src/shared/storage.ts tests/unit/storage.test.ts tests/unit/_chrome-mock.ts
git commit -m "Add chrome.storage wrapper"
```

---

## Task 6: `shared/idb.ts` — IndexedDB wrapper for screenshots + vaultHandle (TDD)

**Files:**
- Create: `src/shared/idb.ts`
- Test: `tests/unit/idb.test.ts`

- [ ] **Step 1: Write failing tests (using fake-indexeddb)**

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

- [ ] **Step 2: Run, verify fails**

```bash
npm test -- idb
```

- [ ] **Step 3: Implement**

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

- [ ] **Step 4: Run, verify pass; reset dbPromise between tests if needed**

If tests interfere, add a `_resetForTest` export and call it in `beforeEach`. Otherwise:

```bash
npm test -- idb
git add src/shared/idb.ts tests/unit/idb.test.ts
git commit -m "Add IndexedDB wrapper for screenshots and vault handle"
```

---

## Task 7: `shared/markdown.ts` — render note.md (TDD)

**Files:**
- Create: `src/shared/markdown.ts`
- Test: `tests/unit/markdown.test.ts`

- [ ] **Step 1: Write failing tests**

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

- [ ] **Step 2: Run, verify fails**

```bash
npm test -- markdown
```

- [ ] **Step 3: Implement**

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

- [ ] **Step 4: Run, verify pass + commit**

```bash
npm test -- markdown
git add src/shared/markdown.ts tests/unit/markdown.test.ts
git commit -m "Add note.md renderer"
```

---

## Task 8: `shared/uuid.ts` — id generator

**Files:**
- Create: `src/shared/uuid.ts`

- [ ] **Step 1: Implement**

```ts
// src/shared/uuid.ts
export function noteId(): string { return 'note_' + crypto.randomUUID(); }
export function shotId(): string { return 'shot_' + crypto.randomUUID(); }
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/uuid.ts
git commit -m "Add uuid helpers"
```

---

## Task 9: Service worker — message protocol + screenshot handler

**Files:**
- Create: `src/background/messages.ts`
- Create: `src/background/screenshot.ts`
- Modify: `src/background/index.ts`

- [ ] **Step 1: Define message types**

```ts
// src/background/messages.ts
export type Message =
  | { type: 'capture-tab'; }
  | { type: 'toggle-panel'; }
  | { type: 'badge-set'; tabId: number; count: number };

export interface CaptureTabResponse { dataUrl: string; }
```

- [ ] **Step 2: Implement screenshot handler**

```ts
// src/background/screenshot.ts
export async function captureActiveTab(): Promise<string> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.windowId) throw new Error('No active tab');
  return await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
}
```

- [ ] **Step 3: Wire it in service worker**

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

- [ ] **Step 4: Build and manual test**

```bash
npm run build
```

Load `dist/` as unpacked extension at `chrome://extensions`. Open a YouTube video. Open the service worker devtools (chrome://extensions → "Inspect views: service worker"). In its console:

```js
chrome.tabs.query({active:true,currentWindow:true}).then(([t]) => chrome.tabs.captureVisibleTab(t.windowId,{format:'png'})).then(d => console.log(d.slice(0,80)));
```

Expected: dataURL prefix `data:image/png;base64,...` printed.

- [ ] **Step 5: Commit**

```bash
git add src/background
git commit -m "Add service worker screenshot handler"
```

---

## Task 10: Service worker — toggle panel command + icon click

**Files:**
- Create: `src/background/commands.ts`
- Modify: `src/background/index.ts`

- [ ] **Step 1: Implement**

```ts
// src/background/commands.ts
export function sendTogglePanel(tabId: number): void {
  chrome.tabs.sendMessage(tabId, { type: 'toggle-panel' }).catch(() => {});
}
```

- [ ] **Step 2: Wire icon click + command**

Add to `src/background/index.ts` (top-level, not inside the message listener):

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

- [ ] **Step 3: Manual test**

Reload extension. Click toolbar icon on a YouTube watch page → check content script console for `toggle-panel` message reception (will work after Task 12).

- [ ] **Step 4: Commit**

```bash
git add src/background
git commit -m "Add toggle-panel command and icon click"
```

---

## Task 11: Service worker — badge updater on storage change

**Files:**
- Create: `src/background/badge.ts`
- Modify: `src/background/index.ts`

- [ ] **Step 1: Extract videoId from URL**

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

- [ ] **Step 2: Wire in service worker**

```ts
// add to src/background/index.ts
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

- [ ] **Step 3: Commit**

```bash
git add src/background
git commit -m "Add toolbar badge updater"
```

---

## Task 12: Content script bootstrap — detect video element + SPA navigation

**Files:**
- Create: `src/content/yt-navigation.ts`
- Modify: `src/content/index.ts`

- [ ] **Step 1: Implement navigation detection**

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

- [ ] **Step 2: Bootstrap content script**

```ts
// src/content/index.ts
import { watchYouTubeNavigation, findVideoElement } from './yt-navigation';

let currentVideoId: string | null = null;

watchYouTubeNavigation((videoId) => {
  currentVideoId = videoId;
  console.log('[video-notes] video changed:', videoId);
  // Panel mount logic comes in Task 13
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'toggle-panel') {
    console.log('[video-notes] toggle-panel; current video:', currentVideoId);
    // Panel toggle logic in Task 13
  }
});

// expose for debugging
(globalThis as any).__videoNotes = { findVideoElement };
```

- [ ] **Step 3: Manual test**

Reload extension. Open `youtube.com/watch?v=...`. In the YouTube page console:

```js
__videoNotes.findVideoElement()
```

Expected: returns the `<video>` element.

Click toolbar icon → console logs "toggle-panel; current video: <id>".

- [ ] **Step 4: Commit**

```bash
git add src/content
git commit -m "Content script: detect video element and SPA nav"
```

---

## Task 13: Theme tokens + theme detection

**Files:**
- Create: `src/ui/theme.ts`
- Create: `src/ui/panel.css`

- [ ] **Step 1: Define theme tokens**

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

- [ ] **Step 2: Theme resolution**

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

- [ ] **Step 3: Commit**

```bash
git add src/ui
git commit -m "Add theme tokens and resolution"
```

---

## Task 14: Panel host — Shadow DOM + Preact mount

**Files:**
- Create: `src/content/panel-host.ts`
- Create: `src/ui/Panel.tsx` (skeleton)
- Create: `src/ui/EmptyState.tsx`
- Modify: `src/content/index.ts`

- [ ] **Step 1: Empty state component**

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

- [ ] **Step 2: Panel skeleton**

```tsx
// src/ui/Panel.tsx
import { useState } from 'preact/hooks';
import { EmptyState } from './EmptyState';

export interface PanelProps {
  videoId: string;
  onClose: () => void;
}

export function Panel({ videoId, onClose }: PanelProps) {
  const [_v, setV] = useState(0);  // re-render trigger placeholder; replaced in Task 15
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

- [ ] **Step 3: Panel host**

```ts
// src/content/panel-host.ts
import { render, h } from 'preact';
import { Panel } from '../ui/Panel';
import { applyThemeClass } from '../ui/theme';
import { getSettings } from '../shared/storage';
import panelCss from '../ui/panel.css?raw';

const HOST_ID = 'video-notes-panel-host';

export interface PanelMount {
  unmount: () => void;
}

export async function mountPanel(videoId: string): Promise<PanelMount> {
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

  const onClose = () => unmount();
  render(h(Panel, { videoId, onClose }), root);

  const unmount = () => {
    render(null, root);
    host?.remove();
  };

  return { unmount };
}

export function unmountPanel(): void {
  document.getElementById(HOST_ID)?.remove();
}

export function isPanelMounted(): boolean {
  return !!document.getElementById(HOST_ID);
}
```

- [ ] **Step 4: Wire toggle in content/index.ts**

```ts
// src/content/index.ts — replace the toggle-panel handler
import { mountPanel, unmountPanel, isPanelMounted } from './panel-host';
// ... inside chrome.runtime.onMessage.addListener:
if (msg.type === 'toggle-panel') {
  if (!currentVideoId) return;
  if (isPanelMounted()) unmountPanel();
  else mountPanel(currentVideoId);
}
```

- [ ] **Step 5: Manual test**

Build, reload, open a YouTube watch page, click toolbar icon. Panel should appear at top of right column with empty state.

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/content src/ui
git commit -m "Mount Preact panel in Shadow DOM"
```

---

## Task 15: NoteList + NoteCard components (display-only)

**Files:**
- Create: `src/ui/NoteCard.tsx`
- Create: `src/ui/NoteList.tsx`
- Modify: `src/ui/Panel.tsx`

- [ ] **Step 1: NoteCard**

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

- [ ] **Step 2: NoteList**

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

- [ ] **Step 3: Component test**

```ts
// tests/unit/NoteList.test.tsx
import '@testing-library/preact';
import { render, screen } from '@testing-library/preact';
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

Configure Vitest happy-dom env (add to `vite.config.ts` or `vitest.config.ts`):

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
export default defineConfig({
  plugins: [preact()],
  test: { environment: 'happy-dom', globals: false }
});
```

- [ ] **Step 4: Run, commit**

```bash
npm test -- NoteList
git add src/ui tests/unit/NoteList.test.tsx vitest.config.ts
git commit -m "Add NoteList and NoteCard components"
```

---

## Task 16: NoteEditor (inline create/edit) + state in Panel

**Files:**
- Create: `src/ui/NoteEditor.tsx`
- Modify: `src/ui/Panel.tsx`

- [ ] **Step 1: NoteEditor**

```tsx
// src/ui/NoteEditor.tsx
import { useEffect, useState, useRef } from 'preact/hooks';
import { formatColon } from '../shared/timestamp';

export interface NoteEditorProps {
  initialText?: string;
  getCurrentSec: () => number;     // poll to reflect scrub
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

- [ ] **Step 2: Panel state machine**

Replace `src/ui/Panel.tsx`:

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

- [ ] **Step 3: Update panel-host.ts to inject deps**

```ts
// src/content/panel-host.ts — replace mountPanel signature/body
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

- [ ] **Step 4: Commit**

```bash
git add src/ui src/content/panel-host.ts
git commit -m "Wire NoteEditor and full panel state machine"
```

---

## Task 17: `screenshot-client.ts` — capture via SW + crop in canvas

**Files:**
- Create: `src/content/screenshot-client.ts`

- [ ] **Step 1: Implement**

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

- [ ] **Step 2: Manual end-to-end smoke test**

Build, reload extension. Open a YouTube watch page. Click toolbar icon → panel opens. Click "+ 新增筆記" → editor appears, video pauses. Type text, Save. Verify in chrome.storage (devtools Application tab → Storage → Extension → IndexedDB / chrome.storage). Refresh page → panel re-opens → note still there.

- [ ] **Step 3: Commit**

```bash
git add src/content/screenshot-client.ts
git commit -m "Add screenshot capture with crop"
```

---

## Task 18: `options/export/ensureVault.ts` — vault handle persistence

**Files:**
- Create: `src/options/export/ensureVault.ts`

- [ ] **Step 1: Implement**

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

- [ ] **Step 2: Commit**

```bash
git add src/options/export/ensureVault.ts
git commit -m "Add vault handle ensure/pick"
```

---

## Task 19: `options/export/writeAssets.ts` — incremental asset writes (TDD)

**Files:**
- Create: `src/options/export/writeAssets.ts`
- Test: `tests/unit/writeAssets.test.ts`

- [ ] **Step 1: Define an in-memory FS mock**

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
    for (const [k, v] of this.files.entries()) yield [k, { kind: 'file', name: k }];
    for (const [k, v] of this.dirs.entries()) yield [k, { kind: 'directory', name: k }];
  }
}
```

- [ ] **Step 2: Write failing tests**

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

- [ ] **Step 3: Run, verify fails**

```bash
npm test -- writeAssets
```

- [ ] **Step 4: Implement**

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

  // List existing
  const existing = new Set<string>();
  for await (const [name, handle] of (assets as any).entries()) {
    if (handle.kind === 'file') existing.add(name);
  }

  // Write new
  for (const { note, filename } of plan) {
    if (existing.has(filename)) continue;
    const blob = await getScreenshot(note.screenshotKey);
    if (!blob) continue;
    const fileHandle = await assets.getFileHandle(filename, { create: true });
    const w = await (fileHandle as any).createWritable();
    await w.write(blob);
    await w.close();
  }

  // Remove orphans
  for (const name of existing) {
    if (!wanted.has(name)) {
      await (assets as any).removeEntry(name);
    }
  }
}
```

- [ ] **Step 5: Run, verify pass + commit**

```bash
npm test -- writeAssets
git add src/options/export/writeAssets.ts tests/unit/writeAssets.test.ts tests/unit/_fs-mock.ts
git commit -m "Add incremental asset writer"
```

---

## Task 20: `options/export/writeNoteMd.ts` — write note.md

**Files:**
- Create: `src/options/export/writeNoteMd.ts`

- [ ] **Step 1: Implement**

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

- [ ] **Step 2: Commit**

```bash
git add src/options/export/writeNoteMd.ts
git commit -m "Add note.md writer"
```

---

## Task 21: `options/export/runExport.ts` — orchestrate single-video export (TDD)

**Files:**
- Create: `src/options/export/runExport.ts`
- Test: `tests/unit/runExport.test.ts`

- [ ] **Step 1: Write failing tests**

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
    const v = baseVideo();
    await upsertVideo(v);
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

- [ ] **Step 2: Run, verify fails**

```bash
npm test -- runExport
```

- [ ] **Step 3: Implement**

```ts
// src/options/export/runExport.ts
import { getVideo, upsertVideo } from '../../shared/storage';
import { sanitizeFilename } from '../../shared/sanitize';
import { writeNoteMd } from './writeNoteMd';
import { writeAssets } from './writeAssets';

export interface ExportResult { skipped: boolean; folderName?: string; }

function folderName(video: { firstNoteAt: string; title: string; videoId: string }): string {
  const date = video.firstNoteAt.slice(0, 10); // YYYY-MM-DD
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

- [ ] **Step 4: Run, verify pass + commit**

```bash
npm test -- runExport
git add src/options/export/runExport.ts tests/unit/runExport.test.ts
git commit -m "Add export orchestrator"
```

---

## Task 22: Options page UI

**Files:**
- Create: `src/options/OptionsPage.tsx`
- Create: `src/options/VaultSection.tsx`
- Create: `src/options/ThemeSection.tsx`
- Create: `src/options/VideoList.tsx`
- Create: `src/options/VideoRow.tsx`
- Modify: `src/options/index.tsx`
- Modify: `src/options/index.html` (link panel.css)
- Modify: `src/ui/panel.css` — extend for `.options-root` (already done in Task 13)

- [ ] **Step 1: VaultSection**

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

- [ ] **Step 2: ThemeSection**

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

- [ ] **Step 3: VideoRow + VideoList**

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
import { listScreenshotKeys, deleteScreenshot } from '../shared/idb';
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

- [ ] **Step 4: OptionsPage + index**

```tsx
// src/options/OptionsPage.tsx
import { useEffect, useState } from 'preact/hooks';
import { getSettings } from '../shared/storage';
import { applyThemeClass } from '../ui/theme';
import { VaultSection } from './VaultSection';
import { ThemeSection } from './ThemeSection';
import { VideoList } from './VideoList';
import type { Theme } from '../shared/types';

export function OptionsPage() {
  useEffect(() => { (async () => {
    const s = await getSettings();
    applyThemeClass(document.body, s.theme);
  })(); }, []);

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

- [ ] **Step 5: Inline panel.css into options too**

```ts
// src/options/options.css — re-export panel css plus root reset
@import '../ui/panel.css';
body { margin: 0; }
.options-root { background: var(--vn-bg); color: var(--vn-fg); min-height: 100vh; }
```

Update `panel.css` selector `:host` to also accept `.options-root`. (Already accounted for in Task 13.)

- [ ] **Step 6: Build + manual smoke**

```bash
npm run build
```

Reload extension. Open `chrome://extensions` → click "選項" on Video Notes → page renders. Click "選擇" → directory picker. Click "匯出" on a row → file written.

- [ ] **Step 7: Commit**

```bash
git add src/options
git commit -m "Add options page UI"
```

---

## Task 23: Theme — system-preference change live update

**Files:**
- Modify: `src/content/panel-host.ts`
- Modify: `src/options/OptionsPage.tsx`

- [ ] **Step 1: Watch system theme in panel-host**

In `mountPanel`, after applying initial theme:

```ts
import { watchSystemTheme } from '../ui/theme';
// after applyThemeClass(...)
const stop = watchSystemTheme(async () => {
  const s = await getSettings();
  applyThemeClass(host!, s.theme);
});
// store stop on host data attr or module-scoped to call from unmountPanel
```

Add to `unmountPanel` to call `stop()`. Track via module-scoped variable:

```ts
let stopThemeWatch: (() => void) | null = null;
// inside mountPanel: stopThemeWatch = watchSystemTheme(...)
// inside unmountPanel: stopThemeWatch?.(); stopThemeWatch = null;
```

- [ ] **Step 2: Same in OptionsPage**

```tsx
useEffect(() => {
  const stop = watchSystemTheme(async () => {
    const s = await getSettings();
    applyThemeClass(document.body, s.theme);
  });
  return stop;
}, []);
```

(import `watchSystemTheme` from `../ui/theme`).

- [ ] **Step 3: Commit**

```bash
git add src/content/panel-host.ts src/options/OptionsPage.tsx
git commit -m "Live-update theme on system pref change"
```

---

## Task 24: Storage onChanged → re-render panel across tabs

**Files:**
- Modify: `src/ui/Panel.tsx`

- [ ] **Step 1: Subscribe to storage changes**

In `Panel`'s `useEffect` after initial `load()`:

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

- [ ] **Step 2: Commit**

```bash
git add src/ui/Panel.tsx
git commit -m "Sync panel state via storage.onChanged"
```

---

## Task 25: Playwright E2E — add note + export

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/fixtures.ts`
- Create: `tests/e2e/add-note.spec.ts`

- [ ] **Step 1: Playwright config**

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { headless: false }
});
```

- [ ] **Step 2: Extension fixture**

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

- [ ] **Step 3: Spec — add note**

```ts
// tests/e2e/add-note.spec.ts
import { test, expect } from './fixtures';

test('open panel and add a note on a YouTube watch page', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.waitForSelector('#movie_player video');

  // Trigger panel via toggle command (use action click via background SW eval)
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id!, { type: 'toggle-panel' });
  });

  // Panel host appears
  const host = page.locator('#video-notes-panel-host');
  await expect(host).toBeVisible();

  // Click "+ 新增筆記" inside shadow DOM
  await host.evaluate((el) => (el.shadowRoot!.querySelector('button.vn-add') as HTMLButtonElement).click());

  // Type into editor textarea
  await host.evaluate((el) => {
    const ta = el.shadowRoot!.querySelector('textarea') as HTMLTextAreaElement;
    ta.value = 'Hello from E2E';
    ta.dispatchEvent(new Event('input'));
  });
  await host.evaluate((el) => {
    const btn = Array.from(el.shadowRoot!.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Save') as HTMLButtonElement;
    btn.click();
  });

  // Wait for note to appear
  await page.waitForFunction(() => {
    const h = document.getElementById('video-notes-panel-host');
    return h?.shadowRoot?.querySelector('.vn-note-text')?.textContent?.includes('Hello from E2E');
  }, { timeout: 10_000 });
});
```

- [ ] **Step 4: Build then run**

```bash
npm run build
npm run e2e
```

Expected: spec passes, browser opens YouTube, panel appears, note saved.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e
git commit -m "Add Playwright E2E for add-note flow"
```

---

## Task 26: README updates and limitations notes

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Append "已知限制" + "開發指令" sections**

```markdown

## 開發指令

```bash
npm install            # 第一次
npm run dev            # 開發模式（HMR，但 MV3 部分仍需手動 reload）
npm run build          # 產生 dist/，到 chrome://extensions 載入未封裝
npm test               # unit tests
npm run e2e            # Playwright E2E（需先 build）
```

## 已知限制（V1）

- 截圖時若 YouTube 正在播廣告，會截到廣告畫面（V1 不偵測廣告）
- 不支援 YouTube Shorts、直播、嵌入頁
- 不擷取逐字稿；不做 AI 改寫
- 沒有跨裝置同步；資料在當前瀏覽器
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Add dev instructions and V1 limitations to README"
```

---

## Self-review notes

**Spec coverage check:**

| Spec section | Task |
|---|---|
| §1 Scope | covered by Task 1 manifest match URL |
| §2 User flow | Tasks 14 (panel mount), 16 (editor), 17 (capture), 22 (export UI) |
| §3 Architecture | Tasks 9–11 (SW), 12–14 (CS + panel), 22 (Options) |
| §4.1 chrome.storage | Tasks 4, 5, 16 |
| §4.2 IndexedDB | Tasks 6, 16, 18 |
| §4.3 Derived rules | Task 16 (lastModifiedAt updates), Task 19 (asset cleanup), VideoList delete in Task 22 |
| §5.1 Panel states | Tasks 14–16 |
| §5.2 Options page | Task 22 |
| §5.3 Toolbar badge | Task 11 |
| §5.4 Theme | Tasks 13, 22 (ThemeSection), 23 (live update) |
| §6 Export logic | Tasks 18–22 |
| §6.3 Sanitize | Task 2 |
| §6.4 Asset filename | Task 3 + Task 19 |
| §7 note.md format | Task 7 |
| §8.1 Open panel | Tasks 10, 14 |
| §8.2 New note flow | Task 16 |
| §8.3 Edit | Task 16 |
| §8.4 Delete | Task 16 |
| §8.5 Seek | Task 15 (NoteCard onSeek) wired in Task 16 |
| §8.6 SPA navigation | Task 12 (re-renders panel by remount on toggle; auto-load via storage.onChanged in Task 24) |
| §8.7 Multi-tab | Task 24 |
| §9 Edge cases | Tasks 2 (sanitize), 17 (scrollIntoView), 18 (permission), VideoList errors in 22 |
| §10 Permissions | Task 1 manifest |
| §11 Tech stack | Task 1 |

**Type consistency:** All `Note`, `Video`, `Settings` types defined in Task 4 and reused. Method names checked across Panel, Options, export modules.

**Placeholder scan:** No TBD / TODO / "implement later". Each step shows actual code.

**Known caveats acknowledged in spec:** ad-screenshot, Shorts/live exclusion (§9, §12).

---

## Plan complete

Plan saved to `docs/superpowers/plans/2026-05-10-video-notes-v1.md`.
