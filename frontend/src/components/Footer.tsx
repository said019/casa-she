import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="border-t border-bmb-ink/12 bg-bmb-paper text-bmb-ink py-16">
      <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
        <div className="flex items-baseline justify-between border-b border-bmb-ink/15 pb-3 editorial-caption text-bmb-ink/55">
          <span>Colofón</span>
          <span>Casa Shé · La comunidad es la medicina</span>
        </div>

        <div className="mt-10 grid gap-10 md:grid-cols-3">
          <div>
            <p className="editorial-caption text-bmb-ink/55">Studio</p>
            <p className="mt-2 font-heading italic text-3xl text-bmb-ink">Casa Shé</p>
            <p className="mt-3 font-body text-sm text-bmb-ink/70">Alfonso Reyes 131 — Condesa, CDMX</p>
          </div>

          <div>
            <p className="editorial-caption text-bmb-ink/55">Enlaces</p>
            <ul className="mt-2 space-y-1 font-heading italic text-base">
              <li><Link to="/privacy" className="hover:text-bmb-gold">Privacidad</Link></li>
              <li><Link to="/terms" className="hover:text-bmb-gold">Términos</Link></li>
              <li><Link to="/cancellation-policy" className="hover:text-bmb-gold">Cancelación</Link></li>
            </ul>
          </div>

          <div>
            <p className="editorial-caption text-bmb-ink/55">Contacto</p>
            <p className="mt-2 font-body text-sm text-bmb-ink/85">casashecondesa@gmail.com</p>
            <p className="mt-1 font-body text-sm text-bmb-ink/85">@casashe.mx</p>
          </div>
        </div>

        <div className="mt-12 editorial-rule-dotted opacity-25" />
        <p className="mt-4 editorial-caption text-bmb-ink/40 text-center">
          Casa Shé · MMXXVI · Condesa, Ciudad de México
        </p>
      </div>
    </footer>
  );
}
