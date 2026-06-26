import { Router, Request, Response } from 'express';
import { query, queryOne } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// Get all facilities
router.get('/', authenticate, async (req: Request, res: Response) => {
    try {
        const facilities = await query(
            `SELECT * FROM facilities
             WHERE is_active = true
             ORDER BY sort_order, name`
        );
        res.json(facilities);
    } catch (error) {
        console.error('Error fetching facilities:', error);
        res.status(500).json({ error: 'Error al obtener salas' });
    }
});

// Public maps export — returns the 3 facilities with their reformer layouts
// so the studio can render screenshots for social media without auth.
router.get('/public/maps', async (_req: Request, res: Response) => {
    try {
        const facilities = await query<any>(
            `SELECT id, name, capacity, background_url, default_reformer_image_url,
                    front_position_x, front_position_y, map_notes
             FROM facilities WHERE is_active = true ORDER BY sort_order, name`
        );
        const reformers = await query<any>(
            `SELECT id, facility_id, number, label, position_x, position_y,
                    rotation, scale, image_url, COALESCE(spot_kind, 'reformer') as spot_kind
             FROM reformers WHERE is_active = true ORDER BY facility_id, number`
        );
        const grouped = facilities.map((f: any) => ({
            facility: f,
            reformers: reformers.filter((r: any) => r.facility_id === f.id),
        }));
        res.set('Cache-Control', 'public, max-age=60');
        res.json(grouped);
    } catch (error) {
        console.error('Error fetching public maps:', error);
        res.status(500).json({ error: 'Error al obtener mapas' });
    }
});

// Get single facility
router.get('/:id', authenticate, async (req: Request, res: Response) => {
    try {
        const facility = await queryOne(
            'SELECT * FROM facilities WHERE id = $1',
            [req.params.id]
        );

        if (!facility) {
            return res.status(404).json({ error: 'Sala no encontrada' });
        }

        res.json(facility);
    } catch (error) {
        console.error('Error fetching facility:', error);
        res.status(500).json({ error: 'Error al obtener sala' });
    }
});

// Create facility (Admin only)
router.post('/', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { name, description, capacity, equipment } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'El nombre es requerido' });
        }

        const facility = await queryOne(
            `INSERT INTO facilities (name, description, capacity, equipment)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [name, description || null, capacity || 12, JSON.stringify(equipment || [])]
        );

        res.status(201).json(facility);
    } catch (error) {
        console.error('Error creating facility:', error);
        res.status(500).json({ error: 'Error al crear sala' });
    }
});

// Update facility (Admin only)
router.put('/:id', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { name, description, capacity, equipment, is_active, sort_order } = req.body;

        const facility = await queryOne(
            `UPDATE facilities SET
                name = COALESCE($1, name),
                description = COALESCE($2, description),
                capacity = COALESCE($3, capacity),
                equipment = COALESCE($4, equipment),
                is_active = COALESCE($5, is_active),
                sort_order = COALESCE($6, sort_order),
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $7
             RETURNING *`,
            [
                name,
                description,
                capacity,
                equipment ? JSON.stringify(equipment) : null,
                is_active,
                sort_order,
                req.params.id
            ]
        );

        if (!facility) {
            return res.status(404).json({ error: 'Sala no encontrada' });
        }

        res.json(facility);
    } catch (error) {
        console.error('Error updating facility:', error);
        res.status(500).json({ error: 'Error al actualizar sala' });
    }
});

// Delete facility (Admin only)
router.delete('/:id', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        // Soft delete
        const facility = await queryOne(
            `UPDATE facilities SET is_active = false, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING *`,
            [req.params.id]
        );

        if (!facility) {
            return res.status(404).json({ error: 'Sala no encontrada' });
        }

        res.json({ message: 'Sala desactivada correctamente' });
    } catch (error) {
        console.error('Error deleting facility:', error);
        res.status(500).json({ error: 'Error al eliminar sala' });
    }
});

export default router;
