import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { parseLocalDate } from '@/lib/date';
import { es } from 'date-fns/locale';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { 
    Calendar,
    Clock,
    UserPlus,
    UserMinus,
    Check,
    X,
    Loader2,
    AlertCircle,
    HandHelping
} from 'lucide-react';
import CoachLayout from '@/components/layout/CoachLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

interface Substitution {
    id: string;
    class_id: string;
    original_instructor_id: string;
    substitute_instructor_id: string | null;
    reason: string;
    status: 'pending' | 'accepted' | 'declined' | 'cancelled';
    requested_at: string;
    responded_at: string | null;
    response_note: string | null;
    date: string;
    start_time: string;
    end_time: string;
    class_type_name: string;
    class_type_color: string;
    original_instructor_name: string;
    substitute_instructor_name: string | null;
}

interface ClassForSub {
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    class_type_name: string;
    class_type_color: string;
}

export default function CoachSubstitutions() {
    const { user } = useAuthStore();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState('available');
    const [isRequestOpen, setIsRequestOpen] = useState(false);
    const [isAcceptOpen, setIsAcceptOpen] = useState(false);
    const [selectedSub, setSelectedSub] = useState<Substitution | null>(null);
    const [selectedClassId, setSelectedClassId] = useState<string>('');
    const [reason, setReason] = useState('');
    const [acceptNote, setAcceptNote] = useState('');

    // Get instructor ID
    const { data: instructorData } = useQuery({
        queryKey: ['instructor-by-user', user?.id],
        queryFn: async () => {
            return (await api.get('/instructors/me')).data;
        },
        enabled: !!user?.id,
    });

    const instructorId = instructorData?.id;

    // Fetch substitutions
    const { data: substitutions, isLoading } = useQuery<Substitution[]>({
        queryKey: ['coach-substitutions', instructorId, activeTab],
        queryFn: async () => {
            const type = activeTab === 'mine' ? 'requested' : activeTab === 'available' ? 'available' : 'all';
            const response = await api.get(`/instructors/${instructorId}/substitutions?type=${type}`);
            return response.data;
        },
        enabled: !!instructorId,
    });

    // Fetch upcoming classes for request
    const { data: upcomingClasses } = useQuery<ClassForSub[]>({
        queryKey: ['coach-upcoming-for-sub', instructorId],
        queryFn: async () => {
            const from = format(new Date(), 'yyyy-MM-dd');
            const to = format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
            const response = await api.get(`/instructors/${instructorId}/classes?from=${from}&to=${to}`);
            return response.data;
        },
        enabled: !!instructorId && isRequestOpen,
    });

    // Request substitution mutation
    const requestMutation = useMutation({
        mutationFn: async () => {
            return await api.post(`/instructors/${instructorId}/substitutions`, {
                classId: selectedClassId,
                reason,
            });
        },
        onSuccess: () => {
            toast({ title: 'Solicitud enviada', description: 'Tu solicitud de sustitución ha sido publicada.' });
            queryClient.invalidateQueries({ queryKey: ['coach-substitutions'] });
            setIsRequestOpen(false);
            setSelectedClassId('');
            setReason('');
        },
        onError: (err: any) => {
            toast({ variant: 'destructive', title: 'Error', description: err.response?.data?.error || 'Error al solicitar' });
        },
    });

    // Accept substitution mutation
    const acceptMutation = useMutation({
        mutationFn: async (subId: string) => {
            return await api.put(`/instructors/${instructorId}/substitutions/${subId}/accept`, {
                note: acceptNote,
            });
        },
        onSuccess: () => {
            toast({ title: '¡Oferta enviada!', description: 'Te ofreciste a cubrir — falta la aprobación del admin.' });
            queryClient.invalidateQueries({ queryKey: ['coach-substitutions'] });
            queryClient.invalidateQueries({ queryKey: ['coach-upcoming-classes'] });
            setIsAcceptOpen(false);
            setSelectedSub(null);
            setAcceptNote('');
        },
        onError: (err: any) => {
            toast({ variant: 'destructive', title: 'Error', description: err.response?.data?.error || 'Error al aceptar' });
        },
    });

    // Cancel substitution mutation
    const cancelMutation = useMutation({
        mutationFn: async (subId: string) => {
            return await api.put(`/instructors/${instructorId}/substitutions/${subId}/cancel`);
        },
        onSuccess: () => {
            toast({ title: 'Solicitud cancelada' });
            queryClient.invalidateQueries({ queryKey: ['coach-substitutions'] });
        },
        onError: (err: any) => {
            toast({ variant: 'destructive', title: 'Error', description: err.response?.data?.error || 'Error al cancelar' });
        },
    });

    const formatTime = (time: string) => time?.substring(0, 5) || '';

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'pending':
                return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Pendiente</Badge>;
            case 'accepted':
                return <Badge variant="outline" className="bg-success/10 text-success border-success/30">Aceptada</Badge>;
            case 'declined':
                return <Badge variant="destructive">Rechazada</Badge>;
            case 'cancelled':
                return <Badge variant="secondary">Cancelada</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    const handleAcceptClick = (sub: Substitution) => {
        setSelectedSub(sub);
        setIsAcceptOpen(true);
    };

    const availableCount = substitutions?.filter(s => s.status === 'pending' && s.original_instructor_id !== instructorId).length || 0;

    return (
        <AuthGuard requiredRoles={['instructor', 'admin']}>
            <CoachLayout>
                <div className="space-y-6">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <h1 className="font-heading text-3xl font-bold">Sustituciones</h1>
                            <p className="text-muted-foreground">
                                Solicita ayuda o cubre clases de otros coaches
                            </p>
                        </div>
                        <Button onClick={() => setIsRequestOpen(true)}>
                            <UserMinus className="h-4 w-4 mr-2" />
                            Solicitar Sustitución
                        </Button>
                    </div>

                    {/* Available Alert */}
                    {availableCount > 0 && activeTab !== 'available' && (
                        <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/10 border border-primary/20">
                            <HandHelping className="h-5 w-5 text-primary" />
                            <span className="flex-1">
                                Hay <strong>{availableCount}</strong> {availableCount === 1 ? 'clase que necesita' : 'clases que necesitan'} sustituto
                            </span>
                            <Button variant="outline" size="sm" onClick={() => setActiveTab('available')}>
                                Ver disponibles
                            </Button>
                        </div>
                    )}

                    {/* Tabs */}
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList>
                            <TabsTrigger value="available" className="relative">
                                Disponibles
                                {availableCount > 0 && (
                                    <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-[10px] text-primary-foreground flex items-center justify-center">
                                        {availableCount}
                                    </span>
                                )}
                            </TabsTrigger>
                            <TabsTrigger value="mine">Mis Solicitudes</TabsTrigger>
                            <TabsTrigger value="accepted">Aceptadas</TabsTrigger>
                        </TabsList>

                        <TabsContent value="available" className="mt-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <UserPlus className="h-5 w-5" />
                                        Clases Disponibles para Cubrir
                                    </CardTitle>
                                    <CardDescription>
                                        Otros coaches necesitan que alguien cubra estas clases
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {isLoading ? (
                                        <div className="space-y-3">
                                            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
                                        </div>
                                    ) : !substitutions?.filter(s => s.status === 'pending').length ? (
                                        <div className="text-center py-12 text-muted-foreground">
                                            <HandHelping className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                            <p>No hay clases disponibles para cubrir</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {substitutions
                                                .filter(s => s.status === 'pending')
                                                .map((sub) => (
                                                    <div
                                                        key={sub.id}
                                                        className="flex items-center gap-4 p-4 rounded-lg border hover:bg-muted/50"
                                                    >
                                                        <div
                                                            className="w-2 h-16 rounded-full shrink-0"
                                                            style={{ backgroundColor: sub.class_type_color }}
                                                        />
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-medium">{sub.class_type_name}</p>
                                                            <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
                                                                <span className="flex items-center gap-1">
                                                                    <Calendar className="h-3 w-3" />
                                                                    {format(parseLocalDate(sub.date), "EEE d MMM", { locale: es })}
                                                                </span>
                                                                <span className="flex items-center gap-1">
                                                                    <Clock className="h-3 w-3" />
                                                                    {formatTime(sub.start_time)} - {formatTime(sub.end_time)}
                                                                </span>
                                                            </div>
                                                            <p className="text-sm text-muted-foreground mt-1">
                                                                Solicitado por: <strong>{sub.original_instructor_name}</strong>
                                                            </p>
                                                            {sub.reason && (
                                                                <p className="text-xs text-warning mt-1 flex items-center gap-1">
                                                                    <AlertCircle className="h-3 w-3" />
                                                                    {sub.reason}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <Button onClick={() => handleAcceptClick(sub)}>
                                                            <Check className="h-4 w-4 mr-2" />
                                                            Ofrecerme a cubrir
                                                        </Button>
                                                    </div>
                                                ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="mine" className="mt-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <UserMinus className="h-5 w-5" />
                                        Mis Solicitudes
                                    </CardTitle>
                                    <CardDescription>
                                        Clases para las que has solicitado sustitución
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {isLoading ? (
                                        <div className="space-y-3">
                                            {[1, 2].map((i) => <Skeleton key={i} className="h-24" />)}
                                        </div>
                                    ) : !substitutions?.filter(s => s.original_instructor_id === instructorId).length ? (
                                        <div className="text-center py-12 text-muted-foreground">
                                            <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                            <p>No has solicitado ninguna sustitución</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {substitutions
                                                .filter(s => s.original_instructor_id === instructorId)
                                                .map((sub) => (
                                                    <div
                                                        key={sub.id}
                                                        className="flex items-center gap-4 p-4 rounded-lg border"
                                                    >
                                                        <div
                                                            className="w-2 h-16 rounded-full shrink-0"
                                                            style={{ backgroundColor: sub.class_type_color }}
                                                        />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <p className="font-medium">{sub.class_type_name}</p>
                                                                {getStatusBadge(sub.status)}
                                                            </div>
                                                            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                                                                <span className="flex items-center gap-1">
                                                                    <Calendar className="h-3 w-3" />
                                                                    {format(parseLocalDate(sub.date), "EEE d MMM", { locale: es })}
                                                                </span>
                                                                <span className="flex items-center gap-1">
                                                                    <Clock className="h-3 w-3" />
                                                                    {formatTime(sub.start_time)}
                                                                </span>
                                                            </div>
                                                            {sub.substitute_instructor_name && (
                                                                <p className="text-sm text-success mt-1">
                                                                    Cubierta por: <strong>{sub.substitute_instructor_name}</strong>
                                                                </p>
                                                            )}
                                                        </div>
                                                        {sub.status === 'pending' && (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => cancelMutation.mutate(sub.id)}
                                                                disabled={cancelMutation.isPending}
                                                            >
                                                                <X className="h-4 w-4 mr-1" />
                                                                Cancelar
                                                            </Button>
                                                        )}
                                                    </div>
                                                ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="accepted" className="mt-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Check className="h-5 w-5" />
                                        Clases que Cubrirás
                                    </CardTitle>
                                    <CardDescription>
                                        Clases de otros coaches que has aceptado cubrir
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {isLoading ? (
                                        <div className="space-y-3">
                                            {[1, 2].map((i) => <Skeleton key={i} className="h-24" />)}
                                        </div>
                                    ) : !substitutions?.filter(s => s.substitute_instructor_id === instructorId && s.status === 'accepted').length ? (
                                        <div className="text-center py-12 text-muted-foreground">
                                            <Check className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                            <p>No has aceptado cubrir ninguna clase</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {substitutions
                                                .filter(s => s.substitute_instructor_id === instructorId && s.status === 'accepted')
                                                .map((sub) => (
                                                    <div
                                                        key={sub.id}
                                                        className="flex items-center gap-4 p-4 rounded-lg border bg-success/5"
                                                    >
                                                        <div
                                                            className="w-2 h-16 rounded-full shrink-0"
                                                            style={{ backgroundColor: sub.class_type_color }}
                                                        />
                                                        <div className="flex-1">
                                                            <p className="font-medium">{sub.class_type_name}</p>
                                                            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                                                                <span className="flex items-center gap-1">
                                                                    <Calendar className="h-3 w-3" />
                                                                    {format(parseLocalDate(sub.date), "EEEE d 'de' MMMM", { locale: es })}
                                                                </span>
                                                                <span className="flex items-center gap-1">
                                                                    <Clock className="h-3 w-3" />
                                                                    {formatTime(sub.start_time)} - {formatTime(sub.end_time)}
                                                                </span>
                                                            </div>
                                                            <p className="text-sm text-muted-foreground mt-1">
                                                                Originalmente de: <strong>{sub.original_instructor_name}</strong>
                                                            </p>
                                                        </div>
                                                        <Badge className="bg-success">
                                                            <Check className="h-3 w-3 mr-1" />
                                                            Confirmada
                                                        </Badge>
                                                    </div>
                                                ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>

                {/* Request Substitution Dialog */}
                <Dialog open={isRequestOpen} onOpenChange={setIsRequestOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Solicitar Sustitución</DialogTitle>
                            <DialogDescription>
                                Selecciona la clase para la que necesitas un sustituto
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Clase</Label>
                                <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecciona una clase" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {upcomingClasses?.filter(cls => cls.id).map((cls) => (
                                            <SelectItem key={cls.id} value={cls.id}>
                                                {cls.class_type_name} - {format(parseLocalDate(cls.date), "EEE d MMM", { locale: es })} {formatTime(cls.start_time)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Motivo (opcional)</Label>
                                <Textarea
                                    placeholder="Ej: Cita médica, viaje, etc."
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                />
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsRequestOpen(false)}>
                                Cancelar
                            </Button>
                            <Button
                                onClick={() => requestMutation.mutate()}
                                disabled={!selectedClassId || requestMutation.isPending}
                            >
                                {requestMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                Solicitar
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Accept Substitution Dialog */}
                <Dialog open={isAcceptOpen} onOpenChange={setIsAcceptOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Ofrecerme a cubrir</DialogTitle>
                            <DialogDescription>
                                Tu oferta quedará pendiente de aprobación por el admin.
                            </DialogDescription>
                        </DialogHeader>

                        {selectedSub && (
                            <div className="p-4 rounded-lg bg-muted">
                                <p className="font-medium">{selectedSub.class_type_name}</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    {format(parseLocalDate(selectedSub.date), "EEEE d 'de' MMMM", { locale: es })}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    {formatTime(selectedSub.start_time)} - {formatTime(selectedSub.end_time)}
                                </p>
                                <p className="text-sm mt-2">
                                    Coach original: <strong>{selectedSub.original_instructor_name}</strong>
                                </p>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label>Nota (opcional)</Label>
                            <Textarea
                                placeholder="Mensaje para el coach original"
                                value={acceptNote}
                                onChange={(e) => setAcceptNote(e.target.value)}
                            />
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsAcceptOpen(false)}>
                                Cancelar
                            </Button>
                            <Button
                                onClick={() => selectedSub && acceptMutation.mutate(selectedSub.id)}
                                disabled={acceptMutation.isPending}
                            >
                                {acceptMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                Ofrecerme a cubrir
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CoachLayout>
        </AuthGuard>
    );
}
