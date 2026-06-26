import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { fileToImageDataUrl } from '@/lib/image';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Search, Edit, Trash2, Loader2, Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

export function ProductsContent() {
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [facilityFilter, setFacilityFilter] = useState<string>('all');
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<any>(null);
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Fetch Products
    const { data: products = [], isLoading: isLoadingProducts } = useQuery<any[]>({
        queryKey: ['products', search, categoryFilter, facilityFilter],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (search) params.append('search', search);
            if (categoryFilter !== 'all') params.append('category', categoryFilter);
            if (facilityFilter !== 'all') params.append('facility_id', facilityFilter);
            const { data } = await api.get(`/products?${params.toString()}`);
            return Array.isArray(data) ? data : [];
        },
    });

    // Fetch Categories
    const { data: categories = [] } = useQuery<any[]>({
        queryKey: ['product-categories'],
        queryFn: async () => {
            const { data } = await api.get('/products/categories');
            return Array.isArray(data) ? data : [];
        },
    });

    // Sucursales: para filtrar el inventario y elegir a cuál pertenece cada producto.
    const { data: facilities = [] } = useQuery<any[]>({
        queryKey: ['facilities'],
        queryFn: async () => {
            const { data } = await api.get('/facilities');
            return Array.isArray(data) ? data : [];
        },
    });
    const shortFacility = (name?: string | null) => (name || '').replace(/^Casa Shé\s*/i, '') || '—';
    const defaultFacilityId = facilityFilter !== 'all' ? facilityFilter : (facilities[0]?.id ?? '');

    // Create/Update Product Mutation
    const saveProductMutation = useMutation({
        mutationFn: async (productData: any) => {
            if (editingProduct) {
                return await api.put(`/products/${editingProduct.id}`, productData);
            } else {
                return await api.post('/products', productData);
            }
        },
        onSuccess: () => {
            toast({ title: editingProduct ? 'Producto actualizado' : 'Producto creado' });
            setIsCreateOpen(false);
            setEditingProduct(null);
            queryClient.invalidateQueries({ queryKey: ['products'] });
        },
        onError: (error) => {
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar el producto.' });
            console.error(error);
        }
    });

    // Delete Product Mutation
    const deleteProductMutation = useMutation({
        mutationFn: async (id: string) => {
            return await api.delete(`/products/${id}`);
        },
        onSuccess: (res) => {
            toast({ title: res?.data?.message || 'Producto eliminado' });
            queryClient.invalidateQueries({ queryKey: ['products'] });
        },
    });

    const handleEdit = (product: any) => {
        setEditingProduct(product);
        setIsCreateOpen(true);
    };

    const handleDelete = (id: string) => {
        if (confirm('¿Estás seguro de eliminar este producto?')) {
            deleteProductMutation.mutate(id);
        }
    };

    return (
                <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-heading font-bold">Inventario</h2>
                    <p className="text-muted-foreground">Gestiona los productos de venta</p>
                </div>
                <Button onClick={() => { setEditingProduct(null); setIsCreateOpen(true); }}>
                    <Plus className="mr-2 h-4 w-4" /> Nuevo Producto
                </Button>
            </div>

            <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar productos..."
                        className="pl-8"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Categoría" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todas las categorías</SelectItem>
                        {categories?.map((cat: any) => (
                            <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="border rounded-md overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Producto</TableHead>
                            <TableHead>Categoría</TableHead>
                            <TableHead>Precio</TableHead>
                            <TableHead>Stock</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoadingProducts ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8">
                                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                                </TableCell>
                            </TableRow>
                        ) : products?.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                    No hay productos registrados
                                </TableCell>
                            </TableRow>
                        ) : (
                            products?.map((product: any) => (
                                <TableRow key={product.id}>
                                    <TableCell className="font-medium">
                                        <div className="flex items-center gap-3">
                                            {product.image_url ? (
                                                <img src={product.image_url} alt={product.name} className="h-10 w-10 rounded-md object-cover bg-muted" />
                                            ) : (
                                                <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">
                                                    <Package className="h-5 w-5 text-muted-foreground" />
                                                </div>
                                            )}
                                            <div>
                                                <div>{product.name}</div>
                                                <div className="text-xs text-muted-foreground">{product.sku}</div>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>{product.category_name || '-'}</TableCell>
                                    <TableCell>${Number(product.price).toFixed(2)}</TableCell>
                                    <TableCell>
                                        <Badge variant={product.stock <= (product.min_stock_alert || 5) ? "destructive" : "secondary"}>
                                            {product.stock}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        {product.is_active ? (
                                            <Badge variant="outline" className="text-green-600 border-green-600">Activo</Badge>
                                        ) : (
                                            <Badge variant="outline" className="text-gray-400">Inactivo</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button variant="ghost" size="icon" onClick={() => handleEdit(product)}>
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(product.id)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <ProductFormDialog
                open={isCreateOpen}
                onOpenChange={setIsCreateOpen}
                onSubmit={(data) => saveProductMutation.mutate(data)}
                initialData={editingProduct}
                categories={categories || []}
                facilities={facilities || []}
                defaultFacilityId={defaultFacilityId}
                isSubmitting={saveProductMutation.isPending}
            />
        </div>
    );
}

export default function ProductsPage() {
    return (
        <AuthGuard requiredRoles={['admin']}>
            <AdminLayout>
                <ProductsContent />
            </AdminLayout>
        </AuthGuard>
    );
}

function ProductFormDialog({ open, onOpenChange, onSubmit, initialData, categories, facilities, defaultFacilityId, isSubmitting }: any) {
    const { toast } = useToast();
    const fileRef = useRef<HTMLInputElement>(null);
    const [imageUrl, setImageUrl] = useState<string>('');
    const [readingImage, setReadingImage] = useState(false);

    // Pre-cargar la foto al abrir / cambiar de producto en edición.
    useEffect(() => {
        if (open) setImageUrl(initialData?.image_url ?? '');
    }, [open, initialData]);

    const handleImageFile = async (file: File | null) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast({ variant: 'destructive', title: 'Archivo no válido', description: 'Sube una imagen (JPG o PNG).' });
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            toast({ variant: 'destructive', title: 'Imagen muy grande', description: 'La imagen no debe pesar más de 10 MB.' });
            return;
        }
        setReadingImage(true);
        try {
            setImageUrl(await fileToImageDataUrl(file));
        } catch {
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo procesar la imagen.' });
        } finally {
            setReadingImage(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        const data = {
            name: formData.get('name'),
            description: formData.get('description'),
            price: Number(formData.get('price')),
            cost: Number(formData.get('cost')),
            stock: Number(formData.get('stock')),
            sku: formData.get('sku'),
            categoryId: formData.get('categoryId') === 'none' ? null : formData.get('categoryId'),
            facility_id: formData.get('facilityId') || null,
            image_url: imageUrl || null,
            isActive: true // Default to active
        };
        onSubmit(data);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>{initialData ? 'Editar Producto' : 'Nuevo Producto'}</DialogTitle>
                    <DialogDescription>Completa la información del producto.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">Nombre *</Label>
                            <Input id="name" name="name" defaultValue={initialData?.name} required />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="sku">SKU (Código)</Label>
                            <Input id="sku" name="sku" defaultValue={initialData?.sku} />
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="description">Descripción</Label>
                        <Input id="description" name="description" defaultValue={initialData?.description} />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="price">Precio Venta *</Label>
                            <Input id="price" name="price" type="number" step="0.01" defaultValue={initialData?.price} required />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="cost">Costo (Opcional)</Label>
                            <Input id="cost" name="cost" type="number" step="0.01" defaultValue={initialData?.cost} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="stock">Stock Inicial *</Label>
                            <Input id="stock" name="stock" type="number" defaultValue={initialData?.stock || 0} required />
                        </div>
                    </div>

                    {/* Mono-sede: el producto se asigna automáticamente a la única sede. */}
                    <input
                        type="hidden"
                        name="facilityId"
                        value={initialData?.facility_id || defaultFacilityId || facilities?.[0]?.id || ''}
                    />

                    <div className="grid gap-2">
                        <Label htmlFor="categoryId">Categoría</Label>
                        <Select name="categoryId" defaultValue={initialData?.category_id || "none"}>
                            <SelectTrigger>
                                <SelectValue placeholder="Seleccionar..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Sin Categoría</SelectItem>
                                {categories.map((c: any) => (
                                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid gap-2">
                        <Label>Foto del producto (opcional)</Label>
                        <div className="flex items-center gap-3">
                            <div className="h-24 w-24 shrink-0 rounded-md bg-muted flex items-center justify-center overflow-hidden ring-1 ring-border">
                                {imageUrl ? (
                                    <img src={imageUrl} alt="Producto" className="h-full w-full object-cover" />
                                ) : (
                                    <Package className="h-7 w-7 text-muted-foreground" />
                                )}
                            </div>
                            <div className="space-y-1">
                                <Button type="button" variant="outline" size="sm" disabled={readingImage}
                                    onClick={() => fileRef.current?.click()}>
                                    {readingImage && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                    Subir foto
                                </Button>
                                {imageUrl && (
                                    <button type="button" className="block text-xs text-muted-foreground underline"
                                        onClick={() => setImageUrl('')}>
                                        Quitar
                                    </button>
                                )}
                            </div>
                        </div>
                        <input ref={fileRef} type="file" accept="image/*" className="hidden"
                            onChange={(e) => { handleImageFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
                    </div>

                    <DialogFooter className="mt-4">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Guardar
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
