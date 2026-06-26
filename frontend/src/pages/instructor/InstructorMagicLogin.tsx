import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

export default function InstructorMagicLogin() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token) {
      setStatus('error');
      setErrorMessage('Token no encontrado en la URL');
      return;
    }

    verifyMagicLink(token);
  }, [searchParams]);

  const verifyMagicLink = async (token: string) => {
    try {
      const response = await api.post('/auth/instructor/verify-magic-link', { token });
      
      // Save auth data
      setAuth(response.data.user, response.data.token);
      
      setStatus('success');
      
      // Redirect to coach portal after 1.5 seconds
      setTimeout(() => {
        navigate('/coach');
      }, 1500);
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(
        err.response?.data?.message || 
        'El enlace es inválido o ha expirado'
      );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F5F3EE] via-white to-[#E8E5DD] flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-3">
          {status === 'loading' && (
            <>
              <div className="mx-auto w-16 h-16 bg-info/10 rounded-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-info animate-spin" />
              </div>
              <CardTitle className="text-2xl">Verificando acceso...</CardTitle>
              <CardDescription>
                Estamos validando tu enlace mágico
              </CardDescription>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="mx-auto w-16 h-16 bg-success/10 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-success" />
              </div>
              <CardTitle className="text-2xl">¡Acceso concedido! ✨</CardTitle>
              <CardDescription>
                Redirigiendo a tu portal de instructor...
              </CardDescription>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <XCircle className="w-8 h-8 text-red-600" />
              </div>
              <CardTitle className="text-2xl">Enlace inválido</CardTitle>
              <CardDescription>
                No pudimos verificar tu acceso
              </CardDescription>
            </>
          )}
        </CardHeader>

        <CardContent>
          {status === 'error' && (
            <div className="space-y-4">
              <Alert variant="destructive">
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>

              <div className="pt-2 space-y-3">
                <p className="text-sm text-muted-foreground text-center">
                  Los enlaces mágicos expiran después de 1 hora por seguridad.
                </p>
                <Button
                  className="w-full bg-[#8C8475] hover:bg-[#73695e]"
                  onClick={() => navigate('/instructor/access')}
                >
                  Solicitar nuevo enlace
                </Button>
              </div>
            </div>
          )}

          {status === 'loading' && (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">
                Esto solo tomará un momento...
              </p>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center py-4">
              <div className="inline-block">
                <Loader2 className="w-6 h-6 text-[#8C8475] animate-spin" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
