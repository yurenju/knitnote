export interface Note {
  id: string;
  timestampSec: number;
  text: string;
  createdAt: string;        // ISO 8601 with timezone
  updatedAt: string;
  screenshotKey: string;    // IndexedDB key
}

export interface Video {
  videoId: string;
  title: string;
  channel: string;
  url: string;
  firstNoteAt: string;
  lastModifiedAt: string;
  lastExportedAt: string | null;
  notes: Note[];
}

export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  theme: Theme;
  hasVaultConfigured: boolean;
  transcriptBeforeSec: number;
  transcriptAfterSec: number;
  transcriptPreferredLang: string;   // BCP-47, e.g. "zh-TW"
}

export interface StorageShape {
  videos: Record<string, Video>;
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  hasVaultConfigured: false,
  transcriptBeforeSec: 20,
  transcriptAfterSec: 20,
  transcriptPreferredLang:
    (typeof navigator !== 'undefined' && navigator.language) || 'en'
};
