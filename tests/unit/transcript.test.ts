import { describe, it, expect } from 'vitest';
import { sliceWindow, parseJson3, type TranscriptRecord, type TranscriptSegment } from '../../src/shared/transcript';

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

describe('sliceWindow', () => {
  const segs: TranscriptSegment[] = [
    { startSec: 0,  durationSec: 2, text: 'a' },
    { startSec: 2,  durationSec: 3, text: 'b' },
    { startSec: 5,  durationSec: 2, text: 'c' },
    { startSec: 10, durationSec: 1, text: 'd' },
    { startSec: 20, durationSec: 5, text: 'e' }
  ];

  it('returns segments overlapping the window', () => {
    const r = sliceWindow(segs, 6, 2, 5);
    expect(r.segments.map(s => s.text)).toEqual(['b', 'c', 'd']);
  });

  it('aligned start / end equal first / last segment boundaries', () => {
    const r = sliceWindow(segs, 6, 2, 5);
    expect(r.alignedStartSec).toBe(2);
    expect(r.alignedEndSec).toBe(11);
  });

  it('returns empty when window misses all segments', () => {
    const r = sliceWindow(segs, 50, 1, 1);
    expect(r.segments).toEqual([]);
    expect(r.alignedStartSec).toBeNull();
    expect(r.alignedEndSec).toBeNull();
  });

  it('clamps negative window start to 0', () => {
    const r = sliceWindow(segs, 1, 30, 1);
    expect(r.segments[0].text).toBe('a');
  });
});

describe('parseJson3', () => {
  it('extracts events with segs into TranscriptSegments', () => {
    const json = {
      events: [
        { tStartMs: 0, dDurationMs: 1500, segs: [{ utf8: 'Hello' }, { utf8: ' world' }] },
        { tStartMs: 1500, dDurationMs: 0 },
        { tStartMs: 2000, dDurationMs: 1000, segs: [{ utf8: 'next' }] }
      ]
    };
    const r = parseJson3(json);
    expect(r).toEqual([
      { startSec: 0, durationSec: 1.5, text: 'Hello world' },
      { startSec: 2, durationSec: 1, text: 'next' }
    ]);
  });

  it('normalizes newlines inside segs to spaces', () => {
    const json = { events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'line1\nline2' }] }] };
    expect(parseJson3(json)[0].text).toBe('line1 line2');
  });

  it('skips events with empty utf8 segs', () => {
    const json = { events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: '' }] }] };
    expect(parseJson3(json)).toEqual([]);
  });

  it('returns [] on missing events', () => {
    expect(parseJson3({})).toEqual([]);
    expect(parseJson3(null)).toEqual([]);
  });
});
