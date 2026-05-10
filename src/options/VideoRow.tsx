// src/options/VideoRow.tsx
import type { Video } from '../shared/types';

export interface VideoRowProps { video: Video; onExport: (id: string) => void; onDelete: (id: string) => void; }

export function VideoRow({ video, onExport, onDelete }: VideoRowProps) {
  const exportedLabel = video.lastExportedAt
    ? (Date.parse(video.lastModifiedAt) > Date.parse(video.lastExportedAt) ? '有未匯出變更' : '已匯出')
    : '未匯出';
  return (
    <div class="vn-note" style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
      <div>
        <div style="font-weight:600;">{video.title}</div>
        <div style="color:var(--vn-fg-muted); font-size:12px;">
          {video.notes.length} 條筆記 · 編輯於 {video.lastModifiedAt.slice(0, 10)} · {exportedLabel}
        </div>
      </div>
      <div style="display:flex; gap:6px;">
        <button class="vn-btn-secondary" onClick={() => onExport(video.videoId)}>匯出</button>
        <button class="vn-btn-secondary" style="color:var(--vn-danger);" onClick={() => onDelete(video.videoId)}>刪除</button>
      </div>
    </div>
  );
}
