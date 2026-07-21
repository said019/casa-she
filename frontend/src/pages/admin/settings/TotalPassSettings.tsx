import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TotalPassStatus {
  is_enabled: boolean;
  has_partner_key: boolean;
  has_place_key: boolean;
  unit_id: string | null;
  place_name: string | null;
  token_expires_at: string | null;
}

interface TestResult {
  ok: boolean;
  placeName?: string;
  planId?: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TotalPassSettings() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<TotalPassStatus>({
    queryKey: ['totalpass-credentials'],
    queryFn: async () => (await api.get('/partners/totalpass')).data,
  });

  const [partnerApiKey, setPartnerApiKey] = useState('');
  const [placeApiKey, setPlaceApiKey] = useState('');
  const [unitId, setUnitId] = useState('');
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; planId?: number } | null>(null);

  // El unit_id sí se re-lee (no es secreto); las llaves nunca se releen — se
  // muestran vacías con placeholder "configurada ✓" cuando ya hay una guardada.
  useEffect(() => {
    if (data) setUnitId(data.unit_id ?? '');
  }, [data]);

  const save = useMutation({
    mutationFn: async () =>
      (await api.put('/partners/totalpass', {
        partner_api_key: partnerApiKey || undefined,
        place_api_key: placeApiKey || undefined,
        unit_id: unitId || undefined,
      })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['totalpass-credentials'] });
      setPartnerApiKey('');
      setPlaceApiKey('');
      setTestResult(null);
      toast({ title: 'Configuración guardada', description: 'Las credenciales de TotalPass se actualizaron.' });
    },
    onError: (err: any) => {
      toast({
        title: 'Error al guardar',
        description: err?.response?.data?.error || 'No se pudo guardar la configuración. Intenta de nuevo.',
        variant: 'destructive',
      });
    },
  });

  const testConnection = useMutation({
    mutationFn: async () => (await api.post('/partners/totalpass/test')).data as TestResult,
    onSuccess: (result) => {
      setTestResult({ ok: true, message: `Conexión exitosa: ${result.placeName || 'sin nombre'}`, planId: result.planId });
      qc.invalidateQueries({ queryKey: ['totalpass-credentials'] });
      toast({ title: 'Conexión exitosa', description: `Place: ${result.placeName || 'sin nombre'}` });
    },
    onError: (err: any) => {
      const message = err?.response?.data?.error || 'No se pudo probar la conexión.';
      setTestResult({ ok: false, message });
      toast({ title: 'Error de conexión', description: message, variant: 'destructive' });
    },
  });

  return (
    <AuthGuard requiredRoles={['admin', 'super_admin']}>
      <AdminLayout>
        <div className="mx-auto max-w-2xl space-y-6 p-4">

          {/* Page heading */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-heading font-bold" style={{ color: '#2A4E36' }}>
                TotalPass
              </h1>
              <p className="text-muted-foreground">
                Credenciales de la API oficial de TotalPass (Partner) para publicar clases.
              </p>
            </div>
            {!isLoading && data && (
              <Badge variant={data.is_enabled ? 'default' : 'secondary'}>
                {data.is_enabled ? 'Conectado' : 'Sin conectar'}
              </Badge>
            )}
          </div>

          {/* ── Card: Estado actual ─────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading" style={{ color: '#2A4E36' }}>Estado actual</CardTitle>
              <CardDescription>Lo que el backend tiene guardado hoy (los secretos nunca se muestran).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Partner API Key</span>
                <span>{data?.has_partner_key ? 'configurada ✓' : 'no configurada'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Place API Key</span>
                <span>{data?.has_place_key ? 'configurada ✓' : 'no configurada'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unit ID</span>
                <span>{data?.unit_id || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nombre del place</span>
                <span>{data?.place_name || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Token expira</span>
                <span>{data?.token_expires_at ? new Date(data.token_expires_at).toLocaleString('es-MX') : '—'}</span>
              </div>
            </CardContent>
          </Card>

          {/* ── Card: Credenciales ──────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading" style={{ color: '#2A4E36' }}>Credenciales</CardTitle>
              <CardDescription>
                Pega las llaves que TotalPass entregó para este estudio. Deja un campo vacío
                para conservar el valor ya guardado.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">

              <div className="space-y-2">
                <Label htmlFor="partner_api_key">Partner API Key</Label>
                <Input
                  id="partner_api_key"
                  type="password"
                  autoComplete="off"
                  placeholder={data?.has_partner_key ? 'configurada ✓ (deja vacío para no cambiarla)' : 'Pega la Partner API Key'}
                  value={partnerApiKey}
                  onChange={e => setPartnerApiKey(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="place_api_key">Place API Key</Label>
                <Input
                  id="place_api_key"
                  type="password"
                  autoComplete="off"
                  placeholder={data?.has_place_key ? 'configurada ✓ (deja vacío para no cambiarla)' : 'Pega la Place API Key'}
                  value={placeApiKey}
                  onChange={e => setPlaceApiKey(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="unit_id">Unit ID</Label>
                <Input
                  id="unit_id"
                  type="text"
                  placeholder="Identificador de la unidad/place en TotalPass"
                  value={unitId}
                  onChange={e => setUnitId(e.target.value)}
                  disabled={isLoading}
                />
              </div>

            </CardContent>
          </Card>

          {/* ── Card: Probar conexión ───────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading" style={{ color: '#2A4E36' }}>Probar conexión</CardTitle>
              <CardDescription>
                Llama a TotalPass con las credenciales guardadas y confirma el nombre del place.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                variant="outline"
                onClick={() => testConnection.mutate()}
                disabled={testConnection.isPending || isLoading}
              >
                {testConnection.isPending ? 'Probando...' : 'Probar conexión'}
              </Button>

              {testResult && (
                <p className={testResult.ok ? 'text-sm text-green-700' : 'text-sm text-destructive'}>
                  {testResult.message}
                  {testResult.ok && testResult.planId ? ` · Plan ID: ${testResult.planId}` : ''}
                </p>
              )}
            </CardContent>
          </Card>

          {/* ── Save button ─────────────────────────────────────────────────── */}
          <div className="flex justify-end pb-8">
            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending || isLoading || (!partnerApiKey && !placeApiKey && unitId === (data?.unit_id ?? ''))}
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
