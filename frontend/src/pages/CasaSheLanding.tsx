import { Link } from "react-router-dom";
import { useEffect, useState } from "react";

/**
 * Landing público de Casa Shé — réplica fiel de https://casashe.mx/
 * Estética editorial: crema #FEF7E6 + café #402B1C, display Cormorant Garamond + cuerpo Baskervville.
 * CTAs conectados al registro/checkout real del sistema.
 */

const CREAM = "#FEF7E6";
const BROWN = "#402B1C";

const display = "font-['Cormorant_Garamond']";
const body = "font-['Baskervville']";

type Card = {
  title: string;
  img: string;
  price: string;
  was?: string;
  hint: string;
  oferta?: boolean;
};

const CARDS: Card[] = [
  { title: "MEMBRESÍA SHE BLACK", img: "/casashe/card-black.jpeg", price: "$4,200", was: "$4,800", hint: "24 créditos · acceso total", oferta: true },
  { title: "MEMBRESÍA 360", img: "/casashe/card-360.jpeg", price: "$3,600", was: "$3,800", hint: "16 créditos al mes", oferta: true },
  { title: "PAQUETE 12 CLASES", img: "/casashe/card-12.jpeg", price: "$2,880", hint: "12 créditos · vigencia 1 mes" },
  { title: "PAQUETE 8 CLASES", img: "/casashe/card-8.jpeg", price: "$2,000", hint: "8 créditos · vigencia 1 mes" },
  { title: "PAQUETE 5 CLASES", img: "/casashe/card-5.jpeg", price: "$1,300", hint: "5 créditos · vigencia 1 mes" },
  { title: "CLASE SUELTA", img: "/casashe/card-suelta.jpeg", price: "$280", was: "$300", hint: "1 clase drop-in", oferta: true },
  { title: "CLASE MUESTRA", img: "/casashe/card-muestra.jpeg", price: "$150", hint: "Tu primera vez en casa" },
];

const PILLARS = [
  {
    eyebrow: "Pilates Mat · Yoga · Aeroyoga · Telas",
    title: "Movimiento",
    img: "/casashe/pilates.jpg",
    text: "Desde la precisión de Pilates Mat hasta la intensidad transformadora de Esculpe, nuestras clases fortalecen cada parte de tu cuerpo. Complementamos con la serenidad del Yoga y Aeroyoga, cerrando el círculo con la expresión artística de Telas.",
  },
  {
    eyebrow: "Diseña tu estilo de vida",
    title: "Nutrición Integral",
    img: "/casashe/nutrition.jpg",
    text: "Más que una dieta, es diseñar un estilo de vida que nutra tus metas. Nuestra especialista te acompañará en un proceso personalizado para sanar tu relación con la comida, optimizar tu energía y elegir lo mejor para tu cuerpo.",
  },
  {
    eyebrow: "Restaura y potencia tu cuerpo",
    title: "Cuidado Especializado",
    img: "/casashe/spa.jpg",
    text: "Masajes reductivos para definir tu silueta, drenaje linfático para desintoxicar y desinflamar, y faciales personalizados que devuelven la luminosidad y vitalidad a tu piel. El toque final para consentirte.",
  },
];

const NAV = [
  { label: "Inicio", href: "#inicio" },
  { label: "Servicios", href: "#servicios" },
  { label: "Fuel Bar", href: "#bar" },
  { label: "Nosotras", href: "#nosotras" },
  { label: "Contacto", href: "#contacto" },
];

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 transition-all duration-300"
      style={{
        backgroundColor: scrolled ? CREAM : "transparent",
        boxShadow: scrolled ? "0 1px 0 rgba(64,43,28,0.10)" : "none",
      }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a
          href="#inicio"
          className={`${display} text-2xl tracking-[0.35em] transition-colors`}
          style={{ color: scrolled ? BROWN : CREAM }}
        >
          CASA&nbsp;SHÉ
        </a>
        <nav className={`${body} hidden items-center gap-8 text-[13px] uppercase tracking-[0.18em] md:flex`}>
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="transition-opacity hover:opacity-60"
              style={{ color: scrolled ? BROWN : CREAM }}
            >
              {n.label}
            </a>
          ))}
          <Link
            to="/login"
            className="rounded-full border px-5 py-2 text-[12px] tracking-[0.2em] transition-colors"
            style={{
              borderColor: scrolled ? BROWN : CREAM,
              color: scrolled ? BROWN : CREAM,
            }}
          >
            ENTRAR
          </Link>
        </nav>
        <Link
          to="/login"
          className={`${body} text-[12px] uppercase tracking-[0.2em] md:hidden`}
          style={{ color: scrolled ? BROWN : CREAM }}
        >
          Entrar
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="inicio" className="relative flex min-h-screen items-center justify-center overflow-hidden">
      <img
        src="/casashe/hero.png"
        alt="Interior de Casa Shé — estudio en la Condesa"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(64,43,28,0.55)" }} />
      <div className="relative z-10 px-6 text-center" style={{ color: CREAM }}>
        <p className={`${body} mb-6 text-[13px] uppercase tracking-[0.5em]`}>Wellness Hub</p>
        <h1 className={`${display} text-[clamp(4.5rem,16vw,11rem)] font-light leading-[0.9] tracking-[0.04em]`}>
          CASA SHÉ
        </h1>
        <p className={`${body} mx-auto mt-6 max-w-xl text-base tracking-[0.12em] sm:text-lg`}>
          Pilates · Nutrición · Community · Talleres · Salsa
        </p>
        <p className={`${body} mt-2 text-sm tracking-[0.18em] opacity-80`}>
          Alfonso Reyes 131, Condesa · CDMX
        </p>
        <a
          href="#paquetes"
          className={`${body} mt-10 inline-block rounded-full px-9 py-3.5 text-[13px] uppercase tracking-[0.28em] transition-all hover:scale-[1.03]`}
          style={{ backgroundColor: CREAM, color: BROWN }}
        >
          Descubre nuestros paquetes
        </a>
      </div>
    </section>
  );
}

function Paquetes() {
  return (
    <section id="paquetes" className="px-6 py-24" style={{ backgroundColor: CREAM }}>
      <div className="mx-auto max-w-6xl">
        <div className="mb-14 text-center">
          <p className={`${body} text-[13px] uppercase tracking-[0.4em]`} style={{ color: BROWN, opacity: 0.6 }}>
            Elige tu camino
          </p>
          <h2 className={`${display} mt-3 text-5xl font-light tracking-wide`} style={{ color: BROWN }}>
            Nuestros Paquetes
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((c) => (
            <article
              key={c.title}
              className="group flex flex-col overflow-hidden rounded-2xl bg-white/60 ring-1 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              style={{ borderColor: "rgba(64,43,28,0.10)", boxShadow: "0 1px 0 rgba(64,43,28,0.06)" }}
            >
              <div className="relative aspect-square overflow-hidden">
                <img
                  src={c.img}
                  alt={c.title}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                {c.oferta && (
                  <span
                    className={`${body} absolute left-4 top-4 rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.2em]`}
                    style={{ backgroundColor: BROWN, color: CREAM }}
                  >
                    Oferta
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col items-center px-6 py-7 text-center">
                <h3 className={`${body} text-lg uppercase tracking-[0.14em]`} style={{ color: BROWN }}>
                  {c.title}
                </h3>
                <p className={`${body} mt-1 text-[13px] tracking-wide`} style={{ color: BROWN, opacity: 0.55 }}>
                  {c.hint}
                </p>
                <div className={`${display} mt-4 flex items-baseline justify-center gap-2`}>
                  {c.was && (
                    <span className="text-lg line-through" style={{ color: BROWN, opacity: 0.4 }}>
                      {c.was}
                    </span>
                  )}
                  <span className="text-4xl font-medium" style={{ color: BROWN }}>
                    {c.price}
                  </span>
                </div>
                <Link
                  to="/register"
                  className={`${body} mt-6 w-full rounded-full py-3 text-[12px] uppercase tracking-[0.24em] transition-colors`}
                  style={{ backgroundColor: BROWN, color: CREAM }}
                >
                  Comprar
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Servicios() {
  return (
    <section id="servicios" className="px-6 py-24" style={{ backgroundColor: "#F6EFDD" }}>
      <div className="mx-auto max-w-6xl">
        <div className="mb-20 text-center">
          <p className={`${body} text-[13px] uppercase tracking-[0.4em]`} style={{ color: BROWN, opacity: 0.6 }}>
            Nuestros Servicios
          </p>
          <h2 className={`${display} mt-3 text-6xl font-light tracking-wide`} style={{ color: BROWN }}>
            Una experiencia 360°
          </h2>
          <p className={`${body} mt-4 text-base tracking-[0.18em]`} style={{ color: BROWN, opacity: 0.7 }}>
            Pilates Mat · Yoga · Aeroyoga · Telas
          </p>
        </div>

        <div className="space-y-20">
          {PILLARS.map((p, i) => (
            <div
              key={p.title}
              className={`grid items-center gap-10 md:grid-cols-2 ${i % 2 === 1 ? "md:[&>figure]:order-2" : ""}`}
            >
              <figure className="overflow-hidden rounded-2xl">
                <img src={p.img} alt={p.title} className="aspect-[4/3] w-full object-cover" />
              </figure>
              <div className={i % 2 === 1 ? "md:pr-10" : "md:pl-10"}>
                <p className={`${body} text-[12px] uppercase tracking-[0.3em]`} style={{ color: BROWN, opacity: 0.55 }}>
                  {p.eyebrow}
                </p>
                <h3 className={`${display} mt-2 text-5xl font-light`} style={{ color: BROWN }}>
                  {p.title}
                </h3>
                <p className={`${body} mt-5 text-lg leading-relaxed`} style={{ color: BROWN, opacity: 0.82 }}>
                  {p.text}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FuelBar() {
  return (
    <section id="bar" className="relative overflow-hidden">
      <img src="/casashe/fuelbar.jpg" alt="Fuel Bar de Casa Shé" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(64,43,28,0.62)" }} />
      <div className="relative z-10 mx-auto max-w-3xl px-6 py-32 text-center" style={{ color: CREAM }}>
        <p className={`${body} text-[12px] uppercase tracking-[0.4em]`} style={{ opacity: 0.8 }}>
          Fuel Bar
        </p>
        <h2 className={`${display} mt-3 text-5xl font-light tracking-wide sm:text-6xl`}>Recarga consciente</h2>
        <p className={`${body} mx-auto mt-5 max-w-xl text-lg leading-relaxed`} style={{ opacity: 0.9 }}>
          Bebidas funcionales, smoothies y snacks que nutren tu práctica. Hecho para que sigas en movimiento,
          dentro y fuera del estudio.
        </p>
      </div>
    </section>
  );
}

function Nosotras() {
  return (
    <section id="nosotras" className="px-6 py-28 text-center" style={{ backgroundColor: CREAM }}>
      <div className="mx-auto max-w-3xl">
        <p className={`${body} text-[13px] uppercase tracking-[0.4em]`} style={{ color: BROWN, opacity: 0.6 }}>
          Nosotras
        </p>
        <h2 className={`${display} mt-4 text-4xl font-light leading-snug sm:text-5xl`} style={{ color: BROWN }}>
          Un hub de bienestar para mujeres, en el corazón de la Condesa.
        </h2>
        <p className={`${body} mx-auto mt-6 max-w-2xl text-lg leading-relaxed`} style={{ color: BROWN, opacity: 0.8 }}>
          Casa Shé es comunidad, movimiento y cuidado. Grupos pequeños, atención cercana y un espacio para que cada
          mujer encuentre lo que su cuerpo necesita. La comunidad es la medicina.
        </p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer id="contacto" style={{ backgroundColor: BROWN, color: CREAM }}>
      <div className="px-6 py-24 text-center">
        <h2 className={`${display} text-7xl font-light tracking-[0.06em]`}>CASA SHÉ</h2>
        <p className={`${body} mt-2 text-sm uppercase tracking-[0.4em]`} style={{ opacity: 0.7 }}>
          Wellness Hub
        </p>
        <Link
          to="/register"
          className={`${body} mt-9 inline-block rounded-full px-9 py-3.5 text-[13px] uppercase tracking-[0.28em] transition-all hover:scale-[1.03]`}
          style={{ backgroundColor: CREAM, color: BROWN }}
        >
          Reserva tu lugar
        </Link>
      </div>
      <div className="border-t px-6 py-8" style={{ borderColor: "rgba(254,247,230,0.18)" }}>
        <div className={`${body} mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-[13px] tracking-wide sm:flex-row`}>
          <span style={{ opacity: 0.85 }}>casashecondesa@gmail.com · Alfonso Reyes 131, Condesa, CDMX</span>
          <span style={{ opacity: 0.6 }}>© 2026 CASA SHÉ. Todos los derechos reservados.</span>
        </div>
      </div>
    </footer>
  );
}

export default function CasaSheLanding() {
  return (
    <main className={`${body} min-h-screen`} style={{ backgroundColor: CREAM, color: BROWN }}>
      <Navbar />
      <Hero />
      <Paquetes />
      <Servicios />
      <FuelBar />
      <Nosotras />
      <Footer />
    </main>
  );
}
