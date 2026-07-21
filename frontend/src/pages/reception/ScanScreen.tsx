import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Scanner } from '@yudiel/react-qr-scanner';
import { ScanLine, Camera, X, Loader2, Gift, Award, ArrowLeft } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

// ──────────────────────────────────────────────────────────────
// Tipos — adaptados a las APIs reales del backend
// ──────────────────────────────────────────────────────────────

/** Respuesta de POST /api/wallet/lookup (Task 4). */
interface FichaCliente {
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  photoUrl: string | null;
  membership: { status: string | null; planName: string | null };
  pointsBalance: number;
  streak: number | null;
}

/** Respuesta de GET /api/loyalty/users/:userId/benefits (Task 5). */
interface Benefit {
  id: string;
  type: string;
  value: any;
  status: string;
  expiresAt: string;
  classTypeId: string | null;
  classTypeName: string | null;
  createdAt: string;
  usedBy: string | null;
  usableNow: boolean;
  markableNow: boolean;
  expiresSoon: boolean;
}

/**
 * Respuesta de GET /api/loyalty/rewards — array directo (res.json(rewards)),
 * campos snake_case: points_cost, reward_type, is_active, stock.
 */
interface Reward {
  id: string;
  name: string;
  description: string | null;
  points_cost: number;
  reward_type: string;
  reward_value: any;
  is_active: boolean;
  stock: number | null;
}

/**
 * Respuesta de GET /api/users?search=&role=client — shape { users: [...] }
 * con campos: id, display_name, email, phone (snake_case).
 */
interface ClientSearch {
  id: string;
  display_name: string;
  email: string;
  phone: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  free_drink: 'Bebida gratis',
  bar_discount: 'Descuento barra',
  product: 'Producto',
  product_discount: 'Descuento producto',
  discount: 'Descuento',
  free_class: 'Clase gratis',
  membership_extension: 'Extensión de membresía',
  discount_package: 'Paquete descuento',
  membership_service: 'Servicio de membresía',
  workshop_pass: 'Taller incluido',
};

const isUuid = /^[0-9a-f-]{36}$/i;

export default function ScanScreen() {
  const qc = useQueryClient();
  const [ficha, setFicha] = useState<FichaCliente | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanPaused, setScanPaused] = useState(false);
  const [selectedServices, setSelectedServices] = useState<Record<string, string>>({});

  // ── Lookup (QR o userId) ──────────────────────────────────────
  const lookup = useMutation({
    mutationFn: async (input: { qrPayload?: string; membershipId?: string; userId?: string }) =>
      (await api.post<FichaCliente>('/wallet/lookup', input)).data,
    onSuccess: (f) => {
      setFicha(f);
      setError(null);
      setScanning(false);
    },
    onError: (e) => {
      setError(getErrorMessage(e));
      setScanning(false);
      setScanPaused(false);
    },
  });

  // ── Búsqueda manual de clientes ───────────────────────────────
  // GET /api/users?search=&role=client&withMembership=true → { users: [...] }
  const searchResults = useQuery<ClientSearch[]>({
    queryKey: ['clients-search', search],
    queryFn: async () => {
      const { data } = await api.get('/users', {
        params: { search, role: 'client', withMembership: 'true', limit: 10 },
      });
      return data?.users ?? [];
    },
    enabled: search.trim().length >= 2,
  });

  // ── Beneficios vigentes del cliente ───────────────────────────
  const benefits = useQuery<Benefit[]>({
    queryKey: ['staff-benefits', ficha?.userId],
    queryFn: async () => (await api.get(`/loyalty/users/${ficha!.userId}/benefits`)).data,
    enabled: !!ficha?.userId,
  });

  // ── Catálogo de recompensas canjeables ────────────────────────
  const rewards = useQuery<Reward[]>({
    queryKey: ['catalog', ficha?.userId],
    queryFn: async () => (await api.get('/loyalty/rewards')).data,
    enabled: !!ficha,
  });

  // ── Marcar beneficio como usado ───────────────────────────────
  const useBenefit = useMutation({
    mutationFn: async ({ id, selectedService }: { id: string; selectedService?: string }) =>
      (await api.post(`/loyalty/benefits/${id}/use`, { selectedService })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-benefits', ficha?.userId] }),
    onError: (e) => setError(getErrorMessage(e)),
  });

  // ── Canjear recompensa a nombre del cliente ───────────────────
  const redeem = useMutation({
    mutationFn: async (rewardId: string) =>
      (await api.post(`/loyalty/users/${ficha!.userId}/redeem`, { rewardId })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-benefits', ficha?.userId] });
      // Refrescar ficha para actualizar el saldo de puntos.
      if (ficha) lookup.mutate({ userId: ficha.userId });
    },
    onError: (e) => setError(getErrorMessage(e)),
  });

  // ── Recompensas canjeables ahora ──────────────────────────────
  const redeemableRewards = (rewards.data ?? []).filter(
    (r) => r.is_active && (r.stock === null || r.stock > 0) && (ficha?.pointsBalance ?? 0) >= r.points_cost
  );

  const handleScan = (detectedCodes: any[]) => {
    if (detectedCodes.length > 0 && !lookup.isPending && !scanPaused) {
      const raw = detectedCodes[0].rawValue;
      if (raw) {
        setScanPaused(true);
        lookup.mutate(isUuid.test(raw) ? { membershipId: raw } : { qrPayload: raw });
      }
    }
  };

  const reset = () => {
    setFicha(null);
    setSearch('');
    setError(null);
    setScanPaused(false);
    setScanning(false);
    setSelectedServices({});
  };

  // ──────────────────────────────────────────────────────────────
  // Render — vista de búsqueda (sin ficha)
  // ──────────────────────────────────────────────────────────────
  if (!ficha) {
    return (
      <div className="reception-scan space-y-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-2">
          <ScanLine className="h-6 w-6 text-primary" />
          <h2 className="text-xl font-heading font-bold text-foreground">Escanear cliente</h2>
        </div>

        {error && (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-800 dark:text-red-200">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="shrink-0 text-red-600 hover:text-red-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex flex-col items-center gap-3 text-center">
              <Button
                variant={scanning ? 'outline' : 'default'}
                className="gap-2"
                onClick={() => {
                  setScanning((s) => !s);
                  setScanPaused(false);
                  setError(null);
                }}
              >
                {scanning ? (
                  <>
                    <X className="h-4 w-4" /> Cerrar escáner
                  </>
                ) : (
                  <>
                    <Camera className="h-4 w-4" /> Abrir escáner
                  </>
                )}
              </Button>

              {scanning && (
                <div className="relative w-full max-w-sm rounded-lg overflow-hidden bg-black aspect-square">
                  <Scanner
                    onScan={handleScan}
                    onError={(err) => {
                      console.error('QR Scanner error:', err);
                      setError('No se pudo acceder a la cámara. Usa la búsqueda manual.');
                      setScanning(false);
                    }}
                    styles={{ container: { width: '100%', height: '100%' }, video: { width: '100%', height: '100%', objectFit: 'cover' } }}
                  />
                  {lookup.isPending && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-white" />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="relative pt-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase tracking-wider">
                <span className="bg-card px-2 text-muted-foreground">o busca a mano</span>
              </div>
            </div>

            <div className="space-y-2">
              <Input
                placeholder="Buscar por nombre, email o teléfono"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {searchResults.isFetching && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Buscando…
                </div>
              )}
              <ul className="search-results rounded-md border bg-popover shadow-sm max-h-72 overflow-y-auto divide-y divide-border">
                {(searchResults.data ?? []).map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors text-sm"
                      onClick={() => lookup.mutate({ userId: c.id })}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{c.display_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                      </div>
                    </button>
                  </li>
                ))}
                {searchResults.data && searchResults.data.length === 0 && search.trim().length >= 2 && !searchResults.isFetching && (
                  <li className="px-3 py-3 text-sm text-muted-foreground text-center">Sin resultados.</li>
                )}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────
  // Render — ficha del cliente + acciones
  // ──────────────────────────────────────────────────────────────
  return (
    <div className="reception-scan space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-heading font-bold text-foreground">Ficha del cliente</h2>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={reset}>
          <ArrowLeft className="h-4 w-4" /> Escanear otro
        </Button>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-800 dark:text-red-200">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 text-red-600 hover:text-red-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Ficha */}
      <div className="ficha">
        <Card>
          <CardContent className="p-5 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-heading font-bold text-foreground">{ficha.name}</h3>
              {ficha.membership.status && (
                <Badge variant={ficha.membership.status === 'active' ? 'default' : 'secondary'}>
                  {ficha.membership.status}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {ficha.email}
              {ficha.phone ? ` · ${ficha.phone}` : ''}
            </p>
            <p className="text-sm text-muted-foreground">
              Membresía: {ficha.membership.status ?? 'sin plan'}
              {ficha.membership.planName ? ` · ${ficha.membership.planName}` : ''}
            </p>
            <div className="flex items-center gap-2 pt-2">
              <Award className="h-5 w-5 text-primary" />
              <span className="text-sm text-muted-foreground">Puntos:</span>
              <strong className="text-lg tabular-nums">{ficha.pointsBalance}</strong>
              {ficha.streak != null && (
                <Badge variant="outline" className="ml-2">{ficha.streak} días de racha</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Beneficios vigentes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Gift className="h-4 w-4 text-muted-foreground" /> Beneficios vigentes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(benefits.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground py-3 text-center">Sin beneficios vigentes.</p>
          )}
          <ul className="benefits space-y-2">
            {(benefits.data ?? []).map((b) => (
              <li key={b.id} className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">
                    {TYPE_LABELS[b.type] ?? b.type}
                    {b.classTypeName ? ` (${b.classTypeName})` : ''}
                  </span>
                  {b.expiresSoon && b.usableNow ? (
                    <Badge variant="outline" className="border-amber-400 text-amber-700">Expira pronto</Badge>
                  ) : b.usableNow ? (
                    <Badge variant="default" className="bg-emerald-600">Usable ahora</Badge>
                  ) : (
                    <Badge variant="destructive">Expirado</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Vence {new Date(b.expiresAt).toLocaleDateString('es-MX')}
                </p>
                {b.type === 'free_class' && (
                  <p className="text-xs text-muted-foreground italic">Se aplica al reservar la clase.</p>
                )}
                {b.type === 'membership_service' && Array.isArray(b.value?.options) && (
                  <Select
                    value={selectedServices[b.id] || ''}
                    onValueChange={(value) => setSelectedServices((current) => ({ ...current, [b.id]: value }))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Selecciona el servicio utilizado" />
                    </SelectTrigger>
                    <SelectContent>
                      {b.value.options.map((option: string) => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {b.type !== 'free_class' && b.markableNow && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 h-7 text-xs"
                    disabled={useBenefit.isPending || (b.type === 'membership_service' && !selectedServices[b.id])}
                    onClick={() => {
                      const detail = b.type === 'membership_service' ? ` (${selectedServices[b.id]})` : '';
                      if (!window.confirm(`¿Marcar este beneficio${detail} como usado? Esta acción no se puede deshacer.`)) return;
                      useBenefit.mutate({ id: b.id, selectedService: selectedServices[b.id] });
                    }}
                  >
                    {useBenefit.isPending && useBenefit.variables?.id === b.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : null}
                    Marcar usado
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Canje de puntos */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Award className="h-4 w-4 text-muted-foreground" /> Canjear puntos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {redeemableRewards.length === 0 && (
            <p className="text-sm text-muted-foreground py-3 text-center">
              El cliente no puede canjear ninguna recompensa ahora.
            </p>
          )}
          <ul className="rewards space-y-2">
            {redeemableRewards.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.points_cost} pts</p>
                </div>
                <Button
                  size="sm"
                  className="gap-1 h-7 text-xs"
                  disabled={redeem.isPending}
                  onClick={() => {
                    if (!window.confirm(`Canjear "${r.name}" por ${r.points_cost} puntos para este cliente?`)) return;
                    redeem.mutate(r.id);
                  }}
                >
                  {redeem.isPending && redeem.variables === r.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : null}
                  Canjear
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
