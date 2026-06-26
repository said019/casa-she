# Integración de Componentes de Reserva de Invitados

## Resumen

Los archivos de código que proporcionaste contienen componentes para el sistema de reservas públicas y de invitados. Estos componentes **ya están diseñados correctamente** y se integran perfectamente con el backend de pagos en efectivo que acabamos de implementar.

## Componentes Existentes

### 1. PublicScheduleCalendar.tsx
**Ubicación sugerida:** `src/components/calendar/PublicScheduleCalendar.tsx`

**Funcionalidad:**
- Calendario semanal público de clases
- Vista de semana y día
- Opción de reserva directa para miembros
- Botón de reserva como invitado (ícono de rayo ⚡)
- CTA especial para clases individuales ($450)

**Integración con backend:**
- ✅ Usa `GET /api/classes?start={date}&end={date}` que ya existe
- ✅ Compatible con el endpoint de reservas de invitados
- ✅ Muestra capacidad actual vs máxima

### 2. GuestBookingPage.tsx
**Ubicación sugerida:** `src/pages/studio/GuestBookingPage.tsx`

**Funcionalidad:**
- Flujo completo de 4 pasos para reserva de invitados:
  1. Seleccionar clase
  2. Ingresar datos personales
  3. Elegir método de pago
  4. Confirmación con código

**Integración necesaria:**
El componente actualmente usa `/bookings/guest`, pero necesita usar nuestro nuevo endpoint `/bookings/guest-cash`.

**Modificación requerida (línea ~170):**

```typescript
// ANTES (en tu código):
const response = await api.post<GuestBookingResponse>('/bookings/guest', {
  ...data,
  classId: selectedClass?.id,
  studioId: studio.id,
});

// DESPUÉS (usar nuevo endpoint):
const response = await api.post('/bookings/guest-cash', {
  guestName: data.fullName,
  guestEmail: data.email || undefined,
  guestPhone: data.phone,
  classId: selectedClass?.id,
  paymentMethod: data.paymentMethod === 'card' ? 'card' : 'cash',
  amountPaid: dropInPrice, // 450
  notes: data.wantsReminder ? 'Cliente solicitó recordatorio' : undefined,
});
```

### 3. MonthlyScheduler.tsx
**Ubicación sugerida:** `src/components/scheduler/MonthlyScheduler.tsx`

**Funcionalidad:**
- Planificador mensual para clientes con membresía
- Permite agendar clases recurrentes
- Visualización de calendario mensual

**Estado:** El código que compartiste está incompleto, pero la estructura es correcta.

## Archivos de Soporte Existentes

### ✅ `src/types/class.ts`
Ya existe y contiene todos los tipos necesarios:
- `Class` - Clase individual
- `ClassType` - Tipo de clase
- `Instructor` - Instructor
- `Schedule` - Horario recurrente

### ✅ `src/data/studios.ts`
Ya existe con:
- Información del estudio
- Datos bancarios para transferencias
- Horarios de atención
- Configuración de marca

## Rutas Necesarias

Agrega estas rutas a `src/App.tsx`:

```typescript
// Rutas públicas del estudio
<Route path="/:studioSlug/schedule" element={<StudioSchedule />} />
<Route path="/:studioSlug/guest-booking" element={<GuestBookingPage />} />
<Route path="/:studioSlug/guest-booking/:classId" element={<GuestBookingPage />} />

// O sin slug de estudio:
<Route path="/schedule" element={<StudioSchedule />} />
<Route path="/guest-booking" element={<GuestBookingPage />} />
<Route path="/guest-booking/:classId" element={<GuestBookingPage />} />
```

## Página de Horarios del Estudio

Crea `src/pages/studio/StudioSchedule.tsx`:

```typescript
import PublicScheduleCalendar from '@/components/calendar/PublicScheduleCalendar';
import StudioLayout from '@/components/layout/StudioLayout';

export default function StudioSchedule() {
  return (
    <StudioLayout>
      <PublicScheduleCalendar
        showGuestOption={true}
        onSelectClass={(classItem) => {
          // Optional: handle class selection
          window.location.href = `/guest-booking/${classItem.id}`;
        }}
      />
    </StudioLayout>
  );
}
```

## Flujo de Usuario - Reserva de Invitado

### Opción A: Desde el calendario
1. Usuario visita `/schedule`
2. Ve el calendario con todas las clases
3. Hace clic en el botón de rayo (⚡) en una clase
4. Es redirigido a `/guest-booking/{classId}`
5. Completa el formulario de 4 pasos
6. Recibe código de confirmación

### Opción B: Directo
1. Usuario hace clic en "Reservar como invitado" en el CTA
2. Es redirigido a `/guest-booking`
3. Selecciona una clase desde ahí
4. Completa el formulario
5. Recibe código de confirmación

## Backend - Respuesta Esperada

El endpoint `POST /api/bookings/guest-cash` ya retorna:

```typescript
{
  booking: {
    id: string,
    confirmationCode: string,  // Código único de 8 caracteres
    status: string
  },
  guest: {
    name: string,
    phone: string,
    email?: string
  },
  class: {
    id: string,
    name: string,
    date: string,
    start_time: string,
    end_time: string,
    instructor: {
      name: string
    }
  }
}
```

## Métodos de Pago Soportados

1. **Efectivo (cash)**
   - El invitado paga al llegar al estudio
   - Reserva válida por 24 horas

2. **Tarjeta (card)**
   - Terminal física en recepción
   - Pago al llegar

3. **Transferencia** (Solo si lo activas)
   - Requiere configuración adicional
   - Muestra datos bancarios del studio
   - Requiere envío de comprobante

## Configuración Adicional

### Precio de clase individual
Definido en `GuestBookingPage.tsx`:
```typescript
const dropInPrice = 450; // Modificar según tu pricing
```

O mejor aún, tómalo de `src/data/studios.ts`:
```typescript
const studio = getStudioBySlug(studioSlug);
const dropInPrice = studio.pricing?.dropIn || 450;
```

## Testing

### 1. Crear una clase de prueba
```sql
-- En tu base de datos
INSERT INTO classes (
  class_type_id, instructor_id, date, start_time, end_time, max_capacity, status
) VALUES (
  'uuid-class-type', 'uuid-instructor',
  CURRENT_DATE + 1, '10:00:00', '11:00:00', 12, 'scheduled'
);
```

### 2. Probar el flujo
1. Navega a `/schedule`
2. Selecciona la clase
3. Completa el formulario de invitado
4. Verifica que se crea el registro en `guest_bookings`
5. Verifica que se incrementa `current_bookings` en `classes`

## Notificaciones (Opcional)

El campo `wantsReminder` está listo para integrar notificaciones:

```typescript
// En el backend, podrías agregar:
if (data.wantsReminder) {
  // Programar recordatorio por WhatsApp/Email
  await scheduleReminder({
    phone: guestPhone,
    message: `Recordatorio: Tu clase de ${className} es mañana a las ${startTime}`,
    sendAt: classDateTime.minus({ hours: 2 })
  });
}
```

## Resumen de Archivos

**Ya existen y están listos:**
- ✅ `src/types/class.ts`
- ✅ `src/data/studios.ts`
- ✅ Backend endpoints creados
- ✅ Base de datos con tabla `guest_bookings`

**Por agregar:**
- [ ] `src/components/calendar/PublicScheduleCalendar.tsx` (tu código)
- [ ] `src/pages/studio/GuestBookingPage.tsx` (tu código con modificación)
- [ ] `src/pages/studio/StudioSchedule.tsx` (wrapper simple)
- [ ] Rutas en `App.tsx`

## Próximos Pasos

1. **Copia los componentes** que me enviaste a las ubicaciones sugeridas
2. **Modifica el endpoint** en GuestBookingPage según la sección "Integración necesaria"
3. **Agrega las rutas** a App.tsx
4. **Prueba el flujo** completo
5. **Opcionalmente**: Agrega notificaciones por WhatsApp/Email

¡Todo el sistema está listo para funcionar! Solo necesitas copiar tus componentes al proyecto y hacer la pequeña modificación del endpoint.
