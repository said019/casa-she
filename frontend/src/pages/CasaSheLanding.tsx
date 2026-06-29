import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

/**
 * Landing público de Casa Shé — réplica fiel de https://casashe.mx/
 * Marca oficial: verde #2A4E36 + crema #F6F0E4, display Cormorant Garamond + cuerpo Baskervville.
 * Usa el logo/monograma oficiales (public/casashe/logo-*) en vez de texto.
 * CTAs conectados al registro/checkout real del sistema.
 */

const CREAM = "#F6F0E4";
const GREEN = "#2A4E36"; // verde de marca (tomado del logo oficial)
const DEEP = "#16261A"; // verde profundo para secciones/overlays oscuros

const LOGO = "/casashe/logo-wordmark.png";
const LOGO_CREAM = "/casashe/logo-wordmark-cream.png";

const body = "font-['Baskervville']";
const display = "font-heading"; // Instrument Serif (display oficial de marca)

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
  { title: "PAQUETE 5 CLASES", img: "/casashe/card-5.jpeg", price: "$1,350", hint: "5 créditos · vigencia 1 mes" },
  { title: "CLASE SUELTA", img: "/casashe/card-suelta.jpeg", price: "$280", was: "$300", hint: "1 clase drop-in", oferta: true },
  { title: "CLASE MUESTRA", img: "/casashe/card-muestra.jpeg", price: "$150", hint: "Tu primera vez en casa" },
];

const PILLARS = [
  {
    eyebrow: "Pilates Mat · Barre · Sculpt · Yoga · Salsa",
    title: "Movimiento",
    img: "/casashe/pilates.jpg",
    text: "Desde la precisión del Pilates Mat hasta la definición del Sculpt y la postura del Barre, nuestras clases fortalecen cada parte de tu cuerpo. Complementamos con la serenidad del Yoga —Ashtanga y Vinyasa— y cerramos el círculo con la energía de la Salsa.",
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
  { label: "Horario", href: "#horario" },
  { label: "Fuel Bar", href: "#bar" },
  { label: "Nosotras", href: "#nosotras" },
  { label: "Contacto", href: "#contacto" },
];

// Horario de muestra (se usa cuando aún no hay clases cargadas en el sistema).
// Refleja las franjas reales: L–V 7–13 y 17–22, fines de semana 8–14.
const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;

// Meta por disciplina — color de la paleta de marca (Verde Casa, Mostaza, Arcilla,
// Musgo, Ciruela), igual que la leyenda del calendario. Duración y cupo del catálogo.
const DISCIPLINE_META: Record<string, { color: string; dur: number; cupo: number }> = {
  "Pilates Mat": { color: "#2A4E36", dur: 50, cupo: 7 },   // Verde Casa
  "Barre": { color: "#B4A248", dur: 50, cupo: 8 },         // Mostaza
  "Sculpt": { color: "#AE4836", dur: 50, cupo: 8 },        // Arcilla
  "Yoga Ashtanga": { color: "#6C8424", dur: 60, cupo: 7 }, // Musgo
  "Yoga Vinyasa": { color: "#3E6B4A", dur: 60, cupo: 7 },  // Verde medio
  "Salsa": { color: "#2E1B22", dur: 60, cupo: 10 },        // Ciruela
};
const metaFor = (name: string) => DISCIPLINE_META[name] ?? { color: GREEN, dur: 60, cupo: 7 };

type ClassSlot = { time: string; name: string; coach?: string };

const SAMPLE_WEEK: Record<string, ClassSlot[]> = {
  Lun: [{ time: "07:00", name: "Pilates Mat", coach: "Renata" }, { time: "09:00", name: "Yoga Vinyasa", coach: "Sofía" }, { time: "19:00", name: "Barre", coach: "Camila" }],
  Mar: [{ time: "07:00", name: "Yoga Ashtanga", coach: "Valentina" }, { time: "18:00", name: "Pilates Mat", coach: "Renata" }, { time: "19:00", name: "Sculpt", coach: "Daniela" }],
  Mié: [{ time: "08:00", name: "Yoga Vinyasa", coach: "Sofía" }, { time: "10:00", name: "Pilates Mat", coach: "Camila" }, { time: "20:00", name: "Salsa", coach: "Daniela" }],
  Jue: [{ time: "07:00", name: "Barre", coach: "Valentina" }, { time: "18:00", name: "Pilates Mat", coach: "Renata" }, { time: "19:00", name: "Yoga Ashtanga", coach: "Mariana" }],
  Vie: [{ time: "07:00", name: "Pilates Mat", coach: "Camila" }, { time: "09:00", name: "Sculpt", coach: "Sofía" }, { time: "20:00", name: "Salsa", coach: "Daniela" }],
  Sáb: [{ time: "09:00", name: "Yoga Vinyasa", coach: "Mariana" }, { time: "10:00", name: "Barre", coach: "Valentina" }, { time: "14:00", name: "Salsa", coach: "Andrea" }],
  Dom: [{ time: "10:00", name: "Pilates Mat", coach: "Renata" }, { time: "11:00", name: "Yoga Ashtanga", coach: "Andrea" }],
};

interface ApiClass {
  id: string;
  start_time: string;
  class_type_name?: string;
  instructor_name?: string;
}

function useWeekSchedule() {
  return useQuery<Record<string, ClassSlot[]> | null>({
    queryKey: ["landing-horario"],
    queryFn: async () => {
      // Semana en curso (lun–dom) calculada en cliente.
      const now = new Date();
      const day = (now.getDay() + 6) % 7; // 0 = lunes
      const monday = new Date(now);
      monday.setDate(now.getDate() - day);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      const { data } = await api.get<ApiClass[]>(`/classes?start=${fmt(monday)}&end=${fmt(sunday)}`);
      if (!Array.isArray(data) || data.length === 0) return null; // sin datos → usar muestra
      const grouped: Record<string, ClassSlot[]> = {};
      for (const c of data) {
        const dt = new Date(c.start_time);
        const key = DAYS[(dt.getDay() + 6) % 7];
        (grouped[key] ||= []).push({
          time: dt.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false }),
          name: c.class_type_name || "Clase",
          coach: c.instructor_name,
        });
      }
      for (const k of Object.keys(grouped)) grouped[k].sort((a, b) => a.time.localeCompare(b.time));
      return grouped;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

function currentWeekLabel(): { range: string; todayIdx: number } {
  try {
    const now = new Date();
    const todayIdx = (now.getDay() + 6) % 7; // 0 = lunes
    const monday = new Date(now);
    monday.setDate(now.getDate() - todayIdx);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const d = (x: Date) => x.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
    return { range: `Semana del ${d(monday)} al ${d(sunday)}`, todayIdx };
  } catch {
    return { range: "", todayIdx: -1 };
  }
}

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
        boxShadow: scrolled ? "0 1px 0 rgba(39,74,42,0.12)" : "none",
      }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="#inicio" aria-label="Casa Shé — inicio">
          <img src={scrolled ? LOGO : LOGO_CREAM} alt="Casa Shé" className="h-7 w-auto md:h-8" />
        </a>
        <nav className={`${body} hidden items-center gap-8 text-[13px] uppercase tracking-[0.18em] md:flex`}>
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="transition-opacity hover:opacity-60"
              style={{ color: scrolled ? GREEN : CREAM }}
            >
              {n.label}
            </a>
          ))}
          <Link
            to="/login"
            className="rounded-full border px-5 py-2 text-[12px] tracking-[0.2em] transition-colors"
            style={{ borderColor: scrolled ? GREEN : CREAM, color: scrolled ? GREEN : CREAM }}
          >
            ENTRAR
          </Link>
        </nav>
        <Link
          to="/login"
          className={`${body} text-[12px] uppercase tracking-[0.2em] md:hidden`}
          style={{ color: scrolled ? GREEN : CREAM }}
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
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(28,51,32,0.55)" }} />
      <div className="relative z-10 px-6 text-center" style={{ color: CREAM }}>
        <h1 className="sr-only">Casa Shé</h1>
        <p className={`${body} mb-7 text-[13px] uppercase tracking-[0.5em]`}>Wellness Hub</p>
        <img
          src={LOGO_CREAM}
          alt="Casa Shé"
          className="mx-auto w-[min(82vw,620px)]"
        />
        <p className={`${body} mx-auto mt-8 max-w-xl text-base tracking-[0.12em] sm:text-lg`}>
          Pilates · Barre · Sculpt · Yoga · Salsa · Community
        </p>
        <p className={`${body} mt-2 text-sm tracking-[0.18em] opacity-80`}>
          Alfonso Reyes 131, Condesa · CDMX
        </p>
        <a
          href="#paquetes"
          className={`${body} mt-10 inline-block rounded-full px-9 py-3.5 text-[13px] uppercase tracking-[0.28em] transition-all hover:scale-[1.03]`}
          style={{ backgroundColor: CREAM, color: GREEN }}
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
          <p className={`${body} text-[13px] uppercase tracking-[0.4em]`} style={{ color: GREEN, opacity: 0.6 }}>
            Elige tu camino
          </p>
          <h2 className={`${display} mt-3 text-5xl font-light tracking-wide`} style={{ color: GREEN }}>
            Nuestros Paquetes
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((c) => (
            <article
              key={c.title}
              className="group flex flex-col overflow-hidden rounded-2xl bg-white/60 ring-1 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              style={{ borderColor: "rgba(39,74,42,0.10)", boxShadow: "0 1px 0 rgba(39,74,42,0.06)" }}
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
                    style={{ backgroundColor: GREEN, color: CREAM }}
                  >
                    Oferta
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col items-center px-6 py-7 text-center">
                <h3 className={`${body} text-lg uppercase tracking-[0.14em]`} style={{ color: GREEN }}>
                  {c.title}
                </h3>
                <p className={`${body} mt-1 text-[13px] tracking-wide`} style={{ color: GREEN, opacity: 0.55 }}>
                  {c.hint}
                </p>
                <div className={`${display} mt-4 flex items-baseline justify-center gap-2`}>
                  {c.was && (
                    <span className="text-lg line-through" style={{ color: GREEN, opacity: 0.4 }}>
                      {c.was}
                    </span>
                  )}
                  <span className="text-4xl font-medium" style={{ color: GREEN }}>
                    {c.price}
                  </span>
                </div>
                <Link
                  to="/register"
                  className={`${body} mt-6 w-full rounded-full py-3 text-[12px] uppercase tracking-[0.24em] transition-colors`}
                  style={{ backgroundColor: GREEN, color: CREAM }}
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
    <section id="servicios" className="px-6 py-24" style={{ backgroundColor: "#F6EFDB" }}>
      <div className="mx-auto max-w-6xl">
        <div className="mb-20 text-center">
          <p className={`${body} text-[13px] uppercase tracking-[0.4em]`} style={{ color: GREEN, opacity: 0.6 }}>
            Nuestros Servicios
          </p>
          <h2 className={`${display} mt-3 text-6xl font-light tracking-wide`} style={{ color: GREEN }}>
            Una experiencia 360°
          </h2>
          <p className={`${body} mt-4 text-base tracking-[0.18em]`} style={{ color: GREEN, opacity: 0.7 }}>
            Pilates Mat · Barre · Sculpt · Yoga · Salsa
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
                <p className={`${body} text-[12px] uppercase tracking-[0.3em]`} style={{ color: GREEN, opacity: 0.55 }}>
                  {p.eyebrow}
                </p>
                <h3 className={`${display} mt-2 text-5xl font-light`} style={{ color: GREEN }}>
                  {p.title}
                </h3>
                <p className={`${body} mt-5 text-lg leading-relaxed`} style={{ color: GREEN, opacity: 0.82 }}>
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

function ClassChip({ c }: { c: ClassSlot }) {
  const m = metaFor(c.name);
  return (
    <Link
      to="/register"
      className="group block rounded-xl p-3 text-left transition-all hover:-translate-y-0.5"
      style={{ backgroundColor: CREAM, boxShadow: `inset 0 0 0 1px rgba(39,74,42,0.10)`, borderLeft: `3px solid ${m.color}` }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className={`${display} text-xl leading-none`} style={{ color: GREEN }}>{c.time}</span>
        <span className={`${body} text-[10px] uppercase tracking-[0.12em]`} style={{ color: GREEN, opacity: 0.45 }}>
          {m.dur}′
        </span>
      </div>
      <p className={`${body} mt-1.5 flex items-center gap-1.5 text-[13px] font-medium leading-tight`} style={{ color: GREEN }}>
        <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: m.color }} />
        {c.name}
      </p>
      {c.coach && (
        <p className={`${body} mt-0.5 text-[11px] leading-tight`} style={{ color: GREEN, opacity: 0.55 }}>
          con {c.coach}
        </p>
      )}
      <p className={`${body} mt-1 text-[10px] uppercase tracking-[0.1em]`} style={{ color: m.color, opacity: 0.85 }}>
        {m.cupo} lugares
      </p>
    </Link>
  );
}

function Horario() {
  const { data } = useWeekSchedule();
  const isSample = !data;
  const week = data ?? SAMPLE_WEEK;
  const { range, todayIdx } = currentWeekLabel();
  const totalClases = DAYS.reduce((n, d) => n + (week[d]?.length ?? 0), 0);

  return (
    <section id="horario" className="px-6 py-24" style={{ backgroundColor: CREAM }}>
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 text-center">
          <p className={`${body} text-[13px] uppercase tracking-[0.4em]`} style={{ color: GREEN, opacity: 0.6 }}>
            Horario
          </p>
          <h2 className={`${display} mt-3 text-5xl font-light tracking-wide sm:text-6xl`} style={{ color: GREEN }}>
            Nuestra semana
          </h2>
          {range && (
            <p className={`${body} mt-3 text-[13px] uppercase tracking-[0.22em]`} style={{ color: GREEN, opacity: 0.55 }}>
              {range} · {totalClases} clases
            </p>
          )}
        </div>

        {/* Leyenda de disciplinas */}
        <div className="mb-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {Object.entries(DISCIPLINE_META).map(([name, m]) => (
            <span key={name} className={`${body} flex items-center gap-2 text-[12px] tracking-wide`} style={{ color: GREEN, opacity: 0.8 }}>
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: m.color }} />
              {name}
            </span>
          ))}
        </div>

        <div className="flex snap-x gap-3 overflow-x-auto pb-3 lg:grid lg:grid-cols-7 lg:overflow-visible">
          {DAYS.map((d, idx) => {
            const classes = week[d] ?? [];
            const isToday = idx === todayIdx;
            return (
              <div
                key={d}
                className="min-w-[168px] flex-1 snap-start rounded-2xl p-3"
                style={{
                  backgroundColor: isToday ? "rgba(46,93,63,0.07)" : "rgba(255,255,255,0.55)",
                  boxShadow: `inset 0 0 0 1px ${isToday ? "rgba(46,93,63,0.35)" : "rgba(39,74,42,0.10)"}`,
                }}
              >
                <div className="mb-3 flex items-center justify-center gap-2">
                  <p className={`${body} text-[12px] uppercase tracking-[0.26em]`} style={{ color: GREEN, opacity: isToday ? 1 : 0.7 }}>
                    {d}
                  </p>
                  {isToday && (
                    <span className={`${body} rounded-full px-2 py-0.5 text-[9px] uppercase tracking-[0.14em]`} style={{ backgroundColor: GREEN, color: CREAM }}>
                      Hoy
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {classes.length === 0 && (
                    <p className={`${body} py-6 text-center text-sm`} style={{ color: GREEN, opacity: 0.28 }}>Descanso</p>
                  )}
                  {classes.map((c, i) => (
                    <ClassChip key={i} c={c} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-10 text-center">
          {isSample && (
            <p className={`${body} mb-4 text-[13px] tracking-wide`} style={{ color: GREEN, opacity: 0.55 }}>
              Horario de muestra · crea tu cuenta para ver disponibilidad y reservar en vivo.
            </p>
          )}
          <Link
            to="/register"
            className={`${body} inline-block rounded-full px-9 py-3.5 text-[13px] uppercase tracking-[0.28em] transition-all hover:scale-[1.03]`}
            style={{ backgroundColor: GREEN, color: CREAM }}
          >
            Reserva tu lugar
          </Link>
        </div>
      </div>
    </section>
  );
}

function FuelBar() {
  return (
    <section id="bar" className="relative overflow-hidden">
      <img src="/casashe/fuelbar.jpg" alt="Fuel Bar de Casa Shé" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(28,51,32,0.64)" }} />
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
        <img src="/casashe/logo-monogram.png" alt="" aria-hidden className="mx-auto mb-8 h-12 w-auto opacity-90" />
        <p className={`${body} text-[13px] uppercase tracking-[0.4em]`} style={{ color: GREEN, opacity: 0.6 }}>
          Nosotras
        </p>
        <h2 className={`${display} mt-4 text-4xl font-light leading-snug sm:text-5xl`} style={{ color: GREEN }}>
          Un hub de bienestar para mujeres, en el corazón de la Condesa.
        </h2>
        <p className={`${body} mx-auto mt-6 max-w-2xl text-lg leading-relaxed`} style={{ color: GREEN, opacity: 0.8 }}>
          Casa Shé es comunidad, movimiento y cuidado. Grupos pequeños, atención cercana y un espacio para que cada
          mujer encuentre lo que su cuerpo necesita. La comunidad es la medicina.
        </p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer id="contacto" style={{ backgroundColor: DEEP, color: CREAM }}>
      <div className="px-6 py-24 text-center">
        <img src={LOGO_CREAM} alt="Casa Shé" className="mx-auto w-[min(70vw,420px)]" />
        <p className={`${body} mt-4 text-sm uppercase tracking-[0.4em]`} style={{ opacity: 0.7 }}>
          Wellness Hub
        </p>
        <Link
          to="/register"
          className={`${body} mt-9 inline-block rounded-full px-9 py-3.5 text-[13px] uppercase tracking-[0.28em] transition-all hover:scale-[1.03]`}
          style={{ backgroundColor: CREAM, color: GREEN }}
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
    <main className={`${body} min-h-screen`} style={{ backgroundColor: CREAM, color: GREEN }}>
      <Navbar />
      <Hero />
      <Paquetes />
      <Servicios />
      <Horario />
      <FuelBar />
      <Nosotras />
      <Footer />
    </main>
  );
}
