import { Router, Request, Response } from 'express';
import { query, queryOne } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { z } from 'zod';

const router = Router();

// ============================================
// Types
// ============================================
interface WorkoutTemplate {
    id: string;
    name: string;
    description: string | null;
    class_type_id: string | null;
    created_by: string;
    duration_minutes: number;
    difficulty: string;
    equipment_needed: string[];
    music_playlist_url: string | null;
    is_public: boolean;
    is_featured: boolean;
    uses_count: number;
    tags: string[];
    created_at: string;
    updated_at: string;
    // Joined fields
    class_type_name?: string;
    class_type_color?: string;
    creator_name?: string;
    creator_photo?: string;
    exercises_count?: number;
    is_favorite?: boolean;
}

interface WorkoutExercise {
    id: string;
    template_id: string;
    name: string;
    description: string | null;
    duration_seconds: number | null;
    reps: number | null;
    sets: number;
    rest_seconds: number;
    sort_order: number;
    section: string;
    video_url: string | null;
    image_url: string | null;
    notes: string | null;
}

// ============================================
// Validation Schemas
// ============================================
const CreateTemplateSchema = z.object({
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    classTypeId: z.string().uuid().optional(),
    durationMinutes: z.number().int().positive().default(50),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']).default('intermediate'),
    equipmentNeeded: z.array(z.string()).default([]),
    musicPlaylistUrl: z.string().url().optional().or(z.literal('')),
    isPublic: z.boolean().default(true),
    tags: z.array(z.string()).default([]),
    exercises: z.array(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        durationSeconds: z.number().int().positive().optional(),
        reps: z.number().int().positive().optional(),
        sets: z.number().int().positive().default(1),
        restSeconds: z.number().int().min(0).default(0),
        section: z.enum(['warm_up', 'main', 'cool_down']).default('main'),
        videoUrl: z.string().url().optional().or(z.literal('')),
        imageUrl: z.string().url().optional().or(z.literal('')),
        notes: z.string().optional(),
    })).optional(),
});

const UpdateTemplateSchema = CreateTemplateSchema.partial();

const ExerciseSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    durationSeconds: z.number().int().positive().optional(),
    reps: z.number().int().positive().optional(),
    sets: z.number().int().positive().default(1),
    restSeconds: z.number().int().min(0).default(0),
    section: z.enum(['warm_up', 'main', 'cool_down']).default('main'),
    videoUrl: z.string().url().optional().or(z.literal('')),
    imageUrl: z.string().url().optional().or(z.literal('')),
    notes: z.string().optional(),
});

// ============================================
// Helper: Get instructor ID from user
// ============================================
async function getInstructorId(userId: string): Promise<string | null> {
    const instructor = await queryOne<{ id: string }>(
        'SELECT id FROM instructors WHERE user_id = $1',
        [userId]
    );
    return instructor?.id || null;
}

// ============================================
// GET /api/workout-templates - List all public templates
// ============================================
router.get('/', authenticate, async (req: Request, res: Response) => {
    try {
        const { classType, difficulty, search, myTemplates, favorites, featured } = req.query;
        const instructorId = await getInstructorId(req.user!.userId);
        
        let whereClause = 'WHERE (wt.is_public = true';
        const params: any[] = [];
        let paramIndex = 1;

        // If instructor, also show their private templates
        if (instructorId) {
            whereClause += ` OR wt.created_by = $${paramIndex}`;
            params.push(instructorId);
            paramIndex++;
        }
        whereClause += ')';

        // Filter by class type
        if (classType) {
            whereClause += ` AND wt.class_type_id = $${paramIndex}`;
            params.push(classType);
            paramIndex++;
        }

        // Filter by difficulty
        if (difficulty) {
            whereClause += ` AND wt.difficulty = $${paramIndex}`;
            params.push(difficulty);
            paramIndex++;
        }

        // Filter by search term
        if (search) {
            whereClause += ` AND (wt.name ILIKE $${paramIndex} OR wt.description ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        // Filter my templates only
        if (myTemplates === 'true' && instructorId) {
            whereClause += ` AND wt.created_by = $${paramIndex}`;
            params.push(instructorId);
            paramIndex++;
        }

        // Filter featured
        if (featured === 'true') {
            whereClause += ' AND wt.is_featured = true';
        }

        // Filter favorites
        let favoritesJoin = '';
        if (favorites === 'true' && instructorId) {
            favoritesJoin = `INNER JOIN template_favorites tf_filter ON wt.id = tf_filter.template_id AND tf_filter.instructor_id = $${paramIndex}`;
            params.push(instructorId);
            paramIndex++;
        }

        const templates = await query<WorkoutTemplate>(
            `SELECT 
                wt.*,
                ct.name as class_type_name,
                ct.color as class_type_color,
                i.display_name as creator_name,
                i.photo_url as creator_photo,
                (SELECT COUNT(*) FROM workout_exercises we WHERE we.template_id = wt.id) as exercises_count,
                ${instructorId ? `EXISTS(SELECT 1 FROM template_favorites tf WHERE tf.template_id = wt.id AND tf.instructor_id = $1) as is_favorite` : 'false as is_favorite'}
            FROM workout_templates wt
            LEFT JOIN class_types ct ON wt.class_type_id = ct.id
            LEFT JOIN instructors i ON wt.created_by = i.id
            ${favoritesJoin}
            ${whereClause}
            ORDER BY wt.is_featured DESC, wt.uses_count DESC, wt.created_at DESC`,
            params
        );

        res.json(templates);
    } catch (error) {
        console.error('List templates error:', error);
        res.status(500).json({ error: 'Error al obtener plantillas' });
    }
});

// ============================================
// GET /api/workout-templates/:id - Get single template with exercises
// ============================================
router.get('/:id', authenticate, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const instructorId = await getInstructorId(req.user!.userId);

        const template = await queryOne<WorkoutTemplate>(
            `SELECT 
                wt.*,
                ct.name as class_type_name,
                ct.color as class_type_color,
                i.display_name as creator_name,
                i.photo_url as creator_photo,
                ${instructorId ? `EXISTS(SELECT 1 FROM template_favorites tf WHERE tf.template_id = wt.id AND tf.instructor_id = $2) as is_favorite` : 'false as is_favorite'}
            FROM workout_templates wt
            LEFT JOIN class_types ct ON wt.class_type_id = ct.id
            LEFT JOIN instructors i ON wt.created_by = i.id
            WHERE wt.id = $1`,
            instructorId ? [id, instructorId] : [id]
        );

        if (!template) {
            return res.status(404).json({ error: 'Plantilla no encontrada' });
        }

        // Check access
        if (!template.is_public && template.created_by !== instructorId) {
            return res.status(403).json({ error: 'No tienes acceso a esta plantilla' });
        }

        // Get exercises
        const exercises = await query<WorkoutExercise>(
            `SELECT * FROM workout_exercises 
             WHERE template_id = $1 
             ORDER BY section, sort_order`,
            [id]
        );

        res.json({ ...template, exercises });
    } catch (error) {
        console.error('Get template error:', error);
        res.status(500).json({ error: 'Error al obtener plantilla' });
    }
});

// ============================================
// POST /api/workout-templates - Create new template
// ============================================
router.post('/', authenticate, async (req: Request, res: Response) => {
    try {
        const instructorId = await getInstructorId(req.user!.userId);
        if (!instructorId) {
            return res.status(403).json({ error: 'Solo instructores pueden crear plantillas' });
        }

        const validation = CreateTemplateSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                error: 'Datos inválidos',
                details: validation.error.flatten().fieldErrors,
            });
        }

        const data = validation.data;

        // Create template
        const template = await queryOne<WorkoutTemplate>(
            `INSERT INTO workout_templates (
                name, description, class_type_id, created_by, duration_minutes,
                difficulty, equipment_needed, music_playlist_url, is_public, tags
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *`,
            [
                data.name,
                data.description || null,
                data.classTypeId || null,
                instructorId,
                data.durationMinutes,
                data.difficulty,
                JSON.stringify(data.equipmentNeeded),
                data.musicPlaylistUrl || null,
                data.isPublic,
                JSON.stringify(data.tags),
            ]
        );

        // Add exercises if provided
        if (data.exercises && data.exercises.length > 0) {
            for (let i = 0; i < data.exercises.length; i++) {
                const ex = data.exercises[i];
                await query(
                    `INSERT INTO workout_exercises (
                        template_id, name, description, duration_seconds, reps, sets,
                        rest_seconds, sort_order, section, video_url, image_url, notes
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                    [
                        template!.id,
                        ex.name,
                        ex.description || null,
                        ex.durationSeconds || null,
                        ex.reps || null,
                        ex.sets,
                        ex.restSeconds,
                        i,
                        ex.section,
                        ex.videoUrl || null,
                        ex.imageUrl || null,
                        ex.notes || null,
                    ]
                );
            }
        }

        res.status(201).json(template);
    } catch (error) {
        console.error('Create template error:', error);
        res.status(500).json({ error: 'Error al crear plantilla' });
    }
});

// ============================================
// PUT /api/workout-templates/:id - Update template
// ============================================
router.put('/:id', authenticate, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const instructorId = await getInstructorId(req.user!.userId);

        // Check ownership
        const existing = await queryOne<WorkoutTemplate>(
            'SELECT created_by FROM workout_templates WHERE id = $1',
            [id]
        );

        if (!existing) {
            return res.status(404).json({ error: 'Plantilla no encontrada' });
        }

        if (existing.created_by !== instructorId && req.user!.role !== 'admin') {
            return res.status(403).json({ error: 'Solo puedes editar tus propias plantillas' });
        }

        const validation = UpdateTemplateSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                error: 'Datos inválidos',
                details: validation.error.flatten().fieldErrors,
            });
        }

        const data = validation.data;

        // Build update query dynamically
        const updates: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        if (data.name !== undefined) {
            updates.push(`name = $${paramIndex++}`);
            params.push(data.name);
        }
        if (data.description !== undefined) {
            updates.push(`description = $${paramIndex++}`);
            params.push(data.description || null);
        }
        if (data.classTypeId !== undefined) {
            updates.push(`class_type_id = $${paramIndex++}`);
            params.push(data.classTypeId || null);
        }
        if (data.durationMinutes !== undefined) {
            updates.push(`duration_minutes = $${paramIndex++}`);
            params.push(data.durationMinutes);
        }
        if (data.difficulty !== undefined) {
            updates.push(`difficulty = $${paramIndex++}`);
            params.push(data.difficulty);
        }
        if (data.equipmentNeeded !== undefined) {
            updates.push(`equipment_needed = $${paramIndex++}`);
            params.push(JSON.stringify(data.equipmentNeeded));
        }
        if (data.musicPlaylistUrl !== undefined) {
            updates.push(`music_playlist_url = $${paramIndex++}`);
            params.push(data.musicPlaylistUrl || null);
        }
        if (data.isPublic !== undefined) {
            updates.push(`is_public = $${paramIndex++}`);
            params.push(data.isPublic);
        }
        if (data.tags !== undefined) {
            updates.push(`tags = $${paramIndex++}`);
            params.push(JSON.stringify(data.tags));
        }

        updates.push('updated_at = NOW()');
        params.push(id);

        const template = await queryOne<WorkoutTemplate>(
            `UPDATE workout_templates SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
            params
        );

        // Update exercises if provided
        if (data.exercises !== undefined) {
            // Delete existing exercises
            await query('DELETE FROM workout_exercises WHERE template_id = $1', [id]);

            // Insert new exercises
            for (let i = 0; i < data.exercises.length; i++) {
                const ex = data.exercises[i];
                await query(
                    `INSERT INTO workout_exercises (
                        template_id, name, description, duration_seconds, reps, sets,
                        rest_seconds, sort_order, section, video_url, image_url, notes
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                    [
                        id,
                        ex.name,
                        ex.description || null,
                        ex.durationSeconds || null,
                        ex.reps || null,
                        ex.sets,
                        ex.restSeconds,
                        i,
                        ex.section,
                        ex.videoUrl || null,
                        ex.imageUrl || null,
                        ex.notes || null,
                    ]
                );
            }
        }

        res.json(template);
    } catch (error) {
        console.error('Update template error:', error);
        res.status(500).json({ error: 'Error al actualizar plantilla' });
    }
});

// ============================================
// DELETE /api/workout-templates/:id - Delete template
// ============================================
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const instructorId = await getInstructorId(req.user!.userId);

        const existing = await queryOne<WorkoutTemplate>(
            'SELECT created_by FROM workout_templates WHERE id = $1',
            [id]
        );

        if (!existing) {
            return res.status(404).json({ error: 'Plantilla no encontrada' });
        }

        if (existing.created_by !== instructorId && req.user!.role !== 'admin') {
            return res.status(403).json({ error: 'Solo puedes eliminar tus propias plantillas' });
        }

        await query('DELETE FROM workout_templates WHERE id = $1', [id]);

        res.json({ message: 'Plantilla eliminada' });
    } catch (error) {
        console.error('Delete template error:', error);
        res.status(500).json({ error: 'Error al eliminar plantilla' });
    }
});

// ============================================
// POST /api/workout-templates/:id/favorite - Toggle favorite
// ============================================
router.post('/:id/favorite', authenticate, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const instructorId = await getInstructorId(req.user!.userId);

        if (!instructorId) {
            return res.status(403).json({ error: 'Solo instructores pueden marcar favoritos' });
        }

        // Check if already favorite
        const existing = await queryOne<{ id: string }>(
            'SELECT id FROM template_favorites WHERE template_id = $1 AND instructor_id = $2',
            [id, instructorId]
        );

        if (existing) {
            // Remove favorite
            await query(
                'DELETE FROM template_favorites WHERE template_id = $1 AND instructor_id = $2',
                [id, instructorId]
            );
            res.json({ is_favorite: false, message: 'Eliminado de favoritos' });
        } else {
            // Add favorite
            await query(
                'INSERT INTO template_favorites (template_id, instructor_id) VALUES ($1, $2)',
                [id, instructorId]
            );
            res.json({ is_favorite: true, message: 'Agregado a favoritos' });
        }
    } catch (error) {
        console.error('Toggle favorite error:', error);
        res.status(500).json({ error: 'Error al actualizar favorito' });
    }
});

// ============================================
// POST /api/workout-templates/:id/duplicate - Duplicate a template
// ============================================
router.post('/:id/duplicate', authenticate, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const instructorId = await getInstructorId(req.user!.userId);

        if (!instructorId) {
            return res.status(403).json({ error: 'Solo instructores pueden duplicar plantillas' });
        }

        // Get original template
        const original = await queryOne<WorkoutTemplate>(
            'SELECT * FROM workout_templates WHERE id = $1',
            [id]
        );

        if (!original) {
            return res.status(404).json({ error: 'Plantilla no encontrada' });
        }

        // Check access
        if (!original.is_public && original.created_by !== instructorId) {
            return res.status(403).json({ error: 'No tienes acceso a esta plantilla' });
        }

        // Create duplicate
        const newTemplate = await queryOne<WorkoutTemplate>(
            `INSERT INTO workout_templates (
                name, description, class_type_id, created_by, duration_minutes,
                difficulty, equipment_needed, music_playlist_url, is_public, tags
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *`,
            [
                `${original.name} (Copia)`,
                original.description,
                original.class_type_id,
                instructorId,
                original.duration_minutes,
                original.difficulty,
                JSON.stringify(original.equipment_needed),
                original.music_playlist_url,
                false, // New duplicates are private by default
                JSON.stringify(original.tags),
            ]
        );

        // Copy exercises
        const exercises = await query<WorkoutExercise>(
            'SELECT * FROM workout_exercises WHERE template_id = $1 ORDER BY sort_order',
            [id]
        );

        for (const ex of exercises) {
            await query(
                `INSERT INTO workout_exercises (
                    template_id, name, description, duration_seconds, reps, sets,
                    rest_seconds, sort_order, section, video_url, image_url, notes
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                [
                    newTemplate!.id,
                    ex.name,
                    ex.description,
                    ex.duration_seconds,
                    ex.reps,
                    ex.sets,
                    ex.rest_seconds,
                    ex.sort_order,
                    ex.section,
                    ex.video_url,
                    ex.image_url,
                    ex.notes,
                ]
            );
        }

        res.status(201).json(newTemplate);
    } catch (error) {
        console.error('Duplicate template error:', error);
        res.status(500).json({ error: 'Error al duplicar plantilla' });
    }
});

// ============================================
// POST /api/workout-templates/:id/assign-to-class - Assign to class
// ============================================
router.post('/:id/assign-to-class', authenticate, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { classId, notes } = req.body;
        const instructorId = await getInstructorId(req.user!.userId);

        if (!instructorId) {
            return res.status(403).json({ error: 'Solo instructores pueden asignar plantillas' });
        }

        if (!classId) {
            return res.status(400).json({ error: 'Se requiere el ID de la clase' });
        }

        // Check if class exists and instructor is assigned to it
        const classInfo = await queryOne<{ instructor_id: string }>(
            'SELECT instructor_id FROM classes WHERE id = $1',
            [classId]
        );

        if (!classInfo) {
            return res.status(404).json({ error: 'Clase no encontrada' });
        }

        if (classInfo.instructor_id !== instructorId && req.user!.role !== 'admin') {
            return res.status(403).json({ error: 'Solo puedes asignar plantillas a tus propias clases' });
        }

        // Check if already assigned (upsert)
        const existing = await queryOne<{ id: string }>(
            'SELECT id FROM class_workouts WHERE class_id = $1',
            [classId]
        );

        if (existing) {
            // Update existing
            await query(
                'UPDATE class_workouts SET template_id = $1, notes = $2 WHERE class_id = $3',
                [id, notes || null, classId]
            );
        } else {
            // Insert new
            await query(
                'INSERT INTO class_workouts (class_id, template_id, assigned_by, notes) VALUES ($1, $2, $3, $4)',
                [classId, id, instructorId, notes || null]
            );
        }

        res.json({ message: 'Plantilla asignada a la clase' });
    } catch (error) {
        console.error('Assign to class error:', error);
        res.status(500).json({ error: 'Error al asignar plantilla' });
    }
});

// ============================================
// GET /api/workout-templates/class/:classId - Get template for a class
// ============================================
router.get('/class/:classId', authenticate, async (req: Request, res: Response) => {
    try {
        const { classId } = req.params;

        const assignment = await queryOne<{ template_id: string; notes: string }>(
            'SELECT template_id, notes FROM class_workouts WHERE class_id = $1',
            [classId]
        );

        if (!assignment) {
            return res.json({ template: null });
        }

        // Get template with exercises
        const template = await queryOne<WorkoutTemplate>(
            `SELECT 
                wt.*,
                ct.name as class_type_name,
                ct.color as class_type_color,
                i.display_name as creator_name
            FROM workout_templates wt
            LEFT JOIN class_types ct ON wt.class_type_id = ct.id
            LEFT JOIN instructors i ON wt.created_by = i.id
            WHERE wt.id = $1`,
            [assignment.template_id]
        );

        const exercises = await query<WorkoutExercise>(
            'SELECT * FROM workout_exercises WHERE template_id = $1 ORDER BY section, sort_order',
            [assignment.template_id]
        );

        res.json({
            template: { ...template, exercises },
            notes: assignment.notes,
        });
    } catch (error) {
        console.error('Get class template error:', error);
        res.status(500).json({ error: 'Error al obtener plantilla de clase' });
    }
});

export default router;
