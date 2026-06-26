import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
import { Plus, Pencil, Trash2, GripVertical, ThumbsUp, ThumbsDown, Minus, ArrowLeft, Save } from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

interface ReviewTag {
    id: string;
    name: string;
    name_en: string | null;
    category: 'positive' | 'negative' | 'neutral';
    icon: string | null;
    is_active: boolean;
    sort_order: number;
    created_at: string;
}

// Lista de emojis comunes para tags
const EMOJI_OPTIONS = [
    '⭐', '🌟', '💫', '✨', '🎵', '🎶', '💪', '🔥', '👍', '👎', 
    '❤️', '💚', '💙', '🧘', '🏃', '🎯', '📋', '⏱️', '🕐', '👥',
    '🔊', '🔇', '👀', '😴', '😰', '😊', '🤩', '💨', '🌙', '☀️',
    '🏆', '🎉', '💯', '✅', '❌', '⚠️', '💡', '🎤', '🎧', '💃'
];

const categoryConfig = {
    positive: { label: '¿Qué te gustó?', color: 'bg-success/10 text-success border-success/30', icon: ThumbsUp },
    negative: { label: '¿Algo que mejorar?', color: 'bg-red-100 text-red-800 border-red-200', icon: ThumbsDown },
    neutral: { label: 'Neutral', color: 'bg-muted text-foreground border-border', icon: Minus },
};

export default function ReviewTagsManager() {
    const queryClient = useQueryClient();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [deleteTag, setDeleteTag] = useState<ReviewTag | null>(null);
    const [editingTag, setEditingTag] = useState<ReviewTag | null>(null);
    
    // Form state
    const [formData, setFormData] = useState({
        name: '',
        name_en: '',
        category: 'positive' as 'positive' | 'negative' | 'neutral',
        icon: '⭐',
    });

    const { data: tagsData, isLoading } = useQuery<{ tags: ReviewTag[] }>({
        queryKey: ['review-tags'],
        queryFn: async () => {
            const res = await api.get('/reviews/admin/tags');
            return res.data;
        }
    });

    const createMutation = useMutation({
        mutationFn: async (data: typeof formData) => {
            const res = await api.post('/reviews/admin/tags', data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['review-tags'] });
            toast.success('Tag creado correctamente');
            resetForm();
        },
        onError: () => {
            toast.error('Error al crear el tag');
        }
    });

    const updateMutation = useMutation({
        mutationFn: async ({ id, data }: { id: string; data: Partial<ReviewTag> }) => {
            const res = await api.put(`/reviews/admin/tags/${id}`, data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['review-tags'] });
            toast.success('Tag actualizado correctamente');
            resetForm();
        },
        onError: () => {
            toast.error('Error al actualizar el tag');
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const res = await api.delete(`/reviews/admin/tags/${id}`);
            return res.data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['review-tags'] });
            if (data.message?.includes('desactivado')) {
                toast.info('El tag está en uso y fue desactivado');
            } else {
                toast.success('Tag eliminado correctamente');
            }
            setDeleteTag(null);
        },
        onError: () => {
            toast.error('Error al eliminar el tag');
        }
    });

    const toggleActiveMutation = useMutation({
        mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
            const res = await api.put(`/reviews/admin/tags/${id}`, { is_active });
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['review-tags'] });
            toast.success('Estado actualizado');
        },
        onError: () => {
            toast.error('Error al actualizar el estado');
        }
    });

    const resetForm = () => {
        setFormData({
            name: '',
            name_en: '',
            category: 'positive',
            icon: '⭐',
        });
        setEditingTag(null);
        setIsDialogOpen(false);
    };

    const handleEdit = (tag: ReviewTag) => {
        setEditingTag(tag);
        setFormData({
            name: tag.name,
            name_en: tag.name_en || '',
            category: tag.category,
            icon: tag.icon || '⭐',
        });
        setIsDialogOpen(true);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (editingTag) {
            updateMutation.mutate({ id: editingTag.id, data: formData });
        } else {
            createMutation.mutate(formData);
        }
    };

    const groupedTags = {
        positive: tagsData?.tags.filter(t => t.category === 'positive') || [],
        negative: tagsData?.tags.filter(t => t.category === 'negative') || [],
        neutral: tagsData?.tags.filter(t => t.category === 'neutral') || [],
    };

    return (
        <AdminLayout>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Link to="/admin/reviews">
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-3xl font-heading font-bold">Opciones de Calificación</h1>
                            <p className="text-muted-foreground">Gestiona los tags que los usuarios pueden seleccionar al calificar</p>
                        </div>
                    </div>
                    <Button onClick={() => setIsDialogOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Nuevo Tag
                    </Button>
                </div>

                {/* Preview Card */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Vista Previa</CardTitle>
                        <CardDescription>Así verán los usuarios las opciones de calificación</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Positive Tags */}
                        <div>
                            <h3 className="font-medium mb-3">¿Qué te gustó? (Opcional)</h3>
                            <div className="flex flex-wrap gap-2">
                                {groupedTags.positive.filter(t => t.is_active).map(tag => (
                                    <Badge 
                                        key={tag.id} 
                                        variant="outline" 
                                        className="cursor-pointer hover:bg-primary/10 px-3 py-1.5"
                                    >
                                        {tag.icon} {tag.name}
                                    </Badge>
                                ))}
                            </div>
                        </div>

                        {/* Negative Tags */}
                        <div>
                            <h3 className="font-medium mb-3">¿Algo que mejorar? (Opcional)</h3>
                            <div className="flex flex-wrap gap-2">
                                {groupedTags.negative.filter(t => t.is_active).map(tag => (
                                    <Badge 
                                        key={tag.id} 
                                        variant="outline" 
                                        className="cursor-pointer hover:bg-primary/10 px-3 py-1.5"
                                    >
                                        {tag.icon} {tag.name}
                                    </Badge>
                                ))}
                            </div>
                        </div>

                        {/* Neutral Tags */}
                        {groupedTags.neutral.filter(t => t.is_active).length > 0 && (
                            <div>
                                <h3 className="font-medium mb-3">Otros</h3>
                                <div className="flex flex-wrap gap-2">
                                    {groupedTags.neutral.filter(t => t.is_active).map(tag => (
                                        <Badge 
                                            key={tag.id} 
                                            variant="outline" 
                                            className="cursor-pointer hover:bg-primary/10 px-3 py-1.5"
                                        >
                                            {tag.icon} {tag.name}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Tags Management Tables */}
                {(['positive', 'negative', 'neutral'] as const).map(category => (
                    <Card key={category}>
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                {category === 'positive' && <ThumbsUp className="h-5 w-5 text-success" />}
                                {category === 'negative' && <ThumbsDown className="h-5 w-5 text-red-600" />}
                                {category === 'neutral' && <Minus className="h-5 w-5 text-muted-foreground" />}
                                <CardTitle>{categoryConfig[category].label}</CardTitle>
                            </div>
                            <CardDescription>
                                {category === 'positive' && 'Tags para aspectos positivos de la clase'}
                                {category === 'negative' && 'Tags para áreas de mejora'}
                                {category === 'neutral' && 'Tags neutrales o descriptivos'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {groupedTags[category].length === 0 ? (
                                <p className="text-muted-foreground text-sm text-center py-4">
                                    No hay tags en esta categoría
                                </p>
                            ) : (
                                <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-12"></TableHead>
                                            <TableHead>Icono</TableHead>
                                            <TableHead>Nombre</TableHead>
                                            <TableHead>Nombre (EN)</TableHead>
                                            <TableHead className="text-center">Activo</TableHead>
                                            <TableHead className="text-right">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {groupedTags[category].map(tag => (
                                            <TableRow key={tag.id} className={!tag.is_active ? 'opacity-50' : ''}>
                                                <TableCell>
                                                    <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                                                </TableCell>
                                                <TableCell className="text-xl">{tag.icon || '—'}</TableCell>
                                                <TableCell className="font-medium">{tag.name}</TableCell>
                                                <TableCell className="text-muted-foreground">{tag.name_en || '—'}</TableCell>
                                                <TableCell className="text-center">
                                                    <Switch
                                                        checked={tag.is_active}
                                                        onCheckedChange={(checked) => 
                                                            toggleActiveMutation.mutate({ id: tag.id, is_active: checked })
                                                        }
                                                    />
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => handleEdit(tag)}
                                                        >
                                                            <Pencil className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="text-destructive hover:text-destructive"
                                                            onClick={() => setDeleteTag(tag)}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}

                {/* Create/Edit Dialog */}
                <Dialog open={isDialogOpen} onOpenChange={(open) => !open && resetForm()}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{editingTag ? 'Editar Tag' : 'Nuevo Tag'}</DialogTitle>
                            <DialogDescription>
                                {editingTag 
                                    ? 'Modifica los detalles del tag de calificación'
                                    : 'Crea un nuevo tag de calificación para las reseñas'
                                }
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Nombre *</Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Ej: Excelente instructora"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="name_en">Nombre en Inglés (opcional)</Label>
                                <Input
                                    id="name_en"
                                    value={formData.name_en}
                                    onChange={(e) => setFormData({ ...formData, name_en: e.target.value })}
                                    placeholder="Ej: Excellent instructor"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="category">Categoría *</Label>
                                <Select
                                    value={formData.category}
                                    onValueChange={(value: typeof formData.category) => 
                                        setFormData({ ...formData, category: value })
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="positive">
                                            <div className="flex items-center gap-2">
                                                <ThumbsUp className="h-4 w-4 text-success" />
                                                ¿Qué te gustó?
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="negative">
                                            <div className="flex items-center gap-2">
                                                <ThumbsDown className="h-4 w-4 text-red-600" />
                                                ¿Algo que mejorar?
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="neutral">
                                            <div className="flex items-center gap-2">
                                                <Minus className="h-4 w-4 text-muted-foreground" />
                                                Neutral
                                            </div>
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Icono</Label>
                                <div className="flex flex-wrap gap-2 p-3 border rounded-md max-h-32 overflow-y-auto">
                                    {EMOJI_OPTIONS.map(emoji => (
                                        <button
                                            key={emoji}
                                            type="button"
                                            className={`text-xl p-1 rounded hover:bg-muted transition-colors ${
                                                formData.icon === emoji ? 'bg-primary/20 ring-2 ring-primary' : ''
                                            }`}
                                            onClick={() => setFormData({ ...formData, icon: emoji })}
                                        >
                                            {emoji}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Seleccionado: {formData.icon}
                                </p>
                            </div>

                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={resetForm}>
                                    Cancelar
                                </Button>
                                <Button 
                                    type="submit" 
                                    disabled={createMutation.isPending || updateMutation.isPending}
                                >
                                    <Save className="h-4 w-4 mr-2" />
                                    {editingTag ? 'Guardar Cambios' : 'Crear Tag'}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>

                {/* Delete Confirmation */}
                <AlertDialog open={!!deleteTag} onOpenChange={() => setDeleteTag(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>¿Eliminar tag?</AlertDialogTitle>
                            <AlertDialogDescription>
                                {deleteTag && (
                                    <>
                                        Estás a punto de eliminar el tag "{deleteTag.icon} {deleteTag.name}".
                                        Si el tag ya ha sido usado en reseñas, será desactivado en lugar de eliminado.
                                    </>
                                )}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() => deleteTag && deleteMutation.mutate(deleteTag.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                                Eliminar
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </AdminLayout>
    );
}
