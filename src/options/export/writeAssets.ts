import type { Note } from '../../shared/types';
import { formatDash } from '../../shared/timestamp';
import { getScreenshot } from '../../shared/idb';

export interface WriteAssetsOptions {
  /**
   * When true, every asset is rewritten even if a file of the same name
   * already exists. Use to repair a folder that contains stale or
   * placeholder PNGs from a previous export.
   */
  force?: boolean;
}

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

export async function writeAssets(
  folder: FileSystemDirectoryHandle,
  notes: Note[],
  options: WriteAssetsOptions = {}
): Promise<void> {
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
    if (!options.force && existing.has(filename)) continue;
    const blob = await getScreenshot(note.screenshotKey);
    if (!blob) continue;
    const fileHandle = await assets.getFileHandle(filename, { create: true });
    const w = await (fileHandle as any).createWritable();
    await w.write(blob);
    await w.close();
  }

  // Best-effort orphan cleanup. Cloud-sync clients (OneDrive/Dropbox/iCloud)
  // can transiently lock files and make removeEntry throw — log and keep
  // going so one stuck file does not abort the whole export.
  for (const name of existing) {
    if (wanted.has(name)) continue;
    try {
      await (assets as any).removeEntry(name);
    } catch (e) {
      console.warn(`[knitnote] could not remove orphan asset ${name}:`, e);
    }
  }
}
