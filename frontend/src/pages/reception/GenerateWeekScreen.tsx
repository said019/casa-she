import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { startOfWeek, addDays, format } from 'date-fns';
import api, { getErrorMessage } from '@/lib/api';
import { useIsElevated } from '@/hooks/useIsElevated';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { CalendarPlus, Loader2, ShieldAlert, Sparkles } from 'lucide-react';

type TemplateRow = {
  id: string;
  day_of_week: number; // 0=Dom .. 6=Sáb
  start_time: string;
  end_time: string;
  is_recurring: boolean;
  facility_id: string | null;
  class_type_name: string;
  class_type_color: string | null;
  instructor_name: string | null;
  facility_name: string | null;
};

const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Lun → Dom
const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : '');

/**
 * Recepción master: generar la semana de clases desde la plantilla (schedules),
 * para una sucursal o ambas. Espeja el "Generar semana" del admin. El backend
 * exige acceso elevado (admin o recepción master), así que la recepción normal
 * no puede aunque entre por URL.
 */
export default function ReceptionGenerateWeekScreen() {
  const elevated = useIsElevated();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const nextSunday = useMemo(
    () => startOfWeek(addDays(new Date(), 7), { weekStartsOn: 0 }),
    [],
  );
  const [startDate, setStartDate] = useState(format(nextSunday, 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(addDays(nextSunday, 6), 'yyyy-MM-dd'));
  const [facility, setFacility] = useState('all');

  const { data: facilities = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['facilities'],
    queryFn: async () => (await api.get('/facilities')).data,
    enabled: elevated,
  });
  const studios = useMemo(
    () =>
      facilities
        .filter((f) => /^casa sh/i.test(f.name))
        .map((f) => ({ id: f.id, name: f.name.replace(/^Casa Shé\s*/i, '').trim() || f.name })),
    [facilities],
  );

  // Plantilla semanal (lo que el generador usa). Permite ver QUÉ se va a crear.
  const { data: template = [] } = useQuery<TemplateRow[]>({
    queryKey: ['schedules-template'],
    queryFn: async () => (await api.get('/schedules')).data,
    enabled: elevated,
  });

  const planned = useMemo(
    () =>
      template
        .filter((s) => s.is_recurring)
        .filter((s) => facility === 'all' || s.facility_id === facility)
        .slice()
        .sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time)),
    [template, facility],
  );

  const byDay = useMemo(() => {
    const m = new Map<number, TemplateRow[]>();
    for (const s of planned) {
      const arr = m.get(s.day_of_week) ?? [];
      arr.push(s);
      m.set(s.day_of_week, arr);
    }
    return DAY_ORDER.filter((d) => m.has(d)).map((d) => ({ day: d, label: DAY_LABELS[d], items: m.get(d)! }));
  }, [planned]);

  // Estimado de cuántas clases caen en el rango (antes de descartar duplicados / días cerrados).
  const rangeEstimate = useMemo(() => {
    if (!startDate || !endDate || endDate < startDate || planned.length === 0) return 0;
    const perDow = new Map<number, number>();
    for (const s of planned) perDow.set(s.day_of_week, (perDow.get(s.day_of_week) ?? 0) + 1);
    let total = 0;
    const end = new Date(endDate + 'T00:00:00');
    for (const d = new Date(startDate + 'T00:00:00'); d <= end; d.setDate(d.getDate() + 1)) {
      total += perDow.get(d.getDay()) ?? 0;
    }
    return total;
  }, [planned, startDate, endDate]);

  const generate = useMutation({
    mutationFn: async () =>
      (
        await api.post('/classes/generate', {
          startDate,
          endDate,
          ...(facility !== 'all' ? { facilityId: facility } : {}),
        })
      ).data,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      toast({
        title: 'Semana generada',
        description: `${data?.count ?? 0} clases creadas desde la plantilla.`,
      });
    },
    onError: (err) =>
      toast({ variant: 'destructive', title: 'No se pudo generar', description: getErrorMessage(err) }),
  });

  if (!elevated) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
          <ShieldAlert className="h-8 w-8 text-warning" />
          <p>Solo la recepción master puede generar la semana de clases.</p>
        </CardContent>
      </Card>
    );
  }

  const facilityLabel =
    facility === 'all' ? 'ambas sucursales' : studios.find((s) => s.id === facility)?.name ?? 'la sucursal';
  const invalidRange = !startDate || !endDate || endDate < startDate;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card className="overflow-hidden border-balance-sand/65 bg-[hsl(var(--admin-panel))]">
        <CardContent className="space-y-6 p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.9rem] bg-balance-olive/12 text-balance-olive">
              <CalendarPlus className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-balance-dark">Generar semana</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Crea las clases del rango desde la plantilla semanal. No duplica las que ya existen ni
                genera en días cerrados.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="gen-start">Desde</Label>
              <Input
                id="gen-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gen-end">Hasta</Label>
              <Input
                id="gen-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Sucursal</Label>
            <Select value={facility} onValueChange={setFacility}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Ambas sucursales</SelectItem>
                {studios.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-[1rem] border border-balance-olive/16 bg-balance-cream/55 px-4 py-3 text-sm text-balance-dark/72">
            <Sparkles className="mr-1.5 inline h-4 w-4 text-balance-olive" />
            Se generará la plantilla para <strong>{facilityLabel}</strong>.
          </div>

          {/* Preview: qué horarios se van a generar */}
          <div className="rounded-[1.1rem] border border-balance-sand/70 bg-balance-cream/40 p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-balance-dark">Qué se va a generar</p>
              {planned.length > 0 && (
                <span className="shrink-0 rounded-full bg-balance-olive/12 px-2.5 py-0.5 text-[11px] font-semibold text-balance-olive">
                  {planned.length} por semana · ≈{rangeEstimate} en el rango
                </span>
              )}
            </div>

            {planned.length === 0 ? (
              <p className="py-3 text-center text-sm text-muted-foreground">
                No hay clases en la plantilla para {facilityLabel}. Pídele al admin que arme la plantilla
                semanal antes de generar.
              </p>
            ) : (
              <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                {byDay.map(({ day, label, items }) => (
                  <div key={day}>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-balance-dark/45">
                      {label}
                    </p>
                    <div className="space-y-1">
                      {items.map((s) => (
                        <div key={s.id} className="flex items-center gap-2 text-sm">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: s.class_type_color || '#7E8579' }}
                          />
                          <span className="tabular-nums font-medium text-balance-dark">{hhmm(s.start_time)}</span>
                          <span className="truncate text-balance-dark/80">{s.class_type_name}</span>
                          <span className="ml-auto shrink-0 truncate text-xs text-balance-dark/50">
                            {s.instructor_name || 'Coach'}
                            {facility === 'all' && s.facility_name
                              ? ` · ${s.facility_name.replace(/^Casa Shé\s*/i, '')}`
                              : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="mt-3 text-[11px] text-balance-dark/45">
              Estimado del rango; al generar se omiten los días cerrados y las clases que ya existan.
            </p>
          </div>

          <Button
            className="w-full rounded-full bg-balance-olive text-balance-cream hover:bg-balance-olive/90"
            disabled={generate.isPending || invalidRange || planned.length === 0}
            onClick={() => generate.mutate()}
          >
            {generate.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CalendarPlus className="mr-2 h-4 w-4" />
            )}
            Generar semana
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
