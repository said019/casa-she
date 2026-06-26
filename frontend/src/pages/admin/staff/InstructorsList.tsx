import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api, { getErrorMessage } from '@/lib/api';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
// Avatar not used - using custom img for better quality display
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Plus, MoreHorizontal, Pencil, Trash2, User, Camera, Upload, Mail, GitMerge, AlertTriangle, MessageCircle } from 'lucide-react';
import type { Instructor as BaseInstructor } from '@/types/class';
import type { User as AuthUser } from '@/types/auth'; // Import User type

// La lista admin trae además class_count (clases no canceladas) y, con el LEFT JOIN
// del backend, también coaches SIN cuenta (user_id/email nulos) que suelen ser duplicados.
type Instructor = Omit<BaseInstructor, 'user_id' | 'email'> & {
    user_id?: string | null;
    email?: string | null;
    class_count?: number;
};

// Schema for form — userId is optional (not needed when creating from email)
const instructorSchema = z.object({
    userId: z.string().optional(),
    displayName: z.string().min(2, 'El nombre es requerido'),
    email: z.string().email('Email inválido'),
    bio: z.string().optional(),
    tagline: z.string().max(200, 'Máximo 200 caracteres').optional(),
    phone: z.string().optional(),
    priorities: z.string().optional(), // We'll handle splitting by newline
    isActive: z.boolean().default(true),
    visiblePublic: z.boolean().default(true),
});

type InstructorForm = z.infer<typeof instructorSchema>;

export default function InstructorsList() {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingInstructor, setEditingInstructor] = useState<Instructor | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [showCredentials, setShowCredentials] = useState<{coachNumber?: string; email?: string; password: string} | null>(null);
    const [linkedUser, setLinkedUser] = useState<AuthUser | null>(null); // user found by email search
    const [mergingInstructor, setMergingInstructor] = useState<Instructor | null>(null); // source coach for merge
    const [mergeTargetId, setMergeTargetId] = useState<string>(''); // destination coach id
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Form setup
    const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<InstructorForm>({
        resolver: zodResolver(instructorSchema),
        defaultValues: {
            isActive: true,
            visiblePublic: true,
            email: '',
        },
    });

    // Watch email to auto-search for existing users
    const watchedEmail = watch('email');

    // Fetch Instructors
    const { data: instructors, isLoading } = useQuery<Instructor[]>({
        queryKey: ['instructors'],
        queryFn: async () => {
            const { data } = await api.get('/instructors?all=true');
            return data;
        },
    });

    // Auto-search for existing user when email changes (only when creating)
    const { data: foundUsers } = useQuery<AuthUser[]>({
        queryKey: ['users-search-email', watchedEmail],
        queryFn: async () => {
            if (!watchedEmail || watchedEmail.length < 3) return [];
            const { data } = await api.get(`/users?search=${watchedEmail}&limit=3`);
            return data.users || [];
        },
        enabled: isDialogOpen && !editingInstructor && !!watchedEmail && watchedEmail.length >= 3,
    });

    // Create Mutation
    const createMutation = useMutation({
        mutationFn: async (data: any) => {
            return await api.post('/instructors', data);
        },
        onSuccess: (response) => {
            queryClient.invalidateQueries({ queryKey: ['instructors'] });
            const creds = response.data?.credentials;
            if (creds) {
                // New user was created — show credentials
                setShowCredentials({
                    email: creds.email,
                    password: creds.password,
                    coachNumber: creds.coachNumber,
                });
            }
            toast({ title: 'Instructor creado', description: 'El instructor ha sido registrado.' });
            setIsDialogOpen(false);
            setLinkedUser(null);
            reset();
        },
        onError: (error) => {
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(error) });
        },
    });

    // Update Mutation
    const updateMutation = useMutation({
        mutationFn: async ({ id, data }: { id: string; data: any }) => {
            return await api.put(`/instructors/${id}`, data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['instructors'] });
            toast({ title: 'Instructor actualizado', description: 'Los datos han sido actualizados.' });
            setIsDialogOpen(false);
            setEditingInstructor(null);
            reset();
        },
        onError: (error) => {
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(error) });
        },
    });

    // Delete Mutation
    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            return (await api.delete(`/instructors/${id}`)).data as { message?: string; deleted?: boolean };
        },
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: ['instructors'] });
            toast({
                title: res?.deleted ? 'Instructor eliminado' : 'Instructor desactivado',
                description: res?.message ?? 'Listo.',
            });
        },
        onError: (error) => {
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(error) });
        },
    });

    // Merge Mutation — mueve clases/horarios/reseñas/sustituciones del coach origen al destino
    const mergeMutation = useMutation({
        mutationFn: async ({ id, targetId }: { id: string; targetId: string }) => {
            return (await api.post(`/instructors/${id}/merge`, { targetId })).data as {
                message: string;
                classes: number;
                schedules: number;
            };
        },
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: ['instructors'] });
            toast({ title: 'Coaches fusionados', description: res?.message ?? 'Listo.' });
            setMergingInstructor(null);
            setMergeTargetId('');
        },
        onError: (error) => {
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(error) });
        },
    });

    const handleMerge = (instructor: Instructor) => {
        setMergeTargetId('');
        setMergingInstructor(instructor);
    };

    const onSubmit = (data: InstructorForm) => {
        // Process priorities/specialties
        const specialtiesArray = data.priorities
            ? data.priorities.split('\n').map(s => s.trim()).filter(s => s !== '')
            : [];

        const payload: any = {
            displayName: data.displayName,
            email: data.email,
            bio: data.bio,
            tagline: data.tagline,
            phone: data.phone,
            priorities: specialtiesArray,
            isActive: data.isActive,
            visiblePublic: data.visiblePublic,
        };

        // If we have a linked user, send userId
        if (linkedUser) {
            payload.userId = linkedUser.id;
        } else if (data.userId) {
            payload.userId = data.userId;
        }

        if (photoPreview) {
            payload.photoUrl = photoPreview;
        }

        if (editingInstructor) {
            updateMutation.mutate({ id: editingInstructor.id, data: payload });
        } else {
            createMutation.mutate(payload);
        }
    };

    const handleEdit = (instructor: Instructor) => {
        setEditingInstructor(instructor);
        setPhotoPreview(null); // Reset photo preview
        setValue('userId', instructor.user_id || '');
        setValue('displayName', instructor.display_name);
        setValue('email', instructor.email || '');
        setValue('bio', instructor.bio || '');
        setValue('tagline', instructor.tagline || '');
        setValue('phone', instructor.instructor_phone || instructor.user_phone || '');
        setValue('priorities', instructor.specialties?.join('\n') || '');
        setValue('isActive', instructor.is_active);
        setValue('visiblePublic', instructor.visible_public ?? true);
        setIsDialogOpen(true);
    };

    const handleCreate = () => {
        setEditingInstructor(null);
        setPhotoPreview(null);
        setLinkedUser(null);
        reset();
        setIsDialogOpen(true);
    };

    const handleLinkUser = (user: AuthUser) => {
        setLinkedUser(user);
        setValue('userId', user.id);
        setValue('displayName', user.display_name);
        setValue('email', user.email || '');
    };

    const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    // Process and optimize image
    const processImage = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const MAX_WIDTH = 700;
                    const MAX_HEIGHT = 875;
                    const QUALITY = 0.85;

                    let { width, height } = img;

                    // Calculate new dimensions maintaining aspect ratio
                    if (width > MAX_WIDTH || height > MAX_HEIGHT) {
                        const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
                        width = Math.round(width * ratio);
                        height = Math.round(height * ratio);
                    }

                    // Create canvas for image processing
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        reject(new Error('No se pudo procesar la imagen'));
                        return;
                    }

                    // Enable high quality rendering
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';

                    // Draw image on canvas
                    ctx.drawImage(img, 0, 0, width, height);

                    // Convert to optimized base64
                    const optimizedBase64 = canvas.toDataURL('image/jpeg', QUALITY);
                    resolve(optimizedBase64);
                };
                img.onerror = () => reject(new Error('Error al cargar imagen'));
                img.src = e.target?.result as string;
            };
            reader.onerror = () => reject(new Error('Error al leer archivo'));
            reader.readAsDataURL(file);
        });
    };

    // Handle file selection for photo
    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            toast({ variant: 'destructive', title: 'Error', description: 'Solo se permiten imagenes' });
            return;
        }

        // Validate file size (max 10MB before processing)
        if (file.size > 10 * 1024 * 1024) {
            toast({ variant: 'destructive', title: 'Error', description: 'La imagen no debe superar 10MB' });
            return;
        }

        try {
            // Process and optimize the image
            const optimizedImage = await processImage(file);
            setPhotoPreview(optimizedImage);
            toast({ title: 'Imagen procesada', description: 'La imagen se optimizo correctamente.' });
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo procesar la imagen' });
        }
    };

    // Upload photo mutation
    const uploadPhotoMutation = useMutation({
        mutationFn: async ({ id, photoData }: { id: string; photoData: string }) => {
            // Convert base64 data-URI to Blob and send as multipart/form-data
            const fetchRes = await fetch(photoData);
            const blob = await fetchRes.blob();
            const formData = new FormData();
            formData.append('photo', blob, 'photo.jpg');
            return await api.post(`/instructors/${id}/photo`, formData);
        },
        onSuccess: (response, variables) => {
            // Invalidate to refetch the list
            queryClient.invalidateQueries({ queryKey: ['instructors'] });
            
            // **FIX DEL BUG**: Actualizar el instructor en edición con la nueva foto
            if (editingInstructor) {
                setEditingInstructor({
                    ...editingInstructor,
                    photo_url: response.data.photo_url
                });
            }
            
            toast({ title: 'Foto actualizada', description: 'La foto del instructor ha sido actualizada.' });
        },
        onError: (error) => {
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(error) });
        },
    });

    // Generate coach access mutation
    const generateAccessMutation = useMutation({
        mutationFn: async (id: string) => {
            return await api.post(`/instructors/${id}/generate-access`);
        },
        onSuccess: (response) => {
            queryClient.invalidateQueries({ queryKey: ['instructors'] });
            setShowCredentials({
                coachNumber: response.data.coachNumber,
                email: response.data.email,
                password: response.data.tempPassword,
            });
            toast({ 
                title: 'Acceso generado', 
                description: 'Credenciales de coach creadas exitosamente.',
            });
        },
        onError: (error) => {
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(error) });
        },
    });

    // Reset coach password mutation
    const resetPasswordMutation = useMutation({
        mutationFn: async (id: string) => {
            return await api.post(`/instructors/${id}/reset-password`);
        },
        onSuccess: (response) => {
            setShowCredentials({
                coachNumber: response.data.coachNumber,
                email: response.data.email,
                password: response.data.tempPassword,
            });
            toast({ 
                title: 'Contraseña restablecida', 
                description: 'Nueva contraseña temporal generada.',
            });
        },
        onError: (error) => {
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(error) });
        },
    });

    // Send credentials mutation (email o WhatsApp)
    const sendCredentialsMutation = useMutation({
        mutationFn: async ({ id, email, phone, channel }: { id: string; email?: string; phone?: string; channel: 'email' | 'whatsapp' }) => {
            return await api.post(`/instructors/${id}/send-credentials`, { email, phone, channel });
        },
        onSuccess: (response) => {
            if (response.data.warning) {
                const title = response.data.needsDomainVerification
                    ? '⚠️ Resend requiere dominio verificado'
                    : 'Advertencia';

                toast({
                    variant: 'destructive',
                    title,
                    description: response.data.warning,
                    duration: 8000, // Longer duration for important messages
                });
                // Show credentials if delivery failed
                if (response.data.tempPassword) {
                    setShowCredentials({
                        email: response.data.email || response.data.phone,
                        password: response.data.tempPassword,
                    });
                }
            } else {
                toast({
                    title: '✅ Credenciales enviadas',
                    description: response.data.message || `Credenciales enviadas a ${response.data.email || response.data.phone}`,
                });
            }
        },
        onError: (error) => {
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(error) });
        },
    });

    // Indicadores de cuenta + clases para detectar registros duplicados
    const renderCoachStatus = (instructor: Instructor) => {
        const classCount = instructor.class_count ?? 0;
        const hasAccount = !!instructor.email;
        const isLikelyDuplicate = !hasAccount && classCount > 0;
        const accountNoClasses = hasAccount && classCount === 0;
        return (
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                    {hasAccount ? (
                        <Badge variant="secondary" className="text-xs">Con cuenta</Badge>
                    ) : (
                        <Badge className="text-xs border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-50">
                            Sin cuenta
                        </Badge>
                    )}
                    <span className="text-xs text-muted-foreground tabular-nums">
                        {classCount} {classCount === 1 ? 'clase' : 'clases'}
                    </span>
                </div>
                {isLikelyDuplicate && (
                    <Badge className="text-xs gap-1 border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-50">
                        <AlertTriangle className="h-3 w-3" />
                        Posible duplicado: tiene clases pero no cuenta
                    </Badge>
                )}
                {accountNoClasses && (
                    <span className="text-xs text-muted-foreground">Sin clases asignadas</span>
                )}
            </div>
        );
    };

    const renderActions = (instructor: Instructor) => (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                    <span className="sr-only">Abrir menú</span>
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => handleEdit(instructor)}>
                    <Pencil className="mr-2 h-4 w-4" /> Editar Perfil
                </DropdownMenuItem>
                {!instructor.coach_number ? (
                    <DropdownMenuItem
                        onClick={() => {
                            if (confirm('¿Generar acceso al portal de coach?')) {
                                generateAccessMutation.mutate(instructor.id);
                            }
                        }}
                    >
                        <User className="mr-2 h-4 w-4" /> Generar Acceso Coach
                    </DropdownMenuItem>
                ) : (
                    <>
                        <DropdownMenuItem
                            onClick={() => {
                                const email = instructor.email || prompt('Ingresa el email del instructor:');
                                if (email) {
                                    sendCredentialsMutation.mutate({ id: instructor.id, email, channel: 'email' });
                                }
                            }}
                        >
                            <Mail className="mr-2 h-4 w-4" /> Enviar Credenciales por Email
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => {
                                const phone = instructor.instructor_phone || instructor.user_phone
                                    || prompt('Ingresa el teléfono (con WhatsApp) del instructor:');
                                if (phone) {
                                    sendCredentialsMutation.mutate({
                                        id: instructor.id,
                                        phone,
                                        email: instructor.email || undefined,
                                        channel: 'whatsapp',
                                    });
                                }
                            }}
                        >
                            <MessageCircle className="mr-2 h-4 w-4" /> Enviar Credenciales por WhatsApp
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => {
                                if (confirm('¿Restablecer contraseña del coach?')) {
                                    resetPasswordMutation.mutate(instructor.id);
                                }
                            }}
                        >
                            <User className="mr-2 h-4 w-4" /> Resetear Contraseña
                        </DropdownMenuItem>
                    </>
                )}
                <DropdownMenuItem onClick={() => handleMerge(instructor)}>
                    <GitMerge className="mr-2 h-4 w-4" /> Fusionar coach
                </DropdownMenuItem>
                <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => {
                        if (confirm('¿Eliminar instructor? Si no tiene historial se borra; si tiene clases/pagos/reseñas, solo se desactiva.')) deleteMutation.mutate(instructor.id);
                    }}
                >
                    <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );

    return (
        <AuthGuard requiredRoles={['admin']}>
            <AdminLayout>
                <div className="space-y-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
                        <div>
                            <h1 className="text-3xl font-heading font-bold">Instructores</h1>
                            <p className="text-muted-foreground">Gestión del staff y perfiles.</p>
                        </div>
                        <Button onClick={handleCreate} className="w-full sm:w-auto">
                            <Plus className="mr-2 h-4 w-4" /> Nuevo Instructor
                        </Button>
                    </div>

                    {/* Desktop: tabla */}
                    <div className="hidden md:block rounded-md border bg-card overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Instructor</TableHead>
                                    <TableHead>Contacto</TableHead>
                                    <TableHead>Cuenta / Clases</TableHead>
                                    <TableHead>Especialidades</TableHead>
                                    <TableHead>Portal Coach</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-8">
                                            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                                        </TableCell>
                                    </TableRow>
                                ) : instructors?.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                            No hay instructores registrados.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    instructors?.map((instructor) => (
                                        <TableRow
                                            key={instructor.id}
                                            className={(!instructor.email && (instructor.class_count ?? 0) > 0)
                                                ? 'bg-amber-50/40 border-l-2 border-l-amber-400'
                                                : undefined}
                                        >
                                            <TableCell>
                                                <div className="flex items-center gap-4">
                                                    <div className="relative h-16 w-16 rounded-md overflow-hidden bg-muted flex-shrink-0">
                                                        {instructor.photo_url ? (
                                                            <img
                                                                src={instructor.photo_url}
                                                                alt={instructor.display_name}
                                                                className="h-full w-full object-cover object-top"
                                                            />
                                                        ) : (
                                                            <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
                                                                <User className="h-8 w-8 text-muted-foreground/40" />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <div className="font-medium text-base">{instructor.display_name}</div>
                                                        {instructor.bio && (
                                                            <div className="text-xs text-muted-foreground line-clamp-1 max-w-[200px]">
                                                                {instructor.bio}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col text-sm">
                                                    <span>{instructor.email}</span>
                                                    <span className="text-muted-foreground">
                                                        {instructor.instructor_phone || instructor.user_phone}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {renderCoachStatus(instructor)}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-1">
                                                    {instructor.specialties?.slice(0, 2).map((s, i) => (
                                                        <Badge key={i} variant="secondary" className="text-xs">{s}</Badge>
                                                    ))}
                                                    {(instructor.specialties?.length || 0) > 2 && (
                                                        <Badge variant="outline" className="text-xs">+{instructor.specialties!.length - 2}</Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-1">
                                                    {instructor.coach_number ? (
                                                        <>
                                                            <div className="flex items-center gap-1">
                                                                <Badge variant="default" className="text-xs">
                                                                    {instructor.coach_number}
                                                                </Badge>
                                                            </div>
                                                            {instructor.temp_password && (
                                                                <Badge variant="destructive" className="text-xs">
                                                                    Cambio de contraseña pendiente
                                                                </Badge>
                                                            )}
                                                            {instructor.last_login && (
                                                                <span className="text-xs text-muted-foreground">
                                                                    Último acceso: {new Date(instructor.last_login).toLocaleDateString()}
                                                                </span>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <Badge variant="outline" className="text-xs">Sin acceso</Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-1">
                                                    <Badge variant={instructor.is_active ? 'default' : 'secondary'}>
                                                        {instructor.is_active ? 'Activo' : 'Inactivo'}
                                                    </Badge>
                                                    {instructor.visible_public && instructor.is_active && (
                                                        <Badge variant="outline" className="text-xs">Visible público</Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {renderActions(instructor)}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Móvil: tarjetas apiladas */}
                    <div className="md:hidden space-y-3">
                        {isLoading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            </div>
                        ) : instructors?.length === 0 ? (
                            <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
                                No hay instructores registrados.
                            </div>
                        ) : (
                            instructors?.map((instructor) => (
                                <div
                                    key={instructor.id}
                                    className={`rounded-xl border bg-card p-4 ${
                                        !instructor.email && (instructor.class_count ?? 0) > 0
                                            ? 'border-amber-300 bg-amber-50/40'
                                            : ''
                                    }`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="relative h-16 w-16 rounded-md overflow-hidden bg-muted flex-shrink-0">
                                            {instructor.photo_url ? (
                                                <img
                                                    src={instructor.photo_url}
                                                    alt={instructor.display_name}
                                                    className="h-full w-full object-cover"
                                                />
                                            ) : (
                                                <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
                                                    <User className="h-7 w-7 text-muted-foreground/40" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="font-medium leading-tight">{instructor.display_name}</div>
                                                    <div className="text-xs text-muted-foreground break-all">{instructor.email}</div>
                                                    {(instructor.instructor_phone || instructor.user_phone) && (
                                                        <div className="text-xs text-muted-foreground">
                                                            {instructor.instructor_phone || instructor.user_phone}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="shrink-0">{renderActions(instructor)}</div>
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-1">
                                                <Badge variant={instructor.is_active ? 'default' : 'secondary'} className="text-xs">
                                                    {instructor.is_active ? 'Activo' : 'Inactivo'}
                                                </Badge>
                                                {instructor.coach_number ? (
                                                    <Badge variant="default" className="text-xs">{instructor.coach_number}</Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-xs">Sin acceso</Badge>
                                                )}
                                                {instructor.specialties?.slice(0, 3).map((s, i) => (
                                                    <Badge key={i} variant="secondary" className="text-xs">{s}</Badge>
                                                ))}
                                                {(instructor.specialties?.length || 0) > 3 && (
                                                    <Badge variant="outline" className="text-xs">+{instructor.specialties!.length - 3}</Badge>
                                                )}
                                            </div>
                                            <div className="mt-2">
                                                {renderCoachStatus(instructor)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <Dialog open={isDialogOpen} onOpenChange={(open) => {
                        setIsDialogOpen(open);
                        if (!open) setPhotoPreview(null);
                    }}>
                        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle>{editingInstructor ? 'Editar Instructor' : 'Nuevo Instructor'}</DialogTitle>
                                <DialogDescription>
                                    {editingInstructor ? 'Actualiza la información del perfil.' : 'Escribe el email del coach. Si ya tiene cuenta se vincula, si no, se crea automáticamente.'}
                                </DialogDescription>
                            </DialogHeader>

                            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                                {/* Email field — primary input for creating */}
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email del Coach</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        {...register('email')}
                                        placeholder="coach@ejemplo.com"
                                    />
                                    {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                                    
                                    {/* Show search results when creating */}
                                    {!editingInstructor && !linkedUser && foundUsers && foundUsers.length > 0 && watchedEmail && watchedEmail.length >= 3 && (
                                        <div className="border rounded-md max-h-32 overflow-y-auto bg-popover">
                                            {foundUsers.map(u => (
                                                <div
                                                    key={u.id}
                                                    className="p-2 hover:bg-muted cursor-pointer flex justify-between items-center text-sm"
                                                    onClick={() => handleLinkUser(u)}
                                                >
                                                    <span className="font-medium">{u.display_name}</span>
                                                    <span className="text-muted-foreground text-xs">{u.email}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Status indicator */}
                                    {!editingInstructor && linkedUser && (
                                        <div className="flex items-center justify-between p-2 rounded-md bg-green-50 border border-green-200">
                                            <div className="text-sm text-green-700 flex items-center gap-1.5">
                                                <User className="h-3.5 w-3.5" />
                                                Usuario encontrado: <strong>{linkedUser.display_name}</strong>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 text-xs text-green-700 hover:text-green-900"
                                                onClick={() => { setLinkedUser(null); setValue('userId', ''); }}
                                            >
                                                Cambiar
                                            </Button>
                                        </div>
                                    )}
                                    {!editingInstructor && !linkedUser && watchedEmail && watchedEmail.includes('@') && (
                                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                                            <Mail className="h-3 w-3" />
                                            Se creará una cuenta nueva con este email
                                        </p>
                                    )}
                                </div>

                                {/* Photo Upload Section - Only for editing */}
                                {editingInstructor && (
                                    <div className="space-y-3">
                                        <Label>Foto de Perfil</Label>
                                        <div className="flex gap-4">
                                            {/* Photo Preview - Larger aspect ratio matching instructor cards */}
                                            <div
                                                className="relative group cursor-pointer flex-shrink-0"
                                                onClick={() => fileInputRef.current?.click()}
                                            >
                                                <div className="relative w-32 h-40 rounded-md overflow-hidden bg-muted">
                                                    {(photoPreview || editingInstructor.photo_url) ? (
                                                        <img
                                                            src={photoPreview || editingInstructor.photo_url || undefined}
                                                            alt={editingInstructor.display_name}
                                                            className="w-full h-full object-cover object-top"
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
                                                            <User className="h-12 w-12 text-muted-foreground/40" />
                                                        </div>
                                                    )}
                                                    {/* Hover overlay */}
                                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Camera className="h-8 w-8 text-white" />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex-1 space-y-3 pt-2">
                                                <input
                                                    ref={fileInputRef}
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={handleFileSelect}
                                                />
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="w-full"
                                                    onClick={() => fileInputRef.current?.click()}
                                                >
                                                    <Upload className="h-4 w-4 mr-2" />
                                                    Seleccionar Foto
                                                </Button>
                                                {photoPreview && (
                                                    <p className="text-xs text-green-600 font-medium">
                                                        ✓ Foto lista — se guardará al hacer clic en Guardar
                                                    </p>
                                                )}
                                                <p className="text-xs text-muted-foreground">
                                                    JPG, PNG. Max 10MB. Se optimiza automáticamente.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <Label htmlFor="displayName">Nombre Público</Label>
                                    <Input id="displayName" {...register('displayName')} placeholder="Nombre visible en calendario" />
                                    {errors.displayName && <p className="text-xs text-destructive">{errors.displayName.message}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="bio">Biografía Corta</Label>
                                    <Textarea id="bio" {...register('bio')} placeholder="Experiencia, enfoque, etc." rows={3} />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="tagline">Frase del sitio público</Label>
                                    <Input id="tagline" {...register('tagline')} placeholder="Reformer & fuerza · reinventa tu mejor versión ⚡" maxLength={200} />
                                    {errors.tagline && <p className="text-xs text-destructive">{errors.tagline.message}</p>}
                                    <p className="text-xs text-muted-foreground">
                                        Frase corta que aparece bajo el nombre en la tarjeta de “El Equipo” del sitio.
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="phone">Teléfono (Opcional)</Label>
                                    <Input id="phone" {...register('phone')} placeholder="+52 123 456 7890" />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="priorities">Especialidades (una por línea)</Label>
                                    <Textarea
                                        id="priorities"
                                        {...register('priorities')}
                                        placeholder="Barre Studio&#10;Pilates Mat&#10;Hot Pilates"
                                        rows={3}
                                    />
                                </div>

                                <div className="flex items-center justify-between space-x-2 border p-3 rounded-md">
                                    <Label htmlFor="isActive">Estado Activo</Label>
                                    <Switch
                                        id="isActive"
                                        checked={watch('isActive')}
                                        onCheckedChange={(checked) => setValue('isActive', checked)}
                                    />
                                </div>

                                <div className="flex items-center justify-between space-x-2 border p-3 rounded-md">
                                    <div className="flex flex-col gap-1">
                                        <Label htmlFor="visiblePublic">Visible en Sitio Público</Label>
                                        <span className="text-xs text-muted-foreground">
                                            Mostrar en la sección de instructores del website
                                        </span>
                                    </div>
                                    <Switch
                                        id="visiblePublic"
                                        checked={watch('visiblePublic')}
                                        onCheckedChange={(checked) => setValue('visiblePublic', checked)}
                                    />
                                </div>

                                <DialogFooter>
                                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                                        Cancelar
                                    </Button>
                                    <Button type="submit" disabled={isSubmitting}>
                                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        {editingInstructor ? 'Guardar Cambios' : 'Registrar Instructor'}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>

                    {/* Credentials Display Dialog */}
                    <Dialog open={!!showCredentials} onOpenChange={() => setShowCredentials(null)}>
                        <DialogContent className="max-w-md">
                            <DialogHeader>
                                <DialogTitle>Credenciales de Coach</DialogTitle>
                                <DialogDescription>
                                    Guarda estas credenciales. La contraseña no se mostrará nuevamente.
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label>Email / Usuario</Label>
                                    <div className="flex items-center gap-2">
                                        <Input 
                                            value={showCredentials?.email || ''} 
                                            readOnly 
                                            className="font-mono"
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                navigator.clipboard.writeText(showCredentials?.email || '');
                                                toast({ title: 'Copiado', description: 'Email copiado' });
                                            }}
                                        >
                                            Copiar
                                        </Button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Contraseña Temporal</Label>
                                    <div className="flex items-center gap-2">
                                        <Input 
                                            value={showCredentials?.password || ''} 
                                            readOnly 
                                            className="font-mono"
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                navigator.clipboard.writeText(showCredentials?.password || '');
                                                toast({ title: 'Copiado', description: 'Contraseña copiada' });
                                            }}
                                        >
                                            Copiar
                                        </Button>
                                    </div>
                                </div>

                                <div className="bg-warning/10 border border-warning/30 rounded-md p-3">
                                    <p className="text-sm text-warning-foreground">
                                        ⚠️ El coach deberá cambiar esta contraseña en su primer inicio de sesión.
                                    </p>
                                </div>
                            </div>

                            <DialogFooter>
                                <Button onClick={() => setShowCredentials(null)}>
                                    Cerrar
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    {/* Merge / Fusionar coach Dialog */}
                    <Dialog
                        open={!!mergingInstructor}
                        onOpenChange={(open) => {
                            if (!open) {
                                setMergingInstructor(null);
                                setMergeTargetId('');
                            }
                        }}
                    >
                        <DialogContent className="max-w-md">
                            <DialogHeader>
                                <DialogTitle>Fusionar coach</DialogTitle>
                                <DialogDescription>
                                    Mueve las clases y horarios de{' '}
                                    <strong>{mergingInstructor?.display_name}</strong> a otro coach y
                                    desactiva a <strong>{mergingInstructor?.display_name}</strong>. Úsalo
                                    para unir registros duplicados de la misma persona.
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-3 py-2">
                                <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                                    <span>
                                        Esta acción mueve clases, horarios, reseñas y sustituciones, y
                                        desactiva al coach origen. No se puede deshacer fácilmente.
                                    </span>
                                </div>

                                <div className="space-y-2">
                                    <Label>Coach destino</Label>
                                    <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Elige el coach que conserva las clases" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {instructors
                                                ?.filter((i) => i.id !== mergingInstructor?.id)
                                                .map((i) => (
                                                    <SelectItem key={i.id} value={i.id}>
                                                        {i.display_name} ·{' '}
                                                        {i.email || 'sin cuenta'} · {i.class_count ?? 0}{' '}
                                                        {(i.class_count ?? 0) === 1 ? 'clase' : 'clases'}
                                                    </SelectItem>
                                                ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        setMergingInstructor(null);
                                        setMergeTargetId('');
                                    }}
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    type="button"
                                    variant="destructive"
                                    disabled={!mergeTargetId || mergeMutation.isPending}
                                    onClick={() => {
                                        if (mergingInstructor && mergeTargetId) {
                                            mergeMutation.mutate({
                                                id: mergingInstructor.id,
                                                targetId: mergeTargetId,
                                            });
                                        }
                                    }}
                                >
                                    {mergeMutation.isPending && (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    )}
                                    Fusionar
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                </div>
            </AdminLayout>
        </AuthGuard>
    );
}
