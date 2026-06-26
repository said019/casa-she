/**
 * 📊 COMPONENTE: Widget de Estadísticas de Membresías
 * 
 * Muestra estadísticas de membresías activas desglosadas por origen
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { getMembershipStats } from '@/services/migrationServiceAPI';
import type { MembershipStats } from '@/types/migration.types';
import { Users, TrendingUp, ShoppingCart, Gift, RefreshCcw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const calculatePercentage = (value: number, total: number): number =>
  total === 0 ? 0 : Math.round((value / total) * 100);

export const MembershipStatsWidget = () => {
  const [stats, setStats] = useState<MembershipStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    const data = await getMembershipStats();
    setStats(data);
    setLoading(false);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!stats) return null;

  const items = [
    {
      label: 'Ventas en plataforma',
      value: stats.porVenta,
      icon: ShoppingCart,
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
    {
      label: 'Usuarios migrados',
      value: stats.porMigracion,
      icon: RefreshCcw,
      color: 'text-info',
      bgColor: 'bg-info/10',
    },
    {
      label: 'Promociones',
      value: stats.porPromo,
      icon: TrendingUp,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
    {
      label: 'Cortesías/Regalos',
      value: stats.porGift,
      icon: Gift,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Membresías Activas
        </CardTitle>
        <CardDescription>
          Desglose por origen de las membresías activas
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Total */}
        <div className="flex items-center justify-between p-4 bg-primary/5 rounded-lg">
          <div>
            <p className="text-sm text-muted-foreground">Total Activas</p>
            <p className="text-3xl font-bold">{stats.totalActivas}</p>
          </div>
          <Badge variant="secondary" className="text-lg">
            {stats.totalActivas} activas
          </Badge>
        </div>

        {/* Desglose */}
        <div className="space-y-3">
          {items.map((item) => {
            const percentage = calculatePercentage(item.value, stats.totalActivas);
            const Icon = item.icon;
            
            return (
              <div key={item.label} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded ${item.bgColor}`}>
                      <Icon className={`h-4 w-4 ${item.color}`} />
                    </div>
                    <span className="text-sm font-medium">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{item.value}</span>
                    <span className="text-xs text-muted-foreground">({percentage}%)</span>
                  </div>
                </div>
                <Progress value={percentage} className="h-2" />
              </div>
            );
          })}
        </div>

        {/* Nota informativa */}
        {stats.porMigracion > 0 && (
          <div className="pt-3 border-t">
            <p className="text-xs text-muted-foreground">
              ℹ️ Los usuarios migrados no generan registros de venta ni afectan reportes de ingresos
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
