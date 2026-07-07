# Lealtad (puntos) — Activar + Limpiar · Diseño

**Fecha:** 2026-07-07
**Autor:** Said (con Claude)
**Rama:** `feat/loyalty-activation` (desde `main`)
**Estado:** aprobado por el dueño (diseño); pendiente escribir plan de implementación.

## Contexto y hallazgo clave

El sistema de lealtad de Casa Shé **ya está construido de punta a punta y mayormente vivo** (un mapeo del código real —4 lectores + síntesis— lo confirmó; la nota previa que lo daba por "desactivado" estaba desactualizada). Hoy ya funciona en producción:

- **Ganancia de puntos (activa):** bienvenida (`awardWelcomeBonus`), compra (`awardPaymentLoyaltyPoints`, `floor(monto/pesos_per_point)`), referido (`awardReferralBonus`), check-in (`awardCheckinPoints`).
- **Gasto de puntos (activo):** canje de catálogo (`POST /api/loyalty/redeem` → tabla `redemptions` + asiento negativo en `loyalty_points`) y pago en el Fuel Bar (`spendBarPoints`/`refundBarPoints`, Fase 2).
- **Ledger:** tabla `loyalty_points` (asientos con `type`), snapshot en `users.loyalty_points` vía `syncUserLoyaltyPointsSnapshot`.
- **Admin (enlazado en nav "Lealtad"):** `LoyaltyConfig`, `LoyaltyRewards` (CRUD catálogo), `LoyaltyRedemptions`, `LoyaltyAdjust`.
- **Cliente (enlazado):** `/app/wallet` (saldo, racha, referidos), `/app/wallet/rewards` (canje), `/app/wallet/history`.

Por lo tanto, **"lealtad completa" no es construir mucho, sino activar + limpiar + hacer coherente la economía.** No se construyen niveles/VIP (tiers) ni expiración de puntos (decisión del dueño).

## Objetivo

Dejar la lealtad coherente, activada y limpia:
1. Economía de puntos consistente a **~5% de vuelta (1 punto ≈ $0.50 MXN)**.
2. Config de lealtad unificada (una sola fuente de verdad).
3. Los 3 bonos automáticos (cumpleaños/aniversario/racha) **encendidos con gating granular** (sin activar otros crons que no están listos).
4. Limpieza: quitar la promesa falsa de "reseña", retirar el seed de marca ajena (BMB), sincronizar el schema.

## Decisiones tomadas (dueño)

- **Alcance:** activar + limpiar. Sin tiers ni expiración.
- **Generosidad:** ~5% de vuelta → **1 punto ≈ $0.50**.
- **Reseñas:** **quitar** la promesa "gana 50 puntos por reseña" de la UI (no existe código que los otorgue).
- **Seed BMB:** **dejar de sembrarlo + borrar** las sucursales/planes "BMB Studio Tepa/San Miguel", verificando primero en prod que no tengan reservas/datos reales antes de borrar.
- **Gating de crons:** **granular** — encender solo los bonos de lealtad, dejando los recordatorios por email apagados (aún sin Resend configurado).

---

## Diseño por componentes

### 1. Economía de puntos (~5%, 1 pt ≈ $0.50)

**Regla:** ganar 1 pt por cada $10 gastados (se mantiene `pesos_per_point = 10`), y cada punto vale ~$0.50 al canjear → ~5% de valor de vuelta.

- **Ganancia:** sin cambios (`pesos_per_point = 10` ya da ~5% si el punto vale $0.50).
- **Tasa de canje del Fuel Bar:** `bar_config.points_redemption_rate` hoy = **10** (interpretado como "MXN que cubre 1 punto" → 1 pt = $10). Debe pasar a **0.50**. Esto es **config del Fuel Bar** (`bar_config` en `system_settings`), no del motor de lealtad:
  - El *default en código* vive en `settings.ts` dentro de `bar_config`, que hoy solo existe en la rama `feat/fuel-bar-fase2` (PR #38, sin mergear). Por eso la corrección del default se entrega **como parte del Fuel Bar** (folded en PR #38 antes de mergear, o corregido en `settings.ts` cuando ambas ramas converjan).
  - El *valor vivo en prod* se corrige como cambio de config en **Ajustes → Barra** (o `UPDATE system_settings` vía Railway).
  - **Interfaz/contrato:** `pointsForTotal(total, rate) = ceil(total / rate)` ya existe; con `rate = 0.50`, una bebida de $80 = 160 pts. No cambia la fórmula, solo el valor.
- **Catálogo de recompensas (`loyalty_rewards`):** reprecio para que `points_cost ≈ precio_en_pesos / 0.50` (una recompensa de $50 = 100 pts). Es **dato de admin en prod**: durante implementación se listan las recompensas reales (`SELECT ... FROM loyalty_rewards`) y se ajusta cada `points_cost`. Se documenta la tabla antes/después.
- **Copy de "valor del punto"** en el cliente (si existe en `Wallet.tsx`/`WalletRewards.tsx`): alinear a "1 punto ≈ $0.50" donde se muestre.

**Montos de bonos (quedan; editables desde admin):** con 1 pt = $0.50 los defaults actuales son razonables — bienvenida 10 (~$5), cumpleaños 100 (~$50), aniversario 40 (~$20), referido 40 (~$20), racha 10 (~$5), check-in 2 (~$1). No se cambian en código; el dueño los ajusta desde `LoyaltyConfig`.

### 2. Unificar config de lealtad (bug real)

Hoy hay **dos fuentes de defaults que no coinciden**:
- `loyalty.ts` (motor real, 9 campos completos): `points_per_class`, `pesos_per_point`, `welcome_bonus`, `birthday_bonus`, `anniversary_bonus`, `referral_bonus`, `streak_bonus`, y los demás.
- `settings.ts` (interface, solo 4 campos, defaults hasta 5× distintos).

**Decisión:** `loyalty.ts` es la **única fuente de verdad** de la config de lealtad. Acciones:
- Alinear o eliminar la definición duplicada en `settings.ts` para que no exista un segundo set de defaults divergente. Si algún código lee la config vía `settings.ts`, redirigirlo a la config del motor.
- Verificar que la página admin **`LoyaltyConfig`** exponga **los 9 campos** (hoy podría faltar `anniversary_bonus`, `streak_bonus`, `pesos_per_point`) para que el dueño los ajuste sin tocar código.
- Verificar (o sembrar) la fila real `system_settings.loyalty_config` en prod para que use los valores canónicos.

### 3. Activar los 3 bonos automáticos — gating granular

Los crons `BIRTHDAY_BONUS`, `ANNIVERSARY_BONUS`, `STREAK_BONUS` (en `cron-jobs.ts`) ya existen, son idempotentes (chequean descripción), validan `config.enabled` y requieren membresía activa. El enum de tipos (`birthday`/`anniversary`/`streak`) ya está extendido en runtime (migración 023f) — **no hay bug de enum**.

**Problema:** el único gate hoy es `ENABLE_CRON_JOBS` (env), que es **global** — enciende TODOS los crons, incluyendo recordatorios por email que aún no tienen Resend configurado. Prender el flag global mandaría recordatorios rotos.

**Decisión:** introducir **gating granular** para los bonos de lealtad, independiente del flag global:
- Nuevo control `ENABLE_LOYALTY_CRONS` (env, o sub-flag equivalente) que registra/activa **solo** los 3 crons de bonos de lealtad.
- Los demás crons (recordatorios email, review-request, etc.) permanecen apagados hasta que sus dependencias (Resend) estén listas.
- Implementación: separar el registro de los 3 crons de bonos del resto en `cron-jobs.ts`/`index.ts`, gateado por el nuevo flag. No cambiar la lógica interna de los crons.

### 4. Limpieza

- **Promesa de reseña:** quitar el texto "gana 50 puntos por reseña" de la UI del cliente (donde aparezca — `Wallet.tsx` / request de reseña). No se implementa otorgamiento (fuera de alcance). Verificar que no queden otras copys prometiendo puntos que no se otorguen.
- **Seed BMB (migración 031):** desactivar el bloque de seed que inserta facilities "BMB Studio Tepa"/"BMB Studio San Miguel" y planes BMB en cada arranque (`031_seed_bmb.sql` + bloque inline en `index.ts`). Luego, **verificando en prod** que esas filas no tengan reservas/ventas/datos reales asociados, borrarlas. Si tuvieran datos, escalar al dueño antes de borrar (no borrar ciego).
- **Schema:** sincronizar `schema.sql`/`schema_complete.sql` con el runtime — el enum `loyalty_points_type` obsoleto (sin `birthday/anniversary/streak/welcome/package_purchase`) y la tabla fantasma `rewards` (la app usa `loyalty_rewards`). Es limpieza de documentación de schema; no altera el runtime (las migraciones ganan al arrancar).

### 5. Pruebas

Siguiendo el patrón del repo (scripts `tsx` con `node:assert/strict`, `*-integration` contra Postgres):
- **Economía:** test puro que verifique la coherencia — `pointsForTotal` con `rate=0.50`, y que la relación ganancia/valor dé ~5% (1 pt/$10 ganado, 1 pt = $0.50).
- **Config unificada:** test que confirme que la config de lealtad tiene los 9 campos con los defaults canónicos y que no hay un segundo set divergente.
- **Gating de crons:** test que confirme que con `ENABLE_LOYALTY_CRONS` on / `ENABLE_CRON_JOBS` off, se registran **solo** los 3 crons de bonos y **ningún** cron de email.
- **Idempotencia de bonos:** test (o revisión) de que re-correr un bono no duplica el asiento.
- **Limpieza BMB:** verificación (script/consulta) de que tras la migración de limpieza no quedan facilities/planes BMB, y de que se comprobó la ausencia de datos reales antes de borrar.

---

## Fuera de alcance (explícito)

- Niveles/VIP (tiers) y progresión.
- Expiración/vigencia de puntos.
- Reglas de elegibilidad de canje (hoy cualquier usuario activo canjea cualquier recompensa).
- Otorgamiento real de puntos por reseña (se **quita** la promesa en vez de implementarla).
- Recomendación/personalización de recompensas, mensajería de escasez, proyección de metas.

## Riesgos y notas de secuencia

- **Dependencia con el Fuel Bar (PR #38):** la corrección de `bar_config.points_redemption_rate` (10 → 0.50) pertenece al Fuel Bar; se entrega en esa rama o como config de prod. La rama de lealtad no la incluye en código para no acoplar los PRs.
- **Datos de prod:** el reprecio del catálogo y la limpieza BMB tocan datos reales en Railway. Regla: **verificar antes de escribir/borrar** (`railway run -s Postgres ...`), documentar antes/después, y escalar si hay datos inesperados (ver [[casa-she-prod-db-acceso]]).
- **Encender bonos** empieza a otorgar puntos a socias con membresía activa de inmediato; confirmar que los montos en `LoyaltyConfig` son los deseados antes de activar el flag en prod.
