import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import api from '@/lib/api';
import { getPaymentMethodLabel } from '@/lib/paymentLabels';
import type { PaymentRecord } from '@/types/payment';
import { Loader2, Search, X } from 'lucide-react';

interface PaymentsListProps {
  title?: string;
  description?: string;
  initialStatus?: string;
  statusLocked?: boolean;
  embedded?: boolean;
}

const statusLabels: Record<string, string> = {
  completed: 'Completado',
  pending: 'Pendiente',
  failed: 'Fallido',
  refunded: 'Reembolsado',
};

const statusStyles: Record<string, string> = {
  completed: 'bg-success/10 text-success border-success/30',
  pending: 'bg-warning/10 text-warning border-warning/30',
  failed: 'bg-rose-50 text-rose-700 border-rose-200',
  refunded: 'bg-muted text-muted-foreground border-border',
};

const formatCurrency = (amount: number, currency: string) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);

export default function PaymentsTransactions({
  title = 'Transacciones',
  description = 'Historial de pagos registrados.',
  initialStatus = 'all',
  statusLocked = false,
  embedded = false,
}: PaymentsListProps) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(initialStatus);
  const [paymentMethod, setPaymentMethod] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { data, isLoading } = useQuery<PaymentRecord[]>({
    queryKey: ['payments', status, search, paymentMethod, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status !== 'all') params.append('status', status);
      if (search) params.append('search', search);
      if (paymentMethod !== 'all') params.append('paymentMethod', paymentMethod);
      if (startDate) params.append('startDate', startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        params.append('endDate', end.toISOString());
      }
      const { data } = await api.get(`/payments/transactions?${params.toString()}`);
      return data;
    },
  });

  const clearFilters = () => {
    setSearch('');
    if (!statusLocked) setStatus('all');
    setPaymentMethod('all');
    setStartDate('');
    setEndDate('');
  };

  const hasActiveFilters =
    !!search || (!statusLocked && status !== 'all') || paymentMethod !== 'all' || !!startDate || !!endDate;

  const payments = useMemo(() => data || [], [data]);

  const content = (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por usuario..."
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Select value={status} onValueChange={setStatus} disabled={statusLocked}>
            <SelectTrigger>
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="completed">Completadas</SelectItem>
              <SelectItem value="pending">Pendientes</SelectItem>
              <SelectItem value="failed">Fallidas</SelectItem>
              <SelectItem value="refunded">Reembolsadas</SelectItem>
            </SelectContent>
          </Select>

          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger>
              <SelectValue placeholder="Método de pago" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los métodos</SelectItem>
              <SelectItem value="cash">Efectivo</SelectItem>
              <SelectItem value="transfer">Transferencia</SelectItem>
              <SelectItem value="card">Tarjeta</SelectItem>
              <SelectItem value="online">En línea</SelectItem>
            </SelectContent>
          </Select>

          <div className="grid grid-cols-2 gap-2">
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              placeholder="Desde"
              aria-label="Fecha desde"
            />
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              placeholder="Hasta"
              aria-label="Fecha hasta"
            />
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 text-muted-foreground">
              <X className="h-3.5 w-3.5" />
              Limpiar filtros
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Membresía</TableHead>
              <TableHead>Monto</TableHead>
              <TableHead>Método</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                </TableCell>
              </TableRow>
            ) : payments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No hay pagos registrados.
                </TableCell>
              </TableRow>
            ) : (
              payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>
                    <div className="font-medium">{payment.user_name}</div>
                    <div className="text-xs text-muted-foreground">{payment.user_email}</div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {payment.plan_name || '—'}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {formatCurrency(payment.amount, payment.currency)}
                  </TableCell>
                  <TableCell className="text-sm">{getPaymentMethodLabel(payment.payment_method)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusStyles[payment.status]}>
                      {statusLabels[payment.status] || payment.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(payment.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  if (embedded) return content;

  return (
    <AuthGuard requiredRoles={['admin']}>
      <AdminLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-heading font-bold">{title}</h1>
            <p className="text-muted-foreground">{description}</p>
          </div>
          {content}
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}

/** Embeddable version without layout wrapper */
export function TransactionsContent() {
  return <PaymentsTransactions embedded />;
}

export function PendingPaymentsContent() {
  return <PaymentsTransactions initialStatus="pending" statusLocked embedded />;
}
