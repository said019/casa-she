import { Link } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const STATS = [
  { value: "6", label: "disciplinas" },
  { value: "6–7", label: "lugares por clase" },
  { value: "Condesa", label: "Ciudad de México" },
];

export default function Hero() {
  const today = new Date();
  return (
    <section className="relative min-h-[88svh] overflow-hidden bg-bmb-dark text-bmb-cream lg:min-h-[92svh]">
      {/* Foto real del studio (Condesa) detrás del titular */}
      <div className="absolute inset-0">
        <img
          src="/studio/salon.webp"
          alt="Salón de Casa Shé, Condesa"
          className="h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(42,33,24,0.62)_0%,rgba(42,33,24,0.34)_38%,rgba(42,33,24,0.86)_100%)]" />
      </div>

      <div className="relative z-10 flex min-h-[88svh] flex-col justify-end px-5 pb-12 pt-28 sm:px-8 lg:min-h-[92svh] lg:px-12 lg:pb-16">
        <div className="mx-auto w-full max-w-[1440px]">
          {/* Masthead editorial */}
          <div className="flex items-baseline justify-between border-b border-bmb-cream/25 pb-3 editorial-caption text-bmb-cream/70">
            <span>Casa Shé — Condesa, CDMX</span>
            <span>{format(today, "MMMM", { locale: es })} · MMXXVI</span>
          </div>

          {/* Titular cálido con tipografía editorial */}
          <h1 className="mt-9 font-heading text-bmb-cream text-[clamp(2.8rem,8vw,6.25rem)] leading-[0.95] tracking-[-0.01em]">
            Vuelve a<br />
            <span className="italic text-bmb-gold">ti misma</span>.
          </h1>

          <p className="mt-6 max-w-xl font-heading italic text-lg leading-relaxed text-bmb-cream/85 lg:text-xl">
            Pilates Mat, Barre, Sculpt, Yoga y Salsa. Una casa para moverte, nutrirte y
            reconectar con tu cuerpo en comunidad. Aquí, la comunidad es la medicina.
          </p>

          {/* CTAs claros */}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/login"
              className="inline-flex items-center justify-center border border-bmb-gold bg-bmb-gold px-7 py-3.5 font-heading italic text-base text-bmb-ink transition-colors hover:bg-bmb-deepgold hover:border-bmb-deepgold"
            >
              Reservar mi clase
            </Link>
            <a
              href="#horarios"
              className="inline-flex items-center justify-center border border-bmb-cream/50 px-7 py-3.5 font-heading italic text-base text-bmb-cream transition-colors hover:bg-bmb-cream/10"
            >
              Ver los horarios ↓
            </a>
          </div>

          {/* Barra de stats */}
          <div className="mt-12 grid max-w-2xl grid-cols-1 sm:grid-cols-3 border border-bmb-cream/20 lg:mt-14">
            {STATS.map((s, i) => (
              <div
                key={s.label}
                className={`px-4 py-5 sm:px-6 ${i > 0 ? "border-l border-bmb-cream/20" : ""}`}
              >
                <span className="block font-heading italic text-2xl sm:text-4xl text-bmb-gold tabular-nums leading-none">
                  {s.value}
                </span>
                <span className="mt-1.5 block editorial-caption text-bmb-cream/65">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
