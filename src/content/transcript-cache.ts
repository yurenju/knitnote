const cache = new Map<string, string>();

if (typeof window !== 'undefined') {
  window.addEventListener('message', (ev: MessageEvent) => {
    if (ev.source !== window) return;
    const data = ev.data as { type?: string; videoId?: string; baseUrl?: string };
    if (!data || data.type !== 'knitnote:tt-base') return;
    if (typeof data.videoId !== 'string' || typeof data.baseUrl !== 'string') return;
    cache.set(data.videoId, data.baseUrl);
    console.log('[knitnote] cached timedtext base for', data.videoId);
  });
}

export function getCapturedBaseUrl(videoId: string): string | undefined {
  return cache.get(videoId);
}

export function _clearCacheForTests(): void {
  cache.clear();
}
