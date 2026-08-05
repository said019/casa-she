/**
 * Carga el horario semanal de Casa Shé (agosto 2026) en la plantilla y en el
 * calendario, dejándolo listo para publicar a TotalPass.
 *
 * Se ejecuta en SIMULACIÓN por defecto. Para escribir de verdad: --aplicar
 *
 *   npx tsx scripts/aplicar-horario-agosto.ts              # simula
 *   npx tsx scripts/aplicar-horario-agosto.ts --aplicar    # escribe
 *
 * Reglas duras:
 *  - NUNCA toca una clase que tenga alguna reserva viva (aunque sea de TotalPass).
 *  - NUNCA toca fechas pasadas ni el día de hoy.
 *  - Es idempotente: correrlo dos veces no duplica ni vuelve a cancelar nada.
 */
import { query, queryOne, pool } from '../src/config/database.js';
import { cancelClassOnTotalpass, publishTotalPassIndividualClasses } from '../src/lib/totalpass/publish.js';
import { localDateStr, addDaysToDateStr } from '../src/lib/mx-time.js';

const APLICAR = process.argv.includes('--aplicar');

// Horario semanal. day: 0=domingo … 6=sábado (misma convención que schedules.day_of_week).
// Transcrito de la hoja "AGENDA CASA SHE"; las clases duran 50 min.
const HORARIO: Array<{ day: number; hora: string; clase: string; coach: string }> = [
    // LUNES
    { day: 1, hora: '07:00', clase: 'Mornig Fit Flow', coach: 'Shelle' },
    { day: 1, hora: '07:00', clase: 'Yoga', coach: 'Regina' },
    { day: 1, hora: '08:00', clase: 'Barre', coach: 'Shelle' },
    { day: 1, hora: '08:00', clase: 'Flex', coach: 'Regina' },
    { day: 1, hora: '09:00', clase: 'Barre', coach: 'Shelle' },
    { day: 1, hora: '09:00', clase: 'Pilates Mat', coach: 'Regina' },
    { day: 1, hora: '17:00', clase: 'Sculpt', coach: 'Raúl' },
    { day: 1, hora: '18:00', clase: 'Barre', coach: 'Raúl' },
    { day: 1, hora: '19:00', clase: 'Pilates Mat', coach: 'Raúl' },
    { day: 1, hora: '20:00', clase: 'Barre', coach: 'Raúl' },
    { day: 1, hora: '20:00', clase: 'Vinyasa + Yin Yoga', coach: 'Sol' },
    // MARTES
    { day: 2, hora: '07:00', clase: 'Flow Yoga', coach: 'Roby' },
    { day: 2, hora: '07:00', clase: 'Pilates Mat', coach: 'Isaí' },
    { day: 2, hora: '08:00', clase: 'Rocket Yoga', coach: 'Roby' },
    { day: 2, hora: '08:00', clase: 'Pilates Mat', coach: 'Isaí' },
    { day: 2, hora: '09:00', clase: 'Flex', coach: 'Roby' },
    { day: 2, hora: '09:00', clase: 'Pilates Mat', coach: 'Isaí' },
    { day: 2, hora: '10:30', clase: 'Sculpt', coach: 'Yesz' },
    { day: 2, hora: '11:30', clase: 'Sculpt', coach: 'Yesz' },
    { day: 2, hora: '18:00', clase: 'Barre', coach: 'Shelle' },
    { day: 2, hora: '19:00', clase: 'Barre', coach: 'Shelle' },
    { day: 2, hora: '19:00', clase: 'Navakarana', coach: 'Pau' },
    { day: 2, hora: '20:00', clase: 'Nith Fit Strech', coach: 'Shelle' },
    // MIÉRCOLES
    { day: 3, hora: '07:00', clase: 'Flex', coach: 'Regina' },
    { day: 3, hora: '07:00', clase: 'Barre', coach: 'Raúl' },
    { day: 3, hora: '08:00', clase: 'Yoga Dharma', coach: 'Regina' },
    { day: 3, hora: '08:00', clase: 'Barre', coach: 'Raúl' },
    { day: 3, hora: '09:00', clase: 'Pilates Mat', coach: 'Regina' },
    { day: 3, hora: '17:00', clase: 'Sculpt', coach: 'Yesz' },
    { day: 3, hora: '18:00', clase: 'Sculpt', coach: 'Yesz' },
    { day: 3, hora: '19:00', clase: 'Sculpt', coach: 'Yesz' },
    { day: 3, hora: '19:00', clase: 'Power Vinyasa', coach: 'Ale' },
    { day: 3, hora: '20:00', clase: 'Somatic Reset', coach: 'Ale' },
    // JUEVES
    { day: 4, hora: '07:00', clase: 'Pilates Mat', coach: 'Raúl' },
    { day: 4, hora: '08:00', clase: 'Inicios de Ashtanga', coach: 'Ale' },
    { day: 4, hora: '08:00', clase: 'Barre', coach: 'Raúl' },
    { day: 4, hora: '09:00', clase: 'Power Vinyasa', coach: 'Ale' },
    { day: 4, hora: '18:00', clase: 'Barre', coach: 'Shelle' },
    { day: 4, hora: '18:00', clase: 'Flex', coach: 'Roby' },
    { day: 4, hora: '19:00', clase: 'Barre', coach: 'Shelle' },
    { day: 4, hora: '19:00', clase: 'Rocket Yoga', coach: 'Roby' },
    { day: 4, hora: '20:00', clase: 'Nith Fit Strech', coach: 'Shelle' },
    // VIERNES
    { day: 5, hora: '07:00', clase: 'Morning Flow', coach: 'Roby' },
    { day: 5, hora: '08:00', clase: 'Rocket Yoga', coach: 'Roby' },
    { day: 5, hora: '09:00', clase: 'Flex & Flow', coach: 'Roby' },
    { day: 5, hora: '17:00', clase: 'Rocket Yoga', coach: 'Roby' },
    { day: 5, hora: '18:00', clase: 'Flex & Flow', coach: 'Roby' },
    { day: 5, hora: '19:00', clase: 'Salsa', coach: 'Ricardo' },
    { day: 5, hora: '20:00', clase: 'Salsa', coach: 'Ricardo' },
    // SÁBADO
    { day: 6, hora: '08:00', clase: 'Pilates Mat', coach: 'Isaí' },
    { day: 6, hora: '08:00', clase: 'Barre', coach: 'Raúl' },
    { day: 6, hora: '09:00', clase: 'Pilates Mat', coach: 'Isaí' },
    { day: 6, hora: '09:00', clase: 'Barre', coach: 'Raúl' },
    { day: 6, hora: '10:00', clase: 'Pilates Mat', coach: 'Isaí' },
    { day: 6, hora: '10:00', clase: 'Barre', coach: 'Raúl' },
    { day: 6, hora: '11:00', clase: 'Pilates Mat', coach: 'Isaí' },
    { day: 6, hora: '11:00', clase: 'Barre', coach: 'Raúl' },
    { day: 6, hora: '12:00', clase: 'Navakarana', coach: 'Pau' },
    // DOMINGO — "ISA" de la hoja se toma como Isaí, que es como ya estaba cargado.
    { day: 0, hora: '08:00', clase: 'Barre', coach: 'Isaí' },
    { day: 0, hora: '09:00', clase: 'Pilates Mat', coach: 'Isaí' },
    { day: 0, hora: '10:00', clase: 'Pilates Mat', coach: 'Isaí' },
    { day: 0, hora: '10:00', clase: 'Principios de Ashtanga', coach: 'Ale' },
    { day: 0, hora: '11:00', clase: 'Pilates Mat', coach: 'Isaí' },
    { day: 0, hora: '11:00', clase: 'Somatic Reset', coach: 'Ale' },
];

/** Coaches que la hoja usa y no existían. Correo temporal: el estudio lo cambia después. */
const COACHES_NUEVOS = [
    { nombre: 'Shelle', email: 'shelle@casashe.mx' },
    { nombre: 'Sol', email: 'sol@casashe.mx' },
];

const DURACION_MIN = 50;

function masMinutos(hhmm: string, min: number): string {
    const [h, m] = hhmm.split(':').map(Number);
    const t = h * 60 + m + min;
    return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

const DIAS = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
const log = (s = '') => console.log(s);

async function main() {
    log(`\n${'='.repeat(66)}`);
    log(APLICAR ? '  APLICANDO EL HORARIO (escribe en producción)' : '  SIMULACIÓN — no se escribe nada (usa --aplicar para ejecutar)');
    log('='.repeat(66));

    // La fecha sale de la hora del ESTUDIO, no del reloj del servidor. Railway
    // corre en UTC: a las 8 pm de CDMX el servidor ya está en el día siguiente,
    // así que `CURRENT_DATE` decía "5 de agosto" cuando en el estudio todavía
    // era 4. Con eso, el script se saltaba un día entero del horario nuevo.
    const hoy = localDateStr();
    const sucursal = await queryOne<{ id: string; name: string }>(`SELECT id, name FROM facilities ORDER BY created_at LIMIT 1`);
    if (!sucursal) throw new Error('No hay sucursal configurada');
    const utc = (await queryOne<{ d: string }>(`SELECT CURRENT_DATE::text AS d`))!.d;
    log(`\nHoy en el estudio: ${hoy}${utc !== hoy ? `  (el servidor en UTC ya va en ${utc})` : ''} · Sucursal: ${sucursal.name}`);

    // ── 1. Catálogo: tipos de clase ──────────────────────────────────────────
    const tiposUsados = [...new Set(HORARIO.map((h) => h.clase))];
    const tiposFaltan: string[] = [];
    for (const nombre of tiposUsados) {
        const existe = await queryOne(`SELECT id FROM class_types WHERE lower(name)=lower($1) AND is_active`, [nombre]);
        if (!existe) tiposFaltan.push(nombre);
    }
    log(`\n1. TIPOS DE CLASE — ${tiposUsados.length} usados, ${tiposFaltan.length} por crear`);
    tiposFaltan.forEach((t) => log(`     + ${t}`));
    if (APLICAR) {
        for (const nombre of tiposFaltan) {
            await query(
                `INSERT INTO class_types (name, category, description, duration_minutes, max_capacity, totalpass_default_spots, is_active)
                 VALUES ($1,'multi',$2,$3,7,6,true)`,
                [nombre, `${nombre} en Casa Shé`, DURACION_MIN],
            );
        }
    }

    // ── 2. Catálogo: coaches ─────────────────────────────────────────────────
    const coachesUsados = [...new Set(HORARIO.map((h) => h.coach))];
    const coachesFaltan: typeof COACHES_NUEVOS = [];
    for (const nombre of coachesUsados) {
        const existe = await queryOne(`SELECT id FROM instructors WHERE lower(display_name)=lower($1)`, [nombre]);
        if (!existe) {
            const cfg = COACHES_NUEVOS.find((c) => c.nombre.toLowerCase() === nombre.toLowerCase());
            if (!cfg) throw new Error(`El coach "${nombre}" no existe y no tiene correo configurado en COACHES_NUEVOS`);
            coachesFaltan.push(cfg);
        }
    }
    log(`\n2. COACHES — ${coachesUsados.length} usados, ${coachesFaltan.length} por crear`);
    coachesFaltan.forEach((c) => log(`     + ${c.nombre}  (${c.email}, correo temporal)`));
    if (APLICAR) {
        for (const c of coachesFaltan) {
            // El instructor cuelga de un usuario; se crea sin contraseña utilizable
            // (el estudio la define al invitarla) y con rol instructor.
            const u = await queryOne<{ id: string }>(
                `INSERT INTO users (email, display_name, password_hash, role)
                 VALUES ($1,$2,'!',
                         'instructor')
                 ON CONFLICT (email) DO UPDATE SET display_name=EXCLUDED.display_name
                 RETURNING id`,
                [c.email, c.nombre],
            );
            await query(
                `INSERT INTO instructors (user_id, display_name, email, is_active, visible_public)
                 VALUES ($1,$2,$3,true,true)`,
                [u!.id, c.nombre, c.email],
            );
        }
    }

    // Con el catálogo listo (o simulado), resolver ids. En simulación los que
    // faltan no existen todavía: se marcan y se reporta, sin tronar.
    const idTipo = new Map<string, string>();
    const idCoach = new Map<string, string>();
    for (const n of tiposUsados) {
        const r = await queryOne<{ id: string }>(`SELECT id FROM class_types WHERE lower(name)=lower($1) AND is_active LIMIT 1`, [n]);
        if (r) idTipo.set(n, r.id);
    }
    for (const n of coachesUsados) {
        const r = await queryOne<{ id: string }>(`SELECT id FROM instructors WHERE lower(display_name)=lower($1) LIMIT 1`, [n]);
        if (r) idCoach.set(n, r.id);
    }

    // ── 3. Plantilla (schedules) ─────────────────────────────────────────────
    const plantillaActual = await query<{ n: string }>(`SELECT count(*)::text AS n FROM schedules WHERE is_active AND is_recurring`);
    log(`\n3. PLANTILLA — hoy tiene ${plantillaActual[0].n} horarios activos; el nuevo horario trae ${HORARIO.length}`);
    if (APLICAR) {
        await query(`UPDATE schedules SET is_active=false WHERE is_active AND is_recurring`);
        for (const h of HORARIO) {
            await query(
                `INSERT INTO schedules (class_type_id, instructor_id, facility_id, day_of_week, start_time, end_time, max_capacity, is_active, is_recurring)
                 VALUES ($1,$2,$3,$4,$5::time,$6::time,7,true,true)`,
                [idTipo.get(h.clase), idCoach.get(h.coach), sucursal.id, h.day, h.hora, masMinutos(h.hora, DURACION_MIN)],
            );
        }
    }

    // ── 4. Calendario, de mañana en adelante ─────────────────────────────────
    const desde = addDaysToDateStr(hoy, 1);
    const hasta = (await queryOne<{ d: string }>(
        `SELECT COALESCE(max(date), $1::date)::text AS d FROM classes WHERE date >= $1::date`, [hoy],
    ))!.d;
    log(`\n4. CALENDARIO — de ${desde} a ${hasta} (hoy y el pasado NO se tocan)`);

    const actuales = await query<any>(
        `SELECT c.id, c.date::text AS date, substr(c.start_time::text,1,5) AS hora,
                ct.name AS clase, i.display_name AS coach,
                (SELECT count(*) FROM bookings b WHERE b.class_id=c.id AND b.status<>'cancelled')::int AS reservas,
                (m.id IS NOT NULL) AS en_tp
           FROM classes c
           JOIN class_types ct ON ct.id=c.class_type_id
           JOIN instructors i ON i.id=c.instructor_id
           LEFT JOIN partner_class_mappings m ON m.class_id=c.id AND m.channel='totalpass'
          WHERE c.date >= $1::date AND c.date <= $2::date AND c.status='scheduled'
          ORDER BY c.date, c.start_time`,
        [desde, hasta],
    );

    const llave = (d: string, h: string, clase: string, coach: string) => `${d}|${h}|${clase.toLowerCase()}|${coach.toLowerCase()}`;

    // Lo que el horario nuevo pide en ese rango
    const deseadas = new Map<string, { date: string; hora: string; clase: string; coach: string }>();
    for (let d = new Date(`${desde}T00:00:00Z`); d <= new Date(`${hasta}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
        const fecha = d.toISOString().slice(0, 10);
        for (const h of HORARIO.filter((x) => x.day === d.getUTCDay())) {
            deseadas.set(llave(fecha, h.hora, h.clase, h.coach), { date: fecha, hora: h.hora, clase: h.clase, coach: h.coach });
        }
    }

    const existentes = new Set(actuales.map((c) => llave(c.date, c.hora, c.clase, c.coach)));
    const sobran = actuales.filter((c) => !deseadas.has(llave(c.date, c.hora, c.clase, c.coach)));
    const faltan = [...deseadas.values()].filter((d) => !existentes.has(llave(d.date, d.hora, d.clase, d.coach)));

    const sobranConReserva = sobran.filter((c) => c.reservas > 0);
    const sobranLibres = sobran.filter((c) => c.reservas === 0);

    log(`     ${actuales.length} clases cargadas hoy · el horario nuevo pide ${deseadas.size}`);
    log(`     ${faltan.length} por crear`);
    log(`     ${sobranLibres.length} sobran y se cancelan (${sobranLibres.filter((c) => c.en_tp).length} están publicadas en TotalPass y hay que retirarlas)`);
    log(`     ${sobranConReserva.length} sobran PERO TIENEN RESERVA → se dejan intactas`);
    sobranConReserva.forEach((c) => log(`        ⚠️  ${c.date} ${c.hora} ${c.clase} · ${c.coach} · ${c.reservas} reserva(s)`));

    if (!APLICAR) {
        log('\n  (simulación: no se escribió nada)');
        log(`${'='.repeat(66)}\n`);
        return;
    }

    let creadas = 0;
    for (const d of faltan) {
        const r = await query(
            `INSERT INTO classes (class_type_id, instructor_id, facility_id, date, start_time, end_time, max_capacity)
             VALUES ($1,$2,$3,$4::date,$5::time,$6::time,7)
             ON CONFLICT (date, start_time, instructor_id, class_type_id, facility_id)
                 WHERE status='scheduled' DO NOTHING
             RETURNING id`,
            [idTipo.get(d.clase), idCoach.get(d.coach), sucursal.id, d.date, d.hora, masMinutos(d.hora, DURACION_MIN)],
        );
        if (r.length) creadas++;
    }

    // Cancelar las que sobran y no tienen a nadie dentro.
    // ORDEN IMPORTANTE: primero se retira de TotalPass y después se cancela local.
    // Si se hiciera al revés y el retiro fallara, la clase quedaría viva en
    // TotalPass pero muerta aquí: una socia reservaría un lugar inexistente.
    let canceladas = 0;
    let retiradasTp = 0;
    const falloRetiro: string[] = [];
    for (const c of sobranLibres) {
        if (c.en_tp) {
            const r = await cancelClassOnTotalpass(c.id).catch((e) => ({ ok: false, detail: String(e?.message || e) }));
            if (r.ok) retiradasTp++;
            else {
                falloRetiro.push(`${c.date} ${c.hora} ${c.clase} — ${r.detail ?? 'error'}`);
                continue;   // no se cancela local si sigue publicada allá
            }
            await new Promise((r2) => setTimeout(r2, 140));   // throttle: un 429 aborta la corrida
        }
        await query(
            `UPDATE classes SET status='cancelled', cancelled_at=NOW(),
                    cancellation_reason='Horario actualizado (agosto 2026)', updated_at=NOW()
              WHERE id=$1 AND status='scheduled'`,
            [c.id],
        );
        canceladas++;
    }

    log(`\n  ✅ ${creadas} clases creadas · ${canceladas} canceladas (${retiradasTp} retiradas de TotalPass) · ${sobranConReserva.length} respetadas por tener reserva`);
    if (falloRetiro.length) {
        log(`\n  ⚠️  ${falloRetiro.length} no se pudieron retirar de TotalPass y por eso NO se cancelaron aquí:`);
        falloRetiro.forEach((f) => log(`        ${f}`));
    }

    // ── 5. Publicar el horario nuevo a TotalPass ─────────────────────────────
    log('\n5. PUBLICANDO EN TOTALPASS…');
    const pub = await publishTotalPassIndividualClasses(desde, hasta);
    log(`     ${pub.created} publicadas · ${pub.alreadyInTp} ya estaban · ${pub.skippedTooSoon} muy próximas (TP no acepta) · ${pub.failed} fallaron`);
    log(`${'='.repeat(66)}\n`);
}

main()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((e) => { console.error('\nERROR:', e?.message || e); process.exit(1); });
