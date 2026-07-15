# Inventario — Casa Shé

> Levantado antes de la auditoría de cobertura (skill `pilates-studio-auditor`, modo auditoría contra código existente).

## Perfil de operación

- Reformer con lugares numerados (tabla `reformers`, seat selection) + multi-disciplina (Pilates Reformer, Barre, Sculpt, Yoga, Flex, Salsa).
- Buckets de crédito por categoría: **Salsa** (categoría `reformer`) y **Clases** (categoría `multi`). `NULL` = ilimitado, `0` = sin acceso, `N` = N créditos.
- Una sucursal principal (Condesa, CDMX); el código soporta multi-facility en el esquema pero opera una.
- Cobro **mixto**: MercadoPago (online, tarjeta) + efectivo/transferencia en recepción (activación manual) + Stripe también integrado.
- Timezone del estudio: `America/Mexico_City` (CDMX, UTC-6 todo el año desde que México abolió el DST nacional en 2022; el código calcula el offset dinámicamente vía `Intl.DateTimeFormat`, no lo hardcodea).
- Canal de mensajes: WhatsApp (Evolution API) + Web Push + email. Wallet Apple (PKPass) + Google Wallet.
- Lealtad: puntos + beneficios canjeables (`free_class`, `bar_discount`, `free_drink`). Fuel Bar (barra de bebidas) con su propio flujo de pago.
- No usa agregadores tipo TotalPass/Wellhub/Fitpass hasta donde se sabe.

## Actores presentes

- **App/portal de clienta** — reservas, membresías, wallet, lealtad, bar, perfil.
- **Panel admin** — configuración, catálogo, membresías, reportes, auditoría, staff.
- **Panel de recepción** — venta en mostrador, check-in, cola de bar, dashboard del día.
- **Portal de coach/instructora** — sus clases, alumnas, sustituciones, nómina.
- **Jobs automáticos (cron)** — generación de clases, no-shows/auto-checkin, expiración de membresías, recordatorios, bonos de lealtad.
- **Webhooks** — MercadoPago y Stripe.

## Módulos detectados

Registro/identidad, calendario/reservas + waitlist, cancelaciones, paquetes/membresías, pagos (online + manual), check-in (QR/self/manual), wallet passes, notificaciones multi-canal, panel admin/config, instructoras, reportes, seguridad/auth.

## Stack y puntos de integración

- **Backend**: Node/Express + TypeScript, Postgres (Railway), migraciones como bloques inline idempotentes en `runStartupMigrations()` (`backend/src/index.ts`), con los `.sql` de `database/migrations/` como copia de referencia (no autoritativa).
- **Frontend**: React + Vite, PWA instalable (`manifest.json`, `coach-manifest.json`, service worker).
- **Pagos**: MercadoPago (Checkout Pro, webhook con firma HMAC) + Stripe (Checkout, webhook con firma).
- **Mensajería**: WhatsApp vía Evolution API, email (transición a Resend pendiente según memoria previa), Web Push.
- **Wallet**: Apple PKPass (firmado) + Google Wallet API.
- **Auditoría previa (2026-07-10)**: 5 P0 + 9 P1 de un audit de concurrencia/dinero/timezone ya corregidos y en `main` (sobrecupo, idempotencia de fulfillment, escalada de privilegios, timezone de check-in, vigencia de membresías, beneficios de lealtad, reembolsos Stripe+MP). Esta auditoría de cobertura funcional es complementaria: no repite esos hallazgos, verifica que sigan cerrados donde el escenario los toca (ver EC1, EC2, EC9, EC10, L6 en `cobertura.md`).

## Qué NO se pudo verificar solo con código

Pagos reales end-to-end (requiere sandbox/prod), backups de Postgres en Railway, entrega real de WhatsApp/push en dispositivo, comportamiento de Apple Wallet en un iPhone físico. Marcado como ❓ en `cobertura.md` donde aplica.
