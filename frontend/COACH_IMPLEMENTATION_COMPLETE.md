# 🎯 IMPLEMENTACIÓN COMPLETA DE COACHES

## ✅ CAMBIOS REALIZADOS

### 1. **BASE DE DATOS - Migración**
📄 Archivo: `/database/migrations/003_add_coach_portal_fields.sql`

**Nuevos campos en `instructors`:**
- `visible_public` BOOLEAN - Controla si se muestra en el sitio público
- `coach_number` VARCHAR(20) UNIQUE - ID de coach (ej: COACH-0001)
- `password_hash` VARCHAR(255) - Contraseña hasheada con bcrypt
- `temp_password` BOOLEAN - Flag para contraseña temporal
- `last_login` TIMESTAMP - Último inicio de sesión
- `phone` VARCHAR(20) - Teléfono del instructor

**Nuevas tablas:**
- `instructor_availability` - Disponibilidad de instructores por día/hora
- `password_reset_tokens` - Tokens de recuperación de contraseña

**Nuevos campos en `users`:**
- `instructor_notes` TEXT - Notas administrativas
- `alert_flag` BOOLEAN - Bandera de alerta
- `alert_message` TEXT - Mensaje de alerta

**Nueva función:**
- `generate_coach_number()` - Genera IDs únicos (COACH-0001, COACH-0002, etc.)

---

### 2. **BACKEND - Endpoints Actualizados**

#### 📄 `/Balance Room/server/src/routes/instructors.ts`

**Schema actualizado:**
```typescript
{
  userId, displayName, bio, phone, 
  priorities, certifications, 
  isActive, visiblePublic
}
```

**Endpoints nuevos:**
- `POST /api/instructors/:id/generate-access` - Genera credenciales de coach
- `POST /api/instructors/:id/reset-password` - Resetea contraseña del coach

**Endpoints actualizados:**
- `GET /api/instructors` - Ahora incluye campos: `visible_public`, `coach_number`, `temp_password`, `last_login`, `phone`
- `POST /api/instructors` - Soporta campos nuevos
- `PUT /api/instructors/:id` - Soporta campos nuevos
- `POST /api/instructors/:id/photo` - Upload de foto (sin cambios, funciona correctamente)

#### 📄 `/Balance Room/server/src/routes/auth.ts`

**Endpoints nuevos:**
- `POST /api/auth/coach/login` - Login para coaches con `coach_number` o `email`
- `POST /api/auth/coach/change-password` - Cambio de contraseña de coach

**Características:**
- Login con coach_number (COACH-0001) o email
- Detección automática de contraseña temporal
- Actualización de `last_login`
- Generación de JWT con rol `instructor`
- Validación de contraseñas (mínimo 8 caracteres)

---

### 3. **FRONTEND - Admin UI**

#### 📄 `/Balance Room/src/pages/admin/staff/InstructorsList.tsx`

**🐛 BUG ARREGLADO:**
```typescript
// ANTES (BUG):
onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['instructors'] });
    toast({ title: 'Foto actualizada' });
}

// DESPUÉS (FIXED):
onSuccess: (response, variables) => {
    queryClient.invalidateQueries({ queryKey: ['instructors'] });
    
    // Actualizar el instructor en edición con la nueva foto
    if (editingInstructor) {
        setEditingInstructor({
            ...editingInstructor,
            photo_url: response.data.photo_url
        });
    }
    
    toast({ title: 'Foto actualizada' });
}
```

**Causa del bug:** Después de subir la foto, se invalidaba la query pero el `editingInstructor` en el estado local no se actualizaba, por lo que seguía mostrando la foto vieja hasta cerrar y reabrir el dialog.

**Solución:** Actualizar el estado local de `editingInstructor` con la nueva URL de foto inmediatamente después del upload exitoso.

**Nuevas funcionalidades:**
1. **Tabla expandida:**
   - Columna "Portal Coach" con:
     - Badge con `coach_number` (COACH-0001)
     - Badge de "Cambio de contraseña pendiente" si `temp_password = true`
     - Fecha de último acceso
   - Badge "Visible público" si está habilitado

2. **Formulario de edición:**
   - Campo `phone` (teléfono del instructor)
   - Toggle `visiblePublic` (mostrar en sitio público)

3. **Acciones nuevas en menú:**
   - "Generar Acceso Coach" - Crea credenciales
   - "Resetear Contraseña" - Genera nueva contraseña temporal

4. **Dialog de credenciales:**
   - Muestra `coach_number` y contraseña temporal
   - Botones de copiar para cada campo
   - Advertencia: contraseña se muestra solo una vez

---

### 4. **FRONTEND - Vista Pública**

#### 📄 `/Balance Room/src/components/Instructors.tsx`

**Cambios:**
- Filtro actualizado: Ahora solo muestra instructores con `is_active = true` Y `visible_public = true`
- Interface actualizada con campo `visible_public`

```typescript
// ANTES:
return response.data.filter((i: Instructor) => i.is_active);

// DESPUÉS:
return response.data.filter((i: Instructor) => 
  i.is_active && i.visible_public
);
```

---

### 5. **FRONTEND - Login de Coaches**

#### 📄 `/Balance Room/src/pages/auth/CoachLogin.tsx` (NUEVO)

**Características:**
- Login con `coach_number` (COACH-0001) o `email`
- Detección automática de contraseña temporal
- Dialog modal de cambio de contraseña obligatorio
- Validaciones:
  - Contraseña mínimo 8 caracteres
  - Confirmación de contraseña
- Redirección a `/coach/dashboard` después del login

**UI:**
- Card centrado con diseño profesional
- Iconos para cada campo
- Estados de carga
- Manejo de errores con toast

---

### 6. **TYPES ACTUALIZADOS**

#### 📄 `/Balance Room/src/types/class.ts`

```typescript
export interface Instructor {
    id: string;
    user_id: string;
    display_name: string;
    bio: string | null;
    photo_url: string | null;
    specialties: string[];
    certifications: string[];
    is_active: boolean;
    visible_public: boolean;        // ✨ NUEVO
    coach_number?: string | null;   // ✨ NUEVO
    temp_password?: boolean;        // ✨ NUEVO
    last_login?: string | null;     // ✨ NUEVO
    instructor_phone?: string;      // ✨ NUEVO
    user_phone?: string;
    email?: string;
    created_at: string;
}
```

---

## 🚀 CÓMO USAR

### **Paso 1: Ejecutar la migración**

```bash
# Conectar a tu base de datos PostgreSQL y ejecutar:
psql -U tu_usuario -d tu_database -f database/migrations/003_add_coach_portal_fields.sql
```

### **Paso 2: Crear un instructor en Admin**

1. Ir a Admin → Staff → Instructores
2. Clic en "Nuevo Instructor"
3. Buscar un usuario existente o crear uno nuevo
4. Llenar los datos:
   - Nombre público
   - Biografía
   - Teléfono (opcional)
   - Especialidades (una por línea)
   - Estado Activo: ✅
   - Visible en Sitio Público: ✅ (si quieres que aparezca en el website)
5. Guardar

### **Paso 3: Subir foto del instructor**

1. Editar el instructor
2. En la sección "Foto de Perfil":
   - Clic en la imagen o botón "Seleccionar Foto"
   - Elegir imagen (JPG/PNG, max 10MB)
   - La imagen se optimiza automáticamente a 800x1000px
   - Clic en "Guardar Foto"
3. ✅ **La foto ahora se refleja inmediatamente** (bug arreglado)

### **Paso 4: Generar acceso al portal de coach**

1. En la tabla de instructores, clic en el menú "..." del instructor
2. Seleccionar "Generar Acceso Coach"
3. Confirmar la acción
4. Se abre un dialog con:
   - **Número de Coach:** COACH-0001 (ejemplo)
   - **Contraseña Temporal:** abc123XYZ!@# (ejemplo)
5. Copiar y enviar al instructor (email/WhatsApp)
6. ⚠️ La contraseña solo se muestra esta vez

### **Paso 5: Instructor inicia sesión**

1. Instructor va a `/coach/login`
2. Ingresa:
   - Número de coach (COACH-0001) O su email
   - Contraseña temporal
3. Clic en "Iniciar Sesión"
4. Si es contraseña temporal:
   - Se abre modal de "Cambiar Contraseña"
   - Ingresa contraseña temporal
   - Crea nueva contraseña (mínimo 8 caracteres)
   - Confirma la contraseña
   - Clic en "Cambiar Contraseña"
5. Redirige a `/coach/dashboard`

### **Paso 6: Reset de contraseña (si es necesario)**

1. Admin → Instructores → Menú "..."
2. "Resetear Contraseña"
3. Se genera nueva contraseña temporal
4. Copiar y enviar al instructor
5. El instructor deberá cambiarla en el próximo login

---

## 🔐 SEGURIDAD

✅ **Implementadas:**
- Contraseñas hasheadas con bcrypt (costo 12)
- Contraseñas temporales marcadas con flag
- Contraseñas nunca se almacenan en texto plano
- Validación de longitud mínima (8 caracteres)
- Tokens JWT para autenticación
- Separación de roles (admin vs instructor)

---

## 📊 VALIDACIONES

### **Backend:**
- Email único (instructors vinculados a users)
- coach_number único
- Imagen: URL válida o base64 con prefijo `data:image/`
- Contraseña mínimo 8 caracteres

### **Frontend:**
- Imagen máximo 10MB antes de procesar
- Optimización automática a 800x1000px
- Calidad JPEG 92% (alta calidad)
- Tipos permitidos: JPG, PNG, WEBP

---

## 🎨 UI/UX

### **Admin:**
- Tabla con 6 columnas:
  1. Instructor (foto + nombre + bio)
  2. Contacto (email + teléfono)
  3. Especialidades (badges, max 2 visibles)
  4. Portal Coach (coach_number + estado + último acceso)
  5. Estado (activo/inactivo + visible público)
  6. Acciones (editar, generar acceso, resetear, desactivar)

### **Sitio Público:**
- Solo muestra instructores con:
  - `is_active = true`
  - `visible_public = true`
- Cards con aspect ratio 3:4
- Hover con overlay y botón "Ver clases"
- Placeholder si no hay foto

### **Coach Login:**
- Card centrado
- Diseño limpio y profesional
- Estados de carga
- Validaciones en tiempo real
- Dialog modal para cambio de contraseña

---

## 🐛 BUG ORIGINAL - EXPLICACIÓN DETALLADA

### **Problema:**
Al subir una foto de instructor en Admin:
1. Se selecciona la imagen ✅
2. Se procesa y optimiza ✅
3. Se muestra en preview ✅
4. Se hace clic en "Guardar Foto" ✅
5. El endpoint guarda en DB correctamente ✅
6. Se muestra toast "Foto actualizada" ✅
7. **PERO**: La foto en el dialog seguía siendo la vieja ❌

### **Causa raíz:**
```typescript
// Estado local del componente
const [editingInstructor, setEditingInstructor] = useState<Instructor | null>(null);
const [photoPreview, setPhotoPreview] = useState<string | null>(null);

// Al guardar foto:
onSuccess: () => {
    queryClient.invalidateQueries(); // Refresca la lista
    setPhotoPreview(null);           // Limpia el preview
    // ❌ PERO: editingInstructor seguía con photo_url vieja
}
```

La foto se mostraba así:
```tsx
<img src={photoPreview || editingInstructor.photo_url} />
```

Cuando se limpiaba `photoPreview`, volvía a `editingInstructor.photo_url`, que tenía la URL vieja porque el estado no se actualizó.

### **Solución:**
```typescript
onSuccess: (response) => {
    queryClient.invalidateQueries();
    
    // ✅ Actualizar el estado local inmediatamente
    if (editingInstructor) {
        setEditingInstructor({
            ...editingInstructor,
            photo_url: response.data.photo_url
        });
    }
    
    toast({ title: 'Foto actualizada' });
}
```

Ahora:
1. Se guarda la foto en DB
2. Se actualiza `editingInstructor` con la nueva URL
3. Se limpia `photoPreview`
4. La imagen muestra correctamente la nueva foto

---

## 📝 RUTAS A CONFIGURAR

Asegúrate de agregar estas rutas en tu router:

```typescript
// En App.tsx o donde configures las rutas:
<Route path="/coach/login" element={<CoachLogin />} />
<Route path="/coach/dashboard" element={<CoachDashboard />} />
```

---

## 🎯 CHECKLIST COMPLETO

- [✅] Migración de DB creada
- [✅] Campos `visible_public`, `coach_number`, etc. agregados
- [✅] Función `generate_coach_number()` creada
- [✅] Endpoints de instructors actualizados
- [✅] Endpoints de autenticación de coaches creados
- [✅] Bug de foto en Admin arreglado
- [✅] Admin UI actualizado con campos nuevos
- [✅] Acciones de generar/resetear credenciales
- [✅] Dialog de mostrar credenciales
- [✅] Vista pública filtrada por `visible_public`
- [✅] Página de login de coaches creada
- [✅] Types de TypeScript actualizados
- [✅] Validaciones de seguridad implementadas

---

## 🚨 IMPORTANTE - PRÓXIMOS PASOS

1. **Ejecutar la migración en tu base de datos**
2. **Reiniciar el servidor backend**
3. **Probar el flujo completo:**
   - Crear instructor
   - Subir foto (verificar que se refleja inmediatamente)
   - Generar acceso de coach
   - Copiar credenciales
   - Hacer login como coach
   - Cambiar contraseña temporal
   - Verificar que aparece en sitio público (si `visible_public = true`)

---

## 🎉 RESULTADO FINAL

Ahora tienes un sistema completo de gestión de coaches con:
- ✅ Upload de fotos funcional (bug arreglado)
- ✅ Control de visibilidad pública
- ✅ Generación automática de credenciales
- ✅ Portal de login para coaches
- ✅ Cambio obligatorio de contraseña temporal
- ✅ Admin completo con todas las funciones
- ✅ Seguridad con bcrypt y JWT
- ✅ UI/UX profesional

¡Todo listo para usar! 🚀
