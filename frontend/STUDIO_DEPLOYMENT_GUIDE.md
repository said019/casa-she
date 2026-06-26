# Guía de implementación para nuevos estudios

Guía completa para desplegar este sistema (Balance Room) para otro estudio de fitness/yoga/pilates. Tiempo estimado: 2-4 horas (sin incluir Apple Wallet que requiere cuenta Apple Developer de pago).

---

## 1. Arquitectura

- **Frontend**: React + Vite + Tailwind. Carpeta raíz (`src/`). Se despliega como SPA estático.
- **Backend**: Node + Express + TypeScript. Carpeta `Balance Room/server/`. Se despliega en Railway.
- **Base de datos**: PostgreSQL (Railway plugin).
- **Storage de archivos**: Google Drive (videos + fotos de perfil). Cloudinary opcional.
- **Mensajería**: Evolution API (WhatsApp) + Resend (email).
- **Pagos**: Transferencia manual + MercadoPago (opcional, revertido actualmente).
- **Wallets digitales**: Apple Wallet (.pkpass) + Google Wallet (opcionales).

Repositorio único. Frontend se despliega en Vercel/Railway, backend como servicio separado en Railway.

---

## 2. Prerequisitos — cuentas a crear

| Servicio | Obligatorio | Costo | Para qué |
|---|---|---|---|
| [Railway](https://railway.app) | Sí | ~$5-10/mes | Backend + PostgreSQL |
| [Vercel](https://vercel.com) | Sí | Free tier | Frontend |
| [Google Cloud Console](https://console.cloud.google.com) | Sí | Free tier | OAuth + Drive + Wallet |
| [Resend](https://resend.com) | Sí | Free 3000/mes | Emails transaccionales |
| Dominio propio | Recomendado | ~$10/año | Producción |
| [Evolution API server](https://github.com/EvolutionAPI/evolution-api) | Opcional | VPS $5/mes | WhatsApp |
| [Cloudinary](https://cloudinary.com) | Opcional | Free 25GB | Storage alterno |
| [Apple Developer](https://developer.apple.com) | Opcional | $99/año | Apple Wallet |

---

## 3. Base de datos

### 3.1 Crear instancia en Railway

1. Railway → New Project → **Add PostgreSQL** (plugin oficial).
2. Copia la variable `DATABASE_URL` que Railway genera.

### 3.2 Aplicar schema

Conéctate con `psql $DATABASE_URL` o cliente gráfico (TablePlus, DBeaver) y ejecuta **en orden**:

```bash
# 1. Schema base (40+ tablas)
psql $DATABASE_URL -f database/schema.sql

# 2. Migraciones (en orden alfanumérico)
for f in database/migrations/*.sql; do
  psql $DATABASE_URL -f "$f"
done

# 3. Planes de membresía (obligatorio)
psql $DATABASE_URL -f database/seeds/production_plans.sql
```

Tablas principales: `users`, `plans`, `memberships`, `class_types`, `classes`, `bookings`, `wallet`, `payments`, `videos`, `events`, `notifications`, `products`, `sales`, `egresos`.

### 3.3 Crear usuario admin inicial

```sql
-- Generar password hash con: node -e "console.log(require('bcryptjs').hashSync('TU_PASSWORD', 12))"
INSERT INTO users (email, password_hash, display_name, phone, role, is_active)
VALUES (
  'admin@TUESTUDIO.com',
  '$2a$12$...',  -- hash generado arriba
  'Admin',
  '+52XXXXXXXXXX',
  'admin',
  true
);
```

---

## 4. Backend (Railway)

### 4.1 Crear servicio

1. Railway → mismo proyecto → **New Service** → **Deploy from GitHub** → elige el fork del repo.
2. Settings → **Root Directory** = `Balance Room/server`.
3. Build & Start: Railway detecta `package.json`. Si no:
   - Build: `npm install && npm run build`
   - Start: `npm run start`

### 4.2 Variables de entorno (obligatorias)

```bash
# Base de datos (referencia a la variable del plugin)
DATABASE_URL=${{Postgres.DATABASE_URL}}
NODE_ENV=production
PORT=3001

# Auth
JWT_SECRET=<openssl rand -base64 48>
JWT_EXPIRES_IN=7d
CHECKIN_SECRET=<openssl rand -hex 32>

# URLs
FRONTEND_URL=https://TU-DOMINIO.com
BACKEND_URL=https://TU-BACKEND.railway.app
BASE_URL=https://TU-BACKEND.railway.app

# Ubicación del estudio (para geofencing de check-in)
BUSINESS_LATITUDE=19.4326
BUSINESS_LONGITUDE=-99.1332

# Cron
ENABLE_CRON_JOBS=true
```

### 4.3 Variables opcionales — ver sección 6 (servicios externos)

---

## 5. Frontend

### 5.1 Desplegar en Vercel

1. Vercel → **Import Project** → elige el repo.
2. Framework Preset: **Vite**.
3. Root Directory: `/` (raíz).
4. Build Command: `npm run build`.
5. Output Directory: `dist`.
6. Environment Variables:
   ```
   VITE_API_URL=https://TU-BACKEND.railway.app/api
   ```
7. Deploy.
8. Settings → Domains → conecta tu dominio (`TU-ESTUDIO.com`).

Alternativa: desplegar frontend en Railway usando el `nixpacks.toml` de la raíz.

---

## 6. Servicios externos — setup detallado

### 6.1 Google Drive OAuth (storage de videos y fotos)

Ver archivo separado: Google Cloud Console → proyecto nuevo → `APIs & Services` → habilitar **Google Drive API**.

**Pasos clave** (para no caducar cada 7 días):

1. **OAuth consent screen** → **Publicar app a "In production"** (imprescindible).
2. **Scopes**: usar solo `https://www.googleapis.com/auth/drive.file` (NO `drive`). Así evitas verificación de Google.
3. **Credentials** → Create OAuth Client → Application type: **Web application**.
4. Authorized redirect URIs: agrega `https://developers.google.com/oauthplayground` temporalmente.
5. Copia **Client ID** y **Client Secret**.
6. Genera **Refresh Token**:
   - Ve a [OAuth Playground](https://developers.google.com/oauthplayground).
   - ⚙️ → *Use your own OAuth credentials* → pega Client ID/Secret.
   - En "Input your own scopes" escribe: `https://www.googleapis.com/auth/drive.file`.
   - Authorize APIs → acepta.
   - Exchange authorization code for tokens.
   - Copia el `refresh_token` (empieza con `1//`).
7. Carpeta de Drive opcional: crea carpeta "Studio Files", copia el ID de la URL.

Variables:
```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=1//...
GOOGLE_DRIVE_FOLDER_ID=...  # opcional
```

### 6.2 Cloudinary (alternativa/complemento a Drive)

1. Crear cuenta gratis en cloudinary.com.
2. Dashboard → copia Cloud Name, API Key, API Secret.

```bash
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

Si están configuradas, videos usan Cloudinary; si no, Drive. Fotos de perfil: actualmente solo Drive + fallback base64.

### 6.3 Resend (emails)

1. resend.com → API Keys → Create.
2. Verifica dominio propio (recomendado) o usa `onboarding@resend.dev` para pruebas.

```bash
RESEND_API_KEY=re_...
EMAIL_FROM="Tu Estudio <no-reply@tudominio.com>"
```

### 6.4 Evolution API (WhatsApp) — opcional

1. Desplegar Evolution API en VPS (DigitalOcean/Hetzner): `docker run ...` o Dockerfile del repo `EvolutionAPI/evolution-api`.
2. Crear instancia con nombre (ej. `mi-studio`).
3. Escanear QR con el WhatsApp del estudio.

```bash
WHATSAPP_PROVIDER=evolution
EVOLUTION_API_URL=https://evolution.tudominio.com
EVOLUTION_API_KEY=...
EVOLUTION_INSTANCE_NAME=mi-studio
```

Ver `EVOLUTION-API-SETUP.md` para detalles.

### 6.5 Apple Wallet — opcional ($99/año)

Requiere cuenta Apple Developer y generar certificados. Ver documentación de `node-passkit-generator`.

```bash
APPLE_TEAM_ID=...
APPLE_PASS_TYPE_ID=pass.com.tuestudio.membership
APPLE_PASS_CERT=<base64 del .pem>
APPLE_PASS_KEY=<base64 del .key>
APPLE_WWDR=<base64 del WWDR.pem>
APPLE_CERT_PASSWORD=...
APPLE_ORG_NAME="Tu Estudio"
APPLE_AUTH_TOKEN=<openssl rand -hex 32>
```

### 6.6 Google Wallet — opcional

1. Google Cloud → habilitar **Google Wallet API**.
2. Crear Service Account → descargar JSON.
3. Registrar Issuer en [Google Pay Business Console](https://pay.google.com/business/console).

```bash
GOOGLE_ISSUER_ID=...
GOOGLE_SA_EMAIL=xxx@proyecto.iam.gserviceaccount.com
GOOGLE_SA_PRIVATE_KEY=<base64 del JSON completo>
```

---

## 7. Branding — personalizar para el nuevo estudio

### 7.1 Datos del estudio

Archivo: [`src/data/studios.ts`](src/data/studios.ts)

Agrega una entrada en el `studioDirectory`:

```ts
'miestudio': {
  slug: 'miestudio',
  name: 'Mi Estudio',
  tagline: 'Tu espacio de movimiento',
  description: '...',
  addressLine: 'Av. X #123',
  city: 'CDMX',
  state: 'CDMX',
  postalCode: '03100',
  phone: '+52 55 1234 5678',
  whatsapp: '+525512345678',
  email: 'hola@miestudio.com',
  instagram: '@miestudio',
  mapUrl: 'https://maps.google.com/?q=...',
  classTypes: [
    { name: 'Reformer', description: '...', level: 'all', durationMinutes: 50, maxCapacity: 8 },
  ],
  bank: { name: 'BBVA', account: '...', clabe: '...', beneficiary: 'Mi Estudio SA de CV' },
  businessHours: [
    { label: 'Lunes - Viernes', hours: '6:00 - 21:00' },
    { label: 'Sábado', hours: '8:00 - 14:00' },
  ],
  palette: { /* ver sección 7.2 */ },
},
```

Si sirves múltiples estudios desde el mismo deploy, el slug se resuelve por ruta. Si es un solo estudio, cambia el `default` del directorio.

### 7.2 Colores

Archivo: [`src/index.css`](src/index.css) — variables CSS en formato HSL.

Variables a cambiar:
- `--primary`: color de marca principal
- `--secondary`: complementario
- `--accent`: acento
- `--background`, `--foreground`: fondo y texto

Convertir HEX a HSL: [hslpicker.com](https://hslpicker.com).

Archivo: [`tailwind.config.ts`](tailwind.config.ts) — extiende los tokens si agregas colores nuevos.

### 7.3 Logo, favicon, meta tags

- `public/balance-room-logo-transparent.png` → reemplazar por logo del estudio (mismo nombre o actualizar referencias).
- `index.html` → cambiar `<title>`, `<meta description>`, Open Graph tags, favicon.
- `public/apple-touch-icon.png`, `public/favicon.ico`.

### 7.4 Landing page

- [`src/pages/Index.tsx`](src/pages/Index.tsx) — estructura de secciones (Hero, ClassTypes, Schedule, Instructors, Pricing, Testimonials).
- [`src/components/Hero.tsx`](src/components/Hero.tsx), `Instructors.tsx`, `Testimonials.tsx` — contenido hardcoded que conviene mover a `studios.ts` o revisar.

### 7.5 Planes de membresía

Edita [`database/seeds/production_plans.sql`](database/seeds/production_plans.sql) antes de ejecutarlo, o crea un nuevo seed con los precios/planes del estudio. Estructura:

```sql
INSERT INTO plans (name, description, price, currency, duration_days, class_limit, features, is_active, sort_order)
VALUES ('Mensualidad Ilimitada', 'Clases ilimitadas', 2500, 'MXN', 30, NULL, ARRAY['Acceso total'], true, 1);
```

### 7.6 Tipos de clase

Tabla `class_types`. Poblar manualmente o desde un seed:

```sql
INSERT INTO class_types (name, description, color, duration_minutes, max_capacity, is_active)
VALUES ('Pilates Mat', 'Pilates en colchoneta', '#A48550', 50, 12, true);
```

---

## 8. Post-deploy checklist

- [ ] `DATABASE_URL` conectada, schema + migraciones aplicadas
- [ ] Usuario admin creado, puedes iniciar sesión en `/admin/login`
- [ ] `VITE_API_URL` correcto en Vercel (apunta a `/api` del backend)
- [ ] CORS: `FRONTEND_URL` en backend coincide con dominio de Vercel
- [ ] `JWT_SECRET` único (no reusar el de Balance Room)
- [ ] Registro de cliente funciona (tablas users + wallet)
- [ ] Upload de foto de perfil funciona (Drive o fallback base64)
- [ ] Email de bienvenida llega (Resend)
- [ ] Crear una clase, reservarla como cliente, check-in funciona
- [ ] Planes visibles en `/app/comprar`
- [ ] Branding: colores, logo, título, datos de contacto reemplazados

---

## 9. Mantenimiento

### 9.1 Refresh token de Google Drive
Con app en "In production" y scope `drive.file`, el refresh token **no expira**. Si falla, regenéralo vía OAuth Playground (ver 6.1 pasos 6-7).

### 9.2 Migraciones nuevas
Agrega archivo `database/migrations/0XX_descripcion.sql` y ejecuta con `psql $DATABASE_URL -f ...`. El sistema no tiene tabla de migraciones automática — llevar control manual.

### 9.3 Actualizaciones de código
```bash
git pull upstream main  # trae cambios de Balance Room upstream
# resuelve conflictos con tu branding
git push origin main    # Railway + Vercel re-despliegan solos
```

### 9.4 Backup de DB
Railway → PostgreSQL plugin → Settings → **Backups** (automáticos diarios en plan pago).

Backup manual:
```bash
pg_dump $DATABASE_URL > backup-$(date +%F).sql
```

---

## 10. Troubleshooting común

| Síntoma | Causa probable | Solución |
|---|---|---|
| 503 "Carga de imágenes no configurada" | No hay Cloudinary ni Drive | Configurar Drive (sección 6.1) o dejar fallback base64 |
| 500 "Google OAuth error: Bad Request" | Refresh token expirado | Regenerar (sección 6.1 pasos 6-7) |
| CORS error en frontend | `FRONTEND_URL` mal configurado | Verificar en Railway que coincida con dominio real |
| Login falla con "Invalid token" | `JWT_SECRET` cambió | No cambiar después de emitir tokens, o forzar re-login |
| Clases no aparecen | Zona horaria del servidor | Railway usa UTC; las queries ya normalizan a `America/Mexico_City` |
| Check-in no valida QR | `CHECKIN_SECRET` distinto entre emisor y validador | Mismo secret en ambos |
| WhatsApp no envía | Instancia Evolution desconectada | Reescanear QR en Evolution UI |

---

## 11. Decisiones de arquitectura (contexto)

- **Sin tabla de migraciones**: migraciones SQL manuales por simplicidad. Para múltiples estudios, considerar `node-pg-migrate` o `drizzle-kit`.
- **Monorepo sin workspaces**: frontend y backend comparten repo pero tienen `package.json` separados. `Balance Room/server/` es el backend activo.
- **Google Drive vs Cloudinary**: Drive es gratis con cuota generosa; Cloudinary tiene CDN + transforms pero límite 25GB. Sistema soporta ambos con prioridad Cloudinary si está configurado.
- **Evolution API vs Twilio**: Evolution es gratis pero requiere VPS + mantenimiento. Twilio está código-listo pero no cableado actualmente.
- **MercadoPago**: integración revertida en commit `580a6ea`. Pagos actualmente por transferencia con validación manual admin.

---

**Última actualización**: 2026-04-21
