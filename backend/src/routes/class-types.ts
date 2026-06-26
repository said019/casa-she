import { Router, Request, Response } from 'express';
import { query, queryOne } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { z } from 'zod';

const router = Router();

// Schema for Class Type validation
const ClassTypeSchema = z.object({
    name: z.string().min(2, 'El nombre es obligatorio'),
    description: z.string().optional(),
    level: z.enum(['beginner', 'intermediate', 'advanced', 'all']).default('all'),
    durationMinutes: z.number().int().positive('La duración debe ser positiva'),
    maxCapacity: z.number().int().positive('La capacidad debe ser positiva'),
    icon: z.string().optional(),
    color: z.string().regex(/^#[0-9A-F]{6}$/i, 'Color inválido').optional(),
    isActive: z.boolean().default(true),
});

// Update schema
const ClassTypeUpdateSchema = ClassTypeSchema.partial();

// ============================================
// GET /api/class-types - List all class types (Public)
// ============================================
router.get('/', async (req: Request, res: Response) => {
    try {
        const { all } = req.query;

        let queryStr = `
      SELECT 
        id, name, description, level, duration_minutes, 
        max_capacity, icon, color, is_active
      FROM class_types
    `;

        if (all !== 'true') {
            queryStr += ` WHERE is_active = true`;
        }

        queryStr += ` ORDER BY name ASC`;

        const classTypes = await query(queryStr);
        res.json(classTypes);
    } catch (error) {
        console.error('List class types error:', error);
        res.status(500).json({ error: 'Error al obtener tipos de clase' });
    }
});

// ============================================
// POST /api/class-types - Create class type (Admin)
// ============================================
router.post('/', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const validation = ClassTypeSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                error: 'Datos inválidos',
                details: validation.error.flatten().fieldErrors,
            });
        }

        const data = validation.data;

        const newType = await queryOne(
            `INSERT INTO class_types (
        name, description, level, duration_minutes, 
        max_capacity, icon, color, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
            [
                data.name,
                data.description,
                data.level,
                data.durationMinutes,
                data.maxCapacity,
                data.icon || 'dumbbell',
                data.color || '#333333',
                data.isActive,
            ]
        );

        res.status(201).json(newType);
    } catch (error) {
        console.error('Create class type error:', error);
        res.status(500).json({ error: 'Error al crear tipo de clase' });
    }
});

// ============================================
// PUT /api/class-types/:id - Update class type (Admin)
// ============================================
router.put('/:id', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const validation = ClassTypeUpdateSchema.safeParse(req.body);

        if (!validation.success) {
            return res.status(400).json({
                error: 'Datos inválidos',
                details: validation.error.flatten().fieldErrors,
            });
        }

        const data = validation.data;

        const existing = await queryOne('SELECT id FROM class_types WHERE id = $1', [id]);
        if (!existing) {
            return res.status(404).json({ error: 'Tipo de clase no encontrado' });
        }

        const updates: string[] = [];
        const values: any[] = [];
        let paramCount = 1;

        if (data.name !== undefined) {
            updates.push(`name = $${paramCount++}`);
            values.push(data.name);
        }
        if (data.description !== undefined) {
            updates.push(`description = $${paramCount++}`);
            values.push(data.description);
        }
        if (data.level !== undefined) {
            updates.push(`level = $${paramCount++}`);
            values.push(data.level);
        }
        if (data.durationMinutes !== undefined) {
            updates.push(`duration_minutes = $${paramCount++}`);
            values.push(data.durationMinutes);
        }
        if (data.maxCapacity !== undefined) {
            updates.push(`max_capacity = $${paramCount++}`);
            values.push(data.maxCapacity);
        }
        if (data.icon !== undefined) {
            updates.push(`icon = $${paramCount++}`);
            values.push(data.icon);
        }
        if (data.color !== undefined) {
            updates.push(`color = $${paramCount++}`);
            values.push(data.color);
        }
        if (data.isActive !== undefined) {
            updates.push(`is_active = $${paramCount++}`);
            values.push(data.isActive);
        }

        if (updates.length > 0) {
            values.push(id);
            const result = await queryOne(
                `UPDATE class_types SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
                values
            );
            return res.json(result);
        }

        res.json(existing);
    } catch (error) {
        console.error('Update class type error:', error);
        res.status(500).json({ error: 'Error al actualizar tipo de clase' });
    }
});

// ============================================
// DELETE /api/class-types/:id - Deactivate class type
// ============================================
router.delete('/:id', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const result = await queryOne(
            'UPDATE class_types SET is_active = false WHERE id = $1 RETURNING id',
            [id]
        );

        if (!result) {
            return res.status(404).json({ error: 'Tipo de clase no encontrado' });
        }

        res.json({ message: 'Tipo de clase desactivado exitosamente' });
    } catch (error) {
        console.error('Delete class type error:', error);
        res.status(500).json({ error: 'Error al eliminar tipo de clase' });
    }
});

export default router;
