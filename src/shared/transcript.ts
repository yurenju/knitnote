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
