import { useQuery } from '@tanstack/react-query';
import { format, isPast, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { cn } from '@/lib/utils';
import type { BookingClient } from '@/types/booking';

interface BookingRow {
    id: string;
    class_id: string;
    class_name: string;
    class_date: string;
    start_time: string;
    instructor: string;
    status: string;
    waitlist_position: number | null;
}

export default function MyBookings() {
    const { data, isLoading } = useQuery<BookingClient[]>({
        queryKey: ['my-bookings'],
        queryFn: async () => (await api.get('/bookings/my-bookings')).data,
    });

    const bookings: BookingRow[] = (data ?? [])
        .filter((b) => b.booking_status !== 'cancelled')
        .map((b) => ({
            id: b.booking_id,
            class_id: b.class_id,
            class_name: b.class_type_name,
            class_date: b.date,
            start_time: b.start_time,
            instructor: b.instructor_name,
            status: b.booking_status,
            waitlist_position: b.waitlist_position ?? null,
        }));

    const sorted = [...bookings].sort((a, b) =>
        `${a.class_date}T${a.start_time}`.localeCompare(`${b.class_date}T${b.start_time}`)
    );
    const upcoming = sorted.filter((b) => !isPast(parseISO(`${b.class_date}T${b.start_time}`)));
    const past = sorted.filter((b) => isPast(parseISO(`${b.class_date}T${b.start_time}`))).reverse();

    return (
        <AuthGuard requiredRoles={['client']}>
            <ClientLayout>
                <div className="mx-auto max-w-3xl space-y-7 pb-10">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-balance-dark">Mis clases</h1>
                        <p className="mt-1 text-sm text-muted-foreground">Tus próximas reservas y tu historial.</p>
                    </div>

                    {isLoading ? (
                        <p className="text-sm text-muted-foreground">Cargando…</p>
                    ) : (
                        <>
                            <Section title="Próximas" items={upcoming} />
                            <Section title="Pasadas" items={past} dim />
                        </>
                    )}
                </div>
            </ClientLayout>
        </AuthGuard>
    );
}

function Section({
    title,
    items,
    dim = false,
}: {
    title: string;
    items: BookingRow[];
    dim?: boolean;
}) {
    return (
        <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-balance-olive">{title}</h2>

            {items.length === 0 ? (
                <div className="rounded-[1.25rem] border border-dashed border-balance-sand/70 bg-card/50 px-5 py-8 text-center text-sm text-muted-foreground">
                    {dim ? 'Sin clases pasadas todavía.' : 'No tienes clases próximas. Reserva una desde el calendario.'}
                </div>
            ) : (
                <div className={cn('space-y-2.5', dim && 'opacity-70')}>
                    {items.map((b) => {
                        const dt = parseISO(`${b.class_date}T${b.start_time}`);
                        return (
                            <Link
                                key={b.id}
                                to={`/app/classes/${b.id}`}
                                className="flex items-center gap-4 rounded-[1.25rem] border border-balance-sand/60 bg-card px-4 py-3.5 app-soft-shadow transition-colors hover:border-balance-olive/45"
                            >
                                <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-[1rem] bg-balance-olive/12 text-balance-olive">
                                    <span className="text-lg font-bold leading-none tabular-nums">{format(dt, 'd')}</span>
                                    <span className="text-[10px] font-semibold uppercase leading-none mt-0.5">
                                        {format(dt, 'MMM', { locale: es })}
                                    </span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-semibold text-balance-dark">
                                        {b.class_name}
                                        {b.status === 'waitlist' && (
                                            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                                                Lista de espera{b.waitlist_position ? ` · #${b.waitlist_position}` : ''}
                                            </span>
                                        )}
                                    </p>
                                    <p className="truncate text-sm capitalize text-muted-foreground">
                                        {format(dt, 'EEEE', { locale: es })} · {format(dt, 'HH:mm')} · {b.instructor}
                                    </p>
                                </div>
                                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                            </Link>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
