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

export function langAliases(lang: string): string[] {
  // Returns acceptable language codes to try, in priority order.
  // Maps common BCP-47 region tags to YouTube's script-tag equivalents.
  const ALIAS_MAP: Record<string, string[]> = {
    'zh-TW': ['zh-TW', 'zh-Hant', 'zh'],
    'zh-HK': ['zh-HK', 'zh-Hant', 'zh'],
    'zh-Hant': ['zh-Hant', 'zh-TW', 'zh'],
    'zh-CN': ['zh-CN', 'zh-Hans', 'zh'],
    'zh-SG': ['zh-SG', 'zh-Hans', 'zh'],
    'zh-Hans': ['zh-Hans', 'zh-CN', 'zh']
  };
  if (ALIAS_MAP[lang]) return ALIAS_MAP[lang];
  // Default: try the exact code, then strip region/script subtag
  const primary = lang.split('-')[0];
  return primary !== lang ? [lang, primary] : [lang];
}

export function pickTrackUrl(tl: Tracklist | null, preferredLang: string): PickedTrack | null {
  if (!tl || !tl.captionTracks || tl.captionTracks.length === 0) return null;
  const aliases = langAliases(preferredLang);

  // Native track match (try aliases in priority order)
  for (const alias of aliases) {
    const native = tl.captionTracks.find(t => t.languageCode === alias);
    if (native) {
      return {
        url: appendParam(native.baseUrl, 'fmt', 'json3'),
        languageCode: native.languageCode,
        translationLanguage: null
      };
    }
  }

  // Translation: pick first alias that's in translationLanguages
  const translationCodes = new Set((tl.translationLanguages ?? []).map(l => l.languageCode));
  const matched = aliases.find(a => translationCodes.has(a));
  if (!matched) return null;

  const base = tl.captionTracks[0];
  return {
    url: appendParam(appendParam(base.baseUrl, 'tlang', matched), 'fmt', 'json3'),
    languageCode: base.languageCode,
    translationLanguage: matched
  };
}

function appendParam(url: string, key: string, value: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${key}=${encodeURIComponent(value)}`;
}

function extractPlayerResponseJson(html: string): unknown {
  const MARK = 'ytInitialPlayerResponse';
  const eqIdx = html.indexOf(MARK);
  if (eqIdx === -1) return null;
  // Find first '{' after the marker
  const braceStart = html.indexOf('{', eqIdx);
  if (braceStart === -1) return null;
  // Walk char-by-char tracking brace depth + string state (handle escapes)
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = braceStart; i < html.length; i++) {
    const ch = html[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(html.slice(braceStart, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

export function extractTracklistFromHtml(html: string): Tracklist | null {
  const obj: any = extractPlayerResponseJson(html);
  if (!obj) return null;
  const tl = obj?.captions?.playerCaptionsTracklistRenderer;
  if (!tl) return null;
  return {
    captionTracks: tl.captionTracks ?? [],
    translationLanguages: tl.translationLanguages ?? []
  };
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
