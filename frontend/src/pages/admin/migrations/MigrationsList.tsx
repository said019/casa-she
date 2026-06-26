import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ArrowLeft,
  UserPlus,
  Upload,
  Download,
  Users,
  Calendar,
  DollarSign,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Search,
  Loader2,
  FileSpreadsheet,
} from 'lucide-react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface Migration {
  id: string;
  user_id: string;
  display_name: string;
  email: string;
  phone: string;
  plan_name: string;
  plan_class_limit: number | null;
  original_payment_date: string;
  original_payment_amount: number;
  original_payment_method: string;
  membership_start_date: string;
  membership_end_date: string;
  membership_status: string;
  membership_state: string;
  classes_remaining: number | null;
  days_remaining: number;
  classes_used_before_migration: number;
  migrated_at: string;
  migrated_by_name: string;
  migration_notes: string;
}

interface Stats {
  total_migrated: number;
  total_historical_revenue: number;
  active_count: number;
  expired_count: number;
  expiring_soon_count: number;
  byPlan: Array<{
    plan_name: string;
    count: number;
    total_amount: number;
  }>;
}

export default function MigrationsList() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [migrations, setMigrations] = useState<Migration[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const headers = { Authorization: `Bearer ${token}` };

      const [migrationsRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/migrations`, { headers }),
        fetch(`${API_URL}/migrations/stats`, { headers }),
      ]);

      if (!migrationsRes.ok || !statsRes.ok) {
        throw new Error('Error al cargar datos');
      }

      const migrationsData = await migrationsRes.json();
      const statsData = await statsRes.json();

      setMigrations(migrationsData.migrations || []);
      setStats(statsData);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las migraciones',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_URL}/migrations/template`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Error al descargar');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'plantilla_migracion.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: 'Descargado',
        description: 'Plantilla descargada exitosamente',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo descargar la plantilla',
        variant: 'destructive',
      });
    }
  };

  const filteredMigrations = migrations.filter(
    (m) =>
      m.display_name.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase()) ||
      m.phone.includes(search)
  );

  const getStatusBadge = (state: string, daysRemaining: number) => {
    if (state === 'Activa') {
      if (daysRemaining <= 30) {
        return (
          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Por vencer ({daysRemaining}d)
          </Badge>
        );
      }
      return (
        <Badge variant="outline" className="bg-success/10 text-success border-success/30">
          <CheckCircle className="w-3 h-3 mr-1" />
          Activa
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
        <XCircle className="w-3 h-3 mr-1" />
        Expirada
      </Badge>
    );
  };

  const formatPaymentMethod = (method: string) => {
    const methods: Record<string, string> = {
      cash: 'Efectivo',
      transfer: 'Transferencia',
      card: 'Tarjeta',
    };
    return methods[method] || method;
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin/dashboard')}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-heading font-bold">Migración de Usuarios</h1>
              <p className="text-muted-foreground">
                Registra usuarios existentes sin generar ventas
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="w-4 h-4 mr-2" />
              Plantilla CSV
            </Button>
            <Button variant="outline" onClick={() => navigate('/admin/migrations/import')}>
              <Upload className="w-4 h-4 mr-2" />
              Importar
            </Button>
            <Button onClick={() => navigate('/admin/migrations/new')}>
              <UserPlus className="w-4 h-4 mr-2" />
              Migrar Usuario
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-info/10 rounded-lg">
                    <Users className="w-5 h-5 text-info" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.total_migrated}</p>
                    <p className="text-xs text-muted-foreground">Total migrados</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-success/10 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-success" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.active_count}</p>
                    <p className="text-xs text-muted-foreground">Activas</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-warning/10 rounded-lg">
                    <Clock className="w-5 h-5 text-warning" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.expiring_soon_count}</p>
                    <p className="text-xs text-muted-foreground">Por vencer (30d)</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <XCircle className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.expired_count}</p>
                    <p className="text-xs text-muted-foreground">Expiradas</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <DollarSign className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      ${Number(stats.total_historical_revenue).toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">Histórico (ref.)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Por Plan */}
        {stats && stats.byPlan && stats.byPlan.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Por Tipo de Paquete</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {stats.byPlan.map((plan) => (
                  <div
                    key={plan.plan_name}
                    className="bg-muted rounded-lg p-3 text-center"
                  >
                    <p className="font-medium">{plan.plan_name || 'Sin plan'}</p>
                    <p className="text-2xl font-bold">{plan.count}</p>
                    <p className="text-xs text-muted-foreground">
                      ${Number(plan.total_amount).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Lista de Migraciones */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Usuarios Migrados</CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredMigrations.length === 0 ? (
              <div className="text-center py-12">
                <FileSpreadsheet className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-muted-foreground">No hay usuarios migrados aún</p>
                <Button
                  className="mt-4"
                  onClick={() => navigate('/admin/migrations/new')}
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Migrar primer usuario
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuario</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Pago Original</TableHead>
                      <TableHead>Vigencia</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Migrado</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMigrations.map((migration) => (
                      <TableRow key={migration.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{migration.display_name}</p>
                            <p className="text-xs text-muted-foreground">{migration.email}</p>
                            <p className="text-xs text-muted-foreground">{migration.phone}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{migration.plan_name}</p>
                            {migration.classes_remaining !== null && (
                              <p className="text-xs text-muted-foreground">
                                {migration.classes_remaining} clases restantes
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">
                              ${Number(migration.original_payment_amount).toLocaleString()}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(migration.original_payment_date), 'dd MMM yyyy', {
                                locale: es,
                              })}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatPaymentMethod(migration.original_payment_method)}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p>
                              {format(new Date(migration.membership_start_date), 'dd/MM/yy', {
                                locale: es,
                              })}{' '}
                              -{' '}
                              {format(new Date(migration.membership_end_date), 'dd/MM/yy', {
                                locale: es,
                              })}
                            </p>
                            {migration.days_remaining > 0 && (
                              <p className="text-xs text-muted-foreground">
                                {migration.days_remaining} días restantes
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(
                            migration.membership_state,
                            migration.days_remaining
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-xs text-muted-foreground">
                            <p>
                              {format(new Date(migration.migrated_at), 'dd MMM yyyy', {
                                locale: es,
                              })}
                            </p>
                            <p>por {migration.migrated_by_name}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              navigate(`/admin/members/${migration.user_id}`)
                            }
                          >
                            Ver
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

        {/* Nota informativa */}
        <div className="bg-info/10 border border-info/30 rounded-lg p-4 text-sm text-info">
          <p className="font-medium mb-1">ℹ️ Sobre las migraciones</p>
          <p>
            Los montos mostrados en "Histórico" son solo de referencia y{' '}
            <strong>NO afectan</strong> los reportes de ingresos actuales. Las
            migraciones están marcadas con <code>is_migration = true</code> para
            distinguirlas de ventas nuevas.
          </p>
        </div>
      </div>
    </AdminLayout>
  );
}
