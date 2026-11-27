import { spawn } from 'child_process';
import * as fs from 'fs';

function readMessage(): Promise<any> {
  return new Promise((resolve, reject) => {
    const headerBuf = Buffer.alloc(4);
    let bytesRead = 0;

    try {
      const fd = process.stdin.fd;
      bytesRead = fs.readSync(fd, headerBuf, 0, 4, null);
    } catch (e) {
      return reject(e);
    }

    if (bytesRead < 4) {
      return reject(new Error('EOF or invalid header'));
    }

    const msgLen = headerBuf.readUInt32LE(0);
    if (msgLen === 0 || msgLen > 1024 * 1024) {
      return reject(new Error('Invalid message length'));
    }
    const msgBuf = Buffer.alloc(msgLen);
    let totalRead = 0;

    try {
      const fd = process.stdin.fd;
      while (totalRead < msgLen) {
        const r = fs.readSync(fd, msgBuf, totalRead, msgLen - totalRead, null);
        if (r <= 0) break;
        totalRead += r;
      }
    } catch (e) {
      return reject(e);
    }

    try {
      const jsonStr = msgBuf.toString('utf8');
      resolve(JSON.parse(jsonStr));
    } catch (e) {
      reject(e);
    }
  });
}

function writeMessage(msg: any) {
  const payload = Buffer.from(JSON.stringify(msg), 'utf8');
  const headerBuf = Buffer.alloc(4);
  headerBuf.writeUInt32LE(payload.length, 0);
  try {
    fs.writeSync(process.stdout.fd, headerBuf);
    fs.writeSync(process.stdout.fd, payload);
  } catch {
    // ignore
  }
}

function readPairingToken(): string {
  const tokenFile = process.env.VOLTGET_TOKEN_FILE;
  if (!tokenFile) return '';
  try {
    const raw = fs.readFileSync(tokenFile, 'utf8').trim();
    return /^[a-f0-9]{64}$/.test(raw) ? raw : '';
  } catch {
    return '';
  }
}

function launchDesktopApp(): boolean {
  const exe = process.env.VOLTGET_APP_EXE;
  if (!exe || !fs.existsSync(exe)) return false;
  try {
    const child = spawn(exe, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '' },
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

if (process.argv.includes('--native-msg')) {
  async function listenLoop() {
    try {
      while (true) {
        const msg = await readMessage();
        if (!msg) break;

        if (msg.type === 'ping') {
          writeMessage({ type: 'pong', time: Date.now() });
        } else if (msg.type === 'get-token') {
          const token = readPairingToken();
          writeMessage({ success: !!token, token });
        } else if (msg.type === 'focus-app') {
          const token = readPairingToken();
          let focused = false;
          if (token) {
            try {
              const r = await globalThis.fetch('http://127.0.0.1:8765/focus', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + token },
              });
              focused = r.ok;
            } catch {}
          }
          if (!focused) {
            focused = launchDesktopApp();
          }
          writeMessage({ success: focused });
        } else if (msg.type === 'download-request') {
          const token = msg.token || readPairingToken();
          try {
            const response = await globalThis.fetch('http://127.0.0.1:8765/sniff', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + token,
              },
              body: JSON.stringify(msg.data),
            });
            writeMessage({ success: response.ok });
          } catch (e: any) {
            writeMessage({ success: false, error: e.message });
          }
        } else {
          writeMessage({ success: true, received: msg });
        }
      }
    } catch {
      // Stream kapandıysa çık
    }
  }
  void listenLoop();
}
