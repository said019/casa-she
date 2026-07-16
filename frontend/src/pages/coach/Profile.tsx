import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    User,
} from 'lucide-react';
import CoachLayout from '@/components/layout/CoachLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { CoachStat } from '@/components/coach/CoachUI';
import { CasaShePattern } from '@/components/CasaShePattern';
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

const DAY_ROWS: { value: number; label: string; short: string }[] = [
    { value: 1, label: 'Lunes', short: 'Lun' },
    { value: 2, label: 'Martes', short: 'Mar' },
    { value: 3, label: 'Miércoles', short: 'Mié' },
    { value: 4, label: 'Jueves', short: 'Jue' },
    { value: 5, label: 'Viernes', short: 'Vie' },
    { value: 6, label: 'Sábado', short: 'Sáb' },
    { value: 0, label: 'Domingo', short: 'Dom' },
];

function getInitials(name: string) {
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

function trimTime(t: string | null | undefined) {
    if (!t) return '';
    return t.length >= 5 ? t.slice(0, 5) : t;
}

function SectionCard({
    title,
    description,
    icon: Icon,
    editing,
    onEdit,
    onCancel,
    onSave,
    saving,
    children,
}: {
    title: string;
    description?: string;
    icon: React.ElementType;
    editing: boolean;
    onEdit: () => void;
    onCancel: () => void;
    onSave: () => void;
    saving: boolean;
    children: React.ReactNode;
}) {
    return (
        <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-start justify-between pb-4 border-b border-border/50">
                <div className="flex items-center gap-3">
                    <div
                        className="flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
                        style={{ backgroundColor: 'rgba(42,78,54,0.1)' }}
                    >
                        <Icon className="h-4.5 w-4.5" style={{ color: '#2A4E36' }} />
                    </div>
                    <div>
                        <CardTitle className="text-base font-heading">{title}</CardTitle>
                        {description && (
                            <p className="text-xs text-muted-foreground font-body mt-0.5">{description}</p>
                        )}
                    </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                    {!editing ? (
                        <Button variant="outline" size="sm" onClick={onEdit} className="font-body text-xs h-8">
                            <Pencil className="h-3.5 w-3.5 mr-1.5" />
                            Editar
                        </Button>
                    ) : (
                        <>
                            <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving} className="font-body text-xs h-8">
                                <X className="h-3.5 w-3.5 mr-1" />
                                Cancelar
                            </Button>
                            <Button size="sm" onClick={onSave} disabled={saving}
                                className="font-body text-xs h-8 active:scale-[0.97] transition-transform duration-100"
                                style={{ backgroundColor: '#2A4E36' }}
                            >
                                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                                Guardar
                            </Button>
                        </>
                    )}
                </div>
            </CardHeader>
            <CardContent className="pt-5">{children}</CardContent>
        </Card>
    );
}

function FieldRow({ label, value }: { label: string; value: string | null | undefined }) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3">
            <span className="font-body text-[10px] uppercase tracking-[2px] text-muted-foreground/70 sm:w-28 flex-shrink-0">
                {label}
            </span>
            <span className="font-body text-sm text-foreground/80">{value || '—'}</span>
        </div>
    );
}

export default function CoachProfile() {
    const { user } = useAuthStore();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { data: instructor, isLoading } = useQuery<InstructorProfile>({
        queryKey: ['instructor-me'],
        queryFn: async () => (await api.get('/instructors/me')).data,
        enabled: !!user?.id,
    });

    const { data: stats, isLoading: loadingStats } = useQuery<InstructorStats>({
        queryKey: ['instructor-me-stats', instructor?.id],
        queryFn: async () => (await api.get(`/instructors/${instructor?.id}/stats`)).data,
        enabled: !!instructor?.id,
    });

    // ── Info personal ──
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
        mutationFn: async () => (await api.put('/instructors/me', infoForm)).data,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['instructor-me'] });
            setEditingInfo(false);
            toast({ title: 'Perfil actualizado' });
        },
        onError: (e) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(e) }),
    });

    // ── Tags ──
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
        mutationFn: async () => (await api.put('/instructors/me', { specialties, certifications })).data,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['instructor-me'] });
            setEditingTags(false);
            toast({ title: 'Especialidades guardadas' });
        },
        onError: (e) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(e) }),
    });

    // ── Foto ──
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) return toast({ variant: 'destructive', title: 'Solo se permiten imágenes' });
        if (file.size > 10 * 1024 * 1024) return toast({ variant: 'destructive', title: 'Máximo 10MB' });
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

    // ── Disponibilidad ──
    type DayState = { is_available: boolean; start_time: string; end_time: string };
    const [editingAvail, setEditingAvail] = useState(false);
    const [availByDay, setAvailByDay] = useState<Record<number, DayState>>({});

    useEffect(() => {
        if (!instructor || editingAvail) return;
        const map: Record<number, DayState> = {};
        for (const row of DAY_ROWS) map[row.value] = { is_available: false, start_time: '09:00', end_time: '18:00' };
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
                .map(([day, v]) => ({ day_of_week: Number(day), start_time: v.start_time, end_time: v.end_time, is_available: true }));
            return (await api.put('/instructors/me/availability', { availability })).data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['instructor-me'] });
            setEditingAvail(false);
            toast({ title: 'Disponibilidad actualizada' });
        },
        onError: (e) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(e) }),
    });

    // ── Contraseña ──
    const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
    const changePwdMutation = useMutation({
        mutationFn: async () => {
            if (pwd.next.length < 6) throw new Error('La nueva contraseña debe tener al menos 6 caracteres');
            if (pwd.next !== pwd.confirm) throw new Error('Las contraseñas no coinciden');
            return (await api.post('/auth/change-password', { currentPassword: pwd.current, newPassword: pwd.next })).data;
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
                    <div className="max-w-4xl mx-auto space-y-5">
                        <Skeleton className="h-52 w-full rounded-2xl" />
                        <Skeleton className="h-40 w-full rounded-2xl" />
                        <Skeleton className="h-48 w-full rounded-2xl" />
                    </div>
                </CoachLayout>
            </AuthGuard>
        );
    }

    if (!instructor) {
        return (
            <AuthGuard requiredRoles={['instructor', 'admin']}>
                <CoachLayout>
                    <div className="max-w-4xl mx-auto py-12 text-center text-muted-foreground font-body">
                        No se encontró tu perfil de instructor.
                    </div>
                </CoachLayout>
            </AuthGuard>
        );
    }

    const name = instructor.display_name || user?.display_name || '';

    return (
        <AuthGuard requiredRoles={['instructor', 'admin']}>
            <CoachLayout>
                <div className="max-w-4xl mx-auto space-y-5">

                    {/* ── Hero de perfil ── */}
                    <div
                        className="relative -mx-4 sm:-mx-6 overflow-hidden"
                        style={{ backgroundColor: '#16261A' }}
                    >
                        <CasaShePattern className="pointer-events-none absolute inset-0 h-full w-full" color="#F6F0E4" opacity={0.07} />
                        <div
                            aria-hidden
                            className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full"
                            style={{ background: 'radial-gradient(circle, rgba(174,72,54,0.2) 0%, transparent 65%)' }}
                        />
                        <div
                            aria-hidden
                            className="pointer-events-none absolute -bottom-10 -left-10 h-48 w-48 rounded-full"
                            style={{ background: 'radial-gradient(circle, rgba(42,78,54,0.5) 0%, transparent 65%)' }}
                        />

                        <div className="relative z-10 px-6 py-8 sm:px-10">
                            <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6">
                                {/* Avatar */}
                                <div className="relative flex-shrink-0">
                                    <Avatar className="h-28 w-28 ring-4 shadow-xl" style={{ '--tw-ring-color': 'rgba(246,240,228,0.15)' } as React.CSSProperties}>
                                        <AvatarImage src={instructor.photo_url || undefined} />
                                        <AvatarFallback
                                            className="text-3xl font-bold"
                                            style={{ backgroundColor: 'rgba(174,72,54,0.3)', color: '#F6F0E4' }}
                                        >
                                            {getInitials(name)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={uploadingPhoto}
                                        aria-label="Cambiar foto"
                                        className="absolute bottom-1 right-1 flex h-8 w-8 items-center justify-center rounded-full shadow-lg transition-transform duration-100 active:scale-[0.94]"
                                        style={{ backgroundColor: '#AE4836' }}
                                    >
                                        {uploadingPhoto
                                            ? <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
                                            : <Camera className="h-3.5 w-3.5 text-white" />
                                        }
                                    </button>
                                </div>

                                {/* Nombre + meta */}
                                <div className="text-center sm:text-left flex-1 pb-1">
                                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-1">
                                        <h1 className="font-heading text-3xl sm:text-4xl" style={{ color: '#F6F0E4' }}>
                                            {name}
                                        </h1>
                                        {instructor.is_active && (
                                            <span
                                                className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold uppercase tracking-[1.5px]"
                                                style={{ backgroundColor: 'rgba(42,78,54,0.5)', color: '#9CC69B' }}
                                            >
                                                <CheckCircle2 className="h-3 w-3" />
                                                Activa
                                            </span>
                                        )}
                                        {instructor.coach_number != null && (
                                            <span
                                                className="inline-flex items-center rounded-full px-2.5 py-0.5 font-body text-[10px] uppercase tracking-[1.5px]"
                                                style={{ backgroundColor: 'rgba(174,72,54,0.2)', color: 'rgba(174,72,54,0.85)' }}
                                            >
                                                Coach #{instructor.coach_number}
                                            </span>
                                        )}
                                    </div>
                                    {instructor.tagline && (
                                        <p className="font-heading text-lg leading-snug mb-2" style={{ color: 'rgba(246,240,228,0.65)' }}>
                                            {instructor.tagline}
                                        </p>
                                    )}
                                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4">
                                        <span className="flex items-center gap-1.5 font-body text-xs" style={{ color: 'rgba(246,240,228,0.45)' }}>
                                            <Mail className="h-3.5 w-3.5" />
                                            {instructor.email || user?.email}
                                        </span>
                                        {instructor.phone && (
                                            <span className="flex items-center gap-1.5 font-body text-xs" style={{ color: 'rgba(246,240,228,0.45)' }}>
                                                <Phone className="h-3.5 w-3.5" />
                                                {instructor.phone}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── Stats ── */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {loadingStats ? (
                            [...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
                        ) : (
                            <>
                                <CoachStat label="Clases impartidas" value={stats?.total_classes_taught ?? 0} icon={Calendar} tone="arcilla" />
                                <CoachStat label="Check-ins totales" value={stats?.total_checkins ?? 0} icon={Users} tone="verde" />
                                <CoachStat label="Tasa asistencia" value={`${stats?.attendance_rate ?? 0}%`} icon={TrendingUp} tone="success" />
                                <CoachStat label="Ocupación prom." value={`${stats?.avg_occupancy ?? 0}%`} icon={Award} tone="neutral" />
                            </>
                        )}
                    </div>

                    {/* ── Calificación ── */}
                    {(loadingStats || (stats?.avg_rating != null)) && (
                        <Card className="overflow-hidden border-amber-100">
                            <CardContent className="p-5">
                                <div className="flex items-center gap-4">
                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-50">
                                        <Star className="h-6 w-6 fill-amber-400 text-amber-400" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="font-body text-[10px] uppercase tracking-[2px] text-muted-foreground/70">Mi calificación</p>
                                        {loadingStats ? (
                                            <Skeleton className="h-8 w-28 mt-1" />
                                        ) : (
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="font-heading text-3xl font-bold leading-none">{stats!.avg_rating!.toFixed(1)}</span>
                                                <span className="font-body text-sm text-muted-foreground">/ 5</span>
                                                <div className="flex items-center gap-0.5 ml-1">
                                                    {[1, 2, 3, 4, 5].map((n) => (
                                                        <Star key={n} className={`h-4 w-4 ${n <= Math.round(stats!.avg_rating!) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/25'}`} />
                                                    ))}
                                                </div>
                                                {stats?.total_reviews ? (
                                                    <span className="font-body text-xs text-muted-foreground">({stats.total_reviews} reseñas)</span>
                                                ) : null}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* ── Información personal ── */}
                    <SectionCard
                        title="Información personal"
                        description="Nombre, biografía y teléfono"
                        icon={User}
                        editing={editingInfo}
                        onEdit={() => setEditingInfo(true)}
                        onCancel={() => setEditingInfo(false)}
                        onSave={() => updateInfoMutation.mutate()}
                        saving={updateInfoMutation.isPending}
                    >
                        {editingInfo ? (
                            <div className="space-y-4">
                                {[
                                    { id: 'displayName', label: 'Nombre para mostrar', placeholder: 'Tu nombre', field: 'displayName' as const },
                                    { id: 'phone', label: 'Teléfono', placeholder: '55 1234 5678', field: 'phone' as const },
                                    { id: 'tagline', label: 'Frase del sitio público', placeholder: 'Movimiento consciente · fuerza y presencia', field: 'tagline' as const },
                                ].map(({ id, label, placeholder, field }) => (
                                    <div key={id} className="space-y-1.5">
                                        <Label htmlFor={id} className="font-body text-[10px] uppercase tracking-[2px] text-muted-foreground/70">{label}</Label>
                                        <Input id={id} value={infoForm[field]} onChange={(e) => setInfoForm({ ...infoForm, [field]: e.target.value })} placeholder={placeholder} className="font-body" />
                                    </div>
                                ))}
                                <div className="space-y-1.5">
                                    <Label htmlFor="bio" className="font-body text-[10px] uppercase tracking-[2px] text-muted-foreground/70">Biografía</Label>
                                    <Textarea id="bio" rows={4} value={infoForm.bio} onChange={(e) => setInfoForm({ ...infoForm, bio: e.target.value })} placeholder="Cuéntale a tus clientes sobre ti..." className="font-body resize-none" />
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <FieldRow label="Nombre" value={instructor.display_name} />
                                <FieldRow label="Teléfono" value={instructor.phone} />
                                <FieldRow label="Frase" value={instructor.tagline} />
                                {instructor.bio && (
                                    <div className="pt-1">
                                        <span className="font-body text-[10px] uppercase tracking-[2px] text-muted-foreground/70">Biografía</span>
                                        <p className="font-body text-sm text-foreground/70 mt-1 leading-relaxed">{instructor.bio}</p>
                                    </div>
                                )}
                                {!instructor.bio && <FieldRow label="Biografía" value={null} />}
                            </div>
                        )}
                    </SectionCard>

                    {/* ── Especialidades y certificaciones ── */}
                    <SectionCard
                        title="Especialidades y certificaciones"
                        description="Visibles en tu perfil público"
                        icon={Award}
                        editing={editingTags}
                        onEdit={() => setEditingTags(true)}
                        onCancel={() => setEditingTags(false)}
                        onSave={() => updateTagsMutation.mutate()}
                        saving={updateTagsMutation.isPending}
                    >
                        <div className="space-y-5">
                            {/* Especialidades */}
                            <div>
                                <p className="font-body text-[10px] uppercase tracking-[2px] text-muted-foreground/70 mb-2">Especialidades</p>
                                <div className="flex flex-wrap gap-2">
                                    {specialties.length === 0 && !editingTags && (
                                        <span className="font-body text-sm text-muted-foreground">Sin especialidades</span>
                                    )}
                                    {specialties.map((s, idx) => (
                                        <span
                                            key={`spec-${idx}`}
                                            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-body text-xs font-medium"
                                            style={{ backgroundColor: 'rgba(42,78,54,0.1)', color: '#2A4E36' }}
                                        >
                                            {s}
                                            {editingTags && (
                                                <button onClick={() => setSpecialties(specialties.filter((_, i) => i !== idx))} className="opacity-60 hover:opacity-100 transition-opacity" aria-label={`Quitar ${s}`}>
                                                    <X className="h-3 w-3" />
                                                </button>
                                            )}
                                        </span>
                                    ))}
                                </div>
                                {editingTags && (
                                    <div className="flex gap-2 mt-3">
                                        <Input
                                            value={newSpecialty}
                                            onChange={(e) => setNewSpecialty(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') { e.preventDefault(); const v = newSpecialty.trim(); if (v && !specialties.includes(v)) setSpecialties([...specialties, v]); setNewSpecialty(''); }
                                            }}
                                            placeholder="Ej. Pilates Mat, Barre, Yoga…"
                                            className="font-body text-sm"
                                        />
                                        <Button type="button" variant="outline" size="sm" className="px-3" onClick={() => { const v = newSpecialty.trim(); if (v && !specialties.includes(v)) setSpecialties([...specialties, v]); setNewSpecialty(''); }}>
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                )}
                            </div>

                            <div className="border-t border-border/40" />

                            {/* Certificaciones */}
                            <div>
                                <p className="font-body text-[10px] uppercase tracking-[2px] text-muted-foreground/70 mb-2">Certificaciones</p>
                                <div className="flex flex-wrap gap-2">
                                    {certifications.length === 0 && !editingTags && (
                                        <span className="font-body text-sm text-muted-foreground">Sin certificaciones</span>
                                    )}
                                    {certifications.map((c, idx) => (
                                        <span
                                            key={`cert-${idx}`}
                                            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-body text-xs font-medium"
                                            style={{ borderColor: 'rgba(174,72,54,0.3)', color: '#AE4836', backgroundColor: 'rgba(174,72,54,0.05)' }}
                                        >
                                            <CheckCircle2 className="h-3 w-3" />
                                            {c}
                                            {editingTags && (
                                                <button onClick={() => setCertifications(certifications.filter((_, i) => i !== idx))} className="opacity-60 hover:opacity-100 transition-opacity" aria-label={`Quitar ${c}`}>
                                                    <X className="h-3 w-3" />
                                                </button>
                                            )}
                                        </span>
                                    ))}
                                </div>
                                {editingTags && (
                                    <div className="flex gap-2 mt-3">
                                        <Input
                                            value={newCertification}
                                            onChange={(e) => setNewCertification(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') { e.preventDefault(); const v = newCertification.trim(); if (v && !certifications.includes(v)) setCertifications([...certifications, v]); setNewCertification(''); }
                                            }}
                                            placeholder="Ej. Stott Pilates Nivel 2…"
                                            className="font-body text-sm"
                                        />
                                        <Button type="button" variant="outline" size="sm" className="px-3" onClick={() => { const v = newCertification.trim(); if (v && !certifications.includes(v)) setCertifications([...certifications, v]); setNewCertification(''); }}>
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </SectionCard>

                    {/* ── Disponibilidad semanal ── */}
                    <SectionCard
                        title="Disponibilidad semanal"
                        description="Días y horarios en que puedes dar clase"
                        icon={Clock}
                        editing={editingAvail}
                        onEdit={() => setEditingAvail(true)}
                        onCancel={() => setEditingAvail(false)}
                        onSave={() => updateAvailMutation.mutate()}
                        saving={updateAvailMutation.isPending}
                    >
                        <div className="space-y-1.5">
                            {DAY_ROWS.map((row) => {
                                const state = availByDay[row.value] || { is_available: false, start_time: '09:00', end_time: '18:00' };
                                const active = state.is_available;
                                return (
                                    <div
                                        key={row.value}
                                        className="flex items-center gap-3 rounded-xl px-4 py-3 transition-colors"
                                        style={{ backgroundColor: active ? 'rgba(42,78,54,0.06)' : 'transparent', border: `1px solid ${active ? 'rgba(42,78,54,0.15)' : 'rgba(0,0,0,0.06)'}` }}
                                    >
                                        <Switch
                                            checked={active}
                                            onCheckedChange={(checked) => setAvailByDay((p) => ({ ...p, [row.value]: { ...state, is_available: checked } }))}
                                            disabled={!editingAvail}
                                            aria-label={`Activar ${row.label}`}
                                        />
                                        <span className="font-body text-sm font-medium w-20 flex-shrink-0" style={{ color: active ? '#2A4E36' : undefined }}>
                                            {row.label}
                                        </span>
                                        {active ? (
                                            <div className="flex items-center gap-2 ml-auto">
                                                <Input
                                                    type="time"
                                                    value={state.start_time}
                                                    onChange={(e) => setAvailByDay((p) => ({ ...p, [row.value]: { ...state, start_time: e.target.value } }))}
                                                    disabled={!editingAvail}
                                                    className="w-28 font-body text-sm h-8"
                                                />
                                                <span className="text-muted-foreground text-xs">–</span>
                                                <Input
                                                    type="time"
                                                    value={state.end_time}
                                                    onChange={(e) => setAvailByDay((p) => ({ ...p, [row.value]: { ...state, end_time: e.target.value } }))}
                                                    disabled={!editingAvail}
                                                    className="w-28 font-body text-sm h-8"
                                                />
                                            </div>
                                        ) : (
                                            <span className="ml-auto font-body text-xs text-muted-foreground/50">No disponible</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </SectionCard>

                    {/* ── Seguridad ── */}
                    <Card className="overflow-hidden">
                        <CardHeader className="flex flex-row items-center gap-3 pb-4 border-b border-border/50">
                            <div
                                className="flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
                                style={{ backgroundColor: 'rgba(174,72,54,0.1)' }}
                            >
                                <KeyRound className="h-4.5 w-4.5" style={{ color: '#AE4836' }} />
                            </div>
                            <div>
                                <CardTitle className="text-base font-heading">Cambiar contraseña</CardTitle>
                                <p className="text-xs text-muted-foreground font-body mt-0.5">Actualiza tu contraseña periódicamente</p>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-5 space-y-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="current-pwd" className="font-body text-[10px] uppercase tracking-[2px] text-muted-foreground/70">Contraseña actual</Label>
                                <Input id="current-pwd" type="password" value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} autoComplete="current-password" className="font-body" />
                            </div>
                            <div className="grid sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label htmlFor="new-pwd" className="font-body text-[10px] uppercase tracking-[2px] text-muted-foreground/70">Nueva contraseña</Label>
                                    <Input id="new-pwd" type="password" value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} autoComplete="new-password" className="font-body" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="confirm-pwd" className="font-body text-[10px] uppercase tracking-[2px] text-muted-foreground/70">Confirmar contraseña</Label>
                                    <Input id="confirm-pwd" type="password" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} autoComplete="new-password" className="font-body" />
                                </div>
                            </div>
                            <div className="flex justify-end pt-1">
                                <Button
                                    onClick={() => changePwdMutation.mutate()}
                                    disabled={changePwdMutation.isPending || !pwd.current || !pwd.next || !pwd.confirm}
                                    className="font-body active:scale-[0.97] transition-transform duration-100"
                                    style={{ backgroundColor: '#2A4E36' }}
                                >
                                    {changePwdMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Guardando…</> : <><Save className="h-4 w-4 mr-2" /> Actualizar contraseña</>}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                </div>
            </CoachLayout>
        </AuthGuard>
    );
}
