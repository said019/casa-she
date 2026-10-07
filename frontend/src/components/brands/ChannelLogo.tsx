import { cn } from '@/lib/utils';
import { logoDeCanal, type CanalClave } from '@/lib/canales';

interface ChannelLogoProps {
    canal: CanalClave;
    /** Fondo sobre el que se pinta; elige la versión del logo. */
    fondo?: 'claro' | 'oscuro';
    /** Alto en px (el de TotalPass); otros canales se escalan. Mínimo 8. */
    alto?: number;
    className?: string;
}

/** Logo oficial de una plataforma. Va en lugar de su nombre en etiquetas, insignias, títulos y menú. */
export function ChannelLogo({ canal, fondo = 'claro', alto = 12, className }: ChannelLogoProps) {
    const logo = logoDeCanal(canal, fondo, alto);
    return (
        <span
            className={cn(
                'inline-flex shrink-0 items-center align-middle',
                logo.pastilla && 'rounded-full bg-white px-1.5 py-0.5',
                className,
            )}
        >
            <img src={logo.src} alt={logo.alt} draggable={false} className="block w-auto" style={{ height: logo.altoPx }} />
        </span>
    );
}
