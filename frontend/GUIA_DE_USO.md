# 🚀 GUÍA DE USO - SISTEMA DE MIGRACIÓN DE CLIENTES

## ✅ Sistema 100% Implementado y Listo

El sistema de migración de clientes está completamente funcional. Esta guía te ayudará a empezar a usarlo.

---

## 📋 Pre-requisitos

✅ **Base de datos configurada** - Ya ejecutado con éxito  
✅ **Backend deployado** - Railway con endpoints activos  
✅ **Frontend actualizado** - Componentes integrados  
✅ **Menú agregado** - Accesible desde panel admin  

---

## 🎯 Acceso Rápido

### Desde la Plataforma Web

1. **Login como admin** en https://tu-dominio.com/login
2. **Ve al panel admin**: Click en menú lateral → **Migración**
3. **Opciones disponibles:**
   - ➕ **Registrar Cliente** - Migrar cliente individual
   - 📋 **Historial** - Ver todas las migraciones
   - 📥 **Importar Excel** - Próximamente

---

## 👨‍💼 Migrar un Cliente Individual

### Paso 1: Acceder al Formulario

```
Panel Admin → Migración → Registrar Cliente
```

### Paso 2: Llenar Datos Personales

**Requerido:**
- ✅ Nombre completo
- ✅ Teléfono

**Opcional:**
- Email (si no tiene, dejarlo vacío)
- Fecha de nacimiento

### Paso 3: Seleccionar Paquete

- ✅ Selecciona el plan/membresía que tenía el cliente
- Se cargan automáticamente desde tu catálogo activo

### Paso 4: Datos del Pago Original

**Requerido:**
- ✅ Fecha en que pagó originalmente
- ✅ Monto que pagó
- ✅ Método de pago (Efectivo, Transferencia, Tarjeta)

**Opcional:**
- Referencia del recibo/comprobante

### Paso 5: Vigencia de la Membresía

**Requerido:**
- ✅ Fecha de inicio
- ✅ Fecha de vencimiento

**Opcional:**
- Clases ya usadas (default: 0)

### Paso 6: Notas

**Opcional:**
- Notas adicionales sobre el cliente o la migración
- Ejemplo: "Cliente VIP desde 2024", "Renovó en diciembre"

### Paso 7: Enviar

1. Click en **"Migrar Cliente"**
2. Espera confirmación
3. **¡Listo!** El cliente está migrado

---

## ✨ Después de Migrar

### Pantalla de Confirmación

Verás:
- ✅ Nombre del cliente
- ✅ Email (si proporcionaste uno)
- ✅ Teléfono
- ✅ **Contraseña temporal** (¡IMPORTANTE: anótala!)
- ✅ Plan asignado
- ✅ Fechas de vigencia
- ✅ Clases disponibles

### Acciones Disponibles

1. **Ver Perfil**
   - Te lleva al perfil completo del cliente
   - Puedes ver su membresía, reservas, etc.

2. **Registrar Otro Cliente**
   - Vuelve al formulario vacío
   - Listo para migrar el siguiente

---

## 📋 Ver Historial de Migraciones

```
Panel Admin → Migración → Historial
```

### Información Mostrada

- **Cliente:** Nombre, email, teléfono
- **Plan:** Membresía asignada
- **Monto:** Pago original
- **Fecha de pago:** Cuándo pagó originalmente
- **Migrado por:** Admin que hizo la migración
- **Fecha de migración:** Cuándo se registró en el sistema
- **Notas:** Observaciones adicionales

### Acciones

- Click en cualquier fila para ver el perfil completo del cliente
- Exportar a CSV (próximamente)

---

## 🔐 Dar Acceso al Cliente

### Opción 1: Enviar Credenciales por WhatsApp

```
Hola [Nombre],

¡Bienvenido a nuestra plataforma digital! 🎉

Ya puedes reservar tus clases en línea:
👉 https://tu-dominio.com/login

Tus datos de acceso son:
📧 Email: [email del cliente]
🔑 Contraseña temporal: [la que te dio el sistema]

Por seguridad, el sistema te pedirá cambiar tu contraseña en el primer login.

¿Necesitas ayuda? Escríbenos.
```

### Opción 2: Enviar por Email

El sistema puede enviar automáticamente si marcaste la opción "Enviar email de bienvenida" durante la migración.

---

## 🎓 Preguntas Frecuentes

### ¿Qué pasa si el cliente ya tiene cuenta?

El sistema detecta duplicados por email o teléfono y te alertará. No podrás crear la cuenta duplicada.

### ¿Se genera una orden de venta?

**NO.** Las migraciones NO generan órdenes de venta ni registros contables. Eso es precisamente el punto: son clientes que YA PAGARON antes del sistema.

### ¿Aparece en reportes financieros?

**NO.** Las migraciones NO afectan reportes de ingresos. Solo los pagos normales (después de implementar la plataforma) aparecen en reportes.

### ¿El cliente puede reservar clases inmediatamente?

**SÍ.** Una vez migrado, el cliente tiene acceso completo para:
- Reservar clases
- Ver su horario
- Descargar pase digital (Wallet)
- Ver su perfil
- Referir amigos

### ¿Cómo identifico clientes migrados?

En la base de datos tienen:
- `users.is_migrated_client = true`
- `memberships.is_migration = true`
- Registro completo en tabla `client_migrations`

En la interfaz: No hay diferencia visible, son clientes normales.

### ¿Puedo editar una migración después?

No directamente. Si cometiste un error:
1. Elimina la membresía del cliente
2. Crea una nueva migración con datos correctos

### ¿Cuántos clientes puedo migrar?

Ilimitados. El sistema está diseñado para manejar cientos o miles de migraciones.

---

## 🛠️ Para Desarrolladores

### Test Manual de API

```bash
# En la carpeta raíz del proyecto
bash test-migration-api.sh
```

Necesitarás un token de admin válido.

### Queries Útiles

**Ver todas las migraciones:**
```sql
SELECT * FROM migration_report_view;
```

**Contar migraciones:**
```sql
SELECT COUNT(*) FROM client_migrations;
```

**Ver clientes migrados activos:**
```sql
SELECT u.display_name, u.email, u.phone, m.end_date
FROM users u
JOIN memberships m ON m.user_id = u.id
WHERE u.is_migrated_client = true
  AND m.status = 'active'
  AND m.end_date > CURRENT_DATE;
```

---

## 📞 Soporte

**Documentación técnica completa:** Ver `IMPLEMENTATION_COMPLETE_FINAL.md`

**Para dudas sobre:**
- Uso del sistema → Contactar administrador
- Problemas técnicos → Revisar logs en Railway
- Nuevas funcionalidades → Contactar desarrollo

---

## 🎉 ¡Listo para Usar!

El sistema está completamente funcional. Puedes empezar a migrar clientes inmediatamente.

**Recomendación:** Haz una migración de prueba primero para familiarizarte con el proceso.

---

**Última actualización:** 2 de febrero de 2026  
**Versión del sistema:** 1.0.0  
**Estado:** ✅ Producción
