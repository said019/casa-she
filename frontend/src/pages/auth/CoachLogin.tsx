import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Key, User as UserIcon, Smartphone, Share, MoreVertical, PlusSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import CasaSheLogo from '@/components/CasaSheLogo';
import { CasaShePattern } from '@/components/CasaShePattern';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

const coachLoginSchema = z.object({
    identifier: z.string().min(1, 'Ingresa tu número de coach o email'),
    password: z.string().min(1, 'Ingresa tu contraseña'),
});

const changePasswordSchema = z
    .object({
        currentPassword: z.string().min(1, 'Ingresa tu contraseña actual'),
        newPassword: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
        confirmPassword: z.string().min(1, 'Confirma tu nueva contraseña'),
    })
    .refine((d) => d.newPassword === d.confirmPassword, {
        message: 'Las contraseñas no coinciden',
        path: ['confirmPassword'],
    });

type CoachLoginForm = z.infer<typeof coachLoginSchema>;
type ChangePasswordForm = z.infer<typeof changePasswordSchema>;

export default function CoachLogin() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const setAuth = useAuthStore((s) => s.setAuth);
    const [showChangePassword, setShowChangePassword] = useState(false);
    const [installOS, setInstallOS] = useState<'ios' | 'android'>(() =>
        typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent) ? 'ios' : 'android',
    );
    const isStandalone =
        typeof window !== 'undefined' &&
        (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true);

    const {
        register: regLogin,
        handleSubmit: submitLogin,
        formState: { errors: loginErr, isSubmitting: loggingIn },
    } = useForm<CoachLoginForm>({ resolver: zodResolver(coachLoginSchema) });

    const {
        register: regPwd,
        handleSubmit: submitPwd,
        formState: { errors: pwdErr, isSubmitting: changingPwd },
        reset: resetPwd,
    } = useForm<ChangePasswordForm>({ resolver: zodResolver(changePasswordSchema) });

    const onLogin = async (data: CoachLoginForm) => {
        try {
            const { data: res } = await api.post('/auth/coach/login', {
                identifier: data.identifier.trim(),
                password: data.password,
            });
            const { token, instructor, tempPassword } = res;
            setAuth(
                {
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
                },
                token,
            );
            if (tempPassword) {
                setShowChangePassword(true);
                toast({ title: 'Cambio de contraseña requerido', description: 'Por seguridad, elige una contraseña nueva.' });
            } else {
                toast({ title: `Bienvenida, ${instructor.displayName}` });
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
            toast({ title: 'Contraseña actualizada' });
            setShowChangePassword(false);
            resetPwd();
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
        <>
            {/* ── Layout split: panel izquierdo (verde) + panel derecho (crema) ── */}
            <div className="flex min-h-screen">
                {/* ── Panel izquierdo: marca y ambiente ── */}
                <div
                    className="relative hidden w-[42%] flex-col items-center justify-center overflow-hidden p-12 lg:flex"
                    style={{ backgroundColor: '#16261A' }}
                >
                    {/* Patrón de ramas */}
                    <CasaShePattern
                        className="pointer-events-none absolute inset-0 h-full w-full"
                        color="#F6F0E4"
                        opacity={0.09}
                    />
                    {/* Orbe cálido */}
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute -bottom-16 -right-16 h-64 w-64 rounded-full"
                        style={{ background: 'radial-gradient(circle, rgba(174,72,54,0.25) 0%, transparent 65%)' }}
                    />
                    {/* Orbe frío arriba */}
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute -left-10 -top-10 h-48 w-48 rounded-full"
                        style={{ background: 'radial-gradient(circle, rgba(42,78,54,0.4) 0%, transparent 65%)' }}
                    />

                    <div className="relative z-10 text-center">
                        {/* Wordmark */}
                        <CasaSheLogo variant="full" tone="cream" className="mx-auto h-12 w-auto" />

                        {/* Separador ornamental */}
                        <div className="mx-auto my-8 flex items-center gap-3" style={{ color: 'rgba(174,72,54,0.5)' }}>
                            <div className="h-px flex-1" style={{ backgroundColor: 'rgba(246,240,228,0.12)' }} />
                            <span className="font-body text-xs tracking-[3px] uppercase" style={{ color: 'rgba(246,240,228,0.35)' }}>
                                Portal de Coach
                            </span>
                            <div className="h-px flex-1" style={{ backgroundColor: 'rgba(246,240,228,0.12)' }} />
                        </div>

                        <p
                            className="mx-auto max-w-[22ch] font-heading text-2xl leading-snug"
                            style={{ color: 'rgba(246,240,228,0.75)' }}
                        >
                            Tu espacio para gestionar clases, alumnas y crecimiento.
                        </p>

                        <p className="mt-8 font-body text-xs tracking-widest uppercase" style={{ color: 'rgba(174,72,54,0.7)' }}>
                            Condesa · Ciudad de México
                        </p>
                    </div>
                </div>

                {/* ── Panel derecho: formulario ── */}
                <div className="flex flex-1 flex-col items-center justify-center bg-background px-6 py-12">
                    <div className="w-full max-w-sm space-y-8">
                        {/* Logo mobile (solo < lg) */}
                        <div className="flex flex-col items-center gap-3 lg:hidden">
                            <CasaSheLogo variant="mark" tone="green" className="h-12 w-12" />
                            <p
                                className="font-body text-xs uppercase tracking-[3px]"
                                style={{ color: '#AE4836' }}
                            >
                                Portal de Coach
                            </p>
                        </div>

                        {/* Heading */}
                        <div className="space-y-1">
                            <h1 className="font-heading text-3xl" style={{ color: '#2E1B22' }}>
                                Bienvenida
                            </h1>
                            <p className="font-body text-sm text-muted-foreground">
                                Ingresa con tu número de coach o email.
                            </p>
                        </div>

                        {/* Form */}
                        <form onSubmit={submitLogin(onLogin)} className="space-y-5">
                            <div className="space-y-1.5">
                                <Label htmlFor="identifier" className="font-body text-xs uppercase tracking-wide text-muted-foreground">
                                    N.º de Coach / Email
                                </Label>
                                <div className="relative">
                                    <UserIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        id="identifier"
                                        type="text"
                                        autoComplete="username"
                                        placeholder="COACH-0001 o email@ejemplo.com"
                                        className="pl-10 font-body"
                                        {...regLogin('identifier')}
                                    />
                                </div>
                                {loginErr.identifier && (
                                    <p className="font-body text-xs text-destructive">{loginErr.identifier.message}</p>
                                )}
                            </div>

                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="password" className="font-body text-xs uppercase tracking-wide text-muted-foreground">
                                        Contraseña
                                    </Label>
                                    <button
                                        type="button"
                                        className="font-body text-xs text-muted-foreground underline-offset-2 hover:underline transition-colors"
                                        onClick={() => navigate('/instructor/access')}
                                    >
                                        ¿Olvidaste tu contraseña?
                                    </button>
                                </div>
                                <div className="relative">
                                    <Key className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        id="password"
                                        type="password"
                                        placeholder="••••••••"
                                        className="pl-10 font-body"
                                        {...regLogin('password')}
                                    />
                                </div>
                                {loginErr.password && (
                                    <p className="font-body text-xs text-destructive">{loginErr.password.message}</p>
                                )}
                            </div>

                            <Button
                                type="submit"
                                className="w-full font-body active:scale-[0.97] transition-transform duration-100"
                                disabled={loggingIn}
                            >
                                {loggingIn ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Ingresando…</>
                                ) : (
                                    'Iniciar sesión'
                                )}
                            </Button>
                        </form>

                        {/* Volver */}
                        <p className="text-center font-body text-xs text-muted-foreground">
                            <button
                                type="button"
                                onClick={() => navigate('/')}
                                className="underline-offset-2 hover:underline transition-colors"
                            >
                                Volver al sitio principal
                            </button>
                        </p>

                        {/* PWA install hint */}
                        {!isStandalone && (
                            <div className="rounded-xl border bg-card p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <Smartphone className="h-4 w-4 shrink-0 text-primary" />
                                    <p className="font-body text-xs font-semibold">Agrega el portal a tu celular</p>
                                </div>
                                <div className="mx-auto mb-3 flex w-fit rounded-full border bg-background p-0.5">
                                    {(['ios', 'android'] as const).map((os) => (
                                        <button
                                            key={os}
                                            type="button"
                                            onClick={() => setInstallOS(os)}
                                            className={`rounded-full px-4 py-1 font-body text-[11px] font-semibold transition-colors ${
                                                installOS === os
                                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                                    : 'text-muted-foreground hover:text-foreground'
                                            }`}
                                        >
                                            {os === 'ios' ? 'iPhone' : 'Android'}
                                        </button>
                                    ))}
                                </div>
                                <ol className="space-y-1.5">
                                    {(installOS === 'ios'
                                        ? [
                                              <>Abre en <strong>Safari</strong></>,
                                              <>Toca <strong>Compartir</strong> <Share className="inline h-3 w-3 text-primary" /></>,
                                              <>Elige <strong>«Agregar a inicio»</strong></>,
                                          ]
                                        : [
                                              <>Abre en <strong>Chrome</strong></>,
                                              <>Menú <MoreVertical className="inline h-3 w-3 text-primary" /> → <strong>Instalar app</strong></>,
                                          ]
                                    ).map((step, i) => (
                                        <li key={i} className="flex items-start gap-2 font-body text-[11px] text-foreground/70">
                                            <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                                                {i + 1}
                                            </span>
                                            <span>{step}</span>
                                        </li>
                                    ))}
                                </ol>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Dialog cambio de contraseña temporal ── */}
            <Dialog open={showChangePassword} onOpenChange={setShowChangePassword}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="font-heading text-xl">Cambiar contraseña temporal</DialogTitle>
                        <DialogDescription className="font-body">
                            Por seguridad, elige una contraseña nueva para continuar.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={submitPwd(onChangePassword)} className="space-y-4 pt-2">
                        {(
                            [
                                { id: 'currentPassword', label: 'Contraseña temporal', placeholder: 'Contraseña actual' },
                                { id: 'newPassword', label: 'Nueva contraseña', placeholder: 'Mínimo 8 caracteres' },
                                { id: 'confirmPassword', label: 'Confirmar contraseña', placeholder: 'Repite la contraseña' },
                            ] as const
                        ).map(({ id, label, placeholder }) => (
                            <div key={id} className="space-y-1.5">
                                <Label htmlFor={id} className="font-body text-xs uppercase tracking-wide text-muted-foreground">
                                    {label}
                                </Label>
                                <Input id={id} type="password" placeholder={placeholder} className="font-body" {...regPwd(id)} />
                                {pwdErr[id] && (
                                    <p className="font-body text-xs text-destructive">{pwdErr[id]?.message}</p>
                                )}
                            </div>
                        ))}
                        <Button type="submit" className="w-full font-body active:scale-[0.97] transition-transform duration-100" disabled={changingPwd}>
                            {changingPwd ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando…</> : 'Cambiar contraseña'}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
