import { parseJson3, type TranscriptSegment } from '../shared/transcript';

export interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
}
export interface TranslationLanguage {
  languageCode: string;
}
export interface Tracklist {
  captionTracks: CaptionTrack[];
  translationLanguages: TranslationLanguage[];
}

export interface PickedTrack {
  url: string;
  languageCode: string;
  translationLanguage: string | null;
}

export function pickTrackUrl(tl: Tracklist | null, preferredLang: string): PickedTrack | null {
  if (!tl || !tl.captionTracks || tl.captionTracks.length === 0) return null;
  const native = tl.captionTracks.find(t => t.languageCode === preferredLang);
  if (native) {
    return {
      url: appendParam(native.baseUrl, 'fmt', 'json3'),
      languageCode: native.languageCode,
      translationLanguage: null
    };
  }
  const translatable = (tl.translationLanguages ?? []).some(l => l.languageCode === preferredLang);
  if (!translatable) return null;
  const base = tl.captionTracks[0];
  return {
    url: appendParam(appendParam(base.baseUrl, 'tlang', preferredLang), 'fmt', 'json3'),
    languageCode: base.languageCode,
    translationLanguage: preferredLang
  };
}

function appendParam(url: string, key: string, value: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${key}=${encodeURIComponent(value)}`;
}

const RE_PLAYER_RESPONSE = /var\s+ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\})\s*;\s*(?:var\s|<\/script>)/;

export function extractTracklistFromHtml(html: string): Tracklist | null {
  const m = html.match(RE_PLAYER_RESPONSE);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[1]);
    const tl = obj?.captions?.playerCaptionsTracklistRenderer;
    if (!tl) return null;
    return {
      captionTracks: tl.captionTracks ?? [],
      translationLanguages: tl.translationLanguages ?? []
    };
  } catch {
    return null;
  }
}

export function extractTracklistFromDocument(doc: Document): Tracklist | null {
  const scripts = doc.querySelectorAll('script');
  for (const s of Array.from(scripts)) {
    const text = s.textContent ?? '';
    if (!text.includes('ytInitialPlayerResponse')) continue;
    const tl = extractTracklistFromHtml(text);
    if (tl) return tl;
  }
  return null;
}

export async function fetchSegments(url: string): Promise<TranscriptSegment[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`timedtext HTTP ${res.status}`);
  const json = await res.json();
  return parseJson3(json);
}
