import { ScheduleClass, TimeOfDay, categoryColor } from "@/lib/schedule-state";

type Category = ScheduleClass["category"] | "all";

const CREAM = "#F6F0E4";
const INK = "#2E1B22";
const VERDE = "#2A4E36";

// Texto legible (crema sobre oscuros, tinta sobre claros como Mostaza/Arena).
function readableOn(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? INK : CREAM;
}

interface Props {
  facilities: string[];
  facility: string | "all";
  onFacilityChange: (f: string | "all") => void;
  categories: Category[];
  category: Category;
  onCategoryChange: (c: Category) => void;
  instructors: string[];
  instructor: string | "all";
  onInstructorChange: (i: string | "all") => void;
  timeOfDay: TimeOfDay;
  onTimeOfDayChange: (t: TimeOfDay) => void;
  resultCount: number;
  activeFilters: boolean;
  onClear: () => void;
}

const CATEGORY_LABEL: Record<Exclude<Category, "all">, string> = {
  reformer: "Reformer",
  hot: "Hot Pilates",
  pole: "Pole",
  barre: "Barre",
  sculpt: "Sculpt",
  yoga: "Yoga",
  general: "General",
};

const TIME_OPTIONS: [TimeOfDay, string][] = [
  ["all", "Todo el día"],
  ["morning", "Mañana"],
  ["afternoon", "Tarde"],
  ["evening", "Noche"],
];

const shortFacility = (f: string) => f.replace(/^Casa Shé\s*/i, "");

export function FilterPills({
  categories, category, onCategoryChange,
  instructors, instructor, onInstructorChange,
  timeOfDay, onTimeOfDayChange,
  resultCount, activeFilters, onClear,
}: Props) {
  // Casa Shé es mono-sede (Condesa): se eliminó el filtro de sucursal del render.
  const categoryOptions: [string, string][] = [
    ["all", "Todos los tipos"],
    ...categories.map((c) => [c, CATEGORY_LABEL[c as Exclude<Category, "all">]] as [string, string]),
  ];
  const instructorOptions: [string, string][] = [
    ["all", "Todos los coaches"],
    ...instructors.map((i) => [i, i] as [string, string]),
  ];

  return (
    <div className="border-y border-bmb-ink/20 py-3">
      {/* ───────── Móvil: dropdowns compactos (no se amontona) ───────── */}
      <div className="grid grid-cols-2 gap-2 lg:hidden">
        <FilterSelect label="Tipo" value={category} onChange={(v) => onCategoryChange(v as Category)} options={categoryOptions} />
        <FilterSelect label="Coach" value={instructor} onChange={onInstructorChange} options={instructorOptions} />
        <FilterSelect label="Horario" value={timeOfDay} onChange={(v) => onTimeOfDayChange(v as TimeOfDay)} options={TIME_OPTIONS} />
        <div className="col-span-2 mt-0.5 flex items-center justify-between">
          <span className="editorial-caption-sm text-bmb-ink/55">{resultCount} {resultCount === 1 ? "clase" : "clases"}</span>
          {activeFilters && (
            <button type="button" onClick={onClear} className="editorial-caption-sm text-bmb-gold underline-offset-2 hover:underline">
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* ───────── Escritorio: pills (Tipo) + dropdowns (Coach/Horario) ───────── */}
      <div className="hidden lg:flex lg:flex-wrap lg:items-end lg:gap-x-6 lg:gap-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="editorial-caption text-bmb-ink/55">Tipo</span>
          <PillButton active={category === "all"} color={VERDE} onClick={() => onCategoryChange("all")}>Todas</PillButton>
          {categories.map((c) => (
            <PillButton key={c} active={category === c} color={categoryColor(c)} dot onClick={() => onCategoryChange(c)}>
              {CATEGORY_LABEL[c as Exclude<Category, "all">]}
            </PillButton>
          ))}
        </div>
        <FilterSelect label="Coach" value={instructor} onChange={onInstructorChange} options={instructorOptions} className="min-w-[170px]" />
        <FilterSelect label="Horario" value={timeOfDay} onChange={(v) => onTimeOfDayChange(v as TimeOfDay)} options={TIME_OPTIONS} className="min-w-[130px]" />
        <div className="ml-auto flex items-center gap-3 pb-1">
          <span className="editorial-caption-sm whitespace-nowrap text-bmb-ink/55">{resultCount} {resultCount === 1 ? "clase" : "clases"}</span>
          {activeFilters && (
            <button type="button" onClick={onClear} className="editorial-caption-sm whitespace-nowrap text-bmb-gold underline-offset-2 hover:underline">
              Limpiar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  label, value, onChange, options, className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="editorial-caption-sm text-bmb-ink/55">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-none border border-bmb-ink/25 bg-bmb-paper bg-[length:9px] bg-[right_0.7rem_center] bg-no-repeat py-2 pl-2.5 pr-7 font-heading italic text-[13px] text-bmb-ink focus:border-bmb-gold focus:outline-none"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6' fill='none' stroke='%23322A1E' stroke-width='1.5'%3E%3Cpath d='M1 1l4 4 4-4'/%3E%3C/svg%3E\")" }}
      >
        {options.map(([val, lbl]) => (
          <option key={val} value={val}>{lbl}</option>
        ))}
      </select>
    </label>
  );
}

function PillButton({
  children, active, color, dot = false, onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  color: string;
  dot?: boolean;
  onClick: () => void;
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 font-heading italic text-[13px] transition-[background-color,border-color,transform] duration-200 active:scale-[0.97]";
  if (active) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={base}
        style={{ backgroundColor: color, borderColor: color, color: readableOn(color) }}
      >
        {children}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} border-bmb-ink/25 text-bmb-ink/75 hover:border-bmb-ink/55`}
    >
      {dot && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />}
      {children}
    </button>
  );
}
