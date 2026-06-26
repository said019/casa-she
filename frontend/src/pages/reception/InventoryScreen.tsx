import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useFacilityScope } from '@/hooks/useFacilityScope';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    Package, Plus, Search, Loader2, Pencil, AlertCircle, ArrowUpDown,
    AlertTriangle, Tag, Trash2, ImageIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import { useIsElevated } from '@/hooks/useIsElevated';
import { fileToImageDataUrl } from '@/lib/image';

// Campo reutilizable de foto de producto (preview cuadrado + subir/quitar).
function ProductPhotoField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [reading, setReading] = useState(false);

    const handleFile = async (file: File | null) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast.error('Sube una imagen (JPG o PNG).');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            toast.error('La imagen no debe pesar más de 10 MB.');
            return;
        }
        setReading(true);
        try {
            onChange(await fileToImageDataUrl(file));
        } catch {
            toast.error('No se pudo procesar la imagen.');
        } finally {
            setReading(false);
        }
    };

    return (
        <div className="space-y-1">
            <Label>Foto del producto (opcional)</Label>
            <div className="flex items-center gap-3">
                <div className="h-24 w-24 shrink-0 rounded-md bg-muted/40 flex items-center justify-center overflow-hidden ring-1 ring-border">
                    {value ? (
                        <img src={value} alt="Producto" className="h-full w-full object-cover" />
                    ) : (
                        <ImageIcon className="h-7 w-7 text-muted-foreground" />
                    )}
                </div>
                <div className="space-y-1">
                    <Button type="button" variant="outline" size="sm" disabled={reading}
                        onClick={() => inputRef.current?.click()}>
                        {reading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                        Subir foto
                    </Button>
                    {value && (
                        <button type="button" className="block text-xs text-muted-foreground underline"
                            onClick={() => onChange('')}>
                            Quitar
                        </button>
                    )}
                </div>
            </div>
            <input ref={inputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { handleFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
        </div>
    );
}

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

interface Product {
    id: string;
    name: string;
    description: string | null;
    price: number | string;
    cost: number | string;
    stock: number;
    min_stock_alert: number;
    sku: string | null;
    category_id: string | null;
    category_name?: string | null;
    image_url: string | null;
    is_active: boolean;
}

interface Category {
    id: string;
    name: string;
    description: string | null;
    is_active: boolean;
}

// ─── New category dialog ─────────────────────────────────────────────────────
function NewCategoryDialog({ onCreated }: { onCreated: () => void }) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const create = useMutation({
        mutationFn: async () => api.post('/products/categories', { name: name.trim() }),
        onSuccess: () => {
            toast.success('Categoría creada');
            setName('');
            setOpen(false);
            onCreated();
        },
        onError: (e) => toast.error(getErrorMessage(e)),
    });
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <Tag className="h-4 w-4 mr-2" />
                    Nueva categoría
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader><DialogTitle>Nueva categoría</DialogTitle></DialogHeader>
                <div className="space-y-2">
                    <Label>Nombre</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)}
                        placeholder="Ej. Bebidas, Ropa, Accesorios" />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                    <Button onClick={() => create.mutate()} disabled={create.isPending || !name.trim()}>
                        {create.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                        Crear
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─── New product dialog ──────────────────────────────────────────────────────
function NewProductDialog({ categories, onCreated }: { categories: Category[]; onCreated: () => void }) {
    const [open, setOpen] = useState(false);
    const elevated = useIsElevated();
    const { facilityIdParam } = useFacilityScope();
    // Sucursal del producto: recepción normal → el backend fuerza la suya; admin/master
    // DEBEN elegirla (si no, el POST falla con "La sucursal del producto es requerida").
    const { data: facilities = [] } = useQuery<{ id: string; name: string }[]>({
        queryKey: ['facilities'],
        queryFn: async () => (await api.get('/facilities')).data,
        enabled: elevated,
    });
    const [form, setForm] = useState({
        name: '', description: '', sku: '',
        price: '', cost: '', stock: '0', category_id: '', image_url: '', facility_id: '',
    });
    const facilityValue = form.facility_id || facilityIdParam || facilities[0]?.id || '';
    const create = useMutation({
        mutationFn: async () => api.post('/products', {
            name: form.name.trim(),
            description: form.description.trim() || null,
            sku: form.sku.trim() || null,
            price: Number(form.price),
            cost: Number(form.cost) || 0,
            stock: Number(form.stock) || 0,
            category_id: form.category_id || null,
            image_url: form.image_url || null,
            facility_id: elevated ? (facilityValue || null) : null,
        }),
        onSuccess: () => {
            toast.success('Producto creado');
            setForm({ name: '', description: '', sku: '', price: '', cost: '', stock: '0', category_id: '', image_url: '', facility_id: '' });
            setOpen(false);
            onCreated();
        },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    const canSubmit = form.name.trim().length > 0 && form.price !== '' && !isNaN(Number(form.price)) && (!elevated || !!facilityValue);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Nuevo producto
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Nuevo producto</DialogTitle></DialogHeader>
                <div className="space-y-3">
                    <div className="space-y-1">
                        <Label htmlFor="np-name">Nombre</Label>
                        <Input id="np-name" value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            placeholder="Ej. Botella de agua" />
                    </div>
                    {elevated && (
                        <div className="space-y-1">
                            <Label>Sucursal</Label>
                            <Select value={facilityValue} onValueChange={(v) => setForm({ ...form, facility_id: v })}>
                                <SelectTrigger><SelectValue placeholder="Elige sucursal" /></SelectTrigger>
                                <SelectContent>
                                    {facilities.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label htmlFor="np-price">Precio (MXN)</Label>
                            <Input id="np-price" type="number" min="0" step="0.01" value={form.price}
                                onChange={(e) => setForm({ ...form, price: e.target.value })}
                                placeholder="0.00" />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="np-cost">Costo (MXN, opcional)</Label>
                            <Input id="np-cost" type="number" min="0" step="0.01" value={form.cost}
                                onChange={(e) => setForm({ ...form, cost: e.target.value })}
                                placeholder="0.00" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label htmlFor="np-stock">Stock inicial</Label>
                            <Input id="np-stock" type="number" min="0" value={form.stock}
                                onChange={(e) => setForm({ ...form, stock: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="np-sku">SKU (opcional)</Label>
                            <Input id="np-sku" value={form.sku}
                                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                                placeholder="BOT-001" />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <Label>Categoría (opcional)</Label>
                        <Select value={form.category_id || 'none'}
                            onValueChange={(v) => setForm({ ...form, category_id: v === 'none' ? '' : v })}>
                            <SelectTrigger><SelectValue placeholder="Sin categoría" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Sin categoría</SelectItem>
                                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="np-desc">Descripción (opcional)</Label>
                        <Textarea id="np-desc" rows={2} value={form.description}
                            onChange={(e) => setForm({ ...form, description: e.target.value })} />
                    </div>
                    <ProductPhotoField value={form.image_url}
                        onChange={(v) => setForm({ ...form, image_url: v })} />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                    <Button onClick={() => create.mutate()} disabled={create.isPending || !canSubmit}>
                        {create.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                        Crear
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─── Stock adjust dialog ──────────────────────────────────────────────────────
function StockAdjustDialog({ product, onDone }: { product: Product; onDone: () => void }) {
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<'in' | 'out'>('in');
    const [qty, setQty] = useState('1');
    const [reason, setReason] = useState('');

    const adjust = useMutation({
        mutationFn: async () => api.post(`/products/${product.id}/stock-adjust`, {
            delta: (mode === 'in' ? 1 : -1) * Math.abs(Number(qty) || 0),
            reason: reason.trim(),
        }),
        onSuccess: () => {
            toast.success('Stock actualizado');
            setQty('1');
            setReason('');
            setMode('in');
            setOpen(false);
            onDone();
        },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    const delta = (mode === 'in' ? 1 : -1) * Math.abs(Number(qty) || 0);
    const newStock = Math.max(0, product.stock + delta);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <ArrowUpDown className="h-3 w-3 mr-1" />
                    Stock
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader><DialogTitle>Ajustar stock — {product.name}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-md bg-muted/40">
                        <span className="text-sm text-muted-foreground">Saldo actual</span>
                        <span className="font-semibold text-lg">{product.stock} → {newStock}</span>
                    </div>

                    <div className="flex gap-2">
                        <Button variant={mode === 'in' ? 'default' : 'outline'} className="flex-1"
                            onClick={() => setMode('in')}>+ Entrada</Button>
                        <Button variant={mode === 'out' ? 'default' : 'outline'} className="flex-1"
                            onClick={() => setMode('out')}>− Salida / merma</Button>
                    </div>

                    <div className="space-y-1">
                        <Label htmlFor="sa-qty">Cantidad</Label>
                        <Input id="sa-qty" type="number" min="1" step="1" value={qty}
                            onChange={(e) => setQty(e.target.value)} />
                    </div>

                    <div className="space-y-1">
                        <Label htmlFor="sa-reason">Motivo (opcional pero recomendado)</Label>
                        <Input id="sa-reason" value={reason} onChange={(e) => setReason(e.target.value)}
                            placeholder="Ej. Reposición proveedor 26-may, conteo físico, merma por caducidad" />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                    <Button onClick={() => adjust.mutate()}
                        disabled={adjust.isPending || !qty || Number(qty) <= 0}>
                        {adjust.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                        Aplicar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─── Edit product dialog (reception: no price/cost) ───────────────────────────
function EditProductDialog({ product, categories, onDone }: { product: Product; categories: Category[]; onDone: () => void }) {
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({
        name: product.name,
        description: product.description ?? '',
        sku: product.sku ?? '',
        category_id: product.category_id ?? '',
        image_url: product.image_url ?? '',
    });

    const update = useMutation({
        mutationFn: async () => api.put(`/products/${product.id}`, {
            name: form.name.trim(),
            description: form.description.trim() || null,
            sku: form.sku.trim() || null,
            category_id: form.category_id || null,
            image_url: form.image_url || null,
        }),
        onSuccess: () => { toast.success('Producto actualizado'); setOpen(false); onDone(); },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm">
                    <Pencil className="h-3 w-3" />
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader><DialogTitle>Editar producto</DialogTitle></DialogHeader>
                <div className="rounded-md bg-muted/40 border p-3 text-xs text-muted-foreground flex gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    Para cambiar el <strong>precio</strong> o <strong>costo</strong> pídeselo a admin.
                </div>
                <div className="space-y-3 mt-2">
                    <div className="space-y-1">
                        <Label>Nombre</Label>
                        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                        <Label>SKU</Label>
                        <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                        <Label>Categoría</Label>
                        <Select value={form.category_id || 'none'}
                            onValueChange={(v) => setForm({ ...form, category_id: v === 'none' ? '' : v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Sin categoría</SelectItem>
                                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1">
                        <Label>Descripción</Label>
                        <Textarea rows={2} value={form.description}
                            onChange={(e) => setForm({ ...form, description: e.target.value })} />
                    </div>
                    <ProductPhotoField value={form.image_url}
                        onChange={(v) => setForm({ ...form, image_url: v })} />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                    <Button onClick={() => update.mutate()} disabled={update.isPending || !form.name.trim()}>
                        {update.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                        Guardar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
// Borrar producto — solo para usuarios elevados (admin / super_admin / recepción master).
// Es un soft-delete (is_active=false): el producto sale del inventario y del POS.
function DeleteProductButton({ product, onDone }: { product: Product; onDone: () => void }) {
    const del = useMutation({
        mutationFn: async () => api.delete(`/products/${product.id}`),
        onSuccess: () => { toast.success('Producto eliminado'); onDone(); },
        onError: (e) => toast.error(getErrorMessage(e)),
    });
    return (
        <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
            title="Eliminar producto"
            disabled={del.isPending}
            onClick={() => {
                if (window.confirm(`¿Eliminar "${product.name}"? Dejará de aparecer en el inventario y en el punto de venta.`)) {
                    del.mutate();
                }
            }}
        >
            {del.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>
    );
}

export default function InventoryScreen() {
    const qc = useQueryClient();
    const elevated = useIsElevated();
    const { facilityIdParam } = useFacilityScope();
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');

    const { data: products = [], isLoading } = useQuery<Product[]>({
        queryKey: ['reception-inventory', search, categoryFilter, facilityIdParam],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (search) params.set('search', search);
            if (categoryFilter !== 'all') params.set('category', categoryFilter);
            if (facilityIdParam) params.set('facility_id', facilityIdParam);
            const url = `/products${params.toString() ? `?${params}` : ''}`;
            return (await api.get(url)).data;
        },
    });

    const { data: categories = [] } = useQuery<Category[]>({
        queryKey: ['product-categories'],
        queryFn: async () => (await api.get('/products/categories')).data,
    });

    const refetch = () => {
        qc.invalidateQueries({ queryKey: ['reception-inventory'] });
        qc.invalidateQueries({ queryKey: ['product-categories'] });
    };

    const stats = useMemo(() => {
        const total = products.length;
        const active = products.filter((p) => p.is_active).length;
        const lowStock = products.filter((p) => p.is_active && p.stock <= p.min_stock_alert).length;
        const totalUnits = products.reduce((s, p) => s + (p.is_active ? p.stock : 0), 0);
        return { total, active, lowStock, totalUnits };
    }, [products]);

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-3xl font-heading font-bold">Inventario</h1>
                    <p className="text-muted-foreground text-sm">
                        Productos para vender en POS. Crea, ajusta stock y edita detalles (no precios).
                    </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <NewCategoryDialog onCreated={refetch} />
                    <NewProductDialog categories={categories} onCreated={refetch} />
                </div>
            </div>

            {/* Quick KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                            <Package className="h-4 w-4" />Productos
                        </div>
                        <p className="text-xl sm:text-2xl font-bold tabular-nums truncate">{stats.active}</p>
                        <p className="text-xs text-muted-foreground mt-1">activos · {stats.total} total</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                            <ArrowUpDown className="h-4 w-4" />Unidades en stock
                        </div>
                        <p className="text-xl sm:text-2xl font-bold tabular-nums truncate">{stats.totalUnits}</p>
                    </CardContent>
                </Card>
                <Card className={stats.lowStock > 0 ? 'border-amber-300 bg-amber-50/50' : ''}>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                            <AlertTriangle className="h-4 w-4" />Stock bajo
                        </div>
                        <p className={`text-xl sm:text-2xl font-bold tabular-nums truncate ${stats.lowStock > 0 ? 'text-amber-700' : ''}`}>{stats.lowStock}</p>
                        <p className="text-xs text-muted-foreground mt-1">productos por reponer</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                            <Tag className="h-4 w-4" />Categorías
                        </div>
                        <p className="text-xl sm:text-2xl font-bold tabular-nums truncate">{categories.length}</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardContent className="pt-4">
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="relative flex-1 min-w-[200px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input value={search} onChange={(e) => setSearch(e.target.value)}
                                placeholder="Buscar por nombre o SKU" className="pl-10" />
                        </div>
                        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                            <SelectTrigger className="h-9 w-48">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todas las categorías</SelectItem>
                                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            <div className="space-y-2">
                {isLoading ? (
                    Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
                ) : products.length === 0 ? (
                    <Card>
                        <CardContent className="py-12 text-center">
                            <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                            <p className="text-sm text-muted-foreground">
                                {search ? 'No hay productos que coincidan con tu búsqueda.' : 'Aún no hay productos. Crea el primero con el botón de arriba.'}
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    products.map((p) => {
                        const low = p.is_active && p.stock <= p.min_stock_alert;
                        return (
                            <Card key={p.id} className={low ? 'border-amber-200' : ''}>
                                <CardContent className="p-3 flex items-center gap-3">
                                    <div className="h-12 w-12 rounded-md bg-muted/40 flex items-center justify-center shrink-0">
                                        {p.image_url ? (
                                            <img src={p.image_url} alt={p.name} className="h-full w-full object-cover rounded-md" />
                                        ) : (
                                            <Package className="h-5 w-5 text-muted-foreground" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="font-medium truncate">{p.name}</p>
                                            {p.category_name && <Badge variant="outline" className="text-xs">{p.category_name}</Badge>}
                                            {!p.is_active && <Badge variant="outline" className="text-xs">inactivo</Badge>}
                                            {low && (
                                                <Badge variant="outline" className="text-xs text-amber-700 border-amber-400">
                                                    <AlertTriangle className="h-3 w-3 mr-1" /> bajo
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                                            <span>{p.sku ?? '—'}</span>
                                            <span>·</span>
                                            <span className="font-medium">{mxn.format(Number(p.price))}</span>
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-xs text-muted-foreground">Stock</p>
                                        <p className={`text-xl font-semibold ${low ? 'text-amber-700' : ''}`}>{p.stock}</p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <StockAdjustDialog product={p} onDone={refetch} />
                                        <EditProductDialog product={p} categories={categories} onDone={refetch} />
                                        {elevated && <DeleteProductButton product={p} onDone={refetch} />}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })
                )}
            </div>

            <div className="rounded-md bg-muted/40 border p-3 text-xs text-muted-foreground flex gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                    Cada movimiento de stock queda en bitácora con tu usuario y motivo.
                    {!elevated && <> Si necesitas cambiar un <strong>precio</strong> o <strong>eliminar</strong> un producto, pídeselo a admin.</>}
                </span>
            </div>
        </div>
    );
}
