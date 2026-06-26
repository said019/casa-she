import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Star, TrendingUp, TrendingDown, Minus, MessageSquare, ThumbsUp, AlertTriangle, Settings, User, Calendar, Clock } from 'lucide-react';
import api from '@/lib/api';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface ReviewStats {
    period: { start: string; end: string };
    general: {
        totalReviews: number;
        avgRating: number;
        responseRate: number;
        nps: number;
        conversionRate: number;
    };
    byInstructor: {
        instructorId: string;
        instructorName: string;
        reviewCount: number;
        avgRating: number;
    }[];
    topTags: {
        name: string;
        icon: string;
        category: string;
        count: number;
    }[];
}

interface Review {
    id: string;
    overallRating: number;
    comment?: string;
    createdAt: string;
    userName?: string;
    userEmail?: string;
    isAnonymous?: boolean;
    className?: string;
    instructorName?: string;
    classDate?: string;
}

export default function AdminReviewsDashboard() {
    const [period, setPeriod] = useState('30d');

    const { data: stats, isLoading } = useQuery<ReviewStats>({
        queryKey: ['admin-review-stats', period],
        queryFn: async () => {
            // Calculate dates based on period
            const end = new Date();
            const start = new Date();
            if (period === '30d') start.setDate(end.getDate() - 30);
            if (period === '90d') start.setDate(end.getDate() - 90);
            if (period === 'year') start.setFullYear(end.getFullYear() - 1);

            const res = await api.get('/reviews/admin/stats', {
                params: { startDate: start.toISOString(), endDate: end.toISOString() }
            });
            return res.data;
        }
    });

    // Fetch recent reviews
    const { data: recentReviews } = useQuery<Review[]>({
        queryKey: ['admin-recent-reviews'],
        queryFn: async () => {
            const res = await api.get('/reviews/admin/recent', {
                params: { limit: 20 }
            });
            return res.data;
        }
    });

    const getRatingColor = (rating: number) => {
        if (rating >= 4.5) return 'text-success bg-success/10 border-success/30';
        if (rating >= 4.0) return 'text-info bg-info/10 border-info/30';
        if (rating >= 3.0) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
        return 'text-red-600 bg-red-50 border-red-200';
    };

    const getNpsColor = (nps: number) => {
        if (nps >= 50) return 'text-success';
        if (nps >= 0) return 'text-yellow-600';
        return 'text-red-600';
    };

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-heading font-bold">Calificaciones y Reseñas</h1>
                        <p className="text-muted-foreground">Monitorea la satisfacción de tus alumnos</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Select value={period} onValueChange={setPeriod}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Seleccionar periodo" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="30d">Últimos 30 días</SelectItem>
                                <SelectItem value="90d">Últimos 3 meses</SelectItem>
                                <SelectItem value="year">Este año</SelectItem>
                            </SelectContent>
                        </Select>
                        <Link to="/admin/reviews/tags">
                            <Button variant="outline">
                                <Settings className="h-4 w-4 mr-2" />
                                Opciones de Calificación
                            </Button>
                        </Link>
                        <Button variant="outline">Exportar</Button>
                    </div>
                </div>

                {/* KPIs */}
                <div className="grid gap-4 md:grid-cols-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Rating Promedio</CardTitle>
                            <Star className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-xl sm:text-2xl font-bold tabular-nums truncate">{stats?.general.avgRating || '-'}</div>
                            <p className="text-xs text-muted-foreground">
                                <span className="text-success font-medium">⭐ 4.5+ objetivo</span>
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Total Reseñas</CardTitle>
                            <MessageSquare className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-xl sm:text-2xl font-bold tabular-nums truncate">{stats?.general.totalReviews || 0}</div>
                            <p className="text-xs text-muted-foreground">
                                En el periodo seleccionado
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Tasa Respuesta</CardTitle>
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-xl sm:text-2xl font-bold tabular-nums truncate">{stats?.general.responseRate || 0}%</div>
                            <p className="text-xs text-muted-foreground">
                                De las clases asistidas
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">NPS (Recomendación)</CardTitle>
                            <ThumbsUp className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className={`text-xl sm:text-2xl font-bold tabular-nums truncate ${getNpsColor(stats?.general.nps || 0)}`}>
                                {stats?.general.nps || 0}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Net Promoter Score
                            </p>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-7">
                    {/* Instructor Ranking */}
                    <Card className="col-span-4">
                        <CardHeader>
                            <CardTitle>Ranking de Instructoras</CardTitle>
                            <CardDescription>
                                Basado en calificaciones promedio del periodo
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[50px]">#</TableHead>
                                        <TableHead>Instructora</TableHead>
                                        <TableHead className="text-right">Rating</TableHead>
                                        <TableHead className="text-right">Reseñas</TableHead>
                                        <TableHead className="text-right">Tendencia</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {stats?.byInstructor.map((instructor, index) => (
                                        <TableRow key={instructor.instructorId}>
                                            <TableCell className="font-medium">{index + 1}</TableCell>
                                            <TableCell>{instructor.instructorName}</TableCell>
                                            <TableCell className="text-right">
                                                <Badge variant="outline" className={getRatingColor(instructor.avgRating)}>
                                                    ⭐ {instructor.avgRating}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">{instructor.reviewCount}</TableCell>
                                            <TableCell className="text-right flex justify-end">
                                                {/* Simulated Trend for now */}
                                                {index === 0 ? <TrendingUp className="h-4 w-4 text-success" /> :
                                                    index === stats.byInstructor.length - 1 ? <TrendingDown className="h-4 w-4 text-red-500" /> :
                                                        <Minus className="h-4 w-4 text-muted-foreground" />}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Tags Cloud */}
                    <Card className="col-span-3">
                        <CardHeader>
                            <CardTitle>Tags Más Frecuentes</CardTitle>
                            <CardDescription>
                                Lo que dicen tus alumnos
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div>
                                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2 text-success">
                                        <ThumbsUp className="h-4 w-4" /> Positivos
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                        {stats?.topTags.filter(t => t.category === 'positive').map((tag) => (
                                            <Badge key={tag.name} variant="secondary" className="bg-success/10 text-success hover:bg-success/20">
                                                <span className="mr-1">{tag.icon}</span>
                                                {tag.name}
                                                <span className="ml-1 opacity-60 text-xs">({tag.count})</span>
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                                <Separator />
                                <div>
                                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2 text-red-600">
                                        <AlertTriangle className="h-4 w-4" /> A Mejorar
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                        {stats?.topTags.filter(t => t.category === 'negative').map((tag) => (
                                            <Badge key={tag.name} variant="secondary" className="bg-red-50 text-red-700 hover:bg-red-100">
                                                <span className="mr-1">{tag.icon}</span>
                                                {tag.name}
                                                <span className="ml-1 opacity-60 text-xs">({tag.count})</span>
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Recent Reviews Section */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <MessageSquare className="h-5 w-5" />
                                    Calificaciones Recientes
                                </CardTitle>
                                <CardDescription>
                                    Las últimas opiniones de tus alumnos
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[500px] pr-4">
                            <div className="space-y-4">
                                {recentReviews && recentReviews.length > 0 ? (
                                    recentReviews.map((review) => (
                                        <ReviewCard key={review.id} review={review} />
                                    ))
                                ) : (
                                    <div className="text-center py-8 text-muted-foreground">
                                        <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-20" />
                                        <p>No hay calificaciones recientes</p>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>
        </AdminLayout>
    );
}

// Component for individual review card
function ReviewCard({ review }: { review: Review }) {
    const ratingEmoji: Record<number, string> = {
        1: '😔',
        2: '😐',
        3: '🙂',
        4: '😊',
        5: '🤩'
    };

    const getRatingBgColor = (rating: number) => {
        if (rating >= 5) return 'bg-success/10 border-success/30';
        if (rating >= 4) return 'bg-info/10 border-info/30';
        if (rating >= 3) return 'bg-yellow-100 border-yellow-300';
        return 'bg-red-100 border-red-300';
    };

    return (
        <div className={`p-4 rounded-lg border ${getRatingBgColor(review.overallRating)}`}>
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                    <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-white">
                            {review.isAnonymous ? '?' : (review.userName?.[0]?.toUpperCase() || <User className="h-4 w-4" />)}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">
                                {review.isAnonymous ? 'Anónimo' : (review.userName || 'Usuario')}
                            </span>
                            <div className="flex items-center">
                                {[1, 2, 3, 4, 5].map((star) => (
                                    <Star
                                        key={star}
                                        className={`h-4 w-4 ${star <= review.overallRating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`}
                                    />
                                ))}
                            </div>
                            <span className="text-lg">{ratingEmoji[review.overallRating]}</span>
                        </div>
                        
                        {/* Class info */}
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1 flex-wrap">
                            {review.className && (
                                <span className="font-medium text-foreground">{review.className}</span>
                            )}
                            {review.instructorName && (
                                <span>con {review.instructorName}</span>
                            )}
                            {review.classDate && (
                                <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {format(new Date(review.classDate), 'dd MMM', { locale: es })}
                                </span>
                            )}
                        </div>

                        {/* Comment */}
                        {review.comment && (
                            <p className="mt-2 text-sm bg-white/50 p-2 rounded">
                                "{review.comment}"
                            </p>
                        )}

                        {/* Timestamp */}
                        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {format(new Date(review.createdAt), "d 'de' MMMM, HH:mm", { locale: es })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Separator() {
    return <div className="h-[1px] w-full bg-border my-2"></div>
}
