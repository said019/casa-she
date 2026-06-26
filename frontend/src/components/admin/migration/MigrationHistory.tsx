/**
 * 📜 COMPONENTE: Historial de Migraciones
 * 
 * Lista todas las migraciones de clientes realizadas
 */

import { useEffect } from 'react';
import { useMigrationHistory } from '@/hooks/useMigrateClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { RefreshCcw, History, AlertCircle, ExternalLink } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const toDate = (value: unknown): Date => {
  if (value instanceof Date) return value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  if (value && typeof value === 'object' && 'seconds' in value) {
    return new Date((value as { seconds: number }).seconds * 1000);
  }
  return new Date(value as string | number);
};

interface MigrationHistoryProps {
  onViewClient?: (userId: string) => void;
}

export const MigrationHistory = ({ onViewClient }: MigrationHistoryProps) => {
  const { history, loading, error, fetchHistory } = useMigrationHistory();

  useEffect(() => {
    fetchHistory(50);
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Historial de Migraciones
              </CardTitle>
              <CardDescription>
                Registro de todos los usuarios migrados al sistema
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchHistory(50)}
              disabled={loading}
            >
              <RefreshCcw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12">
              <History className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">
                No hay migraciones registradas
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Contacto</TableHead>
                    <TableHead>Paquete</TableHead>
                    <TableHead>Monto Original</TableHead>
                    <TableHead>Fecha de Pago</TableHead>
                    <TableHead>Inscrito Por</TableHead>
                    <TableHead>Fecha de Inscripción</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">{record.userName}</p>
                          <Badge variant="secondary" className="text-xs">
                            🔄 Inscripción manual
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-sm">
                          {record.userEmail && (
                            <p className="text-muted-foreground">{record.userEmail}</p>
                          )}
                          <p className="text-muted-foreground">{record.userPhone}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-sm">{record.packageName}</p>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">
                          ${record.originalAmount.toLocaleString()}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">
                          {format(
                            toDate(record.originalPaymentDate),
                            "d 'de' MMM 'de' yyyy",
                            { locale: es }
                          )}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">{record.migratedByName}</p>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="text-sm">
                            {format(
                              toDate(record.migratedAt),
                              "d 'de' MMM 'de' yyyy",
                              { locale: es }
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(toDate(record.migratedAt), 'HH:mm')}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onViewClient?.(record.userId)}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {history.length > 0 && (
            <div className="mt-4 text-sm text-muted-foreground text-center">
              Mostrando {history.length} registros
            </div>
          )}
        </CardContent>
      </Card>

      {/* Información adicional */}
      <Alert>
        <AlertDescription>
          <p className="font-medium mb-2">ℹ️ Sobre las migraciones:</p>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>Los usuarios inscritos manualmente NO generan órdenes de venta</li>
            <li>NO afectan los reportes de ingresos reales</li>
            <li>Se pueden identificar por la etiqueta "Inscripción manual"</li>
            <li>Todos los registros quedan auditados con fecha y admin responsable</li>
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  );
};
