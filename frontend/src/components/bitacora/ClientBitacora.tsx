// frontend/src/components/bitacora/ClientBitacora.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import api, { getErrorMessage } from '@/lib/api';

interface Asistencia {
  booking_id: string;
  class_name: string;
  class_date: string;
  class_time: string;
  facility_name: string | null;
  booked_at: string;
  booked_by_name: string | null;
  booked_by_role: string | null;
  checked_in_by_name: string | null;
  status: 'checked_in' | 'confirmed' | 'no_show';
  consumed_category: string | null;
}

interface Cancelacion {
  booking_id: string;
  class_name: string;
  class_date: string;
  class_time: string;
  facility_name: string | null;
  cancelled_at: string | null;
  cancelled_by_name: string | null;
  cancellation_reason: string | null;
  consumed_category: string | null;
}

// Etiqueta del crédito por categoría consumida/devuelta.
function catLabel(cat: string | null): string {
  return cat === 'reformer' ? 'reformer' : cat === 'multi' ? 'multi' : 'crédito';
}

interface AjusteCredito {
  id: string;
  description: string;
  old_data: Record<string, number | null>;
  new_data: Record<string, number | null> & { reason?: string | null };
  admin_name: string | null;
  created_at: string;
}

interface PeriodoMembresia {
  membership: {
    id: string;
    plan_name: string;
    start_date: string | null;
    end_date: string | null;
    status: string;
  };
  asistencias: Asistencia[];
  cancelaciones: Cancelacion[];
  ajustes_creditos: AjusteCredito[];
}

interface Props {
  clientId: string;
  clientName: string;
}

function formatDate(date: string | null): string {
  if (!date) return '—';
  return new Date(date + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Fecha + hora del MOMENTO de la acción (cuándo reservó / canceló), en hora de México.
function formatDateTime(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('es-MX', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City',
  });
}

function creditDelta(adj: AjusteCredito): string {
  const buckets: string[] = [];
  for (const key of ['reformer_remaining', 'multi_remaining', 'classes_remaining'] as const) {
    const prev = adj.old_data[key] ?? null;
    const next = adj.new_data[key] ?? null;
    if (prev === null || next === null) continue;
    const delta = next - prev;
    if (delta !== 0) {
      const label = key === 'reformer_remaining' ? 'reformer' : key === 'multi_remaining' ? 'multi' : 'clases';
      buckets.push(`${delta > 0 ? '+' : ''}${delta} ${label}`);
    }
  }
  return buckets.join(', ') || '(sin cambio)';
}

function PeriodoBlock({ periodo, defaultOpen }: { periodo: PeriodoMembresia; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const { membership: m, asistencias, cancelaciones, ajustes_creditos } = periodo;
  const totalAsistio = asistencias.filter(a => a.status === 'checked_in').length;
  const [asistAll, setAsistAll] = useState(false);
  const [cancelAll, setCancelAll] = useState(false);
  const CAP = 8; // mostramos las más recientes; "ver todas" despliega el resto

  return (
    <div className="border rounded-lg overflow-hidden mb-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/70 transition-colors text-left"
      >
        <div>
          <span className="font-medium text-sm">{m.plan_name}</span>
          <span className="text-xs text-muted-foreground ml-2">
            {m.start_date ? formatDate(m.start_date) : '—'} → {m.end_date ? formatDate(m.end_date) : 'sin vencimiento'}
          </span>
          <Badge
            variant={m.status === 'active' ? 'default' : 'secondary'}
            className="ml-2 text-[10px] h-4"
          >
            {m.status === 'active' ? 'activa' : m.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0 ml-2">
          {!open && (
            <span>{totalAsistio} asist · {cancelaciones.length} cancel · {ajustes_creditos.length} créditos</span>
          )}
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </button>

      {open && (
        <div className="divide-y">
          {/* Asistencias */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                ✅ Asistencias ({asistencias.length})
              </h4>
              {asistencias.length > CAP && (
                <button onClick={() => setAsistAll(v => !v)} className="text-[11px] text-balance-gold hover:underline shrink-0">
                  {asistAll ? 'Ver menos' : 'Ver todas'}
                </button>
              )}
            </div>
            {asistencias.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin asistencias en este período.</p>
            ) : (
              <ul className="space-y-2">
                {(asistAll ? asistencias : asistencias.slice(0, CAP)).map(a => (
                  <li key={a.booking_id} className="text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium">{a.class_name}</span>
                      <Badge variant={a.status === 'checked_in' ? 'default' : a.status === 'no_show' ? 'destructive' : 'secondary'} className="text-[10px] h-4 shrink-0">
                        {a.status === 'checked_in' ? 'asistió' : a.status === 'no_show' ? 'no asistió' : 'confirmada'}
                      </Badge>
                    </div>
                    <div className="text-muted-foreground mt-0.5">
                      {formatDate(a.class_date)} · {a.class_time?.slice(0,5)}
                      {a.facility_name && <span> · {a.facility_name}</span>}
                      {a.consumed_category && (
                        <span className="text-amber-700"> · usó 1 {catLabel(a.consumed_category)}</span>
                      )}
                    </div>
                    <div className="text-muted-foreground">
                      {/* Origen de la reserva: sin booked_by = importada de la migración (Fitune);
                          booked_by = la clienta = la hizo ella; si es staff, su nombre. */}
                      {a.booked_by_name == null ? (
                        <span className="inline-flex items-center rounded-full bg-violet-100 px-1.5 py-px text-[10px] font-medium text-violet-700">
                          Extracción de Fitune
                        </span>
                      ) : (
                        <>Agendó: {a.booked_by_role !== 'client' ? a.booked_by_name : 'ella misma'}{a.booked_at && <span> · reservó {formatDateTime(a.booked_at)}</span>}</>
                      )}
                      {a.checked_in_by_name
                        ? <span> · Check-in: {a.checked_in_by_name}</span>
                        : a.status === 'checked_in'
                          ? <span> · Check-in: ella misma (QR)</span>
                          : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Cancelaciones */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-red-600">
                ✗ Cancelaciones ({cancelaciones.length})
              </h4>
              {cancelaciones.length > CAP && (
                <button onClick={() => setCancelAll(v => !v)} className="text-[11px] text-balance-gold hover:underline shrink-0">
                  {cancelAll ? 'Ver menos' : 'Ver todas'}
                </button>
              )}
            </div>
            {cancelaciones.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin cancelaciones en este período.</p>
            ) : (
              <ul className="space-y-2">
                {(cancelAll ? cancelaciones : cancelaciones.slice(0, CAP)).map(c => (
                  <li key={c.booking_id} className="text-xs">
                    <div className="font-medium">{c.class_name}</div>
                    <div className="text-muted-foreground">
                      {formatDate(c.class_date)} · {c.class_time?.slice(0,5)}
                      {c.facility_name && <span> · {c.facility_name}</span>}
                    </div>
                    <div className="text-muted-foreground">
                      Canceló: {c.cancelled_by_name ?? 'ella misma'}{c.cancelled_at && <span> · {formatDateTime(c.cancelled_at)}</span>}
                      {c.cancellation_reason && <span> · "{c.cancellation_reason}"</span>}
                    </div>
                    {c.consumed_category ? (
                      /sin devoluci/i.test(c.cancellation_reason ?? '')
                        ? <div className="text-muted-foreground">No se devolvió el crédito.</div>
                        : <div className="text-emerald-700">↩ Devolvió 1 {catLabel(c.consumed_category)} (queda disponible para otra reserva).</div>
                    ) : (
                      <div className="text-muted-foreground">Sin crédito asociado (no descontó).</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Ajustes de créditos */}
          <div className="p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-2">
              💳 Ajustes de créditos ({ajustes_creditos.length})
            </h4>
            {ajustes_creditos.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin ajustes en este período.</p>
            ) : (
              <ul className="space-y-2">
                {ajustes_creditos.map(a => (
                  <li key={a.id} className="text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{creditDelta(a)}</span>
                      <span className="text-muted-foreground shrink-0">
                        {new Date(a.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      Por: {a.admin_name ?? 'sistema'}
                      {a.new_data?.reason && <span> · "{a.new_data.reason}"</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ClientBitacora({ clientId, clientName }: Props) {
  const { data, isLoading, error } = useQuery<PeriodoMembresia[]>({
    queryKey: ['client-bitacora', clientId],
    queryFn: async () => (await api.get(`/clients/${clientId}/bitacora`)).data,
    enabled: !!clientId,
  });

  if (isLoading) return (
    <div className="space-y-3 p-4">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-3/4" />
    </div>
  );

  if (error) return (
    <div className="p-4 text-sm text-red-600">Error al cargar bitácora: {getErrorMessage(error)}</div>
  );

  if (!data || data.length === 0) return (
    <div className="p-4 text-sm text-muted-foreground">Sin membresías registradas.</div>
  );

  return (
    <div className="p-4">
      <p className="text-xs text-muted-foreground mb-3">
        Actividad de {clientName} — agrupada por membresía, más reciente primero.
      </p>
      {data.map((periodo, idx) => (
        <PeriodoBlock key={periodo.membership.id} periodo={periodo} defaultOpen={idx === 0} />
      ))}
    </div>
  );
}
