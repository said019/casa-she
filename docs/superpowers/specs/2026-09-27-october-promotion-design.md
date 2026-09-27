# Octubre: horario e invitadas

El usuario aprobó «aplícalo» el 27 de septiembre. Se incluyen membresías existentes y nuevas; clases del 28/09/2026 al 31/10/2026, zona America/Mexico_City. Son dos entregas independientes.

## Promoción
- Paquete 8 (multi_credits=8, duración 30): una cortesía por membresía durante la campaña.
- Mensuales ilimitadas de 30 días (360 y Black, multi_credits=NULL): dos cortesías juntas en una sola clase durante la campaña. Sustituye la visita mensual ordinaria durante estas fechas, no se suma una tercera.
- Reserva titular confirmada y membresía vigente para clase; misma sede y categoría. Cortesías no requieren créditos restantes; titular ya pagó su propia reserva.
- Formulario registra ambas invitadas en una transacción. Sin cupo para ambas, no registra ninguna. Teléfonos distintos, nadie igual a titular ni previamente reservada en clase.
- Cuota por membresía/campaña (no por clic ni por mes calendario); las dos visitas se ligan al mismo host_booking_id. Cancelación oportuna libera el cupón correspondiente: se puede sustituir en esa misma clase; si todos se liberan puede elegirse otra clase. Cancelación tardía no reintegra cortesía.
- Al agotar promoción: paquetes vuelven a descontar crédito y mensuales cobran $280; fuera de campaña se restaura política normal. Pagos pendientes previos siguen validados como pagos, nunca se convierten en cortesía por callback.
- Usa infraestructura de invitadas existente. Añade modo promo_free, clave de campaña, número de cupón (1/2) y request batch para idempotencia. Índice único parcial evita doble gasto. Bloqueo clase→reserva→membresía serializa competencia.
- La pantalla existente muestra beneficio/fecha y campos para 1 o 2; no crea membresías adicionales.

## Horario
Transcribir imagen por día de semana, manteniendo horas impresas 10:30/11:30 de martes y 19:30/20:30 de salsa. Añadir Navakarana con Pau martes19:00 intensidad2. Aplicar solo 28/09–31/10. Mantener duración/cupos existentes por disciplina y los IDs de clases equivalentes. No borrar reservas ni deshacer cancelaciones deliberadas sin analizar diferencias. Si una clase que debe retirarse tiene reservas, detener esa operación para resolverlo.
Román no existe: crear perfil de agenda con usuario sin acceso activo, sin credenciales compartidas ni tarifa de nómina inventada. Mantener otras cuentas intactas.
Vista previa de diferencias, transacción acotada, historial de cancelación y encolado TotalPass de cambios. Verificar resultado por API pública y por filas de BD. No cambiar semanas fuera de rango.

## Validación
Pruebas PostgreSQL aisladas de cuota, concurrencia, fechas, una ocasión, cancelación y todo-o-nada. Pruebas navegador del formulario doble y modo normal. Compilar ambos servicios, revisión de especificación y calidad antes de publicar. Nunca pruebas con cobros o reservas reales.
