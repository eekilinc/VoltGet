import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createQueueStore } from './queueStore.js';

const dirs: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0)) await fs.promises.rm(dir, { recursive: true, force: true });
});
async function fixture() {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'voltget-queue-'));
  dirs.push(dir);
  const file = path.join(dir, 'queue.json');
  return { file, store: createQueueStore(file, vi.fn()) };
}
describe('queue persistence', () => {
  it('preserves a large queue across a restart and encrypts cookies', async () => {
    const { file, store } = await fixture();
    const jobs = Array.from({ length: 120 }, (_, i) => ({
      id: String(i),
      status: 'paused',
      opts: { cookie: 'secret-cookie' },
    }));
    store.save(jobs);
    await store.flush();
    expect(createQueueStore(file, vi.fn()).load()).toEqual(jobs);
    expect(await fs.promises.readFile(file, 'utf8')).not.toContain('secret-cookie');
  });
  it('coalesces progress snapshots and flushes the latest snapshot on shutdown', async () => {
    const { store } = await fixture();
    const write = vi.spyOn(fs.promises, 'writeFile');
    for (let i = 0; i < 100; i++) store.save([{ id: 'job', percent: i }]);
    await store.flush();
    expect(write).toHaveBeenCalledTimes(1);
    expect(store.load()).toEqual([{ id: 'job', percent: 99 }]);
  });
  it('recovers from a corrupt queue file with a backup instead of throwing', async () => {
    const { file, store } = await fixture();
    await fs.promises.writeFile(file, '{broken json', 'utf8');
    expect(store.load()).toEqual([]);
    const dir = await fs.promises.readdir(path.dirname(file));
    expect(dir.some(name => name.startsWith('queue.json.corrupt-'))).toBe(true);
  });
  it('keeps the old file on write failure and supports a later retry', async () => {
    const { store, file } = await fixture();
    store.save([{ id: 'old' }]);
    await store.flush();
    store.save([{ id: 'new' }]);
    vi.spyOn(fs.promises, 'rename').mockRejectedValueOnce(new Error('disk denied'));
    await expect(store.flush()).rejects.toThrow();
    expect(createQueueStore(file, vi.fn()).load()).toEqual([{ id: 'old' }]);
    await store.flush();
    expect(createQueueStore(file, vi.fn()).load()).toEqual([{ id: 'new' }]);
  });
});
