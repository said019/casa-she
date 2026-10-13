import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { consultarAviso } from '../lib/paymentNoticeClient.js';
export const isNoticeAdmin = (role?: string) => role === 'admin' || role === 'super_admin';
const router = Router();
router.get('/platform-payment-notice', authenticate, async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    // authenticate reloads the real account role from PostgreSQL. Reception's
    // operational admin alias must never grant access to payment notices.
    if (!isNoticeAdmin(req.user?.accountRole)) return res.status(403).json({ error: 'Acceso restringido' });
    try {
        const aviso = await consultarAviso({ baseUrl: 'https://walletclub.com.mx', token: process.env.WALLET_CLUB_NOTICE_TOKEN });
        return res.json({ aviso });
    } catch { return res.json({ aviso: null }); }
});
export default router;
