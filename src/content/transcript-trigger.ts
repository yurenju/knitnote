import {
  extractTracklistFromDocument,
  pickTrackUrl,
  fetchSegments
} from './transcript-fetcher';
import { putTranscriptViaSw } from './transcript-client';
import type { TranscriptRecord } from '../shared/transcript';
import { getSettings } from '../shared/storage';

export function ensureTranscript(videoId: string): void {
  void (async () => {
    try {
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
