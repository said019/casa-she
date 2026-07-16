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
  bookingClassId?: string | null;
}

export function DaySpread({ weekDays, selectedDate, onSelectDate, classes, now, onPick, bookingClassId }: Props) {
  const dayClasses = classes
    .filter((c) => isSameDay(parseISO(c.time), selectedDate))
    .sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div className="mt-5">
      {/* Day strip */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none" aria-label="Días de la semana">
        {weekDays.map((d) => {
          const selected = isSameDay(d, selectedDate);
          const today = isToday(d);
          return (
            <button
              key={d.toISOString()}
              onClick={() => onSelectDate(d)}
              aria-pressed={selected}
              className={`min-w-[62px] rounded-[1rem] border px-2 py-2.5 text-center transition-[background-color,border-color,transform] duration-200 active:scale-[0.97] ${
                selected
                  ? "border-bmb-gold bg-bmb-gold text-bmb-cream shadow-[0_12px_28px_-20px_rgba(42,78,54,.9)]"
                  : today
                    ? "border-bmb-gold bg-bmb-paper/80 text-bmb-ink"
                    : "border-bmb-ink/14 bg-bmb-paper/55 text-bmb-ink/75"
              }`}
            >
              <div className={cnDayLabel(selected)}>{format(d, "EEE", { locale: es })}</div>
              <div className={`mt-1 font-heading italic text-lg sm:text-2xl leading-none ${selected ? "text-bmb-cream" : ""}`}>
                {format(d, "d")}
              </div>
            </button>
          );
        })}
      </div>

      {/* Day spread */}
      <div className="mt-4 overflow-hidden rounded-[1.35rem] border border-bmb-ink/12 bg-bmb-paper/78 shadow-[0_22px_60px_-52px_rgba(46,27,34,.65)]">
        <div className="flex items-end justify-between border-b border-bmb-ink/16 p-4 sm:p-5">
          <div>
            <div className="editorial-caption text-bmb-ink/70">
              {format(selectedDate, "EEEE", { locale: es })}
            </div>
            <div className="mt-1 font-heading text-3xl leading-none text-bmb-ink sm:text-5xl">
              {format(selectedDate, "d MMMM", { locale: es })}
            </div>
          </div>
          <div className="editorial-caption text-bmb-gold">
            {dayClasses.length} {dayClasses.length === 1 ? "clase" : "clases"}
          </div>
        </div>

        {dayClasses.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-heading text-2xl italic text-bmb-ink/60">Sin clases este día</p>
            <p className="mt-2 text-sm text-bmb-ink/48">Elige otra fecha para encontrar tu próxima práctica.</p>
          </div>
        ) : (
          <div>
            {dayClasses.map((c) => {
              const isBooking = bookingClassId === c.id;
              const status = getCellStatus(c, now);
              const isPast = status === "past";
              const statusLabel = isBooking
                ? "Reservando"
                : status === "booked"
                  ? "Reservada"
                  : c.bookingClosed
                    ? "Cerrada"
                    : status === "full"
                      ? "Lista de espera"
                      : status === "free"
                        ? c.freeLabel || "Gratis"
                        : `${c.spots} ${c.spots === 1 ? "lugar" : "lugares"}`;
              return (
                <button
                  key={c.id}
                  onClick={() => onPick(c)}
                  disabled={isBooking}
                  aria-busy={isBooking}
                  className={`relative grid w-full grid-cols-[54px_minmax(0,1fr)_auto] items-center gap-3 border-b border-dotted border-bmb-ink/16 px-4 py-4 pl-5 text-left transition-colors last:border-b-0 hover:bg-bmb-cream/60 active:bg-bmb-blush/60 ${
                    isBooking ? "cursor-wait opacity-65" : isPast ? "bg-bmb-ink/[0.025] saturate-[0.55]" : ""
                  }`}
                >
                  <span className="absolute inset-y-2.5 left-1.5 w-[3px] rounded-full" style={{ backgroundColor: classColor(c) }} aria-hidden="true" />
                  <span className="font-heading tabular-nums text-base text-bmb-ink">
                    {format(parseISO(c.time), "HH:mm")}
                  </span>
                  <span className="min-w-0">
                    <div className="truncate font-heading text-lg italic leading-tight text-bmb-ink">{c.name}</div>
                    <div className="mt-0.5 editorial-caption-sm text-bmb-ink/70 truncate">
                      {c.instructor} · {c.facilityName?.replace(/^Casa Shé\s*/i, "")}
                    </div>
                  </span>
                  <span className="text-right editorial-caption-sm text-bmb-ink/75">
                    {statusLabel}
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

function cnDayLabel(selected: boolean) {
  return `editorial-caption-sm ${selected ? "text-bmb-cream/85" : "text-bmb-ink/70"}`;
}
