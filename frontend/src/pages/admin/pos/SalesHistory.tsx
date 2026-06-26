import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import api, { getErrorMessage } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, XCircle, Receipt } from 'lucide-react';
import { getPaymentMethodLabel } from '@/lib/paymentLabels';

interface SaleItem { name: string; qty: number; }
interface Sale {
  id: string;
  created_at: string;
  customer_name: string | null;
  seller_name: string | null;
  facility_name: string | null;
  total: string | number;
  payment_method: string;
  status: string;
  shift_status: string | null;
  items: SaleItem[];
}

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

export function SalesHistory() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [cancelTarget, setCancelTarget] = useState<Sale | null>(null);
  const [reason, setReason] = useState('');

  const { data: sales = [], isLoading } = useQuery<Sale[]>({
    queryKey: ['admin-sales'],
    queryFn: async () => {
      const { data } = await api.get('/sales');
      return Array.isArray(data) ? data : [];
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => (await api.patch(`/sales/${cancelTarget!.id}/cancel`, { reason: reason.trim() })).data,
    onSuccess: (data) => {
      const refund = Number(data?.refunded || 0);
      toast({
        title: 'Venta cancelada',
        description: refund > 0
          ? `Se devolvió ${mxn.format(refund)} en efectivo al cajón y se repuso el stock.`
          : 'Se repuso el stock de los productos.',
      });
      setCancelTarget(null);
      setReason('');
      qc.invalidateQueries({ queryKey: ['admin-sales'] });
      qc.invalidateQueries({ queryKey: ['products'] }); // refrescar stock
    },
    onError: (e) => toast({ variant: 'destructive', title: 'No se pudo cancelar', description: getErrorMessage(e) }),
  });

  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4 border-b flex items-center gap-2">
        <Receipt className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Historial de ventas</h2>
        <span className="text-xs text-muted-foreground">(últimas 100)</span>
      </div>

      {isLoading ? (
        <div className="py-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : sales.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Aún no hay ventas registradas.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Productos</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Vendió</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Método</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.map((s) => {
                const cancelled = s.status === 'cancelled';
                const canCancel = !cancelled && s.shift_status === 'open';
                return (
                  <TableRow key={s.id} className={cancelled ? 'opacity-60' : ''}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {format(parseISO(s.created_at), 'd MMM HH:mm', { locale: es })}
                    </TableCell>
                    <TableCell className="text-sm max-w-[240px]">
                      {(s.items ?? []).map((it, i) => (
                        <span key={i} className="block truncate">{it.qty}× {it.name}</span>
                      ))}
                      {s.facility_name && <span className="block text-[11px] text-muted-foreground">{s.facility_name}</span>}
                    </TableCell>
                    <TableCell className="text-sm">{s.customer_name || '—'}</TableCell>
                    <TableCell className="text-sm">{s.seller_name || '—'}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{mxn.format(Number(s.total))}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs">{getPaymentMethodLabel(s.payment_method)}</Badge></TableCell>
                    <TableCell className="text-right">
                      {cancelled ? (
                        <Badge variant="outline" className="text-rose-600 border-rose-200">Cancelada</Badge>
                      ) : canCancel ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => { setCancelTarget(s); setReason(''); }}
                        >
                          <XCircle className="h-4 w-4 mr-1" /> Cancelar
                        </Button>
                      ) : (
                        <span className="text-[11px] text-muted-foreground" title="Las ventas de un turno ya cerrado requieren un ajuste manual.">turno cerrado</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => { if (!o) { setCancelTarget(null); setReason(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar esta venta?</AlertDialogTitle>
            <AlertDialogDescription>
              Se <strong>repone el stock</strong> de los productos y, si fue en <strong>efectivo</strong>, se registra la devolución en el cajón{cancelTarget ? ` (${mxn.format(Number(cancelTarget.total))})` : ''}. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5 py-1">
            <Label htmlFor="cancel-reason">Motivo de la cancelación</Label>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. producto equivocado, error de cobro…"
              rows={2}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMutation.isPending}>No cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelMutation.isPending || !reason.trim()}
              onClick={(e) => { e.preventDefault(); cancelMutation.mutate(); }}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {cancelMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sí, cancelar venta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
