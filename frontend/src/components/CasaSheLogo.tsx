/**
 * Logo de marca Casa Shé — usa los activos oficiales en alta calidad.
 * - `mark`: monograma oficial (símbolo entrelazado del manual de marca).
 * - `full`: wordmark oficial "CASA SHÉ" + monograma.
 * Color: por defecto Verde Casa (sobre fondos claros). Para fondos oscuros/de color,
 * pasar `tone="cream"` y se usa la versión crema (Avena).
 * El tamaño se controla con clases (h-9 w-9, etc.); se mantiene la proporción (object-contain).
 */

const MONOGRAM = "/casashe/logo-monogram.png";
const MONOGRAM_CREAM = "/casashe/logo-monogram-cream.png";
const WORDMARK = "/casashe/logo-wordmark.png";
const WORDMARK_CREAM = "/casashe/logo-wordmark-cream.png";

type Tone = "green" | "cream";
type Props = {
  variant?: "full" | "mark";
  tone?: Tone;
  className?: string;
};

export function CasaSheMark({ className = "", tone = "green" }: { className?: string; tone?: Tone }) {
  return (
    <img
      src={tone === "cream" ? MONOGRAM_CREAM : MONOGRAM}
      alt=""
      aria-hidden="true"
      className={`object-contain ${className}`}
    />
  );
}

export default function CasaSheLogo({ variant = "full", tone = "green", className = "" }: Props) {
  if (variant === "mark") {
    return <CasaSheMark className={className} tone={tone} />;
  }
  return (
    <img
      src={tone === "cream" ? WORDMARK_CREAM : WORDMARK}
      alt="Casa Shé"
      className={`object-contain ${className || "h-7 w-auto"}`}
    />
  );
}
