import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mail, ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import api from '@/lib/api';

export default function InstructorAccess() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await api.post('/auth/instructor/request-access', { email });
      
      if (response.data.success) {
        setSuccess(true);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al solicitar acceso');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#F5F3EE] via-white to-[#E8E5DD] flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-3">
            <div className="mx-auto w-16 h-16 bg-success/10 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-success" />
            </div>
            <CardTitle className="text-2xl">¡Revisa tu correo! 📧</CardTitle>
            <CardDescription className="text-base">
              Te hemos enviado un enlace mágico a <strong>{email}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="bg-info/10 border-info/30">
              <AlertDescription className="text-sm text-info">
                <strong>Pasos siguientes:</strong>
                <ol className="list-decimal list-inside mt-2 space-y-1">
                  <li>Abre tu correo electrónico</li>
                  <li>Busca el email de Casa Shé</li>
                  <li>Haz clic en el botón de acceso</li>
                  <li>Serás redirigido automáticamente</li>
                </ol>
              </AlertDescription>
            </Alert>

            <div className="pt-4 space-y-3">
              <p className="text-sm text-muted-foreground text-center">
                El enlace expira en <strong>1 hora</strong>
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setSuccess(false);
                  setEmail('');
                }}
              >
                Solicitar otro enlace
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F5F3EE] via-white to-[#E8E5DD] flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 bg-[#8C8475] rounded-full flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-2xl font-heading">Portal de Instructores</CardTitle>
          <CardDescription className="text-base">
            Ingresa tu correo para recibir acceso a tu plataforma
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Correo electrónico
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="tu-email@ejemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="pl-10"
                  disabled={isLoading}
                />
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              className="w-full bg-[#8C8475] hover:bg-[#73695e]"
              disabled={isLoading}
            >
              {isLoading ? (
                'Enviando...'
              ) : (
                <>
                  Solicitar acceso
                  <ArrowRight className="ml-2 w-4 h-4" />
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t">
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                <strong>¿Cómo funciona?</strong>
              </p>
              <ol className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <span className="font-semibold text-[#8C8475] mt-0.5">1.</span>
                  <span>Ingresa el correo que te registramos como instructor</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-semibold text-[#8C8475] mt-0.5">2.</span>
                  <span>Recibirás un enlace mágico en tu correo</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-semibold text-[#8C8475] mt-0.5">3.</span>
                  <span>Haz clic y accede automáticamente sin contraseña</span>
                </li>
              </ol>
            </div>
          </div>

          <div className="mt-6 text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/')}
              className="text-muted-foreground"
            >
              Volver al inicio
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
