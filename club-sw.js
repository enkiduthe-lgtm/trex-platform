const CACHE='trex-club-shell-v1';
const ASSETS=['/club.html','/club.webmanifest','/club-icon-180.png','/club-icon-192.png','/club-icon-512.png'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('trex-club-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!ASSETS.includes(url.pathname)||url.search)return;
 event.respondWith((async()=>{
   const cache=await caches.open(CACHE);
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),4000);
   try{
     const response=await fetch(event.request,{signal:controller.signal});
     if(!response.ok||response.redirected)throw new Error('Unavailable');
     await cache.put(event.request,response.clone());
     return response;
   }catch(error){
     const cached=await cache.match(event.request);
     if(cached)return cached;
     return new Response('Trex Club henüz çevrimdışı kullanıma hazır değil. İnternete bağlanıp yeniden açın.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
   }finally{clearTimeout(timeout);}
 })());
});
