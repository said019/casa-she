import jwt from 'jsonwebtoken';
import { JwtPayload } from '../types/auth.js';

/**
 * Verifica un JWT de SESIÓN. Los tokens de un solo propósito (reset de contraseña,
 * magic-link de coach, y cualquiera que se agregue después) llevan la clave `purpose`
 * y NO pueden usarse como sesión: antes, el token de reset ({ userId, purpose: 'reset' })
 * entraba a cualquier ruta protegida durante su hora de vida.
 *
 * Lanza jwt.TokenExpiredError si expiró (el middleware lo traduce a "Sesión expirada")
 * y jwt.JsonWebTokenError en cualquier otro rechazo ("Token inválido").
 */
export function decodeSessionToken(token: string, secret: string): JwtPayload {
    const decoded = jwt.verify(token, secret);
    if (typeof decoded !== 'object' || decoded === null) {
        throw new jwt.JsonWebTokenError('token de sesión con formato inválido');
    }
    if (Object.prototype.hasOwnProperty.call(decoded, 'purpose')) {
        throw new jwt.JsonWebTokenError('token de un solo propósito, no es de sesión');
    }
    const userId = (decoded as Record<string, unknown>).userId;
    if (typeof userId !== 'string' || userId.length === 0) {
        throw new jwt.JsonWebTokenError('token de sesión sin userId');
    }
    return decoded as unknown as JwtPayload;
}
