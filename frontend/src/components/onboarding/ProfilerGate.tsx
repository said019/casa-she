import { useAuthStore } from '@/stores/authStore';
import { ProfilerWizard } from '@/components/onboarding/ProfilerWizard';

/**
 * Gate obligatorio del perfilador para clientas nuevas.
 * Se muestra desde AuthGuard cuando role==='client' && onboarding_required && !onboarding_completed_at.
 * Al terminar el wizard, checkAuth() refresca al usuario (onboarding_completed_at deja de ser null)
 * y AuthGuard desmonta este gate automáticamente.
 */
export function ProfilerGate() {
  const { checkAuth } = useAuthStore();
  return (
    <div className="flex min-h-screen items-center justify-center bg-bmb-cream px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-bmb-ink/10 bg-white p-7 shadow-xl">
        <ProfilerWizard onDone={() => { void checkAuth(); }} />
      </div>
    </div>
  );
}
