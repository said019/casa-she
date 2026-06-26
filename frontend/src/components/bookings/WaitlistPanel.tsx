import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowDown, ArrowUp, Clock, UserMinus, UserPlus, Users } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';

interface QueueEntry {
  booking_id: string;
  waitlist_position: number;
  created_at: string;
  user_id: string;
  display_name: string;
  phone: string | null;
  reformer_remaining: number | null;
  multi_remaining: number | null;
}

interface WaitlistGroup {
  class_id: string;
  date: string;
  start_time: string;
  class_type_name: string;
  category: 'reformer' | 'multi';
  instructor_name: string | null;
  facility_name: string | null;
  max_capacity: number;
  current_bookings: number;
  queue: QueueEntry[];
}

/** Panel compartido (admin + recepción con permiso 'reservas') para gestionar
 *  las filas de espera por clase: promover, quitar y reordenar. */
export function WaitlistPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<WaitlistGroup[]>({
    queryKey: ['waitlist-queues'],
    queryFn: async () => (await api.get('/bookings/waitlist')).data,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['waitlist-queues'] });
  const onError = (err: unknown) =>
    toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) });

  const promote = useMutation({
    mutationFn: async (id: string) => api.post(`/bookings/${id}/waitlist-promote`, {}),
    onSuccess: () => { toast({ title: 'Promovido', description: 'El usuario quedó confirmado y se le cobró su crédito.' }); refresh(); },
    onError,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => api.post(`/bookings/${id}/waitlist-remove`, {}),
    onSuccess: () => { toast({ title: 'Retirado de la fila' }); refresh(); },
    onError,
  });
  const move = useMutation({
    mutationFn: async (p: { id: string; direction: 'up' | 'down' }) =>
      api.patch(`/bookings/${p.id}/waitlist-position`, { direction: p.direction }),
    onSuccess: refresh,
    onError,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando filas…</p>;
  if (!data?.length) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          No hay usuarios en lista de espera. Las filas aparecen cuando una clase se llena.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {data.map((g) => {
        const hasRoom = g.current_bookings < g.max_capacity;
        const credits = (e: QueueEntry) =>
          g.category === 'reformer' ? e.reformer_remaining : e.multi_remaining;
        return (
          <Card key={g.class_id}>
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base">
                <span>{g.class_type_name}</span>
                <span className="flex items-center gap-1 text-sm font-normal capitalize text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {format(parseISO(String(g.date).slice(0, 10)), 'EEEE d MMM', { locale: es })} · {g.start_time.slice(0, 5)}
                </span>
                {g.instructor_name && <span className="text-sm font-normal text-muted-foreground">{g.instructor_name}</span>}
                {g.facility_name && <Badge variant="outline">{g.facility_name}</Badge>}
                <Badge variant={hasRoom ? 'default' : 'secondary'} className="ml-auto">
                  <Users className="mr-1 h-3 w-3" />
                  {g.current_bookings}/{g.max_capacity}{hasRoom ? ' · hay cupo' : ' · llena'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {g.queue.map((e, idx) => {
                const cred = credits(e);
                const sinCredito = cred !== null && cred <= 0;
                return (
                  <div key={e.booking_id} className="flex items-center gap-3 rounded-xl border px-3 py-2">
                    <span className="w-8 shrink-0 text-center text-sm font-bold tabular-nums text-balance-olive">
                      #{e.waitlist_position}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{e.display_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {sinCredito ? 'Sin créditos de esta categoría' : cred === null ? 'Créditos ilimitados' : `${cred} créditos`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" title="Subir"
                        disabled={idx === 0 || move.isPending}
                        onClick={() => move.mutate({ id: e.booking_id, direction: 'up' })}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" title="Bajar"
                        disabled={idx === g.queue.length - 1 || move.isPending}
                        onClick={() => move.mutate({ id: e.booking_id, direction: 'down' })}>
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" title={hasRoom ? 'Promover ya (cobra su crédito)' : 'Sin cupo'}
                        disabled={!hasRoom || sinCredito || promote.isPending}
                        onClick={() => promote.mutate(e.booking_id)}>
                        <UserPlus className="mr-1 h-3.5 w-3.5" /> Promover
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" title="Quitar de la fila"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(e.booking_id)}>
                        <UserMinus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
