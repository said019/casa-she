/**
 * Tests del scraper FitPass SIN red: parseo de HTML/JSON con fixtures y forma de las
 * peticiones (CSRF fresco por POST, _method=patch, paginación, fechas CDMX).
 * Correr: npx tsx scripts/test-fitpass-scraper.ts
 */
import assert from 'node:assert/strict';
import { Cookie } from 'tough-cookie';
import type { AxiosInstance } from 'axios';
import {
    FitPassScraper, FitPassHttpError, parseReservacionesHtml, parseLessonsHtml, parseFechaHora,
    mapEstatus, fpFechaHoraToIso, extractClassFields, fitpassAttendanceResponseMatches,
} from '../src/lib/scrapers/fitpass.js';

let n = 0;
const ok = (name: string) => { n += 1; console.log(`  ok ${name}`); };

// ── Fixtures ────────────────────────────────────────────────────────────────
function reservationsHtml(ids: number[], opts: { status?: string; clase?: string } = {}): string {
    const rows = ids.map((id) => `
        <tr class="align-middle"><td>${id}</td><td>Nombre ${id}</td><td>Apellido ${id}</td>
        <td>${opts.clase ?? 'PILATES MAT'}</td><td>Coach</td><td>13 OCT 2026</td><td>05:00 PM</td>
        <td>Reserva</td><td>${opts.status ?? 'Reservado'}</td></tr>`).join('');
    return `<turbo-stream action="append"><template><table>
        <thead><tr><th>ID</th><th>Nombre</th><th>Apellidos</th><th>Clase</th><th>Maestro</th>
        <th>Fecha</th><th>Hora</th><th>Tipo</th><th>Estatus</th></tr></thead>
        <tbody>${rows}</tbody></table></template></turbo-stream>`;
}

const LESSONS_CASA_SHE = `<table><thead><tr><th>Logo</th><th>Disciplina</th><th>Actividades</th><th>Estatus</th><th>Acciones</th></tr></thead><tbody>
<tr><td><div class="logo">PM</div></td>
  <td><span class="data-table__name">PILATES MAT</span> <span class="data-table__description">Disciplina de acondicionamiento</span>
      <div class="data-table__chips dt-tablet-only mt-2"><span class="data-table__chip">Pilates Mat / Reformer</span></div></td>
  <td><span class="data-table__chip">Pilates Mat / Reformer</span></td><td>Activa</td>
  <td><a href="/lessons/47206">Ver</a> <a href="/lessons/47206/edit">Editar</a></td></tr>
<tr><td><div class="logo">B</div></td>
  <td><span class="data-table__name">BARRE</span> <span class="data-table__description">Fuerza</span></td>
  <td><span class="data-table__chip">Funcional</span></td><td>Activa</td>
  <td><a href="/lessons/46820">Ver</a><a href="/lessons/46820/edit">Editar</a></td></tr>
<tr><td>X</td><td><span class="data-table__name">VIEJA</span></td><td></td><td>Inactiva</td><td><a href="/lessons/1/edit">Editar</a></td></tr>
</tbody></table>`;

const LESSONS_HUNDRED = `<table><tbody>
<tr><td></td><td>YOGA</td><td>Descripción larga</td><td>Hatha  Vinyasa</td><td>Qué traer</td><td><a href="/lessons/43116/edit">EDITAR</a></td></tr>
</tbody></table>`;

// ── parseReservacionesHtml ──────────────────────────────────────────────────
{
    const recs = parseReservacionesHtml(reservationsHtml([101, 102], { status: 'Asistió' }));
    assert.equal(recs.length, 2);
    assert.deepEqual(recs[0], {
        id: '101', nombre: 'Nombre 101', apellido: 'Apellido 101', clase: 'PILATES MAT',
        maestro: 'Coach', fecha_hora_clase: '2026-10-13 17:00', estatus: 'Asistió',
    });
    ok('reservaciones: 9 celdas -> record con fecha 12h->24h');

    assert.deepEqual(parseReservacionesHtml(reservationsHtml([])), []);
    assert.deepEqual(parseReservacionesHtml('<turbo-stream><template><div class="empty-state">No hay reservaciones</div></template></turbo-stream>'), []);
    ok('reservaciones: vacío reconocible = []');

    assert.throws(() => parseReservacionesHtml('<html>login</html>'), /Turbo Stream/);
    assert.throws(() => parseReservacionesHtml('<turbo-stream><template><table><tbody><tr><td>1</td><td>x</td></tr></tbody></table></template></turbo-stream>'), /incompleta|reconocible/);
    assert.throws(() => parseReservacionesHtml(reservationsHtml([5]).replace('13 OCT 2026', 'ayer')), /fecha\/hora inválida/);
    ok('reservaciones: HTML ajeno/incompleto/fecha mala falla visible');
}

// ── helpers de fecha/estatus ────────────────────────────────────────────────
assert.equal(fpFechaHoraToIso('7 ENE 2027', '12:30 AM'), '2027-01-07 00:30');
assert.equal(fpFechaHoraToIso('7 DIC 2026', '12:00 PM'), '2026-12-07 12:00');
assert.equal(fpFechaHoraToIso('7 XXX 2026', '1:00 PM'), null);
assert.deepEqual(parseFechaHora('2026-10-13 17:00'), { date: '2026-10-13', startTime: '17:00' });
assert.deepEqual(parseFechaHora('13/10/2026 7:05'), { date: '2026-10-13', startTime: '07:05' });
assert.equal(mapEstatus('Asistió'), 'attended');
assert.equal(mapEstatus('NO ASISTIÓ'), 'reserved');
assert.equal(mapEstatus('Cancelado'), 'cancelled');
assert.equal(mapEstatus('Reservado'), 'reserved');
ok('fechas y estatus');

assert.deepEqual(extractClassFields({ actividad: 'Pilates' }), { className: 'Pilates', fitpassLessonId: undefined });
assert.deepEqual(extractClassFields({ clase: 'Barre', clase_id: '42941' }), { className: 'Barre', fitpassLessonId: 42941 });
assert.deepEqual(extractClassFields({ fecha_hora_clase: 'x', estatus_clase: 'y' }), { className: undefined, fitpassLessonId: undefined });
assert.equal(extractClassFields({ lesson_id: '0' }).fitpassLessonId, undefined);
ok('extractClassFields');

assert.equal(fitpassAttendanceResponseMatches('<td>Asistió</td>', 'attended'), true);
assert.equal(fitpassAttendanceResponseMatches('<td>No asistió</td>', 'attended'), false);
assert.equal(fitpassAttendanceResponseMatches('<td>No asistió</td>', 'no_show'), true);
ok('fitpassAttendanceResponseMatches');

// ── parseLessonsHtml ────────────────────────────────────────────────────────
{
    const l = parseLessonsHtml(LESSONS_CASA_SHE);
    assert.deepEqual(l.map((x) => `${x.id}:${x.name}`), ['46820:BARRE', '47206:PILATES MAT', '1:VIEJA']);
    const pm = l.find((x) => x.id === 47206)!;
    assert.equal(pm.description, 'Disciplina de acondicionamiento');
    assert.deepEqual(pm.activities, ['Pilates Mat / Reformer']);
    assert.equal(pm.active, true);
    assert.equal(l.find((x) => x.id === 1)!.active, false);
    ok('lessons: layout Casa Shé (name/description/chips, no usa las iniciales del logo)');

    const h = parseLessonsHtml(LESSONS_HUNDRED);
    assert.deepEqual(h, [{ id: 43116, name: 'YOGA', description: 'Descripción larga', activities: ['Hatha', 'Vinyasa'] }]);
    ok('lessons: layout de respaldo (Hundred)');
    assert.deepEqual(parseLessonsHtml('<html></html>'), []);
}

// ── Scraper con http stub ───────────────────────────────────────────────────
type Call = { method: 'get' | 'post'; url: string; body?: string; config?: any };
class StubScraper extends FitPassScraper {
    calls: Call[] = [];
    csrfCounter = 0;
    constructor(private readonly handler: (c: Call) => { status: number; data: any }, private readonly pageLimit = 100) {
        super('https://fitpass.test');
        const self = this;
        this.http = {
            get: async (url: string, config?: any) => {
                const c: Call = { method: 'get', url, config };
                self.calls.push(c);
                if (url.endsWith('/g/calendar')) {
                    self.csrfCounter += 1;
                    return { status: 200, data: `<meta name="csrf-token" content="tok-${self.csrfCounter}">` };
                }
                return self.handler(c);
            },
            post: async (url: string, body: string, config?: any) => {
                const c: Call = { method: 'post', url, body, config };
                self.calls.push(c);
                return self.handler(c);
            },
        } as unknown as AxiosInstance;
        this.loggedIn = true;
    }
    protected getReservationPageLimit(): number { return this.pageLimit; }
    get jarForTest() { return this.jar; }
}

(async () => {
    // Paginación: página 1 llena (30), página 2 corta -> 35 filas, params correctos
    {
        const urls: string[] = [];
        const s = new StubScraper((c) => {
            urls.push(c.url);
            const u = new URL(c.url);
            const page = Number(u.searchParams.get('pagination[page]') || 1);
            if (page === 1) return { status: 200, data: reservationsHtml(Array.from({ length: 30 }, (_, i) => i + 1)) };
            return { status: 200, data: reservationsHtml(Array.from({ length: 5 }, (_, i) => 31 + i)) };
        });
        const rows = await s.fetchReservationsRows(new Date('2026-10-01T12:00:00Z'), new Date('2026-10-11T12:00:00Z'));
        assert.equal(rows.length, 35);
        assert.equal(rows[0].sourceRef, '1');
        assert.equal(rows[0].displayName, 'Nombre 1 Apellido 1');
        assert.deepEqual(rows[0].classLookup, { date: '2026-10-13', startTime: '17:00', className: 'PILATES MAT', fitpassLessonId: undefined, coachName: 'Coach' });
        const u1 = new URL(urls[0]); const u2 = new URL(urls[1]);
        assert.equal(u1.pathname, '/s/reservaciones/search');
        assert.equal(u1.searchParams.get('from_date'), '2026-10-01');
        assert.equal(u1.searchParams.get('to_date'), '2026-10-11');
        assert.equal(u1.searchParams.has('pagination[page]'), false);
        assert.equal(u2.searchParams.get('pagination[page]'), '2');
        assert.equal(u2.searchParams.get('pagination[count]'), '30');
        assert.equal(u2.searchParams.get('append_records'), 'true');
        ok('fetchReservationsRows: paginación pagination[page|count]+append_records');
    }
    // Ventana en zona CDMX: 2026-10-12T02:00Z = 11-oct 20:00 CDMX
    {
        const s = new StubScraper(() => ({ status: 200, data: reservationsHtml([]) }));
        await s.fetchReservationsRows(new Date('2026-10-12T02:00:00Z'), new Date('2026-10-12T03:00:00Z'));
        const u = new URL(s.calls[0].url);
        assert.equal(u.searchParams.get('from_date'), '2026-10-11');
        ok('fetchReservationsRows: from/to en fecha CDMX, no UTC');
    }
    // Panel ignora la paginación (página llena repetida) -> falla
    {
        const s = new StubScraper(() => ({ status: 200, data: reservationsHtml(Array.from({ length: 30 }, (_, i) => i + 1)) }));
        await assert.rejects(() => s.fetchReservationsRows(new Date(), new Date()), /repite reservaciones/);
        const s2 = new StubScraper((c) => ({ status: 200, data: reservationsHtml(Array.from({ length: 30 }, (_, i) => i + 1 + (Number(new URL(c.url).searchParams.get('pagination[page]') || 1) * 100))) }), 3);
        await assert.rejects(() => s2.fetchReservationsRows(new Date(), new Date()), /máximo de 3 páginas/);
        ok('fetchReservationsRows: snapshot incompleto falla (no importa a medias)');
    }
    // HTTP 500 en reservaciones
    {
        const s = new StubScraper(() => ({ status: 403, data: '' }));
        await assert.rejects(() => s.fetchReservationsRows(new Date(), new Date()), /failed \(403/);
    }

    // listSchedules: JSON array, params
    {
        const sample = [{ id: 1, lesson_time: '2026-10-05T15:00:00Z', start_date: '2026-10-05T15:00:00Z', day: 1, length: 50, lesson_availability: 6, parent_id: null, lesson: { id: 47206, name: 'PILATES MAT' }, instructor: { id: 9, name: 'Ana' }, disabled: false, end_time: '2026-10-05T15:50:00Z' }];
        const s = new StubScraper(() => ({ status: 200, data: sample }));
        const r = await s.listSchedules(9813, new Date('2026-10-05T06:00:00Z'), new Date('2026-10-12T05:59:59Z'));
        assert.equal(r.length, 1);
        assert.equal(r[0].lesson.id, 47206);
        assert.equal(s.calls[0].config.params.gym_id, 9813);
        assert.equal(s.calls[0].config.params.from_date, '2026-10-05T06:00:00.000Z');
        const s2 = new StubScraper(() => ({ status: 200, data: '<html>' }));
        assert.deepEqual(await s2.listSchedules(1, new Date(), new Date()), []);
        const s3 = new StubScraper(() => ({ status: 401, data: '' }));
        await assert.rejects(() => s3.listSchedules(1, new Date(), new Date()), /listSchedules failed \(401\)/);
        ok('listSchedules: JSON array, params gym_id/from/to, no-array=[], error HTTP');
    }

    // Mutaciones: CSRF fresco por POST + _method=patch + forma del form
    {
        const s = new StubScraper(() => ({ status: 200, data: 'ok' }));
        await s.markAttendance(12345);
        await s.cancelSchedule(777);
        await s.cancelSchedule(778, { cancelRecurrence: true });
        await s.updateSchedule(777, { gymId: 9813, lessonId: 47206, instructorName: 'Ana', startDate: '2026-10-13', lessonTime: '17:00', length: 50, lessonAvailability: 6 });
        const posts = s.calls.filter((c) => c.method === 'post');
        assert.equal(posts.length, 4);
        const tokens = posts.map((p) => new URLSearchParams(p.body!).get('authenticity_token'));
        assert.deepEqual(tokens, ['tok-1', 'tok-2', 'tok-3', 'tok-4'], 'cada POST pide un CSRF fresco');
        for (const p of posts) assert.equal(new URLSearchParams(p.body!).get('_method'), 'patch', `${p.url} requiere _method=patch`);
        assert.equal(posts[0].url, 'https://fitpass.test/attendance_lists/12345/attend');
        assert.equal(posts[1].url, 'https://fitpass.test/calendars/schedules/777/cancel');
        assert.equal(new URLSearchParams(posts[1].body!).get('multiple'), 'false');
        assert.equal(new URLSearchParams(posts[2].body!).get('multiple'), 'true');
        const up = new URLSearchParams(posts[3].body!);
        assert.equal(up.get('schedule[lesson_time]'), '17:00:00.000');
        assert.equal(up.get('schedule[timezone]'), 'Etc/GMT+6');
        assert.equal(up.get('schedule[lesson_availability]'), '6');
        assert.equal(posts[3].config.headers['X-CSRF-Token'], 'tok-4');
        ok('mutaciones: CSRF fresco por POST, _method=patch, multiple=false, lesson_time HH:MM:SS.000');
    }
    // createSchedule: shape + sin _method + create=true
    {
        const s = new StubScraper(() => ({ status: 201, data: '<turbo-stream/>' }));
        await s.createSchedule({ gymId: 9813, lessonId: 47206, instructorName: 'Ana', startDate: '2026-10-13', lessonTime: '17:00:00', length: 50, lessonAvailability: 4 });
        const p = s.calls.find((c) => c.method === 'post')!;
        const f = new URLSearchParams(p.body!);
        assert.equal(p.url, 'https://fitpass.test/calendars/schedules');
        assert.equal(f.get('create'), 'true');
        assert.equal(f.get('schedule[id]'), '');
        assert.equal(f.get('schedule[gym_id]'), '9813');
        assert.equal(f.get('schedule[multiple]'), '0');
        assert.equal(f.get('schedule[lesson_time]'), '17:00:00.000');
        assert.equal(f.has('_method'), false);
        await assert.rejects(() => s.createSchedule({ gymId: 1, lessonId: 1, instructorName: 'x', startDate: '2026-10-13', lessonTime: '5pm', length: 50, lessonAvailability: 1 }), /lessonTime inválido/);
        ok('createSchedule: shape del form');
    }
    // Errores HTTP tipados (404 en attend, 410 en cancel) para idempotencia del caller
    {
        const s = new StubScraper(() => ({ status: 404, data: 'nope' }));
        await assert.rejects(() => s.markAttendance(1), (e: any) => e instanceof FitPassHttpError && e.status === 404);
        await assert.rejects(() => s.cancelSchedule(1), (e: any) => e instanceof FitPassHttpError && e.status === 404);
        await assert.rejects(() => s.markAttendance('abc' as any), /inválido/);
        ok('FitPassHttpError.status disponible');
    }
    // login: CSRF -> POST /sessions con campos; exige cookie _admin_session
    {
        let posted: Call | null = null;
        const s = new StubScraper((c) => {
            if (c.method === 'get') return { status: 200, data: '<meta name="csrf-token" content="login-tok">' };
            posted = c;
            return { status: 302, data: '' };
        });
        (s as any).loggedIn = false;
        await assert.rejects(() => s.login({ email: 'a@b.c', password: 'pw' }), /_admin_session/);
        await s.jarForTest.setCookie(Cookie.parse('_admin_session=abc; Path=/')!, 'https://fitpass.test');
        await s.login({ email: 'a@b.c', password: 'pw' });
        const f = new URLSearchParams(posted!.body!);
        assert.equal(posted!.url, 'https://fitpass.test/sessions');
        assert.equal(f.get('authenticity_token'), 'login-tok');
        assert.equal(f.get('login_user[email]'), 'a@b.c');
        assert.equal(f.get('login_user[password]'), 'pw');
        await assert.rejects(() => new StubScraper(() => ({ status: 200, data: '<html>sin csrf</html>' })).login({ email: 'a', password: 'b' }), /CSRF/);
        ok('login: GET /sessions/new -> POST /sessions + verifica _admin_session');
    }
    // sin login previo
    {
        const s = new StubScraper(() => ({ status: 200, data: '' }));
        (s as any).loggedIn = false;
        await assert.rejects(() => s.fetchLessons(), /not logged in/);
        await assert.rejects(() => s.cancelSchedule(1), /not logged in/);
    }
    console.log(`test-fitpass-scraper: OK (${n} grupos)`);
})().catch((e) => { console.error(e); process.exit(1); });
