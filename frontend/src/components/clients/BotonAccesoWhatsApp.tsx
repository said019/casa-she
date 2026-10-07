import { useState } from 'react';
import { MessageCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import { enlaceAccesoWhatsApp } from '@/lib/whatsapp';
import { Button } from '@/components/ui/button';

interface Props {
    userId: string;
    nombre: string;
    telefono?: string | null;
    /** Si se conoce, el mensaje menciona el lugar que ya tiene. */
    clase?: { clase: string; fecha: string; hora: string } | null;
    className?: string;
    variant?: 'default' | 'outline';
    size?: 'default' | 'sm';
    /** "Mandar" la primera vez, "Reenviar" si ya se mandó uno. */
    etiqueta?: string;
}

/**
 * "Mandar acceso por WhatsApp": pide un link de acceso nuevo (revoca los anteriores) y abre
 * wa.me con el mensaje ya redactado, desde el WhatsApp de la recepcionista. Sin teléfono
 * utilizable copia el link para pegarlo donde sea.
 */
export function BotonAccesoWhatsApp({
    userId, nombre, telefono, clase, className, variant = 'outline', size = 'sm',
    etiqueta = 'Mandar acceso por WhatsApp',
}: Props) {
    const [cargando, setCargando] = useState(false);

    const mandar = async () => {
        setCargando(true);
        try {
            const { data } = await api.post<{ url: string; venceEl: string }>(`/users/${userId}/acceso`);
            const enlace = enlaceAccesoWhatsApp({ telefono, nombre, ...(clase ?? {}), url: data.url });
            if (enlace) {
                window.open(enlace, '_blank', 'noopener,noreferrer');
                toast.success('Link de acceso listo en WhatsApp. Vence en 7 días.');
            } else {
                await navigator.clipboard?.writeText(data.url).catch(() => undefined);
                toast.success('Sin WhatsApp utilizable: el link quedó copiado. Vence en 7 días.');
            }
        } catch (e) {
            toast.error(getErrorMessage(e));
        } finally {
            setCargando(false);
        }
    };

    return (
        <Button type="button" variant={variant} size={size} className={className} onClick={mandar} disabled={cargando}>
            {cargando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}
            {etiqueta}
        </Button>
    );
}
