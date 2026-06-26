import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigate, useParams } from 'react-router-dom';
import api, { getErrorMessage } from '@/lib/api';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { CoachSheet } from '@/components/CoachSheet';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/use-toast';
import { Calendar, Clock, Users, Star, MapPin } from 'lucide-react';

interface ClassDetail {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  max_capacity: number;
  current_bookings: number;
  status: string;
  booking_closed?: boolean;
  class_type_name: string;
  class_type_color: string;
  instructor_id: string;
  instructor_name: string;
  instructor_photo: string | null;
  facility_name?: string | null;
  facility_address?: string | null;
  facility_maps_url?: string | null;
  is_free?: boolean;
  free_label?: string | null;
}

export default function BookClassConfirm() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [coachOpen, setCoachOpen] = useState(false);

  const { data, isLoading, isError } = useQuery<ClassDetail>({
    queryKey: ['class-detail', classId],
    queryFn: async () => {
      const { data } = await api.get(`/classes/${classId}`);
      return data;
    },
    enabled: Boolean(classId),
  });

  // Interruptor global del estudio: si admin/recepción master apagó las reservas, no se puede agendar.
  const { data: bookingState } = useQuery<{ enabled: boolean }>({
    queryKey: ['booking-enabled'],
    queryFn: async () => (await api.get('/settings/booking-enabled')).data,
  });

  // Política de cancelación real (no hardcodear las horas).
  const { data: cancelPolicy } = useQuery<{ min_hours?: number }>({
    queryKey: ['cancellation-policy'],
    queryFn: async () => (await api.get('/settings/cancellation-policy')).data,
  });
  const cancelHours = Number(cancelPolicy?.min_hours ?? 12);

  const canBook = Boolean(classId);
  const bookMutation = useMutation({
    mutationFn: async () => {
      return await api.post('/bookings', { classId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classes-public'] });
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
      // Refrescar los créditos: al reservar se descuenta 1 crédito en la BD, pero el
      // conteo en pantalla (Dashboard/Perfil) usa 'my-membership' y no se actualizaba,
      // por eso parecía que "no se jalaban los créditos".
      queryClient.invalidateQueries({ queryKey: ['my-membership'] });
      toast({ title: '¡Reserva exitosa!', description: 'Te esperamos en clase.' });
      navigate('/app/classes');
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'No se pudo reservar',
        description: getErrorMessage(err),
      });
    },
  });

  const waitlistMutation = useMutation({
    mutationFn: async () => {
      return await api.post('/bookings', { classId, waitlist: true });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
      toast({
        title: 'Estás en la lista de espera',
        description: `Posición #${res.data?.waitlist_position ?? 1}. Te avisamos si se libera un lugar.`,
      });
      navigate('/app/classes');
    },
    onError: (err: any) => {
      if (err?.response?.data?.code === 'SPOT_AVAILABLE') {
        bookMutation.mutate(); // se liberó un lugar: reservar normal
        return;
      }
      toast({ variant: 'destructive', title: 'No se pudo anotar', description: getErrorMessage(err) });
    },
  });

  const isFull = (data?.current_bookings || 0) >= (data?.max_capacity || 0);
  const isClosed = !!data?.booking_closed;
  const isBookingPaused = bookingState?.enabled === false;
  const isCancelled = data?.status === 'cancelled';
  const isPast = data ? parseISO(`${data.date.slice(0, 10)}T${data.start_time}`).getTime() <= Date.now() : false;

  return (
    <AuthGuard requiredRoles={['client']}>
      <ClientLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold font-heading">Confirmar reserva</h1>
            <p className="text-muted-foreground">Revisa los detalles antes de confirmar.</p>
          </div>

          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : isError || !data ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                No pudimos cargar la clase seleccionada.
              </CardContent>
            </Card>
          ) : (
            <Card className={`overflow-hidden border-0 shadow-md ${data.is_free ? 'ring-2 ring-green-300' : ''}`}>
              {/* Color band from class type */}
              <div
                className="h-2"
                style={{ backgroundColor: data.is_free ? '#16a34a' : (data.class_type_color || '#A48550') }}
              />
              <CardContent className="pt-5 space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2
                    className="text-xl font-bold font-heading"
                    style={{ color: data.is_free ? '#15803d' : (data.class_type_color || '#322A1E') }}
                  >
                    {data.class_type_name}
                  </h2>
                  {data.is_free && (
                    <span className="rounded-full bg-green-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                      {data.free_label || 'Gratis'}
                    </span>
                  )}
                </div>

                {data.facility_name && (
                  <div className="flex items-start gap-3 rounded-xl border border-balance-olive/30 bg-balance-olive/10 px-4 py-3">
                    <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-balance-olive" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-balance-dark">{data.facility_name}</p>
                      {data.facility_address && (
                        <p className="text-xs text-balance-dark/70 break-words">{data.facility_address}</p>
                      )}
                      {data.facility_maps_url && (
                        <a
                          href={data.facility_maps_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block text-xs font-semibold text-balance-olive underline-offset-2 hover:underline"
                        >
                          Cómo llegar →
                        </a>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="capitalize">
                    {format(parseISO(data.date), 'EEEE d MMMM', { locale: es })}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {data.start_time?.slice(0,5)} - {data.end_time?.slice(0,5)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => data.instructor_id && setCoachOpen(true)}
                  disabled={!data.instructor_id}
                  className="flex w-full items-center gap-3 rounded-xl text-left text-sm transition-colors hover:bg-balance-olive/5 disabled:cursor-default -mx-2 px-2 py-1.5"
                >
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={data.instructor_photo || undefined} alt={data.instructor_name} />
                    <AvatarFallback
                      className="text-xs text-white"
                      style={{ backgroundColor: data.class_type_color || '#A48550' }}
                    >
                      {data.instructor_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium">{data.instructor_name}</span>
                  {data.instructor_id && (
                    <span className="ml-auto text-xs font-semibold text-balance-olive">Conoce a tu coach →</span>
                  )}
                </button>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>Lugares: {data.current_bookings}/{data.max_capacity}</span>
                </div>
                {isClosed && !isPast && !isCancelled && (
                  <p className="text-xs font-medium text-amber-700">
                    Esta clase está cerrada — ya no acepta nuevas reservas.
                  </p>
                )}
                {isBookingPaused && !isPast && !isCancelled && (
                  <p className="text-xs font-medium text-rose-700">
                    Las reservas están pausadas por el estudio. Escríbenos a recepción para agendar.
                  </p>
                )}
                {isFull && !isClosed && !isPast && !isCancelled && (
                  <p className="text-xs text-balance-olive">
                    Clase llena — puedes anotarte en lista de espera. Tu crédito solo se usa si se libera un lugar.
                  </p>
                )}
                <div className="pt-1 border-t space-y-1.5">
                  {data.is_free ? (
                    <p className="text-xs font-semibold text-green-700 flex items-center gap-1.5">
                      <span className="text-green-600">✓</span>
                      Esta clase es gratis. No se descontará ningún crédito.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      * Se descontará 1 crédito de tu membresía activa.
                    </p>
                  )}
                  <p className="text-xs font-medium text-balance-olive flex items-center gap-1.5">
                    <Star className="h-3.5 w-3.5 fill-current" />
                    Ganarás 10 puntos de lealtad al asistir.
                  </p>
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>Cancela con al menos <strong className="font-semibold">{cancelHours} {cancelHours === 1 ? 'hora' : 'horas'}</strong> de anticipación para recuperar tu crédito.</span>
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => navigate('/app/book')}>
              Volver al calendario
            </Button>
            {isFull && !isClosed && !isBookingPaused && !isCancelled && !isPast ? (
              <Button
                className="w-full sm:w-auto"
                onClick={() => waitlistMutation.mutate()}
                disabled={!canBook || waitlistMutation.isPending || bookMutation.isPending}
              >
                {waitlistMutation.isPending ? 'Anotando...' : 'Anotarme en lista de espera'}
              </Button>
            ) : (
              <Button
                className="w-full sm:w-auto"
                onClick={() => bookMutation.mutate()}
                disabled={!canBook || bookMutation.isPending || isFull || isClosed || isBookingPaused || isCancelled || isPast}
              >
                {bookMutation.isPending ? 'Reservando...' : isBookingPaused ? 'Reservas pausadas' : isClosed ? 'Clase cerrada' : isPast ? 'Clase ya pasada' : 'Confirmar reserva'}
              </Button>
            )}
          </div>
        </div>

        <CoachSheet
          instructorId={coachOpen ? (data?.instructor_id ?? null) : null}
          instructorName={data?.instructor_name ?? null}
          onClose={() => setCoachOpen(false)}
          onPickClass={(cid) => { setCoachOpen(false); navigate(`/app/book/${cid}`); }}
        />
      </ClientLayout>
    </AuthGuard>
  );
}
