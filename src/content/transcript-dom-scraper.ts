import type { TranscriptSegment } from '../shared/transcript';

export type ScrapeResult =
  | { status: 'ok'; segments: TranscriptSegment[] }
  | { status: 'unavailable' }
  | { status: 'timeout' };

const SHOW_BUTTON_SELECTORS = [
  'ytd-video-description-transcript-section-renderer button',
  'button[aria-label*="transcript" i]',
  // YouTube (zh-TW) uses "顯示轉錄稿"; "逐字稿" is an older label
  'button[aria-label*="轉錄稿"]',
  'button[aria-label*="逐字稿"]'
];

// YouTube migrated from ytd-transcript-renderer / ytd-transcript-segment-renderer
// to transcript-segment-view-model elements inside an engagement panel in 2025.
const PANEL_SELECTOR =
  'ytd-engagement-panel-section-list-renderer[target-id="PAmodern_transcript_view"]';
const SEGMENT_SELECTOR = 'transcript-segment-view-model';
const TIMESTAMP_SELECTOR = '.ytwTranscriptSegmentViewModelTimestamp';
const TEXT_SELECTOR = 'span.ytAttributedStringHost';

const PANEL_RENDER_TIMEOUT_MS = 8000;
// Attribute value when the engagement panel is visible.
const PANEL_EXPANDED_ATTR = 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED';
// Close button inside the transcript engagement panel header.
const PANEL_CLOSE_SELECTOR = `${PANEL_SELECTOR} button[aria-label*="關閉"], ${PANEL_SELECTOR} button[aria-label*="close" i]`;

export async function scrapeTranscript(): Promise<ScrapeResult> {
  const button = findShowTranscriptButton();
  if (!button) return { status: 'unavailable' };

  const panel = document.querySelector(PANEL_SELECTOR);
  const panelWasOpen =
    panel?.getAttribute('visibility') === PANEL_EXPANDED_ATTR;

  if (!panelWasOpen) {
    button.click();
    const opened = await waitForSegments(PANEL_RENDER_TIMEOUT_MS);
    if (!opened) return { status: 'timeout' };
  }

  const segments = readSegments();

  if (!panelWasOpen) {
    // Close the engagement panel via its own close button.
    const closeBtn = document.querySelector(PANEL_CLOSE_SELECTOR) as HTMLButtonElement | null;
    closeBtn?.click();
  }

  if (segments.length === 0) return { status: 'unavailable' };
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
