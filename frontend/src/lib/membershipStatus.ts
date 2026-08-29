import { parseLocalDate } from '@/lib/date';

export interface MembershipSchedule {
  status: string | null | undefined;
  start_date?: string | Date | null;
}

/**
 * Una membresía se guarda como `active` desde que se vende, aunque su vigencia
 * comience después. Para presentación esa membresía es "Programada" hasta su
 * fecha de inicio. La comparación es por día local para evitar desfases UTC.
 */
export function isMembershipScheduled(
  membership: MembershipSchedule | null | undefined,
  now: Date = new Date(),
): boolean {
  if (membership?.status !== 'active' || !membership.start_date) return false;

  const start = parseLocalDate(membership.start_date);
  if (Number.isNaN(start.getTime())) return false;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return start.getTime() > today.getTime();
}
