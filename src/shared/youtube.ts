// Pure URL helpers for YouTube. Shared by service worker and content script.

export function videoIdFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname !== 'www.youtube.com' || u.pathname !== '/watch') return null;
    return u.searchParams.get('v');
  } catch {
    return null;
  }
}
