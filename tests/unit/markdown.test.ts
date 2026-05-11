import { describe, it, expect } from 'vitest';
import { renderNoteMd } from '../../src/shared/markdown';
import type { Video } from '../../src/shared/types';

const video: Video = {
  videoId: 'abc123',
  title: 'How to learn',
  channel: 'Some Channel',
  url: 'https://www.youtube.com/watch?v=abc123',
  firstNoteAt: '2026-05-10T14:30:00+08:00',
  lastModifiedAt: '2026-05-10T15:12:00+08:00',
  lastExportedAt: null,
  notes: [
    {
      id: 'n1', timestampSec: 222, text: 'Active recall beats re-reading.',
      createdAt: '2026-05-10T14:30:00+08:00', updatedAt: '2026-05-10T14:30:00+08:00',
      screenshotKey: 'shot_1'
    },
    {
      id: 'n2', timestampSec: 725, text: 'Spacing matters.',
      createdAt: '2026-05-10T14:35:00+08:00', updatedAt: '2026-05-10T14:35:00+08:00',
      screenshotKey: 'shot_2'
    }
  ]
};

describe('renderNoteMd', () => {
  it('contains YAML frontmatter with required fields', () => {
    const md = renderNoteMd(video, '2026-05-10T15:30:00+08:00');
    expect(md).toMatch(/^---\n/);
    expect(md).toContain('title: How to learn');
    expect(md).toContain('videoId: abc123');
    expect(md).toContain('exportedAt: 2026-05-10T15:30:00+08:00');
    expect(md).toContain('noteCount: 2');
  });

  it('lists notes sorted by timestamp', () => {
    const out = renderNoteMd(video, '2026-05-10T15:30:00+08:00');
    expect(out.indexOf('00:03:42')).toBeLessThan(out.indexOf('00:12:05'));
  });

  it('embeds asset reference per note', () => {
    const out = renderNoteMd(video, '2026-05-10T15:30:00+08:00');
    expect(out).toContain('![](assets/00-03-42.png)');
    expect(out).toContain('![](assets/00-12-05.png)');
  });

  it('uses blockquote for note text', () => {
    const out = renderNoteMd(video, '2026-05-10T15:30:00+08:00');
    expect(out).toContain('> Active recall beats re-reading.');
  });

  it('links timestamp heading to YouTube with &t=Xs', () => {
    const out = renderNoteMd(video, '2026-05-10T15:30:00+08:00');
    expect(out).toContain('## [00:03:42](https://www.youtube.com/watch?v=abc123&t=222s)');
  });

  it('includes aliases with sanitized title for Obsidian', () => {
    const tricky = { ...video, title: 'Why "AI" is: hard?/painful' };
    const out = renderNoteMd(tricky, '2026-05-10T15:30:00+08:00');
    expect(out).toContain('aliases:\n  - Why -AI- is- hard--painful');
  });

  it('falls back to videoId in aliases when title sanitizes to empty', () => {
    const empty = { ...video, title: '   ' };
    const out = renderNoteMd(empty, '2026-05-10T15:30:00+08:00');
    expect(out).toContain('aliases:\n  - abc123');
  });

it('escapes YAML-unsafe title characters by quoting', () => {
    const tricky = { ...video, title: 'Title: with colon "quotes"' };
    const out = renderNoteMd(tricky, '2026-05-10T15:30:00+08:00');
    expect(out).toMatch(/title: ".*"/);
  });

  it('handles multi-line note text by indenting subsequent lines under blockquote', () => {
    const v2 = { ...video, notes: [{ ...video.notes[0], text: 'line one\nline two' }] };
    const out = renderNoteMd(v2, '2026-05-10T15:30:00+08:00');
    expect(out).toContain('> line one');
    expect(out).toContain('> line two');
  });
});
