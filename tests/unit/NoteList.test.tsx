// @vitest-environment happy-dom
import '@testing-library/preact';
import { render, cleanup } from '@testing-library/preact';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { NoteList } from '../../src/ui/NoteList';
import type { Note } from '../../src/shared/types';

const n = (id: string, sec: number, text: string): Note => ({
  id, timestampSec: sec, text, createdAt: '', updatedAt: '', screenshotKey: 'k'
});

describe('NoteList', () => {
  afterEach(() => cleanup());

  it('renders notes sorted by timestamp', () => {
    render(<NoteList notes={[n('b', 200, 'B'), n('a', 100, 'A')]} onSeek={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);
    const tsTexts = Array.from(document.querySelectorAll('.vn-note-ts')).map(e => e.textContent);
    expect(tsTexts).toEqual(['⏱ 00:01:40', '⏱ 00:03:20']);
  });

  it('seek callback receives seconds', () => {
    const onSeek = vi.fn();
    render(<NoteList notes={[n('a', 222, 'x')]} onSeek={onSeek} onEdit={vi.fn()} onDelete={vi.fn()} />);
    (document.querySelector('.vn-note-ts') as HTMLElement).click();
    expect(onSeek).toHaveBeenCalledWith(222);
  });
});
