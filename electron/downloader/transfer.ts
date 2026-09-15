import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

export class RangeResponseError extends Error {}

export function validateRange(
  status: number | undefined,
  header: string | undefined,
  start: number,
  end: number,
  total: number
): void {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(header || '');
  if (
    status !== 206 ||
    !match ||
    Number(match[1]) !== start ||
    Number(match[2]) !== end ||
    Number(match[3]) !== total
  ) {
    throw new RangeResponseError('Sunucu istenen dosya aralığını döndürmedi');
  }
}

/** Read at most one stream buffer at a time, respecting the destination's backpressure. */
export async function mergeParts(parts: string[], destination: string, signal: AbortSignal) {
  async function* chunks() {
    for (const part of parts) {
      signal.throwIfAborted();
      for await (const chunk of fs.createReadStream(part, { signal })) yield chunk;
    }
  }
  await pipeline(Readable.from(chunks()), fs.createWriteStream(destination), { signal });
}

/** A failed commit must leave the complete temporary file available for retry. */
export async function commitDownload(temporary: string, destination: string, expected?: number) {
  const size = (await fs.promises.stat(temporary)).size;
  if (expected !== undefined && size !== expected)
    throw new Error('İndirilen dosya boyutu uyuşmuyor');
  // Temporary files live on the destination volume. Do not copy over an existing file
  // after a failed rename: that could destroy it and falsely report success.
  await fs.promises.rename(temporary, destination);
  return size;
}

export function jobTempDir(outDir: string, id: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Geçersiz indirme kimliği');
  return path.join(outDir, `.tmp_${id}`);
}
