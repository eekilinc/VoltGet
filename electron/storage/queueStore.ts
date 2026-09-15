import fs from 'fs';
import path from 'path';
import { protectSecrets, revealSecrets } from '../security/secrets.js';

export interface StoredJob {
  id: string;
  status?: string;
  [key: string]: unknown;
}

/** Latest snapshot wins; writes are serialized and published with an atomic rename. */
export function createQueueStore(file: string, onError: (error: unknown) => void) {
  let snapshot: StoredJob[] | undefined;
  let revision = 0;
  let savedRevision = 0;
  let timer: NodeJS.Timeout | undefined;
  let writing: Promise<void> | undefined;
  function load(): StoredJob[] {
    if (!snapshot) {
      const raw = fs.existsSync(file)
        ? revealSecrets(JSON.parse(fs.readFileSync(file, 'utf8')))
        : [];
      snapshot = Array.isArray(raw) ? raw : [];
    }
    return structuredClone(snapshot);
  }
  async function flush(): Promise<void> {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (writing) {
      await writing;
      return flush();
    }
    if (savedRevision === revision) return;
    writing = (async () => {
      while (savedRevision !== revision) {
        const current = revision;
        const data = JSON.stringify(protectSecrets(snapshot), null, 2);
        await fs.promises.mkdir(path.dirname(file), { recursive: true });
        const temporary = file + '.tmp';
        await fs.promises.writeFile(temporary, data, { mode: 0o600 });
        await fs.promises.rename(temporary, file);
        savedRevision = current;
      }
    })();
    try {
      await writing;
    } finally {
      writing = undefined;
    }
  }
  function save(jobs: StoredJob[]) {
    const seen = new Set<string>();
    snapshot = structuredClone(
      jobs.filter(job => {
        if (!job?.id || seen.has(job.id)) return false;
        seen.add(job.id);
        return true;
      })
    );
    revision++;
    if (!timer) {
      timer = setTimeout(() => {
        void flush().catch(onError);
      }, 500);
      timer.unref();
    }
  }
  return { load, save, flush };
}
