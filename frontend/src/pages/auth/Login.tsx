import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import CasaSheLogo from '@/components/CasaSheLogo';
import {
    ArrowRight,
    Eye,
    EyeOff,
    Loader2,
    Lock,
    Mail,
    MoreVertical,
    PlusSquare,
    Share,
    Smartphone,
} from 'lucide-react';

const loginSchema = z.object({
    email: z.string().email('Email inválido'),
    password: z.string().min(1, 'La contraseña es requerida'),
});

type LoginForm = z.infer<typeof loginSchema>;

const easeOut = [0.23, 1, 0.32, 1] as const;
const fieldClass =
    'h-12 rounded-[0.85rem] border-balance-sand/65 bg-balance-cream/70 pl-11 text-balance-dark shadow-none transition-[border-color,box-shadow] duration-200 placeholder:text-balance-dark/42 focus-visible:border-balance-olive/55 focus-visible:ring-balance-olive/15';

export default function Login() {
    const [showPassword, setShowPassword] = useState(false);
    const [installOS, setInstallOS] = useState<'ios' | 'android'>(() =>
        typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent) ? 'ios' : 'android',
    );
    // Si ya corre como app instalada, no tiene sentido mostrar el instructivo.
    const isStandalone =
        typeof window !== 'undefined' &&
        (window.matchMedia?.('(display-mode: standalone)').matches ||
            (navigator as any).standalone === true);
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const returnUrl = searchParams.get('returnUrl');
    const { login, isLoading, error, clearError, isAuthenticated, user } = useAuthStore();

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<LoginForm>({
        resolver: zodResolver(loginSchema),
    });

    useEffect(() => {
        if (isAuthenticated && user) {
            const adminish = user.role === 'admin' || user.role === 'super_admin';
            // Home y "área propia" según el rol.
            const home = adminish ? '/admin/dashboard'
                : user.role === 'instructor' ? '/coach'
                : user.role === 'reception' ? '/reception'
                : '/app';
            const ownArea = adminish ? '/admin'
                : user.role === 'instructor' ? '/coach'
                : user.role === 'reception' ? '/reception'
                : '/app';
            // Solo respetar el returnUrl si es de su PROPIA área. Así un admin que abrió un
            // acceso directo guardado a /reception (u otra área) aterriza en /admin, no ahí.
            const dest = returnUrl && returnUrl.startsWith(ownArea) ? returnUrl : home;
            navigate(dest, { replace: true });
        }
    }, [isAuthenticated, user, navigate, returnUrl]);

    useEffect(() => {
        return () => clearError();
    }, [clearError]);

    const onSubmit = async (data: LoginForm) => {
        try {
            await login(data as any);
        } catch {
            // Error is handled by the store
        }
    };

    return (
        <main className="min-h-screen overflow-hidden bg-[hsl(var(--admin-bg))] text-balance-dark">
            <div className="grid min-h-screen lg:grid-cols-[0.95fr_1.05fr]">
                {/* Panel con foto del estudio — solo desktop */}
                <motion.section
                    initial={{ opacity: 0, scale: 0.985 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.55, ease: easeOut }}
                    className="relative hidden overflow-hidden bg-bmb-cream lg:block lg:min-h-screen"
                >
                    <img
                        src="/studio/reformers-vertical.webp"
                        alt="Interior de Casa Shé"
                        className="absolute inset-0 h-full w-full object-cover"
                    />
                    <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-bmb-cream/80 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-bmb-dark/55 to-transparent" />

                    <div className="relative z-10 flex min-h-screen flex-col justify-between p-12 xl:p-16">
                        <Link to="/" className="flex w-fit items-center gap-3">
                            <CasaSheLogo variant="mark" className="h-14 w-14 text-bmb-deepgold" />
                            <div className="leading-none text-bmb-dark">
                                <p className="font-heading text-3xl font-medium tracking-[-0.02em]">Casa Shé</p>
                                <p className="mt-1 font-body text-[9px] font-semibold uppercase tracking-[0.25em] text-bmb-deepgold">
                                    La comunidad es la medicina
                                </p>
                            </div>
                        </Link>

                        <div className="max-w-md">
                            <h1 className="font-heading text-[clamp(2.8rem,4.4vw,4.5rem)] font-medium leading-[0.92] tracking-[-0.04em] text-white drop-shadow-sm">
                                Vuelve a tu rutina.
                            </h1>
                            <p className="mt-4 font-body text-sm font-medium leading-relaxed text-white/85">
                                Reserva clases y sigue acumulando constancia en el club.
                            </p>
                        </div>
                    </div>
                </motion.section>

                <section className="relative flex min-h-screen items-center justify-center px-5 py-8 sm:px-8 lg:px-12">
                    <div className="app-radial-bg pointer-events-none absolute inset-0" />

                    <motion.div
                        initial={{ opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.45, ease: easeOut }}
                        className="relative w-full max-w-[460px]"
                    >
                        <div className="mb-6 flex items-center justify-between gap-4">
                            <Link to="/" className="flex items-center gap-2 lg:hidden">
                                <CasaSheLogo variant="mark" className="h-9 w-9 text-bmb-deepgold" />
                                <span className="font-heading text-lg font-medium tracking-[-0.02em] text-bmb-dark">Casa Shé</span>
                            </Link>
                            <Link
                                to="/"
                                className="ml-auto rounded-full border border-balance-sand/65 bg-balance-cream/70 px-5 py-2.5 font-body text-[11px] font-semibold uppercase tracking-[0.22em] text-balance-dark/62 transition-colors hover:bg-balance-cream"
                            >
                                Inicio
                            </Link>
                        </div>

                        <div className="rounded-[1.5rem] border border-balance-sand/55 bg-[hsl(var(--admin-panel))]/92 p-5 shadow-[0_24px_70px_-42px_rgba(51,42,34,0.45)] sm:p-8">
                            <div className="mb-8">
                                <h2 className="font-heading text-4xl font-medium leading-[0.95] tracking-[-0.045em] text-bmb-dark sm:text-5xl">
                                    Entra a Casa Shé
                                </h2>
                                <p className="mt-3 font-body text-sm leading-relaxed text-bmb-dark/62">
                                    Reserva clases y revisa tus créditos.
                                </p>
                            </div>

                            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                                {error && (
                                    <Alert variant="destructive" className="rounded-[0.85rem]">
                                        <AlertDescription>{error}</AlertDescription>
                                    </Alert>
                                )}

                                <motion.div
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.28, delay: 0.08, ease: easeOut }}
                                    className="space-y-2"
                                >
                                    <Label htmlFor="email">Email</Label>
                                    <div className="relative">
                                        <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-bmb-dark/42" />
                                        <Input
                                            id="email"
                                            type="email"
                                            placeholder="tu@email.com"
                                            className={fieldClass}
                                            {...register('email')}
                                            disabled={isLoading}
                                        />
                                    </div>
                                    {errors.email && (
                                        <p className="text-sm text-destructive">{errors.email.message}</p>
                                    )}
                                </motion.div>

                                <motion.div
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.28, delay: 0.14, ease: easeOut }}
                                    className="space-y-2"
                                >
                                    <div className="flex items-center justify-between gap-4">
                                        <Label htmlFor="password">Contraseña</Label>
                                        <Link
                                            to="/forgot-password"
                                            className="font-body text-sm font-semibold text-bmb-deepgold transition-colors hover:text-bmb-dark"
                                        >
                                            ¿Olvidaste tu contraseña?
                                        </Link>
                                    </div>
                                    <div className="relative">
                                        <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-bmb-dark/42" />
                                        <Input
                                            id="password"
                                            type={showPassword ? 'text' : 'password'}
                                            placeholder="••••••••"
                                            className={`${fieldClass} pr-12`}
                                            {...register('password')}
                                            disabled={isLoading}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-bmb-dark/48 transition-transform duration-150 hover:text-bmb-dark active:scale-95"
                                            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                        >
                                            {showPassword ? (
                                                <EyeOff className="h-4 w-4" />
                                            ) : (
                                                <Eye className="h-4 w-4" />
                                            )}
                                        </button>
                                    </div>
                                    {errors.password && (
                                        <p className="text-sm text-destructive">{errors.password.message}</p>
                                    )}
                                </motion.div>

                                <motion.div
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.28, delay: 0.2, ease: easeOut }}
                                    className="space-y-4 pt-2"
                                >
                                    <Button
                                        type="submit"
                                        className="h-12 w-full rounded-[0.85rem] bg-bmb-gold font-body font-semibold text-bmb-dark shadow-none transition-transform duration-150 hover:bg-bmb-deepgold active:scale-[0.98]"
                                        disabled={isLoading}
                                    >
                                        {isLoading ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Entrando...
                                            </>
                                        ) : (
                                            <>
                                                Entrar
                                                <ArrowRight className="ml-2 h-4 w-4" />
                                            </>
                                        )}
                                    </Button>

                                    <p className="text-center font-body text-sm text-bmb-dark/62">
                                        ¿No tienes cuenta?{' '}
                                        <Link
                                            to={returnUrl ? `/register?returnUrl=${encodeURIComponent(returnUrl)}` : '/register'}
                                            className="font-semibold text-bmb-deepgold transition-colors hover:text-bmb-dark"
                                        >
                                            Regístrate
                                        </Link>
                                    </p>
                                </motion.div>
                            </form>
                        </div>

                        {!isStandalone && (
                        <div className="mt-4 rounded-[1.25rem] border border-balance-sand/55 bg-[hsl(var(--admin-panel))]/70 p-4">
                            <div className="flex items-center justify-center gap-1.5">
                                <Smartphone className="h-4 w-4 text-bmb-deepgold" />
                                <p className="font-body text-xs font-semibold text-bmb-dark/80">
                                    Agrega el acceso directo a tu celular
                                </p>
                            </div>
                            <p className="mt-1 text-center font-body text-[11px] leading-relaxed text-bmb-dark/56">
                                Para abrir Casa Shé como app, sin entrar al navegador cada vez.
                            </p>

                            {/* Selector de dispositivo */}
                            <div className="mx-auto mt-3 flex w-fit rounded-full border border-balance-sand/60 bg-balance-cream/60 p-0.5">
                                {([['ios', 'iPhone'], ['android', 'Android']] as const).map(([os, label]) => (
                                    <button
                                        key={os}
                                        type="button"
                                        onClick={() => setInstallOS(os)}
                                        className={`rounded-full px-4 py-1 font-body text-[11px] font-semibold transition-colors ${
                                            installOS === os
                                                ? 'bg-bmb-deepgold text-white shadow-sm'
                                                : 'text-bmb-dark/55 hover:text-bmb-dark/80'
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>

                            {/* Pasos */}
                            <ol className="mt-3 space-y-2 text-left">
                                {(installOS === 'ios'
                                    ? [
                                          <>Abre esta página en <strong>Safari</strong> (el navegador de Apple).</>,
                                          <>Toca el botón <strong>Compartir</strong> <Share className="inline h-3.5 w-3.5 -mt-0.5 text-bmb-deepgold" /> en la barra de abajo.</>,
                                          <>Desliza y elige <strong>«Agregar a inicio»</strong>, luego <strong>Agregar</strong>.</>,
                                      ]
                                    : [
                                          <>Abre esta página en <strong>Chrome</strong>.</>,
                                          <>Toca el menú <MoreVertical className="inline h-3.5 w-3.5 -mt-0.5 text-bmb-deepgold" /> arriba a la derecha (o el ícono <PlusSquare className="inline h-3.5 w-3.5 -mt-0.5 text-bmb-deepgold" /> en la barra).</>,
                                          <>Elige <strong>«Instalar app»</strong> (o «Agregar a pantalla principal»).</>,
                                      ]
                                ).map((step, i) => (
                                    <li key={i} className="flex items-start gap-2 font-body text-[11px] leading-relaxed text-bmb-dark/68">
                                        <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-bmb-deepgold/15 text-[10px] font-bold text-bmb-deepgold">
                                            {i + 1}
                                        </span>
                                        <span>{step}</span>
                                    </li>
                                ))}
                            </ol>

                            <p className="mt-2.5 text-center font-body text-[11px] text-bmb-dark/55">
                                Listo ✨ El ícono de Casa Shé queda en tu pantalla, como cualquier app.
                            </p>
                        </div>
                        )}
                    </motion.div>
                </section>
            </div>
        </main>
    );
}
