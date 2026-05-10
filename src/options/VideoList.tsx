// src/options/VideoList.tsx
import { useEffect, useState } from 'preact/hooks';
import { getAllVideos, deleteVideo } from '../shared/storage';
import { deleteScreenshot } from '../shared/idb';
import { VideoRow } from './VideoRow';
import { runExportForVideo, runExportAll } from './export/runExport';
import { ensureVault } from './export/ensureVault';
import type { Video } from '../shared/types';

export function VideoList() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const reload = async () => {
    const all = await getAllVideos();
    setVideos(Object.values(all).sort((a, b) => b.lastModifiedAt.localeCompare(a.lastModifiedAt)));
  };
  useEffect(() => { reload(); }, []);

  const exportOne = async (id: string) => {
    setBusy(true); setMsg(null);
    try {
      const vault = await ensureVault();
      const r = await runExportForVideo(vault, id);
      setMsg(r.skipped ? '已是最新，無需匯出' : '匯出完成：' + r.folderName);
      await reload();
    } catch (e) {
      setMsg('匯出失敗：' + (e as Error).message);
    } finally { setBusy(false); }
  };

  const exportAll = async (force = false) => {
    setBusy(true); setMsg(null);
    try {
      const vault = await ensureVault();
      const ids = videos.map(v => v.videoId);
      const r = await runExportAll(
        vault,
        ids,
        (i, total) => setMsg(`進行中 ${i}/${total}`),
        { force }
      );
      setMsg(`完成：匯出 ${r.exported}，跳過 ${r.skipped}`);
      await reload();
    } catch (e) {
      setMsg('匯出失敗：' + (e as Error).message);
    } finally { setBusy(false); }
  };

  const onDelete = async (id: string) => {
    if (!confirm('刪除這支影片的所有筆記？此操作不會動 vault 內已匯出的資料夾。')) return;
    const v = videos.find(x => x.videoId === id);
    if (v) {
      for (const n of v.notes) await deleteScreenshot(n.screenshotKey);
    }
    await deleteVideo(id);
    await reload();
  };

  return (
    <section>
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
        <h3>已筆記的影片 ({videos.length})</h3>
        <div style="display:flex; gap:6px;">
          <button class="vn-btn-secondary" disabled={busy || videos.length === 0} onClick={() => exportAll(true)} title="忽略上次匯出時間，重寫所有 note.md 與 assets">強制重新匯出全部</button>
          <button class="vn-btn-primary" disabled={busy || videos.length === 0} onClick={() => exportAll(false)}>匯出全部</button>
        </div>
      </div>
      {msg && <div style="margin: 8px 0; color: var(--vn-fg-muted);">{msg}</div>}
      {videos.length === 0
        ? <div style="color:var(--vn-fg-muted);">還沒有任何筆記。</div>
        : videos.map(v => <VideoRow key={v.videoId} video={v} onExport={exportOne} onDelete={onDelete} />)}
    </section>
  );
}
