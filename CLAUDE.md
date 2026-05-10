# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Chrome MV3 extension for taking time-stamped notes on YouTube videos and exporting Markdown literature notes (Zettelkasten-style). See [README.md](README.md) for the user-facing motivation.

## Commands

```bash
npm install            # first time
npm run dev            # vite dev (HMR; MV3 parts still need chrome://extensions reload)
npm run build          # bundles into dist/ — load unpacked at chrome://extensions
npm test               # vitest unit tests (one shot)
npm run test:watch     # vitest watch
npm run e2e            # Playwright E2E (auto-builds; runs headed; HEADLESS=1 to opt in)
npm test -- <name>     # run a subset, e.g. `npm test -- markdown`
```

## Architecture (cross-file)

Three execution worlds, each with strict boundaries:

- **Service worker** (`src/background/`) — owns IndexedDB writes for screenshots and transcripts, captures `chrome.tabs.captureVisibleTab`, routes content↔SW messages.
- **Content script (ISOLATED)** (`src/content/`) — mounts the Preact panel via shadow DOM into `youtube.com/watch?v=*`, reads YouTube's video element, talks to SW via `chrome.runtime.sendMessage`. **Cannot touch the page's own JS objects.**
- **Content script (MAIN)** (`src/content/main-world-interceptor.ts`) — runs in the page's JS world via `world: 'MAIN'` in the manifest. Hooks `window.fetch` AND `XMLHttpRequest.prototype.open` to capture the YouTube player's `/api/timedtext` URL (which carries a session-bound `pot=` token). Posts the captured base URL via `window.postMessage` to ISOLATED, which caches it in `transcript-cache.ts`.
- **Options page** (`src/options/`) — runs in the extension origin, drives Markdown export to a chosen vault directory via the File System Access API.

**Origin-scoped IDB caveat:** content scripts run in YouTube's origin; the extension's IDB lives in the extension origin. Anything that needs to land in the extension's IDB MUST go through `chrome.runtime.sendMessage` and be persisted by the SW (see `idb-bridge.ts`, `transcript-bridge.ts`). Blobs cannot ride the message bus directly — base64 in `blob-codec.ts`.

**Storage split:**
- `chrome.storage.local` — Video/Note metadata + Settings (extension-scoped, syncs across tabs via `storage.onChanged`)
- IndexedDB `screenshots` store — image blobs, keyed by `screenshotKey`
- IndexedDB `transcripts` store — `TranscriptRecord` per video, keyed by videoId
- IndexedDB `meta` store — persisted `FileSystemDirectoryHandle` for the export vault

**Transcript flow** (the trickiest part): YouTube tightened `/api/timedtext` to require a `pot` PoToken that we cannot generate. So we don't fetch directly; we passively intercept the player's own request, strip `tlang`, and reuse the URL with our preferred lang appended. This requires the user to enable captions at least once during viewing. `ensureTranscript` only fires on the FIRST note save per video; subsequent notes reuse the cached `TranscriptRecord`.

**Markdown rendering:** `src/shared/markdown.ts` `renderNoteMd` produces the file. Transcript `<details>` block is rendered between screenshot and note text using `sliceWindow` (window size from `Settings.transcriptBeforeSec/AfterSec`).

## Conventions

- Conversation in Traditional Chinese; code/comments in English
- No code comments unless the WHY is non-obvious (existing files reflect this)
- Spec/plan/research markdown under `docs/superpowers/` MUST be in Traditional Chinese — see `~/.claude/rules/spec-plan-language.md`
- Use package manager (`npm install <pkg>`) for adding deps; don't hand-edit `package.json` versions
- E2E tests run headed by default — Playwright Chromium's headless can't reliably wake MV3 service workers

## Manual testing the extension

`docs/extension-manual-testing.md` is the canonical workflow for driving a real chromium with the extension loaded via `playwright-cli`. Use it whenever you change:

- content scripts or MAIN-world hooks
- IndexedDB schema (DB_VERSION bumps)
- service worker message routing
- anything that needs a real YouTube page to verify

The unit tests + E2E `add-note.spec.ts` won't catch issues like "YouTube uses XHR not fetch" or "PoToken changed" — only running against live YouTube will.

## Specs and plans

- Specs live in `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
- Plans live in `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`
- New features go through brainstorming → spec → plan → implementation. Use the `superpowers:brainstorming`, `superpowers:writing-plans`, and `superpowers:subagent-driven-development` skills in that order.
