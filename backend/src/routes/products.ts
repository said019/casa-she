import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { query, queryOne } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { requireElevated } from '../middleware/elevation.js';
import { hasPermission } from '../lib/permissions.js';
import { logAction } from '../lib/audit.js';
import { resolveRequestFacility } from '../lib/requestFacility.js';
import { ImageStorageError, subirImagen } from '../lib/imageStorage.js';

const router = Router();
const PRODUCT_IMAGE_MAX_TRANSPORT_BYTES = 10 * 1024 * 1024;
// Cuando el request no trae Content-Length, este margen cubre los boundaries y
// headers multipart. Solo se admite una parte de archivo y cero campos de texto.
const PRODUCT_IMAGE_MAX_FILE_BYTES = PRODUCT_IMAGE_MAX_TRANSPORT_BYTES - 16 * 1024;

const productImageUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: PRODUCT_IMAGE_MAX_FILE_BYTES,
        fieldSize: 1024,
        files: 1,
        fields: 0,
        // Busboy alcanza el límite antes de procesar el cierre; 2 admite una
        // sola parte `image` y sigue rechazando cualquier parte adicional.
        parts: 2,
        fieldNameSize: 64,
        headerPairs: 16,
    },
});

function productImagePayloadTooLarge(res: Response, error = 'La carga multipart no debe superar 10 MB en total'): void {
    res.status(413).json({ error });
}

// Multer limita cada archivo, no el request completo. El header incluye el
// archivo, boundaries y cualquier parte adicional, así que se valida antes de
// que Multer reserve memoria. El límite de archivo conservador protege también
// requests chunked que no incluyen Content-Length.
function enforceProductImageTransportLimit(req: Request, res: Response, next: NextFunction): void {
    const rawContentLength = req.headers['content-length'];
    const contentLength = typeof rawContentLength === 'string' ? Number(rawContentLength) : NaN;
    if (Number.isSafeInteger(contentLength) && contentLength > PRODUCT_IMAGE_MAX_TRANSPORT_BYTES) {
        productImagePayloadTooLarge(res);
        return;
    }
    next();
}

function uploadProductImage(req: Request, res: Response, next: NextFunction): void {
    productImageUpload.single('image')(req, res, (error: unknown) => {
        if (res.headersSent) return;
        if (error instanceof multer.MulterError) {
            const payloadLimitCodes = new Set([
                'LIMIT_PART_COUNT',
                'LIMIT_FILE_SIZE',
                'LIMIT_FILE_COUNT',
                'LIMIT_FIELD_VALUE',
                'LIMIT_FIELD_COUNT',
            ]);
            if (payloadLimitCodes.has(error.code)) {
                productImagePayloadTooLarge(res, 'La imagen o sus partes superan el límite permitido de 10 MB');
                return;
            }
            res.status(400).json({ error: 'No se pudo procesar la imagen' });
            return;
        }
        if (error) {
            res.status(400).json({ error: 'No se pudo procesar la imagen' });
            return;
        }
        next();
    });
}

// GET /api/products - List products
router.get('/', authenticate, requireRole('admin', 'super_admin', 'reception'), async (req: Request, res: Response) => {
    try {
        const { search, category, active } = req.query;

        // Inventario por sucursal: recepción ve la suya; admin/master ven todas o filtran una (?facility_id).
        const scope = await resolveRequestFacility(req.user, (req.query.facility_id as string) || null);
        if (scope.kind === 'error') return res.status(scope.status).json({ error: scope.message });

        let queryStr = `
            SELECT p.*, pc.name as category_name, f.name as facility_name
            FROM products p
            LEFT JOIN product_categories pc ON p.category_id = pc.id
            LEFT JOIN facilities f ON f.id = p.facility_id
            WHERE 1=1
        `;
        const params: any[] = [];
        let paramCount = 0;

        if (scope.kind === 'facility') {
            paramCount++;
            queryStr += ` AND p.facility_id = $${paramCount}`;
            params.push(scope.facilityId);
        }

        if (active === 'true') {
            queryStr += ` AND p.is_active = true`;
        }

        if (search) {
            paramCount++;
            queryStr += ` AND (p.name ILIKE $${paramCount} OR p.sku ILIKE $${paramCount})`;
            params.push(`%${search}%`);
        }

        if (category && category !== 'all') {
            paramCount++;
            queryStr += ` AND p.category_id = $${paramCount}`;
            params.push(category);
        }

        queryStr += ` ORDER BY p.name ASC`;

        const products = await query(queryStr, params);
        res.json(products);
    } catch (error) {
        console.error('List products error:', error);
        res.status(500).json({ error: 'Error al obtener productos' });
    }
});

// GET /api/products/categories - List categories
router.get('/categories', authenticate, requireRole('admin', 'super_admin', 'reception'), async (req: Request, res: Response) => {
    try {
        const categories = await query(
            `SELECT * FROM product_categories WHERE is_active = true ORDER BY name ASC`
        );
        res.json(categories);
    } catch (error) {
        console.error('List categories error:', error);
        res.status(500).json({ error: 'Error al obtener categorías' });
    }
});

// POST /api/products/categories - Create category (admin, super_admin, reception)
router.post('/categories', authenticate, requirePermission('inventario'), async (req: Request, res: Response) => {
    try {
        const { name, description } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'El nombre de la categoría es requerido' });
        }

        const category = await queryOne(
            `INSERT INTO product_categories (name, description) VALUES ($1, $2) RETURNING *`,
            [name, description || null]
        );

        res.status(201).json(category);
    } catch (error) {
        console.error('Create category error:', error);
        res.status(500).json({ error: 'Error al crear categoría' });
    }
});

// POST /api/products - Create product (admin, super_admin, reception)
// Reception puede crear productos (precio inicial OK), pero NO modificar precio después (ver PUT).
router.post('/', authenticate, requirePermission('inventario'), async (req: Request, res: Response) => {
    try {
        const { name, price, cost, stock, sku, category_id, image_url, description } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'El nombre del producto es requerido' });
        }
        if (price === undefined || price === null) {
            return res.status(400).json({ error: 'El precio del producto es requerido' });
        }
        const parsedPrice = Number(price);
        const parsedCost = cost !== undefined ? Number(cost) : 0;
        const parsedStock = stock !== undefined ? Number(stock) : 0;
        if (isNaN(parsedPrice)) {
            return res.status(400).json({ error: 'El precio debe ser un número' });
        }
        if (isNaN(parsedStock)) {
            return res.status(400).json({ error: 'El stock debe ser un número' });
        }

        // Sucursal del producto: recepción → la suya; admin → la que elija (facility_id en el body).
        const scope = await resolveRequestFacility(req.user, req.body.facility_id || null);
        if (scope.kind === 'error') return res.status(scope.status).json({ error: scope.message });
        const facilityId = scope.kind === 'facility' ? scope.facilityId : (req.body.facility_id || null);
        if (!facilityId) {
            return res.status(400).json({ error: 'La sucursal del producto es requerida' });
        }

        const product = await queryOne(`
            INSERT INTO products (name, description, price, cost, stock, sku, category_id, image_url, facility_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `, [name, description || null, parsedPrice, parsedCost, parsedStock, sku || null, category_id || null, image_url || null, facilityId]);

        await logAction(query, {
            adminUserId: req.user!.userId,
            actionType: 'product_created',
            entityType: 'product',
            entityId: (product as { id: string }).id,
            description: `Producto creado por ${req.user!.role}: ${name}`,
            newData: { name, price: parsedPrice, cost: parsedCost, stock: parsedStock, sku, category_id },
            req,
        });

        res.status(201).json(product);
    } catch (error) {
        console.error('Create product error:', error);
        res.status(500).json({ error: 'Error al crear producto' });
    }
});

// PUT /api/products/:id - Update product (admin, super_admin, reception con restricciones)
// Recepción: NO puede tocar price, cost ni is_active (eso protege contra "descuentos amistosos"
// y desactivación accidental). Stock se ajusta vía endpoint dedicado (POST /:id/stock-adjust).
router.put('/:id', authenticate, requirePermission('inventario'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const role = req.user!.role;
        const allAllowed = ['name', 'description', 'price', 'cost', 'stock', 'sku', 'category_id', 'image_url', 'is_active', 'facility_id'] as const;
        const receptionBlocked = ['price', 'cost', 'is_active', 'facility_id'] as const;

        const meRow = await queryOne<{ role: string; permissions: unknown; is_reception_master: boolean }>(
            `SELECT role, permissions, is_reception_master FROM users WHERE id = $1`, [req.user!.userId]
        );
        const canEditPrice = hasPermission({ role: meRow?.role, permissions: meRow?.permissions, is_reception_master: meRow?.is_reception_master }, 'editar_productos_precio');

        if (!canEditPrice) {
            for (const f of receptionBlocked) {
                if (req.body[f] !== undefined) {
                    return res.status(403).json({
                        error: `Solo admin o reception master pueden modificar '${f}'.`,
                    });
                }
            }
        }

        const before = await queryOne<Record<string, unknown>>(
            'SELECT * FROM products WHERE id = $1', [id]
        );
        if (!before) return res.status(404).json({ error: 'Producto no encontrado' });

        // Recepción solo puede editar productos de su sucursal.
        const editScope = await resolveRequestFacility(req.user, (before.facility_id as string) || null);
        if (editScope.kind === 'error') return res.status(editScope.status).json({ error: editScope.message });

        const setClauses: string[] = [];
        const params: any[] = [];
        let paramCount = 0;

        for (const field of allAllowed) {
            if (req.body[field] !== undefined) {
                paramCount++;
                if (field === 'price' || field === 'cost' || field === 'stock') {
                    const num = Number(req.body[field]);
                    if (isNaN(num)) {
                        return res.status(400).json({ error: `${field} debe ser un número` });
                    }
                    setClauses.push(`${field} = $${paramCount}`);
                    params.push(num);
                } else {
                    setClauses.push(`${field} = $${paramCount}`);
                    params.push(req.body[field]);
                }
            }
        }

        if (setClauses.length === 0) {
            return res.status(400).json({ error: 'No se proporcionaron campos para actualizar' });
        }

        paramCount++;
        setClauses.push(`updated_at = NOW()`);
        params.push(id);

        const product = await queryOne<Record<string, unknown>>(
            `UPDATE products SET ${setClauses.join(', ')} WHERE id = $${paramCount} RETURNING *`,
            params
        );

        // Auditoría de cambios de precio/cost por cualquier rol (incluido admin).
        if (req.body.price !== undefined || req.body.cost !== undefined) {
            await logAction(query, {
                adminUserId: req.user!.userId,
                actionType: 'product_price_updated',
                entityType: 'product',
                entityId: id,
                description: `Precio/cost modificado por ${role}`,
                oldData: { price: before.price, cost: before.cost },
                newData: { price: product?.price, cost: product?.cost },
                req,
            });
        }

        res.json(product);
    } catch (error) {
        console.error('Update product error:', error);
        res.status(500).json({ error: 'Error al actualizar producto' });
    }
});

// POST /api/products/:id/image - Upload product image (multipart field: image)
router.post('/:id/image', authenticate, requirePermission('inventario'), enforceProductImageTransportLimit, uploadProductImage, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: 'Debes adjuntar una imagen' });
        }
        if (!file.mimetype.startsWith('image/')) {
            return res.status(400).json({ error: 'El archivo debe ser una imagen' });
        }

        const existing = await queryOne<{ id: string; facility_id: string | null }>(
            'SELECT id, facility_id FROM products WHERE id = $1',
            [id],
        );
        if (!existing) return res.status(404).json({ error: 'Producto no encontrado' });

        // Recepción solo puede subir fotos a productos de su sucursal.
        const scope = await resolveRequestFacility(req.user, existing.facility_id);
        if (scope.kind === 'error') return res.status(scope.status).json({ error: scope.message });

        let imageUrl: string;
        try {
            imageUrl = await subirImagen(file.buffer, file.mimetype, `product-${id}`);
        } catch (error) {
            if (error instanceof ImageStorageError) {
                if (error.code === 'INVALID_MIME_TYPE') {
                    return res.status(400).json({ error: 'El archivo debe ser una imagen' });
                }
                if (error.code === 'BASE64_TOO_LARGE') {
                    return res.status(413).json({ error: 'Imagen demasiado grande para almacenamiento local (máx 1MB sin Drive)' });
                }
            }
            throw error;
        }

        const product = await queryOne<Record<string, unknown>>(
            `UPDATE products
             SET image_url = $1, updated_at = NOW()
             WHERE id = $2
             RETURNING *`,
            [imageUrl, id],
        );
        if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

        res.json(product);
    } catch (error) {
        console.error('Upload product image error:', error);
        res.status(500).json({ error: 'Error al subir imagen del producto' });
    }
});

// POST /api/products/:id/stock-adjust - Ajuste explícito de inventario con auditoría.
// body: { delta: number, reason?: string }
// delta puede ser positivo (entrada) o negativo (salida/merma). Clamps stock >= 0.
router.post('/:id/stock-adjust', authenticate, requirePermission('inventario'),
    async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const deltaRaw = req.body?.delta;
            const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
            const delta = Number(deltaRaw);
            if (!Number.isFinite(delta) || !Number.isInteger(delta) || delta === 0) {
                return res.status(400).json({ error: 'delta debe ser un entero distinto de cero' });
            }

            const before = await queryOne<{ stock: number; name: string; facility_id: string | null }>(
                'SELECT stock, name, facility_id FROM products WHERE id = $1', [id]
            );
            if (!before) return res.status(404).json({ error: 'Producto no encontrado' });

            // Recepción solo ajusta stock de productos de su sucursal.
            const adjScope = await resolveRequestFacility(req.user, before.facility_id);
            if (adjScope.kind === 'error') return res.status(adjScope.status).json({ error: adjScope.message });

            const newStock = Math.max(0, Number(before.stock) + delta);

            const updated = await queryOne<{ id: string; stock: number }>(
                `UPDATE products SET stock = $1, updated_at = NOW() WHERE id = $2 RETURNING id, stock`,
                [newStock, id]
            );

            await logAction(query, {
                adminUserId: req.user!.userId,
                actionType: 'product_stock_adjusted',
                entityType: 'product',
                entityId: id,
                description: reason
                    ? `Stock ajustado ${delta > 0 ? '+' : ''}${delta} por ${req.user!.role}: ${reason}`
                    : `Stock ajustado ${delta > 0 ? '+' : ''}${delta} por ${req.user!.role}`,
                oldData: { stock: Number(before.stock), product_name: before.name },
                newData: { stock: newStock, delta, reason: reason || null },
                req,
            });

            res.json(updated);
        } catch (error) {
            console.error('Stock adjust error:', error);
            res.status(500).json({ error: 'Error al ajustar stock' });
        }
    }
);

// DELETE /api/products/:id - Soft delete product
// Borrar (soft-delete is_active=false): admin/super_admin Y recepción master (elevados).
// Recepción normal NO puede (la UI le dice "pídeselo a admin").
router.delete('/:id', authenticate, requireElevated, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        // Borrado REAL siempre (el dueño lo pidió: no solo desactivar). La FK
        // sale_items.product_id es ON DELETE SET NULL, así que las líneas de venta se desligan
        // solas y conservan product_name/cantidad/precio (el historial de ventas NO se pierde);
        // el producto se elimina de la base por completo.
        const deleted = await queryOne('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
        if (!deleted) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }
        res.json({ deleted: true, message: 'Producto eliminado definitivamente.' });
    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({ error: 'Error al eliminar producto' });
    }
});

export default router;
