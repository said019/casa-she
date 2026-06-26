import { Router, Request, Response } from 'express';
import { query, queryOne } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// ── GET /api/reformers/by-class/:classId  (client authenticated) ──────────────

router.get('/by-class/:classId', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.userId;

        const classRow = await queryOne<any>(
            `SELECT c.id, c.facility_id,
                    f.name AS facility_name, f.background_url, f.map_notes,
                    f.default_reformer_image_url, f.front_position_x, f.front_position_y,
                    ct.spot_icon, ct.name AS class_type_name
             FROM classes c
             LEFT JOIN facilities f ON c.facility_id = f.id
             LEFT JOIN class_types ct ON c.class_type_id = ct.id
             WHERE c.id = $1`,
            [req.params.classId]
        );

        if (!classRow) return res.status(404).json({ error: 'Clase no encontrada' });

        if (!classRow.facility_id) {
            return res.json({ facility: null, reformers: [], message: 'Esta clase no tiene sala asignada' });
        }

        const reformers = await query<any>(
            `SELECT r.id, r.number, r.label,
                    r.position_x, r.position_y, r.rotation, r.scale, r.image_url,
                    br.id AS assignment_id,
                    b.user_id AS occupied_by_user_id,
                    u.display_name AS occupied_by_name
             FROM reformers r
             LEFT JOIN booking_reformers br ON br.reformer_id = r.id AND br.class_id = $1
             LEFT JOIN bookings b ON br.booking_id = b.id
             LEFT JOIN users u ON b.user_id = u.id
             WHERE r.facility_id = $2 AND r.is_active = true
             ORDER BY r.number ASC`,
            [req.params.classId, classRow.facility_id]
        );

        res.json({
            facility: {
                id: classRow.facility_id,
                name: classRow.facility_name,
                background_url: classRow.background_url,
                default_reformer_image_url: classRow.default_reformer_image_url,
                front_position_x: classRow.front_position_x != null ? Number(classRow.front_position_x) : 50,
                front_position_y: classRow.front_position_y != null ? Number(classRow.front_position_y) : 92,
                map_notes: classRow.map_notes,
            },
            class_type: {
                name: classRow.class_type_name,
                spot_icon: classRow.spot_icon || 'reformer',
            },
            reformers: reformers.map((r: any) => ({
                id: r.id,
                number: r.number,
                label: r.label,
                position_x: Number(r.position_x),
                position_y: Number(r.position_y),
                rotation: Number(r.rotation || 0),
                scale: Number(r.scale || 1),
                image_url: r.image_url,
                is_occupied: Boolean(r.assignment_id),
                is_mine: r.occupied_by_user_id === userId,
                occupied_by_name: r.occupied_by_user_id === userId ? null : r.occupied_by_name,
            })),
        });
    } catch (e: any) {
        console.error('[Reformers] GET /by-class:', e);
        res.status(500).json({ error: 'Error al obtener mapa de sala' });
    }
});

// ── GET /api/reformers?facility_id=  (admin/instructor) ──────────────────────

router.get('/', authenticate, requireRole('admin', 'super_admin', 'instructor'), async (req: Request, res: Response) => {
    try {
        const { facility_id } = req.query;
        let sql = `SELECT * FROM reformers WHERE is_active = true`;
        const params: any[] = [];
        if (facility_id) { sql += ` AND facility_id = $1`; params.push(facility_id); }
        sql += ` ORDER BY number ASC`;
        res.json(await query(sql, params));
    } catch (e: any) {
        console.error('[Reformers] GET /:', e);
        res.status(500).json({ error: 'Error al obtener reformers' });
    }
});

// ── POST /api/reformers/assign ────────────────────────────────────────────────

router.post('/assign', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.userId;
        const userRole = (req as any).user?.role;
        const { bookingId, reformerId } = req.body;
        if (!bookingId || !reformerId) return res.status(400).json({ error: 'bookingId y reformerId son requeridos' });

        const booking = await queryOne<any>(
            `SELECT b.id, b.user_id, b.status, b.class_id, c.facility_id, c.status AS class_status
             FROM bookings b JOIN classes c ON b.class_id = c.id WHERE b.id = $1`,
            [bookingId]
        );
        if (!booking) return res.status(404).json({ error: 'Reserva no encontrada' });
        if (booking.user_id !== userId && !['admin', 'super_admin'].includes(userRole))
            return res.status(403).json({ error: 'No puedes modificar esta reserva' });
        if (booking.status === 'cancelled') return res.status(400).json({ error: 'La reserva está cancelada' });
        if (booking.class_status === 'cancelled') return res.status(400).json({ error: 'La clase fue cancelada' });

        const reformer = await queryOne<any>(`SELECT id, facility_id, is_active FROM reformers WHERE id = $1`, [reformerId]);
        if (!reformer?.is_active) return res.status(404).json({ error: 'Lugar no disponible' });
        if (booking.facility_id && reformer.facility_id !== booking.facility_id)
            return res.status(400).json({ error: 'El lugar no pertenece a la sala de esta clase' });

        const existing = await queryOne<any>(`SELECT id, reformer_id FROM booking_reformers WHERE booking_id = $1`, [bookingId]);
        if (existing?.reformer_id === reformerId)
            return res.json({ message: 'Ya tenías este lugar asignado', reformerId });

        try {
            let assignment: any;
            let statusCode = 200;
            let message = 'Lugar actualizado';

            if (existing) {
                assignment = await queryOne(
                    `UPDATE booking_reformers SET reformer_id = $1, assigned_at = CURRENT_TIMESTAMP
                     WHERE booking_id = $2 RETURNING *`,
                    [reformerId, bookingId]
                );
            } else {
                assignment = await queryOne(
                    `INSERT INTO booking_reformers (booking_id, class_id, reformer_id) VALUES ($1, $2, $3) RETURNING *`,
                    [bookingId, booking.class_id, reformerId]
                );
                statusCode = 201; message = 'Lugar asignado';
            }

            return res.status(statusCode).json({ message, assignment });
        } catch (dbErr: any) {
            if (dbErr?.code === '23505')
                return res.status(409).json({ error: 'Alguien más acaba de tomar ese lugar. Elige otro.' });
            throw dbErr;
        }
    } catch (e: any) {
        console.error('[Reformers] POST /assign:', e);
        res.status(500).json({ error: 'Error al asignar lugar' });
    }
});

// ── DELETE /api/reformers/assign/:bookingId ───────────────────────────────────

router.delete('/assign/:bookingId', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.userId;
        const userRole = (req as any).user?.role;
        const booking = await queryOne<any>(`SELECT user_id FROM bookings WHERE id = $1`, [req.params.bookingId]);
        if (!booking) return res.status(404).json({ error: 'Reserva no encontrada' });
        if (booking.user_id !== userId && !['admin', 'super_admin'].includes(userRole))
            return res.status(403).json({ error: 'No puedes modificar esta reserva' });
        await query(`DELETE FROM booking_reformers WHERE booking_id = $1`, [req.params.bookingId]);
        res.json({ message: 'Lugar liberado' });
    } catch (e: any) {
        console.error('[Reformers] DELETE /assign:', e);
        res.status(500).json({ error: 'Error al liberar lugar' });
    }
});

// ── POST /api/reformers  (admin: create) ─────────────────────────────────────

router.post('/', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { facility_id, number, label, position_x, position_y, rotation, scale, image_url } = req.body;
        if (!facility_id || number == null || position_x == null || position_y == null)
            return res.status(400).json({ error: 'facility_id, number, position_x y position_y son requeridos' });

        const created = await queryOne(
            `INSERT INTO reformers (facility_id, number, label, position_x, position_y, rotation, scale, image_url)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [facility_id, number, label || null, position_x, position_y, rotation ?? 0, scale ?? 1.0, image_url || null]
        );
        res.status(201).json(created);
    } catch (err: any) {
        if (err?.code === '23505') return res.status(409).json({ error: 'Ya existe un lugar con ese número en esta sala' });
        console.error('[Reformers] POST /:', err);
        res.status(500).json({ error: 'Error al crear lugar' });
    }
});

// ── PUT /api/reformers/:id  (admin: update) ───────────────────────────────────

router.put('/:id', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { number, label, position_x, position_y, rotation, scale, image_url, is_active } = req.body;
        const updated = await queryOne(
            `UPDATE reformers SET
               number = COALESCE($1, number), label = COALESCE($2, label),
               position_x = COALESCE($3, position_x), position_y = COALESCE($4, position_y),
               rotation = COALESCE($5, rotation), scale = COALESCE($6, scale),
               image_url = COALESCE($7, image_url), is_active = COALESCE($8, is_active),
               updated_at = CURRENT_TIMESTAMP
             WHERE id = $9 RETURNING *`,
            [number ?? null, label ?? null, position_x ?? null, position_y ?? null,
             rotation ?? null, scale ?? null, image_url ?? null, is_active ?? null, req.params.id]
        );
        if (!updated) return res.status(404).json({ error: 'Lugar no encontrado' });
        res.json(updated);
    } catch (e: any) {
        console.error('[Reformers] PUT /:id:', e);
        res.status(500).json({ error: 'Error al actualizar lugar' });
    }
});

// ── DELETE /api/reformers/:id  (admin: soft delete) ───────────────────────────

router.delete('/:id', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const updated = await queryOne(
            `UPDATE reformers SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id`,
            [req.params.id]
        );
        if (!updated) return res.status(404).json({ error: 'Lugar no encontrado' });
        res.json({ message: 'Lugar desactivado' });
    } catch (e: any) {
        console.error('[Reformers] DELETE /:id:', e);
        res.status(500).json({ error: 'Error al desactivar lugar' });
    }
});

// ── PUT /api/reformers/facility/:facilityId/layout  (admin) ──────────────────

router.put('/facility/:facilityId/layout', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { background_url, default_reformer_image_url, front_position_x, front_position_y, map_notes } = req.body;
        const updated = await queryOne(
            `UPDATE facilities SET
               background_url = COALESCE($1, background_url),
               default_reformer_image_url = COALESCE($2, default_reformer_image_url),
               front_position_x = COALESCE($3, front_position_x),
               front_position_y = COALESCE($4, front_position_y),
               map_notes = COALESCE($5, map_notes),
               updated_at = CURRENT_TIMESTAMP
             WHERE id = $6
             RETURNING id, name, background_url, default_reformer_image_url,
                       front_position_x, front_position_y, map_notes`,
            [background_url ?? null, default_reformer_image_url ?? null,
             front_position_x ?? null, front_position_y ?? null,
             map_notes ?? null, req.params.facilityId]
        );
        if (!updated) return res.status(404).json({ error: 'Sala no encontrada' });
        res.json(updated);
    } catch (e: any) {
        console.error('[Reformers] PUT /facility/:id/layout:', e);
        res.status(500).json({ error: 'Error al actualizar layout' });
    }
});

export default router;
