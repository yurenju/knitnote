import type { Note } from '../../shared/types';
import { formatDash } from '../../shared/timestamp';
import { getScreenshot } from '../../shared/idb';

export function assetNameFor(note: Note, indexAtSameSec: number): string {
  const base = formatDash(note.timestampSec);
  return indexAtSameSec === 0 ? `${base}.png` : `${base}-${indexAtSameSec + 1}.png`;
}

export function buildAssetPlan(notes: Note[]): Array<{ note: Note; filename: string }> {
  const sorted = [...notes].sort((a, b) => a.timestampSec - b.timestampSec || a.id.localeCompare(b.id));
  const counts = new Map<number, number>();
  return sorted.map(n => {
    const i = counts.get(n.timestampSec) ?? 0;
    counts.set(n.timestampSec, i + 1);
    return { note: n, filename: assetNameFor(n, i) };
  });
}

export async function writeAssets(folder: FileSystemDirectoryHandle, notes: Note[]): Promise<void> {
  const plan = buildAssetPlan(notes);
  const wanted = new Set(plan.map(p => p.filename));

  let assets: FileSystemDirectoryHandle;
  try {
    assets = await folder.getDirectoryHandle('assets', { create: true });
  } catch (e) {
    throw new Error('Cannot create assets/: ' + e);
  }

  const existing = new Set<string>();
  for await (const [name, handle] of (assets as any).entries()) {
    if (handle.kind === 'file') existing.add(name);
  }

  for (const { note, filename } of plan) {
    if (existing.has(filename)) continue;
    const blob = await getScreenshot(note.screenshotKey);
    if (!blob) continue;
    const fileHandle = await assets.getFileHandle(filename, { create: true });
    const w = await (fileHandle as any).createWritable();
    await w.write(blob);
    await w.close();
  }

  for (const name of existing) {
    if (!wanted.has(name)) {
      await (assets as any).removeEntry(name);
    }
  }
}
