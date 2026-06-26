import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Plus, Trash2, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Facility {
  id: string;
  name: string;
  is_active: boolean;
}

interface Reformer {
  id: string;
  facility_id: string;
  number: number;
  label: string | null;
  position_x: number;
  position_y: number;
  rotation: number;
  scale: number;
}

// ─── Debounce hook ────────────────────────────────────────────────────────────

function useDebounce<T extends (...args: Parameters<T>) => void>(fn: T, delay: number): T {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback(
    ((...args: Parameters<T>) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => fn(...args), delay);
    }) as T,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fn, delay],
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FacilityLayoutEditor() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Selected facility tab
  const [activeFacilityId, setActiveFacilityId] = useState<string | null>(null);
  // Selected spot (ring highlight)
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Drag state
  const dragging = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  // Add-spot form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState('');

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: facilities, isLoading: loadingFacilities } = useQuery<Facility[]>({
    queryKey: ['facilities'],
    queryFn: async () => (await api.get('/facilities')).data,
  });

  // Set default facility once loaded
  useEffect(() => {
    if (facilities && facilities.length > 0 && !activeFacilityId) {
      setActiveFacilityId(facilities[0].id);
    }
  }, [facilities, activeFacilityId]);

  const { data: reformers, isLoading: loadingReformers } = useQuery<Reformer[]>({
    queryKey: ['reformers', activeFacilityId],
    queryFn: async () => (await api.get(`/reformers?facility_id=${activeFacilityId}`)).data,
    enabled: Boolean(activeFacilityId),
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Reformer> }) =>
      api.put(`/reformers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reformers', activeFacilityId] });
    },
    onError: (err) =>
      toast({ variant: 'destructive', title: 'Error al actualizar', description: getErrorMessage(err) }),
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<Reformer>) => api.post('/reformers', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reformers', activeFacilityId] });
      setShowAddForm(false);
      setNewLabel('');
      toast({ title: 'Lugar agregado' });
    },
    onError: (err) =>
      toast({ variant: 'destructive', title: 'Error al crear', description: getErrorMessage(err) }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/reformers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reformers', activeFacilityId] });
      toast({ title: 'Lugar eliminado' });
    },
    onError: (err) =>
      toast({ variant: 'destructive', title: 'Error al eliminar', description: getErrorMessage(err) }),
  });

  // ── Drag handlers ──────────────────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, reformer: Reformer) => {
      e.preventDefault();
      setSelectedId(reformer.id);
      dragging.current = {
        id: reformer.id,
        startX: e.clientX,
        startY: e.clientY,
        origX: reformer.position_x,
        origY: reformer.position_y,
      };
    },
    [],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging.current || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const dx = ((e.clientX - dragging.current.startX) / rect.width) * 100;
      const dy = ((e.clientY - dragging.current.startY) / rect.height) * 100;
      const newX = Math.max(0, Math.min(100, dragging.current.origX + dx));
      const newY = Math.max(0, Math.min(100, dragging.current.origY + dy));

      // Optimistic update in query cache
      queryClient.setQueryData<Reformer[]>(['reformers', activeFacilityId], (old) =>
        old
          ? old.map((r) =>
              r.id === dragging.current!.id ? { ...r, position_x: newX, position_y: newY } : r,
            )
          : old,
      );
    },
    [activeFacilityId, queryClient],
  );

  const handleMouseUp = useCallback(() => {
    if (!dragging.current) return;
    const current = queryClient
      .getQueryData<Reformer[]>(['reformers', activeFacilityId])
      ?.find((r) => r.id === dragging.current!.id);
    if (current) {
      updateMutation.mutate({
        id: current.id,
        data: { position_x: current.position_x, position_y: current.position_y },
      });
    }
    dragging.current = null;
  }, [activeFacilityId, queryClient, updateMutation]);

  // ── Debounced field updaters ───────────────────────────────────────────────

  // We keep local state for rotation/scale so inputs feel instant
  const [localOverrides, setLocalOverrides] = useState<Record<string, { rotation?: number; scale?: number; label?: string }>>({});

  const debouncedUpdate = useDebounce(
    (id: string, data: Partial<Reformer>) => updateMutation.mutate({ id, data }),
    500,
  );

  function handleFieldChange(id: string, field: 'rotation' | 'scale' | 'label', value: number | string) {
    setLocalOverrides((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
    debouncedUpdate(id, { [field]: value });
  }

  function getField(reformer: Reformer, field: 'rotation' | 'scale' | 'label') {
    const override = localOverrides[reformer.id];
    if (override && field in override) return override[field as keyof typeof override];
    if (field === 'label') return reformer.label ?? '';
    return reformer[field];
  }

  // ── Add spot ───────────────────────────────────────────────────────────────

  const maxNumber = reformers && reformers.length > 0 ? Math.max(...reformers.map((r) => r.number)) : 0;

  function handleAddSpot() {
    if (!activeFacilityId) return;
    createMutation.mutate({
      facility_id: activeFacilityId,
      number: maxNumber + 1,
      label: newLabel || null,
      position_x: 50,
      position_y: 50,
      rotation: 0,
      scale: 1,
    } as Partial<Reformer>);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <AuthGuard requiredRoles={['admin']}>
      <AdminLayout>
        <div className="space-y-5">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-heading font-bold">Mapa de salas</h1>
            <p className="text-sm text-balance-dark/55">
              Posiciona y configura los lugares de cada estudio.
            </p>
          </div>

          {/* Facility tabs */}
          {loadingFacilities ? (
            <div className="flex items-center gap-2 text-balance-dark/55">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando salas…
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {facilities?.map((f) => (
                <button
                  key={f.id}
                  onClick={() => {
                    setActiveFacilityId(f.id);
                    setSelectedId(null);
                  }}
                  className={cn(
                    'rounded-[1rem] border px-5 py-2 text-sm font-semibold transition-all duration-150',
                    activeFacilityId === f.id
                      ? 'border-balance-olive bg-balance-olive text-balance-cream shadow-sm'
                      : 'border-balance-sand/65 bg-balance-olive/10 text-balance-dark hover:bg-balance-olive/20',
                  )}
                >
                  {f.name}
                </button>
              ))}
            </div>
          )}

          {/* Main layout: canvas + sidebar */}
          <div className="flex flex-col gap-5 lg:flex-row">
            {/* Canvas */}
            <div className="flex-1">
              <div
                ref={canvasRef}
                className="relative w-full overflow-hidden rounded-[2rem] border border-balance-sand/65 bg-[#f5f1e8] select-none"
                style={{ aspectRatio: '16/10' }}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                {/* Grid SVG overlay */}
                <svg
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  viewBox="0 0 1600 1000"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <pattern id="editorGrid" width="48" height="48" patternUnits="userSpaceOnUse">
                      <path
                        d="M 48 0 L 0 0 0 48"
                        fill="none"
                        stroke="rgba(71,83,110,0.06)"
                        strokeWidth="1"
                      />
                    </pattern>
                  </defs>
                  <rect x="0" y="0" width="1600" height="1000" fill="url(#editorGrid)" />
                  <rect
                    x="24" y="24" width="1552" height="952" rx="28"
                    fill="none" stroke="rgba(28,28,30,0.10)" strokeWidth="2"
                  />
                  {/* Mirror line */}
                  <line x1="220" y1="42" x2="1380" y2="42" stroke="rgba(113,127,155,0.55)" strokeWidth="4" strokeLinecap="round" />
                  <line x1="220" y1="54" x2="1380" y2="54" stroke="rgba(113,127,155,0.18)" strokeWidth="2" strokeDasharray="6 6" />
                </svg>

                {/* Labels */}
                <span className="pointer-events-none absolute left-1/2 top-[1.5%] -translate-x-1/2 text-[10px] font-semibold uppercase tracking-[0.2em] text-balance-dark/30">
                  espejo
                </span>
                <span className="pointer-events-none absolute bottom-[1.5%] left-1/2 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-[0.2em] text-balance-dark/30">
                  entrada
                </span>

                {/* Loading overlay */}
                {loadingReformers && (
                  <div className="absolute inset-0 flex items-center justify-center bg-balance-cream/60 backdrop-blur-sm">
                    <Loader2 className="h-6 w-6 animate-spin text-balance-olive" />
                  </div>
                )}

                {/* Spots */}
                {reformers?.map((r) => (
                  <SpotTile
                    key={r.id}
                    reformer={r}
                    selected={selectedId === r.id}
                    onMouseDown={handleMouseDown}
                  />
                ))}
              </div>
            </div>

            {/* Sidebar */}
            <div className="w-full shrink-0 lg:w-72 xl:w-80">
              <div className="rounded-[2rem] border border-balance-sand/65 bg-balance-olive/10 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-balance-dark">Lugares</h2>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-[1rem] border-balance-olive/40 text-balance-olive hover:bg-balance-olive hover:text-balance-cream"
                    onClick={() => setShowAddForm((v) => !v)}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Agregar lugar
                  </Button>
                </div>

                {/* Inline add form */}
                {showAddForm && (
                  <div className="rounded-[1.5rem] border border-balance-sand/65 bg-white/60 p-4 space-y-3">
                    <p className="text-xs font-semibold text-balance-dark/60">Nuevo lugar #{maxNumber + 1}</p>
                    <div className="space-y-1">
                      <Label className="text-xs">Etiqueta (opcional)</Label>
                      <Input
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        placeholder="ej. VIP, Esquina…"
                        className="rounded-[0.85rem] text-sm"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 rounded-[0.85rem] bg-balance-olive text-balance-cream hover:bg-balance-olive/85"
                        onClick={handleAddSpot}
                        disabled={createMutation.isPending}
                      >
                        {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Agregar'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-[0.85rem]"
                        onClick={() => { setShowAddForm(false); setNewLabel(''); }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}

                {/* Spot list */}
                <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                  {loadingReformers && (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-balance-olive" />
                    </div>
                  )}
                  {!loadingReformers && (!reformers || reformers.length === 0) && (
                    <p className="py-4 text-center text-xs text-balance-dark/45">
                      No hay lugares en esta sala. Agrega uno.
                    </p>
                  )}
                  {reformers?.map((r) => (
                    <div
                      key={r.id}
                      onClick={() => setSelectedId(r.id)}
                      className={cn(
                        'rounded-[1.25rem] border bg-white/70 p-3 space-y-2.5 cursor-pointer transition-all',
                        selectedId === r.id
                          ? 'border-balance-olive ring-2 ring-balance-olive/40'
                          : 'border-balance-sand/50 hover:border-balance-olive/40',
                      )}
                    >
                      {/* Row: number + label + delete */}
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-balance-dark text-xs font-bold text-balance-cream">
                          {r.number}
                        </span>
                        <Input
                          value={getField(r, 'label') as string}
                          onChange={(e) => handleFieldChange(r.id, 'label', e.target.value)}
                          placeholder="Etiqueta"
                          className="h-7 flex-1 rounded-[0.75rem] border-balance-sand/50 px-2 text-xs"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(r.id); }}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-balance-dark/40 transition-colors hover:bg-red-50 hover:text-red-500"
                          title="Eliminar lugar"
                        >
                          {deleteMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>

                      {/* Rotation */}
                      <div className="flex items-center gap-2">
                        <Label className="w-16 shrink-0 text-[10px] text-balance-dark/55">Rotación</Label>
                        <Input
                          type="number"
                          min={0}
                          max={359}
                          value={getField(r, 'rotation') as number}
                          onChange={(e) => handleFieldChange(r.id, 'rotation', Number(e.target.value))}
                          className="h-6 flex-1 rounded-[0.75rem] border-balance-sand/50 px-2 text-xs"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="text-[10px] text-balance-dark/40">°</span>
                      </div>

                      {/* Scale */}
                      <div className="flex items-center gap-2">
                        <Label className="w-16 shrink-0 text-[10px] text-balance-dark/55">Escala</Label>
                        <Input
                          type="number"
                          min={0.5}
                          max={2}
                          step={0.1}
                          value={getField(r, 'scale') as number}
                          onChange={(e) => handleFieldChange(r.id, 'scale', Number(e.target.value))}
                          className="h-6 flex-1 rounded-[0.75rem] border-balance-sand/50 px-2 text-xs"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="text-[10px] text-balance-dark/40">×</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}

// ─── Spot Tile ────────────────────────────────────────────────────────────────

interface SpotTileProps {
  reformer: Reformer;
  selected: boolean;
  onMouseDown: (e: React.MouseEvent, r: Reformer) => void;
}

function SpotTile({ reformer, selected, onMouseDown }: SpotTileProps) {
  const TILE_SIZE_PCT = 7; // % of canvas width — approximate visual size

  return (
    <div
      onMouseDown={(e) => onMouseDown(e, reformer)}
      style={{
        position: 'absolute',
        left: `${reformer.position_x}%`,
        top: `${reformer.position_y}%`,
        transform: `translate(-50%, -50%) rotate(${reformer.rotation}deg) scale(${reformer.scale})`,
        width: `${TILE_SIZE_PCT}%`,
        aspectRatio: '1',
        cursor: 'move',
      }}
      className={cn(
        'flex flex-col items-center justify-center rounded-[1rem] border-2 bg-balance-cream shadow-md transition-shadow',
        selected
          ? 'border-balance-olive ring-2 ring-balance-olive shadow-lg'
          : 'border-balance-sand/70 hover:border-balance-olive/50 hover:shadow-lg',
      )}
    >
      {/* Drag handle icon */}
      <GripVertical className="h-3 w-3 text-balance-dark/25 pointer-events-none" />

      {/* Label */}
      {reformer.label && (
        <span className="pointer-events-none max-w-full truncate px-1 text-center text-[9px] font-semibold text-balance-dark/55 leading-tight">
          {reformer.label}
        </span>
      )}

      {/* Number badge */}
      <div className="pointer-events-none absolute -bottom-2.5 left-1/2 -translate-x-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-balance-dark text-[10px] font-bold text-balance-cream shadow">
        {reformer.number}
      </div>
    </div>
  );
}
