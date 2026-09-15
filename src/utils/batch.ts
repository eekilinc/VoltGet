/**
 * Toplu indirme (Batch Download) link ayrıştırma ve joker karakter (wildcard) genişletme motoru.
 * IDM (Internet Download Manager) tarzı [01-10] veya [a-z] aralıklarını destekler.
 */

export function expandUrlPattern(rawPattern: string): string[] {
  const trimmed = rawPattern.trim();
  if (!trimmed) return [];

  // Sayısal aralık: [01-10], [1-50] vb.
  const numMatch = trimmed.match(/\[(\d+)-(\d+)\]/);
  if (numMatch) {
    const startStr = numMatch[1];
    const endStr = numMatch[2];
    const startNum = parseInt(startStr, 10);
    const endNum = parseInt(endStr, 10);

    if (!isNaN(startNum) && !isNaN(endNum) && startNum <= endNum) {
      // Maksimum 200 parça ile sınırla (aşırı bellek tüketimini önlemek için)
      const count = Math.min(200, endNum - startNum + 1);
      const padLen = startStr.length;
      const results: string[] = [];

      for (let i = 0; i < count; i++) {
        const val = (startNum + i).toString().padStart(padLen, '0');
        results.push(trimmed.replace(numMatch[0], val));
      }
      return results;
    }
  }

  // Harf aralığı: [a-z], [A-Z]
  const charMatch = trimmed.match(/\[([a-zA-Z])-([a-zA-Z])\]/);
  if (charMatch) {
    const startChar = charMatch[1].charCodeAt(0);
    const endChar = charMatch[2].charCodeAt(0);

    if (startChar <= endChar) {
      const count = Math.min(52, endChar - startChar + 1);
      const results: string[] = [];

      for (let i = 0; i < count; i++) {
        const char = String.fromCharCode(startChar + i);
        results.push(trimmed.replace(charMatch[0], char));
      }
      return results;
    }
  }

  return [trimmed];
}

/**
 * Kullanıcının metin alanına girdiği çok satırlı veya aralık içeren metni link listesine dönüştürür.
 */
export function parseBatchInput(input: string): string[] {
  if (!input || !input.trim()) return [];

  const lines = input
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#'));

  const expandedList: string[] = [];

  for (const line of lines) {
    if (line.includes('[') && line.includes(']') && line.includes('-')) {
      const expanded = expandUrlPattern(line);
      expandedList.push(...expanded);
    } else if (/^https?:\/\//i.test(line) || /^magnet:\?/i.test(line)) {
      expandedList.push(line);
    } else if (line.includes('.')) {
      // http ekle
      expandedList.push('https://' + line.replace(/^\/\//, ''));
    }
  }

  // Tekilleştir ve boşları temizle
  const seen = new Set<string>();
  const uniqueUrls: string[] = [];

  for (const url of expandedList) {
    const clean = url.trim();
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      uniqueUrls.push(clean);
    }
  }

  return uniqueUrls;
}
