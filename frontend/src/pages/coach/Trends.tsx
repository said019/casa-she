import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, Users, CheckCircle2, AlertCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import CoachLayout from '@/components/layout/CoachLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

interface WeekRow {
    week_start: string;
    week_end: string;
    total_classes: number;
    total_slots: number;
    total_bookings: number;
    total_checkins: number;
    total_noshows: number;
    avg_occupancy_pct: number;
}

interface BusySlot {
    day_of_week: number;
    hour: number;
    avg_pct: number;
    classes_count: number;
}

interface TrendsResponse {
    weeks: WeekRow[];
    busySlots: BusySlot[];
}

function formatHour(h: number) {
    const ampm = h >= 12 ? 'pm' : 'am';
    const display = h % 12 === 0 ? 12 : h % 12;
    return `${display}${ampm}`;
}

function OccupancyBar({ weeks }: { weeks: WeekRow[] }) {
    if (!weeks.length) return null;
    const maxPct = Math.max(...weeks.map((w) => Number(w.avg_occupancy_pct)), 1);
    const BAR_HEIGHT = 120;
    const BAR_WIDTH = 36;
    const GAP = 8;
    const LABEL_HEIGHT = 32;
    const totalWidth = weeks.length * (BAR_WIDTH + GAP);

    return (
        <div className="overflow-x-auto pb-2">
            <svg
                width={totalWidth}
                height={BAR_HEIGHT + LABEL_HEIGHT}
                className="block"
                style={{ minWidth: totalWidth }}
            >
                {weeks.map((w, i) => {
                    const pct = Number(w.avg_occupancy_pct);
                    const barH = Math.max(4, (pct / maxPct) * BAR_HEIGHT);
                    const x = i * (BAR_WIDTH + GAP);
                    const y = BAR_HEIGHT - barH;
                    const dateLabel = format(parseISO(w.week_start), 'd/M', { locale: es });
                    return (
                        <g key={w.week_start}>
                            <rect
                                x={x}
                                y={y}
                                width={BAR_WIDTH}
                                height={barH}
                                rx={5}
                                fill="#AE4836"
                                fillOpacity={0.85}
                            />
                            <text
                                x={x + BAR_WIDTH / 2}
                                y={y - 4}
                                textAnchor="middle"
                                fontSize={9}
                                fill="#AE4836"
                                fontWeight="600"
                            >
                                {pct > 0 ? `${pct}%` : ''}
                            </text>
                            <text
                                x={x + BAR_WIDTH / 2}
                                y={BAR_HEIGHT + 14}
                                textAnchor="middle"
                                fontSize={9}
                                fill="currentColor"
                                className="fill-muted-foreground"
                            >
                                {dateLabel}
                            </text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

export default function CoachTrends() {
    const { user } = useAuthStore();
    const isAdmin = user?.role === 'admin';

    const { data: me } = useQuery({
        queryKey: ['instructor-me', user?.id],
        queryFn: async () => (await api.get('/instructors/me')).data,
        enabled: !!user?.id && !isAdmin,
    });
    const instructorId = me?.id;

    const { data, isLoading, error } = useQuery<TrendsResponse>({
        queryKey: ['coach-trends', instructorId],
        queryFn: async () => (await api.get(`/instructors/${instructorId}/trends`)).data,
        enabled: !!instructorId || isAdmin,
    });

    const weeks = data?.weeks ?? [];
    const busySlots = data?.busySlots ?? [];

    const avgOccupancy =
        weeks.length
            ? Math.round(weeks.reduce((acc, w) => acc + Number(w.avg_occupancy_pct), 0) / weeks.length)
            : 0;
    const bestWeek = weeks.length
        ? weeks.reduce((best, w) => (Number(w.avg_occupancy_pct) > Number(best.avg_occupancy_pct) ? w : best), weeks[0])
        : null;
    const totalCheckins = weeks.reduce((acc, w) => acc + w.total_checkins, 0);
    const totalBookings = weeks.reduce((acc, w) => acc + w.total_bookings, 0);
    const totalNoshows = weeks.reduce((acc, w) => acc + w.total_noshows, 0);
    const noshowRate = totalBookings > 0 ? Math.round((totalNoshows / totalBookings) * 100) : 0;

    return (
        <AuthGuard requiredRoles={['instructor', 'admin']}>
            <CoachLayout>
                <div className="max-w-5xl mx-auto space-y-6">
                    <div>
                        <h1 className="font-heading text-3xl font-bold">Tendencias</h1>
                        <p className="text-muted-foreground">
                            Ocupación y asistencia de las últimas 12 semanas.
                        </p>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {[
                            {
                                label: 'Ocupación promedio',
                                value: isLoading ? null : `${avgOccupancy}%`,
                                icon: TrendingUp,
                                color: 'text-balance-gold',
                                bg: 'bg-balance-gold/10',
                            },
                            {
                                label: 'Mejor semana',
                                value: isLoading || !bestWeek
                                    ? null
                                    : `${bestWeek.avg_occupancy_pct}%`,
                                icon: CheckCircle2,
                                color: 'text-green-600',
                                bg: 'bg-green-500/10',
                            },
                            {
                                label: 'Check-ins totales',
                                value: isLoading ? null : totalCheckins.toString(),
                                icon: Users,
                                color: 'text-balance-gold',
                                bg: 'bg-balance-gold/10',
                            },
                            {
                                label: 'Tasa no-show',
                                value: isLoading ? null : `${noshowRate}%`,
                                icon: AlertCircle,
                                color: 'text-orange-500',
                                bg: 'bg-orange-500/10',
                            },
                        ].map((stat) => (
                            <Card key={stat.label}>
                                <CardContent className="pt-4 pb-3 flex items-center gap-3">
                                    <div className={`h-9 w-9 rounded-xl ${stat.bg} flex items-center justify-center flex-shrink-0`}>
                                        <stat.icon className={`h-4 w-4 ${stat.color}`} />
                                    </div>
                                    <div className="min-w-0">
                                        {stat.value === null ? (
                                            <Skeleton className="h-6 w-12 mb-1" />
                                        ) : (
                                            <p className="font-heading text-2xl font-bold">{stat.value}</p>
                                        )}
                                        <p className="text-xs text-muted-foreground leading-tight">{stat.label}</p>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    {/* Bar chart */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">Ocupación por semana</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {isLoading ? (
                                <div className="flex items-end gap-2 h-32">
                                    {[...Array(8)].map((_, i) => (
                                        <Skeleton
                                            key={i}
                                            className="flex-1 rounded"
                                            style={{ height: `${30 + Math.random() * 70}%` }}
                                        />
                                    ))}
                                </div>
                            ) : weeks.length === 0 ? (
                                <p className="text-center text-muted-foreground py-8 text-sm">
                                    Sin datos de las últimas 12 semanas.
                                </p>
                            ) : (
                                <OccupancyBar weeks={[...weeks].reverse()} />
                            )}
                        </CardContent>
                    </Card>

                    {/* Weekly table */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">Detalle semanal</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm" style={{ minWidth: 480 }}>
                                    <thead>
                                        <tr className="border-b text-xs text-muted-foreground">
                                            <th className="text-left px-4 py-2 font-medium">Semana</th>
                                            <th className="text-right px-4 py-2 font-medium">Clases</th>
                                            <th className="text-right px-4 py-2 font-medium">Check-ins</th>
                                            <th className="text-right px-4 py-2 font-medium">No-shows</th>
                                            <th className="text-right px-4 py-2 font-medium">Ocupación</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {isLoading
                                            ? [...Array(6)].map((_, i) => (
                                                  <tr key={i}>
                                                      {[...Array(5)].map((__, j) => (
                                                          <td key={j} className="px-4 py-3">
                                                              <Skeleton className="h-4 w-full" />
                                                          </td>
                                                      ))}
                                                  </tr>
                                              ))
                                            : weeks.map((w) => (
                                                  <tr key={w.week_start} className="hover:bg-muted/40 transition-colors">
                                                      <td className="px-4 py-3 whitespace-nowrap">
                                                          {format(parseISO(w.week_start), "d MMM", { locale: es })}
                                                          {' – '}
                                                          {format(parseISO(w.week_end), "d MMM", { locale: es })}
                                                      </td>
                                                      <td className="px-4 py-3 text-right">{w.total_classes}</td>
                                                      <td className="px-4 py-3 text-right text-green-600 font-medium">{w.total_checkins}</td>
                                                      <td className="px-4 py-3 text-right text-orange-500">{w.total_noshows}</td>
                                                      <td className="px-4 py-3 text-right">
                                                          <span
                                                              className="font-heading font-bold"
                                                              style={{ color: '#AE4836' }}
                                                          >
                                                              {w.avg_occupancy_pct}%
                                                          </span>
                                                      </td>
                                                  </tr>
                                              ))}
                                    </tbody>
                                </table>
                                {!isLoading && weeks.length === 0 && (
                                    <p className="text-center text-muted-foreground py-8 text-sm">Sin datos.</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Top busy slots */}
                    {(isLoading || busySlots.length > 0) && (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Horarios más llenos</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {isLoading
                                    ? [...Array(5)].map((_, i) => (
                                          <div key={i} className="flex items-center gap-3">
                                              <Skeleton className="h-9 w-20 rounded-xl" />
                                              <Skeleton className="h-3 flex-1 rounded-full" />
                                              <Skeleton className="h-4 w-8" />
                                          </div>
                                      ))
                                    : busySlots.map((slot, i) => (
                                          <div key={i} className="flex items-center gap-3">
                                              <div className="text-sm font-medium w-20 flex-shrink-0">
                                                  {DAY_NAMES[slot.day_of_week]} {formatHour(slot.hour)}
                                              </div>
                                              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                                  <div
                                                      className="h-full rounded-full transition-all"
                                                      style={{
                                                          width: `${slot.avg_pct}%`,
                                                          backgroundColor: '#AE4836',
                                                          opacity: 0.7 + i * 0.06,
                                                      }}
                                                  />
                                              </div>
                                              <span className="text-sm font-heading font-bold text-balance-gold w-12 text-right flex-shrink-0">
                                                  {slot.avg_pct}%
                                              </span>
                                          </div>
                                      ))}
                            </CardContent>
                        </Card>
                    )}
                </div>
            </CoachLayout>
        </AuthGuard>
    );
}
