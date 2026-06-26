import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, CheckCircle, XCircle, RefreshCw, Send, QrCode, PowerOff, Smartphone, Star } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';

interface WhatsAppStatus {
    provider: string;
    connected: boolean;
    state: string;
    number?: string;
    instance?: string;
}

interface InstanceDef {
    key: string;
    label: string;
    name: string;
    facilityName: string;
    primary: boolean;
}

interface ConnectionResult {
    success: boolean;
    qrCode?: string;
    message?: string;
    status?: any;
}

/** Panel de una sucursal: estado, QR, conectar/desconectar y prueba — todo por instancia. */
function InstancePanel({ instance }: { instance: InstanceDef }) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [testPhone, setTestPhone] = useState('');
    const [qrCode, setQrCode] = useState<string | null>(null);
    const key = instance.key;

    const { data: status, isLoading: isLoadingStatus, refetch: refetchStatus } = useQuery<WhatsAppStatus>({
        queryKey: ['whatsapp-status', key],
        queryFn: async () => {
            try {
                return (await api.get(`/evolution/status?instance=${key}`)).data;
            } catch {
                return { provider: 'evolution', connected: false, state: 'not_configured' } as WhatsAppStatus;
            }
        },
        refetchInterval: qrCode ? 3000 : 60000,
        retry: false,
    });

    const connectMutation = useMutation({
        mutationFn: async () => (await api.post('/evolution/connect', { instance: key })).data as ConnectionResult,
        onSuccess: (data) => {
            if (data.qrCode) {
                setQrCode(data.qrCode);
                toast({ title: 'QR generado', description: `Escanea el código con el WhatsApp de ${instance.label}` });
            } else if (data.status?.connected) {
                toast({ title: 'Ya conectado', description: `${instance.label} ya está conectado` });
            }
            queryClient.invalidateQueries({ queryKey: ['whatsapp-status', key] });
        },
        onError: (e: any) => toast({ title: 'Error', description: e.response?.data?.error || 'Error conectando', variant: 'destructive' }),
    });

    const logoutMutation = useMutation({
        mutationFn: async () => (await api.post('/evolution/logout', { instance: key })).data,
        onSuccess: () => {
            setQrCode(null);
            toast({ title: 'Sesión cerrada', description: `${instance.label} desconectado` });
            queryClient.invalidateQueries({ queryKey: ['whatsapp-status', key] });
        },
        onError: (e: any) => toast({ title: 'Error', description: e.response?.data?.error || 'Error cerrando sesión', variant: 'destructive' }),
    });

    const testMutation = useMutation({
        mutationFn: async () => (await api.post('/evolution/test', { phone: testPhone, instance: key })).data,
        onSuccess: () => {
            toast({ title: 'Mensaje enviado', description: `Prueba enviada desde ${instance.label} a ${testPhone}` });
            setTestPhone('');
        },
        onError: (e: any) => toast({ title: 'Error', description: e.response?.data?.error || 'Error enviando mensaje', variant: 'destructive' }),
    });

    useEffect(() => {
        if (status?.connected && qrCode) {
            setQrCode(null);
            toast({ title: '¡Conectado!', description: `${instance.label} conectado exitosamente` });
        }
    }, [status?.connected, qrCode]);

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Smartphone className="w-5 h-5" />
                            {instance.label}
                            {instance.primary && (
                                <Badge variant="secondary" className="gap-1"><Star className="w-3 h-3" />Principal</Badge>
                            )}
                        </CardTitle>
                        <CardDescription>{instance.facilityName}</CardDescription>
                    </div>
                    {isLoadingStatus ? (
                        <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />…</Badge>
                    ) : status?.connected ? (
                        <Badge className="bg-success"><CheckCircle className="w-3 h-3 mr-1" />Conectado</Badge>
                    ) : (
                        <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Desconectado</Badge>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {status?.connected && (
                    <Alert>
                        <CheckCircle className="w-4 h-4" />
                        <AlertTitle>Activo</AlertTitle>
                        <AlertDescription>
                            {status.number && <span className="block">Número: +{status.number}</span>}
                            Los mensajes de {instance.label} salen de este número.
                        </AlertDescription>
                    </Alert>
                )}

                {!status?.connected && !qrCode && (
                    <Alert variant="destructive">
                        <XCircle className="w-4 h-4" />
                        <AlertTitle>No conectado</AlertTitle>
                        <AlertDescription>Genera el QR y escanéalo con el teléfono de {instance.label}.</AlertDescription>
                    </Alert>
                )}

                {qrCode && !status?.connected && (
                    <div className="flex flex-col items-center space-y-3">
                        <div className="p-4 bg-white rounded-lg shadow-md">
                            <img
                                src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                                alt={`QR ${instance.label}`}
                                className="w-56 h-56"
                            />
                        </div>
                        <p className="text-xs text-muted-foreground text-center">
                            WhatsApp → Dispositivos vinculados → Vincular dispositivo. Se actualiza cada 30s.
                        </p>
                    </div>
                )}

                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => refetchStatus()} disabled={isLoadingStatus}>
                        <RefreshCw className={`w-4 h-4 mr-2 ${isLoadingStatus ? 'animate-spin' : ''}`} />
                        Actualizar
                    </Button>
                    {!status?.connected && (
                        <Button size="sm" onClick={() => connectMutation.mutate()} disabled={connectMutation.isPending}>
                            {connectMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <QrCode className="w-4 h-4 mr-2" />}
                            {qrCode ? 'Regenerar QR' : 'Conectar'}
                        </Button>
                    )}
                    {status?.connected && (
                        <Button size="sm" variant="destructive" onClick={() => logoutMutation.mutate()} disabled={logoutMutation.isPending}>
                            {logoutMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PowerOff className="w-4 h-4 mr-2" />}
                            Desconectar
                        </Button>
                    )}
                </div>

                {status?.connected && (
                    <div className="flex items-end gap-2 pt-2 border-t">
                        <div className="flex-1 space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Probar (10 dígitos)</label>
                            <Input placeholder="4271234567" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />
                        </div>
                        <Button size="sm" variant="outline" onClick={() => testMutation.mutate()} disabled={!testPhone || testMutation.isPending}>
                            {testMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                            Enviar
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

/** Grid de instancias de WhatsApp por sucursal. Reutilizable en admin y recepción. */
export function WhatsAppManager() {
    const { data, isLoading } = useQuery<{ instances: InstanceDef[] }>({
        queryKey: ['whatsapp-instances'],
        queryFn: async () => (await api.get('/evolution/instances')).data,
        retry: false,
    });

    const instances = data?.instances ?? [];

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">WhatsApp por sucursal</h2>
                <p className="text-muted-foreground">
                    Vincula un WhatsApp por sucursal. Los mensajes a cada usuario salen del número de su
                    sucursal; si no tiene sucursal fija, sale del principal (San Miguel).
                </p>
            </div>

            {isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" /> Cargando instancias…
                </div>
            ) : (
                <div className="grid gap-6 md:grid-cols-2">
                    {instances.map((inst) => (
                        <InstancePanel key={inst.key} instance={inst} />
                    ))}
                </div>
            )}
        </div>
    );
}

export default WhatsAppManager;
