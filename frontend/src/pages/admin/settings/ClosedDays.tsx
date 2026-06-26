import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import api, { getErrorMessage } from '@/lib/api';
import { Plus, Trash2, CalendarOff, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface ClosedDay {
  id: string;
  date: string;
  reason: string;
  createdAt: string;
}

export default function ClosedDays() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newDate, setNewDate] = useState('');
  const [newReason, setNewReason] = useState('');

  const { data: closedDays = [], isLoading } = useQuery<ClosedDay[]>({
    queryKey: ['closed-days'],
    queryFn: async () => (await api.get('/closed-days')).data,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { date: string; reason: string }) =>
      (await api.post('/closed-days', data)).data,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['closed-days'] });
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      const msg = data.cancelledClasses > 0
        ? `Día cerrado agregado. Se cancelaron ${data.cancelledClasses} clases y se reembolsaron ${data.refundedCredits} créditos.`
        : 'Día cerrado agregado.';
      toast({ title: 'Día cerrado', description: msg });
      setNewDate('');
      setNewReason('');
    },
    onError: (e) => toast({ title: 'Error', description: getErrorMessage(e), variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/closed-days/${id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['closed-days'] });
      toast({ title: 'Día cerrado eliminado' });
    },
    onError: (e) => toast({ title: 'Error', description: getErrorMessage(e), variant: 'destructive' }),
  });

  const handleAdd = () => {
    if (!newDate || !newReason.trim()) {
      toast({ title: 'Completa fecha y motivo', variant: 'destructive' });
      return;
    }
    createMutation.mutate({ date: newDate, reason: newReason.trim() });
  };

  const upcoming = closedDays.filter((d) => new Date(d.date + 'T12:00:00') >= new Date(new Date().toDateString()));
  const past = closedDays.filter((d) => new Date(d.date + 'T12:00:00') < new Date(new Date().toDateString()));

  return (
    <AuthGuard requiredRoles={['admin']}>
      <AdminLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-heading font-bold">Días Cerrados</h1>
            <p className="text-muted-foreground">
              Programa días festivos o de mantenimiento. Las clases de ese día se cancelan automáticamente.
            </p>
          </div>

          {/* Add new closed day */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarOff className="h-4 w-4 text-muted-foreground" />
                Agregar día cerrado
              </CardTitle>
              <CardDescription>
                Al agregar un día, todas las clases programadas se cancelarán y los créditos se reembolsarán automáticamente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <Label htmlFor="closed-date">Fecha</Label>
                  <Input
                    id="closed-date"
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div className="flex-[2]">
                  <Label htmlFor="closed-reason">Motivo</Label>
                  <Input
                    id="closed-reason"
                    value={newReason}
                    onChange={(e) => setNewReason(e.target.value)}
                    placeholder="Ej: Día festivo, Mantenimiento, Vacaciones..."
                    className="mt-1"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={handleAdd}
                    disabled={createMutation.isPending}
                    className="gap-1.5"
                  >
                    <Plus className="h-4 w-4" />
                    Agregar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Warning banner */}
          <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-900/50">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-amber-800 dark:text-amber-200">Importante</p>
              <p className="text-amber-700 dark:text-amber-300 mt-0.5">
                Al agregar un día cerrado, las clases se cancelan permanentemente. Eliminar el día cerrado no restaura las clases canceladas.
                La generación automática de clases también omitirá estos días.
              </p>
            </div>
          </div>

          {/* Upcoming closed days */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Próximos días cerrados ({upcoming.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {upcoming.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-6 text-muted-foreground">
                        No hay días cerrados programados
                      </TableCell>
                    </TableRow>
                  ) : (
                    upcoming.map((day) => (
                      <TableRow key={day.id}>
                        <TableCell>
                          <div className="font-medium">
                            {format(new Date(day.date + 'T12:00:00'), "EEEE d 'de' MMMM, yyyy", { locale: es })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{day.reason}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => deleteMutation.mutate(day.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Past closed days */}
          {past.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-muted-foreground">
                  Días cerrados pasados ({past.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {past.map((day) => (
                      <TableRow key={day.id} className="opacity-60">
                        <TableCell>
                          {format(new Date(day.date + 'T12:00:00'), "d MMM yyyy", { locale: es })}
                        </TableCell>
                        <TableCell>{day.reason}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => deleteMutation.mutate(day.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}
