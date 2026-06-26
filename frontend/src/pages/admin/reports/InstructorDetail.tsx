import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Star, TrendingUp, TrendingDown, Calendar, Users, Percent, Award, ArrowLeft } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '@/lib/api';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function InstructorDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('overview');

    const { data: summary, isLoading: isLoadingSummary } = useQuery({
        queryKey: ['instructor-summary', id],
        queryFn: async () => (await api.get(`/reviews/instructor/${id}/summary`)).data
    });

    const { data: reviews, isLoading: isLoadingReviews } = useQuery({
        queryKey: ['instructor-reviews', id],
        queryFn: async () => (await api.get('/reviews/admin', { params: { instructorId: id, limit: 20 } })).data
    });

    const { data: instructorData, isLoading: isLoadingInstructor } = useQuery({
        queryKey: ['instructor-data', id],
        queryFn: async () => {
            // In a real scenario, we might need a specific endpoint for single instructor details 
            // or filter from the list. For now, assuming list endpoint can filter or we use what we have.
            // Re-using the reports/instructors filtered by ID would be ideal, but for now let's just use the basic info
            // from the summary endpoint if it returned it, or fetch basic instructor info.
            // Let's assume we can fetch basic info:
            const all = (await api.get(`/instructors?all=true`)).data;
            return all.find((i: any) => i.id === id);
        }
    });

    const isLoading = isLoadingSummary || isLoadingReviews || isLoadingInstructor;

    if (isLoading) {
        return (
            <AdminLayout>
                <div className="space-y-6">
                    <Skeleton className="h-12 w-48" />
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <Skeleton className="h-64 col-span-1" />
                        <Skeleton className="h-64 col-span-3" />
                    </div>
                </div>
            </AdminLayout>
        );
    }

    if (!instructorData) {
        return (
            <AdminLayout>
                <div className="text-center py-20">
                    <h2 className="text-xl font-semibold">Instructor no encontrado</h2>
                    <Button variant="link" onClick={() => navigate('/admin/reports/instructors')}>Volver</Button>
                </div>
            </AdminLayout>
        )
    }

    const { stats, distribution, difficulty } = summary?.summary || {};

    // Data for charts
    const distributionData = [
        { name: '5 ⭐', value: distribution?.fiveStar || 0 },
        { name: '4 ⭐', value: distribution?.fourStar || 0 },
        { name: '3 ⭐', value: distribution?.threeStar || 0 },
        { name: '2 ⭐', value: distribution?.lowRating || 0 }, // Simplified
        { name: '1 ⭐', value: 0 }, // Simplified
    ];

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate('/admin/reports/instructors')}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-heading font-bold">{instructorData.display_name}</h1>
                        <p className="text-muted-foreground flex items-center gap-2">
                            <span className="bg-success/10 text-success px-2 py-0.5 rounded text-xs font-medium">Activo</span>
                            • {(() => {
                                if (!instructorData.specialties) return 'Instructor';
                                try {
                                    const parsed = JSON.parse(instructorData.specialties);
                                    return Array.isArray(parsed) ? parsed.join(', ') : instructorData.specialties;
                                } catch {
                                    return instructorData.specialties;
                                }
                            })()}
                        </p>
                    </div>
                    <div className="ml-auto flex gap-2">
                        <Button variant="outline" onClick={() => navigate(`/admin/instructors`)}>Gestionar Perfil</Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {/* Sidebar Profile */}
                    <Card className="md:col-span-1">
                        <CardContent className="pt-6 flex flex-col items-center text-center">
                            <Avatar className="h-32 w-32 mb-4 border-4 border-muted">
                                <AvatarImage src={instructorData.photo_url} className="object-cover" />
                                <AvatarFallback className="text-2xl">{instructorData.display_name[0]}</AvatarFallback>
                            </Avatar>

                            <div className="grid grid-cols-2 w-full gap-4 mt-4">
                                <div className="bg-muted/50 p-3 rounded-lg">
                                    <div className="text-2xl font-bold text-primary">{summary?.summary?.avgOverallRating}</div>
                                    <div className="text-xs text-muted-foreground">Rating Gral.</div>
                                </div>
                                <div className="bg-muted/50 p-3 rounded-lg">
                                    <div className="text-2xl font-bold">{summary?.summary?.totalReviews}</div>
                                    <div className="text-xs text-muted-foreground">Reseñas</div>
                                </div>
                            </div>

                            <Separator className="my-6" />

                            <div className="w-full space-y-4">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">Recomendación</span>
                                    <span className="font-bold">{stats?.recommendPercent}%</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">Repetirían</span>
                                    <span className="font-bold">{stats?.repeatPercent}%</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Main Content */}
                    <div className="md:col-span-3 space-y-6">
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                            <TabsList>
                                <TabsTrigger value="overview">Resumen</TabsTrigger>
                                <TabsTrigger value="reviews">Reseñas ({summary?.summary?.totalReviews})</TabsTrigger>
                                <TabsTrigger value="classes">Clases</TabsTrigger>
                            </TabsList>

                            <TabsContent value="overview" className="space-y-6">
                                {/* Rating Breakdown */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="text-base">Desglose de Calificación</CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <RatingRow label="Instrucción" value={summary?.summary?.avgInstructorRating} />
                                            <RatingRow label="Ambiente" value={summary?.summary?.avgAmbianceRating} />
                                            <RatingRow label="Puntualidad" value={summary?.summary?.avgPunctualityRating} />
                                            <RatingRow label="Dificultad" value={summary?.summary?.avgDifficultyRating} max={5} color="bg-info" />
                                        </CardContent>
                                    </Card>

                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="text-base">Distribución de Estrellas</CardTitle>
                                        </CardHeader>
                                        <CardContent className="h-[200px]">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={distributionData} layout="vertical" margin={{ left: 20 }}>
                                                    <XAxis type="number" hide />
                                                    <YAxis dataKey="name" type="category" width={30} tickLine={false} axisLine={false} />
                                                    <Tooltip cursor={{ fill: 'transparent' }} />
                                                    <Bar dataKey="value" fill="#fbbf24" radius={[0, 4, 4, 0]} barSize={20} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </CardContent>
                                    </Card>
                                </div>

                                {/* Top Tags */}
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-base">Lo que más destacan</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex flex-wrap gap-2">
                                            {summary?.topTags?.map((tag: any) => (
                                                <Badge key={tag.name} variant="secondary" className="px-3 py-1 text-sm bg-success/10 text-success border-success/30">
                                                    <span className="mr-2 text-base">{tag.icon}</span>
                                                    {tag.name}
                                                    <span className="ml-2 font-bold opacity-70">{tag.count}</span>
                                                </Badge>
                                            ))}
                                            {(!summary?.topTags || summary.topTags.length === 0) && (
                                                <p className="text-muted-foreground text-sm">No hay suficientes datos aún.</p>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            <TabsContent value="reviews" className="space-y-4">
                                {reviews?.reviews?.map((review: any) => (
                                    <Card key={review.id}>
                                        <CardContent className="pt-6">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="font-semibold text-sm">{review.is_anonymous ? 'Anónimo' : review.user_name}</div>
                                                    <span className="text-xs text-muted-foreground">• {format(new Date(review.created_at), "d MMM yyyy", { locale: es })}</span>
                                                </div>
                                                <Badge variant="outline">⭐ {review.overall_rating}</Badge>
                                            </div>
                                            <div className="text-xs text-muted-foreground mb-3 flex gap-2">
                                                <span>{review.class_type}</span>
                                                <span>•</span>
                                                <span>{format(new Date(review.class_date), "HH:mm")}</span>
                                            </div>

                                            {review.comment && (
                                                <p className="text-sm bg-muted/30 p-3 rounded-md mb-3">"{review.comment}"</p>
                                            )}

                                            <div className="flex flex-wrap gap-1">
                                                {review.tags?.map((tag: any) => (
                                                    <Badge key={tag.id} variant="outline" className="text-[10px] px-2 h-5">
                                                        {tag.name}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                                {(!reviews?.reviews || reviews.reviews.length === 0) && (
                                    <div className="text-center py-10 text-muted-foreground">
                                        No hay reseñas disponibles.
                                    </div>
                                )}
                            </TabsContent>

                            <TabsContent value="classes">
                                <Card>
                                    <CardContent className="py-10 text-center text-muted-foreground">
                                        Próximamente: Historial detallado de clases y asistencia.
                                    </CardContent>
                                </Card>
                            </TabsContent>
                        </Tabs>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}

function RatingRow({ label, value, max = 5, color = "bg-primary" }: { label: string, value: number, max?: number, color?: string }) {
    const percentage = (value / max) * 100;
    return (
        <div className="space-y-1">
            <div className="flex justify-between text-sm">
                <span>{label}</span>
                <span className="font-bold">{value || '-'}</span>
            </div>
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div className={`h-full ${color}`} style={{ width: `${percentage}%` }} />
            </div>
        </div>
    )
}
