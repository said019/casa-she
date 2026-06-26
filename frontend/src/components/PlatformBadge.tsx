/**
 * Distintivo de plataforma (Totalpass/Wellhub/Fitpass) para identificar en las reservas
 * a los alumnos con un plan interno. Se auto-oculta si no hay color (planes normales).
 */
export function PlatformBadge({ name, color }: { name?: string | null; color?: string | null }) {
  if (!name || !color) return null;
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
