import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getStoredToken } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Video, ArrowLeft, Save, Loader2, UploadCloud, X, Image } from 'lucide-react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';

interface Category {
    id: string;
    name: string;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function AdminVideoUpload() {
    const { id } = useParams();
    const isEditing = !!id;
    const navigate = useNavigate();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const videoInputRef = useRef<HTMLInputElement>(null);
    const thumbnailInputRef = useRef<HTMLInputElement>(null);

    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
    const [thumbnailPreview, setThumbnailPreview] = useState<string>('');

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        category_id: '',
        level: 'todos',
        access_type: 'gratuito',
        is_published: false,
        cloudinary_id: '',
        drive_file_id: '',
        thumbnail_url: '',
        thumbnail_drive_id: '',
        duration_seconds: 0,
        subtitle: '',
        tagline: '',
        days: '',
        brand_color: '#8F9A8A',
        sales_enabled: false,
        sales_unlocks_video: false,
        sales_price_mxn: 0,
        sales_class_credits: 0,
        sales_cta_text: 'Comprar clases',
    });

    // Fetch Categories
    const { data: categories } = useQuery<Category[]>({
        queryKey: ['video-categories'],
        queryFn: async () => {
            const { data } = await api.get('/videos/categories');
            return data;
        },
    });

    // Fetch Video if editing
    const { data: videoData, isLoading: isLoadingVideo } = useQuery({
        queryKey: ['admin-video', id],
        queryFn: async () => {
            const { data } = await api.get(`/videos/${id}`);
            return data;
        },
        enabled: isEditing,
    });

    useEffect(() => {
        if (videoData) {
            setFormData({
                title: videoData.title,
                description: videoData.description || '',
                category_id: videoData.category_id || '',
                level: videoData.level || 'todos',
                access_type: videoData.access_type || 'gratuito',
                is_published: videoData.is_published,
                cloudinary_id: videoData.cloudinary_id || '',
                drive_file_id: videoData.drive_file_id || '',
                thumbnail_url: videoData.thumbnail_url || '',
                thumbnail_drive_id: videoData.thumbnail_drive_id || '',
                duration_seconds: videoData.duration_seconds || 0,
                subtitle: videoData.subtitle || '',
                tagline: videoData.tagline || '',
                days: videoData.days || '',
                brand_color: videoData.brand_color || '#8F9A8A',
                sales_enabled: Boolean(videoData.sales_enabled),
                sales_unlocks_video: Boolean(videoData.sales_unlocks_video),
                sales_price_mxn: Number(videoData.sales_price_mxn || 0),
                sales_class_credits: Number(videoData.sales_class_credits || 0),
                sales_cta_text: videoData.sales_cta_text || 'Comprar clases',
            });
            if (videoData.thumbnail_url) {
                setThumbnailPreview(videoData.thumbnail_url);
            }
        }
    }, [videoData]);

    // Mutations
    const createMutation = useMutation({
        mutationFn: (data: any) => api.post('/videos', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin-videos'] });
            toast({ title: 'Video creado correctamente' });
            navigate('/admin/videos');
        },
        onError: () => toast({ title: 'Error al crear video', variant: 'destructive' }),
    });

    const updateMutation = useMutation({
        mutationFn: (data: any) => api.put(`/videos/${id}`, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin-videos'] });
            queryClient.invalidateQueries({ queryKey: ['admin-video', id] });
            toast({ title: 'Video actualizado correctamente' });
            navigate('/admin/videos');
        },
        onError: () => toast({ title: 'Error al actualizar video', variant: 'destructive' }),
    });

    // Upload video + optional thumbnail to Cloudinary via backend
    const handleUpload = async (): Promise<{
        cloudinary_id: string;
        drive_file_id: string;
        thumbnail_url: string;
        thumbnail_drive_id: string;
        duration_seconds: number;
    } | null> => {
        if (!videoFile) return null;

        setUploading(true);
        setUploadProgress(0);

        try {
            const fd = new FormData();
            fd.append('video', videoFile);
            if (thumbnailFile) {
                fd.append('thumbnail', thumbnailFile);
            }

            const token = getStoredToken();
            const xhr = new XMLHttpRequest();

            return await new Promise((resolve, reject) => {
                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        const pct = Math.round((e.loaded / e.total) * 100);
                        setUploadProgress(pct);
                    }
                });

                xhr.addEventListener('load', () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        const data = JSON.parse(xhr.responseText);
                        resolve({
                            cloudinary_id: data.cloudinary_id || '',
                            drive_file_id: data.drive_file_id,
                            thumbnail_url: data.thumbnail_url || '',
                            thumbnail_drive_id: data.thumbnail_drive_id || '',
                            duration_seconds: Number(data.duration_seconds || 0),
                        });
                    } else {
                        reject(new Error(`Upload failed: ${xhr.status}`));
                    }
                });

                xhr.addEventListener('error', () => reject(new Error('Upload error')));
                xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

                xhr.open('POST', `${API_URL}/videos/upload`);
                if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
                xhr.send(fd);
            });
        } catch (err) {
            console.error('Upload error:', err);
            toast({ title: 'Error al subir archivo', description: 'Intenta de nuevo', variant: 'destructive' });
            return null;
        } finally {
            setUploading(false);
        }
    };

    const handleSave = async () => {
        if (!formData.title || !formData.category_id) {
            toast({ title: 'Completa los campos requeridos', variant: 'destructive' });
            return;
        }
        if (formData.sales_enabled && Number(formData.sales_price_mxn || 0) <= 0) {
            toast({ title: 'Define un precio válido para la venta', variant: 'destructive' });
            return;
        }
        if (formData.sales_unlocks_video && (!formData.sales_enabled || Number(formData.sales_price_mxn || 0) <= 0)) {
            toast({ title: 'Activa venta y precio para desbloquear por compra', variant: 'destructive' });
            return;
        }

        // If a new video file was selected, upload it first
        if (videoFile) {
            const uploaded = await handleUpload();
            if (!uploaded) return;

            const payload = {
                ...formData,
                cloudinary_id: uploaded.cloudinary_id || formData.cloudinary_id || null,
                drive_file_id: uploaded.drive_file_id || formData.drive_file_id || null,
                thumbnail_url: uploaded.thumbnail_url || formData.thumbnail_url || null,
                thumbnail_drive_id: uploaded.thumbnail_drive_id || formData.thumbnail_drive_id || null,
                duration_seconds: uploaded.duration_seconds || formData.duration_seconds,
                sales_price_mxn: formData.sales_enabled ? Number(formData.sales_price_mxn || 0) : null,
                sales_class_credits: formData.sales_enabled ? Number(formData.sales_class_credits || 0) : null,
                sales_unlocks_video: formData.sales_enabled ? Boolean(formData.sales_unlocks_video) : false,
            };

            if (isEditing) {
                updateMutation.mutate(payload);
            } else {
                createMutation.mutate(payload);
            }
        } else {
            // No new file — only metadata update (editing mode)
            if (!formData.cloudinary_id && !formData.drive_file_id && !isEditing) {
                toast({ title: 'Selecciona un archivo de video', variant: 'destructive' });
                return;
            }
            const payload = {
                ...formData,
                cloudinary_id: formData.cloudinary_id || null,
                drive_file_id: formData.drive_file_id || null,
                thumbnail_url: formData.thumbnail_url || null,
                thumbnail_drive_id: formData.thumbnail_drive_id || null,
                sales_price_mxn: formData.sales_enabled ? Number(formData.sales_price_mxn || 0) : null,
                sales_class_credits: formData.sales_enabled ? Number(formData.sales_class_credits || 0) : null,
                sales_unlocks_video: formData.sales_enabled ? Boolean(formData.sales_unlocks_video) : false,
            };
            if (isEditing) {
                updateMutation.mutate(payload);
            } else {
                createMutation.mutate(payload);
            }
        }
    };

    const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 500 * 1024 * 1024) {
            toast({ title: 'Archivo muy grande', description: 'Máximo 500MB', variant: 'destructive' });
            return;
        }
        setVideoFile(file);
    };

    const handleThumbnailSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setThumbnailFile(file);
        const reader = new FileReader();
        reader.onloadend = () => setThumbnailPreview(reader.result as string);
        reader.readAsDataURL(file);
    };

    const clearVideoFile = () => {
        setVideoFile(null);
        if (videoInputRef.current) videoInputRef.current.value = '';
    };

    if (isEditing && isLoadingVideo) {
        return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    return (
        <AuthGuard requiredRoles={['admin']}>
            <AdminLayout>
                <div className="max-w-4xl mx-auto space-y-6">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/videos')}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <div>
                            <h1 className="text-3xl font-heading font-bold">{isEditing ? 'Editar Video' : 'Nuevo Video'}</h1>
                            <p className="text-muted-foreground">Sube un video y configura sus detalles.</p>
                        </div>
                    </div>

                    <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
                        <div className="space-y-6">
                            <Card>
                                <CardContent className="pt-6 space-y-4">
                                    {/* Video File */}
                                    <div className="space-y-2">
                                        <Label>Archivo de Video</Label>
                                        <input
                                            ref={videoInputRef}
                                            type="file"
                                            accept="video/mp4,video/quicktime,video/x-msvideo,video/webm"
                                            onChange={handleVideoSelect}
                                            className="hidden"
                                        />

                                        {videoFile ? (
                                            <div className="rounded-lg border bg-muted p-4 flex items-center gap-4">
                                                <div className="h-16 w-28 bg-black rounded overflow-hidden relative flex items-center justify-center">
                                                    <Video className="h-6 w-6 text-white" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium truncate">{videoFile.name}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
                                                    </p>
                                                </div>
                                                <Button variant="ghost" size="icon" onClick={clearVideoFile}>
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ) : formData.cloudinary_id || formData.drive_file_id ? (
                                            <div className="rounded-lg border bg-muted p-4 flex items-center gap-4">
                                                <div className="h-16 w-28 bg-black rounded overflow-hidden relative">
                                                    {thumbnailPreview ? (
                                                        <img src={thumbnailPreview} alt="Thumbnail" className="h-full w-full object-cover opacity-80" />
                                                    ) : null}
                                                    <div className="absolute inset-0 flex items-center justify-center">
                                                        <Video className="h-6 w-6 text-white" />
                                                    </div>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-success">Video subido ✓</p>
                                                    <p className="text-xs text-muted-foreground">{formData.duration_seconds}s</p>
                                                </div>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => videoInputRef.current?.click()}
                                                >
                                                    Reemplazar
                                                </Button>
                                            </div>
                                        ) : (
                                            <div
                                                onClick={() => videoInputRef.current?.click()}
                                                className="border-2 border-dashed rounded-lg p-10 flex flex-col items-center justify-center cursor-pointer hover:bg-muted transition-colors"
                                            >
                                                <UploadCloud className="h-10 w-10 text-muted-foreground mb-2" />
                                                <p className="font-medium">Clic para seleccionar video</p>
                                                <p className="text-xs text-muted-foreground mt-1">MP4, MOV, WebM (Max 500MB)</p>
                                            </div>
                                        )}

                                        {uploading && (
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="text-muted-foreground">Subiendo a Cloudinary...</span>
                                                    <span className="font-medium">{uploadProgress}%</span>
                                                </div>
                                                <Progress value={uploadProgress} className="h-2" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Custom Thumbnail (optional) */}
                                    <div className="space-y-2">
                                        <Label>Miniatura personalizada <span className="text-muted-foreground text-xs">(opcional)</span></Label>
                                        <input
                                            ref={thumbnailInputRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={handleThumbnailSelect}
                                            className="hidden"
                                        />
                                        {thumbnailPreview || thumbnailFile ? (
                                            <div className="rounded-lg border bg-muted p-3 flex items-center gap-3">
                                                <img
                                                    src={thumbnailPreview}
                                                    alt="Miniatura"
                                                    className="h-16 w-28 rounded object-cover"
                                                />
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => thumbnailInputRef.current?.click()}
                                                >
                                                    Cambiar
                                                </Button>
                                            </div>
                                        ) : (
                                            <div
                                                onClick={() => thumbnailInputRef.current?.click()}
                                                className="border border-dashed rounded-lg p-4 flex items-center gap-3 cursor-pointer hover:bg-muted transition-colors"
                                            >
                                                <Image className="h-5 w-5 text-muted-foreground" />
                                                <span className="text-sm text-muted-foreground">Agregar miniatura personalizada</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Título</Label>
                                        <Input
                                            value={formData.title}
                                            onChange={e => setFormData({ ...formData, title: e.target.value })}
                                            placeholder="Ej. Clase de Pilates Mat - Nivel 1"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Descripción</Label>
                                        <Textarea
                                            value={formData.description}
                                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                                            placeholder="Describe el contenido del video..."
                                            rows={4}
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Subtítulo</Label>
                                            <Input
                                                value={formData.subtitle}
                                                onChange={e => setFormData({ ...formData, subtitle: e.target.value })}
                                                placeholder="Ej. elegance in motion"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Tagline</Label>
                                            <Input
                                                value={formData.tagline}
                                                onChange={e => setFormData({ ...formData, tagline: e.target.value })}
                                                placeholder="Ej. Ballet · Pilates · Funcional"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Días de clase</Label>
                                            <Input
                                                value={formData.days}
                                                onChange={e => setFormData({ ...formData, days: e.target.value })}
                                                placeholder="Ej. Lunes, Miércoles y Viernes"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Color de marca</Label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="color"
                                                    value={formData.brand_color}
                                                    onChange={e => setFormData({ ...formData, brand_color: e.target.value })}
                                                    className="w-10 h-10 rounded border cursor-pointer"
                                                />
                                                <Input
                                                    value={formData.brand_color}
                                                    onChange={e => setFormData({ ...formData, brand_color: e.target.value })}
                                                    placeholder="#8F9A8A"
                                                    className="flex-1"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="space-y-6">
                            <Card>
                                <CardContent className="pt-6 space-y-4">
                                    <div className="space-y-2">
                                        <Label>Estado</Label>
                                        <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                                            <div className="space-y-0.5">
                                                <Label className="text-base">Publicado</Label>
                                                <p className="text-xs text-muted-foreground">Visible para los usuarios</p>
                                            </div>
                                            <Switch
                                                checked={formData.is_published}
                                                onCheckedChange={c => setFormData({ ...formData, is_published: c })}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Categoría</Label>
                                        <Select
                                            value={formData.category_id}
                                            onValueChange={v => setFormData({ ...formData, category_id: v })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Seleccionar..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {categories?.map((cat) => (
                                                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Nivel</Label>
                                        <Select
                                            value={formData.level}
                                            onValueChange={v => setFormData({ ...formData, level: v })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="principiante">Principiante</SelectItem>
                                                <SelectItem value="intermedio">Intermedio</SelectItem>
                                                <SelectItem value="avanzado">Avanzado</SelectItem>
                                                <SelectItem value="todos">Todos los niveles</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Acceso</Label>
                                        <Select
                                            value={formData.access_type}
                                            onValueChange={v => setFormData({ ...formData, access_type: v })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="miembros">Solo Miembros</SelectItem>
                                                <SelectItem value="gratuito">Gratuito</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Venta de clases</Label>
                                        <div className="rounded-lg border p-3 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm font-medium">Activar precio promocional</p>
                                                    <p className="text-xs text-muted-foreground">Muestra CTA para vender clases desde este video</p>
                                                </div>
                                                <Switch
                                                    checked={formData.sales_enabled}
                                                    onCheckedChange={(checked) =>
                                                        setFormData({
                                                            ...formData,
                                                            sales_enabled: checked,
                                                            sales_unlocks_video: checked ? formData.sales_unlocks_video : false,
                                                            sales_price_mxn: checked ? formData.sales_price_mxn || 1 : 0,
                                                        })
                                                    }
                                                />
                                            </div>

                                            {formData.sales_enabled && (
                                                <div className="space-y-3">
                                                    <div className="flex items-center justify-between rounded-md border p-2.5">
                                                        <div>
                                                            <p className="text-sm font-medium">Requiere compra para ver</p>
                                                            <p className="text-xs text-muted-foreground">Si está activo, el video solo se reproduce tras pago aprobado</p>
                                                        </div>
                                                        <Switch
                                                            checked={formData.sales_unlocks_video}
                                                            onCheckedChange={(checked) =>
                                                                setFormData({
                                                                    ...formData,
                                                                    sales_enabled: checked ? true : formData.sales_enabled,
                                                                    sales_unlocks_video: checked,
                                                                    sales_price_mxn: checked ? formData.sales_price_mxn || 1 : formData.sales_price_mxn,
                                                                })
                                                            }
                                                        />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <Label htmlFor="sales_price_mxn">Precio (MXN)</Label>
                                                        <Input
                                                            id="sales_price_mxn"
                                                            type="number"
                                                            min={1}
                                                            value={formData.sales_price_mxn || ''}
                                                            onChange={(e) => setFormData({ ...formData, sales_price_mxn: Number(e.target.value || 0) })}
                                                            placeholder="Ej. 399"
                                                        />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <Label htmlFor="sales_class_credits">Clases incluidas (opcional)</Label>
                                                        <Input
                                                            id="sales_class_credits"
                                                            type="number"
                                                            min={0}
                                                            value={formData.sales_class_credits || ''}
                                                            onChange={(e) => setFormData({ ...formData, sales_class_credits: Number(e.target.value || 0) })}
                                                            placeholder="Ej. 5"
                                                        />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <Label htmlFor="sales_cta_text">Texto botón</Label>
                                                        <Input
                                                            id="sales_cta_text"
                                                            value={formData.sales_cta_text}
                                                            onChange={(e) => setFormData({ ...formData, sales_cta_text: e.target.value })}
                                                            placeholder="Ej. Comprar clases"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <Button
                                        className="w-full"
                                        onClick={handleSave}
                                        disabled={uploading || createMutation.isPending || updateMutation.isPending}
                                    >
                                        {(uploading || createMutation.isPending || updateMutation.isPending) && (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        )}
                                        <Save className="mr-2 h-4 w-4" />
                                        {uploading ? 'Subiendo...' : 'Guardar Video'}
                                    </Button>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </div>
            </AdminLayout>
        </AuthGuard>
    );
}
