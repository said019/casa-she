import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { query, queryOne } from '../config/database.js';

const router = Router();

/**
 * GET /api/clients/:id/bitacora
 * Devuelve la actividad de la clienta agrupada por período de membresía:
 * asistencias, cancelaciones y ajustes de créditos.
 * Permiso: toda la recepción + admin.
 */
router.get('/:id/bitacora', authenticate, requireRole('admin', 'super_admin', 'reception'), async (req: Request, res: Response) => {
    try {
        const { id: clientId } = req.params;

        // Verificar que el cliente existe
        const client = await queryOne<{ id: string }>('SELECT id FROM users WHERE id = $1', [clientId]);
        if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

        // Obtener todas las membresías del cliente, más reciente primero
        const memberships = await query<{
            id: string;
            plan_name: string;
            start_date: string | null;
            end_date: string | null;
            status: string;
        }>(
            `SELECT m.id, p.name as plan_name, m.start_date::text, m.end_date::text, m.status
             FROM memberships m
             JOIN plans p ON p.id = m.plan_id
             WHERE m.user_id = $1
             ORDER BY COALESCE(m.start_date, m.created_at) DESC`,
            [clientId]
        );

        const result = await Promise.all(memberships.map(async (m) => {
            // Asistencias (clases que asistió o tenía confirmadas/no_show)
            const asistencias = await query<{
                booking_id: string;
                class_name: string;
                class_date: string;
                class_time: string;
                facility_name: string | null;
                booked_at: string;
                booked_by_name: string | null;
                booked_by_role: string | null;
                checked_in_by_name: string | null;
                status: string;
                consumed_category: string | null;
            }>(
                `SELECT
                   b.id as booking_id,
                   ct.name as class_name,
                   c.date::text as class_date,
                   c.start_time as class_time,
                   f.name as facility_name,
                   b.created_at as booked_at,
                   bb.display_name as booked_by_name,
                   bb.role as booked_by_role,
                   cb.display_name as checked_in_by_name,
                   b.status,
                   b.consumed_category
                 FROM bookings b
                 JOIN classes c ON c.id = b.class_id
                 JOIN class_types ct ON ct.id = c.class_type_id
                 LEFT JOIN facilities f ON f.id = c.facility_id
                 LEFT JOIN users bb ON bb.id = b.booked_by
                 LEFT JOIN users cb ON cb.id = b.checked_in_by
                 WHERE (b.membership_id = $1
                        OR (b.membership_id IS NULL AND b.user_id = $2
                            AND ($3::date IS NULL OR c.date >= $3::date)
                            AND ($4::date IS NULL OR c.date <= $4::date)))
                   AND b.status IN ('checked_in', 'confirmed', 'no_show')
                 ORDER BY c.date DESC, c.start_time DESC`,
                [m.id, clientId, m.start_date, m.end_date]
            );

            // Cancelaciones
            const cancelaciones = await query<{
                booking_id: string;
                class_name: string;
                class_date: string;
                class_time: string;
                facility_name: string | null;
                cancelled_at: string | null;
                cancelled_by_name: string | null;
                cancellation_reason: string | null;
                consumed_category: string | null;
            }>(
                `SELECT
                   b.id as booking_id,
                   ct.name as class_name,
                   c.date::text as class_date,
                   c.start_time as class_time,
                   f.name as facility_name,
                   b.cancelled_at,
                   xb.display_name as cancelled_by_name,
                   b.cancellation_reason,
                   b.consumed_category
                 FROM bookings b
                 JOIN classes c ON c.id = b.class_id
                 JOIN class_types ct ON ct.id = c.class_type_id
                 LEFT JOIN facilities f ON f.id = c.facility_id
                 LEFT JOIN users xb ON xb.id = b.cancelled_by
                 WHERE (b.membership_id = $1
                        OR (b.membership_id IS NULL AND b.user_id = $2
                            AND ($3::date IS NULL OR c.date >= $3::date)
                            AND ($4::date IS NULL OR c.date <= $4::date)))
                   AND b.status = 'cancelled'
                 ORDER BY b.cancelled_at DESC NULLS LAST`,
                [m.id, clientId, m.start_date, m.end_date]
            );

            // Ajustes de créditos (de admin_actions)
            const ajustes = await query<{
                id: string;
                description: string;
                old_data: Record<string, unknown>;
                new_data: Record<string, unknown>;
                admin_name: string | null;
                created_at: string;
            }>(
                `SELECT
                   a.id,
                   a.description,
                   a.old_data,
                   a.new_data,
                   u.display_name as admin_name,
                   a.created_at
                 FROM admin_actions a
                 LEFT JOIN users u ON u.id = a.admin_user_id
                 WHERE a.entity_type = 'membership'
                   AND a.entity_id = $1
                   AND a.action_type = 'credits_modified'
                 ORDER BY a.created_at DESC`,
                [m.id]
            );

            return {
                membership: {
                    id: m.id,
                    plan_name: m.plan_name,
                    start_date: m.start_date,
                    end_date: m.end_date,
                    status: m.status,
                },
                asistencias,
                cancelaciones,
                ajustes_creditos: ajustes,
            };
        }));

        res.json(result);
    } catch (error) {
        console.error('bitacora error:', error);
        res.status(500).json({ error: 'Error al cargar bitácora' });
    }
});

export default router;
