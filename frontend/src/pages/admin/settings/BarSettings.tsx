import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BarConfig {
  enabled: boolean;
  operating_hours: Record<number, { open: string; close: string } | null>;
  lead_time_max_hours: number;
  pickup_offset_minutes: number;
  cancellation_window_minutes: number;
  card_surcharge_percent: number;
  card_enabled: boolean;
  points_enabled: boolean;
  points_redemption_rate: number;
  preparing_push: boolean;
  prep_time_minutes: number;
}

const DEFAULT_CONFIG: BarConfig = {
  enabled: false,
  operating_hours: {
    0: null,
    1: { open: '07:00', close: '20:00' },
    2: { open: '07:00', close: '20:00' },
    3: { open: '07:00', close: '20:00' },
    4: { open: '07:00', close: '20:00' },
    5: { open: '07:00', close: '20:00' },
    6: { open: '08:00', close: '14:00' },
  },
  lead_time_max_hours: 4,
  pickup_offset_minutes: -2,
  cancellation_window_minutes: 60,
  card_surcharge_percent: 0,
  card_enabled: true,
  points_enabled: false,
  points_redemption_rate: 10,
  preparing_push: true,
  prep_time_minutes: 15,
};

const DAY_NAMES: Record<number, string> = {
  0: 'Domingo',
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function BarSettings() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<BarConfig>({
    queryKey: ['bar-config'],
    queryFn: async () => (await api.get('/settings/bar-config')).data,
  });

  const [form, setForm] = useState<BarConfig>({ ...DEFAULT_CONFIG });

  // Seed form once data arrives — spread full config for round-trip safety
  useEffect(() => {
    if (data) {
      setForm({ ...DEFAULT_CONFIG, ...data });
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async () =>
      (await api.put('/settings/bar-config', form)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bar-config'] });
      toast({ title: 'Configuración guardada', description: 'Los ajustes del Fuel Bar se actualizaron.' });
    },
    onError: () => {
      toast({
        title: 'Error al guardar',
        description: 'No se pudo guardar la configuración. Intenta de nuevo.',
        variant: 'destructive',
      });
    },
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  function setField<K extends keyof BarConfig>(key: K, value: BarConfig[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function setNumericField(key: keyof BarConfig, raw: string) {
    const n = Number(raw);
    if (!isNaN(n)) setForm(prev => ({ ...prev, [key]: n }));
  }

  function setDayOpen(day: number, open: boolean) {
    setForm(prev => ({
      ...prev,
      operating_hours: {
        ...prev.operating_hours,
        [day]: open
          ? (prev.operating_hours[day] ?? { open: '07:00', close: '20:00' })
          : null,
      },
    }));
  }

  function setDayTime(day: number, field: 'open' | 'close', value: string) {
    const current = form.operating_hours[day];
    if (!current) return;
    setForm(prev => ({
      ...prev,
      operating_hours: {
        ...prev.operating_hours,
        [day]: { ...current, [field]: value },
      },
    }));
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AuthGuard requiredRoles={['admin', 'super_admin']}>
      <AdminLayout>
        <div className="mx-auto max-w-2xl space-y-6 p-4">

          {/* Page heading */}
          <div>
            <h1 className="text-3xl font-heading font-bold" style={{ color: '#2A4E36' }}>
              Fuel Bar
            </h1>
            <p className="text-muted-foreground">
              Configura todos los aspectos de la barra de bebidas desde aquí.
            </p>
          </div>

          {/* ── Card: General ───────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading" style={{ color: '#2A4E36' }}>General</CardTitle>
              <CardDescription>Activa o desactiva la barra para las socias.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="font-medium">Barra abierta</Label>
                  <p className="text-sm text-muted-foreground">
                    Si está apagada, las socias no ven el Fuel Bar.
                  </p>
                </div>
                <Switch
                  checked={form.enabled}
                  onCheckedChange={v => setField('enabled', v)}
                  disabled={isLoading}
                />
              </div>
            </CardContent>
          </Card>

          {/* ── Card: Pagos ─────────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading" style={{ color: '#2A4E36' }}>Pagos</CardTitle>
              <CardDescription>Métodos de pago aceptados y recargos.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">

              {/* Tarjeta */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="font-medium">Pago con tarjeta</Label>
                  <p className="text-sm text-muted-foreground">
                    Permite que las socias paguen con tarjeta de crédito/débito.
                  </p>
                </div>
                <Switch
                  checked={form.card_enabled}
                  onCheckedChange={v => setField('card_enabled', v)}
                  disabled={isLoading}
                />
              </div>

              {/* Recargo tarjeta */}
              <div className="space-y-2">
                <Label htmlFor="card_surcharge_percent">Recargo por tarjeta (%)</Label>
                <Input
                  id="card_surcharge_percent"
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={form.card_surcharge_percent}
                  onChange={e => setNumericField('card_surcharge_percent', e.target.value)}
                  disabled={isLoading}
                  className="max-w-xs"
                />
                <p className="text-xs text-muted-foreground">0 = sin recargo.</p>
              </div>

              {/* Puntos */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="font-medium">Pago con puntos</Label>
                  <p className="text-sm text-muted-foreground">
                    Permite que las socias canjeen sus puntos de lealtad.
                  </p>
                </div>
                <Switch
                  checked={form.points_enabled}
                  onCheckedChange={v => setField('points_enabled', v)}
                  disabled={isLoading}
                />
              </div>

              {/* Tasa de puntos */}
              <div className="space-y-2">
                <Label htmlFor="points_redemption_rate">Tasa de canje de puntos (MXN por punto)</Label>
                <Input
                  id="points_redemption_rate"
                  type="number"
                  min={1}
                  step={1}
                  value={form.points_redemption_rate}
                  onChange={e => setNumericField('points_redemption_rate', e.target.value)}
                  disabled={isLoading}
                  className="max-w-xs"
                />
                <p className="text-xs text-muted-foreground">
                  10 = 1 punto vale $10 MXN. Debe ser mayor que 0.
                </p>
              </div>

            </CardContent>
          </Card>

          {/* ── Card: Recogida y cancelación ───────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading" style={{ color: '#2A4E36' }}>Recogida y cancelación</CardTitle>
              <CardDescription>
                Ventanas de tiempo, offset de recogida y notificaciones de preparación.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">

              {/* lead_time_max_hours */}
              <div className="space-y-2">
                <Label htmlFor="lead_time_max_hours">Anticipación máxima de pedido (horas)</Label>
                <Input
                  id="lead_time_max_hours"
                  type="number"
                  min={1}
                  max={48}
                  step={1}
                  value={form.lead_time_max_hours}
                  onChange={e => setNumericField('lead_time_max_hours', e.target.value)}
                  disabled={isLoading}
                  className="max-w-xs"
                />
                <p className="text-xs text-muted-foreground">
                  Cuánto tiempo antes de la recogida puede hacer el pedido la socia (1–48 h).
                </p>
              </div>

              {/* pickup_offset_minutes */}
              <div className="space-y-2">
                <Label htmlFor="pickup_offset_minutes">Offset de recogida (minutos)</Label>
                <Input
                  id="pickup_offset_minutes"
                  type="number"
                  step={1}
                  value={form.pickup_offset_minutes}
                  onChange={e => setNumericField('pickup_offset_minutes', e.target.value)}
                  disabled={isLoading}
                  className="max-w-xs"
                />
                <p className="text-xs text-muted-foreground">
                  Minutos respecto al fin de clase (negativo = lista antes de que termine la clase).
                </p>
              </div>

              {/* cancellation_window_minutes */}
              <div className="space-y-2">
                <Label htmlFor="cancellation_window_minutes">Ventana de cancelación (minutos)</Label>
                <Input
                  id="cancellation_window_minutes"
                  type="number"
                  min={0}
                  max={1440}
                  step={1}
                  value={form.cancellation_window_minutes}
                  onChange={e => setNumericField('cancellation_window_minutes', e.target.value)}
                  disabled={isLoading}
                  className="max-w-xs"
                />
                <p className="text-xs text-muted-foreground">
                  La socia puede cancelar solo si falta más de estos minutos para la recogida (0–1440).
                </p>
              </div>

              {/* prep_time_minutes */}
              <div className="space-y-2">
                <Label htmlFor="prep_time_minutes">Tiempo de preparación estimado (minutos)</Label>
                <Input
                  id="prep_time_minutes"
                  type="number"
                  min={1}
                  max={120}
                  step={1}
                  value={form.prep_time_minutes}
                  onChange={e => setNumericField('prep_time_minutes', e.target.value)}
                  disabled={isLoading}
                  className="max-w-xs"
                />
                <p className="text-xs text-muted-foreground">
                  Se usa en el copy de la notificación push de preparación (1–120 min).
                </p>
              </div>

              {/* preparing_push */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="font-medium">Push de preparación</Label>
                  <p className="text-sm text-muted-foreground">
                    Envía una notificación push a la socia cuando el pedido pasa a "preparando".
                  </p>
                </div>
                <Switch
                  checked={form.preparing_push}
                  onCheckedChange={v => setField('preparing_push', v)}
                  disabled={isLoading}
                />
              </div>

            </CardContent>
          </Card>

          {/* ── Card: Horario ───────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading" style={{ color: '#2A4E36' }}>Horario de operación</CardTitle>
              <CardDescription>
                Define los horarios por día de la semana. Desactiva un día para cerrarlo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[0, 1, 2, 3, 4, 5, 6].map(day => {
                const hours = form.operating_hours[day];
                const isOpen = hours !== null && hours !== undefined;
                return (
                  <div key={day} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="font-medium">{DAY_NAMES[day]}</Label>
                      <Switch
                        checked={isOpen}
                        onCheckedChange={v => setDayOpen(day, v)}
                        disabled={isLoading}
                      />
                    </div>
                    {isOpen && hours && (
                      <div className="grid grid-cols-2 gap-3 pl-1">
                        <div className="space-y-1">
                          <Label htmlFor={`open-${day}`} className="text-xs text-muted-foreground">
                            Abre
                          </Label>
                          <Input
                            id={`open-${day}`}
                            type="time"
                            value={hours.open}
                            onChange={e => setDayTime(day, 'open', e.target.value)}
                            disabled={isLoading}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`close-${day}`} className="text-xs text-muted-foreground">
                            Cierra
                          </Label>
                          <Input
                            id={`close-${day}`}
                            type="time"
                            value={hours.close}
                            onChange={e => setDayTime(day, 'close', e.target.value)}
                            disabled={isLoading}
                          />
                        </div>
                      </div>
                    )}
                    {!isOpen && (
                      <p className="pl-1 text-xs text-muted-foreground">Cerrado</p>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* ── Save button ─────────────────────────────────────────────────── */}
          <div className="flex justify-end pb-8">
            <Button
              onClick={() => save.mutate()}
              disabled={!data || save.isPending || isLoading}
              style={{ backgroundColor: '#2A4E36', color: '#fff' }}
            >
              {save.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>

        </div>
      </AdminLayout>
    </AuthGuard>
  );
}
