import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LogIn, Loader2, Key, User as UserIcon, Smartphone, Share, MoreVertical, PlusSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

const coachLoginSchema = z.object({
    identifier: z.string().min(1, 'Ingresa tu número de coach o email'),
    password: z.string().min(1, 'Ingresa tu contraseña'),
});

const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Ingresa tu contraseña actual'),
    newPassword: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
    confirmPassword: z.string().min(1, 'Confirma tu nueva contraseña'),
}).refine((data) => data.newPassword === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
});

type CoachLoginForm = z.infer<typeof coachLoginSchema>;
type ChangePasswordForm = z.infer<typeof changePasswordSchema>;

export default function CoachLogin() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const setAuth = useAuthStore((state) => state.setAuth);
    const [showChangePassword, setShowChangePassword] = useState(false);
    const [tempPasswordData, setTempPasswordData] = useState<{ token: string } | null>(null);
    // Instructivo para guardar el portal como acceso directo (igual que el login de cliente).
    const [installOS, setInstallOS] = useState<'ios' | 'android'>(() =>
        typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent) ? 'ios' : 'android',
    );
    const isStandalone =
        typeof window !== 'undefined' &&
        (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true);

    const {
        register: registerLogin,
        handleSubmit: handleSubmitLogin,
        formState: { errors: loginErrors, isSubmitting: isLoggingIn }
    } = useForm<CoachLoginForm>({
        resolver: zodResolver(coachLoginSchema),
    });

    const {
        register: registerPassword,
        handleSubmit: handleSubmitPassword,
        formState: { errors: passwordErrors, isSubmitting: isChangingPassword },
        reset: resetPasswordForm
    } = useForm<ChangePasswordForm>({
        resolver: zodResolver(changePasswordSchema),
    });

    const onLogin = async (data: CoachLoginForm) => {
        try {
            const response = await api.post('/auth/coach/login', {
                identifier: data.identifier.trim(),
                password: data.password,
            });

            const { token, instructor, tempPassword } = response.data;

            // Store user and token
            setAuth({
                id: instructor.userId,
                email: instructor.email,
                display_name: instructor.displayName,
                role: 'instructor',
                photo_url: null,
                phone: '',
                emergency_contact_name: null,
                emergency_contact_phone: null,
                health_notes: null,
                accepts_communications: false,
                date_of_birth: null,
                receive_reminders: false,
                receive_promotions: false,
                receive_weekly_summary: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }, token);

            // Check if temp password
            if (tempPassword) {
                setTempPasswordData({ token });
                setShowChangePassword(true);
                toast({
                    title: 'Cambio de contraseña requerido',
                    description: 'Por seguridad, debes cambiar tu contraseña temporal.',
                    variant: 'default',
                });
            } else {
                toast({
                    title: 'Bienvenido',
                    description: `Hola ${instructor.displayName}`,
                });
                navigate('/coach');
            }
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Error al iniciar sesión',
                description: error?.response?.data?.message || 'Credenciales incorrectas',
            });
        }
    };

    const onChangePassword = async (data: ChangePasswordForm) => {
        try {
            await api.post('/auth/coach/change-password', {
                currentPassword: data.currentPassword,
                newPassword: data.newPassword,
            });

            toast({
                title: 'Contraseña actualizada',
                description: 'Tu contraseña ha sido cambiada exitosamente.',
            });

            setShowChangePassword(false);
            setTempPasswordData(null);
            resetPasswordForm();
            navigate('/coach');
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error?.response?.data?.message || 'No se pudo cambiar la contraseña',
            });
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-background p-4">
            <div className="w-full max-w-md space-y-4">
            <Card className="w-full shadow-lg">
                <CardHeader className="space-y-1 text-center">
                    <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                        <UserIcon className="h-8 w-8 text-primary" />
                    </div>
                    <CardTitle className="text-2xl font-heading">Portal de Coaches</CardTitle>
                    <CardDescription>
                        Ingresa con tu número de coach o email
                    </CardDescription>
                </CardHeader>

                <form onSubmit={handleSubmitLogin(onLogin)}>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="identifier">Número de Coach / Email</Label>
                            <div className="relative">
                                <UserIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="identifier"
                                    type="text"
                                    autoComplete="username"
                                    placeholder="COACH-0001 o email@ejemplo.com"
                                    className="pl-10"
                                    {...registerLogin('identifier')}
                                />
                            </div>
                            {loginErrors.identifier && (
                                <p className="text-xs text-destructive">{loginErrors.identifier.message}</p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="password">Contraseña</Label>
                                <Button
                                    variant="link"
                                    className="p-0 h-auto text-xs text-primary"
                                    type="button"
                                    onClick={() => navigate('/instructor/access')}
                                >
                                    ¿Olvidaste tu contraseña?
                                </Button>
                            </div>
                            <div className="relative">
                                <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="••••••••"
                                    className="pl-10"
                                    {...registerLogin('password')}
                                />
                            </div>
                            {loginErrors.password && (
                                <p className="text-xs text-destructive">{loginErrors.password.message}</p>
                            )}
                        </div>
                    </CardContent>

                    <CardFooter className="flex flex-col gap-3">
                        <Button type="submit" className="w-full" disabled={isLoggingIn}>
                            {isLoggingIn ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Iniciando sesión...
                                </>
                            ) : (
                                <>
                                    <LogIn className="mr-2 h-4 w-4" />
                                    Iniciar Sesión
                                </>
                            )}
                        </Button>

                        <Button
                            type="button"
                            variant="ghost"
                            className="w-full text-sm"
                            onClick={() => navigate('/')}
                        >
                            Volver al sitio principal
                        </Button>
                    </CardFooter>
                </form>
            </Card>

            {/* Instructivo: guardar el portal de coaches como acceso directo */}
            {!isStandalone && (
                <div className="rounded-xl border bg-muted/30 p-4">
                    <div className="flex items-center justify-center gap-1.5">
                        <Smartphone className="h-4 w-4 text-primary" />
                        <p className="text-xs font-semibold text-foreground/80">Agrega el portal a tu celular</p>
                    </div>
                    <p className="mt-1 text-center text-[11px] leading-relaxed text-muted-foreground">
                        Para abrir el portal de coaches como app, sin escribir la dirección cada vez.
                    </p>
                    <div className="mx-auto mt-3 flex w-fit rounded-full border bg-background p-0.5">
                        {([['ios', 'iPhone'], ['android', 'Android']] as const).map(([os, label]) => (
                            <button
                                key={os}
                                type="button"
                                onClick={() => setInstallOS(os)}
                                className={`rounded-full px-4 py-1 text-[11px] font-semibold transition-colors ${
                                    installOS === os ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <ol className="mt-3 space-y-2 text-left">
                        {(installOS === 'ios'
                            ? [
                                  <>Abre esta página en <strong>Safari</strong> (estando en el portal de coaches).</>,
                                  <>Toca <strong>Compartir</strong> <Share className="inline h-3.5 w-3.5 -mt-0.5 text-primary" /> en la barra de abajo.</>,
                                  <>Elige <strong>«Agregar a inicio»</strong> → <strong>Agregar</strong>.</>,
                              ]
                            : [
                                  <>Abre esta página en <strong>Chrome</strong>.</>,
                                  <>Toca el menú <MoreVertical className="inline h-3.5 w-3.5 -mt-0.5 text-primary" /> (o el ícono <PlusSquare className="inline h-3.5 w-3.5 -mt-0.5 text-primary" />).</>,
                                  <>Elige <strong>«Instalar app»</strong>.</>,
                              ]
                        ).map((step, i) => (
                            <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed text-foreground/70">
                                <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">{i + 1}</span>
                                <span>{step}</span>
                            </li>
                        ))}
                    </ol>
                    <p className="mt-2.5 text-center text-[11px] text-muted-foreground">Listo: el ícono abrirá directo el portal de coaches.</p>
                </div>
            )}
            </div>

            {/* Change Password Dialog */}
            <Dialog open={showChangePassword} onOpenChange={setShowChangePassword}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Cambiar Contraseña Temporal</DialogTitle>
                        <DialogDescription>
                            Por seguridad, debes establecer una nueva contraseña para continuar.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSubmitPassword(onChangePassword)} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="currentPassword">Contraseña Temporal</Label>
                            <Input
                                id="currentPassword"
                                type="password"
                                placeholder="Contraseña actual"
                                {...registerPassword('currentPassword')}
                            />
                            {passwordErrors.currentPassword && (
                                <p className="text-xs text-destructive">{passwordErrors.currentPassword.message}</p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="newPassword">Nueva Contraseña</Label>
                            <Input
                                id="newPassword"
                                type="password"
                                placeholder="Mínimo 8 caracteres"
                                {...registerPassword('newPassword')}
                            />
                            {passwordErrors.newPassword && (
                                <p className="text-xs text-destructive">{passwordErrors.newPassword.message}</p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">Confirmar Nueva Contraseña</Label>
                            <Input
                                id="confirmPassword"
                                type="password"
                                placeholder="Repite la contraseña"
                                {...registerPassword('confirmPassword')}
                            />
                            {passwordErrors.confirmPassword && (
                                <p className="text-xs text-destructive">{passwordErrors.confirmPassword.message}</p>
                            )}
                        </div>

                        <div className="bg-info/10 border border-info/30 rounded-md p-3">
                            <p className="text-sm text-foreground">
                                💡 Usa una contraseña segura con al menos 8 caracteres, combinando letras, números y símbolos.
                            </p>
                        </div>

                        <Button type="submit" className="w-full" disabled={isChangingPassword}>
                            {isChangingPassword ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Cambiando...
                                </>
                            ) : (
                                'Cambiar Contraseña'
                            )}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
