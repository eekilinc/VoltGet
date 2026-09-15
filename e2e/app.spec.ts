import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let application: ElectronApplication;
let page: Page;
let profile: string;
test.beforeEach(async () => {
  profile = await fs.mkdtemp(path.join(os.tmpdir(), 'voltget-e2e-'));
  application = await electron.launch({
    args: ['e2e/electron-fixture.cjs', '--in-process-gpu'],
    env: { ...process.env, VOLTGET_TEST_PROFILE: profile },
  });
  page = await application.firstWindow();
  await expect(page.getByText('Saved job 119', { exact: true })).toBeVisible();
});
test.afterEach(async () => {
  await application?.close();
  if (profile) await fs.rm(profile, { recursive: true, force: true });
});

test('loads all 120 saved jobs through the sandboxed typed bridge', async () => {
  expect(await page.evaluate(() => window.api.getQueue())).toHaveLength(120);
  expect(
    await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require)
  ).toBe('undefined');
  await expect(page.getByText('Electron dışında açıldı')).toHaveCount(0);
});

test('unsubscribing removes only its own callback', async () => {
  await page.evaluate(() => {
    const state = window as unknown as { progressCalls: number[]; disposeProgress: () => void };
    state.progressCalls = [0, 0];
    const disposeFirst = window.api.onProgress(() => state.progressCalls[0]++);
    state.disposeProgress = window.api.onProgress(() => state.progressCalls[1]++);
    disposeFirst();
  });
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.send('download-progress', {
      id: '0',
      percent: 10,
      speed: '1 MB/s',
      eta: '-',
      total: '10MB',
    })
  );
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { progressCalls: number[] }).progressCalls)
    )
    .toEqual([0, 1]);
});

test('OS-backed secret storage encrypts and decrypts without plaintext on disk', async () => {
  const result = await application.evaluate(() =>
    (
      globalThis as unknown as {
        testSecretStorage: () => Promise<{ serialized: string; restored: unknown }>;
      }
    ).testSecretStorage()
  );
  expect(result.serialized).not.toContain('integration-secret');
  expect(result.serialized).not.toContain('session=abc');
  expect(result.restored).toEqual({ password: 'integration-secret', cookie: 'session=abc' });
});
