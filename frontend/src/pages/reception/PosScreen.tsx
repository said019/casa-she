import { useState, useRef, useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Loader2, Search, UserCheck, Plus, Minus, ShoppingCart, Trash2, Package, X, RotateCcw } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

import api, { getErrorMessage } from '@/lib/api';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDateForInput, addDaysForInput } from '@/lib/date';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useIsElevated } from '@/hooks/useIsElevated';
import { useFacilityScopeStore } from '@/stores/facilityScopeStore';
import { useFacilityScope } from '@/hooks/useFacilityScope';
import {
  getMembershipPaymentMethods,
  GRATIS_REASON_MIN_LENGTH,
} from '@/lib/membershipPaymentMethods';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Plan {
  id: string;
  name: string;
  price: number;
  reformer_credits: number | null;
  multi_credits: number | null;
  duration_days: number;
}

interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  is_active: boolean;
  image_url?: string | null;
}

interface Client {
  id: string;
  display_name: string;
  email: string;
  phone: string;
}

interface CartItem {
  id: string;
  name: string;
  price: number;
  stock: number;
  qty: number;
}

interface ActiveMembership {
  id: string;
  name: string;
  end_date: string;
  reformer_remaining: number | null;
  multi_remaining: number | null;
}

interface LastSale {
  id: string;
  total: number;
  payment_method: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

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

// ─── Abrir Caja Dialog (A) ────────────────────────────────────────────────────
// Se abre cuando una venta recibe NO_OPEN_SHIFT. Al confirmar: abre la caja
// y reintenta la venta original automáticamente.

interface AbrirCajaDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (openingFloat: number, facilityId: string | null) => void;
  isPending: boolean;
}

function AbrirCajaDialog({ open, onOpenChange, onConfirm, isPending }: AbrirCajaDialogProps) {
  const [floatValue, setFloatValue] = useState('0');
  // Elevados (admin / recepción master) deben elegir la sucursal de la caja, o el
  // backend no sabe cuál abrir. Recepción normal: el backend fuerza su sucursal.
  const elevated = useIsElevated();
  const scopeSelected = useFacilityScopeStore((s) => s.selectedFacilityId);
  const { data: facilities = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['facilities'],
    queryFn: async () => (await api.get('/facilities')).data,
    enabled: elevated && open,
  });
  const [facilityId, setFacilityId] = useState('');
  useEffect(() => {
    if (!elevated || !open || facilityId) return;
    const next = scopeSelected || facilities[0]?.id || '';
    if (next) setFacilityId(next);
  }, [elevated, open, scopeSelected, facilities, facilityId]);

  const needsFacility = elevated && !facilityId;

  function handleConfirm() {
    const f = Math.max(0, Number(floatValue) || 0);
    onConfirm(f, elevated ? facilityId : null);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !isPending) onOpenChange(false); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>La caja está cerrada</DialogTitle>
          <DialogDescription>
            No hay un turno abierto. ¿Abrir caja ahora para registrar la venta?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="abrir-float">Fondo inicial (MXN)</Label>
          <Input
            id="abrir-float"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={floatValue}
            onChange={(e) => setFloatValue(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={isPending || needsFacility}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Abrir caja y vender
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Cancelar Venta Dialog (C) ────────────────────────────────────────────────

interface CancelarVentaDialogProps {
  sale: LastSale;
  onCancelled: () => void;
}

function CancelarVentaDialog({ sale, onCancelled }: CancelarVentaDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  const cancelMutation = useMutation({
    mutationFn: () =>
      api
        .patch(`/sales/${sale.id}/cancel`, { reason })
        .then((r) => r.data as { ok: boolean; saleId: string; refunded: number }),
    onSuccess: (data) => {
      const refundMsg =
        data.refunded > 0
          ? ` Se reembolsaron ${mxn.format(data.refunded)} en efectivo.`
          : '';
      toast.success(`Venta cancelada.${refundMsg}`);
      queryClient.invalidateQueries({ queryKey: ['products-pos'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['cash-current'] });
      setOpen(false);
      setReason('');
      onCancelled();
    },
    onError: (e) => {
      const code = getApiErrorCode(e);
      if (code === 'SHIFT_CLOSED') {
        toast.error('Esta venta es de un turno cerrado; requiere ajuste de un administrador.');
      } else {
        toast.error(getErrorMessage(e));
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-destructive h-8 px-3 text-xs">
          <RotateCcw className="h-3.5 w-3.5" />
          Cancelar venta
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancelar venta</DialogTitle>
          <DialogDescription>
            Venta por {mxn.format(sale.total)}. El stock se devolverá automáticamente.
            {sale.payment_method === 'cash' && ' El monto en efectivo se registrará como salida de caja.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="cancel-reason">Motivo de cancelación</Label>
          <Input
            id="cancel-reason"
            placeholder="Ej. error en cobro, producto devuelto…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            No cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending || !reason.trim()}
          >
            {cancelMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Cancelar venta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Client Picker ───────────────────────────────────────────────────────────

interface ClientPickerProps {
  selectedClient: Client | null;
  onSelect: (client: Client) => void;
  onClear: () => void;
}

function ClientPicker({ selectedClient, onSelect, onClear }: ClientPickerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<Client[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchClients = useCallback(async (term: string) => {
    if (term.length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }
    setSearching(true);
    try {
      const { data } = await api.get('/users', {
        params: { search: term, role: 'client', limit: 10 },
      });
      setResults(data.users || []);
      setShowResults(true);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchClients(value), 400);
  };

  const handleSelect = (client: Client) => {
    onSelect(client);
    setSearchTerm('');
    setShowResults(false);
  };

  if (selectedClient) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-center gap-2">
          <UserCheck className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{selectedClient.display_name}</p>
            <p className="text-xs text-muted-foreground truncate">{selectedClient.email}</p>
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClear}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div ref={dropdownRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre, email o teléfono…"
          value={searchTerm}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9"
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
      {showResults && results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-lg">
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent transition-colors first:rounded-t-md last:rounded-b-md"
              onClick={() => handleSelect(c)}
            >
              <UserCheck className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{c.display_name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {c.email} · {c.phone}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
      {showResults && results.length === 0 && searchTerm.length >= 2 && !searching && (
        <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover p-3 shadow-lg">
          <p className="text-sm text-muted-foreground text-center">No se encontraron usuarios</p>
        </div>
      )}
    </div>
  );
}

// ─── Quick Create Client Dialog ───────────────────────────────────────────────

interface QuickCreateClientDialogProps {
  onCreated: (client: Client) => void;
}

function QuickCreateClientDialog({ onCreated }: QuickCreateClientDialogProps) {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api
        .post('/users', {
          displayName,
          email,
          phone,
        })
        .then((r) => r.data),
    onSuccess: (data) => {
      const user = data.user ?? data;
      toast.success(`Usuario "${user.display_name}" creado`);
      onCreated({
        id: user.id,
        display_name: user.display_name,
        email: user.email,
        phone: user.phone,
      });
      setOpen(false);
      setDisplayName('');
      setEmail('');
      setPhone('');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 w-full sm:w-auto">
          <Plus className="h-4 w-4" />
          Nuevo usuario
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crear usuario rápido</DialogTitle>
          <DialogDescription>
            Registra un nuevo usuario para asignarle la membresía.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="qc-name">
              Nombre completo <span className="text-destructive">*</span>
            </Label>
            <Input
              id="qc-name"
              placeholder="Nombre y apellido"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qc-email">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="qc-email"
              type="email"
              placeholder="correo@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qc-phone">Teléfono</Label>
            <Input
              id="qc-phone"
              placeholder="+52 33 1234 5678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !displayName || !email}
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Crear usuario
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Membresía Tab ────────────────────────────────────────────────────────────

function MembresiaTab() {
  const navigate = useNavigate();
  const isElevated = useIsElevated();
  const paymentMethods = getMembershipPaymentMethods(isElevated);
  const queryClient = useQueryClient();
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [planId, setPlanId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [gratisReason, setGratisReason] = useState('');
  // Inicio de la membresía (default hoy). Permite cobrar hoy pero arrancar otro día.
  const [startDate, setStartDate] = useState(formatDateForInput());

  const isGratis = paymentMethod === 'gratis';

  // Estado control A: Dialog de abrir caja
  const [abrirCajaOpen, setAbrirCajaOpen] = useState(false);
  const [abrirCajaPending, setAbrirCajaPending] = useState(false);

  // Estado control B: AlertDialog doble membresía
  const [dobleMembresia, setDobleMembresia] = useState<ActiveMembership | null>(null);

  const { data: plans = [], isLoading: loadingPlans } = useQuery<Plan[]>({
    queryKey: ['plans'],
    queryFn: () => api.get('/plans').then((r) => r.data),
  });

  // Payload de venta actual (para reintentos)
  function buildSellPayload(confirm?: boolean) {
    return {
      user_id: selectedClient!.id,
      plan_id: planId,
      payment_method: paymentMethod,
      ...(startDate ? { start_date: startDate } : {}),
      ...(isGratis ? { reason: gratisReason.trim() } : {}),
      ...(confirm ? { confirm: true } : {}),
    };
  }

  async function executeSellMembership(payload: ReturnType<typeof buildSellPayload>) {
    return api.post('/cash-shifts/sell-membership', payload).then((r) => r.data);
  }

  const sellMutation = useMutation({
    mutationFn: () => executeSellMembership(buildSellPayload()),
    onSuccess: () => {
      const plan = plans.find((p) => p.id === planId);
      toast.success(`Membresía "${plan?.name ?? ''}" vendida correctamente`);
      queryClient.invalidateQueries({ queryKey: ['cash-current'] });
      setSelectedClient(null);
      setPlanId('');
      setPaymentMethod('');
      setGratisReason('');
    },
    onError: (e) => {
      const code = getApiErrorCode(e);

      // A: Caja cerrada — abrir y reintentar
      if (code === 'NO_OPEN_SHIFT') {
        setAbrirCajaOpen(true);
        return;
      }

      // B: Doble membresía — pedir confirmación
      if (code === 'HAS_ACTIVE_MEMBERSHIP') {
        const data = getApiErrorData(e);
        setDobleMembresia(data?.activeMembership as ActiveMembership ?? null);
        return;
      }

      toast.error(getErrorMessage(e));
    },
  });

  // Handler: al confirmar abrir caja en el dialog (A)
  async function handleAbrirCajaConfirm(openingFloat: number, facilityId: string | null) {
    setAbrirCajaPending(true);
    try {
      await api.post('/cash-shifts/open', {
        opening_float: openingFloat,
        ...(facilityId ? { facility_id: facilityId } : {}),
      });
      queryClient.invalidateQueries({ queryKey: ['cash-current'] });
      toast.success('Caja abierta');
      setAbrirCajaOpen(false);
      // Reintento automático de la venta original
      sellMutation.mutate();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setAbrirCajaPending(false);
    }
  }

  // Handler: al confirmar vender de todas formas con membresía activa (B)
  const sellConfirmMutation = useMutation({
    mutationFn: () => executeSellMembership(buildSellPayload(true)),
    onSuccess: () => {
      const plan = plans.find((p) => p.id === planId);
      toast.success(`Membresía "${plan?.name ?? ''}" vendida correctamente`);
      queryClient.invalidateQueries({ queryKey: ['cash-current'] });
      setSelectedClient(null);
      setPlanId('');
      setPaymentMethod('');
      setDobleMembresia(null);
    },
    onError: (e) => {
      toast.error(getErrorMessage(e));
      setDobleMembresia(null);
    },
  });

  const canSell =
    !!selectedClient &&
    !!planId &&
    !!paymentMethod &&
    (!isGratis || gratisReason.trim().length >= GRATIS_REASON_MIN_LENGTH);

  return (
    <div className="space-y-6">
      {/* Control A: Dialog abrir caja */}
      <AbrirCajaDialog
        open={abrirCajaOpen}
        onOpenChange={setAbrirCajaOpen}
        onConfirm={handleAbrirCajaConfirm}
        isPending={abrirCajaPending}
      />

      {/* Control B: AlertDialog doble membresía */}
      <AlertDialog open={!!dobleMembresia} onOpenChange={(v) => { if (!v) setDobleMembresia(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Membresía activa existente</AlertDialogTitle>
            <AlertDialogDescription>
              El usuario ya tiene una membresía activa
              {dobleMembresia && (
                <>
                  {' '}(<strong>{dobleMembresia.name}</strong>
                  {dobleMembresia.end_date && (
                    <>, vence el{' '}
                      {format(parseISO(dobleMembresia.end_date), "d 'de' MMMM yyyy", { locale: es })}
                    </>
                  )}
                  )
                </>
              )}
              . ¿Deseas venderle otra membresía de todas formas?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDobleMembresia(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => sellConfirmMutation.mutate()}
              disabled={sellConfirmMutation.isPending}
            >
              {sellConfirmMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Vender de todas formas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Client picker */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Usuario</CardTitle>
          <CardDescription>Busca un usuario existente o crea uno nuevo</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ClientPicker
            selectedClient={selectedClient}
            onSelect={setSelectedClient}
            onClear={() => setSelectedClient(null)}
          />
          <QuickCreateClientDialog onCreated={setSelectedClient} />
        </CardContent>
      </Card>

      {/* Plan + payment */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Membresía</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Plan</Label>
            {loadingPlans ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando planes…
              </div>
            ) : (
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name} — {mxn.format(plan.price)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {planId && (() => {
            const plan = plans.find((p) => p.id === planId);
            if (!plan) return null;
            return (
              <div className="rounded-md border bg-muted/40 p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Precio</span>
                  <span className="font-semibold">{mxn.format(plan.price)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vigencia</span>
                  <span>{plan.duration_days} días</span>
                </div>
                {plan.reformer_credits != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Créditos Reformer</span>
                    <span>{plan.reformer_credits}</span>
                  </div>
                )}
                {plan.multi_credits != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Créditos Multi</span>
                    <span>{plan.multi_credits}</span>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="space-y-2">
            <Label htmlFor="sell-start">Inicio de la membresía</Label>
            <Input
              id="sell-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Se cobra hoy, pero la membresía corre desde esta fecha (no pierdes días).
              {(() => {
                const plan = plans.find((p) => p.id === planId);
                if (!plan || !startDate) return null;
                return <> Vence el {addDaysForInput(startDate, plan.duration_days)}.</>;
              })()}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Método de pago</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona método de pago" />
              </SelectTrigger>
              <SelectContent>
                {paymentMethods.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isGratis && (
            <div className="space-y-2">
              <Label htmlFor="pos-gratis-reason">
                Motivo (obligatorio) <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="pos-gratis-reason"
                value={gratisReason}
                onChange={(e) => setGratisReason(e.target.value)}
                placeholder="Ej. Cortesía por promoción / cambio de paquete"
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                La cortesía gratis se registra en $0 y queda en bitácora (mínimo {GRATIS_REASON_MIN_LENGTH} caracteres).
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Button
        className="w-full"
        size="lg"
        onClick={() => sellMutation.mutate()}
        disabled={sellMutation.isPending || sellConfirmMutation.isPending || !canSell}
      >
        {(sellMutation.isPending || sellConfirmMutation.isPending) && (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        )}
        Vender membresía
      </Button>
    </div>
  );
}

// ─── Producto Tab ─────────────────────────────────────────────────────────────

function ProductoTab() {
  const queryClient = useQueryClient();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState('');
  // Cortesía (Gratis $0): el backend fuerza total=$0, payment_method='gratis' y exige motivo.
  const [gratis, setGratis] = useState(false);
  const [gratisReason, setGratisReason] = useState('');
  // Cliente (opcional) a quien se vende — sirve para devoluciones/garantía.
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  // Control A: Dialog abrir caja
  const [abrirCajaOpen, setAbrirCajaOpen] = useState(false);
  const [abrirCajaPending, setAbrirCajaPending] = useState(false);

  // Control C: última venta para "Cancelar venta"
  const [lastSale, setLastSale] = useState<LastSale | null>(null);

  const { facilityIdParam } = useFacilityScope();
  const { data: products = [], isLoading: loadingProducts } = useQuery<Product[]>({
    queryKey: ['products-pos', facilityIdParam],
    queryFn: () => api.get(`/products${facilityIdParam ? `?facility_id=${facilityIdParam}` : ''}`).then((r) => (Array.isArray(r.data) ? r.data : [])),
  });

  const activeProducts = products.filter((p) => p.is_active && p.stock > 0);

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        if (existing.qty >= product.stock) {
          toast.error('Stock insuficiente');
          return prev;
        }
        return prev.map((i) => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { id: product.id, name: product.name, price: Number(product.price), stock: product.stock, qty: 1 }];
    });
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => {
          if (i.id !== id) return i;
          const next = i.qty + delta;
          if (next <= 0) return null as unknown as CartItem;
          if (delta > 0 && next > i.stock) {
            toast.error('Stock insuficiente');
            return i;
          }
          return { ...i, qty: next };
        })
        .filter(Boolean),
    );
  };

  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);

  // Snapshot del carrito para el reintento automático (control A).
  // Incluye gratis + motivo para que el reintento respete la cortesía.
  const pendingCartRef = useRef<{
    cart: CartItem[];
    paymentMethod: string;
    clientId: string | null;
    gratis: boolean;
    gratisReason: string;
  } | null>(null);

  function buildSalePayload(
    cartSnapshot: CartItem[],
    pm: string,
    clientId: string | null,
    isGratis: boolean,
    reason: string,
  ) {
    return {
      items: cartSnapshot.map((i) => ({
        productId: i.id,
        unitPrice: i.price,
        quantity: i.qty,
      })),
      // En cortesía el backend ignora/forza el método; mandamos los flags de gratis.
      ...(isGratis
        ? { gratis: true as const, notes: reason.trim() }
        : { paymentMethod: pm }),
      userId: clientId || undefined,
    };
  }

  async function executeSale(
    cartSnapshot: CartItem[],
    pm: string,
    clientId: string | null,
    isGratis: boolean,
    reason: string,
  ) {
    return api
      .post('/sales', buildSalePayload(cartSnapshot, pm, clientId, isGratis, reason))
      .then((r) => r.data);
  }

  const sellMutation = useMutation({
    mutationFn: () => {
      // Guardamos snapshot antes de limpiar el carrito
      pendingCartRef.current = {
        cart: [...cart],
        paymentMethod,
        clientId: selectedClient?.id ?? null,
        gratis,
        gratisReason,
      };
      return executeSale(cart, paymentMethod, selectedClient?.id ?? null, gratis, gratisReason);
    },
    onSuccess: (data) => {
      toast.success('Venta registrada correctamente');
      // Guardar referencia de la venta para poder cancelarla
      setLastSale({
        id: data.id,
        total: Number(data.total),
        payment_method: data.payment_method ?? (gratis ? 'gratis' : paymentMethod),
      });
      queryClient.invalidateQueries({ queryKey: ['cash-current'] });
      setCart([]);
      setPaymentMethod('');
      setGratis(false);
      setGratisReason('');
      setSelectedClient(null);
      pendingCartRef.current = null;
    },
    onError: (e) => {
      const code = getApiErrorCode(e);

      // A: Caja cerrada — abrir y reintentar
      if (code === 'NO_OPEN_SHIFT') {
        setAbrirCajaOpen(true);
        return;
      }

      toast.error(getErrorMessage(e));
      pendingCartRef.current = null;
    },
  });

  // Handler: al confirmar abrir caja (control A) — luego reintenta la venta con el snapshot
  async function handleAbrirCajaConfirm(openingFloat: number, facilityId: string | null) {
    setAbrirCajaPending(true);
    try {
      await api.post('/cash-shifts/open', {
        opening_float: openingFloat,
        ...(facilityId ? { facility_id: facilityId } : {}),
      });
      queryClient.invalidateQueries({ queryKey: ['cash-current'] });
      toast.success('Caja abierta');
      setAbrirCajaOpen(false);
      // Reintento automático usando el snapshot del carrito guardado antes del error
      if (pendingCartRef.current) {
        const {
          cart: savedCart,
          paymentMethod: savedPm,
          clientId: savedClientId,
          gratis: savedGratis,
          gratisReason: savedReason,
        } = pendingCartRef.current;
        try {
          const data = await executeSale(savedCart, savedPm, savedClientId, savedGratis, savedReason);
          toast.success('Venta registrada correctamente');
          setLastSale({
            id: data.id,
            total: Number(data.total),
            payment_method: data.payment_method ?? (savedGratis ? 'gratis' : savedPm),
          });
          queryClient.invalidateQueries({ queryKey: ['cash-current'] });
          setCart([]);
          setPaymentMethod('');
          setGratis(false);
          setGratisReason('');
          setSelectedClient(null);
        } catch (retryErr) {
          toast.error(getErrorMessage(retryErr));
        } finally {
          pendingCartRef.current = null;
        }
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setAbrirCajaPending(false);
    }
  }

  const canSell =
    cart.length > 0 && (gratis ? gratisReason.trim().length > 0 : !!paymentMethod);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* Control A */}
      <AbrirCajaDialog
        open={abrirCajaOpen}
        onOpenChange={setAbrirCajaOpen}
        onConfirm={handleAbrirCajaConfirm}
        isPending={abrirCajaPending}
      />

      {/* Products grid */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold">Productos disponibles</h2>
        {loadingProducts ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
            <Loader2 className="h-5 w-5 animate-spin" /> Cargando productos…
          </div>
        ) : activeProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <Package className="h-10 w-10 opacity-40" />
            <p className="text-sm">No hay productos disponibles</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {activeProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                className="rounded-lg border bg-card p-3 text-left hover:border-primary hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-ring"
                onClick={() => addToCart(product)}
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-center h-16 rounded-md bg-muted overflow-hidden">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                    ) : (
                      <Package className="h-8 w-8 text-muted-foreground opacity-50" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium line-clamp-2 leading-tight">{product.name}</p>
                    <p className="text-base font-bold mt-1">{mxn.format(Number(product.price))}</p>
                    <Badge variant="secondary" className="text-xs mt-1">
                      Stock: {product.stock}
                    </Badge>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cart panel */}
      <Card className="h-fit lg:sticky lg:top-4">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              Carrito
              {cart.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {cart.length}
                </Badge>
              )}
            </CardTitle>
            {cart.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive h-7 px-2 text-xs"
                onClick={() => setCart([])}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Vaciar
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {cart.length === 0 ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                <ShoppingCart className="h-10 w-10 opacity-30" />
                <p className="text-sm">Carrito vacío</p>
                <p className="text-xs">Haz clic en un producto para agregarlo</p>
              </div>
              {/* Control C: botón cancelar última venta, visible incluso con carrito vacío */}
              {lastSale && (
                <div className="border-t pt-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Última venta: {mxn.format(lastSale.total)}
                    </p>
                    <CancelarVentaDialog
                      sale={lastSale}
                      onCancelled={() => setLastSale(null)}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {cart.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{mxn.format(item.price)} c/u</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => updateQty(item.id, -1)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="text-sm font-medium w-6 text-center">{item.qty}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => updateQty(item.id, 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <span className="text-sm font-semibold w-20 text-right shrink-0">
                    {mxn.format(item.price * item.qty)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {cart.length > 0 && (
            <>
              <Separator />
              <div className="flex justify-between items-center font-semibold">
                <span>Total</span>
                <span className="text-primary text-lg">{mxn.format(cartTotal)}</span>
              </div>

              <div className="space-y-2">
                <Label>Cliente (opcional)</Label>
                <ClientPicker
                  selectedClient={selectedClient}
                  onSelect={setSelectedClient}
                  onClear={() => setSelectedClient(null)}
                />
                <p className="text-xs text-muted-foreground">Para devoluciones o garantía</p>
              </div>

              <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
                <Label htmlFor="pos-gratis" className="text-sm font-medium">
                  Gratis (cortesía)
                </Label>
                <Switch
                  id="pos-gratis"
                  checked={gratis}
                  onCheckedChange={setGratis}
                />
              </div>

              {gratis ? (
                <div className="space-y-2">
                  <Label htmlFor="pos-gratis-reason">
                    Motivo (obligatorio) <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="pos-gratis-reason"
                    value={gratisReason}
                    onChange={(e) => setGratisReason(e.target.value)}
                    placeholder="Ej. cortesía a coach / promoción / cliente frecuente"
                    rows={2}
                  />
                  <p className="text-xs text-muted-foreground">
                    El total se registrará en $0 y quedará en bitácora.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Método de pago</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona método" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Efectivo</SelectItem>
                      <SelectItem value="transfer">Transferencia</SelectItem>
                      <SelectItem value="card">Tarjeta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button
                className="w-full"
                size="lg"
                onClick={() => sellMutation.mutate()}
                disabled={sellMutation.isPending || !canSell}
              >
                {sellMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {gratis ? `Registrar cortesía (${mxn.format(0)})` : `Cobrar ${mxn.format(cartTotal)}`}
              </Button>

              {/* Control C: cancelar última venta, visible junto al cobrar */}
              {lastSale && (
                <div className="flex items-center justify-between border-t pt-2 mt-1">
                  <p className="text-xs text-muted-foreground">
                    Última: {mxn.format(lastSale.total)}
                  </p>
                  <CancelarVentaDialog
                    sale={lastSale}
                    onCancelled={() => setLastSale(null)}
                  />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PosScreen() {
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold">Ventas (POS)</h1>
        <p className="text-muted-foreground text-sm">Vende membresías y productos</p>
      </div>

      <Tabs defaultValue="membresia">
        <TabsList className="mb-4">
          <TabsTrigger value="membresia">Membresía</TabsTrigger>
          <TabsTrigger value="producto">Producto</TabsTrigger>
        </TabsList>

        <TabsContent value="membresia">
          <MembresiaTab />
        </TabsContent>

        <TabsContent value="producto">
          <ProductoTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
