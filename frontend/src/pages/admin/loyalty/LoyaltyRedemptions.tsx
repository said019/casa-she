import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Gift, CheckCircle, XCircle, Clock } from 'lucide-react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import api from '@/lib/api';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Redemption {
    id: number;
    user_id: number;
    reward_id: number;
    points_spent: number;
    status: string;
    redeemed_at: string;
    user_name: string;
    user_email: string;
    reward_name: string;
}

export default function LoyaltyRedemptions() {
    const [loading, setLoading] = useState(true);
    const [redemptions, setRedemptions] = useState<Redemption[]>([]);

    useEffect(() => {
        loadRedemptions();
    }, []);

    const loadRedemptions = async () => {
        try {
            const response = await api.get('/loyalty/redemptions');
            setRedemptions(response.data || []);
        } catch (error) {
            console.error('Error loading redemptions:', error);
        } finally {
            setLoading(false);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'completed':
                return (
                    <Badge className="bg-success/10 text-success">
                        <CheckCircle className="mr-1 h-3 w-3" />
                        Completado
                    </Badge>
                );
            case 'pending':
                return (
                    <Badge className="bg-yellow-100 text-yellow-800">
                        <Clock className="mr-1 h-3 w-3" />
                        Pendiente
                    </Badge>
                );
            case 'cancelled':
                return (
                    <Badge className="bg-red-100 text-red-800">
                        <XCircle className="mr-1 h-3 w-3" />
                        Cancelado
                    </Badge>
                );
            default:
                return <Badge variant="secondary">{status}</Badge>;
        }
    };

    if (loading) {
        return (
            <AdminLayout>
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin" />
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-heading font-bold">Canjes de Recompensas</h1>
                    <p className="text-muted-foreground">
                        Historial de canjes realizados por los usuarios.
                    </p>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Gift className="h-5 w-5" />
                            Historial de Canjes
                        </CardTitle>
                        <CardDescription>
                            {redemptions.length} canjes registrados
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {redemptions.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                No hay canjes registrados todavía.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Fecha</TableHead>
                                        <TableHead>Usuario</TableHead>
                                        <TableHead>Recompensa</TableHead>
                                        <TableHead>Puntos</TableHead>
                                        <TableHead>Estado</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {redemptions.map((redemption) => (
                                        <TableRow key={redemption.id}>
                                            <TableCell>
                                                {format(new Date(redemption.redeemed_at), 'dd MMM yyyy HH:mm', { locale: es })}
                                            </TableCell>
                                            <TableCell>
                                                <div>
                                                    <div className="font-medium">{redemption.user_name}</div>
                                                    <div className="text-sm text-muted-foreground">
                                                        {redemption.user_email}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>{redemption.reward_name}</TableCell>
                                            <TableCell>{redemption.points_spent}</TableCell>
                                            <TableCell>{getStatusBadge(redemption.status)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AdminLayout>
    );
}
