/**
 * 💰 FORMULARIO: Venta en Físico
 * 
 * Permite al admin registrar una venta de paquete pagada en efectivo/transferencia.
 * A diferencia de "Inscripción Manual", este SÍ genera orden de venta.
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle2, AlertCircle, DollarSign, CreditCard } from 'lucide-react';
import api from '@/lib/api';
import { planClassLabel } from '@/lib/credits';

interface Plan {
  id: string;
  name: string;
  price: number;
  duration_days: number;
  class_limit: number | null;
  reformer_credits?: number | null;
  multi_credits?: number | null;
}

interface PhysicalSaleFormProps {
  userId: string;
  userName: string;
  onSuccess?: (result: any) => void;
  onCancel?: () => void;
}

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'other', label: 'Otro' },
];

export const PhysicalSaleForm = ({ 
  userId, 
  userName,
  onSuccess, 
  onCancel 
}: PhysicalSaleFormProps) => {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  
  const [formData, setFormData] = useState({
    planId: '',
    paymentDate: new Date().toISOString().split('T')[0],
    amount: 0,
    paymentMethod: 'cash',
    reference: '',
    notes: '',
  });

  // Cargar planes disponibles
  useEffect(() => {
    const loadPlans = async () => {
      try {
        const response = await api.get('/plans');
        // Filtrar: excluir solo inscripción
        const classPlans = response.data.filter((p: Plan) => !p.name.toLowerCase().includes('inscripción'));
        setPlans(classPlans);
      } catch (err) {
        console.error('Error al cargar planes:', err);
        setError('No se pudieron cargar los planes disponibles');
      }
    };
    loadPlans();
  }, []);

  const handlePlanChange = (planId: string) => {
    const plan = plans.find(p => p.id === planId);
    if (plan) {
      setSelectedPlan(plan);
      setFormData(prev => ({
        ...prev,
        planId,
        amount: plan.price,
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await api.post('/admin/physical-sale', {
        userId,
        planId: formData.planId,
        paymentDate: formData.paymentDate,
        amount: formData.amount,
        paymentMethod: formData.paymentMethod,
        reference: formData.reference || undefined,
        notes: formData.notes || undefined,
      });

      setSuccess(true);
      if (onSuccess) {
        onSuccess(response.data);
      }
    } catch (err: any) {
      console.error('Error al registrar venta:', err);
      setError(err.response?.data?.error || 'Error al registrar la venta');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <CheckCircle2 className="h-16 w-16 text-success mx-auto" />
            <h3 className="text-2xl font-bold text-success">¡Venta Registrada!</h3>
            <p className="text-muted-foreground">
              La venta se registró exitosamente y se generó la orden de venta.
            </p>
            <div className="flex gap-3 justify-center pt-4">
              <Button onClick={onCancel}>Cerrar</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Venta en Físico
          </CardTitle>
          <CardDescription>
            Registrar venta de paquete pagada en efectivo/transferencia
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <CreditCard className="h-4 w-4" />
            <AlertDescription>
              <strong>Asignando a:</strong> {userName}
              <br />
              Esta venta <strong>SÍ generará orden de venta</strong> y aparecerá en reportes.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Selección de Plan */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Paquete de Clases</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="plan">
              Plan <span className="text-red-500">*</span>
            </Label>
            <Select value={formData.planId} onValueChange={handlePlanChange} required>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un paquete" />
              </SelectTrigger>
              <SelectContent>
                {plans.map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.name} - ${plan.price} - {planClassLabel(plan)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedPlan && (
            <div className="p-3 bg-muted rounded-lg space-y-1 text-sm">
              <p><strong>Precio:</strong> ${selectedPlan.price}</p>
              <p><strong>Duración:</strong> {selectedPlan.duration_days} días</p>
              <p><strong>Clases:</strong> {planClassLabel(selectedPlan)}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detalles del Pago */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Detalles del Pago</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="paymentDate">
                Fecha de Pago <span className="text-red-500">*</span>
              </Label>
              <Input
                id="paymentDate"
                type="date"
                value={formData.paymentDate}
                onChange={(e) => setFormData(prev => ({ ...prev, paymentDate: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">
                Monto Pagado <span className="text-red-500">*</span>
              </Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData(prev => ({ ...prev, amount: parseFloat(e.target.value) }))}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="paymentMethod">
                Método de Pago <span className="text-red-500">*</span>
              </Label>
              <Select 
                value={formData.paymentMethod} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, paymentMethod: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map(method => (
                    <SelectItem key={method.value} value={method.value}>
                      {method.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reference">Referencia/Recibo</Label>
              <Input
                id="reference"
                value={formData.reference}
                onChange={(e) => setFormData(prev => ({ ...prev, reference: e.target.value }))}
                placeholder="Opcional"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Notas adicionales (opcional)"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Botones */}
      <div className="flex gap-3 justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancelar
        </Button>
        <Button type="submit" disabled={loading || !formData.planId}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Registrando...
            </>
          ) : (
            'Registrar Venta'
          )}
        </Button>
      </div>
    </form>
  );
};
