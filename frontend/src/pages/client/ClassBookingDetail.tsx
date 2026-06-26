import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { parseISO, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { getErrorMessage } from '@/lib/api';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { Calendar, Clock, User, Sparkles, MapPin } from 'lucide-react';

interface BookingDetail {
  booking_id: string;
  booking_status: string;
  waitlist_position?: number | null;
  created_at: string;
  checked_in_at: string | null;
  class_date: string;
  class_start_time: string;
  class_end_time: string;
  class_name: string;
  class_type_color?: string;
  instructor_name: string;
}

const statusLabel: Record<string, string> = {
  confirmed: 'Confirmada',
  waitlist: 'Lista de espera',
  checked_in: 'Check-in',
  no_show: 'No show',
  cancelled: 'Cancelada',
};

export default function ClassBookingDetail() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery<BookingDetail>({
    queryKey: ['booking-detail', bookingId],
    queryFn: async () => {
      const { data } = await api.get(`/bookings/${bookingId}`);
      return data;
    },
    enabled: Boolean(bookingId),
  });

  // Server-canonical cancellation status; UI uses it to show button or fallback message
  const { data: preview } = useQuery<{
    canCancel: boolean;
    willRefund: boolean;
    hoursUntilClass: number | null;
    minHours: number | null;
    reason: string | null;
    code: string | null;
  }>({
    queryKey: ['cancel-preview', bookingId],
    queryFn: async () => (await api.get(`/bookings/${bookingId}/cancel-preview`, { validateStatus: () => true })).data,
    enabled: Boolean(bookingId) && data?.booking_status === 'confirmed',
  });

  const { data: policy } = useQuery<{ late_cancel_message: string | null; enabled: boolean; min_hours: number }>({
    queryKey: ['cancellation-policy'],
    queryFn: async () => (await api.get('/settings/cancellation-policy')).data,
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      return await api.post(`/bookings/${bookingId}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
      toast({ title: 'Reserva cancelada', description: 'Tu crédito ha sido devuelto (si aplica).' });
      navigate('/app/classes');
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) });
    },
  });

  return (
    <AuthGuard requiredRoles={['client']}>
      <ClientLayout>
        <div className="space-y-6">
          <section className="rounded-[2rem] border border-balance-olive/25 bg-balance-olive/10 p-5 shadow-[0_22px_72px_-58px_rgba(51,42,34,0.75)] sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-balance-olive/25 bg-balance-cream/65 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-balance-olive">
                <Sparkles className="h-3.5 w-3.5" />
                Reserva
              </div>
              <h1 className="text-3xl font-semibold tracking-[-0.04em] text-balance-dark sm:text-4xl">Detalle de clase</h1>
              <p className="mt-1 text-sm text-balance-dark/62">Información de tu reserva.</p>
            </div>
            <Button variant="ghost" className="rounded-full bg-balance-cream/60" asChild>
              <Link to="/app/classes">Volver</Link>
            </Button>
          </div>
          </section>

          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : isError || !data ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                No pudimos cargar la reserva.
              </CardContent>
            </Card>
          ) : (
            <Card className="relative overflow-hidden rounded-[1.75rem] border-balance-sand/65 bg-[hsl(var(--card))]/88 shadow-[0_18px_58px_-50px_rgba(51,42,34,0.58)]">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-3">
                    {data.class_type_color && (
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: data.class_type_color }}
                      />
                    )}
                    {data.class_name}
                  </CardTitle>
                  <Badge variant="outline" className="rounded-full border-balance-olive/25 bg-balance-olive/8 text-balance-olive">
                    {statusLabel[data.booking_status] || data.booking_status}
                    {data.booking_status === 'waitlist' && data.waitlist_position ? ` · #${data.waitlist_position}` : ''}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="capitalize">
                    {format(parseISO(data.class_date), 'EEEE d MMMM', { locale: es })}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {data.class_start_time?.slice(0, 5)} - {data.class_end_time?.slice(0, 5)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span>{data.instructor_name}</span>
                </div>
                {data.checked_in_at && (
                  <div className="text-xs text-muted-foreground">
                    Check-in: {new Date(data.checked_in_at).toLocaleString()}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {data?.booking_status === 'confirmed' && (
            <Button
              className="w-full rounded-full bg-balance-olive text-balance-cream hover:bg-balance-olive/90"
              asChild
            >
              <Link to={`/app/classes/${bookingId}/spot`}>
                <MapPin className="h-4 w-4 mr-2" />
                Elige tu lugar
              </Link>
            </Button>
          )}

          {(() => {
            if (data?.booking_status === 'waitlist') {
              return (
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full rounded-full border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => cancelMutation.mutate()}
                    disabled={cancelMutation.isPending}
                  >
                    {cancelMutation.isPending ? 'Saliendo...' : 'Salir de la lista de espera'}
                  </Button>
                  <p className="text-center text-xs text-balance-dark/55">
                    Salir de la lista no gasta créditos ni cuenta como cancelación.
                  </p>
                </div>
              );
            }
            if (data?.booking_status !== 'confirmed') return null;
            // Server is the canonical gate. The UI follows the preview RPC.
            if (preview?.canCancel) {
              const refundHint = preview.willRefund
                ? 'Tu crédito vuelve al cancelar.'
                : 'La cancelación NO devuelve crédito.';
              return (
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full rounded-full border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => cancelMutation.mutate()}
                    disabled={cancelMutation.isPending}
                  >
                    {cancelMutation.isPending ? 'Cancelando...' : 'Cancelar reserva'}
                  </Button>
                  <p className="text-center text-xs text-balance-dark/55">{refundHint}</p>
                </div>
              );
            }
            // Cannot cancel — show the studio's late-cancel message
            const lateMsg =
              policy?.late_cancel_message ||
              preview?.reason ||
              'Esta reserva ya no puede cancelarse.';
            return (
              <div className="rounded-2xl border border-balance-sand/65 bg-balance-cream/45 p-4 text-center">
                <p className="text-sm text-balance-dark/72">{lateMsg}</p>
                {policy && policy.enabled && policy.min_hours > 0 && preview?.code !== 'CLASS_ALREADY_STARTED' && (
                  <p className="mt-1 text-xs text-balance-dark/45">
                    Las cancelaciones aplican hasta {policy.min_hours}h antes de la clase.
                  </p>
                )}
              </div>
            );
          })()}
        </div>
      </ClientLayout>
    </AuthGuard>
  );
}
