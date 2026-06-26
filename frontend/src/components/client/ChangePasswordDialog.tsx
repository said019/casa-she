import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api, { getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Eye, EyeOff } from 'lucide-react';

const schema = z
    .object({
        currentPassword: z.string().min(1, 'Ingresa tu contraseña actual'),
        newPassword: z
            .string()
            .min(6, 'Mínimo 6 caracteres')
            .max(100, 'Máximo 100 caracteres'),
        confirmPassword: z.string().min(1, 'Confirma la nueva contraseña'),
    })
    .refine((d) => d.newPassword === d.confirmPassword, {
        path: ['confirmPassword'],
        message: 'Las contraseñas no coinciden',
    })
    .refine((d) => d.newPassword !== d.currentPassword, {
        path: ['newPassword'],
        message: 'La nueva contraseña debe ser distinta a la actual',
    });

type FormValues = z.infer<typeof schema>;

interface ChangePasswordDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
    const { toast } = useToast();
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors, isSubmitting },
    } = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
    });

    // Reset al abrir/cerrar
    useEffect(() => {
        if (!open) {
            reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
            setShowCurrent(false);
            setShowNew(false);
            setShowConfirm(false);
        }
    }, [open, reset]);

    const mutation = useMutation({
        mutationFn: async (data: FormValues) => {
            await api.post('/auth/change-password', {
                currentPassword: data.currentPassword,
                newPassword: data.newPassword,
            });
        },
        onSuccess: () => {
            toast({
                title: 'Contraseña actualizada',
                description: 'Tu nueva contraseña está activa. Úsala en tu próximo inicio de sesión.',
            });
            onOpenChange(false);
        },
        onError: (error) => {
            toast({
                variant: 'destructive',
                title: 'No se pudo cambiar la contraseña',
                description: getErrorMessage(error),
            });
        },
    });

    const onSubmit = (data: FormValues) => mutation.mutate(data);

    const busy = isSubmitting || mutation.isPending;

    return (
        <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Cambiar contraseña</DialogTitle>
                    <DialogDescription>
                        Por seguridad, te pediremos tu contraseña actual antes de guardar la nueva.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" autoComplete="off">
                    <div className="space-y-2">
                        <Label htmlFor="currentPassword">Contraseña actual</Label>
                        <div className="relative">
                            <Input
                                id="currentPassword"
                                type={showCurrent ? 'text' : 'password'}
                                autoComplete="current-password"
                                {...register('currentPassword')}
                                disabled={busy}
                            />
                            <button
                                type="button"
                                onClick={() => setShowCurrent((v) => !v)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                                tabIndex={-1}
                                aria-label={showCurrent ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                            >
                                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                        {errors.currentPassword && (
                            <p className="text-xs text-destructive">{errors.currentPassword.message}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="newPassword">Nueva contraseña</Label>
                        <div className="relative">
                            <Input
                                id="newPassword"
                                type={showNew ? 'text' : 'password'}
                                autoComplete="new-password"
                                {...register('newPassword')}
                                disabled={busy}
                            />
                            <button
                                type="button"
                                onClick={() => setShowNew((v) => !v)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                                tabIndex={-1}
                                aria-label={showNew ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                            >
                                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                        {errors.newPassword ? (
                            <p className="text-xs text-destructive">{errors.newPassword.message}</p>
                        ) : (
                            <p className="text-xs text-muted-foreground">Mínimo 6 caracteres.</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="confirmPassword">Confirmar nueva contraseña</Label>
                        <div className="relative">
                            <Input
                                id="confirmPassword"
                                type={showConfirm ? 'text' : 'password'}
                                autoComplete="new-password"
                                {...register('confirmPassword')}
                                disabled={busy}
                            />
                            <button
                                type="button"
                                onClick={() => setShowConfirm((v) => !v)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                                tabIndex={-1}
                                aria-label={showConfirm ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                            >
                                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                        {errors.confirmPassword && (
                            <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
                        )}
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={busy}>
                            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Guardar
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
