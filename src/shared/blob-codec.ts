// Encodes/decodes Blobs as base64 so they can ride through
// chrome.runtime.sendMessage, which only transports JSON-ifiable values
// and silently strips Blob payloads to empty objects.

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  // Process in chunks to avoid blowing the call stack on String.fromCharCode.
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    binary += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return btoa(binary);
}

export function base64ToBlob(b64: string, mime: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
