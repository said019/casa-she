import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, UserPlus, Edit, UserX, KeyRound, Power, Copy, ShieldCheck, ShieldOff } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { PermissionEditor } from '@/components/reception/PermissionEditor';
import { effectivePermissions, type PermissionMap, PRESET_MASTER } from '@/lib/permissions';

interface ReceptionStaff {
    id: string;
    email: string;
    phone: string | null;
    display_name: string;
    is_active: boolean;
    default_facility_id: string | null;
    facility_name: string | null;
    is_reception_master?: boolean;
    permissions?: Record<string, boolean>;
    role?: 'reception' | 'admin';
}

interface Facility {
    id: string;
    name: string;
}

// ─── Confirmation dialog state types ─────────────────────────────────────────

type RoleConfirm = {
    member: ReceptionStaff;
    targetRole: 'admin' | 'reception';
};

type ToggleMasterConfirm = {
    member: ReceptionStaff;
    value: boolean;
};

type ToggleActiveConfirm = {
    member: ReceptionStaff;
    value: boolean;
};

type ResendConfirm = {
    member: ReceptionStaff;
};

// ─── Create Dialog ────────────────────────────────────────────────────────────

interface CreateDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    facilities: Facility[];
}

function CreateReceptionistDialog({ open, onOpenChange, facilities }: CreateDialogProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [email, setEmail] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [facilityId, setFacilityId] = useState<string>('none');
    const [errors, setErrors] = useState<Record<string, string>>({});

    const resetForm = () => {
        setEmail('');
        setDisplayName('');
        setPhone('');
        setPassword('');
        setFacilityId('none');
        setErrors({});
    };

    const handleOpenChange = (val: boolean) => {
        if (!val) resetForm();
        onOpenChange(val);
    };

    const createMutation = useMutation({
        mutationFn: async (body: {
            email: string;
            display_name: string;
            phone: string;
            password: string;
            default_facility_id: string | null;
        }) => {
            const { data } = await api.post('/users/reception', body);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['reception-staff'] });
            toast({ title: 'Recepcionista creado exitosamente' });
            handleOpenChange(false);
        },
        onError: (error: unknown) => {
            const msg = getErrorMessage(error);
            toast({ variant: 'destructive', title: 'Error al crear recepcionista', description: msg });
        },
    });

    const validate = (): boolean => {
        const errs: Record<string, string> = {};
        if (!email.trim()) errs.email = 'El email es requerido';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Email inválido';
        if (!displayName.trim()) errs.displayName = 'El nombre es requerido';
        if (!password) errs.password = 'La contraseña es requerida';
        else if (password.length < 6) errs.password = 'Mínimo 6 caracteres';
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;
        createMutation.mutate({
            email: email.trim(),
            display_name: displayName.trim(),
            phone: phone.trim(),
            password,
            default_facility_id: facilityId === 'none' ? null : facilityId,
        });
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Nuevo recepcionista</DialogTitle>
                    <DialogDescription>
                        Crea una cuenta de recepción. El recepcionista podrá iniciar sesión de inmediato.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="grid gap-4 py-2">
                    <div className="grid gap-2">
                        <Label htmlFor="create-display-name">Nombre completo *</Label>
                        <Input
                            id="create-display-name"
                            placeholder="Ej. Ana García"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            disabled={createMutation.isPending}
                        />
                        {errors.displayName && (
                            <p className="text-xs text-destructive">{errors.displayName}</p>
                        )}
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="create-email">Correo electrónico *</Label>
                        <Input
                            id="create-email"
                            type="email"
                            placeholder="recepcion@bmbstudio.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={createMutation.isPending}
                        />
                        {errors.email && (
                            <p className="text-xs text-destructive">{errors.email}</p>
                        )}
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="create-phone">Teléfono</Label>
                        <Input
                            id="create-phone"
                            placeholder="55 1234 5678"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            disabled={createMutation.isPending}
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="create-password">Contraseña *</Label>
                        <Input
                            id="create-password"
                            type="password"
                            placeholder="Mínimo 6 caracteres"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={createMutation.isPending}
                        />
                        {errors.password && (
                            <p className="text-xs text-destructive">{errors.password}</p>
                        )}
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="create-facility">Sucursal asignada</Label>
                        <Select
                            value={facilityId}
                            onValueChange={setFacilityId}
                            disabled={createMutation.isPending}
                        >
                            <SelectTrigger id="create-facility">
                                <SelectValue placeholder="Seleccionar sucursal..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">— Sin asignar —</SelectItem>
                                {facilities.map((f) => (
                                    <SelectItem key={f.id} value={f.id}>
                                        {f.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <DialogFooter className="mt-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleOpenChange(false)}
                            disabled={createMutation.isPending}
                        >
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={createMutation.isPending}>
                            {createMutation.isPending && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Crear recepcionista
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// ─── Edit Dialog ──────────────────────────────────────────────────────────────

interface EditDialogProps {
    staff: ReceptionStaff | null;
    onOpenChange: (open: boolean) => void;
    facilities: Facility[];
}

function EditReceptionistDialog({ staff, onOpenChange, facilities }: EditDialogProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [displayName, setDisplayName] = useState(staff?.display_name ?? '');
    const [facilityId, setFacilityId] = useState<string>(staff?.default_facility_id ?? 'none');
    const [isActive, setIsActive] = useState(staff?.is_active ?? true);

    // Keep local state in sync when staff prop changes (dialog re-opens for a different row)
    useState(() => {
        setDisplayName(staff?.display_name ?? '');
        setFacilityId(staff?.default_facility_id ?? 'none');
        setIsActive(staff?.is_active ?? true);
    });

    const editMutation = useMutation({
        mutationFn: async (body: {
            display_name: string;
            default_facility_id: string | null;
            is_active: boolean;
        }) => {
            const { data } = await api.put(`/users/${staff!.id}/staff`, body);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['reception-staff'] });
            toast({ title: 'Recepcionista actualizado' });
            onOpenChange(false);
        },
        onError: (error: unknown) => {
            toast({
                variant: 'destructive',
                title: 'Error al actualizar',
                description: getErrorMessage(error),
            });
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!displayName.trim()) return;
        editMutation.mutate({
            display_name: displayName.trim(),
            default_facility_id: facilityId === 'none' ? null : facilityId,
            is_active: isActive,
        });
    };

    return (
        <Dialog open={!!staff} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[460px]">
                <DialogHeader>
                    <DialogTitle>Editar recepcionista</DialogTitle>
                    <DialogDescription>{staff?.email}</DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="grid gap-4 py-2">
                    <div className="grid gap-2">
                        <Label htmlFor="edit-display-name">Nombre completo *</Label>
                        <Input
                            id="edit-display-name"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            disabled={editMutation.isPending}
                            required
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="edit-facility">Sucursal asignada</Label>
                        <Select
                            value={facilityId}
                            onValueChange={setFacilityId}
                            disabled={editMutation.isPending}
                        >
                            <SelectTrigger id="edit-facility">
                                <SelectValue placeholder="Seleccionar sucursal..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">— Sin asignar —</SelectItem>
                                {facilities.map((f) => (
                                    <SelectItem key={f.id} value={f.id}>
                                        {f.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                            <Label htmlFor="edit-is-active" className="text-base cursor-pointer">
                                Cuenta activa
                            </Label>
                            <p className="text-xs text-muted-foreground">
                                Las cuentas inactivas no pueden iniciar sesión
                            </p>
                        </div>
                        <Switch
                            id="edit-is-active"
                            checked={isActive}
                            onCheckedChange={setIsActive}
                            disabled={editMutation.isPending}
                        />
                    </div>

                    <DialogFooter className="mt-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={editMutation.isPending}
                        >
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={editMutation.isPending || !displayName.trim()}>
                            {editMutation.isPending && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Guardar cambios
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function ReceptionStaffContent() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editingStaff, setEditingStaff] = useState<ReceptionStaff | null>(null);
    const { user } = useAuthStore();
    const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

    // ── Confirmation dialog states ───────────────────────────────────────────
    const [roleConfirm, setRoleConfirm] = useState<RoleConfirm | null>(null);
    const [masterConfirm, setMasterConfirm] = useState<ToggleMasterConfirm | null>(null);
    const [activeConfirm, setActiveConfirm] = useState<ToggleActiveConfirm | null>(null);
    const [resendConfirm, setResendConfirm] = useState<ResendConfirm | null>(null);

    const { data: staffList = [], isLoading, isError } = useQuery<ReceptionStaff[]>({
        queryKey: ['reception-staff'],
        queryFn: async () => {
            const { data } = await api.get('/users/reception?include_admins=true');
            return Array.isArray(data) ? data : [];
        },
    });

    const { data: facilities = [] } = useQuery<Facility[]>({
        queryKey: ['facilities'],
        queryFn: async () => {
            const { data } = await api.get('/facilities');
            return Array.isArray(data) ? data : [];
        },
    });

    // ── Change role mutation ──────────────────────────────────────────────────
    const changeRole = useMutation({
        mutationFn: async ({ id, role }: { id: string; role: 'admin' | 'reception' }) => {
            const { data } = await api.put(`/users/${id}/role`, { role });
            return data;
        },
        onSuccess: (_, vars) => {
            queryClient.invalidateQueries({ queryKey: ['reception-staff'] });
            toast({
                title: vars.role === 'admin'
                    ? 'Promovido a Admin'
                    : 'Rol cambiado a Recepción',
                description: vars.role === 'admin'
                    ? 'La persona debe cerrar sesión y volver a entrar para que tome efecto.'
                    : 'La persona debe cerrar sesión y volver a entrar para que tome efecto.',
            });
            setRoleConfirm(null);
        },
        onError: (e: unknown) => {
            toast({ variant: 'destructive', title: 'Error al cambiar rol', description: getErrorMessage(e) });
            setRoleConfirm(null);
        },
    });

    const toggleMaster = useMutation({
        mutationFn: async ({ id, value }: { id: string; value: boolean }) =>
            api.put(`/users/${id}/reception-master`, { value }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['reception-staff'] });
            toast({
                title: 'Permiso actualizado',
                description: 'La persona debe cerrar sesión y volver a entrar para que tome efecto.',
            });
            setMasterConfirm(null);
        },
        onError: (error: unknown) => {
            toast({
                variant: 'destructive',
                title: 'Error al actualizar permiso',
                description: getErrorMessage(error),
            });
            setMasterConfirm(null);
        },
    });

    const [permTarget, setPermTarget] = useState<ReceptionStaff | null>(null);
    const [permDraft, setPermDraft] = useState<PermissionMap | null>(null);
    const savePerms = useMutation({
        mutationFn: async ({ id, permissions }: { id: string; permissions: PermissionMap }) =>
            api.put(`/users/${id}/permissions`, { permissions }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['reception-staff'] });
            toast({ title: 'Permisos actualizados' });
            setPermTarget(null); setPermDraft(null);
        },
        onError: (e: unknown) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(e) }),
    });

    // Reenviar credenciales: resetea la contraseña y la manda por correo; devuelve la nueva por si falla el envío.
    const [credResult, setCredResult] = useState<{ name: string; email: string | null; password: string; emailSent: boolean } | null>(null);
    const resendMutation = useMutation({
        mutationFn: async (member: ReceptionStaff) => {
            const { data } = await api.post(`/users/${member.id}/resend-credentials`);
            return { member, data };
        },
        onSuccess: ({ member, data }) => {
            setResendConfirm(null);
            setCredResult({
                name: member.display_name,
                email: data?.channels?.email ?? member.email ?? null,
                password: data?.tempPassword ?? '',
                emailSent: !!data?.emailSent,
            });
        },
        onError: (e: unknown) => {
            setResendConfirm(null);
            toast({ variant: 'destructive', title: 'Error al reenviar', description: getErrorMessage(e) });
        },
    });

    // Desactivar / reactivar (forma segura de "borrar": le quita el acceso sin romper su historial).
    const toggleActive = useMutation({
        mutationFn: async ({ id, value }: { id: string; value: boolean }) =>
            api.put(`/users/${id}/staff`, { is_active: value }),
        onSuccess: (_, vars) => {
            queryClient.invalidateQueries({ queryKey: ['reception-staff'] });
            toast({ title: vars.value ? 'Cuenta reactivada' : 'Cuenta desactivada' });
            setActiveConfirm(null);
        },
        onError: (e: unknown) => {
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(e) });
            setActiveConfirm(null);
        },
    });

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-heading font-bold">Equipo</h1>
                    <p className="text-muted-foreground">
                        Gestiona el personal de recepción, sus roles y sucursales asignadas.
                    </p>
                </div>
                {isAdmin && (
                    <Button onClick={() => setIsCreateOpen(true)}>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Nuevo recepcionista
                    </Button>
                )}
            </div>

            {/* Table */}
            <div className="rounded-md border bg-card overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nombre</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Teléfono</TableHead>
                            <TableHead>Sucursal</TableHead>
                            <TableHead>Master</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-10">
                                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                                </TableCell>
                            </TableRow>
                        ) : isError ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-10 text-destructive">
                                    Error al cargar equipo. Intenta de nuevo.
                                </TableCell>
                            </TableRow>
                        ) : staffList.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                                    <UserX className="h-8 w-8 mx-auto mb-2 opacity-40" />
                                    No hay recepcionistas registrados.
                                </TableCell>
                            </TableRow>
                        ) : (
                            staffList.map((member) => {
                                const isAdminRow = member.role === 'admin';
                                const isSelf = user?.id === member.id;
                                return (
                                    <TableRow
                                        key={member.id}
                                        className={!member.is_active ? 'opacity-60 bg-muted/30' : ''}
                                    >
                                        {/* Name + role badge */}
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-2">
                                                <span>{member.display_name}</span>
                                                {isAdminRow ? (
                                                    <Badge
                                                        variant="outline"
                                                        className="bg-bmb-gold/20 text-bmb-deepgold border-bmb-gold/40 text-[10px] px-1.5 py-0 font-semibold"
                                                    >
                                                        Admin
                                                    </Badge>
                                                ) : (
                                                    <Badge
                                                        variant="outline"
                                                        className="text-muted-foreground text-[10px] px-1.5 py-0"
                                                    >
                                                        Recepción
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-sm">
                                            {member.email}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-sm">
                                            {member.phone || '—'}
                                        </TableCell>
                                        <TableCell>
                                            {member.facility_name ? (
                                                <Badge
                                                    variant="outline"
                                                    className="text-blue-600 border-blue-200 bg-blue-50"
                                                >
                                                    {member.facility_name}
                                                </Badge>
                                            ) : (
                                                <span className="text-muted-foreground text-sm italic">
                                                    — sin asignar —
                                                </span>
                                            )}
                                        </TableCell>
                                        {/* Master switch: only for reception rows */}
                                        <TableCell>
                                            {!isAdminRow ? (
                                                <div className="flex items-center gap-2">
                                                    <Switch
                                                        checked={member.is_reception_master === true}
                                                        onCheckedChange={(checked) =>
                                                            setMasterConfirm({ member, value: checked })
                                                        }
                                                        disabled={toggleMaster.isPending || !isAdmin}
                                                        aria-label={`Permiso Master para ${member.display_name}`}
                                                        title={isAdmin ? undefined : 'Solo un administrador puede asignar Master'}
                                                    />
                                                    {member.is_reception_master && (
                                                        <span
                                                            className="inline-flex items-center rounded-sm bg-bmb-gold/20 px-1.5 py-0.5 text-[10px] font-semibold text-bmb-deepgold"
                                                            title="Recepcionista elevado: puede operar otras sucursales y accesos avanzados"
                                                        >
                                                            ★
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground text-xs italic">—</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {member.is_active ? (
                                                <Badge
                                                    variant="outline"
                                                    className="text-green-600 border-green-200 bg-green-50"
                                                >
                                                    Activo
                                                </Badge>
                                            ) : (
                                                <Badge
                                                    variant="outline"
                                                    className="text-gray-500 border-gray-200 bg-gray-50"
                                                >
                                                    Inactivo
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {isAdmin && (
                                                <div className="flex items-center justify-end gap-1">
                                                    {/* Permisos granulares: solo recepción */}
                                                    {!isAdminRow && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => { setPermTarget(member); setPermDraft(effectivePermissions(member.permissions)); }}
                                                        >
                                                            Permisos
                                                        </Button>
                                                    )}

                                                    {/* Promover / degradar rol (no a uno mismo) */}
                                                    {!isSelf && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className={isAdminRow
                                                                ? 'text-muted-foreground hover:text-foreground'
                                                                : 'text-bmb-deepgold hover:text-bmb-deepgold hover:bg-bmb-gold/10'
                                                            }
                                                            title={isAdminRow ? 'Quitar admin' : 'Hacer admin'}
                                                            disabled={changeRole.isPending}
                                                            onClick={() =>
                                                                setRoleConfirm({
                                                                    member,
                                                                    targetRole: isAdminRow ? 'reception' : 'admin',
                                                                })
                                                            }
                                                        >
                                                            {isAdminRow
                                                                ? <ShieldOff className="h-4 w-4 mr-1" />
                                                                : <ShieldCheck className="h-4 w-4 mr-1" />
                                                            }
                                                            {isAdminRow ? 'Quitar admin' : 'Hacer admin'}
                                                        </Button>
                                                    )}

                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => setEditingStaff(member)}
                                                        title="Editar"
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                        <span className="sr-only">Editar</span>
                                                    </Button>

                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        title="Reenviar credenciales"
                                                        disabled={resendMutation.isPending}
                                                        onClick={() => setResendConfirm({ member })}
                                                    >
                                                        {resendMutation.isPending && resendMutation.variables?.id === member.id
                                                            ? <Loader2 className="h-4 w-4 animate-spin" />
                                                            : <KeyRound className="h-4 w-4" />}
                                                        <span className="sr-only">Reenviar credenciales</span>
                                                    </Button>

                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        title={member.is_active ? 'Desactivar (quitar acceso)' : 'Reactivar'}
                                                        className={member.is_active ? 'text-destructive hover:text-destructive' : 'text-emerald-600 hover:text-emerald-700'}
                                                        disabled={toggleActive.isPending}
                                                        onClick={() =>
                                                            setActiveConfirm({ member, value: !member.is_active })
                                                        }
                                                    >
                                                        {member.is_active ? <Power className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                                                        <span className="sr-only">{member.is_active ? 'Desactivar' : 'Reactivar'}</span>
                                                    </Button>
                                                </div>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Create Dialog */}
            <CreateReceptionistDialog
                open={isCreateOpen}
                onOpenChange={setIsCreateOpen}
                facilities={facilities}
            />

            {/* Edit Dialog */}
            <EditReceptionistDialog
                staff={editingStaff}
                onOpenChange={(open) => { if (!open) setEditingStaff(null); }}
                facilities={facilities}
            />

            {/* Permissions Dialog (solo recepción) */}
            <Dialog open={!!permTarget} onOpenChange={(o) => { if (!o) { setPermTarget(null); setPermDraft(null); } }}>
                <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[560px]">
                    <DialogHeader>
                        <DialogTitle>Permisos de {permTarget?.display_name}</DialogTitle>
                        <DialogDescription>{permTarget?.email}</DialogDescription>
                    </DialogHeader>
                    {permDraft && (
                        <PermissionEditor value={permDraft} onChange={setPermDraft}
                            actorIsAdmin={true} actorPerms={PRESET_MASTER} disabled={savePerms.isPending} />
                    )}
                    <DialogFooter className="mt-2">
                        <Button variant="outline" onClick={() => { setPermTarget(null); setPermDraft(null); }} disabled={savePerms.isPending}>Cancelar</Button>
                        <Button disabled={savePerms.isPending || !permTarget || !permDraft}
                            onClick={() => permTarget && permDraft && savePerms.mutate({ id: permTarget.id, permissions: permDraft })}>
                            {savePerms.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Guardar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Resultado de reenviar credenciales: muestra la nueva contraseña para copiar */}
            <Dialog open={!!credResult} onOpenChange={(o) => { if (!o) setCredResult(null); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Credenciales de {credResult?.name}</DialogTitle>
                        <DialogDescription>
                            {credResult?.emailSent
                                ? `Se enviaron por correo a ${credResult?.email}. También puedes copiarlas:`
                                : 'No se pudo enviar el correo — copia esta contraseña y compártela manualmente.'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label>Email</Label>
                        <Input readOnly value={credResult?.email ?? ''} className="font-mono" />
                        <Label>Contraseña nueva</Label>
                        <div className="flex items-center gap-2">
                            <Input readOnly value={credResult?.password ?? ''} className="font-mono" />
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => {
                                    navigator.clipboard.writeText(credResult?.password ?? '');
                                    toast({ title: 'Contraseña copiada' });
                                }}
                                title="Copiar"
                            >
                                <Copy className="h-4 w-4" />
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">La recepcionista deberá cambiarla en su primer inicio de sesión.</p>
                    </div>
                    <DialogFooter>
                        <Button onClick={() => setCredResult(null)}>Cerrar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── AlertDialog: cambiar rol (promover / degradar) ── */}
            <AlertDialog open={!!roleConfirm} onOpenChange={(o) => { if (!o) setRoleConfirm(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {roleConfirm?.targetRole === 'admin'
                                ? `¿Hacer admin a ${roleConfirm.member.display_name}?`
                                : `¿Quitar admin a ${roleConfirm?.member.display_name}?`
                            }
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {roleConfirm?.targetRole === 'admin'
                                ? `${roleConfirm.member.display_name} tendrá acceso total al panel de administración: clases, pagos, reportes y configuración. Deberá cerrar sesión y volver a entrar para que tome efecto.`
                                : `${roleConfirm?.member.display_name} volverá a ser recepcionista con acceso limitado. Deberá cerrar sesión y volver a entrar para que tome efecto.`
                            }
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={changeRole.isPending}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={changeRole.isPending}
                            className={roleConfirm?.targetRole === 'admin'
                                ? 'bg-bmb-gold/80 text-bmb-deepgold hover:bg-bmb-gold border border-bmb-gold/40'
                                : ''
                            }
                            onClick={() => {
                                if (roleConfirm) {
                                    changeRole.mutate({ id: roleConfirm.member.id, role: roleConfirm.targetRole });
                                }
                            }}
                        >
                            {changeRole.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {roleConfirm?.targetRole === 'admin' ? 'Sí, hacer admin' : 'Sí, quitar admin'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* ── AlertDialog: toggle reception master ── */}
            <AlertDialog open={!!masterConfirm} onOpenChange={(o) => { if (!o) setMasterConfirm(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {masterConfirm?.value
                                ? `¿Activar Master para ${masterConfirm.member.display_name}?`
                                : `¿Desactivar Master para ${masterConfirm?.member.display_name}?`
                            }
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {masterConfirm?.value
                                ? `${masterConfirm.member.display_name} podrá operar en todas las sucursales y tendrá accesos avanzados de recepción.`
                                : `${masterConfirm?.member.display_name} quedará como recepcionista estándar, limitada a su sucursal asignada.`
                            }
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={toggleMaster.isPending}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={toggleMaster.isPending}
                            onClick={() => {
                                if (masterConfirm) {
                                    toggleMaster.mutate({ id: masterConfirm.member.id, value: masterConfirm.value });
                                }
                            }}
                        >
                            {toggleMaster.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Confirmar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* ── AlertDialog: desactivar / reactivar cuenta ── */}
            <AlertDialog open={!!activeConfirm} onOpenChange={(o) => { if (!o) setActiveConfirm(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {activeConfirm?.value
                                ? `¿Reactivar a ${activeConfirm.member.display_name}?`
                                : `¿Desactivar a ${activeConfirm?.member.display_name}?`
                            }
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {activeConfirm?.value
                                ? `${activeConfirm.member.display_name} podrá volver a iniciar sesión.`
                                : `${activeConfirm?.member.display_name} perderá el acceso al sistema de inmediato. Su historial se conserva.`
                            }
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={toggleActive.isPending}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={toggleActive.isPending}
                            className={!activeConfirm?.value ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
                            onClick={() => {
                                if (activeConfirm) {
                                    toggleActive.mutate({ id: activeConfirm.member.id, value: activeConfirm.value });
                                }
                            }}
                        >
                            {toggleActive.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {activeConfirm?.value ? 'Sí, reactivar' : 'Sí, desactivar'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* ── AlertDialog: reenviar credenciales ── */}
            <AlertDialog open={!!resendConfirm} onOpenChange={(o) => { if (!o) setResendConfirm(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {`¿Generar nueva contraseña para ${resendConfirm?.member.display_name}?`}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Se generará una contraseña temporal y se intentará enviar por correo a{' '}
                            <strong>{resendConfirm?.member.email}</strong>. La contraseña actual dejará de funcionar.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={resendMutation.isPending}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={resendMutation.isPending}
                            onClick={() => {
                                if (resendConfirm) {
                                    resendMutation.mutate(resendConfirm.member);
                                }
                            }}
                        >
                            {resendMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Sí, generar y enviar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

export default function ReceptionStaffList() {
    return (
        <AuthGuard requiredRoles={['admin', 'super_admin']}>
            <AdminLayout>
                <ReceptionStaffContent />
            </AdminLayout>
        </AuthGuard>
    );
}
