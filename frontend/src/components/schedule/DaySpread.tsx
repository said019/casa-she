import { format, isSameDay, isToday, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ScheduleClass, classColor, getCellStatus } from "@/lib/schedule-state";

interface Props {
  weekDays: Date[];
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  classes: ScheduleClass[];
  now: Date;
  onPick: (c: ScheduleClass) => void;
}

export function DaySpread({ weekDays, selectedDate, onSelectDate, classes, now, onPick }: Props) {
  const dayClasses = classes
    .filter((c) => isSameDay(parseISO(c.time), selectedDate))
    .sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div>
      {/* Day strip */}
      <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-none">
        {weekDays.map((d) => {
          const selected = isSameDay(d, selectedDate);
          const today = isToday(d);
          return (
            <button
              key={d.toISOString()}
              onClick={() => onSelectDate(d)}
              className={`min-w-[60px] sm:min-w-[64px] border px-2 py-2 text-center transition-none ${
                selected
                  ? "bg-bmb-gold text-bmb-ink border-bmb-gold"
                  : today
                    ? "border-bmb-gold text-bmb-ink"
                    : "border-bmb-ink/20 text-bmb-ink/75"
              }`}
            >
              <div className="editorial-caption-sm opacity-70">{format(d, "EEE", { locale: es })}</div>
              <div className={`mt-1 font-heading italic text-lg sm:text-2xl leading-none ${selected ? "text-bmb-ink" : ""}`}>
                {format(d, "d")}
              </div>
            </button>
          );
        })}
      </div>

      {/* Day spread */}
      <div className="mt-4 border border-bmb-ink/15">
        <div className="flex items-end justify-between border-b border-bmb-ink p-3">
          <div>
            <div className="editorial-caption text-bmb-ink/55">
              {format(selectedDate, "EEEE", { locale: es })}
            </div>
            <div className="font-heading italic text-3xl sm:text-5xl text-bmb-ink leading-none mt-1">
              {format(selectedDate, "d")}
            </div>
          </div>
          <div className="editorial-caption text-bmb-gold">
            {format(selectedDate, "MMMM", { locale: es })} · MMXXVI
          </div>
        </div>

        {dayClasses.length === 0 ? (
          <p className="py-10 text-center font-heading italic text-bmb-ink/55">— sin clases este día —</p>
        ) : (
          <div>
            {dayClasses.map((c) => {
              const status = getCellStatus(c, now);
              const isPast = status === "past";
              return (
                <button
                  key={c.id}
                  onClick={() => onPick(c)}
                  className={`relative grid w-full grid-cols-[60px_1fr_70px] items-baseline gap-3 border-b border-dotted border-bmb-ink/20 px-3 py-3 pl-5 text-left ${
                    isPast ? "opacity-40" : ""
                  }`}
                >
                  <span className="absolute inset-y-2.5 left-1.5 w-[3px] rounded-full" style={{ backgroundColor: classColor(c) }} aria-hidden="true" />
                  <span className="font-heading tabular-nums text-base text-bmb-ink">
                    {format(parseISO(c.time), "HH:mm")}
                  </span>
                  <span className="min-w-0">
                    <div className="font-heading italic text-base text-bmb-ink leading-tight truncate">{c.name}</div>
                    <div className="mt-0.5 editorial-caption-sm text-bmb-ink/55 truncate">
                      {c.instructor} · {c.facilityName?.replace(/^Casa Shé\s*/i, "")}
                    </div>
                  </span>
                  <span
                    className="text-right editorial-caption-sm"
                    style={{ color: classColor(c) }}
                  >
                    {status === "full" ? "LLENA" : `${c.spots} de ${c.maxSpots}`}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
