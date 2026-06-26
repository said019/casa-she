import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Loader2, AlertCircle, Settings, ChevronDown, ChevronRight } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { format } from 'date-fns';
import { toast } from 'sonner';

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

function currentMonth(): string {
    return format(new Date(), 'yyyy-MM');
}

interface Row {
    user_id: string;
    display_name: string;
    total_sales: number;
    memberships_amount: number;
    memberships_count: number;
    commissionable_amount: number;
    products_amount: number;
    products_count: number;
    monthly_target: number;
    commission_rate: number;
    has_override: boolean;
    reached: boolean;
    commission: number;
    paid: boolean;
}

interface CommissionDetail {
    memberships: Array<{ payment_id: string; created_at: string; member_name: string; plan_name: string; amount: number; payment_method: string }>;
    products: Array<{ sale_id: string; created_at: string; total: number; items: Array<{ product_name: string; quantity: number; unit_price: number }> }>;
}

interface RecepUser { id: string; display_name: string }
interface OverrideRow { user_id: string; display_name: string; monthly_target: number; commission_rate: number }

function OverrideEditor({ user, current }: { user: RecepUser; current?: OverrideRow }) {
    const qc = useQueryClient();
    const [target, setTarget] = useState(current ? String(current.monthly_target) : '');
    const [rate, setRate] = useState(current ? String(current.commission_rate) : '');

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ['commission-settings'] });
        qc.invalidateQueries({ queryKey: ['commissions'] });
    };
    const save = useMutation({
        mutationFn: async () => api.put(`/commissions/settings/${user.id}`, {
            monthly_target: Number(target), commission_rate: Number(rate),
        }),
        onSuccess: () => { toast.success(`Override de ${user.display_name} guardado`); invalidate(); },
        onError: (e) => toast.error(getErrorMessage(e)),
    });
    const clear = useMutation({
        mutationFn: async () => api.delete(`/commissions/settings/${user.id}`),
        onSuccess: () => { toast.success(`${user.display_name} usa el default`); setTarget(''); setRate(''); invalidate(); },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    return (
        <div className="flex items-end gap-2">
            <div className="flex-1 text-sm truncate pb-2">{user.display_name}</div>
            <div className="space-y-1">
                <Label className="text-[10px]">Objetivo</Label>
                <Input type="number" min="0" value={target} onChange={(e) => setTarget(e.target.value)} className="h-8 w-28" placeholder="default" />
            </div>
            <div className="space-y-1">
                <Label className="text-[10px]">%</Label>
                <Input type="number" min="0" max="100" step="0.1" value={rate} onChange={(e) => setRate(e.target.value)} className="h-8 w-20" placeholder="default" />
            </div>
            <Button size="sm" variant="outline" onClick={() => save.mutate()} disabled={save.isPending || target === '' || rate === ''}>Guardar</Button>
            <Button size="sm" variant="ghost" onClick={() => clear.mutate()} disabled={clear.isPending || !current}>Usar default</Button>
        </div>
    );
}

function SettingsDialog() {
    const qc = useQueryClient();
    const [open, setOpen] = useState(false);
    const { data } = useQuery<{ default: { monthly_target: number; commission_rate: number }; overrides: OverrideRow[] }>({
        queryKey: ['commission-settings'],
        queryFn: async () => (await api.get('/commissions/settings')).data,
        enabled: open,
    });
    const { data: recep = [] } = useQuery<RecepUser[]>({
        queryKey: ['reception-users'],
        queryFn: async () => {
            const res = (await api.get('/users/reception')).data;
            return Array.isArray(res) ? res : (res?.users ?? []);
        },
        enabled: open,
    });
    const [target, setTarget] = useState('');
    const [rate, setRate] = useState('');

    useEffect(() => {
        if (data?.default) {
            setTarget(String(data.default.monthly_target));
            setRate(String(data.default.commission_rate));
        }
    }, [data?.default]);

    const saveDefault = useMutation({
        mutationFn: async () => api.put('/commissions/settings/default', {
            monthly_target: Number(target), commission_rate: Number(rate),
        }),
        onSuccess: () => {
            toast.success('Configuración por defecto guardada');
            qc.invalidateQueries({ queryKey: ['commission-settings'] });
            qc.invalidateQueries({ queryKey: ['commissions'] });
        },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    const overrideByUser = new Map((data?.overrides ?? []).map((o) => [o.user_id, o]));

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm"><Settings className="h-4 w-4 mr-2" />Configuración</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
                <DialogHeader><DialogTitle>Configuración de comisiones</DialogTitle></DialogHeader>
                <div className="space-y-5 py-2">
                    <div className="space-y-2">
                        <p className="text-sm font-medium">Default (aplica a quien no tenga override)</p>
                        <div className="flex items-end gap-3">
                            <div className="space-y-1">
                                <Label className="text-xs">Objetivo mensual (MXN)</Label>
                                <Input type="number" min="0" value={target} onChange={(e) => setTarget(e.target.value)} className="h-8 w-40" />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Comisión (%)</Label>
                                <Input type="number" min="0" max="100" step="0.1" value={rate} onChange={(e) => setRate(e.target.value)} className="h-8 w-28" />
                            </div>
                            <Button size="sm" onClick={() => saveDefault.mutate()} disabled={saveDefault.isPending}>
                                {saveDefault.isPending ? 'Guardando…' : 'Guardar'}
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <p className="text-sm font-medium">Override por persona (vacío = usa default)</p>
                        <div className="space-y-2">
                            {recep.length === 0 ? (
                                <p className="text-xs text-muted-foreground">No hay recepcionistas.</p>
                            ) : (
                                recep.map((u) => (
                                    <OverrideEditor key={u.id} user={u} current={overrideByUser.get(u.id)} />
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function CommissionRowItem({ r, month, onPay, onUnpay, payPending, unpayPending }: {
    r: Row; month: string;
    onPay: (id: string) => void; onUnpay: (id: string) => void;
    payPending: boolean; unpayPending: boolean;
}) {
    const [open, setOpen] = useState(false);
    const { data: detail, isLoading } = useQuery<CommissionDetail>({
        queryKey: ['commission-detail', r.user_id, month],
        queryFn: async () => (await api.get(`/commissions/detail?user_id=${r.user_id}&month=${month}`)).data,
        enabled: open,
    });
    return (
        <>
            <TableRow>
                <TableCell className="font-medium">
                    <button className="inline-flex items-center gap-1" onClick={() => setOpen((o) => !o)}>
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        {r.display_name}
                    </button>
                    {r.has_override ? <span className="ml-2 text-xs text-muted-foreground">(personalizado)</span> : null}
                </TableCell>
                <TableCell className="text-right">
                    {mxn.format(r.commissionable_amount)}
                    <span className="block text-[10px] text-muted-foreground">{r.memberships_count} memb · prod {mxn.format(r.products_amount)}</span>
                </TableCell>
                <TableCell className="text-right">{mxn.format(r.monthly_target)}</TableCell>
                <TableCell className="text-right">{r.commission_rate}%</TableCell>
                <TableCell className="text-center">
                    {r.reached
                        ? <Badge variant="outline" className="text-emerald-600 border-emerald-600">Sí</Badge>
                        : <Badge variant="outline" className="text-gray-500 border-gray-400">No</Badge>}
                </TableCell>
                <TableCell className="text-right font-semibold">{mxn.format(r.commission)}</TableCell>
                <TableCell className="text-center">
                    {r.paid
                        ? <Badge variant="outline" className="text-emerald-600 border-emerald-600">Pagada</Badge>
                        : <Badge variant="outline" className="text-amber-600 border-amber-600">Pendiente</Badge>}
                </TableCell>
                <TableCell className="text-right">
                    {r.paid ? (
                        <Button variant="ghost" size="sm" onClick={() => onUnpay(r.user_id)} disabled={unpayPending}>Des-marcar</Button>
                    ) : (
                        <Button variant="outline" size="sm" onClick={() => onPay(r.user_id)} disabled={payPending || r.commission <= 0}>Marcar pagada</Button>
                    )}
                </TableCell>
            </TableRow>
            {open && (
                <TableRow className="bg-muted/20">
                    <TableCell colSpan={8} className="px-4 py-3">
                        {isLoading ? (
                            <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
                        ) : (
                            <div className="grid gap-4 md:grid-cols-2 text-sm">
                                <div>
                                    <p className="font-semibold mb-1">Membresías públicas (comisiona)</p>
                                    {detail?.memberships?.length ? detail.memberships.map((m) => (
                                        <div key={m.payment_id} className="flex justify-between gap-2 py-0.5">
                                            <span className="truncate">{m.created_at} · {m.member_name} · {m.plan_name}</span>
                                            <span className="tabular-nums">{mxn.format(m.amount)}</span>
                                        </div>
                                    )) : <p className="text-muted-foreground">Sin membresías en el mes.</p>}
                                </div>
                                <div>
                                    <p className="font-semibold mb-1">Productos (no comisiona)</p>
                                    {detail?.products?.length ? detail.products.map((p) => (
                                        <div key={p.sale_id} className="flex justify-between gap-2 py-0.5">
                                            <span className="truncate">{p.created_at} · {p.items.map((i) => `${i.quantity}× ${i.product_name}`).join(', ') || 'Venta'}</span>
                                            <span className="tabular-nums">{mxn.format(p.total)}</span>
                                        </div>
                                    )) : <p className="text-muted-foreground">Sin productos en el mes.</p>}
                                </div>
                            </div>
                        )}
                    </TableCell>
                </TableRow>
            )}
        </>
    );
}

export default function CommissionsPage() {
    const qc = useQueryClient();
    const [month, setMonth] = useState(currentMonth());

    const { data, isLoading, error } = useQuery<{ month: string; rows: Row[] }>({
        queryKey: ['commissions', month],
        queryFn: async () => (await api.get(`/commissions?month=${month}`)).data,
    });
    const rows = data?.rows ?? [];

    const pay = useMutation({
        mutationFn: async (userId: string) => api.post('/commissions/payouts', { user_id: userId, month }),
        onSuccess: () => { toast.success('Comisión marcada como pagada'); qc.invalidateQueries({ queryKey: ['commissions', month] }); },
        onError: (e) => toast.error(getErrorMessage(e)),
    });
    const unpay = useMutation({
        mutationFn: async (userId: string) => api.delete(`/commissions/payouts/${userId}?month=${month}`),
        onSuccess: () => { toast.success('Pago des-marcado'); qc.invalidateQueries({ queryKey: ['commissions', month] }); },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-3xl font-heading font-bold">Comisiones</h1>
                        <p className="text-muted-foreground">Al alcanzar el objetivo del mes, % sobre las <strong>membresías públicas</strong> vendidas. Los productos no comisionan.</p>
                    </div>
                    <SettingsDialog />
                </div>

                <Card>
                    <CardContent className="pt-4 pb-3">
                        <div className="flex flex-wrap items-end gap-4">
                            <div className="space-y-1">
                                <Label className="text-xs">Mes</Label>
                                <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-8 text-xs w-40" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="border rounded-md overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Recepcionista</TableHead>
                                <TableHead className="text-right">Membresías (comisiona)</TableHead>
                                <TableHead className="text-right">Objetivo</TableHead>
                                <TableHead className="text-right">%</TableHead>
                                <TableHead className="text-center">¿Alcanzó?</TableHead>
                                <TableHead className="text-right">Comisión</TableHead>
                                <TableHead className="text-center">Estado</TableHead>
                                <TableHead className="text-right">Acción</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={8} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                            ) : error ? (
                                <TableRow><TableCell colSpan={8} className="text-center py-8 text-destructive"><div className="flex items-center justify-center gap-2"><AlertCircle className="h-4 w-4" />{getErrorMessage(error)}</div></TableCell></TableRow>
                            ) : rows.length === 0 ? (
                                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No hay recepcionistas activas.</TableCell></TableRow>
                            ) : (
                                rows.map((r) => (
                                    <CommissionRowItem
                                        key={r.user_id}
                                        r={r}
                                        month={month}
                                        onPay={(id) => pay.mutate(id)}
                                        onUnpay={(id) => unpay.mutate(id)}
                                        payPending={pay.isPending}
                                        unpayPending={unpay.isPending}
                                    />
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </AdminLayout>
    );
}
