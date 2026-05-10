// src/content/index.ts
import { watchYouTubeNavigation, findVideoElement } from './yt-navigation';

let currentVideoId: string | null = null;

watchYouTubeNavigation((videoId) => {
  currentVideoId = videoId;
  console.log('[video-notes] video changed:', videoId);
  // Panel mount logic comes in Task 14
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'toggle-panel') {
    console.log('[video-notes] toggle-panel; current video:', currentVideoId);
    // Panel toggle logic in Task 14
  }
});

(globalThis as any).__videoNotes = { findVideoElement };
