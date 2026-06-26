import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api, { getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Mail, ArrowLeft, CheckCircle } from 'lucide-react';

const forgotPasswordSchema = z.object({
    email: z.string().email('Email inválido'),
});

type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>;

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
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background p-4">
                <Card className="w-full max-w-md shadow-xl">
                    <CardHeader className="space-y-1 text-center">
                        <div className="flex justify-center mb-4">
                            <div className="rounded-full bg-success/10 p-3">
                                <CheckCircle className="h-8 w-8 text-success" />
                            </div>
                        </div>
                        <CardTitle className="text-2xl font-heading">Revisa tu correo</CardTitle>
                        <CardDescription>
                            Si existe una cuenta con ese email, recibirás instrucciones para restablecer tu contraseña.
                        </CardDescription>
                    </CardHeader>
                    <CardFooter className="flex flex-col gap-4">
                        <Button asChild className="w-full" variant="outline">
                            <Link to="/login">
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Volver al inicio de sesión
                            </Link>
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
                    <CardTitle className="text-2xl font-heading">Recuperar Contraseña</CardTitle>
                    <CardDescription>
                        Ingresa tu email y te enviaremos instrucciones para restablecer tu contraseña
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
                            <Label htmlFor="email">Email</Label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="tu@email.com"
                                    className="pl-10"
                                    {...register('email')}
                                    disabled={isLoading}
                                />
                            </div>
                            {errors.email && (
                                <p className="text-sm text-destructive">{errors.email.message}</p>
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
                                    Enviando...
                                </>
                            ) : (
                                'Enviar instrucciones'
                            )}
                        </Button>

                        <Button asChild variant="ghost" className="w-full">
                            <Link to="/login">
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Volver al inicio de sesión
                            </Link>
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
