import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, ArrowDownCircle, ArrowUpCircle, XCircle, AlertTriangle, Wallet } from 'lucide-react';

import api, { getErrorMessage } from '@/lib/api';
import { useOpenCaja } from '@/hooks/useOpenCaja';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CashShift {
  id: string;
  facility_id: string;
  opening_float: number;
  opened_at: string;
  status: string;
}

interface ByMethod {
  method: string;
  total: number;
}

interface ShiftTotals {
  cashSales: number;
  cashIn: number;
  cashOut: number;
  cashEgresos: number;
  byMethod: ByMethod[];
}

interface CurrentShiftResponse {
  shift: CashShift | null;
  totals?: ShiftTotals;
}

interface CorteResult {
  shift: CashShift & {
    expected_cash: number;
    counted_cash: number;
    difference: number;
  };
  totals: ShiftTotals;
}

// Respuesta del backend cuando la diferencia requiere nota (código NOTE_REQUIRED)
interface NoteRequiredPayload {
  expected: number;
  counted: number;
  difference: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

const methodLabel: Record<string, string> = {
  cash: 'Efectivo',
  efectivo: 'Efectivo',
  card: 'Tarjeta',
  tarjeta: 'Tarjeta',
  transfer: 'Transferencia',
  transferencia: 'Transferencia',
  gratis: 'Gratis (cortesía)',
};

function formatMethod(method: string): string {
  return methodLabel[method.toLowerCase()] ?? method;
}

function getApiErrorCode(error: unknown): string | null {
  if (
    error &&
    typeof error === 'object' &&
    'response' in error &&
    (error as any).response?.data?.code
  ) {
    return (error as any).response.data.code as string;
  }
  return null;
}

function getApiErrorData(error: unknown): Record<string, any> | null {
  if (
    error &&
    typeof error === 'object' &&
    'response' in error &&
    (error as any).response?.data
  ) {
    return (error as any).response.data as Record<string, any>;
  }
  return null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Dialog: Movimiento de efectivo */
function MovimientoDialog({ shiftId }: { shiftId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<'cash_in' | 'cash_out'>('cash_in');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api
        .post(`/cash-shifts/${shiftId}/movement`, {
          type,
          amount: Number(amount),
          reason,
        })
        .then((r) => r.data),
    onSuccess: () => {
      toast.success('Movimiento registrado');
      queryClient.invalidateQueries({ queryKey: ['cash-current'] });
      setOpen(false);
      setAmount('');
      setReason('');
      setType('cash_in');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <ArrowDownCircle className="h-4 w-4" />
          Movimiento de efectivo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Movimiento de efectivo</DialogTitle>
          <DialogDescription>Registra una entrada o salida de efectivo.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as 'cash_in' | 'cash_out')}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo de movimiento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash_in">Entrada</SelectItem>
                <SelectItem value="cash_out">Salida</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mov-amount">Monto (MXN)</Label>
            <Input
              id="mov-amount"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mov-reason">Motivo</Label>
            <Input
              id="mov-reason"
              placeholder="Ej. compra de suministros"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !amount || !reason}
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Dialog: Cerrar caja — con manejo de NOTE_REQUIRED (control D) */
function CerrarCajaDialog({ shift, expectedCash }: { shift: CashShift; expectedCash: number }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [countedCash, setCountedCash] = useState('');
  const [notes, setNotes] = useState('');
  const [corte, setCorte] = useState<CorteResult | null>(null);

  // Control D: cuando el backend exige nota por diferencia material
  const [noteRequired, setNoteRequired] = useState<NoteRequiredPayload | null>(null);

  // Diferencia proactiva en tiempo real (contado − esperado del turno actual)
  const liveCountedNum = Number(countedCash) || 0;
  const liveDiff = countedCash !== '' ? liveCountedNum - expectedCash : null;
  // Umbral del backend: $50 MXN
  const NOTE_THRESHOLD = 50;
  const liveDiffRequiresNote =
    liveDiff !== null && Math.abs(liveDiff) > NOTE_THRESHOLD;

  const mutation = useMutation({
    mutationFn: () =>
      api
        .post(`/cash-shifts/${shift.id}/close`, {
          counted_cash: Number(countedCash),
          notes: notes || undefined,
        })
        .then((r): CorteResult => r.data),
    onSuccess: (data) => {
      setCorte(data);
      setNoteRequired(null);
      queryClient.invalidateQueries({ queryKey: ['cash-current'] });
    },
    onError: (e) => {
      const code = getApiErrorCode(e);
      // D: diferencia material sin nota — el backend devuelve 400 NOTE_REQUIRED
      if (code === 'NOTE_REQUIRED') {
        const data = getApiErrorData(e);
        setNoteRequired({
          expected: data?.expected ?? expectedCash,
          counted: data?.counted ?? Number(countedCash),
          difference: data?.difference ?? 0,
        });
        return;
      }
      toast.error(getErrorMessage(e));
    },
  });

  const diff = corte?.shift.difference ?? 0;
  const diffColor =
    diff === 0
      ? 'text-green-600'
      : diff > 0
      ? 'text-amber-600'
      : 'text-red-600';
  const diffLabel =
    diff === 0 ? 'Cuadrado' : diff > 0 ? 'Sobrante' : 'Faltante';

  // Color de la diferencia en tiempo real
  function liveDiffColor(d: number) {
    if (d === 0) return 'text-green-600';
    if (d > 0) return 'text-amber-600';
    return 'text-red-600';
  }
  function liveDiffLabel(d: number) {
    if (d === 0) return 'Cuadrado';
    if (d > 0) return `Sobrante ${mxn.format(d)}`;
    return `Faltante ${mxn.format(Math.abs(d))}`;
  }

  // Color para la diferencia del error NOTE_REQUIRED
  function noteRequiredDiffColor(d: number) {
    if (d === 0) return 'text-green-600';
    if (d > 0) return 'text-amber-600';
    return 'text-red-600';
  }

  function handleClose() {
    setOpen(false);
    setCorte(null);
    setNoteRequired(null);
    setCountedCash('');
    setNotes('');
  }

  // Determina si el botón de cerrar turno está habilitado:
  // si hay diferencia material (ya sea detectada proactivamente o por NOTE_REQUIRED),
  // la nota es obligatoria.
  const noteIsRequired = liveDiffRequiresNote || !!noteRequired;
  const canClose = !!countedCash && (!noteIsRequired || notes.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
      <DialogTrigger asChild>
        <Button variant="destructive" className="gap-2">
          <XCircle className="h-4 w-4" />
          Cerrar caja
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {!corte ? (
          <>
            <DialogHeader>
              <DialogTitle>Cerrar caja</DialogTitle>
              <DialogDescription>
                Ingresa el efectivo contado físicamente para cerrar el turno.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="counted-cash">Efectivo contado (MXN)</Label>
                <Input
                  id="counted-cash"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={countedCash}
                  onChange={(e) => {
                    setCountedCash(e.target.value);
                    // Limpiar el estado de NOTE_REQUIRED si el usuario corrige el monto
                    if (noteRequired) setNoteRequired(null);
                  }}
                />
              </div>

              {/* Diferencia en tiempo real (proactiva) */}
              {liveDiff !== null && (
                <div className="rounded-md border bg-muted/40 p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Efectivo esperado</span>
                    <span className="font-medium">{mxn.format(expectedCash)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Efectivo contado</span>
                    <span className="font-medium">{mxn.format(liveCountedNum)}</span>
                  </div>
                  <Separator className="my-1" />
                  <div className={`flex justify-between font-semibold ${liveDiffColor(liveDiff)}`}>
                    <span>{liveDiff === 0 ? 'Cuadrado' : liveDiff > 0 ? 'Sobrante' : 'Faltante'}</span>
                    <span>{liveDiffLabel(liveDiff)}</span>
                  </div>
                </div>
              )}

              {/* Alerta NOTE_REQUIRED: diferencia detectada por el backend */}
              {noteRequired && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-1 text-sm">
                  <div className="flex items-center gap-2 font-semibold text-amber-800 mb-1">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Diferencia detectada — se requiere nota
                  </div>
                  <div className="flex justify-between text-amber-700">
                    <span>Esperado</span>
                    <span>{mxn.format(noteRequired.expected)}</span>
                  </div>
                  <div className="flex justify-between text-amber-700">
                    <span>Contado</span>
                    <span>{mxn.format(noteRequired.counted)}</span>
                  </div>
                  <div className={`flex justify-between font-semibold ${noteRequiredDiffColor(noteRequired.difference)}`}>
                    <span>{noteRequired.difference >= 0 ? 'Sobrante' : 'Faltante'}</span>
                    <span>{mxn.format(Math.abs(noteRequired.difference))}</span>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="close-notes">
                  Notas{noteIsRequired && (
                    <span className="text-destructive ml-1">* requerida por diferencia</span>
                  )}
                </Label>
                <Input
                  id="close-notes"
                  placeholder={noteIsRequired ? 'Explica el faltante o sobrante…' : 'Observaciones del cierre (opcional)'}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={noteIsRequired && !notes.trim() ? 'border-destructive focus-visible:ring-destructive' : ''}
                />
                {noteIsRequired && !notes.trim() && (
                  <p className="text-xs text-destructive">
                    La diferencia de {liveDiff !== null ? mxn.format(Math.abs(liveDiff)) : mxn.format(Math.abs(noteRequired?.difference ?? 0))} requiere una justificación para poder cerrar.
                  </p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || !canClose}
              >
                {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Cerrar turno
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Corte de caja</DialogTitle>
              <DialogDescription>Resumen del turno cerrado.</DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Efectivo esperado</span>
                <span className="font-medium">{mxn.format(corte.shift.expected_cash)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Efectivo contado</span>
                <span className="font-medium">{mxn.format(corte.shift.counted_cash)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-sm font-semibold">
                <span>{diffLabel}</span>
                <span className={diffColor}>{mxn.format(Math.abs(diff))}</span>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>Aceptar</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CajaScreen() {
  const queryClient = useQueryClient();
  const [openingFloat, setOpeningFloat] = useState('');

  const { data, isLoading } = useQuery<CurrentShiftResponse>({
    queryKey: ['cash-current'],
    queryFn: () => api.get('/cash-shifts/current').then((r) => r.data),
  });

  const { elevated, facilities, facilityId, setFacilityId, openMutation, needsFacility } =
    useOpenCaja(() => setOpeningFloat(''));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const shift = data?.shift ?? null;
  const totals = data?.totals;

  // ── No open shift ────────────────────────────────────────────────────────────
  if (!shift) {
    return (
      <div className="p-4 md:p-6 space-y-5 max-w-2xl mx-auto">
        {/* Hero: estado sin turno */}
        <div className="relative overflow-hidden rounded-[1.75rem] border border-[#DCCCC0]/70 bg-gradient-to-br from-[#FBF3EC] via-[#F7ECE0] to-[#F1E2D2] p-5 sm:p-6 shadow-[0_24px_60px_-46px_rgba(51,42,34,0.55)]">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Sin turno
          </span>
          <h1 className="mt-3 font-heading text-3xl font-bold text-[#2A2118]">Caja</h1>
          <p className="mt-1 text-sm text-[#6B554D]">No hay turno abierto.</p>
        </div>

        {/* Panel: abrir caja */}
        <div className="rounded-[1.5rem] border border-[#DCCCC0]/70 bg-white p-5 shadow-[0_20px_58px_-52px_rgba(51,42,34,0.5)]">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#AD6C20]">
            <Wallet className="h-4 w-4" /> Abrir caja
          </div>
          <p className="mt-1.5 text-sm text-[#6B554D]">Ingresa el fondo inicial en efectivo para abrir el turno.</p>
          <div className="mt-4 space-y-4">
            {elevated && (
              <div className="space-y-2">
                <Label className="text-[#6B554D]">Sucursal</Label>
                <Select value={facilityId} onValueChange={setFacilityId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Elige la sucursal" />
                  </SelectTrigger>
                  <SelectContent>
                    {facilities.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {needsFacility && (
                  <p className="text-xs text-amber-600">Elige una sucursal para abrir la caja.</p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="opening-float" className="text-[#6B554D]">Fondo inicial (MXN)</Label>
              <Input
                id="opening-float"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={openingFloat}
                onChange={(e) => setOpeningFloat(e.target.value)}
              />
            </div>
            <Button
              className="w-full"
              onClick={() => openMutation.mutate(Number(openingFloat))}
              disabled={openMutation.isPending || !openingFloat || needsFacility}
            >
              {openMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Abrir caja
            </Button>
          </div>
        </div>

        <MyShiftsHistory />
      </div>
    );
  }

  // ── Shift open ───────────────────────────────────────────────────────────────
  const expectedCash =
    (shift.opening_float ?? 0) +
    (totals?.cashSales ?? 0) +
    (totals?.cashIn ?? 0) -
    (totals?.cashOut ?? 0);

  const openedAtFormatted = shift.opened_at
    ? format(parseISO(shift.opened_at), "EEE d MMM 'a las' HH:mm", { locale: es })
    : '—';

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-2xl mx-auto">
      {/* Hero: estado del turno + efectivo esperado como número protagonista */}
      <div className="relative overflow-hidden rounded-[1.75rem] border border-[#DCCCC0]/70 bg-gradient-to-br from-[#FBF3EC] via-[#F7ECE0] to-[#F1E2D2] p-5 sm:p-6 shadow-[0_24px_60px_-46px_rgba(51,42,34,0.55)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Turno abierto
            </span>
            <h1 className="mt-3 font-heading text-3xl font-bold text-[#2A2118]">Caja</h1>
            <p className="mt-1 text-sm text-[#6B554D]">Abierta {openedAtFormatted}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <MovimientoDialog shiftId={shift.id} />
            {/* Se pasa expectedCash al dialog para el cálculo proactivo de diferencia */}
            <CerrarCajaDialog shift={shift} expectedCash={expectedCash} />
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-white/70 bg-white/70 px-5 py-4 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#AD6C20]">
            <Wallet className="h-4 w-4" /> Efectivo esperado en caja
          </div>
          <p className="mt-1.5 font-heading text-[2.5rem] leading-none font-bold tabular-nums text-[#2A2118]">
            {mxn.format(expectedCash)}
          </p>
        </div>
      </div>

      {/* Desglose del turno */}
      <div className="rounded-[1.5rem] border border-[#DCCCC0]/70 bg-white p-5 shadow-[0_20px_58px_-52px_rgba(51,42,34,0.5)]">
        <p className="text-sm font-semibold text-[#2A2118]">Resumen del turno</p>
        <div className="mt-3.5 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[#6B554D]">Fondo inicial</span>
            <span className="font-semibold tabular-nums text-[#2A2118]">{mxn.format(shift.opening_float ?? 0)}</span>
          </div>

          {totals && (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-[#6B554D]">
                  <ArrowDownCircle className="h-4 w-4 text-emerald-600" /> Ventas efectivo
                </span>
                <span className="font-semibold tabular-nums text-emerald-700">{mxn.format(totals.cashSales)}</span>
              </div>
              {totals.cashIn > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-[#6B554D]">
                    <ArrowDownCircle className="h-4 w-4 text-emerald-600" /> Entradas
                  </span>
                  <span className="font-semibold tabular-nums text-emerald-700">{mxn.format(totals.cashIn)}</span>
                </div>
              )}
              {totals.cashOut > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-[#6B554D]">
                    <ArrowUpCircle className="h-4 w-4 text-rose-500" /> Salidas
                  </span>
                  <span className="font-semibold tabular-nums text-rose-600">−{mxn.format(totals.cashOut)}</span>
                </div>
              )}
            </>
          )}

          <div className="my-1 h-px bg-[#DCCCC0]/60" />

          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[#2A2118]">Efectivo esperado</span>
            <span className="font-heading text-lg font-bold tabular-nums text-[#AD6C20]">{mxn.format(expectedCash)}</span>
          </div>
        </div>
      </div>

      {/* Ventas por método de pago */}
      {totals?.byMethod && totals.byMethod.length > 0 && (
        <div className="rounded-[1.5rem] border border-[#DCCCC0]/70 bg-white p-5 shadow-[0_20px_58px_-52px_rgba(51,42,34,0.5)]">
          <p className="text-sm font-semibold text-[#2A2118]">Ventas por método de pago</p>
          <div className="mt-3 space-y-2">
            {totals.byMethod.map((bm) => (
              <div key={bm.method} className="flex items-center justify-between rounded-xl bg-[#FBF3EC]/70 px-3 py-2 text-sm">
                <span className="text-[#6B554D]">{formatMethod(bm.method)}</span>
                <span className="font-semibold tabular-nums text-[#2A2118]">{mxn.format(bm.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ventas del turno (historial: qué se vendió) */}
      <ShiftSales shiftId={shift.id} />

      {/* Historial de mis cajas pasadas */}
      <MyShiftsHistory />
    </div>
  );
}

interface MyShift {
  id: string;
  status: string;
  opened_at: string;
  closed_at: string | null;
  opening_float: number | string | null;
  expected_cash: number | string | null;
  counted_cash: number | string | null;
  difference: number | string | null;
  facility_name: string | null;
}

/** Historial de las cajas que YO abrí (turnos cerrados), cada uno expandible a sus ventas. */
function MyShiftsHistory() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data: shifts = [], isLoading } = useQuery<MyShift[]>({
    queryKey: ['my-shifts'],
    queryFn: async () => (await api.get('/cash-shifts/mine')).data,
  });
  const closed = shifts.filter((s) => s.status === 'closed');

  return (
    <div className="rounded-[1.5rem] border border-[#DCCCC0]/70 bg-white p-5 shadow-[0_20px_58px_-52px_rgba(51,42,34,0.5)]">
      <p className="text-sm font-semibold text-[#2A2118]">Historial de mis cajas</p>
      {isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">Cargando…</p>
      ) : closed.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Aún no tienes cortes anteriores.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {closed.map((s) => {
            const diff = s.difference == null ? null : Number(s.difference);
            const isOpen = expanded === s.id;
            return (
              <li key={s.id} className="rounded-xl border border-[#DCCCC0]/50">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : s.id)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#2A2118]">
                      {format(parseISO(s.opened_at), "d MMM yyyy", { locale: es })}
                      {s.facility_name ? ` · ${s.facility_name}` : ''}
                    </p>
                    <p className="text-xs text-[#6B554D]">
                      {format(parseISO(s.opened_at), 'HH:mm', { locale: es })}
                      {s.closed_at ? `–${format(parseISO(s.closed_at), 'HH:mm', { locale: es })}` : ''}
                      {' · contado '}{mxn.format(Number(s.counted_cash ?? 0))}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-2">
                    {diff !== null && diff !== 0 && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${diff < 0 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'}`}>
                        {diff < 0 ? 'Faltó ' : 'Sobró '}{mxn.format(Math.abs(diff))}
                      </span>
                    )}
                    <span className="text-xs text-[#AD6C20]">{isOpen ? 'Ocultar' : 'Ver ventas'}</span>
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-[#DCCCC0]/50 p-3">
                    <ShiftSales shiftId={s.id} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface ShiftSale {
  tipo: 'producto' | 'membresía';
  id: string;
  monto: number | string;
  metodo: string;
  created_at: string;
  vendedor: string;
  detalle: string;
  cliente: string | null;
}

/** Historial de ventas del turno (productos + membresías). Mobile-first: tarjetas, no tabla. */
function ShiftSales({ shiftId }: { shiftId: string }) {
  const { data: sales = [], isLoading } = useQuery<ShiftSale[]>({
    queryKey: ['shift-sales', shiftId],
    queryFn: async () => (await api.get(`/cash-shifts/${shiftId}/sales`)).data,
    refetchInterval: 30_000,
  });

  return (
    <div className="rounded-[1.5rem] border border-[#DCCCC0]/70 bg-white p-5 shadow-[0_20px_58px_-52px_rgba(51,42,34,0.5)]">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-[#2A2118]">Ventas del turno</p>
        {sales.length > 0 && (
          <span className="text-xs text-[#6B554D] tabular-nums">{sales.length} venta{sales.length === 1 ? '' : 's'}</span>
        )}
      </div>
      {isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">Cargando…</p>
      ) : sales.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Sin ventas en este turno todavía.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {sales.map((s) => (
            <li key={`${s.tipo}-${s.id}`} className="rounded-xl border border-[#DCCCC0]/50 bg-[#FBF3EC]/40 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase ${s.tipo === 'membresía' ? 'bg-[#E9C5BE] text-[#2A2118]' : 'bg-emerald-100 text-emerald-700'}`}>
                      {s.tipo === 'membresía' ? 'Membresía' : 'Producto'}
                    </span>
                    <span className="truncate text-sm font-medium text-[#2A2118]">{s.detalle}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-[#6B554D]">
                    {s.cliente ? `${s.cliente} · ` : ''}{formatMethod(s.metodo)}
                    {s.vendedor ? ` · ${s.vendedor}` : ''}
                    {' · '}
                    {new Date(s.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums text-[#2A2118]">{mxn.format(Number(s.monto))}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
