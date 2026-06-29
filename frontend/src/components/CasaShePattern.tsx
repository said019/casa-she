/**
 * Patrón de marca Casa Shé — hojas y ramas orgánicas (el mismo motivo del manual
 * y de las tarjetas de membresía), como SVG escalable y recoloreable.
 *
 * - `base`   color de fondo del patrón.
 * - `accent` color de las hojas/ramas (usar un tono translúcido: oscuro sobre fondos
 *            claros, crema sobre fondos oscuros). Default: oscuro suave.
 * Se dibuja en un viewBox grande y se recorta (slice) para verse a gran escala.
 */
export function CasaShePattern({
  className = "",
  base,
  accent = "rgba(22,38,26,0.14)",
  style,
}: {
  className?: string;
  base?: string;
  accent?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 560 680"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      role="presentation"
    >
      {base && <rect width="560" height="680" fill={base} />}

      {/* Ramas — trazos orgánicos que se ramifican (extremos redondeados) */}
      <g fill="none" stroke={accent} strokeLinecap="round" strokeLinejoin="round">
        <path strokeWidth="30" d="M-30 250 C 120 230, 210 150, 300 330 C 380 490, 470 470, 600 430" />
        <path strokeWidth="26" d="M300 -30 C 330 120, 250 230, 300 330 C 345 430, 300 560, 350 720" />
        <path strokeWidth="20" d="M-30 520 C 110 500, 210 560, 300 470 C 360 410, 430 430, 470 350" />
        <path strokeWidth="18" d="M600 150 C 500 175, 410 150, 345 235 C 305 290, 250 300, 210 360" />
        <path strokeWidth="14" d="M300 330 C 235 360, 175 450, 150 580" />
        <path strokeWidth="13" d="M300 330 C 365 300, 440 305, 485 230" />
        <path strokeWidth="11" d="M150 250 C 200 300, 205 360, 165 420" />
        <path strokeWidth="9"  d="M470 470 C 430 520, 440 580, 500 620" />
        <path strokeWidth="8"  d="M210 360 C 250 410, 245 470, 290 520" />
      </g>

      {/* Hojas — blades tipo almendra, ligeramente translúcidas para que se fundan */}
      <g fill={accent}>
        <path d="M250 80 C 345 140, 345 300, 255 365 C 185 295, 180 165, 250 80 Z" />
        <path d="M120 360 C 215 330, 330 360, 365 445 C 270 470, 160 455, 120 360 Z" />
        <path d="M470 250 C 520 330, 500 440, 410 470 C 405 380, 415 300, 470 250 Z" />
        <path d="M300 470 C 380 510, 395 600, 330 660 C 285 595, 275 525, 300 470 Z" />
        <path d="M70 150 C 160 130, 250 175, 270 250 C 185 270, 95 235, 70 150 Z" />
        <path d="M520 470 C 560 540, 535 620, 470 645 C 470 565, 480 505, 520 470 Z" />
      </g>
    </svg>
  );
}
