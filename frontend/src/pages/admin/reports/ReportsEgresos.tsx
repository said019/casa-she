import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import {
  Plus, Trash2, CheckCircle2, Clock, TrendingDown,
  Receipt, Users, Zap, Megaphone, Search, Pencil,
  Home, Wifi, ShoppingBag, Wrench, Heart,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import api, { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

interface Egreso {
  id: string;
  category: string;
  concept: string;
  description: string;
  amount: number;
  currency: string;
  status: 'pendiente' | 'pagado' | 'cancelado';
  date: string;
  paidAt: string | null;
  isRecurring: boolean;
  recurringDay: number | null;
  vendor: string;
  notes: string;
  distribution: Record<string, number>;
  receiptUrl: string | null;
  receiptFileName: string | null;
  facilityId: string | null;
  facilityName: string | null;
  createdAt: string;
}

interface DashboardData {
  currentMonth: { total: number; paid: number; pending: number; count: number };
  byCategory: { category: string; total: number; count: number }[];
  history: { month: string; total: number; count: number }[];
  distributionBreakdown: { label: string; amount: number; percentage: number }[];
  byFacility?: { facility_id: string | null; facility_name: string | null; total: number; count: number }[];
}

const CATEGORIES: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  renta: { label: 'Renta', icon: Home, color: '#8B5CF6', bg: 'bg-violet-100 text-violet-700' },
  servicios: { label: 'Servicios (Luz/Agua)', icon: Zap, color: '#F59E0B', bg: 'bg-amber-100 text-amber-700' },
  internet: { label: 'Internet / Teléfono', icon: Wifi, color: '#3B82F6', bg: 'bg-blue-100 text-blue-700' },
  nomina: { label: 'Nómina', icon: Users, color: '#10B981', bg: 'bg-emerald-100 text-emerald-700' },
  marketing: { label: 'Marketing', icon: Megaphone, color: '#EC4899', bg: 'bg-pink-100 text-pink-700' },
  insumos: { label: 'Insumos / Productos', icon: ShoppingBag, color: '#F97316', bg: 'bg-orange-100 text-orange-700' },
  mantenimiento: { label: 'Mantenimiento', icon: Wrench, color: '#6366F1', bg: 'bg-indigo-100 text-indigo-700' },
  seguros: { label: 'Seguros / Salud', icon: Heart, color: '#EF4444', bg: 'bg-red-100 text-red-700' },
  otros: { label: 'Otros', icon: Receipt, color: '#94A3B8', bg: 'bg-slate-100 text-slate-700' },
};

const STATUS_CONFIG = {
  pendiente: { label: 'Pendiente', variant: 'secondary' as const },
  pagado: { label: 'Pagado', variant: 'default' as const },
  cancelado: { label: 'Cancelado', variant: 'destructive' as const },
};

const PIE_COLORS = ['#8B5CF6', '#F59E0B', '#3B82F6', '#10B981', '#EC4899', '#F97316', '#6366F1', '#EF4444', '#94A3B8'];

const formatMXN = (val: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val);

// ============================================================================
// COMPONENT
// ============================================================================

export default function ReportsEgresos() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [facilityFilter, setFacilityFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEgreso, setEditingEgreso] = useState<Egreso | null>(null);

  const [form, setForm] = useState({
    category: 'renta',
    concept: '',
    description: '',
    amount: 0,
    date: format(new Date(), 'yyyy-MM-dd'),
    status: 'pendiente' as 'pendiente' | 'pagado',
    is_recurring: false,
    recurring_day: 1,
    vendor: '',
    notes: '',
    distribution: {} as Record<string, number>,
    facility_id: '',
  });

  // ============================================================================
  // QUERIES
  // ============================================================================

  const { data: facilities = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['facilities'],
    queryFn: async () => (await api.get('/facilities')).data,
  });

  const bmbFacilities = facilities.filter((fc) => /^casa sh/i.test(fc.name));

  const { data: egresos = [], isLoading } = useQuery<Egreso[]>({
    queryKey: ['egresos', catFilter, statusFilter, search, facilityFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (catFilter !== 'all') params.append('category', catFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (facilityFilter !== 'all') params.append('facility', facilityFilter);
      if (search) params.append('search', search);
      return (await api.get(`/egresos?${params}`)).data;
    },
  });

  const { data: dashboard, isLoading: dashLoading } = useQuery<DashboardData>({
    queryKey: ['egresos-dashboard'],
    queryFn: async () => (await api.get('/egresos/dashboard')).data,
  });

  // ============================================================================
  // MUTATIONS
  // ============================================================================

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['egresos'] });
    queryClient.invalidateQueries({ queryKey: ['egresos-dashboard'] });
  };

  const createMutation = useMutation({
    mutationFn: async (data: any) => (await api.post('/egresos', data)).data,
    onSuccess: () => { invalidate(); toast({ title: 'Egreso registrado' }); closeDialog(); },
    onError: (e) => toast({ title: 'Error', description: getErrorMessage(e), variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => (await api.put(`/egresos/${id}`, data)).data,
    onSuccess: () => { invalidate(); toast({ title: 'Egreso actualizado' }); closeDialog(); },
    onError: (e) => toast({ title: 'Error', description: getErrorMessage(e), variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/egresos/${id}`)).data,
    onSuccess: () => { invalidate(); toast({ title: 'Egreso eliminado' }); },
    onError: (e) => toast({ title: 'Error', description: getErrorMessage(e), variant: 'destructive' }),
  });

  const markPaidMutation = useMutation({
    mutationFn: async (id: string) => (await api.put(`/egresos/${id}`, { status: 'pagado' })).data,
    onSuccess: () => { invalidate(); toast({ title: 'Marcado como pagado' }); },
  });

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const openCreate = () => {
    setEditingEgreso(null);
    setForm({
      category: 'renta', concept: '', description: '', amount: 0,
      date: format(new Date(), 'yyyy-MM-dd'), status: 'pendiente',
      is_recurring: false, recurring_day: 1, vendor: '', notes: '',
      distribution: {}, facility_id: '',
    });
    setDialogOpen(true);
  };

  const openEdit = (eg: Egreso) => {
    setEditingEgreso(eg);
    setForm({
      category: eg.category, concept: eg.concept, description: eg.description,
      amount: eg.amount, date: eg.date,
      status: eg.status === 'cancelado' ? 'pendiente' : eg.status,
      is_recurring: eg.isRecurring, recurring_day: eg.recurringDay || 1,
      vendor: eg.vendor, notes: eg.notes, distribution: {}, facility_id: eg.facilityId || '',
    });
    setDialogOpen(true);
  };

  const closeDialog = () => { setDialogOpen(false); setEditingEgreso(null); };

  const handleSubmit = () => {
    if (!form.concept.trim() || form.amount <= 0) {
      toast({ title: 'Completa concepto y monto', variant: 'destructive' });
      return;
    }
    const payload = { ...form, facility_id: form.facility_id || null };
    if (editingEgreso) {
      updateMutation.mutate({ id: editingEgreso.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  // Build pie data from byCategory
  const pieData = (dashboard?.byCategory || []).map((c) => ({
    name: CATEGORIES[c.category]?.label || c.category,
    value: c.total,
    color: CATEGORIES[c.category]?.color || '#94A3B8',
  }));

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-heading font-bold">Egresos</h1>
            <p className="text-muted-foreground">Control de gastos del studio</p>
          </div>
          <Button onClick={openCreate} className="gap-1.5">
            <Plus className="h-4 w-4" /> Nuevo Egreso
          </Button>
        </div>

        {/* Dashboard Cards */}
        {dashLoading ? (
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : dashboard && (
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total mes</p>
                    <p className="text-xl sm:text-2xl font-bold tabular-nums truncate">{formatMXN(dashboard.currentMonth.total)}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                    <TrendingDown className="h-5 w-5 text-red-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Pagados</p>
                    <p className="text-xl sm:text-2xl font-bold tabular-nums truncate text-emerald-600">{formatMXN(dashboard.currentMonth.paid)}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Pendientes</p>
                    <p className="text-xl sm:text-2xl font-bold tabular-nums truncate text-amber-600">{formatMXN(dashboard.currentMonth.pending)}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-amber-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Registros</p>
                    <p className="text-2xl font-bold">{dashboard.currentMonth.count}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <Receipt className="h-5 w-5 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Charts */}
        {dashboard && pieData.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Gastos por categoría</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="w-48 h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} strokeWidth={2}>
                          {pieData.map((d, i) => (
                            <Cell key={i} fill={d.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(val: number) => formatMXN(val)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-2">
                    {pieData.map((d, i) => {
                      const total = pieData.reduce((s, p) => s + p.value, 0);
                      const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
                      return (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: d.color }} />
                            <span className="font-medium">{d.name}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-semibold">{pct}%</span>
                            <span className="text-muted-foreground ml-2 text-xs">{formatMXN(d.value)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Por categoría (mes actual)</CardTitle>
              </CardHeader>
              <CardContent className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pieData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(val: number) => [formatMXN(val), 'Total']} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {pieData.map((d, i) => (
                        <Cell key={i} fill={d.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Mono-sede (Condesa): se eliminó la comparativa de egresos por sucursal. */}

        {/* Filters */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative w-full md:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="w-full md:w-48">
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {Object.entries(CATEGORIES).map(([key, cat]) => (
                <SelectItem key={key} value={key}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-44">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pendiente">Pendientes</SelectItem>
              <SelectItem value="pagado">Pagados</SelectItem>
              <SelectItem value="cancelado">Cancelados</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : egresos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No hay egresos registrados
                    </TableCell>
                  </TableRow>
                ) : (
                  egresos.map((eg) => {
                    const cat = CATEGORIES[eg.category] || CATEGORIES.otros;
                    const st = STATUS_CONFIG[eg.status];
                    const CatIcon = cat.icon;
                    return (
                      <TableRow key={eg.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{eg.concept}</p>
                            {eg.vendor && <p className="text-xs text-muted-foreground">{eg.vendor}</p>}
                            {eg.isRecurring && (
                              <Badge variant="outline" className="text-[10px] mt-0.5">Recurrente</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={cn('gap-1', cat.bg)}>
                            <CatIcon className="h-3 w-3" />
                            {cat.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-semibold">{formatMXN(eg.amount)}</TableCell>
                        <TableCell>
                          <Badge variant={st.variant}>{st.label}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {eg.date ? format(new Date(eg.date + 'T12:00:00'), 'd MMM', { locale: es }) : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            {eg.status === 'pendiente' && (
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-emerald-600" onClick={() => markPaidMutation.mutate(eg.id)}>
                                <CheckCircle2 className="h-3 w-3" />
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(eg)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600" onClick={() => deleteMutation.mutate(eg.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ═══════════════════ CREATE / EDIT DIALOG ═══════════════════ */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEgreso ? 'Editar Egreso' : 'Nuevo Egreso'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Category */}
            <div>
              <Label>Categoría</Label>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                {Object.entries(CATEGORIES).map(([key, cat]) => {
                  const CatIcon = cat.icon;
                  return (
                    <div
                      key={key}
                      onClick={() => setForm((f) => ({ ...f, category: key }))}
                      className={cn(
                        'p-2.5 rounded-lg border-2 cursor-pointer text-center transition-all',
                        form.category === key ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                      )}
                    >
                      <CatIcon className="h-4 w-4 mx-auto mb-1" style={{ color: cat.color }} />
                      <p className="text-[11px] font-semibold leading-tight">{cat.label}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Concept & Amount */}
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="concept">Concepto *</Label>
                <Input
                  id="concept"
                  value={form.concept}
                  onChange={(e) => setForm((f) => ({ ...f, concept: e.target.value }))}
                  placeholder="Ej: Pago de renta abril"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="amount">Monto (MXN) *</Label>
                <Input
                  id="amount"
                  type="number"
                  value={form.amount || ''}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value === '' ? 0 : parseFloat(e.target.value) }))}
                  className="mt-1"
                />
              </div>
            </div>

            {/* Date & Vendor */}
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="egDate">Fecha</Label>
                <Input id="egDate" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="vendor">Proveedor / Beneficiario</Label>
                <Input
                  id="vendor"
                  value={form.vendor}
                  onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))}
                  placeholder="Ej: CFE, Arrendador"
                  className="mt-1"
                />
              </div>
            </div>

            {/* Mono-sede (Condesa): sin selector de sucursal; el egreso queda general. */}

            {/* Status & Recurring */}
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Estado</Label>
                <Select value={form.status} onValueChange={(v: any) => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendiente">Pendiente</SelectItem>
                    <SelectItem value="pagado">Pagado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between pt-6">
                <Label htmlFor="recurring">Recurrente</Label>
                <Switch id="recurring" checked={form.is_recurring} onCheckedChange={(c) => setForm((f) => ({ ...f, is_recurring: c }))} />
              </div>
            </div>

            {form.is_recurring && (
              <div>
                <Label htmlFor="recDay">Día del mes de pago</Label>
                <Input
                  id="recDay" type="number" min={1} max={31}
                  value={form.recurring_day}
                  onChange={(e) => setForm((f) => ({ ...f, recurring_day: parseInt(e.target.value) || 1 }))}
                  className="mt-1 w-24"
                />
              </div>
            )}

            {/* Notes */}
            <div>
              <Label htmlFor="notes">Notas</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="mt-1"
                placeholder="Observaciones..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editingEgreso ? 'Guardar cambios' : 'Registrar egreso'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
