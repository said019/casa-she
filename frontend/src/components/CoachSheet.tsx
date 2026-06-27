import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
    Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Clock, MapPin, CalendarDays, AlertCircle } from 'lucide-react';
import api from '@/lib/api';

interface InstructorDetail {
    id: string;
    display_name: string;
    bio: string | null;
    photo_url: string | null;
    specialties: string[];
    certifications: string[];
    coach_number?: number | null;
    is_active: boolean;
}

interface CoachClass {
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    class_type_name: string;
    class_type_color?: string | null;
    facility_name?: string | null;
    current_bookings: number;
    max_capacity: number;
    status: string;
}

function trimTime(t: string) { return t && t.length >= 5 ? t.slice(0, 5) : (t ?? ''); }
function initials(name: string) {
    return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

export function CoachSheet({
    instructorId, instructorName, onClose, onPickClass,
}: {
    instructorId: string | null;
    instructorName?: string | null;
    onClose: () => void;
    onPickClass?: (classId: string) => void;
}) {
    const open = !!instructorId;

    const { data: coach, isLoading: loadingCoach } = useQuery<InstructorDetail>({
        queryKey: ['public-coach', instructorId],
        queryFn: async () => {
            // Backend list endpoint doesn't expose /:id public; usamos el list y filtramos.
            const res = await api.get('/instructors');
            const list = res.data as InstructorDetail[];
            const found = list.find((c) => c.id === instructorId);
            if (!found) throw new Error('Coach no encontrado');
            return found;
        },
        enabled: open,
    });

    // Próximas clases (14 días) del coach.
    const today = new Date().toISOString().slice(0, 10);
    const in14 = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { data: classes = [], isLoading: loadingClasses } = useQuery<CoachClass[]>({
        queryKey: ['coach-upcoming', instructorId, today],
        queryFn: async () => {
            const res = await api.get(`/classes?start=${today}&end=${in14}&instructorId=${instructorId}`);
            return (res.data as CoachClass[])
                .filter((c) => c.status === 'scheduled')
                .sort((a, b) => `${a.date}T${a.start_time}`.localeCompare(`${b.date}T${b.start_time}`));
        },
        enabled: open && !!instructorId,
    });

    return (
        <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <SheetContent className="w-full sm:max-w-xl overflow-y-auto bg-bmb-cream p-0">
                <SheetHeader className="sr-only">
                    <SheetTitle>{coach?.display_name ?? instructorName ?? 'Coach'}</SheetTitle>
                </SheetHeader>

                {/* ════════ Foto grande full-bleed ════════ */}
                {/* object-top: ancla el recorte arriba para que NUNCA se corte la cara (los
                    retratos llevan la cabeza en la parte superior). max-h en móvil para que la
                    foto no ocupe toda la pantalla y se alcance a ver la bio sin tanto scroll. */}
                <div className="relative aspect-[4/5] max-h-[58vh] w-full overflow-hidden bg-bmb-taupe/40 sm:max-h-[70vh]">
                    {loadingCoach ? (
                        <Skeleton className="h-full w-full" />
                    ) : coach?.photo_url ? (
                        <img
                            src={coach.photo_url}
                            alt={coach.display_name}
                            className="h-full w-full object-cover object-top"
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#ECE1CE_0%,#D6D5C2_100%)]">
                            <span className="font-heading text-[clamp(6rem,18vw,12rem)] font-medium leading-none text-bmb-dark/22">
                                {initials(coach?.display_name ?? instructorName ?? '?')}
                            </span>
                        </div>
                    )}
                    {/* Gradiente para legibilidad del nombre */}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(0deg,rgba(42,33,24,.82)_0%,rgba(42,33,24,0)_100%)]" />
                    <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
                        <h2 className="font-heading text-4xl font-medium leading-[0.96] tracking-[-0.04em] text-bmb-cream sm:text-5xl">
                            {coach?.display_name ?? instructorName ?? '...'}
                        </h2>
                        {coach?.specialties && coach.specialties.length > 0 && (
                            <p className="mt-2 font-body text-xs uppercase tracking-[0.22em] text-bmb-cream/72">
                                {coach.specialties.slice(0, 3).join(' · ')}
                            </p>
                        )}
                    </div>
                </div>

                <div className="space-y-7 p-6 sm:p-8">
                    {/* Bio — whitespace-pre-line respeta los saltos de párrafo (\n\n) de bios largas */}
                    {coach?.bio && (
                        <p className="whitespace-pre-line font-body text-base leading-relaxed text-bmb-dark/82">
                            {coach.bio}
                        </p>
                    )}

                    {/* Certificaciones */}
                    {coach?.certifications && coach.certifications.length > 0 && (
                        <div>
                            <p className="mb-2 font-body text-[10px] uppercase tracking-[0.24em] text-bmb-dark/55">
                                Certificaciones
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {coach.certifications.map((cert, idx) => (
                                    <Badge key={idx} variant="outline" className="border-bmb-gold/50 text-bmb-dark">
                                        {cert}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Próximas clases */}
                    <div>
                        <div className="mb-3 flex items-center justify-between">
                            <p className="font-body text-[10px] uppercase tracking-[0.24em] text-bmb-dark/55">
                                Próximas clases
                            </p>
                            <span className="font-mono text-[10px] text-bmb-dark/45">
                                {classes.length} en 14 días
                            </span>
                        </div>
                        {loadingClasses ? (
                            <div className="space-y-2">
                                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
                            </div>
                        ) : classes.length === 0 ? (
                            <div className="rounded-sm border border-bmb-taupe/50 bg-bmb-taupe/15 p-5 text-center">
                                <CalendarDays className="mx-auto mb-2 h-6 w-6 text-bmb-dark/35" />
                                <p className="font-body text-sm text-bmb-dark/65">
                                    No tiene clases programadas en los próximos 14 días.
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y divide-bmb-taupe/40 overflow-hidden rounded-sm border border-bmb-taupe/50 bg-white/40">
                                {classes.slice(0, 12).map((c) => {
                                    const dateLabel = new Date(c.date + 'T00:00:00').toLocaleDateString('es-MX', {
                                        weekday: 'short', day: 'numeric', month: 'short',
                                    });
                                    const occ = c.max_capacity > 0
                                        ? Math.round((c.current_bookings / c.max_capacity) * 100)
                                        : 0;
                                    const isFull = c.current_bookings >= c.max_capacity;
                                    return (
                                        <button
                                            key={c.id}
                                            onClick={() => onPickClass?.(c.id)}
                                            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bmb-taupe/25"
                                            type="button"
                                        >
                                            <div className="min-w-[68px]">
                                                <p className="font-mono text-sm font-semibold tabular-nums text-bmb-dark">
                                                    {trimTime(c.start_time)}
                                                </p>
                                                <p className="text-[10px] capitalize text-bmb-dark/55">
                                                    {dateLabel}
                                                </p>
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate font-body text-sm font-medium text-bmb-dark">
                                                    {c.class_type_name}
                                                </p>
                                                {c.facility_name && (
                                                    <p className="flex items-center gap-1 text-[11px] text-bmb-dark/60">
                                                        <MapPin className="h-3 w-3" />
                                                        {c.facility_name}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="text-right text-xs">
                                                {isFull ? (
                                                    <Badge variant="outline" className="text-bmb-dark/55">llena</Badge>
                                                ) : (
                                                    <span className={`font-medium ${occ >= 80 ? 'text-emerald-700' : 'text-bmb-dark/70'}`}>
                                                        {c.max_capacity - c.current_bookings} libres
                                                    </span>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* CTA: si el visitante no está logueado, lo mandamos al login con returnUrl al horario */}
                    {classes.length > 0 && (
                        <Button asChild className="w-full bg-bmb-gold text-bmb-dark hover:bg-bmb-deepgold">
                            <Link to="/login">Ver mi horario y reservar</Link>
                        </Button>
                    )}

                    {/* Coach inactivo */}
                    {coach && !coach.is_active && (
                        <div className="flex items-center gap-2 rounded-sm border border-amber-300/50 bg-amber-50/40 p-3 text-sm text-amber-800">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <span>Este coach no está dando clases por ahora.</span>
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
