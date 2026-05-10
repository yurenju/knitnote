// src/ui/NoteEditor.tsx
import { useEffect, useState, useRef } from 'preact/hooks';
import { formatColon } from '../shared/timestamp';

export interface NoteEditorProps {
  initialText?: string;
  getCurrentSec: () => number;
  onSave: (text: string, sec: number) => void;
  onCancel: () => void;
}

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform);
const SHORTCUT_LABEL = IS_MAC ? '⌘+Enter' : 'Ctrl+Enter';

export function NoteEditor({ initialText = '', getCurrentSec, onSave, onCancel }: NoteEditorProps) {
  const [text, setText] = useState(initialText);
  const [sec, setSec] = useState(getCurrentSec());
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    taRef.current?.focus();
    const id = setInterval(() => setSec(getCurrentSec()), 250);
    return () => clearInterval(id);
  }, []);

  const tryCommit = () => {
    if (text.trim()) onSave(text, getCurrentSec());
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      tryCommit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div class="vn-note" style="border:1px solid var(--vn-accent);">
      <div class="vn-note-ts">⏱ {formatColon(sec)} (目前位置)</div>
      <textarea
        ref={taRef}
        class="vn-input"
        value={text}
        onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
        onKeyDown={onKeyDown}
        placeholder="用自己的話寫下來…"
      />
      <div style="display:flex; gap:6px; justify-content:flex-end; align-items:center; margin-top:6px;">
        <span style="color:var(--vn-fg-muted); font-size:11px; margin-right:auto;">{SHORTCUT_LABEL} 儲存 · Esc 取消</span>
        <button class="vn-btn-secondary" onClick={onCancel}>取消</button>
        <button class="vn-btn-primary" onClick={tryCommit} disabled={!text.trim()}>Save</button>
      </div>
    </div>
  );
}
