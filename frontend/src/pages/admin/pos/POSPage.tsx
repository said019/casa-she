import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import api from '@/lib/api';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { ProductsContent } from './ProductsPage';
import { SalesHistory } from './SalesHistory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { Search, ShoppingCart, Trash2, Plus, Minus, CreditCard, User as UserIcon, Loader2, X, Package, Receipt } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { Separator } from '@/components/ui/separator';

export default function POSPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = searchParams.get('tab') || 'terminal';
    const [mobileView, setMobileView] = useState<'products' | 'cart'>('products');

    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [cart, setCart] = useState<any[]>([]);
    const [selectedUser, setSelectedUser] = useState<any>(null);
    const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
    const [isUserSearchOpen, setIsUserSearchOpen] = useState(false);

    // Checkout state
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer' | 'gratis'>('cash');
    const [notes, setNotes] = useState('');
    const isGratis = paymentMethod === 'gratis';

    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Fetch Products (Active only)
    const { data: products = [], isLoading: isLoadingProducts } = useQuery<any[]>({
        queryKey: ['products', search, categoryFilter, 'active'],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (search) params.append('search', search);
            if (categoryFilter !== 'all') params.append('category', categoryFilter);
            params.append('active', 'true');
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

    // Add to Cart
    const addToCart = (product: any) => {
        setCart(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                // Check stock
                if (existing.quantity >= product.stock) {
                    toast({ variant: "destructive", title: "Stock insuficiente" });
                    return prev;
                }
                return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
            } else {
                return [...prev, { ...product, quantity: 1 }];
            }
        });
    };

    // Remove/Decrease
    const updateQuantity = (productId: string, delta: number) => {
        setCart(prev => {
            return prev.map(item => {
                if (item.id === productId) {
                    const newQty = item.quantity + delta;
                    if (newQty <= 0) return null;
                    // Check stock if increasing
                    const product = products.find((p: any) => p.id === productId);
                    if (delta > 0 && product && newQty > product.stock) {
                        toast({ variant: "destructive", title: "Stock insuficiente" });
                        return item;
                    }
                    return { ...item, quantity: newQty };
                }
                return item;
            }).filter(Boolean) as any[];
        });
    };

    const cartTotal = useMemo(() => {
        return cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    }, [cart]);

    // Checkout Mutation
    const checkoutMutation = useMutation({
        mutationFn: async () => {
            const items = cart.map(item => ({
                productId: item.id,
                quantity: item.quantity,
                unitPrice: Number(item.price)
            }));

            return await api.post('/sales', {
                userId: selectedUser?.id,
                items,
                ...(isGratis ? { gratis: true, notes } : { paymentMethod, notes }),
                discount: 0 // Implement discount logic if needed
            });
        },
        onSuccess: () => {
            toast({ title: isGratis ? 'Cortesía registrada' : 'Venta realizada con éxito' });
            setCart([]);
            setSelectedUser(null);
            setNotes('');
            setPaymentMethod('cash');
            setIsCheckoutOpen(false);
            queryClient.invalidateQueries({ queryKey: ['products'] }); // Refresh stock
        },
        onError: (error) => {
            toast({ variant: 'destructive', title: 'Error en la venta', description: 'Revisa el stock o intenta de nuevo.' });
            console.error(error);
        }
    });

    return (
        <AuthGuard requiredRoles={['admin']}>
            <AdminLayout>
                <div className="space-y-4">
                    <div className="flex items-center gap-1 border-b">
                        <button
                            onClick={() => setSearchParams({})}
                            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                                activeTab === 'terminal'
                                    ? 'border-balance-gold text-balance-gold'
                                    : 'border-transparent text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <ShoppingCart className="h-4 w-4 inline mr-2" />
                            Terminal POS
                        </button>
                        <button
                            onClick={() => setSearchParams({ tab: 'inventory' })}
                            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                                activeTab === 'inventory'
                                    ? 'border-balance-gold text-balance-gold'
                                    : 'border-transparent text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <Package className="h-4 w-4 inline mr-2" />
                            Inventario
                        </button>
                        <button
                            onClick={() => setSearchParams({ tab: 'history' })}
                            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                                activeTab === 'history'
                                    ? 'border-balance-gold text-balance-gold'
                                    : 'border-transparent text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <Receipt className="h-4 w-4 inline mr-2" />
                            Historial
                        </button>
                    </div>

                {activeTab === 'inventory' ? (
                    <ProductsContent />
                ) : activeTab === 'history' ? (
                    <SalesHistory />
                ) : (
                <>
                {/* Mobile toggle */}
                <div className="flex md:hidden gap-2 mb-3">
                    <Button
                        variant={mobileView === 'products' ? 'default' : 'outline'}
                        className="flex-1"
                        onClick={() => setMobileView('products')}
                    >
                        <Package className="h-4 w-4 mr-2" />
                        Productos
                    </Button>
                    <Button
                        variant={mobileView === 'cart' ? 'default' : 'outline'}
                        className="flex-1 relative"
                        onClick={() => setMobileView('cart')}
                    >
                        <ShoppingCart className="h-4 w-4 mr-2" />
                        Carrito
                        {cart.length > 0 && (
                            <Badge className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-[10px]">{cart.length}</Badge>
                        )}
                    </Button>
                </div>

                <div className="flex h-[calc(100vh-200px)] md:h-[calc(100vh-160px)] gap-6">
            {/* LEFT: Products Grid */}
            <div className={`flex-1 flex flex-col space-y-4 overflow-hidden ${mobileView === 'cart' ? 'hidden md:flex' : ''}`}>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
                    <h2 className="text-3xl font-heading font-bold">Punto de Venta</h2>
                    <div className="flex gap-2">
                        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                            <SelectTrigger className="w-[120px] md:w-[150px]">
                                <SelectValue placeholder="Categoría" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todo</SelectItem>
                                {categories?.map((c: any) => (
                                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <div className="relative flex-1 sm:flex-none">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar..."
                                className="pl-8 w-full sm:w-[200px]"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 overflow-y-auto pr-2 pb-4">
                    {products?.map((product: any) => (
                        <div
                            key={product.id}
                            className="border rounded-lg p-3 md:p-4 flex flex-col gap-2 md:gap-3 hover:border-primary cursor-pointer transition-colors bg-card"
                            onClick={() => { addToCart(product); if (window.innerWidth < 768) setMobileView('cart'); }}
                        >
                            <div className="aspect-square rounded-md bg-muted flex items-center justify-center overflow-hidden">
                                {product.image_url ? (
                                    <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                                ) : (
                                    <Package className="h-10 w-10 text-muted-foreground opacity-50" />
                                )}
                            </div>
                            <div>
                                <h3 className="font-medium line-clamp-1 text-sm md:text-base" title={product.name}>{product.name}</h3>
                                <div className="flex justify-between items-center mt-1">
                                    <span className="font-bold text-base md:text-lg">${Number(product.price).toFixed(2)}</span>
                                    <Badge variant={product.stock > 0 ? "secondary" : "destructive"} className="text-xs">
                                        {product.stock}
                                    </Badge>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* RIGHT: Cart */}
            <div className={`w-full md:w-[350px] border rounded-lg bg-card flex flex-col h-full shadow-sm ${mobileView === 'products' ? 'hidden md:flex' : ''}`}>
                <div className="p-4 border-b flex justify-between items-center bg-muted/30">
                    <h3 className="font-semibold flex items-center gap-2">
                        <ShoppingCart className="h-5 w-5" />
                        Carrito
                    </h3>
                    {cart.length > 0 && (
                        <Button variant="ghost" size="sm" onClick={() => setCart([])} className="text-destructive h-8 px-2">
                            Vaciar
                        </Button>
                    )}
                </div>

                {/* Client Selector Preview */}
                <div className="p-4 border-b bg-muted/10">
                    {selectedUser ? (
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <UserIcon className="h-4 w-4 text-balance-olive" />
                                <span className="text-sm font-medium">{selectedUser.display_name}</span>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setSelectedUser(null)} className="h-6 w-6">
                                <X className="h-3 w-3" />
                            </Button>
                        </div>
                    ) : (
                        <>
                            <Button variant="outline" className="w-full justify-start text-muted-foreground" onClick={() => setIsUserSearchOpen(true)}>
                                <UserIcon className="mr-2 h-4 w-4" />
                                Cliente (opcional)
                            </Button>
                            <p className="text-xs text-muted-foreground mt-1.5">Para devoluciones o garantía</p>
                        </>
                    )}
                </div>

                <ScrollArea className="flex-1 p-4">
                    {cart.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-2 opacity-50">
                            <ShoppingCart className="h-12 w-12" />
                            <p>Carrito vacío</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {cart.map((item) => (
                                <div key={item.id} className="flex gap-3 items-start">
                                    <div className="flex-1">
                                        <p className="text-sm font-medium leading-none mb-1">{item.name}</p>
                                        <p className="text-sm text-muted-foreground">${Number(item.price).toFixed(2)}</p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.id, -1)}>
                                            <Minus className="h-3 w-3" />
                                        </Button>
                                        <span className="w-6 text-center text-sm">{item.quantity}</span>
                                        <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.id, 1)}>
                                            <Plus className="h-3 w-3" />
                                        </Button>
                                    </div>
                                    <div className="w-16 text-right font-medium text-sm">
                                        ${(item.price * item.quantity).toFixed(2)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>

                <div className="p-4 border-t bg-muted/30">
                    <div className="space-y-2 mb-4">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Subtotal</span>
                            <span>${cartTotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between font-bold text-lg">
                            <span>Total</span>
                            <span>${cartTotal.toFixed(2)}</span>
                        </div>
                    </div>
                    <Button
                        className="w-full"
                        size="lg"
                        disabled={cart.length === 0}
                        onClick={() => setIsCheckoutOpen(true)}
                    >
                        Cobrar <CreditCard className="ml-2 h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Checkout Dialog */}
            <Dialog open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{isGratis ? 'Registrar cortesía' : 'Confirmar Venta'}</DialogTitle>
                        <DialogDescription>
                            Total a cobrar: <span className="font-bold text-foreground">${(isGratis ? 0 : cartTotal).toFixed(2)}</span>
                            {isGratis && <span className="ml-1 text-balance-gold">(cortesía)</span>}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="grid gap-2">
                            <Label>Método de Pago</Label>
                            <Select value={paymentMethod} onValueChange={(v: any) => setPaymentMethod(v)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="cash">Efectivo</SelectItem>
                                    <SelectItem value="card">Tarjeta</SelectItem>
                                    <SelectItem value="transfer">Transferencia</SelectItem>
                                    <SelectItem value="gratis">Gratis (cortesía)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid gap-2">
                            <Label>{isGratis ? 'Motivo (obligatorio)' : 'Notas (Opcional)'}</Label>
                            <Input
                                placeholder={isGratis ? 'Por qué se regaló el producto...' : 'Referencia, comentarios...'}
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                            />
                            {isGratis && !notes.trim() && (
                                <p className="text-xs text-destructive">El motivo es obligatorio para registrar una cortesía.</p>
                            )}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCheckoutOpen(false)}>Cancelar</Button>
                        <Button onClick={() => checkoutMutation.mutate()} disabled={checkoutMutation.isPending || (isGratis && !notes.trim())}>
                            {checkoutMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isGratis ? 'Registrar cortesía ($0.00)' : 'Confirmar Pago'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <UserSearchDialog
                open={isUserSearchOpen}
                onOpenChange={setIsUserSearchOpen}
                onSelect={(user: any) => {
                    setSelectedUser(user);
                    setIsUserSearchOpen(false);
                }}
            />
        </div>
                </>
                )}
                </div>
            </AdminLayout>
        </AuthGuard>
    );
}

function UserSearchDialog({ open, onOpenChange, onSelect }: any) {
    const [search, setSearch] = useState('');
    const { data: users = [], isLoading } = useQuery<any[]>({
        queryKey: ['users', search],
        queryFn: async () => {
            if (!search) return [];
            const { data } = await api.get('/users', {
                params: { search, role: 'client', limit: 10 },
            });
            return Array.isArray(data) ? data : data?.users || [];
        },
        enabled: search.length >= 2
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle>Cliente (opcional)</DialogTitle>
                    <DialogDescription>Para devoluciones o garantía</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <Input
                        placeholder="Nombre o email..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        autoFocus
                    />
                    <div className="max-h-[300px] overflow-y-auto space-y-2">
                        {isLoading && <Loader2 className="h-4 w-4 animate-spin mx-auto" />}
                        {users?.map((user: any) => (
                            <div
                                key={user.id}
                                className="flex items-center gap-3 p-2 hover:bg-muted rounded-md cursor-pointer"
                                onClick={() => onSelect(user)}
                            >
                                <div className="h-8 w-8 rounded-full bg-balance-olive/10 flex items-center justify-center text-balance-olive text-xs font-bold">
                                    {user.display_name.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                    <p className="font-medium text-sm">{user.display_name}</p>
                                    <p className="text-xs text-muted-foreground">{user.email}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

