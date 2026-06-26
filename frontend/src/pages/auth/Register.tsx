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
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    ArrowRight,
    Cake,
    Eye,
    EyeOff,
    Loader2,
    Lock,
    Mail,
    Phone,
    PlusSquare,
    Share,
    User,
} from 'lucide-react';

const registerSchema = z.object({
    displayName: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
    email: z.string().email('Email inválido'),
    phone: z
        .string()
        .regex(/^\+52[0-9]{10}$/, 'Formato: +52 seguido de 10 dígitos'),
    dateOfBirth: z.string().optional().or(z.literal('')),
    password: z
        .string()
        .min(8, 'Mínimo 8 caracteres')
        .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
        .regex(/[0-9]/, 'Debe contener al menos un número'),
    confirmPassword: z.string(),
    acceptsTerms: z.boolean().refine(val => val === true, 'Debes aceptar los términos'),
    acceptsCommunications: z.boolean().default(false),
    referralCode: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
});

type RegisterForm = z.infer<typeof registerSchema>;

const easeOut = [0.23, 1, 0.32, 1] as const;
const fieldClass =
    'h-12 rounded-[0.85rem] border-balance-sand/65 bg-balance-cream/70 pl-11 text-balance-dark shadow-none transition-[border-color,box-shadow] duration-200 placeholder:text-balance-dark/42 focus-visible:border-balance-olive/55 focus-visible:ring-balance-olive/15';
const fieldMotion = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.28, ease: easeOut },
};

export default function Register() {
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const returnUrl = searchParams.get('returnUrl');
    const { register: registerUser, isLoading, error, clearError, isAuthenticated, user } = useAuthStore();

    const {
        register,
        handleSubmit,
        setValue,
        watch,
        formState: { errors },
    } = useForm<RegisterForm>({
        resolver: zodResolver(registerSchema),
        defaultValues: {
            acceptsTerms: false,
            acceptsCommunications: false,
        },
    });

    const acceptsTerms = watch('acceptsTerms');
    const acceptsCommunications = watch('acceptsCommunications');

    useEffect(() => {
        if (isAuthenticated && user) {
            navigate(returnUrl || '/app', { replace: true });
        }
    }, [isAuthenticated, user, navigate, returnUrl]);

    useEffect(() => {
        return () => clearError();
    }, [clearError]);

    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let value = e.target.value;
        value = value.replace(/[^\d+]/g, '');
        if (!value.startsWith('+52') && value.length > 0) {
            if (value.startsWith('52')) {
                value = '+' + value;
            } else if (value.startsWith('+')) {
                value = '+52' + value.substring(1);
            } else {
                value = '+52' + value;
            }
        }
        if (value.length > 13) {
            value = value.substring(0, 13);
        }
        e.target.value = value;
    };

    const onSubmit = async (data: RegisterForm) => {
        try {
            await registerUser({
                email: data.email,
                password: data.password,
                displayName: data.displayName,
                phone: data.phone,
                dateOfBirth: data.dateOfBirth || undefined,
                acceptsTerms: data.acceptsTerms,
                acceptsCommunications: data.acceptsCommunications,
                referralCode: data.referralCode || undefined,
            });
        } catch {
            // Error is handled by the store
        }
    };

    return (
        <main className="min-h-screen overflow-hidden bg-[hsl(var(--admin-bg))] text-balance-dark">
            <div className="grid min-h-screen lg:grid-cols-[0.86fr_1.14fr]">
                {/* Panel con foto del estudio — solo desktop */}
                <motion.aside
                    initial={{ opacity: 0, scale: 0.985 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.55, ease: easeOut }}
                    className="relative hidden overflow-hidden bg-bmb-cream lg:block lg:min-h-screen"
                >
                    <img
                        src="/studio/reformers-vertical.webp"
                        alt="Interior de BMB Studio"
                        className="absolute inset-0 h-full w-full object-cover"
                    />
                    <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-bmb-cream/80 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-bmb-dark/55 to-transparent" />

                    <div className="relative z-10 flex min-h-screen flex-col justify-between p-12 xl:p-16">
                        <Link to="/" className="flex w-fit items-center gap-3">
                            <img
                                src="/bmb-studio-logo.png"
                                alt="BMB Studio"
                                className="h-14 w-auto object-contain"
                            />
                            <div className="leading-none text-bmb-dark">
                                <p className="font-heading text-3xl font-medium tracking-[-0.02em]">BMB Studio</p>
                                <p className="mt-1 font-body text-[9px] font-semibold uppercase tracking-[0.25em] text-bmb-deepgold">
                                    Body · Mind · Balance
                                </p>
                            </div>
                        </Link>

                        <div className="max-w-md">
                            <h1 className="font-heading text-[clamp(2.6rem,4vw,4.2rem)] font-medium leading-[0.94] tracking-[-0.04em] text-white drop-shadow-sm">
                                Tu práctica empieza aquí.
                            </h1>
                            <p className="mt-4 font-body text-sm font-medium leading-relaxed text-white/85">
                                Grupos pequeños, atención cercana y recompensas por constancia.
                            </p>
                        </div>
                    </div>
                </motion.aside>

                <section className="relative flex min-h-screen items-center justify-center px-5 py-8 sm:px-8 lg:px-12">
                    <div className="app-radial-bg pointer-events-none absolute inset-0" />

                    <motion.div
                        initial={{ opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.45, ease: easeOut }}
                        className="relative w-full max-w-3xl"
                    >
                        <div className="mb-6 flex items-center justify-between gap-4">
                            <Link to="/" className="flex items-center gap-2 lg:hidden">
                                <img src="/bmb-studio-logo.png" alt="BMB Studio" className="h-9 w-auto object-contain" />
                                <span className="font-heading text-lg font-medium tracking-[-0.02em] text-bmb-dark">BMB Studio</span>
                            </Link>
                            <Link
                                to="/login"
                                className="ml-auto rounded-full border border-balance-sand/65 bg-balance-cream/70 px-5 py-2.5 font-body text-[11px] font-semibold uppercase tracking-[0.22em] text-balance-dark/62 transition-colors hover:bg-balance-cream"
                            >
                                Entrar
                            </Link>
                        </div>

                        <div className="rounded-[1.5rem] border border-balance-sand/55 bg-[hsl(var(--admin-panel))]/92 p-5 shadow-[0_24px_70px_-42px_rgba(51,42,34,0.45)] sm:p-8">
                            <div className="mb-8">
                                <h2 className="font-heading text-4xl font-medium leading-[0.95] tracking-[-0.045em] text-bmb-dark sm:text-5xl">
                                    Únete a BMB Studio
                                </h2>
                                <p className="mt-3 font-body text-sm leading-relaxed text-bmb-dark/62">
                                    Crea tu cuenta para reservar y comprar paquetes.
                                </p>
                            </div>

                            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                                {error && (
                                    <Alert variant="destructive" className="rounded-[0.85rem]">
                                        <AlertDescription>{error}</AlertDescription>
                                    </Alert>
                                )}

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <motion.div {...fieldMotion} transition={{ duration: 0.28, delay: 0.04, ease: easeOut }} className="space-y-2">
                                        <Label htmlFor="displayName">Nombre completo</Label>
                                        <div className="relative">
                                            <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-bmb-dark/42" />
                                            <Input
                                                id="displayName"
                                                placeholder="Tu nombre"
                                                className={fieldClass}
                                                {...register('displayName')}
                                                disabled={isLoading}
                                            />
                                        </div>
                                        {errors.displayName && (
                                            <p className="text-sm text-destructive">{errors.displayName.message}</p>
                                        )}
                                    </motion.div>

                                    <motion.div {...fieldMotion} transition={{ duration: 0.28, delay: 0.08, ease: easeOut }} className="space-y-2">
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

                                    <motion.div {...fieldMotion} transition={{ duration: 0.28, delay: 0.12, ease: easeOut }} className="space-y-2">
                                        <Label htmlFor="phone">Teléfono</Label>
                                        <div className="relative">
                                            <Phone className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-bmb-dark/42" />
                                            <Input
                                                id="phone"
                                                type="tel"
                                                placeholder="+524271234567"
                                                className={fieldClass}
                                                {...register('phone')}
                                                onChange={(e) => {
                                                    handlePhoneChange(e);
                                                    register('phone').onChange(e);
                                                }}
                                                disabled={isLoading}
                                            />
                                        </div>
                                        {errors.phone && (
                                            <p className="text-sm text-destructive">{errors.phone.message}</p>
                                        )}
                                    </motion.div>

                                    <motion.div {...fieldMotion} transition={{ duration: 0.28, delay: 0.16, ease: easeOut }} className="space-y-2">
                                        <Label htmlFor="dateOfBirth">Fecha de nacimiento</Label>
                                        <div className="relative">
                                            <Cake className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-bmb-dark/42" />
                                            <Input
                                                id="dateOfBirth"
                                                type="date"
                                                className={fieldClass}
                                                {...register('dateOfBirth')}
                                                disabled={isLoading}
                                            />
                                        </div>
                                    </motion.div>

                                    <motion.div {...fieldMotion} transition={{ duration: 0.28, delay: 0.2, ease: easeOut }} className="space-y-2">
                                        <Label htmlFor="password">Contraseña</Label>
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
                                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </button>
                                        </div>
                                        {errors.password && (
                                            <p className="text-sm text-destructive">{errors.password.message}</p>
                                        )}
                                    </motion.div>

                                    <motion.div {...fieldMotion} transition={{ duration: 0.28, delay: 0.24, ease: easeOut }} className="space-y-2">
                                        <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
                                        <div className="relative">
                                            <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-bmb-dark/42" />
                                            <Input
                                                id="confirmPassword"
                                                type={showConfirmPassword ? 'text' : 'password'}
                                                placeholder="••••••••"
                                                className={`${fieldClass} pr-12`}
                                                {...register('confirmPassword')}
                                                disabled={isLoading}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                                className="absolute right-4 top-1/2 -translate-y-1/2 text-bmb-dark/48 transition-transform duration-150 hover:text-bmb-dark active:scale-95"
                                                aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                            >
                                                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </button>
                                        </div>
                                        {errors.confirmPassword && (
                                            <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
                                        )}
                                    </motion.div>
                                </div>

                                <motion.div
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.28, delay: 0.28, ease: easeOut }}
                                    className="rounded-[1.25rem] border border-balance-sand/55 bg-balance-cream/58 p-4"
                                >
                                    <div className="space-y-3">
                                        <div className="flex items-start gap-3">
                                            <Checkbox
                                                id="acceptsTerms"
                                                checked={acceptsTerms}
                                                onCheckedChange={(checked) => setValue('acceptsTerms', checked as boolean)}
                                                disabled={isLoading}
                                                className="mt-0.5 border-bmb-gold data-[state=checked]:bg-bmb-gold data-[state=checked]:text-bmb-dark"
                                            />
                                            <label htmlFor="acceptsTerms" className="cursor-pointer font-body text-sm leading-relaxed text-bmb-dark/78">
                                                Acepto los{' '}
                                                <Link to="/terms" className="font-semibold text-bmb-deepgold hover:text-bmb-dark">
                                                    términos y condiciones
                                                </Link>{' '}
                                                y la{' '}
                                                <Link to="/privacy" className="font-semibold text-bmb-deepgold hover:text-bmb-dark">
                                                    política de privacidad
                                                </Link>
                                            </label>
                                        </div>
                                        {errors.acceptsTerms && (
                                            <p className="text-sm text-destructive">{errors.acceptsTerms.message}</p>
                                        )}

                                        <div className="flex items-start gap-3">
                                            <Checkbox
                                                id="acceptsCommunications"
                                                checked={acceptsCommunications}
                                                onCheckedChange={(checked) => setValue('acceptsCommunications', checked as boolean)}
                                                disabled={isLoading}
                                                className="mt-0.5 border-bmb-gold data-[state=checked]:bg-bmb-gold data-[state=checked]:text-bmb-dark"
                                            />
                                            <label htmlFor="acceptsCommunications" className="cursor-pointer font-body text-sm leading-relaxed text-bmb-dark/78">
                                                Deseo recibir promociones, novedades y recompensas por email.
                                            </label>
                                        </div>
                                    </div>
                                </motion.div>


                                <motion.div
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.28, delay: 0.36, ease: easeOut }}
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
                                                Creando cuenta...
                                            </>
                                        ) : (
                                            <>
                                                Crear cuenta
                                                <ArrowRight className="ml-2 h-4 w-4" />
                                            </>
                                        )}
                                    </Button>

                                    <p className="text-center font-body text-sm text-bmb-dark/62">
                                        ¿Ya tienes cuenta?{' '}
                                        <Link
                                            to={returnUrl ? `/login?returnUrl=${encodeURIComponent(returnUrl)}` : '/login'}
                                            className="font-semibold text-bmb-deepgold transition-colors hover:text-bmb-dark"
                                        >
                                            Inicia sesión
                                        </Link>
                                    </p>
                                </motion.div>
                            </form>
                        </div>

                        <div className="mt-4 rounded-[1.25rem] border border-balance-sand/55 bg-[hsl(var(--admin-panel))]/70 p-4 text-center">
                            <p className="font-body text-xs font-semibold text-bmb-dark/78">
                                Instala la app en tu celular
                            </p>
                            <p className="mt-1 font-body text-[11px] leading-relaxed text-bmb-dark/56">
                                <strong>iPhone:</strong> toca <Share className="inline h-3 w-3 -mt-0.5" /> en Safari y luego <em>Agregar a inicio</em>.
                                <br />
                                <strong>Android:</strong> toca <PlusSquare className="inline h-3 w-3 -mt-0.5" /> en Chrome o el menú (⋮) y <em>Instalar app</em>.
                            </p>
                        </div>
                    </motion.div>
                </section>
            </div>
        </main>
    );
}
