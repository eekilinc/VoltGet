import re
text=open('C:/Users/Ekrem/AppData/Local/Temp/hdf.html',encoding='utf-8').read()
# find dc_ function definition
m=re.search(r'function dc_8x3b1qvDDia.*?\{.*?\}', text, re.DOTALL)
if m:
    print(m.group(0)[:3000])
else:
    # search for var dc
    m=re.search(r'dc_8x3b1qvDDia\s*=\s*function.*?\}', text, re.DOTALL)
    if m:
        print(m.group(0)[:3000])
    else:
        print("not found direct")
        # find all occurrences
        for line in text.splitlines():
            if 'dc_8x3b1qvDDia' in line:
                print(line[:2000])
                break
        # find script src that might contain it
        scripts=re.findall(r'<script[^>]+src="([^"]+)"', text)
        print("scripts", scripts[:10])
