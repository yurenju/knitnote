// src/ui/NoteEditor.tsx
import { useEffect, useState, useRef } from 'preact/hooks';
import { formatColon } from '../shared/timestamp';

export interface NoteEditorProps {
  initialText?: string;
  getCurrentSec: () => number;
  onSave: (text: string, sec: number) => void;
  onCancel: () => void;
}

export function NoteEditor({ initialText = '', getCurrentSec, onSave, onCancel }: NoteEditorProps) {
  const [text, setText] = useState(initialText);
  const [sec, setSec] = useState(getCurrentSec());
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    taRef.current?.focus();
    const id = setInterval(() => setSec(getCurrentSec()), 250);
    return () => clearInterval(id);
  }, []);

  return (
    <div class="vn-note" style="border:1px solid var(--vn-accent);">
      <div class="vn-note-ts">⏱ {formatColon(sec)} (目前位置)</div>
      <textarea ref={taRef} class="vn-input" value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} placeholder="用自己的話寫下來…" />
      <div style="display:flex; gap:6px; justify-content:flex-end; margin-top:6px;">
        <button class="vn-btn-secondary" onClick={onCancel}>取消</button>
        <button class="vn-btn-primary" onClick={() => onSave(text, getCurrentSec())} disabled={!text.trim()}>Save</button>
      </div>
    </div>
  );
}
