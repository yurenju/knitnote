import { describe, it, expect } from 'vitest';
import { sanitizeFilename } from '../../src/shared/sanitize';

describe('sanitizeFilename', () => {
  it('replaces forbidden chars with dash', () => {
    expect(sanitizeFilename('a<b>c:d"e/f\\g|h?i*j')).toBe('a-b-c-d-e-f-g-h-i-j');
  });

  it('strips ASCII control chars', () => {
    expect(sanitizeFilename('a\x00b\x1Fc')).toBe('a-b-c');
  });

  it('trims leading/trailing whitespace', () => {
    expect(sanitizeFilename('  hello  ')).toBe('hello');
  });

  it('trims trailing dots', () => {
    expect(sanitizeFilename('hello...')).toBe('hello');
  });

  it('prefixes Windows reserved names with underscore', () => {
    expect(sanitizeFilename('CON')).toBe('_CON');
    expect(sanitizeFilename('PRN')).toBe('_PRN');
    expect(sanitizeFilename('COM1')).toBe('_COM1');
    expect(sanitizeFilename('LPT9')).toBe('_LPT9');
    expect(sanitizeFilename('con')).toBe('_con');
  });

  it('truncates to 100 chars', () => {
    const long = 'a'.repeat(150);
    expect(sanitizeFilename(long)).toHaveLength(100);
  });

  it('falls back to provided id when result is empty', () => {
    expect(sanitizeFilename('   ', 'abc123')).toBe('abc123');
    expect(sanitizeFilename('....', 'abc123')).toBe('abc123');
    expect(sanitizeFilename('', 'abc123')).toBe('abc123');
  });

  it('throws when result empty and no fallback given', () => {
    expect(() => sanitizeFilename('   ')).toThrow();
  });
});
