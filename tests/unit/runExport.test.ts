import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { installChromeMock } from './_chrome-mock';
import { FakeDir } from './_fs-mock';
import { upsertVideo, getVideo } from '../../src/shared/storage';
import { putScreenshot, getDb } from '../../src/shared/idb';
import { putTranscript } from '../../src/shared/transcript-store';
import { runExportForVideo } from '../../src/options/export/runExport';
import type { Video } from '../../src/shared/types';

const mock = installChromeMock();

const baseVideo = (overrides: Partial<Video> = {}): Video => ({
  videoId: 'abc123', title: 'Hello: World*?', channel: 'C',
  url: 'https://www.youtube.com/watch?v=abc123',
  firstNoteAt: '2026-05-10T14:30:00+08:00',
  lastModifiedAt: '2026-05-10T15:00:00+08:00',
  lastExportedAt: null,
  notes: [{ id: 'n1', timestampSec: 222, text: 'x', createdAt: '', updatedAt: '', screenshotKey: 's1' }],
  ...overrides
});

describe('runExportForVideo', () => {
  beforeEach(async () => {
    mock.reset();
    indexedDB.deleteDatabase('knitnote');
    await putScreenshot('s1', new Blob([new Uint8Array([1])], { type: 'image/png' }));
  });

  it('creates folder named YYYY-MM-DD_<sanitized title>', async () => {
    await upsertVideo(baseVideo());
    const root = new FakeDir('root') as any;
    await runExportForVideo(root, 'abc123');
    expect(Array.from(root.dirs.keys())).toEqual(['2026-05-10_Hello- World--']);
  });

  it('writes note.md and assets', async () => {
    await upsertVideo(baseVideo());
    const root = new FakeDir('root') as any;
    await runExportForVideo(root, 'abc123');
    const folder = root.dirs.get('2026-05-10_Hello- World--');
    expect(folder.files.has('note.md')).toBe(true);
    expect(folder.dirs.get('assets').files.has('00-03-42.png')).toBe(true);
  });

  it('updates lastExportedAt', async () => {
    await upsertVideo(baseVideo());
    const root = new FakeDir('root') as any;
    await runExportForVideo(root, 'abc123');
    const after = await getVideo('abc123');
    expect(after?.lastExportedAt).toBeTruthy();
  });

  it('skips writing when nothing changed since last export', async () => {
    const root = new FakeDir('root') as any;
    await upsertVideo(baseVideo({ lastExportedAt: '2026-05-10T15:01:00+08:00' }));
    const result = await runExportForVideo(root, 'abc123');
    expect(result.skipped).toBe(true);
    expect(root.dirs.size).toBe(0);
  });

  it('force: true exports even when nothing changed since last export', async () => {
    const root = new FakeDir('root') as any;
    await upsertVideo(baseVideo({ lastExportedAt: '2026-05-10T15:01:00+08:00' }));
    const result = await runExportForVideo(root, 'abc123', { force: true });
    expect(result.skipped).toBe(false);
    expect(root.dirs.size).toBe(1);
  });
});

describe('runExportForVideo with transcript', () => {
  beforeEach(async () => {
    mock.reset();
    indexedDB.deleteDatabase('knitnote');
    const db = await getDb();
    await db.clear('transcripts');
    await db.clear('screenshots');
    await putScreenshot('s1', new Blob([new Uint8Array([1])], { type: 'image/png' }));
  });

  it('embeds foldable callout in note.md when transcript exists', async () => {
    await upsertVideo(baseVideo());
    await putTranscript({
      videoId: 'abc123',
      languageCode: 'en',
      translationLanguage: 'zh-TW',
      fetchedAt: '2026-05-10T00:00:00Z',
      status: 'ok',
      segments: [{ startSec: 220, durationSec: 4, text: 'context' }]
    });
    const root = new FakeDir('root') as any;
    await runExportForVideo(root, 'abc123');
    const folder = root.dirs.get('2026-05-10_Hello- World--');
    const md: string = await folder.files.get('note.md').text();
    expect(md).toContain('> [!quote]-');
    expect(md).toContain('context');
  });

  it('omits callout when no transcript exists', async () => {
    await upsertVideo(baseVideo());
    const root = new FakeDir('root') as any;
    await runExportForVideo(root, 'abc123');
    const folder = root.dirs.get('2026-05-10_Hello- World--');
    const md: string = await folder.files.get('note.md').text();
    expect(md).not.toContain('[!quote]');
  });
});
