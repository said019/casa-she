import { ScheduleClass, TimeOfDay } from "@/lib/schedule-state";

type Category = ScheduleClass["category"] | "all";

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

const shortFacility = (f: string) => f.replace(/^BMB Studio\s*/i, "");

export function FilterPills({
  facilities, facility, onFacilityChange,
  categories, category, onCategoryChange,
  instructors, instructor, onInstructorChange,
  timeOfDay, onTimeOfDayChange,
  resultCount, activeFilters, onClear,
}: Props) {
  const facilityOptions: [string, string][] = [
    ["all", "Todas las sucursales"],
    ...facilities.map((f) => [f, shortFacility(f)] as [string, string]),
  ];
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
        <FilterSelect label="Sucursal" value={facility} onChange={onFacilityChange} options={facilityOptions} />
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

      {/* ───────── Escritorio: pills (Sucursal/Tipo) + dropdowns (Coach/Horario) ───────── */}
      <div className="hidden lg:flex lg:flex-wrap lg:items-end lg:gap-x-6 lg:gap-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="editorial-caption text-bmb-ink/55">Sucursal</span>
          <PillButton active={facility === "all"} onClick={() => onFacilityChange("all")}>Todas</PillButton>
          {facilities.map((f) => (
            <PillButton key={f} active={facility === f} onClick={() => onFacilityChange(f)}>{shortFacility(f)}</PillButton>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="editorial-caption text-bmb-ink/55">Tipo</span>
          <PillButton active={category === "all"} onClick={() => onCategoryChange("all")}>Todas</PillButton>
          {categories.map((c) => (
            <PillButton key={c} active={category === c} gold={c === "pole"} onClick={() => onCategoryChange(c)}>
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
  children, active, gold = false, onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  gold?: boolean;
  onClick: () => void;
}) {
  const base = "px-3 py-1 font-heading italic text-[13px] border transition-none";
  const inactive = "border-bmb-ink/25 text-bmb-ink/75 hover:border-bmb-ink/55";
  const activeStyle = gold
    ? "bg-bmb-gold border-bmb-gold text-bmb-ink"
    : "bg-bmb-gold border-bmb-gold text-bmb-ink";
  return (
    <button type="button" onClick={onClick} className={`${base} ${active ? activeStyle : inactive}`}>
      {children}
    </button>
  );
}
