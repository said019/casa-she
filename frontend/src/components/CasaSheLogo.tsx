/**
 * Logo de marca Casa Shé.
 * - `mark`: monograma de 4 pétalos (quatrefoil de trazos entrelazados, estilo del
 *   símbolo SS del manual de marca). Placeholder de línea fina hasta tener el SVG oficial.
 * - `full`: monograma + wordmark "CASA SHÉ" en Instrument Serif.
 * Hereda el color vía `currentColor`, así que se controla con clases de texto
 * (p.ej. `text-bmb-gold` = Verde Casa, `text-bmb-cream` = Avena).
 */

type Props = {
  variant?: "full" | "mark";
  className?: string;
};

export function CasaSheMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      aria-hidden="true"
      className={className}
    >
      <circle cx="32" cy="20" r="11.5" />
      <circle cx="44" cy="32" r="11.5" />
      <circle cx="32" cy="44" r="11.5" />
      <circle cx="20" cy="32" r="11.5" />
    </svg>
  );
}

export default function CasaSheLogo({ variant = "full", className = "" }: Props) {
  if (variant === "mark") {
    return <CasaSheMark className={className} />;
  }
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        className="font-heading tracking-[0.18em] leading-none"
        style={{ fontSize: "1.5rem" }}
      >
        CASA SHÉ
      </span>
      <CasaSheMark className="h-6 w-6" />
    </span>
  );
}
