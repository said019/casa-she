/**
 * 📝 FORMULARIO: Asignar Membresía a Usuario Existente
 * 
 * Permite asignar una membresía manual a un usuario que ya está registrado.
 * Útil cuando clientes se registraron por su cuenta pero ya habían pagado antes.
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
import { Loader2, CheckCircle2, AlertCircle, Calendar, DollarSign, Package } from 'lucide-react';
import api from '@/lib/api';
import { planClassLabel } from '@/lib/credits';
import { calculateEndDate, formatDateForInput } from '@/services/migrationServiceAPI';
import { PAYMENT_METHOD_OPTIONS } from '@/types/migration.types';

interface Package {
  id: string;
  name: string;
  price: number;
  duration_days: number;  // Changed from 'duration' to match API response
  class_limit: number | null;
}

interface AssignMembershipFormProps {
  userId: string;
  userName: string;
  userEmail?: string;
  onSuccess?: (result: any) => void;
  onCancel?: () => void;
}

export const AssignMembershipForm = ({ 
  userId, 
  userName, 
  userEmail,
  onSuccess, 
  onCancel 
}: AssignMembershipFormProps) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [packages, setPackages] = useState<Package[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  
  const [formData, setFormData] = useState({
    packageId: '',
    originalPaymentDate: formatDateForInput(new Date()),
    originalAmount: 0,
    paymentMethod: 'cash',
    receiptReference: '',
    startDate: formatDateForInput(new Date()),
    endDate: formatDateForInput(new Date()),
    classesAlreadyUsed: 0,
    notes: '',
  });

  // Cargar paquetes disponibles (solo inscripción de $500)
  useEffect(() => {
    const loadPackages = async () => {
      try {
        const response = await api.get('/plans');
        // Filtrar solo el plan de inscripción ($500 o menos)
        const inscriptionPlans = response.data.filter((p: Package) => p.price <= 500);
        setPackages(inscriptionPlans);
      } catch (err) {
        console.error('Error al cargar paquetes:', err);
        setError('No se pudieron cargar los planes disponibles');
      }
    };

    loadPackages();
  }, []);

  // Actualizar fecha de vencimiento cuando cambia el paquete o fecha de inicio
  useEffect(() => {
    if (selectedPackage && formData.startDate) {
      const endDate = calculateEndDate(new Date(formData.startDate), selectedPackage.duration_days);
      setFormData(prev => ({ ...prev, endDate: formatDateForInput(endDate) }));
    }
  }, [selectedPackage, formData.startDate]);

  const handlePackageChange = (packageId: string) => {
    const pkg = packages.find(p => p.id === packageId);
    if (pkg) {
      setSelectedPackage(pkg);
      setFormData(prev => ({
        ...prev,
        packageId,
        originalAmount: pkg.price,
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await api.post('/migrations/assign', {
        userId,
        ...formData,
        startDate: new Date(formData.startDate).toISOString(),
        endDate: new Date(formData.endDate).toISOString(),
        originalPaymentDate: new Date(formData.originalPaymentDate).toISOString(),
      });

      onSuccess?.(response.data);
    } catch (err: any) {
      const message = err.response?.data?.error || 'Error al asignar membresía';
      setError(message);
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Info del usuario */}
      <Alert>
        <CheckCircle2 className="h-4 w-4" />
        <AlertDescription>
          <strong>Inscripción Manual - Solo para Migraciones</strong>
          <p className="mt-1">
            Asignando a: {userName} {userEmail && `(${userEmail})`}
          </p>
          <p className="mt-1 text-sm">
            ⚠️ Este formulario es SOLO para inscripciones de $500 de usuarios que ya pagaron antes del sistema.
            <br />
            Para vender paquetes de clases, usa el botón <strong>"Venta en Físico"</strong>.
          </p>
        </AlertDescription>
      </Alert>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Sección 1: Plan */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Plan o Paquete
          </CardTitle>
          <CardDescription>Selecciona el plan que ya pagó</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="packageId">
              Plan <span className="text-destructive">*</span>
            </Label>
            <Select value={formData.packageId} onValueChange={handlePackageChange}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un plan" />
              </SelectTrigger>
              <SelectContent>
                {packages.map((pkg) => (
                  <SelectItem key={pkg.id} value={pkg.id}>
                    {pkg.name} - ${pkg.price} ({pkg.duration_days} días)
                    {` - ${planClassLabel(pkg)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedPackage && (
            <div className="p-3 bg-muted rounded-lg space-y-1 text-sm">
              <p><strong>Precio:</strong> ${selectedPackage.price}</p>
              <p><strong>Duración:</strong> {selectedPackage.duration_days} días</p>
              {selectedPackage.class_limit && (
                <p><strong>Clases:</strong> {selectedPackage.class_limit}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sección 2: Pago Original */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Datos del Pago Original
          </CardTitle>
          <CardDescription>Información del pago que ya realizó</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="originalPaymentDate">
              Fecha de pago <span className="text-destructive">*</span>
            </Label>
            <Input
              id="originalPaymentDate"
              type="date"
              value={formData.originalPaymentDate}
              onChange={(e) => setFormData({ ...formData, originalPaymentDate: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="originalAmount">
              Monto pagado <span className="text-destructive">*</span>
            </Label>
            <Input
              id="originalAmount"
              type="number"
              min="0"
              step="0.01"
              value={formData.originalAmount}
              onChange={(e) => setFormData({ ...formData, originalAmount: parseFloat(e.target.value) })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="paymentMethod">
              Método de pago <span className="text-destructive">*</span>
            </Label>
            <Select 
              value={formData.paymentMethod} 
              onValueChange={(value) => setFormData({ ...formData, paymentMethod: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHOD_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="receiptReference">Referencia/Recibo</Label>
            <Input
              id="receiptReference"
              placeholder="Número de recibo o referencia"
              value={formData.receiptReference}
              onChange={(e) => setFormData({ ...formData, receiptReference: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Sección 3: Vigencia */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Vigencia de la Membresía
          </CardTitle>
          <CardDescription>Fechas de inicio y vencimiento</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="startDate">
              Fecha de inicio <span className="text-destructive">*</span>
            </Label>
            <Input
              id="startDate"
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="endDate">
              Fecha de vencimiento <span className="text-destructive">*</span>
            </Label>
            <Input
              id="endDate"
              type="date"
              value={formData.endDate}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="classesAlreadyUsed">Clases ya usadas</Label>
            <Input
              id="classesAlreadyUsed"
              type="number"
              min="0"
              value={formData.classesAlreadyUsed}
              onChange={(e) => setFormData({ ...formData, classesAlreadyUsed: parseInt(e.target.value) || 0 })}
            />
            <p className="text-xs text-muted-foreground">
              Si ya tomó clases antes, indícalo aquí
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Sección 4: Notas */}
      <Card>
        <CardHeader>
          <CardTitle>Notas Adicionales</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Información adicional sobre esta asignación..."
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={3}
          />
        </CardContent>
      </Card>

      {/* Botones */}
      <div className="flex justify-end gap-3">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={loading || !formData.packageId}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Asignar Membresía
        </Button>
      </div>
    </form>
  );
};
