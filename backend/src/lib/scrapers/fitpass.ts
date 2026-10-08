/**
 * FitPassScraper — panel admin de FitPass MX (admin2.fitpass.com), sin API oficial.
 * Portado de Hundred (docs/FITPASS_INTEGRATION.md) y adaptado a Casa Shé.
 *
 * API PÚBLICA (estable; la usan las fases siguientes):
 *   new FitPassScraper(panelUrl?)
 *   login({email,password})            GET /sessions/new (CSRF) → POST /sessions → cookie _admin_session
 *   fetchLessons()                     HTML /lessons → [{id,name,description?,activities?}]
 *   listSchedules(gymId, from, to)     GET /calendars/schedules (JSON)
 *   fetchReservationsRows(from, to)    GET /s/reservaciones/search (tabla Turbo Stream paginada) → FitpassImportRow[]
 *   createSchedule / updateSchedule / cancelSchedule / markAttendance / markNoAttendance
 *   fetchCsrfFromCalendar()            CSRF fresco (FitPass lo rota por request: cada POST pide uno)
 * Helpers puros exportados (testeables sin red): parseReservacionesHtml, extractClassFields,
 *   fitpassAttendanceResponseMatches, FitPassHttpError.
 *
 * Gotchas conservadas: CSRF fresco por POST; `_method=patch` en attend/cancel/update (sin él → 404);
 * paginación pagination[page]+pagination[count]+append_records (page a secas se ignora);
 * fechas de ventana en zona del estudio (localDateStr); lesson_time de listSchedules es UTC real
 * (los callers convierten a CDMX); cancel con multiple=false (solo la instancia).
 * Los métodos de mutación lanzan FitPassHttpError con `.status` (para tratar 404/410 como ya-cancelado).
 */

import { BaseScraper, ScraperCreds, ScraperRunResult } from './base.js';
import { localDateStr } from '../mx-time.js';
import * as cheerio from 'cheerio';

const DEFAULT_BASE = 'https://admin2.fitpass.com';

export interface FitpassImportRow {
    sourceRef?: string;
    displayName: string;
    fitpassMemberRef?: string;
    classLookup: { date: string; startTime: string; className?: string; fitpassLessonId?: number; coachName?: string };
    status: 'reserved' | 'attended' | 'cancelled';
}

export interface FitpassScheduleInput {
    gymId: number;              // gym_id de FitPass (Casa Shé = 9813)
    lessonId: number;           // ID de la disciplina FP (43116=YOGA, etc.)
    instructorName: string;     // texto libre (display)
    startDate: string;          // 'YYYY-MM-DD'
    lessonTime: string;         // 'HH:MM' o 'HH:MM:SS' — se normaliza a HH:MM:SS.000
    length: number;             // minutos
    lessonAvailability: number; // cupos FP
    multiple?: boolean;         // true = recurrente semanal hasta endDate; false = un solo día
    endDate?: string;           // 'YYYY-MM-DD' requerido si multiple=true
    timezone?: string;          // default 'Etc/GMT+6'
}

/** Error HTTP de una mutación del panel; `status` permite tratar 404/410 como idempotente. */
export class FitPassHttpError extends Error {
    constructor(message: string, public readonly status: number) {
        super(message);
        this.name = 'FitPassHttpError';
    }
}

export type FitpassAttendanceState = 'attended' | 'no_show';

/**
 * Confirma que la respuesta HTML/Turbo de FitPass todavía contiene el estado
 * esperado. Se elimina primero "no asistió" al buscar asistencia positiva para
 * no aceptar ese texto por la subcadena "asistió".
 */
export function fitpassAttendanceResponseMatches(
    raw: string,
    expected: FitpassAttendanceState,
): boolean {
    const normalized = String(raw || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    const noShowPattern = /\bno\s+asistio\b|\bno[\s_-]*show\b|\bnot[\s_-]*attend(?:ed)?\b/g;
    if (expected === 'no_show') return noShowPattern.test(normalized);
    const withoutNoShow = normalized.replace(noShowPattern, ' ');
    return /\basistio\b|\battended\b/.test(withoutNoShow);
}

function normalize(s: string): string {
    return (s || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
}

export function mapEstatus(s: string): FitpassImportRow['status'] {
    const n = normalize(s);
    // Negativos primero (no asistió contiene "asisti")
    if (/noasisti|notattend|noshow|nopresent|ausent/.test(n)) return 'reserved';
    if (/cancel/.test(n)) return 'cancelled';
    if (/asisti|attend|checkin|complet|present|finaliz/.test(n)) return 'attended';
    return 'reserved';
}

export function parseFechaHora(v: string): { date: string; startTime: string } | null {
    v = (v || '').trim();
    if (!v) return null;
    // ISO: 2026-06-07 19:00:00 o 2026-06-07T19:00:00
    let m = v.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/);
    if (m) {
        return { date: `${m[1]}-${m[2]}-${m[3]}`, startTime: `${m[4].padStart(2, '0')}:${m[5]}` };
    }
    // DD/MM/YYYY HH:MM o DD-MM-YYYY HH:MM (México/LatAm)
    m = v.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})[ T](\d{1,2}):(\d{2})/);
    if (m) {
        const day = m[1].padStart(2, '0');
        const mon = m[2].padStart(2, '0');
        const year = m[3].length === 2 ? `20${m[3]}` : m[3];
        return { date: `${year}-${mon}-${day}`, startTime: `${m[4].padStart(2, '0')}:${m[5]}` };
    }
    return null;
}

// Extrae nombre de clase y/o lesson_id de FitPass de una fila del CSV,
// probando los nombres de columna probables (en español/inglés). Sirve para
// desambiguar cuando hay varias clases en el mismo (fecha, hora). Si el CSV no
// trae esta info, devuelve {} y el import fallará visible en slots ambiguos
// (mejor que pegar la reserva a la clase equivocada).
export function extractClassFields(r: Record<string, unknown>): { className?: string; fitpassLessonId?: number } {
    let className: string | undefined;
    let fitpassLessonId: number | undefined;
    for (const [k, v] of Object.entries(r)) {
        const key = k.toLowerCase();
        if (/fecha|hora/.test(key)) continue;     // evita "fecha_hora_clase"
        if (/estatus|status/.test(key)) continue; // "estatus_clase" no es la disciplina
        const val = v == null ? '' : String(v).trim();
        if (!val) continue;
        const hasClassKw = /(clase|lecc?ion|lesson|actividad|disciplina|servicio|class)/.test(key);
        if (!hasClassKw) continue;
        // "id" como palabra/sufijo, NO subcadena: si no, "actividad" (activ-id-ad) daría true.
        const isIdCol = /(^|[^a-z])id([^a-z]|$)/.test(key);
        if (isIdCol) {
            if (/^\d+$/.test(val) && Number(val) > 0 && fitpassLessonId == null) fitpassLessonId = Number(val);
        } else if (className == null && !/^\d+$/.test(val)) {
            className = val;
        }
    }
    return { className, fitpassLessonId };
}

let lastRecordCols = '';

function recordsToImportRows(records: Record<string, unknown>[]): FitpassImportRow[] {
    if (records.length > 0) {
        // Logueamos cuando cambia el set de columnas (no solo la 1ra vez) para
        // detectar drift del CSV en un proceso de larga duración (cron).
        const cols = Object.keys(records[0]).join(' | ');
        if (cols !== lastRecordCols) {
            lastRecordCols = cols;
            console.log('[fitpass] columnas detectadas:', cols);
        }
    }
    const rows: FitpassImportRow[] = [];
    for (const r of records) {
        const first = String((r as any).nombre || '').trim();
        const last = String((r as any).apellido || '').trim();
        const displayName = [first, last].filter(Boolean).join(' ');
        if (!displayName) {
            throw new Error('FitPass: no se pudo convertir reservación: falta nombre visible');
        }
        const fh = parseFechaHora(String((r as any).fecha_hora_clase || ''));
        if (!fh) {
            throw new Error(`FitPass: no se pudo convertir reservación de ${displayName}: fecha/hora inválida`);
        }
        // El CSV real trae 'clase' (PILATES REFORMER, FUNCIONAL…) y 'maestro'
        // (Ana, Ilse…). NO trae lesson_id. Leemos esas columnas explícitas y
        // usamos la heurística como respaldo por si FitPass las renombra.
        const heur = extractClassFields(r);
        const claseExplicit = String((r as any).clase || '').trim();
        const maestro = String((r as any).maestro || '').trim();
        const row: FitpassImportRow = {
            displayName,
            classLookup: {
                ...fh,
                className: claseExplicit || heur.className,
                fitpassLessonId: heur.fitpassLessonId,
                coachName: maestro || undefined,
            },
            status: mapEstatus(String((r as any).estatus || '')),
        };
        const id = (r as any).id;
        if (id != null && String(id).trim()) row.sourceRef = String(id).trim();
        const userId = (r as any).user_id;
        if (userId != null && String(userId).trim()) row.fitpassMemberRef = String(userId).trim();
        rows.push(row);
    }
    return rows;
}

// FitPass dejó de exponer el CSV de reservas; ahora las sirve como tabla HTML
// (Turbo Stream) desde /s/reservaciones/search. Estas dos funciones parsean esa
// tabla a los mismos records {nombre, apellido, clase, maestro, fecha_hora_clase,
// estatus, id} que recordsToImportRows ya sabe mapear.
const FP_MONTHS: Record<string, string> = {
    ENE: '01', FEB: '02', MAR: '03', ABR: '04', MAY: '05', JUN: '06',
    JUL: '07', AGO: '08', SEP: '09', OCT: '10', NOV: '11', DIC: '12',
    JAN: '01', APR: '04', AUG: '08', DEC: '12',
};

// "17 JUN 2026" + "05:00 PM" → "2026-06-17 17:00" (formato que parseFechaHora entiende).
export function fpFechaHoraToIso(fecha: string, hora: string): string | null {
    const f = String(fecha).trim().match(/^(\d{1,2})\s+([A-Za-z]{3,})\.?\s+(\d{4})$/);
    if (!f) return null;
    const mon = FP_MONTHS[f[2].slice(0, 3).toUpperCase()];
    if (!mon) return null;
    const h = String(hora).trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp])\.?\s*[Mm]\.?$/);
    if (!h) return null;
    let hh = parseInt(h[1], 10);
    const ap = h[3].toUpperCase();
    if (ap === 'P' && hh !== 12) hh += 12;
    if (ap === 'A' && hh === 12) hh = 0;
    return `${f[3]}-${mon}-${f[1].padStart(2, '0')} ${String(hh).padStart(2, '0')}:${h[2]}`;
}

// Parsea la tabla de /s/reservaciones/search. Columnas (td):
// 0 ID | 1 Nombre | 2 Apellidos | 3 Clase | 4 coach | 5 fecha | 6 hora | 7 Type | 8 Estatus
export function parseReservacionesHtml(html: string): Record<string, unknown>[] {
    const source = String(html || '');
    if (!/<turbo-stream\b/i.test(source) || !/<template\b/i.test(source)) {
        throw new Error('FitPass: respuesta no es un Turbo Stream de reservaciones');
    }
    // El cuerpo viene envuelto en <turbo-stream><template>…</template></turbo-stream>;
    // sacamos esos wrappers para que cheerio vea la tabla como contenido normal.
    const clean = source
        .replace(/<\/?template[^>]*>/gi, '')
        .replace(/<\/?turbo-stream[^>]*>/gi, '');
    const $ = cheerio.load(clean);
    const out: Record<string, unknown>[] = [];
    const normalizeLabel = (value: string) => value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    const isKnownEmptyText = (value: string) =>
        /\b(no hay|no se encontraron|sin|ninguna?s?)\s+reservacion(?:es)?\b/i
            .test(normalizeLabel(value));
    const explicitEmpty = $('.empty-state, .no-results, [data-empty-state], td[colspan]')
        .toArray()
        .some((element) => isKnownEmptyText($(element).text()));
    const tables = $('table').toArray();
    const hasReservationHeaders = (table: any) => {
        const headers = $(table).find('th').toArray()
            .map((header) => normalizeLabel($(header).text()));
        const has = (label: string) => headers.some((header) => header === label);
        return has('nombre')
            && (has('apellidos') || has('apellido'))
            && has('clase')
            && has('fecha')
            && has('hora')
            && (has('estatus') || has('status'));
    };
    const hasNineCellRow = (table: any) => $(table).find('tr').toArray()
        .some((row) => $(row).find('td').length >= 9);
    const reservationTables = tables.filter((table) =>
        hasReservationHeaders(table) || hasNineCellRow(table));

    if (reservationTables.length === 0) {
        const firstNonemptyRow = $('table tr').toArray()
            .find((row) => $(row).find('td').length > 0 && !isKnownEmptyText($(row).text()));
        if (firstNonemptyRow) {
            throw new Error('FitPass: fila de reservación incompleta en una tabla no reconocible');
        }
        if (explicitEmpty) return out;
        throw new Error('FitPass: Turbo Stream de reservaciones no contiene una tabla reconocible');
    }

    const reservationRows = $(reservationTables).find('tr').toArray()
        .filter((row) => $(row).find('td').length > 0 && !isKnownEmptyText($(row).text()));
    if (reservationRows.length === 0) return out;

    reservationRows.forEach((tr, index) => {
        const cells = $(tr).find('td').toArray().map((c) => $(c).text().replace(/\s+/g, ' ').trim());
        if (cells.length < 9) {
            throw new Error(`FitPass: fila de reservación incompleta en posición ${index + 1}`);
        }
        const fechaHora = fpFechaHoraToIso(cells[5], cells[6]);
        if (!fechaHora) {
            throw new Error(`FitPass: fila de reservación con fecha/hora inválida en posición ${index + 1}`);
        }
        out.push({
            id: cells[0],
            nombre: cells[1],
            apellido: cells[2],
            clase: cells[3],
            maestro: cells[4],
            fecha_hora_clase: fechaHora,
            estatus: cells[8],
        });
    });
    return out;
}

export class FitPassScraper extends BaseScraper {
    private base: string;

    constructor(panelUrl?: string) {
        super('fitpass');
        this.base = (panelUrl || DEFAULT_BASE).replace(/\/+$/, '');
    }

    protected getReservationPageLimit(): number {
        return 100;
    }

    async login(creds: ScraperCreds): Promise<void> {
        const pageRes = await this.http.get(`${this.base}/sessions/new`);
        if (pageRes.status >= 400) {
            throw new Error(`FitPass: login page status ${pageRes.status}`);
        }
        const csrf = this.extractCsrf(pageRes.data);
        if (!csrf) {
            throw new Error('FitPass: login no expuso CSRF token (HTML cambió?)');
        }
        const form = new URLSearchParams();
        form.append('authenticity_token', csrf);
        form.append('login_user[email]', creds.email);
        form.append('login_user[password]', creds.password);

        const loginRes = await this.http.post(`${this.base}/sessions`, form.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            maxRedirects: 0,
            validateStatus: (s) => s < 400,
        });
        if (loginRes.status !== 302 && loginRes.status !== 200) {
            throw new Error(`FitPass: login failed (status ${loginRes.status})`);
        }
        const cookies = await this.jar.getCookies(this.base);
        const hasSession = cookies.some((c) => c.key === '_admin_session');
        if (!hasSession) {
            throw new Error('FitPass: login no estableció _admin_session');
        }
        this.loggedIn = true;
    }

    /** Pull de filas normalizadas para el rango pedido. No hace el POST al bulk-import.
     *
     *  FitPass dejó de exponer /s/reservaciones.csv (ahora responde 406). El panel
     *  obtiene las reservas vía Turbo Stream desde GET /s/reservaciones/search (tabla
     *  HTML). Parseamos esa tabla y reusamos recordsToImportRows. La tabla pagina
     *  a 30 filas: recorremos todas las páginas para que la agenda de Hundred no
     *  quede incompleta cuando FitPass tenga más reservas que la primera vista.
     */
    async fetchReservationsRows(from: Date, to: Date): Promise<FitpassImportRow[]> {
        if (!this.loggedIn) throw new Error('FitPass scraper not logged in');
        // Fechas en zona del gym: el panel de FP filtra por fecha local de la
        // clase, no UTC (después de las 6pm CDMX, UTC ya va un día adelante).
        const fromStr = localDateStr(from);
        const toStr = localDateStr(to);

        const allRecords: Record<string, unknown>[] = [];
        const seenReservationIds = new Set<string>();
        const pageSize = 30;
        const maxPages = this.getReservationPageLimit();
        let reachedTerminalPage = false;

        for (let page = 1; page <= maxPages; page += 1) {
            const params = new URLSearchParams({
                q: '',
                from_date: fromStr,
                to_date: toStr,
                status: '',
            });
            // El botón "cargar más" del panel agrega estos tres campos al form.
            // `page` sin el namespace `pagination` es ignorado y devuelve otra vez
            // las primeras 30 filas.
            if (page > 1) {
                params.set('pagination[page]', String(page));
                params.set('pagination[count]', String(pageSize));
                params.set('append_records', 'true');
            }
            const res = await this.http.get(`${this.base}/s/reservaciones/search?${params.toString()}`, {
                responseType: 'text',
                headers: { 'Accept': 'text/vnd.turbo-stream.html, text/html, application/xhtml+xml' },
            });
            if (res.status >= 400) {
                throw new Error(`FitPass: GET reservaciones/search failed (${res.status}, página ${page})`);
            }

            const pageRecords = parseReservacionesHtml(String(res.data || ''));
            if (pageRecords.length === 0) {
                reachedTerminalPage = true;
                break;
            }

            let newRecords = 0;
            for (const record of pageRecords) {
                const id = String(record.id || '').trim();
                // El ID es estable en FitPass. Como respaldo, usamos los datos de
                // la fila para no repetir la misma página si el panel ignora la paginación.
                const key = id || [record.nombre, record.apellido, record.clase, record.fecha_hora_clase].join('|');
                if (seenReservationIds.has(key)) continue;
                seenReservationIds.add(key);
                allRecords.push(record);
                newRecords += 1;
            }

            // Una página corta confirma que no hay más resultados. Una página
            // llena sin registros nuevos indica que el panel ignoró la paginación:
            // importar lo visto hasta ahora sería un snapshot incompleto.
            if (pageRecords.length < pageSize) {
                reachedTerminalPage = true;
                break;
            }
            if (newRecords === 0) {
                throw new Error(`FitPass: paginación incompleta: la página ${page} repite reservaciones`);
            }
        }

        if (!reachedTerminalPage) {
            throw new Error(`FitPass: paginación incompleta: se alcanzó el máximo de ${maxPages} páginas sin terminador`);
        }

        if (allRecords.length >= pageSize) {
            console.log(`[fitpass] reservaciones/search: ${allRecords.length} filas importables en el rango ${fromStr}–${toStr}`);
        }
        return recordsToImportRows(allRecords);
    }

    /** Trae la lista de disciplinas (lessons) del gym, parseando el HTML de
     *  /lessons. FitPass admin no expone JSON para esto, así que cheerio busca
     *  los links `/lessons/{id}/edit` y extrae el texto de la disciplina en la
     *  misma fila. Devuelve también descripción y actividades si vienen. */
    async fetchLessons(): Promise<Array<{ id: number; name: string; description?: string; activities?: string[] }>> {
        if (!this.loggedIn) throw new Error('FitPass scraper not logged in');
        const r = await this.http.get(`${this.base}/lessons`, {
            headers: { 'Accept': 'text/html' },
        });
        if (r.status >= 400) throw new Error(`FitPass: GET /lessons status ${r.status}`);

        const $ = cheerio.load(String(r.data || ''));
        const seen = new Map<number, { id: number; name: string; description?: string; activities?: string[] }>();

        $('a[href*="/lessons/"]').each((_, el) => {
            const href = $(el).attr('href') || '';
            const m = href.match(/\/lessons\/(\d+)(?:\/edit)?/);
            if (!m) return;
            const id = Number(m[1]);
            if (Number.isNaN(id) || seen.has(id)) return;
            // El nombre de la disciplina suele estar en la <tr> del link, en una
            // celda anterior. Buscá el <tr> ancestro y extraé las celdas.
            const row = $(el).closest('tr');
            if (!row.length) return;
            const cells = row.find('td').toArray().map((c) => $(c).text().trim()).filter(Boolean);
            // Tabla del panel: [logo, NOMBRE, DESCRIPCIÓN, ACTIVIDADES, QUE TRAER, acciones]
            // Filtramos celdas vacías o que son solo el botón "EDITAR".
            const textCells = cells.filter((t) => !/^editar$/i.test(t));
            const name = textCells[0] || '';
            if (!name) return;
            const description = textCells[1] || undefined;
            const activities = textCells[2] ? textCells[2].split(/\s{2,}|\n+/).map((s) => s.trim()).filter(Boolean) : undefined;
            seen.set(id, { id, name, description, activities });
        });

        return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    }

    /** Trae un CSRF token fresco navegando al calendario admin.
     *  FitPass rota el token por request, así que cada POST necesita uno nuevo. */
    async fetchCsrfFromCalendar(): Promise<string> {
        if (!this.loggedIn) throw new Error('FitPass scraper not logged in');
        const r = await this.http.get(`${this.base}/g/calendar`, {
            headers: { 'Accept': 'text/html' },
        });
        if (r.status >= 400) throw new Error(`FitPass: GET /g/calendar status ${r.status}`);
        const csrf = this.extractCsrf(String(r.data || ''));
        if (!csrf) throw new Error('FitPass: no CSRF en /g/calendar (HTML cambió?)');
        return csrf;
    }

    /** Crea un horario en el calendario de FitPass.
     *
     *  Shape descubierto del Network del panel (Jun 2026) en POST /calendars/schedules:
     *    authenticity_token=<csrf>
     *    schedule[gym_id]=9210
     *    schedule[timezone]=Etc/GMT+6
     *    schedule[id]=                         # vacío en create, ID en update
     *    schedule[instructor_name]=test         # texto libre
     *    schedule[lesson_availability]=2        # cupos FP
     *    schedule[lesson_id]=43116
     *    schedule[start_date]=YYYY-MM-DD
     *    schedule[lesson_time]=HH:MM:SS.000
     *    schedule[length]=50
     *    schedule[multiple]=0|1                 # 1 = recurrente semanal hasta end_date
     *    schedule[end_date]=                    # YYYY-MM-DD si multiple=1
     *    create=true
     *
     *  Devuelve un turbo-stream HTML; lo parseamos sólo para detectar éxito vs error.
     */
    async createSchedule(input: FitpassScheduleInput): Promise<{ status: number; raw: string }> {
        if (!this.loggedIn) throw new Error('FitPass scraper not logged in');
        const csrf = await this.fetchCsrfFromCalendar();

        const timeNormalized = (() => {
            const t = input.lessonTime.trim();
            if (/^\d{2}:\d{2}:\d{2}\.\d{3}$/.test(t)) return t;
            if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return `${t}.000`;
            if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00.000`;
            throw new Error(`FitPass: lessonTime inválido (${input.lessonTime})`);
        })();

        // VENTANA DE CANCELACIÓN: FitPass NO es una API sino automatización del panel
        // web (este form replica el del calendario de FitPass). El form no expone
        // ningún campo de deadline/ventana de cancelación, así que NO hay
        // `fitpass_cancel_hours` configurable — la ventana la gobierna FitPass. Solo
        // sería posible si el propio panel de FitPass añade el campo al form.
        const form = new URLSearchParams();
        form.append('authenticity_token', csrf);
        form.append('schedule[gym_id]', String(input.gymId));
        form.append('schedule[timezone]', input.timezone || 'Etc/GMT+6');
        form.append('schedule[id]', '');
        form.append('schedule[instructor_name]', input.instructorName);
        form.append('schedule[lesson_availability]', String(input.lessonAvailability));
        form.append('schedule[lesson_id]', String(input.lessonId));
        form.append('schedule[start_date]', input.startDate);
        form.append('schedule[lesson_time]', timeNormalized);
        form.append('schedule[length]', String(input.length));
        form.append('schedule[multiple]', input.multiple ? '1' : '0');
        form.append('schedule[end_date]', input.multiple ? (input.endDate || '') : '');
        form.append('create', 'true');

        const res = await this.http.post(`${this.base}/calendars/schedules`, form.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'X-CSRF-Token': csrf,
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'text/vnd.turbo-stream.html, text/html, application/xhtml+xml',
                'Origin': this.base,
                'Referer': `${this.base}/g/calendar`,
            },
            validateStatus: (s) => s < 500,
        });

        if (res.status !== 201 && res.status !== 200) {
            throw new FitPassHttpError(`FitPass createSchedule failed (${res.status}): ${String(res.data).slice(0, 200)}`, res.status);
        }
        return { status: res.status, raw: String(res.data) };
    }

    /** Marca asistencia ("ASISTIÓ") de una reservación en FitPass.
     *  Endpoint capturado: POST /attendance_lists/{reservationId}/attend
     *  reservationId = id de la reserva de FitPass (= bookings.external_ref).
     *  Body (turbo-stream): authenticity_token=<csrf>. */
    async markAttendance(reservationId: string | number): Promise<{ status: number; raw: string }> {
        if (!this.loggedIn) throw new Error('FitPass scraper not logged in');
        if (!/^\d+$/.test(String(reservationId))) {
            throw new Error(`FitPass: reservationId de asistencia inválido (${reservationId})`);
        }
        const csrf = await this.fetchCsrfFromCalendar();
        const form = new URLSearchParams();
        form.append('authenticity_token', csrf);
        // El form de FitPass es POST + _method=patch (Rails method override). Sin
        // esto la ruta no matchea y devuelve 404.
        form.append('_method', 'patch');
        const res = await this.http.post(
            `${this.base}/attendance_lists/${reservationId}/attend`,
            form.toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                    'X-CSRF-Token': csrf,
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'text/vnd.turbo-stream.html, text/html, application/xhtml+xml',
                    'Origin': this.base,
                    'Referer': `${this.base}/attendance_lists`,
                },
                validateStatus: (s) => s < 500,
            },
        );
        if (res.status !== 200) {
            throw new FitPassHttpError(`FitPass markAttendance failed (${res.status}): ${String(res.data).slice(0, 200)}`, res.status);
        }
        return { status: res.status, raw: String(res.data) };
    }

    /** Marca una reservación como "NO ASISTIÓ" en FitPass.
     *
     *  El formulario del panel vive dentro de la lista de asistencia de la
     *  schedule y exige ambos identificadores:
     *    POST /attendance_lists/{reservationId}/not_attend
     *    _method=patch&schedule_id={scheduleId}
     *
     *  reservationId = bookings.external_ref y scheduleId =
     *  partner_class_mappings.external_slot_id para la clase de Hundred.
     */
    async markNoAttendance(
        reservationId: string | number,
        scheduleId: string | number,
    ): Promise<{ status: number; raw: string }> {
        if (!this.loggedIn) throw new Error('FitPass scraper not logged in');
        if (!/^\d+$/.test(String(reservationId))) {
            throw new Error(`FitPass: reservationId de inasistencia inválido (${reservationId})`);
        }
        if (!/^\d+$/.test(String(scheduleId))) {
            throw new Error(`FitPass: scheduleId de inasistencia inválido (${scheduleId})`);
        }

        const csrf = await this.fetchCsrfFromCalendar();
        const form = new URLSearchParams();
        form.append('authenticity_token', csrf);
        form.append('_method', 'patch');
        form.append('schedule_id', String(scheduleId));

        const res = await this.http.post(
            `${this.base}/attendance_lists/${reservationId}/not_attend`,
            form.toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                    'X-CSRF-Token': csrf,
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'text/vnd.turbo-stream.html, text/html, application/xhtml+xml',
                    'Origin': this.base,
                    'Referer': `${this.base}/attendance_lists/${scheduleId}`,
                },
                validateStatus: (s) => s < 500,
            },
        );
        if (res.status !== 200) {
            throw new FitPassHttpError(`FitPass markNoAttendance failed (${res.status}): ${String(res.data).slice(0, 200)}`, res.status);
        }
        return { status: res.status, raw: String(res.data) };
    }

    /** Edita (update) un schedule FP por id.
     *  Endpoint descubierto: POST /calendars/schedules/{id}
     *  Body shape (asumido — confirmar con cURL real):
     *    authenticity_token=...
     *    schedule[id]={id}
     *    schedule[gym_id]=9210
     *    schedule[lesson_id]=...
     *    schedule[instructor_name]=...
     *    schedule[lesson_time]=HH:MM:SS.000
     *    schedule[start_date]=YYYY-MM-DD
     *    schedule[length]=N
     *    schedule[lesson_availability]=N
     *    schedule[timezone]=Etc/GMT+6
     *    _method=patch        (Rails standard para update via POST)
     */
    async updateSchedule(id: number, input: FitpassScheduleInput & { railsMethodOverride?: 'patch' | 'put' }): Promise<{ status: number; raw: string }> {
        if (!this.loggedIn) throw new Error('FitPass scraper not logged in');
        const csrf = await this.fetchCsrfFromCalendar();
        const time = (() => {
            const t = input.lessonTime.trim();
            if (/^\d{2}:\d{2}:\d{2}\.\d{3}$/.test(t)) return t;
            if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return `${t}.000`;
            if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00.000`;
            throw new Error(`FitPass: lessonTime inválido (${input.lessonTime})`);
        })();
        const form = new URLSearchParams();
        form.append('authenticity_token', csrf);
        form.append('_method', input.railsMethodOverride || 'patch');
        form.append('schedule[id]', String(id));
        form.append('schedule[gym_id]', String(input.gymId));
        form.append('schedule[timezone]', input.timezone || 'Etc/GMT+6');
        form.append('schedule[instructor_name]', input.instructorName);
        form.append('schedule[lesson_availability]', String(input.lessonAvailability));
        form.append('schedule[lesson_id]', String(input.lessonId));
        form.append('schedule[start_date]', input.startDate);
        form.append('schedule[lesson_time]', time);
        form.append('schedule[length]', String(input.length));
        form.append('schedule[multiple]', input.multiple ? '1' : '0');
        form.append('schedule[end_date]', input.multiple ? (input.endDate || '') : '');
        const res = await this.http.post(`${this.base}/calendars/schedules/${id}`, form.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'X-CSRF-Token': csrf,
                'Accept': 'text/vnd.turbo-stream.html, text/html, application/xhtml+xml',
                'Origin': this.base,
                'Referer': `${this.base}/g/calendar`,
            },
            validateStatus: (s) => s < 500,
        });
        if (res.status >= 400) {
            throw new FitPassHttpError(`FitPass updateSchedule(${id}) failed (${res.status}): ${String(res.data).slice(0, 200)}`, res.status);
        }
        return { status: res.status, raw: String(res.data) };
    }

    /** Cancela (soft-delete) un schedule FP por id.
     *  Endpoint confirmado: POST /calendars/schedules/{id}/cancel
     *  Body form-urlencoded (134 bytes exactos del browser):
     *    _method=patch
     *    authenticity_token=<csrf>
     *    multiple=false
     *
     *  multiple=false significa "cancelar solo esta instancia", no toda la
     *  cadena de recurrencia. Si multiple=true, cancela el master y sus hijos.
     */
    async cancelSchedule(id: number, options: { cancelRecurrence?: boolean } = {}): Promise<{ status: number }> {
        if (!this.loggedIn) throw new Error('FitPass scraper not logged in');
        const csrf = await this.fetchCsrfFromCalendar();
        const form = new URLSearchParams();
        form.append('_method', 'patch');
        form.append('authenticity_token', csrf);
        form.append('multiple', options.cancelRecurrence ? 'true' : 'false');
        const res = await this.http.post(
            `${this.base}/calendars/schedules/${id}/cancel`,
            form.toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                    'X-CSRF-Token': csrf,
                    'Accept': 'text/vnd.turbo-stream.html, text/html, application/xhtml+xml',
                    'Origin': this.base,
                    'Referer': `${this.base}/g/calendar`,
                },
                validateStatus: (s) => s < 500,
            },
        );
        if (res.status >= 400) {
            throw new FitPassHttpError(`FitPass cancelSchedule(${id}) failed (${res.status}): ${String(res.data).slice(0, 120)}`, res.status);
        }
        return { status: res.status };
    }

    /** Lista los schedules del rango.
     *  GET /calendars/schedules?gym_id=&from_date=&to_date= → JSON array.
     */
    async listSchedules(gymId: number, from: Date, to: Date): Promise<Array<{
        id: number;
        lesson_time: string;
        start_date: string;
        day: number;
        length: number;
        lesson_availability: number;
        parent_id: number | null;
        lesson: { id: number; name: string };
        instructor: { id: number; name: string };
        disabled: boolean;
        end_time: string;
    }>> {
        if (!this.loggedIn) throw new Error('FitPass scraper not logged in');
        const r = await this.http.get(`${this.base}/calendars/schedules`, {
            params: { gym_id: gymId, from_date: from.toISOString(), to_date: to.toISOString() },
            headers: {
                'Accept': 'application/json, application/vnd.api+json',
                'X-Requested-With': 'XMLHttpRequest',
            },
        });
        if (r.status >= 400) throw new Error(`FitPass listSchedules failed (${r.status})`);
        return Array.isArray(r.data) ? r.data : [];
    }

    async syncReservations(from: Date, to: Date): Promise<ScraperRunResult> {
        const t0 = Date.now();
        try {
            const rows = await this.fetchReservationsRows(from, to);
            return {
                channel: 'fitpass',
                ok: true,
                fetched: rows.length,
                pushed: 0,
                failed: 0,
                durationMs: Date.now() - t0,
            };
        } catch (e: any) {
            return {
                channel: 'fitpass',
                ok: false,
                fetched: 0,
                pushed: 0,
                failed: 0,
                durationMs: Date.now() - t0,
                error: e?.message || String(e),
            };
        }
    }
}
