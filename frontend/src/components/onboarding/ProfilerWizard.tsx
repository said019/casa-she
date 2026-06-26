import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, ChevronRight, ArrowLeft } from 'lucide-react';
import { getErrorMessage } from '@/lib/api';
import {
  submitOnboarding, type OnboardingAnswers, type Recommendation,
  type Goal, type Level, type BodyFocus, type Intensity, type Frequency, type HealthFlag,
} from '@/lib/onboarding';

type Step = 'goal' | 'level' | 'body' | 'intensity' | 'frequency' | 'health' | 'result';
const STEPS: Step[] = ['goal', 'level', 'body', 'intensity', 'frequency', 'health'];

const GOALS: { v: Goal; label: string }[] = [
  { v: 'tonificar', label: 'Tonificar y ganar fuerza' },
  { v: 'estres', label: 'Bajar el estrés y relajarme' },
  { v: 'flexibilidad', label: 'Ganar flexibilidad y movilidad' },
  { v: 'postura', label: 'Mejorar postura / cuidar mi espalda' },
  { v: 'probar', label: 'Probar algo nuevo y divertirme' },
  { v: 'bienestar', label: 'Reconectar conmigo / bienestar integral' },
];
const LEVELS: { v: Level; label: string }[] = [
  { v: 'principiante', label: 'Voy empezando' },
  { v: 'intermedio', label: 'Me muevo de vez en cuando' },
  { v: 'avanzada', label: 'Soy activa y quiero reto' },
];
const BODY: { v: BodyFocus; label: string }[] = [
  { v: 'core', label: 'Core / abdomen' },
  { v: 'espalda', label: 'Espalda y postura' },
  { v: 'brazos', label: 'Brazos y tren superior' },
  { v: 'piernas', label: 'Piernas y glúteos' },
  { v: 'mente', label: 'Mente / respiración' },
  { v: 'todo', label: 'Todo por igual' },
];
const INTENSITY: { v: Intensity; label: string }[] = [
  { v: 'suave', label: 'Suave y calmado' },
  { v: 'equilibrado', label: 'Equilibrado' },
  { v: 'retador', label: 'Retador e intenso' },
];
const FREQ: { v: Frequency; label: string }[] = [
  { v: 'probar', label: 'Solo quiero probar' },
  { v: '1x', label: '1 vez por semana' },
  { v: '2x', label: '2 veces por semana' },
  { v: '3x', label: '3 veces por semana' },
  { v: '4x', label: '4 o más / casi diario' },
];
const HEALTH: { v: HealthFlag; label: string }[] = [
  { v: 'embarazo', label: 'Embarazo / posparto' },
  { v: 'lesion', label: 'Lesión o molestia' },
  { v: 'condicion', label: 'Condición médica' },
  { v: 'ninguna', label: 'Nada por ahora' },
];

const TITLES: Record<Step, string> = {
  goal: '¿Qué buscas en tu cuerpo ahora mismo?',
  level: '¿Cómo te describes moviéndote?',
  body: '¿Qué parte de ti quieres trabajar más?',
  intensity: '¿Qué tan intenso lo quieres?',
  frequency: '¿Cuántas veces a la semana te imaginas viniendo?',
  health: 'Para cuidarte mejor, ¿algo que debamos saber?',
  result: 'Esto es lo que tu cuerpo necesita',
};

export function ProfilerWizard({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('goal');
  const [goal, setGoal] = useState<Goal | null>(null);
  const [level, setLevel] = useState<Level | null>(null);
  const [body, setBody] = useState<BodyFocus[]>([]);
  const [intensity, setIntensity] = useState<Intensity | null>(null);
  const [frequency, setFrequency] = useState<Frequency | null>(null);
  const [health, setHealth] = useState<HealthFlag[]>([]);
  const [healthNote, setHealthNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [rec, setRec] = useState<Recommendation | null>(null);

  const idx = STEPS.indexOf(step as Exclude<Step, 'result'>);

  const toggleBody = (v: BodyFocus) => {
    setBody((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : (prev.length >= 2 ? prev : [...prev, v]));
  };
  const toggleHealth = (v: HealthFlag) => {
    setHealth((prev) => {
      if (v === 'ninguna') return prev.includes('ninguna') ? [] : ['ninguna'];
      const next = prev.filter((x) => x !== 'ninguna');
      return next.includes(v) ? next.filter((x) => x !== v) : [...next, v];
    });
  };

  const canNext = (): boolean => {
    if (step === 'goal') return !!goal;
    if (step === 'level') return !!level;
    if (step === 'body') return body.length >= 1;
    if (step === 'intensity') return !!intensity;
    if (step === 'frequency') return !!frequency;
    if (step === 'health') return health.length >= 1;
    return true;
  };

  const goBack = () => {
    if (idx > 0) setStep(STEPS[idx - 1]);
  };

  const submit = async () => {
    if (!goal || !level || !intensity || !frequency) return;
    setSubmitting(true);
    try {
      const answers: OnboardingAnswers = {
        goal, level, body_focus: body, intensity, frequency, health,
        health_note: healthNote.trim() || undefined,
      };
      const result = await submitOnboarding(answers);
      setRec(result);
      setStep('result');
    } catch (err) {
      toast({ variant: 'destructive', title: 'No se pudo guardar', description: getErrorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const next = () => {
    if (step === 'health') { submit(); return; }
    setStep(STEPS[idx + 1]);
  };

  const Option = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition ${active ? 'border-bmb-ink bg-bmb-ink text-white' : 'border-bmb-ink/15 bg-white hover:border-bmb-ink/40'}`}>
      {children}
    </button>
  );

  if (step === 'result' && rec) {
    return (
      <div className="mx-auto w-full max-w-md">
        <h1 className="font-heading text-2xl text-bmb-ink">{TITLES.result}</h1>
        <p className="mt-1 text-sm text-bmb-ink/60">Tu plan, hecho a tu medida.</p>
        <div className="mt-5 space-y-3">
          {rec.disciplines.map((d) => (
            <div key={d.name} className="rounded-xl border border-bmb-ink/10 bg-white p-4">
              <p className="font-medium text-bmb-ink">{d.name}</p>
              <p className="text-sm text-bmb-ink/60">{d.reason}</p>
            </div>
          ))}
          {rec.experience && (
            <div className="rounded-xl border border-dashed border-bmb-ink/20 bg-white p-4">
              <p className="text-sm text-bmb-ink/70">Para atreverte: <strong>{rec.experience.name}</strong></p>
            </div>
          )}
        </div>
        <div className="mt-5 rounded-xl border border-bmb-ink/10 bg-bmb-cream p-4">
          <p className="text-sm text-bmb-ink/70">Tu paquete sugerido</p>
          <p className="font-heading text-xl text-bmb-ink">{rec.plan.name}{rec.plan.price ? ` · $${rec.plan.price}` : ''}</p>
        </div>
        {rec.requires_clearance && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            Para tu seguridad, una instructora confirmará tu aptitud antes de tu primera clase.
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2">
          <Button onClick={() => { onDone(); navigate(rec.plan.plan_id ? `/app/checkout?plan=${rec.plan.plan_id}` : '/app/checkout'); }} className="w-full">Ver mi paquete</Button>
          <Button variant="ghost" onClick={() => { onDone(); navigate('/app'); }} className="w-full">Entrar a Casa Shé</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-4 flex items-center gap-3">
        {idx > 0 && (
          <button type="button" onClick={goBack} className="rounded-full p-1.5 text-bmb-ink/60 hover:bg-bmb-ink/5"><ArrowLeft className="h-5 w-5" /></button>
        )}
        <span className="text-xs text-bmb-ink/50">Paso {idx + 1} de {STEPS.length}</span>
      </div>
      <h1 className="font-heading text-2xl text-bmb-ink">{TITLES[step]}</h1>

      <div className="mt-5 space-y-2.5">
        {step === 'goal' && GOALS.map((o) => <Option key={o.v} active={goal === o.v} onClick={() => setGoal(o.v)}>{o.label}</Option>)}
        {step === 'level' && LEVELS.map((o) => <Option key={o.v} active={level === o.v} onClick={() => setLevel(o.v)}>{o.label}</Option>)}
        {step === 'body' && (<>
          <p className="text-xs text-bmb-ink/50">Elige hasta 2.</p>
          {BODY.map((o) => <Option key={o.v} active={body.includes(o.v)} onClick={() => toggleBody(o.v)}>{o.label}</Option>)}
        </>)}
        {step === 'intensity' && INTENSITY.map((o) => <Option key={o.v} active={intensity === o.v} onClick={() => setIntensity(o.v)}>{o.label}</Option>)}
        {step === 'frequency' && FREQ.map((o) => <Option key={o.v} active={frequency === o.v} onClick={() => setFrequency(o.v)}>{o.label}</Option>)}
        {step === 'health' && (<>
          {HEALTH.map((o) => <Option key={o.v} active={health.includes(o.v)} onClick={() => toggleHealth(o.v)}>{o.label}</Option>)}
          <textarea value={healthNote} onChange={(e) => setHealthNote(e.target.value)} placeholder="¿Algo más que debamos saber? (opcional)" maxLength={500}
            className="mt-2 w-full rounded-xl border border-bmb-ink/15 px-4 py-3 text-sm" rows={2} />
        </>)}
      </div>

      <Button onClick={next} disabled={!canNext() || submitting} className="mt-6 w-full">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : (<>{step === 'health' ? 'Ver mi recomendación' : 'Continuar'}<ChevronRight className="ml-1 h-4 w-4" /></>)}
      </Button>
    </div>
  );
}
