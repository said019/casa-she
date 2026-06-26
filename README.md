# Casa Shé — Plataforma de Reservas

Studio de wellness para mujeres · Condesa, CDMX (Alfonso Reyes 131).

Monorepo construido sobre la arquitectura de BMB-Studio y **rebrandeado a Casa Shé**:

- **`backend/`** — API: Express + TypeScript + PostgreSQL (SQL puro, migraciones idempotentes en el arranque) + JWT + Zod + node-cron + Resend (email) + Stripe (tarjeta) + Cloudinary.
- **`frontend/`** — App: Vite + React 18 + TypeScript + TailwindCSS + shadcn/ui + React Query + Zustand + React Router.

Diseño y plan en [`docs/superpowers/`](docs/superpowers/). **Qué sigue / roadmap:** [`PROXIMOS-PASOS.md`](PROXIMOS-PASOS.md).

---

## Requisitos

- Node.js 20+ y npm
- PostgreSQL 15+ corriendo en local

## Arranque local (paso a paso)

```bash
# 1) Base de datos
createdb casa_she
psql -d casa_she -f backend/database/schema_complete.sql   # crea ~60 tablas, ENUMs, vistas, triggers

# 2) Variables de entorno (ya hay un backend/.env y frontend/.env de desarrollo;
#    si no, cópialos de los .example)
cp backend/.env.example backend/.env      # ajusta DATABASE_URL y JWT_SECRET
cp frontend/.env.example frontend/.env    # VITE_API_URL=http://localhost:3001/api

# 3) Backend (puerto 3001). Al arrancar corre las migraciones idempotentes y
#    siembra el catálogo Casa Shé (disciplinas, precios, sede, admin, cancelación 5h).
cd backend && npm install && npm run dev

# 4) Frontend (puerto 8080), en otra terminal
cd frontend && npm install && npm run dev
```

- App: http://localhost:8080 · API health: http://localhost:3001/api/health
- **Admin de prueba:** `admin@casashe.mx` (contraseña por defecto del seed; cámbiala).

> El esquema base (`schema_complete.sql`) se aplica **una vez a mano**. Después, cada
> `npm run dev` del backend corre `runStartupMigrations()` (ALTERs/seed idempotentes) y al
> final un bloque **Casa Shé v1** que fija catálogo, precios, sede única y reglas.

## Catálogo y reglas Casa Shé (sembrados)

- **Disciplinas:** Pilates Mat, Yoga, Aeroyoga, Telas, Taller (cupo 6–7 por clase).
- **Precios:** Clase de prueba $150 · Drop-in $280 · Paquete 5 $1,300 · 8 $2,000 · 12 $2,880 · Membresía 360 $3,600 (16 créditos/mes) · Black $4,200 (24/mes).
- **Reglas:** cancelación hasta **5 h antes** (devuelve crédito; después o no-show se pierde) · créditos con **vigencia 1 mes** · **reglamento obligatorio** antes de la primera reserva · check-in con **QR**.
- **Sede única:** "Casa Shé — Condesa".

## Primera configuración (admin)

El catálogo viene sembrado, pero el **horario real** se arma desde el panel:

1. Entra como `admin@casashe.mx` → **Clases → Horarios** (y **Disciplinas/Precios** para ajustar).
2. Da de alta instructoras en **Comunidad → Coaches**.
3. Crea las clases de la semana (Horarios / Generar semana). Recuerda las franjas: L–V 7–13 y 17–22, fines 8–13, talleres fin de semana 14–21.
4. Carga el **reglamento** y los **lineamientos** definitivos (ver Pendientes).

## Pendientes que requieren datos de Casa Shé (producción)

- **Stripe**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (live) + registrar el webhook `…/api/stripe/webhook`.
- **Transferencia**: CLABE, banco y titular reales (en Ajustes → datos bancarios; hoy es placeholder).
- **Créditos exactos** de Membresía 360 y Black (hoy 16 / 24 de placeholder).
- **Resend**: `RESEND_API_KEY` + `EMAIL_FROM` verificado, y dominio para `FRONTEND_URL`.
- **Logo/íconos oficiales**: `casa-she-logo.png`, favicons e icon-192/512 (hoy hay un monograma SVG provisional).
- **Reglamento** y **lineamientos por disciplina** (textos definitivos).
- `CHECKIN_SECRET` fijo en producción (no rotarlo tras lanzar o invalida los QR vivos).

## Fuera de alcance v1 (Fase 2/3)

Lealtad/sellos · cuestionario de onboarding perfilador · Apple/Google Wallet · sitio público
rediseñado · tienda de ropa · Fuel Bar · eventos privados · WhatsApp API oficial (hoy: wa.me +
email automático) · payroll/comisiones/POS/videos (código presente pero desactivado).
