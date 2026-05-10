// Bridges screenshot IndexedDB ops from content scripts (which run in
// YouTube's origin) into the extension's own IndexedDB. Content scripts
// must not call src/shared/idb.ts directly — they would hit the wrong DB.
//
// chrome.runtime.sendMessage is JSON-only, so Blobs are sent as base64
// strings and reconstituted here before being persisted.
import { putScreenshot, deleteScreenshot } from '../shared/idb';
import { base64ToBlob } from '../shared/blob-codec';

interface PutMsg { type: 'idb-put-screenshot'; key: string; data: string; mime: string; }
interface DelMsg { type: 'idb-delete-screenshot'; key: string; }
type IdbMsg = PutMsg | DelMsg;

export function isIdbMessage(msg: unknown): msg is IdbMsg {
  if (!msg || typeof msg !== 'object') return false;
  const t = (msg as { type?: unknown }).type;
  return t === 'idb-put-screenshot' || t === 'idb-delete-screenshot';
}

export function handleIdbMessage(
  msg: IdbMsg,
  sendResponse: (response: { ok: true } | { error: string }) => void
): true {
  const ack = (p: Promise<unknown>) =>
    p.then(() => sendResponse({ ok: true }))
     .catch((e: unknown) => sendResponse({ error: String(e) }));
  if (msg.type === 'idb-put-screenshot') {
    const blob = base64ToBlob(msg.data, msg.mime);
    ack(putScreenshot(msg.key, blob));
  } else {
    ack(deleteScreenshot(msg.key));
  }
  return true;
}
