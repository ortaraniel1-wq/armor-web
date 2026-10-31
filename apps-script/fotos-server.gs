/**
 * ARMOR MARKET - Backend de /fotos (Google Apps Script, aplicacion web)
 *
 * Que hace:
 *  - accion "entrar": valida el PIN y devuelve un token de sesion (2 horas).
 *  - accion "subir":  recibe una foto (JPEG base64 ya cuadrada 800x800) y la guarda en
 *                     fotos/<clave>.jpg del repo de GitHub + actualiza fotos.json.
 *                     (La pagina lee las fotos desde raw.githubusercontent.com).
 *  - accion "quitar": borra la foto y su entrada en fotos.json (vuelve a la original).
 *  - doGet: solo responde un "ping" inocuo. NUNCA recibe el PIN.
 *
 * ---------------------------------------------------------------------------
 * COMO DESPLEGAR (resumen; el detalle esta en apps-script/README.md)
 *  1. script.google.com > Proyecto nuevo > pega este archivo.
 *  2. Rellena las constantes de la seccion CONFIGURACION (abajo).
 *  3. Ejecuta UNA vez a mano desde el editor la funcion configurarPinManual()
 *     (escribe tu PIN en esa funcion, ejecuta, y luego BORRA el PIN del codigo).
 *     Haz lo mismo con configurarGithubTokenManual().
 *  4. Implementar > Nueva implementacion > Aplicacion web:
 *       Ejecutar como: Yo   |   Quien tiene acceso: Cualquier persona
 *  5. Copia la URL que termina en /exec a fotos-config.js (window.FOTOS_API).
 * ---------------------------------------------------------------------------
 */

// ======================== CONFIGURACION (rellenar) ========================
var CFG = {
  // Repo de GitHub donde viven fotos/ y fotos.json (el mismo que lee la pagina).
  GITHUB_OWNER:  'ortaraniel1-wq',          // RELLENAR si cambia
  GITHUB_REPO:   'armor-catalogo-datos',    // RELLENAR si cambia
  GITHUB_BRANCH: 'main',

  // OPCIONAL: ID de una carpeta de Drive donde guardar copia de respaldo de cada foto.
  // Dejar '' para no usar Drive. (El ID es lo que va despues de /folders/ en la URL.)
  DRIVE_FOLDER_ID: '',                      // RELLENAR (opcional)

  // OPCIONAL: ID de una hoja de calculo para registrar quien cambio que foto.
  // Dejar '' para no usar hoja. (El ID va entre /d/ y /edit en la URL.)
  SHEET_ID: '',                             // RELLENAR (opcional)
  SHEET_NAME: 'Registro',

  // OPCIONAL: URL publica de pedidos-productos.json para exigir que la clave exista.
  // Si se deja '' solo se valida el formato de la clave.
  PRODUCTOS_URL: '',                        // ej. 'https://TU-DOMINIO/pedidos-productos.json'

  MAX_BYTES: 3 * 1024 * 1024,   // tamano maximo de imagen (3 MB)
  TOKEN_TTL_SEG: 2 * 60 * 60,   // vida del token: 2 horas
  MAX_FALLOS: 5,                // intentos de PIN fallidos antes de bloquear
  BLOQUEO_SEG: 15 * 60,         // bloqueo: 15 minutos
  MAX_TEXTO: 120                // largo maximo de nombre / "por"
};
// ==========================================================================

var RE_CLAVE = /^[A-Za-z0-9_-]{1,40}$/;

// ------------------------- Funciones para ejecutar a mano -----------------
/** Guarda el PIN. No lo registra en logs. */
function configurarPin(pin) {
  pin = String(pin || '');
  if (!/^[0-9A-Za-z]{4,32}$/.test(pin)) throw new Error('PIN invalido: 4 a 32 letras o numeros.');
  PropertiesService.getScriptProperties().setProperty('FOTOS_PIN', pin);
  // Sin Logger.log / console.log del PIN.
}

/** Guarda el token de GitHub (permiso Contents: read/write solo sobre el repo de datos). */
function configurarGithubToken(token) {
  token = String(token || '').trim();
  if (token.length < 20) throw new Error('Token invalido.');
  PropertiesService.getScriptProperties().setProperty('GITHUB_TOKEN', token);
}

/** Atajo para el editor: escribe tu PIN abajo, ejecuta UNA vez y luego BORRA el valor. */
function configurarPinManual() {
  configurarPin('ESCRIBE_TU_PIN_AQUI');
}

/** Atajo para el editor: pega el token de GitHub, ejecuta UNA vez y luego BORRA el valor. */
function configurarGithubTokenManual() {
  configurarGithubToken('PEGA_AQUI_EL_TOKEN_DE_GITHUB');
}

// ------------------------------ Entradas web ------------------------------
function doGet(e) {
  // Solo ping. No acepta PIN ni acciones.
  return salida({ ok: true, ping: 'fotos-armor' });
}

function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) || '';
    if (!raw || raw.length > 5 * 1024 * 1024) return salida({ ok: false, error: 'Solicitud no valida' });
    var d;
    try { d = JSON.parse(raw); } catch (x) { return salida({ ok: false, error: 'Solicitud no valida' }); }
    if (!d || typeof d !== 'object') return salida({ ok: false, error: 'Solicitud no valida' });

    switch (d.accion) {
      case 'entrar': return salida(entrar_(d));
      case 'sesion': return salida(conToken_(d, function () { return { ok: true }; }));
      case 'subir':  return salida(conToken_(d, subir_));
      case 'quitar': return salida(conToken_(d, quitar_));
      default:       return salida({ ok: false, error: 'Solicitud no valida' });
    }
  } catch (err) {
    return salida({ ok: false, error: 'Error del servidor' }); // sin detalles internos
  }
}

function salida(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------ Autenticacion -----------------------------
function entrar_(d) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var props = PropertiesService.getScriptProperties();
    var ahora = Date.now();
    var est = leerJson_(props.getProperty('FOTOS_INTENTOS')) || { n: 0, hasta: 0 };
    if (est.hasta && ahora < est.hasta) return { ok: false, error: 'Acceso no disponible. Intenta mas tarde.' };
    if (est.hasta && ahora >= est.hasta) est = { n: 0, hasta: 0 };

    var pinGuardado = props.getProperty('FOTOS_PIN');
    var ok = !!pinGuardado && typeof d.pin === 'string' && d.pin.length <= 64 && iguales_(d.pin, pinGuardado);
    if (!ok) {
      est.n = (est.n || 0) + 1;
      if (est.n >= CFG.MAX_FALLOS) est = { n: 0, hasta: ahora + CFG.BLOQUEO_SEG * 1000 };
      props.setProperty('FOTOS_INTENTOS', JSON.stringify(est));
      Utilities.sleep(800); // frena fuerza bruta
      return { ok: false, error: 'PIN incorrecto' };
    }
    props.deleteProperty('FOTOS_INTENTOS');
    var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    CacheService.getScriptCache().put('tok_' + hash_(token), '1', CFG.TOKEN_TTL_SEG);
    return { ok: true, token: token, expira: CFG.TOKEN_TTL_SEG };
  } finally {
    lock.releaseLock();
  }
}

function conToken_(d, fn) {
  if (typeof d.token !== 'string' || d.token.length < 32 || d.token.length > 128 ||
      !CacheService.getScriptCache().get('tok_' + hash_(d.token))) {
    return { ok: false, error: 'Sesion vencida. Entra de nuevo.', sesion: false };
  }
  return fn(d);
}

// -------------------------------- Acciones --------------------------------
function subir_(d) {
  var clave = validarClave_(d.clave);
  if (!clave) return { ok: false, error: 'Producto no valido' };
  var nombre = limpiarTexto_(d.nombre), por = limpiarTexto_(d.por);
  if (typeof d.img !== 'string' || !d.img) return { ok: false, error: 'Falta la imagen' };
  if (d.img.length > Math.ceil(CFG.MAX_BYTES * 4 / 3) + 8) return { ok: false, error: 'La imagen es muy grande (max 3 MB)' };

  var bytes;
  try { bytes = Utilities.base64Decode(d.img); } catch (x) { return { ok: false, error: 'Imagen no valida' }; }
  if (bytes.length > CFG.MAX_BYTES) return { ok: false, error: 'La imagen es muy grande (max 3 MB)' };
  var tipo = tipoImagen_(bytes);
  if (!tipo) return { ok: false, error: 'Solo se aceptan imagenes webp, jpeg o png' };

  var v = Date.now();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    // Siempre se guarda como fotos/<clave>.jpg (ruta que espera la pagina; el navegador detecta el formato real).
    ghPut_('fotos/' + clave + '.jpg', Utilities.base64Encode(bytes), 'Foto ' + clave);
    var f = ghLeerFotos_();
    f.json[clave] = { v: v, n: nombre, por: por };
    ghPut_('fotos.json', Utilities.base64Encode(Utilities.newBlob(JSON.stringify(f.json)).getBytes()), 'fotos.json ' + clave, f.sha);
  } finally {
    lock.releaseLock();
  }
  respaldoDrive_(clave, bytes, tipo, v);
  registroHoja_('subir', clave, nombre, por);
  return { ok: true, v: v };
}

function quitar_(d) {
  var clave = validarClave_(d.clave);
  if (!clave) return { ok: false, error: 'Producto no valido' };
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var f = ghLeerFotos_();
    if (f.json[clave]) {
      delete f.json[clave];
      ghPut_('fotos.json', Utilities.base64Encode(Utilities.newBlob(JSON.stringify(f.json)).getBytes()), 'quitar ' + clave, f.sha);
    }
    ghBorrar_('fotos/' + clave + '.jpg', 'Quitar foto ' + clave);
  } finally {
    lock.releaseLock();
  }
  registroHoja_('quitar', clave, '', '');
  return { ok: true };
}

// ------------------------------ Validaciones ------------------------------
function validarClave_(c) {
  if (typeof c !== 'string' || !RE_CLAVE.test(c)) return null;
  if (CFG.PRODUCTOS_URL) {
    var cache = CacheService.getScriptCache();
    if (cache.get('pk_' + c) === null) {
      var obj;
      try {
        obj = JSON.parse(UrlFetchApp.fetch(CFG.PRODUCTOS_URL, { muteHttpExceptions: true }).getContentText());
      } catch (x) { return null; }
      if (!obj || !Object.prototype.hasOwnProperty.call(obj, c)) return null;
      cache.put('pk_' + c, '1', 600);
    }
  }
  return c;
}

function limpiarTexto_(t) {
  return String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().substring(0, CFG.MAX_TEXTO);
}

/** Evita inyeccion de formulas en hojas: antepone ' si empieza con = + - @ */
function seguroHoja_(t) {
  t = String(t == null ? '' : t);
  return /^[=+\-@]/.test(t) ? "'" + t : t;
}

/** Detecta el tipo real por los primeros bytes (jpeg, png, webp). */
function tipoImagen_(b) {
  if (b.length < 12) return null;
  var u = function (i) { return b[i] & 0xff; };
  if (u(0) === 0xff && u(1) === 0xd8 && u(2) === 0xff) return 'image/jpeg';
  if (u(0) === 0x89 && u(1) === 0x50 && u(2) === 0x4e && u(3) === 0x47) return 'image/png';
  if (u(0) === 0x52 && u(1) === 0x49 && u(2) === 0x46 && u(3) === 0x46 &&
      u(8) === 0x57 && u(9) === 0x45 && u(10) === 0x42 && u(11) === 0x50) return 'image/webp';
  return null;
}

// ------------------------------ Utilidades --------------------------------
function hash_(s) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s));
}

/** Comparacion en tiempo constante (compara hashes SHA-256, de largo fijo). */
function iguales_(a, b) {
  var x = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(a));
  var y = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(b));
  var r = 0;
  for (var i = 0; i < x.length; i++) r |= (x[i] ^ y[i]);
  return r === 0;
}

function leerJson_(s) { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } }

// --------------------------------- GitHub ---------------------------------
function ghUrl_(ruta) {
  return 'https://api.github.com/repos/' + CFG.GITHUB_OWNER + '/' + CFG.GITHUB_REPO + '/contents/' + ruta;
}
function ghOpts_(method, body) {
  var tk = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!tk) throw new Error('Falta GITHUB_TOKEN');
  var o = { method: method, muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + tk, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } };
  if (body) { o.contentType = 'application/json'; o.payload = JSON.stringify(body); }
  return o;
}
function ghSha_(ruta) {
  var r = UrlFetchApp.fetch(ghUrl_(ruta) + '?ref=' + CFG.GITHUB_BRANCH, ghOpts_('get'));
  if (r.getResponseCode() === 404) return null;
  if (r.getResponseCode() !== 200) throw new Error('GitHub ' + r.getResponseCode());
  return JSON.parse(r.getContentText()).sha;
}
function ghLeerFotos_() {
  var r = UrlFetchApp.fetch(ghUrl_('fotos.json') + '?ref=' + CFG.GITHUB_BRANCH, ghOpts_('get'));
  if (r.getResponseCode() === 404) return { json: {}, sha: null };
  if (r.getResponseCode() !== 200) throw new Error('GitHub ' + r.getResponseCode());
  var o = JSON.parse(r.getContentText());
  var txt = Utilities.newBlob(Utilities.base64Decode(o.content.replace(/\n/g, ''))).getDataAsString('UTF-8');
  return { json: leerJson_(txt) || {}, sha: o.sha };
}
function ghPut_(ruta, b64, msg, sha) {
  if (sha === undefined) sha = ghSha_(ruta);
  var body = { message: msg, content: b64, branch: CFG.GITHUB_BRANCH };
  if (sha) body.sha = sha;
  var r = UrlFetchApp.fetch(ghUrl_(ruta), ghOpts_('put', body));
  var c = r.getResponseCode();
  if (c !== 200 && c !== 201) throw new Error('GitHub ' + c);
}
function ghBorrar_(ruta, msg) {
  var sha = ghSha_(ruta);
  if (!sha) return;
  var r = UrlFetchApp.fetch(ghUrl_(ruta), ghOpts_('delete', { message: msg, sha: sha, branch: CFG.GITHUB_BRANCH }));
  if (r.getResponseCode() !== 200) throw new Error('GitHub ' + r.getResponseCode());
}

// ----------------------- Respaldo opcional (Drive / hoja) -----------------
function respaldoDrive_(clave, bytes, tipo, v) {
  if (!CFG.DRIVE_FOLDER_ID) return;
  try {
    var ext = tipo === 'image/png' ? 'png' : (tipo === 'image/webp' ? 'webp' : 'jpg');
    DriveApp.getFolderById(CFG.DRIVE_FOLDER_ID).createFile(Utilities.newBlob(bytes, tipo, clave + '_' + v + '.' + ext));
  } catch (e) { /* el respaldo nunca debe romper la subida */ }
}
function registroHoja_(accion, clave, nombre, por) {
  if (!CFG.SHEET_ID) return;
  try {
    var ss = SpreadsheetApp.openById(CFG.SHEET_ID);
    var sh = ss.getSheetByName(CFG.SHEET_NAME) || ss.insertSheet(CFG.SHEET_NAME);
    sh.appendRow([new Date(), seguroHoja_(accion), seguroHoja_(clave), seguroHoja_(nombre), seguroHoja_(por)]);
  } catch (e) { /* idem */ }
}
