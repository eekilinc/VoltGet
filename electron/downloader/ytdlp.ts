import { spawn, ChildProcess } from 'child_process';
import path from 'path';

export function spawnYtDlp(ytdlp: string, args: string[]): ChildProcess {
  try {
    return spawn(ytdlp, args, { shell: false });
  } catch (err) {
    console.error('[VoltGet] spawn failed with primary ytdlp:', ytdlp, err);
    try {
      return spawn('yt-dlp', args, { shell: false });
    } catch (err2) {
      console.error('[VoltGet] spawn fallback also failed, trying shell:true:', err2);
      return spawn('yt-dlp', args, { shell: true });
    }
  }
}

export function extractDestinationFromOutput(text: string, outDir: string): string {
  const mDest = text.match(
    /\[(?:download|Merger|ExtractAudio)\]\s+(?:Destination:\s+|Merging formats into\s+["']?|)(.+?\.[a-zA-Z0-9]{2,5})(?:["']|\s*$)/m
  );
  if (!mDest?.[1]) return '';
  const cand = mDest[1].trim();
  return path.isAbsolute(cand) ? cand : path.join(outDir, cand);
}

export function buildOutputTemplate(
  opts: { filename?: string; title?: string },
  filenameTemplate: string
): { filename?: string; tmpl: string } {
  let filename = opts.filename;
  if (!filename && opts.title && opts.title !== 'Video' && opts.title !== 'Dosya') {
    const cleanTitle = opts.title.replace(/[\\/:*?"<>|]/g, '_').trim();
    if (cleanTitle) filename = `${cleanTitle}.%(ext)s`;
  }
  return { filename, tmpl: filename || filenameTemplate || '%(title)s.%(ext)s' };
}

export function appendFormatArgs(
  args: string[],
  opts: { asAudio?: boolean; formatId?: string; isAudioOnly?: boolean }
): void {
  if (opts.asAudio) {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
  } else if (opts.formatId && opts.formatId !== 'best' && opts.formatId !== 'direct') {
    const isAudio = opts.isAudioOnly || opts.formatId.includes('audio');
    if (isAudio) {
      args.push('-f', opts.formatId);
    } else if (opts.formatId.includes('+') || opts.formatId.includes('/')) {
      args.push('-f', opts.formatId);
    } else {
      args.push('-f', `${opts.formatId}+bestaudio/best`);
    }
    args.push('--merge-output-format', 'mp4');
  } else {
    args.push('-f', 'bv*+ba/b');
    args.push('--merge-output-format', 'mp4');
  }
}
