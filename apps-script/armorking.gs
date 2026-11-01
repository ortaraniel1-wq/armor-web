/**
 * ARMORKING · cerebro (IA) del asistente de hiperarmormarket.com
 *
 * La página (armorking.js) ya busca los productos candidatos con precio y existencia
 * y los manda aquí. Este script le pregunta a Claude cuáles mostrar y qué decir.
 *
 * Recibe:  { q, sede:'B'|'C'|'G', historial:[{r,t}], candidatos:[{id,n,p,s,o,c}] }
 * Devuelve:{ ok, texto, productos:[id...], whatsapp:bool, buscar:[palabras] }
 *
 * La clave va en: Configuración del proyecto → Propiedades del script → ANTHROPIC_API_KEY
 */

const MODELO = 'claude-haiku-5-5';   // el más económico
const MAX_POR_HORA = 300;            // freno de gasto
const SEDES = { B: 'Boleíta', C: 'Chaguaramos', G: 'La Guaira' };

const SISTEMA = `Eres Armorking, el caballerito asistente de Armor Market (tiendas en Boleíta, Chaguaramos y La Guaira, Caracas, Venezuela).
Hablas español venezolano, cálido y breve.
Recibes la pregunta del cliente y una lista CANDIDATOS del inventario real (id, n=nombre, p=precio USD, s=existencia, o=origen, c=categoría).

Responde SOLO con un JSON válido, sin texto antes ni después, con esta forma:
{"texto":"...","productos":["id1","id2"],"whatsapp":false,"buscar":[]}

Reglas:
- "texto": máximo 2 frases. No repitas precios ni nombres de los productos que muestras (la página ya pinta tarjetas con eso).
- "productos": hasta 4 ids de CANDIDATOS que de verdad respondan a lo que pide, el mejor primero. Solo con existencia s > 0. Nunca inventes ids.
- Si piden un presupuesto ("regalo de $50"), elige productos con precio cercano o menor.
- Si ningún candidato sirve pero crees que con otras palabras sí aparecería (ej: "corneta" → "parlante","bocina"), deja "productos" vacío y pon en "buscar" 2-4 palabras alternativas.
- Si preguntan por delivery, horarios, pagos, apartados o algo que no es un producto, o no hay nada que sirva: "whatsapp": true y di que la sede le confirma por WhatsApp.
- Nunca inventes productos, precios, existencias, horarios ni políticas.`;

function doPost(e) {
  try {
    const b = JSON.parse((e.postData && e.postData.contents) || '{}');
    const q = String(b.q || '').trim().slice(0, 300);
    if (!q) return salida({ ok: false, texto: 'Escríbeme qué estás buscando 🙂' });
    if (!dentroDelLimite()) return salida({ ok: false, texto: 'Estoy atendiendo a muchos clientes ahora mismo. Escríbenos por WhatsApp y te ayudamos enseguida.' });

    const cand = (b.candidatos || []).slice(0, 40).map(x => ({
      id: String(x.id), n: String(x.n || '').slice(0, 120), p: Number(x.p) || 0, s: Number(x.s) || 0, o: x.o, c: String(x.c || '').slice(0, 40)
    }));
    const ids = new Set(cand.map(x => x.id));
    const hist = (b.historial || []).slice(-6).map(h => (h.r === 'u' ? 'Cliente: ' : 'Armorking: ') + String(h.t || '').slice(0, 300)).join('\n');

    const prompt =
      `SEDE DEL CLIENTE: ${SEDES[b.sede] || 'Boleíta'}\n` +
      (hist ? `CONVERSACIÓN PREVIA:\n${hist}\n` : '') +
      `CANDIDATOS:\n${JSON.stringify(cand)}\n\nPREGUNTA: ${q}`;

    const r = leerJSON(claude(prompt));
    const out = {
      ok: true,
      texto: String(r.texto || '').slice(0, 400),
      productos: (r.productos || []).map(String).filter(id => ids.has(id)).slice(0, 4),
      whatsapp: !!r.whatsapp,
      buscar: (r.buscar || []).map(String).slice(0, 4)
    };
    registrar(q, b.sede, cand.length, out);
    return salida(out);
  } catch (err) {
    console.error(err);
    return salida({ ok: false });   // la página cae sola al buscador sin IA
  }
}
function doGet() { return salida({ ok: true, servicio: 'armorking' }); }
function salida(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function claude(prompt) {
  const key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!key) throw new Error('Falta ANTHROPIC_API_KEY en Propiedades del script');
  const r = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({ model: MODELO, max_tokens: 400, system: SISTEMA, messages: [{ role: 'user', content: prompt }] })
  });
  if (r.getResponseCode() !== 200) throw new Error('Anthropic ' + r.getResponseCode() + ': ' + r.getContentText());
  return JSON.parse(r.getContentText()).content.filter(x => x.type === 'text').map(x => x.text).join('');
}
function leerJSON(t) {
  const a = t.indexOf('{'), z = t.lastIndexOf('}');
  if (a < 0 || z < a) return { texto: t.trim() };
  try { return JSON.parse(t.slice(a, z + 1)); } catch (e) { return { texto: '' }; }
}

function dentroDelLimite() {
  const c = CacheService.getScriptCache();
  const k = 'n_' + Utilities.formatDate(new Date(), 'America/Caracas', 'yyyyMMddHH');
  const n = Number(c.get(k) || 0) + 1;
  c.put(k, String(n), 3700);
  return n <= MAX_POR_HORA;
}
/** Si el script está dentro de un Google Sheets, anota cada pregunta en la hoja "Armorking". */
function registrar(q, sede, nCand, out) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet(); if (!ss) return;
    const h = ss.getSheetByName('Armorking') || ss.insertSheet('Armorking');
    if (h.getLastRow() === 0) h.appendRow(['Fecha', 'Sede', 'Pregunta', 'Candidatos', 'Mostró', 'WhatsApp', 'Respuesta']);
    h.appendRow([new Date(), SEDES[sede] || sede, q, nCand, out.productos.length, out.whatsapp ? 'sí' : '', out.texto]);
  } catch (e) {}
}

/* Prueba desde el editor: elige "probar" y dale Ejecutar */
function probar() {
  const fake = { postData: { contents: JSON.stringify({
    q: 'busco un regalo para mi papá de unos 30 dólares', sede: 'B',
    candidatos: [
      { id: 't:1', n: 'Reloj deportivo', p: 28, s: 4, o: 'tienda', c: 'Tecnología' },
      { id: 't:2', n: 'Harina Pan 1kg', p: 1.5, s: 600, o: 'tienda', c: 'Bodegón' },
      { id: 't:3', n: 'Audífonos Bluetooth', p: 25, s: 0, o: 'tienda', c: 'Tecnología' }
    ] }) } };
  console.log(doPost(fake).getContent());
}
