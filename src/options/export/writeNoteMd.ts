import type { Video } from '../../shared/types';
import type { TranscriptRecord } from '../../shared/transcript';
import { renderNoteMd, type RenderTranscriptOpts } from '../../shared/markdown';
import { getTranscript } from '../../shared/transcript-store';

export async function writeNoteMd(
  folder: FileSystemDirectoryHandle,
  video: Video,
  exportedAtIso: string,
  transcriptOpts: RenderTranscriptOpts
): Promise<void> {
  const tr = await getTranscript(video.videoId);
  const transcripts: Record<string, TranscriptRecord> = tr ? { [video.videoId]: tr } : {};
  const content = renderNoteMd(video, exportedAtIso, transcripts, transcriptOpts);
  const fh = await folder.getFileHandle('note.md', { create: true });
  const w = await (fh as any).createWritable();
  await w.write(content);
  await w.close();
}
