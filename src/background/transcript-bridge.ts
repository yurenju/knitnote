import { putTranscript } from '../shared/transcript-store';
import type { TranscriptRecord } from '../shared/transcript';

interface PutMsg { type: 'idb-put-transcript'; record: TranscriptRecord; }
type TranscriptMsg = PutMsg;

export function isTranscriptMessage(msg: unknown): msg is TranscriptMsg {
  return !!msg && typeof msg === 'object'
    && (msg as { type?: unknown }).type === 'idb-put-transcript';
}

export function handleTranscriptMessage(
  msg: TranscriptMsg,
  sendResponse: (response: { ok: true } | { error: string }) => void
): true {
  putTranscript(msg.record)
    .then(() => sendResponse({ ok: true }))
    .catch((e: unknown) => sendResponse({ error: String(e) }));
  return true;
}
