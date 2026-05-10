import { getAllVideos } from '../shared/storage';
import { videoIdFromUrl } from '../shared/youtube';

export async function refreshBadgeForTab(tabId: number, url: string | undefined): Promise<void> {
  const videoId = videoIdFromUrl(url);
  if (!videoId) {
    await chrome.action.setBadgeText({ tabId, text: '' });
    return;
  }
  const videos = await getAllVideos();
  const count = videos[videoId]?.notes.length ?? 0;
  await chrome.action.setBadgeText({ tabId, text: count > 0 ? String(count) : '' });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: '#6a4dff' });
}
