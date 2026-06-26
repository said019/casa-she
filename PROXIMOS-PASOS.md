# Casa Shé — Próximos pasos

Estado: **v1 (core de reservas) terminada y funcional en local**, subida a
`https://github.com/said019/casa-she` (rama `main`). Este documento lista lo que sigue,
ordenado por prioridad. Ver también el diseño y el plan en [`docs/superpowers/`](docs/superpowers/).

---

## ✅ Lo que YA quedó hecho (v1)

- Fork de BMB-Studio **rebrandeado a Casa Shé** (paleta, tipografías Instrument Serif + Baskervville, logo, copy, emails).
- Catálogo real: Pilates Mat, Yoga, Aeroyoga, Telas, Taller (cupo 6–7) + precios (prueba $150, drop-in $280, paq 5/8/12, Membresía 360/Black).
- Reglas: cancelación **5 h**, créditos **vigencia 1 mes**, no-show pierde crédito, lista de espera, **reglamento obligatorio** antes de reservar, check-in **QR**.
- Pagos: Stripe (tarjeta) + transferencia con comprobante + efectivo. Checkout simulado eliminado.
- **Mono-sede** (Condesa): sin rastros de segunda sucursal en backend ni UI.
- Panel admin acotado a v1; WhatsApp = wa.me + email (Resend).

---

## 1) Pendientes para producción (datos que debe dar Casa Shé)

> Sin estos, la app corre en modo desarrollo; con ellos queda lista para cobrar y operar real.

- [ ] **Stripe**: `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` (live) en `backend/.env`, y registrar el webhook `https://<api>/api/stripe/webhook` en el dashboard de Stripe.
- [ ] **Transferencia**: CLABE, banco y titular reales (hoy placeholder). Se cargan en **Ajustes → datos bancarios** del panel.
- [ ] **Créditos mensuales exactos** de Membresía 360 y Black (hoy 16 / 24 de placeholder). Editables en **Clases → Precios y paquetes**.
- [ ] **Resend** (correos): `RESEND_API_KEY` + `EMAIL_FROM` con dominio verificado, y `FRONTEND_URL` del dominio real.
- [ ] **Logo e íconos oficiales**: reemplazar el monograma SVG provisional por `casa-she-logo.png`, `favicon.ico`, `icon-192.png`, `icon-512.png`, imagen OG.
- [ ] **Reglamento y lineamientos definitivos** por disciplina (hoy hay un reglamento base). Texto en `frontend/src/components/ReglamentoGate.tsx`.
- [ ] **`CHECKIN_SECRET`** fijo en producción (no rotarlo tras lanzar o invalida los QR ya emitidos).
- [ ] **Dominio** para la app (p.ej. `app.casashe.mx`).

## 2) Configuración inicial en el panel admin

Login: `admin@casashe.mx` (cambiar contraseña). Luego:

- [ ] Dar de alta **instructoras** (Comunidad → Coaches).
- [ ] Armar el **horario real** (Clases → Horarios / Generar semana). Franjas: L–V 7–13 y 17–22, fines 8–13, talleres fin de semana 14–21.
- [ ] Ajustar precios/créditos/cupos finales si cambian.
- [ ] Cargar reglamento y lineamientos definitivos.

## 3) Despliegue (deploy)

- [ ] **Backend** en Railway (ya trae `railway.toml`): crear servicio + PostgreSQL, setear variables de entorno, aplicar `schema_complete.sql` una vez.
- [ ] **Frontend** en Vercel o Railway (trae `vercel.json` y `nixpacks.toml`): setear `VITE_API_URL` al backend de producción.
- [ ] Probar el flujo completo en producción: registro → reglamento → compra (Stripe/transferencia) → reserva → check-in QR.

## 4) Limpieza técnica pendiente (opcional, pulido)

- [ ] **Mover el PDF de marca** (`assets/brand/casa-she-branding.pdf`, 56 MB) fuera del repo o a Git LFS (GitHub avisa que supera 50 MB).
- [ ] Quitar variables sin uso y comentarios/ramas muertas que aún mencionan "sucursal" (no se renderizan; se dejaron para no arriesgar el build).
- [ ] Borrar de verdad (no solo desmontar) los archivos de rutas backend y páginas frontend fuera de v1 (payroll, comisiones, POS, videos, eventos, descuentos, etc.). Hoy están **dormidos** (no enlazados), funcionan pero agregan peso.
- [ ] Unificar el esquema: quedarse solo con `schema_complete.sql` y eliminar `schema.sql`.
- [ ] (Recomendado para demo) Sembrar un **horario de ejemplo** de la sede para que la app no arranque vacía.

---

## Fase 2 (siguiente entrega)

- [ ] **Cuestionario de onboarding perfilador** que dirige a cada usuaria a lo que su cuerpo necesita (diferenciador de marca del PDF).
- [ ] **Lealtad** (puntos/sellos) — el motor existe en el código (desactivado); definir reglas y activarlo.
- [ ] **Recordatorios automáticos por email** 24 h y 2 h antes de la clase (activar el cron `sendClassReminders` + `ENABLE_CRON_JOBS=true` en prod) y aviso de créditos por vencer.
- [ ] **Lineamientos editables por disciplina** + notificación in-app persistente tras tomar cada crédito (hoy es un aviso fijo en la confirmación).
- [ ] **Pase de check-in en Apple/Google Wallet** (passkit ya está en el stack).

## Fase 3 (más adelante)

- [ ] **Sitio público rediseñado** replicando/mejorando `casashe.mx` con la nueva marca, integrado al sistema.
- [ ] **Tienda de ropa deportiva** (e-commerce).
- [ ] **Fuel Bar** (barra de bebidas) y **eventos privados**.
- [ ] **WhatsApp API oficial** (Twilio/Meta) para recordatorios 100% automáticos (hoy: wa.me + email).
- [ ] Reactivar/depurar módulos avanzados si se necesitan (reportes financieros, nómina, POS).

---

_Última actualización: 2026-06-26. Mantener este archivo al día conforme se cierren puntos._
