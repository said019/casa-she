import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  CreditCard,
  Dumbbell,
  Globe,
  Instagram,
  Mail,
  MapPin,
  Sparkles,
  Users,
} from "lucide-react";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";

const BASE = "font-['Baskervville']";
const GREEN = "#244936";
const TERRACOTTA = "#b66049";
const INK = "#392a25";

type PublicClass = {
  id: string;
  date: string;
  start_time: string;
  end_time?: string;
  class_type_name?: string;
  instructor_name?: string;
  current_bookings?: number;
  max_capacity?: number;
  status?: string;
  booking_closed?: boolean;
  is_free?: boolean;
};

type Plan = {
  id: string;
  name: string;
  price?: number | string;
  multi_credits?: number | null;
  reformer_credits?: number | null;
  duration_days?: number | null;
  class_limit?: number | null;
  is_active?: boolean;
  is_internal?: boolean;
  features?: string[];
};

function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function bioDateLabel(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" })
    .format(new Date(year, month - 1, day));
}

function BioFrame({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${title} — Casa Shé`;
    return () => { document.title = previousTitle; };
  }, [title]);

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 sm:py-10" style={{ background: "radial-gradient(circle at 8% 0%, #f4ddd1, transparent 33%), #eee5dc" }}>
      <section className="mx-auto max-w-[560px]">
        <Link to="/bio" className="mb-5 inline-flex items-center gap-2 rounded-full px-1 py-2 text-sm text-[#645048] transition hover:text-[#b66049]">
          <ArrowLeft className="h-4 w-4" /> Volver a enlaces
        </Link>
        <div className="overflow-hidden rounded-[2rem] border border-white/80 bg-[#fffaf5] p-5 shadow-[0_24px_70px_rgba(57,42,37,.13)] sm:p-7">
          <p className={`${BASE} text-[11px] uppercase tracking-[0.25em] text-[#a26b59]`}>{eyebrow}</p>
          <h1 className={`${BASE} mt-2 text-[42px] leading-none text-[#392a25]`}>{title}</h1>
          {children}
        </div>
      </section>
    </main>
  );
}

function BioAction({ to, label, detail, primary = false, icon: Icon }: {
  to: string;
  label: string;
  detail: string;
  primary?: boolean;
  icon: typeof CalendarDays;
}) {
  return (
    // Link y no <a href>: con <a> cada tarjeta recargaba la app entera —
    // desde Instagram eso es un parpadeo en blanco de un segundo por toque.
    <Link
      to={to}
      className="group flex items-center gap-4 rounded-[1.35rem] border px-4 py-4 text-left transition duration-200 hover:-translate-y-0.5"
      style={primary
        ? { background: TERRACOTTA, borderColor: TERRACOTTA, color: "#fffaf4", boxShadow: "0 14px 26px rgba(182,96,73,.22)" }
        : { background: "#fffdfa", borderColor: "#e8d9cf", color: INK }}
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full" style={primary ? { background: "rgba(255,255,255,.16)" } : { background: "#f2e8df", color: GREEN }}>
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`${BASE} block text-[25px] leading-none`}>{label}</span>
        <span className={`${BASE} mt-1 block text-[14px] opacity-70`}>{detail}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1" />
    </Link>
  );
}

export default function BioLink() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Casa Shé — Enlaces";
    return () => { document.title = previousTitle; };
  }, []);

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 sm:py-10" style={{ background: "radial-gradient(circle at 8% 0%, #f4ddd1, transparent 33%), #eee5dc" }}>
      <section className="mx-auto max-w-[560px] overflow-hidden rounded-[2.2rem] border border-white/80 bg-[#fffaf5] p-4 shadow-[0_24px_70px_rgba(57,42,37,.14)] sm:p-5">
        <div className="relative overflow-hidden rounded-[1.7rem] bg-[#244936] px-6 pb-8 pt-7 text-center text-[#fff9f2]">
          <img src="/casashe/studio-barre-hero.webp" alt="Clase en Casa Shé" className="absolute inset-0 h-full w-full object-cover opacity-30" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(24,59,41,.28),rgba(24,59,41,.92))]" />
          <div className="relative">
            <div className="mx-auto flex h-[78px] w-[78px] items-center justify-center rounded-full bg-[#fbf1e8] shadow-lg">
              <img src="/casashe/logo-monogram.png" alt="Monograma Casa Shé" className="h-12 w-12" />
            </div>
            <img src="/casashe/logo-wordmark-cream.png" alt="Casa Shé" className="mx-auto mt-4 h-9 w-auto max-w-full" />
            <p className={`${BASE} mt-4 text-[11px] uppercase tracking-[0.24em] text-[#f6e8da]`}>Condesa · CDMX</p>
          </div>
        </div>

        <div className="px-1 pb-2 pt-5">
          <div className="mb-4 flex items-center gap-2 text-[#9a6555]"><Sparkles className="h-4 w-4" /><span className={`${BASE} text-[11px] uppercase tracking-[0.2em]`}>Todo Casa Shé en un lugar</span></div>
          <nav className="space-y-3" aria-label="Enlaces Casa Shé">
            {/* Cada tarjeta lleva a lo que promete. Antes "Ubicación" y "Contacto"
                iban las dos a /#contacto — un ancla que la landing ni siquiera
                tiene (sus secciones son inicio, paquetes, servicios, estudio,
                equipo, horario, bar, nosotras), así que ambas caían al inicio. */}
            {/* Página web primero: desde que la raíz es esta página, sin esta
                tarjeta no quedaba forma de llegar al sitio completo. Va arriba,
                pero en estilo normal — la reserva sigue siendo la destacada. */}
            <BioAction to="/landing" label="Página web" detail="Conoce todo Casa Shé" icon={Globe} />
            <BioAction to="/bio/reservar" label="Reserva tu clase" detail="Elige, paga y confirma en pocos pasos" primary icon={CalendarDays} />
            <BioAction to="/bio/horarios" label="Horarios" detail="Clases reales de esta semana" icon={CalendarDays} />
            <BioAction to="/bio/paquetes" label="Paquetes" detail="Membresías y créditos" icon={Dumbbell} />
            <BioAction to="/bio/espacio" label="Conoce el espacio" detail="Casa, servicios y comunidad" icon={Sparkles} />
            <BioAction to="/bio/ubicacion" label="Ubicación" detail="Alfonso Reyes 131, Condesa" icon={MapPin} />
            <BioAction to="/bio/contacto" label="Contacto" detail="Escríbenos o síguenos" icon={Mail} />
          </nav>
          <Link to="/login" className={`${BASE} mt-5 flex items-center justify-center rounded-[1.1rem] border border-[#e6d6ca] bg-[#f4e9df] px-4 py-3 text-[16px] text-[#59433a] transition hover:bg-[#eedfd4]`}>
            ¿Ya eres parte de Casa Shé? <span className="ml-2 underline decoration-[#b66049] underline-offset-4">Entrar</span>
          </Link>
        </div>
      </section>
    </main>
  );
}

function useBioClasses(days = 7) {
  return useQuery<PublicClass[]>({
    queryKey: ["bio-classes", days],
    queryFn: async () => {
      const from = new Date();
      const to = new Date();
      to.setDate(from.getDate() + days - 1);
      const { data } = await api.get(`/classes?start=${localDate(from)}&end=${localDate(to)}`);
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60_000,
  });
}

export function BioSchedule() {
  const { data: classes = [], isLoading } = useBioClasses();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const { data: plans = [] } = useQuery<Plan[]>({
    queryKey: ["bio-quick-plans"],
    queryFn: async () => {
      const { data } = await api.get("/plans");
      return Array.isArray(data) ? data : [];
    },
    staleTime: 5 * 60_000,
  });
  const quickPlan = plans.find((plan) => {
    const name = plan.name.toLowerCase();
    return plan.is_active !== false && !plan.is_internal && (name.includes("clase suelta") || name.includes("drop") || plan.class_limit === 1);
  });
  const now = Date.now();
  const availableClasses = classes.filter((item) => {
    const startsAt = new Date(`${item.date.slice(0, 10)}T${item.start_time.slice(0, 5)}:00`).getTime();
    return item.status !== "cancelled" && startsAt > now;
  });
  const grouped = availableClasses.reduce<Record<string, PublicClass[]>>((acc, item) => {
    (acc[item.date.slice(0, 10)] ||= []).push(item);
    return acc;
  }, {});

  const clientPath = (path: string) => {
    if (isAuthenticated && user?.role === "client") return path;
    return `/register?returnUrl=${encodeURIComponent(path)}`;
  };

  const reservePath = (classId: string) => clientPath(`/app/book/${classId}?source=bio`);
  const paymentPath = (classId: string) => {
    const query = new URLSearchParams({ source: "bio", classId });
    if (quickPlan?.id) query.set("plan", quickPlan.id);
    if (isAuthenticated && user?.role === "client") return `/app/checkout?${query.toString()}`;
    return `/bio/pagar/${classId}?plan=${encodeURIComponent(quickPlan?.id || "")}`;
  };

  return (
    <BioFrame eyebrow="Tu próxima práctica" title="Horarios">
      <p className={`${BASE} mt-4 text-[17px] leading-relaxed text-[#6f574e]`}>Aquí aparecen las clases disponibles en los próximos siete días.</p>
      <div className="mt-5 grid grid-cols-3 gap-2 rounded-[1.25rem] bg-[#f4e9df] p-3 text-center">
        {["1. Elige", "2. Paga", "3. Reserva"].map((step) => (
          <span key={step} className={`${BASE} rounded-full bg-white px-2 py-2 text-[13px] text-[#5f493f]`}>{step}</span>
        ))}
      </div>
      <div className="mt-6 space-y-5">
        {isLoading && <p className={`${BASE} rounded-2xl bg-[#f4e9df] p-5 text-[#6f574e]`}>Cargando horarios…</p>}
        {!isLoading && Object.entries(grouped).map(([date, slots]) => (
          <section key={date}>
            <h2 className={`${BASE} capitalize text-[22px] text-[#244936]`}>{bioDateLabel(date)}</h2>
            <div className="mt-2 overflow-hidden rounded-[1.2rem] border border-[#eadbd1]">
              {slots.sort((a, b) => a.start_time.localeCompare(b.start_time)).map((slot) => (
                <div key={slot.id} className="border-b border-[#eee2d9] bg-white p-4 last:border-0">
                  <div className="flex items-start gap-3">
                    <span className="w-12 shrink-0 pt-1 text-sm font-semibold text-[#b66049]">{slot.start_time.slice(0, 5)}</span>
                    <span className="min-w-0 flex-1">
                      <strong className={`${BASE} block text-[19px] font-normal leading-tight text-[#392a25]`}>{slot.class_type_name || "Clase"}</strong>
                      <small className={`${BASE} mt-1 block text-[13px] text-[#8a7066]`}>{slot.instructor_name || "Casa Shé"}</small>
                    </span>
                    {slot.max_capacity != null && (
                      <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-[#80685e]">
                        <Users className="h-3.5 w-3.5" /> {Math.max(0, slot.max_capacity - (slot.current_bookings || 0))}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Link to={reservePath(slot.id)} className={`${BASE} flex min-h-11 items-center justify-center rounded-full bg-[#244936] px-3 text-center text-[15px] text-white`}>
                      Reservar
                    </Link>
                    {!slot.is_free && (
                      <Link to={paymentPath(slot.id)} className={`${BASE} flex min-h-11 items-center justify-center gap-1 rounded-full border border-[#b66049]/35 bg-[#fff7f1] px-3 text-center text-[14px] text-[#9d4f3d]`}>
                        <CreditCard className="h-3.5 w-3.5" /> Pagar clase
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
        {!isLoading && !availableClasses.length && <p className={`${BASE} rounded-2xl bg-[#f4e9df] p-5 text-[#6f574e]`}>Pronto publicaremos los próximos horarios.</p>}
      </div>
      <p className={`${BASE} mt-6 text-center text-[14px] leading-relaxed text-[#80685e]`}>Si ya tienes créditos, toca <strong>Reservar</strong>. Si todavía no tienes paquete, toca <strong>Pagar clase</strong>.</p>
    </BioFrame>
  );
}

export function BioPackages() {
  const { data: plans = [], isLoading } = useQuery<Plan[]>({
    queryKey: ["bio-plans"],
    queryFn: async () => {
      const { data } = await api.get("/plans");
      return Array.isArray(data) ? data : [];
    },
    staleTime: 5 * 60_000,
  });
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);

  const buyPath = (planId: string) => {
    const checkout = `/app/checkout?plan=${encodeURIComponent(planId)}&source=bio`;
    if (isAuthenticated && user?.role === "client") return checkout;
    return `/register?returnUrl=${encodeURIComponent(checkout)}`;
  };

  const planFeatures = (plan: Plan) => {
    if (!plan.features || !plan.features.length) return [];
    return plan.features;
  };

  return (
    <BioFrame eyebrow="A tu ritmo" title="Paquetes">
      <p className={`${BASE} mt-4 text-[17px] leading-relaxed text-[#6f574e]`}>Elige la manera que más te guste de vivir Casa Shé.</p>
      <div className="mt-6 space-y-3">
        {isLoading && <p className={`${BASE} rounded-2xl bg-[#f4e9df] p-5 text-[#6f574e]`}>Cargando paquetes…</p>}
        {plans.map((plan) => {
          const credits = plan.multi_credits ?? plan.reformer_credits;
          const features = planFeatures(plan);
          return (
            <Link key={plan.id} to={buyPath(plan.id)} className="block rounded-[1.25rem] border border-[#eadbd1] bg-white p-4 transition hover:border-[#b66049]">
              <div className="flex items-start justify-between gap-4"><h2 className={`${BASE} text-[24px] leading-none text-[#392a25]`}>{plan.name}</h2>{plan.price != null && <span className={`${BASE} text-[18px] text-[#b66049]`}>${Number(plan.price).toLocaleString("es-MX")}</span>}</div>
              <p className={`${BASE} mt-2 text-[14px] text-[#80685e]`}>{credits ? `${credits} créditos` : "Acceso a tu práctica"}{plan.duration_days ? ` · ${plan.duration_days} días de vigencia` : ""}</p>
              {features.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-[13px] text-[#6f574e]">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#b66049]" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Link>
          );
        })}
      </div>
      <Link to="/bio/reservar" className={`${BASE} mt-7 flex items-center justify-center rounded-full bg-[#b66049] px-5 py-4 text-[19px] text-white`}>Crear mi cuenta <ArrowUpRight className="ml-2 h-4 w-4" /></Link>
    </BioFrame>
  );
}

export function BioReserve() {
  const { data: classes = [], isLoading } = useBioClasses(3);
  return (
    <BioFrame eyebrow="Tu lugar te espera" title="Reserva">
      <p className={`${BASE} mt-4 text-[17px] leading-relaxed text-[#6f574e]`}>Crea tu cuenta para reservar, comprar paquetes y llevar tu progreso en Casa Shé.</p>
      <div className="mt-6 rounded-[1.4rem] bg-[#244936] p-5 text-[#fff8ef]">
        <p className={`${BASE} text-[12px] uppercase tracking-[0.2em] text-[#e6c9b6]`}>Próximas clases</p>
        <div className="mt-3 space-y-2">{classes.slice(0, 4).map((slot) => <p key={slot.id} className={`${BASE} flex justify-between gap-4 text-[17px]`}><span>{slot.class_type_name}</span><span className="text-[#f2c9b8]">{slot.start_time.slice(0, 5)}</span></p>)}{!isLoading && !classes.length && <p className={`${BASE} text-[16px] text-[#f2ddcd]`}>Consulta el horario para ver la siguiente clase.</p>}</div>
      </div>
      <Link to="/register?returnUrl=%2Fapp%2Fbook" className={`${BASE} mt-5 flex items-center justify-center rounded-full bg-[#b66049] px-5 py-4 text-[19px] text-white`}>Crear cuenta y reservar <ArrowUpRight className="ml-2 h-4 w-4" /></Link>
      <Link to="/login" className={`${BASE} mt-4 block text-center text-[16px] text-[#6f574e] underline underline-offset-4`}>Ya tengo una cuenta</Link>
    </BioFrame>
  );
}

export function BioSpace() {
  return (
    <BioFrame eyebrow="Un refugio en la ciudad" title="Nuestro espacio">
      <img src="/casashe/galeria/comunidad.webp" alt="Comunidad Casa Shé" className="mt-5 h-64 w-full rounded-[1.4rem] object-cover" />
      <p className={`${BASE} mt-5 text-[18px] leading-relaxed text-[#6f574e]`}>Casa Shé es un wellness hub para hacer del movimiento un ritual y de la comunidad un lugar al que quieras volver.</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        {[["Movimiento", "Pilates, Barre, Sculpt, Yoga, Flex y Salsa"], ["Bienestar", "Nutrición, cuidado y momentos para ti"]].map(([title, detail]) => <div key={title} className="rounded-[1.2rem] bg-[#f4e9df] p-4"><h2 className={`${BASE} text-[21px] text-[#244936]`}>{title}</h2><p className={`${BASE} mt-1 text-[14px] leading-snug text-[#755e54]`}>{detail}</p></div>)}
      </div>
      <Link to="/bio/reservar" className={`${BASE} mt-7 flex items-center justify-center rounded-full bg-[#b66049] px-5 py-4 text-[19px] text-white`}>Quiero conocer Casa Shé</Link>
    </BioFrame>
  );
}

export function BioLocation() {
  const mapUrl = "https://www.google.com/maps/search/?api=1&query=Alfonso+Reyes+131%2C+Condesa%2C+CDMX";
  return (
    <BioFrame eyebrow="Visítanos" title="Ubicación">
      <img src="/casashe/espacio-salon.jpg" alt="Interior de Casa Shé" className="mt-5 h-64 w-full rounded-[1.4rem] object-cover" />
      <div className="mt-5 rounded-[1.4rem] bg-[#f4e9df] p-5"><MapPin className="h-6 w-6 text-[#b66049]" /><p className={`${BASE} mt-3 text-[27px] leading-tight text-[#392a25]`}>Alfonso Reyes 131<br />Condesa, CDMX</p></div>
      <a href={mapUrl} target="_blank" rel="noreferrer" className={`${BASE} mt-5 flex items-center justify-center rounded-full bg-[#244936] px-5 py-4 text-[19px] text-white`}>Abrir cómo llegar <ArrowUpRight className="ml-2 h-4 w-4" /></a>
    </BioFrame>
  );
}

export function BioContact() {
  return (
    <BioFrame eyebrow="Estamos para ti" title="Contacto">
      <p className={`${BASE} mt-4 text-[17px] leading-relaxed text-[#6f574e]`}>Escríbenos para resolver dudas, conocer Casa Shé o empezar tu práctica.</p>
      <div className="mt-6 space-y-3">
        <a href="mailto:casashecondesa@gmail.com" className="flex items-center gap-4 rounded-[1.25rem] border border-[#eadbd1] bg-white p-4"><Mail className="h-6 w-6 text-[#b66049]" /><span className={`${BASE} text-[20px] text-[#392a25]`}>casashecondesa@gmail.com</span></a>
        <a href="https://www.instagram.com/casashe.mx/" target="_blank" rel="noreferrer" className="flex items-center gap-4 rounded-[1.25rem] border border-[#eadbd1] bg-white p-4"><Instagram className="h-6 w-6 text-[#244936]" /><span className={`${BASE} text-[20px] text-[#392a25]`}>@casashe.mx</span></a>
      </div>
      <Link to="/bio/reservar" className={`${BASE} mt-7 flex items-center justify-center rounded-full bg-[#b66049] px-5 py-4 text-[19px] text-white`}>Reservar mi primera clase</Link>
    </BioFrame>
  );
}
