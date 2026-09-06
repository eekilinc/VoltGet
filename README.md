# Flexplorer - İndirme Yöneticisi

> IDM alternatifi, ücretsiz, video/müzik yakalama özellikli indirme yöneticisi + dosya gezgini

## Özellikler
- **1800+ site** desteği (YouTube, Instagram, TikTok, X/Twitter, Facebook, SoundCloud, Vimeo, m3u8/HLS, DASH/mpd...) — `yt-dlp` motoru
- **Video / Sadece Müzik (MP3)** seçeneği, kalite seçimi (144p - 4K)
- **FFmpeg** ile otomatik birleştirme ve MP3 çevirme
- **Kuyruk yönetimi**: çoklu indirme, hız/ETA, iptal, log
- **Yakalayıcı (Sniffer)**: Chrome/Firefox eklentisi ile sayfadaki `.mp4/.mp3/.m3u8/.mpd` linklerini otomatik yakalar
- **Dosya gezgini** entegrasyonu — indirilenler `~/Downloads/Flexplorer`

## Teknoloji
- Electron 31 + Vite + React + TypeScript
- yt-dlp (Python) + FFmpeg (sistemde kurulu, PATH'te)
- Chrome Extension Manifest V3 (webRequest + content script)

## Kurulum

```bash
cd D:\Denemeler\flexplorer
npm install
```

### Geliştirme
```bash
npm run dev
# Vite -> http://localhost:5173
# Electron otomatik açılır
```

### Build
```bash
npm run build:renderer
npm run build:electron
# veya tek komut (electron-builder ile paketleme eklenecek)
npm run build
```

## Gereksinimler
- Node 20+, FFmpeg 6+ (PATH'te `ffmpeg -version` çalışmalı — sende kurulu ✓)
- yt-dlp: `C:\Python313\Scripts\yt-dlp.exe` bulundu ✓ (yoksa uygulama içinden "yt-dlp İndir" butonu ile `bin/yt-dlp.exe` indirir)

## Eklenti Kurulumu
1. `chrome://extensions` → Geliştirici modu AÇ
2. Paketlenmemiş yükle → `D:\Denemeler\flexplorer\extension` seç
3. Herhangi bir sitede video oynat → popup'ta veya Flexplorer → Yakalayıcı sekmesinde link belirir

## Kullanım
1. Flexplorer'ı aç → Link yapıştır → **Analiz Et**
2. Kalite seç (veya 🎵 MP3 işaretle)
3. Klasör seç → **İndir** → sağ panelde kuyruk/progress izle

## Yol Haritası
- [ ] Hız limiti, duraklat/devam, 8 parçalı indirme
- [ ] Tarayıcı eklentisi → Native messaging (doğrudan tek tık indirme)
- [ ] Dosya gezgini tam entegrasyonu (sürükle-bırak, önizleme)
