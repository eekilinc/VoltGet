import fs from 'fs';
import path from 'path';

export type ConflictAction = 'ask' | 'resume' | 'overwrite' | 'rename' | 'skip';
export type ConflictDecision = 'resume' | 'overwrite' | 'rename' | 'skip';

export interface ConflictInfo {
  conflictId: string;
  fileName: string;
  outPath: string;
  existingSize: number;
}

/** name.ext -> name (1).ext, artarak boş isim bulur */
export function autoRename(outPath: string): string {
  if (!fs.existsSync(outPath)) return outPath;
  const dir = path.dirname(outPath);
  const ext = path.extname(outPath);
  const base = path.basename(outPath, ext);
  let i = 1;
  let candidate = path.join(dir, `${base} (${i})${ext}`);
  while (fs.existsSync(candidate) && i < 10000) {
    i++;
    candidate = path.join(dir, `${base} (${i})${ext}`);
  }
  return candidate;
}

export function existingSizeOf(outPath: string): number {
  try {
    if (fs.existsSync(outPath)) return fs.statSync(outPath).size;
  } catch {}
  return 0;
}

export interface ConflictManagerDeps {
  send: (channel: string, data: any) => void;
  getPolicy: () => ConflictAction;
  onRememberChoice: (decision: ConflictDecision) => void;
  askTimeoutMs?: number;
}

export function createConflictManager(deps: ConflictManagerDeps) {
  const pendingAsync = new Map<
    string,
    {
      info: ConflictInfo;
      resolve: (r: { proceed: boolean; finalPath: string }) => void;
      timer: NodeJS.Timeout;
    }
  >();
  let seq = 0;

  /**
   * Async sürüm: ask politikasında kullanıcı kararını bekler.
   * runMultiPartHttpDownload gibi async akışlar içindir.
   */
  function resolveConflictPath(outPath: string): Promise<{ proceed: boolean; finalPath: string }> {
    if (!fs.existsSync(outPath)) {
      return Promise.resolve({ proceed: true, finalPath: outPath });
    }
    const policy = deps.getPolicy();
    if (policy === 'skip') return Promise.resolve({ proceed: false, finalPath: outPath });
    if (policy === 'rename') {
      return Promise.resolve({ proceed: true, finalPath: autoRename(outPath) });
    }
    if (policy === 'resume' || policy === 'overwrite') {
      return Promise.resolve({ proceed: true, finalPath: outPath });
    }
    // ask
    seq++;
    const conflictId = `cf_${Date.now().toString(36)}_${seq}`;
    const info: ConflictInfo = {
      conflictId,
      fileName: path.basename(outPath),
      outPath,
      existingSize: existingSizeOf(outPath),
    };
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        pendingAsync.delete(conflictId);
        resolve({ proceed: true, finalPath: autoRename(outPath) });
      }, deps.askTimeoutMs ?? 120000);
      (timer as any).unref?.();
      pendingAsync.set(conflictId, { info, resolve, timer });
      deps.send('file-conflict-request', info);
    });
  }

  function resolveAsyncConflict(
    conflictId: string,
    decision: ConflictDecision,
    remember: boolean
  ): boolean {
    const p = pendingAsync.get(conflictId);
    if (!p) return false;
    clearTimeout(p.timer);
    pendingAsync.delete(conflictId);
    if (remember) {
      try {
        deps.onRememberChoice(decision);
      } catch {}
    }
    const finalPath = decision === 'rename' ? autoRename(p.info.outPath) : p.info.outPath;
    p.resolve({ proceed: decision !== 'skip', finalPath });
    return true;
  }

  function resolveConflictDecision(
    conflictId: string,
    decision: ConflictDecision,
    remember: boolean
  ): boolean {
    return resolveAsyncConflict(conflictId, decision, remember);
  }

  return { resolveConflictPath, resolveConflictDecision };
}

export type ConflictManager = ReturnType<typeof createConflictManager>;
