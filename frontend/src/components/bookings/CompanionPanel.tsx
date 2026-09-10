import { useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';

type Companion = {
  id: string; guest_name: string; mode: 'credit' | 'monthly_free' | 'paid';
  status: 'pending_payment' | 'confirmed' | 'cancelled' | 'payment_review' | 'refund_review' | 'refunded';
  amount: number; checkout_url?: string | null; guest_booking_id?: string | null;
};
type CompanionData = {
  companions: Companion[];
  policy: { eligible: boolean; reason?: string; mode: Companion['mode']; amount: number; remaining_slots: number };
};
const labels: Record<Companion['status'], string> = {
  pending_payment: 'Pendiente de pago', confirmed: 'Lugar confirmado', cancelled: 'Cancelada',
  payment_review: 'Pago en revisión por recepción', refund_review: 'En revisión por recepción', refunded: 'Reembolsada',
};
const money = (amount: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
const safeReasons = new Set([
  'Esta clase ya no admite reservas.', 'Necesitas una reserva confirmada como titular.',
  'La reserva debe estar vinculada a una membresía de la titular.', 'La membresía no está vigente para esta clase.',
  'La membresía pertenece a otro estudio.', 'No quedan créditos para una invitada.', 'No quedan créditos para la invitada.',
  'Puedes reservar hasta 2 invitadas en esta clase.', 'La clase ya no tiene lugares disponibles.',
  'La invitada debe ser otra persona.', 'La invitada ya tiene una reserva para esta clase.',
  'Revisa el nombre y teléfono de la invitada.', 'Escribe un teléfono válido de 10 dígitos.',
  'Hay otra solicitud en proceso para esta invitada. Intenta nuevamente.', 'Esta invitada ya está registrada.',
  'Este pago requiere revisión en recepción.', 'Esta invitada requiere revisión en recepción.',
  'Ya pasó el plazo permitido para cancelar. Contacta a recepción.', 'La clase ya empezó; contacta a recepción.',
  'Las cancelaciones están desactivadas. Contacta a recepción.',
  'Se recibió un pago adicional: revisar devolución.', 'El importe o moneda del pago no coincide con $280 MXN.',
  'Pago recibido para una solicitud que ya no está pendiente.', 'No fue posible confirmar el lugar; revisar pago en recepción.',
]);

export function CompanionPanel({ bookingId, staff = false }: { bookingId: string; staff?: boolean }) {
  const uid = useId();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const request = useRef<{ name: string; phone: string; requestId: string } | null>(null);
  const client = useQueryClient();
  const { toast } = useToast();
  const query = useQuery<CompanionData>({
    queryKey: ['companions', bookingId],
    queryFn: async () => (await api.get(`/companions/booking/${bookingId}`)).data,
    refetchInterval: q => q.state.data?.companions.some(c => c.status === 'pending_payment') ? 5000 : false,
  });
  const refresh = () => {
    for (const key of ['companions', 'companions-review', 'attendees', 'classes', 'my-bookings', 'cancel-preview', 'my-membership']) {
      void client.invalidateQueries({ queryKey: [key] });
    }
  };
  const mutation = useMutation({
    mutationFn: async (action: { type: 'add' | 'cancel' | 'receive'; id?: string; method?: 'cash' | 'transfer' }) => {
      if (action.type === 'add') {
        const values = { name: name.trim(), phone: phone.trim() };
        if (!request.current || request.current.name !== values.name || request.current.phone !== values.phone) {
          request.current = { ...values, requestId: crypto.randomUUID() };
        }
        return api.post(`/companions/booking/${bookingId}`, request.current);
      }
      return api.post(`/companions/${action.id}/${action.type === 'cancel' ? 'cancel' : 'receive-payment'}`,
        action.type === 'receive' ? { method: action.method } : {});
    },
    onSuccess: (_, action) => {
      if (action.type === 'add') { setName(''); setPhone(''); request.current = null; }
      refresh();
      toast({ title: 'Solicitud actualizada', description: 'Consulta el estado de la invitada para verificar su lugar.' });
    },
    onError: error => {
      refresh();
      const message = getErrorMessage(error);
      toast({ variant: 'destructive', title: 'No pudimos completar la solicitud', description: safeReasons.has(message) ? message : 'Revisa el nombre, el teléfono y los lugares disponibles antes de intentar de nuevo. Si registraste un pago, consulta a recepción.' });
    },
  });
  const data = query.data;
  return <Card className="rounded-[1.75rem] border-balance-sand/65">
    <CardHeader><CardTitle>Invita a una amiga</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Hasta dos invitadas en tu misma clase. Cada una ocupa su propio lugar.</p>
      {query.isLoading && <p role="status">Consultando invitadas…</p>}
      {query.isError && <div role="alert"><p>No pudimos consultar las invitadas.</p><Button variant="outline" onClick={() => query.refetch()}>Reintentar</Button></div>}
      {data && <>
        <div className="space-y-3" aria-live="polite">
          {data.companions.map(companion => <div key={companion.id} className="space-y-2 rounded-xl border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{companion.guest_name}</p><Badge variant="outline">{labels[companion.status]}</Badge></div>
            <p className="text-sm text-muted-foreground">{companion.mode === 'credit' ? '1 crédito de la anfitriona' : companion.mode === 'monthly_free' ? 'Visita mensual incluida' : `${money(companion.amount)} MXN`}</p>
            {companion.status === 'pending_payment' && <>
              <p className="text-sm">El pago pendiente no aparta lugar. La reserva se confirma después de validar el pago, sujeta a disponibilidad. Si se agotan los lugares, recepción revisará el pago.</p>
              {companion.checkout_url?.startsWith('https://') && <Button asChild><a href={companion.checkout_url} target="_blank" rel="noopener noreferrer">Pagar invitada</a></Button>}
              {!companion.checkout_url && <p className="text-sm text-muted-foreground">Puedes completar el pago en recepción.</p>}
              {staff && <div className="flex flex-wrap gap-2">{(['cash', 'transfer'] as const).map(method => <Button key={method} variant="outline" disabled={mutation.isPending} onClick={() => {
                if (window.confirm(`¿Confirmas que ya recibiste ${money(companion.amount)} MXN ${method === 'cash' ? 'en efectivo' : 'por transferencia'} de ${companion.guest_name}?`)) mutation.mutate({ type: 'receive', id: companion.id, method });
              }}>Registrar {method === 'cash' ? 'efectivo recibido' : 'transferencia recibida'}</Button>)}</div>}
            </>}
            {['payment_review', 'refund_review'].includes(companion.status) && <p className="text-sm">Recepción debe revisar esta solicitud. Este estado no confirma un lugar ni un reembolso.</p>}
            {['confirmed', 'pending_payment'].includes(companion.status) && <Button variant="outline" disabled={mutation.isPending} onClick={() => {
              if (window.confirm(`¿Cancelar la invitación de ${companion.guest_name}? Si hubo un pago, recepción revisará su situación.`)) mutation.mutate({ type: 'cancel', id: companion.id });
            }}>Cancelar invitada</Button>}
          </div>)}
        </div>
        {data.companions.some(c => c.status === 'confirmed') && <p className="text-sm text-muted-foreground">Para cancelar tu reserva, primero cancela las invitadas confirmadas.</p>}
        {data.policy.eligible && data.policy.remaining_slots > 0 ? <form className="space-y-3" onSubmit={event => { event.preventDefault(); mutation.mutate({ type: 'add' }); }}>
          <p className="text-sm">{data.policy.mode === 'credit' ? 'Esta invitada usará 1 crédito de tu membresía.' : data.policy.mode === 'monthly_free' ? 'Tu membresía ilimitada incluye una visita de invitada por ciclo mensual. Esta visita está incluida; las siguientes cuestan $280 MXN.' : `Esta visita cuesta ${money(data.policy.amount)} MXN. Tu visita incluida de este ciclo mensual ya fue utilizada.`}</p>
          <div className="space-y-1"><Label htmlFor={`${uid}-name`}>Nombre de la invitada</Label><Input id={`${uid}-name`} required minLength={2} maxLength={120} value={name} disabled={mutation.isPending} onChange={e => setName(e.target.value)} autoComplete="off" /></div>
          <div className="space-y-1"><Label htmlFor={`${uid}-phone`}>Teléfono de la invitada</Label><Input id={`${uid}-phone`} type="tel" required minLength={10} maxLength={25} value={phone} disabled={mutation.isPending} onChange={e => setPhone(e.target.value)} autoComplete="off" /></div>
          <Button type="submit" disabled={mutation.isPending || !name.trim() || !phone.trim()}>{mutation.isPending ? 'Guardando…' : data.policy.mode === 'paid' ? 'Agregar invitada para pago' : 'Confirmar invitada'}</Button>
        </form> : <p className="text-sm text-muted-foreground">{data.policy.reason && safeReasons.has(data.policy.reason) ? data.policy.reason : data.policy.remaining_slots === 0 ? 'Ya tienes dos invitadas activas en esta reserva.' : 'Esta reserva no permite agregar invitadas. Consulta a recepción para conocer las opciones.'}</p>}
      </>}
    </CardContent>
  </Card>;
}

export function CompanionReview() {
  const query = useQuery<{ companions: (Companion & { host_name: string; class_name: string; date: string; start_time: string; reason?: string })[] }>({
    queryKey: ['companions-review'], queryFn: async () => (await api.get('/companions/review')).data,
  });
  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">Pagos o cancelaciones que necesitan seguimiento de recepción. Revisa el cobro y la disponibilidad antes de resolver cada caso.</p>
    {query.isLoading && <p role="status">Consultando…</p>}
    {query.isError && <p role="alert">No pudimos cargar las solicitudes.</p>}
    <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>Actualizar</Button>
    {query.data?.companions.length === 0 && <p>No hay solicitudes por revisar.</p>}
    {query.data?.companions.map(c => <div key={c.id} className="rounded-xl border p-3 space-y-1"><p className="font-medium">{c.guest_name} · {c.host_name}</p><p className="text-sm">{c.class_name} · {c.date?.slice(0, 10)} · {c.start_time?.slice(0, 5)}</p><p className="text-sm">{labels[c.status]} · {money(c.amount)} MXN</p>{c.reason && <p className="text-sm">{safeReasons.has(c.reason) ? c.reason : 'Consulta el detalle del pago con recepción.'}</p>}<p className="text-xs text-muted-foreground">Referencia: {c.id}</p></div>)}
  </div>;
}
