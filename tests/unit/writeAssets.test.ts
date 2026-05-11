import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { FakeDir } from './_fs-mock';
import { putScreenshot } from '../../src/shared/idb';
import { writeAssets } from '../../src/options/export/writeAssets';
import type { Note } from '../../src/shared/types';

const note = (id: string, sec: number, key: string): Note => ({
  id, timestampSec: sec, text: 't', createdAt: '', updatedAt: '', screenshotKey: key
});

describe('writeAssets', () => {
  beforeEach(() => indexedDB.deleteDatabase('knitnote'));

  it('writes a new asset with formatted name', async () => {
    await putScreenshot('s1', new Blob([new Uint8Array([1,2,3])], { type: 'image/png' }));
    const root = new FakeDir('root') as any;
    await writeAssets(root, [note('n1', 222, 's1')]);
    const assets = await root.getDirectoryHandle('assets');
    expect(assets.files.has('00-03-42.png')).toBe(true);
  });

  it('does not overwrite existing assets unchanged', async () => {
    await putScreenshot('s1', new Blob([new Uint8Array([9])], { type: 'image/png' }));
    const root = new FakeDir('root') as any;
    const assets = await root.getDirectoryHandle('assets', { create: true });
    assets.files.set('00-03-42.png', new Blob([new Uint8Array([1])]));
    const before = assets.files.get('00-03-42.png');
    await writeAssets(root, [note('n1', 222, 's1')]);
    expect(assets.files.get('00-03-42.png')).toBe(before);
  });

  it('removes orphan assets not referenced by any note', async () => {
    const root = new FakeDir('root') as any;
    const assets = await root.getDirectoryHandle('assets', { create: true });
    assets.files.set('00-99-99.png', new Blob());
    await writeAssets(root, []);
    expect(assets.files.has('00-99-99.png')).toBe(false);
  });

  it('force: true overwrites existing assets', async () => {
    await putScreenshot('s1', new Blob([new Uint8Array([9, 9, 9])], { type: 'image/png' }));
    const root = new FakeDir('root') as any;
    const assets = await root.getDirectoryHandle('assets', { create: true });
    const stale = new Blob([new Uint8Array([1])]);
    assets.files.set('00-03-42.png', stale);
    await writeAssets(root, [note('n1', 222, 's1')], { force: true });
    const after = assets.files.get('00-03-42.png');
    expect(after).not.toBe(stale);
    expect(new Uint8Array(await after!.arrayBuffer())).toEqual(new Uint8Array([9, 9, 9]));
  });

  it('keeps going when removeEntry throws (best-effort orphan cleanup)', async () => {
    const root = new FakeDir('root') as any;
    const assets = await root.getDirectoryHandle('assets', { create: true });
    assets.files.set('orphan-locked.png', new Blob());
    assets.files.set('orphan-removable.png', new Blob());
    // Patch removeEntry to throw for one file, succeed for the other.
    const orig = assets.removeEntry.bind(assets);
    assets.removeEntry = async (name: string) => {
      if (name === 'orphan-locked.png') throw new Error('locked by sync');
      return orig(name);
    };
    await writeAssets(root, []);
    expect(assets.files.has('orphan-locked.png')).toBe(true);
    expect(assets.files.has('orphan-removable.png')).toBe(false);
  });

  it('handles duplicate-second timestamps with -2 suffix', async () => {
    await putScreenshot('s1', new Blob([new Uint8Array([1])]));
    await putScreenshot('s2', new Blob([new Uint8Array([2])]));
    const root = new FakeDir('root') as any;
    await writeAssets(root, [note('a', 222, 's1'), note('b', 222, 's2')]);
    const assets = await root.getDirectoryHandle('assets');
    expect(assets.files.has('00-03-42.png')).toBe(true);
    expect(assets.files.has('00-03-42-2.png')).toBe(true);
  });
});
