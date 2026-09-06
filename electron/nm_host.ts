import * as fs from 'fs'

function readMessage(): Promise<any> {
  return new Promise((resolve, reject) => {
    const headerBuf = Buffer.alloc(4)
    let bytesRead = 0
    
    try {
      const fd = process.stdin.fd
      bytesRead = fs.readSync(fd, headerBuf, 0, 4, null)
    } catch (e) {
      return reject(e)
    }
    
    if (bytesRead < 4) {
      return reject(new Error('EOF or invalid header'))
    }
    
    const msgLen = headerBuf.readUInt32LE(0)
    const msgBuf = Buffer.alloc(msgLen)
    let totalRead = 0
    
    try {
      const fd = process.stdin.fd
      while (totalRead < msgLen) {
        const r = fs.readSync(fd, msgBuf, totalRead, msgLen - totalRead, null)
        if (r <= 0) break
        totalRead += r
      }
    } catch (e) {
      return reject(e)
    }
    
    try {
      const jsonStr = msgBuf.toString('utf8')
      resolve(JSON.parse(jsonStr))
    } catch (e) {
      reject(e)
    }
  })
}

function writeMessage(msg: any) {
  const jsonStr = JSON.stringify(msg)
  const headerBuf = Buffer.alloc(4)
  headerBuf.writeUInt32LE(jsonStr.length, 0)
  try {
    fs.writeSync(process.stdout.fd, headerBuf)
    fs.writeSync(process.stdout.fd, Buffer.from(jsonStr, 'utf8'))
  } catch (e) {
    // ignore
  }
}

if (process.argv.includes('--native-msg')) {
  // Sonsuz döngüde mesajları dinle
  async function listenLoop() {
    try {
      while (true) {
        const msg = await readMessage()
        if (!msg) break
        
        // Örnek işlem: Gelen mesajı işle ve yanıt dön
        if (msg.type === 'ping') {
          writeMessage({ type: 'pong', time: Date.now() })
        } else if (msg.type === 'download-request') {
          // İndirme talebini yerel HTTP sunucusuna ilet veya dosyaya yaz
          // Yerel HTTP sunucumuz 8765 portunda çalışıyor, oraya POST atabiliriz
          try {
            await globalThis.fetch('http://127.0.0.1:8765/sniff', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(msg.data)
            })
            writeMessage({ success: true })
          } catch (e: any) {
            writeMessage({ success: false, error: e.message })
          }
        } else {
          writeMessage({ success: true, received: msg })
        }
      }
    } catch (e) {
      // Stream kapandıysa çık
    }
  }
  listenLoop()
}
