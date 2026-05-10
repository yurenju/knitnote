import type { Video, Note } from './types';
import { formatColon, formatDash } from './timestamp';

function yamlValue(v: string): string {
  if (/[":#\n]/.test(v)) return '"' + v.replace(/"/g, '\\"') + '"';
  return v;
}

function blockquote(text: string): string {
  return text.split('\n').map(l => '> ' + l).join('\n');
}

export function renderNoteMd(video: Video, exportedAtIso: string): string {
  const sorted: Note[] = [...video.notes].sort((a, b) => a.timestampSec - b.timestampSec);
  const lines: string[] = [];
  lines.push('---');
  lines.push('title: ' + yamlValue(video.title));
  lines.push('url: ' + video.url);
  lines.push('channel: ' + yamlValue(video.channel));
  lines.push('videoId: ' + video.videoId);
  lines.push('firstNoteAt: ' + video.firstNoteAt);
  lines.push('exportedAt: ' + exportedAtIso);
  lines.push('noteCount: ' + sorted.length);
  lines.push('---');
  lines.push('');
  lines.push('# ' + video.title);
  lines.push('');
  lines.push('來源：[YouTube](' + video.url + ')');
  lines.push('頻道：' + video.channel);
  lines.push('');
  for (const n of sorted) {
    const ts = formatColon(n.timestampSec);
    const tsDash = formatDash(n.timestampSec);
    lines.push('---');
    lines.push('');
    lines.push(`## [${ts}](${video.url}&t=${Math.floor(n.timestampSec)}s)`);
    lines.push('');
    lines.push(`![](assets/${tsDash}.png)`);
    lines.push('');
    lines.push(blockquote(n.text));
    lines.push('');
  }
  return lines.join('\n');
}
