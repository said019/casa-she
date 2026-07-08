import { useState } from 'react';
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

interface BarExtra {
  id: string;
  name: string;
  group_label: string;
  is_single: boolean;
  price_mxn: number;
  sort_order: number;
  is_active: boolean;
}

interface CreateExtraPayload {
  name: string;
  group_label: string;
  is_single: boolean;
  price_mxn: number;
  sort_order?: number;
  is_active?: boolean;
}

interface UpdateExtraPayload {
  name?: string;
  group_label?: string;
  is_single?: boolean;
  price_mxn?: number;
  sort_order?: number;
  is_active?: boolean;
}

const EMPTY_FORM: CreateExtraPayload = {
  name: '',
  group_label: '',
  is_single: false,
  price_mxn: 0,
  sort_order: 0,
  is_active: true,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function BarExtras() {
  const qc = useQueryClient();
  const { toast } = useToast();

  // ── Fetch all extras (admin view, incl. inactive) ─────────────────────────
  const { data: extras = [], isLoading } = useQuery<BarExtra[]>({
    queryKey: ['bar-extras-admin'],
    queryFn: async () => (await api.get('/bar/extras?all=1')).data,
  });

  // ── Create form state ─────────────────────────────────────────────────────
  const [form, setForm] = useState<CreateExtraPayload>({ ...EMPTY_FORM });
  const [rawPrice, setRawPrice] = useState<string>('0');

  // ── Edit state ────────────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<UpdateExtraPayload & { name: string; group_label: string; price_mxn: number }>({
    name: '',
    group_label: '',
    is_single: false,
    price_mxn: 0,
    sort_order: 0,
    is_active: true,
  });
  const [editRawPrice, setEditRawPrice] = useState<string>('0');

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (payload: CreateExtraPayload) =>
      (await api.post('/bar/extras', payload)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bar-extras-admin'] });
      setForm({ ...EMPTY_FORM });
      setRawPrice('0');
      toast({ title: 'Extra creado', description: 'El extra se agregó al catálogo.' });
    },
    onError: () => {
      toast({
        title: 'Error al crear',
        description: 'No se pudo crear el extra. Intenta de nuevo.',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: UpdateExtraPayload }) =>
      (await api.put(`/bar/extras/${id}`, payload)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bar-extras-admin'] });
      setEditingId(null);
      toast({ title: 'Extra actualizado', description: 'Los cambios se guardaron correctamente.' });
    },
    onError: () => {
      toast({
        title: 'Error al actualizar',
        description: 'No se pudo guardar el extra. Intenta de nuevo.',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/bar/extras/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bar-extras-admin'] });
      toast({ title: 'Extra eliminado', description: 'El extra fue removido del catálogo.' });
    },
    onError: () => {
      toast({
        title: 'Error al eliminar',
        description: 'No se pudo eliminar el extra. Intenta de nuevo.',
        variant: 'destructive',
      });
    },
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  function groupExtras(list: BarExtra[]): Record<string, BarExtra[]> {
    return list.reduce<Record<string, BarExtra[]>>((acc, extra) => {
      const key = extra.group_label || 'Sin grupo';
      if (!acc[key]) acc[key] = [];
      acc[key].push(extra);
      return acc;
    }, {});
  }

  function handleCreate() {
    const price = parseFloat(rawPrice);
    if (!form.name.trim() || !form.group_label.trim()) {
      toast({
        title: 'Campos requeridos',
        description: 'Nombre y grupo son obligatorios.',
        variant: 'destructive',
      });
      return;
    }
    createMutation.mutate({
      ...form,
      price_mxn: isNaN(price) ? 0 : price,
    });
  }

  function startEdit(extra: BarExtra) {
    setEditingId(extra.id);
    setEditForm({
      name: extra.name,
      group_label: extra.group_label,
      is_single: extra.is_single,
      price_mxn: extra.price_mxn,
      sort_order: extra.sort_order,
      is_active: extra.is_active,
    });
    setEditRawPrice(String(extra.price_mxn));
  }

  function handleUpdate(id: string) {
    const price = parseFloat(editRawPrice);
    updateMutation.mutate({
      id,
      payload: {
        ...editForm,
        price_mxn: isNaN(price) ? 0 : price,
      },
    });
  }

  function handleDelete(id: string) {
    if (!window.confirm('¿Eliminar este extra del catálogo? Esta acción no se puede deshacer.')) return;
    deleteMutation.mutate(id);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const grouped = groupExtras(extras);
  const groupKeys = Object.keys(grouped).sort();

  return (
    <AuthGuard requiredRoles={['admin', 'super_admin']}>
      <AdminLayout>
        <div className="mx-auto max-w-2xl space-y-6 p-4">

          {/* Page heading */}
          <div>
            <h1 className="text-3xl font-heading font-bold" style={{ color: '#2A4E36' }}>
              Extras (barra)
            </h1>
            <p className="text-muted-foreground">
              Administra los extras del Fuel Bar: tipos de leche, add-ons y otros complementos.
            </p>
          </div>

          {/* ── Card: Agregar extra ─────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading" style={{ color: '#2A4E36' }}>Agregar extra</CardTitle>
              <CardDescription>Crea un nuevo complemento para el catálogo de la barra.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="new-name">Nombre</Label>
                  <Input
                    id="new-name"
                    placeholder="Ej. Leche de avena"
                    value={form.name}
                    onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-group">Grupo</Label>
                  <Input
                    id="new-group"
                    placeholder="Ej. Tipo de leche"
                    value={form.group_label}
                    onChange={e => setForm(prev => ({ ...prev, group_label: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="new-price">Precio (MXN)</Label>
                  <Input
                    id="new-price"
                    type="number"
                    min={0}
                    step={0.5}
                    placeholder="0"
                    value={rawPrice}
                    onChange={e => setRawPrice(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-sort">Orden</Label>
                  <Input
                    id="new-sort"
                    type="number"
                    min={0}
                    step={1}
                    placeholder="0"
                    value={form.sort_order ?? 0}
                    onChange={e => setForm(prev => ({ ...prev, sort_order: Number(e.target.value) }))}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-6">
                <div className="flex items-center gap-3">
                  <Switch
                    id="new-single"
                    checked={form.is_single}
                    onCheckedChange={v => setForm(prev => ({ ...prev, is_single: v }))}
                  />
                  <div className="space-y-0.5">
                    <Label htmlFor="new-single" className="font-medium">Elige una</Label>
                    <p className="text-xs text-muted-foreground">Solo se puede elegir un extra de este grupo.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    id="new-active"
                    checked={form.is_active ?? true}
                    onCheckedChange={v => setForm(prev => ({ ...prev, is_active: v }))}
                  />
                  <div className="space-y-0.5">
                    <Label htmlFor="new-active" className="font-medium">Activo</Label>
                    <p className="text-xs text-muted-foreground">Visible para las socias.</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleCreate}
                  disabled={createMutation.isPending}
                  style={{ backgroundColor: '#2A4E36', color: '#fff' }}
                >
                  {createMutation.isPending ? 'Creando...' : 'Agregar extra'}
                </Button>
              </div>

            </CardContent>
          </Card>

          {/* ── Card: Catálogo de extras ─────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading" style={{ color: '#2A4E36' }}>Catálogo</CardTitle>
              <CardDescription>
                Extras agrupados por categoría. Los inactivos aparecen atenuados.
              </CardDescription>
            </CardHeader>
            <CardContent>

              {isLoading && (
                <p className="text-sm text-muted-foreground">Cargando extras...</p>
              )}

              {!isLoading && extras.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No hay extras configurados. Usa el formulario de arriba para agregar el primero.
                </p>
              )}

              {!isLoading && groupKeys.length > 0 && (
                <div className="space-y-8">
                  {groupKeys.map(group => (
                    <div key={group}>
                      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {group}
                      </h3>
                      <div className="divide-y divide-border rounded-lg border">
                        {grouped[group].map(extra => {
                          const isEditing = editingId === extra.id;
                          return (
                            <div
                              key={extra.id}
                              className={`p-4 transition-colors ${!extra.is_active ? 'opacity-50' : ''}`}
                            >
                              {!isEditing ? (
                                /* ── Vista normal ─────────────────────────────── */
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <div className="min-w-0 flex-1 space-y-0.5">
                                    <p className="font-medium text-balance-dark">{extra.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      ${extra.price_mxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                                      {extra.is_single && (
                                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                                          elige una
                                        </span>
                                      )}
                                      {!extra.is_active && (
                                        <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                                          inactivo
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => startEdit(extra)}
                                    >
                                      Editar
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                      onClick={() => handleDelete(extra.id)}
                                      disabled={deleteMutation.isPending}
                                    >
                                      Eliminar
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                /* ── Modo edición inline ──────────────────────── */
                                <div className="space-y-4">
                                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div className="space-y-1.5">
                                      <Label>Nombre</Label>
                                      <Input
                                        value={editForm.name}
                                        onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                                      />
                                    </div>
                                    <div className="space-y-1.5">
                                      <Label>Grupo</Label>
                                      <Input
                                        value={editForm.group_label}
                                        onChange={e => setEditForm(prev => ({ ...prev, group_label: e.target.value }))}
                                      />
                                    </div>
                                    <div className="space-y-1.5">
                                      <Label>Precio (MXN)</Label>
                                      <Input
                                        type="number"
                                        min={0}
                                        step={0.5}
                                        value={editRawPrice}
                                        onChange={e => setEditRawPrice(e.target.value)}
                                      />
                                    </div>
                                    <div className="space-y-1.5">
                                      <Label>Orden</Label>
                                      <Input
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={editForm.sort_order ?? 0}
                                        onChange={e => setEditForm(prev => ({ ...prev, sort_order: Number(e.target.value) }))}
                                      />
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap gap-6">
                                    <div className="flex items-center gap-3">
                                      <Switch
                                        checked={editForm.is_single ?? false}
                                        onCheckedChange={v => setEditForm(prev => ({ ...prev, is_single: v }))}
                                      />
                                      <Label className="font-medium">Elige una</Label>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <Switch
                                        checked={editForm.is_active ?? true}
                                        onCheckedChange={v => setEditForm(prev => ({ ...prev, is_active: v }))}
                                      />
                                      <Label className="font-medium">Activo</Label>
                                    </div>
                                  </div>

                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      onClick={() => handleUpdate(extra.id)}
                                      disabled={updateMutation.isPending}
                                      style={{ backgroundColor: '#2A4E36', color: '#fff' }}
                                    >
                                      {updateMutation.isPending ? 'Guardando...' : 'Guardar'}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setEditingId(null)}
                                    >
                                      Cancelar
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </CardContent>
          </Card>

        </div>
      </AdminLayout>
    </AuthGuard>
  );
}
