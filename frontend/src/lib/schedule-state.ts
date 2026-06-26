import { addDays, addMinutes, differenceInMinutes, isSameDay, parseISO, startOfWeek } from "date-fns";

export interface ScheduleClass {
  id: string;
  name: string;
  category: "reformer" | "pole" | "hot" | "barre" | "yoga" | "sculpt" | "general";
  time: string;            // ISO with date+time
  endTime: string;         // "HH:mm"
  duration: number;        // minutes
  instructor: string;
  instructorId: string | null;
  instructorPhoto: string | null;
  spots: number;
  maxSpots: number;
  color: string;
  typeColor?: string | null;   // color crudo del tipo de clase (class_type_color), sin fallback
  facilityName: string | null;
  isFree: boolean;
  freeLabel: string | null;
  isBookedByUser?: boolean;
  bookingClosed?: boolean;
}

export type CellStatus =
  | "available"
  | "full"
  | "free"
  | "booked"
  | "past"
  | "in-progress";

export function getCellStatus(cls: ScheduleClass, now: Date): CellStatus {
  const start = parseISO(cls.time);
  const end = cls.endTime
    ? parseISO(`${cls.time.split("T")[0]}T${cls.endTime}`)
    : addMinutes(start, cls.duration);

  if (cls.isBookedByUser) return "booked";
  if (now >= end) return "past";
  if (now >= start && now < end) return "in-progress";
  if (cls.spots === 0) return "full";
  if (cls.isFree) return "free";
  return "available";
}

export function classifyCategory(name: string): ScheduleClass["category"] {
  const n = name.toLowerCase();
  if (n.includes("pole")) return "pole";
  if (n.includes("hot")) return "hot";
  if (n.includes("yoga") || n.includes("stretch")) return "yoga";
  if (n.includes("barre")) return "barre";
  if (n.includes("sculpt")) return "sculpt";
  if (n.includes("reformer") || n.includes("jumpboard")) return "reformer";
  return "general";
}

const CATEGORY_COLORS: Record<ScheduleClass["category"], string> = {
  reformer: "#CE9B25",
  general:  "#CE9B25",
  pole:     "#A6776A",
  hot:      "#A6776A",
  barre:    "#CE9B25",
  sculpt:   "#CE9B25",
  yoga:     "#7C8265",
};

export function categoryColor(category: ScheduleClass["category"]): string {
  return CATEGORY_COLORS[category];
}

// Paleta cálida/terrosa de marca para distinguir CADA tipo de clase por su nombre
// (cuando el admin no le puso color propio al tipo). Estable por nombre.
const CLASS_PALETTE = [
  "#CE9B25", "#B5742A", "#A6776A", "#C2603F", "#9B6A86", "#7C8265",
  "#8A7E66", "#C99A57", "#A85D4E", "#6E8E84", "#B08968", "#94785B",
];

function hashName(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const HEX_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

// Color de UNA clase: respeta el color del tipo si el admin lo definió (y no es el
// placeholder gris), si no asigna un color estable por nombre para que cada tipo
// de clase se vea distinto y sea fácil de escanear al reservar.
export function classColor(c: { name: string; typeColor?: string | null }): string {
  const t = (c.typeColor || "").trim();
  if (HEX_RE.test(t) && t.toLowerCase() !== "#7e8579") return t;
  return CLASS_PALETTE[hashName(c.name) % CLASS_PALETTE.length];
}

// Convierte un hex (#rgb o #rrggbb) a rgba con alpha, para tintes suaves.
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((ch) => ch + ch).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return `rgba(126,133,121,${alpha})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function currentWeekStart(d: Date): Date {
  return startOfWeek(d, { weekStartsOn: 1 });
}

export function buildHourRail(classes: ScheduleClass[]): number[] {
  const hours = new Set<number>();
  for (const c of classes) {
    const h = parseISO(c.time).getHours();
    hours.add(h);
  }
  return [...hours].sort((a, b) => a - b);
}

export function classesAt(
  classes: ScheduleClass[],
  day: Date,
  hour: number,
): ScheduleClass[] {
  return classes.filter((c) => {
    const t = parseISO(c.time);
    return isSameDay(t, day) && t.getHours() === hour;
  });
}

export type TimeOfDay = "all" | "morning" | "afternoon" | "evening";

export interface ScheduleFilters {
  facility: string | "all";
  category: ScheduleClass["category"] | "all";
  instructor: string | "all";
  timeOfDay: TimeOfDay;
}

/** Franja del día según la hora de inicio: mañana (<12), tarde (12–17), noche (>=18). */
export function timeBand(time: string): Exclude<TimeOfDay, "all"> {
  const h = parseISO(time).getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}

export function applyFilters(
  classes: ScheduleClass[],
  filters: ScheduleFilters,
): ScheduleClass[] {
  return classes.filter((c) => {
    if (filters.facility !== "all" && c.facilityName !== filters.facility) return false;
    if (filters.category !== "all" && c.category !== filters.category) return false;
    if (filters.instructor !== "all" && c.instructor !== filters.instructor) return false;
    if (filters.timeOfDay !== "all" && timeBand(c.time) !== filters.timeOfDay) return false;
    return true;
  });
}

export function minutesIntoDay(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

export function nowOffsetPercent(now: Date, firstHour: number, lastHour: number): number | null {
  const m = minutesIntoDay(now);
  const start = firstHour * 60;
  const end = (lastHour + 1) * 60;
  if (m < start || m > end) return null;
  return ((m - start) / (end - start)) * 100;
}

export function describeTimeStatus(cls: ScheduleClass, now: Date): { label: string; status: "past" | "in-progress" | "upcoming" } | null {
  const start = parseISO(cls.time);
  if (!isSameDay(start, now)) return null;

  const end = cls.endTime
    ? parseISO(`${cls.time.split("T")[0]}T${cls.endTime}`)
    : addMinutes(start, cls.duration);

  if (now >= end) return { label: "Finalizada", status: "past" };
  if (now >= start && now < end) {
    return { label: `En curso · ${differenceInMinutes(end, now)} min`, status: "in-progress" };
  }
  const mins = differenceInMinutes(start, now);
  if (mins < 60) return { label: `En ${mins} min`, status: "upcoming" };
  const h = Math.floor(mins / 60);
  const rem = mins % 60;
  return { label: rem === 0 ? `En ${h}h` : `En ${h}h ${rem}m`, status: "upcoming" };
}
