import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import CasaSheLogo from "./CasaSheLogo";

const LINKS = [
  { href: "#horarios", label: "Horarios" },
  { href: "#modalidades", label: "Clases" },
  { href: "#equipo", label: "Equipo" },
  { href: "#planes", label: "Planes" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  return (
    <nav className="sticky top-0 z-30 border-b border-bmb-ink/15 bg-bmb-cream/95 backdrop-blur-sm pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-4 sm:px-8 lg:px-12">
        <Link to="/" aria-label="Casa Shé" className="flex items-center text-bmb-gold">
          <CasaSheLogo variant="full" />
        </Link>

        {/* Desktop: links + Entrar */}
        <div className="hidden items-center gap-8 lg:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="editorial-caption text-bmb-ink/75 hover:text-bmb-deepgold">
              {l.label}
            </a>
          ))}
          <Link
            to="/login"
            className="border border-bmb-ink px-4 py-2 font-heading italic text-sm text-bmb-ink hover:bg-bmb-gold hover:text-bmb-ink hover:border-bmb-gold"
          >
            Entrar
          </Link>
        </div>

        {/* Móvil: botón Entrar siempre visible + hamburger solo para los links de sección */}
        <div className="flex items-center gap-3 lg:hidden">
          <Link
            to="/login"
            className="border border-bmb-gold bg-bmb-gold px-4 py-1.5 font-heading italic text-sm text-bmb-ink"
          >
            Entrar
          </Link>
          <button
            className="flex h-11 w-11 items-center justify-center rounded-md text-bmb-ink hover:bg-bmb-ink/10"
            onClick={() => setOpen(!open)}
            aria-label="Abrir menú"
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-bmb-ink/15 bg-bmb-cream lg:hidden">
          <div className="flex flex-col px-5 py-2">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="editorial-caption py-3 text-bmb-ink/80 hover:text-bmb-deepgold"
              >
                {l.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
