import type { Video } from '../../shared/types';
import { renderNoteMd } from '../../shared/markdown';

export async function writeNoteMd(folder: FileSystemDirectoryHandle, video: Video, exportedAtIso: string): Promise<void> {
  const content = renderNoteMd(video, exportedAtIso);
  const fh = await folder.getFileHandle('note.md', { create: true });
  const w = await (fh as any).createWritable();
  await w.write(content);
  await w.close();
}
