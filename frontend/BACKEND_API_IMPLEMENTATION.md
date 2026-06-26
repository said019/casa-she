# 🔌 ENDPOINTS DEL API - SISTEMA DE MIGRACIÓN

## 📋 Endpoints Necesarios en el Backend

Para que el sistema de migración funcione completamente, necesitas implementar estos endpoints en tu API backend (`server/src/`):

---

## 1️⃣ POST `/api/migrations/client`

**Propósito:** Migrar un cliente individual

**Headers:**
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Body:**
```typescript
{
  // Datos personales
  name: string;
  email?: string;
  phone: string;
  birthDate?: string;
  
  // Paquete
  packageId: string;
  
  // Pago original
  originalPaymentDate: string; // ISO date
  originalAmount: number;
  paymentMethod: 'cash' | 'transfer' | 'card' | 'other';
  receiptReference?: string;
  
  // Vigencia
  startDate: string; // ISO date
  endDate: string; // ISO date
  classesAlreadyUsed?: number;
  
  // Notas
  notes?: string;
  
  // Notificaciones
  sendEmail: boolean;
  sendWhatsApp: boolean;
  
  // Admin info (enviado automáticamente)
  adminId: string;
  adminName: string;
}
```

**Response 200:**
```typescript
{
  userId: string;
  packageId: string;
  tempPassword: string;
  success: true;
}
```

**Response 400/500:**
```typescript
{
  success: false;
  error: string;
}
```

**Lógica del Endpoint:**
```typescript
// En server/src/routes/migrations.ts

router.post('/client', requireAuth, requireRole(['owner', 'admin', 'manager']), async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      birthDate,
      packageId,
      originalPaymentDate,
      originalAmount,
      paymentMethod,
      receiptReference,
      startDate,
      endDate,
      classesAlreadyUsed,
      notes,
      sendEmail,
      sendWhatsApp,
      adminId,
      adminName,
    } = req.body;

    // 1. Generar contraseña temporal
    const tempPassword = generateSecurePassword();

    // 2. Crear usuario (si tiene email, también en auth)
    const userId = await createUser({
      displayName: name,
      email,
      phone,
      dateOfBirth: birthDate,
      source: 'migration', // ← CLAVE
      migrationNotes: notes,
      createdBy: adminId,
    }, tempPassword);

    // 3. Crear membresía/paquete
    const packageId = await createUserPackage({
      userId,
      planId: packageId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      status: 'active',
      classesUsed: classesAlreadyUsed || 0,
      origin: 'migration', // ← CLAVE - NO ES VENTA
      migrationData: {
        originalPaymentDate: new Date(originalPaymentDate),
        originalAmount,
        paymentMethod,
        receiptReference,
        migratedBy: adminId,
        migratedAt: new Date(),
        notes,
      },
    });

    // 4. NO CREAR ORDER - Las migraciones no generan órdenes

    // 5. Registrar acción administrativa
    await logAdminAction({
      adminId,
      action: 'migrate_client',
      targetUserId: userId,
      details: {
        clientName: name,
        originalAmount,
      },
    });

    // 6. Enviar notificaciones
    if (sendEmail && email) {
      await sendWelcomeEmail(email, name, tempPassword);
    }
    if (sendWhatsApp && phone) {
      await sendWhatsAppWelcome(phone, name, tempPassword);
    }

    res.json({
      userId,
      packageId,
      tempPassword,
      success: true,
    });
  } catch (error) {
    console.error('Error al migrar cliente:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al migrar cliente',
    });
  }
});
```

---

## 2️⃣ GET `/api/migrations/history`

**Propósito:** Obtener historial de migraciones

**Headers:**
```
Authorization: Bearer {token}
```

**Query Params:**
```
?limit=50  (opcional, default: 50)
```

**Response 200:**
```typescript
[
  {
    id: string;
    userId: string;
    userName: string;
    userEmail: string | null;
    userPhone: string;
    packageName: string;
    originalAmount: number;
    originalPaymentDate: string; // ISO date
    migratedBy: string;
    migratedByName: string;
    migratedAt: string; // ISO date
    notes: string;
  }
]
```

**Lógica del Endpoint:**
```typescript
router.get('/history', requireAuth, requireRole(['owner', 'admin', 'manager']), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;

    // Query a la base de datos
    const migrations = await db.query(`
      SELECT 
        up.id,
        up.user_id as userId,
        u.display_name as userName,
        u.email as userEmail,
        u.phone as userPhone,
        p.name as packageName,
        up.migration_data->>'originalAmount' as originalAmount,
        up.migration_data->>'originalPaymentDate' as originalPaymentDate,
        up.migration_data->>'migratedBy' as migratedBy,
        admin.display_name as migratedByName,
        up.migration_data->>'migratedAt' as migratedAt,
        up.migration_data->>'notes' as notes
      FROM user_packages up
      JOIN users u ON up.user_id = u.id
      JOIN plans p ON up.plan_id = p.id
      JOIN users admin ON (up.migration_data->>'migratedBy')::int = admin.id
      WHERE up.origin = 'migration'
      ORDER BY (up.migration_data->>'migratedAt')::timestamp DESC
      LIMIT $1
    `, [limit]);

    res.json(migrations.rows);
  } catch (error) {
    console.error('Error al obtener historial:', error);
    res.status(500).json({
      error: 'Error al obtener historial',
    });
  }
});
```

---

## 3️⃣ GET `/api/migrations/stats`

**Propósito:** Obtener estadísticas de membresías por origen

**Headers:**
```
Authorization: Bearer {token}
```

**Response 200:**
```typescript
{
  totalActivas: number;
  porVenta: number;
  porMigracion: number;
  porPromo: number;
  porGift: number;
}
```

**Lógica del Endpoint:**
```typescript
router.get('/stats', requireAuth, requireRole(['owner', 'admin', 'manager']), async (req, res) => {
  try {
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_activas,
        COUNT(*) FILTER (WHERE origin = 'purchase') as por_venta,
        COUNT(*) FILTER (WHERE origin = 'migration') as por_migracion,
        COUNT(*) FILTER (WHERE origin = 'promo') as por_promo,
        COUNT(*) FILTER (WHERE origin = 'gift') as por_gift
      FROM user_packages
      WHERE status = 'active'
        AND end_date >= NOW()
    `);

    res.json({
      totalActivas: parseInt(stats.rows[0].total_activas),
      porVenta: parseInt(stats.rows[0].por_venta),
      porMigracion: parseInt(stats.rows[0].por_migracion),
      porPromo: parseInt(stats.rows[0].por_promo),
      porGift: parseInt(stats.rows[0].por_gift),
    });
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({
      error: 'Error al obtener estadísticas',
    });
  }
});
```

---

## 4️⃣ GET `/api/migrations/plans`

**Propósito:** Obtener lista de planes/paquetes disponibles para migración

**Headers:**
```
Authorization: Bearer {token}
```

**Response 200:**
```typescript
[
  {
    id: string;
    name: string;
    type: 'membership' | 'package' | 'single';
    classes: number; // -1 = ilimitado
    price: number;
    duration: number; // días
    description?: string;
    active: boolean;
  }
]
```

**Lógica del Endpoint:**
```typescript
router.get('/plans', requireAuth, requireRole(['owner', 'admin', 'manager']), async (req, res) => {
  try {
    const plans = await db.query(`
      SELECT 
        id,
        name,
        type,
        classes,
        price,
        duration_days as duration,
        description,
        active
      FROM plans
      WHERE active = true
      ORDER BY price ASC
    `);

    res.json(plans.rows);
  } catch (error) {
    console.error('Error al obtener planes:', error);
    res.status(500).json({
      error: 'Error al obtener planes',
    });
  }
});
```

---

## 🗄️ Cambios en la Base de Datos

### 1. Tabla `users`
```sql
-- Agregar columnas para migración
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'organic',
ADD COLUMN IF NOT EXISTS migration_notes TEXT;

-- source puede ser: 'organic' o 'migration'
```

### 2. Tabla `user_packages` (o `memberships`)
```sql
-- Agregar columnas para migración
ALTER TABLE user_packages 
ADD COLUMN IF NOT EXISTS origin VARCHAR(20) DEFAULT 'purchase',
ADD COLUMN IF NOT EXISTS migration_data JSONB;

-- origin puede ser: 'purchase', 'migration', 'gift', 'promo'

-- Estructura del migration_data JSON:
{
  "originalPaymentDate": "2025-11-15T00:00:00.000Z",
  "originalAmount": 500,
  "paymentMethod": "cash",
  "receiptReference": "REC-2025-0123",
  "migratedBy": "admin_user_id",
  "migratedAt": "2026-02-01T10:30:00.000Z",
  "notes": "Cliente desde 2024..."
}
```

### 3. Tabla `admin_actions` (si no existe)
```sql
CREATE TABLE IF NOT EXISTS admin_actions (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER REFERENCES users(id),
  action VARCHAR(50) NOT NULL,
  target_user_id INTEGER REFERENCES users(id),
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_admin_actions_admin ON admin_actions(admin_id);
CREATE INDEX idx_admin_actions_action ON admin_actions(action);
CREATE INDEX idx_admin_actions_created_at ON admin_actions(created_at DESC);
```

### 4. Índices para mejorar performance
```sql
-- Índice para filtrar por origen
CREATE INDEX IF NOT EXISTS idx_user_packages_origin 
ON user_packages(origin);

-- Índice compuesto para queries de reportes
CREATE INDEX IF NOT EXISTS idx_user_packages_origin_status_end_date 
ON user_packages(origin, status, end_date DESC);

-- Índice para migration_data (si usas PostgreSQL)
CREATE INDEX IF NOT EXISTS idx_user_packages_migration_data 
ON user_packages USING GIN (migration_data);
```

---

## 🔐 Middleware de Autenticación

Asegúrate de tener estos middlewares en tu backend:

```typescript
// server/src/middleware/auth.ts

export const requireAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};

export const requireRole = (allowedRoles: string[]) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Permisos insuficientes' });
    }
    next();
  };
};
```

---

## 📝 Ejemplo de Archivo de Rutas Completo

```typescript
// server/src/routes/migrations.ts

import express from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { migrateClient, getMigrationHistory, getStats, getPlans } from '../controllers/migrations';

const router = express.Router();

// Todas las rutas requieren autenticación y rol específico
const migrationRole = requireRole(['owner', 'admin', 'manager']);

// Migrar cliente individual
router.post('/client', requireAuth, migrationRole, migrateClient);

// Obtener historial
router.get('/history', requireAuth, migrationRole, getMigrationHistory);

// Obtener estadísticas
router.get('/stats', requireAuth, migrationRole, getStats);

// Obtener planes disponibles
router.get('/plans', requireAuth, migrationRole, getPlans);

export default router;
```

---

## ✅ Checklist de Implementación Backend

- [ ] Crear archivo `/server/src/routes/migrations.ts`
- [ ] Implementar endpoint POST `/client`
- [ ] Implementar endpoint GET `/history`
- [ ] Implementar endpoint GET `/stats`
- [ ] Implementar endpoint GET `/plans`
- [ ] Agregar campos `source` y `migration_notes` a tabla `users`
- [ ] Agregar campos `origin` y `migration_data` a tabla `user_packages`
- [ ] Crear tabla `admin_actions` (si no existe)
- [ ] Crear índices necesarios
- [ ] Registrar rutas en `server/src/index.ts`:
  ```typescript
  import migrationsRoutes from './routes/migrations';
  app.use('/api/migrations', migrationsRoutes);
  ```
- [ ] Testing de endpoints con Postman/Insomnia
- [ ] Verificar que migraciones NO crean orders

---

## 🧪 Testing de Endpoints

### 1. Test de migración
```bash
curl -X POST http://localhost:3001/api/migrations/client \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Cliente Prueba",
    "email": "prueba@test.com",
    "phone": "442-000-0000",
    "packageId": "package_id_here",
    "originalPaymentDate": "2025-11-15T00:00:00.000Z",
    "originalAmount": 500,
    "paymentMethod": "cash",
    "startDate": "2025-11-15T00:00:00.000Z",
    "endDate": "2026-11-15T00:00:00.000Z",
    "classesAlreadyUsed": 0,
    "sendEmail": true,
    "sendWhatsApp": false,
    "adminId": "your_admin_id",
    "adminName": "Admin Name"
  }'
```

### 2. Test de historial
```bash
curl -X GET http://localhost:3001/api/migrations/history \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. Test de stats
```bash
curl -X GET http://localhost:3001/api/migrations/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 📞 Soporte

Si tienes dudas sobre la implementación de estos endpoints, consulta:
- Código existente en `server/src/routes/`
- Estructura de tu base de datos
- Middleware de autenticación actual
