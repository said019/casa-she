import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { classifyCategory, categoryColor, type ScheduleClass } from "@/lib/schedule-state";

interface ClassType {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  color?: string | null;
  is_active: boolean;
}

type Cat = ScheduleClass["category"];

const CAT_LABEL: Record<Cat, string> = {
  reformer: "Reformer",
  hot: "Hot",
  pole: "Pole",
  barre: "Barre",
  sculpt: "Sculpt",
  yoga: "Yoga",
  general: "Funcional",
};

const CAT_ORDER: Cat[] = ["reformer", "hot", "pole", "barre", "sculpt", "yoga", "general"];

// Descripción corta por categoría (fallback).
const CAT_DESC: Record<Cat, string> = {
  reformer: "Trabajo preciso sobre el reformer: control y postura.",
  hot: "En sala caliente: más intensidad y sudor.",
  pole: "Fuerza, gracia y confianza en la barra.",
  barre: "Tono y postura con movimientos pequeños y precisos.",
  sculpt: "Definición con pesas y altas repeticiones.",
  yoga: "Movilidad, respiración y equilibrio.",
  general: "Entrenamiento funcional para fuerza y resistencia.",
};

// Descripción corta por clase (la BD las trae vacías).
const CLASS_DESC: Record<string, string> = {
  "Reformer Classic": "Reformer clásico: control, postura y core con precisión.",
  "Pilates Reformer": "Pilates en reformer: fuerza profunda y alineación.",
  "Reformer Jumpboard": "Reformer con jumpboard: cardio de bajo impacto, saltas y tonificas.",
  "Reformer Flow": "Secuencias fluidas en reformer: movilidad y control.",
  "Reformer Sculpt": "Reformer con pesas: tono y definición total.",
  "Restore Reformer": "Reformer suave y restaurativo: recupera y estira.",
  "Hot Pilates": "Pilates en sala caliente: sudas y despiertas.",
  "Hot Barre": "Barre en calor: tono y resistencia intensos.",
  "Hot Sculpt": "Sculpt con calor y pesas: pura definición.",
  "Hot Yoga": "Yoga en calor: flexibilidad, fuerza y soltura.",
  "Pole Dance": "Pole con arte y técnica: fuerza y confianza.",
  "Pole Fitness": "Pole de fuerza y acondicionamiento.",
  "Barre": "Ballet, yoga y pilates: tono sin impacto.",
  "Barre Studio": "Barre de estudio: postura y trabajo de piernas.",
  "Sculpt": "Pesos ligeros, muchas reps: tono dirigido.",
  "Yoga": "Movilidad, respiración y calma. La base de todo.",
  "Yoga Sculpt": "Yoga con pesas: fuerza y flexibilidad.",
  "Pilates Mat": "Pilates en colchoneta: core, control y alineación.",
  "Flex": "Movilidad y estiramiento profundo para recuperar.",
  "Funcional": "Entrenamiento funcional: fuerza para tu día a día.",
  "Full Body Funcional": "Funcional de cuerpo completo: fuerza y cardio.",
  "Lower Body Funcional": "Funcional de piernas y glúteos.",
  "Upper Body Funcional": "Funcional de brazos, espalda y core.",
  "Twerk": "Baile y cardio: suelta, diviértete y tonifica.",
};

function descFor(name: string, dbDesc: string | null | undefined, cat: Cat): string {
  if (dbDesc && dbDesc.trim()) return dbDesc.trim();
  return CLASS_DESC[name] ?? CAT_DESC[cat];
}

export default function ClassTypes() {
  const [filter, setFilter] = useState<Cat | "all">("all");
  const [flippedId, setFlippedId] = useState<string | null>(null);

  const { data: types = [], isLoading } = useQuery<ClassType[]>({
    queryKey: ["class-types"],
    queryFn: async () => {
      const { data } = await api.get("/class-types");
      return Array.isArray(data) ? data : [];
    },
  });

  const items = useMemo(
    () =>
      types
        .filter((t) => t.is_active)
        .map((t) => ({ ...t, cat: classifyCategory(t.name) as Cat }))
        .sort((a, b) => CAT_ORDER.indexOf(a.cat) - CAT_ORDER.indexOf(b.cat) || a.name.localeCompare(b.name)),
    [types],
  );

  const catsPresent = useMemo(() => {
    const set = new Set(items.map((i) => i.cat));
    return CAT_ORDER.filter((c) => set.has(c));
  }, [items]);

  const visible = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.cat === filter)),
    [items, filter],
  );

  return (
    <section id="modalidades" className="scroll-mt-24 border-b border-bmb-ink/15 bg-bmb-paper py-20 lg:py-24">
      <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
        <div className="border-b-2 border-bmb-ink pb-4">
          <div className="flex items-baseline justify-between gap-4">
            <span className="editorial-caption text-bmb-ink/45">Lo que se da en el estudio</span>
            <span className="editorial-caption text-bmb-gold">N° 03</span>
          </div>
          <h2 className="mt-2 font-heading text-4xl text-bmb-ink lg:text-5xl">Clases</h2>
        </div>

        {catsPresent.length > 1 && (
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <FilterPill active={filter === "all"} onClick={() => { setFilter("all"); setFlippedId(null); }}>
              Todas
            </FilterPill>
            {catsPresent.map((c) => (
              <FilterPill key={c} active={filter === c} onClick={() => { setFilter(c); setFlippedId(null); }}>
                {CAT_LABEL[c]}
              </FilterPill>
            ))}
          </div>
        )}

        {isLoading ? (
          <p className="mt-12 text-center font-heading text-bmb-ink/55">Cargando clases…</p>
        ) : visible.length === 0 ? (
          <p className="mt-12 text-center font-heading text-bmb-ink/55">Sin clases en esta categoría.</p>
        ) : (
          <>
            <p className="mt-6 editorial-caption-sm text-bmb-ink/40">Toca una clase para ver de qué trata.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((t) => {
                const color = t.color || categoryColor(t.cat);
                const flipped = flippedId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setFlippedId(flipped ? null : t.id)}
                    aria-pressed={flipped}
                    className="group h-32 text-left [perspective:1200px]"
                  >
                    <div
                      className={`flip-3d relative h-full w-full transition-transform duration-500 ${
                        flipped ? "[transform:rotateY(180deg)]" : ""
                      }`}
                    >
                      {/* Frente */}
                      <div
                        className="flip-face absolute inset-0 flex flex-col justify-between border-l-[3px] bg-bmb-cream/45 px-5 py-5 transition-colors group-hover:bg-bmb-cream/70"
                        style={{ borderLeftColor: color }}
                      >
                        <h3 className="font-heading text-xl leading-tight text-bmb-ink">{t.name}</h3>
                        <div className="flex items-center justify-between">
                          <span className="editorial-caption-sm" style={{ color }}>
                            {CAT_LABEL[t.cat]}
                          </span>
                          <span className="editorial-caption-sm text-bmb-ink/35">ver +</span>
                        </div>
                      </div>
                      {/* Reverso */}
                      <div
                        className="flip-face absolute inset-0 flex flex-col justify-between border-l-[3px] px-5 py-5 [transform:rotateY(180deg)]"
                        style={{ borderLeftColor: color, backgroundColor: `${color}1f` }}
                      >
                        <p className="text-sm leading-snug text-bmb-ink/85">{descFor(t.name, t.description, t.cat)}</p>
                        <span className="editorial-caption-sm" style={{ color }}>
                          {t.name}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border px-3 py-1 text-sm font-semibold transition-colors ${
        active ? "border-bmb-gold bg-bmb-gold text-bmb-ink" : "border-bmb-ink/25 text-bmb-ink/70 hover:border-bmb-ink/55"
      }`}
    >
      {children}
    </button>
  );
}
