export interface TranscriptSegment {
  startSec: number;
  durationSec: number;
  text: string;
}

export interface TranscriptRecord {
  videoId: string;
  languageCode: string;
  translationLanguage: string | null;
  fetchedAt: string;
  status: 'ok' | 'unavailable';
  segments: TranscriptSegment[];
}

export interface SlicedWindow {
  segments: TranscriptSegment[];
  alignedStartSec: number | null;
  alignedEndSec: number | null;
}

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
