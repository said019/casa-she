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
    dropdb --if-exists "$BASE" 2>/dev/null || true
}
trap limpiar EXIT

echo "→ Clonando la base local $ORIGEN en $BASE"
createdb -T "$ORIGEN" "$BASE"

HASH="$(cd "$BACKEND" && node -e 'console.log(require("bcryptjs").hashSync(process.argv[1], 10))' "$CLAVE")"
psql -q -X -d "$BASE" -v ON_ERROR_STOP=1 -v correo="$CORREO" -v hash="$HASH" <<'SQL'
INSERT INTO users (email, phone, display_name, role, password_hash, is_active, temp_password)
VALUES (:'correo', '5599990001', 'Admin E2E', 'admin', :'hash', true, false);
SQL

echo "→ Backend en :3001 (bitácora: $LOG)"
(
    cd "$BACKEND"
    unset MP_ACCESS_TOKEN STRIPE_SECRET_KEY RESEND_API_KEY GOOGLE_REFRESH_TOKEN
    export DATABASE_URL="postgresql://localhost:5432/$BASE"
    export JWT_SECRET="e2e-local-no-es-produccion"
    export PORT=3001 NODE_ENV=development FRONTEND_URL="http://localhost:4173"
    export ENABLE_CRON_JOBS=false DISABLE_WHATSAPP=true
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
