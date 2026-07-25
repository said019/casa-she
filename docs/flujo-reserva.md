# Flujo de reserva — Casa Shé

Cómo vive una clienta el proceso de reservar una clase, y qué hace el sistema detrás de cada paso.
Documento levantado del código real (no del diseño ideal): rutas, validaciones, mensajes y notificaciones tal como están hoy.

**Fecha:** 2026-07-25 · **Rama:** `main`

> **Lee esto primero:** los crons de la plataforma están apagados en producción (`ENABLE_CRON_JOBS=false`). Eso significa que **no salen recordatorios de clase, ni solicitud de reseña, ni bonos de lealtad**, y que el no-show automático tampoco corre. Ver §10.

---

## El camino feliz, en corto

1. Se registra o entra → cae en `/app` (Dashboard).
2. Va a **Reservar** (`/app/book`) y ve la semana con sus clases.
3. Antes de su primera reserva acepta el **reglamento** (modal bloqueante).
4. **Toca una clase y queda reservada** — no hay pantalla de confirmación intermedia.
5. Se le descuenta **1 crédito** del paquete correcto (lo elige el sistema, ella no).
6. Recibe **email de confirmación** + **push**. Su pase de Wallet se actualiza.
7. Llega al estudio, muestra su **QR** (en `/app/wallet`) y recepción le hace check-in.
8. Al hacer check-in gana **puntos de lealtad**.

Cancelar: hasta **5 horas antes** con devolución del crédito. Después de esa hora **ya no puede cancelar** (ver §9, tiene una consecuencia importante).

---

## 1. Entrar

### Registro — `/register`
Pantalla: *"Únete a Casa Shé · Crea tu cuenta para reservar y comprar paquetes."*

Pide: nombre completo, email, teléfono (`+52` + 10 dígitos, se autocompleta el prefijo), fecha de nacimiento (opcional), contraseña (mín. 8, una mayúscula y un número), aceptar términos (obligatorio) y opt-in de promociones (opcional).

### Login — `/login`
*"Entra a casa · Reserva clases y revisa tus créditos."* Termina en `/app`.

### Perfilador
Existe completo (`/app/onboarding`: 6 pasos, recomienda disciplinas y paquete) pero **nunca se le ofrece a la clienta**: los componentes que lo invitarían (`ProfilerGate`, `ProfilerInviteBanner`) no están montados en ninguna parte. Solo llega quien escriba la URL a mano. → ver §12.

---

## 2. Elegir clase — `/app/book`

*"Haz espacio para volver a ti. · Toca una clase disponible y tu lugar quedará reservado de inmediato."*

- Vista por semana, con navegación *‹ Sem. ant. · Esta semana · Sem. sig. ›*.
- **Filtros:** tipo de clase, coach y horario (Mañana / Tarde / Noche).
- **Escritorio:** parrilla día × hora, cada clase con hora, nombre, coach y contador `ocupados/cupo`.
- **Móvil:** cinta de 7 días + lista del día.

Cómo se ve cada clase:

| Estado | Qué ve |
|---|---|
| Disponible | Color de su disciplina · "3 lugares" |
| Gratis | Fondo verde · "Gratis · prueba" |
| Llena | Escritorio: "Llena" · Móvil: "Lista de espera" |
| Ya reservada | "Reservada" |
| Cerrada por el estudio | "Cerrada" |

> **Importante: el saldo de créditos NO se muestra en esta pantalla.** La clienta se entera de que no tiene créditos solo cuando la reserva falla. Sus créditos viven en el Dashboard y en `/app/profile/membership`.

---

## 3. Reservar

**Un toque = reserva hecha.** No hay modal de "¿confirmas?".

Antes de la primera reserva aparece el **reglamento** (bloqueante): llegar 10 min antes, cupo reducido, **cancelar hasta 5 horas antes**, vigencia de créditos de 1 mes, salud y comunidad. Debe marcar *"He leído y acepto…"*. Al aceptar, la reserva continúa sola.

Si la clase está llena, en vez de reservar la manda al detalle (`/app/book/:id`) para anotarse en lista de espera. Ahí sí ve el aviso *"Se descontará 1 crédito de tu membresía activa"* y la ventana de cancelación real.

### Qué valida el sistema, en orden

Si algo falla, se detiene ahí con ese mensaje:

| # | Validación | Mensaje a la clienta |
|---|---|---|
| 1 | Reservas habilitadas | *Las reservas están pausadas por el estudio. Escríbenos a recepción para agendar.* |
| 2 | La clase existe y está programada | *Clase no encontrada* / *Esta clase no esta disponible* |
| 3 | La clase no está cerrada | *Esta clase está cerrada para nuevas reservas* |
| 4 | Hay cupo | *Clase llena* (ofrece lista de espera) |
| 5 | El estudio abre ese día | *El estudio está cerrado este día: …* |
| 6 | La clase no pasó ya | *No puedes reservar esta clase, el horario ya pasó.* |
| 7 | Aceptó el reglamento | *Debes aceptar el reglamento antes de reservar tu primera clase.* |
| 8 | Anticipación mínima | *Debes reservar con al menos N hora(s) de anticipación.* |
| 9 | Anticipación máxima | *Solo puedes reservar con hasta N día(s) de anticipación.* |
| 10 | Tope de reservas por día | *Alcanzaste el máximo de N reserva(s) por día.* |
| 11 | No la tiene reservada ya | *Ya tienes una reserva para esta clase* |
| 12 | **Revalida el cupo con candado** | *Clase llena* |
| 13 | Membresía vigente y con créditos | *Tu membresía no incluye clases de … o ya no te quedan créditos.* |
| 14 | El paquete sirve para esa sucursal | *Tu paquete individual es solo para el estudio X…* |

Los pasos 7-10 **solo aplican a la clienta**: recepción y admin se los saltan (§11).

**Sin sobreventa:** el cupo se revalida dentro de una transacción con candado sobre la clase (`SELECT … FOR UPDATE`), más un índice único que impide reservas duplicadas y un `CHECK` en base de datos. Dos personas peleando por el último lugar: solo una entra.

---

## 4. Qué crédito se descuenta

La clienta **no elige** el paquete; lo elige el sistema. Entre sus membresías activas y vigentes **a la fecha de la clase**, prefiere en este orden:

1. Que sirva para esa sucursal y esa categoría de clase.
2. **Paquete acotado antes que ilimitado** (gasta primero lo que caduca).
3. El de vigencia más próxima.
4. El más antiguo.

Descuenta **1 crédito** del bucket correspondiente (`Salsa` o `Clases`) y guarda de cuál se cobró, para poder devolverlo exacto si cancela. Si el paquete es ilimitado, no descuenta nada.

**No se descuenta crédito** si la clase es gratis, si es invitada, o si usa un beneficio de lealtad (clase gratis pagada con puntos).

---

## 5. Confirmación

En pantalla: toast **"Reserva confirmada · Tu lugar quedó apartado de inmediato. Te esperamos en Casa Shé."** y la manda a **Mis clases** (`/app/classes`).

Le llega:

| Canal | Contenido | Estado |
|---|---|---|
| **Email** | *Reserva confirmada — {clase} ({fecha})*, con la ventana real de cancelación | ✅ activo |
| **Push** | *Reserva confirmada · Tu clase quedó agendada. Te esperamos.* | ✅ activo (si hay VAPID) |
| **Apple / Google Wallet** | El pase se actualiza | ✅ activo (si hay credenciales) |
| WhatsApp | *Reserva confirmada* | ❌ apagado desde jun-2026 |

---

## 6. Mientras espera la clase

En **Mis clases** ve "Próximas" y "Pasadas". En el Dashboard ve sus 2 próximas clases con badge *Confirmada*.

**Recordatorios de 24 h y 2 h antes: NO salen.** El código existe, pero los crons están comentados *y* además el planificador global está apagado. Hoy la clienta no recibe ningún recordatorio.

---

## 7. Llegar al estudio: check-in

El QR vive en **`/app/wallet`** ("Cartera" en la barra inferior): *"Acceso personal · Preséntalo en recepción al llegar."* También se puede guardar en Apple/Google Wallet.

Formas de registrar asistencia:
- **Recepción escanea su QR** — válido de **30 min antes a 30 min después** de la hora de inicio.
- **Auto check-in de la clienta** con geolocalización — debe estar a menos de **200 m** del estudio (*"Debes estar en el estudio para hacer check-in"*).
- **Manual por recepción**, sin QR.

**Al hacer check-in gana 10 puntos de lealtad** (valor configurado en producción; el admin puede cambiarlo). Las clases gratis no otorgan puntos. Es idempotente: no se duplican aunque se repita el check-in.

---

## 8. Si no va (no-show)

Media hora después de terminar la clase, un proceso marca la reserva como `no_show`.

**Consecuencia: pierde el crédito** (se consumió al reservar y no se devuelve). No hay multa ni bloqueo — la política `no_show_penalty` existe en la configuración pero **no está implementada en ningún lado**. Sí aparece en los reportes de riesgo del admin.

⚠️ Como los crons están apagados, hoy **este marcado tampoco corre**: las reservas se quedan en `confirmed`.

---

## 9. Cancelar

Desde el detalle de la reserva (`/app/classes/:id`), botón **"Cancelar reserva"**.

Antes de confirmar, la app le consulta al backend qué va a pasar y se lo muestra:

> **¿Cancelar esta reserva?**
> Tu lugar quedará disponible para otra persona.
> ✅ **Se devolverá 1 crédito** — El crédito regresará a la membresía con la que reservaste.
> *(o)* ⚠️ **No se devolverá el crédito** — Estás fuera de la ventana de N horas para devolución.
>
> *Conservar mi lugar* · *Sí, cancelar reserva*

### La regla real: 5 horas

- **A más de 5 h de la clase:** cancela y **se le devuelve el crédito** al mismo bucket del que salió.
- **A menos de 5 h:** **no puede cancelar en absoluto.** El sistema rechaza la operación con *"Cancelaciones permitidas hasta 5h antes de la clase"*.

> **Esto es más severo de lo que parece.** No es "cancela pero pierde el crédito": es que **no puede liberar el lugar**. Si ya no va a ir, su lugar se queda ocupado y bloqueado para otra clienta, y ella igual pierde el crédito por no-show. Vale la pena decidir si es el comportamiento que quieres (§12).

El límite de cancelaciones con devolución está configurado en **999**, es decir, en la práctica ilimitado.

**Al cancelar no se le avisa por ningún canal** (ni email, ni push): solo ve la respuesta en pantalla y su pase de Wallet se actualiza. El WhatsApp de cancelación está apagado.

Si la reserva era de **lista de espera**, salirse no tiene ventana de tiempo, no gasta crédito y no cuenta como cancelación.

---

## 10. Lista de espera

Cuando la clase está llena, en el detalle aparece:

> *Clase llena — puedes anotarte en lista de espera. Tu crédito solo se usa si se libera un lugar.*
> **[ Anotarme en lista de espera ]**

- **No se cobra el crédito al anotarse**, solo se verifica que tenga uno.
- Le confirma la posición: *"Estás en la lista de espera · Posición #3. Te avisamos si se libera un lugar."*
- La fila **cierra 2 h antes** de la clase y tiene tope de **5 personas** (configurable).
- **La promoción es automática:** cuando alguien cancela, entra la siguiente de la fila, se le cobra el crédito en ese momento y recibe **push + notificación in-app**: *"🎉 ¡Lugar confirmado! Se liberó un lugar en {clase} y tu reserva quedó confirmada."* — ✅ esto **sí funciona hoy** (no depende de crons).
- Si a la primera de la fila ya no le alcanzan los créditos, se la salta y sigue con la siguiente, **conservando su posición**.

---

## 11. Variantes

### Reserva hecha por recepción o admin
Recepción puede agendar a nombre de una clienta. **Se salta** las reglas de la clienta: reservas pausadas, clase cerrada, día inhábil, clase ya pasada, reglamento, anticipación mínima/máxima y tope diario. Sí valida cupo, duplicados y créditos. Solo admin puede forzar **sobrecupo**. Queda registrado quién agendó.
Puede marcarla como **invitada** (sin cobrar crédito).

### El estudio cancela la clase completa
A cada alumna: se cancela su reserva y **se le devuelve el crédito** (sin gastar su contador de cancelaciones, sin importar la ventana). Se le manda **push**: *"Clase cancelada · El estudio canceló una de tus clases. Revisa tus reservas."* — es el **único** aviso: no hay email ni WhatsApp. Al coach sí le llega email.

### Socias de plataforma (TotalPass / Wellhub / Fitpass)
Por decisión del dueño, **no reciben ninguna notificación automática salvo la confirmación de su reserva**. El sistema las silencia en in-app, WhatsApp y emails.

---

## 12. Cosas que encontré y quizá quieras revisar

Ninguna rompe el flujo, pero varias afectan la experiencia:

| # | Hallazgo | Por qué importa |
|---|---|---|
| 1 | **No se puede cancelar dentro de las 5 h.** No es "cancela sin reembolso": el sistema rechaza la operación. | El lugar se queda bloqueado y no puede pasar a quien está en lista de espera. Considera permitir cancelar sin devolución, para al menos liberar el cupo. |
| 2 | **Cero aviso al cancelar.** No hay email ni push de "tu reserva quedó cancelada". | Se queda sin comprobante de que canceló. |
| 3 | **Todos los crons apagados** (`ENABLE_CRON_JOBS=false`). | Sin recordatorios, sin reseñas, sin bonos de lealtad y sin marcado de no-show. Es un interruptor global: al prenderlo se activan todos a la vez, así que conviene revisarlos antes. |
| 4 | **El perfilador nunca se ofrece.** Está completo pero sus puntos de entrada no están montados. | Se construyó y no se está usando. |
| 5 | **Tres ventanas de cancelación distintas en el código:** 5 h (reglamento y backend), 12 h (un diálogo viejo que ya nadie usa) y el valor dinámico. | El diálogo de 12 h es una bomba de tiempo si alguien lo reutiliza. |
| 6 | El saldo de créditos **no se ve al reservar**. | Se entera de que no le alcanza cuando la reserva ya falló. |
| 7 | Una clase llena dice **"Llena"** en escritorio y **"Lista de espera"** en móvil. | Inconsistencia menor de copy. |
| 8 | El push de *clase cancelada* **sí le llega a socias de plataforma**. | Contradice la regla de silenciarlas. |
| 9 | El registro valida y envía **código de referida** pero no hay campo para escribirlo. | La función de referidos no se puede usar al registrarse. |

---

## Referencias en el código

| Pieza | Archivo |
|---|---|
| Pantalla de reservar | `frontend/src/pages/client/BookClasses.tsx`, `components/Schedule.tsx` |
| Detalle / lista de espera | `frontend/src/pages/client/BookClassConfirm.tsx` |
| Mis clases y cancelación | `frontend/src/pages/client/MyBookings.tsx`, `ClassBookingDetail.tsx` |
| QR de check-in | `frontend/src/components/wallet/WalletQr.tsx` |
| Crear reserva | `backend/src/routes/bookings.ts` (`POST /`) |
| Elegir membresía | `backend/src/lib/membershipSelection.ts` |
| Lista de espera | `backend/src/lib/waitlist.ts` |
| Cancelar (función SQL) | `backend/src/index.ts` → `cancel_booking()` / `preview_cancel_booking()` |
| Cancelar clase completa | `backend/src/lib/cancel-class.ts` |
| Check-in | `backend/src/routes/checkin.ts` |
| Puntos | `backend/src/lib/loyalty.ts` → `awardCheckinPoints()` |
| Silenciar plataformas | `backend/src/lib/platformMember.ts` |
| Crons | `backend/src/services/cron-jobs.ts` |
