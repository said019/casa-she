import { useState, Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { subDays, format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { getPaymentMethodLabel } from '@/lib/paymentLabels';

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

// Etiquetas legibles para cada action_type que registra el backend
const ACTION_LABELS: Record<string, string> = {
    credits_modified: 'Créditos modificados',
    membership_activated: 'Membresía activada',
    membership_sold: 'Membresía vendida (mostrador)',
    booking_cancelled: 'Reserva cancelada',
    attendance_no_show: 'Marcada como no asistió',
    class_instructor_changed: 'Instructor de clase cambiado',
    classes_recurring_created: 'Clases recurrentes creadas',
    cash_shift_opened: 'Caja abierta',
    cash_shift_closed: 'Caja cerrada',
    cash_movement: 'Movimiento de caja',
    coach_pay_rate_updated: 'Tarifa de coach actualizada',
    coach_payout_paid: 'Pago a coach marcado pagado',
    coach_payout_unpaid: 'Pago a coach revertido',
    commission_paid: 'Comisión pagada',
    commission_unpaid: 'Comisión revertida',
    product_created: 'Producto creado',
    product_price_updated: 'Precio de producto actualizado',
    product_stock_adjusted: 'Stock ajustado',
    sale_cancelled: 'Venta cancelada',
    user_role_changed: 'Rol de usuario cambiado',
    waitlist_promoted: 'Promovida de lista de espera',
    waitlist_removed: 'Quitada de lista de espera',
    waitlist_reordered: 'Lista de espera reordenada',
    reception_created: 'Recepcionista creada',
    reception_updated: 'Staff editado',
    reception_master_toggled: 'Permiso master de recepción',
    reception_permissions_updated: 'Permisos de recepción',
    approve_order: 'Orden aprobada',
    reject_order: 'Orden rechazada',
};

// Etiquetas legibles para los campos del detalle (old_data/new_data)
const FIELD_LABELS: Record<string, string> = {
    status: 'Estado', plan_name: 'Plan', payment_method: 'Método de pago',
    amount: 'Monto', price: 'Precio', total: 'Total', reason: 'Motivo',
    refunded: 'Crédito devuelto', user_name: 'Usuario', client_name: 'Usuario',
    class_name: 'Clase', class_date: 'Fecha de clase', bucket: 'Categoría',
    category: 'Categoría', delta: 'Cambio', old_value: 'Valor anterior',
    new_value: 'Valor nuevo', cancellations_used: 'Cancelaciones usadas',
    end_date: 'Vigencia', start_date: 'Inicio', display_name: 'Nombre',
    role: 'Rol', instructor_name: 'Instructor', old_instructor_name: 'Instructor anterior',
    new_instructor_name: 'Instructor nuevo', quantity: 'Cantidad', stock: 'Stock',
    note: 'Nota', notes: 'Notas', email: 'Email', phone: 'Teléfono',
};
const STATUS_ES: Record<string, string> = {
    active: 'Activa', cancelled: 'Cancelada', expired: 'Vencida',
    pending_payment: 'Pago pendiente', pending_activation: 'Pendiente', paused: 'Pausada',
    confirmed: 'Confirmada', checked_in: 'Asistió', no_show: 'No asistió', waitlist: 'Lista de espera',
};
const BUCKET_ES: Record<string, string> = {
    reformer_remaining: 'Reformer', multi_remaining: 'Multi', classes_remaining: 'Genérico',
    reformer: 'Reformer', multi: 'Multi',
};

function isUuid(v: unknown): boolean {
    return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i.test(v);
}
function fieldLabel(k: string): string {
    return FIELD_LABELS[k] ?? k.replace(/_/g, ' ');
}
function formatValue(key: string, v: unknown): string {
    if (v === null || v === undefined || v === '') return '—';
    if (key === 'refunded' || typeof v === 'boolean') return v ? 'Sí' : 'No';
    if (key === 'status') return STATUS_ES[String(v)] ?? String(v);
    if (key === 'payment_method') return getPaymentMethodLabel(String(v));
    if (key === 'bucket' || key === 'category') return BUCKET_ES[String(v)] ?? String(v);
    if (['amount', 'price', 'total'].includes(key) && !isNaN(Number(v))) return mxn.format(Number(v));
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
}

const ACTION_OPTIONS = Object.keys(ACTION_LABELS);

function getDefaults() {
    const today = new Date();
    return {
        from: format(subDays(today, 30), 'yyyy-MM-dd'),
        to: format(today, 'yyyy-MM-dd'),
    };
}

function formatDateTime(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    try {
        const d = parseISO(dateStr);
        if (!isValid(d)) return '—';
        return format(d, 'dd/MM/yyyy HH:mm', { locale: es });
    } catch {
        return '—';
    }
}

function actionLabel(a: string): string {
    return ACTION_LABELS[a] ?? a;
}

function JsonBlock({ label, data }: { label: string; data: unknown }) {
    if (data === null || data === undefined) return null;
    return (
        <div className="space-y-1">
            <div className="text-xs font-semibold text-muted-foreground">{label}</div>
            <pre className="text-xs bg-muted rounded p-2 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(data, null, 2)}
            </pre>
        </div>
    );
}

// Detalle legible: muestra los campos en español (Estado, Método, Crédito devuelto…),
// ocultando los UUID ruidosos (*_id). Si todo el payload era UUID, cae al JSON crudo.
function FriendlyDetail({ label, data }: { label: string; data: unknown }) {
    if (data === null || data === undefined) return null;
    if (typeof data !== 'object' || Array.isArray(data)) return <JsonBlock label={label} data={data} />;
    const entries = Object.entries(data as Record<string, unknown>).filter(
        ([k, v]) => !k.endsWith('_id') && !isUuid(v)
    );
    if (entries.length === 0) return <JsonBlock label={label} data={data} />;
    return (
        <div className="space-y-1">
            <div className="text-xs font-semibold text-muted-foreground">{label}</div>
            <dl className="rounded-md bg-muted/40 p-2 text-xs divide-y divide-border/40">
                {entries.map(([k, v]) => {
                    const refundFlag = k === 'refunded';
                    return (
                        <div key={k} className="flex justify-between gap-3 py-1">
                            <dt className="text-muted-foreground capitalize">{fieldLabel(k)}</dt>
                            <dd
                                className={`font-medium text-right break-words ${
                                    refundFlag ? (v ? 'text-emerald-600' : 'text-orange-600') : ''
                                }`}
                            >
                                {formatValue(k, v)}
                            </dd>
                        </div>
                    );
                })}
            </dl>
        </div>
    );
}

export default function AuditLog() {
    const defaults = getDefaults();
    const [from, setFrom] = useState(defaults.from);
    const [to, setTo] = useState(defaults.to);
    const [action, setAction] = useState<string>('all');
    const [expanded, setExpanded] = useState<string | null>(null);

    const { data: rows = [], isLoading, error } = useQuery<any[]>({
        queryKey: ['audit-log', from, to, action],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (from) params.set('from', from);
            if (to) params.set('to', to);
            if (action && action !== 'all') params.set('action', action);
            const { data } = await api.get(`/admin/audit?${params.toString()}`);
            return Array.isArray(data) ? data : [];
        },
    });

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-heading font-bold">Bitácora</h1>
                    <p className="text-muted-foreground">Quién hizo qué: créditos, membresías, caja, cancelaciones y staff.</p>
                </div>

                {/* Filters */}
                <Card>
                    <CardContent className="pt-4 pb-3">
                        <div className="flex flex-wrap items-end gap-4">
                            <div className="space-y-1">
                                <Label className="text-xs">Desde</Label>
                                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 text-xs w-36" />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Hasta</Label>
                                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 text-xs w-36" />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Acción</Label>
                                <Select value={action} onValueChange={setAction}>
                                    <SelectTrigger className="h-8 text-xs w-56"><SelectValue placeholder="Todas" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todas</SelectItem>
                                        {ACTION_OPTIONS.map((a) => (
                                            <SelectItem key={a} value={a}>{actionLabel(a)}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Table */}
                <div className="border rounded-md">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-8"></TableHead>
                                <TableHead>Fecha/Hora</TableHead>
                                <TableHead>Quién</TableHead>
                                <TableHead>Acción</TableHead>
                                <TableHead>Entidad</TableHead>
                                <TableHead>Descripción</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8">
                                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                                    </TableCell>
                                </TableRow>
                            ) : error ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-destructive">
                                        <div className="flex items-center justify-center gap-2">
                                            <AlertCircle className="h-4 w-4" />
                                            {getErrorMessage(error)}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : rows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                        No hay registros en este período.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                rows.map((row: any) => {
                                    const isOpen = expanded === row.id;
                                    const hasDetail = row.old_data != null || row.new_data != null;
                                    return (
                                        <Fragment key={row.id}>
                                            <TableRow
                                                className={hasDetail ? 'cursor-pointer' : ''}
                                                onClick={() => hasDetail && setExpanded(isOpen ? null : row.id)}
                                            >
                                                <TableCell>
                                                    {hasDetail ? (
                                                        isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                                                    ) : null}
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap">{formatDateTime(row.created_at)}</TableCell>
                                                <TableCell className="font-medium">
                                                    {row.admin_name ?? '—'}
                                                    {row.admin_role ? (
                                                        <span className="ml-1 text-xs text-muted-foreground">({row.admin_role})</span>
                                                    ) : null}
                                                </TableCell>
                                                <TableCell><Badge variant="outline">{actionLabel(row.action_type)}</Badge></TableCell>
                                                <TableCell className="text-xs text-muted-foreground">{row.entity_type ?? '—'}</TableCell>
                                                <TableCell>{row.description ?? '—'}</TableCell>
                                            </TableRow>
                                            {isOpen && hasDetail ? (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="bg-muted/30">
                                                        <div className="grid gap-3 md:grid-cols-2 py-2">
                                                            <FriendlyDetail label="Antes" data={row.old_data} />
                                                            <FriendlyDetail label="Después" data={row.new_data} />
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ) : null}
                                        </Fragment>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </AdminLayout>
    );
}
