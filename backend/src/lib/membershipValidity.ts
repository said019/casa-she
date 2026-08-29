export type MembershipDateWindow = {
  status?: string | null;
  start_date?: Date | string | null;
  end_date?: Date | string | null;
};

export type MembershipValidity =
  | { ok: true }
  | {
      ok: false;
      code: 'MEMBERSHIP_NOT_ACTIVE' | 'MEMBERSHIP_NOT_STARTED' | 'MEMBERSHIP_EXPIRED';
      message: string;
    };

export function membershipDateOnly(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).split('T')[0];
}

/**
 * Una membresía pagada puede estar en estado `active` y, aun así, pertenecer a
 * una vigencia futura. La fecha de la clase siempre debe quedar dentro de su
 * ventana inclusiva de inicio/fin.
 */
export function membershipValidityForClassDate(
  membership: MembershipDateWindow,
  classDate: Date | string,
): MembershipValidity {
  const targetDate = membershipDateOnly(classDate);

  if (membership.status !== 'active') {
    return { ok: false, code: 'MEMBERSHIP_NOT_ACTIVE', message: 'La membresía no está activa.' };
  }
  if (membership.start_date && membershipDateOnly(membership.start_date) > targetDate) {
    const start = membershipDateOnly(membership.start_date);
    return {
      ok: false,
      code: 'MEMBERSHIP_NOT_STARTED',
      message: `La membresía inicia el ${start} y no cubre esta clase.`,
    };
  }
  if (membership.end_date && membershipDateOnly(membership.end_date) < targetDate) {
    const end = membershipDateOnly(membership.end_date);
    return {
      ok: false,
      code: 'MEMBERSHIP_EXPIRED',
      message: `La membresía terminó el ${end} y no cubre esta clase.`,
    };
  }
  return { ok: true };
}
