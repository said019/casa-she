import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import axios from 'axios';
import api, { getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import type { AuthResponse } from '@/types/auth';
import AuthShell from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Lock, Eye, EyeOff, AlertTriangle } from 'lucide-react';

// Misma regla que el backend (ResetPasswordSchema): 8+, una mayúscula y un número.
const schema = z
    .object({
        password: z
            .string()
            .min(8, 'La contraseña debe tener al menos 8 caracteres')
            .regex(/[A-Z]/, 'Incluye al menos una mayúscula')
            .regex(/[0-9]/, 'Incluye al menos un número'),
        confirmPassword: z.string(),
    })
    .refine((d) => d.password === d.confirmPassword, {
        message: 'Las contraseñas no coinciden',
        path: ['confirmPassword'],
    });
type Form = z.infer<typeof schema>;

const fieldClass =
    'h-12 rounded-xl border-bmb-dark/15 bg-white/70 pl-11 pr-12 text-bmb-dark placeholder:text-bmb-dark/40 focus-visible:border-bmb-dark/45 focus-visible:ring-bmb-dark/15';

const MENSAJE_LINK_MUERTO = 'Este link ya no sirve. Pide uno nuevo en recepción.';

type Estado =
    | { fase: 'cargando' }
    | { fase: 'muerto' }
    | { fase: 'listo'; nombre: string };

function homeDe(role: string): string {
    if (role === 'admin' || role === 'super_admin') return '/admin/dashboard';
    if (role === 'instructor') return '/coach';
    if (role === 'reception') return '/reception';
    return '/app';
}

export default function Acceso() {
    const { token = '' } = useParams<{ token: string }>();
    const navigate = useNavigate();
    const setAuth = useAuthStore((s) => s.setAuth);
    const [estado, setEstado] = useState<Estado>({ fase: 'cargando' });
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [verClave, setVerClave] = useState(false);

    const { register, handleSubmit, formState: { errors } } = useForm<Form>({
        resolver: zodResolver(schema),
    });

    useEffect(() => {
        let vivo = true;
        api.get<{ nombre: string }>(`/auth/acceso/${encodeURIComponent(token)}`)
            .then((r) => { if (vivo) setEstado({ fase: 'listo', nombre: r.data.nombre }); })
            .catch(() => { if (vivo) setEstado({ fase: 'muerto' }); });
        return () => { vivo = false; };
    }, [token]);

    const onSubmit = async (data: Form) => {
        setEnviando(true);
        setError(null);
        try {
            const r = await api.post<AuthResponse>(`/auth/acceso/${encodeURIComponent(token)}`, {
                password: data.password,
            });
            setAuth(r.data.user, r.data.token);
            // replace: el link con el token no se queda en el historial.
            navigate(homeDe(r.data.user.role), { replace: true });
        } catch (err) {
            if (axios.isAxiosError(err) && err.response?.status === 410) {
                setEstado({ fase: 'muerto' });
            } else {
                setError(getErrorMessage(err));
            }
        } finally {
            setEnviando(false);
        }
    };

    if (estado.fase === 'cargando') {
        return (
            <AuthShell eyebrow="Casa Shé" title="Un momento..." subtitle="">
                <div className="flex justify-center py-6" role="status" aria-label="Cargando">
                    <Loader2 className="h-6 w-6 animate-spin text-bmb-dark/60" />
                </div>
            </AuthShell>
        );
    }

    if (estado.fase === 'muerto') {
        return (
            <AuthShell
                eyebrow="Casa Shé"
                title="Link no disponible"
                subtitle={MENSAJE_LINK_MUERTO}
                footer={
                    <Link to="/login" className="font-semibold text-bmb-dark transition-colors hover:text-bmb-dark/70">
                        Ya tengo contraseña, iniciar sesión
                    </Link>
                }
            >
                <div className="flex flex-col items-center gap-6 text-center">
                    <div className="rounded-full bg-bmb-dark/10 p-3">
                        <AlertTriangle className="h-8 w-8 text-bmb-dark" />
                    </div>
                </div>
            </AuthShell>
        );
    }

    const primerNombre = estado.nombre.trim().split(/\s+/)[0];
    return (
        <AuthShell
            eyebrow="Casa Shé"
            title={`Hola ${primerNombre}, crea tu contraseña`}
            subtitle="Con ella entras a ver tus clases y reservar desde tu celular."
        >
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                {error && (
                    <Alert variant="destructive" className="rounded-xl">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                <div className="space-y-2">
                    <Label htmlFor="password">Contraseña</Label>
                    <div className="relative">
                        <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-bmb-dark/40" />
                        <Input
                            id="password"
                            type={verClave ? 'text' : 'password'}
                            autoComplete="new-password"
                            placeholder="••••••••"
                            className={fieldClass}
                            {...register('password')}
                            disabled={enviando}
                        />
                        <button
                            type="button"
                            onClick={() => setVerClave(!verClave)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-bmb-dark/48 transition-transform duration-150 hover:text-bmb-dark active:scale-95"
                            aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        >
                            {verClave ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                    </div>
                    <p className="text-xs text-bmb-dark/60">Mínimo 8 caracteres, con una mayúscula y un número.</p>
                    {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirma tu contraseña</Label>
                    <div className="relative">
                        <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-bmb-dark/40" />
                        <Input
                            id="confirmPassword"
                            type={verClave ? 'text' : 'password'}
                            autoComplete="new-password"
                            placeholder="••••••••"
                            className={fieldClass}
                            {...register('confirmPassword')}
                            disabled={enviando}
                        />
                    </div>
                    {errors.confirmPassword && (
                        <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
                    )}
                </div>

                <Button
                    type="submit"
                    className="h-12 w-full rounded-full bg-bmb-dark font-body text-bmb-cream hover:bg-bmb-dark/90"
                    disabled={enviando}
                >
                    {enviando ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</>
                    ) : (
                        'Crear contraseña y entrar'
                    )}
                </Button>
            </form>
        </AuthShell>
    );
}
