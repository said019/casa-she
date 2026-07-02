import { Router, Request, Response } from 'express';
import { getEvolutionClient, getEvolutionState, updateEvolutionState } from '../lib/whatsapp-evolution.js';
import { getWhatsAppStatus, sendWhatsAppMessage } from '../lib/whatsapp.js';
import { WA_INSTANCES, instanceByKey, WA_PRIMARY_INSTANCE } from '../lib/whatsapp-instances.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// Admin, super_admin y recepción pueden gestionar/conectar el WhatsApp por sucursal.
router.use(authenticate);
router.use(requireRole('admin', 'super_admin', 'reception'));

// Resuelve la instancia (sucursal) desde ?instance= o body.instance ('san-miguel' | 'tepa').
// Sin parámetro → instancia principal (San Miguel).
function resolveInstance(req: Request): string {
    const key = (req.query.instance as string) || req.body?.instance;
    return key ? instanceByKey(key) : WA_PRIMARY_INSTANCE;
}

/**
 * GET /api/evolution/instances
 * Lista las instancias configuradas (una por sucursal) para el panel admin.
 */
router.get('/instances', async (_req: Request, res: Response) => {
    res.json({
        instances: WA_INSTANCES.map((i) => ({
            key: i.key,
            label: i.label,
            name: i.name,
            facilityName: i.facilityName,
            primary: i.primary,
        })),
    });
});

/**
 * GET /api/evolution/status?instance=san-miguel|tepa
 * Estado de conexión de una instancia (sucursal).
 */
router.get('/status', async (req: Request, res: Response) => {
    try {
        const instance = resolveInstance(req);
        const status = await getWhatsAppStatus(instance);
        const cachedState = getEvolutionState();

        res.json({
            ...status,
            instance,
            lastUpdated: cachedState.lastUpdated,
        });
    } catch (error: any) {
        console.error('[Evolution] Error getting status:', error);
        res.status(500).json({ error: 'Error obteniendo estado', details: error.message });
    }
});

/**
 * POST /api/evolution/connect  { instance? }
 * Inicia conexión y devuelve el QR de la instancia (sucursal).
 */
router.post('/connect', async (req: Request, res: Response) => {
    try {
        const instance = resolveInstance(req);
        const client = getEvolutionClient(instance);

        // Si la instancia no existe aún, crearla (con webhook) antes de conectar.
        const current = await client.getStatus();
        if (current.state === 'not_found') {
            const baseUrl = process.env.BASE_URL || process.env.BACKEND_URL;
            const webhookUrl = baseUrl && !baseUrl.includes('localhost')
                ? `${baseUrl}/api/evolution/webhook`
                : undefined;
            try {
                await client.createInstance(webhookUrl);
            } catch (e: any) {
                if (!(e.message?.includes('already exists') || e.response?.status === 409)) throw e;
            }
        } else if (current.connected) {
            return res.json({ success: true, message: 'Ya está conectado', instance, status: current });
        }

        const result = await client.connectInstance();
        res.json({
            success: true,
            instance,
            qrCode: result.base64, // Evolution devuelve base64; el frontend espera qrCode
            ...result,
        });
    } catch (error: any) {
        console.error('[Evolution] Error connecting:', error);
        res.status(500).json({ error: 'Error conectando WhatsApp', details: error.message });
    }
});

/**
 * POST /api/evolution/logout  { instance? }
 * Cierra sesión de una instancia (sucursal).
 */
router.post('/logout', async (req: Request, res: Response) => {
    try {
        const instance = resolveInstance(req);
        const client = getEvolutionClient(instance);
        await client.logout();
        updateEvolutionState({ connected: false, connectionState: 'logged_out', phoneNumber: undefined });
        res.json({ success: true, instance, message: 'Sesión cerrada correctamente' });
    } catch (error: any) {
        console.error('[Evolution] Error logging out:', error);
        res.status(500).json({ error: 'Error cerrando sesión', details: error.message });
    }
});

/**
 * POST /api/evolution/test  { phone, message?, instance? }
 * Envía un mensaje de prueba desde la instancia (sucursal) indicada.
 */
router.post('/test', async (req: Request, res: Response) => {
    try {
        const { phone, message } = req.body;
        if (!phone) {
            return res.status(400).json({ error: 'Se requiere número de teléfono' });
        }
        const instance = resolveInstance(req);
        const testMessage = message || '🧘 Mensaje de prueba desde Casa Shé ✨';
        const success = await sendWhatsAppMessage(phone, testMessage, instance);

        if (success) {
            res.json({ success: true, instance, message: 'Mensaje enviado correctamente', phone });
        } else {
            res.status(500).json({ error: 'No se pudo enviar el mensaje' });
        }
    } catch (error: any) {
        console.error('[Evolution] Error sending test:', error);
        res.status(500).json({ error: 'Error enviando mensaje de prueba', details: error.message });
    }
});

/**
 * POST /api/evolution/create-instance  { instance? }
 * Crea la instancia (sucursal) si no existe.
 */
router.post('/create-instance', async (req: Request, res: Response) => {
    try {
        const instance = resolveInstance(req);
        const client = getEvolutionClient(instance);

        const status = await client.getStatus();
        if (status.state !== 'not_found') {
            return res.json({ success: true, instance, message: 'Instancia ya existe. Usa "Conectar" para el QR.', status });
        }

        const baseUrl = process.env.BASE_URL || process.env.BACKEND_URL;
        if (!baseUrl || baseUrl.includes('localhost')) {
            return res.status(400).json({
                error: 'BASE_URL no configurada',
                message: 'Configura BASE_URL con la URL de producción del backend (https://...railway.app)',
            });
        }
        const webhookUrl = `${baseUrl}/api/evolution/webhook`;
        const result = await client.createInstance(webhookUrl);
        res.json({ success: true, instance, message: 'Instancia creada correctamente', instanceName: result.instance?.instanceName });
    } catch (error: any) {
        if (error.message?.includes('already exists') || error.response?.status === 409) {
            return res.json({ success: true, message: 'Instancia ya existe' });
        }
        console.error('[Evolution] Error creating instance:', error);
        res.status(500).json({ error: 'Error creando instancia', details: error.message });
    }
});

/**
 * DELETE /api/evolution/delete-instance  { instance? }
 * Elimina la instancia (sucursal) — acción destructiva.
 */
router.delete('/delete-instance', async (req: Request, res: Response) => {
    try {
        const instance = resolveInstance(req);
        const client = getEvolutionClient(instance);
        await client.deleteInstance();
        updateEvolutionState({ connected: false, connectionState: 'deleted', phoneNumber: undefined });
        res.json({ success: true, instance, message: 'Instancia eliminada' });
    } catch (error: any) {
        console.error('[Evolution] Error deleting instance:', error);
        res.status(500).json({ error: 'Error eliminando instancia', details: error.message });
    }
});

/**
 * GET /api/evolution/info
 */
router.get('/info', async (_req: Request, res: Response) => {
    try {
        const baseUrl = process.env.BASE_URL || process.env.BACKEND_URL;
        const webhookUrl = baseUrl ? `${baseUrl}/api/evolution/webhook` : '✗ BASE_URL no configurada';
        res.json({
            provider: 'evolution',
            instances: WA_INSTANCES.map((i) => ({ key: i.key, name: i.name, primary: i.primary })),
            apiUrl: process.env.EVOLUTION_API_URL ? '✓ Configurado' : '✗ No configurado',
            apiKey: process.env.EVOLUTION_API_KEY ? '✓ Configurado' : '✗ No configurado',
            baseUrl: baseUrl ? '✓ Configurado' : '✗ No configurado',
            webhookUrl,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
