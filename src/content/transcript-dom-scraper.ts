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
    // Same button toggles the transcript panel; close it after scraping.
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
    if (existing) {
      resolve(true);
      return;
    }

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
