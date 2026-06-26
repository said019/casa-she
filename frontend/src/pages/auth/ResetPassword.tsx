import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api, { getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
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
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background p-4">
                <Card className="w-full max-w-md shadow-xl border-l-4 border-l-destructive">
                    <CardHeader className="text-center">
                        <div className="flex justify-center mb-4">
                            <div className="rounded-full bg-red-100 p-3">
                                <AlertTriangle className="h-8 w-8 text-destructive" />
                            </div>
                        </div>
                        <CardTitle>Enlace Inválido</CardTitle>
                        <CardDescription>
                            El enlace para restablecer tu contraseña no es válido o ha expirado.
                        </CardDescription>
                    </CardHeader>
                    <CardFooter>
                        <Button asChild className="w-full">
                            <Link to="/forgot-password">Solicitar nuevo enlace</Link>
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background p-4">
                <Card className="w-full max-w-md shadow-xl border-l-4 border-l-success">
                    <CardHeader className="text-center">
                        <div className="flex justify-center mb-4">
                            <div className="rounded-full bg-success/10 p-3">
                                <CheckCircle className="h-8 w-8 text-success" />
                            </div>
                        </div>
                        <CardTitle>¡Contraseña Restablecida!</CardTitle>
                        <CardDescription>
                            Tu contraseña se ha actualizado exitosamente.
                            <br />
                            Redirigiéndote al inicio de sesión...
                        </CardDescription>
                    </CardHeader>
                    <CardFooter>
                        <Button asChild className="w-full">
                            <Link to="/login">Iniciar Sesión Ahora</Link>
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background p-4">
            <Card className="w-full max-w-md shadow-xl">
                <CardHeader className="space-y-1 text-center">
                    <CardTitle className="text-2xl font-heading">Nueva Contraseña</CardTitle>
                    <CardDescription>
                        Ingresa tu nueva contraseña para acceder a tu cuenta
                    </CardDescription>
                </CardHeader>

                <form onSubmit={handleSubmit(onSubmit)}>
                    <CardContent className="space-y-4">
                        {error && (
                            <Alert variant="destructive">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="password">Nueva Contraseña</Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    className="pl-10 pr-10"
                                    {...register('password')}
                                    disabled={isLoading}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
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
                            <Label htmlFor="confirmPassword">Confirmar Contraseña</Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="confirmPassword"
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    className="pl-10 pr-10"
                                    {...register('confirmPassword')}
                                    disabled={isLoading}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
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
                    </CardContent>

                    <CardFooter className="flex flex-col gap-4">
                        <Button
                            type="submit"
                            className="w-full"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Actualizando...
                                </>
                            ) : (
                                'Restablecer Contraseña'
                            )}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
