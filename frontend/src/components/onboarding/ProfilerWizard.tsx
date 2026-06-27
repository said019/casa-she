import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, ChevronRight, ArrowLeft, Check, Sparkles } from 'lucide-react';
import { getErrorMessage } from '@/lib/api';
import {
  submitOnboarding, type OnboardingAnswers, type Recommendation,
  type Goal, type Level, type BodyFocus, type Intensity, type Frequency, type HealthFlag,
} from '@/lib/onboarding';

/* Paleta de marca Casa Shé (manual) */
const GREEN = '#2A4E36';   // Verde Casa
const DEEP = '#16261A';    // verde profundo
const CREAM = '#F6F0E4';   // Avena
const INK = '#2E1B22';     // Ciruela (texto)
const ARENA = '#D6D5C2';   // bordes
const ARCILLA = '#AE4836'; // acento cálido

const EASE = [0.23, 1, 0.32, 1] as const; // ease-out fuerte (Emil)

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

const EYEBROWS: Record<Step, string> = {
  goal: 'Tu cuerpo', level: 'Tu ritmo', body: 'Tu enfoque', intensity: 'Tu energía',
  frequency: 'Tu constancia', health: 'Tu cuidado', result: 'Tu plan',
};
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
  const reduce = useReducedMotion();
  const [step, setStep] = useState<Step>('goal');
  const [dir, setDir] = useState<1 | -1>(1);
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
  const progress = step === 'result' ? 1 : (idx + 1) / STEPS.length;

  const toggleBody = (v: BodyFocus) =>
    setBody((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : (prev.length >= 2 ? prev : [...prev, v]));
  const toggleHealth = (v: HealthFlag) =>
    setHealth((prev) => {
      if (v === 'ninguna') return prev.includes('ninguna') ? [] : ['ninguna'];
      const next = prev.filter((x) => x !== 'ninguna');
      return next.includes(v) ? next.filter((x) => x !== v) : [...next, v];
    });

  const canNext = (): boolean => {
    if (step === 'goal') return !!goal;
    if (step === 'level') return !!level;
    if (step === 'body') return body.length >= 1;
    if (step === 'intensity') return !!intensity;
    if (step === 'frequency') return !!frequency;
    if (step === 'health') return health.length >= 1;
    return true;
  };

  const goBack = () => { if (idx > 0) { setDir(-1); setStep(STEPS[idx - 1]); } };

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
      setDir(1);
      setStep('result');
    } catch (err) {
      toast({ variant: 'destructive', title: 'No se pudo guardar', description: getErrorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const next = () => {
    if (step === 'health') { submit(); return; }
    setDir(1);
    setStep(STEPS[idx + 1]);
  };

  const slide = {
    initial: (d: number) => ({ opacity: 0, x: reduce ? 0 : d * 28 }),
    animate: { opacity: 1, x: 0, transition: { duration: 0.4, ease: EASE } },
    exit: (d: number) => ({ opacity: 0, x: reduce ? 0 : d * -28, transition: { duration: 0.2, ease: EASE } }),
  };

  /* Opción seleccionable — feedback al press + estado seleccionado de marca */
  const Option = ({ active, onClick, children, i }: { active: boolean; onClick: () => void; children: React.ReactNode; i: number }) => (
    <motion.button
      type="button" onClick={onClick} aria-pressed={active}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: EASE, delay: reduce ? 0 : i * 0.045 }}
      whileTap={{ scale: 0.985 }}
      className="group flex w-full items-center justify-between gap-3 rounded-2xl border px-5 py-4 text-left text-[15px] transition-[background-color,border-color,color] duration-200"
      style={{
        backgroundColor: active ? GREEN : '#FFFFFF',
        borderColor: active ? GREEN : 'rgba(46,27,34,0.12)',
        color: active ? CREAM : INK,
      }}
    >
      <span className="leading-snug">{children}</span>
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-200"
        style={{ borderColor: active ? CREAM : 'rgba(46,27,34,0.2)', backgroundColor: active ? CREAM : 'transparent' }}
      >
        {active && <Check className="h-3.5 w-3.5" style={{ color: GREEN }} strokeWidth={3} />}
      </span>
    </motion.button>
  );

  /* ── Pantalla de resultado ── */
  if (step === 'result' && rec) {
    const reveal = (i: number) => ({
      initial: reduce ? false : { opacity: 0, y: 14 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.45, ease: EASE, delay: reduce ? 0 : 0.06 + i * 0.08 },
    });
    return (
      <div className="mx-auto w-full max-w-md">
        <motion.div {...reveal(0)} className="mb-6 flex items-center gap-2">
          <Sparkles className="h-4 w-4" style={{ color: ARCILLA }} />
          <span className="font-body text-[11px] uppercase tracking-[0.3em]" style={{ color: GREEN, opacity: 0.7 }}>{EYEBROWS.result}</span>
        </motion.div>
        <motion.h1 {...reveal(1)} className="font-heading text-4xl leading-[1.02]" style={{ color: INK }}>{TITLES.result}</motion.h1>
        <motion.p {...reveal(2)} className="mt-2 font-body text-sm" style={{ color: INK, opacity: 0.6 }}>Tu plan, hecho a tu medida.</motion.p>

        <div className="mt-6 space-y-3">
          {rec.disciplines.map((d, i) => (
            <motion.div key={d.name} {...reveal(3 + i)} className="rounded-2xl border bg-white p-4" style={{ borderColor: 'rgba(46,27,34,0.10)' }}>
              <p className="font-heading text-lg" style={{ color: GREEN }}>{d.name}</p>
              <p className="mt-0.5 font-body text-sm" style={{ color: INK, opacity: 0.62 }}>{d.reason}</p>
            </motion.div>
          ))}
          {rec.experience && (
            <motion.div {...reveal(3 + rec.disciplines.length)} className="rounded-2xl border border-dashed p-4" style={{ borderColor: 'rgba(174,72,54,0.4)', backgroundColor: 'rgba(174,72,54,0.05)' }}>
              <p className="font-body text-sm" style={{ color: INK, opacity: 0.78 }}>Para atreverte: <strong style={{ color: ARCILLA }}>{rec.experience.name}</strong></p>
            </motion.div>
          )}
        </div>

        <motion.div {...reveal(4 + rec.disciplines.length)} className="mt-5 rounded-2xl p-5" style={{ backgroundColor: GREEN, color: CREAM }}>
          <p className="font-body text-[11px] uppercase tracking-[0.24em]" style={{ opacity: 0.7 }}>Tu paquete sugerido</p>
          <p className="mt-1 font-heading text-2xl">{rec.plan.name}{rec.plan.price ? ` · $${rec.plan.price}` : ''}</p>
        </motion.div>

        {rec.requires_clearance && (
          <motion.p {...reveal(5 + rec.disciplines.length)} className="mt-3 rounded-xl p-3 font-body text-xs" style={{ backgroundColor: 'rgba(174,72,54,0.10)', color: ARCILLA }}>
            Para tu seguridad, una instructora confirmará tu aptitud antes de tu primera clase.
          </motion.p>
        )}

        <motion.div {...reveal(6 + rec.disciplines.length)} className="mt-6 flex flex-col gap-2.5">
          <button onClick={() => { onDone(); navigate(rec.plan.plan_id ? `/app/checkout?plan=${rec.plan.plan_id}` : '/app/checkout'); }}
            className="w-full rounded-full py-3.5 font-body text-[13px] uppercase tracking-[0.16em] transition-transform active:scale-[0.985]"
            style={{ backgroundColor: GREEN, color: CREAM }}>Ver mi paquete</button>
          <button onClick={() => { onDone(); navigate('/app'); }}
            className="w-full rounded-full py-3 font-body text-sm transition-colors hover:bg-black/[0.03]" style={{ color: INK, opacity: 0.7 }}>
            Entrar a Casa Shé
          </button>
        </motion.div>
      </div>
    );
  }

  /* ── Cuestionario ── */
  return (
    <div className="mx-auto w-full max-w-md">
      {/* Barra de progreso */}
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-3">
          {idx > 0 ? (
            <motion.button type="button" onClick={goBack} whileTap={{ scale: 0.92 }}
              className="-ml-1 rounded-full p-1.5 transition-colors hover:bg-black/[0.04]" style={{ color: INK }} aria-label="Atrás">
              <ArrowLeft className="h-[18px] w-[18px]" />
            </motion.button>
          ) : <span className="h-7 w-7" />}
          <span className="font-body text-[11px] uppercase tracking-[0.26em]" style={{ color: INK, opacity: 0.45 }}>
            Paso {idx + 1} de {STEPS.length}
          </span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'rgba(46,27,34,0.08)' }}>
          <motion.div className="h-full rounded-full" style={{ backgroundColor: GREEN }}
            animate={{ width: `${progress * 100}%` }} transition={{ duration: 0.5, ease: EASE }} />
        </div>
      </div>

      <AnimatePresence mode="wait" custom={dir}>
        <motion.div key={step} custom={dir} variants={slide} initial="initial" animate="animate" exit="exit">
          <p className="font-body text-[11px] uppercase tracking-[0.3em]" style={{ color: GREEN, opacity: 0.65 }}>{EYEBROWS[step]}</p>
          <h1 className="mt-2 font-heading text-[1.7rem] leading-[1.08] sm:text-3xl" style={{ color: INK }}>{TITLES[step]}</h1>

          <div className="mt-6 space-y-2.5">
            {step === 'goal' && GOALS.map((o, i) => <Option key={o.v} i={i} active={goal === o.v} onClick={() => setGoal(o.v)}>{o.label}</Option>)}
            {step === 'level' && LEVELS.map((o, i) => <Option key={o.v} i={i} active={level === o.v} onClick={() => setLevel(o.v)}>{o.label}</Option>)}
            {step === 'body' && (<>
              <p className="font-body text-xs" style={{ color: INK, opacity: 0.5 }}>Elige hasta 2.</p>
              {BODY.map((o, i) => <Option key={o.v} i={i} active={body.includes(o.v)} onClick={() => toggleBody(o.v)}>{o.label}</Option>)}
            </>)}
            {step === 'intensity' && INTENSITY.map((o, i) => <Option key={o.v} i={i} active={intensity === o.v} onClick={() => setIntensity(o.v)}>{o.label}</Option>)}
            {step === 'frequency' && FREQ.map((o, i) => <Option key={o.v} i={i} active={frequency === o.v} onClick={() => setFrequency(o.v)}>{o.label}</Option>)}
            {step === 'health' && (<>
              {HEALTH.map((o, i) => <Option key={o.v} i={i} active={health.includes(o.v)} onClick={() => toggleHealth(o.v)}>{o.label}</Option>)}
              <textarea value={healthNote} onChange={(e) => setHealthNote(e.target.value)} placeholder="¿Algo más que debamos saber? (opcional)" maxLength={500}
                className="mt-1 w-full rounded-2xl border px-5 py-3.5 font-body text-sm outline-none transition-colors focus:border-[#2A4E36]/50"
                style={{ borderColor: 'rgba(46,27,34,0.12)', color: INK }} rows={2} />
            </>)}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* CTA — Verde Casa + Avena, alto contraste, feedback al press */}
      <motion.button
        type="button" onClick={next} disabled={!canNext() || submitting}
        whileTap={canNext() && !submitting ? { scale: 0.985 } : undefined}
        className="mt-7 flex w-full items-center justify-center gap-1.5 rounded-full py-4 font-body text-[13px] uppercase tracking-[0.18em] transition-[opacity,background-color] duration-200 disabled:cursor-not-allowed"
        style={{ backgroundColor: canNext() ? GREEN : ARENA, color: canNext() ? CREAM : 'rgba(46,27,34,0.4)' }}
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : (<>{step === 'health' ? 'Ver mi recomendación' : 'Continuar'}<ChevronRight className="h-4 w-4" /></>)}
      </motion.button>
    </div>
  );
}
