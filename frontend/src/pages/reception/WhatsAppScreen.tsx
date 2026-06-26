import { WhatsAppManager } from '@/components/admin/WhatsAppManager';

/**
 * Recepción: conectar / desconectar el WhatsApp de cada sucursal (escanear QR).
 * Reusa el mismo panel que el admin; el backend permite role 'reception'.
 */
export default function ReceptionWhatsAppScreen() {
    return <WhatsAppManager />;
}
