import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { putTranscript, getTranscript } from '../../src/shared/transcript-store';
import type { TranscriptRecord } from '../../src/shared/transcript';

describe('transcript-store', () => {
  beforeEach(async () => {
    indexedDB.deleteDatabase('video-notes');
  });

  it('round-trips a TranscriptRecord', async () => {
    const rec: TranscriptRecord = {
      videoId: 'abc',
      languageCode: 'en',
      translationLanguage: 'zh-TW',
      fetchedAt: '2026-05-10T00:00:00Z',
      status: 'ok',
      segments: [{ startSec: 0, durationSec: 1, text: 'hi' }]
    };
    await putTranscript(rec);
    const got = await getTranscript('abc');
    expect(got).toEqual(rec);
  });

  it('returns undefined for unknown videoId', async () => {
    expect(await getTranscript('missing')).toBeUndefined();
  });
});
