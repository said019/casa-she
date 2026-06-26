import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Trash2,
  Pencil,
  Tag,
  Percent,
  DollarSign,
  Copy,
  CheckCircle2,
} from 'lucide-react';

interface DiscountCode {
  id: string;
  code: string;
  description: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  maxUses: number | null;
  currentUses: number;
  validFrom: string;
  validUntil: string | null;
  minPurchase: number;
  isActive: boolean;
  applicablePlans: { id: string; name: string }[];
  createdAt: string;
}

interface Plan {
  id: string;
  name: string;
  price: number;
}

const emptyForm = {
  code: '',
  description: '',
  discount_type: 'percentage' as 'percentage' | 'fixed',
  discount_value: 0,
  max_uses: null as number | null,
  valid_from: new Date().toISOString().slice(0, 10),
  valid_until: '' as string,
  min_purchase: 0,
  is_active: true,
  plan_ids: [] as string[],
};

export default function DiscountCodes() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'percentage' | 'fixed'>('all');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: codes = [], isLoading } = useQuery<DiscountCode[]>({
    queryKey: ['discount-codes'],
    queryFn: async () => (await api.get('/discount-codes')).data,
  });

  const { data: plans = [] } = useQuery<Plan[]>({
    queryKey: ['plans-for-discount'],
    queryFn: async () => (await api.get('/plans')).data,
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: typeof form) => {
      const body = {
        ...payload,
        max_uses: payload.max_uses || null,
        valid_until: payload.valid_until || null,
      };
      if (editId) {
        return (await api.put(`/discount-codes/${editId}`, body)).data;
      }
      return (await api.post('/discount-codes', body)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discount-codes'] });
      toast({ title: editId ? 'Código actualizado' : 'Código creado' });
      closeDialog();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || 'Error al guardar';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/discount-codes/${id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discount-codes'] });
      toast({ title: 'Código eliminado' });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      (await api.put(`/discount-codes/${id}`, { is_active: isActive })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['discount-codes'] }),
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditId(null);
    setForm({ ...emptyForm });
  };

  const openCreate = () => {
    setEditId(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const openEdit = (code: DiscountCode) => {
    setEditId(code.id);
    setForm({
      code: code.code,
      description: code.description,
      discount_type: code.discountType,
      discount_value: code.discountValue,
      max_uses: code.maxUses,
      valid_from: code.validFrom ? new Date(code.validFrom).toISOString().slice(0, 10) : '',
      valid_until: code.validUntil ? new Date(code.validUntil).toISOString().slice(0, 10) : '',
      min_purchase: code.minPurchase,
      is_active: code.isActive,
      plan_ids: code.applicablePlans.map((p) => p.id),
    });
    setDialogOpen(true);
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const filteredCodes = codes.filter((c) => {
    const q = search.trim().toLowerCase();
    if (q && !c.code.toLowerCase().includes(q) && !(c.description ?? '').toLowerCase().includes(q)) return false;
    if (statusFilter !== 'all' && c.isActive !== (statusFilter === 'active')) return false;
    if (typeFilter !== 'all' && c.discountType !== typeFilter) return false;
    return true;
  });

  return (
    <AuthGuard requiredRoles={['admin']}>
      <AdminLayout>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-heading font-bold">Códigos de Descuento</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {codes.length} códigos creados · {codes.filter((c) => c.isActive).length} activos
              </p>
            </div>
            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" /> Crear Código
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="Buscar código o descripción…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="sm:max-w-xs"
            />
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | 'active' | 'inactive')}>
              <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="active">Activos</SelectItem>
                <SelectItem value="inactive">Inactivos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as 'all' | 'percentage' | 'fixed')}>
              <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="percentage">Porcentaje</SelectItem>
                <SelectItem value="fixed">Monto fijo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6 space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-lg" />
                  ))}
                </div>
              ) : filteredCodes.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Tag className="h-12 w-12 mx-auto mb-4 opacity-40" />
                  <p className="font-medium">
                    {codes.length === 0 ? 'No hay códigos de descuento' : 'Sin resultados para el filtro'}
                  </p>
                  <p className="text-sm mt-1">
                    {codes.length === 0 ? 'Crea tu primer código para ofrecer promociones' : 'Ajusta la búsqueda o los filtros'}
                  </p>
                </div>
              ) : (
                <div className="rounded-md border-t">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Descuento</TableHead>
                        <TableHead>Usos</TableHead>
                        <TableHead>Planes</TableHead>
                        <TableHead>Vigencia</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCodes.map((code) => (
                        <TableRow key={code.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <code className="font-mono font-bold text-primary bg-primary/5 px-2 py-1 rounded">
                                {code.code}
                              </code>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => copyCode(code.code)}
                              >
                                {copiedCode === code.code ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                              </Button>
                            </div>
                            {code.description && (
                              <p className="text-xs text-muted-foreground mt-0.5">{code.description}</p>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="font-semibold">
                              {code.discountType === 'percentage'
                                ? `${code.discountValue}%`
                                : `$${code.discountValue} MXN`}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">
                              {code.currentUses}{code.maxUses ? `/${code.maxUses}` : ''}
                            </span>
                          </TableCell>
                          <TableCell>
                            {code.applicablePlans.length === 0 ? (
                              <Badge variant="outline" className="text-xs">Todos</Badge>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {code.applicablePlans.map((p) => (
                                  <Badge key={p.id} variant="secondary" className="text-xs">
                                    {p.name}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="text-xs text-muted-foreground">
                              {code.validUntil
                                ? `Hasta ${new Date(code.validUntil).toLocaleDateString('es-MX')}`
                                : 'Sin expiración'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={code.isActive}
                              onCheckedChange={(checked) =>
                                toggleMutation.mutate({ id: code.id, isActive: checked })
                              }
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(code)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-500 hover:text-red-700"
                                onClick={() => deleteMutation.mutate(code.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editId ? 'Editar Código' : 'Nuevo Código de Descuento'}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div>
                <Label htmlFor="code">Código *</Label>
                <Input
                  id="code"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="Ej: BIENVENIDA20"
                  className="mt-1.5 font-mono uppercase"
                />
              </div>

              <div>
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Descripción interna del código"
                  rows={2}
                  className="mt-1.5"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tipo de descuento</Label>
                  <Select
                    value={form.discount_type}
                    onValueChange={(v) => setForm({ ...form, discount_type: v as any })}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">
                        <span className="flex items-center gap-1.5">
                          <Percent className="h-3.5 w-3.5" /> Porcentaje
                        </span>
                      </SelectItem>
                      <SelectItem value="fixed">
                        <span className="flex items-center gap-1.5">
                          <DollarSign className="h-3.5 w-3.5" /> Monto fijo
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="discountValue">
                    Valor {form.discount_type === 'percentage' ? '(%)' : '(MXN)'}
                  </Label>
                  <Input
                    id="discountValue"
                    type="number"
                    value={form.discount_value || ''}
                    onChange={(e) => setForm({ ...form, discount_value: parseFloat(e.target.value) || 0 })}
                    className="mt-1.5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="maxUses">Máx. usos (vacío = ilimitado)</Label>
                  <Input
                    id="maxUses"
                    type="number"
                    value={form.max_uses ?? ''}
                    onChange={(e) =>
                      setForm({ ...form, max_uses: e.target.value ? parseInt(e.target.value) : null })
                    }
                    className="mt-1.5"
                    placeholder="Ilimitado"
                  />
                </div>
                <div>
                  <Label htmlFor="minPurchase">Compra mínima (MXN)</Label>
                  <Input
                    id="minPurchase"
                    type="number"
                    value={form.min_purchase || ''}
                    onChange={(e) => setForm({ ...form, min_purchase: parseFloat(e.target.value) || 0 })}
                    className="mt-1.5"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="validFrom">Válido desde</Label>
                  <Input
                    id="validFrom"
                    type="date"
                    value={form.valid_from}
                    onChange={(e) => setForm({ ...form, valid_from: e.target.value })}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="validUntil">Válido hasta (opcional)</Label>
                  <Input
                    id="validUntil"
                    type="date"
                    value={form.valid_until}
                    onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
                    className="mt-1.5"
                  />
                </div>
              </div>

              {/* Plan selection */}
              <div>
                <Label className="mb-2 block">Planes aplicables</Label>
                <p className="text-xs text-muted-foreground mb-3">
                  Si no seleccionas ninguno, el código aplica para todos los paquetes.
                </p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {plans.map((plan) => (
                    <div key={plan.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                      <Checkbox
                        id={`plan-${plan.id}`}
                        checked={form.plan_ids.includes(plan.id)}
                        onCheckedChange={(checked) => {
                          setForm({
                            ...form,
                            plan_ids: checked
                              ? [...form.plan_ids, plan.id]
                              : form.plan_ids.filter((id) => id !== plan.id),
                          });
                        }}
                      />
                      <label htmlFor={`plan-${plan.id}`} className="text-sm font-medium cursor-pointer flex-1">
                        {plan.name}
                        <span className="text-muted-foreground ml-2">${plan.price} MXN</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
                />
                <Label>Código activo</Label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>
                Cancelar
              </Button>
              <Button
                onClick={() => saveMutation.mutate(form)}
                disabled={!form.code || !form.discount_value || saveMutation.isPending}
              >
                {editId ? 'Guardar Cambios' : 'Crear Código'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AdminLayout>
    </AuthGuard>
  );
}
