import { ChannelLogo } from '@/components/brands/ChannelLogo';
import { ChannelDot, PuntoLugar } from '@/components/brands/ChannelDot';
import { canalesConectados } from '@/lib/canales';
import { COLOR_ALUMNA_POR_DEFECTO } from './colores';
import { ANILLO_LIBRE_CLARO } from './lugares';

/** Qué es cada punto: alumna de Casa Shé, socia de cada plataforma conectada (con su logo) y lugar libre. */
export function LeyendaLugares() {
    return (
        <ul aria-label="Leyenda de lugares" className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <li className="flex items-center gap-1.5">
                <PuntoLugar relleno={COLOR_ALUMNA_POR_DEFECTO} anillo={COLOR_ALUMNA_POR_DEFECTO} tamano={10} />
                Alumna
            </li>
            {canalesConectados().map((c) => (
                <li key={c.clave} className="flex items-center gap-1.5">
                    <ChannelDot canal={c.clave} tamano={10} />
                    Socia <ChannelLogo canal={c.clave} alto={10} />
                </li>
            ))}
            <li className="flex items-center gap-1.5">
                <PuntoLugar relleno="transparent" anillo={ANILLO_LIBRE_CLARO} tamano={10} />
                Libre
            </li>
        </ul>
    );
}
