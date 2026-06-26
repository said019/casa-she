import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api, { getErrorMessage } from '@/lib/api';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import {
    Loader2, Plus, Trash2, Heart, Copy, Clock, Dumbbell, Music,
    GripVertical, ChevronDown, ChevronUp, Star, Search, Filter,
    PlayCircle, Users, Edit, MoreHorizontal
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// Types
interface WorkoutTemplate {
    id: string;
    name: string;
    description: string | null;
    class_type_id: string | null;
    created_by: string;
    duration_minutes: number;
    difficulty: string;
    equipment_needed: string[];
    music_playlist_url: string | null;
    is_public: boolean;
    is_featured: boolean;
    uses_count: number;
    tags: string[];
    created_at: string;
    class_type_name?: string;
    class_type_color?: string;
    creator_name?: string;
    creator_photo?: string;
    exercises_count?: number;
    is_favorite?: boolean;
    exercises?: WorkoutExercise[];
}

interface WorkoutExercise {
    id?: string;
    name: string;
    description?: string | null;
    duration_seconds?: number | null;
    reps?: number | null;
    sets: number;
    rest_seconds: number;
    sort_order?: number;
    section: 'warm_up' | 'main' | 'cool_down';
    video_url?: string | null;
    image_url?: string | null;
    notes?: string | null;
}

interface ClassType {
    id: string;
    name: string;
    color: string;
}

// Schema
const exerciseSchema = z.object({
    name: z.string().min(1, 'Nombre requerido'),
    description: z.string().optional(),
    durationSeconds: z.coerce.number().int().positive().optional().or(z.literal('')),
    reps: z.coerce.number().int().positive().optional().or(z.literal('')),
    sets: z.coerce.number().int().positive().default(1),
    restSeconds: z.coerce.number().int().min(0).default(0),
    section: z.enum(['warm_up', 'main', 'cool_down']).default('main'),
    videoUrl: z.string().url().optional().or(z.literal('')),
    imageUrl: z.string().url().optional().or(z.literal('')),
    notes: z.string().optional(),
});

const templateSchema = z.object({
    name: z.string().min(1, 'Nombre requerido').max(255),
    description: z.string().optional(),
    classTypeId: z.string().uuid().optional().or(z.literal('')),
    durationMinutes: z.coerce.number().int().positive().default(50),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']).default('intermediate'),
    equipmentNeeded: z.array(z.string()).default([]),
    musicPlaylistUrl: z.string().url().optional().or(z.literal('')),
    isPublic: z.boolean().default(true),
    tags: z.array(z.string()).default([]),
    exercises: z.array(exerciseSchema).default([]),
});

type TemplateForm = z.infer<typeof templateSchema>;

// Equipment options
const EQUIPMENT_OPTIONS = [
    'Mat', 'Pesas ligeras', 'Pesas medianas', 'Banda elástica', 'Barra',
    'Pelota', 'Bloque', 'Aro', 'Reformer', 'Silla'
];

// Tag options
const TAG_OPTIONS = [
    'Cardio', 'Fuerza', 'Flexibilidad', 'Core', 'Brazos', 'Piernas',
    'Glúteos', 'Espalda', 'Full body', 'Bajo impacto', 'Alto impacto', 'Prenatal'
];

export default function WorkoutTemplates() {
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isViewOpen, setIsViewOpen] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<WorkoutTemplate | null>(null);
    const [activeTab, setActiveTab] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [filterClassType, setFilterClassType] = useState<string>('all');
    const [filterDifficulty, setFilterDifficulty] = useState<string>('all');
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Queries
    const { data: templates, isLoading } = useQuery<WorkoutTemplate[]>({
        queryKey: ['workout-templates', activeTab, searchTerm, filterClassType, filterDifficulty],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (searchTerm) params.append('search', searchTerm);
            if (filterClassType && filterClassType !== 'all') params.append('classType', filterClassType);
            if (filterDifficulty && filterDifficulty !== 'all') params.append('difficulty', filterDifficulty);
            if (activeTab === 'my') params.append('myTemplates', 'true');
            if (activeTab === 'favorites') params.append('favorites', 'true');
            if (activeTab === 'featured') params.append('featured', 'true');
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
            toast({ title: 'Plantilla duplicada', description: 'Puedes editarla en "Mis Plantillas"' });
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
        } catch (error) {
            toast({ title: 'Error', description: 'No se pudo cargar la plantilla', variant: 'destructive' });
        }
    };

    const getDifficultyColor = (difficulty: string) => {
        switch (difficulty) {
            case 'beginner': return 'bg-success/10 text-success';
            case 'intermediate': return 'bg-yellow-100 text-yellow-700';
            case 'advanced': return 'bg-red-100 text-red-700';
            default: return 'bg-muted text-muted-foreground';
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

    const getSectionLabel = (section: string) => {
        switch (section) {
            case 'warm_up': return 'Calentamiento';
            case 'main': return 'Principal';
            case 'cool_down': return 'Enfriamiento';
            default: return section;
        }
    };

    return (
        <AuthGuard requiredRoles={['admin', 'instructor']}>
            <AdminLayout>
                <div className="space-y-6">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-heading font-bold">Plantillas de Rutinas</h1>
                            <p className="text-muted-foreground">
                                Crea y comparte rutinas de ejercicios con otras coaches
                            </p>
                        </div>
                        <Button onClick={handleCreateNew}>
                            <Plus className="mr-2 h-4 w-4" />
                            Nueva Plantilla
                        </Button>
                    </div>

                    {/* Filters */}
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar plantillas..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <Select value={filterClassType} onValueChange={setFilterClassType}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Tipo de clase" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos los tipos</SelectItem>
                                {classTypes?.map((ct) => (
                                    <SelectItem key={ct.id} value={ct.id}>{ct.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={filterDifficulty} onValueChange={setFilterDifficulty}>
                            <SelectTrigger className="w-[150px]">
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
                        <TabsList>
                            <TabsTrigger value="all">Todas</TabsTrigger>
                            <TabsTrigger value="my">Mis Plantillas</TabsTrigger>
                            <TabsTrigger value="favorites">Favoritos</TabsTrigger>
                            <TabsTrigger value="featured">Destacadas</TabsTrigger>
                        </TabsList>

                        <TabsContent value={activeTab} className="mt-6">
                            {isLoading ? (
                                <div className="flex justify-center py-12">
                                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                </div>
                            ) : templates?.length === 0 ? (
                                <Card className="py-12">
                                    <CardContent className="text-center">
                                        <Dumbbell className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                                        <h3 className="font-semibold mb-2">No hay plantillas</h3>
                                        <p className="text-muted-foreground mb-4">
                                            {activeTab === 'my'
                                                ? 'Crea tu primera plantilla de rutina'
                                                : 'No se encontraron plantillas con estos filtros'}
                                        </p>
                                        {activeTab === 'my' && (
                                            <Button onClick={handleCreateNew}>
                                                <Plus className="mr-2 h-4 w-4" />
                                                Crear Plantilla
                                            </Button>
                                        )}
                                    </CardContent>
                                </Card>
                            ) : (
                                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                    {templates?.map((template) => (
                                        <Card
                                            key={template.id}
                                            className="group hover:shadow-md transition-shadow cursor-pointer"
                                            onClick={() => handleView(template)}
                                        >
                                            <CardHeader className="pb-3">
                                                <div className="flex items-start justify-between">
                                                    <div className="space-y-1">
                                                        <CardTitle className="text-lg flex items-center gap-2">
                                                            {template.name}
                                                            {template.is_featured && (
                                                                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                                            )}
                                                        </CardTitle>
                                                        {template.class_type_name && (
                                                            <Badge
                                                                variant="outline"
                                                                style={{
                                                                    borderColor: template.class_type_color,
                                                                    color: template.class_type_color,
                                                                }}
                                                            >
                                                                {template.class_type_name}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem onClick={(e) => {
                                                                e.stopPropagation();
                                                                favoriteMutation.mutate(template.id);
                                                            }}>
                                                                <Heart className={cn("mr-2 h-4 w-4", template.is_favorite && "fill-red-500 text-red-500")} />
                                                                {template.is_favorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={(e) => {
                                                                e.stopPropagation();
                                                                duplicateMutation.mutate(template.id);
                                                            }}>
                                                                <Copy className="mr-2 h-4 w-4" />
                                                                Duplicar
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleEdit(template);
                                                            }}>
                                                                <Edit className="mr-2 h-4 w-4" />
                                                                Editar
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                className="text-destructive"
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
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="pb-3">
                                                {template.description && (
                                                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                                                        {template.description}
                                                    </p>
                                                )}
                                                <div className="flex flex-wrap gap-2 mb-3">
                                                    <Badge className={getDifficultyColor(template.difficulty)}>
                                                        {getDifficultyLabel(template.difficulty)}
                                                    </Badge>
                                                    <Badge variant="secondary">
                                                        <Clock className="mr-1 h-3 w-3" />
                                                        {template.duration_minutes} min
                                                    </Badge>
                                                    {template.exercises_count !== undefined && (
                                                        <Badge variant="secondary">
                                                            {template.exercises_count} ejercicios
                                                        </Badge>
                                                    )}
                                                </div>
                                                {template.equipment_needed?.length > 0 && (
                                                    <div className="flex flex-wrap gap-1">
                                                        {template.equipment_needed.slice(0, 3).map((eq, i) => (
                                                            <Badge key={i} variant="outline" className="text-xs">
                                                                {eq}
                                                            </Badge>
                                                        ))}
                                                        {template.equipment_needed.length > 3 && (
                                                            <Badge variant="outline" className="text-xs">
                                                                +{template.equipment_needed.length - 3}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                )}
                                            </CardContent>
                                            <CardFooter className="pt-3 border-t">
                                                <div className="flex items-center justify-between w-full text-sm text-muted-foreground">
                                                    <div className="flex items-center gap-2">
                                                        <Avatar className="h-6 w-6">
                                                            <AvatarImage src={template.creator_photo || undefined} />
                                                            <AvatarFallback className="text-xs">
                                                                {template.creator_name?.charAt(0) || '?'}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <span>{template.creator_name}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span className="flex items-center gap-1">
                                                            <Users className="h-3 w-3" />
                                                            {template.uses_count}
                                                        </span>
                                                        {template.is_favorite && (
                                                            <Heart className="h-3 w-3 fill-red-500 text-red-500" />
                                                        )}
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
                    <SheetContent className="sm:max-w-xl">
                        {selectedTemplate && (
                            <>
                                <SheetHeader>
                                    <SheetTitle className="flex items-center gap-2">
                                        {selectedTemplate.name}
                                        {selectedTemplate.is_featured && (
                                            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                        )}
                                    </SheetTitle>
                                    <SheetDescription>
                                        <div className="flex items-center gap-2 mt-2">
                                            <Badge className={getDifficultyColor(selectedTemplate.difficulty)}>
                                                {getDifficultyLabel(selectedTemplate.difficulty)}
                                            </Badge>
                                            <Badge variant="secondary">
                                                <Clock className="mr-1 h-3 w-3" />
                                                {selectedTemplate.duration_minutes} min
                                            </Badge>
                                            {selectedTemplate.class_type_name && (
                                                <Badge
                                                    variant="outline"
                                                    style={{
                                                        borderColor: selectedTemplate.class_type_color,
                                                        color: selectedTemplate.class_type_color,
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
                                                <h4 className="font-medium mb-2">Descripción</h4>
                                                <p className="text-sm text-muted-foreground">
                                                    {selectedTemplate.description}
                                                </p>
                                            </div>
                                        )}

                                        {/* Equipment */}
                                        {selectedTemplate.equipment_needed?.length > 0 && (
                                            <div>
                                                <h4 className="font-medium mb-2">Equipo Necesario</h4>
                                                <div className="flex flex-wrap gap-2">
                                                    {selectedTemplate.equipment_needed.map((eq, i) => (
                                                        <Badge key={i} variant="outline">{eq}</Badge>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Music */}
                                        {selectedTemplate.music_playlist_url && (
                                            <div>
                                                <h4 className="font-medium mb-2 flex items-center gap-2">
                                                    <Music className="h-4 w-4" />
                                                    Playlist
                                                </h4>
                                                <a
                                                    href={selectedTemplate.music_playlist_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-sm text-primary hover:underline"
                                                >
                                                    Abrir playlist
                                                </a>
                                            </div>
                                        )}

                                        <Separator />

                                        {/* Exercises */}
                                        <div>
                                            <h4 className="font-medium mb-4">Ejercicios</h4>
                                            {['warm_up', 'main', 'cool_down'].map((section) => {
                                                const sectionExercises = selectedTemplate.exercises?.filter(
                                                    (ex) => ex.section === section
                                                );
                                                if (!sectionExercises?.length) return null;

                                                return (
                                                    <div key={section} className="mb-6">
                                                        <h5 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">
                                                            {getSectionLabel(section)}
                                                        </h5>
                                                        <div className="space-y-3">
                                                            {sectionExercises.map((exercise, index) => (
                                                                <div
                                                                    key={exercise.id || index}
                                                                    className="bg-muted/50 rounded-lg p-3"
                                                                >
                                                                    <div className="flex items-start justify-between">
                                                                        <div>
                                                                            <h6 className="font-medium">
                                                                                {index + 1}. {exercise.name}
                                                                            </h6>
                                                                            {exercise.description && (
                                                                                <p className="text-sm text-muted-foreground mt-1">
                                                                                    {exercise.description}
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                                            {exercise.duration_seconds && (
                                                                                <span>{exercise.duration_seconds}s</span>
                                                                            )}
                                                                            {exercise.reps && (
                                                                                <span>{exercise.reps} reps</span>
                                                                            )}
                                                                            {exercise.sets > 1 && (
                                                                                <span>× {exercise.sets}</span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    {exercise.notes && (
                                                                        <p className="text-xs text-muted-foreground mt-2 italic">
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
                                        className="flex-1"
                                        onClick={() => {
                                            duplicateMutation.mutate(selectedTemplate.id);
                                            setIsViewOpen(false);
                                        }}
                                    >
                                        <Copy className="mr-2 h-4 w-4" />
                                        Duplicar
                                    </Button>
                                    <Button
                                        className="flex-1"
                                        onClick={() => {
                                            setIsViewOpen(false);
                                            handleEdit(selectedTemplate);
                                        }}
                                    >
                                        <Edit className="mr-2 h-4 w-4" />
                                        Editar
                                    </Button>
                                </div>
                            </>
                        )}
                    </SheetContent>
                </Sheet>
            </AdminLayout>
        </AuthGuard>
    );
}

// Template Form Dialog Component
interface TemplateFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    template: WorkoutTemplate | null;
    classTypes: ClassType[];
    onSubmit: (data: TemplateForm) => void;
    isLoading: boolean;
}

function TemplateFormDialog({
    open,
    onOpenChange,
    template,
    classTypes,
    onSubmit,
    isLoading,
}: TemplateFormDialogProps) {
    const form = useForm<TemplateForm>({
        resolver: zodResolver(templateSchema),
        defaultValues: {
            name: '',
            description: '',
            classTypeId: '',
            durationMinutes: 50,
            difficulty: 'intermediate',
            equipmentNeeded: [],
            musicPlaylistUrl: '',
            isPublic: true,
            tags: [],
            exercises: [],
        },
    });

    const { fields, append, remove, move } = useFieldArray({
        control: form.control,
        name: 'exercises',
    });

    // Reset form when template changes
    useState(() => {
        if (template) {
            form.reset({
                name: template.name,
                description: template.description || '',
                classTypeId: template.class_type_id || '',
                durationMinutes: template.duration_minutes,
                difficulty: template.difficulty as any,
                equipmentNeeded: template.equipment_needed || [],
                musicPlaylistUrl: template.music_playlist_url || '',
                isPublic: template.is_public,
                tags: template.tags || [],
                exercises: template.exercises?.map((ex) => ({
                    name: ex.name,
                    description: ex.description || '',
                    durationSeconds: ex.duration_seconds || '',
                    reps: ex.reps || '',
                    sets: ex.sets,
                    restSeconds: ex.rest_seconds,
                    section: ex.section,
                    videoUrl: ex.video_url || '',
                    imageUrl: ex.image_url || '',
                    notes: ex.notes || '',
                })) || [],
            });
        } else {
            form.reset();
        }
    });

    const handleSubmit = form.handleSubmit((data) => {
        // Clean up empty optional fields
        const cleanedData = {
            ...data,
            classTypeId: data.classTypeId || undefined,
            musicPlaylistUrl: data.musicPlaylistUrl || undefined,
            exercises: data.exercises.map((ex) => ({
                ...ex,
                durationSeconds: ex.durationSeconds || undefined,
                reps: ex.reps || undefined,
                videoUrl: ex.videoUrl || undefined,
                imageUrl: ex.imageUrl || undefined,
            })),
        };
        onSubmit(cleanedData as TemplateForm);
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>
                        {template ? 'Editar Plantilla' : 'Nueva Plantilla de Rutina'}
                    </DialogTitle>
                    <DialogDescription>
                        Crea una rutina de ejercicios que puedas reutilizar en tus clases
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto pr-4 -mr-4">
                    <div className="pr-4">
                        <form id="template-form" onSubmit={handleSubmit} className="space-y-6">
                            {/* Basic Info */}
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Nombre *</Label>
                                    <Input
                                        id="name"
                                        placeholder="Ej: Barre Cardio Intenso"
                                        {...form.register('name')}
                                    />
                                    {form.formState.errors.name && (
                                        <p className="text-xs text-destructive">
                                            {form.formState.errors.name.message}
                                        </p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="classTypeId">Tipo de Clase</Label>
                                    <Select
                                        value={form.watch('classTypeId')}
                                        onValueChange={(v) => form.setValue('classTypeId', v)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleccionar tipo" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {classTypes.map((ct) => (
                                                <SelectItem key={ct.id} value={ct.id}>
                                                    {ct.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">Descripción</Label>
                                <Textarea
                                    id="description"
                                    placeholder="Describe esta rutina..."
                                    rows={2}
                                    {...form.register('description')}
                                />
                            </div>

                            <div className="grid gap-4 sm:grid-cols-3">
                                <div className="space-y-2">
                                    <Label htmlFor="durationMinutes">Duración (min)</Label>
                                    <Input
                                        id="durationMinutes"
                                        type="number"
                                        {...form.register('durationMinutes')}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="difficulty">Dificultad</Label>
                                    <Select
                                        value={form.watch('difficulty')}
                                        onValueChange={(v: any) => form.setValue('difficulty', v)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="beginner">Principiante</SelectItem>
                                            <SelectItem value="intermediate">Intermedio</SelectItem>
                                            <SelectItem value="advanced">Avanzado</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="musicPlaylistUrl">URL Playlist</Label>
                                    <Input
                                        id="musicPlaylistUrl"
                                        type="url"
                                        placeholder="https://spotify.com/..."
                                        {...form.register('musicPlaylistUrl')}
                                    />
                                </div>
                            </div>

                            {/* Equipment */}
                            <div className="space-y-2">
                                <Label>Equipo Necesario</Label>
                                <div className="flex flex-wrap gap-2">
                                    {EQUIPMENT_OPTIONS.map((eq) => {
                                        const isSelected = form.watch('equipmentNeeded')?.includes(eq);
                                        return (
                                            <Badge
                                                key={eq}
                                                variant={isSelected ? 'default' : 'outline'}
                                                className="cursor-pointer"
                                                onClick={() => {
                                                    const current = form.getValues('equipmentNeeded') || [];
                                                    if (isSelected) {
                                                        form.setValue('equipmentNeeded', current.filter((e) => e !== eq));
                                                    } else {
                                                        form.setValue('equipmentNeeded', [...current, eq]);
                                                    }
                                                }}
                                            >
                                                {eq}
                                            </Badge>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Tags */}
                            <div className="space-y-2">
                                <Label>Tags</Label>
                                <div className="flex flex-wrap gap-2">
                                    {TAG_OPTIONS.map((tag) => {
                                        const isSelected = form.watch('tags')?.includes(tag);
                                        return (
                                            <Badge
                                                key={tag}
                                                variant={isSelected ? 'secondary' : 'outline'}
                                                className="cursor-pointer"
                                                onClick={() => {
                                                    const current = form.getValues('tags') || [];
                                                    if (isSelected) {
                                                        form.setValue('tags', current.filter((t) => t !== tag));
                                                    } else {
                                                        form.setValue('tags', [...current, tag]);
                                                    }
                                                }}
                                            >
                                                {tag}
                                            </Badge>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Public toggle */}
                            <div className="flex items-center space-x-2">
                                <Switch
                                    id="isPublic"
                                    checked={form.watch('isPublic')}
                                    onCheckedChange={(v) => form.setValue('isPublic', v)}
                                />
                                <Label htmlFor="isPublic">
                                    Compartir con otras coaches
                                </Label>
                            </div>

                            <Separator />

                            {/* Exercises */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <Label className="text-lg">Ejercicios</Label>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => append({
                                            name: '',
                                            description: '',
                                            durationSeconds: '',
                                            reps: '',
                                            sets: 1,
                                            restSeconds: 0,
                                            section: 'main',
                                            videoUrl: '',
                                            imageUrl: '',
                                            notes: '',
                                        })}
                                    >
                                        <Plus className="mr-1 h-4 w-4" />
                                        Agregar Ejercicio
                                    </Button>
                                </div>

                                {fields.length === 0 ? (
                                    <div className="text-center py-8 border-2 border-dashed rounded-lg">
                                        <Dumbbell className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                                        <p className="text-muted-foreground">
                                            Agrega ejercicios a tu rutina
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {fields.map((field, index) => (
                                            <div
                                                key={field.id}
                                                className="border rounded-lg p-4 space-y-3"
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div className="flex-1 grid gap-3 sm:grid-cols-2">
                                                        <Input
                                                            placeholder="Nombre del ejercicio"
                                                            {...form.register(`exercises.${index}.name`)}
                                                        />
                                                        <Select
                                                            value={form.watch(`exercises.${index}.section`)}
                                                            onValueChange={(v: any) =>
                                                                form.setValue(`exercises.${index}.section`, v)
                                                            }
                                                        >
                                                            <SelectTrigger>
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="warm_up">Calentamiento</SelectItem>
                                                                <SelectItem value="main">Principal</SelectItem>
                                                                <SelectItem value="cool_down">Enfriamiento</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => remove(index)}
                                                    >
                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                </div>

                                                <div className="grid gap-3 sm:grid-cols-4">
                                                    <Input
                                                        type="number"
                                                        placeholder="Segundos"
                                                        {...form.register(`exercises.${index}.durationSeconds`)}
                                                    />
                                                    <Input
                                                        type="number"
                                                        placeholder="Reps"
                                                        {...form.register(`exercises.${index}.reps`)}
                                                    />
                                                    <Input
                                                        type="number"
                                                        placeholder="Sets"
                                                        {...form.register(`exercises.${index}.sets`)}
                                                    />
                                                    <Input
                                                        type="number"
                                                        placeholder="Descanso (seg)"
                                                        {...form.register(`exercises.${index}.restSeconds`)}
                                                    />
                                                </div>

                                                <Textarea
                                                    placeholder="Notas o instrucciones..."
                                                    rows={1}
                                                    {...form.register(`exercises.${index}.notes`)}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </form>
                    </div>
                </div>

                <DialogFooter className="mt-4">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button type="submit" form="template-form" disabled={isLoading}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {template ? 'Guardar Cambios' : 'Crear Plantilla'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
