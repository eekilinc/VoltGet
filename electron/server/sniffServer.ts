import http from 'http';
import { WebSocketServer } from 'ws';

export interface SniffServerDeps {
  handleIncomingSniff: (data: any) => Promise<void>;
  getMainWindow: () => any;
}

export function createSniffServer(deps: SniffServerDeps) {
  let sniffServer: http.Server | null = null;
  let wss: WebSocketServer | null = null;
  let lastExtensionActivity = 0;

  function getExtensionConnectedCount(): number {
    if (!wss) return 0;
    let count = 0;
    wss.clients.forEach((c: any) => {
      if (c.readyState === 1) count++;
    });
    return count;
  }

  function broadcastExtensionStatus() {
    const count = getExtensionConnectedCount();
    const isRecent = Date.now() - lastExtensionActivity < 60000;
    const isConnected = count > 0 || isRecent;
    const status = { connected: isConnected, count: Math.max(count, isConnected ? 1 : 0) };
    const w = deps.getMainWindow();
    if (w && !w.isDestroyed()) {
      w.webContents.send('extension-status-changed', status);
    }
  }

  function startSniffServer() {
    if (sniffServer) return;
    sniffServer = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }
      if (req.url === '/sniff' && req.method === 'POST') {
        let body = '';
        req.on('data', c => (body += c));
        req.on('end', async () => {
          try {
            lastExtensionActivity = Date.now();
            broadcastExtensionStatus();
            const data = JSON.parse(body);
            await deps.handleIncomingSniff(data);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          } catch (e: any) {
            res.writeHead(400);
            res.end(String(e));
          }
        });
        return;
      }
      if (req.url === '/status') {
        lastExtensionActivity = Date.now();
        broadcastExtensionStatus();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({ ok: true, app: 'VoltGet', sniff: true, extensionConnected: true })
        );
        return;
      }
      res.writeHead(404);
      res.end('not found');
    });
    sniffServer.listen(8765, '127.0.0.1', () => {
      console.log('[VoltGet] sniff server http://127.0.0.1:8765/sniff');
      wss = new WebSocketServer({ server: sniffServer! });
      wss.on('connection', ws => {
        lastExtensionActivity = Date.now();
        console.log('[VoltGet] WebSocket connected');
        broadcastExtensionStatus();
        ws.on('message', async (message: string) => {
          try {
            lastExtensionActivity = Date.now();
            const msg = JSON.parse(message.toString());
            if (msg.type === 'ping') {
              try {
                ws.send(JSON.stringify({ type: 'pong' }));
              } catch {}
              broadcastExtensionStatus();
              return;
            }
            if (msg.type === 'sniffed-url') {
              await deps.handleIncomingSniff(msg.data);
            }
          } catch (e: any) {
            console.error('[VoltGet] WebSocket message error', e);
          }
        });
        ws.on('close', () => {
          console.log('[VoltGet] WebSocket disconnected');
          broadcastExtensionStatus();
        });
        ws.on('error', (e: Error) => {
          console.error('[VoltGet] WebSocket error', e);
          broadcastExtensionStatus();
        });
      });
    });
    sniffServer.on('error', (e: any) => console.error('[sniff server]', e.message));
  }

  function getWss() {
    return wss;
  }
  function getServer() {
    return sniffServer;
  }
  function markActivity() {
    lastExtensionActivity = Date.now();
    broadcastExtensionStatus();
  }

  return {
    startSniffServer,
    getExtensionConnectedCount,
    broadcastExtensionStatus,
    getWss,
    getServer,
    markActivity,
    getLastActivity: () => lastExtensionActivity,
  };
}

export type SniffServerController = ReturnType<typeof createSniffServer>;
