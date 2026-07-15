# Reporte — Auditoría de cobertura funcional Casa Shé

> Skill `pilates-studio-auditor`, modo auditoría. Cobertura global: **65%**. Ver detalle escenario por escenario en `cobertura.md`.

## Resumen ejecutivo

Cobertura global: 65% (semáforo amarillo, pero con bolsones críticos en rojo: Cancelaciones/waitlist, Pagos, Notificaciones, Seguridad/legal y los edge cases de concurrencia). El sistema reserva, cobra y da check-in bien en el camino feliz — ahí sí está sólido — pero se rompe en los momentos de fricción real con dinero y confianza.

Los 3 hoyos más caros: (1) si el aviso de MercadoPago de un pago con tarjeta nunca llega, hoy NO hay forma de reconciliarlo desde el panel — una clienta que ya pagó puede quedarse sin su membresía y el único botón visible es "cancelar su orden"; (2) cuando el estudio cancela una clase (por feriado, imprevisto, etc.) la clienta solo recibe un push de navegador que casi nadie ve — puede presentarse al estudio sin saberlo; (3) los créditos que la clienta ya pagó se pierden de golpe al vencer la membresía, sin ningún día de gracia — es, según la propia auditoría, la fuente número uno de conflictos con clientas.

Además hay dos huecos donde el estudio puede estar regalando clases sin darse cuenta: la Clase Muestra gratuita se puede repetir indefinidamente, y el personal con permiso elevado puede sumar créditos sin dejar ningún motivo registrado. Y un defecto de seguridad latente (no explotado hoy, pero real): si el secreto del webhook de MercadoPago llegara a faltar por un error de configuración, el sistema aceptaría webhooks falsos en vez de rechazarlos.

La buena noticia: 5 de estos gaps se arreglan en menos de un día cada uno (webhook fail-closed, bloquear reventa de Clase Muestra, motivo obligatorio en ajustes de crédito, código de descuento a prueba de carrera, y notificar bonos de cumpleaños) — son el mejor punto de partida antes de salir a producción.

## Scorecard por dominio

| Dominio | ✅ | ⚠️ | ❌ | ➖ | ❓ | Cobertura | Semáforo |
|---|---|---|---|---|---|---|---|
| A — Registro e identidad | 4 | 4 | 2 | 0 | 0 | 60% | 🟡 |
| B — Horarios y reservas | 8 | 5 | 0 | 0 | 0 | 81% | 🟡 |
| C — Cancelaciones, cambios y waitlist | 3 | 2 | 3 | 0 | 0 | 50% | 🔴 |
| D — Paquetes y membresías | 8 | 2 | 3 | 0 | 0 | 69% | 🟡 |
| E — Pagos | 2 | 6 | 1 | 1 | 0 | 56% | 🔴 |
| F — Check-in y asistencia | 6 | 2 | 1 | 0 | 0 | 78% | 🟡 |
| G — Wallet passes (Apple/Google) | 3 | 4 | 0 | 0 | 0 | 71% | 🟡 |
| H — Notificaciones y comunicación | 0 | 8 | 2 | 0 | 0 | 40% | 🔴 |
| I — Panel admin y operación | 5 | 6 | 0 | 0 | 0 | 73% | 🟡 |
| J — Instructoras | 3 | 2 | 0 | 0 | 0 | 80% | 🟡 |
| K — Reportes y métricas | 4 | 3 | 0 | 0 | 0 | 79% | 🟡 |
| L — Seguridad, legal y datos | 2 | 4 | 0 | 1 | 1 | 57% | 🔴 |
| EC — Edge cases | 9 | 9 | 5 | 2 | 0 | 59% | 🔴 |

## Gaps P0 — sangran dinero o confianza YA

### P0-1 · [C5+H3] Cancelación de clase por el estudio no avisa por WhatsApp ni queda en la campanita in-app

- **Qué pasa hoy**: cancelClassWithRefunds (lib/cancel-class.ts:57-60) solo manda un push web al navegador/OS; sendCancellationNotice (WhatsApp) nunca se invoca desde ahí, ni desde classes.ts DELETE, closed-days.ts ni events.ts; tampoco se escribe en la tabla de notificaciones in-app ni se manda email de respaldo.
- **Qué debería pasar**: Agregar el envío de sendCancellationNotice (o plantilla 'clase cancelada por el estudio') y writeInAppNotification dentro de cancelClassWithRefunds, con email de respaldo vía services/email.ts; opcionalmente sugerir 2-3 clases del mismo tipo con cupo.
- **Por qué es P0 para Casa Shé**: WhatsApp es el canal primario en México y push depende de que la clienta tenga la app 'agregada a inicio' (raro en iPhone); hoy una clienta puede literalmente presentarse al estudio a una clase que el estudio ya canceló, sin ninguna manera de enterarse antes.
- **Dónde vive el fix**: backend/src/lib/cancel-class.ts; backend/src/routes/classes.ts (DELETE /:id); backend/src/routes/closed-days.ts; backend/src/routes/events.ts
- **Esfuerzo estimado**: 1-2 días (reutiliza templates/funciones ya existentes)

### P0-2 · [E1+E5] Pago con tarjeta rechazado se queda como 'Esperando pago' para siempre

- **Qué pasa hoy**: mercadopago-webhook.ts:83-88 solo setea rejected_at y NUNCA cambia orders.status a 'rejected' cuando MP rechaza/cancela un pago con tarjeta; OrderDetail.tsx no lee el query param ?mp=failure ni muestra mp_status_detail, así que el cliente solo ve 'Esperando pago' sin ningún mensaje de rechazo.
- **Qué debería pasar**: Mapear rejected/cancelled a status='rejected' en el webhook y mostrar un mensaje específico de tarjeta rechazada con CTA a reintentar/cambiar método en OrderDetail.tsx.
- **Por qué es P0 para Casa Shé**: Es el punto exacto de conversión (una clienta comprando su primer paquete): si su tarjeta falla y el sistema no se lo dice, puede pensar que ya compró, no reintentar, y abandonar confundida sin que nadie en el estudio lo note.
- **Dónde vive el fix**: backend/src/routes/mercadopago-webhook.ts:83-88; frontend/src/pages/client/OrderDetail.tsx
- **Esfuerzo estimado**: 0.5-1 día

### P0-3 · [E4+EC10] Si el webhook de MercadoPago nunca llega, no hay forma de reconciliar un pago con tarjeta ya cobrado

- **Qué pasa hoy**: sync-mp exige que orders.mp_payment_id YA esté seteado (solo lo escribe el webhook); si el webhook nunca llegó, responde 400 'no hay pago que reconciliar'. No hay búsqueda por external_reference en lib/mercadopago.ts, ningún botón en OrdersVerification.tsx invoca sync-mp, y el único cron proactivo cubre transferencias, no tarjeta.
- **Qué debería pasar**: Extender la búsqueda a /v1/payments/search?external_reference= cuando falte mp_payment_id, agregar botón 'Reconciliar con MP' en OrdersVerification.tsx, y un cron horario sobre pending_payment+card.
- **Por qué es P0 para Casa Shé**: Es el hueco más caro de todo el sistema: una clienta que SÍ pagó puede quedarse sin su membresía y hoy la única acción visible para recepción/dueña es cancelar su orden, como si nunca hubiera pagado.
- **Dónde vive el fix**: backend/src/lib/mercadopago.ts; backend/src/routes/orders.ts (sync-mp); frontend/src/pages/admin/orders/OrdersVerification.tsx; backend/src/services/cron-jobs.ts
- **Esfuerzo estimado**: 2-3 días

### P0-4 · [L6] La verificación de firma del webhook de MercadoPago falla ABIERTA, no cerrada

- **Qué pasa hoy**: lib/mercadopago.ts:90 tiene `if (!secret) return true` — si MP_WEBHOOK_SECRET llegara a faltar (rotación mal hecha, nuevo ambiente, redeploy que pierda la variable), CUALQUIER request sin firma válida sería aceptado como webhook legítimo.
- **Qué debería pasar**: Cambiar a fail-closed: rechazar el webhook si no hay secret configurado, igual que ya hace stripe-webhook.ts:13-14.
- **Por qué es P0 para Casa Shé**: Es la puerta de entrada de dinero real del sistema; un webhook falsificado aceptado por error de configuración puede activar membresías o marcar pagos como aprobados sin que haya habido cobro real — el estudio regalaría clases sin ninguna alerta.
- **Dónde vive el fix**: backend/src/lib/mercadopago.ts:90
- **Esfuerzo estimado**: 1 hora

### P0-5 · [EC3] Códigos de descuento de un solo uso se pueden sobre-vender en carrera

- **Qué pasa hoy**: Dos compras casi simultáneas con el mismo código (último uso disponible) pueden ambas leer current_uses < max_uses y ambas incrementar, sobrepasando el límite del código sin que quede ningún rastro de que algo falló.
- **Qué debería pasar**: Reemplazar el patrón leer-luego-escribir por un UPDATE atómico condicional (`UPDATE discount_codes SET current_uses = current_uses + 1 WHERE id=$1 AND current_uses < max_uses RETURNING id`) o un FOR UPDATE al aplicar el descuento.
- **Por qué es P0 para Casa Shé**: Es fuga de ingreso directa: un código pensado para una sola clienta (ej. promo de lanzamiento, referido) puede terminar usado por varias si compran casi al mismo tiempo, y nadie en el estudio se entera porque el conteo simplemente queda 'mal' sin error visible.
- **Dónde vive el fix**: backend/src/routes/discount-codes.ts; punto de aplicación en checkout/orders.ts
- **Esfuerzo estimado**: 2-4 horas

### P0-6 · [A8] La Clase Muestra gratuita se puede repetir indefinidamente

- **Qué pasa hoy**: canBuySamplePlan (routes/orders.ts:531-541) solo revisa si HAY una membresía activa en este momento, no si el usuario ya usó el plan 'sample' alguna vez — una clienta puede volver a comprar la Clase Muestra cada vez que deja vencer su paquete anterior.
- **Qué debería pasar**: Sumar un chequeo histórico (`orders.package_type='sample' AND status='approved'` alguna vez para ese user_id) dentro de canBuySamplePlan.
- **Por qué es P0 para Casa Shé**: Es exactamente 'el estudio regala clases sin saberlo': la promoción de 1-por-persona, pensada para atraer clientas nuevas, se convierte en un descuento recurrente que la dueña nunca autorizó ni puede ver en ningún reporte.
- **Dónde vive el fix**: backend/src/routes/orders.ts (canBuySamplePlan, líneas 531-541)
- **Esfuerzo estimado**: 2-4 horas

### P0-7 · [D5] Los créditos ya pagados se pierden sin días de gracia al vencer la membresía

- **Qué pasa hoy**: En cuanto pasa la fecha de vencimiento la membresía queda 'expired' de inmediato y selectMembershipForBooking deja de considerarla; no existe ninguna key en system_settings que dé días de gracia o permita congelar, es comportamiento fijo en código.
- **Qué debería pasar**: Agregar una política configurable (p.ej. `expiry_policy` con gracia en días o conversión a congelado) consultada por markExpiredMemberships antes de expirar, con UI de edición en el panel de configuración.
- **Por qué es P0 para Casa Shé**: La propia auditoría lo marca como 'la fuente #1 de conflictos con clientas' — es dinero que la clienta ya pagó y el sistema se lo quita por una decisión de código, no por una política que la dueña haya elegido y pueda ajustar.
- **Dónde vive el fix**: backend/src/services/cron-jobs.ts (markExpiredMemberships); backend/src/routes/settings.ts; backend/src/lib/membershipSelection.ts
- **Esfuerzo estimado**: 2-3 días

### P0-8 · [I5] Ajustes de créditos sin motivo obligatorio para roles con permiso elevado

- **Qué pasa hoy**: admin/super_admin y recepción con 'creditos_sin_limite' pueden ajustar créditos SIN dar ningún motivo (memberships.ts:1290, el bloque de validación se salta por completo con `if (!sinLimite)`); el ajuste de vigencia (fechas) tampoco exige motivo para ningún rol.
- **Qué debería pasar**: Mover la validación de motivo obligatorio (mínimo N caracteres) fuera del `if (!sinLimite)` para que aplique a cualquier rol en PATCH /:id/credits y PATCH /:id/dates.
- **Por qué es P0 para Casa Shé**: Es la puerta trasera para regalar clases sin que la dueña se entere: un empleado con ese permiso puede sumarle créditos a una amiga o familiar sin dejar ningún motivo auditable, y hoy nada lo evita ni lo hace visible.
- **Dónde vive el fix**: backend/src/routes/memberships.ts PATCH /:id/credits, PATCH /:id/dates
- **Esfuerzo estimado**: 1-2 horas

### P0-9 · [I3] El historial de pagos reales es invisible en la ficha de la clienta

- **Qué pasa hoy**: Ni full-profile (routes/admin.ts) ni la bitácora (routes/clients.ts) exponen el historial de PAGOS reales (monto, método, referencia, fecha) — solo el precio de lista del plan; recepción debe ir a la pantalla global de pagos y buscar manualmente por cliente.
- **Qué debería pasar**: Agregar `SELECT * FROM payments WHERE user_id=$1` al full-profile o una pestaña dedicada 'Pagos' en ClientDetail.tsx.
- **Por qué es P0 para Casa Shé**: Cuando una clienta reclama 'yo ya pagué' delante del staff, es el peor momento para que el dato no esté a la mano en la misma pantalla — hoy depende de que alguien sepa buscarlo en otra sección.
- **Dónde vive el fix**: backend/src/routes/admin.ts (full-profile); frontend/src/pages/admin/clients/ClientDetail.tsx
- **Esfuerzo estimado**: 3-4 horas

## Gaps P1 — cuestan clientas de forma medible

### P1-1 · [H2] Recordatorios de clase (24h/2h) apagados para todas las clientas

- **Qué pasa hoy**: sendClassReminders() está deshabilitado desde la transición de Fitune (cron-jobs.ts:932-937); ningún cliente recibe recordatorio por ningún canal.
- **Qué debería pasar**: Reactivar el cron con in-app+push como mínimo (WhatsApp queda apagado por decisión ya tomada).
- **Dónde vive el fix**: backend/src/services/cron-jobs.ts:932-937

### P1-2 · [G1] El wallet pass no se entrega proactivamente al activar la membresía

- **Qué pasa hoy**: La clienta debe descubrir por sí sola la pantalla /app/wallet; no hay CTA en el correo de activación ni pantalla de éxito post-pago.
- **Qué debería pasar**: Agregar botón 'Agregar a tu Wallet' en sendMembershipActivatedEmail y en la pantalla de orden/checkout.
- **Dónde vive el fix**: backend/src/services/email.ts (sendMembershipActivatedEmail); frontend/src/pages/client/OrderDetail.tsx

### P1-3 · [G3+EC17] El wallet pass no se actualiza tras ajustes manuales, pausas, canjes o bonos

- **Qué pasa hoy**: Ajustes de créditos/vigencia, pausa/reanudación, canje de recompensas y bonos de lealtad cambian el saldo real en BD, pero el pass ya instalado se queda desactualizado hasta una acción no relacionada; además las llamadas de refresh que sí existen son fire-and-forget sin reintento.
- **Qué debería pasar**: Disparar/encolar refresh de wallet en memberships.ts (pause/resume/dates/credits), loyalty.ts (redeem) y cron-jobs.ts (bonos), reutilizando POST /api/wallet/admin/refresh-passes; agregar cola de reintento.
- **Dónde vive el fix**: backend/src/routes/memberships.ts; backend/src/routes/loyalty.ts; backend/src/services/cron-jobs.ts; backend/src/routes/wallet.ts

### P1-4 · [G6] El pass no avisa visualmente cuando la membresía vence

- **Qué pasa hoy**: Al vencer una membresía, el pass instalado se queda mostrando el saldo/plan de antes indefinidamente; Apple no comunica 'vencido' de forma visible.
- **Qué debería pasar**: En markExpiredMemberships, disparar refresh de wallet para las recién vencidas y agregar leyenda 'VENCIDO · Renueva en la app' en el storeCard de Apple.
- **Dónde vive el fix**: backend/src/services/cron-jobs.ts (markExpiredMemberships); backend/src/lib/apple-wallet.ts

### P1-5 · [B5+H4] La promoción de lista de espera cobra el crédito sin ventana de confirmación

- **Qué pasa hoy**: Al promover desde la waitlist, el sistema confirma y cobra el crédito en el mismo paso (waitlist.ts:220-224), sin dar tiempo a la clienta de aceptar/rechazar el lugar.
- **Qué debería pasar**: Agregar estado intermedio 'offered' con expiración (p.ej. 30 min) y un cron de barrido que salte a la siguiente persona si no confirma.
- **Dónde vive el fix**: backend/src/lib/waitlist.ts; backend/src/services/cron-jobs.ts

### P1-6 · [C3+B11] El toggle de penalización por no-show es una bandera muerta, sin sistema de strikes

- **Qué pasa hoy**: booking_policies.no_show_penalty se define en settings.ts pero nunca se lee en ningún flujo; no existe ningún sistema de strikes ni bloqueo temporal para clientas con no-shows repetidos.
- **Qué debería pasar**: Leer el flag en markNoShows y agregar conteo/bloqueo configurable (tabla client_strikes o columna en users).
- **Dónde vive el fix**: backend/src/services/cron-jobs.ts (markNoShows); backend/src/routes/settings.ts

### P1-7 · [C7] Mover fecha/hora de una clase con reservas no avisa ni ofrece cancelar sin penalización

- **Qué pasa hoy**: PUT /:id permite mover fecha/hora de una clase con current_bookings>0 sin advertencia ni notificación a las clientas afectadas.
- **Qué debería pasar**: Exigir confirmación explícita si hay reservas activas y notificar (push/in-app/WhatsApp) con opción de cancelar sin penalización.
- **Dónde vive el fix**: backend/src/routes/classes.ts PUT /:id; frontend/src/pages/admin/classes/ClassesCalendar.tsx

### P1-8 · [J4+C6] Cambio de instructora no notifica a las clientas ya reservadas

- **Qué pasa hoy**: Las 3 rutas de cambio de instructora (change-instructor, substitute, etc.) notifican a las instructoras salientes/entrantes pero nunca a las clientas de la clase.
- **Qué debería pasar**: Agregar notificación (push/in-app, WhatsApp si aplica) a los bookings 'confirmed'/'waitlist' en los 3 endpoints.
- **Dónde vive el fix**: backend/src/routes/classes.ts (change-instructor, substitute)

### P1-9 · [D4+H5] Recordatorio de vencimiento solo a 1 día, sin escalón intermedio ni saldo de clases

- **Qué pasa hoy**: daysToNotify está hardcodeado a [1]; no configurable; no dispara por 'te quedan 2 clases'; el mensaje no incluye saldo ni CTA de renovación.
- **Qué debería pasar**: Mover a system_settings (umbrales configurables de días/créditos) y enriquecer el template con saldo + CTA de renovación.
- **Dónde vive el fix**: backend/src/services/cron-jobs.ts (notifyExpiringMemberships); backend/src/lib/whatsapp.ts

### P1-10 · [K4] El botón 'Recordar' de vencimientos próximos no envía nada (es un mock)

- **Qué pasa hoy**: El botón solo dispara un toast de éxito falso sin llamar a ningún canal real; tampoco considera paquetes de crédito con vigencia lejana pero pocos créditos restantes.
- **Qué debería pasar**: Conectar el botón a un endpoint real de notificación y sumar el criterio de 'créditos casi agotados'.
- **Dónde vive el fix**: frontend/src/pages/admin/reports (vista de vencimientos próximos); backend/src/routes/reports.ts

### P1-11 · [K5] El reporte de retención cuenta mal cancelaciones tardías y no-shows

- **Qué pasa hoy**: Los ILIKE de reports.ts buscan cadenas que cancel_booking() ya no produce (siempre da ~0 en 'tardías'); no_shows nunca hace match con status='no_show' aunque el cron sí lo setea; el botón 'Contactar' es decorativo.
- **Qué debería pasar**: Alinear los filtros con las cadenas/status reales del sistema y conectar 'Contactar' a un canal real (WhatsApp/llamada).
- **Dónde vive el fix**: backend/src/routes/reports.ts; frontend/src/pages/admin/reports/ReportsRetention.tsx

### P1-12 · [E6+EC11] El reembolso es manual, todo-o-nada y sin auditoría

- **Qué pasa hoy**: refundCharge (lib/stripe.ts) nunca se invoca desde ninguna ruta; no hay integración con reembolsos de MercadoPago; el botón de reembolso marca contablemente el 100% del pago sin calcular parcial por clases usadas, y no llama logAction.
- **Qué debería pasar**: Integrar el reembolso real (Stripe/MP), soportar monto parcial, y agregar logAction en el flujo de cancelación con reembolso.
- **Dónde vive el fix**: backend/src/lib/stripe.ts (refundCharge); backend/src/routes/memberships.ts (cancel con refund)

### P1-13 · [E7+EC12] Los contracargos (disputas) no alertan a la dueña

- **Qué pasa hoy**: charge.dispute.created solo hace console.warn; ningún canal (push/WhatsApp/email) avisa a dueña/staff de un contracargo confirmado.
- **Qué debería pasar**: Agregar notificación real en charge.dispute.created y en la rama charged_back de MercadoPago, con un status distinto para poder filtrarlo en reportes.
- **Dónde vive el fix**: backend/src/routes/stripe-webhook.ts; backend/src/routes/mercadopago-webhook.ts

### P1-14 · [I8] Reembolsos y cancelaciones masivas no quedan en el log de auditoría

- **Qué pasa hoy**: POST /:id/cancel con refund=true nunca llama logAction; la cancelación individual de clase y la cancelación masiva por día cerrado tampoco generan entrada de auditoría.
- **Qué debería pasar**: Agregar logAction() en esos 3 puntos para que reembolsos y cancelaciones masivas siempre queden registrados.
- **Dónde vive el fix**: backend/src/routes/memberships.ts; backend/src/routes/classes.ts DELETE; backend/src/routes/closed-days.ts

### P1-15 · [I6] Días cerrados/vacaciones solo se pueden dar de alta uno por uno

- **Qué pasa hoy**: El schema y el formulario solo aceptan una fecha a la vez; bloquear una semana completa requiere repetir el alta día por día.
- **Qué debería pasar**: Aceptar startDate/endDate en el POST y expandir el rango server-side, con selector de rango en el frontend.
- **Dónde vive el fix**: backend/src/routes/closed-days.ts; frontend/src/pages/admin/settings/ClosedDays.tsx

## Gaps P2 — operación y pulido

- **[A5]** Reglamento sin versión: no fuerza re-aceptación si cambia el texto
- **[A6]** Sin verificación de edad ni flujo de tutor para menores de edad
- **[A9]** Borrado de cuenta es hard-delete: sin anonimización ni autoservicio de la clienta
- **[A10]** Sin detección ni fusión de clientas duplicadas
- **[B7]** Sin bloqueo de reservas que se empalman en el mismo horario
- **[B9]** Sin 'traer amiga' self-service desde la app de la clienta
- **[B10]** Reservas recurrentes solo para admin, sin self-service para la clienta
- **[C4]** Cambiar de clase requiere cancelar y reservar por separado, sin operación atómica
- **[D7]** Pausar/reanudar membresía existe en backend pero es inalcanzable desde cualquier UI
- **[D10]** Sin transferencia de créditos entre cuentas ni gift cards
- **[D13]** Sin flujo dedicado de upgrade de paquete a mitad de vigencia
- **[E8]** Mensajes de activación de membresía no incluyen recibo de pago (monto/método/folio)
- **[E9]** Sin flujo de solicitud de factura (RFC, razón social, uso CFDI)
- **[F5]** Tolerancia de llegada tarde se calcula pero no se muestra ni se usa
- **[F7+EC16]** Sin roster imprimible ni check-in offline si se cae internet
- **[F9]** Instructora sin vista en vivo de quién ya llegó durante la clase
- **[G5]** Sin reenvío de wallet pass por WhatsApp/panel para clientas menos técnicas
- **[H1]** Confirmación de reserva no incluye el número de cama/reformer asignado
- **[H6]** Mensaje de bienvenida solo trae credenciales, sin guía de reserva ni wallet
- **[H7]** Sin campaña de win-back para clientas inactivas
- **[H8]** Bonos de cumpleaños/aniversario se acreditan en silencio, sin notificar
- **[H9]** Preferencias de notificación (promos, resumen semanal) sin ningún efecto real
- **[H10+EC21]** Fallos de entrega de WhatsApp son invisibles para recepción/admin
- **[I2]** Aprobaciones de pago pendientes no aparecen en el dashboard consolidado de hoy
- **[I9]** Sin panel para configurar tolerancia/penalización real de no-show
- **[J2]** Instructora no ve badge de 'primera vez' de sus alumnas nuevas
- **[K7]** Sin export CSV de listados de clientas, pagos o asistencias
- **[L2]** Cuestionario de salud sin consentimiento expreso y separado (LFPDPPP Art. 9)
- **[L3]** Sin autoservicio ni bitácora de solicitudes ARCO
- **[L5]** 25 de 48 archivos de rutas sin validación Zod (riesgo si una sesión de staff se compromete)
- **[L7]** Backups de base de datos no verificables desde código (pendiente confirmar en Railway)
- **[EC5]** Congelar membresía no gestiona qué pasa con reservas futuras ya hechas
- **[EC8]** Fecha de pago registrada no siempre refleja la fecha real de una transferencia tardía
- **[EC14]** Sin métrica de conversión de Clase Muestra a paquete pagado
- **[EC15]** Borrado de cuenta destruye historial contable en vez de anonimizarlo
- **[EC18]** Sin QR rotativo por escaneo (mejora opcional para estudios estrictos)
- **[EC22]** Identidad duplicada si una instructora también quiere ser clienta

## Quick wins (implementar antes de salir a prod)

### QW-1 · Cerrar el webhook de MercadoPago que falla abierto (L6)

- **Impacto**: Elimina el riesgo de que un webhook falsificado active membresías gratis si el secreto de firma llegara a faltar por config
- **Esfuerzo**: 1 hora

```typescript
// backend/src/lib/mercadopago.ts
export function verifyMercadoPagoSignature(req: Request): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[MP] MP_WEBHOOK_SECRET no configurado — rechazando webhook (fail-closed)');
    return false; // antes: return true
  }
  // ... resto de la verificación HMAC sin cambios
}
```

### QW-2 · Bloquear la reventa de la Clase Muestra gratuita (A8)

- **Impacto**: Cierra la fuga de clases regaladas repetidamente a la misma clienta cada vez que deja vencer su paquete
- **Esfuerzo**: 2-4 horas

```typescript
// backend/src/routes/orders.ts
async function canBuySamplePlan(userId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM orders o
     JOIN plans p ON p.id = o.plan_id
     WHERE o.user_id = $1 AND p.package_type = 'sample' AND o.status = 'approved'
     LIMIT 1`,
    [userId]
  );
  if (rows.length > 0) return false; // ya usó su Clase Muestra alguna vez
  // ... chequeo existente de membresía activa
  return true;
}
```

### QW-3 · Exigir motivo siempre en ajustes de créditos/vigencia (I5)

- **Impacto**: Cierra la puerta trasera de regalar clases sin dejar rastro auditable, sin importar el permiso del rol
- **Esfuerzo**: 1-2 horas

```typescript
// backend/src/routes/memberships.ts
const creditsSchema = z.object({
  delta: z.number().int().min(-3).max(3),
  reason: z.string().min(10, 'El motivo debe tener al menos 10 caracteres'),
});
// eliminar el `if (!sinLimite) { validar motivo }` existente
// y validar `reason` SIEMPRE, para cualquier rol/permiso, antes de aplicar el delta
```

### QW-4 · Volver atómico el consumo de códigos de descuento de un solo uso (EC3)

- **Impacto**: Elimina la sobreventa de códigos promocionales en compras concurrentes
- **Esfuerzo**: 2-4 horas

```typescript
// backend/src/routes/discount-codes.ts (al aplicar el código en checkout)
const { rows } = await client.query(
  `UPDATE discount_codes
   SET current_uses = current_uses + 1
   WHERE id = $1 AND current_uses < max_uses
   RETURNING id`,
  [codeId]
);
if (rows.length === 0) {
  throw new HttpError(400, 'Este código ya alcanzó su límite de usos');
}
```

### QW-5 · Notificar bonos de cumpleaños/aniversario (H8)

- **Impacto**: La clienta se entera de un beneficio que ya se le está dando, reforzando la relación en vez de que pase inadvertido
- **Esfuerzo**: 1-2 horas

```typescript
// backend/src/services/cron-jobs.ts, dentro del loop de birthdayBonus/anniversaryBonus
await awardLoyaltyPoints(u.id, points, 'birthday');
void notifyPointsEarnedExternal(u.id, points, 'birthday'); // función ya existe, solo falta esta línea
// análogo para el loop de anniversaryBonus con 'anniversary'
```
