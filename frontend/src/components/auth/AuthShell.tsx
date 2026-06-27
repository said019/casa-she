import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const easeOut = [0.23, 1, 0.32, 1] as const;

interface AuthShellProps {
    eyebrow?: string;
    title: string;
    subtitle?: string;
    children: ReactNode;
    footer?: ReactNode;
}

export default function AuthShell({ eyebrow, title, subtitle, children, footer }: AuthShellProps) {
    return (
        <main className="min-h-[100dvh] bg-bmb-cream text-bmb-dark">
            {/* Panel de marca — FIJO a la mitad izquierda en desktop: siempre cubre, nunca se recorta. */}
            <motion.aside
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.55, ease: easeOut }}
                className="relative hidden overflow-hidden lg:fixed lg:inset-y-0 lg:left-0 lg:block lg:w-[45%]"
            >
                <img
                    src="/casashe/hero.png"
                    alt="Interior de Casa Shé"
                    className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0" style={{ backgroundColor: 'rgba(22,38,26,0.62)' }} />

                <div className="relative z-10 flex h-full flex-col justify-between p-10 xl:p-14">
                    <Link to="/" className="w-fit">
                        <img src="/casashe/logo-wordmark-cream.png" alt="Casa Shé" className="h-8 w-auto" />
                    </Link>

                    <div className="max-w-md">
                        <p className="font-heading text-[clamp(2rem,2.6vw,2.9rem)] leading-tight text-bmb-cream">
                            La comunidad es la medicina.
                        </p>
                        <p className="mt-3 font-body text-sm leading-relaxed text-bmb-cream/80">
                            Wellness hub para mujeres · Condesa, CDMX
                        </p>
                    </div>
                </div>
            </motion.aside>

            {/* Panel de formulario — en flujo normal (scroll natural de la página). Nunca recorta. */}
            <section className="flex min-h-[100dvh] flex-col px-5 py-12 sm:px-8 lg:ml-[45%] lg:px-14">
                <motion.div
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, ease: easeOut }}
                    className="m-auto w-full max-w-[440px]"
                >
                    {/* Encabezado móvil */}
                    <div className="mb-8 flex items-center justify-between gap-4 lg:hidden">
                        <Link to="/" className="flex items-center">
                            <img src="/casashe/logo-wordmark.png" alt="Casa Shé" className="h-7 w-auto" />
                        </Link>
                        <Link to="/" className="font-body text-sm text-bmb-dark/65 transition-colors hover:text-bmb-dark">
                            Inicio
                        </Link>
                    </div>

                    {/* Encabezado */}
                    <div>
                        {eyebrow && (
                            <p className="font-body text-[12px] uppercase tracking-[0.32em] text-bmb-dark/55">
                                {eyebrow}
                            </p>
                        )}
                        <h1 className="font-heading text-4xl leading-[0.98] text-bmb-dark sm:text-5xl">
                            {title}
                        </h1>
                        {subtitle && (
                            <p className="mt-3 font-body leading-relaxed text-bmb-dark/65">{subtitle}</p>
                        )}
                    </div>

                    <div className="mt-8">{children}</div>

                    {footer && (
                        <div className="mt-6 text-center font-body text-sm text-bmb-dark/65">{footer}</div>
                    )}
                </motion.div>
            </section>
        </main>
    );
}
