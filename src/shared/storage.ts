import { DEFAULT_SETTINGS, Settings, Video } from './types';

const VIDEOS_KEY = 'videos';
const SETTINGS_KEY = 'settings';

export async function getAllVideos(): Promise<Record<string, Video>> {
  const r = await chrome.storage.local.get(VIDEOS_KEY);
  return (r[VIDEOS_KEY] as Record<string, Video>) ?? {};
}

export async function getVideo(id: string): Promise<Video | undefined> {
  const all = await getAllVideos();
  return all[id];
}

export async function upsertVideo(video: Video): Promise<void> {
  const all = await getAllVideos();
  all[video.videoId] = video;
  await chrome.storage.local.set({ [VIDEOS_KEY]: all });
}

export async function deleteVideo(id: string): Promise<void> {
  const all = await getAllVideos();
  delete all[id];
  await chrome.storage.local.set({ [VIDEOS_KEY]: all });
}

export async function getSettings(): Promise<Settings> {
  const r = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...((r[SETTINGS_KEY] as Settings) ?? {}) };
}

export async function setSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: s });
}
