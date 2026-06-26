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
