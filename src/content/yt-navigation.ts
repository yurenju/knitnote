// src/content/yt-navigation.ts
import { videoIdFromUrl } from '../shared/youtube';

export type NavCallback = (videoId: string | null) => void;

export function watchYouTubeNavigation(cb: NavCallback): () => void {
  let last: string | null = videoIdFromUrl(location.href);
  cb(last);
  const onChange = () => {
    const cur = videoIdFromUrl(location.href);
    if (cur !== last) { last = cur; cb(cur); }
  };
  document.addEventListener('yt-navigate-finish', onChange);
  window.addEventListener('popstate', onChange);
  // YouTube also pushes via pushState — observe via patching is overkill; the events above cover real navigation
  const interval = setInterval(onChange, 1000);
  return () => {
    document.removeEventListener('yt-navigate-finish', onChange);
    window.removeEventListener('popstate', onChange);
    clearInterval(interval);
  };
}

export function findVideoElement(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>('#movie_player video');
}
