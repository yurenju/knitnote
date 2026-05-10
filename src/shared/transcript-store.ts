import { getDb } from './idb';
import type { TranscriptRecord } from './transcript';

export async function putTranscript(rec: TranscriptRecord): Promise<void> {
  const db = await getDb();
  await db.put('transcripts', rec, rec.videoId);
}

export async function getTranscript(videoId: string): Promise<TranscriptRecord | undefined> {
  const db = await getDb();
  return db.get('transcripts', videoId) as Promise<TranscriptRecord | undefined>;
}

export async function listTranscriptKeys(): Promise<string[]> {
  const db = await getDb();
  return (await db.getAllKeys('transcripts')) as string[];
}
