import { describe, it, expect } from 'vitest';
import { formatColon, formatDash } from '../../src/shared/timestamp';

describe('formatColon', () => {
  it('formats sub-minute', () => { expect(formatColon(42)).toBe('00:00:42'); });
  it('formats sub-hour', () => { expect(formatColon(222)).toBe('00:03:42'); });
  it('formats hour-plus', () => { expect(formatColon(3725)).toBe('01:02:05'); });
  it('floors fractional seconds', () => { expect(formatColon(42.9)).toBe('00:00:42'); });
  it('handles zero', () => { expect(formatColon(0)).toBe('00:00:00'); });
});

describe('formatDash', () => {
  it('uses dashes instead of colons', () => { expect(formatDash(222)).toBe('00-03-42'); });
});
