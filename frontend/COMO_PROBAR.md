# 🧪 GUÍA DE PRUEBAS - SISTEMA DE MIGRACIÓN

## 🎯 OPCIÓN 1: Prueba Completa desde la Web (Recomendado)

### Paso 1: Iniciar el Frontend
```bash
cd /Users/cristophersaidromerojuarez/Desktop/Balance Room/Balance Room
npm run dev
```

El frontend debería abrir en: `http://localhost:5173`

---

### Paso 2: Login como Admin

1. Ve a `http://localhost:5173/login`
2. Ingresa tus credenciales de administrador
3. Deberías ver el dashboard de admin

---

### Paso 3: Acceder al Sistema de Migración

1. En el menú lateral izquierdo, busca **"Migración"** con el icono 🔄
2. Despliega el menú
3. Click en **"➕ Registrar Cliente"**

Deberías ver un formulario con 5 secciones.

---

### Paso 4: Llenar el Formulario de Prueba

**Sección 1: Datos Personales**
- Nombre: `María Prueba Test`
- Teléfono: `442-999-8888`
- Email: `maria.prueba.test@gmail.com`
- Fecha de nacimiento: `15/03/1990` (opcional)

**Sección 2: Seleccionar Paquete**
- Selecciona cualquier plan de la lista
- Si no aparecen planes, verifica que tengas planes activos en la BD

**Sección 3: Datos del Pago Original**
- Fecha de pago: `01/01/2026`
- Monto pagado: `500`
- Método de pago: `Efectivo`
- Referencia: `TEST-001`

**Sección 4: Vigencia**
- Fecha de inicio: `01/01/2026`
- Fecha de vencimiento: `01/02/2026`
- Clases usadas: `0`

**Sección 5: Notas**
- Notas: `Cliente de prueba del sistema de migración`
- ✅ Marcar "Enviar email de bienvenida" (opcional)

---

### Paso 5: Migrar

1. Click en **"Migrar Cliente"**
2. Espera unos segundos...
3. **¡Deberías ver la pantalla de confirmación!** 🎉

La pantalla mostrará:
- ✅ Nombre del cliente
- ✅ Email y teléfono
- ✅ **CONTRASEÑA TEMPORAL** (¡cópiala!)
- ✅ Plan asignado
- ✅ Fechas de vigencia

---

### Paso 6: Verificar el Historial

1. Click en el tab **"📋 Historial"**
2. Deberías ver tu migración recién creada en la tabla
3. Verifica que muestre:
   - Nombre del cliente
   - Email y teléfono
   - Plan asignado
   - Monto original
   - Tu nombre como admin que migró

---

### Paso 7: Ver el Perfil del Cliente

1. Desde la pantalla de confirmación, click en **"Ver Perfil"**
2. Deberías ser redirigido al perfil completo del cliente
3. Verifica que tenga:
   - Membresía activa
   - Fechas correctas
   - Clases disponibles

---

### Paso 8: Probar Login del Cliente

1. Abre una ventana de incógnito
2. Ve a `http://localhost:5173/login`
3. Ingresa:
   - Email: `maria.prueba.test@gmail.com`
   - Contraseña: `[La contraseña temporal que copiaste]`
4. **Deberías poder hacer login como el cliente migrado**
5. El cliente debería ver su dashboard con su membresía activa

---

## 🔌 OPCIÓN 2: Prueba de API Directa

Si solo quieres probar los endpoints sin el frontend:

### Paso 1: Obtener Token de Admin

```bash
# Login y obtener token
curl -X POST https://valiant-imagination-production-0462.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "tu-email-admin@gmail.com",
    "password": "tu-password"
  }' | jq '.token'
```

Copia el token que te devuelve.

---

### Paso 2: Probar GET /api/migrations/plans

```bash
export TOKEN="tu-token-aqui"

curl -X GET https://valiant-imagination-production-0462.up.railway.app/api/migrations/plans \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.'
```

**Esperado:** Lista de planes disponibles

---

### Paso 3: Probar GET /api/migrations/stats

```bash
curl -X GET https://valiant-imagination-production-0462.up.railway.app/api/migrations/stats \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.'
```

**Esperado:**
```json
{
  "totalActivas": X,
  "porVenta": X,
  "porMigracion": X,
  "porPromo": X,
  "porGift": X
}
```

---

### Paso 4: Probar POST /api/migrations/client

```bash
# Primero, obtén un ID de plan de la lista
PLAN_ID="[copia-un-id-de-plan-aqui]"

curl -X POST https://valiant-imagination-production-0462.up.railway.app/api/migrations/client \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Pedro Prueba API",
    "email": "pedro.api@test.com",
    "phone": "442-888-7777",
    "birthDate": "1985-05-15",
    "packageId": "'$PLAN_ID'",
    "originalPaymentDate": "2026-01-01T00:00:00.000Z",
    "originalAmount": 600,
    "paymentMethod": "cash",
    "receiptReference": "API-TEST-001",
    "startDate": "2026-01-01T00:00:00.000Z",
    "endDate": "2026-02-01T00:00:00.000Z",
    "classesAlreadyUsed": 0,
    "notes": "Migración desde API - Test",
    "sendEmail": false,
    "sendWhatsApp": false
  }' | jq '.'
```

**Esperado:**
```json
{
  "success": true,
  "userId": "uuid-del-usuario",
  "packageId": "uuid-de-la-membresia",
  "tempPassword": "TempXXXX1234!",
  "message": "Cliente Pedro Prueba API migrado exitosamente"
}
```

---

### Paso 5: Probar GET /api/migrations/history

```bash
curl -X GET https://valiant-imagination-production-0462.up.railway.app/api/migrations/history?limit=5 \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.'
```

**Esperado:** Array con las últimas migraciones

---

## 🗄️ OPCIÓN 3: Verificar en la Base de Datos

Conéctate a PostgreSQL:

```bash
psql postgresql://postgres:dLoiTovtexVLGiijzfwHveIWQaDqGsjS@turntable.proxy.rlwy.net:36251/railway
```

### Query 1: Ver clientes migrados

```sql
SELECT 
    u.id,
    u.display_name,
    u.email,
    u.phone,
    u.is_migrated_client,
    u.migrated_at
FROM users u
WHERE u.is_migrated_client = true
ORDER BY u.migrated_at DESC
LIMIT 5;
```

---

### Query 2: Ver membresías de migración

```sql
SELECT 
    m.id,
    u.display_name as cliente,
    p.name as plan,
    m.start_date,
    m.end_date,
    m.status,
    m.is_migration,
    m.classes_remaining
FROM memberships m
JOIN users u ON m.user_id = u.id
JOIN plans p ON m.plan_id = p.id
WHERE m.is_migration = true
ORDER BY m.created_at DESC
LIMIT 5;
```

---

### Query 3: Ver registros de migración

```sql
SELECT 
    cm.id,
    u.display_name as cliente,
    cm.original_payment_amount,
    cm.original_payment_date,
    cm.migrated_at,
    admin.display_name as migrado_por
FROM client_migrations cm
JOIN users u ON cm.user_id = u.id
JOIN users admin ON cm.migrated_by = admin.id
ORDER BY cm.migrated_at DESC
LIMIT 5;
```

---

### Query 4: Verificar que NO se crearon orders

```sql
-- Este query NO debe retornar filas para clientes migrados
SELECT 
    o.*,
    u.display_name,
    u.is_migrated_client
FROM orders o
JOIN users u ON o.user_id = u.id
WHERE u.is_migrated_client = true;
```

**Esperado:** 0 filas (las migraciones NO deben crear orders)

---

## ✅ CHECKLIST DE VERIFICACIÓN

Después de las pruebas, verifica:

- [ ] ✅ Frontend carga sin errores
- [ ] ✅ Menú "Migración" es visible en admin
- [ ] ✅ Formulario se ve correctamente
- [ ] ✅ Se pueden cargar los planes
- [ ] ✅ La migración se completa exitosamente
- [ ] ✅ Se muestra la contraseña temporal
- [ ] ✅ El cliente aparece en el historial
- [ ] ✅ El cliente puede hacer login
- [ ] ✅ La membresía está activa
- [ ] ✅ NO se creó orden de venta
- [ ] ✅ Los endpoints API responden correctamente

---

## 🐛 Problemas Comunes

### Error: "Cannot fetch plans"

**Causa:** Backend no está corriendo o no hay planes activos

**Solución:**
```sql
-- Verificar planes activos
SELECT id, name, is_active FROM plans;

-- Activar un plan si es necesario
UPDATE plans SET is_active = true WHERE id = 'plan-id';
```

---

### Error: "Email ya registrado"

**Causa:** Ya existe un usuario con ese email

**Solución:**
- Usa un email diferente
- O elimina el usuario de prueba anterior:
```sql
DELETE FROM users WHERE email = 'maria.prueba.test@gmail.com';
```

---

### Error: "Teléfono ya registrado"

**Causa:** Ya existe un usuario con ese teléfono

**Solución:**
- Usa un teléfono diferente
- O elimina el usuario de prueba anterior

---

### Error: "Plan no encontrado"

**Causa:** El plan seleccionado no existe o está inactivo

**Solución:**
```sql
-- Ver planes disponibles
SELECT id, name, is_active FROM plans WHERE is_active = true;
```

---

### Error: 401 Unauthorized

**Causa:** Token inválido o expirado

**Solución:**
- Hacer login nuevamente
- Obtener un nuevo token

---

### El historial está vacío

**Causa:** Aún no has hecho ninguna migración

**Solución:**
- Crea una migración de prueba primero

---

## 🎉 Resultado Esperado

Si todo funciona correctamente, deberías:

1. ✅ Ver el formulario de migración sin errores
2. ✅ Poder completar una migración exitosamente
3. ✅ Ver la contraseña temporal generada
4. ✅ Ver el cliente en el historial
5. ✅ Poder hacer login como el cliente migrado
6. ✅ Ver la membresía activa del cliente
7. ✅ Verificar que NO se creó orden en la BD

---

## 📞 ¿Necesitas Ayuda?

Si algo no funciona:

1. Revisa los logs del backend en Railway
2. Revisa la consola del navegador (F12)
3. Verifica que la base de datos esté accesible
4. Confirma que los endpoints API respondan

---

**¡Buena suerte con las pruebas! 🚀**
