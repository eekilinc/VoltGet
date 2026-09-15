import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { categorizeFile } from './categories.js';
import { createQueueStore } from './storage/queueStore.js';
import { ensureDir } from './utils/files.js';

import { defaultConfig, mergeWithDefaults, type AppConfig } from './config/schema.js';
import { protectSecrets, revealSecrets } from './security/secrets.js';
export { defaultConfig, type AppConfig } from './config/schema.js';

function writeJson(file: string, value: unknown): void {
  ensureDir(path.dirname(file));
  const temporary = file + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(protectSecrets(value), null, 2), { mode: 0o600 });
  fs.renameSync(temporary, file);
}

export function configPath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}
export function queuePath(): string {
  return path.join(app.getPath('userData'), 'queue.json');
}
export function historyPath(): string {
  return path.join(app.getPath('userData'), 'download_history.json');
}

export function loadConfig(): AppConfig {
  if (!fs.existsSync(configPath())) return { ...defaultConfig };
  const raw = JSON.parse(fs.readFileSync(configPath(), 'utf-8'));
  return mergeWithDefaults(revealSecrets(raw));
}

export function saveConfig(c: AppConfig): void {
  writeJson(configPath(), c);
}

let queueStore: ReturnType<typeof createQueueStore> | undefined;
function getQueueStore() {
  return (queueStore ??= createQueueStore(queuePath(), error =>
    console.error('[VoltGet] Queue save failed', error)
  ));
}
export function saveQueue(jobs: any[]): void {
  getQueueStore().save(Array.isArray(jobs) ? jobs : []);
}
export function loadQueue(): any[] {
  return getQueueStore().load();
}
export function flushQueue(): Promise<void> {
  return getQueueStore().flush();
}

/** Crash-safe queue recovery: interrupted 'downloading'/'queued' jobs -> 'paused' so UI can resume them. */
export function recoverInterruptedQueue(): any[] {
  const q = loadQueue();
  let changed = false;
  const seen = new Set<string>();
  const unique = (Array.isArray(q) ? q : []).filter((j: any) => {
    if (!j?.id || seen.has(j.id)) {
      changed = true;
      return false;
    }
    seen.add(j.id);
    return true;
  });
  const fixed = unique.map((j: any) => {
    if (j?.status === 'downloading' || j?.status === 'queued') {
      changed = true;
      return {
        ...j,
        status: 'paused',
        log:
          (j.log || '') +
          '\n[VoltGet] Uygulama yeniden başlatıldı, indirme duraklatıldı. Devam edebilirsiniz.',
      };
    }
    return j;
  });
  if (changed) saveQueue(fixed);
  return fixed;
}

export interface DownloadHistoryItem {
  id: string;
  url: string;
  title: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  date: number;
  category: string;
}

export function loadHistory(): DownloadHistoryItem[] {
  try {
    if (fs.existsSync(historyPath())) return JSON.parse(fs.readFileSync(historyPath(), 'utf-8'));
  } catch {}
  return [];
}

export function saveHistory(items: DownloadHistoryItem[]): void {
  try {
    ensureDir(path.dirname(historyPath()));
    writeJson(historyPath(), items.slice(0, 500));
  } catch (e) {
    console.error(e);
  }
}

export function addDownloadToHistory(
  item: Partial<DownloadHistoryItem> & { id: string; filePath: string }
): DownloadHistoryItem {
  const list = loadHistory();
  const fileName = item.fileName || path.basename(item.filePath);
  const category = item.category || categorizeFile(path.extname(item.filePath));
  let fileSize = item.fileSize || 0;
  if (!fileSize && fs.existsSync(item.filePath)) {
    try {
      fileSize = fs.statSync(item.filePath).size;
    } catch {}
  }
  const existingIdx = list.findIndex(
    x =>
      x.id === item.id || (x.filePath && x.filePath.toLowerCase() === item.filePath.toLowerCase())
  );
  const entry: DownloadHistoryItem = {
    id: item.id,
    url: item.url || '',
    title: item.title || fileName,
    fileName,
    filePath: item.filePath,
    fileSize,
    date: item.date || Date.now(),
    category,
  };
  if (existingIdx >= 0) list[existingIdx] = { ...list[existingIdx], ...entry };
  else list.unshift(entry);
  saveHistory(list);
  return entry;
}

export function removeDownloadFromHistory(idOrPath: string): DownloadHistoryItem[] {
  const list = loadHistory();
  const filtered = list.filter(x => x.id !== idOrPath && x.filePath !== idOrPath);
  saveHistory(filtered);
  return filtered;
}

export function syncHistoryFromQueue(): void {
  try {
    const q = loadQueue();
    const h = loadHistory();
    let changed = false;
    for (const job of q) {
      if (job.status === 'done') {
        const fp =
          job.filePath ||
          job.opts?.outPath ||
          (job.opts?.filename && job.opts?.outDir
            ? path.join(job.opts.outDir, job.opts.filename)
            : '');
        if (
          fp &&
          !h.some(
            x => x.id === job.id || (x.filePath && x.filePath.toLowerCase() === fp.toLowerCase())
          )
        ) {
          let sz = 0;
          if (fs.existsSync(fp)) {
            try {
              sz = fs.statSync(fp).size;
            } catch {}
          }
          const fn = job.opts?.filename || path.basename(fp);
          h.push({
            id: job.id,
            url: job.url || job.opts?.url || '',
            title: job.title || fn,
            fileName: fn,
            filePath: fp,
            fileSize: sz,
            date: Date.now(),
            category: categorizeFile(path.extname(fp)),
          });
          changed = true;
        }
      }
    }
    if (changed) saveHistory(h);
  } catch {}
}
