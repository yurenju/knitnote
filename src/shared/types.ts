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
}

export interface StorageShape {
  videos: Record<string, Video>;
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = { theme: 'system', hasVaultConfigured: false };
