// src/ui/NoteList.tsx
import type { Note } from '../shared/types';
import { NoteCard } from './NoteCard';

export interface NoteListProps {
  notes: Note[];
  onSeek: (sec: number) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function NoteList({ notes, onSeek, onEdit, onDelete }: NoteListProps) {
  const sorted = [...notes].sort((a, b) => a.timestampSec - b.timestampSec);
  return (
    <div>
      {sorted.map(n => (
        <NoteCard key={n.id} note={n} onSeek={onSeek} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </div>
  );
}
