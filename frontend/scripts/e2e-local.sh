#!/usr/bin/env bash
# Corre Playwright contra una COPIA DESECHABLE de la base local. Nunca contra producción:
#  1. clona la base local (casa_she, o la de E2E_BASE_ORIGEN) en una base temporal;
#  2. crea ahí una admin de prueba;
#  3. levanta el backend de este repo en :3001 con secretos de prueba, sin crons ni WhatsApp ni pagos;
#  4. construye el frontend apuntando a ese backend y corre Playwright (que sirve vite preview en :4173);
#  5. al terminar (bien o mal) apaga el backend y borra la base temporal.
#
# Uso, desde frontend/:
#   ./scripts/e2e-local.sh e2e/tests/admin-classes.spec.ts --project=chromium -g "semana por horas"
set -euo pipefail

# Nada de variables PG* heredadas (p. ej. de un `railway run`): todo va a localhost:5432.
unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSERVICE
PG=(-h localhost -p 5432)

FRONTEND="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$(cd "$FRONTEND/../backend" && pwd)"
ORIGEN="${E2E_BASE_ORIGEN:-casa_she}"
BASE="casa_she_e2e_$(date +%s)"
CORREO="e2e-admin@casashe.test"
CLAVE="E2e-Calendario-2026"
LOG="${TMPDIR:-/tmp}/casa-she-e2e-backend.log"
BACKEND_PID=""

for puerto in 3001 4173; do
    if lsof -ti "tcp:$puerto" >/dev/null 2>&1; then
        echo "✋ El puerto $puerto está ocupado. Apaga lo que lo usa y vuelve a correr." >&2
        exit 1
    fi
done

limpiar() {
    if [ -n "$BACKEND_PID" ]; then kill "$BACKEND_PID" 2>/dev/null || true; fi
    lsof -ti tcp:3001 2>/dev/null | xargs kill 2>/dev/null || true
    dropdb "${PG[@]}" --if-exists "$BASE" 2>/dev/null || true
}
trap limpiar EXIT

echo "→ Clonando la base local $ORIGEN en $BASE"
if ! ERROR_CLON="$(createdb "${PG[@]}" -T "$ORIGEN" "$BASE" 2>&1)"; then
    echo "$ERROR_CLON" >&2
    if printf '%s' "$ERROR_CLON" | grep -qi "being accessed by other users"; then
        echo "✋ No se pudo clonar $ORIGEN porque tiene conexiones abiertas." >&2
        echo "   Apaga el backend de desarrollo (y cualquier psql/IDE conectado a $ORIGEN) y vuelve a correr." >&2
    else
        echo "✋ No se pudo clonar la base local $ORIGEN en $BASE." >&2
    fi
    exit 1
fi

# La copia trae credenciales reales de plataformas y suscripciones push: se apagan y
# se borran ANTES de levantar el backend, para que nada salga hacia TotalPass ni a celulares.
psql "${PG[@]}" -q -X -d "$BASE" -v ON_ERROR_STOP=1 <<'SQL'
UPDATE platform_credentials
   SET is_enabled = false, partner_api_key = NULL, place_api_key = NULL,
       access_token = NULL, token_expires_at = NULL;
DELETE FROM push_subscriptions;
SQL

HASH="$(cd "$BACKEND" && node -e 'console.log(require("bcryptjs").hashSync(process.argv[1], 10))' "$CLAVE")"
psql "${PG[@]}" -q -X -d "$BASE" -v ON_ERROR_STOP=1 -v correo="$CORREO" -v hash="$HASH" <<'SQL'
INSERT INTO users (email, phone, display_name, role, password_hash, is_active, temp_password)
VALUES (:'correo', '5599990001', 'Admin E2E', 'admin', :'hash', true, false);
SQL

echo "→ Backend en :3001 (bitácora: $LOG)"
(
    cd "$BACKEND"
    # Vacías (no unset): dotenv no pisa variables ya definidas, así que un backend/.env
    # con llaves reales no puede volver a cargarlas. Pagos, correo, Google, push,
    # TotalPass, WhatsApp, Cloudinary y avisos a la dueña quedan sin llaves.
    export MP_ACCESS_TOKEN="" MP_WEBHOOK_SECRET="" \
        STRIPE_SECRET_KEY="" STRIPE_WEBHOOK_SECRET="" \
        RESEND_API_KEY="" ADMIN_ALERT_EMAIL="" ADMIN_ALERT_WHATSAPP="" \
        GOOGLE_CLIENT_ID="" GOOGLE_CLIENT_SECRET="" GOOGLE_REFRESH_TOKEN="" \
        GOOGLE_SA_EMAIL="" GOOGLE_SA_PRIVATE_KEY="" GOOGLE_ISSUER_ID="" \
        GOOGLE_DRIVE_FOLDER_ID="" GOOGLE_DRIVE_PHOTO_FOLDER_ID="" \
        VAPID_PUBLIC_KEY="" VAPID_PRIVATE_KEY="" \
        TOTALPASS_PARTNER_API_KEY="" TOTALPASS_PLACE_API_KEY="" \
        EVOLUTION_API_KEY="" EVOLUTION_API_URL="" \
        CLOUDINARY_API_KEY="" CLOUDINARY_API_SECRET="" CLOUDINARY_CLOUD_NAME="" \
        APPLE_APNS_KEY_BASE64="" APPLE_AUTH_TOKEN=""
    export DATABASE_URL="postgresql://localhost:5432/$BASE"
    export JWT_SECRET="e2e-local-no-es-produccion"
    export PORT=3001 NODE_ENV=development FRONTEND_URL="http://localhost:4173"
    # CRON_JOBS con un nombre que no existe: aunque algo prendiera los crons, ninguno corre.
    export ENABLE_CRON_JOBS=false CRON_JOBS="E2E_NINGUNO" DISABLE_WHATSAPP=true
    exec ./node_modules/.bin/tsx src/index.ts
) >"$LOG" 2>&1 &
BACKEND_PID=$!

for _ in $(seq 1 90); do
    if curl -sf http://localhost:3001/api/health >/dev/null; then break; fi
    sleep 1
done
curl -sf http://localhost:3001/api/health >/dev/null || { echo "✋ El backend no arrancó; revisa $LOG" >&2; exit 1; }

echo "→ Construyendo el frontend contra http://localhost:3001/api"
cd "$FRONTEND"
VITE_API_URL="http://localhost:3001/api" npm run build >/dev/null

echo "→ Playwright $*"
ADMIN_EMAIL="$CORREO" ADMIN_PASSWORD="$CLAVE" npx playwright test "$@"
