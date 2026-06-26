# Casa Shé — Onboarding Perfilador (Fase 2, sub-proyecto 1) — Diseño

**Fecha:** 2026-06-26
**Estado:** Diseño aprobado, pendiente de plan de implementación
**Alcance:** Primer sub-proyecto de Fase 2. Cada feature de Fase 2 tiene su propio ciclo spec → plan → implementación. Este documento cubre **solo** el cuestionario de onboarding perfilador.

---

## 1. Objetivo

Cuestionario de onboarding que perfila a cada usuaria y le recomienda **qué disciplinas necesita su cuerpo** + **qué paquete le conviene**. Es el diferenciador de marca del PDF de Casa Shé ("dirige a cada usuaria a lo que su cuerpo necesita"). Hoy no existe nada de esto en el código: una usuaria nueva se registra y cae directo al dashboard sin perfil ni recomendación.

### Decisiones de producto (ya aprobadas)
- **Motor de recomendación:** por reglas, determinista (sin API externa). Editable en admin.
- **Obligatoriedad:** gate obligatorio para usuarias nuevas (bloquea la app hasta completarlo, como el reglamento).
- **Resultado:** disciplinas recomendadas + paquete/membresía sugerida.
- **Alcance de usuarias:** nuevas (gate obligatorio) + clientas existentes (invitación descartable, nunca bloqueo).

---

## 2. Catálogo real de Casa Shé (base de la recomendación)

Verificado en el seed de `runStartupMigrations` (`backend/src/index.ts`).

**Disciplinas** (`class_types`, todas `category='multi'`, `level='all'`): un crédito sirve para cualquier clase.

| Disciplina | Duración | Cupo |
|------------|----------|------|
| Pilates Mat | 50 min | 7 |
| Yoga | 60 min | 7 |
| Aeroyoga | 60 min | 6 |
| Telas | 60 min | 6 |
| Taller | 90 min | 7 |

**Paquetes** (`plans`, todos `multi_credits`, vigencia `duration_days`):

| Plan | Créditos | Precio | Vigencia |
|------|----------|--------|----------|
| Clase de prueba | 1 | $150 | 7 días |
| Drop-in | 1 | $280 | 30 días |
| Paquete 5 | 5 | $1,300 | 30 días |
| Paquete 8 | 8 | $2,000 | 30 días |
| Paquete 12 | 12 | $2,880 | 30 días |
| Membresía 360 | 16 | $3,600 | 30 días |
| Membresía Black | 24 | $4,200 | 30 días |

**Insight clave:** como todas las disciplinas comparten el mismo bucket de crédito `multi`, la recomendación se separa limpio: **(a) qué disciplinas** (según objetivo/cuerpo/nivel/intensidad) y **(b) qué paquete** (puro tema de frecuencia/presupuesto). Son independientes.

---

## 3. El cuestionario (6 pasos)

Las claves entre paréntesis (`goal`, `level`, etc.) son las llaves persistidas en `answers`.

**Paso 1 · `goal` — ¿Qué buscas en tu cuerpo ahora mismo?** *(elige 1)*
`tonificar` Tonificar y ganar fuerza · `estres` Bajar el estrés y relajarme · `flexibilidad` Ganar flexibilidad y movilidad · `postura` Mejorar postura / cuidar mi espalda · `probar` Probar algo nuevo y divertirme · `bienestar` Reconectar conmigo / bienestar integral

**Paso 2 · `level` — ¿Cómo te describes moviéndote?** *(elige 1)*
`principiante` Voy empezando · `intermedio` Me muevo de vez en cuando · `avanzada` Soy activa y quiero reto

**Paso 3 · `body_focus` — ¿Qué parte de ti quieres trabajar más?** *(elige hasta 2)*
`core` Core / abdomen · `espalda` Espalda y postura · `brazos` Brazos y tren superior · `piernas` Piernas y glúteos · `mente` Mente / respiración · `todo` Todo por igual

**Paso 4 · `intensity` — ¿Qué tan intenso lo quieres?** *(elige 1)*
`suave` Suave y calmado · `equilibrado` Equilibrado · `retador` Retador e intenso

**Paso 5 · `frequency` — ¿Cuántas veces a la semana te imaginas viniendo?** *(elige 1)*
`probar` Solo quiero probar · `1x` 1x semana · `2x` 2x semana · `3x` 3x semana · `4x` 4+ / casi diario

**Paso 6 · `health` — Para cuidarte mejor, ¿algo que debamos saber?** *(elige las que apliquen + texto libre opcional `health_note`)*
`embarazo` Embarazo / posparto · `lesion` Lesión o molestia · `condicion` Condición médica · `ninguna` Nada por ahora

---

## 4. Lógica de recomendación (reglas deterministas)

Toda esta lógica vive en una función pura `recommend(answers, rules, catalog)` (sin BD), parametrizada por `rules` (editables en admin). Lo de abajo son los **defaults sembrados**.

### 4.1 Disciplinas (puntaje + top 2–3 + 1 "experiencia para atreverte")

Cada disciplina acumula puntos según las respuestas. Pesos default:

| Señal (respuesta) | Pilates Mat | Yoga | Aeroyoga | Telas |
|---|---|---|---|---|
| goal=tonificar | +3 | 0 | +1 | +2 |
| goal=estres | 0 | +3 | +2 | 0 |
| goal=flexibilidad | +1 | +3 | +2 | +1 |
| goal=postura | +3 | +1 | +2 | 0 |
| goal=probar | +1 | +1 | +2 | +3 |
| goal=bienestar | +2 | +3 | +1 | 0 |
| body_focus=core | +3 | +1 | +1 | +1 |
| body_focus=espalda | +3 | +2 | +2 | 0 |
| body_focus=brazos | +1 | 0 | +2 | +3 |
| body_focus=piernas | +2 | +1 | +1 | +1 |
| body_focus=mente | 0 | +3 | +1 | 0 |
| body_focus=todo | +2 | +2 | +2 | +2 |
| intensity=suave | +1 | +2 | 0 | −2 |
| intensity=equilibrado | +1 | +1 | +1 | 0 |
| intensity=retador | +1 | 0 | +1 | +3 |
| level=principiante | +2 | +2 | 0 | −3 |
| level=intermedio | +1 | +1 | +1 | 0 |
| level=avanzada | 0 | 0 | +1 | +2 |

- **Taller** no se puntúa: siempre se ofrece aparte como "experiencia/complemento para atreverte".
- Se ordenan por puntaje (desempate: orden del catálogo Pilates Mat > Yoga > Aeroyoga > Telas). **Regla determinista de cuántas mostrar:** siempre las **top 2**; se agrega la **3ª solo si su puntaje ≥ 40% del puntaje de la 1ª** (si la 3ª quedó muy por debajo, se muestran solo 2). Nunca más de 3.
- Cada disciplina recomendada lleva una frase corta ("por qué para ti") derivada de su señal dominante. El catálogo de frases por disciplina vive en las `rules`.

### 4.2 Overrides de seguridad (se aplican después del puntaje)

- **`embarazo`** → elimina **Telas** y **Aeroyoga** del resultado; fuerza **Pilates Mat** + **Yoga** (variante suave) al top; marca `requires_clearance=true` y muestra *"Para tu seguridad, una instructora confirmará tu aptitud antes de tu primera clase."*
- **`lesion`** → baja el puntaje de **Telas** (−3) y de Aeroyoga (−1); sube Pilates Mat (+2) y Yoga (+1); marca `requires_clearance=true`.
- **`condicion`** → no cambia el puntaje, pero marca `requires_clearance=true`.
- Si `level=principiante`, **Telas** solo aparece si `intensity=retador` (el peso negativo de principiante ya lo empuja fuera salvo que pida reto explícito).

### 4.3 Paquete (frecuencia → plan)

| frequency | Plan recomendado |
|---|---|
| probar | Clase de prueba ($150) |
| 1x | Paquete 5 ($1,300) |
| 2x | Paquete 8 ($2,000) |
| 3x | Paquete 12 ($2,880) |
| 4x | Membresía 360 ($3,600) |

Mapa editable en `rules`. (Membresía Black queda como upsell manual/secundario; no se recomienda por defecto.)

### 4.4 Salida

```
{
  disciplines: [ { class_type_id, name, score, reason } ],   // 2–3, ordenadas
  experience:  { class_type_id, name },                       // Taller
  plan:        { plan_id, name, price },
  requires_clearance: boolean,
  health_flags: { embarazo, lesion, condicion, note }
}
```

### 4.5 Pantalla de resultado

"Esto es lo que tu cuerpo necesita, [nombre]" → tarjetas de disciplinas recomendadas (con "por qué"), la "experiencia para atreverte" (Taller), y el paquete sugerido con **CTA a comprar** (lleva al flujo de checkout existente). Si `requires_clearance`, muestra el aviso de salud. Al cerrar, guarda el perfil y entra a `/app`.

---

## 5. Diseño técnico

Reutiliza patrones existentes: gate de `OnboardingGate`/`ReglamentoGate`, wizard de `Checkout.tsx`, validación Zod, `system_settings` editable por admin, `pg` crudo (sin ORM).

### 5.1 Modelo de datos (migración en `runStartupMigrations`, `backend/src/index.ts`)

Columnas nuevas en `users` (mismo patrón que `reglamento_accepted_at`):
- `onboarding_completed_at TIMESTAMPTZ NULL` — bandera de "ya lo hizo".
- `onboarding_required BOOLEAN NOT NULL DEFAULT true` — al migrar: `UPDATE users SET onboarding_required = false WHERE created_at < NOW()` para que las clientas **existentes** queden invitadas, no bloqueadas. Registros nuevos nacen `true`.
- `onboarding_invite_dismissed_at TIMESTAMPTZ NULL` — para que la invitación a existentes se pueda descartar y no reaparezca.

Tabla nueva `onboarding_responses` (1 fila por usuaria, **upsert** al re-perfilar; `UNIQUE(user_id)`):
- `id UUID PK`, `user_id UUID FK users`, `answers JSONB`, `recommended_disciplines JSONB`, `recommended_experience JSONB`, `recommended_plan_id`, `recommended_plan_name`, `health_flags JSONB`, `requires_clearance BOOLEAN`, `created_at`, `updated_at`.

**Razón de tabla dedicada:** permite re-perfilar y analizar después, y separa el perfil de los datos de contacto. La bandera de gate va en `users` porque es lo que lee el login.

Seed de reglas: `system_settings['onboarding_recommendation_rules']` con los defaults de la sección 4.

### 5.2 Backend — recomendación del lado del servidor (fuente única de verdad)

- **`backend/src/lib/onboarding-recommend.ts`** — función pura `recommend(answers, rules, catalog)`. Sin BD. Toda la lógica de la sección 4. Testeable en aislamiento.
- **`backend/src/routes/onboarding.ts`** (montado en `/api/onboarding`, requiere `authenticate`):
  - `POST /submit` — valida `answers` con Zod; carga `rules` (de `system_settings`) y `catalog` (de `class_types` + `plans`); llama `recommend()`; hace upsert en `onboarding_responses`; setea `users.onboarding_completed_at = NOW()`; **concatena salud a `users.health_notes`** (donde las instructoras ya leen); devuelve la recomendación.
  - `GET /me` — perfil + recomendación guardada (para re-mostrar en dashboard).
  - `POST /dismiss-invite` — setea `onboarding_invite_dismissed_at` (clientas existentes que descartan).
- `GET /api/auth/me` (`backend/src/routes/auth.ts`) debe incluir las 3 columnas nuevas en su SELECT para que el frontend conozca el estado del gate.

### 5.3 Reglas editables por admin

- Viven en `system_settings['onboarding_recommendation_rules']` (JSON), sembradas con los defaults de la sección 4.
- Editables vía el endpoint genérico ya existente `GET/PUT /api/settings/:key`.
- v1 incluye un **editor admin básico** bajo Ajustes (a JSON o formulario simple). Un editor "bonito" es pulido opcional.
- Las **preguntas** del cuestionario van hardcodeadas en frontend en v1 (YAGNI).

### 5.4 El gate (frontend, espejo de `OnboardingGate`)

En `frontend/src/components/AuthGuard.tsx`, después de login:
- Si `role==='client'` **&&** `onboarding_required` **&&** `onboarding_completed_at == null` → renderiza `<ProfilerGate/>` (wizard a pantalla completa) **antes** de `/app`. Bloqueo duro.
- Clientas existentes (`onboarding_required=false`, sin completar, sin descartar) → **banner descartable** en el dashboard que abre el mismo wizard. Nunca bloquea.
- Orden de gates sin conflicto: `temp_password` (OnboardingGate) → **Profiler (entrada a la app)** → reglamento (sigue enforced en la reserva).

Componentes nuevos:
- `frontend/src/pages/client/onboarding/ProfilerWizard.tsx` — 6 pasos, estilo `Checkout.tsx`.
- `frontend/src/pages/client/onboarding/ProfilerResult.tsx` — tarjetas + CTA al paquete.
- `frontend/src/components/ProfilerGate.tsx` — wrapper de pantalla completa.
- Banner de invitación en el dashboard.
- Hooks TanStack Query + funciones de API client.
- `frontend/src/types/auth.ts` — agregar las 3 columnas nuevas al tipo `User`.

### 5.5 Salud / responsabilidad

El Paso 6 alimenta `health_flags` (en `onboarding_responses`) y se concatena a `users.health_notes`. Si hay embarazo/lesión/condición → overrides de seguridad + `requires_clearance` + aviso en el resultado. **No reemplaza al reglamento**: ese gate de aceptación sigue intacto. El perfilador es informativo + recomendación.

---

## 6. Unidades y fronteras

- `lib/onboarding-recommend.ts`: lógica pura, sin dependencias de BD ni HTTP. Entrada: `answers`, `rules`, `catalog`. Salida: objeto de recomendación. **Testeable y sustituible** sin tocar consumidores.
- `routes/onboarding.ts`: capa HTTP — valida, carga datos, llama a `recommend`, persiste, responde. No contiene reglas de negocio de recomendación.
- Migración: añade columnas + tabla + siembra reglas default. Idempotente (mismo patrón que el resto de `runStartupMigrations`).
- Frontend wizard: pasos presentacionales + submit. No calcula la recomendación (la pide al backend).

---

## 7. Testing (TDD)

- **Unit (`onboarding-recommend.ts`)** — es el núcleo, se prueba a fondo:
  - Cada `goal` mapea a la disciplina dominante esperada.
  - Overrides de seguridad: `embarazo` elimina Telas y Aeroyoga y fuerza Pilates Mat + Yoga; `lesion` baja Telas; `requires_clearance` se prende correctamente.
  - `level=principiante` mantiene Telas fuera salvo `intensity=retador`.
  - `frequency` → plan correcto en los 5 casos.
  - Siempre devuelve mínimo 2 disciplinas + 1 experiencia (Taller) + 1 plan.
  - Respuestas en conflicto / `body_focus` con 2 selecciones.
- **Integración (`POST /api/onboarding/submit`)** — persiste la fila, marca `onboarding_completed_at`, escribe `health_notes`, devuelve la recomendación; idempotencia del upsert al re-enviar.

---

## 8. Fuera de alcance (v1)

- Recomendación de instructoras/horarios concretos (era una opción descartada).
- Stamps/tiers de lealtad, recordatorios por email, Wallet — son otros sub-proyectos de Fase 2.
- Editor admin "bonito" del cuestionario (las preguntas son hardcoded en v1; solo las reglas son editables).
- Re-perfilado con histórico (v1 guarda 1 fila por usuaria, upsert).
- Personalización con IA del texto de bienvenida (queda como evolución futura del motor; v1 es 100% por reglas).
