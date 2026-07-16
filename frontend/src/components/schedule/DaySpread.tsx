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
      {/* Cinta editorial: los siete días caben sin scroll en móvil. */}
      <div className="grid grid-cols-7 border-y border-bmb-ink/16 py-2" aria-label="Días de la semana">
        {weekDays.map((d) => {
          const selected = isSameDay(d, selectedDate);
          const today = isToday(d);
          return (
            <button
              key={d.toISOString()}
              onClick={() => onSelectDate(d)}
              aria-pressed={selected}
              className={`relative min-w-0 px-0.5 py-2 text-center transition-[color,transform] duration-200 active:scale-[0.96] ${selected ? "text-bmb-ink" : "text-bmb-ink/58"}`}
            >
              <span
                className={`absolute inset-x-1 bottom-0 h-[2px] origin-center transition-transform ${selected ? "scale-x-100 bg-bmb-gold" : "scale-x-0"}`}
                aria-hidden="true"
              />
              <div className={cnDayLabel(selected)}>{format(d, "EEEEEE", { locale: es })}</div>
              <div className={`mx-auto mt-1 flex h-8 w-8 items-center justify-center rounded-full font-heading text-xl leading-none ${
                selected ? "bg-bmb-ink text-bmb-cream" : today ? "border border-bmb-gold text-bmb-ink" : ""
              }`}>
                {format(d, "d")}
              </div>
            </button>
          );
        })}
      </div>

      {/* Day spread */}
      <div className="mt-5 border-y border-bmb-ink/18 bg-bmb-paper/34">
        <div className="flex items-end justify-between border-b border-dotted border-bmb-ink/22 px-1 py-5 sm:px-3">
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
          <div className="px-6 py-14 text-center">
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
                  style={{ borderLeftColor: classColor(c) }}
                  className={`grid w-full grid-cols-[4.25rem_minmax(0,1fr)] items-start gap-3 border-b border-l-[3px] border-dotted border-bmb-ink/16 px-3 py-5 text-left transition-[background-color,transform] last:border-b-0 hover:bg-bmb-cream/60 active:translate-y-px active:bg-bmb-blush/60 ${
                    isBooking ? "cursor-wait opacity-65" : isPast ? "bg-bmb-ink/[0.025] saturate-[0.55]" : ""
                  }`}
                >
                  <span className="font-heading text-2xl italic tabular-nums leading-none text-bmb-ink">
                    {format(parseISO(c.time), "HH:mm")}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-start justify-between gap-2">
                      <span className="truncate font-heading text-xl leading-none text-bmb-ink">{c.name}</span>
                      <span className="shrink-0 editorial-caption-sm text-right text-bmb-ink/68">
                        {statusLabel}
                      </span>
                    </span>
                    <div className="mt-0.5 editorial-caption-sm text-bmb-ink/70 truncate">
                      {c.instructor} · {c.facilityName?.replace(/^Casa Shé\s*/i, "")}
                    </div>
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
  return `editorial-caption-sm ${selected ? "text-bmb-ink/85" : "text-bmb-ink/55"}`;
}
