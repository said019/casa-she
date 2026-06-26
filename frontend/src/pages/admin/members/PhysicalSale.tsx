/**
 * 💰 PÁGINA: Venta en Físico
 * 
 * Permite al admin registrar una venta de paquete pagada directamente.
 * Genera orden de venta y asigna el paquete al usuario.
 */

import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PhysicalSaleForm } from '@/components/admin/members/PhysicalSaleForm';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import api from '@/lib/api';

export default function PhysicalSale() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();

  // Obtener datos del usuario
  const { data: user, isLoading } = useQuery({
    queryKey: ['user', userId],
    queryFn: async () => {
      const response = await api.get(`/users/${userId}`);
      return response.data;
    },
    enabled: !!userId,
  });

  const handleSuccess = () => {
    navigate(`/admin/members/${userId}`);
  };

  const handleCancel = () => {
    navigate(`/admin/members/${userId}`);
  };

  if (isLoading) {
    return (
      <AuthGuard requiredRoles={['admin']}>
        <AdminLayout>
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-muted-foreground">Cargando...</p>
            </div>
          </div>
        </AdminLayout>
      </AuthGuard>
    );
  }

  if (!user) {
    return (
      <AuthGuard requiredRoles={['admin']}>
        <AdminLayout>
          <div className="text-center py-12">
            <p className="text-red-500">Usuario no encontrado</p>
            <Button onClick={() => navigate('/admin/members')} className="mt-4">
              Volver a Usuarios
            </Button>
          </div>
        </AdminLayout>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard requiredRoles={['admin']}>
      <AdminLayout>
        <div className="space-y-6">
          {/* Header con botón de regreso */}
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(`/admin/members/${userId}`)}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-heading font-bold">Venta en Físico</h1>
              <p className="text-muted-foreground">
                Registrar venta de paquete para {user.name}
              </p>
            </div>
          </div>

          {/* Formulario */}
          <PhysicalSaleForm
            userId={userId!}
            userName={user.name}
            onSuccess={handleSuccess}
            onCancel={handleCancel}
          />
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}
