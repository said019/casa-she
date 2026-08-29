import { AuthGuard } from '@/components/layout/AuthGuard';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { PendingMembershipsPanel } from '@/components/memberships/PendingMembershipsPanel';

export default function PendingMemberships() {
  return (
    <AuthGuard requiredRoles={['admin', 'super_admin', 'reception']}>
      <AdminLayout>
        <PendingMembershipsPanel />
      </AdminLayout>
    </AuthGuard>
  );
}
