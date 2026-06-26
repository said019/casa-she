# 🔐 Sistema de Acceso con Magic Link para Instructores

## 📋 ¿Qué es esto?

Un sistema de autenticación sin contraseña para instructores. En lugar de recordar contraseñas, los instructores solicitan un "enlace mágico" que se envía a su correo y les da acceso instantáneo a su portal.

## 🎯 Flujo de Usuario

### 1. Instructor solicita acceso
- Va a `/instructor/access`
- Ingresa su correo registrado
- Hace clic en "Solicitar acceso"

### 2. Sistema envía email
- Verifica que el correo pertenece a un instructor activo
- Genera un token único con validez de 1 hora
- Envía email bonito con botón de acceso

### 3. Instructor hace clic en el enlace
- Es redirigido a `/instructor/magic-login?token=xxx`
- El sistema verifica automáticamente el token
- Si es válido, inicia sesión y redirige a `/instructor/dashboard`

## 🛠️ Componentes del Sistema

### Backend

#### 1. Middleware de Autenticación (`server/src/middleware/auth.ts`)
```typescript
// Generar token de magic link (1 hora de validez)
generateMagicLinkToken(email: string): string

// Verificar token de magic link
verifyMagicLinkToken(token: string): { email: string } | null
```

#### 2. Servicio de Email (`server/src/services/email.ts`)
```typescript
// Enviar magic link por email usando Resend
sendInstructorMagicLink({
  to: string,
  instructorName: string,
  magicLink: string
}): Promise<void>
```

#### 3. Rutas de API (`server/src/routes/auth.ts`)

**POST `/api/auth/instructor/request-access`**
- Body: `{ email: string }`
- Genera y envía el magic link
- Siempre responde exitoso (seguridad)

**POST `/api/auth/instructor/verify-magic-link`**
- Body: `{ token: string }`
- Verifica el token y retorna JWT de sesión
- Responde con `{ token, user }`

### Frontend

#### 1. Página de Solicitud (`src/pages/instructor/InstructorAccess.tsx`)
- Formulario simple con campo de email
- Validación de email
- Mensaje de éxito con instrucciones

#### 2. Página de Verificación (`src/pages/instructor/InstructorMagicLogin.tsx`)
- Lee el token de la URL
- Verifica automáticamente
- Muestra loading → success → redirect
- Manejo de errores (token expirado/inválido)

#### 3. Auth Store (`src/stores/authStore.ts`)
- Nueva función `setAuth(user, token)` para login directo
- Guarda token en localStorage
- Actualiza estado global

## 🔧 Configuración

### Variables de Entorno (Railway)

```bash
RESEND_API_KEY=re_6dSMXnm2_DLBmdb8LVZQXz4ZNMq5qZwe3
RESEND_FROM_EMAIL="Balance Room Pilates <onboarding@resend.dev>"
FRONTEND_URL=https://tu-dominio.com
JWT_SECRET=tu-secret-key
```

### Dominio de Email

El email del remitente se configura con la variable `RESEND_FROM_EMAIL`.

**Para desarrollo:**
```bash
RESEND_FROM_EMAIL="Balance Room Pilates <onboarding@resend.dev>"
```

**Para producción (con dominio verificado):**
```bash
RESEND_FROM_EMAIL="Balance Room Pilates <hola@balanceroom.mx>"
```

## 📧 Email Template

El email incluye:
- ✨ Diseño profesional con colores de marca
- 🔘 Botón grande de acceso
- ⚠️ Advertencia de expiración (1 hora)
- 📋 Lista de funciones del portal
- 👥 Firma del equipo

## 🔒 Seguridad

### Tokens
- ✅ Firmados con JWT_SECRET
- ✅ Expiración de 1 hora
- ✅ Uso único (no se pueden reutilizar)
- ✅ Verificación de propósito (`purpose: 'magic-link'`)

### Email
- ✅ No revela si el email existe (previene enumeración)
- ✅ Solo funciona con instructores activos
- ✅ Rate limiting recomendado (agregar en Railway)

### Frontend
- ✅ Validación de email antes de enviar
- ✅ Mensajes de error genéricos
- ✅ Redirección automática después del login

## 🚀 Próximos Pasos

### Para que funcione en producción:

1. **Verificar dominio en Resend**
   - Dashboard de Resend → Domains
   - Agregar registros DNS
   - Verificar propiedad

2. **Actualizar variables de Railway**
   ```bash
   railway variables set RESEND_API_KEY=re_6dSMXnm2_DLBmdb8LVZQXz4ZNMq5qZwe3
   railway variables set RESEND_FROM_EMAIL="Balance Room Pilates <hola@balanceroom.mx>"
   railway variables set FRONTEND_URL=https://tudominio.com
   ```

3. **Agregar Rate Limiting** (opcional pero recomendado)
   ```bash
   npm install express-rate-limit
   ```

4. **Crear dashboard de instructor** (si no existe)
   - `/instructor/dashboard`
   - Ver clases programadas
   - Gestionar horarios
   - Ver alumnos

## 📱 Rutas Agregadas

### Frontend
- `/instructor/access` - Solicitar magic link
- `/instructor/magic-login?token=xxx` - Verificar y login

### Backend
- `POST /api/auth/instructor/request-access` - Enviar magic link
- `POST /api/auth/instructor/verify-magic-link` - Verificar token

## 🎨 UI/UX

- Diseño consistente con el resto de la app
- Colores de marca (#8C8475)
- Gradientes suaves
- Iconos descriptivos
- Mensajes claros y amigables
- Feedback visual en cada paso

## 💡 Ventajas del Magic Link

1. **Para Instructores**
   - No necesitan recordar contraseñas
   - Acceso rápido desde cualquier dispositivo
   - Más seguro que contraseñas débiles

2. **Para el Negocio**
   - Menos tickets de "olvidé mi contraseña"
   - Mejor experiencia de usuario
   - Más seguro (tokens temporales)

3. **Para el Sistema**
   - No se almacenan contraseñas de instructores
   - Logs de acceso automáticos
   - Fácil de revocar acceso

## 📊 Monitoreo

Logs importantes:
```typescript
// Cuando se envía un magic link
console.log('Magic link email sent successfully:', data);

// Cuando falla el envío
console.error('Error sending magic link email:', error);

// Cuando se verifica un token
console.log('Token verified for:', email);
```

## 🐛 Troubleshooting

### "No recibo el email"
1. Revisar spam/correo no deseado
2. Verificar que el email está en la tabla `instructors`
3. Check logs de Resend dashboard
4. Verificar RESEND_API_KEY en Railway

### "Token inválido o expirado"
1. Los tokens expiran en 1 hora
2. Solicitar nuevo enlace
3. Verificar que JWT_SECRET coincide

### "No redirige después del login"
1. Verificar que existe ruta `/instructor/dashboard`
2. Check permisos del rol `instructor`
3. Revisar consola del navegador

---

**Hecho con ❤️ para Balance Room Pilates**
