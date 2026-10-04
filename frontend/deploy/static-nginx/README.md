# Casa She: runtime estático nginx

El frontend usa una imagen nginx independiente, incluida como `Dockerfile` predeterminado en la raíz de este servicio. Usa el patrón validado en BMB: nginx 1.30.5 Alpine 3.24 fijado por digest, dos workers, raíz pública dedicada y Brotli estático fijado por commit. El patch de una línea `allow_ranges` conserva rangos 206/416 e If-Range sobre `.br`. No añade caché duradera, proxy ni procesos Node al runtime.

La base revisada es `c327eb471450663e548e02f14f846c947ebea20b`. Código de cliente, archivos públicos, package/lock, Caddyfile y Nixpacks permanecen como referencia de compatibilidad; el arranque de la imagen final es el CMD nginx versionado. El builder conserva Node 20 (fijado a 20.18.1), `NODE_ENV=development` y el compresor actual. La imagen final contiene exactamente el `dist` de ese build bajo `/srv/frontend/public`; no sirve los archivos por defecto de nginx. Se conservan SPA, redirects, Content-Type, HEAD, ETag, 304, compresión y rangos. PORT conserva el default 8080 y se valida antes de arrancar. El sello del service worker conserva el contrato actual; todos los archivos públicos originales se verifican por SHA-256.

Sólo se admiten al contexto Docker fuentes y assets de frontend mediante `Dockerfile.dockerignore`; `.env*`, backend, base de datos y credenciales quedan fuera. Los únicos argumentos son públicos: `VITE_API_URL, RAILWAY_GIT_COMMIT_SHA, VITE_VAPID_PUBLIC_KEY`. Deben conservarse los valores del servicio al publicar; la CI usa fixtures `example.invalid` y claves públicas sintéticas. No ejecuta JavaScript en navegador, ni llama APIs, DB o integraciones. Casa She conserva su modo development y no activa su PWA por este cambio.

## CI y reproducción

Desde `frontend`:

```sh
docker build --target app-builder -t static-app-builder \
  --build-arg VITE_API_URL=https://example.invalid/api \
  --build-arg RAILWAY_GIT_COMMIT_SHA="$(git rev-parse HEAD)" \
  --build-arg VITE_VAPID_PUBLIC_KEY=BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA .
```

El workflow `Frontend nginx contract` construye también la imagen final con los mismos argumentos, verifica todo el árbol y publica `nginx-build-artifact-result.json` con SHA del checkout, lock, Caddyfile, modo y hashes de cada original/variante `.br/.gz`. Compara el mismo build en nginx y Caddy 2.11.4 fijado por digest, recorre rutas reales de `src/App.tsx` y todos los assets, y prueba redirects, MIME, HEAD, ETag/304, 206/416/If-Range, negociación gzip/Brotli, workers y PORT inválido. Limpia sus contenedores y volúmenes temporales. No ejecuta otro benchmark sintético de RAM.

## Default durable y servicios existentes

Desde `frontend`, `docker build .` utiliza el Dockerfile predeterminado y su CMD `/usr/local/bin/start-static-nginx`. Es byte a byte el mismo Dockerfile ya publicado en `deploy/static-nginx/`; CI obliga a mantener iguales ambos Dockerfile y sus listas de contexto. Conservamos la ruta alternativa porque el servicio existente aún la referencia. CI construye ahora **sin `-f`** y ejecuta los contratos existentes de artefactos, rutas, workers, compresión y HTTP sobre esa imagen.

Para un frontend nuevo en Railway, usar `frontend` como Root Directory, conservar los argumentos públicos del build indicados arriba y dejar el arranque de Docker sin un override Caddy/Node. Railway [detecta `Dockerfile` en la raíz del servicio](https://docs.railway.com/builds/dockerfiles). El backend mantiene su raíz `backend` y sus archivos de configuración; no se debe seleccionar la raíz frontend para la API.

Los archivos `railway.json` se mantienen alineados sólo para compatibilidad con servicios existentes. Railway [retira Config as Code el 1 de diciembre de 2026 y no lo admite para servicios nuevos](https://docs.railway.com/config-as-code). El default nginx depende de Dockerfile + CMD, no de que un servicio nuevo lea JSON. Una futura migración de healthchecks, dominios, variables y políticas del servicio a IaC requiere su propia revisión; este cambio no aplica configuración cloud.

Antes de fusionar, revisar el filtro de cambios del backend: los nuevos archivos frontend pueden disparar un build aun con raíz aislada. Excluir únicamente esos archivos de despliegue cuando corresponda, conservando todas las rutas de API. El servicio frontend ya publicado puede seguir usando su ruta alternativa y su launcher actuales. Tras la publicación coordinada, comprobar build/deployment, serving y que la API conserve su deployment anterior.

Rollback: revertir este cambio de defaults conserva los archivos alternativos nginx que usa el servicio existente. No ejecutar un arranque Caddy dentro de la imagen nginx ni cambiar el backend para revertir el frontend.

El beneficio esperado es pequeño. La comparación BMB previa mostró una reducción local de memoria total, con fuerte componente de archivos/cache; no acredita ahorro facturado aquí. El coste completo previo de RAM es un techo imposible de eliminar, no una previsión. Cuantificar sólo con ventanas comparables después de un despliegue verificado.
