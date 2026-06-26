import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { dismissOnboardingInvite } from '@/lib/onboarding';
import { X } from 'lucide-react';

/**
 * Invitación (no bloqueante) a clientas existentes para completar su perfil.
 * Visible cuando: role client, onboarding_required=false, sin completar y sin descartar.
 */
export function ProfilerInviteBanner() {
  const { user, checkAuth } = useAuthStore();
  const navigate = useNavigate();
  const [hidden, setHidden] = useState(false);

  const show = user?.role === 'client'
    && user?.onboarding_required === false
    && !user?.onboarding_completed_at
    && !user?.onboarding_invite_dismissed_at;

  if (!show || hidden) return null;

  const dismiss = async () => {
    setHidden(true);
    try { await dismissOnboardingInvite(); await checkAuth(); } catch { /* noop */ }
  };

  return (
    <div className="relative mb-4 rounded-2xl border border-bmb-ink/10 bg-bmb-cream p-4">
      <button onClick={dismiss} className="absolute right-3 top-3 text-bmb-ink/40 hover:text-bmb-ink"><X className="h-4 w-4" /></button>
      <p className="font-heading text-lg text-bmb-ink">Descubre lo que tu cuerpo necesita</p>
      <p className="mt-0.5 text-sm text-bmb-ink/60">Responde 6 preguntas y te recomendamos tus disciplinas y tu paquete ideal.</p>
      <Button onClick={() => navigate('/app/onboarding')} className="mt-3">Hacer mi perfil</Button>
    </div>
  );
}
