text=open('C:/Users/Ekrem/AppData/Local/Temp/hdf.html',encoding='utf-8').read()
# find dc_ function start
import re
idx=text.find('function dc_8x3b1qvDDia')
print(idx)
print(text[idx:idx+4000])
