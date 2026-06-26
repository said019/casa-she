import { Router, Request, Response } from 'express';
import { query } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// Búsqueda global de operación: usuarios, clases y pagos.
// Disponible para todo el staff de mostrador: admin, super_admin y recepción (todos
// los niveles). El frontend navega a las rutas del área correcta (/admin o /reception).
router.use(authenticate, requireRole('admin', 'super_admin', 'reception'));

// GET /api/search?q=<término>
// Devuelve hasta 5 coincidencias de cada tipo. q < 2 chars => resultados vacíos.
router.get('/', async (req: Request, res: Response) => {
    const q = (req.query.q as string | undefined)?.trim() ?? '';
    if (q.length < 2) {
        return res.json({ clients: [], classes: [], payments: [], reservas: [] });
    }
    const like = `%${q}%`;
    // Folio de reserva: secuencial numérico. Buscamos por los dígitos del término.
    const digits = q.replace(/\D/g, '');
    const folioNum = digits ? parseInt(digits, 10) : null;

    try {
        const [clients, classes, payments, reservas] = await Promise.all([
            // Clientas: nombre, email o teléfono
            query(
                `SELECT id, display_name, email, phone, photo_url
                 FROM users
                 WHERE role = 'client'
                   AND (display_name ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1)
                 ORDER BY display_name
                 LIMIT 5`,
                [like]
            ),
            // Clases: programa, instructor o fecha
            query(
                `SELECT c.id, c.date, c.start_time, c.status,
                        ct.name AS class_type_name, ct.color AS class_type_color,
                        i.display_name AS instructor_name,
                        f.name AS facility_name
                 FROM classes c
                 JOIN class_types ct ON c.class_type_id = ct.id
                 JOIN instructors i ON c.instructor_id = i.id
                 LEFT JOIN facilities f ON c.facility_id = f.id
                 WHERE ct.name ILIKE $1
                    OR i.display_name ILIKE $1
                    OR CAST(c.date AS TEXT) ILIKE $1
                 ORDER BY c.date DESC, c.start_time DESC
                 LIMIT 5`,
                [like]
            ),
            // Pagos: nombre/email del cliente, referencia o monto
            query(
                `SELECT p.id, p.amount, p.currency, p.payment_method, p.status,
                        COALESCE(p.completed_at, p.created_at) AS created_at,
                        u.id AS user_id, u.display_name AS user_name
                 FROM payments p
                 JOIN users u ON p.user_id = u.id
                 WHERE u.display_name ILIKE $1
                    OR u.email ILIKE $1
                    OR p.reference ILIKE $1
                    OR CAST(p.amount AS TEXT) ILIKE $1
                 ORDER BY COALESCE(p.completed_at, p.created_at) DESC
                 LIMIT 5`,
                [like]
            ),
            // Reservas: por folio (secuencial). Solo si el término tiene dígitos.
            folioNum !== null
                ? query(
                    `SELECT b.id, b.folio, b.status,
                            c.date AS class_date, c.start_time,
                            ct.name AS class_type_name,
                            u.id AS user_id, u.display_name AS user_name
                     FROM bookings b
                     JOIN classes c ON c.id = b.class_id
                     JOIN class_types ct ON c.class_type_id = ct.id
                     JOIN users u ON u.id = b.user_id
                     WHERE CAST(b.folio AS TEXT) ILIKE $1
                     ORDER BY b.folio DESC
                     LIMIT 5`,
                    [`%${folioNum}%`]
                )
                : Promise.resolve([]),
        ]);

        res.json({ clients, classes, payments, reservas });
    } catch (error) {
        console.error('GET /search error:', error);
        res.status(500).json({ error: 'Error en la búsqueda' });
    }
});

export default router;
