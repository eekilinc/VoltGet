import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface InstalledBrowser {
  id: 'chrome' | 'edge' | 'brave' | 'opera' | 'vivaldi' | 'firefox';
  name: string;
  engine: 'chromium' | 'firefox';
  exePath: string;
  extensionsUrl: string;
}

export interface BrowserCandidate {
  id: InstalledBrowser['id'];
  name: string;
  engine: InstalledBrowser['engine'];
  extensionsUrl: string;
  paths: string[];
}

export function getWindowsBrowserCandidates(
  env: NodeJS.ProcessEnv = process.env
): BrowserCandidate[] {
  const pf = env['ProgramFiles'] || 'C:\\Program Files';
  const pf86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const localAppData = env['LOCALAPPDATA'] || '';

  return [
    {
      id: 'chrome',
      name: 'Google Chrome',
      engine: 'chromium',
      extensionsUrl: 'chrome://extensions',
      paths: [
        path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        localAppData
          ? path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe')
          : '',
      ].filter(Boolean),
    },
    {
      id: 'edge',
      name: 'Microsoft Edge',
      engine: 'chromium',
      extensionsUrl: 'edge://extensions',
      paths: [
        path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        localAppData
          ? path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
          : '',
      ].filter(Boolean),
    },
    {
      id: 'brave',
      name: 'Brave',
      engine: 'chromium',
      extensionsUrl: 'brave://extensions',
      paths: [
        path.join(pf, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
        path.join(pf86, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
        localAppData
          ? path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe')
          : '',
      ].filter(Boolean),
    },
    {
      id: 'opera',
      name: 'Opera',
      engine: 'chromium',
      extensionsUrl: 'opera://extensions',
      paths: [
        localAppData ? path.join(localAppData, 'Programs', 'Opera', 'opera.exe') : '',
        localAppData ? path.join(localAppData, 'Programs', 'Opera GX', 'opera.exe') : '',
        path.join(pf, 'Opera', 'opera.exe'),
      ].filter(Boolean),
    },
    {
      id: 'vivaldi',
      name: 'Vivaldi',
      engine: 'chromium',
      extensionsUrl: 'vivaldi://extensions',
      paths: [
        localAppData ? path.join(localAppData, 'Vivaldi', 'Application', 'vivaldi.exe') : '',
        path.join(pf, 'Vivaldi', 'Application', 'vivaldi.exe'),
      ].filter(Boolean),
    },
    {
      id: 'firefox',
      name: 'Mozilla Firefox',
      engine: 'firefox',
      extensionsUrl: 'about:debugging#/runtime/this-firefox',
      paths: [
        path.join(pf, 'Mozilla Firefox', 'firefox.exe'),
        path.join(pf86, 'Mozilla Firefox', 'firefox.exe'),
        localAppData ? path.join(localAppData, 'Mozilla Firefox', 'firefox.exe') : '',
      ].filter(Boolean),
    },
  ];
}

export function detectInstalledBrowsers(
  env: NodeJS.ProcessEnv = process.env,
  existsSync: (p: string) => boolean = fs.existsSync
): InstalledBrowser[] {
  const found: InstalledBrowser[] = [];
  for (const c of getWindowsBrowserCandidates(env)) {
    const exe = c.paths.find(p => existsSync(p));
    if (exe) {
      found.push({
        id: c.id,
        name: c.name,
        engine: c.engine,
        exePath: exe,
        extensionsUrl: c.extensionsUrl,
      });
    }
  }
  return found;
}

export function launchBrowserExtensionsPage(browser: InstalledBrowser): {
  success: boolean;
  error?: string;
} {
  try {
    const args =
      browser.engine === 'firefox' ? ['-new-tab', browser.extensionsUrl] : [browser.extensionsUrl];
    const child = spawn(browser.exePath, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.unref();
    return { success: true };
  } catch (e: any) {
    return { success: false, error: String(e?.message || e) };
  }
}

export interface RegisterNativeHostOptions {
  userDataDir: string;
  appExePath: string;
  nmHostJsPath: string;
  token: string;
  chromiumExtensionIds?: string[];
  firefoxExtensionId?: string;
}

export interface RegisterNativeHostResult {
  success: boolean;
  registeredBrowsers: string[];
  manifestDir: string;
  error?: string;
}

const CHROMIUM_REG_KEYS = [
  { name: 'Chrome', key: 'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.voltget.nm' },
  { name: 'Edge', key: 'HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.voltget.nm' },
  {
    name: 'Brave',
    key: 'HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\com.voltget.nm',
  },
];

const FIREFOX_REG_KEY = 'HKCU\\Software\\Mozilla\\NativeMessagingHosts\\com.voltget.nm';

export function buildChromiumOrigins(ids?: string[]): string[] {
  const cleaned = (ids || [])
    .map(id => id.trim().toLowerCase())
    .filter(id => /^[a-p]{32}$/.test(id));
  return cleaned.map(id => `chrome-extension://${id}/`);
}

export function registerNativeMessagingHost(
  opts: RegisterNativeHostOptions,
  runner: (key: string, value: string) => boolean = defaultWinRegSet
): RegisterNativeHostResult {
  const manifestDir = path.join(opts.userDataDir, 'native-messaging');
  try {
    fs.mkdirSync(manifestDir, { recursive: true });

    // Write user-only pairing token file for the native host helper
    const tokenFile = path.join(manifestDir, 'nm-pairing.token');
    fs.writeFileSync(tokenFile, opts.token, { encoding: 'utf8', mode: 0o600 });

    // Write launcher .cmd that runs Electron binary in Node mode (no external Node required!)
    const launcherPath = path.join(manifestDir, 'voltget-nm.cmd');
    const cmdContent = [
      '@echo off',
      'set ELECTRON_RUN_AS_NODE=1',
      `set VOLTGET_APP_EXE=${opts.appExePath}`,
      `set VOLTGET_TOKEN_FILE=${tokenFile}`,
      `"${opts.appExePath}" "${opts.nmHostJsPath}" --native-msg`,
      '',
    ].join('\r\n');
    fs.writeFileSync(launcherPath, cmdContent, 'utf8');

    const registeredBrowsers: string[] = [];

    // Firefox manifest (always has stable gecko ID)
    const firefoxManifestPath = path.join(manifestDir, 'com.voltget.nm.firefox.json');
    const firefoxManifest = {
      name: 'com.voltget.nm',
      description: 'VoltGet Native Messaging Bridge',
      path: launcherPath,
      type: 'stdio',
      allowed_extensions: [opts.firefoxExtensionId || 'voltget-sniffer@voltget.com'],
    };
    fs.writeFileSync(firefoxManifestPath, JSON.stringify(firefoxManifest, null, 2), 'utf8');
    if (runner(FIREFOX_REG_KEY, firefoxManifestPath)) {
      registeredBrowsers.push('Firefox');
    }

    // Chromium manifest (Chrome, Edge, Brave)
    const origins = buildChromiumOrigins(opts.chromiumExtensionIds);
    const chromeManifestPath = path.join(manifestDir, 'com.voltget.nm.chrome.json');
    const chromeManifest = {
      name: 'com.voltget.nm',
      description: 'VoltGet Native Messaging Bridge',
      path: launcherPath,
      type: 'stdio',
      allowed_origins: origins,
    };
    fs.writeFileSync(chromeManifestPath, JSON.stringify(chromeManifest, null, 2), 'utf8');

    if (origins.length > 0) {
      for (const target of CHROMIUM_REG_KEYS) {
        if (runner(target.key, chromeManifestPath)) {
          registeredBrowsers.push(target.name);
        }
      }
    }

    return {
      success: true,
      registeredBrowsers,
      manifestDir,
    };
  } catch (e: any) {
    return {
      success: false,
      registeredBrowsers: [],
      manifestDir,
      error: String(e?.message || e),
    };
  }
}

export function syncNativeHostToken(userDataDir: string, token: string): void {
  try {
    const manifestDir = path.join(userDataDir, 'native-messaging');
    const tokenFile = path.join(manifestDir, 'nm-pairing.token');
    if (fs.existsSync(manifestDir)) {
      fs.writeFileSync(tokenFile, token, { encoding: 'utf8', mode: 0o600 });
    }
  } catch {}
}

export function getNativeHostStatus(userDataDir: string): {
  installed: boolean;
  manifestDir: string;
  chromiumOriginsCount: number;
} {
  const manifestDir = path.join(userDataDir, 'native-messaging');
  const launcherPath = path.join(manifestDir, 'voltget-nm.cmd');
  const chromeManifestPath = path.join(manifestDir, 'com.voltget.nm.chrome.json');
  let chromiumOriginsCount = 0;
  try {
    if (fs.existsSync(chromeManifestPath)) {
      const parsed = JSON.parse(fs.readFileSync(chromeManifestPath, 'utf8'));
      if (Array.isArray(parsed.allowed_origins)) {
        chromiumOriginsCount = parsed.allowed_origins.length;
      }
    }
  } catch {}
  return {
    installed: fs.existsSync(launcherPath),
    manifestDir,
    chromiumOriginsCount,
  };
}

function defaultWinRegSet(regKey: string, value: string): boolean {
  if (process.platform !== 'win32') return false;
  try {
    const res = spawnSync('reg.exe', ['add', regKey, '/ve', '/t', 'REG_SZ', '/d', value, '/f'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    return res.status === 0;
  } catch {
    return false;
  }
}
