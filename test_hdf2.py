import re
text=open('C:/Users/Ekrem/AppData/Local/Temp/hdf.html',encoding='utf-8').read()
m=re.findall(r's_\w+\s*=\s*"([^"]+master[^"]+)"', text)
print('s_ master', m[:5])
m2=re.findall(r'https?://[^\s"\'<>]+master\.txt[^\s"\'<>]*', text)
print('master urls', m2[:5])
m3=re.findall(r'https://[^\s"\'<>]+hls[^\s"\'<>]+', text)
print('hls urls', m3[:10])
print('search s_SMdYr', re.findall(r's_SMdYr\w*', text)[:5])
# try to find jwplayer setup line
for line in text.splitlines():
    if 's_SMdYr' in line:
        print(line[:800])
        break
