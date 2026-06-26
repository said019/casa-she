import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import {
    Search, Loader2, Clock, Dumbbell, Heart, Copy, Star, Users,
    ChevronRight, Flame, Zap, Snowflake, Plus, Edit, Trash2, MoreHorizontal, Music
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import CoachLayout from '@/components/layout/CoachLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import api, { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import {
    TemplateFormDialog,
    TemplateForm,
    WorkoutTemplate,
    ClassType
} from '@/components/workouts/TemplateFormDialog';

export default function CoachTemplates() {
    const { user } = useAuthStore();
    const [activeTab, setActiveTab] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [filterClassType, setFilterClassType] = useState('');
    const [filterDifficulty, setFilterDifficulty] = useState('');
    const [selectedTemplate, setSelectedTemplate] = useState<WorkoutTemplate | null>(null);
    const [isViewOpen, setIsViewOpen] = useState(false);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Get current instructor ID to check ownership
    const { data: currentInstructor } = useQuery({
        queryKey: ['current-instructor', user?.id],
        queryFn: async () => {
            if (!user?.id) return null;
            return (await api.get('/instructors/me')).data;
        },
        enabled: !!user?.id,
    });

    // Queries
    const { data: templates, isLoading } = useQuery<WorkoutTemplate[]>({
        queryKey: ['workout-templates', activeTab, searchTerm, filterClassType, filterDifficulty],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (searchTerm) params.append('search', searchTerm);
            if (filterClassType) params.append('classType', filterClassType);
            if (filterDifficulty) params.append('difficulty', filterDifficulty);
            if (activeTab === 'my') params.append('myTemplates', 'true');
            if (activeTab === 'favorites') params.append('favorites', 'true');
            return (await api.get(`/workout-templates?${params}`)).data;
        },
    });

    const { data: classTypes } = useQuery<ClassType[]>({
        queryKey: ['class-types'],
        queryFn: async () => (await api.get('/class-types')).data,
    });

    // Mutations
    const createMutation = useMutation({
        mutationFn: (data: TemplateForm) => api.post('/workout-templates', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['workout-templates'] });
            setIsCreateOpen(false);
            toast({ title: 'Plantilla creada', description: 'Tu rutina se guardó exitosamente' });
        },
        onError: (error: any) => {
            toast({ title: 'Error', description: getErrorMessage(error), variant: 'destructive' });
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<TemplateForm> }) =>
            api.put(`/workout-templates/${id}`, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['workout-templates'] });
            setIsCreateOpen(false);
            setSelectedTemplate(null);
            toast({ title: 'Plantilla actualizada' });
        },
        onError: (error: any) => {
            toast({ title: 'Error', description: getErrorMessage(error), variant: 'destructive' });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/workout-templates/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['workout-templates'] });
            toast({ title: 'Plantilla eliminada' });
        },
        onError: (error: any) => {
            toast({ title: 'Error', description: getErrorMessage(error), variant: 'destructive' });
        },
    });

    const favoriteMutation = useMutation({
        mutationFn: (id: string) => api.post(`/workout-templates/${id}/favorite`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['workout-templates'] });
        },
    });

    const duplicateMutation = useMutation({
        mutationFn: (id: string) => api.post(`/workout-templates/${id}/duplicate`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['workout-templates'] });
            toast({ title: 'Plantilla duplicada', description: 'Puedes verla en "Mis Plantillas"' });
        },
        onError: (error: any) => {
            toast({ title: 'Error', description: getErrorMessage(error), variant: 'destructive' });
        },
    });

    const handleCreateNew = () => {
        setSelectedTemplate(null);
        setIsCreateOpen(true);
    };

    const handleEdit = (template: WorkoutTemplate) => {
        setSelectedTemplate(template);
        setIsCreateOpen(true);
    };

    const handleView = async (template: WorkoutTemplate) => {
        try {
            const response = await api.get(`/workout-templates/${template.id}`);
            setSelectedTemplate(response.data);
            setIsViewOpen(true);
        } catch {
            toast({ title: 'Error', description: 'No se pudo cargar la plantilla', variant: 'destructive' });
        }
    };

    const getDifficultyColor = (difficulty: string) => {
        switch (difficulty) {
            case 'beginner': return 'bg-success/10 text-success';
            case 'intermediate': return 'bg-yellow-100 text-yellow-700';
            case 'advanced': return 'bg-red-100 text-red-700';
            default: return 'bg-muted text-foreground';
        }
    };

    const getDifficultyLabel = (difficulty: string) => {
        switch (difficulty) {
            case 'beginner': return 'Principiante';
            case 'intermediate': return 'Intermedio';
            case 'advanced': return 'Avanzado';
            default: return difficulty;
        }
    };

    const getSectionIcon = (section: string) => {
        switch (section) {
            case 'warm_up': return <Flame className="h-4 w-4 text-orange-500" />;
            case 'main': return <Zap className="h-4 w-4 text-info" />;
            case 'cool_down': return <Snowflake className="h-4 w-4 text-cyan-500" />;
            default: return null;
        }
    };

    const getSectionLabel = (section: string) => {
        switch (section) {
            case 'warm_up': return 'Calentamiento';
            case 'main': return 'Principal';
            case 'cool_down': return 'Enfriamiento';
            default: return section;
        }
    };

    const isOwner = (template: WorkoutTemplate) => {
        return currentInstructor && template.created_by === currentInstructor.id;
    };

    return (
        <AuthGuard requiredRoles={['instructor', 'admin']}>
            <CoachLayout>
                <div className="space-y-6">
                    {/* Header with gradient */}
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-balance-dark via-[#3D3229] to-balance-dark p-6 sm:p-8">
                        <div className="absolute top-0 right-0 w-56 h-56 rounded-full bg-balance-gold/[0.08] blur-3xl" />
                        <div className="absolute bottom-0 left-0 w-40 h-40 rounded-full bg-balance-olive/[0.1] blur-3xl" />
                        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <Dumbbell className="h-4 w-4 text-balance-gold/70" />
                                    <p className="text-[10px] uppercase tracking-[3px] text-balance-gold/60 font-semibold font-body">
                                        Coach
                                    </p>
                                </div>
                                <h1 className="text-2xl sm:text-3xl font-heading font-bold text-white">
                                    Plantillas de Rutinas
                                </h1>
                                <p className="text-balance-sand/60 font-body text-sm mt-1">
                                    Explora y crea rutinas para planear tus clases
                                </p>
                            </div>
                            <Button 
                                onClick={handleCreateNew}
                                className="bg-balance-gold hover:bg-balance-gold/90 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5 font-body"
                            >
                                <Plus className="mr-2 h-4 w-4" />
                                Nueva Plantilla
                            </Button>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar plantillas..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 rounded-xl bg-muted/30 border-border/60 focus:ring-2 focus:ring-balance-gold/30 focus:border-balance-gold/40 font-body"
                            />
                        </div>
                        <Select value={filterClassType || 'all'} onValueChange={(v) => setFilterClassType(v === 'all' ? '' : v)}>
                            <SelectTrigger className="w-full sm:w-[180px] rounded-xl font-body">
                                <SelectValue placeholder="Tipo de clase" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos los tipos</SelectItem>
                                {classTypes?.map((ct) => (
                                    <SelectItem key={ct.id} value={ct.id}>{ct.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={filterDifficulty || 'all'} onValueChange={(v) => setFilterDifficulty(v === 'all' ? '' : v)}>
                            <SelectTrigger className="w-full sm:w-[160px] rounded-xl font-body">
                                <SelectValue placeholder="Dificultad" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todas</SelectItem>
                                <SelectItem value="beginner">Principiante</SelectItem>
                                <SelectItem value="intermediate">Intermedio</SelectItem>
                                <SelectItem value="advanced">Avanzado</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Tabs */}
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList className="bg-muted/50 rounded-xl p-1">
                            <TabsTrigger value="all" className="rounded-lg font-body text-sm data-[state=active]:bg-balance-gold data-[state=active]:text-white">
                                Todas
                            </TabsTrigger>
                            <TabsTrigger value="my" className="rounded-lg font-body text-sm data-[state=active]:bg-balance-gold data-[state=active]:text-white">
                                Mis Plantillas
                            </TabsTrigger>
                            <TabsTrigger value="favorites" className="rounded-lg font-body text-sm data-[state=active]:bg-balance-gold data-[state=active]:text-white">
                                Favoritos
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value={activeTab} className="mt-6">
                            {isLoading ? (
                                <div className="flex justify-center py-16">
                                    <Loader2 className="h-8 w-8 animate-spin text-balance-gold" />
                                </div>
                            ) : templates?.length === 0 ? (
                                <div className="text-center py-16">
                                    <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                                        <Dumbbell className="h-8 w-8 text-muted-foreground/40" />
                                    </div>
                                    <h3 className="font-heading font-semibold text-lg mb-1">No hay plantillas</h3>
                                    <p className="text-muted-foreground font-body text-sm mb-5">
                                        {activeTab === 'my'
                                            ? 'Crea tu primera plantilla de rutina para planear tus clases'
                                            : 'No se encontraron plantillas con estos filtros'}
                                    </p>
                                    {activeTab === 'my' && (
                                        <Button onClick={handleCreateNew} className="bg-balance-gold hover:bg-balance-gold/90 rounded-xl font-body">
                                            <Plus className="mr-2 h-4 w-4" />
                                            Crear Plantilla
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                    {templates?.map((template) => (
                                        <Card
                                            key={template.id}
                                            className="group border-border/60 hover:shadow-lg transition-all duration-300 cursor-pointer hover:-translate-y-1 hover:border-balance-gold/30 rounded-2xl overflow-hidden"
                                            onClick={() => handleView(template)}
                                        >
                                            {/* Color accent bar */}
                                            <div 
                                                className="h-1 w-full"
                                                style={{ backgroundColor: template.class_type_color || '#A48550' }}
                                            />
                                            <CardHeader className="pb-3">
                                                <div className="flex items-start justify-between">
                                                    <div className="space-y-1.5">
                                                        <CardTitle className="text-lg font-heading flex items-center gap-2">
                                                            {template.name}
                                                            {template.is_featured && (
                                                                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                                            )}
                                                        </CardTitle>
                                                        {template.class_type_name && (
                                                            <Badge
                                                                variant="outline"
                                                                className="rounded-lg text-xs font-body"
                                                                style={{
                                                                    borderColor: template.class_type_color,
                                                                    color: template.class_type_color,
                                                                    backgroundColor: `${template.class_type_color}10`,
                                                                }}
                                                            >
                                                                {template.class_type_name}
                                                            </Badge>
                                                        )}
                                                    </div>

                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="rounded-xl">
                                                            <DropdownMenuItem onClick={(e) => {
                                                                e.stopPropagation();
                                                                favoriteMutation.mutate(template.id);
                                                            }} className="rounded-lg font-body">
                                                                <Heart className={cn("mr-2 h-4 w-4", template.is_favorite && "fill-red-500 text-red-500")} />
                                                                {template.is_favorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={(e) => {
                                                                e.stopPropagation();
                                                                duplicateMutation.mutate(template.id);
                                                            }} className="rounded-lg font-body">
                                                                <Copy className="mr-2 h-4 w-4" />
                                                                Duplicar
                                                            </DropdownMenuItem>
                                                            {isOwner(template) && (
                                                                <>
                                                                    <DropdownMenuSeparator />
                                                                    <DropdownMenuItem onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleEdit(template);
                                                                    }} className="rounded-lg font-body">
                                                                        <Edit className="mr-2 h-4 w-4" />
                                                                        Editar
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem
                                                                        className="text-destructive rounded-lg font-body"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            if (confirm('¿Eliminar esta plantilla?')) {
                                                                                deleteMutation.mutate(template.id);
                                                                            }
                                                                        }}
                                                                    >
                                                                        <Trash2 className="mr-2 h-4 w-4" />
                                                                        Eliminar
                                                                    </DropdownMenuItem>
                                                                </>
                                                            )}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="pb-3">
                                                {template.description && (
                                                    <p className="text-sm text-muted-foreground font-body line-clamp-2 mb-3">
                                                        {template.description}
                                                    </p>
                                                )}
                                                <div className="flex flex-wrap gap-1.5 mb-3">
                                                    <Badge className={cn("rounded-lg text-xs font-body", getDifficultyColor(template.difficulty))}>
                                                        {getDifficultyLabel(template.difficulty)}
                                                    </Badge>
                                                    <Badge variant="secondary" className="rounded-lg text-xs font-body">
                                                        <Clock className="mr-1 h-3 w-3" />
                                                        {template.duration_minutes} min
                                                    </Badge>
                                                    {template.exercises_count !== undefined && (
                                                        <Badge variant="secondary" className="rounded-lg text-xs font-body">
                                                            {template.exercises_count} ejercicios
                                                        </Badge>
                                                    )}
                                                </div>
                                            </CardContent>
                                            <CardFooter className="pt-3 border-t border-border/40">
                                                <div className="flex items-center justify-between w-full text-sm text-muted-foreground font-body">
                                                    <div className="flex items-center gap-2">
                                                        <Avatar className="h-6 w-6 ring-1 ring-border/50">
                                                            <AvatarImage src={template.creator_photo || undefined} />
                                                            <AvatarFallback className="text-xs bg-muted">
                                                                {template.creator_name?.charAt(0) || '?'}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <span className="text-xs">{template.creator_name}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-xs">
                                                        <span className="flex items-center gap-1">
                                                            <Users className="h-3 w-3" />
                                                            {template.uses_count}
                                                        </span>
                                                        <ChevronRight className="h-4 w-4 text-balance-gold/60 group-hover:text-balance-gold transition-colors" />
                                                    </div>
                                                </div>
                                            </CardFooter>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </TabsContent>
                    </Tabs>
                </div>

                {/* Create/Edit Dialog */}
                <TemplateFormDialog
                    open={isCreateOpen}
                    onOpenChange={setIsCreateOpen}
                    template={selectedTemplate}
                    classTypes={classTypes || []}
                    onSubmit={(data) => {
                        if (selectedTemplate) {
                            updateMutation.mutate({ id: selectedTemplate.id, data });
                        } else {
                            createMutation.mutate(data);
                        }
                    }}
                    isLoading={createMutation.isPending || updateMutation.isPending}
                />

                {/* View Template Sheet */}
                <Sheet open={isViewOpen} onOpenChange={setIsViewOpen}>
                    <SheetContent className="sm:max-w-xl rounded-l-2xl border-l-border/40">
                        {selectedTemplate && (
                            <>
                                <SheetHeader>
                                    <SheetTitle className="flex items-center gap-2 font-heading text-xl">
                                        {selectedTemplate.name}
                                        {selectedTemplate.is_featured && (
                                            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                        )}
                                    </SheetTitle>
                                    <SheetDescription asChild>
                                        <div className="flex items-center gap-2 mt-2">
                                            <Badge className={cn("rounded-lg text-xs font-body", getDifficultyColor(selectedTemplate.difficulty))}>
                                                {getDifficultyLabel(selectedTemplate.difficulty)}
                                            </Badge>
                                            <Badge variant="secondary" className="rounded-lg text-xs font-body">
                                                <Clock className="mr-1 h-3 w-3" />
                                                {selectedTemplate.duration_minutes} min
                                            </Badge>
                                            {selectedTemplate.class_type_name && (
                                                <Badge
                                                    variant="outline"
                                                    className="rounded-lg text-xs font-body"
                                                    style={{
                                                        borderColor: selectedTemplate.class_type_color,
                                                        color: selectedTemplate.class_type_color,
                                                        backgroundColor: `${selectedTemplate.class_type_color}10`,
                                                    }}
                                                >
                                                    {selectedTemplate.class_type_name}
                                                </Badge>
                                            )}
                                        </div>
                                    </SheetDescription>
                                </SheetHeader>

                                <ScrollArea className="h-[calc(100vh-200px)] mt-6">
                                    <div className="space-y-6 pr-4">
                                        {/* Description */}
                                        {selectedTemplate.description && (
                                            <div>
                                                <h4 className="font-heading font-semibold mb-2">Descripción</h4>
                                                <p className="text-sm text-muted-foreground font-body">
                                                    {selectedTemplate.description}
                                                </p>
                                            </div>
                                        )}

                                        {/* Equipment */}
                                        {selectedTemplate.equipment_needed?.length > 0 && (
                                            <div>
                                                <h4 className="font-heading font-semibold mb-2">Equipo Necesario</h4>
                                                <div className="flex flex-wrap gap-2">
                                                    {selectedTemplate.equipment_needed.map((eq, i) => (
                                                        <Badge key={i} variant="outline" className="rounded-lg font-body">{eq}</Badge>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Music */}
                                        {selectedTemplate.music_playlist_url && (
                                            <div>
                                                <h4 className="font-heading font-semibold mb-2 flex items-center gap-2">
                                                    <Music className="h-4 w-4 text-balance-gold" />
                                                    Playlist
                                                </h4>
                                                <a
                                                    href={selectedTemplate.music_playlist_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-sm text-balance-gold hover:underline font-body"
                                                >
                                                    Abrir playlist →
                                                </a>
                                            </div>
                                        )}

                                        <Separator className="bg-border/40" />

                                        {/* Exercises */}
                                        <div>
                                            <h4 className="font-heading font-semibold mb-4">Ejercicios</h4>
                                            {['warm_up', 'main', 'cool_down'].map((section) => {
                                                const sectionExercises = selectedTemplate.exercises?.filter(
                                                    (ex) => ex.section === section
                                                );
                                                if (!sectionExercises?.length) return null;

                                                return (
                                                    <div key={section} className="mb-6">
                                                        <h5 className="text-sm font-semibold text-muted-foreground font-body mb-3 flex items-center gap-2">
                                                            {getSectionIcon(section)}
                                                            {getSectionLabel(section)}
                                                        </h5>
                                                        <div className="space-y-2">
                                                            {sectionExercises.map((exercise, index) => (
                                                                <div
                                                                    key={exercise.id || index}
                                                                    className="bg-muted/30 rounded-xl p-3.5 border border-border/30"
                                                                >
                                                                    <div className="flex items-start justify-between">
                                                                        <div>
                                                                            <h6 className="font-semibold font-body text-sm">
                                                                                {index + 1}. {exercise.name}
                                                                            </h6>
                                                                            {exercise.description && (
                                                                                <p className="text-sm text-muted-foreground font-body mt-1">
                                                                                    {exercise.description}
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                        <div className="flex items-center gap-2 text-xs text-muted-foreground font-body">
                                                                            {exercise.duration_seconds && (
                                                                                <Badge variant="secondary" className="rounded-lg text-xs">{exercise.duration_seconds}s</Badge>
                                                                            )}
                                                                            {exercise.reps && (
                                                                                <Badge variant="secondary" className="rounded-lg text-xs">{exercise.reps} reps</Badge>
                                                                            )}
                                                                            {exercise.sets > 1 && (
                                                                                <Badge variant="secondary" className="rounded-lg text-xs">× {exercise.sets}</Badge>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    {exercise.notes && (
                                                                        <p className="text-xs text-muted-foreground font-body mt-2 italic bg-background/50 rounded-lg px-2.5 py-1.5">
                                                                            💡 {exercise.notes}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </ScrollArea>

                                <div className="flex gap-2 mt-4">
                                    <Button
                                        variant="outline"
                                        className="flex-1 rounded-xl font-body border-border/60"
                                        onClick={() => {
                                            favoriteMutation.mutate(selectedTemplate.id);
                                        }}
                                    >
                                        <Heart className={cn(
                                            "mr-2 h-4 w-4",
                                            selectedTemplate.is_favorite && "fill-red-500 text-red-500"
                                        )} />
                                        {selectedTemplate.is_favorite ? 'Quitar favorito' : 'Favorito'}
                                    </Button>

                                    {isOwner(selectedTemplate) ? (
                                        <Button
                                            className="flex-1 bg-balance-gold hover:bg-balance-gold/90 rounded-xl font-body"
                                            onClick={() => {
                                                setIsViewOpen(false);
                                                handleEdit(selectedTemplate);
                                            }}
                                        >
                                            <Edit className="mr-2 h-4 w-4" />
                                            Editar
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="outline"
                                            className="flex-1 rounded-xl font-body border-border/60"
                                            onClick={() => {
                                                duplicateMutation.mutate(selectedTemplate.id);
                                                setIsViewOpen(false);
                                            }}
                                        >
                                            <Copy className="mr-2 h-4 w-4" />
                                            Duplicar
                                        </Button>
                                    )}
                                </div>
                            </>
                        )}
                    </SheetContent>
                </Sheet>
            </CoachLayout>
        </AuthGuard>
    );
}
