import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CLIENT_TAGS, tagByKey } from '@/data/clientTags';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import {
    Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
    UserPlus, Search, Loader2, Phone, Mail, Pencil, Save, X,
    CreditCard, Plus, Minus, AlertCircle, CalendarDays, Clock, HeartPulse, Ban, KeyRound,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import { useIsElevated } from '@/hooks/useIsElevated';
import { useHasPermission } from '@/hooks/useHasPermission';
import {
    getMembershipPaymentMethods,
    PAYMENT_METHOD_LABELS,
    GRATIS_REASON_MIN_LENGTH,
} from '@/lib/membershipPaymentMethods';
import { formatDateForInput, addDaysForInput } from '@/lib/date';
import { creditCells } from '@/lib/credits';
import { EditValidityDialog } from '@/components/memberships/EditValidityDialog';
import ClientBitacora from '@/components/bitacora/ClientBitacora';

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

interface ClientRow {
    id: string;
    display_name: string;
    email: string;
    tags?: string[] | null;
    reception_notes?: string | null;
    health_notes?: string | null;
    phone: string;
    role: string;
    is_active: boolean;
    created_at: string;
}

interface ClientMembership {
    id: string;
    status: string;
    start_date: string | null;
    end_date: string | null;
    reformer_remaining: number | null;
    multi_remaining: number | null;
    classes_remaining: number | null;
    plan_name?: string;
    plan_id?: string;
    plan_price?: number | string | null;
    price?: number | string | null;
    payment_method?: string | null;
    payment_reference?: string | null;
    created_at?: string | null;
}

const MEMBERSHIP_STATUS_LABELS: Record<string, string> = {
    active: 'Activa',
    expired: 'Vencida',
    cancelled: 'Cancelada',
};

interface Plan {
    id: string;
    name: string;
    price: number;
    category?: string;
    reformer_credits: number | null;
    multi_credits: number | null;
    class_limit: number | null;
    duration_days?: number | null;
    is_active: boolean;
}

function initials(name: string) {
    return name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

// ─── Create new client dialog ────────────────────────────────────────────────
function NewClientDialog({ onCreated }: { onCreated: () => void }) {
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({ email: '', displayName: '', phone: '' });

    const create = useMutation({
        mutationFn: async () => {
            const res = await api.post('/users', {
                email: form.email.trim(),
                displayName: form.displayName.trim(),
                phone: form.phone.trim(),
                acceptsCommunications: true,
            });
            return res.data;
        },
        onSuccess: () => {
            toast.success('Usuario registrado. Recibió un correo con su contraseña temporal.');
            setForm({ email: '', displayName: '', phone: '' });
            setOpen(false);
            onCreated();
        },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Usuario nuevo
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Registrar usuario</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="space-y-1">
                        <Label htmlFor="nc-name">Nombre completo</Label>
                        <Input id="nc-name" value={form.displayName}
                            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                            placeholder="Nombre Apellido" />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="nc-email">Email</Label>
                        <Input id="nc-email" type="email" value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                            placeholder="usuario@correo.com" />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="nc-phone">Teléfono</Label>
                        <Input id="nc-phone" value={form.phone}
                            onChange={(e) => setForm({ ...form, phone: e.target.value })}
                            placeholder="55 1234 5678" />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                    <Button
                        onClick={() => create.mutate()}
                        disabled={
                            create.isPending ||
                            !form.email.trim() ||
                            !form.displayName.trim() ||
                            form.phone.trim().length < 8
                        }
                    >
                        {create.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                        Crear
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─── Sell plan dialog ─────────────────────────────────────────────────────────
function SellPlanDialog({ clientId, onDone }: { clientId: string; onDone: () => void }) {
    const isElevated = useIsElevated();
    const paymentMethods = getMembershipPaymentMethods(isElevated);
    const [open, setOpen] = useState(false);
    const [planId, setPlanId] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<string>('cash');
    const [gratisReason, setGratisReason] = useState('');
    const [startDate, setStartDate] = useState(formatDateForInput());
    const [endDate, setEndDate] = useState('');
    const [endDateTouched, setEndDateTouched] = useState(false);

    const { data: plans = [] } = useQuery<Plan[]>({
        queryKey: ['plans-active'],
        queryFn: async () => (await api.get('/plans?active=true')).data,
        enabled: open,
    });

    const plan = plans.find((p) => p.id === planId);
    const isGratis = paymentMethod === 'gratis';

    // Vencimiento sugerido = inicio + duración del plan (mientras el usuario no lo edite).
    useEffect(() => {
        if (endDateTouched) return;
        if (plan?.duration_days && startDate) {
            setEndDate(addDaysForInput(startDate, plan.duration_days));
        }
    }, [plan?.duration_days, startDate, endDateTouched]);

    const resetForm = () => {
        setPlanId('');
        setPaymentMethod('cash');
        setGratisReason('');
        setStartDate(formatDateForInput());
        setEndDate('');
        setEndDateTouched(false);
    };

    const assign = useMutation({
        mutationFn: async () => api.post('/memberships/assign', {
            userId: clientId,
            planId,
            status: 'active',
            paymentMethod,
            startDate,
            ...(endDate ? { endDate } : {}),
            ...(isGratis ? { reason: gratisReason.trim() } : {}),
        }),
        onSuccess: () => {
            toast.success('Membresía asignada');
            setOpen(false);
            resetForm();
            onDone();
        },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    const canAssign =
        !!planId &&
        !!startDate &&
        (!isGratis || gratisReason.trim().length >= GRATIS_REASON_MIN_LENGTH);

    return (
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <CreditCard className="h-4 w-4 mr-2" />
                    Vender plan
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Vender plan al usuario</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="space-y-1">
                        <Label>Plan</Label>
                        <Select value={planId} onValueChange={setPlanId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Elige un plan" />
                            </SelectTrigger>
                            <SelectContent>
                                {plans.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                        {p.name} — {mxn.format(Number(p.price))}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {plan && (
                            <p className="text-xs text-muted-foreground mt-1">
                                {plan.reformer_credits ?? 0} reformer · {plan.multi_credits ?? 0} multi
                                {plan.class_limit ? ` · ${plan.class_limit} clases` : ''}
                            </p>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label>Inicio</Label>
                            <Input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1">
                            <Label>Vence</Label>
                            <Input
                                type="date"
                                value={endDate}
                                onChange={(e) => { setEndDate(e.target.value); setEndDateTouched(true); }}
                            />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <Label>Método de pago</Label>
                        <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {paymentMethods.map((m) => (
                                    <SelectItem key={m.value} value={m.value}>
                                        {m.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {isGratis && (
                        <div className="space-y-1">
                            <Label htmlFor="sp-gratis-reason">
                                Motivo (obligatorio) <span className="text-destructive">*</span>
                            </Label>
                            <Textarea
                                id="sp-gratis-reason"
                                value={gratisReason}
                                onChange={(e) => setGratisReason(e.target.value)}
                                placeholder="Ej. Cortesía por promoción / compensación"
                                rows={2}
                            />
                            <p className="text-xs text-muted-foreground">
                                Se registra en $0 y queda en bitácora (mínimo {GRATIS_REASON_MIN_LENGTH} caracteres).
                            </p>
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                    <Button onClick={() => assign.mutate()} disabled={assign.isPending || !canAssign}>
                        {assign.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                        Asignar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─── Reservar en clase para este cliente ──────────────────────────────────────
interface DayClass {
    id: string;
    start_time: string;
    end_time: string;
    class_type_name: string;
    instructor_name: string;
    current_bookings: number;
    max_capacity: number;
    status: string;
    facility_id?: string | null;
    facility_name?: string | null;
}

function trimTime(t: string) { return t.length >= 5 ? t.slice(0, 5) : t; }
function todayIso() { return new Date().toISOString().slice(0, 10); }

function ReserveClassDialog({ clientId, clientName, onDone }: { clientId: string; clientName: string; onDone: () => void }) {
    const [open, setOpen] = useState(false);
    const [date, setDate] = useState(todayIso());
    const [classId, setClassId] = useState('');
    const [facility, setFacility] = useState(''); // '' = todas las sucursales
    const elevated = useIsElevated();

    const { data: facilities = [] } = useQuery<{ id: string; name: string }[]>({
        queryKey: ['facilities'],
        queryFn: async () => (await api.get('/facilities')).data,
        enabled: open && elevated,
    });

    // Un master puede elegir sucursal; sin elegir ('') el backend devuelve todas
    // (y a una recepción normal la fuerza a la suya).
    const { data: classes = [] } = useQuery<DayClass[]>({
        queryKey: ['reception-day-classes', date, facility],
        queryFn: async () => {
            const facParam = facility ? `&facility_id=${facility}` : '';
            return (await api.get(`/classes?start=${date}&end=${date}${facParam}`)).data;
        },
        enabled: open,
    });

    const book = useMutation({
        mutationFn: async () => api.post('/bookings/admin-book', {
            userId: clientId,
            classId,
        }),
        onSuccess: () => {
            toast.success('Usuario agregado a la clase');
            setOpen(false);
            setClassId('');
            onDone();
        },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <CalendarDays className="h-4 w-4 mr-2" />
                    Reservar en clase
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Reservar a {clientName}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="space-y-1">
                        <Label>Día</Label>
                        <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setClassId(''); }} />
                    </div>
                    {elevated && facilities.length > 1 && (
                        <div className="space-y-1">
                            <Label>Sucursal</Label>
                            <Select value={facility || 'all'} onValueChange={(v) => { setFacility(v === 'all' ? '' : v); setClassId(''); }}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todas las sucursales</SelectItem>
                                    {facilities.map((f) => (
                                        <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <div className="space-y-1">
                        <Label>Clase</Label>
                        <Select value={classId} onValueChange={setClassId}>
                            <SelectTrigger>
                                <SelectValue placeholder={classes.length === 0 ? 'No hay clases ese día' : 'Elige una clase'} />
                            </SelectTrigger>
                            <SelectContent>
                                {classes
                                    .filter((c) => c.status !== 'cancelled')
                                    .map((c) => (
                                        <SelectItem key={c.id} value={c.id}>
                                            {trimTime(c.start_time)} — {c.class_type_name} · {c.instructor_name}
                                            {!facility && c.facility_name ? ` · ${c.facility_name}` : ''}
                                            {' '}({c.current_bookings}/{c.max_capacity})
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground mt-1">
                            Descuenta crédito de la membresía activa del usuario según la categoría de la clase.
                        </p>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                    <Button onClick={() => book.mutate()} disabled={book.isPending || !classId}>
                        {book.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                        Reservar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─── Adjust credits dialog (limit ±3 + reason) ───────────────────────────────
type Bucket = 'reformer_remaining' | 'multi_remaining' | 'classes_remaining';
function AdjustCreditsDialog({ membership, onDone }: { membership: ClientMembership; onDone: () => void }) {
    const [open, setOpen] = useState(false);
    // Solo los buckets que el plan tiene; el genérico solo en membresías legacy sin categoría.
    const availableBuckets: Bucket[] = (() => {
        const out: Bucket[] = [];
        if (typeof membership.reformer_remaining === 'number') out.push('reformer_remaining');
        if (typeof membership.multi_remaining === 'number') out.push('multi_remaining');
        if (out.length === 0 && typeof membership.classes_remaining === 'number') out.push('classes_remaining');
        if (out.length === 0) out.push('reformer_remaining', 'multi_remaining');
        return out;
    })();
    const [bucket, setBucket] = useState<Bucket>(availableBuckets[0]);
    const [delta, setDelta] = useState<number>(0);
    const [reason, setReason] = useState('');
    const sinLimite = useHasPermission('creditos_sin_limite'); // master/admin: sin tope de ±3

    const current = membership[bucket] ?? 0;
    const next = Math.max(0, current + delta);

    const adjust = useMutation({
        mutationFn: async () => {
            const payload: Record<string, unknown> = { reason };
            payload[bucket] = next;
            return api.patch(`/memberships/${membership.id}/credits`, payload);
        },
        onSuccess: () => {
            toast.success('Créditos ajustados');
            setOpen(false);
            setDelta(0);
            setReason('');
            onDone();
        },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <Plus className="h-3 w-3 mr-1" />/
                    <Minus className="h-3 w-3 ml-1" /> Créditos
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Ajustar créditos</DialogTitle>
                </DialogHeader>
                <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900 flex gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                        {sinLimite
                            ? <>Puedes ajustar <strong>cualquier cantidad</strong> (positiva o negativa). El motivo es obligatorio y queda en bitácora.</>
                            : <>Solo puedes ajustar <strong>±3 créditos</strong> por movimiento. El motivo es obligatorio y queda en bitácora.</>}
                    </span>
                </div>
                <div className="space-y-3 mt-3">
                    <div className="space-y-1">
                        <Label>Bucket</Label>
                        <Select value={bucket} onValueChange={(v) => setBucket(v as typeof bucket)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {availableBuckets.map((b) => (
                                    <SelectItem key={b} value={b}>
                                        {b === 'reformer_remaining' ? 'Reformer' : b === 'multi_remaining' ? 'Multi' : 'Clases (sin categoría)'}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">Saldo actual: {current} → nuevo: {next}</p>
                    </div>
                    <div className="space-y-1">
                        <Label>Cambio</Label>
                        {sinLimite ? (
                            <Input
                                type="number"
                                value={delta}
                                onChange={(e) => setDelta(Math.trunc(Number(e.target.value)) || 0)}
                                placeholder="Ej. 10 para agregar, -10 para quitar"
                            />
                        ) : (
                            <div className="flex items-center gap-2">
                                {[-3, -2, -1, 1, 2, 3].map((d) => (
                                    <Button
                                        key={d}
                                        type="button"
                                        variant={delta === d ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => setDelta(d)}
                                    >
                                        {d > 0 ? `+${d}` : d}
                                    </Button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="ac-reason">Motivo (mínimo 5 caracteres)</Label>
                        <Input id="ac-reason" value={reason} onChange={(e) => setReason(e.target.value)}
                            placeholder="Ej. Usuario compensación por clase suspendida 2026-05-26" />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                    <Button
                        onClick={() => adjust.mutate()}
                        disabled={adjust.isPending || delta === 0 || reason.trim().length < 5}
                    >
                        {adjust.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                        Aplicar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─── Cancel membership dialog (recepción master / admin) ─────────────────────
function CancelMembershipDialog({ membership, clientName, onDone }: { membership: ClientMembership; clientName: string; onDone: () => void }) {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState('');
    // Por defecto reembolsa: una cancelación saca el pago de ingresos, ventas y caja
    // (regla del estudio: "es una cancelación"). Se puede desmarcar si el estudio retiene el cobro.
    const [refund, setRefund] = useState(true);

    const cancel = useMutation({
        mutationFn: async () => api.post(`/memberships/${membership.id}/cancel`, {
            reason: reason.trim() || undefined,
            refund,
        }),
        onSuccess: (res) => {
            const info = res.data?.refund;
            toast.success(
                info?.applied
                    ? `Membresía cancelada. Reembolsados ${info.payments_refunded.length} pago(s) y revertidos ${info.points_reversed} puntos.`
                    : 'Membresía cancelada',
            );
            setOpen(false);
            setReason('');
            setRefund(true);
            onDone();
        },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                >
                    <Ban className="h-3 w-3 mr-1" /> Cancelar
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Cancelar membresía</DialogTitle>
                </DialogHeader>
                <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900 flex gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                        Vas a cancelar la membresía <strong>{membership.plan_name ?? 'Plan'}</strong> de {clientName}.
                        Esta acción queda en bitácora.
                    </span>
                </div>
                <div className="space-y-3 mt-3">
                    <div className="space-y-1">
                        <Label htmlFor="cm-reason">Motivo (opcional)</Label>
                        <Textarea
                            id="cm-reason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Ej. Solicitud del usuario / error de venta"
                            rows={2}
                        />
                    </div>
                    <label className="flex items-center justify-between gap-3 rounded-md border p-3">
                        <div>
                            <p className="text-sm font-medium">Reembolsar pago</p>
                            <p className="text-xs text-muted-foreground">
                                Marca los pagos como reembolsados y revierte los puntos de lealtad otorgados.
                            </p>
                        </div>
                        <Switch checked={refund} onCheckedChange={setRefund} />
                    </label>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Volver</Button>
                    <Button variant="destructive" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
                        {cancel.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                        Cancelar membresía
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─── Client detail drawer ────────────────────────────────────────────────────
function ClientDrawer({ client, onClose }: { client: ClientRow | null; onClose: () => void }) {
    const qc = useQueryClient();
    const elevated = useIsElevated();
    const [editingInfo, setEditingInfo] = useState(false);
    const [form, setForm] = useState({ displayName: '', email: '', phone: '' });
    // Admin/master eligen con qué WhatsApp (sucursal) se mandan las credenciales.
    // Recepción normal no ve selector: el backend usa el WhatsApp de su sucursal.
    const [waKey, setWaKey] = useState<'san-miguel' | 'tepa'>('san-miguel');

    const { data: memberships = [] } = useQuery<ClientMembership[]>({
        queryKey: ['client-memberships', client?.id],
        queryFn: async () => (await api.get(`/memberships?userId=${client?.id}`)).data,
        enabled: !!client?.id,
    });

    // Próximas reservas del cliente (desde hoy en adelante). Se muestran TODAS
    // (antes estaba topado a 5 y recepción no veía reservas que la clienta ya tenía).
    interface ClientBooking {
        booking_id: string; booking_status: string;
        class_id: string; class_date: string; class_start_time: string;
        class_name: string; instructor_name: string;
    }
    const { data: upcomingBookings = [] } = useQuery<ClientBooking[]>({
        queryKey: ['client-upcoming-bookings', client?.id],
        queryFn: async () => {
            const today = todayIso();
            // SIN filtro de sucursal: la clienta reserva en cualquier sucursal y recepción debe ver
            // TODAS sus reservas (antes se filtraba por la sucursal de recepción y escondía, p.ej.,
            // las reservas de San Miguel cuando entrabas como recepción Tepa).
            const res = await api.get(`/bookings?userId=${client?.id}&startDate=${today}&limit=500`);
            return (res.data as ClientBooking[])
                .filter((b) => b.booking_status === 'confirmed' || b.booking_status === 'checked_in' || b.booking_status === 'waitlist')
                .sort((a, b) => `${a.class_date}T${a.class_start_time}`.localeCompare(`${b.class_date}T${b.class_start_time}`));
        },
        enabled: !!client?.id,
    });

    // Historial de clases: TODAS las reservas pasadas (acotado a <= hoy en el server).
    const { data: pastBookings = [] } = useQuery<ClientBooking[]>({
        queryKey: ['client-past-bookings', client?.id],
        queryFn: async () => {
            const today = todayIso();
            const res = await api.get(`/bookings?userId=${client?.id}&endDate=${today}&limit=500`);
            return (res.data as ClientBooking[])
                .filter((b) => b.class_date < today)
                .sort((a, b) => `${b.class_date}T${b.class_start_time}`.localeCompare(`${a.class_date}T${a.class_start_time}`));
        },
        enabled: !!client?.id,
    });

    const cancelBooking = useMutation({
        mutationFn: async (bookingId: string) => api.post(`/bookings/${bookingId}/cancel`),
        onSuccess: () => {
            toast.success('Reserva cancelada');
            qc.invalidateQueries({ queryKey: ['client-upcoming-bookings', client?.id] });
            qc.invalidateQueries({ queryKey: ['client-memberships', client?.id] });
            qc.invalidateQueries({ queryKey: ['reception-bookings'] });
        },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    const saveInfo = useMutation({
        mutationFn: async () => api.put(`/users/${client?.id}`, {
            displayName: form.displayName.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
        }),
        onSuccess: () => {
            toast.success('Usuario actualizado');
            setEditingInfo(false);
            qc.invalidateQueries({ queryKey: ['reception-clients'] });
        },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    const tagsMutation = useMutation({
        mutationFn: async (tags: string[]) => api.put(`/users/${client?.id}`, { tags }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['reception-clients'] });
        },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    const [notes, setNotes] = useState('');
    useEffect(() => { setNotes(client?.reception_notes ?? ''); }, [client?.id, client?.reception_notes]);

    const saveNotes = useMutation({
        mutationFn: async () => api.put(`/users/${client?.id}`, { receptionNotes: notes }),
        onSuccess: () => {
            toast.success('Notas guardadas');
            qc.invalidateQueries({ queryKey: ['reception-clients'] });
        },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    const [healthNotes, setHealthNotes] = useState('');
    useEffect(() => { setHealthNotes(client?.health_notes ?? ''); }, [client?.id, client?.health_notes]);

    const saveHealthNotes = useMutation({
        mutationFn: async () => api.put(`/users/${client?.id}`, { healthNotes }),
        onSuccess: () => {
            toast.success('Notas de salud guardadas');
            qc.invalidateQueries({ queryKey: ['reception-clients'] });
        },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    const currentTags = client?.tags ?? [];
    const toggleTag = (key: string) => {
        const next = currentTags.includes(key)
            ? currentTags.filter((t) => t !== key)
            : [...currentTags, key];
        tagsMutation.mutate(next);
    };

    const [channel, setChannel] = useState<'whatsapp' | 'email'>('whatsapp');
    const [msgBody, setMsgBody] = useState('');
    const [subject, setSubject] = useState('');

    const { data: messages = [] } = useQuery<Array<{
        id: string; channel: string; subject: string | null; body: string;
        status: string; error: string | null; created_at: string; sent_by_name: string | null;
    }>>({
        queryKey: ['client-messages', client?.id],
        queryFn: async () => (await api.get(`/users/${client?.id}/messages`)).data,
        enabled: !!client?.id,
    });

    const sendMessage = useMutation({
        mutationFn: async () => api.post(`/users/${client?.id}/message`, { channel, body: msgBody, subject }),
        onSuccess: (res) => {
            if (res.data?.ok) toast.success('Mensaje enviado');
            else toast.error(res.data?.error || 'No se pudo enviar el mensaje');
            setMsgBody('');
            setSubject('');
            qc.invalidateQueries({ queryKey: ['client-messages', client?.id] });
        },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    const resendCredentials = useMutation({
        mutationFn: async () =>
            api.post(`/users/${client!.id}/resend-credentials`, elevated ? { whatsappKey: waKey } : {}),
        onSuccess: () => toast.success('Credenciales enviadas por WhatsApp y email'),
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    const canWhatsApp = !!client?.phone;
    const canEmail = !!client?.email;

    const refetchMemberships = () => qc.invalidateQueries({ queryKey: ['client-memberships', client?.id] });

    if (!client) return null;

    return (
        <Sheet open={!!client} onOpenChange={(o) => { if (!o) onClose(); }}>
            <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-3">
                        <Avatar className="h-12 w-12">
                            <AvatarFallback className="bg-primary/10 text-primary">{initials(client.display_name)}</AvatarFallback>
                        </Avatar>
                        <div>
                            <div>{client.display_name}</div>
                            <div className="text-xs text-muted-foreground font-normal">
                                {client.email} · {client.phone}
                            </div>
                        </div>
                    </SheetTitle>
                </SheetHeader>

                <div className="space-y-4 mt-6">
                    {/* Información */}
                    <Card>
                        <CardContent className="pt-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-medium">Información</h3>
                                {!editingInfo ? (
                                    <Button variant="ghost" size="sm" onClick={() => {
                                        setForm({ displayName: client.display_name, email: client.email, phone: client.phone });
                                        setEditingInfo(true);
                                    }}>
                                        <Pencil className="h-3 w-3 mr-1" /> Editar
                                    </Button>
                                ) : (
                                    <div className="flex gap-1">
                                        <Button variant="ghost" size="sm" onClick={() => setEditingInfo(false)}>
                                            <X className="h-3 w-3" />
                                        </Button>
                                        <Button size="sm" onClick={() => saveInfo.mutate()} disabled={saveInfo.isPending}>
                                            {saveInfo.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                                        </Button>
                                    </div>
                                )}
                            </div>
                            {editingInfo ? (
                                <div className="space-y-2">
                                    <Input value={form.displayName}
                                        onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                                        placeholder="Nombre" />
                                    <Input type="email" value={form.email}
                                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                                        placeholder="Correo" />
                                    <Input value={form.phone}
                                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                        placeholder="Teléfono" />
                                </div>
                            ) : (
                                <div className="text-sm space-y-1 text-muted-foreground">
                                    <div className="flex items-center gap-2"><Mail className="h-3 w-3" />{client.email}</div>
                                    <div className="flex items-center gap-2"><Phone className="h-3 w-3" />{client.phone}</div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Credenciales de acceso — visible y prominente para TODA recepción
                        (antes estaba enterrado abajo en "Enviar mensaje"). */}
                    <Card>
                        <CardContent className="pt-4">
                            <h3 className="font-medium mb-2">Credenciales de acceso</h3>
                            {elevated && (
                                <div className="mb-2">
                                    <p className="text-[11px] text-muted-foreground mb-1">Enviar desde el WhatsApp de:</p>
                                    <ToggleGroup
                                        type="single"
                                        value={waKey}
                                        onValueChange={(v) => { if (v === 'san-miguel' || v === 'tepa') setWaKey(v); }}
                                        className="justify-start gap-1"
                                    >
                                        <ToggleGroupItem value="san-miguel" size="sm" className="text-xs px-3">San Miguel</ToggleGroupItem>
                                        <ToggleGroupItem value="tepa" size="sm" className="text-xs px-3">Tepa</ToggleGroupItem>
                                    </ToggleGroup>
                                </div>
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full gap-2"
                                onClick={() => resendCredentials.mutate()}
                                disabled={resendCredentials.isPending}
                            >
                                <KeyRound className="h-4 w-4" />
                                {resendCredentials.isPending ? 'Enviando…' : 'Reenviar credenciales por WhatsApp'}
                            </Button>
                            <p className="mt-1.5 text-[11px] text-muted-foreground">Genera una contraseña nueva y se la envía al usuario.</p>
                        </CardContent>
                    </Card>

                    {/* Etiquetas */}
                    <Card>
                        <CardContent className="pt-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-medium">Etiquetas</h3>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="ghost" size="sm">+ Agregar</Button>
                                    </PopoverTrigger>
                                    <PopoverContent align="end" className="w-56 p-2">
                                        <div className="flex flex-col gap-1">
                                            {CLIENT_TAGS.map((t) => {
                                                const active = currentTags.includes(t.key);
                                                return (
                                                    <button
                                                        key={t.key}
                                                        type="button"
                                                        onClick={() => toggleTag(t.key)}
                                                        disabled={tagsMutation.isPending}
                                                        className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted/50"
                                                    >
                                                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: t.color }} />
                                                        <span className="flex-1">{t.label}</span>
                                                        {active && <span className="text-xs text-muted-foreground">✓</span>}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </div>
                            {currentTags.length === 0 ? (
                                <p className="text-xs text-muted-foreground">Sin etiquetas.</p>
                            ) : (
                                <div className="flex flex-wrap gap-1.5">
                                    {currentTags.map((key) => {
                                        const t = tagByKey(key);
                                        if (!t) return null;
                                        return (
                                            <button
                                                key={key}
                                                type="button"
                                                onClick={() => toggleTag(key)}
                                                disabled={tagsMutation.isPending}
                                                className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
                                                style={{ backgroundColor: `${t.color}22`, color: t.color }}
                                                title="Quitar etiqueta"
                                            >
                                                {t.label} <X className="h-3 w-3" />
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Notas de recepción */}
                    <Card>
                        <CardContent className="pt-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-medium">Notas de recepción</h3>
                                <Button size="sm" onClick={() => saveNotes.mutate()} disabled={saveNotes.isPending}>
                                    Guardar
                                </Button>
                            </div>
                            <Textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Notas internas sobre el usuario…"
                                rows={3}
                            />
                        </CardContent>
                    </Card>

                    {/* Notas de salud */}
                    <Card className="border-rose-200">
                        <CardContent className="pt-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-medium flex items-center gap-2 text-rose-700">
                                    <HeartPulse className="h-4 w-4" />
                                    Notas de salud
                                </h3>
                                <Button
                                    size="sm"
                                    onClick={() => saveHealthNotes.mutate()}
                                    disabled={saveHealthNotes.isPending}
                                >
                                    {saveHealthNotes.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                                    Guardar
                                </Button>
                            </div>
                            <p className="mb-2 text-xs text-rose-700/80">
                                Lesiones, embarazo, condiciones médicas. Visible para el coach de sus clases.
                            </p>
                            <Textarea
                                value={healthNotes}
                                onChange={(e) => setHealthNotes(e.target.value)}
                                placeholder="Ej. Lesión de rodilla derecha, evitar saltos…"
                                rows={3}
                                className="border-rose-200 focus-visible:ring-rose-300"
                            />
                        </CardContent>
                    </Card>

                    {/* Mensaje */}
                    <Card>
                        <CardContent className="pt-4">
                            <h3 className="font-medium mb-3">Enviar mensaje</h3>
                            <ToggleGroup
                                type="single"
                                value={channel}
                                onValueChange={(v) => { if (v === 'whatsapp' || v === 'email') setChannel(v); }}
                                className="mb-2"
                            >
                                <ToggleGroupItem value="whatsapp" disabled={!canWhatsApp}>WhatsApp</ToggleGroupItem>
                                <ToggleGroupItem value="email" disabled={!canEmail}>Email</ToggleGroupItem>
                            </ToggleGroup>
                            {channel === 'email' && (
                                <Input
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    placeholder="Asunto (opcional)"
                                    className="mb-2"
                                />
                            )}
                            <Textarea
                                value={msgBody}
                                onChange={(e) => setMsgBody(e.target.value)}
                                placeholder={channel === 'whatsapp' ? 'Mensaje de WhatsApp…' : 'Mensaje de email…'}
                                rows={3}
                            />
                            <div className="mt-2 flex justify-end">
                                <Button
                                    size="sm"
                                    onClick={() => sendMessage.mutate()}
                                    disabled={
                                        sendMessage.isPending ||
                                        !msgBody.trim() ||
                                        (channel === 'whatsapp' && !canWhatsApp) ||
                                        (channel === 'email' && !canEmail)
                                    }
                                >
                                    Enviar
                                </Button>
                            </div>

                            {messages.length > 0 && (
                                <div className="mt-4 border-t pt-3">
                                    <p className="text-xs font-medium text-muted-foreground mb-2">Historial</p>
                                    <ul className="space-y-2">
                                        {messages.map((m) => (
                                            <li key={m.id} className="text-xs">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-medium uppercase tracking-wide text-[10px] text-muted-foreground">
                                                        {m.channel}{m.sent_by_name ? ` · ${m.sent_by_name}` : ''}
                                                    </span>
                                                    <span className={m.status === 'failed' ? 'text-red-600' : 'text-muted-foreground'}>
                                                        {m.status === 'failed' ? 'falló' : new Date(m.created_at).toLocaleString('es-MX')}
                                                    </span>
                                                </div>
                                                <p className="text-foreground/90 whitespace-pre-wrap">{m.body}</p>
                                                {m.status === 'failed' && m.error && <p className="text-red-600">{m.error}</p>}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Membresías */}
                    <Card>
                        <CardContent className="pt-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-medium">Membresías</h3>
                                <SellPlanDialog clientId={client.id} onDone={refetchMemberships} />
                            </div>
                            {memberships.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Sin membresías activas.</p>
                            ) : (
                                <div className="space-y-2">
                                    {memberships.map((m) => (
                                        <div key={m.id} className="p-3 rounded-md border bg-card">
                                            <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                                                <div className="min-w-0">
                                                    <p className="font-medium text-sm">{m.plan_name ?? 'Plan'}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {m.status === 'active' ? (
                                                            <Badge variant="outline" className="text-emerald-600 border-emerald-600">activa</Badge>
                                                        ) : (
                                                            <Badge variant="outline">{m.status}</Badge>
                                                        )}
                                                        {m.end_date && (
                                                            <span className="ml-2">vence {new Date(m.end_date).toLocaleDateString('es-MX')}</span>
                                                        )}
                                                    </p>
                                                    {(m as any).acquisition?.seller_name && (
                                                        <p className="text-xs text-muted-foreground mt-0.5">
                                                            Activado por <span className="font-medium text-foreground">{(m as any).acquisition.seller_name}</span>
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="flex flex-wrap items-center justify-end gap-2">
                                                    <AdjustCreditsDialog membership={m} onDone={refetchMemberships} />
                                                    {(m.status === 'active' || m.status === 'expired') && (
                                                        <EditValidityDialog membership={m} onSuccess={refetchMemberships} />
                                                    )}
                                                    {elevated && m.status !== 'cancelled' && (
                                                        <CancelMembershipDialog
                                                            membership={m}
                                                            clientName={client.display_name}
                                                            onDone={() => {
                                                                refetchMemberships();
                                                                qc.invalidateQueries({ queryKey: ['reception-clients'] });
                                                            }}
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                            {(() => {
                                                const cells = creditCells(m);
                                                const cols = cells.length === 1 ? 'grid-cols-1' : cells.length === 2 ? 'grid-cols-2' : 'grid-cols-3';
                                                return (
                                                    <div className={`grid ${cols} gap-2 text-xs`}>
                                                        {cells.map((c) => (
                                                            <div key={c.label} className="text-center p-2 rounded bg-muted/40">
                                                                <div className="text-muted-foreground">{c.label}</div>
                                                                <div className="font-semibold text-base">{c.value === null ? '∞' : c.value}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Bitácora */}
                    <Card>
                        <CardContent className="pt-4 px-0 pb-0">
                            <h3 className="font-medium px-4 mb-2">Bitácora</h3>
                            <ClientBitacora clientId={client.id} clientName={client.display_name} />
                        </CardContent>
                    </Card>

                    {/* Historial de compras */}
                    <Card>
                        <CardContent className="pt-4">
                            <h3 className="font-medium mb-3">Historial de compras</h3>
                            {memberships.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Sin compras registradas.</p>
                            ) : (
                                <div className="space-y-2">
                                    {[...memberships]
                                        .sort((a, b) => {
                                            const da = a.created_at ?? a.start_date ?? '';
                                            const db = b.created_at ?? b.start_date ?? '';
                                            return db.localeCompare(da);
                                        })
                                        .map((m) => {
                                            const dateRaw = m.created_at ?? m.start_date;
                                            const priceRaw = m.plan_price ?? m.price;
                                            return (
                                                <div key={m.id} className="p-3 rounded-md border bg-card">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <p className="font-medium text-sm truncate">{m.plan_name ?? 'Plan'}</p>
                                                            <p className="text-xs text-muted-foreground">
                                                                {dateRaw ? new Date(dateRaw).toLocaleDateString('es-MX') : '—'}
                                                                {m.payment_method && (
                                                                    <span> · {PAYMENT_METHOD_LABELS[m.payment_method] ?? m.payment_method}</span>
                                                                )}
                                                            </p>
                                                            {m.end_date && (
                                                                <p className="text-xs text-muted-foreground">
                                                                    Vence {new Date(m.end_date).toLocaleDateString('es-MX')}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <p className="text-sm font-semibold">
                                                                {priceRaw != null ? mxn.format(Number(priceRaw)) : '—'}
                                                            </p>
                                                            <Badge
                                                                variant="outline"
                                                                className={m.status === 'active'
                                                                    ? 'text-emerald-600 border-emerald-600 text-xs'
                                                                    : 'text-xs'}
                                                            >
                                                                {MEMBERSHIP_STATUS_LABELS[m.status] ?? m.status}
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Próximas reservas + Reservar en clase */}
                    <Card>
                        <CardContent className="pt-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-medium flex items-center gap-2">
                                    <CalendarDays className="h-4 w-4" />
                                    Próximas reservas
                                    {upcomingBookings.length > 0 && (
                                        <Badge variant="outline" className="ml-1">{upcomingBookings.length}</Badge>
                                    )}
                                </h3>
                                <ReserveClassDialog
                                    clientId={client.id}
                                    clientName={client.display_name}
                                    onDone={() => {
                                        qc.invalidateQueries({ queryKey: ['client-upcoming-bookings', client.id] });
                                        qc.invalidateQueries({ queryKey: ['client-memberships', client.id] });
                                        qc.invalidateQueries({ queryKey: ['reception-bookings'] });
                                    }}
                                />
                            </div>
                            {upcomingBookings.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No tiene clases reservadas próximamente.</p>
                            ) : (
                                <div className="space-y-2">
                                    {upcomingBookings.map((b) => {
                                        const dateLabel = new Date(b.class_date + 'T00:00:00').toLocaleDateString('es-MX', {
                                            weekday: 'short', day: 'numeric', month: 'short',
                                        });
                                        return (
                                            <div key={b.booking_id} className="flex items-center gap-2 p-2 rounded-md border bg-card">
                                                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium truncate">
                                                        {dateLabel} · {trimTime(b.class_start_time)}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground truncate">
                                                        {b.class_name} · {b.instructor_name}
                                                    </p>
                                                </div>
                                                {b.booking_status === 'checked_in' ? (
                                                    <Badge variant="outline" className="text-emerald-600 border-emerald-600 text-xs">check-in</Badge>
                                                ) : b.booking_status === 'waitlist' ? (
                                                    <Badge variant="outline" className="text-amber-600 border-amber-600 text-xs">espera</Badge>
                                                ) : (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => cancelBooking.mutate(b.booking_id)}
                                                        disabled={cancelBooking.isPending}
                                                    >
                                                        <X className="h-3 w-3 mr-1" /> Cancelar
                                                    </Button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Historial de clases (pasadas) */}
                    <Card>
                        <CardContent className="pt-4">
                            <h3 className="font-medium flex items-center gap-2 mb-3">
                                <Clock className="h-4 w-4" />
                                Historial de clases
                            </h3>
                            {pastBookings.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Aún no tiene clases pasadas.</p>
                            ) : (
                                <div className="space-y-2">
                                    {pastBookings.map((b) => {
                                        const dateLabel = new Date(b.class_date + 'T00:00:00').toLocaleDateString('es-MX', {
                                            weekday: 'short', day: 'numeric', month: 'short',
                                        });
                                        return (
                                            <div key={b.booking_id} className="flex items-center gap-2 p-2 rounded-md border bg-card">
                                                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium truncate">
                                                        {dateLabel} · {trimTime(b.class_start_time)}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground truncate">
                                                        {b.class_name} · {b.instructor_name}
                                                    </p>
                                                </div>
                                                {b.booking_status === 'checked_in' ? (
                                                    <Badge variant="outline" className="text-emerald-600 border-emerald-600 text-xs">Asistió</Badge>
                                                ) : b.booking_status === 'no_show' ? (
                                                    <Badge variant="outline" className="text-amber-600 border-amber-600 text-xs">No asistió</Badge>
                                                ) : b.booking_status === 'cancelled' ? (
                                                    <Badge variant="outline" className="text-muted-foreground text-xs">Cancelada</Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-xs">Confirmada</Badge>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </SheetContent>
        </Sheet>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────
type ClientListRow = ClientRow & {
    membership_status?: string | null;
    plan_name?: string | null;
};

export default function ClientsScreen() {
    const [search, setSearch] = useState('');
    const [membershipStatus, setMembershipStatus] = useState('');
    const [planId, setPlanId] = useState('');
    const [tag, setTag] = useState('');
    const [sort, setSort] = useState('recent');
    const [selected, setSelected] = useState<ClientRow | null>(null);
    const qc = useQueryClient();
    const [searchParams, setSearchParams] = useSearchParams();

    const { data: plans = [] } = useQuery<Plan[]>({
        queryKey: ['plans-active'],
        queryFn: async () => (await api.get('/plans?active=true')).data,
    });

    const { data, isLoading, isSuccess } = useQuery<{
        users: ClientListRow[];
        pagination: { total: number };
        counts?: { active: number; expired: number; none: number; total: number };
    }>({
        queryKey: ['reception-clients', search, membershipStatus, planId, tag, sort],
        queryFn: async () => {
            const params = new URLSearchParams();
            params.append('role', 'client');
            params.append('withMembership', 'true');
            params.append('withCounts', 'true');
            params.append('limit', '1000'); // antes 100: cortaba la lista (hay 209 activas / ~500 clientes) y "desaparecían" socias como Raúl
            if (search) params.append('search', search);
            if (membershipStatus) params.append('membershipStatus', membershipStatus);
            if (planId) params.append('planId', planId);
            if (tag) params.append('tag', tag);
            if (sort) params.append('sort', sort);
            return (await api.get(`/users?${params.toString()}`)).data;
        },
    });

    const clients = data?.users ?? [];
    const counts = data?.counts;

    const refetch = () => qc.invalidateQueries({ queryKey: ['reception-clients'] });

    // Deep-link: ?focus=<userId> abre la ficha de esa clienta una sola vez (p.ej.
    // navegación desde la búsqueda global). Esperamos a que la lista cargue para
    // intentar resolverlo desde memoria; si no está (lista paginada/filtrada),
    // lo traemos por id. Se ejecuta UNA vez por id y limpiamos el param.
    const focusId = searchParams.get('focus');
    const handledFocusRef = useRef<string | null>(null);
    useEffect(() => {
        if (!focusId) return;
        if (handledFocusRef.current === focusId) return; // ya lo resolvimos
        if (!isSuccess) return; // espera a que la query de usuarios esté lista

        handledFocusRef.current = focusId;

        const inList = clients.find((c) => c.id === focusId);
        if (inList) {
            setSelected(inList);
            setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.delete('focus');
                return next;
            }, { replace: true });
            return;
        }

        // No está en la lista cargada: traerlo por id y abrir la ficha.
        let cancelled = false;
        (async () => {
            try {
                const res = await api.get(`/users/${focusId}`);
                const u = res.data?.user;
                if (cancelled || !u) return;
                const row: ClientRow = {
                    id: u.id,
                    display_name: u.display_name ?? '',
                    email: u.email ?? '',
                    phone: u.phone ?? '',
                    tags: u.tags ?? null,
                    reception_notes: u.reception_notes ?? null,
                    health_notes: u.health_notes ?? null,
                    role: u.role ?? 'client',
                    is_active: u.is_active ?? true,
                    created_at: u.created_at ?? '',
                };
                setSelected(row);
            } catch {
                // Sin acceso (recepción no-admin) o no encontrado: no abrimos ficha,
                // pero no rompemos la pantalla. La clienta casi siempre está en la lista.
            } finally {
                if (!cancelled) {
                    setSearchParams((prev) => {
                        const next = new URLSearchParams(prev);
                        next.delete('focus');
                        return next;
                    }, { replace: true });
                }
            }
        })();
        return () => { cancelled = true; };
    }, [focusId, isSuccess, clients, setSearchParams]);

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-3xl font-heading font-bold">Usuarios</h1>
                    <p className="text-muted-foreground text-sm">
                        Registrar usuarios nuevos, ver detalle, vender plan, ajustar créditos.
                    </p>
                </div>
                <NewClientDialog onCreated={refetch} />
            </div>

            <Card>
                <CardContent className="pt-4 space-y-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar por nombre, email o teléfono"
                            className="pl-10"
                        />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <Select value={membershipStatus || 'all'} onValueChange={(v) => setMembershipStatus(v === 'all' ? '' : v)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Estado" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos los estados{counts ? ` (${counts.total})` : ''}</SelectItem>
                                <SelectItem value="active">Activa{counts ? ` (${counts.active})` : ''}</SelectItem>
                                <SelectItem value="expired">Vencida{counts ? ` (${counts.expired})` : ''}</SelectItem>
                                <SelectItem value="none">Sin plan (Lead){counts ? ` (${counts.none})` : ''}</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={planId || 'all'} onValueChange={(v) => setPlanId(v === 'all' ? '' : v)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Plan" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos los planes</SelectItem>
                                {plans.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={tag || 'all'} onValueChange={(v) => setTag(v === 'all' ? '' : v)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Etiqueta" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todas las etiquetas</SelectItem>
                                {CLIENT_TAGS.map((t) => (
                                    <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={sort} onValueChange={setSort}>
                            <SelectTrigger>
                                <SelectValue placeholder="Ordenar" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="recent">Recientes</SelectItem>
                                <SelectItem value="name">Nombre A-Z</SelectItem>
                                <SelectItem value="expiring">Por vencer</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {counts && (
                        <div className="flex flex-wrap gap-2 pt-1">
                            {[
                                { key: '', label: 'Todas', n: counts.total },
                                { key: 'active', label: 'Activas', n: counts.active },
                                { key: 'expired', label: 'Vencidas', n: counts.expired },
                                { key: 'none', label: 'Sin plan', n: counts.none },
                            ].map((s) => (
                                <button
                                    key={s.key || 'all'}
                                    type="button"
                                    onClick={() => setMembershipStatus(s.key)}
                                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                                        membershipStatus === s.key
                                            ? 'bg-primary text-primary-foreground border-primary'
                                            : 'bg-muted/40 hover:bg-muted'
                                    }`}
                                >
                                    {s.label}
                                    <span className="font-bold tabular-nums">{s.n}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="space-y-2">
                {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
                ) : clients.length === 0 ? (
                    <Card>
                        <CardContent className="py-8 text-center text-muted-foreground text-sm">
                            {search || membershipStatus || planId || tag
                                ? 'No hay usuarios que coincidan con los filtros.'
                                : 'Aún no hay usuarios registrados.'}
                        </CardContent>
                    </Card>
                ) : (
                    clients.map((c) => (
                        <button
                            key={c.id}
                            data-testid="client-row"
                            onClick={() => setSelected(c)}
                            className="w-full text-left p-3 rounded-md border bg-card hover:bg-muted/40 transition-colors flex items-center gap-3"
                        >
                            <Avatar className="h-10 w-10">
                                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                    {initials(c.display_name)}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{c.display_name}</p>
                                {(c.tags ?? []).length > 0 && (
                                    <div className="mt-1 flex flex-wrap gap-1">
                                        {(c.tags ?? []).map((key) => {
                                            const t = tagByKey(key);
                                            if (!t) return null;
                                            return (
                                                <span
                                                    key={key}
                                                    className="inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-medium"
                                                    style={{ backgroundColor: `${t.color}22`, color: t.color }}
                                                >
                                                    {t.label}
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                                <p className="text-xs text-muted-foreground truncate">
                                    {c.email} · {c.phone}
                                </p>
                            </div>
                            {c.plan_name ? (
                                <Badge
                                    variant="outline"
                                    className={c.membership_status === 'active'
                                        ? 'text-emerald-600 border-emerald-600'
                                        : 'text-muted-foreground'}
                                >
                                    {c.plan_name}
                                </Badge>
                            ) : (
                                <Badge variant="outline" className="text-muted-foreground">Lead</Badge>
                            )}
                            {!c.is_active && <Badge variant="outline">inactivo</Badge>}
                        </button>
                    ))
                )}
            </div>

            <ClientDrawer client={clients.find((c) => c.id === selected?.id) ?? selected} onClose={() => setSelected(null)} />
        </div>
    );
}
