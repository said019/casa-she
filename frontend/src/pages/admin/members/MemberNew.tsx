/**
 * 🎯 PÁGINA UNIFICADA: Agregar Miembro
 * 
 * Maneja dos flujos:
 * 1. Cliente Nuevo → Solo crea cuenta (sin membresía)
 * 2. Cliente Existente (Inscripción Manual) → Crea cuenta + membresía activa
 */

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/components/ui/use-toast';
import api, { getErrorMessage } from '@/lib/api';
import type { User } from '@/types/auth';
import { ArrowLeft, UserPlus, UserCheck } from 'lucide-react';
import { NewClientForm } from '@/components/admin/members/NewClientForm';
import { ManualClientForm } from '@/components/admin/migration/ManualClientForm';
import { MigrationConfirmation } from '@/components/admin/migration/MigrationConfirmation';

type ClientMode = 'new' | 'existing';

interface CreateMemberResponse {
  user: User;
  tempPassword?: string;
  emailSent?: boolean;
  whatsappSent?: boolean;
}

interface MigrationResult {
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
}

export default function MemberNew() {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Estado del selector de modo
  const [clientMode, setClientMode] = useState<ClientMode>('new');
  
  // Estado para mostrar resultados
  const [newClientResult, setNewClientResult] = useState<CreateMemberResponse | null>(null);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);

  // Mutación para crear cliente nuevo (sin membresía)
  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const finalPayload = {
        ...payload,
        password: payload.password ? payload.password : undefined,
      };
      const { data } = await api.post<CreateMemberResponse>('/users', finalPayload);
      return data;
    },
    onSuccess: (data) => {
      toast({ 
        title: '✅ Usuario creado',
        description: 'La cuenta se creó correctamente. Ahora puedes asignarle una membresía.' 
      });
      setNewClientResult(data);
    },
    onError: (error) => {
      toast({ 
        variant: 'destructive', 
        title: 'Error al crear usuario',
        description: getErrorMessage(error) 
      });
    },
  });

  const handleNewClientSubmit = (data: any) => {
    createMutation.mutate(data);
  };

  const handleManualEnrollmentSuccess = (result: MigrationResult) => {
    setMigrationResult(result);
  };

  // Si ya se completó algún flujo, mostrar resultado
  if (newClientResult) {
    return (
      <AuthGuard requiredRoles={['admin']}>
        <AdminLayout>
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" asChild>
                <Link to="/admin/members">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              <div>
                <h1 className="text-3xl font-heading font-bold">Usuario creado exitosamente</h1>
              </div>
            </div>

            <Card className="border-success/30 bg-success/10">
              <CardHeader>
                <CardTitle className="text-success flex items-center gap-2">
                  <UserCheck className="h-5 w-5" />
                  Cuenta creada
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-success">
                    <strong>Usuario:</strong> {newClientResult.user.display_name}
                  </p>
                  <p className="text-sm text-success">
                    <strong>Email:</strong> {newClientResult.user.email}
                  </p>
                  <p className="text-sm text-success">
                    <strong>Teléfono:</strong> {newClientResult.user.phone}
                  </p>
                </div>

                {newClientResult.tempPassword && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-success">
                      Contraseña temporal:
                    </p>
                    <div className="rounded-md bg-white/70 p-3 font-mono text-base text-success">
                      {newClientResult.tempPassword}
                    </div>
                    <p className="text-xs text-success">
                      Comparte esta contraseña con el usuario para su primer acceso
                    </p>
                  </div>
                )}

                <div className="rounded-md border bg-white/70 p-3 space-y-2 text-sm">
                  <p className="font-medium">Notificaciones automáticas:</p>
                  <div className={newClientResult.emailSent ? 'text-success' : 'text-destructive'}>
                    {newClientResult.emailSent
                      ? '✓ Email de bienvenida enviado'
                      : '✗ No se pudo enviar el email — entrega la contraseña manualmente'}
                  </div>
                  <div className={newClientResult.whatsappSent ? 'text-success' : 'text-destructive'}>
                    {newClientResult.whatsappSent
                      ? '✓ WhatsApp con contraseña temporal enviado'
                      : '✗ No se pudo enviar el WhatsApp — entrega la contraseña manualmente'}
                  </div>
                </div>

                <div className="pt-4 border-t border-success/30">
                  <p className="text-sm text-success mb-3">
                    <strong>Siguientes pasos:</strong>
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm text-success">
                    <li>Vende una membresía desde "Ventas" → "Nueva Venta"</li>
                    <li>O activa una membresía manualmente desde "Membresías"</li>
                  </ul>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button onClick={() => navigate('/admin/members')}>
                    Ver todos los miembros
                  </Button>
                  <Button variant="outline" onClick={() => navigate(`/admin/members/${newClientResult.user.id}`)}>
                    Ver perfil del usuario
                  </Button>
                  <Button variant="outline" onClick={() => {
                    setNewClientResult(null);
                    setClientMode('new');
                  }}>
                    Agregar otro
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </AdminLayout>
      </AuthGuard>
    );
  }

  if (migrationResult) {
    // Si no tenemos clientData, no podemos mostrar la confirmación
    if (!migrationResult.clientData) {
      return (
        <AuthGuard requiredRoles={['admin']}>
          <AdminLayout>
            <div className="space-y-6">
              <Card className="border-success/30 bg-success/10">
                <CardHeader>
                  <CardTitle className="text-success">✅ Inscripción exitosa</CardTitle>
                </CardHeader>
                <CardContent>
                  <Button onClick={() => navigate('/admin/members')}>
                    Ver todos los miembros
                  </Button>
                </CardContent>
              </Card>
            </div>
          </AdminLayout>
        </AuthGuard>
      );
    }

    return (
      <AuthGuard requiredRoles={['admin']}>
        <AdminLayout>
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" asChild>
                <Link to="/admin/members">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              <div>
                <h1 className="text-3xl font-heading font-bold">Inscripción completada</h1>
              </div>
            </div>

            <MigrationConfirmation
              clientData={{
                ...migrationResult.clientData,
                tempPassword: migrationResult.tempPassword,
              }}
              onViewProfile={() => navigate(`/admin/members/${migrationResult.userId}`)}
              onRegisterAnother={() => {
                setMigrationResult(null);
                setClientMode('existing');
              }}
            />
          </div>
        </AdminLayout>
      </AuthGuard>
    );
  }

  // Pantalla principal con selector
  return (
    <AuthGuard requiredRoles={['admin']}>
      <AdminLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/admin/members">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-3xl font-heading font-bold">Agregar miembro</h1>
              <p className="text-muted-foreground">
                Elige el tipo de usuario y completa el formulario
              </p>
            </div>
          </div>

          {/* Selector de modo */}
          <Card>
            <CardHeader>
              <CardTitle>¿Qué tipo de usuario vas a registrar?</CardTitle>
              <CardDescription>
                Selecciona la opción que mejor describa la situación del usuario
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={clientMode}
                onValueChange={(value) => setClientMode(value as ClientMode)}
                className="grid gap-4"
              >
                {/* Opción: Cliente Nuevo */}
                <div className="flex items-start space-x-3 rounded-lg border p-4 cursor-pointer hover:bg-accent transition-colors">
                  <RadioGroupItem value="new" id="mode-new" />
                  <div className="flex-1">
                    <Label htmlFor="mode-new" className="cursor-pointer">
                      <div className="flex items-center gap-2 mb-1">
                        <UserPlus className="h-4 w-4" />
                        <span className="font-semibold">Usuario Nuevo</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Es su primera vez en el estudio o aún no ha comprado membresía.
                        Solo se creará su cuenta para luego venderle un plan.
                      </p>
                    </Label>
                  </div>
                </div>

                {/* Opción: Cliente Existente (Inscripción Manual) */}
                <div className="flex items-start space-x-3 rounded-lg border p-4 cursor-pointer hover:bg-accent transition-colors">
                  <RadioGroupItem value="existing" id="mode-existing" />
                  <div className="flex-1">
                    <Label htmlFor="mode-existing" className="cursor-pointer">
                      <div className="flex items-center gap-2 mb-1">
                        <UserCheck className="h-4 w-4" />
                        <span className="font-semibold">Usuario Existente (Inscripción Manual)</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Ya pagó una membresía en efectivo, transferencia o antes del sistema.
                        Se creará su cuenta y se le asignará la membresía inmediatamente.
                        <strong className="block mt-1">⚠️ NO generará orden de venta ni afectará reportes financieros.</strong>
                      </p>
                    </Label>
                  </div>
                </div>
              </RadioGroup>
            </CardContent>
          </Card>

          {/* Formulario según el modo seleccionado */}
          {clientMode === 'new' && (
            <NewClientForm
              onSubmit={handleNewClientSubmit}
              isLoading={createMutation.isPending}
              onCancel={() => navigate('/admin/members')}
            />
          )}

          {clientMode === 'existing' && (
            <ManualClientForm
              onSuccess={handleManualEnrollmentSuccess}
              onCancel={() => navigate('/admin/members')}
            />
          )}
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}
