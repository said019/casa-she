/**
 * 📄 PÁGINA: Asignar Membresía a Usuario Existente
 * 
 * Permite asignar una membresía manual a un usuario que ya está registrado.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AssignMembershipForm } from '@/components/admin/members/AssignMembershipForm';
import { ArrowLeft, CheckCircle2, UserCheck } from 'lucide-react';
import api from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

interface User {
  id: string;
  display_name: string;
  email: string;
  phone: string;
}

export default function AssignMembership() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [resultData, setResultData] = useState<any>(null);

  useEffect(() => {
    const loadUser = async () => {
      if (!userId) {
        navigate('/admin/members');
        return;
      }

      try {
        const response = await api.get(`/users/${userId}`);
        setUser(response.data.user ?? response.data);
      } catch (error) {
        console.error('Error loading user:', error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'No se pudo cargar la información del usuario',
        });
        navigate('/admin/members');
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, [userId, navigate, toast]);

  const handleSuccess = (result: any) => {
    setSuccess(true);
    setResultData(result);
    toast({
      title: '✅ Membresía asignada',
      description: `La membresía se asignó exitosamente a ${user?.display_name}`,
    });
  };

  if (loading) {
    return (
      <AuthGuard requiredRoles={['admin']}>
        <AdminLayout>
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Cargando...</p>
          </div>
        </AdminLayout>
      </AuthGuard>
    );
  }

  if (!user) {
    return null;
  }

  if (success && resultData) {
    return (
      <AuthGuard requiredRoles={['admin']}>
        <AdminLayout>
          <div className="container mx-auto py-6 space-y-6">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" asChild>
                <Link to="/admin/members">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
              </Button>
              <div>
                <h1 className="text-3xl font-heading font-bold">Membresía asignada exitosamente</h1>
              </div>
            </div>

            <Card className="border-success/30 bg-success/10">
              <CardHeader>
                <CardTitle className="text-success flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5" />
                  Asignación Completada
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-success">
                <div>
                  <p className="text-sm">
                    <strong>Usuario:</strong> {resultData.userName}
                  </p>
                  {resultData.userEmail && (
                    <p className="text-sm">
                      <strong>Email:</strong> {resultData.userEmail}
                    </p>
                  )}
                  <p className="text-sm">
                    <strong>Membresía ID:</strong> {resultData.membershipId}
                  </p>
                </div>

                <Alert className="bg-white/70 border-success/30">
                  <UserCheck className="h-4 w-4 text-success" />
                  <AlertDescription className="text-success">
                    <strong>Nota importante:</strong>
                    <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                      <li>La membresía está activa inmediatamente</li>
                      <li>El usuario puede ingresar a clases ahora</li>
                      <li>NO se generó orden de venta</li>
                      <li>Marcado como "inscripción manual"</li>
                    </ul>
                  </AlertDescription>
                </Alert>

                <div className="flex gap-2 pt-4">
                  <Button onClick={() => navigate(`/admin/members/${userId}`)}>
                    Ver perfil del usuario
                  </Button>
                  <Button variant="outline" onClick={() => navigate('/admin/members')}>
                    Volver a miembros
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setSuccess(false);
                      setResultData(null);
                    }}
                  >
                    Asignar a otro usuario
                  </Button>
                </div>
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
        <div className="container mx-auto py-6 space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link to={`/admin/members/${userId}`}>
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-3xl font-heading font-bold">Asignar Membresía Manual</h1>
              <p className="text-muted-foreground">
                Asignar membresía a usuario existente que ya pagó
              </p>
            </div>
          </div>

          <AssignMembershipForm
            userId={user.id}
            userName={user.display_name}
            userEmail={user.email}
            onSuccess={handleSuccess}
            onCancel={() => navigate(`/admin/members/${userId}`)}
          />
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}
