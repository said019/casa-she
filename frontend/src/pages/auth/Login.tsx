import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/stores/authStore';
import AuthShell from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
    'h-12 rounded-xl border-bmb-dark/15 bg-white/70 pl-11 text-bmb-dark placeholder:text-bmb-dark/40 focus-visible:border-bmb-dark/45 focus-visible:ring-bmb-dark/15';

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
        <AuthShell
            title="Entra a casa"
            subtitle="Reserva clases y revisa tus créditos."
            footer={
                <>
                    ¿No tienes cuenta?{' '}
                    <Link
                        to={returnUrl ? `/register?returnUrl=${encodeURIComponent(returnUrl)}` : '/register'}
                        className="font-semibold text-bmb-dark transition-colors hover:text-bmb-dark/70"
                    >
                        Regístrate
                    </Link>
                </>
            }
        >
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                {error && (
                    <Alert variant="destructive" className="rounded-xl">
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
                        <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-bmb-dark/40" />
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
                            className="font-body text-sm font-semibold text-bmb-dark transition-colors hover:text-bmb-dark/70"
                        >
                            ¿Olvidaste tu contraseña?
                        </Link>
                    </div>
                    <div className="relative">
                        <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-bmb-dark/40" />
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
                    className="pt-2"
                >
                    <Button
                        type="submit"
                        className="h-12 w-full rounded-full bg-bmb-dark font-body text-bmb-cream hover:bg-bmb-dark/90"
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
                </motion.div>
            </form>

            {!isStandalone && (
                <div className="mt-6 rounded-2xl border border-bmb-dark/12 bg-white/50 p-4">
                    <div className="flex items-center justify-center gap-1.5">
                        <Smartphone className="h-4 w-4 text-bmb-dark" />
                        <p className="font-body text-xs font-semibold text-bmb-dark/80">
                            Agrega el acceso directo a tu celular
                        </p>
                    </div>
                    <p className="mt-1 text-center font-body text-[11px] leading-relaxed text-bmb-dark/56">
                        Para abrir Casa Shé como app, sin entrar al navegador cada vez.
                    </p>

                    {/* Selector de dispositivo */}
                    <div className="mx-auto mt-3 flex w-fit rounded-full border border-bmb-dark/15 bg-bmb-cream/60 p-0.5">
                        {([['ios', 'iPhone'], ['android', 'Android']] as const).map(([os, label]) => (
                            <button
                                key={os}
                                type="button"
                                onClick={() => setInstallOS(os)}
                                className={`rounded-full px-4 py-1 font-body text-[11px] font-semibold transition-colors ${
                                    installOS === os
                                        ? 'bg-bmb-dark text-bmb-cream shadow-sm'
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
                                  <>Toca el botón <strong>Compartir</strong> <Share className="inline h-3.5 w-3.5 -mt-0.5 text-bmb-dark" /> en la barra de abajo.</>,
                                  <>Desliza y elige <strong>«Agregar a inicio»</strong>, luego <strong>Agregar</strong>.</>,
                              ]
                            : [
                                  <>Abre esta página en <strong>Chrome</strong>.</>,
                                  <>Toca el menú <MoreVertical className="inline h-3.5 w-3.5 -mt-0.5 text-bmb-dark" /> arriba a la derecha (o el ícono <PlusSquare className="inline h-3.5 w-3.5 -mt-0.5 text-bmb-dark" /> en la barra).</>,
                                  <>Elige <strong>«Instalar app»</strong> (o «Agregar a pantalla principal»).</>,
                              ]
                        ).map((step, i) => (
                            <li key={i} className="flex items-start gap-2 font-body text-[11px] leading-relaxed text-bmb-dark/68">
                                <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-bmb-dark/12 text-[10px] font-bold text-bmb-dark">
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
        </AuthShell>
    );
}
