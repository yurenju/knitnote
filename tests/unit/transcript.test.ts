import { describe, it, expect } from 'vitest';
import type { TranscriptRecord, TranscriptSegment } from '../../src/shared/transcript';

describe('transcript types', () => {
  it('TranscriptRecord shape compiles and accepts ok / unavailable', () => {
    const ok: TranscriptRecord = {
      videoId: 'abc',
      languageCode: 'en',
      translationLanguage: 'zh-TW',
      fetchedAt: '2026-05-10T00:00:00Z',
      status: 'ok',
      segments: [{ startSec: 0, durationSec: 1.5, text: 'hello' }]
    };
    const bad: TranscriptRecord = {
      videoId: 'abc',
      languageCode: '',
      translationLanguage: null,
      fetchedAt: '2026-05-10T00:00:00Z',
      status: 'unavailable',
      segments: []
    };
    expect(ok.status).toBe('ok');
    expect(bad.status).toBe('unavailable');
  });
});
