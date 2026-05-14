import type { TranscriptSegment } from './transcript';
import { formatColon } from './timestamp';

export interface ClipboardMeta {
  title: string;
  channel: string;
  url: string;
}

export function formatForClipboard(meta: ClipboardMeta, segments: TranscriptSegment[]): string {
  const header = [
    `# ${meta.title}`,
    `頻道: ${meta.channel}`,
    `網址: ${meta.url}`
  ].join('\n');
  if (segments.length === 0) return header + '\n';
  const body = segments.map(s => `[${formatColon(s.startSec)}] ${s.text}`).join('\n');
  return header + '\n\n' + body;
}
