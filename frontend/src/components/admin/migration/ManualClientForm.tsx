/**
 * 📝 FORMULARIO: Registrar Cliente Existente
 * 
 * Formulario completo para migrar clientes que ya pagaron
 * antes de implementar la plataforma.
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
import { Checkbox } from '@/components/ui/checkbox';
import { useMigrateClient } from '@/hooks/useMigrateClient';
import api from '@/lib/api';
import { calculateEndDate, formatDateForInput } from '@/services/migrationServiceAPI';
import { PAYMENT_METHOD_OPTIONS } from '@/types/migration.types';
import type { MigrateClientParams, Package } from '@/types/migration.types';
import { AlertCircle, UserPlus, CheckCircle2 } from 'lucide-react';

interface ManualClientFormProps {
  onSuccess?: (result: { 
    userId: string; 
    packageId: string; 
    tempPassword: string;
    clientData?: {
      name: string;
      email?: string;
      phone: string;
      packageName: string;
      startDate: Date;
      endDate: Date;
    };
  }) => void;
  onCancel?: () => void;
}

export const ManualClientForm = ({ onSuccess, onCancel }: ManualClientFormProps) => {
  const { migrate, loading, error } = useMigrateClient();
  
  // Estados del formulario
  const [packages, setPackages] = useState<Package[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  
  const [formData, setFormData] = useState<Partial<MigrateClientParams>>({
    name: '',
    email: '',
    phone: '',
    birthDate: '',
    packageId: '',
    originalPaymentDate: new Date(),
    originalAmount: 0,
    paymentMethod: 'cash',
    receiptReference: '',
    startDate: new Date(),
    endDate: new Date(),
    classesAlreadyUsed: 0,
    notes: '',
    sendEmail: true,
    sendWhatsApp: true,
  });

  // Cargar paquetes disponibles
  useEffect(() => {
    const loadPackages = async () => {
      try {
        const response = await api.get('/plans?all=true');
        const normalizedPackages: Package[] = response.data.map((plan: any) => ({
          id: plan.id,
          name: plan.name,
          type: 'membership',
          classes: plan.class_limit ?? -1,
          price: Number(plan.price),
          duration: plan.duration_days,
          description: plan.description || undefined,
          active: plan.is_active !== false,
        }));
        setPackages(normalizedPackages.filter((pkg) => pkg.active));
      } catch (err) {
        console.error('Error al cargar paquetes:', err);
      }
    };

    loadPackages();
  }, []);

  // Actualizar fecha de vencimiento cuando cambia el paquete o fecha de inicio
  useEffect(() => {
    if (selectedPackage && formData.startDate) {
      const endDate = calculateEndDate(formData.startDate, selectedPackage.duration);
      setFormData(prev => ({ ...prev, endDate }));
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
    
    const result = await migrate(formData as MigrateClientParams);
    
    if (result && result.success) {
      // Incluir los datos del cliente en el resultado
      onSuccess?.({
        ...result,
        clientData: {
          name: formData.name!,
          email: formData.email,
          phone: formData.phone!,
          packageName: selectedPackage?.name || '',
          startDate: formData.startDate!,
          endDate: formData.endDate!,
        }
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Sección 1: Datos Personales */}
      <Card>
        <CardHeader>
          <CardTitle>Datos Personales</CardTitle>
          <CardDescription>Información básica del usuario</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="name">Nombre completo *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="María López García"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="maria@email.com"
              />
            </div>

            <div>
              <Label htmlFor="phone">Teléfono *</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="442-123-4567"
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="birthDate">Fecha de nacimiento</Label>
            <Input
              id="birthDate"
              type="date"
              value={formData.birthDate}
              onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Sección 2: Membresía/Paquete */}
      <Card>
        <CardHeader>
          <CardTitle>Membresía/Paquete Activo</CardTitle>
          <CardDescription>Tipo de paquete que el usuario compró</CardDescription>
        </CardHeader>
        <CardContent>
          <div>
            <Label htmlFor="package">Tipo de paquete *</Label>
            <Select value={formData.packageId} onValueChange={handlePackageChange} required>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un paquete" />
              </SelectTrigger>
              <SelectContent>
                {packages.map(pkg => (
                  <SelectItem key={pkg.id} value={pkg.id}>
                    {pkg.name} - ${pkg.price.toLocaleString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Sección 3: Información del Pago Original */}
      <Card>
        <CardHeader>
          <CardTitle>Información del Pago Original</CardTitle>
          <CardDescription>Detalles del pago realizado antes de la plataforma</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="paymentDate">Fecha de pago original *</Label>
              <Input
                id="paymentDate"
                type="date"
                value={formData.originalPaymentDate ? formatDateForInput(formData.originalPaymentDate) : ''}
                onChange={(e) => setFormData({
                  ...formData,
                  originalPaymentDate: new Date(e.target.value),
                })}
                required
              />
            </div>

            <div>
              <Label htmlFor="amount">Monto pagado *</Label>
              <Input
                id="amount"
                type="number"
                value={formData.originalAmount}
                onChange={(e) => setFormData({
                  ...formData,
                  originalAmount: parseFloat(e.target.value),
                })}
                placeholder="500.00"
                step="0.01"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="paymentMethod">Método de pago</Label>
              <Select
                value={formData.paymentMethod}
                onValueChange={(value: any) => setFormData({ ...formData, paymentMethod: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHOD_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="receipt">Referencia/Recibo</Label>
              <Input
                id="receipt"
                value={formData.receiptReference}
                onChange={(e) => setFormData({ ...formData, receiptReference: e.target.value })}
                placeholder="REC-2025-0123"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sección 4: Vigencia */}
      <Card>
        <CardHeader>
          <CardTitle>Vigencia de la Membresía</CardTitle>
          <CardDescription>Periodo de validez del paquete</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="startDate">Fecha de inicio *</Label>
              <Input
                id="startDate"
                type="date"
                value={formData.startDate ? formatDateForInput(formData.startDate) : ''}
                onChange={(e) => setFormData({
                  ...formData,
                  startDate: new Date(e.target.value),
                })}
                required
              />
            </div>

            <div>
              <Label htmlFor="endDate">Fecha de vencimiento *</Label>
              <Input
                id="endDate"
                type="date"
                value={formData.endDate ? formatDateForInput(formData.endDate) : ''}
                onChange={(e) => setFormData({
                  ...formData,
                  endDate: new Date(e.target.value),
                })}
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                {selectedPackage && `Calculado: +${selectedPackage.duration} días`}
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="classesUsed">Clases ya utilizadas</Label>
            <Input
              id="classesUsed"
              type="number"
              value={formData.classesAlreadyUsed}
              onChange={(e) => setFormData({
                ...formData,
                classesAlreadyUsed: parseInt(e.target.value) || 0,
              })}
              placeholder="0"
              min="0"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Si ya tomó clases antes de migrar
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Sección 5: Notas Internas */}
      <Card>
        <CardHeader>
          <CardTitle>Notas Internas</CardTitle>
          <CardDescription>Contexto adicional sobre el usuario</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Usuario desde 2024. Pagó inscripción en efectivo en el estudio..."
            rows={4}
          />
        </CardContent>
      </Card>

      {/* Notificaciones */}
      <Card>
        <CardHeader>
          <CardTitle>Notificaciones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="sendEmail"
              checked={formData.sendEmail}
              onCheckedChange={(checked) => setFormData({ ...formData, sendEmail: checked as boolean })}
            />
            <Label htmlFor="sendEmail" className="font-normal">
              Enviar email de bienvenida con datos de acceso
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="sendWhatsApp"
              checked={formData.sendWhatsApp}
              onCheckedChange={(checked) => setFormData({ ...formData, sendWhatsApp: checked as boolean })}
            />
            <Label htmlFor="sendWhatsApp" className="font-normal">
              Enviar WhatsApp con contraseña temporal
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Advertencia */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>IMPORTANTE - Esta acción:</strong>
          <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
            <li>Creará cuenta de usuario</li>
            <li>Activará su membresía inmediatamente</li>
            <li>NO generará orden de venta</li>
            <li>NO afectará reportes de ingresos</li>
            <li>Se marcará como "inscripción manual"</li>
          </ul>
        </AlertDescription>
      </Alert>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Botones */}
      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={loading}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? (
            <>
              <div className="animate-spin mr-2 h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
              Procesando...
            </>
          ) : (
            <>
              <UserPlus className="mr-2 h-4 w-4" />
              Registrar Usuario
            </>
          )}
        </Button>
      </div>
    </form>
  );
};
