# Catarsis Studio - Base de Datos PostgreSQL

## Estructura de la Base de Datos

### Tablas Principales

| Tabla | Descripción |
|-------|-------------|
| `users` | Usuarios del sistema (clientes, instructores, admins) |
| `plans` | Planes de membresía disponibles |
| `memberships` | Membresías de clientes con su estado y clases restantes |
| `class_types` | Tipos de clases (Barre Studio, Pilates Mat, Yoga Sculpt) |
| `instructors` | Instructores con su perfil y especialidades |
| `schedules` | Horarios recurrentes de clases |
| `classes` | Instancias de clases programadas |
| `bookings` | Reservaciones de clientes a clases |
| `loyalty_points` | Puntos del programa WalletClub |
| `rewards` | Catálogo de recompensas canjeables |
| `redemptions` | Canjes de recompensas |
| `notifications` | Notificaciones a usuarios |
| `wallet_passes` | Pases de Apple/Google Wallet |
| `payments` | Registro de pagos |
| `system_settings` | Configuración del sistema |
| `admin_notes` | Notas internas sobre clientes |

### Vistas Útiles

| Vista | Descripción |
|-------|-------------|
| `active_memberships_view` | Membresías activas con info del usuario y plan |
| `upcoming_classes_view` | Próximas clases con detalles completos |
| `user_bookings_view` | Reservaciones de usuarios con detalles de clase |

### Tipos ENUM

- `user_role`: client, instructor, admin
- `membership_status`: pending_payment, pending_activation, active, expired, paused, cancelled
- `payment_method`: cash, transfer, card, online
- `class_level`: beginner, intermediate, advanced, all
- `class_status`: scheduled, in_progress, completed, cancelled
- `booking_status`: confirmed, waitlist, checked_in, no_show, cancelled
- `loyalty_points_type`: class_attended, referral, bonus, redemption
- `reward_category`: merchandise, class, discount, experience
- `redemption_status`: pending, fulfilled, cancelled
- `notification_type`: booking_reminder, class_cancelled, membership_expiring, points_earned, promotion
- `wallet_platform`: apple, google

## Comandos Útiles

### Conectar a la base de datos
```bash
psql -d forma_pilates
```

### Ver todas las tablas
```bash
psql -d forma_pilates -c "\dt"
```

### Ver estructura de una tabla
```bash
psql -d forma_pilates -c "\d+ users"
```

### Ejecutar el esquema (primera vez o reset)
```bash
# Crear la base de datos
createdb forma_pilates

# Ejecutar el esquema
psql -d forma_pilates -f database/schema.sql
```

### Resetear la base de datos
```bash
dropdb forma_pilates
createdb forma_pilates
psql -d forma_pilates -f database/schema.sql
```

## Datos Iniciales

El esquema incluye datos iniciales para:

### Planes de Membresía
- **Drop-in**: $350 MXN, 1 clase, 30 días
- **Pack 5**: $1,500 MXN, 5 clases, 45 días
- **Pack 10**: $2,700 MXN, 10 clases, 60 días
- **Ilimitado Mensual**: $3,500 MXN, clases ilimitadas, 30 días

### Tipos de Clase
- Barre Studio (todos los niveles)
- Pilates Mat (todos los niveles)
- Yoga Sculpt (intermedio)

### Configuración del Sistema
- Información del estudio
- Políticas de reservación
- Configuración de lealtad
- Configuración de notificaciones

## Triggers Automáticos

1. **update_updated_at_column**: Actualiza automáticamente el campo `updated_at` en todas las tablas relevantes
2. **update_class_booking_count**: Mantiene actualizado el contador `current_bookings` en la tabla `classes`
3. **decrement_membership_classes**: Decrementa las clases restantes cuando un cliente hace check-in

## Funciones Útiles

### Obtener puntos totales de un usuario
```sql
SELECT get_user_points('user-uuid-here');
```

## Conexión desde la Aplicación

### Node.js con pg
```javascript
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
```

### Con Drizzle ORM (recomendado)
```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool);
```

### Con Prisma
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```
