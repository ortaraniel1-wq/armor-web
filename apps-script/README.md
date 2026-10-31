# Backend de /fotos (Apps Script)

Pasos (sin necesidad de saber programar):

1. Entra a https://script.google.com con la cuenta de Armor > **Proyecto nuevo**.
2. Borra lo que haya y pega todo el contenido de `fotos-server.gs`.
3. Arriba del archivo, en `CFG`, revisa/rellena: dueno y repo de GitHub, y (opcional) `DRIVE_FOLDER_ID`, `SHEET_ID`, `PRODUCTOS_URL`. No inventes IDs: si no los usas, deja `''`.
4. Crea en GitHub un token (Settings > Developer settings > Fine-grained tokens) solo para el repo `armor-catalogo-datos`, permiso **Contents: Read and write**.
5. En el editor, abre `configurarPinManual`, escribe tu PIN en lugar de `ESCRIBE_TU_PIN_AQUI`, elige esa funcion arriba y pulsa **Ejecutar** (autoriza los permisos). Luego **borra el PIN del codigo**. Haz lo mismo con `configurarGithubTokenManual` y el token.
6. **Implementar > Nueva implementacion > Aplicacion web**: Ejecutar como **Yo**, Quien tiene acceso **Cualquier persona**. Implementar.
7. Copia la URL que termina en `/exec` y pegala en `fotos-config.js`:
   `window.FOTOS_API = 'https://script.google.com/macros/s/.../exec';`
8. Sube el cambio a la web y prueba en `/fotos`.

Notas:
- El PIN nunca va en el codigo ni en la URL. Tras 5 fallos se bloquea 15 minutos.
- Si cambias el codigo, hay que hacer **Implementar > Administrar implementaciones > Editar > Nueva version**.
- Para cambiar el PIN, repite el paso 5.
