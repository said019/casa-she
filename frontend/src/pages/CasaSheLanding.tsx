import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import api from "@/lib/api";
import { CasaShePattern } from "@/components/CasaShePattern";
import { CoachSheet } from "@/components/CoachSheet";

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
  planName: string;        // nombre exacto en la tabla plans (para cruzar precio/is_active)
  hint: string;
  color: string;
  artTitle: string;
  tagline: string;
  image?: string;
  applies: string;
  kind: "Membresía" | "Paquete" | "Clase";
};

const STUDIO_CLASSES = "Pilates Mat · Barre · Sculpt · Yoga · Flex";

// El precio real se obtiene del API (/plans). Solo se muestra la tarjeta si el plan
// está activo en la DB. planName debe coincidir exactamente con plans.name.
const CARDS: Card[] = [
  { title: "MEMBRESÍA SHE BLACK", planName: "Membresía Black", color: "#2E1B22", artTitle: "Membresía She Black", tagline: "Nuestra membresía más completa para sostener una práctica constante y volver a ti.", hint: "24 créditos · vigencia 1 mes", image: "/casashe/card-black.jpeg", applies: STUDIO_CLASSES, kind: "Membresía" },
  { title: "MEMBRESÍA 360", planName: "Membresía 360", color: "#2A4E36", artTitle: "Membresía 360", tagline: "Movimiento, balance y comunidad en una membresía diseñada para acompañar tu mes.", hint: "16 créditos · vigencia 1 mes", image: "/casashe/card-360.jpeg", applies: STUDIO_CLASSES, kind: "Membresía" },
  { title: "PAQUETE 12 CLASES", planName: "Paquete 12", color: "#AE4836", artTitle: "Paquete 12 clases", tagline: "Constancia que se siente. Más sesiones para sostener tu práctica.", hint: "12 créditos · vigencia 1 mes", image: "/casashe/card-12.jpeg", applies: STUDIO_CLASSES, kind: "Paquete" },
  { title: "PAQUETE 8 CLASES", planName: "Paquete 8", color: "#8F7F36", artTitle: "Paquete 8 clases", tagline: "El balance ideal entre flexibilidad y constancia, a tu ritmo.", hint: "8 créditos · vigencia 1 mes", image: "/casashe/card-8.jpeg", applies: STUDIO_CLASSES, kind: "Paquete" },
  { title: "PAQUETE 5 CLASES", planName: "Paquete 5", color: "#6E4B34", artTitle: "Paquete 5 clases", tagline: "Una forma amable de empezar y encontrar tus clases favoritas.", hint: "5 créditos · vigencia 1 mes", image: "/casashe/card-5.jpeg", applies: STUDIO_CLASSES, kind: "Paquete" },
  { title: "CLASE SUELTA", planName: "Drop-in", color: "#D6D5C2", artTitle: "Clase suelta", tagline: "Muévete cuando lo necesites, sin comprometer todo el mes.", hint: "1 crédito · vigencia 30 días", image: "/casashe/card-suelta.jpeg", applies: STUDIO_CLASSES, kind: "Clase" },
  { title: "CLASE MUESTRA", planName: "Clase de prueba", color: "#E7E0CE", artTitle: "Clase muestra", tagline: "Ven a sentir Casa Shé y encuentra la práctica que conecta contigo.", hint: "1 crédito · vigencia 7 días", image: "/casashe/card-muestra.jpeg", applies: STUDIO_CLASSES, kind: "Clase" },
  { title: "SALSA · 1 CLASE", planName: "Salsa · 1 clase", color: "#2E1B22", artTitle: "Salsa", tagline: "Ritmo, cuerpo y comunidad en una sesión para soltar y reconectar.", hint: "1 clase · vigencia 30 días", applies: "Salsa", kind: "Clase" },
  { title: "SALSA · 4 CLASES", planName: "Salsa · 4 clases", color: "#2E1B22", artTitle: "Salsa", tagline: "Cuatro encuentros para aprender, bailar y hacer comunidad.", hint: "4 clases · vigencia 1 mes", applies: "Salsa", kind: "Paquete" },
];

const PILLARS = [
  {
    eyebrow: "Pilates Mat · Barre · Sculpt · Yoga · Flex · Salsa",
    title: "Movimiento",
    img: "/casashe/pilates.jpg",
    text: "Desde la precisión del Pilates Mat hasta la definición del Sculpt y la postura del Barre, nuestras clases fortalecen cada parte de tu cuerpo. Complementamos con la serenidad del Yoga —Ashtanga y Vinyasa—, la movilidad profunda del Flex y cerramos el círculo con la energía de la Salsa.",
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
    img: "/casashe/espacio-bano.jpg",
    text: "Masajes reductivos para definir tu silueta, drenaje linfático para desintoxicar y desinflamar, y faciales personalizados que devuelven la luminosidad y vitalidad a tu piel. El toque final para consentirte.",
  },
];

const NAV = [
  { label: "Inicio", href: "#inicio" },
  { label: "Servicios", href: "#servicios" },
  { label: "Coaches", href: "#equipo" },
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
const DISCIPLINE_META: Record<string, { color: string; dur: number; cupo: number; desc: string }> = {
  "Pilates Mat": { color: "#2A4E36", dur: 50, cupo: 7, desc: "Core, control y alineación en colchoneta. Fuerza profunda sin impacto, ideal para todos los niveles." },   // Verde Casa
  "Barre": { color: "#B4A248", dur: 50, cupo: 8, desc: "Ballet, yoga y pilates en una sola clase. Movimientos pequeños y precisos para tonificar y mejorar la postura." },         // Mostaza
  "Sculpt": { color: "#AE4836", dur: 50, cupo: 8, desc: "Pesos ligeros y muchas repeticiones para definir, tonificar y subir el ritmo cardíaco." },        // Arcilla
  "Yoga Ashtanga": { color: "#6C8424", dur: 60, cupo: 7, desc: "Secuencia dinámica y estructurada que construye fuerza, flexibilidad y enfoque mental." }, // Musgo
  "Yoga Vinyasa": { color: "#3E6B4A", dur: 60, cupo: 7, desc: "Flujo de posturas al ritmo de la respiración. Movilidad, equilibrio y calma en movimiento." },  // Verde medio
  "Yoga": { color: "#5A7D3F", dur: 50, cupo: 12, desc: "Posturas, respiración y calma. Flexibilidad, equilibrio y conexión cuerpo-mente." },      // Verde fresco
  "Flex": { color: "#5E8B87", dur: 50, cupo: 12, desc: "Movilidad y estiramiento profundo. Libera tensión y gana rango de movimiento." },        // Verde azulado
  "Salsa": { color: "#2E1B22", dur: 60, cupo: 10, desc: "Ritmo, cuerpo y comunidad. Suelta el cuerpo, aprende pasos y conéctate con la energía del grupo." },        // Ciruela
};
const metaFor = (name: string) => DISCIPLINE_META[name] ?? { color: GREEN, dur: 60, cupo: 7, desc: "Una clase pensada para moverte, sentirte bien y conectar contigo misma." };

type ClassSlot = { time: string; name: string; coach?: string };

interface ApiClass {
  id: string;
  date: string;        // YYYY-MM-DD (día real de la clase)
  start_time: string;  // HH:MM
  class_type_name?: string;
  instructor_id?: string | null;
  instructor_name?: string;
  status?: string;
}

interface ApiInstructor {
  id: string;
  display_name: string;
  photo_url?: string | null;
  specialties?: unknown;
  tagline?: string | null;
}

interface LandingCoach {
  key: string;
  profileId: string | null;
  display_name: string;
  photo_url?: string | null;
  specialties?: unknown;
}

function specialtiesFor(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [value];
  } catch {
    return [value];
  }
}

function normalizeCoachName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("es-MX");
}

// Fecha local YYYY-MM-DD (evita el corrimiento de día de toISOString en UTC).
function localYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Lunes de la semana en curso desplazada `weekOffset` semanas.
function mondayForOffset(weekOffset: number) {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // 0 = lunes
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function useWeekSchedule(weekOffset: number) {
  return useQuery<Record<string, ClassSlot[]>>({
    queryKey: ["landing-horario", weekOffset],
    queryFn: async () => {
      const monday = mondayForOffset(weekOffset);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const grouped: Record<string, ClassSlot[]> = {};
      const { data } = await api.get<ApiClass[]>(`/classes?start=${localYMD(monday)}&end=${localYMD(sunday)}`);
      if (!Array.isArray(data)) return grouped;
      for (const c of data) {
        if (!c.date) continue;
        // El día se toma de c.date (no de start_time, que sólo trae HH:MM).
        const [y, mo, dd] = c.date.slice(0, 10).split("-").map(Number);
        const dow = new Date(y, mo - 1, dd).getDay(); // 0 = domingo
        const key = DAYS[(dow + 6) % 7];
        if (!key) continue;
        (grouped[key] ||= []).push({
          time: (c.start_time || "").slice(0, 5),
          name: c.class_type_name || "Clase",
          coach: c.instructor_name,
        });
      }
      for (const k of Object.keys(grouped)) grouped[k].sort((a, b) => a.time.localeCompare(b.time));
      return grouped;
    },
    staleTime: 5 * 60 * 1000,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
    refetchOnWindowFocus: true,
  });
}

function weekLabel(weekOffset: number): { range: string; todayIdx: number; dayNums: number[] } {
  try {
    const monday = mondayForOffset(weekOffset);
    const dayNums: number[] = [];
    for (let i = 0; i < 7; i++) {
      const dd = new Date(monday);
      dd.setDate(monday.getDate() + i);
      dayNums.push(dd.getDate());
    }
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const d = (x: Date) => x.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
    // Sólo resaltar "hoy" en la semana en curso (offset 0).
    const now = new Date();
    const todayIdx = weekOffset === 0 ? (now.getDay() + 6) % 7 : -1;
    return { range: `Semana del ${d(monday)} al ${d(sunday)}`, todayIdx, dayNums };
  } catch {
    return { range: "", todayIdx: -1, dayNums: [] };
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
      <div className="mx-auto flex max-w-[1400px] items-center justify-between px-5 py-4 sm:px-8 lg:px-12">
        <a href="#inicio" aria-label="Casa Shé — inicio">
          <img src={scrolled ? LOGO : LOGO_CREAM} alt="Casa Shé" className="h-7 w-auto md:h-8" />
        </a>
        <nav className={`${body} hidden items-center gap-7 text-[11px] uppercase tracking-[0.16em] xl:flex`}>
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
          className={`${body} text-[12px] uppercase tracking-[0.2em] xl:hidden`}
          style={{ color: scrolled ? GREEN : CREAM }}
        >
          Entrar
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  const reduce = useReducedMotion();

  return (
    <section id="inicio" className="relative min-h-[100dvh] overflow-hidden" style={{ backgroundColor: DEEP }}>
      <img
        src="/casashe/hero.png"
        alt="Salón de movimiento de Casa Shé"
        className="absolute inset-0 h-full w-full object-cover object-center"
        loading="eager"
        decoding="async"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(18,33,22,0.87)_0%,rgba(18,33,22,0.58)_42%,rgba(18,33,22,0.12)_78%),linear-gradient(0deg,rgba(18,33,22,0.62)_0%,transparent_42%)]" />

      <div className="relative flex min-h-[100dvh] items-end px-5 pb-9 pt-28 sm:px-8 sm:pb-12 lg:px-12 lg:pb-14">
        <div className="mx-auto w-full max-w-[1400px]" style={{ color: CREAM }}>
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, ease: [0.23, 1, 0.32, 1] }}
            className="max-w-[760px]"
          >
            <p className={`${body} text-[11px] uppercase tracking-[0.36em] text-white/72 sm:text-[12px]`}>
              Wellness hub · Condesa, CDMX
            </p>
            <h1 className={`${display} mt-5 max-w-[12ch] text-[clamp(3.4rem,8vw,7.5rem)] font-light leading-[0.88] tracking-[-0.035em]`}>
              Una casa para volver a ti.
            </h1>
            <p className={`${body} mt-6 max-w-[54ch] text-base leading-relaxed text-white/82 sm:text-lg`}>
              Movimiento, nutrición y cuidado en comunidad. Pilates Mat, Barre, Sculpt, Yoga, Flex y Salsa en un espacio hecho para escucharte.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/register"
                className={`${body} inline-flex min-h-12 items-center justify-center rounded-full px-8 text-[12px] uppercase tracking-[0.22em] transition-transform active:scale-[0.98]`}
                style={{ backgroundColor: CREAM, color: GREEN }}
              >
                Reservar una clase
              </Link>
              <a
                href="#paquetes"
                className={`${body} inline-flex min-h-12 items-center justify-center rounded-full border border-white/45 px-8 text-[12px] uppercase tracking-[0.22em] text-white transition-colors hover:bg-white/10 active:scale-[0.98]`}
              >
                Ver paquetes
              </a>
            </div>
          </motion.div>

          <div className={`${body} mt-12 grid gap-3 border-t border-white/30 pt-4 text-[10px] uppercase tracking-[0.2em] text-white/68 sm:grid-cols-3 sm:text-[11px]`}>
            <span>Grupos pequeños</span>
            <span className="sm:text-center">Alfonso Reyes 131</span>
            <span className="sm:text-right">La comunidad es la medicina</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function Paquetes() {
  const { data: apiPlans = [], isLoading, isError, refetch } = useQuery<{ id: string; name: string; price: number; is_active: boolean }[]>({
    queryKey: ["landing-plans"],
    queryFn: async () => (await api.get("/plans")).data,
    staleTime: 5 * 60 * 1000,
  });

  // Índice rápido: nombre → plan
  const planByName = Object.fromEntries(apiPlans.map((p) => [p.name, p]));

  // Solo muestra tarjetas cuyo plan existe Y está activo en la DB
  const visible = CARDS.filter((c) => {
    const p = planByName[c.planName];
    return p && p.is_active;
  });

  const fmt = (price: number) =>
    "$" + Number(price).toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <section id="paquetes" className="scroll-mt-20 px-5 py-20 sm:px-8 lg:px-12 lg:py-28" style={{ backgroundColor: CREAM }}>
      <div className="mx-auto max-w-[1400px]">
        <div className="grid gap-7 border-b border-[#2A4E36]/25 pb-8 md:grid-cols-[0.85fr_1.15fr] md:items-end">
          <div>
            <p className={`${body} text-[11px] uppercase tracking-[0.34em]`} style={{ color: GREEN, opacity: 0.62 }}>
              Clase o paquete
            </p>
            <h2 className={`${display} mt-3 max-w-[10ch] text-5xl font-light leading-[0.95] sm:text-6xl lg:text-7xl`} style={{ color: GREEN }}>
              Elige cómo quieres moverte.
            </h2>
          </div>
          <p className={`${body} max-w-[58ch] text-base leading-relaxed md:justify-self-end md:text-lg`} style={{ color: GREEN, opacity: 0.72 }}>
            Comienza con una clase, encuentra tu ritmo o construye constancia. Aquí ves con claridad qué incluye cada opción, en qué clases aplica y cuánto cuesta.
          </p>
        </div>

        {isLoading ? (
          <div className="mt-8 grid gap-6 lg:grid-cols-2" aria-live="polite">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="grid animate-pulse grid-cols-[140px_1fr] gap-6 border-b border-[#2A4E36]/15 py-6">
                <span className="aspect-square bg-[#D6D5C2]/45" />
                <span className="my-3 block bg-[#D6D5C2]/38" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="mt-8 border border-[#AE4836]/30 px-6 py-12 text-center" role="alert">
            <p className={`${body} text-base`} style={{ color: GREEN }}>No pudimos cargar los paquetes.</p>
            <button
              type="button"
              onClick={() => refetch()}
              className={`${body} mt-5 min-h-11 rounded-full px-7 text-[11px] uppercase tracking-[0.2em] active:scale-[0.98]`}
              style={{ backgroundColor: GREEN, color: CREAM }}
            >
              Volver a intentar
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className={`${body} mt-8 border border-dashed border-[#2A4E36]/25 px-6 py-12 text-center text-sm`} style={{ color: GREEN, opacity: 0.68 }}>
            Los próximos paquetes aparecerán aquí.
          </div>
        ) : (
        <div className="mt-6 grid gap-x-10 lg:grid-cols-2">
          {visible.map((c, index) => {
            const plan = planByName[c.planName];
            const featured = index === 0;
            return (
              <article
                key={c.title}
                className={`group grid border-b border-[#2A4E36]/22 py-7 sm:grid-cols-[minmax(170px,0.82fr)_1.18fr] sm:items-stretch ${featured ? "lg:col-span-2 lg:grid-cols-[minmax(340px,0.92fr)_1.08fr] lg:py-10" : ""}`}
              >
                <div className="flex min-h-[220px] items-center justify-center overflow-hidden p-5 sm:min-h-0" style={{ backgroundColor: c.color }}>
                  <div className={`relative aspect-square w-full max-w-[300px] overflow-hidden ${featured ? "lg:max-w-[380px]" : ""}`}>
                    {c.image ? (
                      <img
                        src={c.image}
                        alt={`Imagen de ${c.artTitle}`}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.025]"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="relative flex h-full w-full items-end overflow-hidden p-7" style={{ color: CREAM }}>
                        <CasaShePattern className="absolute inset-0 h-full w-full opacity-80" color="rgba(246,240,228,0.18)" />
                        <img src="/casashe/logo-monogram-cream.png" alt="" aria-hidden="true" className="absolute left-1/2 top-7 h-11 w-11 -translate-x-1/2 object-contain" />
                        <span className={`${display} relative block text-5xl font-light leading-none`}>{c.artTitle}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col justify-between py-6 sm:py-4 sm:pl-7 lg:pl-10">
                  <div>
                    <p className={`${body} text-[10px] uppercase tracking-[0.28em]`} style={{ color: GREEN, opacity: 0.55 }}>
                      {c.kind} · {String(index + 1).padStart(2, "0")}
                    </p>
                    <h3 className={`${display} mt-2 text-3xl font-light leading-none sm:text-4xl ${featured ? "lg:text-6xl" : ""}`} style={{ color: GREEN }}>
                    {c.title}
                    </h3>
                    <p className={`${body} mt-4 max-w-[44ch] text-[15px] leading-relaxed`} style={{ color: GREEN, opacity: 0.76 }}>
                      {c.tagline}
                    </p>
                    <p className={`${body} mt-3 text-[12px] uppercase tracking-[0.12em]`} style={{ color: GREEN, opacity: 0.52 }}>
                      {c.hint}
                    </p>
                  </div>

                  <div className="mt-7 border-t border-[#2A4E36]/20 pt-5">
                    <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                      <div>
                        <p className={`${body} text-[9px] uppercase tracking-[0.26em]`} style={{ color: GREEN, opacity: 0.48 }}>Aplica en</p>
                        <p className={`${body} mt-1 max-w-[42ch] text-sm leading-relaxed`} style={{ color: GREEN, opacity: 0.78 }}>{c.applies}</p>
                      </div>
                      <div className="sm:text-right">
                        <p className={`${body} text-[9px] uppercase tracking-[0.26em]`} style={{ color: GREEN, opacity: 0.48 }}>Inversión</p>
                        <p className={`${display} mt-1 text-4xl leading-none`} style={{ color: GREEN }}>{fmt(plan.price)}</p>
                      </div>
                    </div>
                    <Link
                      to={`/register?plan=${plan.id}`}
                      className={`${body} mt-5 inline-flex min-h-11 items-center justify-center rounded-full px-7 text-[11px] uppercase tracking-[0.22em] transition-transform active:scale-[0.98]`}
                      style={{ backgroundColor: GREEN, color: CREAM }}
                    >
                      Elegir esta opción
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        )}
      </div>
    </section>
  );
}

function Servicios() {
  return (
    <section id="servicios" className="scroll-mt-20 px-5 py-20 sm:px-8 lg:px-12 lg:py-28" style={{ backgroundColor: "#F6EFDB" }}>
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-16 grid gap-5 border-b border-[#2A4E36]/25 pb-8 md:grid-cols-[1fr_auto] md:items-end">
          <div>
          <p className={`${body} text-[11px] uppercase tracking-[0.34em]`} style={{ color: GREEN, opacity: 0.6 }}>
            Nuestros Servicios
          </p>
          <h2 className={`${display} mt-3 text-5xl font-light leading-none sm:text-6xl lg:text-7xl`} style={{ color: GREEN }}>
            Una experiencia 360°
          </h2>
          </div>
          <p className={`${body} text-sm tracking-[0.14em] md:text-right`} style={{ color: GREEN, opacity: 0.65 }}>
            Pilates Mat · Barre · Sculpt · Yoga · Flex · Salsa
          </p>
        </div>

        <div className="space-y-20 lg:space-y-28">
          {PILLARS.map((p, i) => (
            <div
              key={p.title}
              className="grid items-center gap-7 md:grid-cols-12 md:gap-0"
            >
              <figure className={`relative overflow-hidden md:col-span-7 ${i % 2 === 1 ? "md:order-2 md:col-start-6" : ""}`}>
                <img src={p.img} alt={p.title} className="aspect-[4/5] w-full object-cover sm:aspect-[16/11]" loading="lazy" decoding="async" />
                <span className={`${body} absolute bottom-4 left-4 text-[10px] uppercase tracking-[0.25em] text-white/80`}>Casa Shé · 0{i + 1}</span>
              </figure>
              <div className={`relative border-t border-[#2A4E36]/30 pt-6 md:col-span-5 md:bg-[#F6EFDB] md:p-10 lg:p-14 ${i % 2 === 1 ? "md:order-1 md:col-start-1 md:mr-[-3rem] md:pr-16" : "md:ml-[-3rem] md:pl-16"}`}>
                <p className={`${body} text-[12px] uppercase tracking-[0.3em]`} style={{ color: GREEN, opacity: 0.55 }}>
                  {p.eyebrow}
                </p>
                <h3 className={`${display} mt-3 text-5xl font-light leading-none lg:text-6xl`} style={{ color: GREEN }}>
                  {p.title}
                </h3>
                <p className={`${body} mt-5 text-base leading-relaxed lg:text-lg`} style={{ color: GREEN, opacity: 0.78 }}>
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

function Coaches() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [openName, setOpenName] = useState<string | null>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const scheduleEnd = new Date(today);
  scheduleEnd.setDate(today.getDate() + 90);
  const scheduleStartYMD = localYMD(today);
  const scheduleEndYMD = localYMD(scheduleEnd);

  const {
    data: instructors = [],
    isLoading: areProfilesLoading,
  } = useQuery<ApiInstructor[]>({
    queryKey: ["landing-instructors"],
    queryFn: async () => {
      const { data } = await api.get<ApiInstructor[]>("/instructors");
      return Array.isArray(data) ? data : [];
    },
    staleTime: 10 * 60 * 1000,
  });

  const {
    data: scheduledClasses = [],
    isLoading: areClassesLoading,
    isError: areClassesUnavailable,
  } = useQuery<ApiClass[]>({
    queryKey: ["landing-scheduled-coaches", scheduleStartYMD, scheduleEndYMD],
    queryFn: async () => {
      const { data } = await api.get<ApiClass[]>(
        `/classes?start=${scheduleStartYMD}&end=${scheduleEndYMD}`,
      );
      return Array.isArray(data) ? data : [];
    },
    staleTime: 5 * 60 * 1000,
    retry: 3,
  });

  const coaches = useMemo<LandingCoach[]>(() => {
    const profilesById = new Map(instructors.map((coach) => [coach.id, coach]));
    const profilesByName = new Map(
      instructors.map((coach) => [normalizeCoachName(coach.display_name), coach]),
    );
    const scheduled = new Map<string, { instructorId: string | null; name: string }>();

    for (const classItem of scheduledClasses) {
      const name = classItem.instructor_name?.trim();
      if (!name || (classItem.status && classItem.status !== "scheduled")) continue;
      const key = classItem.instructor_id
        ? `id:${classItem.instructor_id}`
        : `name:${normalizeCoachName(name)}`;
      if (!scheduled.has(key)) {
        scheduled.set(key, { instructorId: classItem.instructor_id ?? null, name });
      }
    }

    return Array.from(scheduled.entries())
      .map(([key, scheduledCoach]) => {
        const profile =
          (scheduledCoach.instructorId
            ? profilesById.get(scheduledCoach.instructorId)
            : undefined) ?? profilesByName.get(normalizeCoachName(scheduledCoach.name));
        return {
          key,
          profileId: profile?.id ?? null,
          display_name: profile?.display_name ?? scheduledCoach.name,
          photo_url: profile?.photo_url,
          specialties: profile?.specialties,
        };
      })
      .sort((a, b) => a.display_name.localeCompare(b.display_name, "es-MX"));
  }, [instructors, scheduledClasses]);

  const isLoading = areProfilesLoading || areClassesLoading;

  return (
    <section id="equipo" className="scroll-mt-20 py-20 lg:py-28" style={{ backgroundColor: DEEP, color: CREAM }}>
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 lg:px-12">
        <div className="grid gap-5 border-b border-white/25 pb-7 md:grid-cols-[1fr_0.9fr] md:items-end">
          <div>
            <p className={`${body} text-[11px] uppercase tracking-[0.34em] text-white/55`}>Quiénes te guían</p>
            <h2 className={`${display} mt-3 text-5xl font-light leading-none sm:text-6xl lg:text-7xl`}>Nuestro equipo.</h2>
          </div>
          <p className={`${body} max-w-[52ch] text-base leading-relaxed text-white/68 md:justify-self-end`}>
            Aquí aparece únicamente el equipo vinculado al calendario vigente de Casa Shé. Conoce sus disciplinas y próximas clases.
          </p>
        </div>

        {isLoading ? (
          <div className="mt-8 flex gap-3 overflow-hidden" aria-live="polite">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="aspect-[3/4] min-w-[76vw] animate-pulse bg-white/8 sm:min-w-[330px] lg:min-w-0 lg:flex-1" />
            ))}
          </div>
        ) : areClassesUnavailable ? (
          <div className={`${body} mt-8 border border-white/20 px-6 py-10 text-center text-sm text-white/65`} role="alert">
            No pudimos cargar al equipo en este momento.
          </div>
        ) : coaches.length === 0 ? (
          <div className={`${body} mt-8 border border-dashed border-white/25 px-6 py-14 text-center text-sm text-white/65`}>
            Aún no hay coaches vinculados a clases próximas.
          </div>
        ) : (
          <div className="scrollbar-none mt-8 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3">
            {coaches.map((coach, index) => {
              const specialties = specialtiesFor(coach.specialties);
              const card = (
                <>
                  {coach.photo_url ? (
                    <img
                      src={coach.photo_url}
                      alt={coach.display_name}
                      className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.025]"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[linear-gradient(145deg,#233D2B_0%,#17291C_52%,#101D14_100%)]">
                      <CasaShePattern className="absolute inset-0 h-full w-full opacity-35" color="rgba(246,240,228,0.18)" />
                      <img src={LOGO_CREAM} alt="" aria-hidden="true" className="relative w-[58%] opacity-12" />
                      <span className={`${body} absolute left-5 top-5 text-[9px] uppercase tracking-[0.26em] text-white/42`}>
                        Retrato próximamente
                      </span>
                    </div>
                  )}
                  <span className="absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,rgba(15,27,18,0.9)_100%)]" />
                  <span className="absolute inset-x-0 bottom-0 block p-5">
                    <span className={`${body} text-[9px] uppercase tracking-[0.24em] text-white/55`}>
                      Coach {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className={`${display} mt-1 block text-3xl font-light leading-none text-white`}>
                      {coach.display_name}
                    </span>
                    <span className={`${body} mt-2 block text-xs text-white/64`}>
                      {specialties.length > 0 ? specialties.slice(0, 3).join(" · ") : "Movimiento y comunidad"}
                    </span>
                  </span>
                </>
              );

              const className = "group relative aspect-[3/4] min-w-[76vw] snap-start overflow-hidden border border-white/15 text-left sm:min-w-[330px] lg:min-w-[calc(25%_-_0.5625rem)]";
              return coach.profileId ? (
                <button
                  key={coach.key}
                  type="button"
                  data-coach-name={coach.display_name}
                  onClick={() => {
                    setOpenId(coach.profileId);
                    setOpenName(coach.display_name);
                  }}
                  className={`${className} active:scale-[0.985]`}
                >
                  {card}
                </button>
              ) : (
                <article key={coach.key} data-coach-name={coach.display_name} className={className}>
                  {card}
                </article>
              );
            })}
          </div>
        )}
      </div>

      <CoachSheet
        instructorId={openId}
        instructorName={openName}
        onClose={() => {
          setOpenId(null);
          setOpenName(null);
        }}
      />
    </section>
  );
}

function ClassChip({ c }: { c: ClassSlot }) {
  const m = metaFor(c.name);
  const [open, setOpen] = useState(false);

  // Cerrar con Escape y bloquear el scroll del fondo mientras el detalle está abierto.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group block w-full rounded-xl p-3 text-left transition-all hover:-translate-y-0.5 active:scale-[0.98]"
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
        <p className={`${body} mt-1 text-[10px] uppercase tracking-[0.1em] transition-opacity group-hover:opacity-100`} style={{ color: m.color, opacity: 0.7 }}>
          Ver detalles →
        </p>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Detalle de ${c.name}`}
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0" style={{ backgroundColor: "rgba(22,38,26,0.55)", backdropFilter: "blur(2px)" }} />
          <div
            className="relative w-full max-w-sm overflow-hidden rounded-t-[1.8rem] shadow-2xl sm:rounded-[1.8rem]"
            style={{ backgroundColor: CREAM, animation: "scaleIn 220ms cubic-bezier(0.23,1,0.32,1)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Encabezado con el color de la disciplina + patrón tonal */}
            <div className="relative overflow-hidden p-6 pb-7" style={{ backgroundColor: m.color }}>
              <CasaShePattern className="pointer-events-none absolute inset-0 h-full w-full opacity-90" color="rgba(0,0,0,0.18)" />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none transition-transform active:scale-90"
                style={{ backgroundColor: "rgba(255,255,255,0.16)", color: CREAM }}
              >
                ✕
              </button>
              <p className={`${body} relative text-[11px] uppercase tracking-[0.28em]`} style={{ color: CREAM, opacity: 0.85 }}>
                {c.time} · {m.dur} min
              </p>
              <h3 className={`${display} relative mt-1.5 text-4xl font-light leading-none`} style={{ color: CREAM }}>
                {c.name}
              </h3>
            </div>

            {/* Cuerpo con descripción y datos de la clase */}
            <div className="p-6">
              <p className={`${body} text-[15px] leading-relaxed`} style={{ color: GREEN, opacity: 0.85 }}>
                {m.desc}
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3">
                {c.coach && (
                  <div className="rounded-xl p-3" style={{ backgroundColor: "rgba(39,74,42,0.06)" }}>
                    <p className={`${body} text-[10px] uppercase tracking-[0.16em]`} style={{ color: GREEN, opacity: 0.5 }}>Coach</p>
                    <p className={`${body} mt-0.5 text-sm font-medium`} style={{ color: GREEN }}>{c.coach}</p>
                  </div>
                )}
                <div className="rounded-xl p-3" style={{ backgroundColor: "rgba(39,74,42,0.06)" }}>
                  <p className={`${body} text-[10px] uppercase tracking-[0.16em]`} style={{ color: GREEN, opacity: 0.5 }}>Cupo</p>
                  <p className={`${body} mt-0.5 text-sm font-medium`} style={{ color: GREEN }}>{m.cupo} lugares</p>
                </div>
              </div>

              <Link
                to="/register"
                className={`${body} mt-6 block rounded-full py-3.5 text-center text-[12px] uppercase tracking-[0.22em] transition-transform active:scale-[0.98]`}
                style={{ backgroundColor: GREEN, color: CREAM }}
              >
                Crear cuenta para reservar
              </Link>
              <Link
                to="/login"
                className={`${body} mt-3 block text-center text-[12px]`}
                style={{ color: GREEN, opacity: 0.6 }}
              >
                Ya tengo cuenta · Iniciar sesión
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Horario() {
  const [weekOffset, setWeekOffset] = useState(0);
  const { data, isLoading, isError, isFetching, refetch } = useWeekSchedule(weekOffset);
  const week = data ?? {};
  const { range, todayIdx, dayNums } = weekLabel(weekOffset);
  const totalClases = DAYS.reduce((n, d) => n + (week[d]?.length ?? 0), 0);
  const navBtn = "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg leading-none transition-all hover:scale-105 active:scale-95";

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
            <div className="mt-4 flex items-center justify-center gap-3">
              <button type="button" onClick={() => setWeekOffset((o) => o - 1)} aria-label="Semana anterior" className={navBtn} style={{ border: "1px solid rgba(42,78,54,0.3)", color: GREEN }}>
                ‹
              </button>
              <p className={`${body} min-w-[240px] text-[13px] uppercase tracking-[0.22em]`} style={{ color: GREEN, opacity: 0.65 }}>
                {range} · {totalClases} {totalClases === 1 ? "clase" : "clases"}
              </p>
              <button type="button" onClick={() => setWeekOffset((o) => o + 1)} aria-label="Semana siguiente" className={navBtn} style={{ border: "1px solid rgba(42,78,54,0.3)", color: GREEN }}>
                ›
              </button>
            </div>
          )}
          {weekOffset !== 0 && (
            <button type="button" onClick={() => setWeekOffset(0)} className={`${body} mt-3 text-[12px] uppercase tracking-[0.2em] underline underline-offset-4 transition-opacity hover:opacity-70`} style={{ color: GREEN, opacity: 0.6 }}>
              Volver a esta semana
            </button>
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

        {isLoading || (isFetching && !data) ? (
          <div className="rounded-2xl border border-[rgba(39,74,42,0.14)] bg-white/45 px-6 py-14 text-center" aria-live="polite">
            <p className={`${body} text-sm`} style={{ color: GREEN, opacity: 0.7 }}>Cargando las clases de esta semana…</p>
          </div>
        ) : isError ? (
          <div className="rounded-2xl border border-[rgba(174,72,54,0.25)] bg-white/55 px-6 py-10 text-center" role="alert">
            <p className={`${body} text-base font-medium`} style={{ color: GREEN }}>No pudimos cargar el horario.</p>
            <p className={`${body} mt-2 text-sm`} style={{ color: GREEN, opacity: 0.65 }}>Las clases siguen guardadas. Revisa tu conexión e inténtalo de nuevo.</p>
            <button
              type="button"
              onClick={() => refetch()}
              className={`${body} mt-5 rounded-full px-6 py-2.5 text-[12px] uppercase tracking-[0.18em]`}
              style={{ backgroundColor: GREEN, color: CREAM }}
            >
              Volver a intentar
            </button>
          </div>
        ) : (
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
                    {d}{dayNums[idx] != null ? ` ${dayNums[idx]}` : ""}
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
        )}

        <div className="mt-10 text-center">
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
    <section id="bar" className="relative min-h-[72dvh] overflow-hidden">
      <img src="/casashe/espacio-hidratacion.jpg" alt="Fuel Bar de Casa Shé" className="absolute inset-0 h-full w-full object-cover object-center" loading="lazy" decoding="async" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(18,33,22,0.86)_0%,rgba(18,33,22,0.48)_48%,rgba(18,33,22,0.12)_100%)]" />
      <div className="relative z-10 mx-auto flex min-h-[72dvh] max-w-[1400px] items-end px-5 py-16 sm:px-8 lg:px-12 lg:py-20" style={{ color: CREAM }}>
        <div className="max-w-2xl border-l border-white/45 pl-6 sm:pl-10">
        <p className={`${body} text-[12px] uppercase tracking-[0.4em]`} style={{ opacity: 0.8 }}>
          Fuel Bar
        </p>
        <h2 className={`${display} mt-3 text-5xl font-light leading-none sm:text-6xl lg:text-7xl`}>Recarga consciente.</h2>
        <p className={`${body} mt-5 max-w-xl text-base leading-relaxed sm:text-lg`} style={{ opacity: 0.86 }}>
          Bebidas funcionales, smoothies y snacks que nutren tu práctica. Hecho para que sigas en movimiento,
          dentro y fuera del estudio.
        </p>
        </div>
      </div>
    </section>
  );
}

function Nosotras() {
  return (
    <section id="nosotras" className="scroll-mt-20 px-5 py-20 sm:px-8 lg:px-12 lg:py-28" style={{ backgroundColor: CREAM }}>
      <div className="mx-auto grid max-w-[1400px] gap-8 md:grid-cols-12 md:items-center md:gap-0">
        <figure className="relative md:col-span-7">
          <img src="/casashe/espacio-detalles.jpg" alt="Detalles del espacio Casa Shé" className="aspect-[4/5] w-full object-cover sm:aspect-[16/11]" loading="lazy" decoding="async" />
          <figcaption className={`${body} absolute bottom-4 left-4 text-[10px] uppercase tracking-[0.25em] text-white/80`}>
            Alfonso Reyes 131 · Condesa
          </figcaption>
        </figure>
        <div className="border-t border-[#2A4E36]/30 pt-7 md:col-span-5 md:ml-[-3.5rem] md:bg-[#F6F0E4] md:p-12 lg:p-16">
          <img src="/casashe/logo-monogram.png" alt="" aria-hidden="true" className="mb-8 h-10 w-auto opacity-85" />
          <p className={`${body} text-[11px] uppercase tracking-[0.34em]`} style={{ color: GREEN, opacity: 0.6 }}>Nosotras</p>
          <h2 className={`${display} mt-4 text-5xl font-light leading-[0.98] lg:text-6xl`} style={{ color: GREEN }}>
            Bienestar para mujeres, en el corazón de la Condesa.
          </h2>
          <p className={`${body} mt-6 text-base leading-relaxed lg:text-lg`} style={{ color: GREEN, opacity: 0.78 }}>
            Casa Shé es comunidad, movimiento y cuidado. Grupos pequeños, atención cercana y un espacio para que cada mujer encuentre lo que su cuerpo necesita.
          </p>
          <p className={`${display} mt-8 text-3xl italic leading-none`} style={{ color: GREEN }}>
            La comunidad es la medicina.
          </p>
        </div>
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
      <Coaches />
      <Horario />
      <FuelBar />
      <Nosotras />
      <Footer />
    </main>
  );
}
