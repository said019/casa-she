import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, addWeeks, format, isToday, parseISO, startOfWeek, subWeeks } from "date-fns";
import { es } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import {
  ScheduleClass,
  ScheduleFilters,
  applyFilters,
  buildHourRail,
  classifyCategory,
  classesAt,
  categoryColor,
  classColor,
  withAlpha,
  getCellStatus,
  getWeekDays,
} from "@/lib/schedule-state";
import { FilterPills } from "./schedule/FilterPills";
import { NowLine } from "./schedule/NowLine";
import { DaySpread } from "./schedule/DaySpread";

interface ApiClass {
  id: string;
  date: string;
  class_date: string;
  start_time: string;
  end_time: string;
  class_type_name: string;
  class_type_color: string;
  instructor_id?: string | null;
  instructor_name: string;
  instructor_photo: string | null;
  capacity: number;
  current_bookings: number;
  status: string;
  facility_name?: string | null;
  is_free?: boolean;
  free_label?: string | null;
  booking_closed?: boolean;
}

interface ScheduleProps {
  bookedIds?: Set<string>;
  /** Cuando true, el filtro arranca en la primera sucursal en vez de "Todas" (evita mezclar ambas en el grid). */
  defaultFirstFacility?: boolean;
}

export default function Schedule({ bookedIds, defaultFirstFacility }: ScheduleProps = {}) {
  const navigate = useNavigate();
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [filters, setFilters] = useState<ScheduleFilters>({ facility: "all", category: "all", instructor: "all", timeOfDay: "all" });
  const [now, setNow] = useState(new Date());
  const [flipDirection, setFlipDirection] = useState<"forward" | "back">("forward");
  const goPrev = () => { setFlipDirection("back"); setWeekStart((w) => subWeeks(w, 1)); };
  const goNext = () => { setFlipDirection("forward"); setWeekStart((w) => addWeeks(w, 1)); };
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < 768 : false);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const startDate = format(weekStart, "yyyy-MM-dd");
  const endDate = format(addDays(weekStart, 6), "yyyy-MM-dd");

  const { data: apiClasses } = useQuery<ApiClass[]>({
    queryKey: ["public-classes", startDate, endDate],
    queryFn: async () => {
      const { data } = await api.get(`/classes?start_date=${startDate}&end_date=${endDate}`);
      return data;
    },
    retry: 1,
    staleTime: 1000 * 60 * 2,
  });

  const allClasses: ScheduleClass[] = useMemo(() => {
    if (!apiClasses) return [];
    return apiClasses
      .filter((c) => c.status !== "cancelled")
      .map((c): ScheduleClass => {
        const dateStr = (c.date || c.class_date || "").split("T")[0];
        const category = classifyCategory(c.class_type_name);
        return {
          id: c.id,
          name: c.class_type_name,
          category,
          time: `${dateStr}T${c.start_time}`,
          endTime: c.end_time || "",
          duration: 50,
          instructor: c.instructor_name || "Coach por confirmar",
          instructorId: c.instructor_id || null,
          instructorPhoto: c.instructor_photo || null,
          spots: Math.max(0, c.capacity - (c.current_bookings || 0)),
          maxSpots: c.capacity || 6,
          color: c.class_type_color || categoryColor(category),
          typeColor: c.class_type_color || null,
          facilityName: c.facility_name ?? null,
          isFree: !!c.is_free,
          freeLabel: c.free_label ?? null,
          isBookedByUser: bookedIds?.has(c.id) ?? false,
          bookingClosed: !!c.booking_closed,
        };
      });
  }, [apiClasses, bookedIds]);

  const visibleClasses = useMemo(() => applyFilters(allClasses, filters), [allClasses, filters]);

  const facilities = useMemo(
    () => [...new Set(allClasses.map((c) => c.facilityName).filter(Boolean) as string[])].sort(),
    [allClasses],
  );
  const categories = useMemo(() => {
    const cats = new Set<ScheduleClass["category"]>();
    for (const c of allClasses) cats.add(c.category);
    return [...cats].sort() as ScheduleClass["category"][];
  }, [allClasses]);
  const instructors = useMemo(
    () => [...new Set(allClasses.map((c) => c.instructor).filter((n) => n && n !== "Coach por confirmar"))].sort(),
    [allClasses],
  );

  const activeFilters =
    filters.facility !== "all" || filters.category !== "all" ||
    filters.instructor !== "all" || filters.timeOfDay !== "all";
  const clearFilters = () => setFilters({ facility: "all", category: "all", instructor: "all", timeOfDay: "all" });

  // Reservar (cliente): arranca filtrado en la primera sucursal en vez de "Todas",
  // para no mezclar ambas sucursales en el grid. Solo una vez al cargar; después el
  // usuario puede elegir "Todas" libremente (el guard evita re-aplicarlo en refetches).
  const didInitFacility = useRef(false);
  useEffect(() => {
    if (!defaultFirstFacility || didInitFacility.current || facilities.length === 0) return;
    didInitFacility.current = true;
    setFilters((s) => (s.facility === "all" ? { ...s, facility: facilities[0] } : s));
  }, [defaultFirstFacility, facilities]);

  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const hourRail = useMemo(() => buildHourRail(visibleClasses), [visibleClasses]);

  const ROW_HEIGHT = 60;
  const HEADER_HEIGHT = 56;
  const firstHour = hourRail[0] ?? 7;
  const lastHour = hourRail[hourRail.length - 1] ?? 21;

  return (
    <section id="horarios" className="bg-bmb-cream py-20 lg:py-24 scroll-mt-24">
      <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">

        {/* Masthead */}
        <header className="flex flex-col gap-4 border-b-2 border-bmb-ink pb-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="editorial-caption text-bmb-ink/55">
              Semana {format(weekStart, "w")} · {format(weekStart, "d MMM", { locale: es })} — {format(addDays(weekStart, 6), "d MMM", { locale: es })}
            </p>
            <h2 className="mt-1 font-heading text-2xl sm:text-3xl text-bmb-ink lg:text-5xl">
              Horarios <span className="italic text-bmb-gold">BMB</span>
            </h2>
          </div>
          <div className="flex flex-col gap-2 lg:items-end">
            <span className="editorial-caption whitespace-nowrap text-bmb-ink/55">
              {format(weekStart, "MMMM · MMMM", { locale: es }).split("·")[0].trim()} · MMXXVI
            </span>
            <div className="flex flex-wrap gap-2">
              <NavBtn onClick={goPrev}>‹ Sem. ant.</NavBtn>
              <NavBtn active>Esta semana</NavBtn>
              <NavBtn onClick={goNext}>Sem. sig. ›</NavBtn>
            </div>
          </div>
        </header>

        <FilterPills
          facilities={facilities}
          facility={filters.facility}
          onFacilityChange={(f) => setFilters((s) => ({ ...s, facility: f }))}
          categories={categories}
          category={filters.category}
          onCategoryChange={(c) => setFilters((s) => ({ ...s, category: c }))}
          instructors={instructors}
          instructor={filters.instructor}
          onInstructorChange={(i) => setFilters((s) => ({ ...s, instructor: i }))}
          timeOfDay={filters.timeOfDay}
          onTimeOfDayChange={(t) => setFilters((s) => ({ ...s, timeOfDay: t }))}
          resultCount={visibleClasses.length}
          activeFilters={activeFilters}
          onClear={clearFilters}
        />

        {/* Grid scaffold — cells filled in Task 1.3 */}
        {isMobile ? (
          <DaySpread
            weekDays={weekDays}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            classes={visibleClasses}
            now={now}
            onPick={(c) => navigate(`/app/book/${c.id}`)}
          />
        ) : (
        <div className="relative mt-6">
          <NowLine
            firstHour={firstHour}
            lastHour={lastHour}
            topOffsetPx={HEADER_HEIGHT}
            rowHeightPx={ROW_HEIGHT}
          />
          <div
            key={startDate}
            className={`grid border-l border-t border-bmb-ink/15 ${
              flipDirection === "forward" ? "animate-week-flip-in" : "animate-week-flip-in-back"
            }`}
            style={{ gridTemplateColumns: `56px repeat(7, 1fr)` }}
          >
          <div className="border-r border-b border-bmb-ink/15 bg-bmb-paper" />
          {weekDays.map((d) => (
            <div
              key={d.toISOString()}
              className={`border-r border-b border-bmb-ink/15 px-2 py-2 text-center ${
                isToday(d) ? "bg-bmb-gold text-bmb-ink" : "bg-bmb-paper"
              }`}
            >
              <div className="editorial-caption-sm opacity-70">{format(d, "EEE", { locale: es })}</div>
              <div className={`mt-1 font-heading text-2xl font-semibold leading-none ${isToday(d) ? "text-bmb-ink" : ""}`}>
                {format(d, "d")}
              </div>
            </div>
          ))}

          {hourRail.map((h) => (
            <Row key={h} hour={h} weekDays={weekDays} classes={visibleClasses} now={now} onPick={(c) => navigate(`/app/book/${c.id}`)} />
          ))}
          </div>
        </div>
        )}

        {hourRail.length === 0 && (
          <p className="mt-12 text-center font-heading italic text-bmb-ink/55">
            — sin clases programadas esta semana —
          </p>
        )}
      </div>
    </section>
  );
}

function NavBtn({ children, active, onClick }: { children: React.ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap border px-3 py-1 font-heading italic text-[13px] ${
        active ? "bg-bmb-gold border-bmb-gold text-bmb-ink" : "border-bmb-ink text-bmb-ink hover:bg-bmb-ink/5"
      }`}
    >
      {children}
    </button>
  );
}

function Row({
  hour,
  weekDays,
  classes,
  now,
  onPick,
}: {
  hour: number;
  weekDays: Date[];
  classes: ScheduleClass[];
  now: Date;
  onPick: (c: ScheduleClass) => void;
}) {
  const label = `${hour % 12 || 12}`;
  const period = hour < 12 ? "am" : "pm";
  return (
    <>
      <div className="border-r border-b border-bmb-ink/15 bg-bmb-paper px-2 py-3 text-right">
        <div className="font-heading text-base tabular-nums leading-none opacity-60">{label}</div>
        <div className="editorial-caption-sm opacity-55 mt-0.5">{period}</div>
      </div>
      {weekDays.map((day) => {
        const cellClasses = classesAt(classes, day, hour);
        const isTodayCol = isToday(day);
        return (
          <div
            key={day.toISOString() + hour}
            className={`relative min-h-[60px] border-r border-b border-dotted border-bmb-ink/10 p-1.5 ${
              isTodayCol ? "bg-bmb-gold/[0.05]" : "bg-bmb-paper"
            }`}
          >
            {cellClasses.map((c) => {
              const status = getCellStatus(c, now);
              const isPast = status === "past";
              const isFull = status === "full";
              const isFree = status === "free";
              const isBooked = status === "booked";
              const isInProgress = status === "in-progress";
              const isClosed = !!c.bookingClosed && !isBooked && !isPast;

              const color = classColor(c);
              // Cada clase con su color: las reservables (y en curso) se tiñen con el
              // color de su tipo; libre/llena/reservada conservan su estado visual.
              const isColored = !isFree && !isFull && !isBooked;

              const bgClass = isFree
                ? "bg-[#f1f7ee]"
                : isFull
                  ? "bg-[#f5e6d8]"
                  : isBooked
                    ? "bg-bmb-deepgold text-bmb-cream"
                    : "";

              const accent = isFree ? "#2f7a3a" : isBooked ? "#CE9B25" : color;

              return (
                <button
                  key={c.id}
                  onClick={() => onPick(c)}
                  style={isColored ? { backgroundColor: withAlpha(color, 0.1), borderColor: withAlpha(color, 0.34) } : undefined}
                  className={`relative block w-full overflow-hidden rounded-lg ${bgClass} border border-bmb-ink/[0.07] py-2 pl-3 pr-2 mb-1.5 text-left shadow-[0_1px_2px_rgba(42,33,24,0.05)] transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-px hover:border-bmb-gold/50 hover:shadow-[0_10px_22px_-12px_rgba(42,33,24,0.45)] ${
                    isPast ? "opacity-45" : isClosed ? "opacity-60" : ""
                  }`}
                >
                  <span className="absolute inset-y-1.5 left-0 w-[3.5px] rounded-full" style={{ backgroundColor: accent }} aria-hidden="true" />
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`text-[12.5px] font-bold tabular-nums leading-none ${isBooked ? "text-bmb-cream" : ""}`}
                      style={isBooked ? undefined : { color }}
                    >
                      {format(parseISO(c.time), "HH:mm")}
                      {c.endTime && (
                        <span className={`ml-0.5 font-normal ${isBooked ? "text-bmb-cream/70" : "text-bmb-ink/45"}`}>
                          –{c.endTime.slice(0, 5)}
                        </span>
                      )}
                    </span>
                    {isClosed && (
                      <span className="shrink-0 rounded-full border border-amber-500/70 px-1.5 py-0 editorial-caption-sm text-amber-700">
                        Cerrada
                      </span>
                    )}
                    {isFull && !isClosed && (
                      <span className="shrink-0 rounded-full border border-bmb-deepgold/70 px-1.5 py-0 editorial-caption-sm text-bmb-deepgold">
                        Llena
                      </span>
                    )}
                  </div>
                  {isFree && (
                    <span className="mt-1 mb-0.5 inline-block rounded-full bg-[#2f7a3a] px-1.5 py-0.5 editorial-caption-sm text-white">
                      {c.freeLabel || "Gratis · prueba"}
                    </span>
                  )}
                  {isBooked && (
                    <span className="block editorial-caption-sm text-bmb-cream">Reservada</span>
                  )}
                  <div className={`mt-1 truncate text-[13px] font-semibold leading-tight ${isBooked ? "text-bmb-cream" : "text-bmb-ink"}`}>
                    {c.name}
                  </div>
                  <div className={`mt-1 flex items-center justify-between gap-2 ${isBooked ? "text-bmb-cream/70" : "text-bmb-ink/60"}`}>
                    <span className="truncate text-[11px]">{c.instructor}</span>
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${isBooked ? "bg-bmb-cream/20 text-bmb-cream" : "bg-bmb-ink/[0.06] text-bmb-ink/70"}`}>
                      {c.maxSpots - c.spots}/{c.maxSpots}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        );
      })}
    </>
  );
}
