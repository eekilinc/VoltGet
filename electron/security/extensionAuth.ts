import { randomBytes } from 'crypto';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { protectSecrets, revealSecrets } from './secrets.js';

let cached: string | undefined;
export function getExtensionToken(): string {
  if (cached) return cached;
  const file = path.join(app.getPath('userData'), 'extension-auth.json');
  if (fs.existsSync(file)) {
    try {
      const saved = revealSecrets(JSON.parse(fs.readFileSync(file, 'utf8'))) as { token: string };
      if (!saved || !/^[a-f0-9]{64}$/.test(saved.token))
        throw new Error('Geçersiz eklenti bağlantı anahtarı');
      cached = saved.token;
    } catch (e) {
      try {
        fs.copyFileSync(file, file + '.corrupt-' + Date.now());
      } catch {}
      console.error('[VoltGet] Bozuk eklenti anahtarı yenileniyor', e);
      cached = undefined;
    }
  }
  if (!cached) {
    cached = randomBytes(32).toString('hex');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(protectSecrets({ token: cached })), { mode: 0o600 });
  }
  return cached;
}
