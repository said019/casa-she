# 🗄️ ESQUEMA DE BASE DE DATOS - SISTEMA DE MIGRACIÓN

## Colecciones Principales

### 📁 `users`
Almacena todos los usuarios del sistema (clientes, admins, instructores)

```javascript
{
  id: string,                    // ID único del documento
  authUid: string | null,        // UID de Firebase Auth (null si no tiene email)
  name: string,                  // Nombre completo
  email: string | null,          // Email (opcional)
  phone: string,                 // Teléfono (requerido)
  birthDate: string | null,      // Fecha de nacimiento
  role: string,                  // 'client' | 'admin' | 'instructor' | 'owner'
  active: boolean,               // Estado de la cuenta
  createdAt: Timestamp,          // Fecha de creación
  createdBy: string,             // ID del admin que lo creó
  
  // ⭐ CAMPOS PARA MIGRACIÓN
  source: 'organic' | 'migration',  // Origen del usuario
  migrationNotes: string | null,    // Notas del proceso de migración
}
```

**Índices necesarios:**
- `source` (para filtrar migraciones)
- `email` (para búsquedas)
- `createdAt` (para ordenar)

---

### 📁 `user_packages`
Membresías y paquetes asignados a usuarios

```javascript
{
  id: string,                    // ID único del documento
  userId: string,                // Referencia a users
  packageId: string,             // Referencia a packages
  packageName: string,           // Nombre del paquete (desnormalizado)
  packageType: string,           // 'membership' | 'package' | 'single'
  
  // Fechas
  startDate: Timestamp,          // Fecha real de inicio (puede ser pasada)
  endDate: Timestamp,            // Fecha de vencimiento
  activatedAt: Timestamp,        // Cuándo se activó en el sistema
  
  // Estado y clases
  status: 'active' | 'expired' | 'cancelled',
  classesTotal: number,          // Total de clases (-1 = ilimitado)
  classesUsed: number,           // Clases ya consumidas
  classesRemaining: number,      // Calculado: total - used
  
  // ⭐ ORIGEN - CLAVE PARA REPORTES
  origin: 'purchase' | 'migration' | 'gift' | 'promo',
  
  // ⭐ DATOS DE MIGRACIÓN (solo si origin === 'migration')
  migrationData: {
    originalPaymentDate: Timestamp,  // Cuándo pagó realmente
    originalAmount: number,          // Cuánto pagó
    paymentMethod: string,           // 'cash' | 'transfer' | 'card' | 'other'
    receiptReference: string | null, // Número de recibo si existe
    migratedBy: string,              // ID del admin que migró
    migratedAt: Timestamp,           // Cuándo se migró al sistema
    notes: string,                   // Contexto adicional
  } | null
}
```

**Índices necesarios:**
- `userId` (para buscar paquetes de un usuario)
- `status` (para filtrar activos)
- `origin` (para separar ventas de migraciones)
- `endDate` (para vencimientos)
- Compuesto: `origin + status + endDate` (para reportes)

---

### 📁 `orders`
Órdenes de compra (SOLO ventas reales)

```javascript
{
  id: string,                    // ID único del documento
  userId: string,                // Referencia a users
  userName: string,              // Nombre del cliente (desnormalizado)
  
  items: [                       // Productos/paquetes comprados
    {
      packageId: string,
      packageName: string,
      packageType: string,       // 'membership' | 'package' | 'single'
      quantity: number,
      price: number,
    }
  ],
  
  total: number,                 // Total de la orden
  status: 'pending' | 'paid' | 'cancelled',
  paymentMethod: string,         // Método de pago usado
  createdAt: Timestamp,          // Fecha de la orden
  paidAt: Timestamp | null,      // Fecha de pago confirmado
}
```

**⚠️ IMPORTANTE:** 
- Las migraciones **NO** crean orders
- Los reportes de ventas solo cuentan documents en esta colección
- Automáticamente excluye migraciones

**Índices necesarios:**
- `userId` (para historial del cliente)
- `status` (para filtrar pagadas)
- `createdAt` (para reportes por fecha)
- Compuesto: `status + createdAt` (para reportes de ventas)

---

### 📁 `admin_actions`
Auditoría de acciones administrativas

```javascript
{
  id: string,                    // ID único del documento
  adminId: string,               // ID del admin que realizó la acción
  adminName: string,             // Nombre del admin (desnormalizado)
  action: string,                // Tipo de acción realizada
  targetUserId: string,          // Usuario afectado
  
  details: {                     // Detalles específicos de la acción
    clientName: string,
    packageName: string,
    originalAmount: number,
    // ... otros campos según la acción
  },
  
  timestamp: Timestamp,          // Cuándo se realizó
}
```

**Tipos de acción:**
- `migrate_client` - Migración de cliente
- `activate_package` - Activación de paquete
- `cancel_package` - Cancelación de paquete
- `edit_user` - Edición de usuario

**Índices necesarios:**
- `adminId` (para auditar por admin)
- `action` (para filtrar por tipo)
- `timestamp` (para orden cronológico)

---

### 📁 `packages`
Catálogo de paquetes y membresías disponibles

```javascript
{
  id: string,                    // ID único del documento
  name: string,                  // Nombre del paquete
  type: 'membership' | 'package' | 'single',
  classes: number,               // Número de clases (-1 = ilimitado)
  price: number,                 // Precio
  duration: number,              // Duración en días
  description: string,           // Descripción
  active: boolean,               // Si está disponible para compra
  createdAt: Timestamp,
  updatedAt: Timestamp,
}
```

---

## 🔍 Queries Importantes

### Obtener ventas REALES (excluye migraciones)
```javascript
db.collection('orders')
  .where('status', '==', 'paid')
  .where('createdAt', '>=', startDate)
  .where('createdAt', '<=', endDate)
  .get()
```

### Obtener membresías activas (incluye todas)
```javascript
db.collection('user_packages')
  .where('status', '==', 'active')
  .where('endDate', '>=', now)
  .get()
```

### Filtrar solo migraciones
```javascript
db.collection('user_packages')
  .where('origin', '==', 'migration')
  .where('status', '==', 'active')
  .get()
```

### Filtrar solo ventas reales
```javascript
db.collection('user_packages')
  .where('origin', '==', 'purchase')
  .where('status', '==', 'active')
  .get()
```

### Historial de migraciones
```javascript
db.collection('user_packages')
  .where('origin', '==', 'migration')
  .orderBy('migrationData.migratedAt', 'desc')
  .limit(50)
  .get()
```

---

## 🔐 Reglas de Seguridad (Firestore)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Usuarios
    match /users/{userId} {
      // Leer: el propio usuario o admins
      allow read: if request.auth != null && 
        (request.auth.uid == resource.data.authUid || isAdmin());
      
      // Crear/Actualizar: solo admins
      allow create, update: if isAdmin();
      
      // Eliminar: solo owners
      allow delete: if isOwner();
    }
    
    // Paquetes de usuarios
    match /user_packages/{packageId} {
      // Leer: el propio usuario o admins
      allow read: if request.auth != null && 
        (resource.data.userId == getUserId() || isAdmin());
      
      // Crear/Actualizar/Eliminar: solo admins
      allow write: if isAdmin();
    }
    
    // Órdenes
    match /orders/{orderId} {
      // Leer: el propio usuario o admins
      allow read: if request.auth != null && 
        (resource.data.userId == getUserId() || isAdmin());
      
      // Crear: usuario autenticado
      allow create: if request.auth != null;
      
      // Actualizar: solo admins (para confirmar pagos)
      allow update: if isAdmin();
    }
    
    // Acciones administrativas
    match /admin_actions/{actionId} {
      // Leer: solo admins
      allow read: if isAdmin();
      
      // Crear: solo admins
      allow create: if isAdmin();
      
      // No se pueden actualizar ni eliminar
      allow update, delete: if false;
    }
    
    // Catálogo de paquetes
    match /packages/{packageId} {
      // Leer: todos
      allow read: if true;
      
      // Escribir: solo admins
      allow write: if isAdmin();
    }
    
    // Funciones auxiliares
    function isAdmin() {
      return request.auth != null && 
        exists(/databases/$(database)/documents/users/$(getUserId())) &&
        get(/databases/$(database)/documents/users/$(getUserId())).data.role in ['admin', 'owner', 'manager'];
    }
    
    function isOwner() {
      return request.auth != null && 
        exists(/databases/$(database)/documents/users/$(getUserId())) &&
        get(/databases/$(database)/documents/users/$(getUserId())).data.role == 'owner';
    }
    
    function getUserId() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).id;
    }
  }
}
```

---

## 📊 Diferencias Clave: Venta vs Migración

### VENTA NORMAL
```
1. Cliente compra → Crea Order (status: 'pending')
2. Admin valida pago → Actualiza Order (status: 'paid')
3. Sistema crea UserPackage (origin: 'purchase')
4. ✅ Suma a reportes de ventas
5. ✅ Aparece en transacciones
```

### MIGRACIÓN
```
1. Admin registra cliente → Crea User (source: 'migration')
2. Crea UserPackage (origin: 'migration')
3. ❌ NO crea Order
4. ❌ NO suma a reportes de ventas
5. ✅ Aparece en historial de migraciones
6. ✅ Cliente tiene acceso completo
```

---

## 🎯 Ventajas del Diseño

1. **Reportes limpios**: Las ventas solo cuentan orders, que las migraciones no tienen
2. **Auditoría completa**: Todas las migraciones quedan registradas con contexto
3. **Reversible**: Se puede desactivar una migración si hay error
4. **Escalable**: El mismo sistema sirve para promociones y regalos
5. **Transparente**: El cliente migrado no nota diferencia en funcionalidad
6. **Flexible**: Se puede agregar más metadata sin afectar otras colecciones
