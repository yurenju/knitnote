import type { Video, Note } from './types';
import type { TranscriptRecord } from './transcript';
import { sliceWindow } from './transcript';
import { formatColon, formatDash } from './timestamp';

function yamlValue(v: string): string {
  if (/[":#\n]/.test(v)) return '"' + v.replace(/"/g, '\\"') + '"';
  return v;
}

function blockquote(text: string): string {
  return text.split('\n').map(l => '> ' + l).join('\n');
}


export interface RenderTranscriptOpts {
  beforeSec: number;
  afterSec: number;
}

export function renderNoteMd(
  video: Video,
  exportedAtIso: string,
  transcripts: Record<string, TranscriptRecord> = {},
  transcriptOpts: RenderTranscriptOpts = { beforeSec: 20, afterSec: 20 }
): string {
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

  const tr = transcripts[video.videoId];
  for (const n of sorted) {
    const ts = formatColon(n.timestampSec);
    const tsDash = formatDash(n.timestampSec);
    lines.push('---');
    lines.push('');
    lines.push(`## [${ts}](${video.url}&t=${Math.floor(n.timestampSec)}s)`);
    lines.push('');
    lines.push(`![](assets/${tsDash}.png)`);
    lines.push('');

    const detailsBlock = renderTranscriptDetails(tr, n.timestampSec, transcriptOpts);
    if (detailsBlock) {
      lines.push(detailsBlock);
      lines.push('');
    }

    lines.push(blockquote(n.text));
    lines.push('');
  }
  return lines.join('\n');
}

function renderTranscriptDetails(
  tr: TranscriptRecord | undefined,
  centerSec: number,
  opts: RenderTranscriptOpts
): string | null {
  if (!tr || tr.status !== 'ok' || tr.segments.length === 0) return null;
  const sliced = sliceWindow(tr.segments, centerSec, opts.beforeSec, opts.afterSec);
  if (sliced.segments.length === 0 || sliced.alignedStartSec === null || sliced.alignedEndSec === null) {
    return null;
  }
  const lang = tr.translationLanguage ?? tr.languageCode;
  const start = formatColon(sliced.alignedStartSec);
  const end = formatColon(sliced.alignedEndSec);
  const body = sliced.segments.map(s => s.text).join(' ').trim();
  return [
    `> [!quote]- 逐字稿 ${start} – ${end}（${lang}）`,
    blockquote(body)
  ].join('\n');
}
