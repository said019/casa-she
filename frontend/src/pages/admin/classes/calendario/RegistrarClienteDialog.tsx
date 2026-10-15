import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ClienteMembresiasDialog, type ClienteAgenda } from './ClienteMembresiasDialog';

export function RegistrarClienteDialog({ open, onOpenChange, classId, onBooked, onTransaction }: {
    open: boolean; onOpenChange: (v: boolean) => void; classId: string;
    onBooked: (id: string) => void; onTransaction?: (name: string) => void;
}) {
    const qc = useQueryClient();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [cliente, setCliente] = useState<ClienteAgenda | null>(null);
    const [duplicate, setDuplicate] = useState(false);
    const create = useMutation({
        mutationFn: async () => (await api.post('/users', { displayName: name.trim(), email: email.trim(), phone: phone.trim(), acceptsCommunications: false })).data,
        onSuccess: async result => {
            setCliente(result.user ?? result);
            await Promise.all(['users', 'reception-clients', 'clients', 'candidatas'].map(key => qc.invalidateQueries({ queryKey: [key] })));
        },
        onError: (error: any) => {
            const data = error?.response?.data;
            if (error?.response?.status === 409 && data?.code === 'YA_EXISTE' && data.existingUser) {
                setDuplicate(true); setCliente(data.existingUser);
            }
        },
    });
    if (cliente) return <ClienteMembresiasDialog cliente={cliente} open={open} onOpenChange={onOpenChange} classId={classId} onBooked={onBooked} notice={duplicate ? 'El cliente ya existe. Puedes gestionar su membresía aquí.' : 'Cliente registrado. Puedes asignar su plan y ajustar los créditos.'} />;
    return <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Registrar cliente</DialogTitle><DialogDescription>Crea su cuenta; después puedes asignar un plan y reservar esta clase.</DialogDescription></DialogHeader>
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); create.mutate(); }}>
                <label className="block">Nombre completo<Input aria-label="Nombre completo" required minLength={2} value={name} onChange={e => setName(e.target.value)} /></label>
                <label className="block">Correo<Input aria-label="Correo" required type="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
                <label className="block">WhatsApp<Input aria-label="WhatsApp" type="tel" value={phone} onChange={e => setPhone(e.target.value)} /></label>
                {create.isError && !duplicate && <p role="alert">{getErrorMessage(create.error)}</p>}
                <Button type="submit" disabled={create.isPending}>Crear cliente</Button>
                {onTransaction && <Button type="button" variant="outline" onClick={() => { onOpenChange(false); onTransaction(name); }}>Registrar, cobrar e inscribir</Button>}
            </form>
        </DialogContent>
    </Dialog>;
}
