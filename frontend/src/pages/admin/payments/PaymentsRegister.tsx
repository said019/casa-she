import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import api, { getErrorMessage } from '@/lib/api';
import type { User, Membership } from '@/types/auth';
import { ArrowLeft, Loader2 } from 'lucide-react';

const paymentSchema = z.object({
  userId: z.string().uuid('Selecciona un miembro'),
  membershipId: z.string().uuid().optional(),
  amount: z.coerce.number().positive('Monto inválido'),
  currency: z.string().min(3).max(3).default('MXN'),
  paymentMethod: z.enum(['cash', 'transfer', 'card', 'online']),
  status: z.enum(['completed', 'pending']).default('completed'),
  reference: z.string().optional(),
  notes: z.string().optional(),
  facilityId: z.string().uuid().optional(),
  concept: z.string().max(255).optional(),
});

type PaymentForm = z.infer<typeof paymentSchema>;

export default function PaymentsRegister() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<PaymentForm>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      currency: 'MXN',
      status: 'completed',
    },
  });

  const selectedUserId = watch('userId');

  const { data: users } = useQuery<User[]>({
    queryKey: ['users', 'payments'],
    queryFn: async () => {
      const { data } = await api.get('/users?role=client&limit=200');
      return data.users;
    },
  });

  const { data: facilities = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['facilities'],
    queryFn: async () => {
      const { data } = await api.get('/facilities');
      return data;
    },
  });

  const { data: memberships } = useQuery<Membership[]>({
    queryKey: ['memberships', 'by-user', selectedUserId],
    queryFn: async () => {
      const { data } = await api.get(`/memberships?userId=${selectedUserId}`);
      return data;
    },
    enabled: Boolean(selectedUserId),
  });

  const registerMutation = useMutation({
    mutationFn: async (payload: PaymentForm) => {
      const response = await api.post('/payments/register', payload);
      return response.data;
    },
    onSuccess: () => {
      toast({ title: 'Pago registrado', description: 'El pago se registró correctamente.' });
      navigate('/admin/payments/transactions');
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(error) });
    },
  });

  useEffect(() => {
    register('membershipId');
    register('paymentMethod');
    register('status');
    register('userId');
    register('facilityId');
  }, [register]);

  const onSubmit = (data: PaymentForm) => {
    registerMutation.mutate(data);
  };

  return (
    <AuthGuard requiredRoles={['admin']}>
      <AdminLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/admin/payments/transactions">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-3xl font-heading font-bold">Registrar pago manual</h1>
              <p className="text-muted-foreground">Registra pagos en efectivo, transferencias o tarjetas.</p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Detalle del pago</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label>Miembro</Label>
                  <Select onValueChange={(value) => setValue('userId', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar miembro" />
                    </SelectTrigger>
                    <SelectContent>
                      {users?.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.display_name} ({user.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.userId && <p className="text-xs text-destructive">{errors.userId.message}</p>}
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label>Membresía relacionada (opcional)</Label>
                  <Select onValueChange={(value) => setValue('membershipId', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar membresía" />
                    </SelectTrigger>
                    <SelectContent>
                      {memberships?.map((membership) => (
                        <SelectItem key={membership.id} value={membership.id}>
                          {membership.plan_name} • {membership.status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Monto</Label>
                  <Input type="number" step="0.01" {...register('amount')} />
                  {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label>Moneda</Label>
                  <Input {...register('currency')} />
                </div>

                <div className="space-y-2">
                  <Label>Método de pago</Label>
                  <Select onValueChange={(value) => setValue('paymentMethod', value as PaymentForm['paymentMethod'])}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar método" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Efectivo</SelectItem>
                      <SelectItem value="transfer">Transferencia</SelectItem>
                      <SelectItem value="card">Tarjeta</SelectItem>
                      <SelectItem value="online">Pago en línea</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.paymentMethod && (
                    <p className="text-xs text-destructive">{errors.paymentMethod.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Estado</Label>
                  <Select onValueChange={(value) => setValue('status', value as PaymentForm['status'])}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="completed">Completado</SelectItem>
                      <SelectItem value="pending">Pendiente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Estudio (opcional)</Label>
                  <Select
                    onValueChange={(value) =>
                      setValue('facilityId', value === '__none__' ? undefined : value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="General" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">General</SelectItem>
                      {facilities.map((facility) => (
                        <SelectItem key={facility.id} value={facility.id}>
                          {facility.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Concepto (opcional)</Label>
                  <Input {...register('concept')} />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label>Referencia (opcional)</Label>
                  <Input {...register('reference')} />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label>Notas (opcional)</Label>
                  <Textarea rows={3} {...register('notes')} />
                </div>

                <div className="md:col-span-2 flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => navigate('/admin/payments/transactions')}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={registerMutation.isPending}>
                    {registerMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Registrar pago
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}
