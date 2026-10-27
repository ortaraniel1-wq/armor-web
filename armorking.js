/* Armorking · asistente con IA de Armor Market.
   La búsqueda de candidatos se hace aquí (catálogo web + lista de la sede + Armor Pets, con precio y existencia reales)
   y la IA (Claude, vía Apps Script) entiende la pregunta y elige qué mostrar. Sin la IA, igual funciona como buscador. */
(function () {
  'use strict';
  if (window.__armorking) return; window.__armorking = 1;
  var RAW = 'https://raw.githubusercontent.com/ortaraniel1-wq/armor-catalogo-datos/main/';
  var API = window.ARMORKING_API || '';
  var VID = 'img/armorking-hola.mp4', POS = 'img/armorking-hola.jpg';
  var SEDES = { B: { n: 'Boleíta', w: '584241450311', f: 'BOLEITA' }, C: { n: 'Chaguaramos', w: '584241541530', f: 'CHAGUARAMOS' }, G: { n: 'La Guaira', w: '584128434841', f: 'LA_GUAIRA' } };
  var WA_PETS = '584242580098';
  var sede = 'B'; try { var s0 = localStorage.getItem('armor_sede'); if (SEDES[s0]) sede = s0; } catch (e) {}
  document.addEventListener('armor-sede', function (e) { if (SEDES[e.detail]) { sede = e.detail; datos.lista = null; } });

  /* ---------- utilidades ---------- */
  function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[″“”]/g, '"'); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmt(v) { var e = Math.round(v * 100) / 100; return '$' + (e % 1 === 0 ? e.toLocaleString('de-DE') : e.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })); }
  function cap(t) { t = String(t || '').trim(); return t === t.toUpperCase() ? t.toLowerCase().replace(/(^|[\s(\/-])([a-záéíóúñ])/g, function (m, a, b) { return a + b.toUpperCase(); }) : t; }
  function getJSON(u) { return fetch(u + (u.indexOf('?') < 0 ? '?' : '&') + 't=' + Math.floor(Date.now() / 120000), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }

  /* ---------- datos ---------- */
  var datos = { web: null, stock: null, pets: null, lista: null };
  function cargar() {
    var ps = [];
    if (!datos.web) ps.push(getJSON('productos-web.json').then(function (j) { datos.web = j || []; }));
    if (!datos.stock) ps.push(getJSON(RAW + 'stock.json').then(function (j) { datos.stock = (j && j.p) || {}; }));
    if (!datos.pets) ps.push(getJSON(RAW + 'pets.json').then(function (j) { datos.pets = j || { items: [] }; }));
    if (!datos.lista) { var sd = sede; ps.push(getJSON(RAW + 'lista_' + SEDES[sd].f + '.json').then(function (j) { if (sd === sede) datos.lista = j || { items: [] }; })); }
    return Promise.all(ps).then(indexar);
  }
  var IDX = [];
  function indexar() {
    IDX = []; var vistos = {};
    var D = window.ARMOR_D || datos.stock || {};
    (datos.web || []).forEach(function (x) {
      var d = D[x.k], p = x.p, s = null;
      if (d) { if (d[0] > 0 && !(x.u && Math.abs(d[0] - x.u) < 0.01)) p = d[0]; s = d[1]; if (d[2]) vistos[String(d[2]).trim()] = 1; }
      if (s === 0) return;
      IDX.push({ id: 'w:' + x.k, k: x.k, n: x.n, c: x.s, p: p, s: s, i: x.i, o: 'web', t: norm(x.n + ' ' + x.s + ' ' + (x.d || '')) });
    });
    ((datos.lista && datos.lista.items) || []).forEach(function (r) {
      if (vistos[String(r[0]).trim()] && sede === 'B') return;
      var e = +r[8] || 0, s = e > 1 ? Math.floor((+r[9] || 0) / e) : Math.floor(+r[3] || 0);
      if (s <= 0 || !(+r[4] > 0)) return;
      IDX.push({ id: 't:' + r[0], k: r[0], n: cap(r[2]), c: cap(r[7] || r[6] || ''), p: +r[4], s: s, b: r[1], i: '', o: 'tienda', t: norm(r[2] + ' ' + (r[7] || '') + ' ' + (r[6] || '') + ' ' + r[0] + ' ' + r[1]) });
    });
    var base = (datos.pets && datos.pets.base) || 'https://www.armorpetsve.com';
    ((datos.pets && datos.pets.items) || []).forEach(function (r) {
      if (!(+r[5] > 0) || !(+r[6] > 0)) return;
      IDX.push({ id: 'p:' + r[0], k: r[3] || r[0], n: cap(r[2]), c: 'Mascotas · ' + (r[7] || ''), p: +r[5], s: +r[6], i: base + '/web/image/product.template/' + r[1] + '/image_256', o: 'pets', t: norm(r[2] + ' mascota mascotas pets ' + (r[7] || '') + ' ' + (r[3] || '')) });
    });
  }

  /* ---------- búsqueda local ---------- */
  var GR = [['tv', 'televisor', 'televisores', 'television', 'tele', 'pantalla', 'smart tv', 'qled'], ['celular', 'celulares', 'telefono', 'telefonos', 'smartphone', 'iphone', 'movil', 'galaxy', 'redmi'],
    ['laptop', 'laptops', 'computadora', 'notebook', 'macbook'], ['tablet', 'tablets', 'ipad', 'tableta'], ['corneta', 'cornetas', 'parlante', 'bocina', 'speaker', 'altavoz'],
    ['audifono', 'audifonos', 'auriculares', 'headset', 'buds', 'airpods'], ['reloj', 'smartwatch', 'watch'], ['freidora', 'air fryer', 'airfryer'], ['licuadora', 'blender'],
    ['router', 'wifi', 'modem', 'repetidor'], ['camara', 'camaras'], ['consola', 'xbox', 'playstation', 'ps5', 'nintendo'], ['cargador', 'cargadores', 'cable', 'power bank'],
    ['cafe', 'cafetera'], ['perrarina', 'comida para perro', 'alimento para perro', 'dog chow', 'pedigree'], ['gatarina', 'comida para gato', 'alimento para gato', 'cat chow'],
    ['arena', 'arenero', 'areneros'], ['ron', 'whisky', 'vodka', 'vino', 'licor', 'licores', 'cerveza'], ['chocolate', 'chocolates', 'dulce', 'dulces'],
    ['shampoo', 'champu'], ['perfume', 'colonia', 'fragancia'], ['juguete', 'juguetes'], ['olla', 'ollas', 'sarten', 'sartenes'], ['pañal', 'pañales', 'panal', 'panales', 'pampers']];
  var STOP = ' a al algo algun alguna busco buscar busca con cual cuales de del el en es esta este hay la las lo los me mi mis necesito para por que quiero se si sin su sus tiene tienen tienes un una uno unos y o precio cuanto cuesta favor hola dame ver ';
  GR.push(['gato', 'gatos', 'felino', 'felinos', 'cat', 'gatarina', 'cat chow', 'whiskas'], ['perro', 'perros', 'canino', 'caninos', 'dog', 'perrarina', 'dog chow', 'pedigree'],
    ['comida', 'alimento', 'food', 'croquetas'], ['nevera', 'refrigerador', 'refrigeradora', 'freezer', 'congelador'], ['lavadora', 'secadora'], ['aire', 'aire acondicionado', 'split'], ['microondas'], ['aspiradora', 'robot aspiradora']);
  var GEN = ' regalo regalos regalar obsequio detalle recomienda recomiendas recomendacion sugerencia ideas idea algo bueno barato economico oferta ofertas nuevo novedades cumpleanos navidad mama papa novia novio esposa esposo nino nina ';
  function terminos(q) {
    q = ' ' + norm(q).replace(/(\d+)\s*(?:"|pulgadas?|pulg|in)\b/g, '$1"').replace(/[^a-z0-9ñ"$.\s]/g, ' ').replace(/\s+/g, ' ') + ' ';
    var T = [], usado = {};
    GR.forEach(function (g) { g.forEach(function (y) { if (y.indexOf(' ') > 0 && q.indexOf(' ' + y + ' ') >= 0) { T.push(g.slice()); y.split(' ').forEach(function (w) { usado[w] = 1; }); } }); });
    q.trim().split(' ').forEach(function (w) {
      if (usado[w] || w.length < 2 || STOP.indexOf(' ' + w + ' ') >= 0 || GEN.indexOf(' ' + w.replace(/"/, '') + ' ') >= 0) return;
      if (/^\$/.test(w) || /^\d+([.,]\d+)?$/.test(w) && !/^\d{2,3}$/.test(w)) return;
      if (/^\d{2,3}"?$/.test(w)) { T.push([w.replace('"', '') + '"', w.replace('"', '') + ' ']); return; }
      var g = GR.filter(function (x) { return x.indexOf(w) >= 0 || (w.length > 4 && x.some(function (y) { return y.indexOf(w.slice(0, -1)) === 0; })); })[0];
      var alts = g ? g.slice() : [w]; if (w.length > 4 && /s$/.test(w)) alts.push(w.slice(0, -1)); if (w.length > 4 && /es$/.test(w)) alts.push(w.slice(0, -2));
      T.push(alts);
    });
    return T;
  }
  function presupuesto(q) { var m = norm(q).match(/(?:\$\s*|hasta\s*\$?\s*|menos de\s*\$?\s*|maximo\s*\$?\s*)(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*(?:\$|dolares|usd)/); return m ? parseFloat((m[1] || m[2]).replace(',', '.')) : 0; }
  function hay(t, a) { var j = t.indexOf(a); while (j >= 0) { if (j === 0 || t.charAt(j - 1) === ' ' || t.charAt(j - 1) === '(') return 2; j = t.indexOf(a, j + 1); } return t.indexOf(a) >= 0 ? 1 : 0; }
  function buscar(q, extra) {
    var T = terminos(q + ' ' + (extra || []).join(' ')), max = presupuesto(q), res = [], N = IDX.length || 1, enPets = /pets/.test(location.pathname);
    var W = T.map(function (alts) { var df = 0; IDX.forEach(function (x) { for (var i = 0; i < alts.length; i++) if (x.t.indexOf(alts[i]) >= 0) { df++; break; } }); return Math.log((N + 1) / (df + 1)) + 0.2; });
    if (T.length) IDX.forEach(function (x) {
      var sc = 0, n = 0;
      T.forEach(function (alts, k) { var best = 0; for (var i = 0; i < alts.length; i++) { var h = hay(x.t, alts[i]); if (h > best) best = h; if (h === 2) break; } if (best) { n++; sc += W[k] * (best === 2 ? 1 : 0.35); } });
      if (!n) return;
      if (n === T.length) sc *= 1.6;
      if (max) { if (x.p > max * 1.1) sc *= 0.3; else if (x.p >= max * 0.4) sc *= 1.15; }
      if (x.o === 'web') sc *= 1.1; if (enPets && x.o === 'pets') sc *= 1.5;
      res.push([sc, x]);
    });
    res.sort(function (a, b) { return b[0] - a[0] || (b[1].s || 0) - (a[1].s || 0); });
    var tope = res.length ? res[0][0] * 0.3 : 0;
    var out = res.filter(function (r) { return r[0] >= tope; }).slice(0, 40).map(function (r) { return r[1]; });
    if (out.length < 10) {             // pregunta general (ej. "un regalo de $50"): muestra variada, cerca del presupuesto
      var ya = {}, porCat = {}, pool = IDX.filter(function (x) { return (enPets ? x.o === 'pets' : x.o === 'web') && (!max || (x.p <= max && x.p >= max * 0.35)); });
      out.forEach(function (x) { ya[x.id] = 1; });
      pool.sort(function (a, b) { return (b.s > 3) - (a.s > 3) || b.p - a.p; });
      pool.forEach(function (x) { if (ya[x.id] || out.length >= 40) return; var c = porCat[x.c] = (porCat[x.c] || 0) + 1; if (c <= 2) out.push(x); });
    }
    return out;
  }

  /* ---------- interfaz ---------- */
  var css = '.akb{position:fixed;left:14px;bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:60;width:74px;height:74px;padding:0;border:3px solid #16171A;border-radius:50%;background:#fff;overflow:hidden;cursor:pointer;box-shadow:4px 4px 0 #FDF500,0 6px 18px rgba(0,0,0,.25)}.akb video,.akb img{width:100%;height:100%;object-fit:cover;display:block}' +
    '.akt{position:fixed;left:96px;bottom:calc(30px + env(safe-area-inset-bottom,0px));z-index:60;background:#16171A;color:#FDF500;font:700 14px system-ui,sans-serif;padding:8px 12px;border-radius:12px;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer;max-width:58vw}' +
    '.akp{position:fixed;left:14px;bottom:14px;z-index:61;width:min(420px,calc(100vw - 28px));height:min(640px,calc(100dvh - 28px));display:flex;flex-direction:column;background:#fff;color:#16171A;border:3px solid #16171A;border-radius:18px;box-shadow:6px 6px 0 #FDF500,0 12px 40px rgba(0,0,0,.35);overflow:hidden;font-family:system-ui,sans-serif}.akp[hidden]{display:none}' +
    '.akh{display:flex;align-items:center;gap:10px;padding:8px 10px;background:#16171A;color:#fff}.akh .av{width:50px;height:50px;border-radius:50%;overflow:hidden;border:2px solid #FDF500;flex:none;background:#fff}.akh .av video,.akh .av img{width:100%;height:100%;object-fit:cover}.akh b{display:block;font:700 21px/1 "BC",Impact,sans-serif;color:#FDF500}.akh small{font-size:12px;color:#C9C7BE}.akh .sd{margin-left:auto;background:#2a2b30;color:#fff;border:0;border-radius:999px;font:600 12px system-ui;padding:6px 9px;cursor:pointer}.akh .cl{border:0;background:none;color:#fff;font-size:28px;cursor:pointer;padding:0 6px}' +
    '.akm{flex:1;overflow:auto;padding:12px;background:#F3F2EE;display:flex;flex-direction:column;gap:8px}.akm .mb{max-width:88%;padding:9px 12px;border-radius:14px;font:500 15px/1.4 system-ui;white-space:pre-line}.akm .me{align-self:flex-end;background:#16171A;color:#fff;border-bottom-right-radius:4px}.akm .ak{align-self:flex-start;background:#fff;border:2px solid #16171A;border-bottom-left-radius:4px}' +
    '.akm .chips{display:flex;flex-wrap:wrap;gap:6px}.akm .chips button{border:2px solid #16171A;background:#FDF500;border-radius:999px;padding:6px 11px;font:700 13px system-ui;cursor:pointer;color:#16171A}' +
    '.akr{display:grid;grid-template-columns:62px 1fr;gap:3px 10px;align-items:center;background:#fff;border:2px solid #16171A;border-radius:12px;padding:8px}.akr .im{width:62px;height:62px;grid-row:1/3;background:#fff;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:26px}.akr .im img{max-width:100%;max-height:100%;object-fit:contain}' +
    '.akr .n{font:700 13.5px/1.25 system-ui;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.akr .p{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px;color:#55554F}.akr .p b{font:700 18px "BC",Impact,sans-serif;color:#16171A}' +
    '.akr .bt{grid-column:1/-1;display:flex;gap:6px;margin-top:4px}.akr .bt button,.akr .bt a{flex:1;text-align:center;text-decoration:none;color:#16171A;border:2px solid #16171A;border-radius:9px;padding:7px;font:700 13px system-ui;cursor:pointer;background:#fff}.akr .bt .w{background:#25D366;border-color:#25D366;color:#fff}' +
    '.akw{align-self:flex-start;background:#25D366;color:#fff;text-decoration:none;font:700 14px system-ui;padding:9px 14px;border-radius:10px}.akd{align-self:flex-start;color:#55554F;font:600 13px system-ui;padding:4px 8px}' +
    '.akf{display:flex;gap:6px;padding:10px;border-top:2px solid #16171A;background:#fff}.akf input{flex:1;min-width:0;border:2px solid #16171A;border-radius:10px;padding:10px 12px;font:500 16px system-ui}.akf button{border:2px solid #16171A;background:#FDF500;border-radius:10px;padding:0 14px;font:700 15px system-ui;cursor:pointer}' +
    '.card.akhl{outline:4px solid #FDF500;outline-offset:3px}@media print{.akb,.akt,.akp{display:none!important}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function media() { return reduce ? '<img src="' + POS + '" alt="">' : '<video src="' + VID + '" poster="' + POS + '" muted loop playsinline autoplay preload="metadata"></video>'; }

  var btn = document.createElement('button'); btn.className = 'akb'; btn.type = 'button'; btn.setAttribute('aria-label', 'Abrir Armorking, el asistente'); btn.innerHTML = media();
  var tip = document.createElement('div'); tip.className = 'akt'; tip.textContent = '¿Qué estás buscando? ¡Pregúntame!';
  var pan = document.createElement('div'); pan.className = 'akp'; pan.hidden = true; pan.setAttribute('role', 'dialog'); pan.setAttribute('aria-label', 'Armorking, asistente de Armor Market');
  pan.innerHTML = '<div class="akh"><div class="av">' + media() + '</div><div><b>ARMORKING</b><small>Tu asistente de Armor Market</small></div><button class="sd" type="button"></button><button class="cl" type="button" aria-label="Cerrar">×</button></div>' +
    '<div class="akm" aria-live="polite"></div><form class="akf"><input type="text" placeholder="Escribe lo que buscas…" autocomplete="off" enterkeyhint="send" maxlength="300"><button type="submit">Enviar</button></form>';
  document.body.appendChild(btn); document.body.appendChild(tip); document.body.appendChild(pan);
  var M = pan.querySelector('.akm'), F = pan.querySelector('form'), I = F.querySelector('input'), SD = pan.querySelector('.sd');
  setTimeout(function () { tip.remove(); }, 9000);
  function pintaSede() { SD.textContent = '📍 ' + SEDES[sede].n + ' ▾'; }
  SD.onclick = function () { var ks = Object.keys(SEDES), i = (ks.indexOf(sede) + 1) % ks.length; sede = ks[i]; try { localStorage.setItem('armor_sede', sede); } catch (e) {} try { document.dispatchEvent(new CustomEvent('armor-sede', { detail: sede })); } catch (e) {} datos.lista = null; pintaSede(); cargar(); burbuja('ak', 'Listo, ahora te muestro lo de ' + SEDES[sede].n + '.'); };
  pintaSede();

  function burbuja(c, t) { var d = document.createElement('div'); d.className = 'mb ' + c; d.textContent = t; M.appendChild(d); M.scrollTop = M.scrollHeight; return d; }
  function waLink(x, texto) {
    var w = x && x.o === 'pets' ? WA_PETS : SEDES[sede].w;
    return 'https://wa.me/' + w + '?text=' + encodeURIComponent(texto);
  }
  function tarjeta(x) {
    var d = document.createElement('div'); d.className = 'akr';
    var img = x.i ? '<img src="' + esc(x.i) + '" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode(\'🛍️\'))">' : (x.o === 'pets' ? '🐾' : '🛍️');
    var ver = x.o === 'web' && document.querySelector('[data-cod="' + x.k + '"]') ? '<button class="v" type="button">Ver</button>' : (x.o === 'pets' && !/pets/.test(location.pathname) ? '<a href="pets?q=' + encodeURIComponent(x.n) + '">Ver en Pets</a>' : '');
    var txt = 'Hola, Armorking me recomendó ' + x.n + (x.k && x.o !== 'pets' ? ' (Cód. ' + x.k.replace(/^B/, '') + ')' : '') + ' a ' + fmt(x.p) + '. ¿Está disponible?' + (x.o !== 'pets' ? ' (Sede ' + SEDES[sede].n + ')' : '');
    d.innerHTML = '<div class="im">' + img + '</div><div class="n">' + esc(x.n) + '</div><div class="p"><b>' + fmt(x.p) + '</b>' + (x.s ? '<span>' + x.s + ' disp.</span>' : '') + (x.o === 'pets' ? '<span>· Armor Pets</span>' : '') + '</div>' +
      '<div class="bt">' + ver + '<a class="w" href="' + waLink(x, txt) + '" target="_blank" rel="noopener">Pedir por WhatsApp</a></div>';
    var v = d.querySelector('.v');
    if (v) v.onclick = function () { var c = document.querySelector('[data-cod="' + x.k + '"]'); c = c && c.closest('.card'); if (!c) return; if (c.hidden || c.offsetParent === null) { var s = document.getElementById('am-query'); if (s) { s.value = x.n; s.dispatchEvent(new Event('input')); } } setTimeout(function () { var cc = document.querySelector('[data-cod="' + x.k + '"]').closest('.card'); cc.scrollIntoView({ behavior: 'smooth', block: 'center' }); cc.classList.add('akhl'); setTimeout(function () { cc.classList.remove('akhl'); }, 2500); if (innerWidth < 700) pan.hidden = true; }, 350); };
    M.appendChild(d);
  }
  var hist = [], ocupado = false;
  function chips(lst) { var c = document.createElement('div'); c.className = 'chips'; lst.forEach(function (t) { var b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.onclick = function () { c.remove(); enviar(t); }; c.appendChild(b); }); M.appendChild(c); }
  function abrir() {
    pan.hidden = false; tip.remove(); btn.style.display = 'none';
    if (!M.childElementCount) {
      burbuja('ak', '¡Hola! Soy Armorking 🛡️. Dime qué buscas, para quién o cuánto quieres gastar, y te consigo opciones con precio y existencia.');
      chips(['Un regalo de $50', 'TV de 55 pulgadas', 'Comida para gato', '¿Hacen delivery?']);
      cargar();
    }
    setTimeout(function () { I.focus(); }, 50);
  }
  btn.onclick = abrir; tip.onclick = abrir;
  pan.querySelector('.cl').onclick = function () { pan.hidden = true; btn.style.display = ''; };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !pan.hidden) { pan.hidden = true; btn.style.display = ''; } });
  F.onsubmit = function (e) { e.preventDefault(); var q = I.value.trim(); if (q) { I.value = ''; enviar(q); } };

  function llamar(q, cand) {
    var body = JSON.stringify({ q: q, sede: sede, historial: hist.slice(-6), candidatos: cand.map(function (x) { return { id: x.id, n: x.n, p: x.p, s: x.s, o: x.o, c: x.c }; }) });
    return fetch(API, { method: 'POST', body: body }).then(function (r) { return r.json(); });
  }
  function mostrar(r, cand, q) {
    var porId = {}; cand.forEach(function (x) { porId[x.id] = x; });
    burbuja('ak', r.texto || 'Mira lo que encontré:');
    (r.productos || []).forEach(function (id) { if (porId[id]) tarjeta(porId[id]); });
    if (r.whatsapp) { var a = document.createElement('a'); a.className = 'akw'; a.target = '_blank'; a.rel = 'noopener'; a.href = waLink(null, 'Hola, vengo de la web de Armor Market. ' + q); a.textContent = '💬 Escribir a ' + SEDES[sede].n + ' por WhatsApp'; M.appendChild(a); }
    M.scrollTop = M.scrollHeight;
  }
  function sinIA(q, cand) {
    var top = cand.slice(0, 6);
    burbuja('ak', top.length ? 'Esto es lo que encontré para "' + q + '":' : 'No conseguí eso en el catálogo 😕. Escríbenos y te ayudamos.');
    top.forEach(tarjeta);
    if (!top.length) mostrar({ texto: '', whatsapp: true }, [], q);
  }
  function enviar(q) {
    if (ocupado) return; ocupado = true; burbuja('me', q);
    var esp = document.createElement('div'); esp.className = 'akd'; esp.textContent = 'Armorking está buscando…'; M.appendChild(esp); M.scrollTop = M.scrollHeight;
    cargar().then(function () {
      var cand = buscar(q);
      if (!API) { esp.remove(); sinIA(q, cand); return; }
      return llamar(q, cand).then(function (r) {
        if (r && r.ok && !(r.productos || []).length && (r.buscar || []).length) {
          var c2 = buscar(r.buscar.join(' '), r.buscar);
          if (c2.length) return llamar(q + ' (' + r.buscar.join(', ') + ')', c2).then(function (r2) { esp.remove(); if (r2 && r2.ok) { mostrar(r2, c2, q); hist.push({ r: 'u', t: q }, { r: 'a', t: r2.texto || '' }); } else sinIA(q, c2); });
        }
        esp.remove();
        if (r && r.ok) { mostrar(r, cand, q); hist.push({ r: 'u', t: q }, { r: 'a', t: r.texto || '' }); }
        else if (r && r.texto) { burbuja('ak', r.texto); mostrar({ texto: '', whatsapp: true }, [], q); }
        else sinIA(q, cand);
      });
    }).catch(function () { esp.remove(); sinIA(q, buscar(q)); }).then(function () { ocupado = false; M.scrollTop = M.scrollHeight; });
  }
})();
