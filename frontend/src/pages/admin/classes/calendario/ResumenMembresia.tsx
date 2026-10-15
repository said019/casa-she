import type { Attendee } from './tipos';

export function ResumenMembresia({ attendee }: { attendee: Attendee }) {
    const summary = attendee.membership_summary;
    const external = ['totalpass', 'fitpass', 'wellhub'].includes(attendee.channel ?? '');
    if (external) return <p className="text-xs text-muted-foreground">Reserva de {attendee.channel} · sin saldo local asociado</p>;
    if (!summary) return <p className="text-xs text-muted-foreground">{attendee.is_free_booking ? 'Reserva de cortesía · sin descuento de crédito' : 'Sin membresía asociada a esta reserva'}</p>;
    const counts = `${summary.attended} ${summary.attended === 1 ? 'asistida' : 'asistidas'} · ${summary.reserved} ${summary.reserved === 1 ? 'reservada' : 'reservadas'}`;
    if (summary.owner_id !== attendee.user_id) return <p className="text-xs text-muted-foreground">Invitada · financiada por la membresía de su anfitrión · {counts}</p>;
    const buckets = [['Salsa', summary.reformer_remaining], ['Clases', summary.multi_remaining]] as const;
    const enabled = buckets.filter(([, value]) => value !== 0);
    const balances = enabled.map(([label, value]) => `${enabled.length > 1 ? `${label}: ` : ''}${value === null ? 'ilimitadas' : `${value} ${value === 1 ? 'disponible' : 'disponibles'}`}`).join(' · ') || '0 disponibles';
    return <p className="mt-1 text-xs text-muted-foreground" data-testid="resumen-membresia">{summary.plan_name} · {counts} · {balances}{summary.end_date ? ` · vence ${summary.end_date.slice(0, 10)}` : ' · sin vencimiento'}</p>;
}
