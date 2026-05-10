// src/ui/NoteCard.tsx
import type { Note } from '../shared/types';
import { formatColon } from '../shared/timestamp';

export interface NoteCardProps {
  note: Note;
  onSeek: (sec: number) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function NoteCard({ note, onSeek, onEdit, onDelete }: NoteCardProps) {
  return (
    <div class="vn-note">
      <div class="vn-note-ts" onClick={() => onSeek(note.timestampSec)}>⏱ {formatColon(note.timestampSec)}</div>
      <div class="vn-note-text">{note.text}</div>
      <div class="vn-note-actions">
        <button class="vn-btn-secondary" onClick={() => onEdit(note.id)}>編輯</button>
        <button class="vn-btn-secondary" onClick={() => onDelete(note.id)}>刪除</button>
      </div>
    </div>
  );
}
