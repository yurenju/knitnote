import type { TranscriptRecord } from '../shared/transcript';

export async function putTranscriptViaSw(record: TranscriptRecord): Promise<void> {
  const r = await chrome.runtime.sendMessage({ type: 'idb-put-transcript', record });
  if (r?.error) throw new Error('putTranscript failed: ' + r.error);
}
