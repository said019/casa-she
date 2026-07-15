import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const easeOut = [0.23, 1, 0.32, 1] as const;

interface AuthShellProps {
    eyebrow?: string;
    title: string;
    subtitle?: string;
    brandImageSrc?: string;
    brandImageAlt?: string;
    brandImagePosition?: string;
    children: ReactNode;
    footer?: ReactNode;
}

export default function AuthShell({
    eyebrow,
    title,
    subtitle,
    brandImageSrc = '/casashe/galeria/barra-tatuaje.webp',
    brandImageAlt = 'Práctica de Barre en Casa Shé Condesa',
    brandImagePosition = 'object-center',
    children,
    footer,
}: AuthShellProps) {
    return (
        <main className="min-h-[100dvh] bg-[#F2E8DF] text-[#392A25]">
            {/* Panel de marca — FIJO a la mitad izquierda en desktop: siempre cubre, nunca se recorta. */}
            <motion.aside
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.55, ease: easeOut }}
                className="relative hidden overflow-hidden lg:fixed lg:inset-y-0 lg:left-0 lg:block lg:w-[45%]"
            >
                <img
                    src={brandImageSrc}
                    alt={brandImageAlt}
                    className={`absolute inset-0 h-full w-full object-cover ${brandImagePosition}`}
                />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(57,42,37,.20), rgba(89,52,42,.68))' }} />

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
            <section
                className="flex min-h-[100dvh] flex-col px-4 py-6 sm:px-8 sm:py-10 lg:ml-[45%] lg:px-14"
                style={{ background: 'radial-gradient(circle at 100% 0%, rgba(182,96,73,.12), transparent 32%), #F2E8DF' }}
            >
                <motion.div
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, ease: easeOut }}
                    className="m-auto w-full max-w-[480px] rounded-[2rem] border border-[#B66049]/15 bg-[#FBF7F2]/75 p-5 shadow-[0_32px_90px_-65px_rgba(76,42,31,.75)] backdrop-blur-sm sm:p-8"
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

                    <div className="relative mb-8 h-36 overflow-hidden rounded-[1.5rem] lg:hidden">
                        <img
                            src={brandImageSrc}
                            alt={brandImageAlt}
                            className={`h-full w-full object-cover ${brandImagePosition}`}
                        />
                        <div className="absolute inset-0 bg-gradient-to-r from-[#392A25]/45 to-transparent" />
                        <span className="absolute bottom-4 left-4 rounded-full bg-[#FBF7F2]/90 px-3 py-1.5 font-body text-[10px] uppercase tracking-[.2em] text-[#B66049]">
                            Movimiento · comunidad
                        </span>
                    </div>

                    {/* Encabezado */}
                    <div>
                        {eyebrow && (
                            <p className="font-body text-[12px] uppercase tracking-[0.32em] text-[#B66049]">
                                {eyebrow}
                            </p>
                        )}
                        <h1 className="font-heading text-4xl leading-[0.98] text-[#392A25] sm:text-5xl">
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
