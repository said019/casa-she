# Auditoría Pre-Producción — Casa Shé

> Barrido adversarial multi-agente (138 agentes, verificación triple por lentes reproducibilidad/integridad-de-datos/seguridad).
> Hallazgos crudos: 42 · Confirmados (≥2/3): 33 · Descartados: 9

## Veredicto

NO-GO para prod mañana: hay 5 defectos P0 independientes (sobrecupo por doble reserva, cobro con tarjeta no idempotente = doble cargo, recepción puede secuestrar cuentas de admin, check-in por QR/wallet 100% roto desde el día 1 por timezone, y la edición de planes —que se hará en el reprecio de catálogo planeado— destruye en silencio la vigencia pagada de todas las membresías), cada uno causando pérdida de dinero, corrupción de créditos/puntos o toma de cuenta en las primeras horas; los 5 P0 son fixes acotados y verificables, así que la recomendación es tapar P0 + los P1 de reversión de puntos/reembolso antes de abrir.

## Temas transversales (raíces sistémicas)

- TIMEZONE naive en todo el check-in: la hora de clase es timestamp de pared CDMX pero se compara contra NOW() (timestamptz, sesión UTC) o se parsea con new Date() en la TZ del proceso Node (UTC). Un solo defecto raíz golpea 3 sitios (checkin.ts:283 QR, checkin.ts:519 self, checkin.ts:142 log) y rompe QR+wallet+self+puntualidad desde el minuto uno. El resto del repo ya usa AT TIME ZONE 'America/Mexico_City' — estos son los únicos que lo omiten.
- FALTA DE IDEMPOTENCIA + LOCKING en todos los caminos de dinero/beneficios concurrentes: patrón repetido de leer-fuera-de-tx, sin SELECT ... FOR UPDATE, sin verificar rowCount y sin constraint de BD (UNIQUE/CHECK) como red de seguridad. Aparece en cupo de clase (bookings.ts:443/897), fulfillment de orden (orderFulfillment.ts:21), beneficio free_class (bookings.ts:771), beneficios de barra (bar.ts:215), puntos de check-in (loyalty.ts:335) y assign/activate de membresías (memberships.ts:456/605). Las guardas están solo en aplicación y la BD no frena ningún duplicado.
- PUNTOS DE LEALTAD = DINERO REAL SIN CAMINO DE REVERSIÓN: los puntos y beneficios se otorgan pero nunca se revierten en ninguna rama de fallo/reversión — reembolso (stripe-webhook.ts:63), rechazo de orden (orders.ts:959), no-show auto-check-in (cron-jobs.ts:491), doble check-in (loyalty.ts:335) — y los beneficios pagados con puntos se pierden al cancelar (bookings.ts:1402). Fuga de valor en cada excepción.
- FLUJOS DE CANCELACIÓN/REEMBOLSO NO ATÓMICOS NI UNIFICADOS: existen varios caminos de cancelación (DELETE /:id, PUT status='cancelled', cancelClassWithRefunds) con comportamientos divergentes; el reembolso se hace en autocommit y en orden peligroso (cancelar antes de reembolsar), y no se restauran beneficios. Debe consolidarse en una sola ruta transaccional.
- AUTORIZACIÓN QUE CONFÍA EN EL TOKEN SIN RE-VERIFICAR BD: is_active, role y is_reception_master se toman del JWT (7 días) sin revocación; operaciones sensibles sobre staff mal protegidas (reset de credenciales) y tokens de reset reutilizables. Superficie de escalada/persistencia de acceso.
- ESCRITURAS DE DOS STATEMENTS SIN TRANSACCIÓN que corrompen ante fallo parcial (ledger+snapshot de puntos en cron-jobs.ts:577; cancelar+reembolsar en cancel-class.ts:65); necesitan envolverse en una sola tx o recomputarse de forma idempotente.

## P0 — BLOQUEAN PRODUCCIÓN

### P0-1. [reservar] Carrera de sobrecupo en POST /api/bookings: la clase nunca se bloquea ni revalida dentro de la transacción

- **Ubicación:** `routes/bookings.ts:443`
- **Por qué duele:** El chequeo current_bookings>=max_capacity (443) se lee ANTES de la tx (queryOne 432); la tx (BEGIN 640) solo hace FOR UPDATE de la MEMBRESÍA, nunca SELECT ... FROM classes FOR UPDATE. El trigger update_class_booking_count solo suma y NO hay CHECK(current_bookings<=max_capacity). Dos clientas concurrentes leen 7<8, ambas confirman → current_bookings=9 en una clase de 8, dos personas al mismo reformer, sin error y sin backstop de BD. Es la ruta principal de la clienta; joinWaitlist/promote/bulk sí bloquean la clase, esta no.
- **Fix:** Dentro de la tx, tras BEGIN y antes del INSERT: SELECT current_bookings,max_capacity FROM classes WHERE id=$1 FOR UPDATE y rechazar si lleno (igual que waitlist.ts:79-96). Añadir CHECK(current_bookings<=max_capacity) como red de seguridad.

### P0-2. [pagos] finalizePaidOrder no es idempotente: dos webhooks/sync concurrentes = doble membresía, doble cobro y dobles puntos (dedup #16+#28)

- **Ubicación:** `lib/orderFulfillment.ts:21`
- **Por qué duele:** El único guard 'if order.status===approved return' se lee FUERA de la tx sin FOR UPDATE; el UPDATE orders SET status='approved' no lleva WHERE status<>'approved'; memberships.order_id NO tiene UNIQUE. Se invoca desde dos caminos concurrentes (webhook MP routes/mercadopago-webhook.ts:82 y admin POST /orders/:id/sync-mp) y MP reintenta la misma notificación con x-request-id distinto. Ambas pasan el guard → 2 membresías activas, 2 payments y awardPaymentLoyaltyPoints otorga puntos dos veces (paymentId distinto rompe su dedup por descripción). Doble cargo real por un solo pago con tarjeta.
- **Fix:** Dentro de la tx: SELECT status FROM orders WHERE id=$1 FOR UPDATE y abortar si 'approved'; o UPDATE orders SET status='approved' ... WHERE id=$1 AND status<>'approved' y solo cumplir si rowCount===1. Añadir índice UNIQUE parcial en memberships(order_id) WHERE order_id IS NOT NULL.

### P0-3. [admin] Cualquier recepción puede resetear la contraseña de un admin y recibe el password en texto plano → toma de cuenta / escalada

- **Ubicación:** `routes/users.ts:758`
- **Por qué duele:** POST /:id/resend-credentials permite role 'reception' y NO valida que el objetivo sea client (a diferencia del guard de PUT /:id en 902-908). Reescribe el password_hash del admin objetivo y devuelve {tempPassword:'<plano>'} en el body (835). Una recepcionista normal resetea a un admin, hace login con ese temp password y obtiene JWT role='admin' → control total (precios, borrar usuarios, caja, reembolsos, PII), o deja al admin bloqueado (DoS/secuestro). El propio código ya contempla objetivos no-cliente (805), confirmando que es alcanzable.
- **Fix:** Recepción solo puede reenviar credenciales si target.role==='client' (replicar guard 902-908); exigir admin/super_admin para resetear staff. Nunca devolver tempPassword en el body para objetivos no-cliente; entregar por el canal del propio usuario.

### P0-4. [checkin] Check-in por QR compara la hora de clase (pared CDMX) contra NOW() en UTC: desfase de 6h, ningún QR funciona a la hora real (dedup #21+#29)

- **Ubicación:** `routes/checkin.ts:283`
- **Por qué duele:** El SELECT filtra (c.date+c.start_time) BETWEEN NOW()-30min AND NOW()+30min. c.date+c.start_time es timestamp naive = hora de pared CDMX; NOW() es timestamptz; la sesión Postgres está en UTC (Railway default), así que la clase se interpreta 6h antes. Clase 09:00 CDMX (=15:00 UTC): ventana [14:30,15:30]Z, clase casteada a 09:00Z → 0 filas → 404 'No se encontró reserva válida'. Es la ÚNICA comparación del repo sin AT TIME ZONE (el resto —no-show 760, bar.ts:42, index.ts:2939— sí lo usa). QR de recepción/coach/wallet inservible desde el minuto uno; agravado porque los crons (autoCheckIn que lo enmascaraba) están apagados.
- **Fix:** Usar (NOW() AT TIME ZONE 'America/Mexico_City') en el BETWEEN y en el ORDER BY (284), como el resto del código.

### P0-5. [membresias] Editar cualquier plan reescribe end_date de todas las membresías activas y borra extensiones por pausa/ajuste manual (se dispara con el reprecio de catálogo planeado)

- **Ubicación:** `routes/plans.ts:250`
- **Por qué duele:** PUT /plans/:id, cuando el body trae durationDays (los formularios lo mandan SIEMPRE), ejecuta un UPDATE masivo end_date=start_date+durationDays para toda membresía active/paused/pending del plan. Sobrescribe en silencio extensiones de /resume (días de pausa), PATCH /:id/dates y overrides, sin comparar duración previa y sin audit. Con el 'reprecio catálogo' pendiente en ops, se van a editar planes en la ventana de lanzamiento → pérdida masiva y silenciosa de vigencia pagada de todas las clientas.
- **Fix:** Recomputar solo si durationDays realmente cambió (comparar con valor previo) y NUNCA en membresías con paused_at aplicado o end_date != start_date+old_duration (o bandera dates_overridden). Registrar el cambio masivo en audit.

## P1 — GRAVES

### P1-1. [lealtad] Beneficio de clase gratis (free_class) se consume sin verificar rowCount → dos clases gratis con un solo beneficio (dedup #2+#32)

- **Ubicación:** `routes/bookings.ts:771`
- **Por qué duele:** El beneficio se lee FUERA de la tx (607-621, isFreeClass=true) y el consumo UPDATE user_benefits SET status='used' WHERE id AND status='active' (771-776) NO revisa rowCount ni hace rollback (a diferencia de los créditos en 749). El índice único solo cubre la MISMA clase. Dos reservas concurrentes de clases DISTINTAS ven el beneficio 'active', ambas comitean gratis. Pérdida de ingreso replicable con N requests.
- **Fix:** Leer/reservar el beneficio DENTRO de la tx con SELECT ... FOR UPDATE y tras el UPDATE verificar rowCount===1; si 0 → ROLLBACK y cobrar crédito o devolver 409.

### P1-2. [cancelar] Al cancelar, la clase gratis de lealtad se pierde para siempre: nunca se reactiva el user_benefit

- **Ubicación:** `routes/bookings.ts:1402`
- **Por qué duele:** Reserva con is_free_booking=true (beneficio 'used'): cancel_booking (index.ts:1912) hace should_refund=false y no toca user_benefits; el handler (1401-1522) tampoco; cancelClassWithRefunds lo omite (consumed_category NULL). No existe ningún camino que vuelva a poner un user_benefit en 'active'. La clienta pierde el beneficio que pagó con puntos aun cancelando a tiempo o cuando el estudio cancela la clase.
- **Fix:** En la ruta /:id/cancel y en cancelClassWithRefunds, si is_free_booking: UPDATE user_benefits SET status='active', used_at=NULL, used_on_booking_id=NULL WHERE used_on_booking_id=<id> AND status='used' AND expires_at>NOW(), dentro de la misma tx. No reactivar si ya expiró.

### P1-3. [cancelar] PUT /classes/:id acepta status='cancelled' y salta reembolso de créditos y cancelación de reservas

- **Ubicación:** `routes/classes.ts:751`
- **Por qué duele:** ClassUpdateSchema incluye 'cancelled' y el PUT lo escribe directo a classes.status (751-754) sin pasar por cancelClassWithRefunds. No cancela bookings, no reembolsa créditos, no fija cancelled_at/by/reason, no notifica; current_bookings queda inflado. Un admin cancela una clase de 8 reservas por esta vía y se pierden 8 créditos pagados sin rastro de auditoría.
- **Fix:** Quitar 'cancelled' del enum de ClassUpdateSchema y/o, si status==='cancelled', redirigir a cancelClassWithRefunds. Toda cancelación debe pasar por el flujo con reembolso.

### P1-4. [admin] authenticate no verifica is_active ni revocación: staff despedido/degradado conserva acceso admin hasta 7 días

- **Ubicación:** `middleware/auth.ts:35`
- **Por qué duele:** req.user se construye solo del JWT (role, isReceptionMaster) sin consultar BD; requireRole hace next() con el rol del TOKEN (solo consulta BD para promociones, no para degradaciones) e isElevated confía en el flag del token. TTL 7 días. PATCH /status y PUT /role escriben en BD pero no invalidan los JWT emitidos → una recepcionista despedida sigue abriendo caja, vendiendo membresías, procesando reembolsos y viendo PII hasta 7 días.
- **Fix:** En authenticate cargar la fila del usuario y rechazar is_active=false (o versionar con token_version/password_changed_at). Que requireRole/requirePermission/isElevated lean role e is_reception_master vigentes de la BD, o reducir TTL + revocación.

### P1-5. [checkin] Self check-in parsea la hora de clase en TZ del proceso (UTC): mismo desfase de 6h, siempre 'el tiempo para check-in ha pasado' (dedup #22+#30)

- **Ubicación:** `routes/checkin.ts:519`
- **Por qué duele:** new Date(`${class_date}T${class_start_time}`) sin offset se interpreta en la TZ del proceso Node (UTC en Railway), pero la hora es de pared CDMX → classStart 6h antes. diffMinutes cae en <-15 → 400. self_checkin_enabled está ON por default (446), así que es un flujo vivo que nunca funciona a la hora real de la clase; solo queda el check-in manual como respaldo.
- **Fix:** Calcular el instante UTC real con Intl.DateTimeFormat('America/Mexico_City').formatToParts (como ya hace POST /api/bookings 486-504) o mover el gating a SQL con AT TIME ZONE 'America/Mexico_City'.

### P1-6. [checkin] autoCheckIn marca asistencia y otorga puntos a clientas que NO fueron; deja muerto el rastreo de no-shows

- **Ubicación:** `services/cron-jobs.ts:491`
- **Por qué duele:** autoCheckIn pasa TODA reserva 'confirmed'→'checked_in' 30 min tras el INICIO, sin verificar presencia, y llama awardCheckinPoints() (puntos canjeables). Gana la carrera a markNoShows (corre tras el FIN+30) → markNoShows nunca marca a nadie, streakBonus regala más puntos y reports.ts calcula no_shows≈0 con 'attended' inflado. Emite dinero (puntos) a ausentes y elimina el disuasor de no-show cuando se encienda ENABLE_CRON_JOBS (pendiente en ops).
- **Fix:** No auto-acreditar asistencia+puntos por no cancelar: eliminar autoCheckIn y dejar el check-in real (QR) como única vía que otorga puntos, o usar un status neutral sin awardCheckinPoints. Si se conserva, correr markNoShows ANTES.

### P1-7. [bar] Pago con tarjeta ignora el descuento de lealtad de barra pero marca el beneficio usado: MercadoPago cobra el total completo

- **Ubicación:** `routes/bar.ts:275`
- **Por qué duele:** El descuento (bar_discount/free_drink) solo se resta de totals.total_mxn (155-161); los mpItems se construyen desde 'priced' a precio completo+recargo (275-278) sin restar el beneficio, y aun así consumeFn marca el user_benefit 'used' (287). finalizeBarOrder solo hace console.warn. La clienta paga completo por tarjeta Y pierde su recompensa canjeada.
- **Fix:** Aplicar el descuento a los mpItems antes de createPreference (línea negativa 'Descuento lealtad') para que suma(mpItems)==total_mxn; o no consumir el beneficio hasta que finalizeBarOrder confirme paidAmount==total_mxn (rechazar, no solo warn).

### P1-8. [pagos] Reembolso/contracargo no revierte la membresía ni los puntos: la clienta conserva acceso y puntos tras recuperar su dinero

- **Ubicación:** `routes/stripe-webhook.ts:63`
- **Por qué duele:** charge.refunded solo hace UPDATE orders SET stripe_payment_status='refunded' y loguea 'revisar manualmente'; no cancela la membresía, no marca el payment refunded, no revierte puntos. Simétrico en MP: una orden ya 'approved' que pasa a refunded/charged_back no dispara reversión. El estudio pierde el dinero y la clienta conserva créditos + puntos canjeables en el Fuel Bar.
- **Fix:** En charge.refunded total y en refunded/charged_back de MP para órdenes ya aprobadas: cancelar la membresía, marcar el payment 'refunded' y revertir puntos de lealtad + bono de referido, dentro de una tx.

### P1-9. [pagos] Rechazar una orden ya aprobada no revierte los puntos de lealtad ni el bono de referido

- **Ubicación:** `routes/orders.ts:959`
- **Por qué duele:** POST /orders/:id/reject cancela la membresía, marca el payment refunded y revierte founder/crédito $99, pero NUNCA elimina/anula las filas de loyalty_points de awardPaymentLoyaltyPoints ni el bono de awardReferralBonus. La clienta conserva 250 puntos canjeables por una orden nunca pagada y el referidor su bono.
- **Fix:** Dentro de la misma tx del reject, revertir los puntos de esa orden/membresía (asiento negativo o delete de las filas del payment) y anular el bono de referido, reutilizando la lógica de reversión del flujo de reembolso.

## P2+ — Medios/menores

- **P2-1** [reservar] Sobrecupo por falta de lock de clase en POST /api/bookings/admin-book (mismo defecto raíz que el P0, ruta staff, baja concurrencia)  — `routes/bookings.ts`
- **P2-2** [reservar] La rama de membershipId explícito no valida start_date: permite reservar antes de que la membresía empiece  — `routes/bookings.ts`
- **P2-3** [cancelar] cancelClassWithRefunds cancela la reserva ANTES de reembolsar y sin transacción: un fallo intermedio pierde el crédito de forma permanente  — `lib/cancel-class.ts`
- **P2-4** [agendar] Sin validación de solapamiento del mismo instructor al editar/reasignar (solo /substitute lo verifica; schedules.ts:89 tiene TODO)  — `routes/classes.ts`
- **P2-5** [agendar] PUT /:id reubica fecha/hora de una clase con reservas activas sin avisar a las clientas ni checar conflicto de slot  — `routes/classes.ts`
- **P2-6** [membresias] Asignar en pending con método de pago registra un pago, y activar después registra un SEGUNDO: doble ingreso y doble lealtad  — `routes/memberships.ts`
- **P2-7** [membresias] assign y assign-cash sin idempotencia: doble submit crea membresía y pago duplicados (doble cobro en caja)  — `routes/memberships.ts`
- **P2-8** [admin] Token de reset reutilizable 1h, no de un solo uso, no ligado al password_hash ni invalidado al cambiar la contraseña o desactivar la cuenta  — `routes/auth.ts`
- **P2-9** [checkin] Doble check-in de la misma reserva otorga los puntos dos veces: sin índice UNIQUE en loyalty_points ni compare-and-swap en el UPDATE de booking  — `lib/loyalty.ts`
- **P2-10** [bar] Beneficio free_drink descuenta toda la cantidad de la primera línea (unit_price*quantity), no una sola bebida  — `routes/bar.ts`
- **P2-11** [bar] Beneficios de barra se leen sin FOR UPDATE y se consumen (query global, autocommit) sin verificar rowCount → doble descuento concurrente (dedup #27+#33)  — `routes/bar.ts`
- **P2-12** [checkin] createCheckinLog calcula is_late/minutes_early_late con parse naive en UTC: marca casi todas las asistencias como ~360 min tarde; reportes de puntualidad inservibles (dedup #24+#31)  — `routes/checkin.ts`
- **P2-13** [lealtad] birthday/anniversary/streak: ledger + snapshot en dos statements sin transacción; una falla parcial descuadra puntos de forma permanente (P3)  — `services/cron-jobs.ts`

## Cobertura faltante (revisar antes de prod)

- Programa de REFERIDOS de punta a punta: generación de códigos, auto-referido, tope/caps de bonos y su ciclo de vida (solo se tocó tangencialmente en las reversiones)
- EVENTOS/workshops: flujo de reserva, cupo, cobro y cancelación (no auditado)
- VIDEOS / contenido on-demand: control de acceso y entitlements por membresía
- NÓMINA / COMISIONES de instructoras: se menciona payrollWarning pero el cálculo de pago no se revisó
- EGRESOS y CAJA: apertura/cierre de turno, arqueo y conciliación de efectivo vs pagos registrados
- WHATSAPP: fallos de entrega, opt-out y fuga de credenciales/PII en mensajes (los enlaces de reset van por ahí)
- EMAIL/Resend: entrega y plantillas (memoria indica que Resend no está configurado en prod)
- WALLET Apple/Google: generación del pase y su revocación al cancelar/reembolsar
- PUSH notifications: targeting y entrega correcta
- MIGRACIONES / schema en prod: faltan los índices UNIQUE y CHECK que varios fixes asumen; verificar drift antes de desplegar
- WAITLIST: promoción tras cancelación/reembolso y sus condiciones de carrera más allá del lock de cupo
- RATE LIMITING / fuerza bruta en login y reset-password
- LFPDPPP / PII: exposición, retención de datos y completitud del audit log
- MULTI-SUCURSAL: aislamiento de datos entre facilities
- TIMEZONE fuera de check-in: reportes, límites de programación de crons y transiciones de horario de verano (DST)
- FUEL BAR: decremento de inventario/stock y flujo de recogida (pickup)
- Reembolsos PARCIALES y ciclo completo de disputas/contracargos de MP (no solo el total)
- Concurrencia en el reembolso de crédito al cancelar una reserva individual (solo se auditó la cancelación a nivel de clase completa)

---

## Anexo: detalle completo de hallazgos confirmados

### 1. [P0·reservar] Carrera de sobrecupo: POST /api/bookings no bloquea ni revalida la fila de la clase dentro de la transacción

- **Ubicación:** `routes/bookings.ts:443` · votos 3/3
- **Descripción:** El chequeo de cupo `classDetails.current_bookings >= classDetails.max_capacity` (línea 443) se hace con una lectura hecha ANTES de abrir la transacción (queryOne línea 432). La transacción crítica (BEGIN en 640 → COMMIT en 778) solo bloquea la fila de la MEMBRESÍA (FOR UPDATE OF m dentro de selectMembershipForBooking); nunca hace `SELECT ... FROM classes WHERE id=$1 FOR UPDATE` ni revalida el cupo bajo lock. No existe backstop en BD: el trigger update_class_booking_count (schema.sql:443) solo suma/resta el contador y la tabla classes NO tiene CHECK (current_bookings <= max_capacity). Las rutas joinWaitlist/promote/bulk-month sí hacen FOR UPDATE OF c; esta —la ruta principal de la clienta— es la que lo omite.
- **Escenario de falla:** Clase reformer con max_capacity=8 y current_bookings=7. Dos clientas A y B disparan POST /api/bookings sobre esa clase en el mismo instante. Ambas leen current_bookings=7 (<8) en la línea 443 y pasan. Cada transacción bloquea SOLO su propia membresía (filas distintas), descuenta 1 crédito e inserta booking 'confirmed'. El trigger incrementa dos veces → current_bookings=9 en una clase de 8 lugares. Resultado: sobrecupo real, dos clientas para el mismo reformer, sin ningún error. Ninguna restricción de BD lo evita (a diferencia de la doble-reserva del mismo usuario, que sí la corta el índice único parcial).
- **Fix sugerido:** Dentro de la transacción (después del BEGIN de la línea 640, antes del INSERT), hacer `SELECT current_bookings, max_capacity FROM classes WHERE id=$1 FOR UPDATE` y rechazar si current_bookings >= max_capacity, igual que ya hacen joinWaitlist (waitlist.ts:79-96) y promoteNextFromWaitlist. Idealmente añadir además un CHECK (current_bookings <= max_capacity) como backstop.

### 2. [P1·lealtad] Doble gasto de beneficio de clase gratis: el consumo de user_benefits no verifica rowCount

- **Ubicación:** `routes/bookings.ts:771` · votos 3/3
- **Descripción:** El beneficio free_class se lee FUERA de toda transacción (queryOne líneas 607-616) y marca isFreeClass=true. Ya dentro de la transacción, el consumo `UPDATE user_benefits SET status='used' ... WHERE id=$2 AND status='active'` (líneas 771-776) NO revisa dec.rowCount y NO hace rollback si afectó 0 filas. Es la misma clase de guarda que sí implementaron para créditos en la línea 749 (`if (dec.rowCount === 0) ROLLBACK`), pero aquí falta. Como el beneficio se leyó sin lock y sin FOR UPDATE, dos reservas concurrentes de CLASES DISTINTAS pueden ambas verlo 'active' y ambas insertar booking gratis; el índice único solo bloquea misma clase, no clases distintas.
- **Escenario de falla:** La clienta tiene UN solo beneficio free_class activo. Abre dos clases distintas (dos pestañas) y envía POST /api/bookings casi a la vez. Ambos requests leen el beneficio como 'active' (línea 607) y ponen isFreeClass=true. Request A comitea: beneficio→'used', booking A gratis. Request B: su UPDATE de consumo golpea 0 filas (ya 'used') pero al no checar rowCount continúa y COMMIT igual → booking B también gratis. Resultado: 2 clases gratis con 1 solo beneficio (pérdida de ingreso para el estudio); replicable N veces con N requests concurrentes.
- **Fix sugerido:** Mover la lectura/reserva del beneficio DENTRO de la transacción con `SELECT ... FOR UPDATE`, y tras el UPDATE de consumo verificar `if (dec.rowCount === 0) { ROLLBACK; }` (o tratar la reserva como NO gratis y cobrar crédito). Es decir, la reserva solo debe quedar gratis si el consumo del beneficio afectó exactamente 1 fila.

### 3. [P2·reservar] Mismo sobrecupo por falta de lock de clase en POST /api/bookings/admin-book

- **Ubicación:** `routes/bookings.ts:897` · votos 3/3
- **Descripción:** La ruta admin-book chequea el cupo `current_bookings >= max_capacity && !forcing` (línea 897) con la lectura previa de classDetails (línea 885), fuera de la transacción. La transacción (BEGIN 925 → COMMIT 970) tampoco hace SELECT ... FROM classes ... FOR UPDATE ni revalida cupo. Mismo defecto raíz que el hallazgo P0 pero en la ruta de staff. Menor severidad por baja concurrencia (normalmente una sola recepción por clase), pero real.
- **Escenario de falla:** Clase con un solo lugar libre. Recepción agenda a la clienta X (sin force) mientras la propia clienta Y se auto-reserva por POST / (o dos terminales de recepción) en el mismo instante: ambas leen current_bookings < max_capacity, ninguna bloquea la fila de la clase, ambas insertan 'confirmed' → sobrecupo sin que ningún admin lo forzara explícitamente.
- **Fix sugerido:** Dentro de la transacción de admin-book, bloquear la clase con `SELECT current_bookings, max_capacity FROM classes WHERE id=$1 FOR UPDATE` y revalidar cupo (respetando el bypass `forcing` de admin/super_admin) antes del INSERT.

### 4. [P2·reservar] La ruta de membershipId explícito no valida start_date (vigencia de inicio), permitiendo reservar antes de que la membresía empiece

- **Ubicación:** `routes/bookings.ts:683` · votos 3/3
- **Descripción:** En POST /api/bookings, cuando la clienta manda membershipId explícito (líneas 654-708), se valida ownership, status='active', créditos y estudio, y solo la vigencia de FIN (`mEnd < dateStr` → rechazo, línea 683-687), pero NUNCA se valida start_date <= fecha de la clase. En cambio, selectMembershipForBooking (auto) sí lo exige (membershipSelection.ts:138 `m.start_date IS NULL OR m.start_date <= $3::date`) y su comentario recalca 'una membresía que arranca el lunes NO sirve para el sábado'. Pasando el id a mano se salta esa regla.
- **Escenario de falla:** La clienta tiene una membresía status='active' con start_date=2026-07-15 (prepagada, vigente después). Reserva una clase del 2026-07-12 enviando explícitamente ese membershipId. El auto-selector la rechazaría (start_date > fecha de clase), pero la rama explícita solo mira end_date, así que acepta la reserva y descuenta 1 crédito de una membresía que aún no debía usarse, permitiéndole asistir antes del inicio de su vigencia.
- **Fix sugerido:** En la rama de membershipId explícito, añadir el mismo filtro de inicio: rechazar si `membership.start_date` no es NULL y es posterior a dateStr (start_date > fecha de la clase), simétrico al chequeo de end_date ya presente en la línea 683.

### 5. [P1·cancelar] Al cancelar, la clase gratis de lealtad (free_class) se pierde para siempre: nunca se reactiva el user_benefit

- **Ubicación:** `routes/bookings.ts:1402` · votos 3/3
- **Descripción:** Cuando una clienta canjea puntos por un beneficio free_class (user_benefits, status='active') y lo usa para reservar, bookings.ts:607-620 lo encuentra y bookings.ts:771-776 lo marca status='used' y la reserva queda is_free_booking=true. En la cancelacion, cancel_booking() (index.ts:1912) hace 'IF v_booking.is_free_booking THEN v_should_refund:=false' y NO toca user_benefits; el handler (routes/bookings.ts:1401-1522) tampoco lo restaura; y cancelClassWithRefunds (lib/cancel-class.ts:63) lo omite porque consumed_category es NULL. No existe NINGUN camino en el codigo que vuelva a poner un user_benefit en 'active' (grep confirma que solo se escribe 'used'/'expired'). Resultado: la clienta pierde definitivamente el beneficio que pago con puntos, incluso cancelando a tiempo, o cuando el estudio cancela la clase completa. Nota: is_free_booking no distingue clase-gratis-del-estudio de beneficio-de-lealtad, por lo que la restauracion debe hacerse en la capa route/cancel-class consultando user_benefits.used_on_booking_id, no dentro de la funcion SQL.
- **Escenario de falla:** Clienta canjea 100 puntos -> user_benefits(free_class, active). Reserva la clase del sabado (is_free_booking=true, benefit 'used'). El jueves (dentro de ventana valida) hace POST /bookings/:id/cancel. cancel_booking ve is_free_booking -> no reembolsa credito y no reactiva el beneficio. El sabado la clienta ya no tiene ni la reserva ni el beneficio: perdio la clase gratis pagada con puntos. Igual ocurre si el estudio cancela la clase (cancelClassWithRefunds no restaura el beneficio).
- **Fix sugerido:** En la cancelacion (route de /:id/cancel y en cancelClassWithRefunds), si la reserva es is_free_booking, ejecutar UPDATE user_benefits SET status='active', used_at=NULL, used_by=NULL, used_on_booking_id=NULL WHERE used_on_booking_id = <bookingId> AND status='used' AND expires_at > NOW(). Si ya expiro, no reactivar (opcionalmente notificar). Hacerlo dentro de la misma transaccion que la cancelacion.

### 6. [P2·cancelar] cancelClassWithRefunds cancela la reserva ANTES de reembolsar y sin transaccion: un fallo intermedio pierde el credito de forma permanente

- **Ubicación:** `lib/cancel-class.ts:65` · votos 3/3
- **Descripción:** En cancelClassWithRefunds cada reserva se procesa con dos statements separados en autocommit (pool.query, sin BEGIN/COMMIT): primero UPDATE bookings SET status='cancelled' (lineas 41-48) y DESPUES el reembolso UPDATE memberships ... +1 (lineas 65-68). Si el proceso muere o el UPDATE de memberships falla (corte de conexion, timeout, crash) despues de que la reserva ya quedo 'cancelled' pero antes de reembolsar, el credito no se devuelve. Peor: al reintentar cancelClassWithRefunds, el SELECT de bookings filtra 'WHERE b.status IN (confirmed, waitlist)' (linea 33), por lo que esa reserva ya 'cancelled' queda EXCLUIDA y su credito nunca se reembolsa. La operacion no es atomica por-reserva y el orden (cancelar antes de reembolsar) convierte cualquier fallo transitorio en perdida definitiva de credito.
- **Escenario de falla:** Clase con 20 confirmadas. Admin cancela la clase. cancelClassWithRefunds cancela y reembolsa las primeras 12; en la #13, tras UPDATE bookings=cancelled (linea 41), la conexion a Postgres se cae antes del UPDATE memberships (linea 65). El caller captura el error. La reserva #13 quedo 'cancelled' sin reembolso. Al reintentar, la #13 ya no aparece (status='cancelled') -> su credito se perdio permanentemente y las #14-20 pueden haber quedado sin cancelar.
- **Fix sugerido:** Envolver el ciclo (o al menos el par cancelar-reserva + reembolsar-credito de cada reserva) en una transaccion con un client dedicado (BEGIN/COMMIT), o reembolsar el credito ANTES de flipear el status, para que ningun fallo deje una reserva cancelada-sin-reembolsar. Idealmente todo el cancelClassWithRefunds en una sola transaccion.

### 7. [P1·cancelar] PUT /classes/:id acepta status='cancelled' y salta el reembolso de créditos y la cancelación de reservas

- **Ubicación:** `routes/classes.ts:751` · votos 3/3
- **Descripción:** ClassUpdateSchema (línea 678) incluye 'cancelled' en el enum de status, y el PUT lo escribe directo a classes.status (751-754) sin pasar por cancelClassWithRefunds (lib/cancel-class.ts). Cancelar por esta vía NO cancela las bookings, NO reembolsa créditos a las membresías, NO fija cancelled_at/cancelled_by/cancellation_reason y NO notifica a nadie. La ruta correcta (DELETE /:id) sí hace todo eso. Además current_bookings queda inflado y la clase desaparece de la vista pública (el GET filtra status!='cancelled' para no-staff).
- **Escenario de falla:** Clase con 8 reservas confirmadas (8 clientas gastaron 1 crédito de su bono cada una). Un admin o recepción elevada llama PUT /api/classes/{id} con body {"status":"cancelled"}. La clase pasa a 'cancelled', pero las 8 bookings siguen 'confirmed', current_bookings sigue en 8, ningún crédito reformer_remaining/multi_remaining se devuelve y ninguna clienta recibe aviso. Resultado: 8 créditos pagados se pierden, sin rastro de auditoría de cancelación ni reembolso.
- **Fix sugerido:** Quitar 'cancelled' del enum de ClassUpdateSchema y/o, si data.status==='cancelled', redirigir a cancelClassWithRefunds en vez de escribir el UPDATE directo. Forzar que toda cancelación pase por el flujo con reembolso.

### 8. [P2·agendar] Sin validación de solapamiento del mismo instructor al editar o reasignar clases (solo /substitute lo verifica)

- **Ubicación:** `routes/classes.ts:721` · votos 3/3
- **Descripción:** POST /:id/substitute (1101-1116) sí verifica que el nuevo coach no tenga otra clase en ese horario, pero PUT /:id al cambiar instructor_id (721-724), POST /:id/change-instructor en scope 'series'/'dates' (896-934), POST /recurring (411) y POST /generate no validan solapamiento del instructor. Se puede dejar a un mismo coach agendado en dos clases simultáneas. schedules.ts:89 incluso deja un TODO admitiendo que falta el overlap check.
- **Escenario de falla:** Ana imparte Barre los lunes 09:00 en sucursal A. Un admin usa POST /classes/{id}/change-instructor con scope='series' para poner a Ana como coach de todos los Reformer de los lunes 09:00. El UPDATE de la línea 898 reasigna sin ninguna comprobación y Ana queda agendada en dos clases a la misma hora; el sistema lo acepta sin error y ambas clases la muestran como instructora.
- **Fix sugerido:** Reutilizar la consulta de solapamiento de /substitute (mismo instructor, misma fecha, rangos start/end que se cruzan, status!='cancelled') en PUT /:id y en change-instructor antes de aplicar el cambio; devolver 400 si hay choque.

### 9. [P2·agendar] PUT /:id reubica fecha/hora de una clase con reservas activas sin avisar a las clientas ni checar conflicto de slot

- **Ubicación:** `routes/classes.ts:729` · votos 2/3
- **Descripción:** El PUT permite cambiar date/startTime/endTime/facility_id de una clase que ya tiene bookings confirmadas. Las reservas quedan apuntando a la nueva fecha/hora, pero el PUT NO dispara ninguna notificación a las clientas reservadas (solo manda correo al coach y calcula payrollWarning) y NO valida que el nuevo slot no choque con otra clase existente. La única validación de edición es que max_capacity no baje de current_bookings (743).
- **Escenario de falla:** Clase Reformer sábado 08:00 con 6 reservas confirmadas. El admin edita la clase y envía date=lunes y startTime=19:00. Las 6 bookings siguen 'confirmed' pero ahora la clase es lunes 19:00: las clientas nunca reciben aviso (el PUT no notifica), llegan el sábado a una clase que ya no existe o se pierden el lunes. Además la clase pudo quedar encima de otra ya agendada en ese horario/sucursal sin ninguna alerta.
- **Fix sugerido:** Cuando se detecte cambio de date/start_time/end_time (o facility_id) en una clase con current_bookings>0, notificar a las clientas reservadas (web push/email) y validar que el nuevo slot no colisione con otra clase; opcionalmente exigir confirmación explícita para reubicaciones.

### 10. [P1·membresias] Editar un plan (cualquier guardado que incluya durationDays) reescribe end_date de todas las membresías activas y borra extensiones por pausa/ajuste manual/override

- **Ubicación:** `routes/plans.ts:250` · votos 3/3
- **Descripción:** En PUT /api/plans/:id, cuando el body trae durationDays (los formularios de edición normalmente lo mandan SIEMPRE, aunque no haya cambiado), se ejecuta un UPDATE masivo que fija end_date = start_date + durationDays para TODA membresía active/paused/pending del plan. Esto sobrescribe incondicionalmente cualquier end_date que haya sido extendido por /resume (días de pausa), por PATCH /:id/dates (ajuste manual) o por endDate override del dueño. No compara contra la duración previa ni respeta membresías con vigencia personalizada, y no deja registro en audit del valor destruido.
- **Escenario de falla:** Clienta pausa su membresía 20 días; al reanudar, /resume extiende end_date a 2026-08-20 (no pierde tiempo pagado). Días después el dueño solo cambia el color o el nombre del plan; el formulario reenvía durationDays=30. El UPDATE recomputa end_date = start_date(2026-07-01) + 30 = 2026-07-31, eliminando en silencio los 20 días de pausa y cualquier extensión manual de todas las clientas del plan. Vigencia pagada perdida en masa y sin traza.
- **Fix sugerido:** Recomputar solo cuando durationDays realmente cambió (comparar con el valor previo del plan) y NUNCA para membresías con vigencia ajustada: excluir las que tengan paused_at aplicado o cuyo end_date != start_date + old_duration (o una bandera dates_overridden). Registrar en audit el cambio masivo de vigencia.

### 11. [P2·membresias] Asignar en estado pending con método de pago registra un pago, y activar después registra un SEGUNDO pago: doble ingreso y doble lealtad por una sola compra

- **Ubicación:** `routes/memberships.ts:456` · votos 3/3
- **Descripción:** En POST /assign el bloque 'if (normalizedPaymentMethod)' inserta un pago 'completed' y otorga puntos SIN importar el status elegido (paymentMethod es opcional y status puede ser pending_activation/pending_payment). Si luego esa misma membresía se activa vía POST /:id/activate (que exige paymentMethod), se inserta OTRO pago 'completed' y se vuelven a otorgar puntos. No hay verificación de si ya existe un pago completado para la membresía.
- **Escenario de falla:** Admin crea la membresía con POST /assign status='pending_activation', paymentMethod='transfer': se registra pago 'completed' (líneas 456-474) aun estando pendiente. Más tarde otra persona activa con POST /:id/activate y se registra un segundo pago 'completed' + puntos duplicados. La misma venta se cuenta dos veces en reportes de ingreso y duplica el saldo de lealtad de la clienta.
- **Fix sugerido:** No insertar pago en /assign salvo status='active' (o insertarlo como 'pending'); y en /activate no crear pago si ya existe un pago 'completed' para esa membership_id.

### 12. [P2·membresias] assign y assign-cash no tienen idempotencia: doble submit crea membresía y pago duplicados (doble cobro)

- **Ubicación:** `routes/memberships.ts:605` · votos 3/3
- **Descripción:** POST /assign (línea 416) y POST /assign-cash (línea 605) crean una membresía nueva + un pago 'completed' + puntos en cada request, sin ninguna verificación de duplicado ni idempotency-key. El POST público / (compra por la clienta) sí tiene guard anti-duplicado (misma plan_id en estado pendiente), pero los endpoints de staff no lo tienen.
- **Escenario de falla:** Recepción da doble clic en 'Asignar paquete con pago en caja' (o el cliente HTTP reintenta por timeout de red). Se ejecutan dos inserts: la clienta queda con 2 membresías 'active' idénticas, 2 pagos 'completed' por amountPaid registrados en caja/reportes y puntos duplicados. Doble cobro/doble ingreso contable.
- **Fix sugerido:** Agregar dedup/idempotencia en assign y assign-cash: rechazar si ya existe una membresía del mismo user_id+plan_id creada en los últimos N segundos, o exigir un idempotency-key generado por el frontend por transacción.

### 13. [P0·admin] Cualquier recepción puede resetear la contraseña de un admin (o de otra recepción) y recibir el password en la respuesta → toma de cuenta / escalada de privilegios

- **Ubicación:** `routes/users.ts:758` · votos 3/3
- **Descripción:** POST /api/users/:id/resend-credentials está protegido con requireRole('admin','super_admin','reception'), es decir, lo puede llamar CUALQUIER recepción (no solo master). El handler NO valida el rol del objetivo (a diferencia del guard de PUT /:id en las líneas 902-908, que obliga target.role==='client'). Sobrescribe el password_hash del usuario objetivo con un password temporal aleatorio (líneas 779-785, temp_password=true) y devuelve ese password en texto plano en la respuesta JSON (línea 835: { tempPassword: newPassword }). El propio código contempla objetivos no-cliente (línea 805 usa sendReceptionCredentials cuando target.role==='reception'), confirmando que resetear staff es un camino alcanzable, no bloqueado.
- **Escenario de falla:** Una recepcionista normal (role='reception', is_reception_master=false) autenticada envía POST /api/users/<ID_DE_UN_ADMIN>/resend-credentials. Pasa requireRole (reception permitido), no hay chequeo de que el objetivo sea cliente, se reescribe el password del admin y la respuesta devuelve {"tempPassword":"<plano>"}. Acto seguido hace POST /api/auth/login con el email del admin + ese tempPassword → recibe un JWT con role='admin' → control total (precios, borrar usuarios, caja, reembolsos, PII). Aunque no iniciara sesión, el admin queda bloqueado fuera de su cuenta (DoS/secuestro).
- **Fix sugerido:** Restringir el objetivo: recepción solo puede reenviar credenciales cuando target.role==='client' (replicar el guard de PUT /:id, líneas 902-908); exigir admin/super_admin para resetear cuentas de staff/admin. No devolver el tempPassword en texto plano para objetivos que no sean clientes; idealmente entregar credenciales solo por el canal del propio usuario (email/WhatsApp), nunca en el body al llamador.

### 14. [P1·admin] authenticate no verifica is_active ni revocación y requireRole/isElevated confían en el rol del token: staff despedido/degradado conserva acceso admin hasta 7 días

- **Ubicación:** `middleware/auth.ts:35` · votos 3/3
- **Descripción:** authenticate (líneas 16-59) construye req.user solo a partir del JWT (role, isReceptionMaster) sin consultar la BD ni verificar is_active. requireRole en el camino feliz (línea 69) hace next() en cuanto el rol del TOKEN está permitido; solo consulta la BD para SUBIR de rol (detectar promociones), nunca para detectar una degradación. isElevated (lib/elevation.ts:14) confía en el flag isReceptionMaster del token. El TTL por defecto es 7 días (JWT_EXPIRES_IN='7d', línea 127). Login sí bloquea is_active=false (auth.ts:224) y PATCH /:id/status / PUT /:id/role escriben en BD, pero nada de eso invalida los JWT ya emitidos.
- **Escenario de falla:** La dueña despide a una recepcionista y pone is_active=false (PATCH /api/users/:id/status) o degrada a un admin a 'client' (PUT /api/users/:id/role). El navegador de esa persona aún tiene su JWT (válido 7 días). Como authenticate no mira is_active y requireRole acepta el rol del token sin re-verificar en BD, y requireElevated confía en isReceptionMaster del token, la persona sigue abriendo turnos de caja, vendiendo membresías, cancelando/procesando pagos y viendo PII de clientas durante hasta 7 días tras su baja.
- **Fix sugerido:** En authenticate, cargar la fila del usuario y rechazar si is_active=false (o versionar el token con password_changed_at/token_version). Que requireRole, requirePermission e isElevated lean el role e is_reception_master vigentes de la BD (requirePermission ya lo hace para reception; extenderlo a admin y al flag master), o reducir el TTL del token y añadir revocación en servidor.

### 15. [P2·admin] El token de reset de contraseña es reutilizable durante 1h y no se invalida al cambiarla ni al desactivar la cuenta

- **Ubicación:** `routes/auth.ts:413` · votos 3/3
- **Descripción:** generateResetToken (auth.ts:137-145) firma un JWT con solo { userId, purpose:'reset' } y 1h de expiración. reset-password (auth.ts:413-448) lo verifica y actualiza el password, pero el token NO es de un solo uso, NO está ligado al password_hash/updated_at actual, y no se invalida tras un reset exitoso ni comprueba is_active. Cualquiera que vea el enlace (WhatsApp/email reenviado, dispositivo compartido, logs de proxy) puede reproducir el POST varias veces dentro de la hora, incluso después de que la usuaria legítima ya cambió su contraseña.
- **Escenario de falla:** Usuaria pide reset; el enlace con el JWT de 1h llega por WhatsApp (auth.ts:386-397) y/o email. Un tercero que ve ese mensaje reenviado hace POST /api/auth/reset-password con ese token y fija un password conocido; funciona aunque la dueña de la cuenta ya lo haya reseteado minutos antes y aunque la cuenta se haya desactivado entre tanto → secuestro de la cuenta dentro de la ventana de 1 hora.
- **Fix sugerido:** Hacer el token de reset de un solo uso y ligado a estado que cambie al usarlo: incluir en el payload (o comparar contra) el password_hash o updated_at actual, o almacenar un nonce de reset en users e invalidarlo tras el primer uso; además verificar is_active al resetear.

### 16. [P0·pagos] finalizePaidOrder no bloquea la orden: dos webhooks concurrentes = doble membresía, doble pago y dobles puntos

- **Ubicación:** `lib/orderFulfillment.ts:21` · votos 3/3
- **Descripción:** El único guard de idempotencia es `if (order.status === 'approved') return;` (línea 21), leído FUERA de la transacción, sin `SELECT ... FOR UPDATE`. Dentro de la transacción el `UPDATE orders SET status='approved'` no lleva `WHERE status <> 'approved'`, y `memberships.order_id` NO tiene constraint UNIQUE (migración 003_orders_payment_system.sql:172 lo agrega como columna simple). Además la dedupe de puntos usa `description = buildPaymentPointsDescription(paymentId)` y cada cumplimiento inserta un `payments` nuevo con id distinto, así que los puntos se otorgan otra vez. Nada a nivel de BD frena el doble cumplimiento.
- **Escenario de falla:** Orden O en 'pending_payment' pagada con tarjeta (MercadoPago). MP entrega la notificación 'approved' dos veces con ~100ms de diferencia (request-id distinto, comportamiento normal de MP). Ambas invocaciones pasan la dedupe del webhook (event_key distinto), ambas llaman finalizePaidOrder(O); ambas leen status='pending_payment', ambas pasan el guard, ambas hacen BEGIN, INSERT membership (sin UNIQUE en order_id), UPDATE order->approved, INSERT payment y awardPaymentLoyaltyPoints (paymentId distinto -> description distinta -> no se deduplica). Resultado: 2 membresías activas, 2 filas de pago y el DOBLE de puntos de lealtad y bono de referido por un solo cobro. La clienta recibe el doble de clases/créditos.
- **Fix sugerido:** Hacer el chequeo de idempotencia dentro de la transacción con `SELECT status FROM orders WHERE id=$1 FOR UPDATE` y abortar si ya está 'approved'; y/o hacer el `UPDATE orders SET status='approved' ... WHERE id=$1 AND status <> 'approved'` y sólo crear membresía/pago/puntos si `rowCount === 1`. Añadir además un índice UNIQUE parcial en `memberships(order_id)` como red de seguridad de BD.

### 17. [P1·pagos] Reembolso/contracargo no revierte la membresía ni los puntos: la clienta conserva acceso y puntos tras recuperar su dinero

- **Ubicación:** `routes/stripe-webhook.ts:63` · votos 3/3
- **Descripción:** En Stripe, `charge.refunded` sólo hace `UPDATE orders SET stripe_payment_status='refunded'` y loguea 'revisar membresía manualmente'; no cancela la membresía, no marca el pago como refunded, no revierte los puntos de lealtad. Simétricamente, el webhook de MP (mercadopago-webhook.ts:80-89) sólo actúa sobre status 'approved' y ('rejected'||'cancelled') de órdenes 'pending_payment'; una orden ya aprobada que luego pasa a 'refunded' o 'charged_back' (contracargo) no dispara ninguna reversión.
- **Escenario de falla:** Clienta paga $2,500 por un paquete de 20 clases con tarjeta -> membresía activa + 250 puntos otorgados. Luego pide reembolso total (o hace contracargo). Stripe envía charge.refunded / MP marca el pago refunded. El handler sólo cambia una bandera de estado: la membresía sigue 'active' con 20 clases y los 250 puntos siguen canjeables en el Fuel Bar. El estudio pierde el dinero Y la clienta conserva créditos y puntos.
- **Fix sugerido:** En charge.refunded (total) y en status 'refunded'/'charged_back' de MP para órdenes ya aprobadas: cancelar la membresía asociada (status='cancelled'), marcar el payment como 'refunded' y revertir los puntos de lealtad y el bono de referido otorgados por esa orden, dentro de una transacción.

### 18. [P1·pagos] Rechazar una orden ya aprobada no revierte los puntos de lealtad ni el bono de referido otorgados

- **Ubicación:** `routes/orders.ts:959` · votos 3/3
- **Descripción:** En POST /orders/:id/reject, cuando la orden estaba 'approved' se cancela la membresía y se marca el pago como 'refunded' (líneas 959-976), y se hace rollback cuidadoso de la bandera founder y del crédito de $99 (sample-class). Pero NUNCA se eliminan/anulan las filas de loyalty_points creadas por awardPaymentLoyaltyPoints ni el bono de referido de awardReferralBonus otorgados en la aprobación.
- **Escenario de falla:** Admin aprueba una orden por transferencia -> membresía + 250 puntos a la clienta + (si usó código de referido) bono al dueño del código. Después descubre que la transferencia nunca entró y pulsa Rechazar. Se cancela la membresía y se marca el pago refunded, pero los 250 puntos de la clienta y el bono del referidor permanecen. La clienta conserva 250 puntos canjeables por una orden nunca pagada, y el referidor conserva su bono.
- **Fix sugerido:** En el bloque de reject de orden previamente aprobada, dentro de la misma transacción, revertir los puntos de esa orden/membresía (insertar asiento negativo o borrar las filas de loyalty_points asociadas al payment) y anular el bono de referido, reutilizando la misma lógica de reversión que debería usar el flujo de reembolso.

### 19. [P1·checkin] autoCheckIn marca asistencia y otorga puntos de lealtad a clientas que NO fueron; deja muerto todo el rastreo de no-shows

- **Ubicación:** `services/cron-jobs.ts:491` · votos 3/3
- **Descripción:** autoCheckIn (:10/:40) hace UPDATE de TODA reserva 'confirmed' a 'checked_in' 30 min despues de que INICIA la clase, sin ninguna verificacion de presencia fisica, y ademas llama awardCheckinPoints() (lib/loyalty.ts:333) que inserta puntos de lealtad canjeables en loyalty_points. Como markNoShows (:05/:35) solo toca reservas 'confirmed' y solo despues de que TERMINA la clase +30 min, autoCheckIn siempre gana la carrera (start+30 < end+30), asi que markNoShows nunca marca a nadie. streakBonus tambien cuenta estos checked_in_at como asistencia y regala mas puntos. reports.ts (lineas 419, 444) calcula no_shows como status='confirmed' AND c.date<NOW(): siempre da ~0 y 'attended' queda inflado.
- **Escenario de falla:** Una clienta reserva una clase de pago, no cancela y no se presenta. A los 30 min de iniciada la clase el cron la pasa a 'checked_in' y le acredita config.points_per_class puntos (canjeables por recompensas/descuentos). markNoShows nunca la marca no_show, el reporte de 'clientas riesgosas' sale vacio, y con 2 semanas asi tambien cobra streakBonus. Resultado: puntos (dinero) emitidos a ausentes y cero deterrente de no-show cuando se encienda ENABLE_CRON_JOBS.
- **Fix sugerido:** No auto-acreditar asistencia+puntos por no-cancelar. O bien eliminar autoCheckIn y dejar que el check-in real (QR, routes/checkin.ts) sea la unica via que otorga puntos, o restringir autoCheckIn a status neutral (p.ej. 'attended_auto' sin puntos) y no llamar awardCheckinPoints salvo check-in fisico. Si se conserva, que markNoShows corra ANTES y que autoCheckIn no pise no_shows.

### 20. [P3·lealtad] birthday/anniversary/streak bonus: escriben ledger y snapshot en dos statements sin transaccion; una falla parcial descuadra puntos de forma permanente

- **Ubicación:** `services/cron-jobs.ts:577` · votos 2/3
- **Descripción:** Los tres jobs hacen primero INSERT INTO loyalty_points (fila de dedup) y luego, por separado, UPDATE users SET loyalty_points = loyalty_points + $1, sin envolverlos en una transaccion. El dedup posterior se basa en la existencia de la fila de loyalty_points por description.
- **Escenario de falla:** Si el proceso muere o el segundo UPDATE falla entre ambos statements, la fila del ledger queda insertada pero el snapshot users.loyalty_points no se incrementa. En la siguiente corrida el chequeo de 'exists' encuentra la fila y hace 'continue', por lo que el incremento del snapshot nunca se aplica: la clienta pierde el bono de cumpleaños/aniversario/racha de forma permanente (solo se auto-corrige si mas tarde corre un check-in que dispare syncUserLoyaltyPointsSnapshot).
- **Fix sugerido:** Envolver INSERT loyalty_points + actualizacion del snapshot en una sola transaccion, o mejor recomputar el snapshot con syncUserLoyaltyPointsSnapshot(userId) (que hace SET = SUM(ledger)) en lugar del incremento manual, para que sea idempotente y consistente.

### 21. [P0·checkin] La ventana de check-in por QR compara NOW() (UTC) contra la hora de clase en pared CDMX: desfase de 6 h, ningún QR encuentra reserva a la hora real de la clase

- **Ubicación:** `routes/checkin.ts:283` · votos 3/3
- **Descripción:** El SELECT que localiza la reserva filtra por `(c.date + c.start_time) BETWEEN NOW() - INTERVAL '30 minutes' AND NOW() + INTERVAL '30 minutes'`. `c.date` es DATE y `c.start_time` es TIME, así que `c.date + c.start_time` es un `timestamp without time zone` que representa la hora de PARED en CDMX (así se almacena en todo el sistema). `NOW()` es `timestamptz`. Al comparar timestamp-sin-tz contra timestamptz, Postgres castea el primero usando el TimeZone de la sesión, que es UTC (el pool en config/database.ts no fija timezone y Railway/Postgres default es UTC; por eso las 17 consultas del resto del código usan explícitamente `AT TIME ZONE 'America/Mexico_City'`, incluida la de no-show en la línea 760 de ESTE MISMO archivo y bar.ts:42 e index.ts:2939). Resultado: la hora de la clase se interpreta 6 h antes de la real. Es la ÚNICA comparación de `c.date + c.start_time` contra `NOW()` crudo en todo el repo.
- **Escenario de falla:** Clase 2026-07-10 09:00 CDMX (=15:00 UTC). A las 09:00 CDMX el staff escanea el QR de la clienta: NOW()=15:00 UTC, ventana=[14:30,15:30] UTC; `c.date+c.start_time`=2026-07-10 09:00 casteado a 09:00 UTC, que NO cae en la ventana -> el SELECT devuelve 0 filas -> HTTP 404 'No se encontró una reserva válida para esta clase'. Ningún QR de recepción/coach/wallet funciona durante el horario real de operación (solo 'coincidiría' a las ~03:00 CDMX). El check-in por QR queda inutilizable en producción desde el día 1.
- **Fix sugerido:** Convertir el lado del NOW() a hora de pared CDMX igual que el resto del código: `(c.date + c.start_time) BETWEEN (NOW() AT TIME ZONE 'America/Mexico_City') - INTERVAL '30 minutes' AND (NOW() AT TIME ZONE 'America/Mexico_City') + INTERVAL '30 minutes'` y también en el ORDER BY (línea 284) usar `((c.date + c.start_time) - (NOW() AT TIME ZONE 'America/Mexico_City'))`.

### 22. [P1·checkin] Self check-in parsea la hora de clase con new Date('YYYY-MM-DDTHH:MM:SS') en hora local del servidor (UTC): mismo desfase de 6 h, siempre responde 'el tiempo para check-in ha pasado'

- **Ubicación:** `routes/checkin.ts:519` · votos 3/3
- **Descripción:** `const classStart = new Date(`${booking.class_date}T${booking.class_start_time}`)` construye una cadena sin offset (p.ej. '2026-07-10T09:00:00'). Por spec de ECMAScript, una fecha-hora sin zona se interpreta en la zona LOCAL del proceso Node, que en Railway es UTC (no hay TZ en .env). Como la hora almacenada es de pared CDMX, `classStart` queda 6 h antes del instante real. Luego `diffMinutes = (classStart - now)/60000` y se rechaza con `diffMinutes > 30` ('muy temprano') o `diffMinutes < -15` ('el tiempo ha pasado').
- **Escenario de falla:** Clase 09:00 CDMX (=15:00 UTC). La clienta abre la app dentro del estudio a las 08:50 CDMX para self check-in: now=14:50 UTC, classStart se parsea como 09:00 UTC; diffMinutes=(09:00-14:50)=-350 -> `diffMinutes < -15` -> HTTP 400 'El tiempo para check-in ha pasado'. La ventana 'válida' cae ~06 h antes (madrugada), por lo que el self check-in nunca funciona en horario real. Mismo defecto propaga a los reportes de puntualidad (ver hallazgo de createCheckinLog).
- **Fix sugerido:** No parsear en hora local. Hacer el gating en SQL con `AT TIME ZONE 'America/Mexico_City'` (traer `EXTRACT(EPOCH FROM ((c.date+c.start_time) - (NOW() AT TIME ZONE 'America/Mexico_City')))/60 AS diff_minutes`) o construir el Date fijando explícitamente el offset de CDMX (-06:00) antes de comparar contra now.

### 23. [P2·checkin] Doble check-in de la misma reserva otorga los puntos de asistencia dos veces (race): sin constraint UNIQUE ni transacción en awardCheckinPoints

- **Ubicación:** `lib/loyalty.ts:335` · votos 3/3
- **Descripción:** `awardCheckinPoints` garantiza idempotencia con un patrón check-then-insert (SELECT en loyalty_points por user_id+related_booking_id+type='class_attended', y si no existe INSERT) SIN transacción ni lock. La tabla loyalty_points (database/schema.sql:264) NO tiene índice UNIQUE sobre (user_id, related_booking_id, type) — solo índices simples. Además el UPDATE de bookings a 'checked_in' en checkin.ts no es un compare-and-swap (no lleva `AND status <> 'checked_in'`). Los puntos de lealtad son canjeables por recompensas, así que es corrupción de créditos con valor real.
- **Escenario de falla:** El staff hace doble-tap del botón de escaneo (o el QR se escanea casi simultáneo con un self check-in) para la misma reserva. Ambas peticiones leen booking_status != 'checked_in', ambas hacen UPDATE a checked_in, ambas invocan awardCheckinPoints, ambos SELECT devuelven vacío y ambos INSERT insertan +points_per_class -> la clienta recibe el doble de puntos por una sola asistencia (y se crean 2 filas en checkin_logs). Repetible a voluntad para inflar el saldo canjeable.
- **Fix sugerido:** Agregar un índice UNIQUE parcial `CREATE UNIQUE INDEX ON loyalty_points(user_id, related_booking_id) WHERE type='class_attended'` y hacer el INSERT con `ON CONFLICT DO NOTHING`; y/o envolver lectura+UPDATE del booking en una transacción con `SELECT ... FOR UPDATE` o hacer el UPDATE condicional `WHERE id=$ AND status <> 'checked_in'` y otorgar puntos solo si rowCount=1.

### 24. [P3·checkin] createCheckinLog calcula is_late/minutes_early_late parseando la hora de clase en hora local (UTC): marca a casi todas las asistencias como ~360 min tarde

- **Ubicación:** `routes/checkin.ts:142` · votos 3/3
- **Descripción:** `const classStart = new Date(params.classStartTime)` donde classStartTime = `${class_date}T${class_start_time}` (sin offset) se parsea en la zona local del proceso (UTC en Railway), pero la hora es de pared CDMX -> desfase de 6 h. `minutesEarlyLate = round((classStart - now)/60000)` e `isLate = minutesEarlyLate < -10` se persisten en checkin_logs y alimentan las vistas checkin_stats (endpoint /stats y /class/:classId 'late'). Afecta a TODOS los métodos (qr, self y manual, que sí funciona para el check-in pero registra el log con el desfase).
- **Escenario de falla:** Check-in manual a las 09:05 CDMX de una clase de 09:00 CDMX (llegó puntual): now=15:05 UTC, classStart se interpreta 09:00 UTC, minutesEarlyLate=(09:00-15:05)=-365, isLate=true. La clienta puntual queda registrada como 'tarde' y minutes_early_late=-365; los reportes de puntualidad (late vs on_time) quedan sistemáticamente inservibles.
- **Fix sugerido:** Calcular minutos de adelanto/retraso en SQL con `AT TIME ZONE 'America/Mexico_City'` (traer el diff ya calculado desde la consulta del booking) o construir el Date con el offset explícito de CDMX antes de restar `now`, en vez de depender de la zona local del proceso.

### 25. [P1·bar] Pago con tarjeta ignora el descuento de lealtad (bar_discount/free_drink): MercadoPago cobra el total completo pero el beneficio se marca usado

- **Ubicación:** `routes/bar.ts:275` · votos 3/3
- **Descripción:** En el bloque de beneficios (líneas 126-162) se calcula barDiscountAmount/freeDrinkDiscount y se reduce SOLO totals.total_mxn (línea 155-161). Pero cuando paymentMethod === 'card', los mpItems se construyen desde 'priced' a precio completo más el recargo (líneas 275-278) y NUNCA se resta el descuento del beneficio. Aun así, tras crear la preferencia se llama consumeFn(orderId) (línea 287) que marca el user_benefit como status='used'. finalizeBarOrder solo hace console.warn ante el desajuste (barFulfillment.ts:13-18), no lo bloquea.
- **Escenario de falla:** Clienta canjea la recompensa '10% de descuento en barra' -> se crea user_benefit bar_discount. Ordena $200 por tarjeta. La app y bar_orders.total_mxn muestran $180 (+recargo), pero createPreference cobra $200 (+recargo) porque mpItems usa precios completos. El beneficio queda marcado 'used'. Resultado: la clienta paga el precio completo por tarjeta Y pierde su recompensa canjeada, sin recibir el descuento. Igual con free_drink: paga la bebida completa y se le quema el beneficio.
- **Fix sugerido:** Aplicar el descuento del beneficio a los mpItems antes de createPreference (p. ej. agregar una línea negativa 'Descuento lealtad' o prorratear), de modo que la suma de mpItems == totals.total_mxn. Alternativamente, no consumir el beneficio (consumeFn) hasta que finalizeBarOrder confirme el pago, y validar en finalizeBarOrder que paidAmount == total_mxn (rechazar/alertar en vez de solo warn).

### 26. [P2·bar] Beneficio 'free_drink' descuenta toda la cantidad de la primera línea, no una sola bebida

- **Ubicación:** `routes/bar.ts:148` · votos 3/3
- **Descripción:** El comentario dice 'Primer drink del pedido = gratis', pero freeDrinkDiscount = firstDrink.unit_price_mxn * firstDrink.quantity multiplica por la cantidad completa de esa línea. Si la primera bebida con precio > 0 tiene quantity > 1, se regalan TODAS las unidades de esa línea en vez de una.
- **Escenario de falla:** Clienta con beneficio free_drink ordena 3 lattes de $60 c/u para pago en recepción. freeDrinkDiscount = 60*3 = 180, total_mxn baja $180 (las 3 gratis). Recepción cobra el total_mxn reducido -> el estudio pierde $120 (2 lattes extra) por un beneficio que debía cubrir solo 1.
- **Fix sugerido:** Descontar solo una unidad: freeDrinkDiscount = firstDrink.unit_price_mxn (sin multiplicar por quantity).

### 27. [P2·bar] Beneficios de barra se leen sin FOR UPDATE y se consumen sin verificar rowCount: mismo beneficio aplicable a dos órdenes concurrentes

- **Ubicación:** `routes/bar.ts:127` · votos 3/3
- **Descripción:** Los user_benefits activos se seleccionan con un query normal sin bloqueo (líneas 127-135) y se consumen con UPDATE ... WHERE status='active' (consumeFn, líneas 215-219) cuyo rowCount nunca se revisa. En el camino de tarjeta/recepción no hay transacción que serialice la lectura del beneficio con su consumo. Dos solicitudes concurrentes de la misma clienta leen el mismo beneficio, ambas calculan el descuento y ambas crean órdenes con el total descontado; solo un UPDATE llega a marcar 'used', el otro afecta 0 filas silenciosamente.
- **Escenario de falla:** Clienta con un beneficio bar_discount dispara dos órdenes por tarjeta casi al mismo tiempo. Ambas leen el beneficio 'active', ambas aplican el 10% en su total; el beneficio solo se marca 'used' una vez. Resultado: un beneficio de un solo uso se aprovecha en dos órdenes (doble descuento).
- **Fix sugerido:** Leer los beneficios con SELECT ... FOR UPDATE dentro de la misma transacción que crea la orden y consumirlos ahí; verificar rowCount del UPDATE de consumo y, si es 0 (ya usado por otra orden), rehacer/anular el descuento o abortar con error.

### 28. [P1·checkin] Check-in por QR: la ventana ±30min compara timestamp naive de la clase contra NOW() sin AT TIME ZONE, desfasada por el offset de CDMX

- **Ubicación:** `routes/checkin.ts:283` · votos 2/3
- **Descripción:** La query que busca la reserva a checar hace `(c.date + c.start_time) BETWEEN NOW() - INTERVAL '30 minutes' AND NOW() + INTERVAL '30 minutes'`. `c.date + c.start_time` es un `timestamp without time zone` que representa la hora de PARED en CDMX (p.ej. 18:00), pero se compara contra `NOW()` (`timestamptz`). Postgres castea el naive usando la zona de sesión (UTC en Railway), tratando 18:00 como 18:00 UTC. Es el ÚNICO lugar del código que compara la hora de clase contra NOW() SIN el `AT TIME ZONE 'America/Mexico_City'` que sí usan markNoShows (cron-jobs.ts:428/481), no-show (checkin.ts:760), waitlist (bookings.ts:1037) y series-dates (classes.ts:845). El ORDER BY de la línea 284 arrastra el mismo mezclado.
- **Escenario de falla:** Sesión de DB en UTC. Clienta con clase a las 18:00 CDMX (10-jul, verano UTC-5). A la hora real de la clase NOW()=23:00Z; el BETWEEN queda [22:30Z, 23:30Z]. `c.date+c.start_time`=18:00 se castea a 18:00Z, que NO cae en la ventana → la query devuelve 0 filas → 404 'No se encontró una reserva válida para esta clase' aunque la clase es justo ahora. Recepción no puede escanear el QR a la hora de clase (en invierno el desfase es 6h). Queda enmascarado porque el cron autoCheckIn (correcto) marca asistencia 30min después, y el check-in manual no valida ventana.
- **Fix sugerido:** Reemplazar `NOW()` por `(NOW() AT TIME ZONE 'America/Mexico_City')` en el BETWEEN y en el ORDER BY, igual que el resto de comparaciones hora-de-clase vs ahora del proyecto.

### 29. [P1·checkin] Self check-in parsea la hora de la clase como hora local del proceso Node (no CDMX): la ventana queda corrida por el offset

- **Ubicación:** `routes/checkin.ts:519` · votos 3/3
- **Descripción:** `const classStart = new Date(`${booking.class_date}T${booking.class_start_time}`)` produce, p.ej., `new Date('2026-07-10T18:00:00')`. Un datetime SIN offset lo interpreta JS en la TZ del proceso (UTC en Railway), no en CDMX. Luego `diffMinutes = (classStart - now)/60000` se compara contra la ventana [-15, 30]. Es exactamente el bug que bookings.ts ya corrigió con Intl.DateTimeFormat/formatToParts (líneas 486-504, con el comentario de que el offset fijo estaba mal).
- **Escenario de falla:** Servidor Node en UTC. Clase 18:00 CDMX (verano UTC-5): classStart parsea a 18:00Z; a la hora real now=23:00Z → diffMinutes = -300 → cae en `diffMinutes < -15` → 400 'El tiempo para check-in ha pasado'. La clienta NO puede hacer self check-in a la hora real de su clase; la ventana válida se abre ~5h antes (cuando UTC-now ≈ 17:30-18:15Z, es decir ~12:30 CDMX). self_checkin_enabled está ON por default (línea 446), así que es un flujo vivo.
- **Fix sugerido:** Calcular el instante UTC real de la clase con el mismo enfoque Intl.DateTimeFormat('America/Mexico_City').formatToParts que POST /api/bookings, o mover la comparación de ventana a SQL con `AT TIME ZONE 'America/Mexico_City'`.

### 30. [P2·checkin] createCheckinLog calcula is_late / minutes_early_late con parse naive → puntualidad corrupta en TODOS los check-ins (qr/self/manual)

- **Ubicación:** `routes/checkin.ts:142` · votos 2/3
- **Descripción:** `const classStart = new Date(params.classStartTime)` donde classStartTime = `${booking.class_date}T${booking.class_start_time}` (p.ej. '2026-07-10T18:00:00', sin offset). Se interpreta en la TZ del proceso (UTC), no en CDMX. Con eso se calcula `minutesEarlyLate = round((classStart - now)/60000)` e `isLate = minutesEarlyLate < -10`, que se persisten en checkin_logs.is_late y minutes_early_late. Lo llaman las tres rutas: /qr (375), /self (555) y /manual (688).
- **Escenario de falla:** Servidor en UTC, clase 18:00 CDMX: al hacer check-in a la hora real (now=23:00Z, verano UTC-5) classStart=18:00Z → minutesEarlyLate = -300 e isLate = true SIEMPRE. Cada asistencia se guarda como 'tarde' ~5-6h con minutes_early_late erróneo. Los reportes GET /api/checkin/stats (late vs onTime) y la vista checkin_stats quedan inservibles el día del lanzamiento.
- **Fix sugerido:** Derivar el instante real de la clase con el offset de CDMX (Intl) antes de restar `now`, o calcular la puntualidad en SQL con `AT TIME ZONE 'America/Mexico_City'` para no depender de la TZ del proceso.

### 31. [P0·pagos] finalizePaidOrder no es idempotente: comprueba el estado FUERA de la transacción y no bloquea la orden → doble membresía + doble cobro con reintentos de MercadoPago

- **Ubicación:** `lib/orderFulfillment.ts:21` · votos 3/3
- **Descripción:** finalizePaidOrder lee order.status con queryOne ANTES de abrir la transacción (línea 12-21) y hace 'if (order.status === "approved") return;'. Dentro de la tx crea una membresía, un payment, otorga puntos de lealtad/referido y recién ahí hace 'UPDATE orders SET status = "approved"' (línea 40) SIN ninguna cláusula 'WHERE status <> "approved"' y sin 'SELECT ... FOR UPDATE'. No existe índice UNIQUE sobre memberships.order_id (migración 003 lo declara sólo como FK ON DELETE SET NULL), así que la BD tampoco frena el duplicado. La función es el único punto de asentamiento de pagos con tarjeta y se invoca desde DOS caminos concurrentes sin candado compartido: el webhook de MercadoPago (routes/mercadopago-webhook.ts:82) y el endpoint admin POST /api/orders/:id/sync-mp (routes/orders.ts:550). El dedup del webhook usa event_key = payment:<dataId>:<x-request-id>, por lo que dos notificaciones del MISMO pago con distinto x-request-id (p. ej. payment.created y payment.updated, ambas 'approved', comportamiento normal de MP) pasan ambas el UNIQUE y llaman finalize dos veces.
- **Escenario de falla:** Orden con tarjeta en 'pending_payment'. MercadoPago entrega dos webhooks 'approved' del mismo pago con x-request-id distinto (o llega un webhook mientras el admin pulsa 'sync-mp'). Ambas ejecuciones leen order.status='pending_payment', ambas pasan la guarda de idempotencia, ambas abren su tx y ambas INSERTAN una membresía activa + un registro en payments para la MISMA orden. Resultado: la clienta recibe 2 membresías (doble de créditos), se contabilizan 2 ingresos por el mismo pago y awardPaymentLoyaltyPoints otorga puntos dos veces (cada payment tiene id distinto, así que su idempotencia por descripción no lo evita).
- **Fix sugerido:** Hacer el asentamiento atómico: dentro de la transacción, primero 'SELECT status FROM orders WHERE id=$1 FOR UPDATE' y abortar si ya está 'approved'; o convertir el UPDATE final en 'UPDATE orders SET status="approved", ... WHERE id=$4 AND status <> "approved"' y verificar rowCount===0 → ROLLBACK y return. Además añadir un índice UNIQUE sobre memberships.order_id (WHERE order_id IS NOT NULL) como red de seguridad a nivel BD.

### 32. [P1·reservar] Beneficio de clase gratis (free_class) se consume sin verificar rowCount → dos reservas gratis con un solo beneficio

- **Ubicación:** `routes/bookings.ts:771` · votos 3/3
- **Descripción:** En POST /api/bookings el free_class benefit se resuelve con queryOne FUERA de la transacción (líneas 607-621, marca isFreeClass=true). Dentro de la tx se inserta la reserva con is_free_booking=true y luego se intenta 'UPDATE user_benefits SET status="used" ... WHERE id=$2 AND status="active"' (línea 773) SIN comprobar rowCount: la reserva gratis se comitea aunque el UPDATE afecte 0 filas. El chequeo de duplicado sólo cubre la MISMA clase (mismo class_id+user_id), no dos clases distintas.
- **Escenario de falla:** Clienta con un único beneficio free_class activo dispara dos POST /api/bookings concurrentes para DOS clases distintas (A y B). Ambas peticiones ejecutan el SELECT del beneficio antes de que ninguna lo marque usado → ambas ven status='active'. R1 inserta reserva gratis de A y marca el beneficio 'used' (rowCount 1). R2 inserta reserva gratis de B, su UPDATE encuentra status='used' (rowCount 0) pero el código lo ignora y comitea igual. Resultado: 2 clases gratis consumiendo 1 solo beneficio (pérdida de una clase de valor).
- **Fix sugerido:** Consumir el beneficio DENTRO de la tx sobre una fila bloqueada y comprobar el resultado: verificar 'dec.rowCount === 1' tras el UPDATE (o hacer SELECT ... FOR UPDATE del user_benefit al inicio de la tx); si rowCount===0, hacer ROLLBACK y devolver 409 (beneficio ya usado) o continuar por el flujo de pago con crédito en vez de dejarla gratis.

### 33. [P2·lealtad] Beneficios de barra (bar_discount / free_drink) se consumen fuera de la transacción y sin verificar rowCount → doble descuento

- **Ubicación:** `routes/bar.ts:215` · votos 3/3
- **Descripción:** En POST /api/bar/orders el descuento por beneficio se detecta (líneas 137-152) y ya se hornea en totals.total_mxn antes de crear la orden. La marca de 'usado' se hace en consumeFn (línea 213) con 'UPDATE user_benefits SET status="used" ... WHERE id AND status="active"' usando el helper global query() (autocommit, fuera de la transacción de la orden) y SIN comprobar rowCount. Se invoca después de crear/committear la orden (línea 287 tarjeta, línea 295 recepción).
- **Escenario de falla:** Clienta con un beneficio bar_discount (p. ej. 10%) activo envía dos órdenes de barra concurrentes. Ambas leen el beneficio como 'active' y aplican el descuento a su total respectivo; luego cada consumeFn intenta marcarlo 'used': una gana (rowCount 1), la otra afecta 0 filas pero no se valida. Resultado: el mismo beneficio descuenta en dos órdenes distintas (doble gasto del beneficio). También, si el proceso cae entre el commit de la orden y consumeFn, el beneficio queda 'active' pese a haberse ya aplicado el descuento.
- **Fix sugerido:** Marcar el beneficio DENTRO de la misma transacción que crea la orden (usar client.query en lugar de query global) y verificar rowCount===1; si es 0, revertir el descuento aplicado (recalcular total sin el beneficio) o abortar la orden. Bloquear la fila del beneficio con FOR UPDATE al detectarlo para serializar consumos concurrentes.

---

## Anexo: descartados por verificación adversarial (posibles falsos positivos)

- (0/3) [cancelar] La cancelacion tardia (dentro de min_hours) se bloquea por completo en vez de permitirse sin reembolso, contradiciendo late_cancel_message y dejando cupos ocupados que el waitlist podria tomar  — `index.ts:1904`
- (1/3) [cancelar] El 'quitar forzado' del staff reembolsa credito por defecto a reservas ya atendidas (checked_in) o no_show  — `index.ts:1918`
- (1/3) [agendar] ON CONFLICT DO NOTHING en /generate no protege el slot (no existe índice único) → clases duplicadas  — `routes/classes.ts:631`
- (0/3) [membresias] POST /:id/activate permite reactivar membresías expired o cancelled e inserta un pago nuevo sin recargar créditos  — `routes/memberships.ts:801`
- (0/3) [pagos] Dedupe del webhook de MP usa x-request-id (no estable por pago) y sync-mp no tiene dedupe: habilita la carrera de doble cumplimiento  — `routes/mercadopago-webhook.ts:42`
- (0/3) [pagos] Verificación de firma del webhook de MP falla en abierto cuando MP_WEBHOOK_SECRET está vacío  — `routes/mercadopago-webhook.ts:37`
- (0/3) [pagos] cleanupExpiredOrders puede dejar varada una transferencia bancaria ya pagada (dinero en vuelo, sin membresia)  — `services/cron-jobs.ts:389`
- (0/3) [otros] requestReviews: el dedup por review_requests esta roto (nunca se inserta la fila) y puede reenviar el push de reseña  — `services/cron-jobs.ts:216`
- (0/3) [pagos] POST /orders/:id/approve verifica el estado fuera de la transacción y crea la membresía/pago sin guarda condicional → doble membresía en doble-click o dos admins  — `routes/orders.ts:678`
