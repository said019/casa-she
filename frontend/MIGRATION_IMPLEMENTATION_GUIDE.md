# 📖 GUÍA DE IMPLEMENTACIÓN - SISTEMA DE MIGRACIÓN

## 🎯 Resumen Ejecutivo

Este sistema permite registrar clientes que ya pagaron membresías ANTES de implementar la plataforma digital, sin generar registros de venta ficticios que inflaran los reportes financieros.

---

## 🚀 Checklist de Implementación

### Fase 1: Preparación de Base de Datos ✅

#### 1.1. Actualizar colección `users`
```javascript
// Agregar campos a documentos existentes o nuevos
{
  source: 'organic' | 'migration',  // NUEVO
  migrationNotes: string | null,    // NUEVO
}
```

#### 1.2. Actualizar colección `user_packages`
```javascript
// Agregar campos
{
  origin: 'purchase' | 'migration' | 'gift' | 'promo',  // NUEVO
  migrationData: {                                       // NUEVO
    originalPaymentDate: Timestamp,
    originalAmount: number,
    paymentMethod: string,
    receiptReference: string | null,
    migratedBy: string,
    migratedAt: Timestamp,
    notes: string,
  } | null
}
```

#### 1.3. Crear índices en Firestore
```bash
# En Firebase Console > Firestore > Indexes

# Índice compuesto para reportes
Collection: user_packages
Fields:
  - origin (Ascending)
  - status (Ascending)
  - endDate (Descending)

# Índice para historial de migraciones
Collection: user_packages
Fields:
  - origin (Ascending)
  - migrationData.migratedAt (Descending)
```

---

### Fase 2: Integración en la Aplicación ✅

#### 2.1. Archivos creados
```
src/
├── types/
│   └── migration.types.ts          ✅ Interfaces y tipos
│
├── services/
│   ├── migrationService.ts         ✅ Lógica de migración
│   └── reportsService.ts           ✅ Reportes (excluye migraciones)
│
├── hooks/
│   └── useMigrateClient.ts         ✅ Hook para UI
│
├── components/admin/
│   ├── migration/
│   │   ├── ManualClientForm.tsx         ✅ Formulario principal
│   │   ├── MigrationConfirmation.tsx    ✅ Pantalla de éxito
│   │   └── MigrationHistory.tsx         ✅ Historial
│   │
│   └── dashboard/
│       └── MembershipStatsWidget.tsx    ✅ Widget de stats
│
└── pages/admin/
    └── ClientMigrationPage.tsx     ✅ Página principal
```

#### 2.2. Agregar ruta en el router
```typescript
// src/App.tsx o tu archivo de rutas
import { ClientMigrationPage } from '@/pages/admin/ClientMigrationPage';

// Dentro de las rutas de admin:
<Route path="/admin/migration" element={<ClientMigrationPage />} />
```

#### 2.3. Agregar al menú de admin
```typescript
// En tu componente de sidebar/menú admin
{
  label: 'Migración de Clientes',
  path: '/admin/migration',
  icon: RefreshCcw,
  requiredRole: ['admin', 'owner', 'manager'],
}
```

---

### Fase 3: Configuración de Permisos

#### 3.1. Roles que pueden migrar
```typescript
const MIGRATION_PERMISSIONS = {
  owner: true,      // ✅ Dueña del estudio
  admin: true,      // ✅ Administrador
  manager: true,    // ✅ Gerente
  instructor: false, // ❌ Instructores NO
  receptionist: false, // ❌ Recepcionistas NO
};
```

#### 3.2. Actualizar Firestore Rules
```javascript
// Ver archivo: database/migrations/SCHEMA_MIGRACION.md
// Sección: Reglas de Seguridad
```

---

## 📝 Guía de Uso para Admins

### Caso 1: Migrar un Cliente Individual

1. **Ir al módulo**
   - Panel de Admin → Migración de Clientes
   - Tab: "Registrar Cliente"

2. **Llenar el formulario**
   
   **Datos Personales:**
   - Nombre completo (requerido)
   - Teléfono (requerido)
   - Email (opcional)
   - Fecha de nacimiento (opcional)

   **Paquete:**
   - Seleccionar el tipo de membresía que compró

   **Información del Pago Original:**
   - Fecha en que pagó realmente
   - Monto que pagó
   - Método de pago (efectivo, transferencia, etc.)
   - Número de recibo (si existe)

   **Vigencia:**
   - Fecha de inicio (cuando empezó su membresía)
   - Fecha de vencimiento (se calcula automáticamente)
   - Clases ya utilizadas (si ya tomó algunas)

   **Notas:**
   - Contexto adicional (opcional)

3. **Notificaciones**
   - ✅ Enviar email con credenciales
   - ✅ Enviar WhatsApp con contraseña

4. **Confirmar**
   - Click en "Registrar Cliente"
   - Esperar confirmación
   - Se mostrará la contraseña temporal

5. **Resultado**
   - ✅ Cliente creado con acceso a la plataforma
   - ✅ Membresía activa
   - ❌ NO genera orden de venta
   - ❌ NO afecta reportes financieros

---

### Caso 2: Ver Historial de Migraciones

1. **Acceder al historial**
   - Panel de Admin → Migración de Clientes
   - Tab: "Historial"

2. **Información mostrada**
   - Nombre del cliente
   - Contacto (email/teléfono)
   - Paquete asignado
   - Monto original pagado
   - Fecha de pago original
   - Admin que realizó la migración
   - Fecha de migración al sistema

3. **Acciones disponibles**
   - Ver perfil completo del cliente
   - Filtrar por fecha
   - Exportar (próximamente)

---

## 🔧 Mantenimiento y Troubleshooting

### Problema: Cliente migrado aparece en reportes de ventas
**Solución:** Verificar que no se haya creado una orden (`orders`) para ese cliente. Las migraciones NO deben crear orders.

```javascript
// Verificar en Firestore Console
Collection: orders
Where: userId == [ID_DEL_CLIENTE]
// Si existe una orden, eliminarla manualmente
```

---

### Problema: Contraseña temporal no funciona
**Solución:** 
1. Regenerar contraseña desde Firebase Console
2. O usar la función de "Recuperar contraseña" en el login

```javascript
// En Firebase Console > Authentication
// Buscar al usuario por email
// Click en menú (⋮) → Reset password
```

---

### Problema: Cliente no puede acceder aunque fue migrado
**Checklist:**
1. ✅ ¿Tiene email registrado?
2. ✅ ¿Se creó el usuario en Firebase Auth?
3. ✅ ¿El campo `authUid` está correctamente asignado?
4. ✅ ¿Su `active` está en `true`?
5. ✅ ¿Su membresía está `active` y no `expired`?

---

## 📊 Impacto en Reportes

### Reporte de Ventas
```javascript
// ANTES de implementar migración
Total ventas enero: $20,000
Transacciones: 40

// DESPUÉS de migrar 15 clientes (cada uno pagó $500)
Total ventas enero: $20,000  // ✅ NO cambia
Transacciones: 40            // ✅ NO cambia

// Los clientes migrados NO aparecen aquí
```

### Reporte de Membresías Activas
```javascript
// Desglose por origen:
├── Ventas en plataforma: 25  (55%)
├── Clientes migrados: 15     (33%)  // ⭐ Nuevos
├── Promociones: 3            (7%)
└── Cortesías: 2              (4%)

Total: 45 membresías activas
```

---

## 🎓 Ejemplos de Uso

### Ejemplo 1: Cliente con membresía anual pagada hace meses

**Situación:**
- María López pagó $500 en noviembre 2025
- Su membresía vence en noviembre 2026
- Ya ha tomado ~8 clases
- Ahora (febrero 2026) migra a plataforma digital

**Datos del formulario:**
```javascript
{
  name: "María López García",
  email: "maria@email.com",
  phone: "442-123-4567",
  birthDate: "1985-03-15",
  
  packageId: "membership-annual-unlimited",
  
  originalPaymentDate: new Date("2025-11-15"),
  originalAmount: 500,
  paymentMethod: "cash",
  receiptReference: "REC-2025-0123",
  
  startDate: new Date("2025-11-15"),
  endDate: new Date("2026-11-15"),  // Auto-calculado
  classesAlreadyUsed: 8,
  
  notes: "Cliente desde 2024. Pagó inscripción en efectivo.",
  sendEmail: true,
  sendWhatsApp: true,
}
```

**Resultado:**
- ✅ María puede iniciar sesión con su email
- ✅ Ve su membresía activa hasta noviembre 2026
- ✅ Puede reservar clases normalmente
- ✅ Su contador de clases inicia en 8
- ❌ No genera venta de $500 en reportes de febrero

---

### Ejemplo 2: Cliente sin email (solo teléfono)

**Situación:**
- Don Pedro no tiene email
- Solo usa WhatsApp
- Pagó paquete de 10 clases

**Datos del formulario:**
```javascript
{
  name: "Pedro Sánchez",
  email: "",  // ← Vacío
  phone: "442-987-6543",
  
  packageId: "package-10-classes",
  
  originalPaymentDate: new Date("2026-01-10"),
  originalAmount: 1200,
  paymentMethod: "transfer",
  
  startDate: new Date("2026-01-10"),
  endDate: new Date("2026-04-10"),
  classesAlreadyUsed: 2,
  
  sendEmail: false,      // ← No tiene email
  sendWhatsApp: true,    // ← Solo WhatsApp
}
```

**Resultado:**
- ✅ Don Pedro recibe WhatsApp con contraseña
- ✅ Puede acceder con su teléfono en lugar de email
- ✅ Tiene 8 clases restantes (10 - 2 usadas)
- ❌ No puede recuperar contraseña por email (usar teléfono)

---

## 🔒 Consideraciones de Seguridad

1. **Contraseñas temporales**
   - Se generan automáticamente (seguras)
   - El cliente DEBE cambiarlas en primer acceso
   - Expiran después de 24 horas (configurar en Firebase)

2. **Auditoría**
   - Todas las migraciones quedan registradas
   - Se guarda quién, cuándo y qué datos
   - No se pueden eliminar registros de auditoría

3. **Permisos**
   - Solo roles específicos pueden migrar
   - Verificar permisos antes de mostrar el módulo
   - Logs de todas las acciones administrativas

---

## 📈 Métricas y Monitoreo

### KPIs a monitorear:

1. **Clientes migrados vs nuevos**
   ```
   Migrados: 45 clientes
   Nuevos: 78 clientes
   Ratio: 36.6% son migraciones
   ```

2. **Estado de migraciones**
   ```
   Activas: 40
   Expiradas: 3
   Canceladas: 2
   ```

3. **Distribución temporal**
   ```
   Enero: 15 migraciones
   Febrero: 20 migraciones
   Marzo: 10 migraciones
   ```

---

## 🎯 Próximas Mejoras

1. **Importación masiva desde Excel**
   - Subir archivo con múltiples clientes
   - Validación automática de datos
   - Procesamiento en batch

2. **Templates de notificaciones**
   - Personalizar emails de bienvenida
   - Personalizar mensajes de WhatsApp
   - Variables dinámicas

3. **Reportes avanzados**
   - Comparativa ventas vs migraciones
   - Retención de clientes migrados
   - Análisis de uso por origen

4. **Exportación de datos**
   - Exportar historial a Excel
   - Generar reportes PDF
   - Backup de migraciones

---

## 📞 Soporte

Para dudas o problemas:
1. Revisar esta documentación
2. Verificar logs en Firebase Console
3. Contactar al equipo de desarrollo
4. [Abrir issue en GitHub] (si aplica)
