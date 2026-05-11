// src/content/index.ts
import './transcript-cache';
import { watchYouTubeNavigation, findVideoElement } from './yt-navigation';
import { mountPanel, unmountPanel, isPanelMounted } from './panel-host';

let currentVideoId: string | null = null;

watchYouTubeNavigation((videoId) => {
  currentVideoId = videoId;
  console.log('[knitnote] video changed:', videoId);
  // Panel mount logic comes in Task 14
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'toggle-panel') {
    if (!currentVideoId) return;
    if (isPanelMounted()) unmountPanel();
    else mountPanel(currentVideoId);
  }
});

(globalThis as any).__knitnote = { findVideoElement };
