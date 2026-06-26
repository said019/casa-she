import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users, Gift, Share2, Copy, CheckCircle } from 'lucide-react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import api from '@/lib/api';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface ReferralCode {
    id: number;
    code: string;
    user_id: number;
    user_name: string;
    user_email: string;
    uses_count: number;
    max_uses: number | null;
    reward_points: number;
    is_active: boolean;
    created_at: string;
}

interface Referral {
    id: number;
    referrer_name: string;
    referrer_email: string;
    referred_name: string;
    referred_email: string;
    status: string;
    points_awarded: number;
    created_at: string;
    completed_at: string | null;
}

interface ReferralStats {
    total_codes: number;
    total_referrals: number;
    completed_referrals: number;
    total_points_awarded: number;
}

export default function Referrals() {
    const [loading, setLoading] = useState(true);
    const [codes, setCodes] = useState<ReferralCode[]>([]);
    const [referrals, setReferrals] = useState<Referral[]>([]);
    const [stats, setStats] = useState<ReferralStats>({
        total_codes: 0,
        total_referrals: 0,
        completed_referrals: 0,
        total_points_awarded: 0,
    });
    const [searchTerm, setSearchTerm] = useState('');
    const { toast } = useToast();

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [codesRes, referralsRes] = await Promise.all([
                api.get('/referrals/codes'),
                api.get('/referrals'),
            ]);
            
            setCodes(codesRes.data?.codes || []);
            setReferrals(referralsRes.data?.referrals || []);
            setStats(referralsRes.data?.stats || {
                total_codes: codesRes.data?.codes?.length || 0,
                total_referrals: referralsRes.data?.referrals?.length || 0,
                completed_referrals: (referralsRes.data?.referrals || []).filter((r: Referral) => r.status === 'completed').length,
                total_points_awarded: (referralsRes.data?.referrals || []).reduce((sum: number, r: Referral) => sum + (r.points_awarded || 0), 0),
            });
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    };

    const copyCode = (code: string) => {
        navigator.clipboard.writeText(code);
        toast({
            title: 'Código copiado',
            description: 'El código se ha copiado al portapapeles.',
        });
    };

    const toggleCodeStatus = async (codeId: number, currentStatus: boolean) => {
        try {
            await api.put(`/referrals/codes/${codeId}`, { is_active: !currentStatus });
            toast({
                title: 'Estado actualizado',
                description: `El código ha sido ${!currentStatus ? 'activado' : 'desactivado'}.`,
            });
            loadData();
        } catch (error) {
            toast({
                title: 'Error',
                description: 'No se pudo actualizar el estado del código.',
                variant: 'destructive',
            });
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
                return <Badge variant="secondary">Pendiente</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    const filteredCodes = codes.filter(code =>
        `${code.user_name} ${code.user_email} ${code.code}`
            .toLowerCase()
            .includes(searchTerm.toLowerCase())
    );

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
                    <h1 className="text-3xl font-heading font-bold">Programa de Referidos</h1>
                    <p className="text-muted-foreground">
                        Gestiona los códigos de referidos y su seguimiento.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                Códigos Activos
                            </CardTitle>
                            <Share2 className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {codes.filter(c => c.is_active).length}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                Total Referidos
                            </CardTitle>
                            <Users className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.total_referrals}</div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                Referidos Completados
                            </CardTitle>
                            <CheckCircle className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-success">
                                {stats.completed_referrals}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                Puntos Otorgados
                            </CardTitle>
                            <Gift className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.total_points_awarded}</div>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Share2 className="h-5 w-5" />
                            Códigos de Referido
                        </CardTitle>
                        <CardDescription>
                            Códigos generados por los usuarios
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="mb-4">
                            <Input
                                placeholder="Buscar por nombre, email o código..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="max-w-md"
                            />
                        </div>

                        {filteredCodes.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                No hay códigos de referido registrados.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Usuario</TableHead>
                                        <TableHead>Código</TableHead>
                                        <TableHead className="text-right">Usos</TableHead>
                                        <TableHead className="text-right">Puntos/Uso</TableHead>
                                        <TableHead>Estado</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredCodes.map((code) => (
                                        <TableRow key={code.id}>
                                            <TableCell>
                                                <div>
                                                    <div className="font-medium">{code.user_name}</div>
                                                    <div className="text-sm text-muted-foreground">
                                                        {code.user_email}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <code className="px-2 py-1 bg-muted rounded text-sm font-mono">
                                                    {code.code}
                                                </code>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {code.uses_count}
                                                {code.max_uses && ` / ${code.max_uses}`}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {code.reward_points}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={code.is_active ? 'default' : 'secondary'}>
                                                    {code.is_active ? 'Activo' : 'Inactivo'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => copyCode(code.code)}
                                                >
                                                    <Copy className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => toggleCodeStatus(code.id, code.is_active)}
                                                >
                                                    {code.is_active ? 'Desactivar' : 'Activar'}
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5" />
                            Historial de Referidos
                        </CardTitle>
                        <CardDescription>
                            Registro de todas las referencias realizadas
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {referrals.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                No hay referidos registrados todavía.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Fecha</TableHead>
                                        <TableHead>Quien Refiere</TableHead>
                                        <TableHead>Referido</TableHead>
                                        <TableHead className="text-right">Puntos</TableHead>
                                        <TableHead>Estado</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {referrals.map((referral) => (
                                        <TableRow key={referral.id}>
                                            <TableCell>
                                                {format(new Date(referral.created_at), 'dd MMM yyyy', { locale: es })}
                                            </TableCell>
                                            <TableCell>
                                                <div>
                                                    <div className="font-medium">{referral.referrer_name}</div>
                                                    <div className="text-sm text-muted-foreground">
                                                        {referral.referrer_email}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div>
                                                    <div className="font-medium">{referral.referred_name}</div>
                                                    <div className="text-sm text-muted-foreground">
                                                        {referral.referred_email}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {referral.points_awarded || 0}
                                            </TableCell>
                                            <TableCell>
                                                {getStatusBadge(referral.status)}
                                            </TableCell>
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
