import { describe, it, expect } from 'vitest';
import { blobToBase64, base64ToBlob } from '../../src/shared/blob-codec';

describe('blob-codec', () => {
  it('roundtrips arbitrary bytes preserving mime type', async () => {
    const original = new Blob([new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0xFF, 0x00, 0x42])], { type: 'image/png' });
    const b64 = await blobToBase64(original);
    expect(typeof b64).toBe('string');
    const restored = base64ToBlob(b64, 'image/png');
    expect(restored.type).toBe('image/png');
    expect(new Uint8Array(await restored.arrayBuffer())).toEqual(new Uint8Array(await original.arrayBuffer()));
  });

  it('roundtrips a large blob without stack overflow', async () => {
    const bytes = new Uint8Array(200_000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i & 0xff;
    const original = new Blob([bytes], { type: 'image/png' });
    const restored = base64ToBlob(await blobToBase64(original), 'image/png');
    expect(new Uint8Array(await restored.arrayBuffer())).toEqual(bytes);
  });
});
