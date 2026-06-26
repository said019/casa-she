# Panel de Control — Gestión de Usuarios, Eventos, Paquetes, Pagos y Descuentos

> **Propósito:** Documentación completa de todas las acciones que el administrador puede ejecutar sobre usuarios desde el panel de control. Cubre: lista de clientes, perfil detallado, notas internas, crear usuarios, asignar paquetes, venta en físico, pago en sucursal (CashAssignment), gestión de membresías, eventos, códigos de descuento y eliminación/desactivación de cuentas. Escrita como prompt replicable para IA.

---

## Índice

1. [Arquitectura del Panel Admin](#1-arquitectura-del-panel-admin)
2. [Base de Datos — Tablas Involucradas](#2-base-de-datos--tablas-involucradas)
3. [API Backend — Endpoints de Admin](#3-api-backend--endpoints-de-admin)
4. [Lista de Miembros (ClientsList)](#4-lista-de-miembros-clientslist)
5. [Perfil Detallado de Cliente (ClientDetail)](#5-perfil-detallado-de-cliente-clientdetail)
6. [Crear Nuevo Miembro (MemberNew)](#6-crear-nuevo-miembro-membernew)
7. [Inscripción Manual / Asignar Membresía (AssignMembership)](#7-inscripción-manual--asignar-membresía-assignmembership)
8. [Venta en Físico (PhysicalSale)](#8-venta-en-físico-physicalsale)
9. [Registro de Pagos en Sucursal (CashAssignment)](#9-registro-de-pagos-en-sucursal-cashassignment)
10. [Gestión de Membresías — API Completa](#10-gestión-de-membresías--api-completa)
11. [Gestión de Eventos](#11-gestión-de-eventos)
12. [Códigos de Descuento](#12-códigos-de-descuento)
13. [Diferencias entre Flujos de Asignación](#13-diferencias-entre-flujos-de-asignación)
14. [TypeScript — Interfaces Principales](#14-typescript--interfaces-principales)

---

## 1. Arquitectura del Panel Admin

```
/admin/members              → ClientsList.tsx  (tabla de todos los clientes)
/admin/members/:id          → ClientDetail.tsx  (perfil, notas, historial, membresías)
/admin/members/new          → MemberNew.tsx     (crear cliente nuevo o inscripción manual)
/admin/members/:id/assign-membership  → AssignMembership.tsx (inscripción manual migraciones)
/admin/members/:id/physical-sale      → PhysicalSale.tsx     (venta paquete en físico)
/admin/payments/cash        → CashAssignment.tsx (caja: pago en sucursal / invitado clase)
/admin/payments/pending     → PaymentsPending.tsx (pagos por confirmar)
/admin/events               → EventsManager.tsx  (gestión completa de eventos especiales)
/admin/discount-codes       → DiscountCodes.tsx  (gestión de códigos de descuento)
```

**Roles autorizados:** `admin` (todas las acciones), `instructor` (acceso de solo lectura a clientes y reservaciones)

---

## 2. Base de Datos — Tablas Involucradas

### `users`
```sql
CREATE TABLE users (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email                   VARCHAR(255) UNIQUE NOT NULL,
    password_hash           VARCHAR(255) NOT NULL,
    display_name            VARCHAR(255) NOT NULL,
    phone                   VARCHAR(20),
    role                    VARCHAR(20) DEFAULT 'client',  -- client | admin | instructor
    photo_url               TEXT,
    is_active               BOOLEAN DEFAULT true,          -- false = desactivado por admin
    date_of_birth           DATE,
    emergency_contact_name  VARCHAR(255),
    emergency_contact_phone VARCHAR(20),
    health_notes            TEXT,                          -- condiciones médicas
    accepts_communications  BOOLEAN DEFAULT false,
    receive_reminders       BOOLEAN DEFAULT true,
    receive_promotions      BOOLEAN DEFAULT false,
    receive_weekly_summary  BOOLEAN DEFAULT false,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);
```

### `admin_notes`
```sql
CREATE TABLE admin_notes (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID REFERENCES users(id),
    created_by  UUID REFERENCES users(id),  -- admin que escribió la nota
    note        TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### `memberships`
```sql
CREATE TABLE memberships (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID REFERENCES users(id),
    plan_id             UUID REFERENCES plans(id),
    status              membership_status,  -- active|expired|cancelled|pending_payment|pending_activation|paused
    start_date          DATE,
    end_date            DATE,
    classes_remaining   INTEGER,            -- null = ilimitado
    payment_method      VARCHAR(20),        -- cash|transfer|card|online
    payment_reference   TEXT,
    activated_at        TIMESTAMPTZ,
    activated_by        UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
```

### `plans`
```sql
CREATE TABLE plans (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255) NOT NULL,
    price           NUMERIC(10,2) NOT NULL,
    currency        VARCHAR(3) DEFAULT 'MXN',
    duration_days   INTEGER NOT NULL,
    class_limit     INTEGER,               -- null = ilimitado
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### `payments`
```sql
CREATE TABLE payments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES users(id),
    membership_id   UUID REFERENCES memberships(id),
    amount          NUMERIC(10,2),
    currency        VARCHAR(3) DEFAULT 'MXN',
    payment_method  VARCHAR(20),
    reference       TEXT,
    notes           TEXT,
    status          VARCHAR(20) DEFAULT 'completed',
    processed_by    UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### `events`
```sql
CREATE TABLE events (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type                event_type,           -- masterclass|workshop|retreat|challenge|openhouse|special
    title               VARCHAR(200) NOT NULL,
    description         TEXT,
    instructor_name     VARCHAR(100),
    instructor_photo    TEXT,
    date                DATE NOT NULL,
    start_time          TIME NOT NULL,
    end_time            TIME NOT NULL,
    location            VARCHAR(200),
    capacity            INTEGER NOT NULL,
    registered          INTEGER DEFAULT 0,
    price               NUMERIC(10,2) DEFAULT 0,
    currency            VARCHAR(3) DEFAULT 'MXN',
    early_bird_price    NUMERIC(10,2),
    early_bird_deadline DATE,
    member_discount     NUMERIC(5,2) DEFAULT 0,  -- % de descuento para miembros
    image               TEXT,
    requirements        TEXT DEFAULT '',
    includes            JSONB DEFAULT '[]',       -- array de strings
    tags                JSONB DEFAULT '[]',
    status              VARCHAR(20) DEFAULT 'draft',  -- draft|published|cancelled|completed
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
```

### `event_registrations`
```sql
CREATE TABLE event_registrations (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id                UUID REFERENCES events(id),
    user_id                 UUID REFERENCES users(id),
    name                    VARCHAR(100) NOT NULL,
    email                   VARCHAR(255) NOT NULL,
    phone                   VARCHAR(20),
    status                  VARCHAR(20) DEFAULT 'pending',  -- confirmed|pending|waitlist|cancelled|no_show
    amount                  NUMERIC(10,2) DEFAULT 0,
    payment_method          VARCHAR(20),                    -- card|transfer|cash
    payment_reference       VARCHAR(200),
    payment_proof_url       TEXT,                           -- comprobante base64 o URL
    payment_proof_file_name VARCHAR(255),
    transfer_date           DATE,
    paid_at                 TIMESTAMPTZ,
    checked_in              BOOLEAN DEFAULT false,
    checked_in_at           TIMESTAMPTZ,
    checked_in_by           UUID REFERENCES users(id),
    waitlist_position       INTEGER,
    notes                   TEXT,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);
```

### `discount_codes`
```sql
CREATE TABLE discount_codes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code            VARCHAR(50) UNIQUE NOT NULL,
    description     TEXT DEFAULT '',
    discount_type   VARCHAR(20),         -- percentage | fixed
    discount_value  NUMERIC(10,2) NOT NULL,
    max_uses        INTEGER,             -- null = ilimitado
    current_uses    INTEGER DEFAULT 0,
    valid_from      TIMESTAMPTZ DEFAULT NOW(),
    valid_until     TIMESTAMPTZ,         -- null = sin expiración
    min_purchase    NUMERIC(10,2) DEFAULT 0,
    is_active       BOOLEAN DEFAULT true,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de relación código ↔ planes aplicables
CREATE TABLE discount_code_plans (
    discount_code_id UUID REFERENCES discount_codes(id) ON DELETE CASCADE,
    plan_id          UUID REFERENCES plans(id) ON DELETE CASCADE,
    PRIMARY KEY (discount_code_id, plan_id)
);
```

---

## 3. API Backend — Endpoints de Admin

### 3.1 Usuarios

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `GET` | `/api/users` | Admin | Lista clientes con paginación, búsqueda y membership join |
| `POST` | `/api/users` | Admin | Crear nuevo usuario con rol `client` |
| `GET` | `/api/users/:id` | Auth | Obtener perfil (propio o admin para cualquiera) |
| `PUT` | `/api/users/:id` | Auth | Actualizar perfil. Admin puede cambiar `is_active` |
| `PATCH` | `/api/users/:id/status` | Admin | Cambiar `is_active` true/false |
| `DELETE` | `/api/users/:id` | Admin | Soft delete (desactiva si tiene historial) o Hard delete |

**GET /api/users — Query params:**
```
search=string       → busca en display_name, email, phone (ILIKE %%)
role=client         → filtra por rol (siempre 'client' en el panel)
withMembership=true → incluye LEFT JOIN con última membresía del usuario
limit=10            → resultados por página
offset=0            → offset para paginación
```

**POST /api/users — Body:**
```json
{
    "email": "cliente@email.com",
    "displayName": "María García",
    "phone": "8112345678",
    "password": "opcional1234",         // si vacío → genera contraseña temporal
    "acceptsCommunications": false
}
```

**Response POST:**
```json
{
    "user": { "id": "uuid", "email": "...", "display_name": "...", ... },
    "tempPassword": "Xk3m9pQ"    // solo si no se proporcionó contraseña
}
```

**DELETE /api/users/:id — Lógica:**
- Si tiene reservaciones, membresías o transacciones → **Soft delete** (`is_active = false`)
- Si no tiene historial → **Hard delete** (elimina permanentemente)

### 3.2 Perfil Completo y Notas

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `GET` | `/api/admin/clients/:id/full-profile` | Admin | Perfil completo: notas, membresías, reservaciones recientes, puntos de lealtad, membresía activa |
| `POST` | `/api/admin/clients/:id/notes` | Admin | Agregar nota interna al cliente |
| `GET` | `/api/admin/stats` | Admin | KPIs del dashboard: clases hoy, reservaciones, membresías activas, ingresos hoy |
| `GET` | `/api/admin/notifications` | Admin | Feed de actividad reciente (pagos, membresías, reservaciones últimas 20) |

**GET /api/admin/clients/:id/full-profile — Response:**
```json
{
    "id": "uuid",
    "display_name": "María García",
    "email": "cliente@email.com",
    "phone": "8112345678",
    "photo_url": null,
    "date_of_birth": "1990-05-15",
    "emergency_contact_name": "Pedro García",
    "emergency_contact_phone": "8119876543",
    "health_notes": "Lesión rodilla derecha",
    "created_at": "2024-01-01T...",
    "is_active": true,
    "notes": [
        { "id": "uuid", "note": "Prefiere clase matutina", "author_name": "Admin", "created_at": "..." }
    ],
    "memberships": [
        {
            "id": "uuid",
            "status": "active",
            "plan_name": "Mensual 12 clases",
            "plan_price": 1200,
            "start_date": "2024-01-01",
            "end_date": "2024-01-31",
            "credits_remaining": 8,
            "credits_total": 12
        }
    ],
    "currentMembership": { /* igual que memberships[0] activo */ },
    "recentBookings": [
        { "class_name": "Pilates Mat", "date": "2024-01-15", "start_time": "09:00", "status": "confirmed" }
    ],
    "loyaltyPoints": 150
}
```

---

## 4. Lista de Miembros (ClientsList)

**Ruta:** `/admin/members`
**Archivo:** `src/pages/admin/clients/ClientsList.tsx` (479 líneas)

**Funcionalidad:**
- Tabla con columnas: **Cliente** (avatar + nombre + fecha registro), **Contacto** (email + teléfono), **Plan Actual**, **Estado de membresía**, **Créditos**, **Acciones**
- Usuarios inactivos (`is_active = false`) se muestran con opacidad reducida y badge "Inactivo"
- Búsqueda en tiempo real con debounce 500ms — busca en nombre, email, teléfono
- Paginación: 10 por página con botones Anterior/Siguiente

**Badges de estado de membresía:**
| Status | Label | Color |
|--------|-------|-------|
| `active` | Activo | Verde |
| `expired` | Vencido | Rojo |
| `cancelled` | Cancelado | Gris |
| `pending_payment` | Pago pendiente | Amarillo |
| `pending_activation` | Pendiente | Azul |
| `paused` | Pausado | Naranja |
| *(sin membresía)* | Sin membresía | Outline gris |

**Menú de acciones por fila (DropdownMenu):**
1. **Ver Perfil** → navega a `/admin/members/:id`
2. **Asignar Plan** → abre Dialog inline (ver más abajo)
3. **Eliminar** → confirmación con `confirm()` → `DELETE /api/users/:id`

**Dialog "Asignar Plan" (inline en la lista):**
- Select de plan (de `GET /plans`)
- Select de método de pago: Efectivo / Transferencia / Tarjeta / Pago en línea
- Resumen del plan seleccionado (precio, duración, créditos)
- Botón "Asignar Plan" → `POST /memberships/assign` con `{ userId, planId, status: 'active', paymentMethod }`

**Botón principal:** "Agregar miembro" → navega a `/admin/members/new`

---

## 5. Perfil Detallado de Cliente (ClientDetail)

**Ruta:** `/admin/members/:id`
**Archivo:** `src/pages/admin/clients/ClientDetail.tsx` (499 líneas)

**Datos de la query:** `GET /api/admin/clients/:id/full-profile`

### 5.1 Sidebar (columna izquierda)
- Avatar + nombre + badge de estado de cuenta (Desactivado) + badge de membresía activa
- Plan actual: nombre, fecha de vencimiento, créditos restantes / total (o "Ilimitado")
- Email, teléfono, fecha de nacimiento
- Notas de salud (caja roja si existen)
- Puntos de lealtad (número grande en dorado)
- Contacto de emergencia (si existe)

### 5.2 Botones de acción (header)

| Botón | Acción |
|-------|--------|
| **Inscripción Manual** | → `/admin/members/:id/assign-membership` |
| **Reservar Mes** | Abre `MonthBookingDialog` (reserva múltiples clases del mes) |
| **Venta en Físico** | → `/admin/members/:id/physical-sale` |
| **Desactivar / Activar** | `PATCH /api/users/:id/status` con `{ is_active: true/false }` |
| **Eliminar** | AlertDialog de confirmación → `DELETE /api/users/:id` |

### 5.3 Tabs del área principal

#### Tab "Membresias"
- Lista todos los registros de membresías con: nombre del plan, badge de estado, fechas inicio/fin, créditos, monto
- Muestra "No hay historial" si está vacío

#### Tab "Historial Clases"
- Últimas 5 reservaciones (de `recentBookings`)
- Cada fila: ícono, nombre de clase, fecha + hora, badge de status (Confirmada / Asistió / Cancelada / No asistió)

#### Tab "Notas Internas"
- Formulario para agregar nota (Textarea + botón "Guardar Nota")
- Lista de notas existentes con: nombre del admin autor, fecha, contenido
- `POST /api/admin/clients/:id/notes` con `{ content: "texto" }`

---

## 6. Crear Nuevo Miembro (MemberNew)

**Ruta:** `/admin/members/new`
**Archivo:** `src/pages/admin/members/MemberNew.tsx` (321 líneas)

**Dos modos (RadioGroup):**

### Modo 1: "Cliente Nuevo" (solo crea cuenta)
- Formulario `NewClientForm` con: email, nombre, teléfono, contraseña opcional
- `POST /api/users` → si no hay contraseña, el backend genera una temporal
- Al crear exitosamente, muestra pantalla de confirmación con:
  - Nombre, email, teléfono del cliente
  - Contraseña temporal (si fue generada) en caja monoespaciada
  - Botones: "Ver todos los miembros", "Ver perfil del cliente", "Agregar otro"

### Modo 2: "Inscripción Manual" (cliente + membresía activa)
- Formulario `ManualClientForm` — para clientes que ya pagaron antes del sistema
- Crea cuenta + asigna membresía activa de forma simultánea vía `POST /api/migrations/assign`
- Al completar, muestra `MigrationConfirmation` con todos los detalles

---

## 7. Inscripción Manual / Asignar Membresía (AssignMembership)

**Ruta:** `/admin/members/:userId/assign-membership`
**Archivo:** `src/pages/admin/members/AssignMembership.tsx` (página) + `src/components/admin/members/AssignMembershipForm.tsx` (formulario)

> ⚠️ **Solo para migraciones**: Asigna membresías a clientes que ya pagaron ANTES de implementar el sistema. NO genera orden de venta. Para ventas actuales, usar "Venta en Físico".

**Flujo:**
1. Carga datos del usuario con `GET /api/users/:userId`
2. Muestra alerta explicando que es solo para inscripciones de migración
3. Carga planes de `GET /plans?all=true` (filtra solo planes con precio ≤ $500 = inscripciones)

**Formulario en 4 secciones:**

#### Sección 1: Plan o Paquete
- Select con planes de inscripción disponibles
- Preview del plan seleccionado (precio, duración, clases)

#### Sección 2: Datos del Pago Original
| Campo | Tipo | Descripción |
|-------|------|-------------|
| Fecha de pago | date | Fecha en que el cliente pagó originalmente |
| Monto pagado | number | Puede diferir del precio del plan |
| Método de pago | select | Efectivo / Transferencia / Tarjeta / etc. |
| Referencia/Recibo | text | Número de recibo o folio (opcional) |

#### Sección 3: Vigencia
| Campo | Tipo | Descripción |
|-------|------|-------------|
| Fecha de inicio | date | Inicio de la membresía (default: hoy) |
| Fecha de vencimiento | date | Calculada automáticamente según duración del plan |
| Clases ya usadas | number | Para descontar créditos si ya tomó clases |

#### Sección 4: Notas Adicionales
- Textarea con información extra de la asignación

**Submit:** `POST /api/migrations/assign` con todos los datos
**Resultado:** Pantalla de éxito indicando que la membresía está activa y NO se generó orden de venta

---

## 8. Venta en Físico (PhysicalSale)

**Ruta:** `/admin/members/:userId/physical-sale`
**Archivo:** `src/pages/admin/members/PhysicalSale.tsx` + `src/components/admin/members/PhysicalSaleForm.tsx`

> ✅ **Para ventas actuales**: Registra venta con pago en efectivo/transferencia. SÍ genera orden de venta en reportes.

**Carga:** `GET /api/users/:userId` para obtener nombre del cliente

**Formulario en 2 secciones:**

#### Sección 1: Paquete de Clases
- Select con planes de `GET /plans?all=true` (filtra planes con precio > $500 = paquetes de clases)
- Preview del plan: precio, duración en días, número de clases
- El monto se auto-llena con el precio del plan

#### Sección 2: Detalles del Pago
| Campo | Tipo | Descripción |
|-------|------|-------------|
| Fecha de Pago | date | Default: hoy |
| Monto Pagado | number | Editable (puede ser diferente al precio por descuento manual) |
| Método de Pago | select | Efectivo / Transferencia / Tarjeta / Otro |
| Referencia/Recibo | text | Opcional |
| Notas | textarea | Opcional |

**Submit:** `POST /api/admin/physical-sale` con `{ userId, planId, paymentDate, amount, paymentMethod, reference, notes }`

**Al completar:** mensaje "¡Venta Registrada! Se generó la orden de venta." → navega al perfil del cliente

---

## 9. Registro de Pagos en Sucursal (CashAssignment)

**Ruta:** `/admin/payments/cash`
**Archivo:** `src/pages/admin/payments/CashAssignment.tsx` (1103 líneas)

Este es el **módulo de caja** principal. Maneja dos flujos en un mismo panel con tabs.

### 9.1 Métricas del Dashboard (4 KPIs)
- **Pagos hoy**: suma de `amount` de transacciones del día
- **Transacciones**: count de transacciones del día
- **Membresías**: count de membresías activadas hoy
- **Invitados hoy**: count de invitados registrados hoy

Datos de `GET /api/stats/cash-payments-today`

### 9.2 Tab "Asignar Membresía" (para miembros registrados)

**Búsqueda de cliente:**
- Input de búsqueda con debounce 300ms (mínimo 2 caracteres)
- Dropdown con resultados en tiempo real (`GET /api/users?search=...&role=client&limit=10`)
- Al seleccionar: muestra tarjeta con avatar, nombre, email del cliente
- Botón X para deseleccionar

**Selección de plan:**
- Select con planes activos (`GET /plans?active=true`)
- Al seleccionar: auto-llena `amountPaid` con el precio del plan

**Método de pago (3 opciones con cards visuales):**
| Método | Ícono | Color |
|--------|-------|-------|
| **Efectivo** | Banknote | Verde |
| **Transferencia** | ArrowRightLeft | Azul info |
| **Tarjeta** | CreditCard | Morado |

**Campos adicionales:**
- Fecha de inicio (Calendar picker, default: hoy)
- Monto pagado (editable)
- Referencia (opcional, para transferencias)
- Notas (opcional)

**Submit:** `POST /api/memberships/assign-cash` con `{ userId, planId, paymentMethod, amountPaid, startDate, reference, notes }`

**Dialog de éxito:** muestra datos de la membresía creada + opción de Wallet Pass (si configurado)

### 9.3 Tab "Clase Invitado" (para personas sin cuenta)

Para registrar a una persona que paga por clase individual sin ser miembro ni tener cuenta.

**Campos:**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| Nombre completo | text | Requerido, mínimo 2 caracteres |
| Email | email | Opcional |
| Teléfono | text | Requerido, mínimo 10 dígitos |
| Clase | select | Clases de hoy y mañana con capacidad disponible |
| Método de pago | select | Efectivo / Tarjeta |
| Monto cobrado | number | Default $450 |
| Notas | textarea | Opcional |

**Clases disponibles:** `GET /api/classes?start=hoy&end=mañana&hasCapacity=true`
- Agrupadas por fecha con header "Hoy" / "Mañana"
- Muestra nombre de clase, instructor, hora, capacidad disponible

**Submit:** `POST /api/bookings/guest-cash` con todos los datos del invitado

### 9.4 Sección "Pagos Recientes"
- Lista los últimos 10 pagos en efectivo o transferencia
- `GET /api/memberships?payment_method=cash,transfer&limit=10&sort=-created_at`

---

## 10. Gestión de Membresías — API Completa

**Archivo backend:** `server/src/routes/memberships.ts` (528 líneas)

### Endpoints

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `GET` | `/api/memberships/me` | Client | Membresía activa del usuario actual |
| `GET` | `/api/memberships/my` | Client | Todas las membresías activas/pendientes del usuario |
| `POST` | `/api/memberships` | Client | Solicitar membresía (status: pending_payment) |
| `GET` | `/api/memberships` | Admin | Listar todas las membresías (filtros por status, userId) |
| `GET` | `/api/memberships/pending` | Admin | Membresías pendientes de activación |
| `POST` | `/api/memberships/assign` | Admin | Asignar membresía manualmente |
| `POST` | `/api/memberships/:id/activate` | Admin | Activar membresía pendiente |
| `POST` | `/api/memberships/:id/cancel` | Auth | Cancelar membresía (propio o admin) |
| `PATCH` | `/api/memberships/:id/credits` | Admin | Ajustar créditos restantes |

### POST /api/memberships/assign — Transacción completa
```json
Body:
{
    "userId": "uuid",
    "planId": "uuid",
    "startDate": "2024-01-15",     // opcional, default: hoy
    "status": "active",             // active|pending_payment|pending_activation
    "paymentMethod": "cash",        // cash|transfer|card|online
    "notes": "Pago recibido en efectivo"
}
```

**Transacción SQL:**
```sql
BEGIN;
-- 1. Crear membresía
INSERT INTO memberships (user_id, plan_id, start_date, end_date, status, classes_remaining, payment_method)
VALUES (:userId, :planId, :start, :end, :status, :classLimit, :paymentMethod);

-- 2. Registrar pago (si hay método de pago)
INSERT INTO payments (user_id, membership_id, amount, currency, payment_method, notes, status, processed_by)
VALUES (:userId, :membershipId, :price, :currency, :method, :notes, 'completed', :adminId);
COMMIT;
```

### POST /api/memberships/:id/activate — Activación con extras
Además de activar la membresía y registrar el pago, el endpoint:
1. **Genera Wallet Passes** para Apple Wallet y Google Wallet (si no existen ya)
2. **Aplica bono de bienvenida** de puntos de lealtad (de `system_settings`, clave `loyalty_settings.welcome_bonus`) — solo si es el primer bono del usuario

### PATCH /api/memberships/:id/credits — Ajuste manual de créditos
```json
{ "classes_remaining": 5 }
```
Útil cuando hay error en la cuenta de clases o como cortesía al cliente.

---

## 11. Gestión de Eventos

**Ruta admin:** `/admin/events`
**Archivo backend:** `server/src/routes/events.ts` (686 líneas)

### 11.1 Tipos de evento

| Tipo | Label | Color |
|------|-------|-------|
| `masterclass` | Masterclass | Morado |
| `workshop` | Workshop / Taller | Amarillo |
| `retreat` | Retiro | Verde |
| `challenge` | Challenge / Reto | Rojo |
| `openhouse` | Open House | Azul |
| `special` | Clase Especial | Rosa |

### 11.2 API de Eventos

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `GET` | `/api/events` | Público (optAuth) | Lista eventos publicados, filtrable por tipo y upcoming |
| `GET` | `/api/events/admin/all` | Admin | Todos los eventos (incluyendo drafts) + inscripciones de cada uno |
| `GET` | `/api/events/:id` | Público | Detalle del evento. Si el usuario está autenticado, incluye `myRegistration` |
| `POST` | `/api/events` | Admin | Crear evento |
| `PUT` | `/api/events/:id` | Admin | Actualizar evento (update dinámico) |
| `DELETE` | `/api/events/:id` | Admin | Eliminar evento |
| `GET` | `/api/events/:id/registrations` | Admin | Lista de inscripciones de un evento |
| `PUT` | `/api/events/:eventId/registrations/:regId` | Admin | Cambiar status de inscripción |
| `POST` | `/api/events/:eventId/checkin/:regId` | Admin | Marcar asistencia (check-in) |
| `POST` | `/api/events/:id/register` | Client | Inscribirse al evento |
| `DELETE` | `/api/events/:id/register` | Client | Cancelar inscripción |
| `PUT` | `/api/events/:id/register/payment` | Client | Enviar comprobante de pago |

### 11.3 Crear Evento — Formulario 4 pasos (CreateEventView)

**Archivo:** `src/pages/admin/events/CreateEventView.tsx` (513 líneas)

**Paso 1: Tipo y detalles**
- 6 cards visuales para seleccionar tipo
- Título (mín 3 chars)
- Descripción (mín 10 chars)
- Instructor (select desde `GET /api/instructors`)

**Paso 2: Fecha y lugar**
- Fecha (date input)
- Hora inicio y fin (time inputs, formato HH:MM)
- Ubicación
- Capacidad máxima

**Paso 3: Precios**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| Precio normal | number | 0 = evento gratuito |
| Precio early bird | number | Precio especial antes de la fecha límite |
| Fecha límite early bird | date | Hasta cuándo aplica el early bird |
| Descuento para miembros | number (%) | Porcentaje de descuento si tiene membresía activa |

**Paso 4: Extras y publicar**
- Lista de qué incluye el evento (tags dinámicos)
- Requisitos previos
- Tags/etiquetas del evento
- Switches: Wallet Pass / Lista de espera / Recordatorios automáticos
- Botones: **Guardar borrador** (status='draft') | **Publicar** (status='published')

### 11.4 Detalle del Evento — EventDetailView

Muestra:
- Info completa del evento
- **Tabla de inscritos** con columnas: Nombre, Email, Teléfono, Método de pago, Status, Acciones
- **Status de cada inscripción** (confirmed/pending/waitlist/cancelled/no_show)
- **Botón Check-in** por inscrito → `POST /api/events/:eventId/checkin/:regId`
- **Cambiar status** → `PUT /api/events/:eventId/registrations/:regId`

### 11.5 Lógica de inscripción (cliente)

```
1. Verificar que el evento está publicado
2. Verificar que el cliente no esté ya inscrito
3. Calcular precio:
   a. Si hay early_bird_price Y fecha actual <= early_bird_deadline → usar early bird
   b. Si member_discount > 0 Y cliente tiene membresía activa → aplicar descuento
4. Determinar status:
   - Si evento lleno → status='waitlist', guardar posición en cola
   - Si precio = 0 → status='confirmed', paid_at=NOW()
   - Si precio > 0 → status='pending'
5. Crear/actualizar registro en event_registrations
```

**Payment method para eventos:**
- `cash` → cliente paga en recepción del studio (status queda 'pending', admin confirma manualmente)
- `transfer` → cliente envía comprobante vía `PUT /api/events/:id/register/payment`

---

## 12. Códigos de Descuento

**Ruta admin:** `/admin/discount-codes`
**Archivo frontend:** `src/pages/admin/discount-codes/DiscountCodes.tsx` (483 líneas)
**Archivo backend:** `server/src/routes/discount-codes.ts` (313 líneas)

### 12.1 API

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `GET` | `/api/discount-codes` | Admin | Lista todos los códigos con planes aplicables |
| `POST` | `/api/discount-codes` | Admin | Crear código |
| `PUT` | `/api/discount-codes/:id` | Admin | Actualizar código (update dinámico) |
| `DELETE` | `/api/discount-codes/:id` | Admin | Eliminar código |
| `POST` | `/api/discount-codes/validate` | Auth | Validar código y calcular descuento |

### 12.2 Panel de Descuentos

**Vista de tabla con columnas:**
- **Código** (monoespaciado + botón copiar al portapapeles)
- **Descuento**: `20%` o `$150 MXN`
- **Usos**: `5/10` (actuales / máximo) o `5` si ilimitado
- **Planes**: badges de planes específicos o "Todos"
- **Vigencia**: "Hasta 31/03/2024" o "Sin expiración"
- **Estado**: Switch toggle activo/inactivo
- **Acciones**: Editar (Pencil) / Eliminar (Trash)

### 12.3 Formulario Crear/Editar Código

| Campo | Tipo | Descripción |
|-------|------|-------------|
| Código | text (mayúsculas) | Ej: `BIENVENIDA20`, se convierte a mayúsculas automáticamente |
| Descripción | textarea | Descripción interna |
| Tipo de descuento | select | Porcentaje (%) o Monto fijo (MXN) |
| Valor | number | Si porcentaje: 1-100. Si fijo: monto en MXN |
| Máximo de usos | number | Vacío = ilimitado |
| Compra mínima | number | Precio mínimo para aplicar el código |
| Válido desde | date | Por defecto: hoy |
| Válido hasta | date | Opcional (vacío = sin expiración) |
| Planes aplicables | checkboxes | Lista de todos los planes. Si ninguno seleccionado → aplica a todos |
| Activo | switch | Activar/desactivar sin eliminar |

### 12.4 Validación de Código (endpoint público con auth)

`POST /api/discount-codes/validate`
```json
Body:
{
    "code": "BIENVENIDA20",
    "plan_id": "uuid-del-plan",
    "subtotal": 1200
}
```

**Validaciones en orden:**
1. Código existe y está activo
2. `valid_from` no es futura
3. `valid_until` no ha pasado
4. `current_uses < max_uses` (si max_uses definido)
5. `subtotal >= min_purchase`
6. El plan está en los planes aplicables (si hay restricción)

**Response exitosa:**
```json
{
    "valid": true,
    "code": "BIENVENIDA20",
    "discountType": "percentage",
    "discountValue": 20,
    "discountAmount": 240,
    "originalTotal": 1200,
    "finalTotal": 960,
    "description": "Descuento de bienvenida",
    "codeId": "uuid"
}
```

**Aplicar descuento a orden** (función interna `applyDiscountToOrder`):
- Incrementa `current_uses` en el código
- Actualiza `orders.discount_code_id` y `orders.discount_amount`

---

## 13. Diferencias entre Flujos de Asignación

| Flujo | Ruta | API | Genera Orden | Genera Pago | Caso de uso |
|-------|------|-----|--------------|-------------|-------------|
| **Asignar Plan** (lista) | Dialog en `/admin/members` | `POST /memberships/assign` | No | Sí | Cliente ya registrado, asignación rápida |
| **Inscripción Manual** | `/admin/members/:id/assign-membership` | `POST /migrations/assign` | No | No | Migración de cliente que ya pagó antes del sistema |
| **Venta en Físico** | `/admin/members/:id/physical-sale` | `POST /admin/physical-sale` | **Sí** | Sí | Venta actual con pago en efectivo/transferencia |
| **Caja - Membresía** | `/admin/payments/cash` | `POST /memberships/assign-cash` | Sí | Sí | Punto de venta con búsqueda de cliente |
| **Activar Pendiente** | — | `POST /memberships/:id/activate` | No | Sí | Activar membresía creada por el cliente con pago pendiente |

---

## 14. TypeScript — Interfaces Principales

### UserWithMembership (ClientsList)
```typescript
interface UserWithMembership {
    id: string;
    email: string;
    phone: string;
    display_name: string;
    photo_url: string | null;
    role: string;
    is_active?: boolean;
    created_at: string;
    // Membresía actual (si withMembership=true)
    membership_id?: string;
    membership_status?: 'active' | 'expired' | 'cancelled' | 'pending_payment' | 'pending_activation' | 'paused';
    membership_start_date?: string;
    membership_end_date?: string;
    classes_remaining?: number | null;
    plan_id?: string;
    plan_name?: string;
    class_limit?: number | null;
}
```

### ClientFullProfile (ClientDetail)
```typescript
interface ClientFullProfile {
    id: string;
    display_name: string;
    email: string;
    phone: string;
    photo_url: string | null;
    date_of_birth: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    health_notes: string | null;
    is_active: boolean;
    created_at: string;
    // Datos relacionados
    notes: { id: string; note: string; author_name: string; created_by: string; created_at: string }[];
    memberships: MembershipRecord[];
    currentMembership: MembershipRecord | null;
    recentBookings: BookingRecord[];
    loyaltyPoints: number;
}
```

### StudioEvent (Events)
```typescript
interface StudioEvent {
    id: string;
    title: string;
    description: string;
    type: 'masterclass' | 'workshop' | 'retreat' | 'challenge' | 'openhouse' | 'special';
    instructor: string;
    instructorPhoto?: string | null;
    date: string;          // 'YYYY-MM-DD'
    startTime: string;     // 'HH:MM'
    endTime: string;       // 'HH:MM'
    location: string;
    capacity: number;
    registered: number;
    price: number;
    earlyBirdPrice?: number;
    earlyBirdDeadline?: string;
    memberDiscount: number;
    image?: string | null;
    status: 'published' | 'draft' | 'cancelled' | 'completed';
    tags: string[];
    requirements: string;
    includes: string[];
    registrations: EventRegistration[];
}

interface EventRegistration {
    id: string;
    name: string;
    email: string;
    phone: string;
    status: 'confirmed' | 'pending' | 'waitlist' | 'cancelled' | 'no_show';
    paidAt: string | null;
    amount: number;
    checkedIn?: boolean;
    paymentMethod?: string | null;
    paymentReference?: string | null;
}
```

### DiscountCode
```typescript
interface DiscountCode {
    id: string;
    code: string;
    description: string;
    discountType: 'percentage' | 'fixed';
    discountValue: number;
    maxUses: number | null;
    currentUses: number;
    validFrom: string;
    validUntil: string | null;
    minPurchase: number;
    isActive: boolean;
    applicablePlans: { id: string; name: string }[];
    createdAt: string;
}
```

### CashAssignment Forms (Zod)
```typescript
// Asignar membresía a miembro
const cashAssignmentSchema = z.object({
    userId: z.string().uuid(),
    planId: z.string().uuid(),
    paymentMethod: z.enum(['cash', 'transfer', 'card']),
    amountPaid: z.coerce.number().positive(),
    startDate: z.date(),
    reference: z.string().optional(),
    notes: z.string().optional(),
});

// Clase invitado
const guestClassSchema = z.object({
    guestName: z.string().min(2),
    guestEmail: z.string().email().optional().or(z.literal('')),
    guestPhone: z.string().min(10),
    classId: z.string().uuid(),
    paymentMethod: z.enum(['cash', 'card']),
    amountPaid: z.coerce.number().positive(),
    notes: z.string().optional(),
});
```

---

## Resumen de Archivos del Módulo

| Archivo | Líneas | Propósito |
|---------|--------|-----------|
| `server/src/routes/users.ts` | 372 | CRUD de usuarios, lista, creación, eliminación |
| `server/src/routes/admin.ts` | 274 | Perfil completo, notas internas, stats, notificaciones |
| `server/src/routes/memberships.ts` | 528 | Compra, asignación, activación, créditos de membresías |
| `server/src/routes/events.ts` | 686 | CRUD eventos, inscripciones, check-in, comprobantes |
| `server/src/routes/discount-codes.ts` | 313 | CRUD códigos de descuento, validación |
| `src/pages/admin/clients/ClientsList.tsx` | 479 | Tabla de todos los clientes + asignación rápida |
| `src/pages/admin/clients/ClientDetail.tsx` | 499 | Perfil detallado + acciones (activar/eliminar/notas) |
| `src/pages/admin/members/MemberNew.tsx` | 321 | Crear cliente nuevo o inscripción manual |
| `src/pages/admin/members/AssignMembership.tsx` | ~200 | Página contenedora de AssignMembershipForm |
| `src/components/admin/members/AssignMembershipForm.tsx` | 400 | Formulario inscripción manual (migración) |
| `src/pages/admin/members/PhysicalSale.tsx` | ~200 | Página contenedora de PhysicalSaleForm |
| `src/components/admin/members/PhysicalSaleForm.tsx` | 400 | Formulario venta en físico |
| `src/pages/admin/payments/CashAssignment.tsx` | 1103 | Módulo de caja: miembros + invitados |
| `src/pages/admin/events/EventsManager.tsx` | — | Orquestador principal de vistas de eventos |
| `src/pages/admin/events/CreateEventView.tsx` | 513 | Formulario 4 pasos para crear/editar eventos |
| `src/pages/admin/events/EventDetailView.tsx` | — | Detalle con tabla de inscripciones y check-in |
| `src/pages/admin/events/types.ts` | ~70 | Tipos TypeScript e interfaces de eventos |
| `src/pages/admin/discount-codes/DiscountCodes.tsx` | 483 | CRUD completo de códigos de descuento |

**Total:** ~6,700 líneas del módulo de gestión de usuarios en panel admin.
