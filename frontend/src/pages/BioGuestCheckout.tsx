import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, CheckCircle2, CreditCard, Loader2, LockKeyhole } from "lucide-react";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import type { User } from "@/types/auth";

const BASE = "font-['Baskervville']";

type ClassDetail = {
  id: string;
  date: string;
  start_time: string;
  class_type_name: string;
  instructor_name?: string;
};

type CheckoutStatus = {
  paid: boolean;
  orderStatus: string;
  requiresLogin: boolean;
  email: string;
  displayName: string;
  classId: string;
  className: string;
  date: string;
  startTime: string;
  expired: boolean;
};

function dateLabel(value?: string) {
  if (!value) return "";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" })
    .format(new Date(year, month - 1, day));
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen px-4 py-6 sm:py-10" style={{ background: "radial-gradient(circle at 8% 0%, #f4ddd1, transparent 33%), #eee5dc" }}>
      <section className="mx-auto max-w-[560px] overflow-hidden rounded-[2rem] border border-white/80 bg-[#fffaf5] p-5 shadow-[0_24px_70px_rgba(57,42,37,.13)] sm:p-7">
        {children}
      </section>
    </main>
  );
}

function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={`${BASE} block text-[15px] text-[#59433a]`}>
      {label}
      <input {...props} className="mt-1.5 h-12 w-full rounded-2xl border border-[#e6d6ca] bg-white px-4 text-[16px] text-[#392a25] outline-none transition focus:border-[#b66049]" />
    </label>
  );
}

export function BioGuestCheckout() {
  const { classId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const planId = searchParams.get("plan") || "";
  const [selectedClass, setSelectedClass] = useState<ClassDetail | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get<ClassDetail>(`/classes/${classId}`).then(({ data }) => setSelectedClass(data)).catch(() => setError("No encontramos esta clase."));
  }, [classId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!planId) return setError("La clase suelta no está disponible en este momento.");
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post<{ checkoutUrl: string }>("/bio-checkout/start", { classId, planId, displayName, email, phone });
      window.location.assign(data.checkoutUrl);
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || "No pudimos iniciar el pago.");
      setLoading(false);
    }
  };

  return (
    <Shell>
      <Link to="/bio/horarios" className="inline-flex items-center gap-2 text-sm text-[#6f574e]"><ArrowLeft className="h-4 w-4" /> Cambiar clase</Link>
      <p className={`${BASE} mt-5 text-[11px] uppercase tracking-[0.24em] text-[#a26b59]`}>Compra rápida</p>
      <h1 className={`${BASE} mt-2 text-[40px] leading-none text-[#392a25]`}>Paga primero</h1>
      <p className={`${BASE} mt-3 text-[17px] leading-relaxed text-[#6f574e]`}>Sólo necesitamos tus datos para identificar el pago. Crearás tu acceso al portal después.</p>

      {selectedClass && (
        <div className="mt-5 rounded-[1.3rem] bg-[#244936] p-4 text-[#fffaf5]">
          <p className={`${BASE} text-[22px]`}>{selectedClass.class_type_name}</p>
          <p className={`${BASE} mt-1 capitalize text-[15px] text-[#ead8ca]`}>{dateLabel(selectedClass.date)} · {selectedClass.start_time}</p>
        </div>
      )}

      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label="Nombre" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" required />
        <Field label="Correo" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
        <Field label="WhatsApp" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" placeholder="55 1234 5678" required />
        {error && <p className={`${BASE} rounded-xl bg-[#f8e2dc] px-4 py-3 text-[14px] text-[#9d3f32]`}>{error}</p>}
        <button disabled={loading} className={`${BASE} flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#b66049] px-5 text-[19px] text-white disabled:opacity-60`}>
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <CreditCard className="h-5 w-5" />} Ir a pagar
        </button>
      </form>
      <div className={`${BASE} mt-5 flex gap-3 rounded-2xl bg-[#f4e9df] p-4 text-[13px] leading-relaxed text-[#6f574e]`}><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[#244936]" /> Tu lugar se guarda 10 minutos mientras completas el pago seguro en Mercado Pago.</div>
    </Shell>
  );
}

export function BioCheckoutFinalize() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [status, setStatus] = useState<CheckoutStatus | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptsTerms, setAcceptsTerms] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return setError("El enlace de confirmación no es válido.");
    let active = true;
    const refresh = async () => {
      try {
        const { data } = await api.get<CheckoutStatus>(`/bio-checkout/status?token=${encodeURIComponent(token)}`);
        if (active) setStatus(data);
      } catch (requestError: any) {
        if (active) setError(requestError.response?.data?.error || "No pudimos consultar el pago.");
      }
    };
    refresh();
    const interval = window.setInterval(refresh, 3000);
    return () => { active = false; window.clearInterval(interval); };
  }, [token]);

  const title = useMemo(() => status?.requiresLogin ? "Entra a tu portal" : "Crea tu acceso", [status?.requiresLogin]);

  const complete = async (event: FormEvent) => {
    event.preventDefault();
    if (!status?.requiresLogin && password !== confirmPassword) return setError("Las contraseñas no coinciden.");
    if (!acceptsTerms) return setError("Debes aceptar los términos y el reglamento.");
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post<{ token: string; user: User; classId: string; bioCheckoutToken: string }>("/bio-checkout/complete", { token, password, acceptsTerms });
      setAuth(data.user, data.token);
      await api.post("/bookings", { classId: data.classId, bioCheckoutToken: data.bioCheckoutToken });
      navigate("/app/classes?bio=confirmed", { replace: true });
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || "No pudimos terminar tu reserva.");
      setLoading(false);
    }
  };

  if (!status?.paid) {
    return (
      <Shell>
        <div className="py-12 text-center">
          <Loader2 className="mx-auto h-9 w-9 animate-spin text-[#b66049]" />
          <h1 className={`${BASE} mt-5 text-[34px] text-[#392a25]`}>Confirmando tu pago</h1>
          <p className={`${BASE} mt-3 text-[16px] text-[#6f574e]`}>{status?.expired ? "El tiempo de pago terminó. Vuelve a elegir tu clase." : "Esto suele tomar sólo unos segundos. No cierres esta página."}</p>
          {status?.expired && <Link to="/bio/horarios" className={`${BASE} mt-6 inline-flex rounded-full bg-[#244936] px-6 py-3 text-white`}>Ver horarios</Link>}
          {error && <p className={`${BASE} mt-5 text-[#9d3f32]`}>{error}</p>}
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <CheckCircle2 className="h-10 w-10 text-[#244936]" />
      <p className={`${BASE} mt-4 text-[11px] uppercase tracking-[0.24em] text-[#a26b59]`}>Pago confirmado</p>
      <h1 className={`${BASE} mt-2 text-[40px] leading-none text-[#392a25]`}>{title}</h1>
      <p className={`${BASE} mt-3 text-[17px] leading-relaxed text-[#6f574e]`}>{status.requiresLogin ? `Tu compra ya está en ${status.email}. Escribe tu contraseña para reservar.` : "Elige una contraseña. Con este correo entrarás a tus clases, créditos y perfil."}</p>
      <div className="mt-5 rounded-[1.3rem] bg-[#f4e9df] p-4">
        <p className={`${BASE} text-[21px] text-[#392a25]`}>{status.className}</p>
        <p className={`${BASE} mt-1 capitalize text-[14px] text-[#80685e]`}>{dateLabel(status.date)} · {status.startTime.slice(0, 5)}</p>
      </div>
      <form onSubmit={complete} className="mt-6 space-y-4">
        <Field label={status.requiresLogin ? "Contraseña de tu cuenta" : "Crea una contraseña"} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={status.requiresLogin ? "current-password" : "new-password"} required />
        {!status.requiresLogin && <Field label="Confirma tu contraseña" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required />}
        <label className={`${BASE} flex items-start gap-3 rounded-2xl border border-[#e6d6ca] bg-white p-4 text-[14px] leading-relaxed text-[#59433a]`}>
          <input type="checkbox" checked={acceptsTerms} onChange={(event) => setAcceptsTerms(event.target.checked)} className="mt-1 h-4 w-4 accent-[#b66049]" />
          <span>Acepto los <Link to="/terms" target="_blank" className="underline">términos</Link>, la privacidad y el reglamento de Casa Shé.</span>
        </label>
        {error && <p className={`${BASE} rounded-xl bg-[#f8e2dc] px-4 py-3 text-[14px] text-[#9d3f32]`}>{error}</p>}
        <button disabled={loading} className={`${BASE} flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#b66049] px-5 text-[19px] text-white disabled:opacity-60`}>
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <CalendarDays className="h-5 w-5" />} Confirmar mi lugar
        </button>
      </form>
      <p className={`${BASE} mt-4 text-center text-[13px] text-[#80685e]`}>Después entrarás directo a “Mis clases” dentro de tu portal.</p>
    </Shell>
  );
}
