import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Music,
    Plus,
    ExternalLink,
    Star,
    StarOff,
    Trash2,
    Loader2,
    Link as LinkIcon,
    Image as ImageIcon
} from 'lucide-react';
import CoachLayout from '@/components/layout/CoachLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

interface Playlist {
    id: string;
    instructor_id: string;
    name: string;
    platform: string;
    url: string;
    thumbnail_url?: string;
    is_favorite: boolean;
    created_at: string;
    instructor_name: string;
}

// Detectar plataforma automáticamente del URL
const detectPlatform = (url: string): string => {
    if (url.includes('spotify.com') || url.includes('spotify:')) return 'spotify';
    if (url.includes('music.apple.com')) return 'apple_music';
    if (url.includes('youtube.com') || url.includes('youtu.be') || url.includes('music.youtube.com')) return 'youtube';
    if (url.includes('soundcloud.com')) return 'other';
    if (url.includes('tidal.com')) return 'other';
    return 'other';
};

const getPlatformInfo = (platform: string, url: string) => {
    // Re-detectar por URL por si acaso
    const detected = detectPlatform(url);
    const p = detected !== 'other' ? detected : platform;

    switch (p) {
        case 'spotify':
            return { label: 'Spotify', icon: '🎵', color: '#1DB954', bg: 'bg-success/10' };
        case 'apple_music':
            return { label: 'Apple Music', icon: '🎧', color: '#FC3C44', bg: 'bg-red-50' };
        case 'youtube':
            return { label: 'YouTube', icon: '▶️', color: '#FF0000', bg: 'bg-red-50' };
        default:
            return { label: 'Música', icon: '🎶', color: '#6B7280', bg: 'bg-muted' };
    }
};

export default function CoachPlaylists() {
    const { user } = useAuthStore();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const [newUrl, setNewUrl] = useState('');
    const [urlMetadata, setUrlMetadata] = useState<{ title?: string; thumbnail?: string; author?: string } | null>(null);
    const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);

    // Fetch metadata when URL changes
    useEffect(() => {
        const fetchMetadata = async () => {
            if (!newUrl || newUrl.length < 20) {
                setUrlMetadata(null);
                return;
            }

            // Solo buscar metadata para URLs válidas
            if (!newUrl.includes('spotify.com') && !newUrl.includes('youtube.com') && !newUrl.includes('youtu.be') && !newUrl.includes('music.apple.com')) {
                setUrlMetadata(null);
                return;
            }

            setIsLoadingMetadata(true);
            try {
                const response = await api.get(`/instructors/playlist-metadata?url=${encodeURIComponent(newUrl)}`);
                setUrlMetadata(response.data);
                // Auto-fill name if empty
                if (!newName && response.data.title) {
                    setNewName(response.data.title);
                }
            } catch (error) {
                console.error('Error fetching metadata:', error);
                setUrlMetadata(null);
            } finally {
                setIsLoadingMetadata(false);
            }
        };

        const debounce = setTimeout(fetchMetadata, 500);
        return () => clearTimeout(debounce);
    }, [newUrl]);

    // Get instructor ID
    const { data: instructorData } = useQuery({
        queryKey: ['instructor-by-user', user?.id],
        queryFn: async () => {
            return (await api.get('/instructors/me')).data;
        },
        enabled: !!user?.id,
    });

    const instructorId = instructorData?.id;

    // Fetch playlists
    const { data: playlists, isLoading } = useQuery<Playlist[]>({
        queryKey: ['coach-playlists', instructorId],
        queryFn: async () => {
            const response = await api.get(`/instructors/${instructorId}/playlists`);
            return response.data;
        },
        enabled: !!instructorId,
    });

    // Create playlist mutation
    const createMutation = useMutation({
        mutationFn: async () => {
            if (!instructorId) {
                throw new Error('No se encontró tu perfil de instructor');
            }
            const platform = detectPlatform(newUrl);
            return await api.post(`/instructors/${instructorId}/playlists`, {
                name: newName,
                platform,
                url: newUrl,
                thumbnailUrl: urlMetadata?.thumbnail,
                isPublic: true,
            });
        },
        onSuccess: () => {
            toast({ title: '✅ Playlist guardada' });
            queryClient.invalidateQueries({ queryKey: ['coach-playlists'] });
            setIsCreateOpen(false);
            setNewName('');
            setNewUrl('');
            setUrlMetadata(null);
        },
        onError: (err: any) => {
            toast({ variant: 'destructive', title: 'Error', description: err.response?.data?.error || 'Error al guardar' });
        },
    });

    // Toggle favorite mutation
    const favoriteMutation = useMutation({
        mutationFn: async ({ id, isFavorite }: { id: string; isFavorite: boolean }) => {
            if (!instructorId) throw new Error("No instructor ID");
            return await api.put(`/instructors/${instructorId}/playlists/${id}`, { isFavorite });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['coach-playlists'] });
        },
        onError: (error: any) => {
            console.error("Error updating favorite:", error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'No se pudo actualizar favoritos.'
            });
        }
    });

    // Delete playlist mutation
    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            if (!instructorId) throw new Error("No instructor ID");
            return await api.delete(`/instructors/${instructorId}/playlists/${id}`);
        },
        onSuccess: () => {
            toast({ title: 'Playlist eliminada' });
            queryClient.invalidateQueries({ queryKey: ['coach-playlists'] });
        },
        onError: (error: any) => {
            console.error("Error deleting playlist:", error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error.response?.data?.error || 'No se pudo eliminar la playlist.'
            });
        }
    });

    const handleSubmit = () => {
        if (!newName.trim()) {
            toast({ variant: 'destructive', title: 'Error', description: 'Ponle un nombre a la playlist' });
            return;
        }
        if (!newUrl.trim()) {
            toast({ variant: 'destructive', title: 'Error', description: 'Pega el link de la playlist' });
            return;
        }
        createMutation.mutate();
    };

    // Separar favoritas del resto
    const favorites = playlists?.filter(p => p.is_favorite) || [];
    const others = playlists?.filter(p => !p.is_favorite) || [];

    // Si no hay instructorId aún, mostrar cargando
    if (!instructorId && user?.id) {
        return (
            <AuthGuard requiredRoles={['instructor', 'admin']}>
                <CoachLayout>
                    <div className="flex items-center justify-center h-64">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                </CoachLayout>
            </AuthGuard>
        );
    }

    return (
        <AuthGuard requiredRoles={['instructor', 'admin']}>
            <CoachLayout>
                <div className="space-y-6">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <h1 className="font-heading text-3xl font-bold">Mis Playlists</h1>
                            <p className="text-muted-foreground">
                                Guarda los links de tu música para tus clases
                            </p>
                        </div>
                        <Button onClick={() => setIsCreateOpen(true)}>
                            <Plus className="h-4 w-4 mr-2" />
                            Agregar Playlist
                        </Button>
                    </div>

                    {/* Quick Add Card */}
                    <Card className="border-dashed border-2 border-primary/30 bg-primary/5">
                        <CardContent className="p-6">
                            <div className="flex flex-col sm:flex-row gap-4 items-end">
                                <div className="flex-1 space-y-2">
                                    <Label>Nombre</Label>
                                    <Input
                                        placeholder="Ej: Barre Energético"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                    />
                                </div>
                                <div className="flex-[2] space-y-2">
                                    <Label>Link de la playlist</Label>
                                    <div className="relative">
                                        <LinkIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            className="pl-10"
                                            placeholder="Pega aquí el link de Spotify, Apple Music, YouTube..."
                                            value={newUrl}
                                            onChange={(e) => setNewUrl(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                                        />
                                    </div>
                                </div>
                                <Button
                                    onClick={handleSubmit}
                                    disabled={createMutation.isPending || !newName.trim() || !newUrl.trim() || !instructorId}
                                >
                                    {createMutation.isPending ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <>
                                            <Plus className="h-4 w-4 mr-2" />
                                            Guardar
                                        </>
                                    )}
                                </Button>
                            </div>

                            {/* Preview del metadata */}
                            {(isLoadingMetadata || urlMetadata) && (
                                <div className="mt-4 p-3 rounded-lg bg-white border flex items-center gap-3">
                                    {isLoadingMetadata ? (
                                        <>
                                            <Skeleton className="w-16 h-16 rounded" />
                                            <div className="flex-1">
                                                <Skeleton className="h-4 w-32 mb-2" />
                                                <Skeleton className="h-3 w-24" />
                                            </div>
                                        </>
                                    ) : urlMetadata?.thumbnail ? (
                                        <>
                                            <img
                                                src={urlMetadata.thumbnail}
                                                alt="Preview"
                                                className="w-16 h-16 rounded object-cover"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium truncate">{urlMetadata.title || 'Playlist'}</p>
                                                <p className="text-sm text-muted-foreground flex items-center gap-1">
                                                    {getPlatformInfo(detectPlatform(newUrl), newUrl).icon}
                                                    {urlMetadata.author || getPlatformInfo(detectPlatform(newUrl), newUrl).label}
                                                </p>
                                            </div>
                                            <ImageIcon className="h-5 w-5 text-success" />
                                        </>
                                    ) : urlMetadata?.title ? (
                                        <>
                                            <div className="w-16 h-16 rounded bg-muted flex items-center justify-center text-2xl">
                                                {getPlatformInfo(detectPlatform(newUrl), newUrl).icon}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium truncate">{urlMetadata.title}</p>
                                                <p className="text-sm text-muted-foreground">
                                                    {urlMetadata.author || getPlatformInfo(detectPlatform(newUrl), newUrl).label}
                                                </p>
                                            </div>
                                        </>
                                    ) : null}
                                </div>
                            )}

                            {newUrl && !isLoadingMetadata && !urlMetadata && (
                                <p className="text-xs text-muted-foreground mt-2">
                                    Detectado: {getPlatformInfo(detectPlatform(newUrl), newUrl).icon} {getPlatformInfo(detectPlatform(newUrl), newUrl).label}
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    {/* Playlists List */}
                    {isLoading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
                        </div>
                    ) : !playlists?.length ? (
                        <Card>
                            <CardContent className="py-12 text-center text-muted-foreground">
                                <Music className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                <p className="text-lg font-medium">No tienes playlists guardadas</p>
                                <p className="text-sm mt-1">Pega el link de tu playlist favorita arriba para comenzar</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <>
                            {/* Favoritas */}
                            {favorites.length > 0 && (
                                <div>
                                    <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                                        <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                                        Favoritas
                                    </h2>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {favorites.map((playlist) => (
                                            <PlaylistCard
                                                key={playlist.id}
                                                playlist={playlist}
                                                onToggleFavorite={() => favoriteMutation.mutate({ id: playlist.id, isFavorite: false })}
                                                onDelete={() => deleteMutation.mutate(playlist.id)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Resto */}
                            {others.length > 0 && (
                                <div>
                                    {favorites.length > 0 && (
                                        <h2 className="text-lg font-semibold mb-3">Otras Playlists</h2>
                                    )}
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {others.map((playlist) => (
                                            <PlaylistCard
                                                key={playlist.id}
                                                playlist={playlist}
                                                onToggleFavorite={() => favoriteMutation.mutate({ id: playlist.id, isFavorite: true })}
                                                onDelete={() => deleteMutation.mutate(playlist.id)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Dialog (backup) */}
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Agregar Playlist</DialogTitle>
                            <DialogDescription>
                                Pega el link de tu playlist de Spotify, Apple Music o YouTube
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Nombre</Label>
                                <Input
                                    placeholder="Ej: Pilates Relajante"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Link de la playlist</Label>
                                <Input
                                    placeholder="https://open.spotify.com/playlist/..."
                                    value={newUrl}
                                    onChange={(e) => setNewUrl(e.target.value)}
                                />
                                {newUrl && (
                                    <p className="text-xs text-muted-foreground">
                                        {getPlatformInfo(detectPlatform(newUrl), newUrl).icon} {getPlatformInfo(detectPlatform(newUrl), newUrl).label}
                                    </p>
                                )}
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleSubmit}
                                disabled={createMutation.isPending || !newName.trim() || !newUrl.trim()}
                            >
                                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                Guardar
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CoachLayout>
        </AuthGuard>
    );
}

// Componente de tarjeta de playlist
function PlaylistCard({
    playlist,
    onToggleFavorite,
    onDelete
}: {
    playlist: Playlist;
    onToggleFavorite: () => void;
    onDelete: () => void;
}) {
    const platformInfo = getPlatformInfo(playlist.platform, playlist.url);
    const [imgError, setImgError] = useState(false);

    return (
        <div className={`relative rounded-xl border overflow-hidden hover:shadow-lg transition-all ${platformInfo.bg}`}>
            {/* Thumbnail or Icon */}
            {playlist.thumbnail_url && !imgError ? (
                <div className="relative aspect-video w-full">
                    <img
                        src={playlist.thumbnail_url}
                        alt={playlist.name}
                        className="w-full h-full object-cover"
                        onError={() => setImgError(true)}
                    />
                    {/* Overlay gradient */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    {/* Platform badge */}
                    <div className="absolute top-2 left-2 px-2 py-1 rounded-full bg-white/90 text-xs font-medium flex items-center gap-1">
                        <span>{platformInfo.icon}</span>
                        <span>{platformInfo.label}</span>
                    </div>
                    {/* Favorite button */}
                    <button
                        className="absolute top-2 right-2 p-1.5 rounded-full bg-white/90 hover:bg-white z-10 cursor-pointer"
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite();
                        }}
                    >
                        {playlist.is_favorite ? (
                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                        ) : (
                            <StarOff className="h-4 w-4 text-muted-foreground" />
                        )}
                    </button>
                    {/* Title on image */}
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                        <p className="font-semibold text-white truncate">{playlist.name}</p>
                    </div>
                </div>
            ) : (
                <div className="p-4">
                    {/* Favorite button */}
                    <button
                        className="absolute top-3 right-3 p-1 rounded-full hover:bg-white/50 z-10 cursor-pointer"
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite();
                        }}
                    >
                        {playlist.is_favorite ? (
                            <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                        ) : (
                            <StarOff className="h-5 w-5 text-muted-foreground hover:text-yellow-500" />
                        )}
                    </button>

                    {/* Content */}
                    <div className="flex items-start gap-3 pr-8">
                        <div
                            className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl shrink-0 bg-white shadow-sm"
                        >
                            {platformInfo.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{playlist.name}</p>
                            <p className="text-sm text-muted-foreground">{platformInfo.label}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 p-3 pt-0">
                {playlist.thumbnail_url && !imgError && <div className="pt-3" />}
                <Button
                    variant="default"
                    size="sm"
                    className="flex-1"
                    onClick={(e) => {
                        e.stopPropagation();
                        window.open(playlist.url, '_blank');
                    }}
                >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Abrir
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 z-10"
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                    }}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}
