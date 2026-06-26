import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '@/lib/api';
import { creditLabel } from '@/lib/credits';
import type { User } from '@/types/auth';
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
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, MoreHorizontal, Search, Eye, ShoppingCart, UserPlus, Trash2, Coins } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { CLIENT_TAGS } from '@/data/clientTags';
import SellPlanDialog from '@/components/memberships/SellPlanDialog';
import { AdjustCreditsDialog } from '@/components/clients/AdjustCreditsDialog';

interface FacilityOpt {
    id: string;
    name: string;
}

interface Plan {
    id: string;
    name: string;
    price: number;
    currency: string;
    duration_days: number;
    class_limit: number | null;
}

interface UserWithMembership extends User {
    membership_id?: string;
    membership_status?: string;
    membership_start_date?: string;
    membership_end_date?: string;
    classes_remaining?: number | null;
    reformer_remaining?: number | null;
    multi_remaining?: number | null;
    plan_id?: string;
    plan_name?: string;
    class_limit?: number | null;
    is_active?: boolean;
}

interface UsersListResponse {
    users: UserWithMembership[];
    pagination: {
        total: number;
        limit?: number;
        offset?: number;
    };
    counts?: { active: number; expired: number; none: number; total: number };
}

const statusLabels: Record<string, string> = {
    active: 'Activo',
    expired: 'Vencido',
    cancelled: 'Cancelado',
    pending_payment: 'Pago pendiente',
    pending_activation: 'Pendiente',
    paused: 'Pausado',
};

const statusColors: Record<string, string> = {
    active: 'text-green-600 border-green-200 bg-green-50',
    expired: 'text-red-600 border-red-200 bg-red-50',
    cancelled: 'text-gray-600 border-gray-200 bg-gray-50',
    pending_payment: 'text-yellow-600 border-yellow-200 bg-yellow-50',
    pending_activation: 'text-blue-600 border-blue-200 bg-blue-50',
    paused: 'text-orange-600 border-orange-200 bg-orange-50',
};

export default function ClientsList() {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const [membershipStatus, setMembershipStatus] = useState('');
    const [filterPlanId, setFilterPlanId] = useState('');
    const [tag, setTag] = useState('');
    const [facilityId, setFacilityId] = useState('');
    const [sort, setSort] = useState('recent');
    const [sellUser, setSellUser] = useState<UserWithMembership | null>(null);
    const [creditsDialogOpen, setCreditsDialogOpen] = useState(false);
    const [creditsUser, setCreditsUser] = useState<UserWithMembership | null>(null);

    const debouncedSearch = useDebounce(search, 500);
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const { data, isLoading } = useQuery<UsersListResponse>({
        queryKey: ['users', debouncedSearch, page, membershipStatus, filterPlanId, tag, facilityId, sort],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (debouncedSearch) params.append('search', debouncedSearch);
            params.append('role', 'client');
            params.append('withMembership', 'true');
            params.append('withCounts', 'true');
            params.append('limit', '10');
            params.append('offset', String(page * 10));
            if (membershipStatus) params.append('membershipStatus', membershipStatus);
            if (filterPlanId) params.append('planId', filterPlanId);
            if (tag) params.append('tag', tag);
            if (facilityId) params.append('facilityId', facilityId);
            if (sort) params.append('sort', sort);

            const { data } = await api.get(`/users?${params.toString()}`);
            return data;
        },
        placeholderData: (previousData) => previousData,
    });

    const { data: plans } = useQuery<Plan[]>({
        queryKey: ['plans'],
        queryFn: async () => {
            const { data } = await api.get('/plans');
            return data;
        },
    });

    const { data: facilities } = useQuery<FacilityOpt[]>({
        queryKey: ['facilities'],
        queryFn: async () => (await api.get('/facilities')).data,
    });

    const openAssignDialog = (user: UserWithMembership) => setSellUser(user);

    const openCreditsDialog = (user: UserWithMembership) => {
        setCreditsUser(user);
        setCreditsDialogOpen(true);
    };

    // Delete Mutation
    const deleteMutation = useMutation({
        mutationFn: async (id: string): Promise<{ message?: string }> => {
            const response = await api.delete(`/users/${id}`);
            return response.data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            toast({
                title: 'Usuario eliminado',
                description: data?.message || 'La cuenta se eliminó permanentemente.'
            });
        },
        onError: (error) => {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: getErrorMessage(error),
            });
        },
    });

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    };

    return (
        <AuthGuard requiredRoles={['admin', 'instructor']}>
            <AdminLayout>
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <div>
                            <h1 className="text-3xl font-heading font-bold">Miembros</h1>
                            <p className="text-muted-foreground">Gestiona miembros y asigna planes.</p>
                        </div>
                        <Button asChild>
                            <Link to="/admin/members/new">
                                <UserPlus className="mr-2 h-4 w-4" />
                                Agregar miembro
                            </Link>
                        </Button>
                    </div>

                    <div className="space-y-3">
                        <div className="relative max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por nombre, email o telefono..."
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value);
                                    setPage(0);
                                }}
                                className="pl-10"
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                            <Select
                                value={membershipStatus || 'all'}
                                onValueChange={(v) => { setMembershipStatus(v === 'all' ? '' : v); setPage(0); }}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Estado" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos los estados</SelectItem>
                                    <SelectItem value="active">Activa</SelectItem>
                                    <SelectItem value="expired">Vencida</SelectItem>
                                    <SelectItem value="none">Sin plan (Lead)</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select
                                value={filterPlanId || 'all'}
                                onValueChange={(v) => { setFilterPlanId(v === 'all' ? '' : v); setPage(0); }}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Plan" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos los planes</SelectItem>
                                    {plans?.map((p) => (
                                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select
                                value={tag || 'all'}
                                onValueChange={(v) => { setTag(v === 'all' ? '' : v); setPage(0); }}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Etiqueta" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todas las etiquetas</SelectItem>
                                    {CLIENT_TAGS.map((t) => (
                                        <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={sort} onValueChange={(v) => { setSort(v); setPage(0); }}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Ordenar" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="recent">Recientes</SelectItem>
                                    <SelectItem value="name">Nombre A-Z</SelectItem>
                                    <SelectItem value="expiring">Por vencer</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {data?.counts && (
                        <div className="flex flex-wrap gap-2">
                            {[
                                { key: '', label: 'Todas', n: data.counts.total },
                                { key: 'active', label: 'Activas', n: data.counts.active },
                                { key: 'expired', label: 'Vencidas', n: data.counts.expired },
                                { key: 'none', label: 'Sin plan', n: data.counts.none },
                            ].map((s) => (
                                <button
                                    key={s.key || 'all'}
                                    type="button"
                                    onClick={() => { setMembershipStatus(s.key); setPage(0); }}
                                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                                        membershipStatus === s.key
                                            ? 'bg-primary text-primary-foreground border-primary'
                                            : 'bg-muted/40 hover:bg-muted'
                                    }`}
                                >
                                    {s.label}
                                    <span className="font-bold tabular-nums">{s.n}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="hidden md:block rounded-md border bg-card overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Usuario</TableHead>
                                    <TableHead>Contacto</TableHead>
                                    <TableHead>Plan Actual</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead>Creditos</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8">
                                            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                                        </TableCell>
                                    </TableRow>
                                ) : data?.users.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                            No se encontraron usuarios.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    data?.users.map((user) => (
                                        <TableRow key={user.id} className={user.is_active === false ? 'opacity-50 bg-muted/50' : ''}>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <Link to={`/admin/members/${user.id}`}>
                                                        <Avatar className="cursor-pointer hover:ring-2 hover:ring-primary transition-shadow">
                                                            <AvatarImage src={user.photo_url || undefined} />
                                                            <AvatarFallback>{getInitials(user.display_name)}</AvatarFallback>
                                                        </Avatar>
                                                    </Link>
                                                    <div>
                                                        <div className="font-medium flex items-center gap-1.5 flex-wrap">
                                                            <Link
                                                                to={`/admin/members/${user.id}`}
                                                                className="hover:text-primary hover:underline cursor-pointer"
                                                            >
                                                                {user.display_name}
                                                            </Link>
                                                            {user.is_active === false && <Badge variant="outline" className="text-xs">Inactivo</Badge>}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground">
                                                            Registrado: {new Date(user.created_at).toLocaleDateString()}
                                                        </div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col text-sm">
                                                    <span>{user.email}</span>
                                                    <span className="text-muted-foreground">{user.phone}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {user.plan_name ? (
                                                    <span className="font-medium">{user.plan_name}</span>
                                                ) : (
                                                    <span className="text-muted-foreground text-sm">Sin plan</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {user.membership_status ? (
                                                    <Badge
                                                        variant="outline"
                                                        className={statusColors[user.membership_status] || ''}
                                                    >
                                                        {statusLabels[user.membership_status] || user.membership_status}
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-gray-500">
                                                        Sin membresia
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {user.membership_status === 'active' ? (
                                                    <span className="text-sm tabular-nums">{creditLabel(user)}</span>
                                                ) : (
                                                    <span className="text-sm text-muted-foreground">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" className="h-8 w-8 p-0">
                                                            <span className="sr-only">Abrir menu</span>
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                                                        <DropdownMenuItem asChild>
                                                            <Link to={`/admin/members/${user.id}`}>
                                                                <Eye className="mr-2 h-4 w-4" /> Ver Perfil
                                                            </Link>
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => openAssignDialog(user)}>
                                                            <ShoppingCart className="mr-2 h-4 w-4" /> Asignar Plan
                                                        </DropdownMenuItem>
                                                        {user.membership_status === 'active' && user.membership_id && (
                                                            typeof user.reformer_remaining === 'number' ||
                                                            typeof user.multi_remaining === 'number' ||
                                                            typeof user.classes_remaining === 'number' ||
                                                            (user.class_limit ?? 0) > 0
                                                        ) && (
                                                            <DropdownMenuItem onClick={() => openCreditsDialog(user)}>
                                                                <Coins className="mr-2 h-4 w-4" /> Ajustar Créditos
                                                            </DropdownMenuItem>
                                                        )}
                                                        <DropdownMenuItem
                                                            className="text-destructive focus:text-destructive"
                                                            onClick={() => {
                                                                if (confirm('¿Eliminar este usuario permanentemente? Se borra junto con su historial y deja de aparecer en las listas. No se puede deshacer.')) {
                                                                    deleteMutation.mutate(user.id);
                                                                }
                                                            }}
                                                        >
                                                            <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Móvil: tarjetas tappables — al tocar la tarjeta se abre el perfil */}
                    <div className="md:hidden space-y-3">
                        {isLoading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            </div>
                        ) : data?.users.length === 0 ? (
                            <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
                                No se encontraron usuarios.
                            </div>
                        ) : (
                            data?.users.map((user) => {
                                // Créditos: desglose por categoría + Total (suma). Mismo helper que desktop/perfil.
                                const creditText = creditLabel(user);
                                return (
                                <div
                                    key={user.id}
                                    className={`relative rounded-xl border bg-card p-4 ${user.is_active === false ? 'opacity-60' : ''}`}
                                >
                                    <Link to={`/admin/members/${user.id}`} className="block pr-9">
                                        <div className="flex items-start gap-3">
                                            <Avatar className="h-11 w-11 shrink-0">
                                                <AvatarImage src={user.photo_url || undefined} />
                                                <AvatarFallback>{getInitials(user.display_name)}</AvatarFallback>
                                            </Avatar>
                                            <div className="min-w-0 flex-1">
                                                <div className="font-medium leading-tight flex items-center gap-1.5 flex-wrap">
                                                    {user.display_name}
                                                    {user.is_active === false && (
                                                        <Badge variant="outline" className="text-xs">Inactivo</Badge>
                                                    )}
                                                </div>
                                                {user.email && (
                                                    <div className="text-xs text-muted-foreground break-all">{user.email}</div>
                                                )}
                                                {user.phone && (
                                                    <div className="text-xs text-muted-foreground">{user.phone}</div>
                                                )}
                                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                                    {user.membership_status ? (
                                                        <Badge variant="outline" className={statusColors[user.membership_status] || ''}>
                                                            {statusLabels[user.membership_status] || user.membership_status}
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="text-gray-500">Sin membresía</Badge>
                                                    )}
                                                    {user.plan_name && (
                                                        <Badge variant="secondary" className="text-xs">{user.plan_name}</Badge>
                                                    )}
                                                    {user.membership_status === 'active' && (
                                                        <Badge variant="outline" className="text-xs tabular-nums">
                                                            {creditText}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </Link>
                                    <div className="absolute right-2 top-3">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" className="h-8 w-8 p-0">
                                                    <span className="sr-only">Abrir menu</span>
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                                                <DropdownMenuItem asChild>
                                                    <Link to={`/admin/members/${user.id}`}>
                                                        <Eye className="mr-2 h-4 w-4" /> Ver Perfil
                                                    </Link>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => openAssignDialog(user)}>
                                                    <ShoppingCart className="mr-2 h-4 w-4" /> Asignar Plan
                                                </DropdownMenuItem>
                                                {user.membership_status === 'active' && user.membership_id && (user.class_limit ?? 0) > 0 && (
                                                    <DropdownMenuItem onClick={() => openCreditsDialog(user)}>
                                                        <Coins className="mr-2 h-4 w-4" /> Ajustar Créditos
                                                    </DropdownMenuItem>
                                                )}
                                                <DropdownMenuItem
                                                    className="text-destructive focus:text-destructive"
                                                    onClick={() => {
                                                        if (confirm('¿Eliminar usuario? Si tiene historial será desactivado, si no, se borrará permanentemente.')) {
                                                            deleteMutation.mutate(user.id);
                                                        }
                                                    }}
                                                >
                                                    <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                                );
                            })
                        )}
                    </div>

                    {data && data.pagination.total > 10 && (
                        <div className="flex items-center justify-end space-x-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage((p) => Math.max(0, p - 1))}
                                disabled={page === 0}
                            >
                                Anterior
                            </Button>
                            <div className="text-sm text-muted-foreground">
                                Pagina {page + 1} de {Math.ceil(data.pagination.total / 10)}
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage((p) => p + 1)}
                                disabled={(page + 1) * 10 >= data.pagination.total}
                            >
                                Siguiente
                            </Button>
                        </div>
                    )}
                </div>

                {creditsUser?.membership_id && (
                    <AdjustCreditsDialog
                        membership={{
                            id: creditsUser.membership_id,
                            reformer_remaining: creditsUser.reformer_remaining,
                            multi_remaining: creditsUser.multi_remaining,
                            classes_remaining: creditsUser.classes_remaining,
                        }}
                        open={creditsDialogOpen}
                        onOpenChange={(o) => {
                            setCreditsDialogOpen(o);
                            if (!o) setCreditsUser(null);
                        }}
                        onDone={() => queryClient.invalidateQueries({ queryKey: ['users'] })}
                    />
                )}

                {sellUser && (
                    <SellPlanDialog
                        userId={sellUser.id}
                        userName={sellUser.display_name}
                        open={!!sellUser}
                        onOpenChange={(o) => { if (!o) setSellUser(null); }}
                    />
                )}
            </AdminLayout>
        </AuthGuard>
    );
}
