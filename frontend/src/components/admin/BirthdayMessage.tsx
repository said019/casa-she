import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import { normalizarTelefono } from '@/lib/whatsapp';

export function BirthdayMessage({ client }: { client: { id: string; display_name: string; phone?: string | null } }) {
    const [message, setMessage] = useState('');
    const inputId = useId();
    const phone = normalizarTelefono(client.phone);
    const name = client.display_name.trim().split(/\s+/)[0] || 'querida alumna';
    return <Dialog onOpenChange={open => {
        if (open) setMessage(`¡Feliz cumpleaños, ${name}! 🎂✨\n\nEn Casa Shé te deseamos un nuevo año lleno de bienestar, alegría y momentos para ti. Gracias por ser parte de nuestra comunidad. 💚\n\nCon cariño, el equipo de Casa Shé.`);
    }}>
        <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0"
                title={`Felicitar a ${client.display_name} por WhatsApp`}
                aria-label={`Felicitar a ${client.display_name} por WhatsApp`}>
                <WhatsAppIcon className="h-5 w-5" />
            </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg">
            <DialogHeader>
                <DialogTitle>Felicitar a {client.display_name}</DialogTitle>
                <DialogDescription>Personaliza la felicitación. Se abrirá WhatsApp para que revises y envíes el mensaje.</DialogDescription>
            </DialogHeader>
            <label htmlFor={inputId} className="text-sm font-medium">Mensaje de cumpleaños</label>
            <Textarea id={inputId} value={message} onChange={e => setMessage(e.target.value)} rows={8} maxLength={2000} />
            {!phone && <p className="text-sm text-muted-foreground">No tiene un WhatsApp válido. <Link className="underline" to={`/admin/members/${client.id}`}>Actualizar teléfono en su perfil</Link>.</p>}
            <DialogFooter>
                {phone && message.trim() ? <Button asChild className="gap-2">
                    <a href={`https://wa.me/${phone}?text=${encodeURIComponent(message.trim())}`} target="_blank" rel="noopener noreferrer">
                        <WhatsAppIcon className="h-5 w-5" />Abrir WhatsApp
                    </a>
                </Button> : <Button disabled>Abrir WhatsApp</Button>}
            </DialogFooter>
        </DialogContent>
    </Dialog>;
}
