import { parseJson3, type TranscriptSegment, type TranscriptRecord } from '../shared/transcript';
import { putTranscriptViaSw } from './transcript-client';
import { getSettings } from '../shared/storage';
import { langAliases } from './transcript-fetcher';
import { getCapturedBaseUrl } from './transcript-cache';

export function ensureTranscript(videoId: string): void {
  void (async () => {
    try {
      const now = new Date().toISOString();
      const baseUrl = getCapturedBaseUrl(videoId);
      if (!baseUrl) {
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
      const settings = await getSettings();
      const sourceLang = new URL(baseUrl).searchParams.get('lang') || 'en';
      const aliases = langAliases(settings.transcriptPreferredLang);

      for (const alias of aliases) {
        const tryUrl = new URL(baseUrl);
        let translationLang: string | null = null;
        if (alias !== sourceLang) {
          tryUrl.searchParams.set('tlang', alias);
          translationLang = alias;
        }
        let segments: TranscriptSegment[] = [];
        try {
          const res = await fetch(tryUrl.toString());
          if (!res.ok) continue;
          const json = await res.json();
          segments = parseJson3(json);
        } catch (e) {
          console.warn('[video-notes] transcript fetch failed:', e);
          continue;
        }
        if (segments.length === 0) continue;
        const rec: TranscriptRecord = {
          videoId,
          languageCode: sourceLang,
          translationLanguage: translationLang,
          fetchedAt: now,
          status: 'ok',
          segments
        };
        await putTranscriptViaSw(rec);
        return;
      }

      await putTranscriptViaSw({
        videoId,
        languageCode: sourceLang,
        translationLanguage: null,
        fetchedAt: now,
        status: 'unavailable',
        segments: []
      });
    } catch (e) {
      console.warn('[video-notes] ensureTranscript error:', e);
    }
  })();
}
