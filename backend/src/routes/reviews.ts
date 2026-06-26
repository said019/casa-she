import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { query, queryOne } from '../config/database.js';
import { sendNewReviewNotification } from '../services/email.js';
import { writeInAppNotificationForInstructor } from '../lib/in-app-notifications.js';

const router = Router();

// ============================================
// SCHEMAS DE VALIDACIÓN
// ============================================

const CreateReviewSchema = z.object({
  bookingId: z.string().uuid(),
  overallRating: z.number().min(1).max(5),
  instructorRating: z.number().min(1).max(5).optional(),
  difficultyRating: z.number().min(1).max(5).optional(),
  ambianceRating: z.number().min(1).max(5).optional(),
  punctualityRating: z.number().min(1).max(5).optional(),
  comment: z.string().max(1000).optional(),
  tagIds: z.array(z.string().uuid()).max(10).optional(),
  isAnonymous: z.boolean().optional(),
  wouldRecommend: z.boolean().optional(),
  wouldRepeat: z.boolean().optional(),
});

const UpdateReviewSchema = z.object({
  overallRating: z.number().min(1).max(5).optional(),
  instructorRating: z.number().min(1).max(5).optional(),
  difficultyRating: z.number().min(1).max(5).optional(),
  ambianceRating: z.number().min(1).max(5).optional(),
  comment: z.string().max(1000).optional(),
  tagIds: z.array(z.string().uuid()).max(5).optional(),
  isAnonymous: z.boolean().optional(),
});

const CreateResponseSchema = z.object({
  reviewId: z.string().uuid(),
  responseType: z.enum(['thank_you', 'apology', 'explanation', 'offer', 'follow_up']),
  responseText: z.string().min(1).max(1000),
  isPublic: z.boolean().optional(),
  compensationOffered: z.string().optional(),
  compensationValue: z.number().optional(),
});

// ============================================
// ENDPOINTS PÚBLICOS / CLIENTE
// ============================================

/**
 * GET /api/reviews/pending
 * Obtener reseñas pendientes del usuario autenticado
 */
router.get('/pending', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const pending = await query<{
      booking_id: string;
      class_id: string;
      class_date: string;
      class_time: string;
      class_type: string;
      instructor_name: string;
      instructor_photo: string | null;
      request_sent_at: string | null;
    }>(
      `SELECT
         b.id as booking_id,
         c.id as class_id,
         c.date as class_date,
         c.start_time as class_time,
         ct.name as class_type,
         i.display_name as instructor_name,
         i.photo_url as instructor_photo,
         rr.sent_at as request_sent_at
       FROM bookings b
       JOIN classes c ON b.class_id = c.id
       JOIN class_types ct ON c.class_type_id = ct.id
       JOIN instructors i ON c.instructor_id = i.id
       LEFT JOIN reviews r ON b.id = r.booking_id
       LEFT JOIN review_requests rr ON b.id = rr.booking_id
       WHERE b.user_id = $1
         AND b.status = 'checked_in'
         AND r.id IS NULL
         AND (c.date + c.end_time)::timestamp < NOW()
         AND (c.date + c.end_time)::timestamp > NOW() - INTERVAL '7 days'
       ORDER BY c.date DESC, c.start_time DESC
       LIMIT 10`,
      [userId]
    );

    res.json({ pending });
  } catch (error) {
    console.error('Get pending reviews error:', error);
    res.status(500).json({ error: 'Error al obtener reseñas pendientes' });
  }
});

/**
 * GET /api/reviews/my
 * Obtener mis reseñas
 */
router.get('/my', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const { limit = 20, offset = 0 } = req.query;

    const reviews = await query<{
      id: string;
      overall_rating: number;
      instructor_rating: number | null;
      comment: string | null;
      status: string;
      is_anonymous: boolean;
      points_earned: number;
      created_at: string;
      class_date: string;
      class_type: string;
      instructor_name: string;
      has_response: boolean;
    }>(
      `SELECT
         r.id,
         r.overall_rating,
         r.instructor_rating,
         r.comment,
         r.status,
         r.is_anonymous,
         r.points_earned,
         r.created_at,
         c.date as class_date,
         ct.name as class_type,
         i.display_name as instructor_name,
         EXISTS(SELECT 1 FROM review_responses rr WHERE rr.review_id = r.id) as has_response
       FROM reviews r
       JOIN classes c ON r.class_id = c.id
       JOIN class_types ct ON c.class_type_id = ct.id
       JOIN instructors i ON r.instructor_id = i.id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, Number(limit), Number(offset)]
    );

    res.json({ reviews });
  } catch (error) {
    console.error('Get my reviews error:', error);
    res.status(500).json({ error: 'Error al obtener reseñas' });
  }
});

/**
 * POST /api/reviews
 * Crear una nueva reseña
 */
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const validation = CreateReviewSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: validation.error.flatten().fieldErrors,
      });
    }

    const {
      bookingId, overallRating, instructorRating, difficultyRating,
      ambianceRating, punctualityRating, comment, tagIds, isAnonymous,
      wouldRecommend, wouldRepeat
    } = validation.data;

    // Verificar que el booking existe y pertenece al usuario
    const booking = await queryOne<{
      id: string;
      user_id: string;
      class_id: string;
      instructor_id: string;
      status: string;
    }>(
      `SELECT b.id, b.user_id, b.class_id, c.instructor_id, b.status
       FROM bookings b
       JOIN classes c ON b.class_id = c.id
       WHERE b.id = $1`,
      [bookingId]
    );

    if (!booking) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    if (booking.user_id !== userId) {
      return res.status(403).json({ error: 'No puedes reseñar esta clase' });
    }

    if (booking.status !== 'checked_in') {
      return res.status(400).json({ error: 'Solo puedes reseñar clases a las que asististe' });
    }

    // Verificar que no exista ya una reseña
    const existingReview = await queryOne(
      `SELECT id FROM reviews WHERE booking_id = $1`,
      [bookingId]
    );

    if (existingReview) {
      return res.status(409).json({ error: 'Ya existe una reseña para esta clase' });
    }

    // Crear la reseña
    const review = await queryOne<{
      id: string;
      overall_rating: number;
      points_earned: number;
      created_at: string;
    }>(
      `INSERT INTO reviews (
         booking_id, user_id, class_id, instructor_id,
         overall_rating, instructor_rating, difficulty_rating, ambiance_rating, punctuality_rating,
         comment, is_anonymous, submitted_from,
         would_recommend, would_repeat
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id, overall_rating, points_earned, created_at`,
      [
        bookingId,
        userId,
        booking.class_id,
        booking.instructor_id,
        overallRating,
        instructorRating || null,
        difficultyRating || null,
        ambianceRating || null,
        punctualityRating || null,
        comment || null,
        isAnonymous || false,
        'app',
        wouldRecommend || null,
        wouldRepeat || null
      ]
    );

    // Bookkeeping post-guardado (NO crítico): la reseña YA se insertó arriba, así que
    // un fallo aquí no debe convertirse en 500 — si lo hiciera, la clienta vería
    // "Error al enviar" pese a que la reseña quedó guardada, y al reintentar chocaría
    // con el 409 "ya existe reseña". Lo aislamos en su propio try y devolvemos 201 igual.
    try {
      // Agregar tags si se proporcionaron
      if (tagIds && tagIds.length > 0 && review) {
        for (const tagId of tagIds) {
          await queryOne(
            `INSERT INTO review_tag_selections (review_id, tag_id) VALUES ($1, $2)
             ON CONFLICT (review_id, tag_id) DO NOTHING`,
            [review.id, tagId]
          );
        }
      }

      // Actualizar review_request si existe
      await queryOne(
        `UPDATE review_requests
         SET status = 'completed', review_id = $1, updated_at = NOW()
         WHERE booking_id = $2`,
        [review?.id, bookingId]
      );
    } catch (bookkeepingErr) {
      console.error('[reviews] bookkeeping post-guardado falló (la reseña ya quedó guardada):', bookkeepingErr);
    }

    // Notificación al coach por correo. Respeta is_anonymous (oculta nombre).
    // No bloquea la respuesta — try/catch independiente.
    try {
      const ctx = await queryOne<{
        coach_email: string | null; coach_name: string;
        class_name: string; class_date: string;
        client_name: string;
      }>(
        `SELECT i.email AS coach_email, i.display_name AS coach_name,
                ct.name AS class_name, c.date::text AS class_date,
                u.display_name AS client_name
         FROM classes c
         JOIN instructors i ON i.id = c.instructor_id
         JOIN class_types ct ON ct.id = c.class_type_id
         JOIN users u ON u.id = $1
         WHERE c.id = $2`,
        [userId, booking.class_id]
      );
      if (ctx?.coach_email) {
        await sendNewReviewNotification({
          to: ctx.coach_email,
          coachName: ctx.coach_name,
          clientName: ctx.client_name,
          isAnonymous: isAnonymous || false,
          overallRating,
          instructorRating: instructorRating || null,
          comment: comment || null,
          className: ctx.class_name,
          classDate: ctx.class_date,
        });
      }
      // Espejo in-app al coach (respeta is_anonymous).
      if (ctx) {
        const author = isAnonymous ? 'Una alumna' : ctx.client_name;
        await writeInAppNotificationForInstructor(booking.instructor_id, {
          type: 'review_received',
          title: 'Nueva reseña en tu perfil',
          body: `${author} te calificó con ${overallRating}/5 en ${ctx.class_name}.`,
          data: {
            review_id: review?.id,
            booking_id: bookingId,
            overall_rating: overallRating,
          },
        });
      }
    } catch (notifErr) {
      console.error('[notify] new review failed:', notifErr);
    }

    res.status(201).json({
      success: true,
      message: '¡Gracias por tu reseña!',
      review: {
        id: review?.id,
        overallRating: review?.overall_rating,
        pointsEarned: review?.points_earned || 0,
        createdAt: review?.created_at,
      },
    });
  } catch (error) {
    console.error('Create review error:', error);
    res.status(500).json({ error: 'Error al crear reseña' });
  }
});

/**
 * PUT /api/reviews/:id
 * Actualizar una reseña (solo el autor, dentro de 24 horas)
 */
router.put('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const { id } = req.params;

    const validation = UpdateReviewSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: validation.error.flatten().fieldErrors,
      });
    }

    // Verificar que la reseña existe y pertenece al usuario
    const review = await queryOne<{ id: string; user_id: string; created_at: string }>(
      `SELECT id, user_id, created_at FROM reviews WHERE id = $1`,
      [id]
    );

    if (!review) {
      return res.status(404).json({ error: 'Reseña no encontrada' });
    }

    if (review.user_id !== userId) {
      return res.status(403).json({ error: 'No puedes editar esta reseña' });
    }

    // Verificar que no hayan pasado más de 24 horas
    const createdAt = new Date(review.created_at);
    const now = new Date();
    const hoursDiff = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

    if (hoursDiff > 24) {
      return res.status(400).json({ error: 'Solo puedes editar reseñas dentro de las primeras 24 horas' });
    }

    const { overallRating, instructorRating, difficultyRating, ambianceRating, comment, tagIds, isAnonymous } = validation.data;

    // Construir query de actualización
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (overallRating !== undefined) {
      updates.push(`overall_rating = $${paramCount++}`);
      values.push(overallRating);
    }
    if (instructorRating !== undefined) {
      updates.push(`instructor_rating = $${paramCount++}`);
      values.push(instructorRating);
    }
    if (difficultyRating !== undefined) {
      updates.push(`difficulty_rating = $${paramCount++}`);
      values.push(difficultyRating);
    }
    if (ambianceRating !== undefined) {
      updates.push(`ambiance_rating = $${paramCount++}`);
      values.push(ambianceRating);
    }
    if (comment !== undefined) {
      updates.push(`comment = $${paramCount++}`);
      values.push(comment);
    }
    if (isAnonymous !== undefined) {
      updates.push(`is_anonymous = $${paramCount++}`);
      values.push(isAnonymous);
    }

    if (updates.length > 0) {
      values.push(id);
      await queryOne(
        `UPDATE reviews SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramCount}`,
        values
      );
    }

    // Actualizar tags si se proporcionaron
    if (tagIds !== undefined) {
      // Eliminar tags existentes
      await queryOne(`DELETE FROM review_tag_selections WHERE review_id = $1`, [id]);

      // Agregar nuevos tags
      for (const tagId of tagIds) {
        await queryOne(
          `INSERT INTO review_tag_selections (review_id, tag_id) VALUES ($1, $2)
           ON CONFLICT (review_id, tag_id) DO NOTHING`,
          [id, tagId]
        );
      }
    }

    res.json({ success: true, message: 'Reseña actualizada' });
  } catch (error) {
    console.error('Update review error:', error);
    res.status(500).json({ error: 'Error al actualizar reseña' });
  }
});

/**
 * DELETE /api/reviews/:id
 * Ocultar una reseña (el usuario puede ocultar su propia reseña)
 */
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const { id } = req.params;

    const review = await queryOne<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM reviews WHERE id = $1`,
      [id]
    );

    if (!review) {
      return res.status(404).json({ error: 'Reseña no encontrada' });
    }

    if (review.user_id !== userId) {
      return res.status(403).json({ error: 'No puedes ocultar esta reseña' });
    }

    await queryOne(
      `UPDATE reviews SET status = 'hidden', updated_at = NOW() WHERE id = $1`,
      [id]
    );

    res.json({ success: true, message: 'Reseña ocultada' });
  } catch (error) {
    console.error('Hide review error:', error);
    res.status(500).json({ error: 'Error al ocultar reseña' });
  }
});

/**
 * GET /api/reviews/tags
 * Obtener tags disponibles para reseñas
 */
router.get('/tags', async (_req: Request, res: Response) => {
  try {
    const tags = await query<{
      id: string;
      name: string;
      name_en: string | null;
      category: string;
      icon: string | null;
    }>(
      `SELECT id, name, name_en, category, icon
       FROM review_tags
       WHERE is_active = true
       ORDER BY sort_order, name`
    );

    // Agrupar por categoría
    const grouped = {
      positive: tags.filter(t => t.category === 'positive'),
      neutral: tags.filter(t => t.category === 'neutral'),
      negative: tags.filter(t => t.category === 'negative'),
    };

    res.json({ tags, grouped });
  } catch (error) {
    console.error('Get review tags error:', error);
    res.status(500).json({ error: 'Error al obtener tags' });
  }
});

// ============================================
// ENDPOINTS PÚBLICOS (SIN AUTH)
// ============================================

/**
 * GET /api/reviews/public
 * Obtener reseñas públicas (para mostrar en la página)
 */
router.get('/public', async (req: Request, res: Response) => {
  try {
    const { instructorId, limit = 10, minRating = 4 } = req.query;

    let whereClause = `r.status = 'published' AND r.overall_rating >= $1`;
    const params: any[] = [Number(minRating)];

    if (instructorId) {
      params.push(instructorId);
      whereClause += ` AND r.instructor_id = $${params.length}`;
    }

    params.push(Number(limit));

    const reviews = await query(
      `SELECT
         r.id,
         r.overall_rating,
         r.instructor_rating,
         r.comment,
         r.is_featured,
         r.created_at,
         CASE WHEN r.is_anonymous THEN 'Anónimo' ELSE u.display_name END as user_name,
         CASE WHEN r.is_anonymous THEN NULL ELSE u.photo_url END as user_photo,
         ct.name as class_type,
         i.display_name as instructor_name,
         (
           SELECT COALESCE(json_agg(json_build_object('name', rt.name, 'icon', rt.icon)), '[]'::json)
           FROM review_tag_selections rts
           JOIN review_tags rt ON rts.tag_id = rt.id
           WHERE rts.review_id = r.id
         ) as tags
       FROM reviews r
       JOIN users u ON r.user_id = u.id
       JOIN classes c ON r.class_id = c.id
       JOIN class_types ct ON c.class_type_id = ct.id
       JOIN instructors i ON r.instructor_id = i.id
       WHERE ${whereClause}
       ORDER BY r.is_featured DESC, r.created_at DESC
       LIMIT $${params.length}`,
      params
    );

    res.json({ reviews });
  } catch (error) {
    console.error('Get public reviews error:', error);
    res.status(500).json({ error: 'Error al obtener reseñas' });
  }
});

/**
 * GET /api/reviews/instructor/:instructorId/summary
 * Obtener resumen de reseñas de un instructor
 */
router.get('/instructor/:instructorId/summary', async (req: Request, res: Response) => {
  try {
    const { instructorId } = req.params;

    const summary = await queryOne<{
      total_reviews: string;
      avg_overall_rating: string;
      avg_instructor_rating: string;
      avg_ambiance_rating: string;
      avg_punctuality_rating: string;
      avg_difficulty_rating: string;
      five_star_count: string;
      four_star_count: string;
      three_star_count: string;
      low_rating_count: string;
      recommend_percent: string;
      repeat_percent: string;
      diff_easy: string;
      diff_medium: string;
      diff_hard: string;
    }>(
      `SELECT
         COUNT(*) as total_reviews,
         ROUND(AVG(overall_rating)::numeric, 2) as avg_overall_rating,
         ROUND(AVG(instructor_rating)::numeric, 2) as avg_instructor_rating,
         ROUND(AVG(ambiance_rating)::numeric, 2) as avg_ambiance_rating,
         ROUND(AVG(punctuality_rating)::numeric, 2) as avg_punctuality_rating,
         ROUND(AVG(difficulty_rating)::numeric, 2) as avg_difficulty_rating,
         COUNT(*) FILTER (WHERE overall_rating = 5) as five_star_count,
         COUNT(*) FILTER (WHERE overall_rating = 4) as four_star_count,
         COUNT(*) FILTER (WHERE overall_rating = 3) as three_star_count,
         COUNT(*) FILTER (WHERE overall_rating <= 2) as low_rating_count,
         ROUND((COUNT(*) FILTER (WHERE would_recommend = true))::numeric / NULLIF(COUNT(*), 0) * 100, 0) as recommend_percent,
         ROUND((COUNT(*) FILTER (WHERE would_repeat = true))::numeric / NULLIF(COUNT(*), 0) * 100, 0) as repeat_percent,
         COUNT(*) FILTER (WHERE difficulty_rating <= 2) as diff_easy,
         COUNT(*) FILTER (WHERE difficulty_rating = 3) as diff_medium,
         COUNT(*) FILTER (WHERE difficulty_rating >= 4) as diff_hard
       FROM reviews
       WHERE instructor_id = $1 AND status = 'published'`,
      [instructorId]
    );

    // Top tags del instructor
    const topTags = await query<{
      name: string;
      icon: string;
      count: string;
    }>(
      `SELECT rt.name, rt.icon, COUNT(*) as count
       FROM review_tag_selections rts
       JOIN review_tags rt ON rts.tag_id = rt.id
       JOIN reviews r ON rts.review_id = r.id
       WHERE r.instructor_id = $1 AND r.status = 'published' AND rt.category = 'positive'
       GROUP BY rt.id, rt.name, rt.icon
       ORDER BY count DESC
       LIMIT 5`,
      [instructorId]
    );

    res.json({
      summary: {
        totalReviews: parseInt(summary?.total_reviews || '0'),
        avgOverallRating: parseFloat(summary?.avg_overall_rating || '0'),
        avgInstructorRating: parseFloat(summary?.avg_instructor_rating || '0'),
        avgAmbianceRating: parseFloat(summary?.avg_ambiance_rating || '0'),
        avgPunctualityRating: parseFloat(summary?.avg_punctuality_rating || '0'),
        avgDifficultyRating: parseFloat(summary?.avg_difficulty_rating || '0'),
        stats: {
          recommendPercent: parseInt(summary?.recommend_percent || '0'),
          repeatPercent: parseInt(summary?.repeat_percent || '0'),
        },
        distribution: {
          fiveStar: parseInt(summary?.five_star_count || '0'),
          fourStar: parseInt(summary?.four_star_count || '0'),
          threeStar: parseInt(summary?.three_star_count || '0'),
          lowRating: parseInt(summary?.low_rating_count || '0'),
        },
        difficulty: {
          easy: parseInt(summary?.diff_easy || '0'),
          medium: parseInt(summary?.diff_medium || '0'),
          hard: parseInt(summary?.diff_hard || '0'),
        }
      },
      topTags: topTags.map(t => ({
        name: t.name,
        icon: t.icon,
        count: parseInt(t.count),
      })),
    });
  } catch (error) {
    console.error('Get instructor summary error:', error);
    res.status(500).json({ error: 'Error al obtener resumen' });
  }
});

// ============================================
// ENDPOINTS ADMIN
// ============================================

/**
 * GET /api/reviews/admin
 * Obtener todas las reseñas (admin)
 */
router.get('/admin', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { status, instructorId, minRating, maxRating, startDate, endDate, limit = 50, offset = 0 } = req.query;

    let whereClause = '1=1';
    const params: any[] = [];

    if (status) {
      params.push(status);
      whereClause += ` AND r.status = $${params.length}`;
    }

    if (instructorId) {
      params.push(instructorId);
      whereClause += ` AND r.instructor_id = $${params.length}`;
    }

    if (minRating) {
      params.push(Number(minRating));
      whereClause += ` AND r.overall_rating >= $${params.length}`;
    }

    if (maxRating) {
      params.push(Number(maxRating));
      whereClause += ` AND r.overall_rating <= $${params.length}`;
    }

    if (startDate) {
      params.push(startDate);
      whereClause += ` AND r.created_at >= $${params.length}`;
    }

    if (endDate) {
      params.push(endDate);
      whereClause += ` AND r.created_at <= $${params.length}`;
    }

    params.push(Number(limit), Number(offset));

    const reviews = await query(
      `SELECT
         r.*,
         u.display_name as user_name,
         u.email as user_email,
         ct.name as class_type,
         c.date as class_date,
         i.display_name as instructor_name,
         (
           SELECT json_agg(json_build_object('id', rt.id, 'name', rt.name, 'category', rt.category))
           FROM review_tag_selections rts
           JOIN review_tags rt ON rts.tag_id = rt.id
           WHERE rts.review_id = r.id
         ) as tags,
         (
           SELECT json_agg(json_build_object(
             'id', rr.id,
             'type', rr.response_type,
             'text', rr.response_text,
             'created_at', rr.created_at
           ) ORDER BY rr.created_at)
           FROM review_responses rr
           WHERE rr.review_id = r.id
         ) as responses
       FROM reviews r
       JOIN users u ON r.user_id = u.id
       JOIN classes c ON r.class_id = c.id
       JOIN class_types ct ON c.class_type_id = ct.id
       JOIN instructors i ON r.instructor_id = i.id
       WHERE ${whereClause}
       ORDER BY r.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    // Obtener conteo total
    const total = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM reviews r WHERE ${whereClause}`,
      params.slice(0, -2)
    );

    res.json({
      reviews,
      pagination: {
        total: parseInt(total?.count || '0'),
        limit: Number(limit),
        offset: Number(offset),
      },
    });
  } catch (error) {
    console.error('Get admin reviews error:', error);
    res.status(500).json({ error: 'Error al obtener reseñas' });
  }
});

/**
 * PUT /api/reviews/admin/:id/moderate
 * Moderar una reseña (admin)
 */
router.put('/admin/:id/moderate', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, flaggedReason } = req.body;

    if (!['published', 'hidden', 'flagged', 'removed'].includes(status)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    await queryOne(
      `UPDATE reviews
       SET status = $1,
           flagged_reason = $2,
           moderated_by = $3,
           moderated_at = NOW(),
           updated_at = NOW()
       WHERE id = $4`,
      [status, flaggedReason || null, req.user?.userId, id]
    );

    res.json({ success: true, message: 'Reseña moderada' });
  } catch (error) {
    console.error('Moderate review error:', error);
    res.status(500).json({ error: 'Error al moderar reseña' });
  }
});

/**
 * PUT /api/reviews/admin/:id/feature
 * Destacar una reseña (admin)
 */
router.put('/admin/:id/feature', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isFeatured } = req.body;

    await queryOne(
      `UPDATE reviews SET is_featured = $1, updated_at = NOW() WHERE id = $2`,
      [isFeatured, id]
    );

    res.json({ success: true, message: isFeatured ? 'Reseña destacada' : 'Reseña ya no destacada' });
  } catch (error) {
    console.error('Feature review error:', error);
    res.status(500).json({ error: 'Error al destacar reseña' });
  }
});

/**
 * POST /api/reviews/admin/respond
 * Responder a una reseña (admin)
 */
router.post('/admin/respond', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const validation = CreateResponseSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: validation.error.flatten().fieldErrors,
      });
    }

    const { reviewId, responseType, responseText, isPublic, compensationOffered, compensationValue } = validation.data;

    // Verificar que la reseña existe
    const review = await queryOne(`SELECT id FROM reviews WHERE id = $1`, [reviewId]);
    if (!review) {
      return res.status(404).json({ error: 'Reseña no encontrada' });
    }

    const response = await queryOne<{ id: string; created_at: string }>(
      `INSERT INTO review_responses (
         review_id, responded_by, response_type, response_text,
         is_public, compensation_offered, compensation_value
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, created_at`,
      [
        reviewId,
        req.user?.userId,
        responseType,
        responseText,
        isPublic ?? true,
        compensationOffered || null,
        compensationValue || null,
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Respuesta enviada',
      response: {
        id: response?.id,
        createdAt: response?.created_at,
      },
    });
  } catch (error) {
    console.error('Respond to review error:', error);
    res.status(500).json({ error: 'Error al responder' });
  }
});

/**
 * GET /api/reviews/admin/stats
 * Estadísticas de reseñas (admin)
 */
router.get('/admin/stats', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();

    // Estadísticas generales
    // Estadísticas generales
    const general = await queryOne<{
      total_reviews: string;
      avg_rating: string;
      response_rate: string;
      nps_score: string;
    }>(
      `SELECT
         COUNT(*) as total_reviews,
         ROUND(AVG(overall_rating)::numeric, 2) as avg_rating,
         ROUND(
           (COUNT(*) FILTER (WHERE EXISTS(SELECT 1 FROM review_responses rr WHERE rr.review_id = r.id)))::numeric /
           NULLIF(COUNT(*), 0) * 100, 1
         ) as response_rate,
         ROUND(
           (
             (COUNT(*) FILTER (WHERE overall_rating = 5))::numeric - 
             (COUNT(*) FILTER (WHERE overall_rating <= 3))::numeric
           ) / NULLIF(COUNT(*), 0) * 100, 0
         ) as nps_score
       FROM reviews r
       WHERE r.created_at BETWEEN $1 AND $2 AND r.status = 'published'`,
      [start, end]
    );

    // Tasa de conversión
    const conversion = await queryOne<{
      total_classes: string;
      total_reviews: string;
    }>(
      `SELECT
         COUNT(DISTINCT b.id) as total_classes,
         COUNT(DISTINCT r.id) as total_reviews
       FROM bookings b
       JOIN classes c ON b.class_id = c.id
       LEFT JOIN reviews r ON b.id = r.booking_id
       WHERE b.status = 'checked_in' AND c.date BETWEEN $1 AND $2`,
      [start, end]
    );

    // Por instructor
    const byInstructor = await query<{
      instructor_id: string;
      instructor_name: string;
      review_count: string;
      avg_rating: string;
    }>(
      `SELECT
         i.id as instructor_id,
         i.display_name as instructor_name,
         COUNT(*) as review_count,
         ROUND(AVG(r.overall_rating)::numeric, 2) as avg_rating
       FROM reviews r
       JOIN instructors i ON r.instructor_id = i.id
       WHERE r.created_at BETWEEN $1 AND $2 AND r.status = 'published'
       GROUP BY i.id, i.display_name
       ORDER BY avg_rating DESC`,
      [start, end]
    );

    // Top tags
    const topTags = await query<{
      tag_name: string;
      tag_icon: string;
      category: string;
      count: string;
    }>(
      `SELECT
         rt.name as tag_name,
         rt.icon as tag_icon,
         rt.category,
         COUNT(*) as count
       FROM review_tag_selections rts
       JOIN review_tags rt ON rts.tag_id = rt.id
       JOIN reviews r ON rts.review_id = r.id
       WHERE r.created_at BETWEEN $1 AND $2 AND r.status = 'published'
       GROUP BY rt.id, rt.name, rt.icon, rt.category
       ORDER BY count DESC
       LIMIT 15`,
      [start, end]
    );

    const totalClasses = parseInt(conversion?.total_classes || '0');
    const totalReviews = parseInt(conversion?.total_reviews || '0');

    res.json({
      period: { start, end },
      general: {
        totalReviews: parseInt(general?.total_reviews || '0'),
        avgRating: parseFloat(general?.avg_rating || '0'),
        responseRate: parseFloat(general?.response_rate || '0'),
        nps: parseInt(general?.nps_score || '0'),
        conversionRate: totalClasses > 0 ? Math.round((totalReviews / totalClasses) * 100) : 0,
      },
      byInstructor: byInstructor.map(i => ({
        instructorId: i.instructor_id,
        instructorName: i.instructor_name,
        reviewCount: parseInt(i.review_count),
        avgRating: parseFloat(i.avg_rating),
      })),
      topTags: topTags.map(t => ({
        name: t.tag_name,
        icon: t.tag_icon,
        category: t.category,
        count: parseInt(t.count),
      })),
    });
  } catch (error) {
    console.error('Get review stats error:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

/**
 * GET /api/reviews/admin/needs-attention
 * Reseñas que necesitan atención (bajas calificaciones sin respuesta)
 */
router.get('/admin/needs-attention', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const reviews = await query(
      `SELECT
         r.*,
         u.display_name as user_name,
         u.email as user_email,
         ct.name as class_type,
         c.date as class_date,
         i.display_name as instructor_name
       FROM reviews r
       JOIN users u ON r.user_id = u.id
       JOIN classes c ON r.class_id = c.id
       JOIN class_types ct ON c.class_type_id = ct.id
       JOIN instructors i ON r.instructor_id = i.id
       WHERE r.status = 'published'
         AND r.overall_rating <= 3
         AND NOT EXISTS (SELECT 1 FROM review_responses rr WHERE rr.review_id = r.id)
       ORDER BY r.overall_rating ASC, r.created_at DESC
       LIMIT 20`
    );

    res.json({ reviews });
  } catch (error) {
    console.error('Get needs attention reviews error:', error);
    res.status(500).json({ error: 'Error al obtener reseñas' });
  }
});

/**
 * GET /api/reviews/admin/tags
 * Obtener todos los tags (admin, incluye inactivos)
 */
router.get('/admin/tags', authenticate, requireRole('admin'), async (_req: Request, res: Response) => {
  try {
    const tags = await query(
      `SELECT id, name, name_en, category, icon, is_active, sort_order, created_at
       FROM review_tags
       ORDER BY sort_order, category, name`
    );
    res.json({ tags });
  } catch (error) {
    console.error('Get admin tags error:', error);
    res.status(500).json({ error: 'Error al obtener tags' });
  }
});

/**
 * POST /api/reviews/admin/tags
 * Crear un nuevo tag
 */
router.post('/admin/tags', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { name, name_en, category, icon } = req.body;
    if (!name || !category) {
      return res.status(400).json({ error: 'name y category son requeridos' });
    }
    const tag = await queryOne(
      `INSERT INTO review_tags (name, name_en, category, icon)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, name_en, category, icon, is_active, sort_order, created_at`,
      [name, name_en || null, category, icon || null]
    );
    res.status(201).json({ tag });
  } catch (error) {
    console.error('Create tag error:', error);
    res.status(500).json({ error: 'Error al crear tag' });
  }
});

/**
 * PUT /api/reviews/admin/tags/:id
 * Actualizar un tag
 */
router.put('/admin/tags/:id', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, name_en, category, icon, is_active, sort_order } = req.body;

    const updates: string[] = [];
    const values: any[] = [];
    let p = 1;

    if (name !== undefined) { updates.push(`name = $${p++}`); values.push(name); }
    if (name_en !== undefined) { updates.push(`name_en = $${p++}`); values.push(name_en); }
    if (category !== undefined) { updates.push(`category = $${p++}`); values.push(category); }
    if (icon !== undefined) { updates.push(`icon = $${p++}`); values.push(icon); }
    if (is_active !== undefined) { updates.push(`is_active = $${p++}`); values.push(is_active); }
    if (sort_order !== undefined) { updates.push(`sort_order = $${p++}`); values.push(sort_order); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay datos para actualizar' });
    }

    values.push(id);
    const tag = await queryOne(
      `UPDATE review_tags SET ${updates.join(', ')} WHERE id = $${p}
       RETURNING id, name, name_en, category, icon, is_active, sort_order, created_at`,
      values
    );

    if (!tag) return res.status(404).json({ error: 'Tag no encontrado' });
    res.json({ tag });
  } catch (error) {
    console.error('Update tag error:', error);
    res.status(500).json({ error: 'Error al actualizar tag' });
  }
});

/**
 * DELETE /api/reviews/admin/tags/:id
 * Eliminar un tag (soft delete si está en uso)
 */
router.delete('/admin/tags/:id', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const inUse = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM review_tag_selections WHERE tag_id = $1`,
      [id]
    );

    if (parseInt(inUse?.count || '0') > 0) {
      await queryOne(
        `UPDATE review_tags SET is_active = false WHERE id = $1`,
        [id]
      );
      return res.json({ message: 'Tag desactivado (está en uso por reseñas existentes)' });
    }

    await queryOne(`DELETE FROM review_tags WHERE id = $1`, [id]);
    res.json({ message: 'Tag eliminado' });
  } catch (error) {
    console.error('Delete tag error:', error);
    res.status(500).json({ error: 'Error al eliminar tag' });
  }
});

/**
 * GET /api/reviews/admin/recent
 * Reseñas recientes (admin)
 */
router.get('/admin/recent', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { limit = 20 } = req.query;

    const reviews = await query(
      `SELECT
         r.id,
         r.overall_rating as "overallRating",
         r.comment,
         r.is_anonymous as "isAnonymous",
         r.created_at as "createdAt",
         CASE WHEN r.is_anonymous THEN NULL ELSE u.display_name END as "userName",
         CASE WHEN r.is_anonymous THEN NULL ELSE u.email END as "userEmail",
         ct.name as "className",
         i.display_name as "instructorName",
         c.date as "classDate"
       FROM reviews r
       JOIN users u ON r.user_id = u.id
       JOIN classes c ON r.class_id = c.id
       JOIN class_types ct ON c.class_type_id = ct.id
       JOIN instructors i ON r.instructor_id = i.id
       WHERE r.status IN ('published', 'pending')
       ORDER BY r.created_at DESC
       LIMIT $1`,
      [Number(limit)]
    );

    res.json(reviews);
  } catch (error) {
    console.error('Get recent reviews error:', error);
    res.status(500).json({ error: 'Error al obtener reseñas recientes' });
  }
});

export default router;
