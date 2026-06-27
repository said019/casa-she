import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  packageOrder,
  packagePresentations,
  getPackageType,
  getClassesLabel,
  type PackageType,
} from "@/lib/planPresentation";

interface Plan {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  currency?: string;
  duration_days?: number | null;
  class_limit?: number | null;
  reformer_credits: number | null;
  multi_credits: number | null;
  features?: string[] | null;
  is_active: boolean;
  is_internal?: boolean;
  sort_order?: number | null;
  package_type?: PackageType;
  requires_studio_selection?: boolean;
}

const mxn = (n: number) => "$" + Number(n).toLocaleString("es-MX");

// Color por tipo de plan (igual que en el /app, derivado de planPresentation).
const TYPE_COLOR: Record<PackageType, string> = {
  membership: "#2E4A35",
  sample: "#B5512F",
  individual: "#2E4A35",
  mixto: "#DBB0B3",
};

// Etiqueta de créditos/clases — misma lógica que la app (PurchaseFlow).
function creditsLabel(p: Plan): string {
  const ref = p.reformer_credits;
  const mul = p.multi_credits;
  const total = (ref ?? 0) + (mul ?? 0);
  if (ref === null && mul === null) return "Acceso ilimitado";
  if (ref === null) return "Reformer ilimitado";
  if (mul === null) return "Multi ilimitado";
  if ((ref ?? 0) > 0 && (mul ?? 0) > 0) return `${ref} reformer · ${mul} multi`;
  if (total > 0) return `${total} ${total === 1 ? "clase" : "clases"}`;
  return getClassesLabel(p.class_limit, 1);
}

export default function Pricing() {
  const [filter, setFilter] = useState<PackageType | "all">("all");

  const { data: plans = [], isLoading } = useQuery<Plan[]>({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data } = await api.get("/plans");
      return Array.isArray(data) ? data : [];
    },
  });

  const active = useMemo(
    () => [...plans].filter((p) => p.is_active && !p.is_internal).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [plans],
  );

  const typesPresent = useMemo(() => {
    const set = new Set(active.map((p) => getPackageType(p)));
    return packageOrder.filter((t) => set.has(t));
  }, [active]);

  const visible = useMemo(
    () => (filter === "all" ? active : active.filter((p) => getPackageType(p) === filter)),
    [active, filter],
  );

  return (
    <section id="planes" className="scroll-mt-24 border-b border-bmb-ink/15 bg-bmb-cream py-20 lg:py-24">
      <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
        <div className="border-b-2 border-bmb-ink pb-4">
          <div className="flex items-baseline justify-between gap-4">
            <span className="editorial-caption text-bmb-ink/45">Membresías</span>
            <span className="editorial-caption text-bmb-gold">N° 06</span>
          </div>
          <h2 className="mt-2 font-heading text-4xl text-bmb-ink lg:text-5xl">Planes</h2>
        </div>

        {typesPresent.length > 1 && (
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <FilterPill active={filter === "all"} onClick={() => setFilter("all")}>
              Todos
            </FilterPill>
            {typesPresent.map((t) => (
              <FilterPill key={t} active={filter === t} color={TYPE_COLOR[t]} onClick={() => setFilter(t)}>
                {packagePresentations[t].shortTitle}
              </FilterPill>
            ))}
          </div>
        )}

        {isLoading ? (
          <p className="mt-12 text-center font-heading text-bmb-ink/55">Cargando planes…</p>
        ) : visible.length === 0 ? (
          <p className="mt-12 text-center font-heading text-bmb-ink/55">No hay planes en esta categoría.</p>
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((p) => {
              const total = (p.reformer_credits ?? 0) + (p.multi_credits ?? 0);
              const perClass =
                total > 0 && p.reformer_credits !== null && p.multi_credits !== null
                  ? Math.round(p.price / total)
                  : null;
              const lines =
                p.features && p.features.length > 0
                  ? p.features
                  : [
                      p.description || "Reserva desde la app",
                      p.duration_days ? `Vigencia ${p.duration_days} días` : "Cancelación hasta 12 h antes",
                    ];
              return (
                <article
                  key={p.id}
                  className="flex flex-col border border-l-[3px] border-bmb-ink/15 bg-bmb-paper p-6 text-bmb-ink"
                  style={{ borderLeftColor: TYPE_COLOR[getPackageType(p)] }}
                >
                  <p className="editorial-caption-sm" style={{ color: TYPE_COLOR[getPackageType(p)] }}>
                    {packagePresentations[getPackageType(p)].shortTitle}
                  </p>
                  <h3 className="mt-2 font-heading text-2xl leading-tight">{p.name}</h3>
                  <p className="mt-3 font-heading tabular-nums text-4xl text-bmb-gold">{mxn(p.price)}</p>
                  <p className="mt-1 editorial-caption text-bmb-ink/55">{creditsLabel(p)}</p>
                  {perClass !== null && (
                    <p className="mt-0.5 editorial-caption-sm text-bmb-ink/40">≈ {mxn(perClass)} / clase</p>
                  )}
                  <div className="my-5 h-px bg-bmb-ink/15" />
                  <ul className="flex-1 space-y-2 text-sm text-bmb-ink/80">
                    {lines.map((d, i) => (
                      <li key={i} className="relative pl-4">
                        <span className="absolute left-0 opacity-55">—</span>
                        {d}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to="/login"
                    className="mt-6 block w-full border border-bmb-ink px-4 py-3 text-center text-sm font-semibold uppercase tracking-[0.12em] text-bmb-ink transition-colors hover:border-bmb-gold hover:bg-bmb-gold hover:text-bmb-ink"
                  >
                    Elegir
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function FilterPill({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const c = color ?? "#B5512F"; // dorado para "Todos"
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 border px-3 py-1 text-sm font-semibold transition-colors"
      style={{
        borderColor: active ? c : "rgba(42,33,24,0.22)",
        backgroundColor: active ? `${c}26` : "transparent",
        color: active ? "#2E1B22" : "rgba(42,33,24,0.7)",
      }}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c }} />
      {children}
    </button>
  );
}
