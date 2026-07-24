import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const easeOut = [0.23, 1, 0.32, 1] as const;

// Foto de marca compartida por escritorio y móvil: mismo archivo, dos encuadres.
const BRAND_PHOTO = {
    src: '/casashe/galeria/barra-tatuaje.webp',
    alt: 'Brazo tatuado sosteniendo la barra durante la clase en Casa Shé Condesa',
};

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
            {/* Panel de marca — FIJO a la mitad izquierda en escritorio: siempre cubre, nunca se recorta. */}
            <motion.aside
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.55, ease: easeOut }}
                className="relative hidden overflow-hidden lg:fixed lg:inset-y-0 lg:left-0 lg:block lg:w-[45%]"
            >
                <img
                    src={BRAND_PHOTO.src}
                    alt={BRAND_PHOTO.alt}
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

            {/* Banda de marca en móvil — la misma foto, encuadre horizontal. Da contexto
                antes del formulario sin robarle altura al teclado (se va en lg). */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, ease: easeOut }}
                className="relative h-56 overflow-hidden sm:h-64 lg:hidden"
            >
                <img
                    src={BRAND_PHOTO.src}
                    alt={BRAND_PHOTO.alt}
                    className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0" style={{ backgroundColor: 'rgba(22,38,26,0.48)' }} />
                {/* Velo inferior: asienta la frase sobre la foto sin lavarla (borde recto,
                    igual que los marcos de la galería). */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[rgba(22,38,26,0.75)] to-transparent" />

                <div className="relative z-10 flex h-full flex-col justify-between p-5 sm:p-6">
                    <div className="flex items-center justify-between gap-4">
                        <Link to="/" className="flex items-center">
                            <img src="/casashe/logo-wordmark-cream.png" alt="Casa Shé" className="h-7 w-auto" />
                        </Link>
                        <Link
                            to="/"
                            className="font-body text-sm text-bmb-cream/75 transition-colors hover:text-bmb-cream"
                        >
                            Inicio
                        </Link>
                    </div>

                    <p className="max-w-[18rem] font-heading text-2xl leading-tight text-bmb-cream sm:text-[1.75rem]">
                        La comunidad es la medicina.
                    </p>
                </div>
            </motion.div>

            {/* Panel de formulario — en flujo normal (scroll natural de la página). Nunca recorta. */}
            <section className="flex min-h-[calc(100dvh-14rem)] flex-col px-5 pb-12 pt-8 sm:min-h-[calc(100dvh-16rem)] sm:px-8 lg:ml-[45%] lg:min-h-[100dvh] lg:px-14 lg:py-12">
                <motion.div
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, ease: easeOut }}
                    className="m-auto w-full max-w-[440px]"
                >
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
