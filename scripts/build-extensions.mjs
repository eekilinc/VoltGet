/* global process, console */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

function packDir(srcDir, destFile) {
  if (fs.existsSync(destFile)) fs.unlinkSync(destFile);
  if (process.platform === 'win32') {
    const q = s => `"${s.replace(/"/g, '""')}"`;
    const res = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Compress-Archive -Path ${q(path.join(srcDir, '*'))} -DestinationPath ${q(destFile)} -Force`,
      ],
      { stdio: 'inherit' }
    );
    if (res.status !== 0) throw new Error(`Failed to pack ${destFile}`);
  } else {
    const res = spawnSync('zip', ['-r', destFile, '.'], { cwd: srcDir, stdio: 'inherit' });
    if (res.status !== 0) throw new Error(`Failed to pack ${destFile}`);
  }
}

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version || '1.2.4';

const chromeDir = path.join(root, 'extension');
const firefoxDir = path.join(root, 'extension-firefox');

fs.mkdirSync(firefoxDir, { recursive: true });

// 1. Sync version in Chrome/Edge MV3 manifest
const chromeManifestPath = path.join(chromeDir, 'manifest.json');
const chromeManifest = JSON.parse(fs.readFileSync(chromeManifestPath, 'utf8'));
if (chromeManifest.version !== version) {
  chromeManifest.version = version;
  fs.writeFileSync(chromeManifestPath, JSON.stringify(chromeManifest, null, 2) + '\n', 'utf8');
}

// 2. Copy shared Pro extension source files from extension/ -> extension-firefox/
const sharedFiles = [
  'background.js',
  'content.js',
  'popup.html',
  'popup.js',
  'icon-16.png',
  'icon-32.png',
  'icon-48.png',
  'icon-128.png',
  'icon.png',
];

for (const file of sharedFiles) {
  const src = path.join(chromeDir, file);
  const dst = path.join(firefoxDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
  }
}

// 3. Generate synchronized Firefox MV3 manifest (uses background.scripts + gecko ID + nativeMessaging)
const firefoxManifest = {
  manifest_version: 3,
  name: chromeManifest.name,
  short_name: chromeManifest.short_name || 'VoltGet',
  version,
  description: chromeManifest.description,
  permissions: [
    'webRequest',
    'storage',
    'tabs',
    'scripting',
    'cookies',
    'downloads',
    'contextMenus',
    'nativeMessaging',
    'alarms',
  ],
  host_permissions: ['<all_urls>'],
  background: {
    scripts: ['background.js'],
  },
  content_scripts: chromeManifest.content_scripts,
  action: chromeManifest.action,
  icons: chromeManifest.icons,
  browser_specific_settings: {
    gecko: {
      id: 'voltget-sniffer@voltget.com',
      strict_min_version: '109.0',
    },
  },
};

fs.writeFileSync(
  path.join(firefoxDir, 'manifest.json'),
  JSON.stringify(firefoxManifest, null, 2) + '\n',
  'utf8'
);

console.log(`[build-extensions] Synced Chrome & Firefox MV3 extensions (v${version})`);

// 4. Optional packaging for GitHub Releases / Store uploads (--pack)
if (process.argv.includes('--pack')) {
  const outDir = path.join(root, 'release');
  fs.mkdirSync(outDir, { recursive: true });

  const chromeZip = path.join(outDir, `voltget-chrome-extension-v${version}.zip`);
  const firefoxZip = path.join(outDir, `voltget-firefox-extension-v${version}.zip`);
  const firefoxXpi = path.join(outDir, `voltget-firefox-extension-v${version}.xpi`);

  packDir(chromeDir, chromeZip);
  packDir(firefoxDir, firefoxZip);
  fs.copyFileSync(firefoxZip, firefoxXpi);
  console.log(`[build-extensions] Packed release archives into ${outDir}`);
}
