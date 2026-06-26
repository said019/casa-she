import { Link } from "react-router-dom";

export default function WalletClub() {
  return (
    <section className="border-b border-bmb-ink/15 bg-bmb-paper py-20 lg:py-24">
      <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
        <div className="border-b-2 border-bmb-ink pb-4">
          <div className="flex items-baseline justify-between gap-4">
            <span className="editorial-caption text-bmb-ink/45">Tu progreso</span>
            <span className="editorial-caption text-bmb-gold">N° 05</span>
          </div>
          <h2 className="mt-2 font-heading text-4xl italic text-bmb-ink lg:text-5xl">Wallet del club</h2>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="font-heading italic text-2xl text-bmb-ink leading-snug max-w-xl">
              Cada clase suma puntos. Cada semana sostenida, una racha. Cada racha, un beneficio.
            </p>
            <p className="mt-4 font-body text-base text-bmb-ink/70 leading-relaxed max-w-xl">
              El wallet no es gamificación. Es la credencial del studio: un registro de tu práctica que te abre puertas. Niveles Bronze, Silver y Gold.
            </p>
            <Link
              to="/login"
              className="mt-6 inline-flex border border-bmb-ink px-4 py-2 font-heading italic text-bmb-ink hover:bg-bmb-gold hover:text-bmb-ink hover:border-bmb-gold"
            >
              Entrar al wallet
            </Link>
          </div>

          <div className="border border-bmb-ink/20 bg-bmb-cream p-6">
            <p className="editorial-caption text-bmb-ink/55">Ejemplo</p>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <p className="editorial-caption-sm text-bmb-ink/55">Puntos</p>
                <p className="font-heading italic text-3xl sm:text-5xl text-bmb-gold leading-none tabular-nums">2,140</p>
              </div>
              <div>
                <p className="editorial-caption-sm text-bmb-ink/55">Racha</p>
                <p className="font-heading italic text-3xl sm:text-5xl text-bmb-ink leading-none tabular-nums">7</p>
                <p className="editorial-caption-sm text-bmb-ink/55 mt-1">días</p>
              </div>
            </div>
            <div className="mt-6 editorial-rule-dotted" />
            <p className="mt-3 font-heading italic text-base text-bmb-ink">Nivel <span className="text-bmb-deepgold">Gold</span></p>
          </div>
        </div>
      </div>
    </section>
  );
}
