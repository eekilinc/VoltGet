import re
text=open('C:/Users/Ekrem/AppData/Local/Temp/hdf.html',encoding='utf-8').read()
urls=re.findall(r'https?://[^\s"\'<>]+', text)
print("urls", len(urls))
for u in urls[:30]:
    print(u)
print("--- file patterns ---")
for pat in [r'file\s*:\s*["\']([^"\']+)["\']', r'source', r'rapidrame', r'm3u8', r'video']:
    m=re.findall(pat, text, re.I)
    if m:
        print(pat, m[:3])
print("--- text snippet ---")
print(text[8000:12000][:2000])
