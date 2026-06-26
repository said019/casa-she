import { Router, Request, Response } from 'express';
import { updateEvolutionState, getEvolutionState } from '../lib/whatsapp-evolution.js';

const router = Router();

/**
 * POST /api/evolution/webhook
 * Webhook para recibir eventos de Evolution API
 * NO requiere autenticación (viene de Evolution API)
 */
router.post('/', async (req: Request, res: Response) => {
    try {
        const event = req.body;
        
        console.log('[Webhook Evolution] Evento recibido:', event.event || 'unknown');
        
        // Procesar según tipo de evento
        switch (event.event) {
            case 'qrcode.updated':
                handleQRCodeUpdate(event);
                break;
            
            case 'connection.update':
                handleConnectionUpdate(event);
                break;
            
            case 'messages.upsert':
                await handleIncomingMessage(event);
                break;
            
            case 'messages.update':
                handleMessageUpdate(event);
                break;
            
            case 'send.message':
                handleSendMessage(event);
                break;
            
            default:
                console.log('[Webhook Evolution] Evento no manejado:', event.event);
        }
        
        // Siempre responder 200 para que Evolution no reintente
        res.status(200).json({ received: true });
    } catch (error: any) {
        console.error('[Webhook Evolution] Error:', error);
        // Aun con error, responder 200 para evitar reintentos
        res.status(200).json({ received: true, error: error.message });
    }
});

/**
 * Handler: QR Code actualizado
 */
function handleQRCodeUpdate(event: any): void {
    const qrCode = event.data?.qrcode?.base64;
    
    if (qrCode) {
        console.log('[Webhook Evolution] QR Code actualizado');
        updateEvolutionState({
            qrCode: qrCode,
            connected: false,
            connectionState: 'qr_ready',
        });
    }
}

/**
 * Handler: Estado de conexión actualizado
 */
function handleConnectionUpdate(event: any): void {
    const state = event.data?.state;
    const instance = event.data?.instance;
    
    console.log('[Webhook Evolution] Connection update:', state);
    
    if (state === 'open') {
        // Conexión exitosa
        const phoneNumber = event.data?.me?.id || event.data?.ownerJid;
        
        updateEvolutionState({
            connected: true,
            connectionState: 'connected',
            qrCode: null, // Limpiar QR una vez conectado
            phoneNumber: phoneNumber?.split('@')[0] || undefined,
        });
        
        console.log('[Webhook Evolution] ✅ WhatsApp conectado:', phoneNumber);
    } else if (state === 'close') {
        // Desconexión
        updateEvolutionState({
            connected: false,
            connectionState: 'disconnected',
        });
        
        console.log('[Webhook Evolution] ❌ WhatsApp desconectado');
    } else if (state === 'connecting') {
        updateEvolutionState({
            connected: false,
            connectionState: 'connecting',
        });
        
        console.log('[Webhook Evolution] 🔄 Conectando...');
    }
}

/**
 * Handler: Mensaje entrante
 */
async function handleIncomingMessage(event: any): Promise<void> {
    const messages = event.data || [];
    
    for (const msg of messages) {
        // Ignorar mensajes propios
        if (msg.key?.fromMe) {
            continue;
        }
        
        const from = msg.key?.remoteJid;
        const type = getMessageType(msg.message);
        const content = extractMessageContent(msg.message);
        
        console.log('[Webhook Evolution] 📨 Mensaje de:', from);
        console.log('[Webhook Evolution]    Tipo:', type);
        console.log('[Webhook Evolution]    Contenido:', content?.substring(0, 100));
        
        // Procesar según tipo de mensaje
        if (type === 'pollUpdateMessage') {
            // Respuesta a una encuesta/poll
            await handlePollResponse(msg);
        } else if (type === 'conversation' || type === 'extendedTextMessage') {
            // Mensaje de texto normal
            await handleTextMessage(from, content, msg);
        }
        
        // TODO: Aquí puedes agregar más lógica como:
        // - Guardar en base de datos
        // - Enviar respuesta automática
        // - Notificar al admin
    }
}

/**
 * Procesar respuesta a Poll/Encuesta
 */
async function handlePollResponse(msg: any): Promise<void> {
    try {
        const pollUpdateMessage = msg.message?.pollUpdateMessage;
        const selectedOptions = pollUpdateMessage?.pollCreationMessageKey;
        const vote = pollUpdateMessage?.vote;
        
        if (vote) {
            // Decodificar la opción seleccionada
            const selectedOption = vote.selectedOptions?.[0];
            const from = msg.key?.remoteJid?.split('@')[0];
            
            console.log('[Webhook Evolution] 📊 Respuesta Poll de:', from);
            console.log('[Webhook Evolution]    Opción:', selectedOption);
            
            // TODO: Procesar la respuesta según la opción seleccionada
            // Ejemplo: Si es confirmación de clase, actualizar booking
            // if (selectedOption === '✅ Confirmar Asistencia') {
            //     await confirmBookingByPhone(from);
            // }
        }
    } catch (error) {
        console.error('[Webhook Evolution] Error procesando poll:', error);
    }
}

/**
 * Procesar mensaje de texto
 */
async function handleTextMessage(from: string, content: string, msg: any): Promise<void> {
    const phone = from?.split('@')[0];
    
    console.log('[Webhook Evolution] 💬 Texto de:', phone);
    console.log('[Webhook Evolution]    Mensaje:', content);
    
    // TODO: Implementar respuestas automáticas o bot
    // Ejemplo:
    // const lowerContent = content?.toLowerCase() || '';
    // 
    // if (lowerContent.includes('horario') || lowerContent.includes('clases')) {
    //     await sendWhatsAppMessage(phone, 'Nuestro horario está en...');
    // }
    // 
    // if (lowerContent.includes('precio') || lowerContent.includes('costo')) {
    //     await sendWhatsAppMessage(phone, 'Nuestros planes son...');
    // }
}

/**
 * Handler: Mensaje enviado (confirmación)
 */
function handleSendMessage(event: any): void {
    const to = event.data?.key?.remoteJid;
    const status = event.data?.status;
    
    console.log('[Webhook Evolution] 📤 Mensaje enviado a:', to, '- Status:', status);
}

/**
 * Handler: Actualización de mensaje (read, delivered, etc)
 */
function handleMessageUpdate(event: any): void {
    const updates = event.data || [];
    
    for (const update of updates) {
        const status = update.status;
        const to = update.key?.remoteJid;
        
        // Status: 0=error, 1=pending, 2=sent, 3=delivered, 4=read
        const statusNames: Record<number, string> = {
            0: 'error',
            1: 'pending',
            2: 'sent',
            3: 'delivered',
            4: 'read',
        };
        
        console.log('[Webhook Evolution] 📋 Status update:', to, '->', statusNames[status] || status);
    }
}

/**
 * Utilidad: Obtener tipo de mensaje
 */
function getMessageType(message: any): string {
    if (!message) return 'unknown';
    
    const types = [
        'conversation',
        'extendedTextMessage',
        'imageMessage',
        'videoMessage',
        'audioMessage',
        'documentMessage',
        'stickerMessage',
        'contactMessage',
        'locationMessage',
        'pollCreationMessage',
        'pollUpdateMessage',
        'reactionMessage',
    ];
    
    for (const type of types) {
        if (message[type]) return type;
    }
    
    return Object.keys(message)[0] || 'unknown';
}

/**
 * Utilidad: Extraer contenido del mensaje
 */
function extractMessageContent(message: any): string {
    if (!message) return '';
    
    if (message.conversation) {
        return message.conversation;
    }
    
    if (message.extendedTextMessage?.text) {
        return message.extendedTextMessage.text;
    }
    
    if (message.imageMessage?.caption) {
        return `[Imagen] ${message.imageMessage.caption}`;
    }
    
    if (message.videoMessage?.caption) {
        return `[Video] ${message.videoMessage.caption}`;
    }
    
    if (message.documentMessage?.title) {
        return `[Documento] ${message.documentMessage.title}`;
    }
    
    if (message.pollCreationMessage?.name) {
        return `[Poll] ${message.pollCreationMessage.name}`;
    }
    
    return '[Contenido no extraído]';
}

export default router;
