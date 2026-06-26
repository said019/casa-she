import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { UserCog, Loader2, Save, KeyRound } from 'lucide-react';
import { ChangePasswordDialog } from '@/components/client/ChangePasswordDialog';

/**
 * "Mi perfil" para recepción: la propia recepcionista edita su nombre, correo y
 * teléfono. Usa PUT /users/:id (el backend permite que el usuario edite lo suyo).
 */
export function MyProfileDialog() {
    const qc = useQueryClient();
    const [open, setOpen] = useState(false);
    const [pwdOpen, setPwdOpen] = useState(false);
    const [form, setForm] = useState({ displayName: '', email: '', phone: '' });

    const { data: me } = useQuery<{ id: string; display_name?: string; email?: string; phone?: string }>({
        queryKey: ['me'],
        queryFn: async () => (await api.get('/auth/me')).data?.user ?? (await api.get('/auth/me')).data,
    });

    const openDialog = () => {
        setForm({
            displayName: me?.display_name || '',
            email: me?.email || '',
            phone: me?.phone || '',
        });
        setOpen(true);
    };

    const save = useMutation({
        mutationFn: async () => api.put(`/users/${me?.id}`, {
            displayName: form.displayName.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
        }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['me'] });
            toast.success('Perfil actualizado');
            setOpen(false);
        },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    return (
        <>
            <Button
                variant="ghost"
                size="icon"
                onClick={openDialog}
                className="h-10 w-10 rounded-full border border-balance-sand/65 bg-balance-cream/70 text-balance-dark transition-all hover:bg-balance-olive hover:text-balance-cream active:scale-[0.96]"
                aria-label="Mi perfil"
            >
                <UserCog className="h-[18px] w-[18px]" />
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Mi perfil</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <Label htmlFor="mp-name">Nombre</Label>
                            <Input id="mp-name" value={form.displayName}
                                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                                placeholder="Nombre" />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="mp-email">Correo</Label>
                            <Input id="mp-email" type="email" value={form.email}
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                                placeholder="correo@ejemplo.com" />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="mp-phone">Teléfono</Label>
                            <Input id="mp-phone" value={form.phone}
                                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                placeholder="55 1234 5678" />
                        </div>
                        <div className="pt-1">
                            <Button type="button" variant="outline" className="w-full justify-start"
                                onClick={() => { setOpen(false); setPwdOpen(true); }}>
                                <KeyRound className="h-4 w-4 mr-2" /> Cambiar contraseña
                            </Button>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                        <Button onClick={() => save.mutate()} disabled={save.isPending || !form.displayName.trim()}>
                            {save.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                            Guardar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <ChangePasswordDialog open={pwdOpen} onOpenChange={setPwdOpen} />
        </>
    );
}
