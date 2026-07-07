import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';
import { useState, useEffect } from 'react';

export default function BarSettings() {
  const qc = useQueryClient(); const { toast } = useToast();
  const { data } = useQuery({ queryKey: ['bar-config'], queryFn: async () => (await api.get('/settings/bar-config')).data });
  const [enabled, setEnabled] = useState(false);
  useEffect(() => { if (data) setEnabled(!!data.enabled); }, [data]);
  const save = useMutation({
    mutationFn: async () => (await api.put('/settings/bar-config', { ...data, enabled })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bar-config'] }); toast({ title: 'Barra actualizada' }); },
  });
  return (
    <AuthGuard requiredRoles={['admin','super_admin']}><AdminLayout>
      <div className="mx-auto max-w-2xl space-y-6 p-4">
        <Card>
          <CardHeader><CardTitle className="font-heading text-balance-olive">Barra de bebidas</CardTitle>
            <CardDescription>Enciende la barra cuando estés lista para recibir pedidos.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div><p className="font-medium">Barra abierta</p>
                <p className="text-sm text-muted-foreground">Si está apagada, las socias no ven el Fuel Bar.</p></div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
            <Button onClick={() => save.mutate()} disabled={save.isPending} style={{ backgroundColor: '#2A4E36' }}>
              {save.isPending ? 'Guardando…' : 'Guardar'}</Button>
          </CardContent>
        </Card>
      </div>
    </AdminLayout></AuthGuard>
  );
}
