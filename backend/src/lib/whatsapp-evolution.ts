import axios, { AxiosInstance } from 'axios';

/**
 * Cliente para Evolution API (WhatsApp via Baileys)
 * Documentación: https://doc.evolution-api.com/
 */
export class EvolutionAPIClient {
    private client: AxiosInstance;
    private instanceName: string;

    constructor(instanceName?: string) {
        const baseURL = process.env.EVOLUTION_API_URL;
        const apiKey = process.env.EVOLUTION_API_KEY;
        // Una instancia por sucursal (San Miguel / Tepa). Si no se pasa, usa el default
        // del env (compatibilidad) o 'bmb-san-miguel' (principal).
        this.instanceName = instanceName
            || process.env.EVOLUTION_INSTANCE_NAME
            || 'bmb-san-miguel';

        if (!baseURL || !apiKey) {
            console.warn('[Evolution] EVOLUTION_API_URL o EVOLUTION_API_KEY no configurados');
        }

        this.client = axios.create({
            baseURL: baseURL || '',
            headers: {
                'Content-Type': 'application/json',
                apikey: apiKey || '',
            },
            timeout: 30000,
        });
    }

    /**
     * Crear nueva instancia de WhatsApp
     */
    async createInstance(webhookUrl?: string): Promise<any> {
        const body: any = {
            instanceName: this.instanceName,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS',
        };

        // Si hay webhook URL, configurarlo específico para esta instancia
        if (webhookUrl) {
            body.webhook = {
                url: webhookUrl,
                enabled: true,
                webhookByEvents: false,
                events: [
                    'QRCODE_UPDATED',
                    'CONNECTION_UPDATE',
                    'MESSAGES_UPSERT',
                    'SEND_MESSAGE',
                ],
            };
        }

        const response = await this.client.post('/instance/create', body);
        return response.data;
    }

    /**
     * Conectar instancia y obtener QR code
     */
    async connectInstance(): Promise<{ qrCode?: string; base64?: string; state?: string }> {
        const response = await this.client.get(`/instance/connect/${this.instanceName}`);
        return response.data;
    }

    /**
     * Obtener estado de conexión
     */
    async getStatus(): Promise<{
        connected: boolean;
        qrCode?: string;
        state: string;
        number?: string;
    }> {
        try {
            const response = await this.client.get('/instance/fetchInstances');
            const instances = response.data;

            const instance = instances.find((i: any) => 
                i.name === this.instanceName || i.instanceName === this.instanceName
            );

            if (!instance) {
                return { connected: false, state: 'not_found' };
            }

            return {
                connected: instance.connectionStatus === 'open',
                state: instance.connectionStatus || 'unknown',
                number: instance.number || instance.ownerJid?.replace('@s.whatsapp.net', ''),
            };
        } catch (error: any) {
            console.error('[Evolution] Error obteniendo estado:', error.message);
            return { connected: false, state: 'error' };
        }
    }

    /**
     * Enviar mensaje de texto
     */
    async sendText(to: string, message: string): Promise<any> {
        const phone = this.formatPhone(to);
        const response = await this.client.post(`/message/sendText/${this.instanceName}`, {
            number: phone,
            text: message,
        });
        return response.data;
    }

    /**
     * Enviar mensaje con botones (NO FUNCIONA EN iOS)
     * @deprecated Usar sendPoll en su lugar
     */
    async sendButtons(
        to: string,
        title: string,
        description: string,
        buttons: Array<{ id: string; title: string }>
    ): Promise<any> {
        const phone = this.formatPhone(to);
        const response = await this.client.post(`/message/sendButtons/${this.instanceName}`, {
            number: phone,
            title,
            description,
            buttons: buttons.map((b) => ({
                type: 'reply',
                buttonId: b.id,
                buttonText: { displayText: b.title },
            })),
        });
        return response.data;
    }

    /**
     * Enviar Poll/Encuesta (FUNCIONA EN iOS Y Android)
     * Mejor opción para botones interactivos
     */
    async sendPoll(
        to: string,
        question: string,
        options: string[],
        selectableCount: number = 1
    ): Promise<any> {
        const phone = this.formatPhone(to);
        const response = await this.client.post(`/message/sendPoll/${this.instanceName}`, {
            number: phone,
            pollMessage: {
                name: question,
                selectableCount,
                values: options,
            },
        });
        return response.data;
    }

    /**
     * Enviar imagen/media
     */
    async sendMedia(
        to: string,
        mediaUrl: string,
        caption?: string,
        mediaType: 'image' | 'video' | 'document' = 'image'
    ): Promise<any> {
        const phone = this.formatPhone(to);
        const response = await this.client.post(`/message/sendMedia/${this.instanceName}`, {
            number: phone,
            mediatype: mediaType,
            media: mediaUrl,
            caption: caption || '',
        });
        return response.data;
    }

    /**
     * Cerrar sesión de WhatsApp (no elimina instancia)
     */
    async logout(): Promise<any> {
        const response = await this.client.delete(`/instance/logout/${this.instanceName}`);
        return response.data;
    }

    /**
     * Eliminar instancia completamente
     */
    async deleteInstance(): Promise<any> {
        const response = await this.client.delete(`/instance/delete/${this.instanceName}`);
        return response.data;
    }

    /**
     * Reiniciar instancia
     */
    async restartInstance(): Promise<any> {
        const response = await this.client.put(`/instance/restart/${this.instanceName}`);
        return response.data;
    }

    /**
     * Formatear número de teléfono mexicano
     * Convierte: 4271234567 → 524271234567
     */
    private formatPhone(phone: string): string {
        // Eliminar todo excepto dígitos
        let cleaned = phone.replace(/\D/g, '');

        // Si ya tiene formato internacional mexicano (52 + 10 dígitos)
        if (cleaned.startsWith('52') && cleaned.length === 12) {
            return cleaned;
        }

        // Si tiene 10 dígitos (número nacional), agregar 52
        if (cleaned.length === 10) {
            return `52${cleaned}`;
        }

        // Si tiene +52, quitar el +
        if (cleaned.startsWith('521') && cleaned.length === 13) {
            // Algunos números tienen 521 (el 1 es legacy), quitarlo
            return `52${cleaned.slice(3)}`;
        }

        return cleaned;
    }
}

// ============================================
// Clientes por instancia (una por sucursal)
// ============================================
const clientsByInstance = new Map<string, EvolutionAPIClient>();

/**
 * Devuelve el cliente para una instancia concreta (cacheado).
 * Sin argumento → instancia principal (San Miguel).
 */
export function getEvolutionClient(instanceName?: string): EvolutionAPIClient {
    const name = instanceName || process.env.EVOLUTION_INSTANCE_NAME || 'bmb-san-miguel';
    let client = clientsByInstance.get(name);
    if (!client) {
        client = new EvolutionAPIClient(name);
        clientsByInstance.set(name, client);
    }
    return client;
}

// ============================================
// Cache de estado (para webhooks)
// ============================================
export interface EvolutionState {
    qrCode: string | null;
    connected: boolean;
    lastUpdated: Date;
    connectionState?: string;
    phoneNumber?: string;
}

let evolutionState: EvolutionState = {
    qrCode: null,
    connected: false,
    lastUpdated: new Date(),
};

export function updateEvolutionState(update: Partial<EvolutionState>): void {
    evolutionState = {
        ...evolutionState,
        ...update,
        lastUpdated: new Date(),
    };
}

export function getEvolutionState(): EvolutionState {
    return evolutionState;
}
