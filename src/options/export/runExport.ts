import { getVideo, upsertVideo } from '../../shared/storage';
import { sanitizeFilename } from '../../shared/sanitize';
import { writeNoteMd } from './writeNoteMd';
import { writeAssets } from './writeAssets';

export interface ExportResult { skipped: boolean; folderName?: string; }

function folderName(video: { firstNoteAt: string; title: string; videoId: string }): string {
  const date = video.firstNoteAt.slice(0, 10);
  const safe = sanitizeFilename(video.title, video.videoId);
  return `${date}_${safe}`;
}

export async function runExportForVideo(vault: FileSystemDirectoryHandle, videoId: string): Promise<ExportResult> {
  const video = await getVideo(videoId);
  if (!video) throw new Error('Video not found: ' + videoId);

  if (video.lastExportedAt && Date.parse(video.lastModifiedAt) <= Date.parse(video.lastExportedAt)) {
    return { skipped: true };
  }

  const fname = folderName(video);
  const folder = await vault.getDirectoryHandle(fname, { create: true });
  const now = new Date().toISOString();

  await writeNoteMd(folder, video, now);
  await writeAssets(folder, video.notes);

  await upsertVideo({ ...video, lastExportedAt: now });
  return { skipped: false, folderName: fname };
}

export async function runExportAll(vault: FileSystemDirectoryHandle, ids: string[], onProgress?: (i: number, total: number) => void): Promise<{ exported: number; skipped: number }> {
  let exported = 0, skipped = 0;
  for (let i = 0; i < ids.length; i++) {
    onProgress?.(i, ids.length);
    const r = await runExportForVideo(vault, ids[i]);
    if (r.skipped) skipped++; else exported++;
  }
  onProgress?.(ids.length, ids.length);
  return { exported, skipped };
}
