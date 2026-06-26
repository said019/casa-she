import assert from 'node:assert/strict';
import { pickBestMembership, type CandidateMembership } from '../src/lib/membershipSelection.js';

const base = (o: Partial<CandidateMembership>): CandidateMembership => ({
  id: 'm', reformer_remaining: 0, multi_remaining: 5,
  end_date: '2026-06-01', created_at: '2026-01-01', bound_facility_id: null, ...o,
});

// Multi-only no puede reservar reformer (reformer_remaining = 0)
assert.equal(pickBestMembership([base({ reformer_remaining: 0, multi_remaining: 5 })], 'reformer', null), null);

// Reformer-only sí reserva reformer
assert.equal(
  pickBestMembership([base({ id: 'r', reformer_remaining: 4, multi_remaining: 0 })], 'reformer', null)?.id,
  'r',
);

// Mixta con reformer agotado rechaza reformer aunque queden multi
assert.equal(
  pickBestMembership([base({ reformer_remaining: 0, multi_remaining: 3 })], 'reformer', null),
  null,
);

// Mixta usa el bucket correcto para multi
assert.equal(
  pickBestMembership([base({ id: 'mix', reformer_remaining: 0, multi_remaining: 3 })], 'multi', null)?.id,
  'mix',
);

// Ilimitado en la categoría (NULL) es elegible — reformer
assert.equal(
  pickBestMembership([base({ id: 'full', reformer_remaining: null, multi_remaining: 0 })], 'reformer', null)?.id,
  'full',
);

// Ilimitado en la categoría (NULL) es elegible — multi (simétrico)
assert.equal(
  pickBestMembership([base({ id: 'fullM', reformer_remaining: 0, multi_remaining: null })], 'multi', null)?.id,
  'fullM',
);

// Acotada vence más pronto gana sobre acotada que vence después (misma categoría)
assert.equal(
  pickBestMembership([
    base({ id: 'late', multi_remaining: 5, end_date: '2026-07-01' }),
    base({ id: 'soon', multi_remaining: 5, end_date: '2026-06-01' }),
  ], 'multi', null)?.id,
  'soon',
);

// Acotada gana sobre ilimitada aunque la ilimitada venza antes
assert.equal(
  pickBestMembership([
    base({ id: 'unlim', multi_remaining: null, end_date: '2026-06-01' }),
    base({ id: 'bnd', multi_remaining: 3, end_date: '2026-07-01' }),
  ], 'multi', null)?.id,
  'bnd',
);

// Individual atada al estudio A se excluye si la clase es del estudio B; mixto gana
assert.equal(
  pickBestMembership([
    base({ id: 'indivA', bound_facility_id: 'A', multi_remaining: 5, end_date: '2026-06-01' }),
    base({ id: 'mixto', bound_facility_id: null, multi_remaining: 5, end_date: '2026-07-01' }),
  ], 'multi', 'B')?.id,
  'mixto',
);

// Individual atada al estudio A SÍ se elige cuando la clase es del estudio A y vence antes
assert.equal(
  pickBestMembership([
    base({ id: 'indivA', bound_facility_id: 'A', multi_remaining: 5, end_date: '2026-06-01' }),
    base({ id: 'mixto', bound_facility_id: null, multi_remaining: 5, end_date: '2026-07-01' }),
  ], 'multi', 'A')?.id,
  'indivA',
);

// Empate de end_date → created_at más antiguo gana
assert.equal(
  pickBestMembership([
    base({ id: 'newer', multi_remaining: 5, created_at: '2026-02-01' }),
    base({ id: 'older', multi_remaining: 5, created_at: '2026-01-01' }),
  ], 'multi', null)?.id,
  'older',
);

// Sin candidatos → null
assert.equal(pickBestMembership([], 'multi', 'A'), null);

console.log('test-membership-selection: OK');
