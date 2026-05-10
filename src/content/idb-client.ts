// Client-side wrappers that route screenshot IndexedDB ops through the
// service worker, so blobs land in the extension's own IndexedDB instead
// of YouTube's origin (where content scripts otherwise execute).
//
// chrome.runtime.sendMessage is JSON-only — Blobs sent through it are
// silently reduced to empty objects. We base64-encode on the way out and
// the SW reconstructs the Blob in the extension's IDB.

import { blobToBase64 } from '../shared/blob-codec';

export async function putScreenshot(key: string, blob: Blob): Promise<void> {
  const data = await blobToBase64(blob);
  const mime = blob.type || 'image/png';
  const r = await chrome.runtime.sendMessage({ type: 'idb-put-screenshot', key, data, mime });
  if (r?.error) throw new Error('putScreenshot failed: ' + r.error);
}

export async function deleteScreenshot(key: string): Promise<void> {
  const r = await chrome.runtime.sendMessage({ type: 'idb-delete-screenshot', key });
  if (r?.error) throw new Error('deleteScreenshot failed: ' + r.error);
}
