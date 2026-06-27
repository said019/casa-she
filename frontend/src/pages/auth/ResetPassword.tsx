import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api, { getErrorMessage } from '@/lib/api';
import AuthShell from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Lock, Eye, EyeOff, CheckCircle, AlertTriangle } from 'lucide-react';

const resetPasswordSchema = z
    .object({
        password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
        confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: 'Las contraseñas no coinciden',
        path: ['confirmPassword'],
    });

type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;

const fieldClass =
    'h-12 rounded-xl border-bmb-dark/15 bg-white/70 pl-11 pr-12 text-bmb-dark placeholder:text-bmb-dark/40 focus-visible:border-bmb-dark/45 focus-visible:ring-bmb-dark/15';

export default function ResetPassword() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const token = searchParams.get('token');

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<ResetPasswordForm>({
        resolver: zodResolver(resetPasswordSchema),
    });

    useEffect(() => {
        if (!token) {
            setError('Token inválido o expirado. Por favor solicita un nuevo enlace.');
        }
    }, [token]);

    const onSubmit = async (data: ResetPasswordForm) => {
        if (!token) return;

        setIsLoading(true);
        setError(null);

        try {
            await api.post('/auth/reset-password', {
                token,
                password: data.password,
            });
            setSuccess(true);
            setTimeout(() => {
                navigate('/login');
            }, 3000);
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setIsLoading(false);
        }
    };

    if (!token) {
        return (
            <AuthShell
                eyebrow="Casa Shé"
                title="Enlace inválido"
                subtitle="El enlace para restablecer tu contraseña no es válido o ha expirado."
                footer={
                    <Link
                        to="/login"
                        className="font-semibold text-bmb-dark transition-colors hover:text-bmb-dark/70"
                    >
                        Volver al inicio de sesión
                    </Link>
                }
            >
                <div className="flex flex-col items-center gap-6 text-center">
                    <div className="rounded-full bg-bmb-dark/10 p-3">
                        <AlertTriangle className="h-8 w-8 text-bmb-dark" />
                    </div>
                    <Button
                        asChild
                        className="h-12 w-full rounded-full bg-bmb-dark font-body text-bmb-cream hover:bg-bmb-dark/90"
                    >
                        <Link to="/forgot-password">Solicitar nuevo enlace</Link>
                    </Button>
                </div>
            </AuthShell>
        );
    }

    if (success) {
        return (
            <AuthShell
                eyebrow="Casa Shé"
                title="¡Contraseña restablecida!"
                subtitle="Tu contraseña se ha actualizado exitosamente. Redirigiéndote al inicio de sesión..."
                footer={
                    <Link
                        to="/login"
                        className="font-semibold text-bmb-dark transition-colors hover:text-bmb-dark/70"
                    >
                        Volver al inicio de sesión
                    </Link>
                }
            >
                <div className="flex flex-col items-center gap-6 text-center">
                    <div className="rounded-full bg-bmb-dark/10 p-3">
                        <CheckCircle className="h-8 w-8 text-bmb-dark" />
                    </div>
                    <Button
                        asChild
                        className="h-12 w-full rounded-full bg-bmb-dark font-body text-bmb-cream hover:bg-bmb-dark/90"
                    >
                        <Link to="/login">Iniciar sesión ahora</Link>
                    </Button>
                </div>
            </AuthShell>
        );
    }

    return (
        <AuthShell
            eyebrow="Casa Shé"
            title="Nueva contraseña"
            subtitle="Ingresa tu nueva contraseña para acceder a tu cuenta."
            footer={
                <Link
                    to="/login"
                    className="font-semibold text-bmb-dark transition-colors hover:text-bmb-dark/70"
                >
                    Volver al inicio de sesión
                </Link>
            }
        >
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                {error && (
                    <Alert variant="destructive" className="rounded-xl">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                <div className="space-y-2">
                    <Label htmlFor="password">Nueva contraseña</Label>
                    <div className="relative">
                        <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-bmb-dark/40" />
                        <Input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            className={fieldClass}
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
                </div>

                <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
                    <div className="relative">
                        <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-bmb-dark/40" />
                        <Input
                            id="confirmPassword"
                            type={showConfirmPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            className={fieldClass}
                            {...register('confirmPassword')}
                            disabled={isLoading}
                        />
                        <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-bmb-dark/48 transition-transform duration-150 hover:text-bmb-dark active:scale-95"
                            aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        >
                            {showConfirmPassword ? (
                                <EyeOff className="h-4 w-4" />
                            ) : (
                                <Eye className="h-4 w-4" />
                            )}
                        </button>
                    </div>
                    {errors.confirmPassword && (
                        <p className="text-sm text-destructive">
                            {errors.confirmPassword.message}
                        </p>
                    )}
                </div>

                <Button
                    type="submit"
                    className="h-12 w-full rounded-full bg-bmb-dark font-body text-bmb-cream hover:bg-bmb-dark/90"
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Actualizando...
                        </>
                    ) : (
                        'Restablecer contraseña'
                    )}
                </Button>
            </form>
        </AuthShell>
    );
}
