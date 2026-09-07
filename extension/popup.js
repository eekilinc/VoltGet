let currentTabUrl = ''
let filter = 'current' // current | all

function short(u){
  try{ const p=new URL(u); return p.hostname.replace('www.','')+'/'+p.pathname.slice(1,30) } catch{ return u.slice(0,40) }
}
function domain(u){ try{ return new URL(u).hostname.replace('www.','') } catch{ return '' } }

async function getCurrentTab(){
  const [tab] = await chrome.tabs.query({ active:true, currentWindow:true })
  return tab
}

async function render(){
  const { items=[] } = await chrome.storage.local.get('items');
  const tab = await getCurrentTab()
  currentTabUrl = tab?.url || ''
  const curDomain = domain(currentTabUrl)

  document.getElementById('cnt').textContent = items.length

  // filtrele
  let filtered = items
  if (filter==='current' && curDomain) {
    filtered = items.filter(i=> domain(i.pageUrl)===curDomain || domain(i.tabUrl||'')===curDomain)
  }

  const list=document.getElementById('list')
  if(!filtered.length){
    list.innerHTML = filter==='current'
      ? `<div class=empty>Bu sayfada yakalanan yok<br><span style="font-size:10px">Sadece ${curDomain||'bu sayfa'} • Tümü'ne bak veya video oynat</span></div>`
      : `<div class=empty>Henüz yakalanan yok<br><span style="font-size:10px">Bir video oynat, otomatik düşer</span></div>`
    return
  }
  list.innerHTML = filtered.slice(0,8).map((i,idx)=> {
    const realIdx = items.indexOf(i)
    return `
    <div class=card>
      <div class=meta><span>${i.type} • ${i.time}</span><span>${short(i.pageUrl)}</span></div>
      <div class=url title="${i.url}">${short(i.url)}</div>
      <div class=row>
        <button class=btn data-idx="${realIdx}" data-act="copy">Kopyala</button>
        <button class=btn2 data-idx="${realIdx}" data-act="app">Uygulamaya Gönder</button>
      </div>
    </div>`
  }).join('') + (filtered.length>8? `<div style="font-size:10px;opacity:0.6;text-align:center;margin-top:6">+${filtered.length-8} daha • Tümü'nde gör</div>`:'')
  list.querySelectorAll('button').forEach(b=>{
    b.onclick= async()=>{
      const it=items[parseInt(b.dataset.idx)]
      if(b.dataset.act==='copy'){
        const toCopy = it.pageUrl?.includes('youtube.com/watch') ? it.pageUrl : it.url
        await navigator.clipboard.writeText(toCopy)
        b.textContent='Kopyalandı ✓'; setTimeout(()=> b.textContent='Kopyala',1000)
      } else {
        const itemToSend = { ...it, userInitiated: true, showDialog: true }
        if (it.pageUrl && /youtube\.com|youtu\.be/i.test(it.pageUrl)) {
          itemToSend.url = it.pageUrl
        }
        try{ await fetch('http://127.0.0.1:8765/sniff',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(itemToSend)})}catch{}
        const toCopy = it.pageUrl?.includes('youtube.com/watch') ? it.pageUrl : it.url
        await navigator.clipboard.writeText(toCopy)
        b.textContent='Gönderildi ✓'; setTimeout(()=> b.textContent='Uygulamaya Gönder',1000)
      }
    }
  })
}

// tabs
document.getElementById('tabCurrent').onclick=()=>{
  filter='current'; document.getElementById('tabCurrent').classList.add('active'); document.getElementById('tabAll').classList.remove('active'); render()
}
document.getElementById('tabAll').onclick=()=>{
  filter='all'; document.getElementById('tabAll').classList.add('active'); document.getElementById('tabCurrent').classList.remove('active'); render()
}
document.getElementById('clear').onclick= async()=>{ await chrome.storage.local.set({items:[]}); render(); };
document.getElementById('clearPage').onclick= async()=>{
  const { items=[] } = await chrome.storage.local.get('items');
  const curDomain = domain(currentTabUrl)
  const kept = items.filter(i=> domain(i.pageUrl)!==curDomain && domain(i.tabUrl||'')!==curDomain)
  await chrome.storage.local.set({items:kept}); render();
}
document.getElementById('open').onclick= async()=>{
  try{
    const r=await fetch('http://127.0.0.1:8765/status')
    if(r.ok){ document.getElementById('hint').textContent='✓ Uygulama açık — Yakalayıcı sekmesine bak'; document.getElementById('hint').style.color='#86efac'; return }
  }catch{}
  document.getElementById('hint').textContent='✗ VoltGet kapalı — Lütfen VoltGet uygulamasını başlatın';
  document.getElementById('hint').style.color='#fca5a5';
};
document.getElementById('autoClear').onchange= async(e)=>{ await chrome.storage.local.set({autoClearOnNavigate: e.target.checked}) };
chrome.storage.local.get({autoClearOnNavigate:false}).then(v=> document.getElementById('autoClear').checked=v.autoClearOnNavigate);

fetch('http://127.0.0.1:8765/status').then(r=> r.ok? (document.getElementById('hint').textContent='✓ VoltGet açık — yakalananlar otomatik düşer', document.getElementById('hint').style.color='#86efac') : null).catch(()=>{ document.getElementById('hint').textContent='○ VoltGet kapalı — Uygulamayı açın'; });
render();
