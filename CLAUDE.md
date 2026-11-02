# Armor Market – sitio web (hiperarmormarket.com)

Sitio estático (sin build) publicado con GitHub Pages desde `main`. Cada push publica en ~1 min.
Usuario: Raniel (opera inventario de las 3 sedes). Responder siempre en **español**, conciso y paso a paso.
Commits con autor `Raniel <ortaraniel1@gmail.com>`.

## Pedidos entre sedes (`faltantes.html`)

App interna para que una sede pida a otra mercancía. Sedes: **BOLEITA** (Boleíta), **CHAG** (Chaguaramos), **GUAIRA** (La Guaira).

### Flujo acordado (con la gerente de ventas – no cambiar sin preguntar)
1. La sede entra con nombre + PIN y en **Pedir** ve lo que tiene en 0 y existe en otra sede. Con el buscador (≥2 letras) también salen productos que sí tiene (etiqueta "Aquí hay N") para reponer.
2. Envía el pedido → se genera **un PDF por sede que despacha** y se comparte al grupo de WhatsApp "Pedidos".
3. Quien cotiza en la sede que despacha ajusta la **cantidad asignada** y pulsa **⚙ Generar cotización en Profit** (o anota el número a mano).
4. El puente de esa sede crea la cotización en Profit Plus y el número vuelve a la página.
5. **📄 Compartir cotización** genera otro PDF (con N° de cotización, Solic./Asig.) para el grupo de almacén.

Reglas:
- **Almacén NO tiene potestad en la app** (no hay pestañas de almacén/por facturar/novedades).
- Cada sede ve solo sus propios códigos y solo la parte del pedido que le toca. **Costos** solo para la sede que cotiza y ADMIN.
- Facturación entre sedes: **a costo** (`art.ult_cos_un`), **impuesto tipo 6**, **vendedor siempre `OF`** (Oficina).
- Unidad (UND/CAJA): se muestra junto a cada cantidad; `uniN()` convierte "001"/"01"/"1" → "UND".
- En PC "Compartir" solo descarga el PDF (no abrir WhatsApp Web: choca con el que ya está abierto). En teléfono usa `navigator.share`.
- PDF: "Sede que pide" / "Sede que despacha". jsPDF no dibuja "→": usar texto.

### Piezas
- `faltantes.html` – toda la UI (jsPDF 2.5.2 + autotable 3.8.4 y xlsx 0.18.5 vendorizados en `js/`).
- `faltantes-config.js` – `window.SEDES_API` = URL `/exec` del Apps Script.
- Inventario: JSON `conteo_BOLEITA|CHAG|GUAIRA.json` del repo **ortaraniel1-wq/armor-catalogo-datos** (`cols` + `items`; columnas `codigo, barra, ref, descripcion, linea, sublinea, unidad, …, stock_total`). Se agrupa por barra (≥6 caracteres).
- `apps-script/pedidos-entre-sedes.gs` – backend (Google Sheets). Hojas: `Solicitudes`, `Solicitud_items` (incluye `asignada`, `unidad`), `Cola_Profit`, `Costos_<SEDE>`. Script Properties: `PIN_BOLEITA/PIN_CHAG/PIN_GUAIRA/PIN_ADMIN`, `TOKEN_PUENTE`, `SEQ_PEDIDOS`. Texto con apóstrofo para que Sheets no quite ceros.
  - Acciones con PIN: `entrar, listar, crear, cotizar, anular, generar`. Con token: `costos, cola, cola_ok, cola_error`.
  - **Cada cambio al .gs hay que pegarlo a mano** en Apps Script y publicar: Implementar → Gestionar implementaciones → ✏️ → Nueva versión. Entregar el archivo al usuario y recordárselo.
- `apps-script/puente_cotizaciones.ps1` – corre en cada servidor de Profit (tarea `PuenteCotizacionesArmor`, cada 1 min). Toma la cola, inserta `cotiz_c` + `reng_cac`, correlativo con UPDLOCK en `almacen`, idempotente por descrip "Pedido X". `-Prueba` hace rollback.
- `apps-script/puente_costos.ps1` / `.py` – sube `ult_cos_un` (tarea `PuenteCostosArmor`, cada 30 min).

### Configuración Profit por sede (verificada en cada servidor, no asumir que son iguales)
| Sede | Base | Almacén | Correlativo | Sucursal | Clientes (código del cliente-sede en esa base) |
|---|---|---|---|---|---|
| Chaguaramos | ARMOR | CHAG | CHAG | CHAG | BOLE J500198170, GUAIRA 500198175 |
| La Guaira (otro servidor) | ARMOR | MACUT | MACUT | MACUT | BOLE J500198170, CHAG J505198175 |
| Boleíta (SERVERMCH) | BOLEITA | PRINC | FACN | FACN | GUAIRA 500198175, CHAG J505198175 |

Chaguaramos y La Guaira no tienen Python (solo PowerShell). Acceso a servidores por AnyDesk (lo hace el usuario).

### Probar en local
```
git clone https://github.com/ortaraniel1-wq/armor-catalogo-datos ../armor-catalogo-datos
PORT=8820 node tools/mock-sedes/server.js
# http://localhost:8820/faltantes.html?base=./   PINs mock: 110111 / 220222 / 330333 / 990999
```
El mock emula Apps Script (SpreadsheetApp, PropertiesService…) y evalúa el `.gs` real. Probar con Playwright y mirar capturas antes de publicar.

## Otros
- `armorking.js` + `apps-script/armorking.gs`: asistente con Claude; pendiente que el usuario despliegue el Apps Script y dé la URL para `armorking-config.js`.
- `fotos.html` + `apps-script/fotos-server.gs`, `pedidos.html`: páginas internas (noindex).
