import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api, { getErrorMessage } from '@/lib/api';
import AuthShell from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Mail, ArrowLeft, CheckCircle } from 'lucide-react';

const forgotPasswordSchema = z.object({
    email: z.string().email('Email inválido'),
});

type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>;

const fieldClass =
    'h-12 rounded-xl border-bmb-dark/15 bg-white/70 pl-11 text-bmb-dark placeholder:text-bmb-dark/40 focus-visible:border-bmb-dark/45 focus-visible:ring-bmb-dark/15';

export default function ForgotPassword() {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<ForgotPasswordForm>({
        resolver: zodResolver(forgotPasswordSchema),
    });

    const onSubmit = async (data: ForgotPasswordForm) => {
        setIsLoading(true);
        setError(null);

        try {
            await api.post('/auth/forgot-password', data);
            setSuccess(true);
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setIsLoading(false);
        }
    };

    if (success) {
        return (
            <AuthShell
                eyebrow="Casa Shé"
                title="Revisa tu correo"
                subtitle="Si existe una cuenta con ese email, recibirás instrucciones para restablecer tu contraseña."
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
                        <Link to="/login">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Volver al inicio de sesión
                        </Link>
                    </Button>
                </div>
            </AuthShell>
        );
    }

    return (
        <AuthShell
            eyebrow="Casa Shé"
            title="Recupera tu acceso"
            subtitle="Te enviaremos instrucciones para volver a tu práctica."
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
                </div>

                <Button
                    type="submit"
                    className="h-12 w-full rounded-full bg-bmb-dark font-body text-bmb-cream hover:bg-bmb-dark/90"
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Enviando...
                        </>
                    ) : (
                        'Enviar instrucciones'
                    )}
                </Button>
            </form>
        </AuthShell>
    );
}
