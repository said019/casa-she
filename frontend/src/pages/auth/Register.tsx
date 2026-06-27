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
    'h-12 rounded-xl border-bmb-dark/15 bg-white/70 pl-11 text-bmb-dark placeholder:text-bmb-dark/40 focus-visible:border-bmb-dark/45 focus-visible:ring-bmb-dark/15';
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
        <AuthShell
            title="Únete a Casa Shé"
            subtitle="Crea tu cuenta para reservar y comprar paquetes."
            footer={
                <>
                    ¿Ya tienes cuenta?{' '}
                    <Link
                        to={returnUrl ? `/login?returnUrl=${encodeURIComponent(returnUrl)}` : '/login'}
                        className="font-semibold text-bmb-dark transition-colors hover:text-bmb-dark/70"
                    >
                        Inicia sesión
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

                <div className="grid gap-4 sm:grid-cols-2">
                    <motion.div {...fieldMotion} transition={{ duration: 0.28, delay: 0.04, ease: easeOut }} className="space-y-2">
                        <Label htmlFor="displayName">Nombre completo</Label>
                        <div className="relative">
                            <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-bmb-dark/40" />
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

                    <motion.div {...fieldMotion} transition={{ duration: 0.28, delay: 0.12, ease: easeOut }} className="space-y-2">
                        <Label htmlFor="phone">Teléfono</Label>
                        <div className="relative">
                            <Phone className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-bmb-dark/40" />
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
                            <Cake className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-bmb-dark/40" />
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
                            <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-bmb-dark/40" />
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
                    className="rounded-2xl border border-bmb-dark/12 bg-white/50 p-4"
                >
                    <div className="space-y-3">
                        <div className="flex items-start gap-3">
                            <Checkbox
                                id="acceptsTerms"
                                checked={acceptsTerms}
                                onCheckedChange={(checked) => setValue('acceptsTerms', checked as boolean)}
                                disabled={isLoading}
                                className="mt-0.5 border-bmb-dark data-[state=checked]:bg-bmb-dark data-[state=checked]:text-bmb-cream"
                            />
                            <label htmlFor="acceptsTerms" className="cursor-pointer font-body text-sm leading-relaxed text-bmb-dark/78">
                                Acepto los{' '}
                                <Link to="/terms" className="font-semibold text-bmb-dark hover:text-bmb-dark/70">
                                    términos y condiciones
                                </Link>{' '}
                                y la{' '}
                                <Link to="/privacy" className="font-semibold text-bmb-dark hover:text-bmb-dark/70">
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
                                className="mt-0.5 border-bmb-dark data-[state=checked]:bg-bmb-dark data-[state=checked]:text-bmb-cream"
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
                                Creando cuenta...
                            </>
                        ) : (
                            <>
                                Crear cuenta
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </>
                        )}
                    </Button>
                </motion.div>
            </form>

            <div className="mt-6 rounded-2xl border border-bmb-dark/12 bg-white/50 p-4 text-center">
                <p className="font-body text-xs font-semibold text-bmb-dark/78">
                    Instala la app en tu celular
                </p>
                <p className="mt-1 font-body text-[11px] leading-relaxed text-bmb-dark/56">
                    <strong>iPhone:</strong> toca <Share className="inline h-3 w-3 -mt-0.5" /> en Safari y luego <em>Agregar a inicio</em>.
                    <br />
                    <strong>Android:</strong> toca <PlusSquare className="inline h-3 w-3 -mt-0.5" /> en Chrome o el menú (⋮) y <em>Instalar app</em>.
                </p>
            </div>
        </AuthShell>
    );
}
