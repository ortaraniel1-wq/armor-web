/**
 * PEDIDOS ENTRE SEDES · Armor Market
 * Backend (Apps Script + Google Sheets) de hiperarmormarket.com/faltantes.html
 *
 * Flujo:  Solicitado → En preparación → Por facturar → Facturado   (o Anulado)
 *   - La sede que pide crea el pedido (uno por sede de origen).
 *   - El almacén de la sede de origen marca cada producto: Listo (con cantidad) o Novedad.
 *   - "Procesar": lo Listo pasa a Por facturar con el ÚLTIMO COSTO de la sede que factura;
 *     las novedades quedan registradas.
 *   - La sede que factura monta la factura en Profit y la marca como Facturado.
 *
 * INSTALACIÓN: crea un Google Sheets nuevo → Extensiones → Apps Script → pega este archivo
 *   → ejecuta "configurar" una vez (crea las hojas y los PIN) → Implementar como Aplicación web
 *   (Ejecutar como: Yo · Acceso: Cualquier usuario).
 */

const SEDES = { BOLEITA: 'Boleíta', CHAG: 'Chaguaramos', GUAIRA: 'La Guaira', ADMIN: 'Administración' };
const H_PED = 'Pedidos', H_ITEM = 'Items';
const COL_PED = ['id', 'fecha', 'destino', 'origen', 'estado', 'creado_por', 'actualizado', 'preparado_por', 'facturado_por', 'nro_factura', 'total_costo', 'nota'];
const COL_ITEM = ['pedido_id', 'n', 'cod_origen', 'barra', 'descripcion', 'rubro', 'cod_destino', 'disp_sistema', 'pedida', 'preparada', 'estado', 'nota', 'costo'];

/* ---------- configuración inicial (ejecutar una vez desde el editor) ---------- */
function configurar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  [[H_PED, COL_PED], [H_ITEM, COL_ITEM]].forEach(([n, cols]) => {
    const h = ss.getSheetByName(n) || ss.insertSheet(n);
    if (h.getLastRow() === 0) { h.appendRow(cols); h.setFrozenRows(1); }
  });
  const p = PropertiesService.getScriptProperties();
  const def = { PIN_BOLEITA: '110111', PIN_CHAG: '220222', PIN_GUAIRA: '330333', PIN_ADMIN: '990999' };
  Object.keys(def).forEach(k => { if (!p.getProperty(k)) p.setProperty(k, def[k]); });
  if (!p.getProperty('TOKEN_PUENTE')) p.setProperty('TOKEN_PUENTE', Utilities.getUuid());
  console.log('Listo. PINs y TOKEN_PUENTE en Configuración del proyecto → Propiedades del script.');
  console.log('TOKEN_PUENTE = ' + p.getProperty('TOKEN_PUENTE'));
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
    if (acc === 'costos') return json(recibirCostos(b));
    const sede = login(b.sede, b.pin);
    const lock = LockService.getScriptLock();
    const escribe = ['crear', 'preparar', 'procesar', 'facturar', 'anular'].includes(acc);
    if (escribe) lock.waitLock(20000);
    try {
      switch (acc) {
        case 'entrar':   return json({ ok: true, sede, nombre: SEDES[sede] });
        case 'listar':   return json({ ok: true, pedidos: listar(sede) });
        case 'crear':    return json(crear(sede, b));
        case 'preparar': return json(preparar(sede, b, false));
        case 'procesar': return json(preparar(sede, b, true));
        case 'facturar': return json(facturar(sede, b));
        case 'anular':   return json(anular(sede, b));
        default:         return json({ ok: false, error: 'Acción desconocida' });
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

/* ---------- utilidades de hoja ---------- */
function hoja(n) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(n); }
function leer(n) {
  const h = hoja(n), v = h.getDataRange().getValues(), cols = v.shift();
  return v.map((r, i) => { const o = { _fila: i + 2 }; cols.forEach((c, j) => o[c] = r[j]); return o; });
}
function escribirFila(n, cols, obj) {
  const h = hoja(n);
  h.getRange(obj._fila, 1, 1, cols.length).setValues([cols.map(c => obj[c] === undefined ? '' : obj[c])]);
}
function ahora() { return Utilities.formatDate(new Date(), 'America/Caracas', 'yyyy-MM-dd HH:mm'); }
function puedeVer(sede, p) { return sede === 'ADMIN' || p.destino === sede || p.origen === sede; }

/* ---------- acciones ---------- */
function listar(sede) {
  const limite = new Date(Date.now() - 30 * 864e5);
  const peds = leer(H_PED).filter(p => puedeVer(sede, p) &&
    (!['Facturado', 'Anulado'].includes(p.estado) || new Date(String(p.actualizado).replace(' ', 'T')) > limite));
  const ids = new Set(peds.map(p => p.id));
  const items = {};
  leer(H_ITEM).forEach(it => { if (ids.has(it.pedido_id)) (items[it.pedido_id] = items[it.pedido_id] || []).push(it); });
  return peds.map(p => {
    const verCosto = sede === 'ADMIN' || p.origen === sede;
    const its = (items[p.id] || []).sort((a, b) => a.n - b.n).map(it => {
      const o = Object.assign({}, it); delete o._fila; if (!verCosto) delete o.costo; return o;
    });
    const o = Object.assign({}, p); delete o._fila; if (!verCosto) delete o.total_costo;
    o.items = its; return o;
  }).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
}

function crear(sede, b) {
  const destino = sede === 'ADMIN' ? b.destino : sede;
  const origen = b.origen;
  if (!SEDES[destino] || !SEDES[origen] || destino === origen || origen === 'ADMIN' || destino === 'ADMIN') throw new Error('Sedes no válidas');
  const items = (b.items || []).filter(x => Number(x.pedida) > 0);
  if (!items.length) throw new Error('El pedido no tiene productos');
  const id = 'P' + Utilities.formatDate(new Date(), 'America/Caracas', 'yyMMdd-HHmmss') + '-' + origen.slice(0, 3);
  hoja(H_PED).appendRow(COL_PED.map(c => ({
    id, fecha: ahora(), destino, origen, estado: 'Solicitado', creado_por: String(b.por || '').slice(0, 40),
    actualizado: ahora(), nota: String(b.nota || '').slice(0, 300)
  })[c] ?? ''));
  const filas = items.map((x, i) => COL_ITEM.map(c => ({
    pedido_id: id, n: i + 1, cod_origen: x.codO, barra: x.barra, descripcion: x.desc, rubro: x.rubro,
    cod_destino: x.codB, disp_sistema: Number(x.disp) || 0, pedida: Number(x.pedida), preparada: '', estado: 'Pendiente', nota: '', costo: ''
  })[c] ?? ''));
  hoja(H_ITEM).getRange(hoja(H_ITEM).getLastRow() + 1, 1, filas.length, COL_ITEM.length).setValues(filas);
  return { ok: true, id };
}

/* El almacén de la sede de origen guarda su avance; con procesar=true lo cierra */
function preparar(sede, b, procesar) {
  const p = leer(H_PED).find(x => x.id === b.id);
  if (!p) throw new Error('Pedido no encontrado');
  if (sede !== 'ADMIN' && p.origen !== sede) throw new Error('Este pedido lo prepara ' + SEDES[p.origen]);
  if (!['Solicitado', 'En preparación'].includes(p.estado)) throw new Error('El pedido ya está ' + p.estado);
  const cambios = {}; (b.items || []).forEach(x => cambios[x.n] = x);
  const its = leer(H_ITEM).filter(x => x.pedido_id === b.id);
  its.forEach(it => {
    const c = cambios[it.n]; if (!c) return;
    if (c.estado === 'Listo' || c.estado === 'Novedad' || c.estado === 'Pendiente') it.estado = c.estado;
    it.preparada = c.preparada === '' || c.preparada == null ? '' : Math.max(0, Number(c.preparada));
    it.nota = String(c.nota || '').slice(0, 120);
  });
  if (procesar) {
    const pend = its.filter(it => it.estado === 'Pendiente');
    if (pend.length) throw new Error('Faltan ' + pend.length + ' productos por marcar (Listo o Novedad)');
    const costos = costosDe(p.origen);
    let total = 0, sinCosto = 0;
    its.forEach(it => {
      if (it.estado === 'Listo' && !(Number(it.preparada) > 0)) it.estado = 'Novedad';
      if (it.estado === 'Listo') {
        const c = costos[String(it.cod_origen)];
        it.costo = c === undefined ? '' : c;
        if (c === undefined) sinCosto++; else total += c * Number(it.preparada);
      }
    });
    p.estado = its.some(it => it.estado === 'Listo') ? 'Por facturar' : 'Anulado';
    p.total_costo = Math.round(total * 100) / 100;
    p.preparado_por = String(b.por || '').slice(0, 40);
    if (sinCosto) p.nota = (p.nota ? p.nota + ' · ' : '') + sinCosto + ' producto(s) sin costo: revisar';
  } else {
    p.estado = 'En preparación';
  }
  p.actualizado = ahora();
  its.forEach(it => escribirFila(H_ITEM, COL_ITEM, it));
  escribirFila(H_PED, COL_PED, p);
  return { ok: true, estado: p.estado, total_costo: p.total_costo };
}

function facturar(sede, b) {
  const p = leer(H_PED).find(x => x.id === b.id);
  if (!p) throw new Error('Pedido no encontrado');
  if (sede !== 'ADMIN' && p.origen !== sede) throw new Error('Este pedido lo factura ' + SEDES[p.origen]);
  if (p.estado !== 'Por facturar') throw new Error('El pedido está ' + p.estado);
  if (!String(b.nro_factura || '').trim()) throw new Error('Escribe el número de factura de Profit');
  p.estado = 'Facturado'; p.nro_factura = String(b.nro_factura).trim().slice(0, 30);
  p.facturado_por = String(b.por || '').slice(0, 40); p.actualizado = ahora();
  escribirFila(H_PED, COL_PED, p);
  return { ok: true };
}

function anular(sede, b) {
  const p = leer(H_PED).find(x => x.id === b.id);
  if (!p) throw new Error('Pedido no encontrado');
  if (sede !== 'ADMIN' && p.destino !== sede) throw new Error('Solo la sede que pidió puede anularlo');
  if (p.estado !== 'Solicitado') throw new Error('Ya lo están preparando; no se puede anular');
  p.estado = 'Anulado'; p.actualizado = ahora();
  escribirFila(H_PED, COL_PED, p);
  return { ok: true };
}

/* ---------- costos (los manda el puente de cada sede; nunca pasan por GitHub) ---------- */
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
  CacheService.getScriptCache().remove('cos_' + b.sede);
  return { ok: true, recibidos: filas.length };
}
function costosDe(sede) {
  const h = hoja('Costos_' + sede);
  const m = {};
  if (!h || h.getLastRow() < 2) return m;
  h.getRange(2, 1, h.getLastRow() - 1, 2).getValues().forEach(r => { if (r[0] !== '') m[String(r[0]).trim()] = Number(r[1]) || 0; });
  return m;
}
