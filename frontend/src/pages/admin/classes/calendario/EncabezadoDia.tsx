import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface EncabezadoDiaProps {
    fecha: Date;
    /** 'Lun', 'Mar'… */
    etiqueta: string;
    esHoy: boolean;
    cerrado: boolean;
    motivoCierre?: string;
    /** "2 clases · 4 libres" o "Sin clases". */
    resumen: string;
    onClick: () => void;
}

/** Encabezado de una columna de la semana. Clic: nueva clase ese día (la Entrega 3 lo usará para seleccionar el día). */
export function EncabezadoDia({ fecha, etiqueta, esHoy, cerrado, motivoCierre, resumen, onClick }: EncabezadoDiaProps) {
    const clave = format(fecha, 'yyyy-MM-dd');
    return (
        <button
            type="button"
            onClick={onClick}
            data-testid={`encabezado-${clave}`}
            title={`Agregar una clase el ${format(fecha, "EEEE d 'de' MMMM", { locale: es })}`}
            className={cn(
                'flex h-[68px] w-full flex-col items-start justify-center gap-0.5 border-b border-casa-arena px-2.5 py-2 text-left transition-colors',
                'hover:bg-casa-verde/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-casa-verde',
                esHoy ? 'bg-casa-verde/[0.07]' : 'bg-[hsl(var(--admin-panel))]',
            )}
        >
            <span className="flex items-baseline gap-1.5">
                <span className="text-xs text-casa-ciruela/70">{etiqueta}</span>
                <span className={cn('font-heading text-[26px] leading-none tabular-nums', esHoy ? 'text-casa-verde' : 'text-casa-ciruela')}>
                    {format(fecha, 'd')}
                </span>
                {esHoy && <span className="rounded-full bg-casa-verde px-2 py-0.5 text-[11px] font-semibold text-casa-avena">Hoy</span>}
                {cerrado && <Badge variant="destructive" className="rounded-full px-2 py-0 text-[10px]">Cerrado</Badge>}
            </span>
            <span className={cn('max-w-full truncate text-[11.5px]', cerrado ? 'text-destructive' : 'text-casa-ciruela/70')}>
                {cerrado ? motivoCierre || 'Studio cerrado' : resumen}
            </span>
        </button>
    );
}
