# Plan de Pruebas de Endpoints — Usuarios, Reservas, Cancelaciones

**Fecha:** 2026-05-18
**API base (prod):** `https://balance-room-api-production.up.railway.app`
**Salud verificada:** `GET /api/health` → 200 · `/api/plans` → 10 planes (individual/mixto/sample) · guards de auth → 401 sin token.

Convención: todos los paths llevan prefijo `/api`. Auth = header `Authorization: Bearer <jwt>`. Estados esperados entre paréntesis.

---

## 0. Preparación

1. Crear/usar 3 usuarios de prueba: `cliente@test`, `instructor@test`, `admin@test`.
2. `POST /api/auth/login` con cada uno → guardar tokens (`TKN_CLIENT`, `TKN_INSTR`, `TKN_ADMIN`).
3. Tener: 1 membresía **mixto** activa con créditos, 1 membresía **individual** atada a Wunda, 1 clase futura en Wunda, 1 en Barre, 1 clase `is_free=true`, 1 clase llena.
4. Ejecutar contra **staging** o usuario de prueba; las pruebas de creación/cancelación MUTAN datos.

---

## 1. USUARIOS (`/api/users`, `/api/auth`)

| # | Método/Path | Auth | Caso | Esperado |
|---|---|---|---|---|
|U1|POST /auth/register|público|email nuevo, password 8+|201 + user + token|
|U2|POST /auth/register|público|email repetido|409/400 "email en uso"|
|U3|POST /auth/register|público|password < 8|400 zod|
|U4|POST /auth/login|público|credenciales válidas|200 + token (sin password_hash)|
|U5|POST /auth/login|público|password incorrecto|401|
|U6|GET /auth/me|client|token válido|200 user (+instructor si aplica)|
|U7|GET /auth/me|—|sin token|401|
|U8|POST /auth/forgot-password|público|email existente|200 {message:'sent'} (no revela existencia)|
|U9|POST /auth/reset-password|público|token inválido|400|
|U10|POST /auth/change-password|client|currentPassword incorrecto|400/401|
|U11|GET /users|admin|listar|200 + paginación|
|U12|GET /users|client|sin rol admin|403|
|U13|GET /users?search=&withMembership=true|admin|filtro|200 (verificar perf)|
|U14|GET /users/:id|client (propio)|ver perfil propio|200 sin password_hash|
|U15|GET /users/:id|client (ajeno)|ver otro|403|
|U16|GET /users/:id|admin|ver cualquiera|200|
|U17|POST /users|admin|alta válida|201 + tempPassword si sin password|
|U18|POST /users|admin|email duplicado|409/400|
|U19|PUT /users/:id|client (propio)|update perfil|200|
|U20|PUT /users/:id|client (ajeno)|403|
|U21|PUT /users/:id|admin|isActive=false|200 (verificar bypass de schema admin)|
|U22|PATCH /users/:id/status|admin|is_active boolean|200; no-boolean→400|
|U23|POST /users/:id/photo|client (propio)|imagen ≤10MB|200 + url|
|U24|POST /users/:id/photo|client|archivo no-imagen|400|
|U25|POST /users/:id/photo|client|archivo >10MB|413/400 (multer)|
|U26|DELETE /users/:id|admin|usuario CON historial|200 type=soft_delete (is_active=false)|
|U27|DELETE /users/:id|admin|usuario SIN historial|200 type=hard_delete|
|U28|DELETE /users/:id|admin|a sí mismo|403/400|
|U29|POST /users/:id/resend-credentials|admin|reenviar|200 + nueva tempPassword|
|U30|PUT /users/:id/founder|admin|is_founder=true|200; repetir→ unchanged:true (idempotente)|
|U31|POST /users/:id/founder/reset|admin|limpiar beneficios|200 + audit|

---

## 2. RESERVAS (`/api/bookings`)

| # | Método/Path | Auth | Caso | Esperado |
|---|---|---|---|---|
|R1|POST /bookings|client|clase futura, membresía mixto con créditos|201; `classes_remaining` −1; `current_bookings` +1|
|R2|POST /bookings|client|sin membresía activa ni créditos|403|
|R3|POST /bookings|client|clase llena|400 "clase llena"|
|R4|POST /bookings|client|clase ya iniciada/pasada|400 "el horario ya pasó"|
|R5|POST /bookings|client|doble reserva misma clase|400/409 ya reservada|
|R6|POST /bookings|client|clase `is_free=true` sin membresía|201 sin descontar crédito (is_free_booking=true)|
|R7|POST /bookings|client|**membresía individual atada a Wunda + clase en Wunda**|201|
|R8|POST /bookings|client|**membresía individual atada a Wunda + clase en Barre**|422 mensaje "solo para el estudio Wunda"|
|R9|POST /bookings|client|membresía mixto + clase en cualquier estudio|201|
|R10|POST /bookings|client|**membresía individual atada + clase con facility_id NULL**|⚠️ actualmente 422 (decisión de negocio, ver Hallazgo M1)|
|R11|POST /bookings|—|sin token|401|
|R12|POST /bookings|client|classId no-uuid|400 zod|
|R13|POST /bookings|client|classId inexistente|404|
|R14|POST /bookings/bulk-month|admin|mes futuro, créditos suficientes|200 N reservas; créditos −N (transaccional, FOR UPDATE)|
|R15|POST /bookings/bulk-month|admin|créditos insuficientes|400 ROLLBACK (sin reservas, sin descuento)|
|R16|POST /bookings/bulk-month|admin|mes pasado|400|
|R17|POST /bookings/admin-book|admin|reservar para usuario|201 membership_id NULL (gratis — ver Hallazgo M3)|
|R18|GET /bookings|admin/instr|listar + filtros status/fecha/búsqueda|200|
|R19|GET /bookings|client|sin rol|403|
|R20|GET /bookings/my-bookings|client|propias|200|
|R21|GET /bookings/:id|client (propia)|200 (sin user_email)|
|R22|GET /bookings/:id|client (ajena)|403|
|R23|GET /bookings/class/:classId|admin/instr|asistentes + waitlist|200|
|R24|POST /bookings/:id/check-in|instr|confirmada→checked_in|200; otorga +2 pts (fire-and-forget)|
|R25|POST /bookings/:id/check-in|client|sin rol|403|
|R26|POST /bookings/:id/uncheck-in|instr|checked_in→confirmed|200; estado != checked_in→400|

**Concurrencia (carga):** lanzar R1 en paralelo (mismo usuario, 1 crédito restante, 2 clases) → verificar que NO baje a negativo (ver Hallazgo C1).

---

## 3. CANCELACIONES

| # | Método/Path | Auth | Caso | Esperado |
|---|---|---|---|---|
|C-1|GET /bookings/:id/cancel-preview|client|dentro de ventana|200 canCancel=true, willRefund coherente|
|C-2|POST /bookings/:id/cancel|client (propia)|dentro de ventana|200 status=cancelled, crédito reembolsado, contador +1|
|C-3|POST /bookings/:id/cancel|client|fuera de ventana (< minHours)|400 (sin reembolso)|
|C-4|POST /bookings/:id/cancel|client|clase ya iniciada|400|
|C-5|POST /bookings/:id/cancel|client (ajena)|403|
|C-6|POST /bookings/:id/cancel|client|**doble cancelación**|actualmente 400 ALREADY_CANCELLED (ver Hallazgo H2: idealmente 200 idempotente)|
|C-7|POST /bookings/:id/cancel|client|cancelar con waitlist → promueve siguiente|200; siguiente pasa a confirmed y se le descuenta crédito (ver Hallazgo C2)|
|C-8|DELETE /classes/:id|admin|clase con N reservas|200 {cancelledBookings:N, refundedCredits} todas reembolsadas|
|C-9|DELETE /classes/:id|client|sin rol|403|
|C-10|POST /memberships/:id/cancel|client (propia)|sin refund|200 status=cancelled (sin reembolso por defecto)|
|C-11|POST /memberships/:id/cancel|admin|refund=true|200 pagos→refunded, puntos revertidos|
|C-12|POST /memberships/:id/cancel|client|**doble cancelación**|200 idempotente (re-fetch, sin efectos)|
|C-13|POST /memberships/:id/cancel|client (ajena)|403|

---

## 4. Smoke en vivo (solo-lectura) — ejecutado 2026-05-18

| Check | Resultado |
|---|---|
|GET /api/health|✅ 200|
|GET /api/plans (público)|✅ 200, 10 planes (individual/mixto/sample)|
|GET /api/facilities/public/maps|✅ 200|
|POST /api/bookings sin token|✅ 401 (guard OK)|
|GET /api/users sin token|✅ 401 (guard OK)|

---

## 5. Hallazgos / Bugs (auditoría de código)

Severidad → archivo:línea → recomendación.

### CRÍTICOS (integridad de créditos)

- **C1 — Descuento de crédito NO transaccional al reservar.** `src/routes/bookings.ts:~468` — se hace `UPDATE memberships SET classes_remaining-1` y luego el `INSERT booking` por separado, sin transacción ni `FOR UPDATE`. Si el INSERT falla, el crédito se pierde; bajo concurrencia puede sobre-descontar. **Fix:** envolver SELECT…FOR UPDATE + UPDATE + INSERT en una transacción.
- **C2 — Promoción de waitlist NO transaccional.** `src/routes/bookings.ts:~819-830` — `UPDATE booking→confirmed` y el descuento de crédito del promovido en queries separadas. **Fix:** una sola transacción.
- **C3 — Cancelación de clase con reembolsos NO atómica.** `src/lib/cancel-class.ts:~10-45` — marca clase cancelada, luego itera bookings y reembolsa créditos sin transacción; un crash a mitad deja reembolsos parciales. **Fix:** envolver todo el loop en transacción con locks.
- **C4 — Reversa de puntos en cancelación de membresía sin await efectivo.** `src/routes/memberships.ts:~649` — `reversePaymentLoyaltyPoints().catch(()=>0)` dentro de la tx; si falla, la tx igual hace COMMIT y los puntos no se revierten. **Fix:** dejar burbujear el error para rollback, o reconciliar aparte.

### ALTOS

- **H1 — Parsing de fecha/hora del corte de reserva frágil.** `src/routes/bookings.ts:~365-405` — offset fijo `-06:00`, sin DST/IANA. Riesgo de permitir/bloquear reservas por TZ. **Fix:** usar zona `America/Mexico_City` explícita.
- **H2 — Doble cancelación devuelve 400 en lugar de 200 idempotente** (bookings). `src/routes/bookings.ts:~759`. **Fix:** mapear ALREADY_CANCELLED → 200.

### MEDIOS

- **M1 — Regla de estudio bloquea clases con `facility_id` NULL** para membresías individuales. `src/lib/membershipStudio.ts:~16`. **Es una decisión de negocio intencional** (test lo cubre): una clase sin estudio no se puede verificar contra el paquete individual. Hoy hay **0 clases sin estudio** en prod, así que no afecta. Si se quiere permitir clases "abiertas", cambiar a `if (!boundFacilityId || !classFacilityId || classFacilityId===boundFacilityId) return null;`. **Requiere confirmación de negocio.**
- **M2 — Reducir capacidad de clase usa `current_bookings`** que puede desincronizarse. `src/routes/classes.ts:~590`. **Fix:** `COUNT(bookings)` real al validar.
- **M3 — `POST /bookings/admin-book` reserva siempre con `membership_id NULL`** (gratis); no permite reservar contra la membresía del usuario. Ambiguo. **Fix:** documentar o agregar `membershipId` opcional + descuento.

### BAJOS

- **B1** — `GET /users?withMembership=true` usa LATERAL costoso (perf con muchos usuarios).
- **B2** — Hard-delete de usuario cae a soft-delete silenciosamente sin detallar la FK bloqueante.
- **B3** — `refund` por defecto `false` en cancelación de membresía (el admin puede olvidarlo y no reembolsar).
- **B4** — Registro: si falla la generación del código de referido, el usuario se crea pero sin código.

---

## 6. Prioridad de corrección sugerida

1. C1, C2 (transaccionalidad de créditos al reservar / waitlist) — riesgo de dinero/créditos.
2. C3 (cancelación de clase atómica).
3. C4 (reversa de puntos).
4. H2 (idempotencia de doble cancelación) — quick win.
5. M1 — decisión de negocio (confirmar antes de tocar).
6. H1, M2, M3 — robustez.
7. Bajos — mejora continua.

> Nota: C1–C4 son **preexistentes** (no introducidos por los cambios recientes de paquetes/estudios). La regla de estudio (M1) es la única relacionada con el trabajo reciente y es **intencional**.
