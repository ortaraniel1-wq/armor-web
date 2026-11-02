/* Chequeo de facturas: funciona sin internet una vez abierta.
   - La página y los scripts se piden primero a la red (así siempre llega la última versión) y, si no hay red o tarda, sale de la copia.
   - Logos, íconos y tipografías salen de la copia.
   - Los lectores (PDF.js y ZXing) se guardan la primera vez que se usan. */
const VERSION = "chequeo-v1";
const BASICOS = ["./", "index.html", "manifest.json", "icon-192.png", "icon-512.png", "armor_wordmark.png", "escudo.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(BASICOS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function redPrimero(req){
  const guardar = res => { if(res.ok){ const c = res.clone(); caches.open(VERSION).then(ca => ca.put(req, c)).catch(()=>{}); } return res; };
  const red = fetch(req).then(guardar);
  const plazo = new Promise(r => setTimeout(r, 4000, null));
  try{
    const res = await Promise.race([red, plazo]);
    if(res) return res;
    return (await caches.match(req)) || red;        // sin copia guardada, se espera a la red
  }catch(err){
    return (await caches.match(req)) || (await caches.match("index.html")) || Response.error();
  }
}

const LIBRERIAS = ["cdnjs.cloudflare.com", "cdn.jsdelivr.net"];
self.addEventListener("fetch", e => {
  const req = e.request;
  if(req.method !== "GET") return;
  const url = new URL(req.url);

  if(LIBRERIAS.includes(url.hostname)){            // lectores de PDF y de códigos: copia primero
    e.respondWith(caches.open(VERSION).then(async c => {
      const guardado = await c.match(req);
      if(guardado) return guardado;
      const res = await fetch(req);
      c.put(req, res.clone()).catch(()=>{});
      return res;
    }));
    return;
  }
  if(url.origin !== location.origin) return;       // catálogo, Apps Script y demás: siempre a la red

  // la página, los scripts y los .json se piden primero a la red (así los cambios llegan solos);
  // si la red tarda más de 4 segundos o no hay internet, se abre la copia guardada
  const cambiable = req.mode === "navigate" || url.pathname.endsWith("/") || /\.(html|js|json)$/.test(url.pathname);
  if(cambiable){ e.respondWith(redPrimero(req)); return; }
  e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {   // recursos fijos: copia primero
    const copia = res.clone(); caches.open(VERSION).then(c => c.put(req, copia)).catch(()=>{});
    return res;
  })));
});
