# Intensidad editable por sesión — diseño aprobado

## Alcance

Mostrar la intensidad de las clases con el emoji 🔥 en inicio (index), app de
clientas y administración. El usuario aprobó el diseño en esta conversación.
No cambiar fechas, horarios, instructores, cupos, precios ni reservas al cargar
las intensidades de las imágenes.

## Modelo y edición

- Un horario recurrente tiene una intensidad predeterminada: 1, 2, 3 o sin asignar.
- Cada sesión conserva su propia intensidad, editable al crear o editar la clase.
- Generar clases toma la intensidad del horario; copiar una semana conserva la
  intensidad de cada sesión origen.
- Cambiar una sesión no modifica otras sesiones. Cambiar un horario afecta solo
  las sesiones que se generen posteriormente; no sobrescribe ediciones existentes.
- Sin asignar se representa con NULL, no con una intensidad inventada.
- La intensidad es independiente del nivel técnico existente (principiante,
  intermedio, avanzado o todos). No convertir automáticamente esos niveles.
- Validar en servidor valores enteros 1–3 o NULL; mantener los permisos actuales
  de creación y edición de clases.

## Presentación

Un componente compartido representa exactamente 1, 2 o 3 emojis, junto al nombre
de la clase. Incluye texto accesible «Intensidad 1 de 3», por ejemplo. No mostrar
fuegos si el dato es NULL. En administración se muestra «Sin intensidad» en el
selector. El mismo dato alimenta tarjetas, listados y detalle de clase en las
tres superficies, incluidas las vistas móviles.

Al guardar, actualizar las consultas de clases para mostrar el cambio sin exigir
recarga manual. Los errores de guardado deben ser visibles y no simular éxito.

## Carga inicial según imágenes del usuario

Coincidir por día, hora, disciplina e instructor; usar la sucursal para distinguir
coincidencias cuando el sistema la proporcione. No actualizar coincidencias
ambiguas ni crear clases que no existan. No sobrescribir una intensidad que ya
haya sido editada. Salsa queda sin intensidad porque las imágenes no la indican.

| Día | Hora | Clase | Instructor | Fuegos |
| --- | --- | --- | --- | --- |
| Lunes | 07:00 | Yoga Dharma | Regina | 2 |
| Lunes | 08:00 | Pilates Mat | Regina | 2 |
| Lunes | 09:00 | Pilates Mat | Regina | 2 |
| Lunes | 18:00 | Barre | Raúl | 3 |
| Lunes | 19:00 | Abs & Butt | Raúl | 3 |
| Lunes | 20:00 | Barre | Raúl | 3 |
| Lunes | 20:00 | Yoga Vinyasa | Sol | 2 |
| Martes | 07:00 | Flow Yoga | Rob | 1 |
| Martes | 07:00 | Pilates Mat | Isaí | 2 |
| Martes | 08:00 | Rocket Yoga | Rob | 3 |
| Martes | 08:00 | Barre | Isaí | 3 |
| Martes | 09:00 | Flex | Rob | 1 |
| Martes | 09:00 | Barre | Isaí | 3 |
| Martes | 10:30 | Sculpt Full Body | Yesz | 2 |
| Martes | 11:30 | Abs & Butt | Yesz | 3 |
| Martes | 18:00 | Pilates Mat | Shelle | 2 |
| Martes | 19:00 | Barre | Shelle | 3 |
| Martes | 19:00 | Yoga Navakarana | Pau | 2 |
| Martes | 20:00 | Barre | Shelle | 2 |
| Miércoles | 07:00 | Pilates Mat | Regina | 2 |
| Miércoles | 08:00 | Dharma | Regina | 2 |
| Miércoles | 09:00 | Pilates Mat | Regina | 3 |
| Miércoles | 17:00 | Sculpt Full Body | Yesz | 2 |
| Miércoles | 18:00 | Sculpt Full Body | Yesz | 3 |
| Miércoles | 19:00 | Sculpt Abs & Butt | Yesz | 3 |
| Miércoles | 19:00 | Power Vinyasa | Ale | 3 |
| Jueves | 07:00 | Power Abs | Raúl | 2 |
| Jueves | 08:00 | Pilates Mat | Raúl | 3 |
| Jueves | 08:00 | Yoga Inicios de Ashtanga | Ale | 2 |
| Jueves | 09:00 | Yoga Power Vinyasa | Ale | 3 |
| Jueves | 18:00 | Pilates Mat | Shelle | 2 |
| Jueves | 19:00 | Power Abs | Shelle | 3 |
| Jueves | 20:00 | Barre | Shelle | 3 |
| Viernes | 07:00 | Morning Flow | Rob | 2 |
| Viernes | 08:00 | Rocket Yoga | Rob | 3 |
| Viernes | 09:00 | Flex and Flow | Rob | 2 |
| Sábado | 08:00 | Pilates Mat | Raúl | 2 |
| Sábado | 09:00 | Barre | Raúl | 3 |
| Sábado | 09:00 | Pilates Mat | Isaí | 3 |
| Sábado | 10:00 | Barre | Isaí | 3 |
| Sábado | 10:00 | Pilates Mat | Raúl | 3 |
| Sábado | 11:00 | Barre | Isaí | 3 |
| Sábado | 12:00 | Yoga Navakarana | Pau | 2 |
| Domingo | 08:00 | Pilates Mat | Isaí | 3 |
| Domingo | 09:00 | Barre | Isaí | 3 |
| Domingo | 10:00 | Barre | Isaí | 3 |
| Domingo | 11:00 | Barre | Isaí | 3 |

## Verificación

Probar persistencia de los cuatro estados, rechazo de valores inválidos y edición
autorizada. Comprobar que editar una sesión no modifica las demás, que generar y
copiar conservan la intensidad esperada y que las tres superficies muestran el
mismo valor. Revisar móvil y accesibilidad. Ejecutar una previsualización de la
carga inicial e informar coincidencias ambiguas sin modificarlas.

## Acuerdo de invitadas: trabajo separado pendiente

El usuario confirmó que en paquetes con créditos cada visita de invitada consume
una clase del saldo de la titular. Para ilimitadas se acordó una visita gratis
mensual y visitas posteriores a $280 MXN. Esa tarifa especial no se aplica a los
otros paquetes. La invitada ocupa un lugar propio en la misma clase de la titular.
La restricción diaria de la titular sigue siendo exclusiva de ilimitadas.

Este documento no implementa el flujo de invitadas ni define reembolsos monetarios
no aprobados. Ese flujo se mantiene como trabajo separado para no mezclar cambios
visuales con reservas, consumo de créditos y cobros.
