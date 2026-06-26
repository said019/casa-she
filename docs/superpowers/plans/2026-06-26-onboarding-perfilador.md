# Onboarding Perfilador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir un cuestionario de onboarding de 6 pasos que perfila a cada clienta y le recomienda disciplinas + paquete mediante un motor de reglas determinista, con gate obligatorio para nuevas e invitación para existentes.

**Architecture:** Motor de recomendación como **función pura** server-side (`lib/onboarding-recommend.ts`, sin BD, testeable). Una ruta Express (`routes/onboarding.ts`) valida con Zod, carga catálogo (`class_types`+`plans`) y reglas (`system_settings`), llama al motor, persiste en `onboarding_responses` y marca banderas en `users`. El frontend reusa los patrones existentes: gate full-screen estilo `OnboardingGate` (espejo en `AuthGuard`) para nuevas; banner + ruta `/app/onboarding` para existentes. Reglas editables por admin vía el endpoint genérico `/api/settings/:key`.

**Tech Stack:** Node 20 + TypeScript ESM + Express 4 + `pg` (sin ORM) + Zod (backend); React + Vite + react-router-dom v6 + Zustand + TanStack Query + axios (frontend). Tests: scripts `tsx` con `node:assert/strict` (no hay jest/vitest).

## Global Constraints

- **ESM con extensión `.js`:** todo import relativo termina en `.js` aunque el fuente sea `.ts` (ej. `import { query } from '../config/database.js'`). Imports de paquetes sin extensión.
- **DB helpers:** `import { query, queryOne, pool } from '../config/database.js'` — `query<T>(text, params?) => Promise<T[]>`, `queryOne<T>(text, params?) => Promise<T | null>`.
- **Migraciones:** se agregan dentro de `runStartupMigrations()` en `backend/src/index.ts`, cada bloque en su propio `try { ... } catch (e) { console.error('<label>:', e); }`, con `IF NOT EXISTS` para idempotencia. El bloque de seed "Casa Shé v1" debe seguir siendo el último.
- **Rutas backend:** archivo `routes/<name>.ts` que exporta `default Router()`; `authenticate` (y `requireRole(...)` si aplica) por handler, NO en el mount. Import en `index.ts` (~líneas 8-60) y `app.use('/api/<name>', router)` (~líneas 3389-3430).
- **Validación Zod (Convención A):** `Schema.safeParse(req.body)`; en fallo → `res.status(400).json({ error: 'Datos inválidos', details: validation.error.flatten().fieldErrors })`. Error inesperado → `console.error(...)` + `res.status(500).json({ error: '...' })`. Leer usuario como `req.user!.userId` (tras `authenticate`).
- **Catálogo real (no editable aquí):** disciplinas `class_types` = `Pilates Mat, Yoga, Aeroyoga, Telas, Taller` (todas `category='multi'`). Planes `plans` = `Clase de prueba, Drop-in, Paquete 5, Paquete 8, Paquete 12, Membresía 360, Membresía Black`. La recomendación usa Pilates Mat/Yoga/Aeroyoga/Telas para puntaje y **Taller** como "experiencia".
- **Paths frontend exactos:** `AuthGuard.tsx` está en `components/layout/`; el store en `stores/authStore.ts` (plural); `OnboardingGate.tsx`/`ReglamentoGate.tsx` en `components/`. Alias `@/` = `frontend/src/`. API client: `import api, { getErrorMessage } from '@/lib/api'` (axios, JWT automático). Refresh-me = `useAuthStore().checkAuth()`.
- **No sobreescribir datos:** seed de reglas con `ON CONFLICT (key) DO NOTHING`; banderas de salud se **concatenan** a `users.health_notes`, no se reemplazan.

---

## File Structure

**Backend (crear):**
- `backend/src/lib/onboarding-recommend.ts` — tipos, `DEFAULT_RULES`, `scoreDisciplines()`, `recommend()`. Lógica pura, sin BD.
- `backend/src/routes/onboarding.ts` — `POST /submit`, `GET /me`, `POST /dismiss-invite`.
- `backend/scripts/test-onboarding-recommend.ts` — tests puros del motor.
- `backend/scripts/test-onboarding-submit.ts` — test de integración del endpoint (BEGIN/ROLLBACK, requiere DATABASE_URL).

**Backend (modificar):**
- `backend/src/index.ts` — migración (columnas + tabla + seed reglas + backfill) en `runStartupMigrations`; import + mount de la ruta.
- `backend/src/routes/auth.ts` — agregar 3 columnas al SELECT de `GET /me`.
- `backend/package.json` — agregar los 2 scripts de test al chain de `npm test`.

**Frontend (crear):**
- `frontend/src/lib/onboarding.ts` — tipos compartidos + funciones API (submit, getMyProfile, dismissInvite).
- `frontend/src/components/onboarding/ProfilerWizard.tsx` — wizard de 6 pasos + pantalla de resultado (presentacional, recibe `onDone`).
- `frontend/src/components/onboarding/ProfilerGate.tsx` — wrapper full-screen para nuevas (lo usa `AuthGuard`).
- `frontend/src/components/onboarding/ProfilerInviteBanner.tsx` — banner para existentes.
- `frontend/src/pages/client/Onboarding.tsx` — ruta `/app/onboarding` (wizard en modo página).
- `frontend/src/pages/admin/settings/OnboardingRules.tsx` — editor admin básico (JSON) de las reglas.

**Frontend (modificar):**
- `frontend/src/types/auth.ts` — 3 campos nuevos en `User`.
- `frontend/src/components/layout/AuthGuard.tsx` — condición del gate del perfilador.
- `frontend/src/pages/client/Dashboard.tsx` — montar el banner de invitación.
- `frontend/src/App.tsx` — ruta `/app/onboarding` y la del editor admin.

---

## Task 1: Motor — tipos, DEFAULT_RULES y `scoreDisciplines()`

**Files:**
- Create: `backend/src/lib/onboarding-recommend.ts`
- Test: `backend/scripts/test-onboarding-recommend.ts`

**Interfaces:**
- Produces: tipos `Goal, Level, BodyFocus, Intensity, Frequency, HealthFlag, OnboardingAnswers, OnboardingRules`; constante `DEFAULT_RULES: OnboardingRules`; const `SCORED_DISCIPLINES: string[]`; función `scoreDisciplines(answers: OnboardingAnswers, rules: OnboardingRules): { name: string; score: number }[]` (ordenada desc, con overrides de seguridad aplicados y disciplinas excluidas omitidas).

- [ ] **Step 1: Write the failing test**

Create `backend/scripts/test-onboarding-recommend.ts`:

```ts
import assert from 'node:assert/strict';
import { scoreDisciplines, DEFAULT_RULES, type OnboardingAnswers } from '../src/lib/onboarding-recommend.js';

function names(scored: { name: string; score: number }[]): string[] {
  return scored.map((s) => s.name);
}

// (1) Principiante + tonificar + core: Pilates Mat domina; Telas se excluye (principiante sin reto).
{
  const a: OnboardingAnswers = { goal: 'tonificar', level: 'principiante', body_focus: ['core'], intensity: 'equilibrado', frequency: '1x', health: ['ninguna'] };
  const scored = scoreDisciplines(a, DEFAULT_RULES);
  assert.equal(scored[0].name, 'Pilates Mat', 'Pilates Mat debe ser top para tonificar+core+principiante');
  assert.ok(!names(scored).includes('Telas'), 'Telas se excluye para principiante sin intensidad retador');
}

// (2) Embarazo: excluye Telas y Aeroyoga; quedan solo Pilates Mat y Yoga.
{
  const a: OnboardingAnswers = { goal: 'flexibilidad', level: 'intermedio', body_focus: ['espalda'], intensity: 'suave', frequency: '2x', health: ['embarazo'] };
  const scored = scoreDisciplines(a, DEFAULT_RULES);
  assert.deepEqual(new Set(names(scored)), new Set(['Pilates Mat', 'Yoga']), 'embarazo deja solo Pilates Mat + Yoga');
}

// (3) Lesión: baja Telas pero con avanzada+retador+probar sigue arriba; PM sube.
{
  const a: OnboardingAnswers = { goal: 'probar', level: 'avanzada', body_focus: ['brazos'], intensity: 'retador', frequency: '3x', health: ['lesion'] };
  const scored = scoreDisciplines(a, DEFAULT_RULES);
  const telas = scored.find((s) => s.name === 'Telas');
  assert.ok(telas, 'Telas presente para avanzada+retador');
  // lesión aplica Pilates Mat +2: debe estar en el top 3
  assert.ok(names(scored).slice(0, 3).includes('Pilates Mat'), 'lesión sube Pilates Mat al top 3');
}

// (4) Estrés + mente + suave: Yoga domina.
{
  const a: OnboardingAnswers = { goal: 'estres', level: 'intermedio', body_focus: ['mente'], intensity: 'suave', frequency: '1x', health: ['ninguna'] };
  const scored = scoreDisciplines(a, DEFAULT_RULES);
  assert.equal(scored[0].name, 'Yoga', 'Yoga top para estrés+mente+suave');
}

// (5) Orden descendente garantizado.
{
  const a: OnboardingAnswers = { goal: 'probar', level: 'intermedio', body_focus: ['todo'], intensity: 'equilibrado', frequency: '2x', health: ['ninguna'] };
  const scored = scoreDisciplines(a, DEFAULT_RULES);
  for (let i = 1; i < scored.length; i++) {
    assert.ok(scored[i - 1].score >= scored[i].score, 'scored debe ir en orden descendente');
  }
}

console.log('test-onboarding-recommend (scoreDisciplines): OK');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx tsx scripts/test-onboarding-recommend.ts`
Expected: FAIL — `Cannot find module '../src/lib/onboarding-recommend.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/src/lib/onboarding-recommend.ts`:

```ts
// Motor de recomendación del Onboarding Perfilador (Casa Shé).
// Función PURA: sin acceso a BD ni HTTP. Las reglas (pesos, mapeo de planes,
// frases) son editables por admin vía system_settings['onboarding_recommendation_rules'].
// Los overrides de seguridad viven en código (no se editan casualmente).

export type Goal = 'tonificar' | 'estres' | 'flexibilidad' | 'postura' | 'probar' | 'bienestar';
export type Level = 'principiante' | 'intermedio' | 'avanzada';
export type BodyFocus = 'core' | 'espalda' | 'brazos' | 'piernas' | 'mente' | 'todo';
export type Intensity = 'suave' | 'equilibrado' | 'retador';
export type Frequency = 'probar' | '1x' | '2x' | '3x' | '4x';
export type HealthFlag = 'embarazo' | 'lesion' | 'condicion' | 'ninguna';

export interface OnboardingAnswers {
  goal: Goal;
  level: Level;
  body_focus: BodyFocus[];
  intensity: Intensity;
  frequency: Frequency;
  health: HealthFlag[];
  health_note?: string;
}

// Disciplinas que entran al puntaje (Taller se ofrece aparte como "experiencia").
export const SCORED_DISCIPLINES = ['Pilates Mat', 'Yoga', 'Aeroyoga', 'Telas'] as const;
export type ScoredDiscipline = (typeof SCORED_DISCIPLINES)[number];

type WeightRow = Record<ScoredDiscipline, number>;

export interface OnboardingRules {
  goal: Record<Goal, WeightRow>;
  body_focus: Record<BodyFocus, WeightRow>;
  intensity: Record<Intensity, WeightRow>;
  level: Record<Level, WeightRow>;
  planByFrequency: Record<Frequency, string>;
  reasons: Record<ScoredDiscipline, string>;
  thirdDisciplineThreshold: number; // fracción del top para mostrar la 3ª (0.4)
}

const W = (pm: number, y: number, a: number, t: number): WeightRow => ({
  'Pilates Mat': pm, Yoga: y, Aeroyoga: a, Telas: t,
});

export const DEFAULT_RULES: OnboardingRules = {
  goal: {
    tonificar: W(3, 0, 1, 2),
    estres: W(0, 3, 2, 0),
    flexibilidad: W(1, 3, 2, 1),
    postura: W(3, 1, 2, 0),
    probar: W(1, 1, 2, 3),
    bienestar: W(2, 3, 1, 0),
  },
  body_focus: {
    core: W(3, 1, 1, 1),
    espalda: W(3, 2, 2, 0),
    brazos: W(1, 0, 2, 3),
    piernas: W(2, 1, 1, 1),
    mente: W(0, 3, 1, 0),
    todo: W(2, 2, 2, 2),
  },
  intensity: {
    suave: W(1, 2, 0, -2),
    equilibrado: W(1, 1, 1, 0),
    retador: W(1, 0, 1, 3),
  },
  level: {
    principiante: W(2, 2, 0, -3),
    intermedio: W(1, 1, 1, 0),
    avanzada: W(0, 0, 1, 2),
  },
  planByFrequency: {
    probar: 'Clase de prueba',
    '1x': 'Paquete 5',
    '2x': 'Paquete 8',
    '3x': 'Paquete 12',
    '4x': 'Membresía 360',
  },
  reasons: {
    'Pilates Mat': 'Control, core y postura desde el primer día.',
    Yoga: 'Baja el estrés y gana flexibilidad y calma.',
    Aeroyoga: 'Descomprime tu espalda y prueba algo nuevo en el aire.',
    Telas: 'Fuerza y reto en tela aérea para atreverte.',
  },
  thirdDisciplineThreshold: 0.4,
};

const EXCLUDED = Number.NEGATIVE_INFINITY;

/**
 * Puntúa las 4 disciplinas según las respuestas, aplica overrides de seguridad,
 * elimina las excluidas y devuelve el resto ordenado por puntaje desc.
 * Desempate: orden del catálogo (Pilates Mat > Yoga > Aeroyoga > Telas).
 */
export function scoreDisciplines(
  answers: OnboardingAnswers,
  rules: OnboardingRules,
): { name: string; score: number }[] {
  const scores: Record<ScoredDiscipline, number> = { 'Pilates Mat': 0, Yoga: 0, Aeroyoga: 0, Telas: 0 };

  for (const d of SCORED_DISCIPLINES) {
    scores[d] += rules.goal[answers.goal][d];
    scores[d] += rules.intensity[answers.intensity][d];
    scores[d] += rules.level[answers.level][d];
    for (const bf of answers.body_focus) {
      scores[d] += rules.body_focus[bf][d];
    }
  }

  const health = new Set(answers.health);

  // Override: principiante sin intensidad retador → Telas fuera.
  if (answers.level === 'principiante' && answers.intensity !== 'retador') {
    scores.Telas = EXCLUDED;
  }
  // Override: lesión → baja Telas/Aeroyoga, sube Pilates Mat/Yoga.
  if (health.has('lesion')) {
    if (scores.Telas !== EXCLUDED) scores.Telas -= 3;
    if (scores.Aeroyoga !== EXCLUDED) scores.Aeroyoga -= 1;
    scores['Pilates Mat'] += 2;
    scores.Yoga += 1;
  }
  // Override: embarazo → fuera Telas y Aeroyoga (quedan Pilates Mat + Yoga).
  if (health.has('embarazo')) {
    scores.Telas = EXCLUDED;
    scores.Aeroyoga = EXCLUDED;
  }

  const order = (name: string) => SCORED_DISCIPLINES.indexOf(name as ScoredDiscipline);
  return SCORED_DISCIPLINES.map((name) => ({ name, score: scores[name] }))
    .filter((s) => s.score !== EXCLUDED)
    .sort((x, y) => (y.score - x.score) || (order(x.name) - order(y.name)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx tsx scripts/test-onboarding-recommend.ts`
Expected: PASS — `test-onboarding-recommend (scoreDisciplines): OK`

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/onboarding-recommend.ts backend/scripts/test-onboarding-recommend.ts
git commit -m "feat(onboarding): motor de puntaje de disciplinas + reglas default (TDD)"
```

---

## Task 2: Motor — `recommend()` (composición: disciplinas + experiencia + plan + salud)

**Files:**
- Modify: `backend/src/lib/onboarding-recommend.ts`
- Modify: `backend/scripts/test-onboarding-recommend.ts`

**Interfaces:**
- Consumes: `scoreDisciplines`, `DEFAULT_RULES`, `OnboardingAnswers`, `OnboardingRules` (Task 1).
- Produces: tipos `OnboardingCatalog`, `RecommendedDiscipline`, `Recommendation`; función `recommend(answers: OnboardingAnswers, rules: OnboardingRules, catalog: OnboardingCatalog): Recommendation`.

- [ ] **Step 1: Write the failing test** — append to `backend/scripts/test-onboarding-recommend.ts` (before the final `console.log` of that block is fine; add a new block + final log):

```ts
import { recommend, type OnboardingCatalog } from '../src/lib/onboarding-recommend.js';

const CATALOG: OnboardingCatalog = {
  disciplines: {
    'Pilates Mat': { id: 'ct-pm' }, Yoga: { id: 'ct-yoga' }, Aeroyoga: { id: 'ct-aero' },
    Telas: { id: 'ct-telas' }, Taller: { id: 'ct-taller' },
  },
  plans: {
    'Clase de prueba': { id: 'pl-prueba', price: 150 }, 'Paquete 5': { id: 'pl-5', price: 1300 },
    'Paquete 8': { id: 'pl-8', price: 2000 }, 'Paquete 12': { id: 'pl-12', price: 2880 },
    'Membresía 360': { id: 'pl-360', price: 3600 },
  },
};

// (6) Devuelve mínimo 2 disciplinas, Taller como experiencia, plan por frecuencia, ids del catálogo.
{
  const a: OnboardingAnswers = { goal: 'tonificar', level: 'principiante', body_focus: ['core'], intensity: 'equilibrado', frequency: '1x', health: ['ninguna'] };
  const rec = recommend(a, DEFAULT_RULES, CATALOG);
  assert.ok(rec.disciplines.length >= 2, 'mínimo 2 disciplinas');
  assert.equal(rec.disciplines[0].class_type_id, 'ct-pm', 'id mapeado desde catálogo');
  assert.ok(rec.disciplines[0].reason.length > 0, 'cada disciplina lleva su frase');
  assert.equal(rec.experience?.name, 'Taller', 'experiencia = Taller');
  assert.equal(rec.plan.name, 'Paquete 5', '1x → Paquete 5');
  assert.equal(rec.plan.plan_id, 'pl-5');
  assert.equal(rec.requires_clearance, false);
}

// (7) Mapeo frecuencia → plan en los 5 casos.
{
  const cases: Array<[OnboardingAnswers['frequency'], string]> = [
    ['probar', 'Clase de prueba'], ['1x', 'Paquete 5'], ['2x', 'Paquete 8'], ['3x', 'Paquete 12'], ['4x', 'Membresía 360'],
  ];
  for (const [freq, plan] of cases) {
    const a: OnboardingAnswers = { goal: 'bienestar', level: 'intermedio', body_focus: ['todo'], intensity: 'equilibrado', frequency: freq, health: ['ninguna'] };
    assert.equal(recommend(a, DEFAULT_RULES, CATALOG).plan.name, plan, `${freq} → ${plan}`);
  }
}

// (8) Embarazo → requires_clearance y solo Pilates Mat + Yoga.
{
  const a: OnboardingAnswers = { goal: 'flexibilidad', level: 'intermedio', body_focus: ['espalda'], intensity: 'suave', frequency: '2x', health: ['embarazo'], health_note: 'Semana 14' };
  const rec = recommend(a, DEFAULT_RULES, CATALOG);
  assert.equal(rec.requires_clearance, true, 'embarazo exige clearance');
  assert.deepEqual(new Set(rec.disciplines.map((d) => d.name)), new Set(['Pilates Mat', 'Yoga']));
  assert.equal(rec.health_flags.embarazo, true);
  assert.equal(rec.health_flags.note, 'Semana 14');
}

// (9) 3ª disciplina solo si score >= 40% del top.
{
  const a: OnboardingAnswers = { goal: 'probar', level: 'avanzada', body_focus: ['brazos'], intensity: 'retador', frequency: '3x', health: ['ninguna'] };
  const rec = recommend(a, DEFAULT_RULES, CATALOG);
  assert.ok(rec.disciplines.length >= 2 && rec.disciplines.length <= 3, 'entre 2 y 3 disciplinas');
}
```

And change the existing final line `console.log('test-onboarding-recommend (scoreDisciplines): OK');` to a single final line at the very end of the file:

```ts
console.log('test-onboarding-recommend: OK');
```

(Move all imports to the top of the file; tsx requires imports before use.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx tsx scripts/test-onboarding-recommend.ts`
Expected: FAIL — `recommend` / `OnboardingCatalog` no exportados.

- [ ] **Step 3: Write minimal implementation** — append to `backend/src/lib/onboarding-recommend.ts`:

```ts
export interface OnboardingCatalog {
  disciplines: Record<string, { id: string }>; // por nombre, incluye 'Taller'
  plans: Record<string, { id: string; price: number }>; // por nombre
}

export interface RecommendedDiscipline {
  class_type_id: string | null;
  name: string;
  score: number;
  reason: string;
}

export interface Recommendation {
  disciplines: RecommendedDiscipline[];
  experience: { class_type_id: string | null; name: string } | null;
  plan: { plan_id: string | null; name: string; price: number | null };
  requires_clearance: boolean;
  health_flags: { embarazo: boolean; lesion: boolean; condicion: boolean; note: string | null };
}

export function recommend(
  answers: OnboardingAnswers,
  rules: OnboardingRules,
  catalog: OnboardingCatalog,
): Recommendation {
  const scored = scoreDisciplines(answers, rules);

  // Selección 2–3: siempre top 2; la 3ª solo si score >= threshold * topScore (con top > 0).
  const top = scored.slice(0, 2);
  if (scored.length >= 3) {
    const topScore = scored[0].score;
    const third = scored[2];
    if (topScore > 0 && third.score >= rules.thirdDisciplineThreshold * topScore) {
      top.push(third);
    }
  }

  const disciplines: RecommendedDiscipline[] = top.map((s) => ({
    class_type_id: catalog.disciplines[s.name]?.id ?? null,
    name: s.name,
    score: s.score,
    reason: rules.reasons[s.name as ScoredDiscipline] ?? '',
  }));

  const experience = catalog.disciplines['Taller']
    ? { class_type_id: catalog.disciplines['Taller'].id, name: 'Taller' }
    : null;

  const planName = rules.planByFrequency[answers.frequency];
  const planRow = catalog.plans[planName];
  const plan = { plan_id: planRow?.id ?? null, name: planName, price: planRow?.price ?? null };

  const health = new Set(answers.health);
  const health_flags = {
    embarazo: health.has('embarazo'),
    lesion: health.has('lesion'),
    condicion: health.has('condicion'),
    note: answers.health_note?.trim() || null,
  };
  const requires_clearance = health_flags.embarazo || health_flags.lesion || health_flags.condicion;

  return { disciplines, experience, plan, requires_clearance, health_flags };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx tsx scripts/test-onboarding-recommend.ts`
Expected: PASS — `test-onboarding-recommend: OK`

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/onboarding-recommend.ts backend/scripts/test-onboarding-recommend.ts
git commit -m "feat(onboarding): recommend() compone disciplinas+experiencia+plan+salud (TDD)"
```

---

## Task 3: Migración — columnas en `users`, tabla `onboarding_responses`, seed de reglas, backfill

**Files:**
- Modify: `backend/src/index.ts` (dentro de `runStartupMigrations`, **justo antes** del bloque final `try { ... } catch (e) { console.error('Casa Shé v1 seed error:', e); }`)

**Interfaces:**
- Produces: columnas `users.onboarding_completed_at`, `users.onboarding_required`, `users.onboarding_invite_dismissed_at`; tabla `onboarding_responses`; `system_settings['onboarding_recommendation_rules']`.

- [ ] **Step 1: Add the migration block**

Insertar este bloque dentro de `runStartupMigrations()`, inmediatamente antes del bloque de seed "Casa Shé v1" (el que termina con `console.error('Casa Shé v1 seed error:', e)`). Importar `DEFAULT_RULES` al inicio de `index.ts` junto a los demás imports de `lib`:

```ts
import { DEFAULT_RULES as ONBOARDING_DEFAULT_RULES } from './lib/onboarding-recommend.js';
```

Bloque de migración:

```ts
    // === Onboarding Perfilador (Fase 2) ===
    try {
      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ`);
      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_required BOOLEAN NOT NULL DEFAULT true`);
      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_invite_dismissed_at TIMESTAMPTZ`);

      await query(`CREATE TABLE IF NOT EXISTS onboarding_responses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        answers JSONB NOT NULL,
        recommended_disciplines JSONB NOT NULL,
        recommended_experience JSONB,
        recommended_plan_id UUID,
        recommended_plan_name TEXT,
        health_flags JSONB,
        requires_clearance BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);

      // Backfill UNA sola vez: clientas existentes quedan invitadas, no bloqueadas.
      const backfilled = await queryOne<{ x: number }>(
        `SELECT 1 AS x FROM system_settings WHERE key='onboarding_backfill_v1'`
      );
      if (!backfilled) {
        await query(`UPDATE users SET onboarding_required = false WHERE created_at < NOW()`);
        await query(
          `INSERT INTO system_settings (key, value, description)
           VALUES ('onboarding_backfill_v1', 'true'::jsonb, 'Marca: backfill de onboarding_required ejecutado')
           ON CONFLICT (key) DO NOTHING`
        );
      }

      // Seed de reglas (no sobreescribe ediciones del admin).
      await query(
        `INSERT INTO system_settings (key, value, description)
         VALUES ('onboarding_recommendation_rules', $1::jsonb, 'Reglas del motor del onboarding perfilador (editables)')
         ON CONFLICT (key) DO NOTHING`,
        [JSON.stringify(ONBOARDING_DEFAULT_RULES)]
      );
      console.log('Onboarding Perfilador: columnas, tabla y reglas aseguradas.');
    } catch (e) { console.error('Onboarding Perfilador migration error:', e); }
```

- [ ] **Step 2: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS (sin errores). Esto verifica que el import y el bloque compilan; la creación real de tablas se valida al arrancar contra una BD.

- [ ] **Step 3: Commit**

```bash
git add backend/src/index.ts
git commit -m "feat(onboarding): migración columnas users + tabla onboarding_responses + seed reglas"
```

---

## Task 4: Ruta backend `onboarding.ts` + mount + columnas en `GET /me`

**Files:**
- Create: `backend/src/routes/onboarding.ts`
- Modify: `backend/src/index.ts` (import + mount)
- Modify: `backend/src/routes/auth.ts` (3 columnas en el SELECT de `/me`)
- Test: `backend/scripts/test-onboarding-submit.ts`

**Interfaces:**
- Consumes: `recommend`, `DEFAULT_RULES`, `OnboardingCatalog`, `OnboardingRules` (Tasks 1-2); `query`, `queryOne`; `authenticate`.
- Produces: `POST /api/onboarding/submit`, `GET /api/onboarding/me`, `POST /api/onboarding/dismiss-invite`.

- [ ] **Step 1: Write the route file**

Create `backend/src/routes/onboarding.ts`:

```ts
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import {
  recommend, DEFAULT_RULES,
  type OnboardingAnswers, type OnboardingRules, type OnboardingCatalog,
} from '../lib/onboarding-recommend.js';

const router = Router();

const SubmitSchema = z.object({
  goal: z.enum(['tonificar', 'estres', 'flexibilidad', 'postura', 'probar', 'bienestar']),
  level: z.enum(['principiante', 'intermedio', 'avanzada']),
  body_focus: z.array(z.enum(['core', 'espalda', 'brazos', 'piernas', 'mente', 'todo'])).min(1).max(2),
  intensity: z.enum(['suave', 'equilibrado', 'retador']),
  frequency: z.enum(['probar', '1x', '2x', '3x', '4x']),
  health: z.array(z.enum(['embarazo', 'lesion', 'condicion', 'ninguna'])).min(1),
  health_note: z.string().max(500).optional(),
});

async function loadCatalog(): Promise<OnboardingCatalog> {
  const cts = await query<{ id: string; name: string }>(
    `SELECT id, name FROM class_types WHERE name = ANY($1::text[])`,
    [['Pilates Mat', 'Yoga', 'Aeroyoga', 'Telas', 'Taller']]
  );
  const plans = await query<{ id: string; name: string; price: number }>(
    `SELECT id, name, price FROM plans WHERE name = ANY($1::text[])`,
    [['Clase de prueba', 'Paquete 5', 'Paquete 8', 'Paquete 12', 'Membresía 360']]
  );
  const disciplines: OnboardingCatalog['disciplines'] = {};
  for (const c of cts) disciplines[c.name] = { id: c.id };
  const planMap: OnboardingCatalog['plans'] = {};
  for (const p of plans) planMap[p.name] = { id: p.id, price: Number(p.price) };
  return { disciplines, plans: planMap };
}

async function loadRules(): Promise<OnboardingRules> {
  const row = await queryOne<{ value: OnboardingRules }>(
    `SELECT value FROM system_settings WHERE key = 'onboarding_recommendation_rules'`
  );
  return row?.value ?? DEFAULT_RULES;
}

function buildHealthSummary(answers: OnboardingAnswers): string {
  const labels: Record<string, string> = { embarazo: 'Embarazo/posparto', lesion: 'Lesión o molestia', condicion: 'Condición médica' };
  const flags = answers.health.filter((h) => h !== 'ninguna').map((h) => labels[h]).filter(Boolean);
  if (flags.length === 0 && !answers.health_note?.trim()) return '';
  const today = new Date().toISOString().slice(0, 10);
  const parts = [`[Perfil ${today}]`, flags.join(', ')].filter(Boolean);
  if (answers.health_note?.trim()) parts.push(`Nota: ${answers.health_note.trim()}`);
  return '\n' + parts.join(' ');
}

router.post('/submit', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const validation = SubmitSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Datos inválidos', details: validation.error.flatten().fieldErrors });
    }
    const answers = validation.data as OnboardingAnswers;

    const [catalog, rules] = await Promise.all([loadCatalog(), loadRules()]);
    const rec = recommend(answers, rules, catalog);

    await query(
      `INSERT INTO onboarding_responses
         (user_id, answers, recommended_disciplines, recommended_experience, recommended_plan_id, recommended_plan_name, health_flags, requires_clearance)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id) DO UPDATE SET
         answers = EXCLUDED.answers,
         recommended_disciplines = EXCLUDED.recommended_disciplines,
         recommended_experience = EXCLUDED.recommended_experience,
         recommended_plan_id = EXCLUDED.recommended_plan_id,
         recommended_plan_name = EXCLUDED.recommended_plan_name,
         health_flags = EXCLUDED.health_flags,
         requires_clearance = EXCLUDED.requires_clearance,
         updated_at = NOW()`,
      [
        userId, JSON.stringify(answers), JSON.stringify(rec.disciplines), JSON.stringify(rec.experience),
        rec.plan.plan_id, rec.plan.name, JSON.stringify(rec.health_flags), rec.requires_clearance,
      ]
    );

    const healthSummary = buildHealthSummary(answers);
    await query(
      `UPDATE users
         SET onboarding_completed_at = COALESCE(onboarding_completed_at, NOW()),
             health_notes = NULLIF(TRIM(BOTH E'\\n' FROM COALESCE(health_notes, '') || $2), ''),
             updated_at = NOW()
       WHERE id = $1`,
      [userId, healthSummary]
    );

    res.json({ recommendation: rec });
  } catch (error) {
    console.error('Onboarding submit error:', error);
    res.status(500).json({ error: 'No se pudo guardar tu perfil' });
  }
});

router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const row = await queryOne<any>(
      `SELECT answers, recommended_disciplines, recommended_experience, recommended_plan_id,
              recommended_plan_name, health_flags, requires_clearance, created_at, updated_at
       FROM onboarding_responses WHERE user_id = $1`,
      [req.user!.userId]
    );
    res.json({ profile: row ?? null });
  } catch (error) {
    console.error('Onboarding me error:', error);
    res.status(500).json({ error: 'Error al obtener el perfil' });
  }
});

router.post('/dismiss-invite', authenticate, async (req: Request, res: Response) => {
  try {
    await query(
      `UPDATE users SET onboarding_invite_dismissed_at = COALESCE(onboarding_invite_dismissed_at, NOW()), updated_at = NOW()
       WHERE id = $1`,
      [req.user!.userId]
    );
    const row = await queryOne<{ onboarding_invite_dismissed_at: string }>(
      `SELECT onboarding_invite_dismissed_at FROM users WHERE id = $1`,
      [req.user!.userId]
    );
    res.json({ onboarding_invite_dismissed_at: row?.onboarding_invite_dismissed_at ?? null });
  } catch (error) {
    console.error('Onboarding dismiss error:', error);
    res.status(500).json({ error: 'Error al descartar la invitación' });
  }
});

export default router;
```

- [ ] **Step 2: Mount the route in `index.ts`**

Agregar el import junto a los demás de `./routes/*.js` (~líneas 8-60):

```ts
import onboardingRoutes from './routes/onboarding.js';
```

Agregar el mount en el bloque de `app.use('/api/...')` (~líneas 3389-3399):

```ts
app.use('/api/onboarding', onboardingRoutes);
```

- [ ] **Step 3: Add the 3 columns to `GET /me` in `auth.ts`**

En `backend/src/routes/auth.ts`, en el SELECT del handler `GET /me` (~línea 306), agregar las columnas justo después de `u.reglamento_accepted_at,`:

```ts
                u.reglamento_accepted_at,
                u.onboarding_completed_at, u.onboarding_required, u.onboarding_invite_dismissed_at,
```

(No se requiere más: el `...user` ya las propaga a `response.user`.)

- [ ] **Step 4: Write the integration test** — Create `backend/scripts/test-onboarding-submit.ts`:

```ts
import assert from 'node:assert/strict';
import { pool } from '../src/config/database.js';
import { recommend, DEFAULT_RULES, type OnboardingAnswers, type OnboardingCatalog } from '../src/lib/onboarding-recommend.js';

// Verifica end-to-end la persistencia que hace POST /submit, dentro de una transacción que se revierte.
async function main() {
  const c = await pool.connect();
  const one = async (s: string, p: any[] = []) => (await c.query(s, p)).rows[0];
  try {
    await c.query('BEGIN');

    const user = await one(
      `INSERT INTO users (email, password_hash, display_name, phone, role, is_active)
       VALUES ($1, 'x', 'Test Perfil', '0000000000', 'client', true) RETURNING id`,
      [`perfil-test-${Math.floor(process.hrtime()[1])}@test.local`]
    );

    const cts = (await c.query(`SELECT id, name FROM class_types WHERE name = ANY($1::text[])`,
      [['Pilates Mat', 'Yoga', 'Aeroyoga', 'Telas', 'Taller']])).rows;
    const plans = (await c.query(`SELECT id, name, price FROM plans WHERE name = ANY($1::text[])`,
      [['Clase de prueba', 'Paquete 5', 'Paquete 8', 'Paquete 12', 'Membresía 360']])).rows;
    assert.ok(cts.length >= 4, 'faltan class_types sembrados (corre el server una vez contra esta BD)');

    const catalog: OnboardingCatalog = { disciplines: {}, plans: {} };
    for (const r of cts) catalog.disciplines[r.name] = { id: r.id };
    for (const r of plans) catalog.plans[r.name] = { id: r.id, price: Number(r.price) };

    const answers: OnboardingAnswers = { goal: 'tonificar', level: 'principiante', body_focus: ['core'], intensity: 'equilibrado', frequency: '1x', health: ['ninguna'] };
    const rec = recommend(answers, DEFAULT_RULES, catalog);

    await c.query(
      `INSERT INTO onboarding_responses (user_id, answers, recommended_disciplines, recommended_experience, recommended_plan_id, recommended_plan_name, health_flags, requires_clearance)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (user_id) DO UPDATE SET answers=EXCLUDED.answers, updated_at=NOW()`,
      [user.id, JSON.stringify(answers), JSON.stringify(rec.disciplines), JSON.stringify(rec.experience), rec.plan.plan_id, rec.plan.name, JSON.stringify(rec.health_flags), rec.requires_clearance]
    );
    await c.query(`UPDATE users SET onboarding_completed_at = NOW() WHERE id = $1`, [user.id]);

    const saved = await one(`SELECT recommended_plan_name FROM onboarding_responses WHERE user_id = $1`, [user.id]);
    assert.equal(saved.recommended_plan_name, 'Paquete 5', 'persiste el plan recomendado');
    const u = await one(`SELECT onboarding_completed_at FROM users WHERE id = $1`, [user.id]);
    assert.ok(u.onboarding_completed_at, 'marca onboarding_completed_at');

    await c.query('ROLLBACK');
    console.log('test-onboarding-submit: OK');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('test-onboarding-submit: FAIL'); console.error(e); process.exitCode = 1;
  } finally {
    c.release(); await pool.end();
  }
}
main();
```

- [ ] **Step 5: Run typecheck + integration test**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS.

Run (requiere `DATABASE_URL` y haber arrancado el server una vez contra esa BD para sembrar catálogo): `cd backend && npx tsx scripts/test-onboarding-submit.ts`
Expected: PASS — `test-onboarding-submit: OK`. (Si no hay BD disponible, basta el typecheck; anota que el test de integración queda pendiente de un entorno con Postgres.)

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/onboarding.ts backend/src/index.ts backend/src/routes/auth.ts backend/scripts/test-onboarding-submit.ts
git commit -m "feat(onboarding): rutas /api/onboarding (submit, me, dismiss) + columnas en /me"
```

---

## Task 5: `npm test` incluye los tests del onboarding

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Append the two scripts to the `test` chain**

En `backend/package.json`, al final del valor de `"test"` (antes de la comilla de cierre), agregar:

```
 && tsx scripts/test-onboarding-recommend.ts && tsx scripts/test-onboarding-submit.ts
```

(El de `-recommend` es puro y siempre corre; el de `-submit` requiere BD, igual que los demás `*-integration` ya presentes en el chain.)

- [ ] **Step 2: Verify the pure test runs via the chain entry**

Run: `cd backend && npx tsx scripts/test-onboarding-recommend.ts`
Expected: PASS — `test-onboarding-recommend: OK`

- [ ] **Step 3: Commit**

```bash
git add backend/package.json
git commit -m "test(onboarding): agrega los tests del perfilador a npm test"
```

---

## Task 6: Frontend — tipos + API client del onboarding

**Files:**
- Modify: `frontend/src/types/auth.ts`
- Create: `frontend/src/lib/onboarding.ts`

**Interfaces:**
- Produces: campos nuevos en `User`; tipos `OnboardingAnswers`, `Recommendation`; funciones `submitOnboarding(answers)`, `getMyOnboarding()`, `dismissOnboardingInvite()`.

- [ ] **Step 1: Add the 3 fields to `User`**

En `frontend/src/types/auth.ts`, antes del `}` de cierre de `interface User` (después de `reglamento_accepted_at?: string | null;`):

```ts
    // Onboarding perfilador (Fase 2)
    onboarding_completed_at?: string | null;
    onboarding_required?: boolean;
    onboarding_invite_dismissed_at?: string | null;
```

- [ ] **Step 2: Create the API client module**

Create `frontend/src/lib/onboarding.ts`:

```ts
import api from '@/lib/api';

export type Goal = 'tonificar' | 'estres' | 'flexibilidad' | 'postura' | 'probar' | 'bienestar';
export type Level = 'principiante' | 'intermedio' | 'avanzada';
export type BodyFocus = 'core' | 'espalda' | 'brazos' | 'piernas' | 'mente' | 'todo';
export type Intensity = 'suave' | 'equilibrado' | 'retador';
export type Frequency = 'probar' | '1x' | '2x' | '3x' | '4x';
export type HealthFlag = 'embarazo' | 'lesion' | 'condicion' | 'ninguna';

export interface OnboardingAnswers {
  goal: Goal;
  level: Level;
  body_focus: BodyFocus[];
  intensity: Intensity;
  frequency: Frequency;
  health: HealthFlag[];
  health_note?: string;
}

export interface Recommendation {
  disciplines: { class_type_id: string | null; name: string; score: number; reason: string }[];
  experience: { class_type_id: string | null; name: string } | null;
  plan: { plan_id: string | null; name: string; price: number | null };
  requires_clearance: boolean;
  health_flags: { embarazo: boolean; lesion: boolean; condicion: boolean; note: string | null };
}

export async function submitOnboarding(answers: OnboardingAnswers): Promise<Recommendation> {
  const res = await api.post('/onboarding/submit', answers);
  return res.data.recommendation as Recommendation;
}

export async function getMyOnboarding() {
  const res = await api.get('/onboarding/me');
  return res.data.profile as { recommended_disciplines: Recommendation['disciplines'] } | null;
}

export async function dismissOnboardingInvite(): Promise<void> {
  await api.post('/onboarding/dismiss-invite');
}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/auth.ts frontend/src/lib/onboarding.ts
git commit -m "feat(onboarding): tipos User + API client del perfilador (frontend)"
```

---

## Task 7: Frontend — `ProfilerWizard` (6 pasos + resultado)

**Files:**
- Create: `frontend/src/components/onboarding/ProfilerWizard.tsx`

**Interfaces:**
- Consumes: `submitOnboarding`, `OnboardingAnswers`, `Recommendation` (Task 6); `useAuthStore` (`checkAuth`); `api`/`getErrorMessage`; UI (`Button`, `useToast`).
- Produces: `export function ProfilerWizard({ onDone }: { onDone: () => void })`. Renderiza los 6 pasos + resultado; al terminar llama `onDone()`.

- [ ] **Step 1: Create the wizard component**

Create `frontend/src/components/onboarding/ProfilerWizard.tsx`:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, ChevronRight, ArrowLeft } from 'lucide-react';
import { getErrorMessage } from '@/lib/api';
import {
  submitOnboarding, type OnboardingAnswers, type Recommendation,
  type Goal, type Level, type BodyFocus, type Intensity, type Frequency, type HealthFlag,
} from '@/lib/onboarding';

type Step = 'goal' | 'level' | 'body' | 'intensity' | 'frequency' | 'health' | 'result';
const STEPS: Step[] = ['goal', 'level', 'body', 'intensity', 'frequency', 'health'];

const GOALS: { v: Goal; label: string }[] = [
  { v: 'tonificar', label: 'Tonificar y ganar fuerza' },
  { v: 'estres', label: 'Bajar el estrés y relajarme' },
  { v: 'flexibilidad', label: 'Ganar flexibilidad y movilidad' },
  { v: 'postura', label: 'Mejorar postura / cuidar mi espalda' },
  { v: 'probar', label: 'Probar algo nuevo y divertirme' },
  { v: 'bienestar', label: 'Reconectar conmigo / bienestar integral' },
];
const LEVELS: { v: Level; label: string }[] = [
  { v: 'principiante', label: 'Voy empezando' },
  { v: 'intermedio', label: 'Me muevo de vez en cuando' },
  { v: 'avanzada', label: 'Soy activa y quiero reto' },
];
const BODY: { v: BodyFocus; label: string }[] = [
  { v: 'core', label: 'Core / abdomen' },
  { v: 'espalda', label: 'Espalda y postura' },
  { v: 'brazos', label: 'Brazos y tren superior' },
  { v: 'piernas', label: 'Piernas y glúteos' },
  { v: 'mente', label: 'Mente / respiración' },
  { v: 'todo', label: 'Todo por igual' },
];
const INTENSITY: { v: Intensity; label: string }[] = [
  { v: 'suave', label: 'Suave y calmado' },
  { v: 'equilibrado', label: 'Equilibrado' },
  { v: 'retador', label: 'Retador e intenso' },
];
const FREQ: { v: Frequency; label: string }[] = [
  { v: 'probar', label: 'Solo quiero probar' },
  { v: '1x', label: '1 vez por semana' },
  { v: '2x', label: '2 veces por semana' },
  { v: '3x', label: '3 veces por semana' },
  { v: '4x', label: '4 o más / casi diario' },
];
const HEALTH: { v: HealthFlag; label: string }[] = [
  { v: 'embarazo', label: 'Embarazo / posparto' },
  { v: 'lesion', label: 'Lesión o molestia' },
  { v: 'condicion', label: 'Condición médica' },
  { v: 'ninguna', label: 'Nada por ahora' },
];

const TITLES: Record<Step, string> = {
  goal: '¿Qué buscas en tu cuerpo ahora mismo?',
  level: '¿Cómo te describes moviéndote?',
  body: '¿Qué parte de ti quieres trabajar más?',
  intensity: '¿Qué tan intenso lo quieres?',
  frequency: '¿Cuántas veces a la semana te imaginas viniendo?',
  health: 'Para cuidarte mejor, ¿algo que debamos saber?',
  result: 'Esto es lo que tu cuerpo necesita',
};

export function ProfilerWizard({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('goal');
  const [goal, setGoal] = useState<Goal | null>(null);
  const [level, setLevel] = useState<Level | null>(null);
  const [body, setBody] = useState<BodyFocus[]>([]);
  const [intensity, setIntensity] = useState<Intensity | null>(null);
  const [frequency, setFrequency] = useState<Frequency | null>(null);
  const [health, setHealth] = useState<HealthFlag[]>([]);
  const [healthNote, setHealthNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [rec, setRec] = useState<Recommendation | null>(null);

  const idx = STEPS.indexOf(step as Exclude<Step, 'result'>);

  const toggleBody = (v: BodyFocus) => {
    setBody((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : (prev.length >= 2 ? prev : [...prev, v]));
  };
  const toggleHealth = (v: HealthFlag) => {
    setHealth((prev) => {
      if (v === 'ninguna') return prev.includes('ninguna') ? [] : ['ninguna'];
      const next = prev.filter((x) => x !== 'ninguna');
      return next.includes(v) ? next.filter((x) => x !== v) : [...next, v];
    });
  };

  const canNext = (): boolean => {
    if (step === 'goal') return !!goal;
    if (step === 'level') return !!level;
    if (step === 'body') return body.length >= 1;
    if (step === 'intensity') return !!intensity;
    if (step === 'frequency') return !!frequency;
    if (step === 'health') return health.length >= 1;
    return true;
  };

  const goBack = () => {
    if (idx > 0) setStep(STEPS[idx - 1]);
  };

  const submit = async () => {
    if (!goal || !level || !intensity || !frequency) return;
    setSubmitting(true);
    try {
      const answers: OnboardingAnswers = {
        goal, level, body_focus: body, intensity, frequency, health,
        health_note: healthNote.trim() || undefined,
      };
      const result = await submitOnboarding(answers);
      setRec(result);
      setStep('result');
    } catch (err) {
      toast({ variant: 'destructive', title: 'No se pudo guardar', description: getErrorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const next = () => {
    if (step === 'health') { submit(); return; }
    setStep(STEPS[idx + 1]);
  };

  const Option = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" onClick={onClick}
      className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition ${active ? 'border-bmb-ink bg-bmb-ink text-white' : 'border-bmb-ink/15 bg-white hover:border-bmb-ink/40'}`}>
      {children}
    </button>
  );

  if (step === 'result' && rec) {
    return (
      <div className="mx-auto w-full max-w-md">
        <h1 className="font-heading text-2xl text-bmb-ink">{TITLES.result}</h1>
        <p className="mt-1 text-sm text-bmb-ink/60">Tu plan, hecho a tu medida.</p>
        <div className="mt-5 space-y-3">
          {rec.disciplines.map((d) => (
            <div key={d.name} className="rounded-xl border border-bmb-ink/10 bg-white p-4">
              <p className="font-medium text-bmb-ink">{d.name}</p>
              <p className="text-sm text-bmb-ink/60">{d.reason}</p>
            </div>
          ))}
          {rec.experience && (
            <div className="rounded-xl border border-dashed border-bmb-ink/20 bg-white p-4">
              <p className="text-sm text-bmb-ink/70">Para atreverte: <strong>{rec.experience.name}</strong></p>
            </div>
          )}
        </div>
        <div className="mt-5 rounded-xl border border-bmb-ink/10 bg-bmb-cream p-4">
          <p className="text-sm text-bmb-ink/70">Tu paquete sugerido</p>
          <p className="font-heading text-xl text-bmb-ink">{rec.plan.name}{rec.plan.price ? ` · $${rec.plan.price}` : ''}</p>
        </div>
        {rec.requires_clearance && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            Para tu seguridad, una instructora confirmará tu aptitud antes de tu primera clase.
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2">
          <Button onClick={() => { onDone(); navigate('/app/checkout'); }} className="w-full">Ver mi paquete</Button>
          <Button variant="ghost" onClick={() => { onDone(); navigate('/app'); }} className="w-full">Entrar a Casa Shé</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-4 flex items-center gap-3">
        {idx > 0 && (
          <button type="button" onClick={goBack} className="rounded-full p-1.5 text-bmb-ink/60 hover:bg-bmb-ink/5"><ArrowLeft className="h-5 w-5" /></button>
        )}
        <span className="text-xs text-bmb-ink/50">Paso {idx + 1} de {STEPS.length}</span>
      </div>
      <h1 className="font-heading text-2xl text-bmb-ink">{TITLES[step]}</h1>

      <div className="mt-5 space-y-2.5">
        {step === 'goal' && GOALS.map((o) => <Option key={o.v} active={goal === o.v} onClick={() => setGoal(o.v)}>{o.label}</Option>)}
        {step === 'level' && LEVELS.map((o) => <Option key={o.v} active={level === o.v} onClick={() => setLevel(o.v)}>{o.label}</Option>)}
        {step === 'body' && (<>
          <p className="text-xs text-bmb-ink/50">Elige hasta 2.</p>
          {BODY.map((o) => <Option key={o.v} active={body.includes(o.v)} onClick={() => toggleBody(o.v)}>{o.label}</Option>)}
        </>)}
        {step === 'intensity' && INTENSITY.map((o) => <Option key={o.v} active={intensity === o.v} onClick={() => setIntensity(o.v)}>{o.label}</Option>)}
        {step === 'frequency' && FREQ.map((o) => <Option key={o.v} active={frequency === o.v} onClick={() => setFrequency(o.v)}>{o.label}</Option>)}
        {step === 'health' && (<>
          {HEALTH.map((o) => <Option key={o.v} active={health.includes(o.v)} onClick={() => toggleHealth(o.v)}>{o.label}</Option>)}
          <textarea value={healthNote} onChange={(e) => setHealthNote(e.target.value)} placeholder="¿Algo más que debamos saber? (opcional)"
            className="mt-2 w-full rounded-xl border border-bmb-ink/15 px-4 py-3 text-sm" rows={2} />
        </>)}
      </div>

      <Button onClick={next} disabled={!canNext() || submitting} className="mt-6 w-full">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : (<>{step === 'health' ? 'Ver mi recomendación' : 'Continuar'}<ChevronRight className="ml-1 h-4 w-4" /></>)}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS. (Si `@/components/ui/button`, `use-toast` u otros difieren en nombre, ajustar imports a los reales del repo — confirmados como existentes en `OnboardingGate.tsx`.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/onboarding/ProfilerWizard.tsx
git commit -m "feat(onboarding): ProfilerWizard de 6 pasos + pantalla de resultado"
```

---

## Task 8: Frontend — `ProfilerGate` + condición en `AuthGuard` (gate obligatorio)

**Files:**
- Create: `frontend/src/components/onboarding/ProfilerGate.tsx`
- Modify: `frontend/src/components/layout/AuthGuard.tsx`

**Interfaces:**
- Consumes: `ProfilerWizard` (Task 7); `useAuthStore` (`checkAuth`); campos `User.onboarding_required` / `onboarding_completed_at` (Task 6).
- Produces: `export function ProfilerGate()` (full-screen). Tras completar el wizard, llama `checkAuth()` para refrescar al usuario y desmontar el gate.

- [ ] **Step 1: Create `ProfilerGate.tsx`**

Create `frontend/src/components/onboarding/ProfilerGate.tsx`:

```tsx
import { useAuthStore } from '@/stores/authStore';
import { ProfilerWizard } from '@/components/onboarding/ProfilerWizard';

/**
 * Gate obligatorio del perfilador para clientas nuevas.
 * Se muestra desde AuthGuard cuando role==='client' && onboarding_required && !onboarding_completed_at.
 * Al terminar el wizard, checkAuth() refresca al usuario (onboarding_completed_at deja de ser null)
 * y AuthGuard desmonta este gate automáticamente.
 */
export function ProfilerGate() {
  const { checkAuth } = useAuthStore();
  return (
    <div className="flex min-h-screen items-center justify-center bg-bmb-cream px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-bmb-ink/10 bg-white p-7 shadow-xl">
        <ProfilerWizard onDone={() => { void checkAuth(); }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the gate into `AuthGuard.tsx`**

En `frontend/src/components/layout/AuthGuard.tsx`, agregar el import junto al de `OnboardingGate` (línea 6):

```tsx
import { ProfilerGate } from '@/components/onboarding/ProfilerGate';
```

Y agregar la condición **justo después** del bloque `if (user?.temp_password) { return <OnboardingGate />; }` (línea ~804), antes del `return children ? ...`:

```tsx
    // Perfilador obligatorio para clientas nuevas: bloquea la app hasta completarlo.
    if (user?.role === 'client' && user?.onboarding_required && !user?.onboarding_completed_at) {
        return <ProfilerGate />;
    }
```

- [ ] **Step 3: Typecheck + manual verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

Manual (requiere backend corriendo): registrar una clienta nueva → tras login debe aparecer el wizard a pantalla completa y NO poder entrar a `/app` hasta completarlo. Al terminar, cae a `/app` o `/app/checkout`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/onboarding/ProfilerGate.tsx frontend/src/components/layout/AuthGuard.tsx
git commit -m "feat(onboarding): ProfilerGate + gate obligatorio en AuthGuard para nuevas"
```

---

## Task 9: Frontend — invitación a existentes (banner + ruta `/app/onboarding`)

**Files:**
- Create: `frontend/src/components/onboarding/ProfilerInviteBanner.tsx`
- Create: `frontend/src/pages/client/Onboarding.tsx`
- Modify: `frontend/src/pages/client/Dashboard.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `ProfilerWizard` (Task 7); `dismissOnboardingInvite` (Task 6); `useAuthStore`; `AuthGuard` + `ClientLayout` (wrappers de página).
- Produces: banner que aparece para clientas existentes sin perfil ni descarte; ruta `/app/onboarding`.

- [ ] **Step 1: Create the invite banner**

Create `frontend/src/components/onboarding/ProfilerInviteBanner.tsx`:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { dismissOnboardingInvite } from '@/lib/onboarding';
import { X } from 'lucide-react';

/**
 * Invitación (no bloqueante) a clientas existentes para completar su perfil.
 * Visible cuando: role client, onboarding_required=false, sin completar y sin descartar.
 */
export function ProfilerInviteBanner() {
  const { user, checkAuth } = useAuthStore();
  const navigate = useNavigate();
  const [hidden, setHidden] = useState(false);

  const show = user?.role === 'client'
    && user?.onboarding_required === false
    && !user?.onboarding_completed_at
    && !user?.onboarding_invite_dismissed_at;

  if (!show || hidden) return null;

  const dismiss = async () => {
    setHidden(true);
    try { await dismissOnboardingInvite(); await checkAuth(); } catch { /* noop */ }
  };

  return (
    <div className="relative mb-4 rounded-2xl border border-bmb-ink/10 bg-bmb-cream p-4">
      <button onClick={dismiss} className="absolute right-3 top-3 text-bmb-ink/40 hover:text-bmb-ink"><X className="h-4 w-4" /></button>
      <p className="font-heading text-lg text-bmb-ink">Descubre lo que tu cuerpo necesita</p>
      <p className="mt-0.5 text-sm text-bmb-ink/60">Responde 6 preguntas y te recomendamos tus disciplinas y tu paquete ideal.</p>
      <Button onClick={() => navigate('/app/onboarding')} className="mt-3">Hacer mi perfil</Button>
    </div>
  );
}
```

- [ ] **Step 2: Create the page route component**

Create `frontend/src/pages/client/Onboarding.tsx`:

```tsx
import { useNavigate } from 'react-router-dom';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { useAuthStore } from '@/stores/authStore';
import { ProfilerWizard } from '@/components/onboarding/ProfilerWizard';

export default function Onboarding() {
  const navigate = useNavigate();
  const { checkAuth } = useAuthStore();
  return (
    <AuthGuard requiredRoles={['client']}>
      <ClientLayout>
        <div className="py-6">
          <ProfilerWizard onDone={() => { void checkAuth(); navigate('/app'); }} />
        </div>
      </ClientLayout>
    </AuthGuard>
  );
}
```

(Confirmar el nombre del export de `ClientLayout` — el probe lo ubica en `components/layout/ClientLayout.tsx`. Si es default export, ajustar el import a `import ClientLayout from '...'`.)

- [ ] **Step 3: Mount the banner in the dashboard**

En `frontend/src/pages/client/Dashboard.tsx`, importar y renderizar el banner cerca del inicio del contenido (después del header del dashboard):

```tsx
import { ProfilerInviteBanner } from '@/components/onboarding/ProfilerInviteBanner';
```

```tsx
        <ProfilerInviteBanner />
```

(Colocarlo dentro del contenedor principal del dashboard, antes de las secciones existentes.)

- [ ] **Step 4: Register the route in `App.tsx`**

Import (cerca de la línea 43, junto a los demás `import ... from "./pages/client/..."`):

```tsx
import ClientOnboarding from "./pages/client/Onboarding";
```

Ruta (dentro del bloque `{/* Client Routes */}`, ~líneas 227-247):

```tsx
<Route path="/app/onboarding" element={<ClientOnboarding />} />
```

- [ ] **Step 5: Typecheck + manual verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

Manual: con una clienta existente (registrada antes del deploy, `onboarding_required=false`) → en el dashboard aparece el banner; "Hacer mi perfil" abre `/app/onboarding`; al completar cae a `/app`; "X" lo descarta y no reaparece.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/onboarding/ProfilerInviteBanner.tsx frontend/src/pages/client/Onboarding.tsx frontend/src/pages/client/Dashboard.tsx frontend/src/App.tsx
git commit -m "feat(onboarding): invitación a existentes (banner + ruta /app/onboarding)"
```

---

## Task 10: Admin — editor básico de reglas del motor

**Files:**
- Create: `frontend/src/pages/admin/settings/OnboardingRules.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `api` (`GET/PUT /settings/onboarding_recommendation_rules`); `AuthGuard` (admin); UI.
- Produces: ruta `/admin/settings/onboarding` con un editor JSON de las reglas.

- [ ] **Step 1: Create the admin editor page**

Create `frontend/src/pages/admin/settings/OnboardingRules.tsx`:

```tsx
import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '@/lib/api';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';

/**
 * Editor básico (JSON) de las reglas del onboarding perfilador.
 * Lee/escribe system_settings['onboarding_recommendation_rules'] vía el endpoint genérico de settings.
 */
export default function OnboardingRules() {
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/settings/onboarding_recommendation_rules');
        setText(JSON.stringify(res.data.value, null, 2));
      } catch (err) {
        toast({ variant: 'destructive', title: 'No se pudieron cargar las reglas', description: getErrorMessage(err) });
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  const save = async () => {
    let parsed: unknown;
    try { parsed = JSON.parse(text); }
    catch { toast({ variant: 'destructive', title: 'JSON inválido', description: 'Revisa la sintaxis.' }); return; }
    setSaving(true);
    try {
      await api.put('/settings/onboarding_recommendation_rules', { value: parsed });
      toast({ title: 'Reglas guardadas' });
    } catch (err) {
      toast({ variant: 'destructive', title: 'No se pudo guardar', description: getErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthGuard requiredRoles={['admin', 'super_admin']} allowElevated>
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="font-heading text-2xl">Reglas del onboarding perfilador</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pesos por disciplina, mapeo de paquetes y frases. Edita con cuidado (JSON).</p>
        {loading ? <Loader2 className="mt-6 h-6 w-6 animate-spin" /> : (
          <>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={24}
              className="mt-4 w-full rounded-xl border border-bmb-ink/15 p-4 font-mono text-xs" spellCheck={false} />
            <Button onClick={save} disabled={saving} className="mt-3">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar reglas'}
            </Button>
          </>
        )}
      </div>
    </AuthGuard>
  );
}
```

- [ ] **Step 2: Register the admin route in `App.tsx`**

Import (junto a otras páginas admin):

```tsx
import AdminOnboardingRules from "./pages/admin/settings/OnboardingRules";
```

Ruta (en el bloque de rutas admin):

```tsx
<Route path="/admin/settings/onboarding" element={<AdminOnboardingRules />} />
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/admin/settings/OnboardingRules.tsx frontend/src/App.tsx
git commit -m "feat(onboarding): editor admin básico de reglas del perfilador"
```

---

## Task 11: Verificación end-to-end + actualizar PROXIMOS-PASOS

**Files:**
- Modify: `PROXIMOS-PASOS.md`

- [ ] **Step 1: Full build**

Run: `cd backend && npx tsc --noEmit && npm test`
Expected: el typecheck pasa; `test-onboarding-recommend: OK` aparece (los tests con BD requieren `DATABASE_URL`).

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: build sin errores.

- [ ] **Step 2: Manual smoke (con backend + BD)**

1. Arranca backend (siembra catálogo + reglas + columnas) y frontend.
2. Registra una clienta nueva → aparece el wizard obligatorio; complétalo → ves la recomendación → entras a `/app`.
3. Marca embarazo en el Paso 6 → la recomendación excluye Telas/Aeroyoga y muestra el aviso de aptitud.
4. Como admin, abre `/admin/settings/onboarding`, cambia un peso, guarda; vuelve a perfilar otra clienta y verifica que cambió.

- [ ] **Step 3: Update the Fase 2 doc**

En `PROXIMOS-PASOS.md`, en la sección "Fase 2", marcar el ítem del cuestionario perfilador como hecho:

```
- [x] **Cuestionario de onboarding perfilador** — implementado (gate para nuevas, invitación a existentes, motor por reglas editable en admin). Ver `docs/superpowers/specs/2026-06-26-casa-she-onboarding-perfilador-design.md`.
```

- [ ] **Step 4: Commit**

```bash
git add PROXIMOS-PASOS.md
git commit -m "docs: marca el onboarding perfilador como implementado en Fase 2"
```

---

## Notas de ejecución

- **TDD real** solo aplica al motor puro (Tasks 1-2): test → falla → implementa → pasa. El resto se verifica con `tsc --noEmit` / `npm run build` y smoke manual, porque el proyecto **no tiene framework de tests** y el frontend no tiene tests automatizados.
- Los tests que tocan BD (`test-onboarding-submit`) necesitan `DATABASE_URL` y que el server haya arrancado una vez contra esa BD para sembrar el catálogo (igual que los `*-integration` existentes).
- Si algún nombre de componente UI (`Button`, `ClientLayout`, `use-toast`) difiere del usado aquí, ajustarlo al real del repo — los paths fueron confirmados contra `OnboardingGate.tsx`/`Checkout.tsx`, que ya los importan.
