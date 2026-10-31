# Armor Market - sitio web

Sitio estático (HTML, CSS y JS sin build) de Armor Market, publicado en https://hiperarmormarket.com con GitHub Pages.

## Estructura

- `index.html`: página de inicio con catálogo y asistente Armorking.
- `deals.html`, `mayor.html`, `catalogo-nuevo.html`, `lista.html`, `pets.html`: páginas públicas.
- `pedidos.html` y `fotos.html`: páginas internas (noindex por `_headers` y excluidas en `robots.txt`).
- `armor-deals-config.js`: configuración de la campaña de ofertas; `armor-deals-status.js/.css` la leen y la muestran.
- `armorking-config.js` / `armorking.js`: asistente Armorking.
- `pedidos-config.js`, `fotos-config.js`, `fotos-live.js`: configuración y lógica de las páginas internas.
- `catalog-layout.js/.css`: diseño del catálogo.
- `productos-web.json`, `pedidos-productos.json`: datos de productos.
- `img/`, `fonts/`, `og*.jpg`: imágenes, tipografías y vistas previas para compartir.
- `_headers`: caché y noindex. `robots.txt` y `sitemap.xml`: SEO. `CNAME`: dominio personalizado.

## Ver en local

Sirve la carpeta con cualquier servidor estático, por ejemplo:

    python -m http.server 8000

y abre http://localhost:8000.

## Despliegue

Se publica con GitHub Pages desde la rama `main`. El archivo `CNAME` apunta al dominio `hiperarmormarket.com`.

## Campañas de ofertas

Edita `armor-deals-config.js`: `enabled` (true/false), `startsAt` y `endsAt` (con zona horaria -04:00). La campaña solo se muestra si `enabled` es `true` y las fechas son válidas.
