import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { WalletQr } from '@/components/wallet/WalletQr';
import { CasaSheMark } from '@/components/CasaSheLogo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import api, { getErrorMessage } from '@/lib/api';
import { Gift, History, Sparkles, BadgePercent, Package, CalendarPlus, Award, Copy, Share2, Users, Star, Flame, ShoppingBag, Smartphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { es } from 'date-fns/locale';
import { useToast } from '@/components/ui/use-toast';

interface LoyaltyReward {
  id: string;
  name: string;
  description: string | null;
  points_cost: number;
  reward_type: string;
  reward_value: string | null;
  is_active: boolean;
  stock: number | null;
}

interface ReferralStats {
  code: string;
  totalReferrals: number;
  totalPointsEarned: number;
  recentReferrals: Array<{ friend_name: string; created_at: string; points_awarded: number }>;
}

// ─── Referral code panel ────────────────────────────────────────────────────
function ReferralCodePanel() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<ReferralStats>({
    queryKey: ['referral-me'],
    queryFn: async () => (await api.get('/referrals/me')).data,
  });

  const handleCopy = async () => {
    if (!data?.code) return;
    try {
      await navigator.clipboard.writeText(data.code);
      toast({ title: '¡Copiado!', description: 'Comparte tu código con tus amigas.' });
    } catch {
      toast({ variant: 'destructive', title: 'No se pudo copiar' });
    }
  };

  const handleShareWhatsApp = () => {
    if (!data?.code) return;
    const msg = encodeURIComponent(
      `¡Te invito a Casa Shé! 🧘\nUsa mi código *${data.code}* al registrarte. 💚`
    );
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  return (
    <div className="relative overflow-hidden p-6 text-balance-cream md:p-8">
      {/* Fondo dorado con profundidad + aura cálida */}
      <div className="absolute inset-0 bg-[linear-gradient(150deg,#C58A3A_0%,#B5512F_48%,#B5512F_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(125%_85%_at_12%_-5%,rgba(255,248,228,0.34)_0%,transparent_55%)]" />
      {/* Watermark del monograma Casa Shé */}
      <CasaSheMark
        aria-hidden="true"
        tone="cream"
        className="pointer-events-none absolute -right-10 -top-12 h-52 w-52 select-none opacity-[0.08]"
      />

      <div className="relative space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-balance-cream/70">
            Refiere a tus amigas
          </p>
          <h2 className="mt-1.5 text-2xl font-semibold tracking-[-0.01em]">Tu código personal</h2>
          <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-balance-cream/80">
            Ganas <span className="font-semibold text-white">40 puntos</span> cada vez que alguien
            compre usando tu código.
          </p>
        </div>

        {/* Código tipo ticket — toca para copiar */}
        {isLoading ? (
          <Skeleton className="h-[4.5rem] w-full rounded-[1.1rem] bg-white/20" />
        ) : (
          <button
            type="button"
            onClick={handleCopy}
            disabled={!data?.code}
            className="group relative flex w-full items-center justify-between gap-3 rounded-[1.1rem] border border-dashed border-white/40 bg-white/12 px-5 py-4 text-left backdrop-blur-sm transition-colors hover:bg-white/[0.18] disabled:opacity-60"
          >
            <span className="font-mono text-2xl font-bold tracking-[0.16em] sm:text-3xl">
              {data?.code ?? '—'}
            </span>
            <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-balance-cream/70 transition-colors group-hover:text-white">
              <Copy className="h-4 w-4" />
              Copiar
            </span>
          </button>
        )}

        {/* Acciones */}
        <div className="flex gap-2.5">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1.5 rounded-full border-white/30 bg-white/10 text-balance-cream hover:bg-white/20 hover:text-white"
            onClick={handleCopy}
            disabled={!data?.code}
          >
            <Copy className="h-3.5 w-3.5" />
            Copiar código
          </Button>
          <Button
            size="sm"
            className="flex-1 gap-1.5 rounded-full border-0 bg-[#1fb955] text-white shadow-[0_10px_22px_-12px_rgba(31,185,85,0.95)] hover:bg-[#18a449]"
            onClick={handleShareWhatsApp}
            disabled={!data?.code}
          >
            <Share2 className="h-3.5 w-3.5" />
            WhatsApp
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-0.5">
          <div className="rounded-[1.1rem] border border-white/15 bg-white/10 p-3.5 text-center backdrop-blur-sm">
            <Users className="mx-auto mb-1.5 h-4 w-4 text-balance-cream/75" />
            <p className="text-2xl font-bold tabular-nums leading-none">{data?.totalReferrals ?? 0}</p>
            <p className="mt-1 text-xs uppercase tracking-wider text-balance-cream/65">Referidas</p>
          </div>
          <div className="rounded-[1.1rem] border border-white/15 bg-white/10 p-3.5 text-center backdrop-blur-sm">
            <Star className="mx-auto mb-1.5 h-4 w-4 text-balance-cream/75" />
            <p className="text-2xl font-bold tabular-nums leading-none">{data?.totalPointsEarned ?? 0}</p>
            <p className="mt-1 text-xs uppercase tracking-wider text-balance-cream/65">Puntos ganados</p>
          </div>
        </div>

        {(data?.recentReferrals?.length ?? 0) > 0 && (
          <div className="space-y-1.5 rounded-[1.1rem] border border-white/12 bg-white/[0.07] p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-balance-cream/65">Amigas recientes</p>
            {data!.recentReferrals.slice(0, 3).map((r, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-balance-cream/85">{r.friend_name}</span>
                <span className="font-semibold text-white">+{r.points_awarded} pts</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function WalletClub() {
  const { data: loyaltyData } = useQuery<{
    history: Array<{
      id: string;
      points: number;
      type: string;
      description: string;
      created_at: string;
      class_name: string | null;
    }>;
    totalPoints: number;
  }>({
    queryKey: ['loyalty-history'],
    queryFn: async () => (await api.get('/loyalty/my-history')).data,
  });

  const [appleLoading, setAppleLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const { data: walletData } = useQuery<{ pointsBalance: number; canDownloadPass: boolean }>({
    queryKey: ['wallet-pass'],
    queryFn: async () => (await api.get('/wallet/pass')).data,
  });

  const handleAppleWallet = async () => {
    setAppleLoading(true);
    try {
      const { data } = await api.post('/wallet/pass/apple');
      window.location.href = data.downloadUrl;
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No pudimos generar tu pase de Apple Wallet.' });
    } finally {
      setAppleLoading(false);
    }
  };

  const handleGoogleWallet = async () => {
    setGoogleLoading(true);
    try {
      const { data } = await api.post('/wallet/pass/google');
      window.open(data.saveUrl, '_blank');
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No pudimos generar tu pase de Google Wallet.' });
    } finally {
      setGoogleLoading(false);
    }
  };

  const { data: loyaltyConfig } = useQuery<{
    enabled: boolean; points_per_class: number; points_per_peso: number; points_per_peso_cash: number; pesos_per_point: number;
    welcome_bonus: number; birthday_bonus: number; anniversary_bonus: number; referral_bonus: number; streak_bonus: number;
  }>({
    queryKey: ['loyalty-config-public'],
    queryFn: async () => (await api.get('/loyalty/config-public')).data,
  });

  const { data: streak } = useQuery<{
    currentStreakWeeks: number;
    bonusesAwarded: number;
    nextBonusInWeeks: number;
    label: string;
  }>({
    queryKey: ['loyalty-streak'],
    queryFn: async () => (await api.get('/loyalty/my-streak')).data,
  });

  const {
    data: rewards,
    isLoading: rewardsLoading,
    isError: rewardsIsError,
    error: rewardsError,
  } = useQuery<LoyaltyReward[]>({
    queryKey: ['loyalty-rewards'],
    queryFn: async () => (await api.get('/loyalty/rewards')).data,
  });

  const recentActivity = (loyaltyData?.history || []).slice(0, 3);
  const activeRewards = (rewards || [])
    .filter((r) => r.is_active && (r.stock === null || r.stock > 0))
    .slice(0, 3);

  const pointsBalance = walletData?.pointsBalance ?? loyaltyData?.totalPoints ?? 0;

  const formatActivityDate = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) return 'Hoy';
      if (diffDays === 1) return 'Ayer';
      return format(date, 'd MMM', { locale: es });
    } catch {
      return '';
    }
  };

  const getActivityLabel = (item: { type: string; description: string; class_name: string | null }) => {
    if (item.description?.startsWith('Puntos por pago #')) return 'Compra de membresía';
    if (item.class_name) return `Clase: ${item.class_name}`;
    if (item.type === 'bonus') return item.description || 'Bono';
    if (item.type === 'redemption') return item.description || 'Canje';
    return item.description || 'Puntos';
  };

  const getRewardIcon = (type: string) => {
    const icons = {
      discount: BadgePercent,
      free_class: CalendarPlus,
      product: Package,
      membership_extension: Award,
      bar_discount: BadgePercent,
      product_discount: BadgePercent,
      free_drink: Package,
      discount_package: BadgePercent,
    };
    return icons[type as keyof typeof icons] || Sparkles;
  };

  return (
    <AuthGuard requiredRoles={['client']}>
      <ClientLayout>
        <div className="space-y-7">
          {/* QR de recepción del cliente — lo escanea el staff en /app/reception/scan */}
          <WalletQr />

          {/* Pases digitales */}
          {walletData?.canDownloadPass && (
            <Card className="overflow-hidden rounded-[2rem] border border-balance-sand/65 bg-[hsl(var(--card))]/88 shadow-[0_18px_58px_-50px_rgba(51,42,34,0.58)]">
              <CardContent className="p-6 md:p-7">
                <div className="mb-1 flex items-center gap-2">
                  <Smartphone className="h-4.5 w-4.5 text-balance-olive" />
                  <h2 className="text-base font-semibold text-balance-dark">Guarda tu pase digital</h2>
                </div>
                <p className="mb-5 text-sm text-muted-foreground">
                  Accede a tu membresía desde tu cartera sin necesidad de abrir la app.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row">
                  {/* Apple Wallet */}
                  <button
                    onClick={handleAppleWallet}
                    disabled={appleLoading}
                    className="group flex h-[52px] flex-1 items-center justify-center gap-2.5 rounded-[14px] bg-black px-5 text-white transition-opacity hover:opacity-85 disabled:opacity-50"
                  >
                    {appleLoading ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    ) : (
                      <svg width="20" height="24" viewBox="0 0 20 24" fill="white" aria-hidden="true">
                        <path d="M16.65 12.57c-.02-2.55 2.08-3.78 2.18-3.84-1.19-1.74-3.03-1.98-3.69-2.01-1.57-.16-3.07.93-3.87.93-.8 0-2.04-.91-3.35-.88-1.72.03-3.32 1.01-4.2 2.55-1.8 3.12-.46 7.74 1.29 10.27.86 1.24 1.88 2.63 3.22 2.58 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.38.81 1.39-.02 2.27-1.26 3.12-2.51.99-1.44 1.39-2.84 1.41-2.91-.03-.01-2.69-1.03-2.85-4.15zM14.07 4.49c.71-.87 1.19-2.07 1.06-3.27-1.02.04-2.27.68-3 1.53-.66.76-1.24 1.99-1.08 3.16 1.13.09 2.29-.57 3.02-1.42z"/>
                      </svg>
                    )}
                    <span className="flex flex-col items-start leading-none">
                      <span className="text-[10px] tracking-wide opacity-80">Add to</span>
                      <span className="text-[15px] font-semibold tracking-tight">Apple Wallet</span>
                    </span>
                  </button>

                  {/* Google Wallet */}
                  <button
                    onClick={handleGoogleWallet}
                    disabled={googleLoading}
                    className="group flex h-[52px] flex-1 items-center justify-center gap-2.5 rounded-[14px] border border-[#DADCE0] bg-white px-5 text-[#3C4043] transition-colors hover:bg-[#F8F9FA] disabled:opacity-50"
                  >
                    {googleLoading ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                    )}
                    <span className="flex flex-col items-start leading-none">
                      <span className="text-[10px] tracking-wide text-[#5F6368]">Save to</span>
                      <span className="text-[15px] font-semibold tracking-tight">Google Wallet</span>
                    </span>
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Header */}
          <section className="rounded-[2rem] border border-balance-olive/25 bg-balance-olive/10 p-5 shadow-[0_22px_72px_-58px_rgba(51,42,34,0.75)] sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-balance-olive/25 bg-balance-cream/65 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-balance-olive">
                  <Sparkles className="h-3.5 w-3.5" />
                  Lealtad Casa Shé
                </div>
                <h1 className="text-3xl font-semibold tracking-[-0.04em] text-balance-dark sm:text-4xl">Programa de lealtad</h1>
                <p className="mt-1 max-w-[58ch] text-sm text-balance-dark/62">
                  Tus puntos, recompensas y progreso en Casa Shé.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:items-end">
                <div className="rounded-[1.25rem] border border-balance-olive/16 bg-balance-cream/60 px-5 py-4 sm:min-w-[180px]">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-balance-dark/46">Puntos</p>
                  <p className="mt-1 text-3xl font-semibold tabular-nums text-balance-olive">{pointsBalance}</p>
                </div>
                {streak && (
                  <div
                    className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold tracking-tight ${
                      streak.currentStreakWeeks >= 2
                        ? 'border-amber-500/30 bg-amber-100/70 text-amber-800'
                        : 'border-balance-olive/25 bg-balance-cream/65 text-balance-olive'
                    }`}
                    title={
                      streak.currentStreakWeeks >= 2
                        ? `${streak.bonusesAwarded} × +${loyaltyConfig?.streak_bonus ?? 10} pts ganados por racha`
                        : `Sigue asistiendo para activar tu racha (+${loyaltyConfig?.streak_bonus ?? 10} pts cada 2 semanas)`
                    }
                  >
                    <Flame className={`h-3.5 w-3.5 ${streak.currentStreakWeeks >= 2 ? 'text-amber-600' : 'text-balance-olive'}`} />
                    <span>{streak.label}</span>
                    {streak.currentStreakWeeks > 0 && (
                      <span className="ml-1 rounded-full bg-balance-olive/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em]">
                        {streak.currentStreakWeeks % 2 === 0 ? `+${loyaltyConfig?.streak_bonus ?? 10} pts` : `${streak.nextBonusInWeeks}sem para +${loyaltyConfig?.streak_bonus ?? 10}`}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Loyalty card (Referidos oculto: #317 lo dejó apagado) */}
          <Card className="overflow-hidden rounded-[2rem] border border-balance-sand/65 bg-[hsl(var(--card))]/88 shadow-[0_22px_72px_-58px_rgba(51,42,34,0.75)]">
            <CardContent className="p-0">
              <div>
                <div className="space-y-5 p-6 md:p-8">
                  <div className="rounded-[1.5rem] border border-balance-sand/65 bg-balance-cream/45 p-5">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Sparkles className="h-4 w-4 text-balance-olive" />
                      Lealtad Casa Shé
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      Gana puntos al asistir a clases y canjéalos por beneficios del studio.
                    </p>
                    <div className="mt-5 rounded-[1rem] bg-[hsl(var(--card))]/80 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Puntos disponibles</p>
                      <p className="mt-1 text-3xl font-semibold text-balance-olive">{pointsBalance} pts</p>
                    </div>
                  </div>
                  <Button className="w-full rounded-full bg-balance-olive text-balance-cream hover:bg-balance-olive/90" asChild>
                    <Link to="/app/wallet/rewards">Ver recompensas</Link>
                  </Button>
                  <Button variant="outline" className="w-full rounded-full border-balance-olive/25 bg-balance-cream/45 hover:bg-balance-olive/8" asChild>
                    <Link to="/app/wallet/history">Ver historial de puntos</Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cómo ganar puntos */}
          <Card className="rounded-[1.75rem] border-balance-sand/65 bg-[hsl(var(--card))]/88 shadow-[0_18px_58px_-50px_rgba(51,42,34,0.58)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-5 w-5 text-balance-olive" />
                Cómo ganar puntos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {/* Compras */}
                <div className="rounded-[1.25rem] border border-balance-sand/65 bg-balance-cream/45 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 flex items-center justify-center rounded-[0.7rem] bg-balance-olive/10">
                      <ShoppingBag className="h-4 w-4 text-balance-olive" />
                    </div>
                    <p className="font-semibold text-sm text-balance-dark">Compras</p>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Por cada ${loyaltyConfig?.pesos_per_point ?? 10} gastados</span>
                      <span className="font-bold text-balance-olive">+1 pt</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 mt-1 border-t border-balance-sand/55">
                      <span className="text-muted-foreground">Por clase asistida</span>
                      <span className="font-bold text-balance-olive">+{loyaltyConfig?.points_per_class ?? 0} pts</span>
                    </div>
                  </div>
                </div>

                {/* Logros y Eventos */}
                <div className="rounded-[1.25rem] border border-balance-sand/65 bg-balance-cream/45 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 flex items-center justify-center rounded-[0.7rem] bg-balance-olive/10">
                      <Award className="h-4 w-4 text-balance-olive" />
                    </div>
                    <p className="font-semibold text-sm text-balance-dark">Logros y Eventos</p>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-muted-foreground leading-snug">Racha 2 semanas seguidas</span>
                      <span className="font-bold text-balance-olive shrink-0">+{loyaltyConfig?.streak_bonus ?? 0} pts</span>
                    </div>
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-muted-foreground leading-snug">Bienvenida</span>
                      <span className="font-bold text-balance-olive shrink-0">+{loyaltyConfig?.welcome_bonus ?? 0} pts</span>
                    </div>
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-muted-foreground leading-snug">Cumpleaños <span className="text-xs">(con paquete activo)</span></span>
                      <span className="font-bold text-balance-olive shrink-0">+{loyaltyConfig?.birthday_bonus ?? 0} pts</span>
                    </div>
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-muted-foreground leading-snug">Aniversario 1 año</span>
                      <span className="font-bold text-balance-olive shrink-0">+{loyaltyConfig?.anniversary_bonus ?? 0} pts</span>
                    </div>
                  </div>
                </div>

                {/* Referidos */}
                <div className="rounded-[1.25rem] border border-balance-sand/65 bg-balance-cream/45 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 flex items-center justify-center rounded-[0.7rem] bg-balance-olive/10">
                      <Users className="h-4 w-4 text-balance-olive" />
                    </div>
                    <p className="font-semibold text-sm text-balance-dark">Referidos</p>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-muted-foreground leading-snug">Compra con tu código</span>
                      <span className="font-bold text-balance-olive shrink-0">+{loyaltyConfig?.referral_bonus ?? 0} pts</span>
                    </div>
                    <p className="text-xs text-muted-foreground pt-1">
                      Solo tú ganas puntos. Tu amiga obtiene acceso al studio.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Rewards + Recent activity */}
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <Card className="rounded-[1.75rem] border-balance-sand/65 bg-[hsl(var(--card))]/88 shadow-[0_18px_58px_-50px_rgba(51,42,34,0.58)]">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Gift className="h-5 w-5 text-balance-olive" />
                  Canjear recompensas
                </CardTitle>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/app/wallet/rewards">Ver todas</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {rewardsLoading ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
                  </div>
                ) : rewardsIsError ? (
                  <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                    No pudimos cargar las recompensas. {getErrorMessage(rewardsError)}
                  </div>
                ) : activeRewards.length > 0 ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {activeRewards.map((reward) => {
                      const canAfford = pointsBalance >= reward.points_cost;
                      const Icon = getRewardIcon(reward.reward_type);
                      return (
                        <div
                          key={reward.id}
                          className={`rounded-[1.25rem] border p-4 text-center transition-colors ${
                            canAfford ? 'border-balance-olive/30 bg-balance-olive/10' : 'border-balance-sand/60 bg-balance-cream/45'
                          }`}
                        >
                          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-[1rem] bg-balance-cream text-balance-olive">
                            <Icon className="h-5 w-5" />
                          </div>
                          <p className="mt-2 text-sm font-medium line-clamp-2">{reward.name}</p>
                          <p className={canAfford ? 'text-xs font-semibold text-emerald-700' : 'text-xs text-muted-foreground'}>
                            {reward.points_cost} pts
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No hay recompensas disponibles por ahora.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-[1.75rem] border-balance-sand/65 bg-[hsl(var(--card))]/88 shadow-[0_18px_58px_-50px_rgba(51,42,34,0.58)]">
              <CardHeader className="flex flex-row items-center gap-2">
                <History className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg">Historial reciente</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {recentActivity.length > 0 ? (
                  recentActivity.map((item) => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium">{getActivityLabel(item)}</p>
                        <p className="text-xs text-muted-foreground">{formatActivityDate(item.created_at)}</p>
                      </div>
                      <span className={item.points > 0 ? 'text-balance-olive font-semibold' : 'text-rose-600 font-semibold'}>
                        {item.points > 0 ? `+${item.points}` : item.points} pts
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Aún no tienes movimientos. Asiste a clases para ganar puntos.
                  </p>
                )}
                {recentActivity.length > 0 && (
                  <Button variant="ghost" size="sm" asChild className="px-0">
                    <Link to="/app/wallet/history">Ver todo</Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </ClientLayout>
    </AuthGuard>
  );
}
