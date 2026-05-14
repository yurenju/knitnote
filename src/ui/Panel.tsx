// src/ui/Panel.tsx
import { useEffect, useState, useCallback, useRef } from 'preact/hooks';
import { EmptyState } from './EmptyState';
import { NoteList } from './NoteList';
import { NoteEditor } from './NoteEditor';
import type { Video, Note } from '../shared/types';
import { getVideo, upsertVideo } from '../shared/storage';
import { putScreenshot, deleteScreenshot } from '../content/idb-client';
import { noteId, shotId } from '../shared/uuid';
import { ensureTranscript } from '../content/transcript-trigger';

// 1×1 transparent PNG used when live screenshot capture fails.
const PLACEHOLDER_PNG_BYTES = Uint8Array.from(atob(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII='
), c => c.charCodeAt(0));
function PLACEHOLDER_PNG_BLOB(): Blob {
  return new Blob([PLACEHOLDER_PNG_BYTES], { type: 'image/png' });
}

export interface PanelDeps {
  videoId: string;
  getVideoMeta: () => { title: string; channel: string; url: string };
  getCurrentSec: () => number;
  /** Pause the video if it is playing. Returns true when a pause was actually applied. */
  pauseVideo: () => boolean;
  playVideo: () => void;
  seekVideo: (sec: number) => void;
  captureScreenshot: () => Promise<Blob>;
  copyTranscript: () => Promise<{ status: 'ok' | 'unavailable' | 'timeout' | 'error'; count?: number }>;
  onClose: () => void;
}

type Mode = { kind: 'list' } | { kind: 'new' } | { kind: 'edit'; id: string };

export function Panel({ videoId, getVideoMeta, getCurrentSec, pauseVideo, playVideo, seekVideo, captureScreenshot, copyTranscript, onClose }: PanelDeps) {
  const [video, setVideo] = useState<Video | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  // True when we paused the video on entering 'new' mode (so we resume
  // afterwards). False when the video was already paused — the user
  // intentionally paused it, leave it alone.
  const wasPlayingRef = useRef(false);

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

  type CopyState =
    | { kind: 'idle' }
    | { kind: 'copying' }
    | { kind: 'ok'; count: number }
    | { kind: 'unavailable' }
    | { kind: 'timeout' }
    | { kind: 'error' };

  const [copyState, setCopyState] = useState<CopyState>({ kind: 'idle' });
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const onCopyTranscript = async () => {
    if (copyState.kind === 'copying') return;
    setCopyState({ kind: 'copying' });
    const result = await copyTranscript();
    if (result.status === 'ok') {
      setCopyState({ kind: 'ok', count: result.count ?? 0 });
      scheduleResetCopyState(1500);
    } else {
      setCopyState({ kind: result.status });
      scheduleResetCopyState(2500);
    }
  };

  const scheduleResetCopyState = (ms: number) => {
    if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => {
      setCopyState({ kind: 'idle' });
      copyTimerRef.current = null;
    }, ms);
  };

  const copyButtonLabel = (() => {
    switch (copyState.kind) {
      case 'idle': return '📋';
      case 'copying': return '⏳';
      case 'ok': return `✓ 已複製 ${copyState.count} 段`;
      case 'unavailable': return '⚠️ 此影片無逐字稿';
      case 'timeout': return '⚠️ 載入逾時,請重試';
      case 'error': return '⚠️ 複製失敗';
    }
  })();

  const startNew = () => {
    wasPlayingRef.current = pauseVideo();
    setMode({ kind: 'new' });
  };

  const cancelNew = () => {
    if (wasPlayingRef.current) playVideo();
    wasPlayingRef.current = false;
    setMode({ kind: 'list' });
  };

  const saveNew = async (text: string, sec: number) => {
    // Optimistic UI: snap back to the list immediately so the user does
    // not wait for screenshot capture + IDB writes (~200–500ms). Add a
    // placeholder note so the list reflects the new entry instantly; we
    // swap in the real screenshotKey when persistence finishes.
    const wasPlaying = wasPlayingRef.current;
    wasPlayingRef.current = false;
    const meta = getVideoMeta();
    const now = new Date().toISOString();
    const noteIdValue = noteId();
    const tempNote: Note = {
      id: noteIdValue,
      timestampSec: sec,
      text,
      createdAt: now,
      updatedAt: now,
      screenshotKey: '__pending__'
    };
    const baseline = video;
    const optimistic: Video = baseline
      ? { ...baseline, lastModifiedAt: now, notes: [...baseline.notes, tempNote] }
      : { videoId, title: meta.title, channel: meta.channel, url: meta.url, firstNoteAt: now, lastModifiedAt: now, lastExportedAt: null, notes: [tempNote] };
    setVideo(optimistic);
    setMode({ kind: 'list' });

    try {
      let blob: Blob;
      try {
        blob = await captureScreenshot();
      } catch (err) {
        console.warn('[knitnote] screenshot failed, using placeholder:', err);
        blob = PLACEHOLDER_PNG_BLOB();
      }
      // Pixels are now locked into the canvas-derived Blob. Resume
      // playback (if we paused) before the slower persistence work runs.
      if (wasPlaying) playVideo();
      const sk = shotId();
      await putScreenshot(sk, blob);
      const finalNote: Note = { ...tempNote, screenshotKey: sk };
      // Re-read storage in case other tabs / the same tab raced.
      const fresh = await getVideo(videoId);
      const merged: Video = fresh
        ? { ...fresh, lastModifiedAt: now, notes: [...fresh.notes.filter(n => n.id !== noteIdValue), finalNote] }
        : { ...optimistic, notes: [finalNote] };
      await upsertVideo(merged);
      setVideo(merged);
      if (!fresh || fresh.notes.length === 0) {
        ensureTranscript(videoId);
      }
    } catch (err) {
      console.error('[knitnote] save failed, rolling back:', err);
      setVideo(baseline);
    }
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

  // Stop keyboard events from bubbling out of the panel into YouTube's
  // global hotkey handlers (t, k, f, j/l, space, etc.).
  const swallow = (e: Event) => e.stopPropagation();

  return (
    <div
      class="vn-panel"
      onKeyDown={swallow}
      onKeyUp={swallow}
      onKeyPress={swallow}
    >
      <div class="vn-panel-header">
        <strong>📝 {video && video.notes.length > 0 ? `${video.notes.length} 條筆記` : 'KnitNote'}</strong>
        <div class="vn-panel-header-actions">
          <button
            class="vn-btn-secondary vn-copy-transcript"
            onClick={onCopyTranscript}
            disabled={copyState.kind === 'copying'}
            title="複製逐字稿到剪貼簿"
          >
            {copyButtonLabel}
          </button>
          <button class="vn-btn-secondary" onClick={onClose}>✕</button>
        </div>
      </div>

      {mode.kind === 'new' && (
        <NoteEditor getCurrentSec={getCurrentSec} onSave={saveNew} onCancel={cancelNew} />
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
