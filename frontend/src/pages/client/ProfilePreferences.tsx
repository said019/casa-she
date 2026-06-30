import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { useAuthStore } from '@/stores/authStore';
import { usePush } from '@/hooks/usePush';
import api, { getErrorMessage } from '@/lib/api';
import type { UpdateProfileData, User } from '@/types/auth';
import { Link } from 'react-router-dom';

interface ProfileResponse {
  user: User;
}

export default function ProfilePreferences() {
  const { toast } = useToast();
  const { user: authUser, updateUser } = useAuthStore();
  const push = usePush();
  const [receiveReminders, setReceiveReminders] = useState(false);
  const [receivePromotions, setReceivePromotions] = useState(false);
  const [receiveWeeklySummary, setReceiveWeeklySummary] = useState(false);

  const { data, isLoading } = useQuery<ProfileResponse>({
    queryKey: ['profile', authUser?.id],
    queryFn: async () => {
      const { data } = await api.get(`/users/${authUser?.id}`);
      return data;
    },
    enabled: Boolean(authUser?.id),
  });

  useEffect(() => {
    if (data?.user) {
      setReceiveReminders(Boolean(data.user.receive_reminders));
      setReceivePromotions(Boolean(data.user.receive_promotions));
      setReceiveWeeklySummary(Boolean(data.user.receive_weekly_summary));
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: async (payload: UpdateProfileData) => {
      const { data } = await api.put(`/users/${authUser?.id}`, payload);
      return data.user as User;
    },
    onSuccess: (updatedUser) => {
      updateUser(updatedUser);
      toast({ title: 'Preferencias guardadas', description: 'Tus cambios fueron aplicados.' });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'No se pudo guardar',
        description: getErrorMessage(error),
      });
    },
  });

  const handleSave = () => {
    if (!authUser?.id) return;
    mutation.mutate({
      receiveReminders,
      receivePromotions,
      receiveWeeklySummary,
    });
  };

  return (
    <AuthGuard requiredRoles={['client']}>
      <ClientLayout>
        <div className="space-y-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-heading font-bold">Preferencias</h1>
              <p className="text-muted-foreground">Personaliza tus notificaciones.</p>
            </div>
            <Button variant="ghost" asChild>
              <Link to="/app/profile">Volver</Link>
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Notificaciones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-medium">Recordatorios de clase</p>
                      <p className="text-xs text-muted-foreground">Recibe alertas antes de tus clases.</p>
                    </div>
                    <Switch checked={receiveReminders} onCheckedChange={setReceiveReminders} />
                  </div>

                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-medium">Promociones</p>
                      <p className="text-xs text-muted-foreground">Ofertas, eventos y novedades del estudio.</p>
                    </div>
                    <Switch checked={receivePromotions} onCheckedChange={setReceivePromotions} />
                  </div>

                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-medium">Resumen semanal</p>
                      <p className="text-xs text-muted-foreground">Resumen de asistencia y progreso.</p>
                    </div>
                    <Switch checked={receiveWeeklySummary} onCheckedChange={setReceiveWeeklySummary} />
                  </div>

                  <Button onClick={handleSave} disabled={mutation.isPending}>
                    {mutation.isPending ? 'Guardando...' : 'Guardar preferencias'}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notificaciones push</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-2xl border border-[#D6D5C2]/70 bg-[#F6F0E4]/70 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-heading text-lg text-[#2E1B22]">Notificaciones push</p>
                    <p className="text-sm text-[#6B554D]">
                      Recibe recordatorios de clase y avisos en tu celular, aunque esté bloqueado.
                    </p>
                  </div>
                  {push.state === 'unsupported' ? (
                    <span className="text-xs text-[#6B554D]/70">No disponible en este dispositivo</span>
                  ) : push.state === 'denied' ? (
                    <span className="text-xs text-[#AE4836]">Bloqueado en el navegador</span>
                  ) : push.state === 'subscribed' ? (
                    <button onClick={() => push.disable()} className="rounded-full border border-[#D6D5C2] px-4 py-2 text-sm text-[#2E1B22]">Desactivar</button>
                  ) : (
                    <button onClick={() => push.enable()} className="rounded-full bg-[#2A4E36] px-4 py-2 text-sm text-[#F6F0E4]">Activar</button>
                  )}
                </div>
                <p className="mt-3 text-xs text-[#6B554D]/70">
                  En iPhone: agrega Casa Shé a tu pantalla de inicio y ábrela desde ahí para poder activar.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </ClientLayout>
    </AuthGuard>
  );
}
