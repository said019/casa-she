import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { AlertTriangle, Check, FileText, Upload } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { ChannelLogo } from '@/components/brands/ChannelLogo';
import { getFitpassBulkImportLockMessage } from '@/lib/fitpass-import-error';

type RowStatus = 'reserved' | 'attended' | 'cancelled';

interface ImportRow {
    sourceRef?: string;
    displayName: string;
    fitpassMemberRef?: string;
    classId?: string;
    classLookup?: { date: string; startTime: string };
    status: RowStatus;
}

interface RowResult {
    index: number;
    outcome: 'created' | 'updated' | 'cancelled' | 'skipped' | 'failed';
    bookingId?: string;
    checkinId?: string;
    reason?: string;
    error?: string;
    message?: string;
}

interface ImportResponse {
    summary: {
        total: number;
        created: number;
        updated: number;
        cancelled: number;
        skipped: number;
        failed: number;
    };
    rows: RowResult[];
}

function detectDelimiter(headerLine: string): string {
    const tabs = (headerLine.match(/\t/g) || []).length;
    const semicolons = (headerLine.match(/;/g) || []).length;
    const commas = (headerLine.match(/,/g) || []).length;
    if (tabs >= commas && tabs >= semicolons) return '\t';
    if (semicolons > commas) return ';';
    return ',';
}

function splitCsvLine(line: string, delim: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuote) {
            if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
            else if (ch === '"') inQuote = false;
            else cur += ch;
        } else {
            if (ch === delim) { out.push(cur); cur = ''; }
            else if (ch === '"') inQuote = true;
            else cur += ch;
        }
    }
    out.push(cur);
    return out.map((s) => s.trim());
}

function parseDateTime(v: string): { date: string; time: string } | null {
    v = (v || '').trim();
    if (!v) return null;
    let m = v.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/);
    if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4].padStart(2, '0')}:${m[5]}` };
    m = v.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})[ T](\d{1,2}):(\d{2})/);
    if (m) {
        const day = m[1].padStart(2, '0');
        const mon = m[2].padStart(2, '0');
        const year = m[3].length === 2 ? `20${m[3]}` : m[3];
        return { date: `${year}-${mon}-${day}`, time: `${m[4].padStart(2, '0')}:${m[5]}` };
    }
    return null;
}

function mapFitpassStatus(v: string): RowStatus {
    const s = (v || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
    if (!s) return 'reserved';
    // Negativos PRIMERO: "no asistió" / "not_attended" contienen "asisti"/"attend".
    // No-show = reservó pero no vino → lo tratamos como reserva (no como asistencia).
    if (/noasisti|notattend|noshow|nopresent|ausent/.test(s)) return 'reserved';
    if (/cancel/.test(s)) return 'cancelled';
    if (/asisti|attend|checkin|complet|present|finaliz/.test(s)) return 'attended';
    return 'reserved';
}

function parseCsv(text: string): { rows: ImportRow[]; errors: string[] } {
    const errors: string[] = [];
    const clean = text.replace(/^﻿/, '');
    const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
        return { rows: [], errors: ['Necesito una fila de encabezados y al menos una fila de datos.'] };
    }
    const delim = detectDelimiter(lines[0]);
    const headers = splitCsvLine(lines[0], delim).map((h) => h.toLowerCase().replace(/[\s_-]/g, ''));
    const idx = (...names: string[]): number => {
        for (const n of names) {
            const i = headers.indexOf(n.toLowerCase().replace(/[\s_-]/g, ''));
            if (i !== -1) return i;
        }
        return -1;
    };
    const iName = idx('displayName', 'nombre', 'name', 'fullName', 'cliente', 'firstName');
    const iLastName = idx('apellido', 'lastName', 'surname', 'apellidos');
    const iRef = idx('sourceRef', 'reservationId', 'reservaId', 'idReserva', 'externalRef', 'id', 'folio');
    const iMember = idx('fitpassMemberRef', 'memberRef', 'idMiembro', 'memberId', 'userId', 'idUsuario');
    const iClassId = idx('classId', 'idClase');
    const iDate = idx('date', 'fecha', 'classDate');
    const iTime = idx('startTime', 'time', 'hora', 'horaInicio');
    const iDateTime = idx('fechaHoraClase', 'fechaHora', 'datetime', 'classDateTime', 'fechaHoraInicio', 'fechaInicio');
    const iStatus = idx('status', 'estado', 'estatus');

    if (iName === -1 && iLastName === -1) {
        return {
            rows: [],
            errors: [`Falta columna de nombre. Encabezados detectados: ${headers.join(', ')}`],
        };
    }
    if (iClassId === -1 && iDateTime === -1 && (iDate === -1 || iTime === -1)) {
        return {
            rows: [],
            errors: [`Necesito "classId" O "fecha_hora_clase" O ("date" + "startTime"). Encabezados: ${headers.join(', ')}`],
        };
    }

    const rows: ImportRow[] = [];
    for (let li = 1; li < lines.length; li++) {
        const cols = splitCsvLine(lines[li], delim);
        const first = iName !== -1 ? (cols[iName] || '').trim() : '';
        const last = iLastName !== -1 ? (cols[iLastName] || '').trim() : '';
        const displayName = [first, last].filter(Boolean).join(' ').trim();
        if (!displayName) { errors.push(`Fila ${li + 1}: nombre vacío, ignorada`); continue; }

        const statusRaw = iStatus !== -1 ? cols[iStatus] || '' : '';
        const status: RowStatus = mapFitpassStatus(statusRaw);

        const row: ImportRow = { displayName, status };
        if (iRef !== -1 && cols[iRef]) row.sourceRef = cols[iRef].trim();
        if (iMember !== -1 && cols[iMember]) row.fitpassMemberRef = cols[iMember].trim();

        if (iClassId !== -1 && cols[iClassId]) {
            row.classId = cols[iClassId].trim();
        } else if (iDateTime !== -1 && cols[iDateTime]) {
            const dt = parseDateTime(cols[iDateTime]);
            if (!dt) {
                errors.push(`Fila ${li + 1}: no entiendo "${cols[iDateTime]}" como fecha+hora`);
                continue;
            }
            row.classLookup = { date: dt.date, startTime: dt.time };
        } else if (iDate !== -1 && iTime !== -1) {
            const date = (cols[iDate] || '').trim();
            const time = (cols[iTime] || '').trim();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                errors.push(`Fila ${li + 1}: date debe ser YYYY-MM-DD (vino "${date}")`);
                continue;
            }
            if (!/^\d{2}:\d{2}(:\d{2})?$/.test(time)) {
                errors.push(`Fila ${li + 1}: startTime debe ser HH:MM (vino "${time}")`);
                continue;
            }
            row.classLookup = { date, startTime: time };
        } else {
            errors.push(`Fila ${li + 1}: sin columna de fecha`);
            continue;
        }
        rows.push(row);
    }
    return { rows, errors };
}

function parseJson(text: string): { rows: ImportRow[]; errors: string[] } {
    try {
        const parsed = JSON.parse(text);
        const arr: any[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.rows) ? parsed.rows : [];
        if (!arr.length) return { rows: [], errors: ['JSON vacío o sin array de filas.'] };
        return { rows: arr as ImportRow[], errors: [] };
    } catch (err) {
        return { rows: [], errors: [`JSON inválido: ${(err as Error).message}`] };
    }
}

export default function FitpassImport() {
    const { toast } = useToast();
    const [tab, setTab] = useState<'csv' | 'json'>('csv');
    const [text, setText] = useState('');
    const [result, setResult] = useState<ImportResponse | null>(null);

    const parsed = useMemo(() => {
        if (!text.trim()) return { rows: [], errors: [] };
        return tab === 'csv' ? parseCsv(text) : parseJson(text);
    }, [text, tab]);

    const importMutation = useMutation({
        mutationFn: async (rows: ImportRow[]): Promise<ImportResponse> => {
            const { data } = await api.post<ImportResponse>('/partners/fitpass/bulk-import', { rows });
            return data;
        },
        onSuccess: (data) => {
            setResult(data);
            toast({
                title: 'Import procesado',
                description: `${data.summary.created} creadas, ${data.summary.updated} actualizadas, ${data.summary.cancelled} canceladas, ${data.summary.failed} fallaron`,
            });
        },
        onError: (err) => {
            const lockMessage = getFitpassBulkImportLockMessage(err);
            if (lockMessage) {
                toast({
                    variant: 'destructive',
                    title: 'Fitpass se está sincronizando',
                    description: lockMessage.replace('Fitpass se está sincronizando. ', ''),
                });
                return;
            }
            toast({
                variant: 'destructive',
                title: 'Error al importar',
                description: getErrorMessage(err),
            });
        },
    });

    const canImport = parsed.rows.length > 0 && parsed.errors.length === 0 && !importMutation.isPending;
    const previewRows = parsed.rows.slice(0, 10);

    return (
        <AuthGuard requiredRoles={['admin', 'super_admin']}>
            <AdminLayout>
                <div className="container mx-auto py-6 space-y-6">
                    <div>
                        <h1 className="flex items-center gap-2 text-2xl font-bold font-heading text-casa-ciruela">Importar reservas <ChannelLogo canal="fitpass" alto={18} /></h1>
                        <p className="text-sm text-muted-foreground">
                            Pega un CSV (export del portal de Fitpass) o JSON y aplica las reservas de golpe.
                        </p>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Upload className="w-5 h-5" /> Origen</CardTitle>
                            <CardDescription>
                                CSV/TSV: detecta automáticamente el separador (tab, coma o punto y coma).
                                Reconoce encabezados de Fitpass: <code>id, user_id, nombre, apellido, fecha_hora_clase, estatus</code>
                                (concatena nombre+apellido y parsea fecha+hora combinadas). Idempotente vía <code>id</code>.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Tabs value={tab} onValueChange={(v) => { setTab(v as 'csv' | 'json'); setResult(null); }}>
                                <TabsList>
                                    <TabsTrigger value="csv">CSV</TabsTrigger>
                                    <TabsTrigger value="json">JSON</TabsTrigger>
                                </TabsList>
                                <TabsContent value="csv" className="mt-4">
                                    <Textarea
                                        rows={10}
                                        placeholder={'id\tuser_id\tnombre\tapellido\tclase\tgym\tmaestro\tfecha_hora_clase\testatus\n9921\t77821\tMaría\tGonzález\tReformer\tLum\tAna R.\t2026-05-21 07:00:00\treservado'}
                                        value={text}
                                        onChange={(e) => { setText(e.target.value); setResult(null); }}
                                        className="font-mono text-xs"
                                    />
                                </TabsContent>
                                <TabsContent value="json" className="mt-4">
                                    <Textarea
                                        rows={10}
                                        placeholder={'[\n  { "sourceRef": "FP-9921", "displayName": "María González", "classLookup": { "date": "2026-05-21", "startTime": "07:00" }, "status": "reserved" }\n]'}
                                        value={text}
                                        onChange={(e) => { setText(e.target.value); setResult(null); }}
                                        className="font-mono text-xs"
                                    />
                                </TabsContent>
                            </Tabs>

                            {parsed.errors.length > 0 && (
                                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                                    <div className="flex items-center gap-2 font-medium text-destructive mb-2">
                                        <AlertTriangle className="w-4 h-4" /> Errores de parseo ({parsed.errors.length})
                                    </div>
                                    <ul className="list-disc pl-5 space-y-1 text-destructive/90">
                                        {parsed.errors.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}
                                        {parsed.errors.length > 8 && <li>… y {parsed.errors.length - 8} más</li>}
                                    </ul>
                                </div>
                            )}

                            {parsed.rows.length > 0 && (
                                <div className="rounded-md border p-3 text-sm space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="font-medium flex items-center gap-2">
                                            <FileText className="w-4 h-4" /> Vista previa ({parsed.rows.length} filas)
                                        </div>
                                        <Badge variant="secondary">
                                            {parsed.rows.filter((r) => r.status === 'cancelled').length} cancelaciones
                                        </Badge>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs">
                                            <thead className="text-muted-foreground">
                                                <tr className="text-left">
                                                    <th className="py-1 pr-3">sourceRef</th>
                                                    <th className="py-1 pr-3">Nombre</th>
                                                    <th className="py-1 pr-3">Clase</th>
                                                    <th className="py-1 pr-3">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {previewRows.map((r, i) => (
                                                    <tr key={i} className="border-t border-border/40">
                                                        <td className="py-1 pr-3 font-mono text-[10px]">{r.sourceRef || '—'}</td>
                                                        <td className="py-1 pr-3">{r.displayName}</td>
                                                        <td className="py-1 pr-3">
                                                            {r.classId
                                                                ? <span className="font-mono text-[10px]">{r.classId.slice(0, 8)}…</span>
                                                                : r.classLookup
                                                                    ? `${r.classLookup.date} ${r.classLookup.startTime}`
                                                                    : '—'}
                                                        </td>
                                                        <td className="py-1 pr-3">
                                                            <Badge variant={r.status === 'cancelled' ? 'destructive' : 'secondary'}>
                                                                {r.status}
                                                            </Badge>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {parsed.rows.length > previewRows.length && (
                                            <div className="text-muted-foreground pt-2">
                                                … y {parsed.rows.length - previewRows.length} filas más
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-end">
                                <Button
                                    onClick={() => importMutation.mutate(parsed.rows)}
                                    disabled={!canImport}
                                >
                                    {importMutation.isPending ? 'Importando…' : `Importar ${parsed.rows.length} fila(s)`}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {result && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2"><Check className="w-5 h-5" /> Resultado</CardTitle>
                                <CardDescription>
                                    {result.summary.total} fila(s) procesada(s) · {result.summary.created} creadas ·{' '}
                                    {result.summary.updated} actualizadas · {result.summary.cancelled} canceladas ·{' '}
                                    {result.summary.skipped} saltadas · <span className={result.summary.failed > 0 ? 'text-destructive font-medium' : ''}>{result.summary.failed} fallaron</span>
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead className="text-muted-foreground">
                                            <tr className="text-left">
                                                <th className="py-1 pr-3">#</th>
                                                <th className="py-1 pr-3">Resultado</th>
                                                <th className="py-1 pr-3">Booking</th>
                                                <th className="py-1 pr-3">Error</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {result.rows.map((r) => (
                                                <tr key={r.index} className="border-t border-border/40">
                                                    <td className="py-1 pr-3">{r.index + 1}</td>
                                                    <td className="py-1 pr-3">
                                                        <Badge variant={r.outcome === 'failed' ? 'destructive' : 'secondary'}>
                                                            {r.outcome}
                                                        </Badge>
                                                    </td>
                                                    <td className="py-1 pr-3 font-mono text-[10px]">
                                                        {r.bookingId ? `${r.bookingId.slice(0, 8)}…` : '—'}
                                                    </td>
                                                    <td className="py-1 pr-3 text-destructive/90">
                                                        {r.error ? `${r.error}${r.message ? ': ' + r.message : ''}` : r.reason || ''}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </AdminLayout>
        </AuthGuard>
    );
}
