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

// Disciplinas vigentes de Casa Shé que entran al puntaje.
export const SCORED_DISCIPLINES = ['Pilates Mat', 'Barre', 'Sculpt', 'Yoga', 'Flex'] as const;
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

const W = (pm: number, barre: number, sculpt: number, yoga: number, flex: number): WeightRow => ({
  'Pilates Mat': pm, Barre: barre, Sculpt: sculpt, Yoga: yoga, Flex: flex,
});

export const DEFAULT_RULES: OnboardingRules = {
  goal: {
    tonificar: W(3, 3, 3, 0, 1),
    estres: W(1, 0, 0, 3, 3),
    flexibilidad: W(1, 1, 0, 3, 3),
    postura: W(3, 3, 1, 2, 2),
    probar: W(1, 2, 2, 1, 1),
    bienestar: W(2, 1, 1, 3, 2),
  },
  body_focus: {
    core: W(3, 2, 3, 1, 1),
    espalda: W(3, 2, 1, 2, 3),
    brazos: W(1, 2, 3, 0, 1),
    piernas: W(2, 3, 3, 1, 2),
    mente: W(0, 0, 0, 3, 2),
    todo: W(2, 2, 2, 2, 2),
  },
  intensity: {
    suave: W(2, 1, -2, 3, 3),
    equilibrado: W(2, 2, 1, 2, 2),
    retador: W(2, 2, 3, 1, 1),
  },
  level: {
    principiante: W(3, 2, 0, 2, 2),
    intermedio: W(2, 2, 2, 2, 2),
    avanzada: W(1, 2, 3, 2, 2),
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
    Barre: 'Fuerza, postura y piernas con movimientos precisos.',
    Sculpt: 'Trabajo de cuerpo completo para ganar fuerza y definición.',
    Yoga: 'Baja el estrés y gana flexibilidad, enfoque y calma.',
    Flex: 'Movilidad profunda para soltar tensión y ampliar tu rango.',
  },
  thirdDisciplineThreshold: 0.4,
};

const EXCLUDED = Number.NEGATIVE_INFINITY;

/**
 * Puntúa las disciplinas según las respuestas, aplica overrides de seguridad,
 * elimina las excluidas y devuelve el resto ordenado por puntaje desc.
 * Desempate: orden del catálogo oficial.
 */
export function scoreDisciplines(
  answers: OnboardingAnswers,
  rules: OnboardingRules,
): { name: string; score: number }[] {
  const scores: Record<ScoredDiscipline, number> = {
    'Pilates Mat': 0, Barre: 0, Sculpt: 0, Yoga: 0, Flex: 0,
  };

  for (const d of SCORED_DISCIPLINES) {
    scores[d] += rules.goal[answers.goal][d];
    scores[d] += rules.intensity[answers.intensity][d];
    scores[d] += rules.level[answers.level][d];
    for (const bf of answers.body_focus) {
      scores[d] += rules.body_focus[bf][d];
    }
  }

  const health = new Set(answers.health);

  // Una persona principiante que no busca intensidad no recibe Sculpt como primera opción.
  if (answers.level === 'principiante' && answers.intensity !== 'retador') {
    scores.Sculpt = EXCLUDED;
  }
  // Lesión/molestia: baja las opciones más intensas y prioriza control y movilidad.
  if (health.has('lesion')) {
    if (scores.Sculpt !== EXCLUDED) scores.Sculpt -= 4;
    scores.Barre -= 1;
    scores['Pilates Mat'] += 2;
    scores.Yoga += 1;
    scores.Flex += 2;
  }
  // Embarazo/posparto: cualquier recomendación requiere autorización; evita Sculpt.
  if (health.has('embarazo')) {
    scores.Sculpt = EXCLUDED;
    scores.Barre -= 2;
    scores['Pilates Mat'] += 2;
    scores.Yoga += 2;
    scores.Flex += 1;
  }

  const order = (name: string) => SCORED_DISCIPLINES.indexOf(name as ScoredDiscipline);
  return SCORED_DISCIPLINES.map((name) => ({ name, score: scores[name] }))
    .filter((s) => s.score !== EXCLUDED)
    .sort((x, y) => (y.score - x.score) || (order(x.name) - order(y.name)));
}

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

  const experience = catalog.disciplines.Salsa
    ? { class_type_id: catalog.disciplines.Salsa.id, name: 'Salsa' }
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
