import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import api, { getErrorMessage } from '@/lib/api';
import { ArrowLeft, Gift, Loader2, Star, Sparkles, BadgePercent, CalendarPlus, Package, Award } from 'lucide-react';

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

interface WalletPassResponse {
  pointsBalance: number;
}

interface RedeemResponse {
  message?: string;
  newBalance: number;
}

const rewardTypeLabels: Record<string, string> = {
  discount: 'Descuento',
  free_class: 'Clase gratis',
  product: 'Producto',
  membership_extension: 'Membresía',
};

const rewardTypeIcons = {
  discount: BadgePercent,
  free_class: CalendarPlus,
  product: Package,
  membership_extension: Award,
} as const;

export default function WalletRewards() {
  const [selectedReward, setSelectedReward] = useState<LoyaltyReward | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: wallet,
    isLoading: walletLoading,
    isError: walletIsError,
    error: walletError,
  } = useQuery<WalletPassResponse>({
    queryKey: ['wallet-pass'],
    queryFn: async () => (await api.get('/wallet/pass')).data,
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

  const pointsBalance = wallet?.pointsBalance ?? 0;
  const activeRewards = (rewards || []).filter((reward) => reward.is_active);

  const redeemMutation = useMutation({
    mutationFn: async (rewardId: string) => {
      const { data } = await api.post<RedeemResponse>('/loyalty/redeem', { rewardId });
      return data;
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['wallet-pass'] });
      queryClient.invalidateQueries({ queryKey: ['loyalty-history'] });
      queryClient.invalidateQueries({ queryKey: ['loyalty-rewards'] });
      setSelectedReward(null);
      toast({
        title: 'Recompensa canjeada',
        description: response.message || 'Tus puntos se actualizaron correctamente.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'No pudimos canjear la recompensa',
        description: getErrorMessage(error),
      });
    },
  });

  const handleRedeem = () => {
    if (!selectedReward) return;
    redeemMutation.mutate(selectedReward.id);
  };

  const isOutOfStock = (reward: LoyaltyReward) => reward.stock !== null && reward.stock <= 0;
  const canRedeem = (reward: LoyaltyReward) => pointsBalance >= reward.points_cost && !isOutOfStock(reward);
  const pointsAfterRedeem = selectedReward
    ? Math.max(pointsBalance - selectedReward.points_cost, 0)
    : pointsBalance;

  return (
    <AuthGuard requiredRoles={['client']}>
      <ClientLayout>
        <div className="space-y-6">
          <section className="rounded-[2rem] border border-balance-olive/25 bg-balance-olive/10 p-5 shadow-[0_22px_72px_-58px_rgba(51,42,34,0.75)] sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-balance-olive/25 bg-balance-cream/65 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-balance-olive">
                <Sparkles className="h-3.5 w-3.5" />
                Beneficios
              </div>
              <h1 className="text-3xl font-semibold tracking-[-0.04em] text-balance-dark sm:text-4xl">Recompensas</h1>
              <p className="mt-1 text-sm text-balance-dark/62">Canjea tus puntos por beneficios exclusivos.</p>
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              <div className="rounded-[1.25rem] border border-balance-olive/16 bg-balance-cream/60 px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-balance-dark/55">
                  <Star className="h-4 w-4 fill-balance-olive text-balance-olive" />
                  Puntos disponibles
                </div>
                {walletLoading ? (
                  <Skeleton className="mt-2 h-7 w-24" />
                ) : (
                  <p className="mt-1 text-2xl font-semibold text-balance-olive">
                    {pointsBalance} pts
                  </p>
                )}
              </div>
              <Button variant="ghost" className="rounded-full" asChild>
                <Link to="/app/wallet">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Volver
                </Link>
              </Button>
            </div>
          </div>
          </section>

          {walletIsError && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
              No pudimos cargar tus puntos. {getErrorMessage(walletError)}
            </div>
          )}

          {rewardsLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((item) => (
                <Skeleton key={item} className="h-56 rounded-xl" />
              ))}
            </div>
          ) : rewardsIsError ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center text-sm text-destructive">
              No pudimos cargar las recompensas. {getErrorMessage(rewardsError)}
            </div>
          ) : activeRewards.length === 0 ? (
            <Card className="rounded-[1.75rem] border-balance-sand/65 bg-[hsl(var(--card))]/88">
              <CardContent className="py-12 text-center">
                <Gift className="mx-auto h-10 w-10 text-muted-foreground/50" />
                <p className="mt-3 font-medium">Sin recompensas configuradas</p>
                <p className="text-sm text-muted-foreground">
                  Vuelve pronto para ver nuevos beneficios.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {activeRewards.map((reward) => {
                const enoughPoints = pointsBalance >= reward.points_cost;
                const outOfStock = isOutOfStock(reward);
                const rewardCanRedeem = canRedeem(reward);
                const missingPoints = Math.max(reward.points_cost - pointsBalance, 0);

                return (
                  <Card
                    key={reward.id}
                    className={`overflow-hidden rounded-[1.5rem] transition-colors ${
                      rewardCanRedeem
                        ? 'border-balance-olive/30 bg-balance-olive/10'
                        : 'border-balance-sand/60 bg-[hsl(var(--card))]/88'
                    }`}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-3">
                        <CardTitle className="text-base leading-tight">{reward.name}</CardTitle>
                        <Badge variant={rewardCanRedeem ? 'default' : 'secondary'} className="shrink-0">
                          {rewardTypeLabels[reward.reward_type] || reward.reward_type}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-[1rem] bg-balance-cream text-balance-olive">
                        {(() => {
                          const Icon = rewardTypeIcons[reward.reward_type as keyof typeof rewardTypeIcons] || Sparkles;
                          return <Icon className="h-5 w-5" />;
                        })()}
                      </div>
                      <p className="min-h-10 text-sm text-muted-foreground">
                        {reward.description || 'Beneficio disponible para miembros del programa de lealtad.'}
                      </p>
                      <div className="flex items-center justify-between rounded-xl border bg-background/70 p-3">
                        <span className="text-sm text-muted-foreground">Costo</span>
                        <span className="font-semibold text-balance-olive">{reward.points_cost} pts</span>
                      </div>
                      {reward.stock !== null && (
                        <p className="text-xs text-muted-foreground">
                          {outOfStock ? 'Agotada' : `${reward.stock} disponibles`}
                        </p>
                      )}
                      <Button
                        size="sm"
                        className="w-full"
                        variant={rewardCanRedeem ? 'default' : 'outline'}
                        disabled={!rewardCanRedeem || walletLoading}
                        onClick={() => setSelectedReward(reward)}
                      >
                        {outOfStock
                          ? 'Agotada'
                          : enoughPoints
                            ? 'Canjear'
                            : `Te faltan ${missingPoints} pts`}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <Dialog
          open={Boolean(selectedReward)}
          onOpenChange={(open) => {
            if (!open && !redeemMutation.isPending) setSelectedReward(null);
          }}
        >
          <DialogContent className="max-w-xs sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Confirmar canje</DialogTitle>
              <DialogDescription>
                Revisa el movimiento antes de usar tus puntos.
              </DialogDescription>
            </DialogHeader>
            {selectedReward && (
              <div className="space-y-4">
                <div className="rounded-xl border bg-muted/40 p-4">
                  <p className="font-semibold">{selectedReward.name}</p>
                  {selectedReward.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{selectedReward.description}</p>
                  )}
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Puntos actuales</span>
                    <span>{pointsBalance} pts</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Puntos a gastar</span>
                    <span>-{selectedReward.points_cost} pts</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 font-semibold">
                    <span>Puntos restantes</span>
                    <span>{pointsAfterRedeem} pts</span>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                disabled={redeemMutation.isPending}
                onClick={() => setSelectedReward(null)}
              >
                Cancelar
              </Button>
              <Button
                disabled={!selectedReward || redeemMutation.isPending}
                onClick={handleRedeem}
              >
                {redeemMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirmar canje
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </ClientLayout>
    </AuthGuard>
  );
}
