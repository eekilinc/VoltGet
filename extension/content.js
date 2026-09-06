// Gelişmiş yakalayıcı: medya + dosya + iframe + fetch/XHR + jwplayer
function isRealMedia(url){
  if (!url || typeof url!=='string') return false
  if (url.includes('range=') || url.includes('segment-') || url.includes('.ts?') || url.includes('init=') || url.includes('sq=') || url.includes('seq=')) return false
  if (url.startsWith('blob:') || url.startsWith('data:')) return false
  if (url.includes('/s/search/audio/') || url.includes('generate_204')) return false
  if (url.includes('/image') && url.includes('.jpg')) return false
  if (/\.(jpg|jpeg|png|webp|gif|bmp|svg|css|js)(\?|$)/i.test(url)) return false
  if (url.length < 20) return false
  if (url.includes('/video/embed/')) return false
  var PAT = /\.(m3u8|mpd|mp4|webm|mkv|avi|mp3|m4a|flac|wav|mov|flv|zip|rar|7z|pdf|exe|msi|apk|dmg|doc|docx|xls|xlsx|ppt|pptx|epub|torrent)(\?|$)/i
  var CDN = /(playmix\.uno|hls\d*\.|master\.txt|\/hls\/.*\.(m3u8|txt|mp4)|googlevideo|manifest\.googlevideo|tiktokcdn|cdninstagram|fbcdn|twimg|vimeocdn|akamaihd|cloudfront)/i
  return PAT.test(url) || CDN.test(url)
}
function send(url){
  if(!isRealMedia(url)) return
  var m = url.match(/\.(m3u8|mpd|mp4|webm|mkv|mp3|m4a|zip|rar|7z|pdf|exe|msi|apk|dmg|doc|xls|ppt|epub|torrent)/i)
  var type = m ? m[1].toLowerCase() : (url.includes('master.txt')?'m3u8': url.includes('playmix')?'m3u8' : 'media')
  try{ chrome.runtime.sendMessage({ type:'sniffed', data:{ url: url, type: type.slice(0,10), pageUrl: location.href }}) }catch(e){}
}
function scanTags(){
  document.querySelectorAll('video, audio, source, iframe').forEach(function(el){
    var url = el.src || el.currentSrc || el.getAttribute('src') || el.getAttribute('data-src')
    if(url) send(url)
    var srcset = el.getAttribute('srcset')
    if(srcset) srcset.split(',').forEach(function(s){ var u=s.trim().split(' ')[0]; if(u) send(u) })
  })
}
new MutationObserver(scanTags).observe(document.documentElement, { childList:true, subtree:true, attributes:true, attributeFilter:['src','srcset','data-src'] })
setInterval(scanTags, 3000)
scanTags()
;(function(){
  var origFetch = window.fetch
  window.fetch = async function(){
    var args = Array.prototype.slice.call(arguments)
    var url = typeof args[0]==='string'? args[0] : args[0] && args[0].url
    if(url && isRealMedia(url)) send(url)
    return origFetch.apply(this, args)
  }
  var origOpen = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function(method, url){
    if(typeof url==='string' && isRealMedia(url)) send(url)
    var rest = Array.prototype.slice.call(arguments, 2)
    return origOpen.apply(this, [method, url].concat(rest))
  }
  try{
    var obs = new PerformanceObserver(function(list){ list.getEntries().forEach(function(e){ var u=e.name; if(isRealMedia(u)) send(u) }) })
    obs.observe({ entryTypes:['resource'] })
  }catch(e){}
  window.addEventListener('message', function(e){
    try{
      var d = typeof e.data==='string'? JSON.parse(e.data) : e.data
      if(d && d.file && isRealMedia(d.file)) send(d.file)
      if(d && d.source && isRealMedia(d.source)) send(d.source)
    }catch(e2){}
  })
  function hookJw(){
    try{
      if(window.jwplayer){
        var orig = window.jwplayer
        window.jwplayer = function(){
          var inst = orig.apply(this, arguments)
          if(inst && inst.setup){
            var origSetup = inst.setup
            inst.setup = function(cfg){
              try{
                if(cfg){
                  if(cfg.file && isRealMedia(cfg.file)) send(cfg.file)
                  if(cfg.sources && cfg.sources[0] && cfg.sources[0].file && isRealMedia(cfg.sources[0].file)) send(cfg.sources[0].file)
                  if(cfg.playlist && cfg.playlist[0] && cfg.playlist[0].sources && cfg.playlist[0].sources[0].file) send(cfg.playlist[0].sources[0].file)
                }
              }catch(e3){}
              return origSetup.call(this, cfg)
            }
          }
          return inst
        }
        for(var k in orig) if(orig.hasOwnProperty(k)) window.jwplayer[k]=orig[k]
        return true
      }
    }catch(e4){}
    return false
  }
  if(!hookJw()){ var t=setInterval(function(){ if(hookJw()) clearInterval(t) }, 500); setTimeout(function(){ clearInterval(t) }, 10000) }
})()
