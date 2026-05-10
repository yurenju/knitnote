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
