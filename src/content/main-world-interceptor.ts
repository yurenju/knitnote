(() => {
  if ((window as any).__knitnoteFetchHooked) return;
  (window as any).__knitnoteFetchHooked = true;
  console.log('[knitnote] main-world fetch hook installed');

  function captureTimedtext(url: string): void {
    try {
      if (!url.includes('/api/timedtext') || !url.includes('pot=')) return;
      const u = new URL(url, location.origin);
      const v = u.searchParams.get('v');
      if (!v) return;
      u.searchParams.delete('tlang');
      window.postMessage(
        { type: 'knitnote:tt-base', videoId: v, baseUrl: u.toString() },
        location.origin
      );
      console.log('[knitnote] captured timedtext base URL for video', v);
    } catch (_) {}
  }

  const origFetch = window.fetch;
  window.fetch = function (this: typeof window, ...args: Parameters<typeof origFetch>) {
    const promise = origFetch.apply(this, args);
    try {
      const input = args[0];
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url) captureTimedtext(url);
    } catch (_) {}
    return promise;
  } as typeof origFetch;

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ) {
    try {
      const u = typeof url === 'string' ? url : url.toString();
      captureTimedtext(u);
    } catch (_) {}
    // eslint-disable-next-line prefer-rest-params
    return (origOpen as any).apply(this, arguments as unknown as IArguments);
  } as typeof XMLHttpRequest.prototype.open;
})();
