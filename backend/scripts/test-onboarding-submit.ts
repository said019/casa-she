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
