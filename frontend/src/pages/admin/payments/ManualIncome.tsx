import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { getPaymentMethodLabel } from '@/lib/paymentLabels';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const schema = z.object({
  amount: z.coerce.number().positive('Monto inválido'),
  concept: z.string().min(1, 'Concepto requerido'),
  paymentMethod: z.enum(['cash', 'transfer', 'card', 'online']),
  facilityId: z.string().uuid().optional(),
  incomeDate: z.string().optional(),
  notes: z.string().optional(),
});
type Form = z.infer<typeof schema>;

export default function ManualIncome() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: facilities = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['facilities'],
    queryFn: async () => {
      const { data } = await api.get('/facilities');
      return data;
    },
  });

  const { data: list = [] } = useQuery<any[]>({
    queryKey: ['manual-incomes'],
    queryFn: async () => {
      const { data } = await api.get('/payments/manual-income');
      return data;
    },
  });

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { paymentMethod: 'cash' },
  });

  const mutation = useMutation({
    mutationFn: async (payload: Form) => {
      const { data } = await api.post('/payments/manual-income', payload);
      return data;
    },
    onSuccess: () => {
      toast({ title: 'Ingreso registrado' });
      reset({ paymentMethod: 'cash' });
      qc.invalidateQueries({ queryKey: ['manual-incomes'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(error) });
    },
  });

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSubmit((d) => mutation.mutate(d))}
        className="grid gap-4 sm:grid-cols-2"
      >
        <div className="space-y-2">
          <label className="text-sm font-medium">Monto</label>
          <Input type="number" step="0.01" {...register('amount')} />
          {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Concepto</label>
          <Input {...register('concept')} placeholder="Ej. Venta de producto" />
          {errors.concept && <p className="text-xs text-destructive">{errors.concept.message}</p>}
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Método</label>
          <Select
            defaultValue="cash"
            onValueChange={(v) => setValue('paymentMethod', v as Form['paymentMethod'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Efectivo</SelectItem>
              <SelectItem value="transfer">Transferencia</SelectItem>
              <SelectItem value="card">Tarjeta</SelectItem>
              <SelectItem value="online">En línea</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Estudio (opcional)</label>
          <Select onValueChange={(v) => setValue('facilityId', v)}>
            <SelectTrigger>
              <SelectValue placeholder="General" />
            </SelectTrigger>
            <SelectContent>
              {facilities.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Fecha (opcional)</label>
          <Input type="date" {...register('incomeDate')} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Notas</label>
          <Input {...register('notes')} />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={mutation.isPending}>
            Registrar ingreso
          </Button>
        </div>
      </form>

      <div className="rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="p-3">Fecha</th>
              <th className="p-3">Concepto</th>
              <th className="p-3">Estudio</th>
              <th className="p-3">Método</th>
              <th className="p-3 text-right">Monto</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="p-3">{String(r.income_date).slice(0, 10)}</td>
                <td className="p-3">{r.concept}</td>
                <td className="p-3">{r.facility_name || 'General'}</td>
                <td className="p-3">{getPaymentMethodLabel(r.payment_method)}</td>
                <td className="p-3 text-right tabular-nums">${Number(r.amount).toFixed(2)}</td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={5}>
                  Sin ingresos manuales.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
