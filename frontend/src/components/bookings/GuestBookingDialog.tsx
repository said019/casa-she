import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserPlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';

interface PlanOpt { id: string; name: string; is_internal?: boolean }

export function GuestBookingDialog({ classId, onDone }: { classId: string; onDone: () => void }) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [planId, setPlanId] = useState('');
    const { data: plans = [] } = useQuery<PlanOpt[]>({
        queryKey: ['plans-for-guest'],
        queryFn: async () => (await api.get('/plans')).data,
        enabled: open,
    });
    const sorted = [...plans].sort((a, b) => Number(!!b.is_internal) - Number(!!a.is_internal));
    const submit = useMutation({
        mutationFn: async (confirm?: boolean) => {
            const g = await api.post('/users/guest', { name, phone, email: email.trim() || undefined, planId, confirm });
            await api.post('/bookings/admin-book', { userId: g.data.user.id, classId });
            return g.data;
        },
        onSuccess: () => {
            toast.success('Invitado agendado');
            setOpen(false); setName(''); setPhone(''); setEmail(''); setPlanId('');
            onDone();
        },
        onError: (e: any) => {
            if (e?.response?.data?.code === 'HAS_ACTIVE_MEMBERSHIP') {
                if (window.confirm(`${e.response.data.error}\n\n¿Asignar otra membresía y agendar?`)) submit.mutate(true);
                return;
            }
            toast.error(getErrorMessage(e));
        },
    });
    const valid = name.trim().length >= 2 && phone.replace(/\D/g, '').length >= 10 && !!planId;
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm"><UserPlus className="h-4 w-4 mr-1" /> Agendar invitado</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader><DialogTitle>Agendar invitado</DialogTitle></DialogHeader>
                <div className="space-y-3">
                    <div className="space-y-1"><Label>Nombre</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
                    <div className="space-y-1"><Label>Celular</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10 dígitos" /></div>
                    <div className="space-y-1"><Label>Email (opcional)</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                    <div className="space-y-1">
                        <Label>Plan</Label>
                        <Select value={planId} onValueChange={setPlanId}>
                            <SelectTrigger><SelectValue placeholder="Elige un plan" /></SelectTrigger>
                            <SelectContent>
                                {sorted.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}{p.is_internal ? ' · interno' : ''}</SelectItem>))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                    <Button onClick={() => submit.mutate(undefined)} disabled={!valid || submit.isPending}>
                        {submit.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Crear y agendar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
