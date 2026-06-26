import assert from 'node:assert/strict';
import { scoreDisciplines, DEFAULT_RULES, type OnboardingAnswers } from '../src/lib/onboarding-recommend.js';
import { recommend, type OnboardingCatalog } from '../src/lib/onboarding-recommend.js';

function names(scored: { name: string; score: number }[]): string[] {
  return scored.map((s) => s.name);
}

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

console.log('test-onboarding-recommend: OK');
