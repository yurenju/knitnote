import { describe, it, expect, beforeEach } from 'vitest';
import { installChromeMock } from './_chrome-mock';
import { getAllVideos, getVideo, upsertVideo, deleteVideo, getSettings, setSettings } from '../../src/shared/storage';
import type { Video } from '../../src/shared/types';

const mock = installChromeMock();

const sampleVideo = (id: string): Video => ({
  videoId: id, title: 'T', channel: 'C', url: 'https://www.youtube.com/watch?v=' + id,
  firstNoteAt: '2026-05-10T10:00:00+08:00', lastModifiedAt: '2026-05-10T10:00:00+08:00',
  lastExportedAt: null, notes: []
});

describe('storage', () => {
  beforeEach(() => mock.reset());

  it('returns empty videos and default settings on fresh storage', async () => {
    expect(await getAllVideos()).toEqual({});
    expect((await getSettings()).theme).toBe('system');
  });

  it('upsert + get a video', async () => {
    await upsertVideo(sampleVideo('a'));
    expect(await getVideo('a')).toMatchObject({ videoId: 'a' });
  });

  it('upsert preserves other videos', async () => {
    await upsertVideo(sampleVideo('a'));
    await upsertVideo(sampleVideo('b'));
    expect(Object.keys(await getAllVideos())).toEqual(['a', 'b']);
  });

  it('delete removes one video', async () => {
    await upsertVideo(sampleVideo('a'));
    await upsertVideo(sampleVideo('b'));
    await deleteVideo('a');
    expect(await getVideo('a')).toBeUndefined();
    expect(await getVideo('b')).toBeDefined();
  });

  it('setSettings persists', async () => {
    await setSettings({ theme: 'dark', hasVaultConfigured: true });
    expect(await getSettings()).toEqual({ theme: 'dark', hasVaultConfigured: true });
  });
});
