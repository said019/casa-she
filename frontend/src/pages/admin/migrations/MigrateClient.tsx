import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, addYears, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ArrowLeft,
  UserPlus,
  Calendar,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Copy,
  Mail,
  Loader2,
} from 'lucide-react';
import { AdminLayout } from '@/components/layout/AdminLayout';
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const migrateClientSchema = z.object({
  displayName: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  phone: z.string().min(8, 'Teléfono inválido'),
  dateOfBirth: z.string().optional(),
  planId: z.string().min(1, 'Selecciona un plan'),
  originalPaymentDate: z.string().min(1, 'Fecha de pago requerida'),
  paymentAmount: z.string().min(1, 'Monto requerido'),
  paymentMethod: z.enum(['cash', 'transfer', 'card']),
  receiptNumber: z.string().optional(),
  membershipStartDate: z.string().min(1, 'Fecha de inicio requerida'),
  membershipEndDate: z.string().min(1, 'Fecha de vencimiento requerida'),
  classesUsed: z.string().default('0'),
  migrationNotes: z.string().optional(),
  sendWelcomeEmail: z.boolean().default(true),
  generateWalletPass: z.boolean().default(false),
});

type MigrateClientForm = z.infer<typeof migrateClientSchema>;

interface Plan {
  id: string;
  name: string;
  price: number;
  duration_days: number;
  class_limit: number | null;
  category: string;
  is_exclusive: boolean;
}

interface MigrationResult {
  success: boolean;
  user: {
    id: string;
    email: string;
    displayName: string;
    phone: string;
  };
  membership: {
    id: string;
    status: string;
    planName: string;
    startDate: string;
    endDate: string;
    classesRemaining: number | null;
    daysRemaining: number;
  };
  tempPassword: string;
  walletPassesGenerated: boolean;
  message: string;
}

export default function MigrateClient() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<MigrateClientForm>({
    resolver: zodResolver(migrateClientSchema),
    defaultValues: {
      paymentMethod: 'cash',
      classesUsed: '0',
      sendWelcomeEmail: true,
      generateWalletPass: false,
    },
  });

  const watchPaymentDate = watch('originalPaymentDate');
  const watchPlanId = watch('planId');

  useEffect(() => {
    fetchPlans();
  }, []);

  useEffect(() => {
    if (watchPlanId) {
      const plan = plans.find((p) => p.id === watchPlanId);
      setSelectedPlan(plan || null);

      if (plan && watchPaymentDate) {
        const startDate = new Date(watchPaymentDate);
        setValue('membershipStartDate', format(startDate, 'yyyy-MM-dd'));

        let endDate: Date;
        if (plan.duration_days === 365) {
          endDate = addYears(startDate, 1);
        } else {
          endDate = addDays(startDate, plan.duration_days);
        }
        setValue('membershipEndDate', format(endDate, 'yyyy-MM-dd'));
      }
    }
  }, [watchPlanId, watchPaymentDate, plans, setValue]);

  const fetchPlans = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_URL}/plans?all=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Error al cargar planes');

      const data = await response.json();
      setPlans(data);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los planes',
        variant: 'destructive',
      });
    } finally {
      setLoadingPlans(false);
    }
  };

  const onSubmit = async (data: MigrateClientForm) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_URL}/migrations/client`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...data,
          paymentAmount: parseFloat(data.paymentAmount),
          classesUsed: parseInt(data.classesUsed || '0', 10),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al migrar usuario');
      }

      setResult(result);
      toast({
        title: '¡Usuario migrado!',
        description: result.message,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copiado',
      description: 'Contraseña copiada al portapapeles',
    });
  };

  const resetForm = () => {
    setResult(null);
    window.location.reload();
  };

  if (result) {
    return (
      <AdminLayout>
        <div className="max-w-2xl mx-auto p-6">
          <Card className="border-success/30 bg-success/10/50">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 className="w-8 h-8 text-success" />
              </div>
              <CardTitle className="text-success">
                ¡Usuario Migrado Exitosamente!
              </CardTitle>
              <CardDescription>
                {result.user.displayName} ya puede acceder a la plataforma
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-white rounded-lg p-4 space-y-3">
                <h4 className="font-medium text-foreground">Datos del Usuario</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Nombre:</span>
                  <span className="font-medium">{result.user.displayName}</span>
                  <span className="text-muted-foreground">Email:</span>
                  <span className="font-medium">{result.user.email}</span>
                  <span className="text-muted-foreground">Teléfono:</span>
                  <span className="font-medium">{result.user.phone}</span>
                </div>
              </div>

              <div className="bg-white rounded-lg p-4 space-y-3">
                <h4 className="font-medium text-foreground">Membresía Activa</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Plan:</span>
                  <span className="font-medium">{result.membership.planName}</span>
                  <span className="text-muted-foreground">Inicio:</span>
                  <span className="font-medium">
                    {format(new Date(result.membership.startDate), 'dd MMM yyyy', { locale: es })}
                  </span>
                  <span className="text-muted-foreground">Vence:</span>
                  <span className="font-medium">
                    {format(new Date(result.membership.endDate), 'dd MMM yyyy', { locale: es })}
                  </span>
                  <span className="text-muted-foreground">Días restantes:</span>
                  <span className="font-medium text-success">
                    {result.membership.daysRemaining} días
                  </span>
                  {result.membership.classesRemaining !== null && (
                    <>
                      <span className="text-muted-foreground">Clases restantes:</span>
                      <span className="font-medium">{result.membership.classesRemaining}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 space-y-3">
                <h4 className="font-medium text-warning-foreground flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Credenciales de Acceso
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between bg-white rounded px-3 py-2">
                    <div>
                      <span className="text-xs text-muted-foreground">Email:</span>
                      <p className="font-mono text-sm">{result.user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between bg-white rounded px-3 py-2">
                    <div>
                      <span className="text-xs text-muted-foreground">Contraseña temporal:</span>
                      <p className="font-mono text-sm font-bold">{result.tempPassword}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(result.tempPassword)}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-warning">
                  El usuario debe cambiar su contraseña en el primer inicio de sesión.
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => navigate(`/admin/members/${result.user.id}`)}
                >
                  Ver perfil del usuario
                </Button>
                <Button className="flex-1" onClick={resetForm}>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Migrar otro usuario
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto p-6">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-heading font-bold">Migrar Usuario Existente</h1>
            <p className="text-muted-foreground">
              Registra un usuario que ya pagó antes de la plataforma
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Datos del Cliente */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <UserPlus className="w-5 h-5" />
                Datos del Usuario
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label htmlFor="displayName">Nombre completo *</Label>
                <Input
                  id="displayName"
                  placeholder="María López García"
                  {...register('displayName')}
                  className={errors.displayName ? 'border-red-500' : ''}
                />
                {errors.displayName && (
                  <p className="text-red-500 text-xs mt-1">{errors.displayName.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="maria@email.com"
                  {...register('email')}
                  className={errors.email ? 'border-red-500' : ''}
                />
                {errors.email && (
                  <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="phone">Teléfono *</Label>
                <Input
                  id="phone"
                  placeholder="664-123-4567"
                  {...register('phone')}
                  className={errors.phone ? 'border-red-500' : ''}
                />
                {errors.phone && (
                  <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="dateOfBirth">Fecha de nacimiento</Label>
                <Input id="dateOfBirth" type="date" {...register('dateOfBirth')} />
              </div>
            </CardContent>
          </Card>

          {/* Plan/Membresía */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Paquete/Membresía
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Tipo de paquete *</Label>
                {loadingPlans ? (
                  <div className="flex items-center gap-2 text-muted-foreground py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Cargando planes...
                  </div>
                ) : (
                  <Select
                    onValueChange={(value) => setValue('planId', value)}
                    defaultValue=""
                  >
                    <SelectTrigger className={errors.planId ? 'border-red-500' : ''}>
                      <SelectValue placeholder="Selecciona un plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {plans.map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          <div className="flex items-center gap-2">
                            <span>{plan.name}</span>
                            <span className="text-muted-foreground text-xs">
                              (${plan.price} - {plan.duration_days} días
                              {plan.class_limit ? ` - ${plan.class_limit} clases` : ' - Ilimitado'})
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {errors.planId && (
                  <p className="text-red-500 text-xs mt-1">{errors.planId.message}</p>
                )}
              </div>

              {selectedPlan && (
                <div className="bg-muted rounded-lg p-3 text-sm">
                  <p className="font-medium">{selectedPlan.name}</p>
                  <p className="text-muted-foreground">
                    Duración: {selectedPlan.duration_days} días •{' '}
                    {selectedPlan.class_limit ? `${selectedPlan.class_limit} clases` : 'Clases ilimitadas'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Información de Pago Histórico */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Información del Pago Anterior
              </CardTitle>
              <CardDescription>
                Datos del pago original (NO genera venta nueva)
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="originalPaymentDate">Fecha de pago original *</Label>
                <Input
                  id="originalPaymentDate"
                  type="date"
                  {...register('originalPaymentDate')}
                  className={errors.originalPaymentDate ? 'border-red-500' : ''}
                />
                {errors.originalPaymentDate && (
                  <p className="text-red-500 text-xs mt-1">{errors.originalPaymentDate.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="paymentAmount">Monto pagado *</Label>
                <Input
                  id="paymentAmount"
                  type="number"
                  step="0.01"
                  placeholder="500.00"
                  {...register('paymentAmount')}
                  className={errors.paymentAmount ? 'border-red-500' : ''}
                />
                {errors.paymentAmount && (
                  <p className="text-red-500 text-xs mt-1">{errors.paymentAmount.message}</p>
                )}
              </div>

              <div>
                <Label>Método de pago</Label>
                <Select
                  onValueChange={(value: 'cash' | 'transfer' | 'card') =>
                    setValue('paymentMethod', value)
                  }
                  defaultValue="cash"
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Efectivo</SelectItem>
                    <SelectItem value="transfer">Transferencia</SelectItem>
                    <SelectItem value="card">Tarjeta</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="receiptNumber">Número de recibo (opcional)</Label>
                <Input
                  id="receiptNumber"
                  placeholder="Recibo-001"
                  {...register('receiptNumber')}
                />
              </div>
            </CardContent>
          </Card>

          {/* Vigencia de la Membresía */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Vigencia de la Membresía</CardTitle>
              <CardDescription>
                Se calcula automáticamente basado en la fecha de pago y el plan
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="membershipStartDate">Fecha de inicio *</Label>
                <Input
                  id="membershipStartDate"
                  type="date"
                  {...register('membershipStartDate')}
                  className={errors.membershipStartDate ? 'border-red-500' : ''}
                />
                {errors.membershipStartDate && (
                  <p className="text-red-500 text-xs mt-1">{errors.membershipStartDate.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="membershipEndDate">Fecha de vencimiento *</Label>
                <Input
                  id="membershipEndDate"
                  type="date"
                  {...register('membershipEndDate')}
                  className={errors.membershipEndDate ? 'border-red-500' : ''}
                />
                {errors.membershipEndDate && (
                  <p className="text-red-500 text-xs mt-1">{errors.membershipEndDate.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="classesUsed">Clases ya usadas</Label>
                <Input
                  id="classesUsed"
                  type="number"
                  min="0"
                  placeholder="0"
                  {...register('classesUsed')}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Si ya tomó clases antes de migrar
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Notas y Opciones */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Notas y Opciones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="migrationNotes">Notas internas</Label>
                <Textarea
                  id="migrationNotes"
                  placeholder="Usuario antiguo del estudio. Migrado a plataforma digital..."
                  {...register('migrationNotes')}
                  rows={3}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sendWelcomeEmail"
                  defaultChecked
                  onCheckedChange={(checked) =>
                    setValue('sendWelcomeEmail', checked as boolean)
                  }
                />
                <Label htmlFor="sendWelcomeEmail" className="text-sm font-normal">
                  Enviar email de bienvenida con credenciales
                </Label>
              </div>

            </CardContent>
          </Card>

          {/* Aviso Importante */}
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-4">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-warning-foreground">Importante</p>
                <ul className="text-warning mt-1 space-y-1">
                  <li>✓ Creará cuenta de usuario con contraseña temporal</li>
                  <li>✓ Activará su membresía inmediatamente</li>
                  <li>✓ <strong>NO</strong> generará orden de venta</li>
                  <li>✓ <strong>NO</strong> afectará reportes de ingresos</li>
                  <li>✓ Se marcará como "migración histórica"</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Botones */}
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => navigate(-1)}
            >
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Migrando...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Registrar Usuario
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
}
