import { describe, it, expect } from 'vitest';
import { renderNoteMd } from '../../src/shared/markdown';
import type { Video } from '../../src/shared/types';
import type { TranscriptRecord } from '../../src/shared/transcript';

const video: Video = {
  videoId: 'abc',
  title: 'T',
  channel: 'C',
  url: 'https://youtu.be/abc',
  firstNoteAt: '2026-05-10T00:00:00Z',
  lastModifiedAt: '2026-05-10T00:00:00Z',
  lastExportedAt: null,
  notes: [{
    id: 'n1',
    timestampSec: 191,
    text: 'my note',
    createdAt: '2026-05-10T00:00:00Z',
    updatedAt: '2026-05-10T00:00:00Z',
    screenshotKey: 'sk1'
  }]
};

const transcript: TranscriptRecord = {
  videoId: 'abc',
  languageCode: 'en',
  translationLanguage: 'zh-TW',
  fetchedAt: '2026-05-10T00:00:00Z',
  status: 'ok',
  segments: [
    { startSec: 170, durationSec: 5, text: 'before-1' },
    { startSec: 185, durationSec: 4, text: 'before-2' },
    { startSec: 192, durationSec: 5, text: 'after-1' },
    { startSec: 220, durationSec: 5, text: 'after-far' }
  ]
};

describe('renderNoteMd with transcript', () => {
  it('renders foldable callout between screenshot and note text', () => {
    const md = renderNoteMd(video, '2026-05-10T01:00:00Z', { abc: transcript }, { beforeSec: 20, afterSec: 20 });
    const idxImg = md.indexOf('![](assets/');
    const idxCallout = md.indexOf('> [!quote]-');
    const idxNote = md.indexOf('> my note');
    expect(idxImg).toBeGreaterThan(0);
    expect(idxCallout).toBeGreaterThan(idxImg);
    expect(idxNote).toBeGreaterThan(idxCallout);
  });

  it('callout title shows aligned range and language', () => {
    const md = renderNoteMd(video, '2026-05-10T01:00:00Z', { abc: transcript }, { beforeSec: 20, afterSec: 20 });
    expect(md).toContain('> [!quote]- 逐字稿 00:02:50 – 00:03:17（zh-TW）');
  });

  it('uses languageCode in callout title when no translation', () => {
    const native: TranscriptRecord = { ...transcript, translationLanguage: null };
    const md = renderNoteMd(video, '2026-05-10T01:00:00Z', { abc: native }, { beforeSec: 20, afterSec: 20 });
    expect(md).toContain('（en）');
  });

  it('omits callout entirely when transcript missing', () => {
    const md = renderNoteMd(video, '2026-05-10T01:00:00Z', {}, { beforeSec: 20, afterSec: 20 });
    expect(md).not.toContain('[!quote]');
  });

  it('omits callout when status=unavailable', () => {
    const u: TranscriptRecord = { ...transcript, status: 'unavailable', segments: [] };
    const md = renderNoteMd(video, '2026-05-10T01:00:00Z', { abc: u }, { beforeSec: 20, afterSec: 20 });
    expect(md).not.toContain('[!quote]');
  });

  it('omits callout when window catches no segments', () => {
    const empty: TranscriptRecord = { ...transcript, segments: [{ startSec: 9999, durationSec: 1, text: 'far' }] };
    const md = renderNoteMd(video, '2026-05-10T01:00:00Z', { abc: empty }, { beforeSec: 20, afterSec: 20 });
    expect(md).not.toContain('[!quote]');
  });
});
