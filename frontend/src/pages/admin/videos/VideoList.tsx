import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Edit, Trash, Play, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';

export default function AdminVideoList() {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const queryClient = useQueryClient();
    const { toast } = useToast();

    // Fetch videos
    const { data: videos, isLoading } = useQuery({
        queryKey: ['admin-videos', search, page],
        queryFn: async () => {
            const { data } = await api.get('/videos', {
                params: {
                    search,
                    limit: 20,
                    offset: page * 20
                }
            });
            return data;
        },
    });

    // Delete Mutation
    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            await api.delete(`/videos/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin-videos'] });
            toast({
                title: "Video eliminado",
                description: "El video ha sido eliminado correctamente.",
            });
        },
        onError: (error) => {
            console.error(error);
            toast({
                title: "Error",
                description: "No se pudo eliminar el video.",
                variant: "destructive",
            });
        },
    });

    const getStatusBadge = (published: boolean) => {
        if (published) {
            return <Badge className="bg-success/10 text-success hover:bg-success/10">Publicado</Badge>;
        }
        return <Badge variant="secondary">Borrador</Badge>;
    };

    const getAccessBadge = (video: any) => {
        if (video.sales_unlocks_video) {
            return <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">Compra</Badge>;
        }
        const type = video.access_type;
        if (type === 'miembros') {
            return <Badge variant="outline" className="text-purple-600 border-purple-200 bg-purple-50">Miembros</Badge>;
        }
        return <Badge variant="outline" className="text-info border-info/30 bg-info/10">Gratuito</Badge>;
    };

    return (
        <AuthGuard requiredRoles={['admin', 'instructor']}>
            <AdminLayout>
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <div>
                            <h1 className="text-3xl font-heading font-bold">Biblioteca de Videos</h1>
                            <p className="text-muted-foreground">Gestiona los videos disponibles en la plataforma.</p>
                        </div>
                        <Button asChild>
                            <Link to="/admin/videos/upload">
                                <Plus className="mr-2 h-4 w-4" />
                                Nuevo Video
                            </Link>
                        </Button>
                    </div>

                    {/* Filters */}
                    <div className="flex items-center gap-2 max-w-sm">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por título..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-8"
                            />
                        </div>
                    </div>

                    {/* Table */}
                    <div className="rounded-md border bg-white overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[100px]">Thumbnail</TableHead>
                                    <TableHead>Título</TableHead>
                                    <TableHead>Categoría</TableHead>
                                    <TableHead>Acceso</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead>Vistas</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-24 text-center">
                                            <div className="flex justify-center items-center gap-2">
                                                <Loader2 className="h-4 w-4 animate-spin" /> Cargando videos...
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : videos?.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                            No se encontraron videos.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    videos?.map((video: any) => (
                                        <TableRow key={video.id}>
                                            <TableCell>
                                                <div className="w-16 h-9 bg-muted rounded overflow-hidden relative group">
                                                    {video.thumbnail_url ? (
                                                        <img
                                                            src={video.thumbnail_url}
                                                            alt={video.title}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="flex items-center justify-center h-full">
                                                            <Play className="h-4 w-4 text-muted-foreground" />
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                {video.title}
                                                <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                                                    {video.id}
                                                </div>
                                                {video.sales_enabled && Number(video.sales_price_mxn || 0) > 0 && (
                                                    <div className="text-xs text-primary mt-1">
                                                        Venta: ${Number(video.sales_price_mxn).toLocaleString('es-MX')} MXN
                                                        {video.sales_unlocks_video ? ' · desbloquea video' : ' · CTA clases'}
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" style={{ borderColor: video.category_color, color: video.category_color }}>
                                                    {video.category_name || 'Sin cat.'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>{getAccessBadge(video)}</TableCell>
                                            <TableCell>{getStatusBadge(video.is_published)}</TableCell>
                                            <TableCell>{video.views_count}</TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button variant="ghost" size="icon" asChild>
                                                        <Link to={`/admin/videos/edit/${video.id}`}>
                                                            <Edit className="h-4 w-4" />
                                                        </Link>
                                                    </Button>

                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700 hover:bg-red-50">
                                                                <Trash className="h-4 w-4" />
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    Esta acción no se puede deshacer. Se eliminará el video permanentemente.
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                                <AlertDialogAction
                                                                    onClick={() => deleteMutation.mutate(video.id)}
                                                                    className="bg-red-600 hover:bg-red-700"
                                                                >
                                                                    Eliminar
                                                                </AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Simple Pagination */}
                    <div className="flex justify-end gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            disabled={page === 0}
                        >
                            Anterior
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => setPage(p => p + 1)}
                            disabled={videos?.length < 20}
                        >
                            Siguiente
                        </Button>
                    </div>
                </div>
            </AdminLayout>
        </AuthGuard>
    );
}
