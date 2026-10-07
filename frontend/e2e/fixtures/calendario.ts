/**
 * Semana fija para probar el calendario sin depender de lo que haya en la base:
 * las pruebas interceptan GET /api/classes, los días cerrados y las inscritas, y
 * responden con estas clases. Lunes 2 – domingo 8 de noviembre de 2026.
 * El inicio de sesión sí va al backend local (ver scripts/e2e-local.sh).
 */
import type { Page } from "@playwright/test";

export const FECHA_PRUEBA = "2026-11-04";
/** Miércoles 4 de noviembre, 08:25 en CDMX (UTC−6). */
export const AHORA_PRUEBA = new Date("2026-11-04T14:25:00Z");

export interface ClasePrueba {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  class_type_id: string;
  class_type_name: string;
  class_type_color: string | null;
  category: "multi" | "reformer";
  instructor_id: string;
  instructor_name: string | null;
  facility_id: string | null;
  facility_name: string | null;
  max_capacity: number;
  current_bookings: number;
  status: "scheduled" | "cancelled";
  is_free: boolean;
  free_label: string | null;
  booking_closed: boolean;
  intensity: number | null;
  totalpass_spots: number | null;
  totalpass_booked: number;
  channels: { channel: string; max: number; booked: number }[];
}

/** UUID válido de mentira (el formulario de edición valida que lo sean). */
const uuid = (sufijo: string) => `00000000-0000-4000-8000-${sufijo.padStart(12, "0")}`;

export const ID = {
  barre: uuid("c001"),
  mat: uuid("c002"),
  sculpt: uuid("c003"),
  sculptCancelada: uuid("c004"),
  salsa: uuid("c005"),
};

export function clasePrueba(
  datos: Partial<ClasePrueba> & Pick<ClasePrueba, "id" | "date" | "start_time" | "end_time" | "class_type_name">,
): ClasePrueba {
  return {
    class_type_id: uuid("a001"),
    class_type_color: "#7A3550",
    category: "multi",
    instructor_id: uuid("b001"),
    instructor_name: "Ana",
    facility_id: null,
    facility_name: null,
    max_capacity: 7,
    current_bookings: 0,
    status: "scheduled",
    is_free: false,
    free_label: null,
    booking_closed: false,
    intensity: null,
    totalpass_spots: null,
    totalpass_booked: 0,
    channels: [],
    ...datos,
  };
}

/**
 * Lun 07:00 Barre 3/7 (1 de TotalPass, cupo 2) · Lun 08:00 Pilates Mat 7/7 (2 de TotalPass, cupo 2)
 * Mié 18:00 Sculpt 1/7 sin coach · Mié 19:00 Sculpt cancelada · Sáb 10:00–11:00 Salsa 6/7.
 * Horas ocupadas: 7, 8, 10, 18 y 19 → la franja "11 – 18" se compacta.
 */
export const SEMANA_PRUEBA: ClasePrueba[] = [
  clasePrueba({
    id: ID.barre, date: "2026-11-02", start_time: "07:00", end_time: "07:50", class_type_name: "Barre",
    current_bookings: 3, totalpass_spots: 2, totalpass_booked: 1, channels: [{ channel: "totalpass", max: 2, booked: 1 }],
  }),
  clasePrueba({
    id: ID.mat, date: "2026-11-02", start_time: "08:00", end_time: "08:50", class_type_name: "Pilates Mat",
    class_type_id: uuid("a002"), class_type_color: "#2A4E36", instructor_id: uuid("b002"), instructor_name: "Sofía",
    current_bookings: 7, totalpass_spots: 2, totalpass_booked: 2, channels: [{ channel: "totalpass", max: 2, booked: 2 }],
  }),
  clasePrueba({
    id: ID.sculpt, date: "2026-11-04", start_time: "18:00", end_time: "18:50", class_type_name: "Sculpt",
    class_type_id: uuid("a003"), class_type_color: "#9A3D2D", instructor_name: null, current_bookings: 1,
  }),
  clasePrueba({
    id: ID.sculptCancelada, date: "2026-11-04", start_time: "19:00", end_time: "19:50", class_type_name: "Sculpt",
    class_type_id: uuid("a003"), class_type_color: "#9A3D2D", instructor_id: uuid("b002"), instructor_name: "Sofía", status: "cancelled",
  }),
  clasePrueba({
    id: ID.salsa, date: "2026-11-07", start_time: "10:00", end_time: "11:00", class_type_name: "Salsa",
    class_type_id: uuid("a004"), class_type_color: "#AE4836", category: "reformer",
    instructor_id: uuid("b003"), instructor_name: "Pau", current_bookings: 6,
  }),
];

/** Intercepta las lecturas del calendario. La sucursal se copia del filtro que manda la página. */
export async function mockSemanaCalendario(page: Page, clases: ClasePrueba[] = SEMANA_PRUEBA): Promise<void> {
  await page.route(/\/api\/classes\?/, async (route) => {
    const url = new URL(route.request().url());
    const inicio = url.searchParams.get("start") ?? url.searchParams.get("start_date") ?? "";
    const fin = url.searchParams.get("end") ?? url.searchParams.get("end_date") ?? "9999-12-31";
    const categoria = url.searchParams.get("category");
    const sucursal = url.searchParams.get("facility_id");
    const json = clases
      .filter((c) => c.date >= inicio && c.date <= fin && (!categoria || c.category === categoria))
      .map((c) => ({ ...c, facility_id: sucursal ?? c.facility_id }));
    await route.fulfill({ json });
  });
  await page.route(/\/api\/closed-days\/range/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/bookings\/class\//, (route) => route.fulfill({ json: [] }));
}

/** Un cuerpo de POST /api/classes/bulk tal como lo mandó la página. */
export interface CuerpoLotePrueba {
  classIds: string[];
  accion: "coach" | "cupo_canal" | "mover" | "cancelar";
  vistaPrevia: boolean;
  instructorId?: string;
  lugares?: number;
  minutos?: number;
  classTypeId?: string;
  motivo?: string;
}

const COACHES_PRUEBA: Record<string, string> = { [uuid("b001")]: "Ana", [uuid("b002")]: "Sofía", [uuid("b003")]: "Pau" };
const sumarMinutos = (hora: string, minutos: number) => {
  const total = Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5)) + minutos;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

/**
 * Imita POST /api/classes/bulk sobre las mismas clases que sirve `mockSemanaCalendario`:
 * la vista previa cuenta; aplicar cambia el arreglo (y la página, al recargar, lo ve).
 * `bloqueos` fuerza clases bloqueadas con su motivo (también se pueden agregar después);
 * `bloqueosAlAplicar` solo bloquea al aplicar (algo cambió después de la vista previa).
 * Devuelve los cuerpos recibidos.
 */
export async function mockLote(
  page: Page,
  clases: ClasePrueba[],
  opciones: { bloqueos?: Record<string, string>; bloqueosAlAplicar?: Record<string, string> } = {},
): Promise<CuerpoLotePrueba[]> {
  const bloqueos = opciones.bloqueos ?? {};
  const cuerpos: CuerpoLotePrueba[] = [];
  await page.route(/\/api\/classes\/bulk$/, async (route) => {
    const cuerpo = route.request().postDataJSON() as CuerpoLotePrueba;
    cuerpos.push(cuerpo);
    const resultado = cuerpo.classIds.map((id) => {
      const c = clases.find((x) => x.id === id);
      const tp = c?.channels.find((x) => x.channel === "totalpass")?.booked ?? 0;
      const motivo = !c ? "Esta clase ya no existe." : c.status === "cancelled" ? "Ya está cancelada."
        : bloqueos[id] ?? (cuerpo.vistaPrevia ? undefined : opciones.bloqueosAlAplicar?.[id]);
      return {
        classId: id,
        estado: motivo ? "bloqueada" : "ok",
        ...(motivo ? { motivo } : {}),
        alumnasAvisadas: motivo || cuerpo.accion === "cupo_canal" ? 0 : Math.max(0, (c?.current_bookings ?? 0) - tp),
        sociasPorCanal: tp ? { totalpass: tp } : {},
        sociasPierdenLugar: !motivo && cuerpo.accion === "mover" && cuerpo.minutos ? tp : 0,
        advertencias: [] as string[],
      };
    });
    const ok = resultado.filter((r) => r.estado === "ok");
    const respuesta = {
      clases: resultado,
      resumen: {
        ok: ok.length,
        bloqueadas: resultado.length - ok.length,
        alumnasAvisadas: ok.reduce((t, r) => t + r.alumnasAvisadas, 0),
        sociasPierdenLugar: ok.reduce((t, r) => t + r.sociasPierdenLugar, 0),
      },
      aplicado: false,
    };
    if (cuerpo.vistaPrevia) return route.fulfill({ json: respuesta });
    if (respuesta.resumen.bloqueadas > 0) return route.fulfill({ status: 409, json: respuesta });
    for (const id of cuerpo.classIds) {
      const c = clases.find((x) => x.id === id)!;
      if (cuerpo.accion === "cancelar") c.status = "cancelled";
      if (cuerpo.accion === "coach") {
        c.instructor_id = cuerpo.instructorId!;
        c.instructor_name = COACHES_PRUEBA[cuerpo.instructorId!] ?? "Otra";
      }
      if (cuerpo.accion === "mover" && cuerpo.minutos) {
        c.start_time = sumarMinutos(c.start_time, cuerpo.minutos);
        c.end_time = sumarMinutos(c.end_time, cuerpo.minutos);
      }
    }
    return route.fulfill({ json: { ...respuesta, aplicado: true } });
  });
  return cuerpos;
}
