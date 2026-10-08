import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import api, { getErrorMessage } from '@/lib/api';
import { ChannelLogo } from '@/components/brands/ChannelLogo';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    classId: string;
    className: string;
    onSuccess: () => void;
}

/** Alta de una socia de Fitpass que llega a clase con su identificación (sin cuenta en la app). */
export function RegisterFitpassAttendeeDialog({ isOpen, onClose, classId, className, onSuccess }: Props) {
    const [displayName, setDisplayName] = useState('');
    const [memberRef, setMemberRef] = useState('');
    const { toast } = useToast();
    const qc = useQueryClient();

    const register = useMutation({
        mutationFn: async () => {
            const { data } = await api.post('/partners/fitpass/attendees', {
                classId,
                displayName: displayName.trim(),
                fitpassMemberRef: memberRef.trim() || undefined,
            });
            return data;
        },
        onSuccess: () => {
            toast({ title: 'Asistente de Fitpass registrada' });
            qc.invalidateQueries({ queryKey: ['fitpass-attendees'] });
            qc.invalidateQueries({ queryKey: ['classes-fitpass-dia'] });
            onSuccess();
            handleClose();
        },
        onError: (err) => {
            toast({ variant: 'destructive', title: 'No se pudo registrar', description: getErrorMessage(err) });
        },
    });

    function handleClose() {
        setDisplayName('');
        setMemberRef('');
        onClose();
    }

    const canSubmit = displayName.trim().length >= 2 && !register.isPending;

    return (
        <Dialog open={isOpen} onOpenChange={(o) => !o && handleClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 font-heading">
                        Registrar asistente <ChannelLogo canal="fitpass" alto={12} />
                    </DialogTitle>
                    <DialogDescription>{className}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-1">
                        <Label htmlFor="display_name">Nombre de la socia</Label>
                        <Input
                            id="display_name"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder="Como aparece en su identificación"
                            autoFocus
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="member_ref">Nº de socia Fitpass (opcional)</Label>
                        <Input id="member_ref" value={memberRef} onChange={(e) => setMemberRef(e.target.value)} placeholder="FP-12345" />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={handleClose}>Cancelar</Button>
                    <Button disabled={!canSubmit} onClick={() => register.mutate()}>
                        {register.isPending ? 'Registrando…' : 'Registrar'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
