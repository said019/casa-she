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
        <main className="min-h-screen bg-bmb-cream text-bmb-dark">
            <div className="grid min-h-screen lg:grid-cols-[0.9fr_1.1fr]">
                {/* Panel de marca — solo desktop */}
                <motion.section
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.55, ease: easeOut }}
                    className="relative hidden overflow-hidden lg:sticky lg:top-0 lg:block lg:h-screen lg:self-start"
                >
                    <img
                        src="/casashe/hero.png"
                        alt="Interior de Casa Shé"
                        className="absolute inset-0 h-full w-full object-cover"
                    />
                    <div className="absolute inset-0" style={{ backgroundColor: 'rgba(22,38,26,0.62)' }} />

                    <div className="relative z-10 flex h-full flex-col justify-between p-12 xl:p-16">
                        <Link to="/" className="w-fit">
                            <img
                                src="/casashe/logo-wordmark-cream.png"
                                alt="Casa Shé"
                                className="h-9 w-auto"
                            />
                        </Link>

                        <div className="max-w-md">
                            <p className="font-heading text-[clamp(2.2rem,3vw,3.2rem)] leading-tight text-bmb-cream">
                                La comunidad es la medicina.
                            </p>
                            <p className="mt-4 font-body text-sm leading-relaxed text-bmb-cream/80">
                                Wellness hub para mujeres · Condesa, CDMX
                            </p>
                        </div>
                    </div>
                </motion.section>

                {/* Panel de formulario — centra si cabe, hace scroll desde arriba si el form es más alto que la pantalla */}
                <section className="relative flex min-h-screen flex-col px-5 py-12 sm:px-8 lg:px-14">
                    <motion.div
                        initial={{ opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.45, ease: easeOut }}
                        className="m-auto w-full max-w-[440px]"
                    >
                        {/* Encabezado móvil */}
                        <div className="mb-8 flex items-center justify-between gap-4 lg:hidden">
                            <Link to="/" className="flex items-center">
                                <img
                                    src="/casashe/logo-wordmark.png"
                                    alt="Casa Shé"
                                    className="h-7 w-auto"
                                />
                            </Link>
                            <Link
                                to="/"
                                className="font-body text-sm text-bmb-dark/65 transition-colors hover:text-bmb-dark"
                            >
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
                                <p className="mt-3 font-body leading-relaxed text-bmb-dark/65">
                                    {subtitle}
                                </p>
                            )}
                        </div>

                        <div className="mt-8">{children}</div>

                        {footer && (
                            <div className="mt-6 text-center font-body text-sm text-bmb-dark/65">
                                {footer}
                            </div>
                        )}
                    </motion.div>
                </section>
            </div>
        </main>
    );
}
