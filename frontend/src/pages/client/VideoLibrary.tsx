import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Play, Search, Clock, Lock, Film } from 'lucide-react';
import api from '@/lib/api';

interface VideoCategory {
    id: string;
    name: string;
    color: string;
}

interface Video {
    id: string;
    title: string;
    description: string;
    duration_seconds: number;
    thumbnail_url: string;
    category_name: string;
    category_color?: string;
    level: string;
    access_type: 'gratuito' | 'miembros';
    views_count: number;
    sales_enabled?: boolean;
    sales_unlocks_video?: boolean;
    sales_price_mxn?: number | null;
}

export default function VideoLibrary() {
    const [search, setSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    const { data: categories } = useQuery<VideoCategory[]>({
        queryKey: ['video-categories'],
        queryFn: async () => (await api.get('/videos/categories')).data,
    });

    const { data: videos, isLoading } = useQuery<Video[]>({
        queryKey: ['videos', search, selectedCategory],
        queryFn: async () => {
            const params: any = {};
            if (search) params.search = search;
            if (selectedCategory) params.category = selectedCategory;
            return (await api.get('/videos', { params })).data;
        },
    });

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <AuthGuard requiredRoles={['client']}>
            <ClientLayout>
                <div className="space-y-8">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-heading font-semibold mb-1">Biblioteca de Videos</h1>
                            <p className="text-muted-foreground font-body text-sm">Rutinas, técnica y bienestar on-demand.</p>
                        </div>
                        {videos && videos.length > 0 && (
                            <span className="text-xs text-muted-foreground/60 bg-muted px-3 py-1.5 rounded-full whitespace-nowrap mt-1">
                                {videos.length} video{videos.length !== 1 ? 's' : ''}
                            </span>
                        )}
                    </div>

                    {/* Filters */}
                    <div className="flex flex-col md:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar videos..."
                                className="pl-9 rounded-full bg-muted/50 border-transparent focus:border-border"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
                            <Button
                                variant={selectedCategory === null ? "default" : "outline"}
                                onClick={() => setSelectedCategory(null)}
                                className="whitespace-nowrap rounded-full text-xs h-9 px-4"
                                size="sm"
                            >
                                Todos
                            </Button>
                            {categories?.map((cat) => (
                                <Button
                                    key={cat.id}
                                    variant={selectedCategory === cat.id ? "default" : "outline"}
                                    onClick={() => setSelectedCategory(cat.id)}
                                    className="whitespace-nowrap rounded-full text-xs h-9 px-4"
                                    size="sm"
                                    style={selectedCategory === cat.id ? { backgroundColor: cat.color || undefined } : undefined}
                                >
                                    {cat.name}
                                </Button>
                            ))}
                        </div>
                    </div>

                    {/* Video Grid */}
                    {isLoading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {[1, 2, 3, 4, 5, 6].map((i) => (
                                <div key={i} className="space-y-3">
                                    <Skeleton className="aspect-video w-full rounded-xl" />
                                    <Skeleton className="h-4 w-3/4 rounded-full" />
                                    <Skeleton className="h-3 w-1/2 rounded-full" />
                                </div>
                            ))}
                        </div>
                    ) : videos?.length === 0 ? (
                        <div className="text-center py-24">
                            <div className="bg-muted/50 w-16 h-16 rounded-[1rem] flex items-center justify-center mx-auto mb-4">
                                <Film className="h-7 w-7 text-muted-foreground/40" />
                            </div>
                            <p className="text-muted-foreground font-body mb-1">No se encontraron videos</p>
                            {(search || selectedCategory) && (
                                <Button
                                    variant="link"
                                    onClick={() => { setSearch(''); setSelectedCategory(null); }}
                                    className="text-primary text-sm"
                                >
                                    Limpiar filtros
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {videos?.map((video) => (
                                <Link to={`/app/videos/${video.id}`} key={video.id} className="group">
                                    <div className="rounded-[1.25rem] overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 app-soft-shadow">
                                        {/* Thumbnail */}
                                        <div className="relative aspect-video bg-muted overflow-hidden">
                                            {video.thumbnail_url ? (
                                                <img
                                                    src={video.thumbnail_url}
                                                    alt={video.title}
                                                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-foreground/5">
                                                    <Play className="h-10 w-10 text-muted-foreground/20 fill-muted-foreground/20" />
                                                </div>
                                            )}

                                            {/* Gradient Overlay */}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />

                                            {/* Play Button */}
                                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
                                                <div className="bg-white/95 rounded-full p-3.5 shadow-xl transform scale-75 group-hover:scale-100 transition-transform duration-300">
                                                    <Play className="h-5 w-5 text-foreground fill-foreground ml-0.5" />
                                                </div>
                                            </div>

                                            {/* Duration */}
                                            {video.duration_seconds > 0 && (
                                                <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[11px] px-2 py-0.5 rounded-md flex items-center gap-1 backdrop-blur-sm font-medium tabular-nums">
                                                    <Clock className="h-3 w-3" />
                                                    {formatDuration(video.duration_seconds)}
                                                </div>
                                            )}

                                            {/* Members badge */}
                                            {video.access_type === 'miembros' && (
                                                <div className="absolute top-2 right-2 bg-primary text-primary-foreground text-[11px] px-2 py-0.5 rounded-md flex items-center gap-1 shadow-sm font-medium">
                                                    <Lock className="h-2.5 w-2.5" />
                                                    Miembros
                                                </div>
                                            )}
                                            {video.sales_unlocks_video && Number(video.sales_price_mxn || 0) > 0 && (
                                                <div className="absolute top-2 left-2 bg-amber-500 text-white text-[11px] px-2 py-0.5 rounded-md shadow-sm font-medium">
                                                    Compra requerida
                                                </div>
                                            )}
                                        </div>

                                        {/* Info */}
                                        <div className="p-3 pb-4">
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <Badge
                                                    variant="secondary"
                                                    className="font-normal text-[11px] rounded-full px-2.5 py-0"
                                                    style={{
                                                        backgroundColor: video.category_color ? `${video.category_color}12` : undefined,
                                                        color: video.category_color || undefined,
                                                    }}
                                                >
                                                    {video.category_name || 'General'}
                                                </Badge>
                                                <span className="text-[11px] text-muted-foreground/60 capitalize">
                                                    {video.level}
                                                </span>
                                            </div>
                                            <h3 className="font-heading font-semibold text-[15px] leading-snug group-hover:text-primary transition-colors line-clamp-2">
                                                {video.title}
                                            </h3>
                                            {video.description && (
                                                <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2 font-body">
                                                    {video.description}
                                                </p>
                                            )}
                                            {video.sales_enabled && Number(video.sales_price_mxn || 0) > 0 && (
                                                <p className="text-xs text-primary mt-2 font-medium">
                                                    {video.sales_unlocks_video
                                                        ? `Acceso por compra: $${Number(video.sales_price_mxn).toLocaleString('es-MX')} MXN`
                                                        : `Desde $${Number(video.sales_price_mxn).toLocaleString('es-MX')} MXN en clases`}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </ClientLayout>
        </AuthGuard>
    );
}
