// Client-side wrappers that route screenshot IndexedDB ops through the
// service worker, so blobs land in the extension's own IndexedDB instead
// of YouTube's origin (where content scripts otherwise execute).
//
// chrome.runtime.sendMessage uses structured clone, which transports Blobs
// across the content-script ↔ service-worker boundary unchanged.

export async function putScreenshot(key: string, blob: Blob): Promise<void> {
  const r = await chrome.runtime.sendMessage({ type: 'idb-put-screenshot', key, blob });
  if (r?.error) throw new Error('putScreenshot failed: ' + r.error);
}

export async function deleteScreenshot(key: string): Promise<void> {
  const r = await chrome.runtime.sendMessage({ type: 'idb-delete-screenshot', key });
  if (r?.error) throw new Error('deleteScreenshot failed: ' + r.error);
}
