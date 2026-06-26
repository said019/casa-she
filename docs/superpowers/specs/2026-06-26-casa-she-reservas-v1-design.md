# Casa Shé — Sistema de Reservas · Diseño v1

**Fecha:** 2026-06-26
**Estado:** Aprobado (Fase 1)
**Base:** Fork de [BMB-Studio](https://github.com/said019/BMB-Studio) rebrandeado a Casa Shé.

---

## 1. Contexto

Casa Shé es un studio de wellness para mujeres en Condesa, CDMX (Alfonso Reyes 131).
Hoy su sitio (casashe.mx) vende paquetes como e-commerce ("Añadir al carrito") + WhatsApp,
**sin sistema de reservas real**. Este proyecto construye ese sistema, con la identidad de
marca del PDF de Dos por Tres y las reglas de operación del cuestionario de la clienta.

Reutilizamos la arquitectura de BMB-Studio (un sistema de studio de pilates ya probado:
Express + PostgreSQL + React) y lo adaptamos: marca, reglas, servicios y catálogo de Casa Shé.

## 2. Objetivo de la v1

Que una clienta pueda: registrarse → aceptar reglamento → comprar un paquete/membresía
(Mercado Pago o transferencia) → reservar una clase con cupo limitado → recibir confirmación
y recordatorios → hacer check-in con QR. Y que el estudio administre todo desde un panel.

## 3. Alcance por fases

| Fase | Incluye |
|------|---------|
| **Fase 1 (v1)** | Auth + reglamento · catálogo de clases/horarios · paquetes/membresías + créditos (vigencia 1 mes) · reservas con cupo 6-7 + lista de espera · cancelación 5h / no-show · check-in QR · pagos Mercado Pago + transferencia/efectivo · recordatorios email (Resend) + botón WhatsApp · panel admin · reportes básicos. |
| **Fase 2** | Cuestionario de onboarding perfilador · lealtad (puntos/sellos) · pase QR en Apple/Google Wallet · lineamientos enriquecidos por clase. |
| **Fase 3** | Sitio público rediseñado (replicar/mejorar casashe.mx) · tienda de ropa deportiva · Fuel Bar · eventos privados · WhatsApp API oficial. |

## 4. Sistema de marca (del PDF)

**Colores**
- Verde Casa `#2E4A35` (primario) / oscuro `#16261A`
- Avena `#FBF3DD` (fondo crema)
- Musgo `#B6A43C` (acento mostaza)
- Ciruela `#2E1B22` (oscuro/plum)
- Arcilla `#B5512F` (terracota)
- Arena `#D8D2BC` (beige)

**Tipografía**
- Títulos/subtítulos: **Instrument Serif**
- Cuerpo: **Baskervville**
- Etiquetas/labels: mono (p.ej. una grotesca mono)

**Logo:** wordmark "CASA SHÉ" + símbolo de 4 pétalos (doble S entrelazada) + monograma "CS".
**Voz:** cálida, honesta, directa, poética. Frases: *"la comunidad es la medicina"*, *"nutrir es amar"*,
*"un lugar donde las mujeres vuelven a sí mismas"*. Sin lenguaje agresivo de fitness ni positividad forzada.

## 5. Roles

- **Clienta** — compra, reserva, cancela, check-in, ve su wallet/créditos e historial.
- **Admin / Staff** — gestiona clases, horarios, instructoras, reservas, valida pagos/comprobantes,
  escanea check-in, ve reportes. (BMB tiene roles más granulares; en v1 colapsamos a admin/staff.)

## 6. Funcionalidades v1 y reglas de negocio

1. **Auth + reglamento**: registro/login (JWT + bcrypt). Antes de la primera reserva, la clienta
   debe aceptar el reglamento (se guarda `reglamento_accepted_at`).
2. **Catálogo de clases**: tipos = Pilates Mat, Yoga, Aeroyoga, Telas + Taller (especial). Cada
   `class_type` tiene `guidelines_text` (lineamientos) y capacidad por defecto (6–7).
3. **Horarios (sessions)**: día, hora inicio/fin, instructora, capacidad, lugares disponibles.
   Reglas: L-V 7:00–13:00 y 17:00–22:00; Sáb/Dom 8:00–13:00; talleres fin de semana 14:00–21:00.
4. **Productos + créditos (wallet)**:
   - Clase de prueba $150 · Drop-in $280 · Paquete 5 $1,300 · 8 $2,000 · 12 $2,880
   - Membresía 360 $3,600 y Black $4,200 = **créditos mensuales** (cantidades configurables en admin; a confirmar con clienta).
   - Cada compra genera créditos con **vigencia 1 mes** (`expires_at = compra + 30 días`).
5. **Reservas**:
   - Reservar consume 1 crédito válido si hay cupo. Si está lleno → **lista de espera**.
   - **Cancelación hasta 5h antes** → devuelve el crédito. Menos de 5h o **no-show** → pierde el crédito.
   - Al confirmar/usar el crédito, se muestra el **recordatorio de lineamientos** de esa clase/taller.
6. **Check-in QR**: cada reserva genera un token QR; staff lo escanea para marcar asistencia.
7. **Pagos**:
   - **Mercado Pago** (checkout + webhook que acredita el wallet al confirmarse el pago).
   - **Transferencia**: muestra CLABE/banco/titular; la clienta sube comprobante → admin valida → acredita.
   - **Efectivo** en estudio (registro manual por admin).
8. **Recordatorios**: email automático (Resend) de confirmación, recordatorio 24h y 2h antes,
   y aviso de créditos por vencer. Botón WhatsApp click-to-chat (wa.me) al estudio. Jobs con node-cron.
9. **Panel admin**: CRUD clases/horarios/instructoras, ocupación por sesión, validar check-in y
   comprobantes, gestión de usuarias/créditos/paquetes, reportes (ocupación, ventas, asistencias).

## 7. Arquitectura

Monorepo `casa-she/` → `backend/` + `frontend/` (heredado de BMB).

- **Backend**: Express + TypeScript + PostgreSQL (SQL puro + migraciones) + JWT/bcrypt + Zod +
  node-cron + Resend + Mercado Pago (REST vía axios) + Cloudinary (comprobantes). Deploy Railway.
- **Frontend**: Vite + React 18 + TS + TailwindCSS + shadcn/ui + React Query + Zustand +
  React Router + Framer Motion.

### Modelo de datos (tablas core v1)
`users` · `class_types` · `instructors` · `sessions` · `bookings` · `waitlist` ·
`products` (paquetes/membresías) · `orders` · `credits` (wallet) · `payments` · `settings`.
(El esquema de BMB ya cubre la mayoría; se podan tablas fuera de alcance: payroll, comisiones,
egresos, POS, videos, referrals, reviews, evolution/whatsapp-instances.)

## 8. Trabajo de adaptación (fork → Casa Shé)

1. **Rebrand del frontend**: tokens de color en Tailwind, fuentes (Instrument Serif + Baskervville),
   logo SS, favicon, copy de marca, landing/login con estética editorial Casa Shé.
2. **Podar a v1**: quitar módulos fuera de alcance (payroll, comisiones, POS, videos, dos sedes, etc.).
3. **Datos Casa Shé**: seed de `class_types`, `products`/precios, reglas de horario, instructoras,
   reglamento, lineamientos.
4. **Reglas**: cancelación 5h, vigencia créditos 30 días, cupo 6–7, membresías por créditos mensuales.
5. **Pagos**: configurar Mercado Pago de Casa Shé + datos de transferencia (CLABE/banco/titular).
6. **Una sola sede** (BMB maneja dos): simplificar facility/scope a Condesa.
7. **Correos** con marca Casa Shé (plantillas Resend).

## 9. Lo que necesito de la clienta (para producción)

- Credenciales **Mercado Pago** (access token + public key) de Casa Shé.
- Datos de **transferencia**: CLABE, banco, titular.
- **Cantidad de créditos mensuales** de Membresía 360 y Black (y qué incluyen exactamente).
- **Horario real** con instructoras por clase (para el seed).
- **Reglamento** y **lineamientos** por tipo de clase (textos).
- Archivos de **logo** (SVG) y fuentes con licencia (o usamos las de Google Fonts equivalentes).
- Dominio/subdominio para la app (p.ej. app.casashe.mx) y cuenta de correo para Resend.

## 10. Fuera de alcance v1 (explícito)

Lealtad/sellos · cuestionario onboarding perfilador · Apple/Google Wallet · sitio público
rediseñado · tienda de ropa · Fuel Bar · eventos privados · WhatsApp API oficial · dos sedes ·
payroll/comisiones/POS/videos. (Todo esto vive en Fase 2/3.)
