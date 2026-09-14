import { exec } from 'child_process';
import type { ChildProcess } from 'child_process';

/**
 * Süreci ve tüm alt süreçlerini (process tree) güvenli ve zorla sonlandırır.
 * Windows üzerinde `taskkill /pid <PID> /T /F` kullanır.
 * POSIX üzerinde SIGKILL sinyali gönderir.
 */
export function killProcessTree(proc?: ChildProcess | null): void {
  if (!proc) return;
  const pid = proc.pid;
  if (pid && process.platform === 'win32') {
    try {
      exec(`taskkill /pid ${pid} /T /F`, () => {});
    } catch {}
  }
  try {
    proc.kill('SIGKILL');
  } catch {}
}
