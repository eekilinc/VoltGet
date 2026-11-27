import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildChromiumOrigins,
  detectInstalledBrowsers,
  getNativeHostStatus,
  registerNativeMessagingHost,
} from './extensionInstaller.js';

const tmpDirs: string[] = [];

afterEach(() => {
  for (const d of tmpDirs.splice(0)) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {}
  }
});

describe('extensionInstaller', () => {
  it('detects installed Windows browsers from candidate paths', () => {
    const existing = new Set([
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
    ]);
    const browsers = detectInstalledBrowsers(
      {
        ProgramFiles: 'C:\\Program Files',
        'ProgramFiles(x86)': 'C:\\Program Files (x86)',
        LOCALAPPDATA: 'C:\\Users\\Test\\AppData\\Local',
      },
      p => existing.has(p)
    );
    expect(browsers.map(b => b.id)).toEqual(['chrome', 'firefox']);
    expect(browsers[0].extensionsUrl).toBe('chrome://extensions');
    expect(browsers[1].engine).toBe('firefox');
  });

  it('validates chromium extension IDs into chrome-extension origins', () => {
    const validId = 'a'.repeat(32);
    expect(buildChromiumOrigins([validId, 'invalid-id', ' '])).toEqual([
      `chrome-extension://${validId}/`,
    ]);
  });

  it('writes native messaging manifests, token file, and registers keys', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voltget-nm-test-'));
    tmpDirs.push(dir);
    const runner = vi.fn(() => true);
    const validId = 'b'.repeat(32);
    const token = 'f'.repeat(64);

    const res = registerNativeMessagingHost(
      {
        userDataDir: dir,
        appExePath: 'C:\\VoltGet\\VoltGet.exe',
        nmHostJsPath: 'C:\\VoltGet\\dist\\electron\\nm_host.js',
        token,
        chromiumExtensionIds: [validId],
      },
      runner
    );

    expect(res.success).toBe(true);
    expect(res.registeredBrowsers).toEqual(['Firefox', 'Chrome', 'Edge', 'Brave']);
    expect(runner).toHaveBeenCalledTimes(4);

    const status = getNativeHostStatus(dir);
    expect(status.installed).toBe(true);
    expect(status.chromiumOriginsCount).toBe(1);

    const savedToken = fs.readFileSync(
      path.join(dir, 'native-messaging', 'nm-pairing.token'),
      'utf8'
    );
    expect(savedToken).toBe(token);
  });
});
