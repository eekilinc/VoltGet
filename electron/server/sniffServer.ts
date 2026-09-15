import { timingSafeEqual } from 'crypto';
import http from 'http';
import { WebSocketServer } from 'ws';
import { z } from 'zod';

const maxPayload = 256 * 1024;
const httpUrl = z
  .string()
  .max(16384)
  .refine(value => {
    try {
      return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  });
export const SniffPayloadSchema = z
  .object({
    url: httpUrl,
    pageUrl: z.union([httpUrl, z.literal('')]).optional(),
    title: z.string().max(4096).optional(),
    filename: z.string().max(1024).optional(),
    cookie: z.string().max(65536).optional(),
    type: z.string().max(128).optional(),
    userInitiated: z.boolean().optional(),
    isGenericDownload: z.boolean().optional(),
    showDialog: z.boolean().optional(),
    asAudio: z.boolean().optional(),
  })
  .passthrough();

export interface SniffServerDeps {
  handleIncomingSniff: (data: z.infer<typeof SniffPayloadSchema>) => Promise<void>;
  getMainWindow: () => {
    isDestroyed: () => boolean;
    webContents: { send: (channel: string, data: unknown) => void };
  } | null;
  getToken: () => string;
  port?: number;
}

export function allowedOrigin(origin: string | undefined): boolean {
  return (
    origin === undefined ||
    /^(chrome-extension:\/\/[a-p]{32}|moz-extension:\/\/[a-zA-Z0-9-]+)$/.test(origin)
  );
}

export function createSniffServer(deps: SniffServerDeps) {
  let server: http.Server | null = null;
  let wss: WebSocketServer | null = null;
  let lastActivity = 0;
  let windowStart = Date.now();
  let messageCount = 0;
  function withinRateLimit() {
    if (Date.now() - windowStart >= 1000) {
      windowStart = Date.now();
      messageCount = 0;
    }
    return ++messageCount <= 100;
  }
  function authorized(token: string | undefined) {
    const expected = Buffer.from(deps.getToken());
    const actual = Buffer.from(token || '');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
  function getExtensionConnectedCount() {
    return [...(wss?.clients || [])].filter(client => client.readyState === 1).length;
  }
  function broadcastExtensionStatus() {
    const count = getExtensionConnectedCount();
    const w = deps.getMainWindow();
    if (w && !w.isDestroyed())
      w.webContents.send('extension-status-changed', { connected: count > 0, count });
  }
  function startSniffServer() {
    if (server) return;
    server = http.createServer((req, res) => {
      if (!allowedOrigin(req.headers.origin)) {
        res.writeHead(403).end();
        return;
      }
      if (req.headers.origin) {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        res.setHeader('Vary', 'Origin');
      }
      if (req.method === 'OPTIONS') {
        res
          .writeHead(204, {
            'Access-Control-Allow-Methods': 'GET, POST',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          })
          .end();
        return;
      }
      if (!authorized(req.headers.authorization?.replace(/^Bearer /, ''))) {
        res.writeHead(401).end();
        return;
      }
      if (!withinRateLimit()) {
        res.writeHead(429).end();
        return;
      }
      if (req.method === 'GET' && req.url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(
          JSON.stringify({
            ok: true,
            app: 'VoltGet',
            extensionConnected: getExtensionConnectedCount() > 0,
          })
        );
        return;
      }
      if (req.method !== 'POST' || req.url !== '/sniff') {
        res.writeHead(404).end();
        return;
      }
      let bytes = 0;
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > maxPayload) {
          if (!res.writableEnded) res.writeHead(413).end();
          chunks.length = 0;
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (res.writableEnded) return;
        void (async () => {
          const payload = SniffPayloadSchema.safeParse(
            JSON.parse(Buffer.concat(chunks).toString())
          );
          if (!payload.success) {
            res.writeHead(400).end('Invalid payload');
            return;
          }
          lastActivity = Date.now();
          await deps.handleIncomingSniff(payload.data);
          res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
        })().catch(() => {
          if (!res.writableEnded) res.writeHead(400).end('Invalid request');
        });
      });
      req.on('error', () => {
        if (!res.writableEnded) res.writeHead(400).end();
      });
    });
    server.requestTimeout = 10000;
    server.headersTimeout = 10000;
    wss = new WebSocketServer({ noServer: true, maxPayload, handleProtocols: () => 'voltget' });
    server.on('upgrade', (req, socket, head) => {
      const protocols = (req.headers['sec-websocket-protocol'] || '')
        .split(',')
        .map(value => value.trim());
      const token = protocols.find(value => value.startsWith('token.'))?.slice(6);
      if (
        !allowedOrigin(req.headers.origin) ||
        !protocols.includes('voltget') ||
        !authorized(token) ||
        !withinRateLimit()
      ) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      wss!.handleUpgrade(req, socket, head, ws => wss!.emit('connection', ws, req));
    });
    wss.on('connection', ws => {
      lastActivity = Date.now();
      broadcastExtensionStatus();
      ws.on('message', message => {
        if (!withinRateLimit()) {
          ws.close(1008, 'Rate limit');
          return;
        }
        void (async () => {
          const msg = JSON.parse(message.toString());
          if (msg.type === 'ping') {
            ws.send('{"type":"pong"}');
            return;
          }
          if (msg.type !== 'sniffed-url') throw new Error('Invalid message');
          const payload = SniffPayloadSchema.parse(msg.data);
          lastActivity = Date.now();
          await deps.handleIncomingSniff(payload);
        })().catch(() => ws.close(1008, 'Invalid payload'));
      });
      ws.on('close', broadcastExtensionStatus);
      ws.on('error', () => ws.terminate());
    });
    server.on('error', error => console.error('[sniff server]', error.message));
    server.listen(deps.port ?? 8765, '127.0.0.1');
  }
  return {
    startSniffServer,
    getExtensionConnectedCount,
    broadcastExtensionStatus,
    getWss: () => wss,
    getServer: () => server,
    getLastActivity: () => lastActivity,
  };
}

export type SniffServerController = ReturnType<typeof createSniffServer>;
