import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import StudioLayout from '@/components/layout/StudioLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { CoachSheet } from '@/components/CoachSheet';
import api from '@/lib/api';
import type { Instructor } from '@/types/class';

// ─── REFERENCIA DE DISEÑO ─────────────────────────────────────────────────────
// Spread de revista mexicana 1972 — portrait full-bleed + numeral romano +
// tagline tipo legend manuscrito, palette shift per capítulo. Específicamente:
//
//   · NO editorial-typographic Klim-style (display serif italic + tracked uppercase)
//   · NO 3-col grid de headshots
//   · NO cream-cream-cream-cream-italic
//
//   · SÍ cada coach es un capítulo asimétrico de palette propia
//   · SÍ numeral romano gigante en script
//   · SÍ índice tipo contact sheet arriba para escaneo
//
// ─────────────────────────────────────────────────────────────────────────────

// Paleta de capítulos: 5 escenas que se ciclan. Drenched on purpose — palette ES voz.
const CHAPTER_SCENES = [
    // 0 — cream con tipo dark
    { bg: 'bg-bmb-cream', text: 'text-bmb-dark', numTone: 'text-bmb-gold/55', tag: 'text-bmb-dark/70', accent: 'bg-bmb-gold' },
    // 1 — blush warm
    { bg: 'bg-[#DDE4D5]', text: 'text-bmb-dark', numTone: 'text-bmb-deepgold/65', tag: 'text-bmb-dark/72', accent: 'bg-bmb-deepgold' },
    // 2 — dark brown drenched
    { bg: 'bg-bmb-dark', text: 'text-bmb-cream', numTone: 'text-bmb-gold/70', tag: 'text-bmb-cream/72', accent: 'bg-bmb-gold' },
    // 3 — taupe — calmer
    { bg: 'bg-[#D6D5C2]', text: 'text-bmb-dark', numTone: 'text-[#7E5A36]/55', tag: 'text-bmb-dark/70', accent: 'bg-[#7E5A36]' },
    // 4 — mauve warm (rare, used for accent chapter)
    { bg: 'bg-[#2E4A35]', text: 'text-bmb-cream', numTone: 'text-bmb-cream/45', tag: 'text-bmb-cream/82', accent: 'bg-bmb-cream' },
];

function scene(i: number) { return CHAPTER_SCENES[i % CHAPTER_SCENES.length]; }

// Numerales romanos para los primeros 30 (suficiente para cualquier equipo).
const ROMAN = [
    'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
    'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX',
    'XXI', 'XXII', 'XXIII', 'XXIV', 'XXV', 'XXVI', 'XXVII', 'XXVIII', 'XXIX', 'XXX',
];

function firstName(name: string): string {
    return name.split(' ')[0] || name;
}

function tagline(instructor: Instructor): string {
    // Si admin le puso specialties, primero. Si no, una caption neutral.
    if (instructor.specialties && instructor.specialties.length > 0) {
        return instructor.specialties.slice(0, 2).join(' · ').toLowerCase();
    }
    return 'movimiento · presencia';
}

// ─── Index — contact sheet con numeral debajo ─────────────────────────────────
function ContactIndex({
    instructors, onPick,
}: {
    instructors: Instructor[];
    onPick: (instructor: Instructor) => void;
}) {
    return (
        <section className="bg-bmb-cream py-12 lg:py-16">
            <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
                <header className="mb-10">
                    <p className="font-script text-4xl leading-none text-bmb-gold sm:text-5xl">
                        índice
                    </p>
                    <p className="mt-3 max-w-md font-body text-sm text-bmb-dark/65 sm:text-base">
                        Quince capítulos. Click en cualquiera para abrir su práctica y horario.
                    </p>
                </header>
                <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-5 lg:grid-cols-8">
                    {instructors.map((inst, i) => {
                        const initial = (inst.display_name || '?').trim()[0]?.toUpperCase() ?? '?';
                        return (
                            <button
                                key={inst.id}
                                onClick={() => onPick(inst)}
                                className="group block text-left"
                                aria-label={`${firstName(inst.display_name)} — capítulo ${ROMAN[i]}`}
                            >
                                <div className="relative aspect-[4/5] w-full overflow-hidden bg-bmb-taupe/30">
                                    {inst.photo_url ? (
                                        <img
                                            src={inst.photo_url}
                                            alt={inst.display_name}
                                            className="absolute inset-0 h-full w-full object-cover grayscale transition-all duration-700 group-hover:grayscale-0 group-hover:scale-[1.04]"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#ECE1CE_0%,#D6D5C2_100%)]">
                                            <span className="font-heading text-5xl text-bmb-dark/22">{initial}</span>
                                        </div>
                                    )}
                                    <span className="absolute left-1.5 top-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-bmb-cream mix-blend-difference">
                                        № {String(i + 1).padStart(2, '0')}
                                    </span>
                                </div>
                                <div className="mt-2 flex items-baseline justify-between gap-2 border-b border-bmb-dark/15 pb-1.5">
                                    <span className="truncate font-heading text-sm text-bmb-dark">
                                        {firstName(inst.display_name)}
                                    </span>
                                    <span className="font-script text-base leading-none text-bmb-gold">
                                        {ROMAN[i]}
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}

// ─── Chapter — full-bleed asimétrico con palette propia ───────────────────────
function Chapter({
    instructor, index, onPick,
}: {
    instructor: Instructor;
    index: number;
    onPick: () => void;
}) {
    const s = scene(index);
    // Alterna lado del retrato — par a la derecha, impar a la izquierda
    const photoRight = index % 2 === 0;
    const roman = ROMAN[index] ?? String(index + 1);
    const initial = (instructor.display_name || '?').trim()[0]?.toUpperCase() ?? '?';

    return (
        <section
            id={`coach-${instructor.id}`}
            className={`${s.bg} ${s.text} relative`}
        >
            <div className="mx-auto max-w-[1440px] px-5 py-20 sm:px-8 lg:px-12 lg:py-32">
                <div className={`grid gap-8 lg:items-center lg:gap-16 ${photoRight ? 'lg:grid-cols-[1fr_1.05fr]' : 'lg:grid-cols-[1.05fr_1fr]'}`}>

                    {/* Bloque tipográfico */}
                    <div className={`relative ${photoRight ? 'order-1 lg:order-1' : 'order-1 lg:order-2'}`}>
                        {/* Numeral romano enorme — gesto principal */}
                        <span
                            className={`pointer-events-none block font-script leading-[0.78] tracking-[-0.05em] ${s.numTone}`}
                            style={{ fontSize: 'clamp(7rem, 18vw, 14rem)' }}
                            aria-hidden="true"
                        >
                            {roman}
                        </span>

                        {/* Nombre */}
                        <h2
                            className="mt-3 font-heading font-medium leading-[0.86] tracking-[-0.045em]"
                            style={{ fontSize: 'clamp(3.5rem, 9vw, 7rem)' }}
                        >
                            {firstName(instructor.display_name)}
                        </h2>

                        {/* Tagline manuscrito — voz BMB */}
                        <p className={`mt-5 font-script text-3xl leading-tight sm:text-4xl ${s.tag}`}>
                            {tagline(instructor)}
                        </p>

                        {/* Bio si existe */}
                        {instructor.bio && (
                            <p className={`mt-7 max-w-md font-body text-base leading-relaxed ${s.tag}`}>
                                {instructor.bio}
                            </p>
                        )}

                        {/* CTA con accent — más botón "pulsera" que botón saas */}
                        <button
                            type="button"
                            onClick={onPick}
                            className={`mt-8 inline-flex items-center gap-3 border-b pb-1 font-body text-[11px] font-semibold uppercase tracking-[0.22em] transition-colors hover:opacity-70 ${photoRight ? '' : ''}`}
                            style={{ borderColor: 'currentColor', borderBottomWidth: '1px' }}
                        >
                            Ver clases de {firstName(instructor.display_name)}
                            <span className={`inline-block h-[1px] w-7 ${s.accent}`} aria-hidden="true" />
                        </button>
                    </div>

                    {/* Retrato */}
                    <button
                        type="button"
                        onClick={onPick}
                        className={`group relative aspect-[4/5] w-full overflow-hidden ${photoRight ? 'order-2 lg:order-2' : 'order-2 lg:order-1'}`}
                        aria-label={`Foto de ${instructor.display_name}`}
                    >
                        {instructor.photo_url ? (
                            <img
                                src={instructor.photo_url}
                                alt={instructor.display_name}
                                className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1100ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.025]"
                                loading="lazy"
                            />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#ECE1CE_0%,#D6D5C2_100%)]">
                                <span className="font-heading text-[clamp(7rem,18vw,12rem)] text-bmb-dark/18">{initial}</span>
                            </div>
                        )}
                        {/* Marca № en esquina, mix-blend para legibilidad sobre cualquier foto */}
                        <span className="absolute right-3 top-3 font-mono text-[10px] uppercase tracking-[0.2em] text-bmb-cream mix-blend-difference">
                            № {String(index + 1).padStart(2, '0')} / {String(instructor.id ? 0 : 0).padStart(2, '0')}
                        </span>
                    </button>
                </div>
            </div>
        </section>
    );
}

// ─── Página ───────────────────────────────────────────────────────────────────
export default function StudioInstructors() {
    const [pickedCoach, setPickedCoach] = useState<{ id: string; name: string } | null>(null);

    const { data, isLoading } = useQuery<Instructor[]>({
        queryKey: ['public-instructors'],
        queryFn: async () => (await api.get('/instructors')).data,
    });

    const activeInstructors = (data?.filter((i) => i.is_active) || []).sort((a, b) =>
        a.display_name.localeCompare(b.display_name, 'es')
    );
    const total = activeInstructors.length;

    const handlePick = (i: Instructor) => {
        setPickedCoach({ id: i.id, name: i.display_name });
        // Scroll suave al capítulo
        requestAnimationFrame(() => {
            const el = document.getElementById(`coach-${i.id}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    };

    return (
        <StudioLayout>
            {/* ════════ OVERTURA ════════ */}
            <section className="bg-bmb-dark text-bmb-cream">
                <div className="mx-auto max-w-[1440px] px-5 py-20 sm:px-8 lg:px-12 lg:py-32">
                    <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
                        {/* Lado izquierdo: numeral grande + caption */}
                        <div>
                            <span className="font-script text-7xl leading-none text-bmb-gold sm:text-9xl">
                                un equipo
                            </span>
                            <p className="mt-7 font-body text-sm leading-relaxed text-bmb-cream/72 sm:text-base">
                                Casa Shé · Condesa, CDMX
                                <br />
                                {total} coaches dando clases este mes.
                            </p>
                        </div>
                        {/* Lado derecho: headline */}
                        <div>
                            <h1
                                className="font-heading font-medium leading-[0.84] tracking-[-0.05em]"
                                style={{ fontSize: 'clamp(3rem, 9vw, 8rem)' }}
                            >
                                Cada coach
                                <br />
                                tiene su propia
                                <br />
                                forma de cuidarte.
                            </h1>
                        </div>
                    </div>
                </div>
            </section>

            {/* ════════ ÍNDICE — contact sheet ════════ */}
            {isLoading ? (
                <section className="bg-bmb-cream py-12">
                    <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
                        <Skeleton className="mb-6 h-10 w-40" />
                        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
                            {Array.from({ length: 8 }).map((_, i) => (
                                <Skeleton key={i} className="aspect-[4/5] w-full" />
                            ))}
                        </div>
                    </div>
                </section>
            ) : total === 0 ? (
                <section className="bg-bmb-cream py-24 text-center">
                    <p className="font-heading text-3xl text-bmb-dark/45">Pronto publicaremos al equipo.</p>
                </section>
            ) : (
                <ContactIndex instructors={activeInstructors} onPick={handlePick} />
            )}

            {/* ════════ CAPÍTULOS — una sección por coach ════════ */}
            {activeInstructors.map((inst, i) => (
                <Chapter
                    key={inst.id}
                    instructor={inst}
                    index={i}
                    onPick={() => setPickedCoach({ id: inst.id, name: inst.display_name })}
                />
            ))}

            {/* ════════ CIERRE ════════ */}
            <section className="bg-bmb-cream py-20 lg:py-28">
                <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
                    <div className="flex flex-col items-start gap-6">
                        <span className="font-script text-6xl leading-none text-bmb-gold sm:text-8xl">
                            te esperamos
                        </span>
                        <p className="max-w-xl font-body text-base leading-relaxed text-bmb-dark/72 sm:text-lg">
                            La práctica empieza cuando llegas. Reserva tu primera clase con
                            quien quieras conocer.
                        </p>
                    </div>
                </div>
            </section>

            <CoachSheet
                instructorId={pickedCoach?.id ?? null}
                instructorName={pickedCoach?.name ?? null}
                onClose={() => setPickedCoach(null)}
            />
        </StudioLayout>
    );
}
