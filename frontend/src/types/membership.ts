export interface ClientMembership {
  id: string;
  status: 'active' | 'expired' | 'cancelled' | 'pending_payment' | 'pending_activation' | 'paused';
  start_date: string | null;
  end_date: string | null;
  classes_remaining: number | null;
  // Créditos restantes por categoría (null = ilimitado en esa categoría).
  reformer_remaining?: number | null;
  multi_remaining?: number | null;
  plan_name: string | null;
  plan_price: number | null;
  plan_currency: string | null;
  plan_duration_days: number | null;
  class_limit: number | null;
  // Cupo del PLAN por categoría: >0 = N créditos, null = ilimitado, 0 = la categoría no aplica.
  reformer_credits?: number | null;
  multi_credits?: number | null;
  payment_method?: 'cash' | 'transfer' | 'card' | 'online' | null;
  payment_reference?: string | null;
}

export interface CategoryCredit {
  key: 'reformer' | 'multi' | 'shared';
  label: string;
  remaining: number | null; // null = ilimitado
  total: number | null;     // cupo del plan en esa categoría (null = ilimitado)
  unlimited: boolean;
}

/**
 * Buckets de crédito por categoría que aplican al plan de la membresía.
 * Una categoría se incluye si el plan la ofrece (reformer_credits/multi_credits null=ilimitado
 * o >0); se omite si el plan no la ofrece (cupo 0). null en remaining = ilimitado.
 *
 * Caso BOLSA COMPARTIDA (ej. planes de plataforma): el plan no da créditos por categoría
 * (reformer_credits y multi_credits en null) pero sí un total (class_limit) → son N clases
 * para CUALQUIER tipo. Se muestra un solo bucket "Clases (cualquier tipo)" usando classes_remaining.
 */
export function categoryCredits(m?: ClientMembership | null): CategoryCredit[] {
  if (!m) return [];
  const sharedPool = (m.reformer_credits === null || m.reformer_credits === undefined)
    && (m.multi_credits === null || m.multi_credits === undefined)
    && m.class_limit != null;
  if (sharedPool) {
    return [{
      key: 'shared',
      label: 'Clases (cualquier tipo)',
      remaining: m.classes_remaining ?? null,
      total: m.class_limit ?? null,
      unlimited: m.classes_remaining === null || m.classes_remaining === undefined,
    }];
  }
  const out: CategoryCredit[] = [];
  const includesReformer = m.reformer_credits === null || (m.reformer_credits ?? 0) > 0;
  const includesMulti = m.multi_credits === null || (m.multi_credits ?? 0) > 0;
  if (includesReformer) {
    out.push({
      key: 'reformer', label: 'Salsa',
      remaining: m.reformer_remaining ?? null,
      total: m.reformer_credits ?? null,
      unlimited: m.reformer_remaining === null || m.reformer_remaining === undefined,
    });
  }
  if (includesMulti) {
    out.push({
      key: 'multi', label: 'Clases',
      remaining: m.multi_remaining ?? null,
      total: m.multi_credits ?? null,
      unlimited: m.multi_remaining === null || m.multi_remaining === undefined,
    });
  }
  return out;
}
