# Calendario: clientes, membresías y créditos (15 octubre 2026)

## Alcance aprobado y autorizado para producción

Registrar una persona desde el calendario sin perder la clase seleccionada; asignarle un plan con fecha de pago, inicio y vencimiento independientes; gestionar su saldo con permisos e historial; mostrar asistidas, reservadas y disponibles junto al nombre. La fecha de registro no cambia la fecha real del pago ni reinicia vigencia. Un ajuste de créditos no crea asistencias.

El usuario autorizó implementar, probar y desplegar todo el flujo. La prohibición de desplegar del plan preliminar queda reemplazada por esa autorización explícita. No se modifican horarios, tarifas, reglas de invitadas ni sincronización de plataformas.

## Ejecución

- [x] Backend: resumen agrupado, ajuste transaccional con saldo esperado, fecha de pago persistida y asignación con fechas explícitas.
- [x] Revisión de conformidad y calidad del backend.
- [x] Frontend: registro independiente, gestión en el mismo calendario, asignación con fechas, ajustes y resumen visible.
- [x] Revisión de conformidad y calidad del frontend.
- [x] Pruebas locales de API/SQL, regresiones y navegador en escritorio/móvil.
- [ ] Revisión final, integración a main y despliegue Railway.
- [ ] Verificar servicios y contenido publicado; no crear pagos, membresías ni reservas de prueba en producción.

## Criterios de aceptación

1. Se puede registrar sin comprar un plan; un fallo de reserva posterior conserva al cliente.
2. Las duplicidades llevan al cliente existente sin salir de la agenda.
3. Plan, fecha de pago, inicio y vencimiento son explícitos. No confirmar pagos pendientes automáticamente. Una fecha de pago histórica no se registra como venta del día ni pertenece al turno de caja actual.
4. Dos membresías no se mezclan: identificar la de la reserva y seleccionar explícitamente la que se ajusta.
5. Ajustes con motivo y auditoría atómica, sin negativos, sin conversión de ilimitado, sin sobrescribir una reserva concurrente.
6. Asistidas solo refleja asistencia registrada; reservadas excluye canceladas/espera y requiere clase futura; saldo se lee de la membresía.
7. No atribuir asistencias de invitadas a la titular ni inventar créditos a TotalPass/FitPass.
8. Registrar, asignar, reservar y ajustar actualizan la agenda sin perder semana ni clase.
9. Preservar permisos, restricciones diarias y check-in verificado de TotalPass.

## Base de trabajo

Implementación sobre main `07d2107` en una rama dedicada del checkout existente `/private/tmp/casa-oct14.F4GmSG/repo`. El checkout anterior de iCloud queda intacto porque su operación Git se quedó esperando; no se incluyen sus cambios sin revisar. Ambos builds base pasaron.

## Validación

- 22 pruebas Playwright aprobadas (escritorio y móvil), con API simulada, incluyendo perfiles/check-in, altas, duplicados, asignación, vigencias, créditos, conflicto concurrente y cupo lleno.
- 15 grupos HTTP/SQL reales contra una base local desechable: auditoría atómica, permisos, concurrencia, pago histórico, fechas explícitas, compatibilidad de renovaciones e idempotencia.
- 62 suites generales ejecutadas: 60 pasaron inicialmente; las dos fallidas pasaron al repetir tras corregir el fixture de activación y la comparación enum/text de roles en comisiones. Fixture de nómina alineado con asistencia requerida.
- Builds backend y frontend aprobados. El chequeo TypeScript independiente del frontend conserva cuatro errores previos ajenos a estos cambios; Vite compila correctamente.
- Ninguna prueba creó clientes, pagos, reservas ni membresías en producción. Integraciones externas simuladas en las pruebas.

## Despliegue

Railway sigue main para backend y frontend. La migración aditiva de `paid_at` y la tabla de idempotencia se ejecutan antes de aceptar tráfico. Verificar ambos despliegues SUCCESS, salud API y SHA en sw.js después de integrar. No se requieren cambios de credenciales ni variables.
