/**
 * PEDIDOS ENTRE SEDES · Armor Market  (versión 2: flujo sencillo)
 * Backend (Apps Script + Google Sheets) de hiperarmormarket.com/faltantes.html
 *
 * Flujo:
 *   1. La sede pide en la página → se registra con un NÚMERO (ej. BOL-000012)
 *      y la página genera el documento PDF para el grupo de WhatsApp "Pedidos".
 *   2. Quien toma el pedido monta la cotización en Profit con las cantidades que
 *      considere y la pasa a almacén por su grupo. En la página puede marcarlo
 *      como "Cotizado" con el número de cotización (opcional, para el historial).
 *
 * Estados: Enviado → Cotizado   (o Anulado por la sede que pidió)
 *
 * INSTALACIÓN / ACTUALIZACIÓN: pega este archivo en el Apps Script, guarda y
 *   Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva versión → Implementar
 *   (así la URL /exec no cambia). Las hojas nuevas se crean solas.
 */

const SEDES = { BOLEITA: 'Boleíta', CHAG: 'Chaguaramos', GUAIRA: 'La Guaira', ADMIN: 'Administración' };
const PREF  = { BOLEITA: 'BOL', CHAG: 'CHA', GUAIRA: 'GUA', ADMIN: 'ADM' };
const H_SOL = 'Solicitudes', H_DET = 'Solicitud_items';
const COL_SOL = ['numero', 'fecha', 'sede', 'creado_por', 'origenes', 'productos', 'unidades', 'estado', 'nro_cotizacion', 'cotizado_por', 'actualizado', 'nota'];
/* columnas que deben guardarse como texto (Sheets les quita los ceros a la izquierda o las vuelve fecha) */
const TEXTO = new Set(['fecha', 'actualizado', 'nro_cotizacion', 'cod_origen', 'barra', 'cod_sede']);
const COL_DET = ['numero', 'n', 'origen', 'cod_origen', 'barra', 'descripcion', 'rubro', 'cod_sede', 'disp_origen', 'cantidad', 'asignada'];

/* ---------- configuración inicial (opcional: las hojas también se crean solas) ---------- */
function configurar() {
  asegurarHojas();
  const p = PropertiesService.getScriptProperties();
  const def = { PIN_BOLEITA: '110111', PIN_CHAG: '220222', PIN_GUAIRA: '330333', PIN_ADMIN: '990999' };
  Object.keys(def).forEach(k => { if (!p.getProperty(k)) p.setProperty(k, def[k]); });
  if (!p.getProperty('TOKEN_PUENTE')) p.setProperty('TOKEN_PUENTE', Utilities.getUuid());
  console.log('Listo. TOKEN_PUENTE = ' + p.getProperty('TOKEN_PUENTE'));
}
function asegurarHojas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  [[H_SOL, COL_SOL], [H_DET, COL_DET]].forEach(([n, cols]) => {
    let h = ss.getSheetByName(n);
    if (!h) h = ss.insertSheet(n);
    if (h.getLastRow() === 0) { h.appendRow(cols); h.setFrozenRows(1); h.getRange(1, 1, 1, cols.length).setFontWeight('bold'); }
    else {   // agrega columnas nuevas al encabezado si faltan (ej. 'asignada')
      const cab = h.getRange(1, 1, 1, Math.max(h.getLastColumn(), 1)).getValues()[0];
      cols.forEach((c, j) => { if (cab[j] !== c && !cab.includes(c)) h.getRange(1, j + 1).setValue(c).setFontWeight('bold'); });
    }
  });
}

/* ---------- entrada ---------- */
function doGet(e) { return responder(e.parameter || {}); }
function doPost(e) {
  let b = {};
  try { b = JSON.parse((e.postData && e.postData.contents) || '{}'); } catch (err) {}
  return responder(b);
}
function responder(b) {
  try {
    const acc = b.accion;
    if (acc === 'costos') return json(recibirCostos(b));   // compatibilidad con el puente de costos
    const sede = login(b.sede, b.pin);
    const escribe = ['crear', 'cotizar', 'anular'].includes(acc);
    const lock = LockService.getScriptLock();
    if (escribe) { lock.waitLock(20000); asegurarHojas(); }
    try {
      switch (acc) {
        case 'entrar':  return json({ ok: true, sede, nombre: SEDES[sede] });
        case 'listar':  return json({ ok: true, pedidos: listar(sede) });
        case 'crear':   return json(crear(sede, b));
        case 'cotizar': return json(cotizar(sede, b));
        case 'anular':  return json(anular(sede, b));
        default:        return json({ ok: false, error: 'Acción desconocida' });
      }
    } finally { if (escribe) lock.releaseLock(); }
  } catch (err) {
    return json({ ok: false, error: String(err.message || err) });
  }
}
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function login(sede, pin) {
  if (!SEDES[sede]) throw new Error('Sede no válida');
  const ok = PropertiesService.getScriptProperties().getProperty('PIN_' + sede);
  if (!ok || String(pin) !== ok) throw new Error('PIN incorrecto');
  return sede;
}

/* ---------- utilidades ---------- */
function hoja(n) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(n); }
function leer(n) {
  const h = hoja(n); if (!h || h.getLastRow() < 2) return [];
  const v = h.getDataRange().getValues(), cols = v.shift();
  return v.map((r, i) => { const o = { _fila: i + 2 }; cols.forEach((c, j) => o[c] = r[j] instanceof Date ? Utilities.formatDate(r[j], 'America/Caracas', 'yyyy-MM-dd HH:mm') : r[j]); return o; });
}
function escribirFila(n, cols, obj) {
  hoja(n).getRange(obj._fila, 1, 1, cols.length).setValues([cols.map(c => obj[c] === undefined ? '' : (TEXTO.has(c) && obj[c] !== '' ? "'" + obj[c] : obj[c]))]);
}
function ahora() { return Utilities.formatDate(new Date(), 'America/Caracas', 'yyyy-MM-dd HH:mm'); }
function puedeVer(sede, p) {
  return sede === 'ADMIN' || p.sede === sede || String(p.origenes).split(',').includes(sede);
}

/* ---------- acciones ---------- */
function listar(sede) {
  const limite = Utilities.formatDate(new Date(Date.now() - 60 * 864e5), 'America/Caracas', 'yyyy-MM-dd');
  const sols = leer(H_SOL).filter(p => puedeVer(sede, p) && String(p.fecha) >= limite);
  const nums = new Set(sols.map(p => p.numero)), det = {};
  leer(H_DET).forEach(it => { if (nums.has(it.numero)) { const o = Object.assign({}, it); delete o._fila; (det[it.numero] = det[it.numero] || []).push(o); } });
  return sols.map(p => {
    const o = Object.assign({}, p); delete o._fila;
    let its = (det[p.numero] || []).sort((a, b) => a.n - b.n);
    if (sede !== 'ADMIN' && p.sede !== sede) its = its.filter(i => i.origen === sede);   // cada sede ve solo lo que le piden a ella
    // costo: solo para la sede que cotiza (la de origen) y Administración
    its.forEach(i => { if (sede === 'ADMIN' || i.origen === sede) { const c = costos(i.origen)[String(i.cod_origen).trim()]; i.costo = c === undefined ? '' : c; } });
    o.items = its; return o;
  })
             .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.numero).localeCompare(String(a.numero)));
}

function crear(sede, b) {
  const destino = sede === 'ADMIN' ? b.destino : sede;
  if (!SEDES[destino] || destino === 'ADMIN') throw new Error('Sede no válida');
  const items = (b.items || []).filter(x => Number(x.cantidad) > 0 && SEDES[x.origen] && x.origen !== destino && x.origen !== 'ADMIN');
  if (!items.length) throw new Error('El pedido no tiene productos');
  const props = PropertiesService.getScriptProperties();
  const seq = Number(props.getProperty('SEQ_PEDIDOS') || 0) + 1;
  props.setProperty('SEQ_PEDIDOS', String(seq));
  const numero = PREF[destino] + '-' + String(seq).padStart(6, '0');
  const origenes = [...new Set(items.map(x => x.origen))];
  const unidades = items.reduce((s, x) => s + Number(x.cantidad), 0);
  const fecha = ahora();
  const t = v => "'" + v;
  hoja(H_SOL).appendRow(COL_SOL.map(c => ({
    numero, fecha: t(fecha), sede: destino, creado_por: String(b.por || '').slice(0, 40), origenes: origenes.join(','),
    productos: items.length, unidades, estado: 'Enviado', actualizado: t(fecha), nota: String(b.nota || '').slice(0, 300)
  })[c] ?? ''));
  const filas = items.map((x, i) => COL_DET.map(c => ({
    numero, n: i + 1, origen: x.origen, cod_origen: t(x.codO), barra: t(x.barra), descripcion: x.desc, rubro: x.rubro,
    cod_sede: t(x.codB), disp_origen: Number(x.disp) || 0, cantidad: Number(x.cantidad)
  })[c] ?? ''));
  const h = hoja(H_DET);
  h.getRange(h.getLastRow() + 1, 1, filas.length, COL_DET.length).setValues(filas);
  return { ok: true, numero, fecha };
}

/* Cotización por sede de origen: "GUAIRA:00045, CHAG:00046" */
function mapa(t) { const m = {}; String(t || '').split(',').forEach(x => { const i = x.indexOf(':'); if (i > 0) m[x.slice(0, i).trim()] = x.slice(i + 1).trim(); }); return m; }
function texto(m) { return Object.keys(m).map(k => k + ':' + m[k]).join(', '); }

/* Quien tomó el pedido anota su cotización (opcional) */
function cotizar(sede, b) {
  const p = leer(H_SOL).find(x => x.numero === b.numero);
  if (!p) throw new Error('Pedido no encontrado');
  const origenes = String(p.origenes).split(',');
  const origen = sede === 'ADMIN' ? b.origen : sede;
  if (!origenes.includes(origen)) throw new Error('A tu sede no le pidieron nada en este pedido');
  if (p.estado === 'Anulado') throw new Error('El pedido está anulado');
  if (!String(b.nro_cotizacion || '').trim()) throw new Error('Escribe el número de cotización');
  const cot = mapa(p.nro_cotizacion), por = mapa(p.cotizado_por);
  cot[origen] = String(b.nro_cotizacion).trim().slice(0, 30).replace(/[:,]/g, ' ');
  por[origen] = String(b.por || '').slice(0, 40).replace(/[:,]/g, ' ');
  p.nro_cotizacion = texto(cot); p.cotizado_por = texto(por);
  p.estado = origenes.every(o => cot[o]) ? 'Cotizado' : 'Enviado';
  // cantidades asignadas por quien cotiza (si no manda, queda igual a lo solicitado)
  const asig = b.asignadas || {};
  leer(H_DET).filter(it => it.numero === p.numero && it.origen === origen).forEach(it => {
    it.asignada = asig[it.n] === undefined ? Number(it.cantidad) : Math.max(0, Math.floor(Number(asig[it.n]) || 0));
    escribirFila(H_DET, COL_DET, it);
  });
  p.actualizado = ahora();
  escribirFila(H_SOL, COL_SOL, p);
  return { ok: true, estado: p.estado };
}

function anular(sede, b) {
  const p = leer(H_SOL).find(x => x.numero === b.numero);
  if (!p) throw new Error('Pedido no encontrado');
  if (sede !== 'ADMIN' && p.sede !== sede) throw new Error('Solo la sede que pidió puede anularlo');
  if (p.estado !== 'Enviado' || String(p.nro_cotizacion || '').trim()) throw new Error('Ya lo están cotizando; no se puede anular');
  p.estado = 'Anulado'; p.actualizado = ahora();
  escribirFila(H_SOL, COL_SOL, p);
  return { ok: true };
}

/* ---------- costos (los manda el puente de cada sede cada 30 min; se muestran en Pedidos a la sede que cotiza) ---------- */
const _costos = {};
function costos(sede) {
  if (_costos[sede]) return _costos[sede];
  const m = {}, h = hoja('Costos_' + sede);
  if (h && h.getLastRow() > 1) h.getRange(2, 1, h.getLastRow() - 1, 2).getValues().forEach(r => { if (r[0] !== '') m[String(r[0]).trim()] = Number(r[1]) || 0; });
  return _costos[sede] = m;
}
function recibirCostos(b) {
  const tok = PropertiesService.getScriptProperties().getProperty('TOKEN_PUENTE');
  if (!tok || b.token !== tok) return { ok: false, error: 'Token inválido' };
  if (!SEDES[b.sede] || b.sede === 'ADMIN') return { ok: false, error: 'Sede no válida' };
  const filas = (b.costos || []).map(r => [String(r[0]).trim(), Number(r[1]) || 0]).filter(r => r[0]);
  if (!filas.length) return { ok: false, error: 'Sin costos' };
  const ss = SpreadsheetApp.getActiveSpreadsheet(), n = 'Costos_' + b.sede;
  const h = ss.getSheetByName(n) || ss.insertSheet(n);
  h.clearContents();
  h.getRange(1, 1, 1, 3).setValues([['codigo', 'ult_costo', 'actualizado: ' + ahora()]]);
  h.getRange(2, 1, filas.length, 1).setNumberFormat('@');
  h.getRange(2, 1, filas.length, 2).setValues(filas);
  return { ok: true, recibidos: filas.length };
}
