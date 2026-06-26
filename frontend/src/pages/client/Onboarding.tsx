import { useNavigate } from 'react-router-dom';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { useAuthStore } from '@/stores/authStore';
import { ProfilerWizard } from '@/components/onboarding/ProfilerWizard';

export default function Onboarding() {
  const navigate = useNavigate();
  const { checkAuth } = useAuthStore();
  return (
    <AuthGuard requiredRoles={['client']}>
      <ClientLayout>
        <div className="py-6">
          <ProfilerWizard onDone={() => { void checkAuth(); navigate('/app'); }} />
        </div>
      </ClientLayout>
    </AuthGuard>
  );
}
