/**
 * ✅ COMPONENTE: Confirmación de Inscripción Manual Exitosa
 * 
 * Muestra los detalles del cliente inscrito manualmente y las credenciales generadas
 */

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Mail, MessageSquare, Copy, ArrowRight, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';

interface MigrationConfirmationProps {
  clientData: {
    name: string;
    email?: string;
    phone: string;
    packageName: string;
    startDate: Date;
    endDate: Date;
    tempPassword: string;
    emailSent?: boolean;
    whatsappSent?: boolean;
  };
  onViewProfile?: () => void;
  onRegisterAnother?: () => void;
}

export const MigrationConfirmation = ({
  clientData,
  onViewProfile,
  onRegisterAnother,
}: MigrationConfirmationProps) => {
  const [copied, setCopied] = useState(false);

  const daysRemaining = differenceInDays(clientData.endDate, new Date());

  const copyPassword = () => {
    navigator.clipboard.writeText(clientData.tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Encabezado de éxito */}
      <div className="text-center space-y-3">
        <div className="flex justify-center">
          <div className="rounded-full bg-success/10 p-3">
            <CheckCircle2 className="h-12 w-12 text-success" />
          </div>
        </div>
        <h2 className="text-3xl font-bold">Usuario Registrado</h2>
        <p className="text-muted-foreground">
          El usuario ha sido migrado exitosamente al sistema
        </p>
      </div>

      {/* Información del cliente */}
      <Card>
        <CardHeader>
          <CardTitle>Información del Usuario</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-2xl font-bold">{clientData.name}</p>
          </div>
          
          {clientData.email && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-4 w-4" />
              <p>{clientData.email}</p>
            </div>
          )}
          
          <div className="flex items-center gap-2 text-muted-foreground">
            <MessageSquare className="h-4 w-4" />
            <p>{clientData.phone}</p>
          </div>
        </CardContent>
      </Card>

      {/* Membresía activa */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Membresía Activa
            <Badge variant="secondary" className="bg-success/10 text-success">
              Activa
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-lg font-semibold">{clientData.packageName}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Fecha de inicio</p>
              <p className="font-medium">
                {format(clientData.startDate, "d 'de' MMMM 'de' yyyy", { locale: es })}
              </p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Fecha de vencimiento</p>
              <p className="font-medium">
                {format(clientData.endDate, "d 'de' MMMM 'de' yyyy", { locale: es })}
              </p>
            </div>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">Días restantes</p>
            <p className="text-2xl font-bold text-primary">{daysRemaining} días</p>
          </div>

          <div className="pt-3 border-t">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-info/10 text-info border-info/30">
                🔄 Inscripción manual
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Credenciales enviadas */}
      <Card>
        <CardHeader>
          <CardTitle>Credenciales de Acceso</CardTitle>
          <CardDescription>
            El usuario puede usar estas credenciales para acceder a la plataforma
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertDescription className="space-y-2">
              {clientData.email && (
                <div className="flex items-center gap-2">
                  {clientData.emailSent ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      <span className="font-medium">Email de bienvenida enviado</span>
                    </>
                  ) : (
                    <>
                      <Mail className="h-4 w-4 text-destructive" />
                      <span className="font-medium text-destructive">No se pudo enviar el email — verifica RESEND_API_KEY o entrega manual la contraseña</span>
                    </>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2">
                {clientData.whatsappSent ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span className="font-medium">WhatsApp con contraseña temporal</span>
                  </>
                ) : (
                  <>
                    <MessageSquare className="h-4 w-4 text-destructive" />
                    <span className="font-medium text-destructive">No se pudo enviar el WhatsApp — verifica integración o entrega manual la contraseña</span>
                  </>
                )}
              </div>
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label>Contraseña temporal</Label>
            <div className="flex gap-2">
              <div className="flex-1 p-3 bg-muted rounded-md font-mono text-lg">
                {clientData.tempPassword}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={copyPassword}
                className="shrink-0"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            {copied && (
              <p className="text-xs text-success">✓ Contraseña copiada</p>
            )}
          </div>

          <Alert>
            <AlertDescription className="text-sm">
              ⚠️ El usuario deberá cambiar esta contraseña en su primer acceso al sistema
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Botones de acción */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onRegisterAnother}
        >
          <UserPlus className="mr-2 h-4 w-4" />
          Registrar otro usuario
        </Button>
        <Button
          className="flex-1"
          onClick={onViewProfile}
        >
          Ver perfil del usuario
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm font-medium mb-1">{children}</p>
);
