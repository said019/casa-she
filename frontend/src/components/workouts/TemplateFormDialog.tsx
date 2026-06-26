import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
    Loader2, Plus, Trash2, Dumbbell
} from 'lucide-react';

// Types
export interface WorkoutTemplate {
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

export interface WorkoutExercise {
    id?: string;
    name: string;
    description?: string | null;
    duration_seconds?: number | null;
    reps?: number | null;
    sets: number;
    rest_seconds: number;
    sort_order?: number;
    section: 'warm_up' | 'main' | 'cool_down' | string;
    video_url?: string | null;
    image_url?: string | null;
    notes?: string | null;
}

export interface ClassType {
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

export type TemplateForm = z.infer<typeof templateSchema>;

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

interface TemplateFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    template: WorkoutTemplate | null;
    classTypes: ClassType[];
    onSubmit: (data: TemplateForm) => void;
    isLoading: boolean;
}

export function TemplateFormDialog({
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

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: 'exercises',
    });

    // Reset form when template changes
    useEffect(() => {
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
                    section: ex.section as any,
                    videoUrl: ex.video_url || '',
                    imageUrl: ex.image_url || '',
                    notes: ex.notes || '',
                })) || [],
            });
        } else {
            form.reset({
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
            });
        }
    }, [template, form]);

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
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col rounded-2xl border-border/40">
                <DialogHeader>
                    <DialogTitle className="font-heading text-xl">
                        {template ? 'Editar Plantilla' : 'Nueva Plantilla de Rutina'}
                    </DialogTitle>
                    <DialogDescription className="font-body">
                        Crea una rutina de ejercicios que puedas reutilizar en tus clases
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="h-[calc(90vh-180px)] pr-4">
                    <form id="template-form" onSubmit={handleSubmit} className="space-y-6">
                        {/* Basic Info */}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="name" className="font-body font-medium text-sm">Nombre *</Label>
                                <Input
                                    id="name"
                                    placeholder="Ej: Barre Cardio Intenso"
                                    className="rounded-xl font-body"
                                    {...form.register('name')}
                                />
                                {form.formState.errors.name && (
                                    <p className="text-xs text-destructive font-body">
                                        {form.formState.errors.name.message}
                                    </p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="classTypeId" className="font-body font-medium text-sm">Tipo de Clase</Label>
                                <Select
                                    value={form.watch('classTypeId')}
                                    onValueChange={(v) => form.setValue('classTypeId', v)}
                                >
                                    <SelectTrigger className="rounded-xl font-body">
                                        <SelectValue placeholder="Seleccionar tipo" />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl">
                                        {classTypes.map((ct) => (
                                            <SelectItem key={ct.id} value={ct.id} className="rounded-lg font-body">
                                                {ct.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description" className="font-body font-medium text-sm">Descripción</Label>
                            <Textarea
                                id="description"
                                placeholder="Describe esta rutina..."
                                rows={2}
                                className="rounded-xl font-body"
                                {...form.register('description')}
                            />
                        </div>

                        <div className="grid gap-4 sm:grid-cols-3">
                            <div className="space-y-2">
                                <Label htmlFor="durationMinutes" className="font-body font-medium text-sm">Duración (min)</Label>
                                <Input
                                    id="durationMinutes"
                                    type="number"
                                    className="rounded-xl font-body"
                                    {...form.register('durationMinutes')}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="difficulty" className="font-body font-medium text-sm">Dificultad</Label>
                                <Select
                                    value={form.watch('difficulty')}
                                    onValueChange={(v: any) => form.setValue('difficulty', v)}
                                >
                                    <SelectTrigger className="rounded-xl font-body">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl">
                                        <SelectItem value="beginner" className="rounded-lg font-body">Principiante</SelectItem>
                                        <SelectItem value="intermediate" className="rounded-lg font-body">Intermedio</SelectItem>
                                        <SelectItem value="advanced" className="rounded-lg font-body">Avanzado</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="musicPlaylistUrl" className="font-body font-medium text-sm">URL Playlist</Label>
                                <Input
                                    id="musicPlaylistUrl"
                                    type="url"
                                    placeholder="https://spotify.com/..."
                                    className="rounded-xl font-body"
                                    {...form.register('musicPlaylistUrl')}
                                />
                            </div>
                        </div>

                        {/* Equipment */}
                        <div className="space-y-2">
                            <Label className="font-body font-medium text-sm">Equipo Necesario</Label>
                            <div className="flex flex-wrap gap-2">
                                {EQUIPMENT_OPTIONS.map((eq) => {
                                    const isSelected = form.watch('equipmentNeeded')?.includes(eq);
                                    return (
                                        <Badge
                                            key={eq}
                                            variant={isSelected ? 'default' : 'outline'}
                                            className={`cursor-pointer rounded-lg font-body text-xs transition-all ${
                                                isSelected
                                                    ? 'bg-balance-gold hover:bg-balance-gold/90 text-white border-balance-gold'
                                                    : 'hover:border-balance-gold/50 hover:text-balance-gold'
                                            }`}
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
                            <Label className="font-body font-medium text-sm">Tags</Label>
                            <div className="flex flex-wrap gap-2">
                                {TAG_OPTIONS.map((tag) => {
                                    const isSelected = form.watch('tags')?.includes(tag);
                                    return (
                                        <Badge
                                            key={tag}
                                            variant={isSelected ? 'secondary' : 'outline'}
                                            className={`cursor-pointer rounded-lg font-body text-xs transition-all ${
                                                isSelected
                                                    ? 'bg-balance-gold/15 text-balance-gold border-balance-gold/30'
                                                    : 'hover:border-balance-gold/50 hover:text-balance-gold'
                                            }`}
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
                        <div className="flex items-center space-x-3 bg-muted/30 rounded-xl px-4 py-3 border border-border/30">
                            <Switch
                                id="isPublic"
                                checked={form.watch('isPublic')}
                                onCheckedChange={(v) => form.setValue('isPublic', v)}
                            />
                            <Label htmlFor="isPublic" className="font-body text-sm">
                                Compartir con otras coaches
                            </Label>
                        </div>

                        <Separator className="bg-border/40" />

                        {/* Exercises */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label className="text-base font-heading font-semibold">Ejercicios</Label>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="rounded-xl font-body border-balance-gold/30 text-balance-gold hover:bg-balance-gold/10"
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
                                <div className="text-center py-10 border-2 border-dashed border-border/50 rounded-2xl bg-muted/20">
                                    <div className="h-12 w-12 rounded-xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
                                        <Dumbbell className="h-6 w-6 text-muted-foreground/40" />
                                    </div>
                                    <p className="text-muted-foreground font-body text-sm">
                                        Agrega ejercicios a tu rutina
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {fields.map((field, index) => (
                                        <div
                                            key={field.id}
                                            className="border border-border/40 rounded-xl p-4 space-y-3 bg-muted/10 hover:border-border/60 transition-colors"
                                        >
                                            <div className="flex items-start gap-3">
                                                <span className="flex-shrink-0 h-7 w-7 rounded-lg bg-balance-gold/10 text-balance-gold text-xs font-semibold flex items-center justify-center mt-1">
                                                    {index + 1}
                                                </span>
                                                <div className="flex-1 grid gap-3 sm:grid-cols-2">
                                                    <Input
                                                        placeholder="Nombre del ejercicio"
                                                        className="rounded-xl font-body"
                                                        {...form.register(`exercises.${index}.name`)}
                                                    />
                                                    <Select
                                                        value={form.watch(`exercises.${index}.section`)}
                                                        onValueChange={(v: any) =>
                                                            form.setValue(`exercises.${index}.section`, v)
                                                        }
                                                    >
                                                        <SelectTrigger className="rounded-xl font-body">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent className="rounded-xl">
                                                            <SelectItem value="warm_up" className="rounded-lg font-body">🔥 Calentamiento</SelectItem>
                                                            <SelectItem value="main" className="rounded-lg font-body">💪 Principal</SelectItem>
                                                            <SelectItem value="cool_down" className="rounded-lg font-body">🧘 Enfriamiento</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 rounded-lg hover:bg-destructive/10"
                                                    onClick={() => remove(index)}
                                                >
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </div>

                                            <div className="grid gap-3 sm:grid-cols-4 pl-10">
                                                <Input
                                                    type="number"
                                                    placeholder="Segundos"
                                                    className="rounded-xl font-body text-sm"
                                                    {...form.register(`exercises.${index}.durationSeconds`)}
                                                />
                                                <Input
                                                    type="number"
                                                    placeholder="Reps"
                                                    className="rounded-xl font-body text-sm"
                                                    {...form.register(`exercises.${index}.reps`)}
                                                />
                                                <Input
                                                    type="number"
                                                    placeholder="Sets"
                                                    className="rounded-xl font-body text-sm"
                                                    {...form.register(`exercises.${index}.sets`)}
                                                />
                                                <Input
                                                    type="number"
                                                    placeholder="Descanso (seg)"
                                                    className="rounded-xl font-body text-sm"
                                                    {...form.register(`exercises.${index}.restSeconds`)}
                                                />
                                            </div>

                                            <div className="pl-10">
                                                <Textarea
                                                    placeholder="Notas o instrucciones..."
                                                    rows={1}
                                                    className="rounded-xl font-body text-sm"
                                                    {...form.register(`exercises.${index}.notes`)}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </form>
                </ScrollArea>

                <DialogFooter className="mt-4">
                    <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl font-body border-border/60">
                        Cancelar
                    </Button>
                    <Button type="submit" form="template-form" disabled={isLoading} className="bg-balance-gold hover:bg-balance-gold/90 rounded-xl font-body">
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {template ? 'Guardar Cambios' : 'Crear Plantilla'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
