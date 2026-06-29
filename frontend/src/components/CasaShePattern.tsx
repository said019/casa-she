/**
 * Patrón de marca Casa Shé — el patrón oficial del manual (hojas/ramas), como
 * overlay reutilizable y recoloreable. Asset: /casashe/patron.webp (líneas
 * doradas sobre transparente).
 *
 * Uso:
 *  - Por defecto pinta el patrón original (dorado/mostaza). `opacity` lo atenúa.
 *  - Si pasas `color`, recolorea el patrón a ese color usando el PNG como máscara
 *    (p. ej. crema sobre fondos oscuros, verde profundo sobre claros).
 *
 * Pensado para ir como capa absoluta dentro de un contenedor con posición y color:
 *   <div className="relative ..."> <CasaShePattern className="absolute inset-0 h-full w-full" /> ... </div>
 */
const PATRON = "/casashe/patron.webp";

export function CasaShePattern({
  className = "",
  color,
  opacity = 1,
  style,
}: {
  className?: string;
  /** Si se define, recolorea el patrón a este color (usa el patrón como máscara). */
  color?: string;
  opacity?: number;
  style?: React.CSSProperties;
}) {
  if (color) {
    return (
      <div
        aria-hidden="true"
        className={className}
        style={{
          backgroundColor: color,
          opacity,
          WebkitMaskImage: `url(${PATRON})`,
          maskImage: `url(${PATRON})`,
          WebkitMaskSize: "cover",
          maskSize: "cover",
          WebkitMaskPosition: "center",
          maskPosition: "center",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          ...style,
        }}
      />
    );
  }
  return (
    <img
      src={PATRON}
      alt=""
      aria-hidden="true"
      className={className}
      style={{ objectFit: "cover", opacity, ...style }}
    />
  );
}
