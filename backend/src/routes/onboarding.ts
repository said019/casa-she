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
