# Almacenamiento unificado de imágenes en Google Drive

**Fecha:** 2026-07-10
**Estado:** Diseño aprobado
**Autor:** Said + Claude (brainstorming)

## Problema

Casa Shé guarda imágenes en varios lugares con estrategias inconsistentes:

- **Perfil de clientas** ([backend/src/routes/users.ts:1362](../../../backend/src/routes/users.ts)) — ya sube a Google Drive si hay credenciales; si no, guarda base64 en la BD.
- **Coach / instructoras** ([backend/src/routes/instructors.ts:483](../../../backend/src/routes/instructors.ts)) — igual: Drive si configurado, base64 de respaldo.
- **Productos de barra / bebidas (Fuel Bar)** ([backend/src/routes/products.ts](../../../backend/src/routes/products.ts)) — `image_url` es solo un campo de texto que el admin pega a mano; **no existe subida de archivo**.
- **Comprobantes de pago** ([backend/src/routes/orders.ts:590](../../../backend/src/routes/orders.ts)) — solo base64 en la BD; nunca toca Drive (comentario en el código: *"in production you'd upload to S3/cloud storage"*).

Consecuencias: la lógica Drive-o-base64 está **duplicada** entre `users.ts` e `instructors.ts`, la BD acumula blobs base64 pesados (comprobantes y fotos viejas), y la barra no permite subir imagen desde el panel.

La integración de Drive **ya está construida y probada** en [backend/src/lib/googleDrive.ts](../../../backend/src/lib/googleDrive.ts) (OAuth refresh token, subida multipart, hacer público, thumbnails) y se usa en producción para videos. Lo que falta es **configuración** + **unificar y extender** el uso a todos los puntos.

## Objetivo

Que **todas** las imágenes del sistema (perfil, coach, barra/bebidas, comprobantes) se guarden en Google Drive mediante un único módulo compartido, con respaldo base64 transparente, y migrar las imágenes base64 ya existentes a Drive.

## Decisiones tomadas

- **Cuenta de Google:** Gmail normal del negocio, autenticación **OAuth refresh token** (lo que el código ya usa). Usa la cuota de Drive de esa cuenta (15 GB gratis).
- **Alcance:** encender Drive (config) + extender a barra y comprobantes + migrar base64 viejas.
- **Refactor:** unificar todo en un helper compartido y migrar perfil + coach a usarlo (no dejar la duplicación).
- **Enfoque descartado B (Service Account + Shared Drive):** requiere Google Workspace de pago; reescribe código que ya sirve.
- **Enfoque descartado C (Cloudinary para imágenes):** cuesta dinero al escalar; el usuario quiere su propio Drive gratis. Se deja como camino futuro si el volumen crece.

## No-objetivos (YAGNI)

- No migrar los videos (ya funcionan con Drive/Cloudinary).
- No construir un CDN ni pipeline de transformación de imágenes.
- No cambiar a Service Account ni Shared Drive.
- No agregar tipos de imagen nuevos fuera de los 4 puntos listados.

## Arquitectura

Un solo módulo de almacenamiento centraliza toda subida de imagen. Cada punto llama a la misma función:

```
Cliente sube imagen ──► endpoint (multer, memoryStorage)
                          │
                          ▼
              subirImagen(buffer, mime, nombreBase, { carpeta })
                          │
              ┌───────────┴────────────┐
        Drive configurado?          no configurado / Drive falla
              │                         │
        sube a Drive             valida tamaño (≤ ~1 MB)
        hace público             devuelve base64 data-URL
        devuelve URL Drive
```

**Invariante:** si Drive no está configurado o falla, la subida **nunca** se rompe — cae al respaldo base64 (comportamiento actual). Encender Drive es transparente para el frontend y para los datos existentes.

### Componente nuevo: `backend/src/lib/imageStorage.ts`

Extrae la lógica hoy duplicada en `users.ts` e `instructors.ts` a una sola función bien delimitada.

**Interfaz:**

```ts
export interface SubirImagenOpts {
  carpeta?: string | null;   // folderId de Drive; default GOOGLE_DRIVE_FOLDER_ID
  anchoThumb?: number;       // ancho del thumbnail para la URL Drive (default 1600)
  maxBase64Bytes?: number;   // límite en modo fallback (default ~1 MB)
}

/**
 * Sube una imagen y devuelve la URL final para persistir en la BD.
 * - Si Drive está configurado: sube a Drive, hace público, devuelve driveImageUrl(fileId).
 * - Si no, o si Drive falla: valida tamaño y devuelve un data-URL base64.
 * Lanza error solo si la imagen es inválida (no image/*) o excede el límite en modo base64.
 */
export async function subirImagen(
  buffer: Buffer,
  mimeType: string,
  nombreBase: string,
  opts?: SubirImagenOpts,
): Promise<string>;
```

- **Qué hace:** valida `mimeType.startsWith('image/')`; si `isGoogleDriveConfigured`, intenta `uploadBufferToGoogleDrive` → `driveImageUrl`; ante error hace `console.warn` y cae a base64; en modo base64 rechaza si `buffer.length > maxBase64Bytes`.
- **Cómo se usa:** los 4 endpoints la llaman con su `nombreBase` y (opcional) `carpeta`.
- **De qué depende:** solo de `./googleDrive.js` (que ya existe). No toca la BD — el endpoint que la llama persiste la URL devuelta.

Reutiliza `googleDrive.ts` sin modificarlo.

### Subcarpetas en Drive (opcional pero recomendado)

Para organización, cada punto puede subir a una subcarpeta pasando `carpeta`:
`perfiles/`, `coaches/`, `barra/`, `comprobantes/`. Implementación mínima: usar el `GOOGLE_DRIVE_FOLDER_ID` raíz para todo en v1, y dejar las subcarpetas como mejora opcional (crear los folders a mano en Drive y poner sus IDs en env vars `GOOGLE_DRIVE_FOLDER_ID_COMPROBANTES`, etc.). **v1 usa una sola carpeta raíz** para no bloquear.

## Puntos de subida (4)

| Punto | Archivo | Cambio |
|-------|---------|--------|
| Perfil clientas | `routes/users.ts` (`POST /:id/photo`) | Reescribir el bloque Drive/base64 para llamar `subirImagen()`. **Sin cambio de comportamiento observable.** |
| Coach | `routes/instructors.ts` (`POST /me/photo`) | Igual. Conserva auth y límites actuales. |
| Barra / bebidas | `routes/products.ts` | **Nuevo** endpoint `POST /api/products/:id/image` (multer memoria, auth admin/recepción) → `subirImagen()` → `UPDATE products SET image_url`. Frontend: agregar input de archivo al form de producto del admin (hoy solo pega URL de texto). |
| Comprobantes de pago | `routes/orders.ts` (`POST /:id/upload-proof`) | Cambiar el guardado base64 por `subirImagen()` con carpeta de comprobantes; persistir la URL en `payment_proofs.file_url`. Conserva validaciones de estado de la orden. |

## Migración de imágenes base64 existentes

**Componente nuevo:** `backend/scripts/migrate-images-to-drive.ts`

- Recorre `users.photo_url`, `instructors.photo_url`, `payment_proofs.file_url`.
- Para cada valor que empiece con `data:image/`: decodifica el base64 → `subirImagen()` (Drive) → `UPDATE` de la columna con la URL de Drive.
- **Idempotente:** ignora valores que ya son URL (`http`/`https`).
- **Modo dry-run** (`--dry-run`): reporta cuántas filas migraría sin escribir.
- Procesa por lotes con log de progreso y conteo de éxitos/errores; un error en una fila no aborta el resto.
- **Ejecución:** una sola vez contra prod vía `railway run --service Postgres -- tsx scripts/migrate-images-to-drive.ts` (la BD de admin es producción en Railway). Correr primero `--dry-run`.

## Configuración (prerequisito operativo)

Pasos una sola vez en la cuenta Gmail del negocio:

1. **Google Cloud Console** → crear/elegir proyecto → **habilitar Google Drive API** (APIs & Services → Library → Google Drive API → Enable).
2. **Pantalla de consentimiento OAuth** (OAuth consent screen): User type *External*; llenar app name + support email; agregar scope `https://www.googleapis.com/auth/drive`; agregar tu email como *test user*; y **PUBLICAR la app** (Publishing status → Publish app).
   - ⚠️ **Gotcha:** en modo *Testing* el refresh token **caduca a los 7 días**. Publicando la app, no caduca.
3. **Crear credencial OAuth Client ID** (Application type: Web application; redirect URI: `https://developers.google.com/oauthplayground`) → copiar **Client ID** y **Client Secret**.
4. **Obtener refresh token** con el [OAuth 2.0 Playground](https://developers.google.com/oauthplayground): engranaje → *Use your own OAuth credentials* → pegar Client ID/Secret → seleccionar scope Drive `https://www.googleapis.com/auth/drive` → *Authorize APIs* → *Exchange authorization code for tokens* → copiar **refresh_token**.
5. **Crear la carpeta** destino en Drive (ej. "Casa Shé / Fotos") → abrirla → copiar el ID de la URL (`drive.google.com/drive/folders/<ID>`).
6. **Variables en Railway** (servicio backend):
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REFRESH_TOKEN`
   - `GOOGLE_DRIVE_FOLDER_ID`

En cuanto existan estas variables, perfil y coach empiezan a usar Drive automáticamente (sin deploy de código). Barra y comprobantes lo usarán tras implementar sus cambios.

## Errores, seguridad y límites

- Validación de tipo MIME (`image/*`) y tamaño en todos los endpoints de subida.
- Auth/rol por endpoint, igual que hoy: perfil = dueño de la cuenta; coach = la propia instructora; barra = admin/recepción; comprobantes = usuario autenticado dueño de la orden (validar estado de la orden como ya se hace).
- Archivos en Drive se marcan públicos como *lector* (`role: reader, type: anyone`) — necesario para renderizarlos en la app; por eso deben vivir en la carpeta dedicada, no en el Drive personal mezclado.
- El scope `drive` completo permite subir a una carpeta preexistente sin fricción. (Alternativa más estricta `drive.file` tiene el caveat de no "ver" carpetas creadas fuera de la app; se descarta en v1 por simplicidad.)

## Pruebas

- **Unit `imageStorage`:** con Drive mockeado (rama éxito → URL Drive) y sin Drive / Drive-lanza-error (rama fallback → data-URL; y rechazo por tamaño).
- **Endpoint barra:** subir imagen a un producto y verificar `image_url` actualizado.
- **Migración:** correr `--dry-run` contra un entorno de prueba (o copia de datos) y validar conteos antes de tocar prod.
- Verificar que perfil y coach siguen funcionando idénticos tras el refactor (sin regresión).

## Riesgos / notas

- Las URLs `drive.google.com/thumbnail?id=...` tienen **rate-limits** de Google. Aceptable para volumen boutique; si crece mucho, migrar imágenes a Cloudinary (ya integrado) es el siguiente paso.
- La cuota de 15 GB de Gmail es compartida con el correo de esa cuenta; usar una cuenta dedicada del negocio si se puede.
- Publicar la pantalla de consentimiento con scope sensible puede disparar el proceso de verificación de Google; para uso interno con pocos usuarios normalmente basta con la app publicada + test users. Documentar si Google pide verificación.

## Orden de trabajo sugerido

1. Crear `imageStorage.ts` + tests.
2. Refactorizar `users.ts` e `instructors.ts` para usarlo (sin cambio de comportamiento).
3. Endpoint de barra + input de archivo en el form de producto del admin.
4. Comprobantes de pago → Drive.
5. Script de migración (con dry-run).
6. Configurar env vars en Railway y encender.
7. Correr migración en prod (dry-run → real).
