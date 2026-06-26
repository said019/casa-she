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
