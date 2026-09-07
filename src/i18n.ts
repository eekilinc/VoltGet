export type Lang = 'tr' | 'en' | 'de' | 'es' | 'ru' | 'ar'

export const LANGS: Record<Lang, string> = {
  tr: 'Türkçe', en: 'English', de: 'Deutsch', es: 'Español', ru: 'Русский', ar: 'العربية'
}

const dict: Record<Lang, Record<string, string>> = {
  tr: {
    appName: 'VoltGet', appTagline: 'Ultra Hızlı İndirme Yöneticisi',
    navDownload: 'İndir', navDownloadDesc: 'Link yapıştır',
    navSniff: 'Yakalayıcı', navSniffDesc: 'Otomatik yakala',
    navExplorer: 'Dosyalar', navExplorerDesc: 'İndirilenler',
    navSettings: 'Ayarlar', navSettingsDesc: 'Klasör, araçlar',
    navAbout: 'Hakkında', navAboutDesc: 'Bilgi',
    refresh: 'Yenile', folder: 'Klasör',
    idmAlt: 'IDM alternatifi',
    linkDownload: 'Link İndir', autoSniffer: 'Otomatik Yakalayıcı',
    files: 'Dosyalar', settings: 'Ayarlar', about: 'Hakkında',
    pasteLink: 'Link Yapıştır', analyze: 'Analiz Et', analyzing: 'Analiz…',
    mp3: 'MP3', quickDownload: 'Hızlı İndir (En İyi)', selectedQuality: 'Seçili Kalitede İndir',
    downloadAsMp3: 'MP3 Olarak İndir',
    queue: 'Kuyruk', clear: 'Temizle', open: 'Aç',
    noDownloadsYet: 'Henüz indirme yok', pasteOrCapture: 'Link yapıştır veya yakalayıcıdan tek tıkla indir',
    pause: 'Duraklat', resume: 'Devam', cancel: 'İptal', retry: 'Yeniden Dene', openFolder: 'Klasörü Aç',
    statusDownloading: 'İniyor', statusQueued: 'Sırada', statusDone: 'Bitti', statusPaused: 'Duraklatıldı', statusError: 'Hata',
    settingsAppearance: 'Görünüm', settingsTheme: 'Tema', settingsLanguage: 'Dil',
    themeDark: 'Karanlık', themeLight: 'Aydınlık', accentColor: 'Aksan Rengi',
    settingsFolder: 'İndirme Klasörü', settingsPerf: 'Performans', settingsTools: 'Araçlar', settingsSniffer: 'Bildirim & Yakalayıcı',
  },
  en: {
    appName: 'VoltGet', appTagline: 'Ultra-Fast Download Manager',
    navDownload: 'Download', navDownloadDesc: 'Paste link',
    navSniff: 'Sniffer', navSniffDesc: 'Auto capture',
    navExplorer: 'Files', navExplorerDesc: 'Downloads',
    navSettings: 'Settings', navSettingsDesc: 'Folder, tools',
    navAbout: 'About', navAboutDesc: 'Info',
    refresh: 'Refresh', folder: 'Folder',
    idmAlt: 'IDM alternative',
    linkDownload: 'Link Download', autoSniffer: 'Auto Sniffer',
    files: 'Files', settings: 'Settings', about: 'About',
    pasteLink: 'Paste Link', analyze: 'Analyze', analyzing: 'Analyzing…',
    mp3: 'MP3', quickDownload: 'Quick Download (Best)', selectedQuality: 'Download Selected Quality',
    downloadAsMp3: 'Download as MP3',
    queue: 'Queue', clear: 'Clear', open: 'Open',
    noDownloadsYet: 'No downloads yet', pasteOrCapture: 'Paste a link or capture with one click',
    pause: 'Pause', resume: 'Resume', cancel: 'Cancel', retry: 'Retry', openFolder: 'Open Folder',
    statusDownloading: 'Downloading', statusQueued: 'Queued', statusDone: 'Done', statusPaused: 'Paused', statusError: 'Error',
    settingsAppearance: 'Appearance', settingsTheme: 'Theme', settingsLanguage: 'Language',
    themeDark: 'Dark', themeLight: 'Light', accentColor: 'Accent Color',
    settingsFolder: 'Download Folder', settingsPerf: 'Performance', settingsTools: 'Tools', settingsSniffer: 'Notifications & Sniffer',
  },
  de: { appName:'VoltGet', appTagline:'Ultra-Schneller Download-Manager', navDownload:'Download', navDownloadDesc:'Link einfügen', navSniff:'Sniffer', navSniffDesc:'Auto erfassen', navExplorer:'Dateien', navExplorerDesc:'Downloads', navSettings:'Einstellungen', navSettingsDesc:'Ordner, Tools', navAbout:'Über', navAboutDesc:'Info', refresh:'Aktualisieren', folder:'Ordner', idmAlt:'IDM Alternative', linkDownload:'Link-Download', autoSniffer:'Auto-Sniffer', files:'Dateien', settings:'Einstellungen', about:'Über', pasteLink:'Link einfügen', analyze:'Analysieren', analyzing:'Analysiere…', mp3:'MP3', quickDownload:'Schnell-Download (Beste)', selectedQuality:'Ausgewählte Qualität laden', downloadAsMp3:'Als MP3 laden', queue:'Warteschlange', clear:'Leeren', open:'Öffnen', noDownloadsYet:'Noch keine Downloads', pasteOrCapture:'Link einfügen oder mit einem Klick erfassen', pause:'Pausieren', resume:'Fortsetzen', cancel:'Abbrechen', retry:'Wiederholen', openFolder:'Ordner öffnen', statusDownloading:'Lädt', statusQueued:'Warteschlange', statusDone:'Fertig', statusPaused:'Pausiert', statusError:'Fehler', settingsAppearance:'Erscheinungsbild', settingsTheme:'Thema', settingsLanguage:'Sprache', themeDark:'Dunkel', themeLight:'Hell', accentColor:'Akzentfarbe', settingsFolder:'Download-Ordner', settingsPerf:'Leistung', settingsTools:'Werkzeuge', settingsSniffer:'Benachrichtigung & Sniffer' },
  es: { appName:'VoltGet', appTagline:'Gestor de Descargas Ultrarrápido', navDownload:'Descargar', navDownloadDesc:'Pegar enlace', navSniff:'Rastreador', navSniffDesc:'Captura automática', navExplorer:'Archivos', navExplorerDesc:'Descargas', navSettings:'Ajustes', navSettingsDesc:'Carpeta, herramientas', navAbout:'Acerca de', navAboutDesc:'Info', refresh:'Actualizar', folder:'Carpeta', idmAlt:'Alternativa a IDM', linkDownload:'Descargar enlace', autoSniffer:'Rastreador automático', files:'Archivos', settings:'Ajustes', about:'Acerca de', pasteLink:'Pegar enlace', analyze:'Analizar', analyzing:'Analizando…', mp3:'MP3', quickDownload:'Descarga rápida (Mejor)', selectedQuality:'Descargar calidad seleccionada', downloadAsMp3:'Descargar como MP3', queue:'Cola', clear:'Limpiar', open:'Abrir', noDownloadsYet:'Aún no hay descargas', pasteOrCapture:'Pega un enlace o captura con un clic', pause:'Pausar', resume:'Reanudar', cancel:'Cancelar', retry:'Reintentar', openFolder:'Abrir carpeta', statusDownloading:'Descargando', statusQueued:'En cola', statusDone:'Listo', statusPaused:'Pausado', statusError:'Error', settingsAppearance:'Apariencia', settingsTheme:'Tema', settingsLanguage:'Idioma', themeDark:'Oscuro', themeLight:'Claro', accentColor:'Color de acento', settingsFolder:'Carpeta de descargas', settingsPerf:'Rendimiento', settingsTools:'Herramientas', settingsSniffer:'Notificaciones y rastreador' },
  ru: { appName:'VoltGet', appTagline:'Ультрабыстрый менеджер загрузок', navDownload:'Скачать', navDownloadDesc:'Вставить ссылку', navSniff:'Сниффер', navSniffDesc:'Авто захват', navExplorer:'Файлы', navExplorerDesc:'Загрузки', navSettings:'Настройки', navSettingsDesc:'Папка, инструменты', navAbout:'О программе', navAboutDesc:'Инфо', refresh:'Обновить', folder:'Папка', idmAlt:'Альтернатива IDM', linkDownload:'Скачать по ссылке', autoSniffer:'Авто сниффер', files:'Файлы', settings:'Настройки', about:'О программе', pasteLink:'Вставить ссылку', analyze:'Анализ', analyzing:'Анализ…', mp3:'MP3', quickDownload:'Быстрая загрузка (лучшее)', selectedQuality:'Скачать выбранное качество', downloadAsMp3:'Скачать как MP3', queue:'Очередь', clear:'Очистить', open:'Открыть', noDownloadsYet:'Пока нет загрузок', pasteOrCapture:'Вставьте ссылку или захватите одним кликом', pause:'Пауза', resume:'Продолжить', cancel:'Отмена', retry:'Повторить', openFolder:'Открыть папку', statusDownloading:'Загрузка', statusQueued:'В очереди', statusDone:'Готово', statusPaused:'Пауза', statusError:'Ошибка', settingsAppearance:'Внешний вид', settingsTheme:'Тема', settingsLanguage:'Язык', themeDark:'Тёмная', themeLight:'Светлая', accentColor:'Акцентный цвет', settingsFolder:'Папка загрузок', settingsPerf:'Производительность', settingsTools:'Инструменты', settingsSniffer:'Уведомления и сниффер' },
  ar: { appName:'VoltGet', appTagline:'مدير تنزيل فائق السرعة', navDownload:'تنزيل', navDownloadDesc:'لصق الرابط', navSniff:'الملتقط', navSniffDesc:'التقاط تلقائي', navExplorer:'الملفات', navExplorerDesc:'التنزيلات', navSettings:'الإعدادات', navSettingsDesc:'المجلد، الأدوات', navAbout:'حول', navAboutDesc:'معلومات', refresh:'تحديث', folder:'مجلد', idmAlt:'بديل IDM', linkDownload:'تنزيل رابط', autoSniffer:'ملتقط تلقائي', files:'الملفات', settings:'الإعدادات', about:'حول', pasteLink:'لصق الرابط', analyze:'تحليل', analyzing:'جارٍ التحليل…', mp3:'MP3', quickDownload:'تنزيل سريع (الأفضل)', selectedQuality:'تنزيل الجودة المحددة', downloadAsMp3:'تنزيل كـ MP3', queue:'قائمة الانتظار', clear:'مسح', open:'فتح', noDownloadsYet:'لا توجد تنزيلات بعد', pasteOrCapture:'الصق رابطًا أو التقط بنقرة واحدة', pause:'إيقاف مؤقت', resume:'استئناف', cancel:'إلغاء', retry:'إعادة المحاولة', openFolder:'فتح المجلد', statusDownloading:'جارِ التنزيل', statusQueued:'في الانتظار', statusDone:'اكتمل', statusPaused:'موقوف مؤقتًا', statusError:'خطأ', settingsAppearance:'المظهر', settingsTheme:'السمة', settingsLanguage:'اللغة', themeDark:'داكن', themeLight:'فاتح', accentColor:'لون التمييز', settingsFolder:'مجلد التنزيلات', settingsPerf:'الأداء', settingsTools:'الأدوات', settingsSniffer:'الإشعارات والملتقط' },
}

export function t(lang: Lang, key: string): string {
  return dict[lang]?.[key] ?? dict.tr[key] ?? key
}
