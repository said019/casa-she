/**
 * Catarsis Studio - Cron Jobs Service
 *
 * Tareas programadas automáticas:
 * - Generación de clases recurrentes
 * - Solicitudes de reseñas post-clase
 * - Alertas de membresías por vencer
 * - Marcar membresías expiradas
 * - Limpieza de órdenes expiradas
 * - Marcar no-shows
 */

import cron from 'node-cron';
import { query, queryOne } from '../config/database.js';
import {
    notifyMembershipExpiring,
    sendCustomNotification
} from '../lib/notifications.js';
import {
    sendExpiringMembershipNotice,
    sendWhatsAppMessage,
} from '../lib/whatsapp.js';
import { writeInAppNotification } from '../lib/in-app-notifications.js';
import { awardCheckinPoints, getLoyaltyConfig } from '../lib/loyalty.js';

// ============================================
// TIPOS
// ============================================

interface CronJobStatus {
    name: string;
    lastRun: Date | null;
    nextRun: Date | null;
    isRunning: boolean;
    lastError: string | null;
}

const jobStatus: Record<string, CronJobStatus> = {};

// ============================================
// UTILIDADES
// ============================================

function logJob(jobName: string, message: string): void {
    const timestamp = new Date().toISOString();
    console.log(`[CRON ${jobName}] ${timestamp} - ${message}`);
}

function logError(jobName: string, error: unknown): void {
    const timestamp = new Date().toISOString();
    console.error(`[CRON ${jobName}] ${timestamp} - ERROR:`, error);
    jobStatus[jobName] = {
        ...jobStatus[jobName],
        lastError: String(error),
    };
}

async function recordJobExecution(jobName: string, success: boolean, details?: string): Promise<void> {
    try {
        await query(`
            INSERT INTO cron_job_logs (job_name, success, details, executed_at)
            VALUES ($1, $2, $3, NOW())
        `, [jobName, success, details || null]);
    } catch {
        // Silently fail if table doesn't exist
    }
}

// ============================================
// JOB 1: GENERAR CLASES RECURRENTES
// Ejecuta cada día a las 3:00 AM
// ============================================

async function generateRecurringClasses(): Promise<void> {
    const jobName = 'GENERATE_CLASSES';
    logJob(jobName, 'Iniciando generación de clases recurrentes...');

    try {
        // Obtener schedules activos
        const schedules = await query<{
            id: string;
            class_type_id: string;
            instructor_id: string;
            facility_id: string | null;
            day_of_week: number;
            start_time: string;
            end_time: string;
            max_capacity: number;
        }>(`
            SELECT s.*, ct.name as class_type_name
            FROM schedules s
            JOIN class_types ct ON s.class_type_id = ct.id
            WHERE s.is_active = true
        `);

        if (schedules.length === 0) {
            logJob(jobName, 'No hay schedules activos');
            return;
        }

        // Generar clases para los próximos 14 días
        const daysAhead = 14;
        let classesCreated = 0;
        let classesSkipped = 0;

        for (let dayOffset = 0; dayOffset < daysAhead; dayOffset++) {
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() + dayOffset);
            const dayOfWeek = targetDate.getUTCDay(); // 0 = Domingo (UTC, consistente con toISOString)

            const dateStr = targetDate.toISOString().split('T')[0];

            // Buscar schedules para este día
            const daySchedules = schedules.filter(s => s.day_of_week === dayOfWeek);

            for (const schedule of daySchedules) {
                // Verificar si la clase ya existe
                const existing = await queryOne(`
                    SELECT id FROM classes
                    WHERE schedule_id = $1 AND date = $2
                `, [schedule.id, dateStr]);

                if (existing) {
                    classesSkipped++;
                    continue;
                }

                // Crear la clase
                await query(`
                    INSERT INTO classes (
                        schedule_id, class_type_id, instructor_id, facility_id,
                        date, start_time, end_time, max_capacity, status
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'scheduled')
                `, [
                    schedule.id,
                    schedule.class_type_id,
                    schedule.instructor_id,
                    schedule.facility_id,
                    dateStr,
                    schedule.start_time,
                    schedule.end_time,
                    schedule.max_capacity,
                ]);

                classesCreated++;
            }
        }

        logJob(jobName, `Completado: ${classesCreated} clases creadas, ${classesSkipped} ya existían`);
        await recordJobExecution(jobName, true, `Created: ${classesCreated}, Skipped: ${classesSkipped}`);

    } catch (error) {
        logError(jobName, error);
        await recordJobExecution(jobName, false, String(error));
    }
}

// ============================================
// JOB 2: SOLICITAR RESEÑAS (2H POST-CLASE)
// Ejecuta cada hora
// ============================================

async function requestReviews(): Promise<void> {
    const jobName = 'REQUEST_REVIEWS';
    logJob(jobName, 'Buscando clases completadas para solicitar reseñas...');

    try {
        // Buscar bookings de clases que terminaron hace ~2 horas sin reseña
        const bookings = await query<{
            booking_id: string;
            user_id: string;
            membership_id: string;
            class_type: string;
            instructor_name: string;
        }>(`
            SELECT
                b.id as booking_id,
                b.user_id,
                b.membership_id,
                ct.name as class_type,
                i.display_name as instructor_name
            FROM bookings b
            JOIN classes c ON b.class_id = c.id
            JOIN class_types ct ON c.class_type_id = ct.id
            JOIN instructors i ON c.instructor_id = i.id
            LEFT JOIN reviews r ON b.id = r.booking_id
            LEFT JOIN review_requests rr ON b.id = rr.booking_id
            WHERE b.status = 'checked_in'
            AND r.id IS NULL
            AND (rr.id IS NULL OR rr.status = 'pending')
            AND (c.date + c.end_time) BETWEEN (NOW() AT TIME ZONE 'America/Mexico_City') - INTERVAL '2.5 hours'
                                           AND (NOW() AT TIME ZONE 'America/Mexico_City') - INTERVAL '1.5 hours'
            -- Tepa: no se pide reseña a sus clientas (regla por sucursal de la dueña).
            AND NOT EXISTS (
                SELECT 1 FROM facilities f WHERE f.id = c.facility_id AND f.name ILIKE '%Tepa%'
            )
        `);

        if (bookings.length === 0) {
            logJob(jobName, 'No hay solicitudes de reseña pendientes');
            return;
        }

        let sent = 0;
        for (const booking of bookings) {
            try {
                if (booking.membership_id) {
                    await sendCustomNotification({
                        membershipId: booking.membership_id,
                        title: '⭐ ¿Cómo estuvo tu clase?',
                        message: `Cuéntanos tu experiencia en ${booking.class_type} y gana 50 puntos`,
                    });
                }

                // Actualizar review_request
                await query(`
                    UPDATE review_requests
                    SET status = 'sent', sent_at = NOW()
                    WHERE booking_id = $1
                `, [booking.booking_id]);

                sent++;
            } catch (err) {
                logError(jobName, `Error: ${err}`);
            }
        }

        logJob(jobName, `Enviadas ${sent}/${bookings.length} solicitudes de reseña`);
        await recordJobExecution(jobName, true, `Sent: ${sent}`);

    } catch (error) {
        logError(jobName, error);
        await recordJobExecution(jobName, false, String(error));
    }
}

// ============================================
// JOB 5: ALERTAS DE MEMBRESÍAS POR VENCER
// Ejecuta diario a las 10:00 AM
// ============================================

async function notifyExpiringMemberships(): Promise<void> {
    const jobName = 'EXPIRING_MEMBERSHIPS';
    logJob(jobName, 'Buscando membresías por vencer...');

    try {
        // Notificar SOLO cuando queda 1 día para vencer
        const daysToNotify = [1];

        for (const days of daysToNotify) {
            const memberships = await query<{
                id: string;
                user_id: string;
                plan_name: string;
                end_date: string;
                user_name: string;
                user_phone: string;
                facility_name: string | null;
            }>(`
                SELECT
                    m.id,
                    m.user_id,
                    p.name as plan_name,
                    m.end_date,
                    u.display_name as user_name,
                    u.phone as user_phone,
                    f.name as facility_name
                FROM memberships m
                JOIN plans p ON m.plan_id = p.id
                JOIN users u ON m.user_id = u.id
                LEFT JOIN orders o ON o.id = m.order_id
                LEFT JOIN facilities f ON f.id = COALESCE(m.facility_id, o.facility_id)
                LEFT JOIN expiry_notifications en
                    ON m.id = en.membership_id AND en.days_before = $1
                WHERE m.status = 'active'
                AND en.id IS NULL
                AND m.end_date = CURRENT_DATE + $1
                -- No avisar si ya se acabaron los créditos (reformer + multi en 0).
                -- NULL = ilimitado, así que cuenta como "tiene créditos".
                AND (COALESCE(m.reformer_remaining, 1) > 0 OR COALESCE(m.multi_remaining, 1) > 0)
            `, [days]);

            for (const membership of memberships) {
                try {
                    await notifyMembershipExpiring(membership.id, days);

                    // Enviar WhatsApp
                    if (membership.user_phone) {
                        const rawDate: any = membership.end_date;
                        const isoStr = rawDate instanceof Date
                            ? `${rawDate.getUTCFullYear()}-${String(rawDate.getUTCMonth()+1).padStart(2,'0')}-${String(rawDate.getUTCDate()).padStart(2,'0')}`
                            : String(rawDate).substring(0, 10);
                        const [y, mo, d] = isoStr.split('-');
                        const endDateStr = new Date(Number(y), Number(mo)-1, Number(d))
                            .toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
                        // Por sucursal: Tepa → WhatsApp Tepa, San Miguel → WhatsApp San Miguel
                        // (política 2026-06-23: dividir el recordatorio en los 2 WhatsApp).
                        sendExpiringMembershipNotice(
                            membership.user_phone,
                            membership.user_name,
                            membership.plan_name,
                            days,
                            endDateStr,
                            membership.facility_name ?? undefined
                        ).catch(err => logError(jobName, `WhatsApp error: ${err}`));
                    }

                    // Notificación in-app + push (vía el hook de writeInAppNotification).
                    // Dentro del dedup para no reenviarla en cada corrida.
                    await writeInAppNotification({
                        userId: membership.user_id,
                        type: 'membership_expiring',
                        title: 'Tu membresía está por vencer',
                        body: `Te quedan ${days} días. Renueva para no perder tus créditos.`,
                    });

                    // Marcar como notificado
                    await query(`
                        INSERT INTO expiry_notifications (membership_id, days_before, sent_at)
                        VALUES ($1, $2, NOW())
                        ON CONFLICT (membership_id, days_before) DO NOTHING
                    `, [membership.id, days]);

                } catch (err) {
                    logError(jobName, `Error notificando ${membership.id}: ${err}`);
                }
            }

            if (memberships.length > 0) {
                logJob(jobName, `Notificadas ${memberships.length} membresías que vencen en ${days} días`);
            }
        }

        await recordJobExecution(jobName, true);

    } catch (error) {
        logError(jobName, error);
        await recordJobExecution(jobName, false, String(error));
    }
}

// ============================================
// JOB 6: MARCAR MEMBRESÍAS EXPIRADAS
// Ejecuta diario a las 00:05 AM
// ============================================

async function markExpiredMemberships(): Promise<void> {
    const jobName = 'MARK_EXPIRED';
    logJob(jobName, 'Marcando membresías expiradas...');

    try {
        const result = await query(`
            UPDATE memberships
            SET status = 'expired', updated_at = NOW()
            WHERE status = 'active'
            AND end_date < CURRENT_DATE
            RETURNING id
        `);

        const count = result.length;
        if (count > 0) {
            logJob(jobName, `${count} membresías marcadas como expiradas`);
        } else {
            logJob(jobName, 'No hay membresías para marcar');
        }

        await recordJobExecution(jobName, true, `Expired: ${count}`);

    } catch (error) {
        logError(jobName, error);
        await recordJobExecution(jobName, false, String(error));
    }
}

// ============================================
// JOB 7: LIMPIAR ÓRDENES EXPIRADAS
// Ejecuta cada 6 horas
// ============================================

async function cleanupExpiredOrders(): Promise<void> {
    const jobName = 'CLEANUP_ORDERS';
    logJob(jobName, 'Limpiando órdenes expiradas...');

    try {
        // Cancelar órdenes de transferencia sin pagar después de 48h
        const result = await query(`
            UPDATE orders
            SET status = 'expired', updated_at = NOW()
            WHERE status IN ('pending_payment', 'pending')
            AND payment_method = 'bank_transfer'
            AND created_at < NOW() - INTERVAL '48 hours'
            RETURNING id, order_number
        `);

        const count = result.length;
        if (count > 0) {
            logJob(jobName, `${count} órdenes expiradas`);
        } else {
            logJob(jobName, 'No hay órdenes para limpiar');
        }

        await recordJobExecution(jobName, true, `Expired: ${count}`);

    } catch (error) {
        logError(jobName, error);
        await recordJobExecution(jobName, false, String(error));
    }
}

// ============================================
// JOB 8: MARCAR NO-SHOWS
// Ejecuta cada 30 minutos
// ============================================

async function markNoShows(): Promise<void> {
    const jobName = 'MARK_NO_SHOWS';
    logJob(jobName, 'Marcando no-shows...');

    try {
        // Marcar como no-show bookings confirmados de clases que ya terminaron
        // Usar timezone de México para comparar correctamente
        const result = await query(`
            UPDATE bookings
            SET status = 'no_show', updated_at = NOW()
            WHERE status = 'confirmed'
            AND class_id IN (
                SELECT id FROM classes
                WHERE (date + end_time) < (NOW() AT TIME ZONE 'America/Mexico_City') - INTERVAL '30 minutes'
                AND status IN ('completed', 'scheduled')
            )
            RETURNING id
        `);

        const count = result.length;

        // Actualizar clases completadas.
        // Usar timezone de México para no marcar clases futuras como completadas.
        // SOLO se marca 'completed' si la clase REALMENTE se dio (≥1 reserva no cancelada).
        // La ficha autogenera MUCHOS slots que el estudio no corre; sin esta condición se
        // marcaban impartidos cientos de slots vacíos (ensucia historial/reportes). La nómina
        // además exige reservas (coach-payroll), así que un slot vacío nunca se paga. Para
        // acreditar una clase real sin reservas existe el override manual del admin. Ver #188.
        await query(`
            UPDATE classes
            SET status = 'completed', updated_at = NOW()
            WHERE status = 'scheduled'
            AND (date + end_time) < (NOW() AT TIME ZONE 'America/Mexico_City') - INTERVAL '15 minutes'
            AND EXISTS (SELECT 1 FROM bookings b WHERE b.class_id = classes.id AND b.status <> 'cancelled')
        `);

        if (count > 0) {
            logJob(jobName, `${count} bookings marcados como no-show`);
        }

        await recordJobExecution(jobName, true, `No-shows: ${count}`);

    } catch (error) {
        logError(jobName, error);
        await recordJobExecution(jobName, false, String(error));
    }
}

// ============================================
// JOB: AUTO CHECK-IN
// Si el usuario no canceló, se marca como asistido 30 min después de que inició la clase
// Ejecuta cada 30 min (junto con markNoShows)
// ============================================

async function autoCheckIn(): Promise<void> {
    const jobName = 'AUTO_CHECK_IN';
    try {
        const result = await query<{ id: string; user_id: string }>(`
            UPDATE bookings
            SET status = 'checked_in',
                checked_in_at = NOW(),
                updated_at = NOW()
            WHERE status = 'confirmed'
            AND class_id IN (
                SELECT id FROM classes
                WHERE (date::text || ' ' || start_time::text)::timestamp AT TIME ZONE 'America/Mexico_City'
                      + INTERVAL '30 minutes' <= NOW()
                  AND (date::text || ' ' || end_time::text)::timestamp AT TIME ZONE 'America/Mexico_City'
                      > NOW() - INTERVAL '3 hours'
                  AND status IN ('scheduled', 'in_progress', 'completed')
            )
            RETURNING id, user_id
        `);
        const count = result.length;
        // Award attendance points for each auto-checked-in booking (idempotent)
        for (const row of result) {
            void awardCheckinPoints(row.user_id, row.id);
        }
        if (count > 0) {
            logJob(jobName, `${count} asistencias marcadas automáticamente`);
        }
        await recordJobExecution(jobName, true, `Auto check-in: ${count}`);
    } catch (error) {
        logError(jobName, error);
        await recordJobExecution(jobName, false, String(error));
    }
}

// ============================================
// JOB 9: EXPIRAR SOLICITUDES DE RESEÑA
// Ejecuta diario a las 2:00 AM
// ============================================

async function expireReviewRequests(): Promise<void> {
    const jobName = 'EXPIRE_REVIEWS';
    logJob(jobName, 'Expirando solicitudes de reseña antiguas...');

    try {
        const result = await query(`
            UPDATE review_requests
            SET status = 'expired', updated_at = NOW()
            WHERE status IN ('pending', 'sent')
            AND created_at < NOW() - INTERVAL '7 days'
            RETURNING id
        `);

        const count = result.length;
        if (count > 0) {
            logJob(jobName, `${count} solicitudes de reseña expiradas`);
        }

        await recordJobExecution(jobName, true, `Expired: ${count}`);

    } catch (error) {
        logError(jobName, error);
        await recordJobExecution(jobName, false, String(error));
    }
}

// ============================================
// JOB 10: BIRTHDAY BONUS — +100 pts (with active membership)
// ============================================

async function birthdayBonus(): Promise<void> {
    const jobName = 'BIRTHDAY_BONUS';
    logJob(jobName, 'Birthday bonus check…');
    try {
        const config = await getLoyaltyConfig();
        if (!config.enabled) { await recordJobExecution(jobName, true, 'loyalty disabled'); return; }
        const points = config.birthday_bonus;
        if (points <= 0) { await recordJobExecution(jobName, true, 'birthday_bonus = 0'); return; }

        // Users whose date_of_birth matches today (MM-DD) and have an active membership
        const targets = await query(`
            SELECT u.id, u.display_name, u.email, u.phone
            FROM users u
            WHERE u.date_of_birth IS NOT NULL
              AND TO_CHAR(u.date_of_birth, 'MM-DD') = TO_CHAR(NOW() AT TIME ZONE 'America/Mexico_City', 'MM-DD')
              AND EXISTS (
                  SELECT 1 FROM memberships m
                  WHERE m.user_id = u.id AND m.status = 'active'
                    AND m.end_date >= CURRENT_DATE
              )
        `);

        const today = new Date().toISOString().slice(0, 10);
        let granted = 0;
        for (const u of targets) {
            const desc = `Cumpleaños ${today}`;
            const exists = await queryOne(
                `SELECT id FROM loyalty_points WHERE user_id = $1 AND description = $2 LIMIT 1`,
                [u.id, desc]
            );
            if (exists) continue;
            await query(
                `INSERT INTO loyalty_points (user_id, points, type, description) VALUES ($1, $2, 'birthday', $3)`,
                [u.id, points, desc]
            );
            await query(
                `UPDATE users SET loyalty_points = COALESCE(loyalty_points, 0) + $1 WHERE id = $2`,
                [points, u.id]
            );
            granted++;
        }
        await recordJobExecution(jobName, true, `birthday bonuses granted: ${granted}`);
        logJob(jobName, `granted to ${granted} users`);
    } catch (e: any) {
        await recordJobExecution(jobName, false, e.message);
        logJob(jobName, `error: ${e.message}`);
    }
}

// ============================================
// JOB 11: ANNIVERSARY BONUS — +40 pts (1 year, with active membership)
// ============================================

async function anniversaryBonus(): Promise<void> {
    const jobName = 'ANNIVERSARY_BONUS';
    logJob(jobName, 'Anniversary bonus check…');
    try {
        const config = await getLoyaltyConfig();
        if (!config.enabled) { await recordJobExecution(jobName, true, 'loyalty disabled'); return; }
        const points = config.anniversary_bonus;
        if (points <= 0) { await recordJobExecution(jobName, true, 'anniversary_bonus = 0'); return; }

        // Users registered on this MM-DD, more than 1 year ago, with active membership
        const targets = await query(`
            SELECT u.id,
                   EXTRACT(YEAR FROM AGE(CURRENT_DATE, u.created_at))::int AS years
            FROM users u
            WHERE TO_CHAR(u.created_at, 'MM-DD') = TO_CHAR(NOW() AT TIME ZONE 'America/Mexico_City', 'MM-DD')
              AND u.created_at <= (CURRENT_DATE - INTERVAL '1 year')
              AND EXISTS (
                  SELECT 1 FROM memberships m
                  WHERE m.user_id = u.id AND m.status = 'active'
                    AND m.end_date >= CURRENT_DATE
              )
        `);

        const year = new Date().getFullYear();
        let granted = 0;
        for (const u of targets) {
            const desc = `Aniversario ${year}`;
            const exists = await queryOne(
                `SELECT id FROM loyalty_points WHERE user_id = $1 AND description = $2 LIMIT 1`,
                [u.id, desc]
            );
            if (exists) continue;
            await query(
                `INSERT INTO loyalty_points (user_id, points, type, description) VALUES ($1, $2, 'anniversary', $3)`,
                [u.id, points, desc]
            );
            await query(
                `UPDATE users SET loyalty_points = COALESCE(loyalty_points, 0) + $1 WHERE id = $2`,
                [points, u.id]
            );
            granted++;
        }
        await recordJobExecution(jobName, true, `anniversary bonuses granted: ${granted}`);
        logJob(jobName, `granted to ${granted} users`);
    } catch (e: any) {
        await recordJobExecution(jobName, false, e.message);
        logJob(jobName, `error: ${e.message}`);
    }
}

// ============================================
// JOB 12: STREAK BONUS — +10 pts every 2 consecutive ISO weeks attended
// ============================================

async function streakBonus(): Promise<void> {
    const jobName = 'STREAK_BONUS';
    logJob(jobName, 'Streak bonus check…');
    try {
        const config = await getLoyaltyConfig();
        if (!config.enabled) { await recordJobExecution(jobName, true, 'loyalty disabled'); return; }
        const points = config.streak_bonus;
        if (points <= 0) { await recordJobExecution(jobName, true, 'streak_bonus = 0'); return; }

        // For each user whose checked-in attendance covers BOTH the previous ISO week
        // and the current ISO week, grant +10 pts (one bonus per pair of weeks).
        // Idempotency: description embeds the LATER week (e.g. "Racha 2026-W18 + W19").
        const rows = await query(`
            WITH recent AS (
                SELECT b.user_id,
                       DATE_TRUNC('week', c.date)::date AS week_start
                FROM bookings b
                JOIN classes c ON b.class_id = c.id
                WHERE b.checked_in_at IS NOT NULL
                  AND c.date >= CURRENT_DATE - INTERVAL '21 days'
                GROUP BY b.user_id, DATE_TRUNC('week', c.date)
            ),
            pairs AS (
                SELECT a.user_id, a.week_start AS prev_week, b.week_start AS curr_week
                FROM recent a
                JOIN recent b ON b.user_id = a.user_id AND b.week_start = a.week_start + INTERVAL '7 days'
                WHERE b.week_start >= DATE_TRUNC('week', CURRENT_DATE)::date - INTERVAL '7 days'
            )
            SELECT user_id, prev_week, curr_week FROM pairs
        `);

        let granted = 0;
        for (const r of rows) {
            const prevTag = `${r.prev_week.toISOString().slice(0, 10)}`;
            const currTag = `${r.curr_week.toISOString().slice(0, 10)}`;
            const desc = `Racha ${prevTag} + ${currTag}`;
            const exists = await queryOne(
                `SELECT id FROM loyalty_points WHERE user_id = $1 AND description = $2 LIMIT 1`,
                [r.user_id, desc]
            );
            if (exists) continue;
            await query(
                `INSERT INTO loyalty_points (user_id, points, type, description) VALUES ($1, $2, 'streak', $3)`,
                [r.user_id, points, desc]
            );
            await query(
                `UPDATE users SET loyalty_points = COALESCE(loyalty_points, 0) + $1 WHERE id = $2`,
                [points, r.user_id]
            );
            granted++;
        }
        await recordJobExecution(jobName, true, `streak bonuses granted: ${granted}`);
        logJob(jobName, `granted to ${granted} users`);
    } catch (e: any) {
        await recordJobExecution(jobName, false, e.message);
        logJob(jobName, `error: ${e.message}`);
    }
}

// ============================================
// INICIALIZACIÓN
// ============================================

// ============================================
// JOB: RECORDATORIOS DE CLASE (24h y 2h antes)
// Corre cada 30 min; ventana de 40 min con dedup por (booking_id, reminder_type).
// ============================================
async function sendClassReminders(hoursAhead: number, reminderType: '24h' | '2h'): Promise<void> {
    const jobName = `REMINDERS_${reminderType.toUpperCase()}`;
    try {
        // Reservas confirmadas cuya clase empieza dentro de [ahora+H, ahora+H+40min)
        // en hora local del estudio, que aún no recibieron este recordatorio y cuyo
        // dueño no desactivó los recordatorios.
        const rows = await query<{
            booking_id: string;
            user_id: string;
            display_name: string;
            phone: string | null;
            class_name: string;
            start_time: string;
        }>(`
            SELECT b.id AS booking_id, u.id AS user_id, u.display_name, u.phone,
                   ct.name AS class_name, c.start_time
            FROM bookings b
            JOIN classes c ON c.id = b.class_id
            JOIN class_types ct ON ct.id = c.class_type_id
            JOIN users u ON u.id = b.user_id
            WHERE b.status = 'confirmed'
              AND c.status NOT IN ('cancelled', 'completed')
              AND COALESCE(u.receive_reminders, true) = true
              AND (c.date + c.start_time) >= (NOW() AT TIME ZONE 'America/Mexico_City') + make_interval(hours => $1::int)
              AND (c.date + c.start_time) <  (NOW() AT TIME ZONE 'America/Mexico_City') + make_interval(hours => $1::int) + interval '40 minutes'
              AND NOT EXISTS (
                  SELECT 1 FROM booking_reminders br
                  WHERE br.booking_id = b.id AND br.reminder_type = $2
              )
              -- Tepa: sin recordatorios de clase (regla por sucursal de la dueña: a las clientas de
              -- Tepa solo se les avisa de reserva confirmada, cancelación y cambio de coach).
              AND NOT EXISTS (
                  SELECT 1 FROM facilities f WHERE f.id = c.facility_id AND f.name ILIKE '%Tepa%'
              )
        `, [hoursAhead, reminderType]);

        for (const r of rows) {
            try {
                const timeStr = String(r.start_time).substring(0, 5);
                const whenLabel = reminderType === '24h' ? 'mañana' : 'en 2 horas';
                const body = `Tu clase de ${r.class_name} es ${whenLabel} a las ${timeStr}. ¡Te esperamos!`;

                await writeInAppNotification({
                    userId: r.user_id,
                    title: 'Recordatorio de clase',
                    body,
                    type: 'booking_reminder',
                    data: { booking_id: r.booking_id, reminder_type: reminderType },
                });

                // WhatsApp de recordatorio de clase DESACTIVADO (política 2026-06-23:
                // solo 3 mensajes por WhatsApp). El recordatorio in-app se mantiene.

                // Marca el recordatorio como enviado (idempotente).
                await query(
                    `INSERT INTO booking_reminders (booking_id, reminder_type) VALUES ($1, $2)
                     ON CONFLICT (booking_id, reminder_type) DO NOTHING`,
                    [r.booking_id, reminderType]
                );
            } catch (err) {
                logError(jobName, `Error con booking ${r.booking_id}: ${err}`);
            }
        }

        if (rows.length > 0) logJob(jobName, `Enviados ${rows.length} recordatorios ${reminderType}`);
        await recordJobExecution(jobName, true);
    } catch (error) {
        logError(jobName, error);
        await recordJobExecution(jobName, false, String(error));
    }
}

export function initializeCronJobs(): void {
    console.log('\n⏰ Inicializando Cron Jobs...\n');

    // Crear tabla de logs si no existe
    query(`
        CREATE TABLE IF NOT EXISTS cron_job_logs (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            job_name VARCHAR(100) NOT NULL,
            success BOOLEAN NOT NULL,
            details TEXT,
            executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS booking_reminders (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
            reminder_type VARCHAR(20) NOT NULL,
            sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(booking_id, reminder_type)
        );

        CREATE TABLE IF NOT EXISTS expiry_notifications (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
            days_before INTEGER NOT NULL,
            sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(membership_id, days_before)
        );
    `).catch(() => {
        // Tables might already exist
    });

    // ============================================
    // SCHEDULE DE JOBS
    // ============================================

    // 3:00 AM - Generar clases recurrentes (cada día)
    cron.schedule('0 3 * * *', generateRecurringClasses, {
        timezone: 'America/Mexico_City',
    });
    console.log('  ✅ GENERATE_CLASSES - Diario 3:00 AM');

    // Cada hora (:30) - Solicitar reseñas
    cron.schedule('30 * * * *', requestReviews, {
        timezone: 'America/Mexico_City',
    });
    console.log('  ✅ REQUEST_REVIEWS - Cada hora');

    // 10:00 AM - Alertas de membresías por vencer
    cron.schedule('0 10 * * *', notifyExpiringMemberships, {
        timezone: 'America/Mexico_City',
    });
    console.log('  ✅ EXPIRING_MEMBERSHIPS - Diario 10:00 AM');

    // 00:05 AM - Marcar membresías expiradas
    cron.schedule('5 0 * * *', markExpiredMemberships, {
        timezone: 'America/Mexico_City',
    });
    console.log('  ✅ MARK_EXPIRED - Diario 00:05 AM');

    // Cada 6 horas - Limpiar órdenes expiradas
    cron.schedule('0 */6 * * *', cleanupExpiredOrders, {
        timezone: 'America/Mexico_City',
    });
    console.log('  ✅ CLEANUP_ORDERS - Cada 6 horas');

    // Cada 30 min - Marcar no-shows y completar clases
    cron.schedule('5,35 * * * *', markNoShows, {
        timezone: 'America/Mexico_City',
    });
    console.log('  ✅ MARK_NO_SHOWS - Cada 30 min');

    cron.schedule('10,40 * * * *', autoCheckIn, {
        timezone: 'America/Mexico_City',
    });
    console.log('  ✅ AUTO_CHECK_IN - Cada 30 min');

    // 2:00 AM - Expirar solicitudes de reseña
    cron.schedule('0 2 * * *', expireReviewRequests, {
        timezone: 'America/Mexico_City',
    });
    console.log('  ✅ EXPIRE_REVIEWS - Diario 2:00 AM');

    // 9:00 AM - Birthday bonuses
    cron.schedule('0 9 * * *', birthdayBonus, { timezone: 'America/Mexico_City' });
    console.log('  ✅ BIRTHDAY_BONUS - Diario 9:00 AM');

    // 9:05 AM - Anniversary bonuses
    cron.schedule('5 9 * * *', anniversaryBonus, { timezone: 'America/Mexico_City' });
    console.log('  ✅ ANNIVERSARY_BONUS - Diario 9:05 AM');

    // Daily at 1:00 AM - Streak detection
    cron.schedule('0 1 * * *', streakBonus, { timezone: 'America/Mexico_City' });
    console.log('  ✅ STREAK_BONUS - Diario 1:00 AM');

    // Recordatorios de clase DESACTIVADOS (24h y 2h). Mientras las clientas sigan
    // reservando/cancelando en Fitune, las cancelaciones llegan tarde a BMB y se mandaba
    // "no olvides tu clase" para clases ya canceladas; además Fitune ya manda sus propios
    // avisos. sendClassReminders() queda disponible para reactivar cuando se corte Fitune.
    // cron.schedule('15,45 * * * *', () => { void sendClassReminders(24, '24h'); }, { timezone: 'America/Mexico_City' });
    // cron.schedule('15,45 * * * *', () => { void sendClassReminders(2, '2h'); }, { timezone: 'America/Mexico_City' });
    console.log('  ⏸️  CLASS_REMINDERS desactivados (transición Fitune)');

    console.log('\n⏰ Cron Jobs inicializados correctamente\n');
}

// ============================================
// EXPORTAR FUNCIONES PARA EJECUCIÓN MANUAL
// ============================================

export const cronJobs = {
    generateRecurringClasses,
    requestReviews,
    notifyExpiringMemberships,
    markExpiredMemberships,
    cleanupExpiredOrders,
    markNoShows,
    autoCheckIn,
    expireReviewRequests,
    birthdayBonus,
    anniversaryBonus,
    streakBonus,
    remind24h: () => sendClassReminders(24, '24h'),
    remind2h: () => sendClassReminders(2, '2h'),
};

export default initializeCronJobs;
