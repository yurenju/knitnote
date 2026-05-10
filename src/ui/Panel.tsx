// src/ui/Panel.tsx
import { useEffect, useState, useCallback } from 'preact/hooks';
import { EmptyState } from './EmptyState';
import { NoteList } from './NoteList';
import { NoteEditor } from './NoteEditor';
import type { Video, Note } from '../shared/types';
import { getVideo, upsertVideo } from '../shared/storage';
import { putScreenshot, deleteScreenshot } from '../shared/idb';
import { noteId, shotId } from '../shared/uuid';

export interface PanelDeps {
  videoId: string;
  getVideoMeta: () => { title: string; channel: string; url: string };
  getCurrentSec: () => number;
  pauseVideo: () => void;
  seekVideo: (sec: number) => void;
  captureScreenshot: () => Promise<Blob>;
  onClose: () => void;
}

type Mode = { kind: 'list' } | { kind: 'new' } | { kind: 'edit'; id: string };

export function Panel({ videoId, getVideoMeta, getCurrentSec, pauseVideo, seekVideo, captureScreenshot, onClose }: PanelDeps) {
  const [video, setVideo] = useState<Video | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: 'list' });

  const load = useCallback(async () => {
    const v = await getVideo(videoId);
    setVideo(v ?? null);
  }, [videoId]);

  useEffect(() => {
    load();
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes.videos) load();
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [load]);

  const startNew = () => {
    pauseVideo();
    setMode({ kind: 'new' });
  };

  const saveNew = async (text: string, sec: number) => {
    const meta = getVideoMeta();
    const blob = await captureScreenshot();
    const sk = shotId();
    await putScreenshot(sk, blob);
    const now = new Date().toISOString();
    const note: Note = { id: noteId(), timestampSec: sec, text, createdAt: now, updatedAt: now, screenshotKey: sk };
    const existing = await getVideo(videoId);
    const updated: Video = existing
      ? { ...existing, lastModifiedAt: now, notes: [...existing.notes, note] }
      : { videoId, title: meta.title, channel: meta.channel, url: meta.url, firstNoteAt: now, lastModifiedAt: now, lastExportedAt: null, notes: [note] };
    await upsertVideo(updated);
    setVideo(updated);
    setMode({ kind: 'list' });
  };

  const saveEdit = async (text: string) => {
    if (mode.kind !== 'edit') return;
    const v = await getVideo(videoId); if (!v) return;
    const now = new Date().toISOString();
    const updated: Video = {
      ...v,
      lastModifiedAt: now,
      notes: v.notes.map(n => n.id === mode.id ? { ...n, text, updatedAt: now } : n)
    };
    await upsertVideo(updated);
    setVideo(updated);
    setMode({ kind: 'list' });
  };

  const onDelete = async (id: string) => {
    if (!confirm('確定要刪除這條筆記？')) return;
    const v = await getVideo(videoId); if (!v) return;
    const target = v.notes.find(n => n.id === id);
    if (target) await deleteScreenshot(target.screenshotKey);
    const now = new Date().toISOString();
    const updated: Video = { ...v, lastModifiedAt: now, notes: v.notes.filter(n => n.id !== id) };
    await upsertVideo(updated);
    setVideo(updated);
  };

  return (
    <div class="vn-panel">
      <div class="vn-panel-header">
        <strong>📝 {video && video.notes.length > 0 ? `${video.notes.length} 條筆記` : 'Video Notes'}</strong>
        <button class="vn-btn-secondary" onClick={onClose}>✕</button>
      </div>

      {mode.kind === 'new' && (
        <NoteEditor getCurrentSec={getCurrentSec} onSave={saveNew} onCancel={() => setMode({ kind: 'list' })} />
      )}

      {mode.kind === 'edit' && video && (() => {
        const target = video.notes.find(n => n.id === mode.id);
        if (!target) return null;
        return <NoteEditor initialText={target.text} getCurrentSec={() => target.timestampSec} onSave={(t) => saveEdit(t)} onCancel={() => setMode({ kind: 'list' })} />;
      })()}

      {mode.kind === 'list' && (
        <>
          {(!video || video.notes.length === 0)
            ? <EmptyState onAdd={startNew} />
            : (
              <>
                <NoteList notes={video.notes} onSeek={seekVideo} onEdit={(id) => setMode({ kind: 'edit', id })} onDelete={onDelete} />
                <button class="vn-add" onClick={startNew}>＋ 新增筆記</button>
              </>
            )}
        </>
      )}
    </div>
  );
}
