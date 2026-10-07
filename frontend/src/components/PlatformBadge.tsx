import { ChannelLogo } from '@/components/brands/ChannelLogo';
import { CANALES, canalDePlan } from '@/lib/canales';

/**
 * Distintivo de plataforma (Totalpass/Wellhub/Fitpass) para identificar en las reservas
 * a los alumnos con un plan interno. Se auto-oculta si no hay color (planes normales).
 * Si la plataforma está en el catálogo de canales, se muestra su logo oficial.
 */
export function PlatformBadge({ name, color }: { name?: string | null; color?: string | null }) {
  if (!name || !color) return null;
  const canal = canalDePlan(name);
  if (canal) {
    // h-4: el mismo alto que la pastilla de texto, para que el logo no quede pegado al renglón de abajo.
    return (
      <span className="inline-flex h-4 items-center" title={`Plataforma: ${CANALES[canal].nombre}`}>
        <ChannelLogo canal={canal} alto={9} />
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none"
      style={{ backgroundColor: `${color}1A`, color, border: `1px solid ${color}55` }}
      title={`Plataforma: ${name}`}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {name}
    </span>
  );
}
