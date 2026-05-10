export function formatColon(totalSec: number): string {
  const s = Math.floor(totalSec);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

export function formatDash(totalSec: number): string {
  return formatColon(totalSec).replace(/:/g, '-');
}
