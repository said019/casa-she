import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import { fetchMyMembership } from '@/lib/memberships';
import type { BookingClient } from '@/types/booking';
import type { ClientMembership } from '@/types/membership';
import { categoryCredits } from '@/types/membership';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { ProfilerInviteBanner } from '@/components/onboarding/ProfilerInviteBanner';
import { CasaSheMark } from '@/components/CasaSheLogo';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle,
  Calendar,
  Clock,
  Gift,
  ChevronRight,
  Plus,
  Sparkles,
  Play,
  Leaf,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PendingReviewsList } from '@/components/reviews/PendingReviewsList';

interface WalletSummary {
  pointsBalance: number;
}

interface LoyaltyReward {
  id: string;
  name: string;
  points_cost: number;
  is_active: boolean;
  stock: number | null;
}

const statusLabel: Record<ClientMembership['status'], string> = {
  active: 'Activa',
  expired: 'Vencida',
  cancelled: 'Cancelada',
  pending_payment: 'Pago pendiente',
  pending_activation: 'Pendiente',
  paused: 'Pausada',
};

export default function ClientDashboard() {
  const { user } = useAuthStore();

  const { data: membership, isLoading: membershipLoading } = useQuery<ClientMembership | null>({
    queryKey: ['my-membership'],
    queryFn: fetchMyMembership,
  });

  const isExpiredOrCancelled = membership?.status === 'expired' || membership?.status === 'cancelled';
  const isOutOfCredits = membership?.status === 'active' && membership?.class_limit && (membership?.classes_remaining ?? 0) <= 0;

  const { data: bookings, isLoading: bookingsLoading } = useQuery<BookingClient[]>({
    queryKey: ['my-bookings'],
    queryFn: async () => (await api.get('/bookings/my-bookings')).data,
  });

  const { data: walletSummary } = useQuery<WalletSummary>({
    queryKey: ['wallet-pass'],
    queryFn: async () => (await api.get('/wallet/pass')).data,
  });

  const { data: loyaltyRewards, isLoading: loyaltyRewardsLoading } = useQuery<LoyaltyReward[]>({
    queryKey: ['loyalty-rewards'],
    queryFn: async () => (await api.get('/loyalty/rewards')).data,
  });

  const { data: latestVideos } = useQuery<any[]>({
    queryKey: ['latest-videos'],
    queryFn: async () => {
      const { data } = await api.get('/videos', { params: { limit: 4 } });
      return data;
    },
  });

  const upcomingClasses = useMemo(() => {
    if (!bookings) return [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return bookings
      .filter((booking) => booking.booking_status !== 'cancelled')
      .filter((booking) => {
        const classDate = parseISO(booking.date);
        // Show all classes from today onwards (not just future hours)
        return classDate >= today;
      })
      .sort((a, b) => {
        const dateA = parseISO(`${a.date}T${a.start_time}`);
        const dateB = parseISO(`${b.date}T${b.start_time}`);
        return dateA.getTime() - dateB.getTime();
      })
      .slice(0, 2);
  }, [bookings]);

  const membershipEndDate = membership?.end_date ? parseISO(membership.end_date) : null;
  const daysRemaining = membershipEndDate
    ? Math.max(differenceInCalendarDays(membershipEndDate, new Date()), 0)
    : null;
  const classLimit = membership?.class_limit ?? null;
  const classesRemaining = membership?.classes_remaining ?? null;
  const classesProgress = classLimit && classesRemaining !== null
    ? (classesRemaining / classLimit) * 100
    : null;
  const credits = categoryCredits(membership);
  const pointsBalance = walletSummary?.pointsBalance ?? 0;
  const nextReward = useMemo(() => {
    return (loyaltyRewards || [])
      .filter((reward) => reward.is_active && (reward.stock === null || reward.stock > 0))
      .sort((a, b) => a.points_cost - b.points_cost)[0] || null;
  }, [loyaltyRewards]);
  const rewardTarget = nextReward?.points_cost ?? null;
  const pointsRemaining = rewardTarget ? Math.max(rewardTarget - pointsBalance, 0) : 0;
  const rewardProgress = rewardTarget ? Math.min((pointsBalance / rewardTarget) * 100, 100) : 0;
  const today = new Date();
  const firstName = user?.display_name?.split(' ')[0] || 'bienvenida';
  const monthLabel = format(today, 'MMMM', { locale: es }).toUpperCase();
  const weekdayLabel = format(today, 'EEEE', { locale: es });
  const dayNumber = format(today, 'd', { locale: es });
  const membershipStatusText = isOutOfCredits
    ? 'Sin créditos'
    : membership
      ? statusLabel[membership.status]
      : 'Sin membresía';
  const showRenewPrompt = Boolean(!membership || isExpiredOrCancelled || isOutOfCredits || (classLimit && (classesRemaining ?? 0) <= 1));

  return (
    <AuthGuard requiredRoles={['client']}>
      <ClientLayout>
        <ProfilerInviteBanner />
        <div className="relative space-y-10 pb-4">
          <section className="relative overflow-hidden rounded-[1.6rem] border border-[#D6D5C2]/70 bg-[#F6F0E4]/72 shadow-[0_24px_80px_-68px_rgba(42,33,24,.72)]">
            <div className="absolute inset-0 opacity-[0.2]">
              <img src="/studio/barre.webp" alt="" aria-hidden="true" className="h-full w-full object-cover object-center" />
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,248,245,.94)_0%,rgba(255,248,245,.82)_46%,rgba(236,225,206,.78)_100%)]" />
            </div>
            {/* Wash dorado (golden-hour) — atmósfera de marca */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{ background: 'radial-gradient(120% 95% at 88% -8%, hsla(42,80%,62%,0.4) 0%, transparent 50%), radial-gradient(100% 90% at -8% 110%, hsla(6,55%,80%,0.55) 0%, transparent 56%), radial-gradient(82% 80% at 58% 124%, hsla(355,52%,84%,0.42) 0%, transparent 60%)' }}
            />
            <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:p-12">
              <div className="max-w-4xl">
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#2A4E36]/24 bg-[#F6F0E4]/72 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#2A4E36]">
                  <Leaf className="h-3.5 w-3.5" />
                  Bienvenido de vuelta
                </div>
                <p className="font-heading text-2xl font-medium tracking-[-0.03em] text-[#6B554D] sm:text-3xl">
                  {firstName}
                </p>
                <h1 className="mt-2 max-w-4xl font-heading text-[clamp(3.2rem,8vw,7rem)] font-medium leading-[0.88] tracking-[-0.055em] text-[#2E1B22]">
                  Encuentra tu centro hoy.
                </h1>
                <p className="mt-6 max-w-[64ch] text-sm leading-7 text-[#6B554D] sm:text-base">
                  Reserva tu siguiente clase, revisa tu membresía y mantén tu constancia en una experiencia simple y cuidada.
                </p>
              </div>

              <aside className="flex flex-col justify-end rounded-[1.25rem] border border-[#D6D5C2]/80 bg-[#F6F0E4]/70 p-5 text-right">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#2E1B22]/46">
                  {monthLabel} · {today.getFullYear()}
                </p>
                <div className="mt-4 flex items-end justify-end gap-3">
                  <span className="font-heading text-4xl font-medium italic leading-none text-[#6B554D] capitalize">
                    {weekdayLabel}
                  </span>
                  <span className="font-heading text-[6.5rem] font-semibold leading-[0.78] tracking-[-0.06em] text-[#AE4836]">
                    {dayNumber}
                  </span>
                </div>
              </aside>
            </div>
          </section>

          {/* Clases por calificar (se auto-oculta si no hay) */}
          <PendingReviewsList />

          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="h-auto rounded-full border border-[#AE4836]/18 bg-[#2A4E36] px-6 py-3 text-[#F6F0E4] shadow-[0_14px_40px_-32px_rgba(166,119,106,.8)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#16261A]">
              <Link to="/app/book">
                <Plus className="h-5 w-5" />
                Reservar clase
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-auto rounded-full border-[#D6D5C2]/80 bg-[#F6F0E4]/66 px-6 py-3 text-[#2E1B22] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#DDE4D5]/34">
              <Link to="/app/classes">
                <Calendar className="h-5 w-5" />
                Mis reservas
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-auto rounded-full border-[#D6D5C2]/80 bg-[#F6F0E4]/66 px-6 py-3 text-[#2E1B22] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#DDE4D5]/34">
              <Link to="/app/checkout">
                <Plus className="h-5 w-5" />
                Adquirir plan
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-auto rounded-full border-[#D6D5C2]/80 bg-[#F6F0E4]/66 px-6 py-3 text-[#2E1B22] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#DDE4D5]/34">
              <Link to="/app/wallet">
                <Gift className="h-5 w-5 text-[#AE4836]" />
                Lealtad
              </Link>
            </Button>
          </div>

          <section className="space-y-4">
            <p className="pl-2 text-sm font-medium text-[#6B554D]">Mi membresía</p>
            <div className="rounded-[1.55rem] border border-[#D6D5C2]/72 bg-[#F6F0E4]/76 p-4 shadow-[0_18px_58px_-52px_rgba(42,33,24,.55)] sm:p-6">
              <div className="relative overflow-hidden rounded-[1.15rem] bg-[#F2E9D2]/56 p-5 sm:p-7">
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.06]">
                  <CasaSheMark className="h-52 w-52 text-bmb-deepgold" />
                </div>
                <div className="relative space-y-8">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#D6D5C2]/80 bg-[#F6F0E4]/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6B554D]">
                        <span className="h-2 w-2 rounded-full bg-[#AE4836]" />
                        Membresía
                      </div>
                      {membershipLoading ? (
                        <div className="space-y-3">
                          <Skeleton className="h-9 w-64 bg-[#D6D5C2]/45" />
                          <Skeleton className="h-4 w-44 bg-[#D6D5C2]/45" />
                        </div>
                      ) : (
                        <>
                          <h2 className="font-heading text-3xl font-medium tracking-[-0.035em] text-[#2E1B22] sm:text-5xl">
                            {membership?.plan_name || 'Activa tu plan'}
                          </h2>
                          <p className="mt-2 text-sm text-[#6B554D]">
                            {membership ? membershipStatusText : 'Compra un paquete para reservar y acumular puntos.'}
                          </p>
                        </>
                      )}
                    </div>
                    <Badge
                      variant={membership?.status === 'active' ? 'default' : 'secondary'}
                      className={
                        membership?.status === 'active' && !isOutOfCredits
                          ? 'w-fit rounded-full bg-[#DDE4D5] px-3 py-1 text-[#2E1B22]'
                          : 'w-fit rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-amber-800'
                      }
                    >
                      {membershipStatusText}
                    </Badge>
                  </div>

                  {membershipLoading ? (
                    <Skeleton className="h-20 w-full bg-[#D6D5C2]/45" />
                  ) : membership && (isOutOfCredits || isExpiredOrCancelled) ? (
                    <div className="flex items-start gap-3 rounded-[1rem] border border-amber-200/70 bg-amber-50/72 p-4">
                      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                      <div>
                        <p className="text-sm font-semibold text-amber-900">
                          {isOutOfCredits ? `Agotaste tus ${membership.class_limit} clases.` : 'Tu membresía necesita renovación.'}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-amber-700">
                          Renueva para seguir reservando clases y acumulando puntos de lealtad.
                        </p>
                      </div>
                    </div>
                  ) : membership ? (
                    <div className="space-y-4 border-t border-[#2E1B22]/10 pt-5">
                      {credits.length > 0 ? (
                        <div className="space-y-3">
                          {credits.map((c) => (
                            <div key={c.key} className="space-y-1.5">
                              <div className="flex justify-between text-sm">
                                <span className="text-[#6B554D]">{c.label}</span>
                                <span className="font-semibold text-[#2E1B22] tabular-nums">
                                  {c.unlimited
                                    ? 'Ilimitado'
                                    : c.total
                                      ? `${c.remaining ?? 0} de ${c.total}`
                                      : `${c.remaining ?? 0}`}
                                </span>
                              </div>
                              {!c.unlimited && c.total ? (
                                <Progress
                                  value={Math.min(100, ((c.remaining ?? 0) / c.total) * 100)}
                                  className="h-2"
                                />
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : classLimit ? (
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-[#6B554D]">Clases restantes</span>
                            <span className="font-semibold text-[#2E1B22]">{classesRemaining ?? 0} de {classLimit}</span>
                          </div>
                          <Progress value={classesProgress ?? 0} className="h-2" />
                        </div>
                      ) : (
                        <div className="text-sm text-[#6B554D]">Clases ilimitadas activas</div>
                      )}
                      <div className="flex flex-wrap items-center gap-3 text-sm text-[#6B554D]">
                        <span className="inline-flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          {daysRemaining !== null ? `${daysRemaining} días restantes` : 'Sin fecha de vencimiento'}
                        </span>
                        <span className="rounded-full border border-[#D6D5C2]/80 bg-[#F6F0E4]/58 px-3 py-1 font-semibold text-[#2E1B22]">
                          {membership.end_date ? `Vence ${format(membershipEndDate!, 'dd MMM yyyy', { locale: es })}` : 'Sin vencimiento'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-[1rem] border border-[#D6D5C2]/70 bg-[#F6F0E4]/58 p-4 text-sm text-[#6B554D]">
                      Aún no tienes una membresía activa.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {showRenewPrompt && (
            <Link
              to="/app/checkout"
              className="group flex items-center justify-between rounded-[1.2rem] border border-[#D6D5C2]/76 bg-[#F6F0E4]/72 p-5 shadow-[0_14px_48px_-42px_rgba(42,33,24,.55)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#DDE4D5]/30"
            >
              <div className="flex items-center gap-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#DDE4D5]/65 text-[#AE4836] transition-transform duration-300 group-hover:scale-105">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-semibold text-[#2E1B22]">Renueva tu plan</h3>
                  <p className="text-sm text-[#6B554D]">
                    {membership && classLimit ? `Te quedan ${classesRemaining ?? 0} clases.` : 'Activa tu membresía para seguir entrenando.'}
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-[#2A4E36] transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          )}

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="pl-2 text-sm font-medium text-[#6B554D]">Próximas clases</p>
              <Button variant="ghost" size="sm" className="rounded-full" asChild>
                <Link to="/app/classes">
                  Ver todas
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="rounded-[1.55rem] border border-[#D6D5C2]/72 bg-[#F6F0E4]/76 p-3 shadow-[0_18px_58px_-52px_rgba(42,33,24,.55)] sm:p-4">
              {bookingsLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-20 w-full bg-[#D6D5C2]/45" />
                  <Skeleton className="h-20 w-full bg-[#D6D5C2]/45" />
                </div>
              ) : upcomingClasses.length > 0 ? (
                <div className="divide-y divide-[#D6D5C2]/60">
                  {upcomingClasses.map((cls) => (
                    <div
                      key={cls.booking_id}
                      className="flex flex-col gap-3 p-4 transition-colors hover:bg-[#F2E9D2]/35 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div 
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.9rem]"
                          style={{ 
                            backgroundColor: cls.class_type_color ? `${cls.class_type_color}20` : 'hsl(var(--primary) / 0.1)'
                          }}
                        >
                          <Calendar 
                            className="h-5 w-5" 
                            style={{ color: cls.class_type_color || 'hsl(var(--primary))' }}
                          />
                        </div>
                        <div>
                          <p className="font-heading text-2xl font-medium tracking-[-0.025em] text-[#2E1B22]">{cls.class_type_name}</p>
                          <p className="text-sm text-[#6B554D]">
                            {format(parseISO(cls.date), 'EEEE d MMM', { locale: es })} · {cls.start_time.slice(0, 5)} · {cls.instructor_name}
                          </p>
                        </div>
                      </div>
                      <Badge className="w-fit rounded-full border border-[#D6D5C2]/80 bg-[#F2E9D2]/62 px-3 py-1 text-[#AE4836] shadow-none">
                        Confirmada
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#DDE4D5]/55 text-[#2A4E36]">
                    <Calendar className="h-7 w-7" />
                  </div>
                  <p className="mt-3 text-[#6B554D]">No tienes clases próximas</p>
                  <Button asChild className="mt-4 rounded-full bg-[#2A4E36] text-[#F6F0E4] hover:bg-[#16261A]">
                    <Link to="/app/book">Reservar ahora</Link>
                  </Button>
                </div>
              )}
            </div>
          </section>

          <div className={`grid gap-6 ${latestVideos && latestVideos.length > 0 ? 'lg:grid-cols-[1.08fr_0.92fr]' : ''}`}>
            {latestVideos && latestVideos.length > 0 && (
            <Card className="rounded-[1.35rem] border-[#D6D5C2]/72 bg-[#F6F0E4]/76 shadow-none">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 font-heading text-2xl font-medium tracking-[-0.03em] text-[#2E1B22]">
                    <div className="flex h-8 w-8 items-center justify-center rounded-[0.75rem] bg-[#DDE4D5]/55">
                      <Play className="h-4 w-4 text-[#AE4836]" />
                    </div>
                    Videos on-demand
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="rounded-full" asChild>
                    <Link to="/app/videos">
                      Ver todos
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
                <CardDescription>Rutinas y técnica disponibles para ti</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {latestVideos.slice(0, 4).map((video: any) => (
                    <Link
                      key={video.id}
                      to={`/app/videos/${video.id}`}
                      className="group"
                    >
                      <div className="relative aspect-video overflow-hidden rounded-[0.9rem] bg-muted">
                        {video.thumbnail_url ? (
                          <img
                            src={video.thumbnail_url}
                            alt={video.title}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-muted">
                            <Play className="h-8 w-8 text-muted-foreground/50" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="rounded-full bg-white/90 p-2 shadow-lg">
                            <Play className="h-4 w-4 text-primary fill-primary ml-0.5" />
                          </div>
                        </div>
                      </div>
                      <p className="text-sm font-medium mt-1.5 group-hover:text-primary transition-colors line-clamp-1">
                        {video.title}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">{video.level}</p>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
            )}

          </div>
        </div>
      </ClientLayout>
    </AuthGuard>
  );
}
