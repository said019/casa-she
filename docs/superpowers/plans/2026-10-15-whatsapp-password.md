# WhatsApp + contraseña Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax for tracking.

**Goal:** Registrar alumnas sin correo y permitir correo o WhatsApp + contraseña, probado y publicado según autorización explícita del usuario.

**Architecture:** Correo ausente se guarda como NULL (no correos inventados). Un identificador de acceso distingue correo normalizado de teléfono mexicano normalizado; se requiere coincidencia única y contraseña correcta. Alta, recuperación y notificaciones toleran ausencia de correo. Se conservan usuarios, permisos, enlaces de acceso y reglas de reservas.

**Tech Stack:** Express/TypeScript/PostgreSQL, React/Zod, Playwright, Railway.

## Task 1: Backend de identidad y registro

Files: backend/src/types/auth.ts, routes/auth.ts, routes/users.ts, lib/altaRapida.ts, lib/whatsapp.ts o su plantilla existente, nuevo lib/loginIdentity.ts y migración de arranque en index.ts/schema_complete.sql; scripts/test-whatsapp-login.ts.

- [ ] Escribir y ejecutar pruebas HTTP locales antes de modificar producción: alta sin correo debe devolver201, almacenar NULL y login con teléfono+contraseña devolver200; hoy fallará400. Usar levantarServidorLocal y base desechable, sin env de producción.
```ts
assert.equal((await http(api,'POST','/users',adminToken,{displayName:'Phone test',phone:'5512345678',password:'Prueba123!'})).status,201);
assert.equal((await http(api,'POST','/auth/login',undefined,{identifier:'+52 55 1234 5678',password:'Prueba123!'})).status,200);
```
- [ ] Centralizar normalización estricta de teléfono mexicano (10 dígitos, +52 y prefijo legacy521), correo trim/lower y validación de entrada. Nunca truncar números arbitrarios para autenticar. Login/recuperación aceptan identifier y conservan payload legacy email. Coincidencias ambiguas, usuario inactivo y contraseña incorrecta nunca generan sesión. Tokens y respuestas no exponen hash/contraseña.
- [ ] Migración idempotente antes de escuchar: `ALTER TABLE users ALTER COLUMN email DROP NOT NULL;` manteniendo unicidad de correos presentes. Alta rápida, alta independiente y registro público aceptan correo vacío/omitido y requieren teléfono válido; evitan duplicados normalizados incluso con carreras. No fusionar cuentas antiguas automáticamente.
- [ ] Mantener acceso por correo existente. Recuperación por teléfono usa WhatsApp almacenado y mensaje público genérico; no enviar tokens a datos suministrados no asociados. Bienvenida sin correo usa teléfono como usuario y omite email. Revisar reenvíos, perfil y consumidores tipados para no fallar con NULL.
- [ ] Probar alta rápida sin correo, login local/+52/521, correo existente, contraseña incorrecta, inactivos, ambiguos, duplicados y concurrentes, email inválido, teléfono inválido, recuperación genérica y ausencia de secretos. Ejecutar build y suites de alta/access-links/roles.
- [ ] Commit backend; revisión de especificación y calidad.

## Task 2: Formularios y acceso

Files: frontend/src/pages/auth/{Login,Register,ForgotPassword}.tsx, stores/authStore.ts, types/auth.ts, calendario/{RegistrarClienteDialog,DialogoAlumnaNueva}.tsx, formularios de clientes admin/recepción, consumidores de email nullable; e2e/tests/whatsapp-login.spec.ts.

- [ ] Pruebas rojas de navegador: identificador acepta número, altas envían sin correo, email inválido aún bloquea, recuperación pide correo o WhatsApp; conservar pruebas de calendario.
```ts
await page.getByLabel('Correo o WhatsApp').fill('5512345678');
await page.getByLabel('Contraseña',{exact:true}).fill('Prueba123!');
await page.getByRole('button',{name:/Entrar/}).click();
```
- [ ] Correo opcional validado si existe; WhatsApp requerido. Login input text/autocomplete username, contraseña sin cambios; misma validación/formato que backend. No prometer código OTP. Recuperación informa correo/WhatsApp. Explicar en alta que podrán entrar con WhatsApp y contraseña; conservar envío/enlace de acceso existente.
- [ ] Evitar crashes y textos falsos con email NULL (perfil, listas, búsqueda). No alterar membresías/paquetes.
- [ ] Build y Playwright escritorio/móvil; commit; revisión de especificación y calidad.

## Task 3: Integración y publicación

- [ ] Ejecutar pruebas reales de backend y regresiones relevantes; revisar diff y pruebas de navegador finales, sin datos artificiales en producción.
- [ ] Push rama, crear/adjuntar PR, esperar checks, merge autorizado a main.
- [ ] Confirmar ambos Railway SUCCESS con SHA nuevo, API health/BD y frontend sw.js/artefacto. Reportar ruta de uso y resultado real.

## Decisiones y alcance

El usuario aprobó explícitamente WhatsApp + contraseña, correo opcional, implementar/probar/publicar; no se requiere nueva aprobación de diseño. Se reutiliza checkout aislado limpio existente en /private/tmp/casa-oct14.F4GmSG/repo, sin tocar iCloud ni crear worktree nuevo. No OTP, cambio de proveedor, fusión de clientes ni edición manual de cuentas de producción.
