import { afterEach, describe, expect, it, vi } from 'vitest';
import http from 'http';
import { once } from 'events';
import { WebSocket } from 'ws';
import { createSniffServer } from './sniffServer.js';
vi.unmock('ws');

const token = 'a'.repeat(64);
const origin = 'chrome-extension://' + 'b'.repeat(32);
const cleanup: Array<() => void> = [];
afterEach(() => {
  cleanup
    .splice(0)
    .reverse()
    .forEach(fn => fn());
});
async function fixture() {
  const handle = vi.fn(async () => {});
  const controller = createSniffServer({
    getMainWindow: () => null,
    handleIncomingSniff: handle,
    getToken: () => token,
    port: 0,
  });
  controller.startSniffServer();
  const server = controller.getServer()!;
  cleanup.push(() => {
    controller.getWss()?.clients.forEach(ws => ws.terminate());
    controller.getWss()?.close();
    server.closeAllConnections();
    server.close();
  });
  await once(server, 'listening');
  const port = (server.address() as import('net').AddressInfo).port;
  function post(body: string, headers: Record<string, string> = {}) {
    return new Promise<number>(resolve => {
      const req = http.request(
        { hostname: '127.0.0.1', port, path: '/sniff', method: 'POST', headers },
        res => {
          res.resume();
          res.on('end', () => resolve(res.statusCode!));
        }
      );
      req.end(body);
    });
  }
  return { controller, handle, port, post };
}
describe('authenticated extension bridge', () => {
  it('rejects missing credentials and website origins, accepts paired extensions', async () => {
    const f = await fixture();
    const body = JSON.stringify({ url: 'https://example.com/video.mp4' });
    expect(await f.post(body)).toBe(401);
    expect(
      await f.post(body, { Authorization: 'Bearer ' + token, Origin: 'https://evil.example' })
    ).toBe(403);
    expect(await f.post(body, { Authorization: 'Bearer ' + token, Origin: origin })).toBe(200);
    expect(f.handle).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed, oversized and non-HTTP payloads', async () => {
    const f = await fixture();
    const headers = { Authorization: 'Bearer ' + token };
    expect(await f.post('{', headers)).toBe(400);
    expect(await f.post(JSON.stringify({ url: 'file:///C:/secret' }), headers)).toBe(400);
    expect(await f.post('x'.repeat(300 * 1024), headers)).toBe(413);
    expect(f.handle).not.toHaveBeenCalled();
  });
  it('authenticates WebSocket upgrades before accepting messages', async () => {
    const f = await fixture();
    const denied = new WebSocket(`ws://127.0.0.1:${f.port}`, { origin });
    const [error] = await once(denied, 'error');
    expect(String(error)).toContain('401');
    const ws = new WebSocket(`ws://127.0.0.1:${f.port}`, ['voltget', 'token.' + token], { origin });
    cleanup.push(() => ws.terminate());
    await once(ws, 'open');
    ws.send(JSON.stringify({ type: 'sniffed-url', data: { url: 'https://example.com/video' } }));
    await vi.waitFor(() => expect(f.handle).toHaveBeenCalledTimes(1));
    expect(f.controller.getExtensionConnectedCount()).toBe(1);
  });
});
