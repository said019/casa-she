import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { MembershipActivationDialog, ActivationForm } from '@/components/memberships/MembershipActivationDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import api, { getErrorMessage } from '@/lib/api';
import type { Membership } from '@/types/auth';
import { CheckCircle2, FileText, Mail, Search, XCircle } from 'lucide-react';
import { PAYMENT_METHOD_LABELS as paymentLabels } from '@/lib/membershipPaymentMethods';

const statusLabels: Record<string, string> = {
  pending_payment: 'Pendiente de Pago',
  pending_activation: 'Pendiente de Activación',
};

const statusBadgeStyles: Record<string, string> = {
  pending_payment: 'text-warning border-warning/30 bg-warning/10',
  pending_activation: 'text-info border-info/30 bg-info/10',
};

const formatCurrency = (amount?: number | null, currency = 'MXN') => {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
};

interface PendingMembershipsPanelProps {
  /** Encabezado de la pantalla. */
  title?: string;
  subtitle?: string;
}

/**
 * Panel compartido (admin + recepción master) para validar membresías pendientes:
 * ver el comprobante de transferencia, aprobar (activar) o rechazar.
 * El backend exige acceso elevado (admin/super_admin/recepción master) en /pending,
 * /:id/activate y /:id/cancel.
 */
export function PendingMembershipsPanel({
  title = 'Membresías Pendientes de Activación',
  subtitle,
}: PendingMembershipsPanelProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [activationMembership, setActivationMembership] = useState<Membership | null>(null);
  const [receiptMembership, setReceiptMembership] = useState<Membership | null>(null);
  const [rejectMembership, setRejectMembership] = useState<Membership | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: memberships, isLoading } = useQuery<Membership[]>({
    queryKey: ['memberships', 'pending'],
    queryFn: async () => {
      const { data } = await api.get('/memberships/pending');
      return data;
    },
  });

  const activateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: ActivationForm }) => {
      return await api.post(`/memberships/${id}/activate`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memberships'] });
      toast({ title: 'Membresía activada', description: 'La membresía está ahora activa.' });
      setActivationMembership(null);
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(error) });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      return await api.post(`/memberships/${id}/cancel`, {
        reason: 'Comprobante rechazado por recepción',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memberships'] });
      toast({ title: 'Solicitud rechazada', description: 'La membresía pendiente fue rechazada.' });
      setRejectMembership(null);
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(error) });
    },
  });

  const filteredMemberships = useMemo(() => {
    if (!memberships) return [];
    const normalizedSearch = search.trim().toLowerCase();
    return memberships.filter((membership) => {
      if (filter !== 'all' && membership.status !== filter) return false;
      if (!normalizedSearch) return true;
      return (
        membership.user_name?.toLowerCase().includes(normalizedSearch) ||
        membership.user_email?.toLowerCase().includes(normalizedSearch) ||
        membership.plan_name?.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [memberships, search, filter]);

  const pendingCount = memberships?.length ?? 0;

  const handleActivate = (membershipId: string, data: ActivationForm) => {
    activateMutation.mutate({ id: membershipId, payload: data });
  };

  const formatRequestedAt = (dateValue?: string | null) => {
    if (!dateValue) return '—';
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) return '—';
    return formatDistanceToNow(parsed, { addSuffix: true, locale: es });
  };

  const getPaymentLabel = (method?: string | null) => {
    if (!method) return 'No indicado';
    return paymentLabels[method] || method;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold">{title}</h1>
          <p className="text-muted-foreground">
            {subtitle ?? `${pendingCount} solicitudes por validar y activar.`}
          </p>
        </div>
        <Badge variant="outline" className="w-fit">
          {pendingCount} pendientes
        </Badge>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente o plan..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-full md:w-56">
            <SelectValue placeholder="Filtrar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="pending_payment">Pendiente de Pago</SelectItem>
            <SelectItem value="pending_activation">Pendiente de Activación</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Cargando membresías pendientes...
            </CardContent>
          </Card>
        ) : filteredMemberships.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              No hay membresías pendientes en este momento.
            </CardContent>
          </Card>
        ) : (
          filteredMemberships.map((membership) => {
            const amount = membership.price_paid ?? membership.plan_price ?? null;
            const currency = membership.plan_currency || 'MXN';
            const statusLabel = statusLabels[membership.status] || membership.status;
            const statusStyle = statusBadgeStyles[membership.status] || '';
            const contactHref = membership.user_email ? `mailto:${membership.user_email}` : '#';
            const hasReceipt = Boolean(membership.receipt_url);

            return (
              <Card key={membership.id} className="border-muted/60">
                <CardContent className="p-4 space-y-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold">{membership.user_name || 'Cliente'}</h3>
                        <Badge variant="outline" className={statusStyle}>
                          {statusLabel}
                        </Badge>
                        {membership.payment_method === 'transfer' && (
                          <Badge
                            variant="outline"
                            className={
                              hasReceipt
                                ? 'text-success border-success/30 bg-success/10'
                                : 'text-warning border-warning/30 bg-warning/10'
                            }
                          >
                            {hasReceipt ? 'Con comprobante' : 'Sin comprobante'}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Plan: {membership.plan_name || '—'} · {formatCurrency(amount, currency)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Solicitado {formatRequestedAt(membership.created_at)} · Método indicado:{' '}
                        {getPaymentLabel(membership.payment_method)}
                      </div>
                      {membership.user_email && (
                        <div className="text-sm text-muted-foreground">{membership.user_email}</div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!hasReceipt}
                        onClick={() => setReceiptMembership(membership)}
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        Ver comprobante
                      </Button>
                      <Button variant="outline" size="sm" asChild>
                        <a href={contactHref}>
                          <Mail className="mr-2 h-4 w-4" />
                          Contactar
                        </a>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setRejectMembership(membership)}
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        Rechazar
                      </Button>
                      <Button size="sm" onClick={() => setActivationMembership(membership)}>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Aprobar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <MembershipActivationDialog
        open={Boolean(activationMembership)}
        membership={activationMembership}
        isSubmitting={activateMutation.isPending}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setActivationMembership(null);
        }}
        onActivate={handleActivate}
      />

      {/* Comprobante de transferencia */}
      <Dialog
        open={Boolean(receiptMembership)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setReceiptMembership(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Comprobante de transferencia</DialogTitle>
            <DialogDescription>
              {receiptMembership?.user_name || 'Cliente'} · {receiptMembership?.plan_name || '—'}
            </DialogDescription>
          </DialogHeader>
          {receiptMembership?.receipt_url ? (
            <a
              href={receiptMembership.receipt_url}
              target="_blank"
              rel="noreferrer"
              className="block"
              title="Abrir en una pestaña nueva"
            >
              <img
                src={receiptMembership.receipt_url}
                alt="Comprobante de transferencia"
                className="max-h-[60vh] w-full rounded-lg object-contain ring-1 ring-border"
              />
            </a>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Esta solicitud no tiene comprobante adjunto.
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmación de rechazo */}
      <Dialog
        open={Boolean(rejectMembership)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setRejectMembership(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar solicitud</DialogTitle>
            <DialogDescription>
              Se rechazará la membresía pendiente de{' '}
              <strong>{rejectMembership?.user_name || 'este cliente'}</strong>. El cliente deberá
              volver a comprarla. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectMembership(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={rejectMutation.isPending}
              onClick={() => rejectMembership && rejectMutation.mutate(rejectMembership.id)}
            >
              {rejectMutation.isPending ? 'Rechazando…' : 'Rechazar solicitud'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
