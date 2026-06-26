import { AuthGuard } from '@/components/layout/AuthGuard';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { WaitlistPanel } from '@/components/bookings/WaitlistPanel';

export default function Waitlist() {
  return (
    <AuthGuard requiredRoles={['admin']}>
      <AdminLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-heading font-bold">Lista de espera</h1>
            <p className="text-muted-foreground">Filas por clase: promueve, quita o reordena usuarios.</p>
          </div>
          <WaitlistPanel />
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}
