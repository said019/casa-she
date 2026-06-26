# 🔄 Sistema de Migración de Clientes Existentes

> **Registra clientes que ya pagaron antes de la plataforma sin inflar los reportes de ventas**

## 🎯 ¿Qué problema resuelve?

Cuando un estudio de Pilates ya tiene clientes con membresías pagadas y migra a una plataforma digital, necesita:

1. ✅ Darles acceso al sistema a esos clientes
2. ✅ Mantener sus fechas reales de pago y vencimiento
3. ✅ Que puedan reservar clases normalmente
4. ❌ **NO** registrar esos pagos históricos como ventas de hoy
5. ❌ **NO** inflar artificialmente los reportes financieros

**Este sistema lo hace posible.**

---

## 🏗️ Arquitectura

```
FLUJO NORMAL (Venta):
Cliente compra → Crea Order → Admin valida → Activa Membresía
                     ↓
              ✅ Suma a reportes de ventas

FLUJO DE MIGRACIÓN:
Admin registra → Crea User + Membresía activa
                     ↓
              ❌ NO crea Order
                     ↓
              ❌ NO suma a reportes de ventas
                     ↓
              ✅ Cliente funciona igual
```

---

## 📦 Componentes Principales

### 1. Tipos y Servicios
- **`migration.types.ts`**: Interfaces TypeScript
- **`migrationService.ts`**: Lógica de negocio
- **`reportsService.ts`**: Reportes que excluyen migraciones

### 2. Hooks
- **`useMigrateClient`**: Hook para migración individual
- **`useMigrationHistory`**: Hook para historial

### 3. Componentes UI
- **`ManualClientForm`**: Formulario completo de migración
- **`MigrationConfirmation`**: Pantalla de éxito
- **`MigrationHistory`**: Lista de migraciones realizadas
- **`MembershipStatsWidget`**: Widget con desglose por origen

### 4. Página Principal
- **`ClientMigrationPage`**: Módulo completo con tabs

---

## 🚀 Quick Start

### 1. Acceder al módulo
```
Panel Admin → Migración de Clientes
```

### 2. Registrar un cliente
1. Llenar datos personales (nombre, teléfono, email)
2. Seleccionar paquete/membresía
3. Ingresar información del pago original
4. Definir vigencia (fecha inicio y fin)
5. Agregar notas si es necesario
6. Confirmar

### 3. Ver historial
```
Tab "Historial" → Lista de todas las migraciones
```

---

## 🔑 Campos Clave

### En `users`:
```typescript
source: 'migration'  // ← Identifica origen
migrationNotes: string | null
```

### En `user_packages`:
```typescript
origin: 'migration'  // ← NO suma a ventas
migrationData: {
  originalPaymentDate: Timestamp,
  originalAmount: number,
  paymentMethod: string,
  migratedBy: string,
  migratedAt: Timestamp,
  notes: string,
}
```

### En `orders`:
```
🚫 NO se crea order para migraciones
```

---

## 📊 Impacto en Reportes

### Reporte de Ventas
```javascript
// Solo cuenta orders con status 'paid'
// Migraciones NO tienen orders
// → Reportes limpios ✅
```

### Dashboard de Membresías
```javascript
Total Activas: 45
├── 🛒 Ventas: 25 (55%)
├── 🔄 Migraciones: 15 (33%)  ⭐
├── 🎁 Promociones: 3 (7%)
└── 💝 Cortesías: 2 (5%)
```

---

## 🔐 Permisos

| Rol | Puede Migrar |
|-----|--------------|
| Owner | ✅ Sí |
| Admin | ✅ Sí |
| Manager | ✅ Sí |
| Instructor | ❌ No |
| Receptionist | ❌ No |

---

## 💡 Casos de Uso

### Caso 1: Membresía anual pagada hace meses
```
Cliente: María López
Pago original: 15 Nov 2025 - $500
Vence: 15 Nov 2026
Clases usadas: 8

Migración: 1 Feb 2026
Resultado:
- ✅ Acceso inmediato
- ✅ 290 días restantes
- ✅ Contador en 8 clases
- ❌ No genera venta en Feb 2026
```

### Caso 2: Cliente sin email
```
Cliente: Pedro Sánchez
Solo teléfono: 442-987-6543
Paquete: 10 clases

Migración:
- Crear cuenta sin email
- Enviar contraseña por WhatsApp
- Login con teléfono
```

---

## 📁 Estructura de Archivos

```
src/
├── types/
│   └── migration.types.ts
├── services/
│   ├── migrationService.ts
│   └── reportsService.ts
├── hooks/
│   └── useMigrateClient.ts
├── components/admin/
│   ├── migration/
│   │   ├── ManualClientForm.tsx
│   │   ├── MigrationConfirmation.tsx
│   │   └── MigrationHistory.tsx
│   └── dashboard/
│       └── MembershipStatsWidget.tsx
└── pages/admin/
    └── ClientMigrationPage.tsx
```

---

## 🧪 Testing

### Test Manual
1. Migrar un cliente de prueba
2. Verificar que NO aparezca en reportes de ventas
3. Verificar que SÍ aparezca en membresías activas
4. Confirmar que puede reservar clases
5. Revisar historial de migraciones

### Queries de Verificación
```javascript
// Verificar que NO hay order
db.collection('orders').where('userId', '==', TEST_USER_ID).get()
// Debe estar vacío

// Verificar user_package con origin: 'migration'
db.collection('user_packages')
  .where('userId', '==', TEST_USER_ID)
  .where('origin', '==', 'migration')
  .get()
// Debe existir
```

---

## 🐛 Troubleshooting

### Cliente aparece en ventas
- ❌ Se creó una `order` por error
- ✅ Eliminar la order manualmente

### Cliente no puede acceder
- Verificar `authUid` en `users`
- Verificar que existe en Firebase Auth
- Confirmar `active: true`

### Membresía no aparece activa
- Verificar `status: 'active'`
- Verificar `endDate > now`
- Revisar `origin: 'migration'`

---

## 📈 Métricas

### KPIs del Sistema
- Total de clientes migrados
- % migraciones vs ventas nuevas
- Tasa de activación de migraciones
- Retención de clientes migrados

---

## 🔮 Roadmap

### v1.0 (Actual)
- ✅ Migración manual individual
- ✅ Historial de migraciones
- ✅ Reportes separados
- ✅ Auditoría completa

### v1.1 (Próximo)
- 🔄 Importación masiva desde Excel
- 🔄 Templates personalizables
- 🔄 Reportes comparativos
- 🔄 Exportación de historial

### v2.0 (Futuro)
- 🔮 API pública de migración
- 🔮 Webhooks de eventos
- 🔮 Integración con CRM
- 🔮 Analytics avanzados

---

## 📚 Documentación Adicional

- **Guía de Implementación**: `MIGRATION_IMPLEMENTATION_GUIDE.md`
- **Esquema de DB**: `database/migrations/SCHEMA_MIGRACION.md`
- **API Reference**: Ver JSDoc en archivos de código

---

## 🤝 Contribuir

1. Seguir estructura de archivos existente
2. Documentar todas las funciones con JSDoc
3. Agregar tests para nuevas features
4. Actualizar esta documentación

---

## 📄 Licencia

Parte del proyecto Balance Room - Todos los derechos reservados

---

## 👥 Autores

Desarrollado para el estudio de Pilates Balance Room

---

**🎉 ¡Gracias por usar el Sistema de Migración de Clientes!**
