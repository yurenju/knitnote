(() => {
  const origFetch = window.fetch;
  if ((window as any).__videoNotesFetchHooked) return;
  (window as any).__videoNotesFetchHooked = true;
  console.log('[video-notes] main-world fetch hook installed');

  window.fetch = function (...args: Parameters<typeof origFetch>) {
    const promise = origFetch.apply(this, args);
    try {
      const input = args[0];
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url && url.includes('/api/timedtext') && url.includes('pot=')) {
        const u = new URL(url);
        const v = u.searchParams.get('v');
        if (v) {
          u.searchParams.delete('tlang');
          window.postMessage(
            { type: 'video-notes:tt-base', videoId: v, baseUrl: u.toString() },
            location.origin
          );
          console.log('[video-notes] captured timedtext base URL for video', v);
        }
      }
    } catch (_) {}
    return promise;
  } as typeof origFetch;
})();
