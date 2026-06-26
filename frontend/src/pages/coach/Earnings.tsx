import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { AlertCircle, Wallet, Calendar as CalendarIcon, CheckCircle2 } from 'lucide-react';
import CoachLayout from '@/components/layout/CoachLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import api, { getErrorMessage } from '@/lib/api';
import { PeriodPicker } from '@/components/payroll/PeriodPicker';
import { currentPeriodToken, normalizeFrequency, periodLabel, type PayFrequency } from '@/lib/payrollPeriod';

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

interface PayoutRow {
    period_month: string;
    facility_id: string | null;
    classes_count: number;
    pay_rate_per_class: string | number;
    amount: string | number;
    paid_at: string;
}

interface MyEarnings {
    period?: string;
    period_label?: string;
    frequency?: PayFrequency;
    pay_rate_per_class: number | null;
    classes_count: number;
    projected_total: number | null;
    paid_total: number;
    payouts: PayoutRow[];
}

export default function CoachEarnings() {
    const { data: payrollConfig = { frequency: 'monthly' as PayFrequency } } = useQuery<{ frequency: PayFrequency }>({
        queryKey: ['payroll-config'],
        queryFn: async () => (await api.get('/settings/payroll-config')).data,
    });
    const frequency = normalizeFrequency(payrollConfig.frequency);

    const [period, setPeriod] = useState(() => currentPeriodToken('monthly'));
    // Ajusta el periodo al actual de la frecuencia configurada cuando carga/cambia.
    useEffect(() => { setPeriod(currentPeriodToken(frequency)); }, [frequency]);

    const { data, isLoading, error } = useQuery<MyEarnings>({
        queryKey: ['coach-earnings-me', period],
        queryFn: async () => (await api.get(`/coach-payroll/me?period=${period}`)).data,
    });
    const periodLbl = data?.period_label ?? periodLabel(period);

    const rate = data?.pay_rate_per_class ?? null;
    const projected = data?.projected_total ?? null;
    const pending = projected != null ? Math.max(0, projected - (data?.paid_total ?? 0)) : null;

    return (
        <AuthGuard requiredRoles={['instructor', 'admin']}>
            <CoachLayout>
                <div className="max-w-5xl mx-auto space-y-6">
                    <div>
                        <h1 className="font-heading text-3xl font-bold">Mis Ingresos</h1>
                        <p className="text-muted-foreground">
                            Tu pago por clases impartidas (status “completada”). El monto se confirma con el cierre del periodo.
                        </p>
                    </div>

                    {/* Filtro de mes */}
                    <Card>
                        <CardContent className="pt-4 pb-3">
                            <div className="flex flex-wrap items-end gap-4">
                                <PeriodPicker frequency={frequency} value={period} onChange={setPeriod} />
                                <p className="text-sm text-muted-foreground">
                                    Periodo: {periodLbl}
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* KPIs */}
                    {isLoading ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <Skeleton key={i} className="h-24" />
                            ))}
                        </div>
                    ) : error ? (
                        <Card>
                            <CardContent className="py-8 text-center text-destructive">
                                <div className="flex items-center justify-center gap-2">
                                    <AlertCircle className="h-4 w-4" />
                                    {getErrorMessage(error)}
                                </div>
                            </CardContent>
                        </Card>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <Card>
                                    <CardContent className="p-4">
                                        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                                            <CalendarIcon className="h-4 w-4" />
                                            Clases impartidas
                                        </div>
                                        <p className="text-3xl font-bold">{data?.classes_count ?? 0}</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="p-4">
                                        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                                            <Wallet className="h-4 w-4" />
                                            Tarifa por clase
                                        </div>
                                        <p className="text-3xl font-bold">
                                            {rate != null ? mxn.format(rate) : (
                                                <span className="text-base font-normal text-muted-foreground italic">
                                                    Sin tarifa configurada
                                                </span>
                                            )}
                                        </p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="p-4">
                                        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                                            <Wallet className="h-4 w-4" />
                                            Estimado del periodo
                                        </div>
                                        <p className="text-3xl font-bold">
                                            {projected != null ? mxn.format(projected) : <span className="text-base font-normal text-muted-foreground">—</span>}
                                        </p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="p-4">
                                        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                                            <CheckCircle2 className="h-4 w-4" />
                                            Pagado este periodo
                                        </div>
                                        <p className="text-3xl font-bold">{mxn.format(data?.paid_total ?? 0)}</p>
                                        {pending != null && pending > 0 && (
                                            <p className="text-xs text-amber-600 mt-1">
                                                Pendiente: {mxn.format(pending)}
                                            </p>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Aviso si no hay tarifa */}
                            {rate == null && (
                                <Card>
                                    <CardContent className="py-4 flex items-center gap-2 text-amber-700 text-sm">
                                        <AlertCircle className="h-4 w-4 shrink-0" />
                                        Aún no tienes una tarifa por clase configurada. Habla con administración para que la activen.
                                    </CardContent>
                                </Card>
                            )}

                            {/* Detalle de pagos */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Historial de pagos del periodo</CardTitle>
                                    <CardDescription>
                                        Cada fila es un pago registrado por administración (snapshot al momento de pagar).
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {(data?.payouts ?? []).length === 0 ? (
                                        <p className="text-sm text-muted-foreground text-center py-6">
                                            Aún no hay pagos registrados para este periodo.
                                        </p>
                                    ) : (
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Fecha de pago</TableHead>
                                                    <TableHead className="text-right">Clases</TableHead>
                                                    <TableHead className="text-right">Tarifa</TableHead>
                                                    <TableHead className="text-right">Monto</TableHead>
                                                    <TableHead className="text-center">Sucursal</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {data!.payouts.map((p, idx) => (
                                                    <TableRow key={idx}>
                                                        <TableCell>
                                                            {new Date(p.paid_at).toLocaleDateString('es-MX', {
                                                                day: '2-digit',
                                                                month: 'short',
                                                                year: 'numeric',
                                                            })}
                                                        </TableCell>
                                                        <TableCell className="text-right">{p.classes_count}</TableCell>
                                                        <TableCell className="text-right">{mxn.format(Number(p.pay_rate_per_class))}</TableCell>
                                                        <TableCell className="text-right font-semibold">{mxn.format(Number(p.amount))}</TableCell>
                                                        <TableCell className="text-center">
                                                            {p.facility_id ? (
                                                                <Badge variant="outline" className="text-xs">por sucursal</Badge>
                                                            ) : (
                                                                <Badge variant="outline" className="text-xs">todas</Badge>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    )}
                                </CardContent>
                            </Card>
                        </>
                    )}
                </div>
            </CoachLayout>
        </AuthGuard>
    );
}
