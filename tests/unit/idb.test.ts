import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { putScreenshot, getScreenshot, deleteScreenshot, listScreenshotKeys } from '../../src/shared/idb';

describe('idb screenshots', () => {
  beforeEach(async () => {
    indexedDB.deleteDatabase('knitnote');
  });

  it('roundtrips a Blob', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    await putScreenshot('shot_a', blob);
    const got = await getScreenshot('shot_a');
    expect(got).toBeInstanceOf(Blob);
    expect(await got!.arrayBuffer()).toEqual(await blob.arrayBuffer());
  });

  it('returns undefined for missing key', async () => {
    expect(await getScreenshot('nope')).toBeUndefined();
  });

  it('delete removes', async () => {
    const blob = new Blob([new Uint8Array([1])]);
    await putScreenshot('shot_x', blob);
    await deleteScreenshot('shot_x');
    expect(await getScreenshot('shot_x')).toBeUndefined();
  });

  it('listScreenshotKeys returns all keys', async () => {
    await putScreenshot('shot_a', new Blob([new Uint8Array([1])]));
    await putScreenshot('shot_b', new Blob([new Uint8Array([2])]));
    const keys = await listScreenshotKeys();
    expect(keys.sort()).toEqual(['shot_a', 'shot_b']);
  });
});
