import { useState, useMemo, useEffect, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Loader2, AlertCircle, Download, Pencil, Save, X, ChevronDown, Users, Phone, Settings,
} from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { PeriodPicker } from '@/components/payroll/PeriodPicker';
import { currentPeriodToken, normalizeFrequency, periodLabel, type PayFrequency } from '@/lib/payrollPeriod';

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

interface Facility { id: string; name: string }

interface PayoutSnapshot {
    classes_count: number;
    pay_rate_per_class: number;
    amount: number;
    facility_id: string | null;
    paid_at: string;
    paid_by: string | null;
}

interface Row {
    instructor_id: string;
    display_name: string;
    photo_url: string | null;
    pay_rate_per_class: number | null;
    classes_count: number;
    total: number | null;
    paid: boolean;
    payout: PayoutSnapshot | null;
}

function initials(name: string) {
    return name.split(' ').map((p) => p[0]).filter(Boolean).join('').slice(0, 2).toUpperCase();
}

function RateCell({ row, onUpdate }: { row: Row; onUpdate: () => void }) {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(row.pay_rate_per_class != null ? String(row.pay_rate_per_class) : '');

    const save = useMutation({
        mutationFn: async () => api.put(`/coach-payroll/rate/${row.instructor_id}`, {
            pay_rate_per_class: value === '' ? null : Number(value),
        }),
        onSuccess: () => {
            toast.success(`Tarifa de ${row.display_name} actualizada`);
            setEditing(false);
            onUpdate();
        },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    if (!editing) {
        return (
            <div className="flex items-center justify-end gap-2">
                <span className={row.pay_rate_per_class == null ? 'text-muted-foreground italic' : ''}>
                    {row.pay_rate_per_class != null ? mxn.format(row.pay_rate_per_class) : 'Sin tarifa'}
                </span>
                <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => {
                        setValue(row.pay_rate_per_class != null ? String(row.pay_rate_per_class) : '');
                        setEditing(true);
                    }}
                    aria-label="Editar tarifa"
                    disabled={row.paid}
                >
                    <Pencil className="h-3 w-3" />
                </Button>
            </div>
        );
    }
    return (
        <div className="flex items-center justify-end gap-1">
            <Input
                type="number"
                min="0"
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="h-8 w-24 text-right"
                placeholder="Sin tarifa"
                autoFocus
                onKeyDown={(e) => {
                    if (e.key === 'Enter') save.mutate();
                    if (e.key === 'Escape') setEditing(false);
                }}
            />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(false)}>
                <X className="h-3 w-3" />
            </Button>
        </div>
    );
}

// Estado legible para fila de Excel
function rowStatus(r: Row): string {
    if (r.paid) return 'Pagada';
    if (r.pay_rate_per_class == null) return 'Sin tarifa';
    if (r.classes_count === 0) return 'Sin clases';
    return 'Pendiente';
}

function exportXLSX(rows: Row[], periodToken: string, periodLbl: string, facilityName: string) {
    // Hoja 1: Nómina — números nativos para que Excel haga totales y formato MXN
    const sheet1Rows: (string | number)[][] = [
        ['Nómina de Coaches — Casa Shé'],
        [`Periodo: ${periodLbl}`, `Sede: ${facilityName}`],
        [],
        ['Coach', 'Tarifa por clase (MXN)', 'Clases impartidas', 'Total (MXN)', 'Estado'],
    ];
    let totalAmount = 0;
    for (const r of rows) {
        const rate = r.pay_rate_per_class != null ? r.pay_rate_per_class : '';
        const total = r.total != null ? r.total : '';
        if (typeof total === 'number') totalAmount += total;
        sheet1Rows.push([
            r.display_name,
            typeof rate === 'number' ? rate : (rate as string),
            r.classes_count,
            typeof total === 'number' ? total : (total as string),
            rowStatus(r),
        ]);
    }
    sheet1Rows.push([]);
    sheet1Rows.push(['TOTAL', '', '', Math.round(totalAmount * 100) / 100, '']);

    const ws = XLSX.utils.aoa_to_sheet(sheet1Rows);
    // Anchos de columna en caracteres aprox.
    ws['!cols'] = [
        { wch: 28 }, // Coach
        { wch: 20 }, // Tarifa
        { wch: 18 }, // Clases
        { wch: 16 }, // Total
        { wch: 14 }, // Estado
    ];

    // Formato MXN para columnas de dinero (col B = tarifa, col D = total).
    // Excel se queda con el número crudo, solo cambia cómo lo muestra.
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let row = 4; row <= range.e.r; row++) {
        for (const col of [1, 3]) {
            const ref = XLSX.utils.encode_cell({ r: row, c: col });
            const cell = ws[ref];
            if (cell && typeof cell.v === 'number') cell.z = '"$"#,##0.00';
        }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Nómina');
    XLSX.writeFile(wb, `nomina-coaches-${periodToken}.xlsx`);
}

interface ClassDetailRow {
    id: string;
    date: string;
    start_time: string | null;
    class_type_name: string;
    facility_name: string | null;
    reservas: number;
    asistencias: number;
}

const MONTH_ABBR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fmtClassDate(d: string): string {
    const iso = String(d).slice(0, 10);
    const [, m, day] = iso.split('-');
    if (!m || !day) return iso;
    return `${day} ${MONTH_ABBR[Number(m) - 1] ?? ''}`.trim();
}

// ─── Asistentes de una clase (dialog) ─────────────────────────────────────────
interface Attendee {
    booking_id: string;
    status: string;
    checked_in_at: string | null;
    waitlist_position: number | null;
    user_id: string;
    display_name: string;
    email: string;
    photo_url: string | null;
    phone: string;
    plan_name: string | null;
}

function attendeeBadge(status: string) {
    switch (status) {
        case 'checked_in':
            return <Badge variant="outline" className="text-emerald-600 border-emerald-600">Asistió</Badge>;
        case 'cancelled':
            return <Badge variant="outline" className="text-muted-foreground border-muted-foreground">Canceló</Badge>;
        case 'waitlist':
            return <Badge variant="outline" className="text-amber-600 border-amber-600">Espera</Badge>;
        case 'no_show':
            return <Badge variant="outline" className="text-rose-600 border-rose-600">No asistió</Badge>;
        default:
            return <Badge variant="outline" className="text-sky-600 border-sky-600">Reservó</Badge>;
    }
}

function ClassAttendeesDialog({
    classRow, open, onOpenChange,
}: { classRow: ClassDetailRow | null; open: boolean; onOpenChange: (o: boolean) => void }) {
    const { data, isLoading } = useQuery<Attendee[]>({
        queryKey: ['class-attendees', classRow?.id],
        queryFn: async () => (await api.get(`/bookings/class/${classRow?.id}?include_cancelled=true`)).data,
        enabled: !!classRow?.id && open,
    });

    const attendees = data ?? [];
    // "Asistieron" = check-in; el resto va abajo como reservados/espera/cancelados.
    const attended = attendees.filter((a) => a.status === 'checked_in');
    const others = attendees.filter((a) => a.status !== 'checked_in');

    const renderRow = (a: Attendee) => (
        <div
            key={a.booking_id}
            className={`flex items-center justify-between gap-2 rounded-md border p-2.5 ${a.status === 'checked_in' ? 'border-emerald-200 bg-emerald-50/50' : a.status === 'cancelled' ? 'opacity-70' : ''}`}
        >
            <div className="flex min-w-0 items-center gap-3">
                <Avatar className="h-9 w-9">
                    <AvatarImage src={a.photo_url || undefined} />
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">{initials(a.display_name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                    <p className="truncate font-medium text-sm">{a.display_name}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        {a.plan_name && <Badge variant="outline" className="text-[10px]">{a.plan_name}</Badge>}
                        {a.status === 'waitlist' && a.waitlist_position != null && (
                            <span className="font-medium text-amber-600">#{a.waitlist_position} en espera</span>
                        )}
                        {a.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{a.phone}</span>}
                    </div>
                </div>
            </div>
            <div className="shrink-0">{attendeeBadge(a.status)}</div>
        </div>
    );

    const title = classRow
        ? `${classRow.class_type_name} · ${fmtClassDate(classRow.date)}${classRow.start_time ? ` ${String(classRow.start_time).slice(0, 5)}` : ''}`
        : 'Asistentes';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                {isLoading ? (
                    <div className="space-y-2">
                        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                    </div>
                ) : attendees.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">Esta clase no tiene reservas registradas.</p>
                ) : (
                    <div className="space-y-4">
                        {attended.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                                    Asistieron ({attended.length})
                                </p>
                                {attended.map(renderRow)}
                            </div>
                        )}
                        {others.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    {attended.length > 0 ? 'No asistieron' : 'Reservas'} ({others.length})
                                </p>
                                {others.map(renderRow)}
                            </div>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

function CoachClassesDetail({ instructorId, period, facilityId }: { instructorId: string; period: string; facilityId: string }) {
    const facilityParam = facilityId === 'all' ? '' : `&facility_id=${facilityId}`;
    const [selectedClass, setSelectedClass] = useState<ClassDetailRow | null>(null);
    const { data, isLoading } = useQuery<ClassDetailRow[]>({
        queryKey: ['coach-classes', instructorId, period, facilityId],
        queryFn: async () => (await api.get(`/coach-payroll/${instructorId}/classes?period=${period}${facilityParam}`)).data,
    });

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando clases…
            </div>
        );
    }
    const classes = data ?? [];
    if (classes.length === 0) {
        return <div className="px-4 py-3 text-sm text-muted-foreground">Sin clases en este periodo.</div>;
    }
    return (
        <div className="px-4 py-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {classes.length} {classes.length === 1 ? 'clase impartida' : 'clases impartidas'}
            </p>
            <div className="grid gap-1 sm:grid-cols-2">
                {classes.map((c) => {
                    const asis = Number(c.asistencias) || 0;
                    const resv = Number(c.reservas) || 0;
                    return (
                    <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedClass(c)}
                        className="flex w-full items-center gap-2 rounded-md bg-muted/50 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                        title="Ver asistentes de esta clase"
                    >
                        <span className="w-14 shrink-0 tabular-nums font-medium">{fmtClassDate(c.date)}</span>
                        <span className="min-w-0 flex-1 truncate">{c.class_type_name}</span>
                        {c.start_time && (
                            <span className="hidden shrink-0 tabular-nums text-muted-foreground sm:inline">{String(c.start_time).slice(0, 5)}</span>
                        )}
                        {/* Gente en la clase: verde si asistieron (check-in), ámbar si solo reservaron */}
                        <span
                            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${asis > 0 ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}
                            title={asis > 0 ? `${asis} asistieron (check-in)` : `${resv} reservaron, sin check-in registrado`}
                        >
                            <Users className="h-3 w-3" />
                            {asis > 0 ? `${asis}` : `${resv}`}
                        </span>
                        {c.facility_name && (
                            <span className="hidden shrink-0 truncate text-xs text-muted-foreground sm:block">
                                {c.facility_name.replace(/^Casa Shé\s*/i, '')}
                            </span>
                        )}
                    </button>
                    );
                })}
            </div>
            <ClassAttendeesDialog
                classRow={selectedClass}
                open={!!selectedClass}
                onOpenChange={(o) => { if (!o) setSelectedClass(null); }}
            />
        </div>
    );
}

// ─── Configuración de pago (frecuencia + día) ─────────────────────────────────
interface PayrollConfig { frequency: PayFrequency; pay_day: number }

const FREQUENCY_LABELS: Record<PayFrequency, string> = {
    biweekly: 'quincenal',
    monthly: 'mensual',
};

function PayrollConfigDialog({
    config, canEdit, open, onOpenChange,
}: { config: PayrollConfig; canEdit: boolean; open: boolean; onOpenChange: (o: boolean) => void }) {
    const qc = useQueryClient();
    const [frequency, setFrequency] = useState<PayFrequency>(normalizeFrequency(config.frequency));
    const [payDay, setPayDay] = useState<string>(String(config.pay_day));

    // Resync local state cada vez que se abre (config puede haber cambiado).
    useEffect(() => {
        if (open) {
            setFrequency(normalizeFrequency(config.frequency));
            setPayDay(String(config.pay_day));
        }
    }, [open, config.frequency, config.pay_day]);

    const save = useMutation({
        mutationFn: async () => api.put('/settings/payroll-config', {
            frequency,
            pay_day: Number(payDay),
        }),
        onSuccess: () => {
            toast.success('Configuración de pago guardada');
            qc.invalidateQueries({ queryKey: ['payroll-config'] });
            onOpenChange(false);
        },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    const dayNum = Number(payDay);
    const dayValid = Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 31;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Configuración de pago</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-1">
                        <Label>Frecuencia</Label>
                        <Select
                            value={frequency}
                            onValueChange={(v) => setFrequency(v as PayFrequency)}
                            disabled={!canEdit}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="biweekly">Quincenal</SelectItem>
                                <SelectItem value="monthly">Mensual</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="pay-day">Día de pago</Label>
                        <Input
                            id="pay-day"
                            type="number"
                            min={1}
                            max={31}
                            value={payDay}
                            onChange={(e) => setPayDay(e.target.value)}
                            disabled={!canEdit}
                        />
                        <p className="text-xs text-muted-foreground">Día del mes (1–31) en que se paga la nómina.</p>
                    </div>
                    {!canEdit && (
                        <p className="text-xs text-muted-foreground">Solo administración puede modificar esta configuración.</p>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
                    {canEdit && (
                        <Button onClick={() => save.mutate()} disabled={save.isPending || !dayValid}>
                            {save.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                            Guardar
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function CoachPayrollContent() {
    const qc = useQueryClient();
    const { user } = useAuthStore();
    const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
    const [facilityId, setFacilityId] = useState<string>('all');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [configOpen, setConfigOpen] = useState(false);

    const { data: payrollConfig = { frequency: 'monthly' as PayFrequency, pay_day: 1 } } = useQuery<PayrollConfig>({
        queryKey: ['payroll-config'],
        queryFn: async () => (await api.get('/settings/payroll-config')).data,
    });
    const frequency = normalizeFrequency(payrollConfig.frequency);

    const [period, setPeriod] = useState(() => currentPeriodToken('monthly'));
    // Cuando carga/cambia la frecuencia configurada, ajusta el periodo al actual de esa frecuencia.
    useEffect(() => { setPeriod(currentPeriodToken(frequency)); }, [frequency]);

    const { data: facilities = [] } = useQuery<Facility[]>({
        queryKey: ['facilities'],
        queryFn: async () => {
            const { data } = await api.get('/facilities');
            return Array.isArray(data) ? data : [];
        },
    });

    const facilityParam = facilityId === 'all' ? '' : `&facility_id=${facilityId}`;
    const { data, isLoading, error } = useQuery<{ period?: string; period_label?: string; facility_id: string | null; rows: Row[] }>({
        queryKey: ['coach-payroll', period, facilityId],
        queryFn: async () => (await api.get(`/coach-payroll?period=${period}${facilityParam}`)).data,
    });
    const rows = data?.rows ?? [];
    const periodLbl = data?.period_label ?? periodLabel(period);

    const invalidate = () => qc.invalidateQueries({ queryKey: ['coach-payroll', period, facilityId] });

    const pay = useMutation({
        mutationFn: async (instructorId: string) => api.post('/coach-payroll/payouts', {
            instructor_id: instructorId,
            period,
            facility_id: facilityId === 'all' ? null : facilityId,
        }),
        onSuccess: () => { toast.success('Nómina pagada y registrada en egresos'); invalidate(); },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    const unpay = useMutation({
        mutationFn: async (instructorId: string) => api.delete(
            `/coach-payroll/payouts/${instructorId}?period=${period}${facilityParam}`
        ),
        onSuccess: () => { toast.success('Pago des-marcado y egreso eliminado'); invalidate(); },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    const totalAmount = useMemo(
        () => rows.reduce((s, r) => s + (r.total ?? 0), 0),
        [rows]
    );
    const totalClasses = useMemo(() => rows.reduce((s, r) => s + r.classes_count, 0), [rows]);

    const facilityName = facilities.find((f) => f.id === facilityId)?.name
        ?? facilities[0]?.name
        ?? 'Casa Shé';

    return (
        <div className="space-y-6">
                <div className="flex items-start justify-between flex-wrap gap-3">
                    <div>
                        <h1 className="text-3xl font-heading font-bold">Nómina de Coaches</h1>
                        <p className="text-muted-foreground">
                            Pago por clases impartidas (status “completed”). La tarifa por clase se edita por coach.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setConfigOpen(true)}>
                            <Settings className="h-4 w-4 mr-2" />
                            Configuración de pago
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => exportXLSX(rows, period, periodLbl, facilityName)} disabled={rows.length === 0}>
                            <Download className="h-4 w-4 mr-2" />
                            Exportar Excel
                        </Button>
                    </div>
                </div>

                <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground/80">
                    <Settings className="h-3.5 w-3.5 text-primary" />
                    <span>
                        Pago: <strong>{FREQUENCY_LABELS[frequency]}</strong>, día {payrollConfig.pay_day}
                    </span>
                </div>

                <PayrollConfigDialog
                    config={payrollConfig}
                    canEdit={isAdmin}
                    open={configOpen}
                    onOpenChange={setConfigOpen}
                />

                <Card>
                    <CardContent className="pt-4 pb-3">
                        <div className="flex flex-wrap items-end gap-4">
                            <PeriodPicker frequency={frequency} value={period} onChange={setPeriod} />
                            <div className="flex-1 min-w-[200px] grid grid-cols-2 gap-3 ml-auto">
                                <div className="text-right">
                                    <div className="text-xs text-muted-foreground">Clases del periodo</div>
                                    <div className="text-xl sm:text-2xl font-semibold tabular-nums truncate">{totalClasses}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xs text-muted-foreground">Total a pagar</div>
                                    <div className="text-xl sm:text-2xl font-semibold tabular-nums truncate">{mxn.format(totalAmount)}</div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="border rounded-md overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Coach</TableHead>
                                <TableHead className="text-right">Tarifa por clase</TableHead>
                                <TableHead className="text-right">Clases impartidas</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead className="text-center">Estado</TableHead>
                                <TableHead className="text-right">Acción</TableHead>
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
                                        No hay coaches activos.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                rows.map((r) => {
                                    const isExpanded = expandedId === r.instructor_id;
                                    return (
                                    <Fragment key={r.instructor_id}>
                                    <TableRow>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Avatar className="h-8 w-8">
                                                    <AvatarImage src={r.photo_url || undefined} />
                                                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                                        {initials(r.display_name)}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <span className="font-medium">{r.display_name}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <RateCell row={r} onUpdate={invalidate} />
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {r.classes_count > 0 ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setExpandedId(isExpanded ? null : r.instructor_id)}
                                                    className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium transition-colors hover:bg-muted"
                                                    aria-expanded={isExpanded}
                                                    title="Ver clases impartidas"
                                                >
                                                    {r.classes_count}
                                                    <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                                </button>
                                            ) : (
                                                r.classes_count
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right font-semibold">
                                            {r.total != null ? mxn.format(r.total) : <span className="text-muted-foreground">—</span>}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {r.paid ? (
                                                <span className="inline-flex items-center gap-1.5">
                                                    <Badge variant="outline" className="text-emerald-600 border-emerald-600">Pagada</Badge>
                                                    {r.payout && r.payout.classes_count !== r.classes_count && (
                                                        <Badge
                                                            variant="destructive"
                                                            title={`Se pagó con ${r.payout.classes_count} clases; el conteo actual del mes es ${r.classes_count}. Cambió alguna clase después de pagar (p. ej. de instructor).`}
                                                        >
                                                            desfase vs pagado
                                                        </Badge>
                                                    )}
                                                </span>
                                            ) : r.pay_rate_per_class == null ? (
                                                <Badge variant="outline" className="text-muted-foreground border-muted-foreground">Sin tarifa</Badge>
                                            ) : r.classes_count === 0 ? (
                                                <Badge variant="outline" className="text-gray-500 border-gray-400">Sin clases</Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-amber-600 border-amber-600">Pendiente</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {isAdmin && (r.paid ? (
                                                <Button variant="ghost" size="sm" onClick={() => unpay.mutate(r.instructor_id)} disabled={unpay.isPending}>
                                                    Des-marcar
                                                </Button>
                                            ) : (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => pay.mutate(r.instructor_id)}
                                                    disabled={
                                                        pay.isPending ||
                                                        r.pay_rate_per_class == null ||
                                                        r.classes_count === 0
                                                    }
                                                >
                                                    Marcar pagada
                                                </Button>
                                            ))}
                                        </TableCell>
                                    </TableRow>
                                    {isExpanded && (
                                        <TableRow>
                                            <TableCell colSpan={6} className="bg-muted/20 p-0">
                                                <CoachClassesDetail instructorId={r.instructor_id} period={period} facilityId={facilityId} />
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    </Fragment>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
    );
}

export default function CoachPayrollPage() {
    return (
        <AdminLayout>
            <CoachPayrollContent />
        </AdminLayout>
    );
}
