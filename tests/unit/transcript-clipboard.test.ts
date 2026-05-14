import { describe, it, expect } from 'vitest';
import { formatForClipboard } from '../../src/shared/transcript-clipboard';
import type { TranscriptSegment } from '../../src/shared/transcript';

const meta = {
  title: 'Rick Astley - Never Gonna Give You Up',
  channel: 'RickAstleyVEVO',
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
};

function seg(startSec: number, text: string): TranscriptSegment {
  return { startSec, durationSec: 0, text };
}

describe('formatForClipboard', () => {
  it('renders header + timestamped lines', () => {
    const out = formatForClipboard(meta, [
      seg(0, "We're no strangers to love"),
      seg(5, 'You know the rules and so do I')
    ]);
    expect(out).toBe(
      '# Rick Astley - Never Gonna Give You Up\n' +
      '頻道: RickAstleyVEVO\n' +
      '網址: https://www.youtube.com/watch?v=dQw4w9WgXcQ\n' +
      '\n' +
      '[00:00:00] We\'re no strangers to love\n' +
      '[00:00:05] You know the rules and so do I'
    );
  });

  it('formats hour-plus timestamps', () => {
    const out = formatForClipboard(meta, [seg(3725, 'late segment')]);
    expect(out).toContain('[01:02:05] late segment');
  });

  it('handles empty segments by returning header only', () => {
    const out = formatForClipboard(meta, []);
    expect(out).toBe(
      '# Rick Astley - Never Gonna Give You Up\n' +
      '頻道: RickAstleyVEVO\n' +
      '網址: https://www.youtube.com/watch?v=dQw4w9WgXcQ\n'
    );
  });

  it('preserves special characters in title', () => {
    const out = formatForClipboard(
      { ...meta, title: 'Title with "quotes" & #hash' },
      [seg(0, 'hi')]
    );
    expect(out).toContain('# Title with "quotes" & #hash');
  });
});
