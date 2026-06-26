import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
    Mail,
    Phone,
    Award,
    Calendar,
    Users,
    TrendingUp,
    CheckCircle2,
    Camera,
    Loader2,
    Pencil,
    Save,
    X,
    Plus,
    KeyRound,
    Clock,
    Star,
} from 'lucide-react';
import CoachLayout from '@/components/layout/CoachLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import api, { getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/hooks/use-toast';

interface AvailabilitySlot {
    day_of_week: number;
    start_time: string;
    end_time: string;
    is_available: boolean;
}

interface InstructorProfile {
    id: string;
    user_id: string;
    display_name: string;
    bio: string | null;
    tagline: string | null;
    photo_url: string | null;
    specialties: string[];
    certifications: string[];
    email: string;
    phone: string | null;
    is_active: boolean;
    visible_public: boolean;
    coach_number: number | null;
    availability: AvailabilitySlot[];
}

interface InstructorStats {
    total_classes_taught: number;
    total_bookings: number;
    total_checkins: number;
    attendance_rate: number;
    classes_this_week: number;
    bookings_this_week: number;
    avg_occupancy: number;
    avg_rating: number | null;
    total_reviews: number;
}

// Lun → Dom (orden de visualización; el valor PG es 0=Dom..6=Sáb)
const DAY_ROWS: { value: number; label: string }[] = [
    { value: 1, label: 'Lunes' },
    { value: 2, label: 'Martes' },
    { value: 3, label: 'Miércoles' },
    { value: 4, label: 'Jueves' },
    { value: 5, label: 'Viernes' },
    { value: 6, label: 'Sábado' },
    { value: 0, label: 'Domingo' },
];

function getInitials(name: string) {
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

function trimTime(t: string | null | undefined) {
    if (!t) return '';
    // PG TIME usually comes as "HH:MM:SS"; HTML input type=time needs "HH:MM"
    return t.length >= 5 ? t.slice(0, 5) : t;
}

export default function CoachProfile() {
    const { user } = useAuthStore();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { data: instructor, isLoading } = useQuery<InstructorProfile>({
        queryKey: ['instructor-me'],
        queryFn: async () => {
            const response = await api.get('/instructors/me');
            return response.data;
        },
        enabled: !!user?.id,
    });

    const { data: stats, isLoading: loadingStats } = useQuery<InstructorStats>({
        queryKey: ['instructor-me-stats', instructor?.id],
        queryFn: async () => {
            const response = await api.get(`/instructors/${instructor?.id}/stats`);
            return response.data;
        },
        enabled: !!instructor?.id,
    });

    // ===== Sección: Información personal =====
    const [editingInfo, setEditingInfo] = useState(false);
    const [infoForm, setInfoForm] = useState({ displayName: '', bio: '', tagline: '', phone: '' });

    useEffect(() => {
        if (instructor && !editingInfo) {
            setInfoForm({
                displayName: instructor.display_name || '',
                bio: instructor.bio || '',
                tagline: instructor.tagline || '',
                phone: instructor.phone || '',
            });
        }
    }, [instructor, editingInfo]);

    const updateInfoMutation = useMutation({
        mutationFn: async () => {
            const res = await api.put('/instructors/me', infoForm);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['instructor-me'] });
            setEditingInfo(false);
            toast({ title: 'Perfil actualizado' });
        },
        onError: (e) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(e) }),
    });

    // ===== Sección: Especialidades / Certificaciones =====
    const [specialties, setSpecialties] = useState<string[]>([]);
    const [certifications, setCertifications] = useState<string[]>([]);
    const [editingTags, setEditingTags] = useState(false);
    const [newSpecialty, setNewSpecialty] = useState('');
    const [newCertification, setNewCertification] = useState('');

    useEffect(() => {
        if (instructor && !editingTags) {
            setSpecialties(instructor.specialties || []);
            setCertifications(instructor.certifications || []);
        }
    }, [instructor, editingTags]);

    const updateTagsMutation = useMutation({
        mutationFn: async () => {
            const res = await api.put('/instructors/me', { specialties, certifications });
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['instructor-me'] });
            setEditingTags(false);
            toast({ title: 'Especialidades y certificaciones guardadas' });
        },
        onError: (e) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(e) }),
    });

    // ===== Sección: Foto =====
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast({ variant: 'destructive', title: 'Error', description: 'Solo se permiten imágenes' });
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            toast({ variant: 'destructive', title: 'Error', description: 'La imagen no debe superar 10MB' });
            return;
        }
        setUploadingPhoto(true);
        try {
            const formData = new FormData();
            formData.append('photo', file, file.name);
            await api.post('/instructors/me/photo', formData);
            queryClient.invalidateQueries({ queryKey: ['instructor-me'] });
            toast({ title: 'Foto actualizada' });
        } catch (err) {
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) });
        } finally {
            setUploadingPhoto(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // ===== Sección: Disponibilidad =====
    type DayState = { is_available: boolean; start_time: string; end_time: string };
    const [editingAvail, setEditingAvail] = useState(false);
    const [availByDay, setAvailByDay] = useState<Record<number, DayState>>({});

    useEffect(() => {
        if (!instructor || editingAvail) return;
        const map: Record<number, DayState> = {};
        for (const row of DAY_ROWS) {
            map[row.value] = { is_available: false, start_time: '09:00', end_time: '18:00' };
        }
        for (const slot of instructor.availability || []) {
            map[slot.day_of_week] = {
                is_available: !!slot.is_available,
                start_time: trimTime(slot.start_time) || '09:00',
                end_time: trimTime(slot.end_time) || '18:00',
            };
        }
        setAvailByDay(map);
    }, [instructor, editingAvail]);

    const updateAvailMutation = useMutation({
        mutationFn: async () => {
            const availability = Object.entries(availByDay)
                .filter(([, v]) => v.is_available)
                .map(([day, v]) => ({
                    day_of_week: Number(day),
                    start_time: v.start_time,
                    end_time: v.end_time,
                    is_available: true,
                }));
            const res = await api.put('/instructors/me/availability', { availability });
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['instructor-me'] });
            setEditingAvail(false);
            toast({ title: 'Disponibilidad actualizada' });
        },
        onError: (e) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(e) }),
    });

    // ===== Sección: Contraseña =====
    const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
    const changePwdMutation = useMutation({
        mutationFn: async () => {
            if (pwd.next.length < 6) throw new Error('La nueva contraseña debe tener al menos 6 caracteres');
            if (pwd.next !== pwd.confirm) throw new Error('Las contraseñas no coinciden');
            const res = await api.post('/auth/change-password', {
                currentPassword: pwd.current,
                newPassword: pwd.next,
            });
            return res.data;
        },
        onSuccess: () => {
            setPwd({ current: '', next: '', confirm: '' });
            toast({ title: 'Contraseña actualizada' });
        },
        onError: (e) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(e) }),
    });

    if (isLoading) {
        return (
            <AuthGuard requiredRoles={['instructor', 'admin']}>
                <CoachLayout>
                    <div className="max-w-4xl mx-auto space-y-6">
                        <Skeleton className="h-64 w-full" />
                        <Skeleton className="h-48 w-full" />
                    </div>
                </CoachLayout>
            </AuthGuard>
        );
    }

    if (!instructor) {
        return (
            <AuthGuard requiredRoles={['instructor', 'admin']}>
                <CoachLayout>
                    <div className="max-w-4xl mx-auto py-8 text-center text-muted-foreground">
                        No se encontró tu perfil de instructor.
                    </div>
                </CoachLayout>
            </AuthGuard>
        );
    }

    return (
        <AuthGuard requiredRoles={['instructor', 'admin']}>
            <CoachLayout>
                <div className="max-w-4xl mx-auto space-y-6">
                    {/* ====== Header: Foto + nombre + identidad ====== */}
                    <Card>
                        <CardContent className="p-6">
                            <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
                                <div className="relative">
                                    <Avatar className="h-32 w-32">
                                        <AvatarImage src={instructor.photo_url || undefined} />
                                        <AvatarFallback className="text-3xl bg-primary/10 text-primary">
                                            {getInitials(instructor.display_name || user?.display_name || 'U')}
                                        </AvatarFallback>
                                    </Avatar>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handlePhotoChange}
                                    />
                                    <Button
                                        size="icon"
                                        variant="secondary"
                                        className="absolute bottom-0 right-0 h-9 w-9 rounded-full shadow"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={uploadingPhoto}
                                        aria-label="Cambiar foto"
                                    >
                                        {uploadingPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                                    </Button>
                                </div>

                                <div className="flex-1 text-center md:text-left">
                                    <div className="flex items-center justify-center md:justify-start gap-2 flex-wrap">
                                        <h1 className="font-heading text-3xl font-bold">
                                            {instructor.display_name || user?.display_name}
                                        </h1>
                                        {instructor.is_active && (
                                            <Badge className="bg-success">
                                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                                Activo
                                            </Badge>
                                        )}
                                        {instructor.coach_number != null && (
                                            <Badge variant="outline">Coach #{instructor.coach_number}</Badge>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mt-3 text-sm text-muted-foreground">
                                        <span className="flex items-center gap-1">
                                            <Mail className="h-4 w-4" />
                                            {instructor.email || user?.email}
                                        </span>
                                        {instructor.phone && (
                                            <span className="flex items-center gap-1">
                                                <Phone className="h-4 w-4" />
                                                {instructor.phone}
                                            </span>
                                        )}
                                    </div>
                                    {instructor.bio && !editingInfo && (
                                        <p className="text-muted-foreground mt-3 max-w-lg">{instructor.bio}</p>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* ====== Información personal (editable) ====== */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle>Información personal</CardTitle>
                                <CardDescription>Nombre, biografía y teléfono</CardDescription>
                            </div>
                            {!editingInfo ? (
                                <Button variant="outline" size="sm" onClick={() => setEditingInfo(true)}>
                                    <Pencil className="h-4 w-4 mr-2" />
                                    Editar
                                </Button>
                            ) : (
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setEditingInfo(false)} disabled={updateInfoMutation.isPending}>
                                        <X className="h-4 w-4 mr-2" />
                                        Cancelar
                                    </Button>
                                    <Button size="sm" onClick={() => updateInfoMutation.mutate()} disabled={updateInfoMutation.isPending}>
                                        {updateInfoMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                                        Guardar
                                    </Button>
                                </div>
                            )}
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {editingInfo ? (
                                <>
                                    <div className="space-y-2">
                                        <Label htmlFor="displayName">Nombre para mostrar</Label>
                                        <Input
                                            id="displayName"
                                            value={infoForm.displayName}
                                            onChange={(e) => setInfoForm({ ...infoForm, displayName: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="phone">Teléfono</Label>
                                        <Input
                                            id="phone"
                                            value={infoForm.phone}
                                            onChange={(e) => setInfoForm({ ...infoForm, phone: e.target.value })}
                                            placeholder="55 1234 5678"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="tagline">Frase del sitio público</Label>
                                        <Input
                                            id="tagline"
                                            maxLength={200}
                                            value={infoForm.tagline}
                                            onChange={(e) => setInfoForm({ ...infoForm, tagline: e.target.value })}
                                            placeholder="Reformer & fuerza · reinventa tu mejor versión ⚡"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Frase corta bajo tu nombre en la tarjeta de “El Equipo”.
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="bio">Biografía</Label>
                                        <Textarea
                                            id="bio"
                                            rows={4}
                                            value={infoForm.bio}
                                            onChange={(e) => setInfoForm({ ...infoForm, bio: e.target.value })}
                                            placeholder="Cuéntale a tus clientes sobre ti..."
                                        />
                                    </div>
                                </>
                            ) : (
                                <div className="text-sm space-y-2">
                                    <div><span className="text-muted-foreground">Nombre:</span> {instructor.display_name}</div>
                                    <div><span className="text-muted-foreground">Teléfono:</span> {instructor.phone || '—'}</div>
                                    <div><span className="text-muted-foreground">Frase:</span> {instructor.tagline || '—'}</div>
                                    <div><span className="text-muted-foreground">Biografía:</span> {instructor.bio || '—'}</div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* ====== Especialidades + Certificaciones ====== */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <Award className="h-5 w-5" />
                                    Especialidades y certificaciones
                                </CardTitle>
                                <CardDescription>Visibles en tu perfil público</CardDescription>
                            </div>
                            {!editingTags ? (
                                <Button variant="outline" size="sm" onClick={() => setEditingTags(true)}>
                                    <Pencil className="h-4 w-4 mr-2" />
                                    Editar
                                </Button>
                            ) : (
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setEditingTags(false)} disabled={updateTagsMutation.isPending}>
                                        <X className="h-4 w-4 mr-2" />
                                        Cancelar
                                    </Button>
                                    <Button size="sm" onClick={() => updateTagsMutation.mutate()} disabled={updateTagsMutation.isPending}>
                                        {updateTagsMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                                        Guardar
                                    </Button>
                                </div>
                            )}
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div>
                                <Label className="text-sm">Especialidades</Label>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {specialties.length === 0 && !editingTags && (
                                        <span className="text-sm text-muted-foreground">Sin especialidades</span>
                                    )}
                                    {specialties.map((s, idx) => (
                                        <Badge key={`spec-${idx}`} variant="secondary" className="gap-1">
                                            {s}
                                            {editingTags && (
                                                <button
                                                    onClick={() => setSpecialties(specialties.filter((_, i) => i !== idx))}
                                                    className="ml-1 opacity-70 hover:opacity-100"
                                                    aria-label={`Quitar ${s}`}
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            )}
                                        </Badge>
                                    ))}
                                </div>
                                {editingTags && (
                                    <div className="flex gap-2 mt-3">
                                        <Input
                                            value={newSpecialty}
                                            onChange={(e) => setNewSpecialty(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    const v = newSpecialty.trim();
                                                    if (v && !specialties.includes(v)) setSpecialties([...specialties, v]);
                                                    setNewSpecialty('');
                                                }
                                            }}
                                            placeholder="Ej. Reformer, Mat, Embarazadas..."
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                const v = newSpecialty.trim();
                                                if (v && !specialties.includes(v)) setSpecialties([...specialties, v]);
                                                setNewSpecialty('');
                                            }}
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                )}
                            </div>

                            <div>
                                <Label className="text-sm">Certificaciones</Label>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {certifications.length === 0 && !editingTags && (
                                        <span className="text-sm text-muted-foreground">Sin certificaciones</span>
                                    )}
                                    {certifications.map((c, idx) => (
                                        <Badge key={`cert-${idx}`} variant="outline" className="gap-1">
                                            <CheckCircle2 className="h-3 w-3 text-success" />
                                            {c}
                                            {editingTags && (
                                                <button
                                                    onClick={() => setCertifications(certifications.filter((_, i) => i !== idx))}
                                                    className="ml-1 opacity-70 hover:opacity-100"
                                                    aria-label={`Quitar ${c}`}
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            )}
                                        </Badge>
                                    ))}
                                </div>
                                {editingTags && (
                                    <div className="flex gap-2 mt-3">
                                        <Input
                                            value={newCertification}
                                            onChange={(e) => setNewCertification(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    const v = newCertification.trim();
                                                    if (v && !certifications.includes(v)) setCertifications([...certifications, v]);
                                                    setNewCertification('');
                                                }
                                            }}
                                            placeholder="Ej. Stott Pilates Nivel 2..."
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                const v = newCertification.trim();
                                                if (v && !certifications.includes(v)) setCertifications([...certifications, v]);
                                                setNewCertification('');
                                            }}
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* ====== Disponibilidad ====== */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <Clock className="h-5 w-5" />
                                    Disponibilidad semanal
                                </CardTitle>
                                <CardDescription>Indica los días y horarios en que puedes dar clase</CardDescription>
                            </div>
                            {!editingAvail ? (
                                <Button variant="outline" size="sm" onClick={() => setEditingAvail(true)}>
                                    <Pencil className="h-4 w-4 mr-2" />
                                    Editar
                                </Button>
                            ) : (
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setEditingAvail(false)} disabled={updateAvailMutation.isPending}>
                                        <X className="h-4 w-4 mr-2" />
                                        Cancelar
                                    </Button>
                                    <Button size="sm" onClick={() => updateAvailMutation.mutate()} disabled={updateAvailMutation.isPending}>
                                        {updateAvailMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                                        Guardar
                                    </Button>
                                </div>
                            )}
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {DAY_ROWS.map((row) => {
                                    const state = availByDay[row.value] || { is_available: false, start_time: '09:00', end_time: '18:00' };
                                    return (
                                        <div
                                            key={row.value}
                                            className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                                        >
                                            <Switch
                                                checked={state.is_available}
                                                onCheckedChange={(checked) =>
                                                    setAvailByDay((prev) => ({
                                                        ...prev,
                                                        [row.value]: { ...state, is_available: checked },
                                                    }))
                                                }
                                                disabled={!editingAvail}
                                                aria-label={`Activar ${row.label}`}
                                            />
                                            <span className="w-24 text-sm font-medium">{row.label}</span>
                                            {state.is_available ? (
                                                <div className="flex items-center gap-2 flex-1 justify-end">
                                                    <Input
                                                        type="time"
                                                        value={state.start_time}
                                                        onChange={(e) =>
                                                            setAvailByDay((prev) => ({
                                                                ...prev,
                                                                [row.value]: { ...state, start_time: e.target.value },
                                                            }))
                                                        }
                                                        disabled={!editingAvail}
                                                        className="w-32"
                                                    />
                                                    <span className="text-muted-foreground text-sm">a</span>
                                                    <Input
                                                        type="time"
                                                        value={state.end_time}
                                                        onChange={(e) =>
                                                            setAvailByDay((prev) => ({
                                                                ...prev,
                                                                [row.value]: { ...state, end_time: e.target.value },
                                                            }))
                                                        }
                                                        disabled={!editingAvail}
                                                        className="w-32"
                                                    />
                                                </div>
                                            ) : (
                                                <span className="text-sm text-muted-foreground ml-auto">No disponible</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>

                    {/* ====== Seguridad: cambiar contraseña ====== */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <KeyRound className="h-5 w-5" />
                                Cambiar contraseña
                            </CardTitle>
                            <CardDescription>Actualiza tu contraseña periódicamente</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="current-pwd">Contraseña actual</Label>
                                <Input
                                    id="current-pwd"
                                    type="password"
                                    value={pwd.current}
                                    onChange={(e) => setPwd({ ...pwd, current: e.target.value })}
                                    autoComplete="current-password"
                                />
                            </div>
                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="new-pwd">Nueva contraseña</Label>
                                    <Input
                                        id="new-pwd"
                                        type="password"
                                        value={pwd.next}
                                        onChange={(e) => setPwd({ ...pwd, next: e.target.value })}
                                        autoComplete="new-password"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="confirm-pwd">Confirmar nueva contraseña</Label>
                                    <Input
                                        id="confirm-pwd"
                                        type="password"
                                        value={pwd.confirm}
                                        onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })}
                                        autoComplete="new-password"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end">
                                <Button
                                    onClick={() => changePwdMutation.mutate()}
                                    disabled={
                                        changePwdMutation.isPending ||
                                        !pwd.current ||
                                        !pwd.next ||
                                        !pwd.confirm
                                    }
                                >
                                    {changePwdMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                                    Actualizar contraseña
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* ====== Stats (read-only) ====== */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Card>
                            <CardContent className="p-4 text-center">
                                <Calendar className="h-8 w-8 mx-auto text-primary mb-2" />
                                <p className="text-3xl font-bold">
                                    {loadingStats ? <Skeleton className="h-8 w-12 mx-auto" /> : stats?.total_classes_taught || 0}
                                </p>
                                <p className="text-xs text-muted-foreground">Clases impartidas</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-4 text-center">
                                <Users className="h-8 w-8 mx-auto text-info mb-2" />
                                <p className="text-3xl font-bold">
                                    {loadingStats ? <Skeleton className="h-8 w-12 mx-auto" /> : stats?.total_checkins || 0}
                                </p>
                                <p className="text-xs text-muted-foreground">Check-ins totales</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-4 text-center">
                                <TrendingUp className="h-8 w-8 mx-auto text-success mb-2" />
                                <p className="text-3xl font-bold">
                                    {loadingStats ? <Skeleton className="h-8 w-12 mx-auto" /> : `${stats?.attendance_rate || 0}%`}
                                </p>
                                <p className="text-xs text-muted-foreground">Tasa de asistencia</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-4 text-center">
                                <Award className="h-8 w-8 mx-auto text-purple-500 mb-2" />
                                <p className="text-3xl font-bold">
                                    {loadingStats ? <Skeleton className="h-8 w-12 mx-auto" /> : `${stats?.avg_occupancy || 0}%`}
                                </p>
                                <p className="text-xs text-muted-foreground">Ocupación promedio</p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* ====== Mi calificación (cómo te califican tus clientes) ====== */}
                    <Card>
                        <CardContent className="p-5">
                            <div className="flex items-center gap-4">
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-amber-100">
                                    <Star className="h-7 w-7 fill-amber-400 text-amber-400" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs font-medium text-muted-foreground">Mi calificación</p>
                                    {loadingStats ? (
                                        <Skeleton className="h-8 w-28 mt-1" />
                                    ) : stats?.avg_rating != null ? (
                                        <div className="flex items-center gap-2">
                                            <span className="text-3xl font-bold leading-none">{stats.avg_rating.toFixed(1)}</span>
                                            <span className="text-sm text-muted-foreground">/ 5</span>
                                            <div className="flex items-center gap-0.5 ml-1">
                                                {[1, 2, 3, 4, 5].map((n) => (
                                                    <Star
                                                        key={n}
                                                        className={`h-4 w-4 ${n <= Math.round(stats.avg_rating!) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground mt-1">Aún no tienes reseñas.</p>
                                    )}
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {stats?.total_reviews
                                            ? `Basado en ${stats.total_reviews} ${stats.total_reviews === 1 ? 'reseña' : 'reseñas'} de tus clientes.`
                                            : 'Así te califican tus clientes después de cada clase.'}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* ====== Esta semana ====== */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Esta semana</CardTitle>
                            <CardDescription>Tu actividad de los últimos 7 días</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 gap-6">
                                <div className="text-center p-4 rounded-lg bg-primary/5">
                                    <p className="text-4xl font-bold text-primary">
                                        {loadingStats ? <Skeleton className="h-10 w-12 mx-auto" /> : stats?.classes_this_week || 0}
                                    </p>
                                    <p className="text-sm text-muted-foreground mt-1">Clases programadas</p>
                                </div>
                                <div className="text-center p-4 rounded-lg bg-info/5">
                                    <p className="text-4xl font-bold text-info">
                                        {loadingStats ? <Skeleton className="h-10 w-12 mx-auto" /> : stats?.bookings_this_week || 0}
                                    </p>
                                    <p className="text-sm text-muted-foreground mt-1">Reservaciones</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </CoachLayout>
        </AuthGuard>
    );
}
