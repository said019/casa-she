import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, User, SlidersHorizontal, Bell, LogOut } from 'lucide-react';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import { fetchMyMembership } from '@/lib/memberships';
import type { ClientMembership } from '@/types/membership';

const STATUS_LABELS: Record<ClientMembership['status'], string> = {
  active: 'Activa',
  expired: 'Vencida',
  cancelled: 'Cancelada',
  pending_payment: 'Pago pendiente',
  pending_activation: 'Por activar',
  paused: 'Pausada',
};

export default function Profile() {
  const { user: authUser, logout } = useAuthStore();
  const navigate = useNavigate();

  const { data: membershipData } = useQuery<ClientMembership | null>({
    queryKey: ['my-membership'],
    queryFn: fetchMyMembership,
  });

  const { data: walletData } = useQuery<{ pointsBalance: number }>({
    queryKey: ['wallet-pass'],
    queryFn: async () => (await api.get('/wallet/pass')).data,
  });

  const { data: streakData } = useQuery<{ currentStreakWeeks: number }>({
    queryKey: ['my-streak'],
    queryFn: async () => (await api.get('/loyalty/my-streak')).data,
  });

  const name = authUser?.display_name ?? 'Miembro';
  const email = authUser?.email ?? '—';
  const initials = name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  const membership = {
    plan: membershipData?.plan_name ?? 'Sin plan activo',
    credits: membershipData?.classes_remaining ?? 0,
    status: membershipData ? (STATUS_LABELS[membershipData.status] ?? membershipData.status) : 'Sin membresía',
  };

  const wallet = {
    points: walletData?.pointsBalance ?? 0,
    streak: streakData?.currentStreakWeeks ?? 0,
    level: 'Miembro',
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const settings = [
    { to: '/app/profile/edit', icon: User, label: 'Editar perfil' },
    { to: '/app/profile/preferences', icon: SlidersHorizontal, label: 'Preferencias' },
    { to: '/app/notifications', icon: Bell, label: 'Notificaciones' },
  ];

  return (
    <AuthGuard requiredRoles={['client']}>
      <ClientLayout>
        <div className="mx-auto max-w-2xl space-y-5 pb-10">
          {/* Header */}
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-balance-gold text-xl font-bold text-balance-cream">
              {initials}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-balance-dark">{name}</h1>
              <p className="truncate text-sm text-muted-foreground">{email}</p>
            </div>
          </div>

          {/* Membresía */}
          <div className="rounded-[1.5rem] border border-balance-sand/60 bg-card p-5 app-soft-shadow">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-balance-olive">Membresía</p>
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="truncate text-xl font-semibold text-balance-dark">{membership.plan}</h2>
              <p className="text-sm text-muted-foreground">
                {membership.status} · {membership.credits} créditos
              </p>
            </div>
            <Link
              to="/app/profile/membership"
              className="mt-4 inline-flex items-center rounded-full border border-balance-sand/70 px-4 py-1.5 text-sm font-semibold text-balance-dark transition-colors hover:border-balance-olive hover:bg-balance-olive hover:text-balance-cream"
            >
              Ver detalle
            </Link>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="rounded-[1.25rem] border border-balance-sand/60 bg-card p-4 text-center app-soft-shadow">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Puntos</p>
              <p className="mt-1.5 text-3xl font-bold tabular-nums text-balance-olive">{wallet.points}</p>
            </div>
            <div className="rounded-[1.25rem] border border-balance-sand/60 bg-card p-4 text-center app-soft-shadow">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Racha</p>
              <p className="mt-1.5 text-3xl font-bold tabular-nums text-balance-dark">
                {wallet.streak}<span className="ml-0.5 text-base font-semibold text-muted-foreground">sem</span>
              </p>
            </div>
            <div className="rounded-[1.25rem] border border-balance-sand/60 bg-card p-4 text-center app-soft-shadow">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Nivel</p>
              <p className="mt-1.5 text-lg font-bold text-balance-gold">{wallet.level}</p>
            </div>
          </div>

          {/* Ajustes */}
          <div className="overflow-hidden rounded-[1.5rem] border border-balance-sand/60 bg-card app-soft-shadow">
            {settings.map((s, i) => {
              const Icon = s.icon;
              return (
                <Link
                  key={s.to}
                  to={s.to}
                  className={`flex items-center gap-3 px-5 py-4 transition-colors hover:bg-balance-cream/60 ${i > 0 ? 'border-t border-balance-sand/45' : ''}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-balance-olive/12 text-balance-olive">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="flex-1 text-sm font-medium text-balance-dark">{s.label}</span>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </Link>
              );
            })}
          </div>

          {/* Logout */}
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-[1.25rem] border border-destructive/30 px-4 py-3 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </ClientLayout>
    </AuthGuard>
  );
}
