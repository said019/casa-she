import api from '@/lib/api';

export type Goal = 'tonificar' | 'estres' | 'flexibilidad' | 'postura' | 'probar' | 'bienestar';
export type Level = 'principiante' | 'intermedio' | 'avanzada';
export type BodyFocus = 'core' | 'espalda' | 'brazos' | 'piernas' | 'mente' | 'todo';
export type Intensity = 'suave' | 'equilibrado' | 'retador';
export type Frequency = 'probar' | '1x' | '2x' | '3x' | '4x';
export type HealthFlag = 'embarazo' | 'lesion' | 'condicion' | 'ninguna';

export interface OnboardingAnswers {
  goal: Goal;
  level: Level;
  body_focus: BodyFocus[];
  intensity: Intensity;
  frequency: Frequency;
  health: HealthFlag[];
  health_note?: string;
}

export interface Recommendation {
  disciplines: { class_type_id: string | null; name: string; score: number; reason: string }[];
  experience: { class_type_id: string | null; name: string } | null;
  plan: { plan_id: string | null; name: string; price: number | null };
  requires_clearance: boolean;
  health_flags: { embarazo: boolean; lesion: boolean; condicion: boolean; note: string | null };
}

export async function submitOnboarding(answers: OnboardingAnswers): Promise<Recommendation> {
  const res = await api.post('/onboarding/submit', answers);
  return res.data.recommendation as Recommendation;
}

export async function getMyOnboarding() {
  const res = await api.get('/onboarding/me');
  return res.data.profile as { recommended_disciplines: Recommendation['disciplines'] } | null;
}

export async function dismissOnboardingInvite(): Promise<void> {
  await api.post('/onboarding/dismiss-invite');
}
