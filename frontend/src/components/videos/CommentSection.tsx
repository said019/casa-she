import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

interface Comment {
    id: string;
    content: string;
    user_name: string;
    user_avatar: string | null;
    created_at: string;
    reply_count: number;
}

export function CommentSection({ videoId }: { videoId: string }) {
    const [content, setContent] = useState('');
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { user } = useAuthStore();

    const { data: comments, isLoading } = useQuery<Comment[]>({
        queryKey: ['video-comments', videoId],
        queryFn: async () => (await api.get(`/videos/${videoId}/comments`)).data,
    });

    const postComment = useMutation({
        mutationFn: async (text: string) => {
            return api.post(`/videos/${videoId}/comments`, { content: text });
        },
        onSuccess: () => {
            setContent('');
            queryClient.invalidateQueries({ queryKey: ['video-comments', videoId] });
            toast({ title: 'Comentario publicado' });
        },
        onError: (err: any) => {
            toast({
                title: 'Error',
                description: err.response?.data?.error || 'No se pudo publicar',
                variant: 'destructive'
            });
        }
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!content.trim()) return;
        postComment.mutate(content);
    };

    return (
        <div className="mt-8 space-y-6">
            <h3 className="text-xl font-heading font-semibold">Comentarios</h3>

            <div className="flex gap-4">
                <Avatar>
                    <AvatarImage src={user?.photo_url || undefined} />
                    <AvatarFallback>{user?.display_name?.[0]}</AvatarFallback>
                </Avatar>
                <form onSubmit={handleSubmit} className="flex-1 space-y-2">
                    <Textarea
                        placeholder="Comparte tu opinión o dudas sobre la clase..."
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        className="min-h-[100px]"
                    />
                    <div className="flex justify-end">
                        <Button type="submit" disabled={postComment.isPending || !content.trim()}>
                            {postComment.isPending ? 'Publicando...' : 'Comentar'}
                        </Button>
                    </div>
                </form>
            </div>

            <div className="space-y-6">
                {comments?.map((comment) => (
                    <div key={comment.id} className="flex gap-4">
                        <Avatar className="h-10 w-10">
                            <AvatarImage src={comment.user_avatar || undefined} />
                            <AvatarFallback>{comment.user_name?.[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 space-y-1">
                            <div className="flex items-center justify-between">
                                <span className="font-semibold text-sm">{comment.user_name}</span>
                                <span className="text-xs text-muted-foreground">
                                    {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: es })}
                                </span>
                            </div>
                            <p className="text-sm text-muted-foreground">{comment.content}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
