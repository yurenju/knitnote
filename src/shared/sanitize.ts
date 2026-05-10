const FORBIDDEN = /[<>:"/\\|?*\x00-\x1F]/g;
const RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

export function sanitizeFilename(input: string, fallbackId?: string): string {
  let out = input.replace(FORBIDDEN, '-').trim().replace(/\.+$/, '');
  if (out.length > 100) out = out.slice(0, 100);
  if (RESERVED.test(out)) out = '_' + out;
  if (out.length === 0) {
    if (fallbackId) return fallbackId;
    throw new Error('sanitizeFilename produced empty result and no fallback provided');
  }
  return out;
}
