/**
 * Datos de prueba para los scripts que corren contra la base LOCAL dentro de una
 * transacción que se revierte (BEGIN … ROLLBACK). Todo lo que crea vive solo en esa
 * transacción: nunca se escribe nada de verdad.
 */
import type { PoolClient } from 'pg';

export interface BasePrueba {
    multi: string;      // class_type_id de la bolsa "Clases"
    multi2: string;     // otro tipo "Clases" (para mover de tipo sin cambiar de bolsa)
    reformer: string;   // class_type_id de la bolsa "Salsa"
    coachA: string;
    coachB: string;
    sucursal: string;
    plan: string;
    admin: string;      // users.id que firma cancelaciones y auditoría
}

export async function prepararBase(db: PoolClient): Promise<BasePrueba> {
    const uno = async (sql: string) => (await db.query(sql)).rows[0]?.id as string | undefined;
    const multi = await uno(`SELECT id FROM class_types WHERE category = 'multi' ORDER BY name LIMIT 1`);
    const multi2 = await uno(`SELECT id FROM class_types WHERE category = 'multi' ORDER BY name OFFSET 1 LIMIT 1`);
    const reformer = await uno(`SELECT id FROM class_types WHERE category = 'reformer' ORDER BY name LIMIT 1`);
    const coaches = (await db.query(`SELECT id FROM instructors WHERE is_active = true ORDER BY display_name LIMIT 2`)).rows;
    const sucursal = await uno(`SELECT id FROM facilities ORDER BY name LIMIT 1`);
    const plan = await uno(`SELECT id FROM plans ORDER BY name LIMIT 1`);
    if (!multi || !multi2 || !reformer || coaches.length < 2 || !sucursal || !plan) {
        throw new Error('La base local necesita 2 tipos "multi", 1 "reformer", 2 coaches activas, una sucursal y un plan');
    }
    const admin = (await db.query(
        `INSERT INTO users (email, phone, display_name, role, is_active)
         VALUES ('admin-lote-' || gen_random_uuid() || '@casashe.test', '55' || floor(random() * 1e8)::text, 'Admin Lote', 'admin', true)
         RETURNING id`,
    )).rows[0].id as string;
    return { multi, multi2, reformer, coachA: coaches[0].id, coachB: coaches[1].id, sucursal, plan, admin };
}

/** Fecha (YYYY-MM-DD) a `dias` de hoy en CDMX. */
export async function fechaEnDias(db: PoolClient, dias: number): Promise<string> {
    return (await db.query(
        `SELECT ((NOW() AT TIME ZONE 'America/Mexico_City')::date + $1::int)::text AS d`, [dias],
    )).rows[0].d as string;
}

export async function crearClase(db: PoolClient, base: BasePrueba, datos: {
    fecha: string; hora: string; minutos?: number; tipo?: string; coach?: string; sucursal?: string; cupo?: number;
}): Promise<string> {
    const r = await db.query(
        `INSERT INTO classes (class_type_id, instructor_id, facility_id, date, start_time, end_time, max_capacity, status)
         VALUES ($1, $2, $3, $4::date, $5::time, $5::time + make_interval(mins => $6::int), $7, 'scheduled') RETURNING id`,
        [datos.tipo ?? base.multi, datos.coach ?? base.coachA, datos.sucursal ?? base.sucursal, datos.fecha, datos.hora, datos.minutos ?? 50, datos.cupo ?? 7],
    );
    const id = r.rows[0].id as string;
    // El trigger siembra TotalPass con el default del tipo: cada prueba parte sin canales.
    await db.query(`DELETE FROM channel_inventory WHERE class_id = $1`, [id]);
    return id;
}

/** Alumna con una membresía activa con 5 créditos en cada bolsa. */
export async function crearAlumna(db: PoolClient, base: BasePrueba): Promise<{ userId: string; membershipId: string }> {
    const userId = (await db.query(
        `INSERT INTO users (email, phone, display_name, role, is_active)
         VALUES ('alumna-lote-' || gen_random_uuid() || '@casashe.test', '55' || floor(random() * 1e8)::text, 'Alumna Lote', 'client', true)
         RETURNING id`,
    )).rows[0].id as string;
    const membershipId = (await db.query(
        `INSERT INTO memberships (user_id, plan_id, status, multi_remaining, reformer_remaining, start_date, end_date)
         VALUES ($1, $2, 'active', 5, 5, CURRENT_DATE, CURRENT_DATE + 60) RETURNING id`,
        [userId, base.plan],
    )).rows[0].id as string;
    return { userId, membershipId };
}

/** Reserva confirmada de una alumna de la app que gastó un crédito de `categoria`. */
export async function inscribir(db: PoolClient, classId: string, alumna: { userId: string; membershipId: string }, categoria: 'multi' | 'reformer' = 'multi'): Promise<string> {
    await db.query(`UPDATE memberships SET ${categoria}_remaining = ${categoria}_remaining - 1 WHERE id = $1`, [alumna.membershipId]);
    await db.query(`UPDATE classes SET current_bookings = current_bookings + 1 WHERE id = $1`, [classId]);
    return (await db.query(
        `INSERT INTO bookings (class_id, user_id, membership_id, consumed_category, status, channel)
         VALUES ($1, $2, $3, $4, 'confirmed', 'app') RETURNING id`,
        [classId, alumna.userId, alumna.membershipId, categoria],
    )).rows[0].id as string;
}

/** Cupo TotalPass `max` con `socias` reservas de socias (el trigger de bookings sube booked_spots). */
export async function conTotalpass(db: PoolClient, base: BasePrueba, classId: string, max: number, socias = 0): Promise<void> {
    await db.query(
        `INSERT INTO channel_inventory (class_id, channel, max_spots) VALUES ($1, 'totalpass', $2)
         ON CONFLICT (class_id, channel) DO UPDATE SET max_spots = EXCLUDED.max_spots`,
        [classId, max],
    );
    for (let i = 0; i < socias; i++) {
        const socia = await crearAlumna(db, base);
        await db.query(`UPDATE classes SET current_bookings = current_bookings + 1 WHERE id = $1`, [classId]);
        await db.query(
            `INSERT INTO bookings (class_id, user_id, status, channel, external_ref) VALUES ($1, $2, 'confirmed', 'totalpass', gen_random_uuid()::text)`,
            [classId, socia.userId],
        );
    }
}

/** La clase ya vive en TotalPass (mapping publicado). */
export async function publicada(db: PoolClient, classId: string, estado = 'published'): Promise<void> {
    await db.query(
        `INSERT INTO partner_class_mappings (class_id, channel, sync_status) VALUES ($1, 'totalpass', $2)`,
        [classId, estado],
    );
}

export async function estadoMapping(db: PoolClient, classId: string): Promise<string | null> {
    return (await db.query(
        `SELECT sync_status FROM partner_class_mappings WHERE class_id = $1 AND channel = 'totalpass'`, [classId],
    )).rows[0]?.sync_status ?? null;
}
