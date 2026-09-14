import { session } from 'electron';
import { ProxyAgent } from 'proxy-agent';

export interface ProxyConfig {
  mode: 'system' | 'none' | 'manual' | 'pac';
  host: string;
  port: number;
  username: string;
  password: string;
  pacUrl: string;
  bypass: string;
}

export function proxyUrlOf(cfg: ProxyConfig): string | null {
  if (!cfg || cfg.mode !== 'manual' || !cfg.host) return null;
  const auth = cfg.username ? `${encodeURIComponent(cfg.username)}:${encodeURIComponent(cfg.password)}@` : '';
  return `http://${auth}${cfg.host}:${cfg.port || 8080}`;
}

/** yt-dlp dahil tüm alt süreçlerin okuduğu ortam değişkenlerini uygular. */
export function applyProxyEnv(cfg: ProxyConfig | undefined): void {
  try {
    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;
    delete process.env.http_proxy;
    delete process.env.https_proxy;
    if (!cfg || cfg.mode === 'none' || cfg.mode === 'system') return;
    if (cfg.mode === 'manual') {
      const url = proxyUrlOf(cfg);
      if (!url) return;
      process.env.HTTP_PROXY = url;
      process.env.HTTPS_PROXY = url;
      process.env.http_proxy = url;
      process.env.https_proxy = url;
      if (cfg.bypass) process.env.NO_PROXY = cfg.bypass;
    }
  } catch {}
}

/** Electron renderer istekleri için oturum proxy'si. */
export async function applySessionProxy(cfg: ProxyConfig | undefined): Promise<void> {
  try {
    const ses = session.defaultSession;
    if (!cfg || cfg.mode === 'system') {
      await ses.setProxy({ mode: 'system' } as any);
      return;
    }
    if (cfg.mode === 'none') {
      await ses.setProxy({ mode: 'direct' } as any);
      return;
    }
    if (cfg.mode === 'pac' && cfg.pacUrl) {
      await ses.setProxy({ mode: 'pac_script', pacScript: cfg.pacUrl } as any);
      return;
    }
    if (cfg.mode === 'manual' && cfg.host) {
      const rules = `http=${cfg.host}:${cfg.port || 8080};https=${cfg.host}:${cfg.port || 8080}`;
      await ses.setProxy({ mode: 'fixed_servers', proxyRules: rules, proxyBypassRules: cfg.bypass } as any);
      return;
    }
    await ses.setProxy({ mode: 'system' } as any);
  } catch {}
}

/** Node http/https istekleri için ajan (sistem modunda tanımsız döner). */
export function getProxyAgent(cfg: ProxyConfig | undefined): any | undefined {
  try {
    if (!cfg || cfg.mode === 'system' || cfg.mode === 'none') return undefined;
    if (cfg.mode === 'pac' && cfg.pacUrl) {
      const pac = cfg.pacUrl;
      return new ProxyAgent({ getProxyForUrl: () => `pac+${pac}` });
    }
    const url = proxyUrlOf(cfg);
    if (!url) return undefined;
    return new ProxyAgent({ getProxyForUrl: () => url });
  } catch {
    return undefined;
  }
}
