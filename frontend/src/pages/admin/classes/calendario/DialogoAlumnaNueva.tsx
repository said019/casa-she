import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Check, Copy, Loader2, MessageCircle } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Class } from '@/types/class';
import { enlaceAccesoWhatsApp, mensajeAccesoWhatsApp } from '@/lib/whatsapp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { formatClassTime } from './formato';

interface PlanVendible {
    id: string;
    name: string;
    price: number;
    duration_days: number;
    reformer_credits: number | null;
    multi_credits: number | null;
    is_internal?: boolean | null;
}

type Metodo = 'cash' | 'transfer' | 'card';
const METODOS: Array<{ value: Metodo; label: string; resumen: string }> = [
    { value: 'cash', label: 'Efectivo', resumen: 'efectivo' },
    { value: 'transfer', label: 'Transferencia', resumen: 'transferencia' },
    { value: 'card', label: 'Tarjeta', resumen: 'tarjeta' },
];

interface Existente { userId: string; nombre: string; coincidencia: 'email' | 'telefono' }
interface Listo {
    userId: string;
    nombre: string;
    telefono: string;
    plan: PlanVendible | null;
    metodo: Metodo;
    url: string;
    mandarAcceso: boolean;
}

interface Props {
    clase: Class | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Lo que se buscó en el panel, para precargar el nombre. */
    nombreInicial?: string;
    /** "Volver a la clase": el panel se recarga y resalta a la alumna recién inscrita. */
    onInscrita?: (userId: string) => void;
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function fechaLarga(fecha: string): string {
    const [y, m, d] = fecha.slice(0, 10).split('-').map(Number);
    return `${DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} de ${MESES[m - 1]}`;
}

/**
 * Alta rápida de una alumna nueva desde el panel de clase: datos, paquete de la bolsa de la
 * clase (o cortesía) y forma de pago en una sola pantalla; al terminar queda inscrita y con su
 * link de acceso listo para mandar por WhatsApp. Todo ocurre en una transacción del backend.
 */
export function DialogoAlumnaNueva({ clase, open, onOpenChange, nombreInicial = '', onInscrita }: Props) {
    const { toast } = useToast();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [nombre, setNombre] = useState('');
    const [telefono, setTelefono] = useState('');
    const [email, setEmail] = useState('');
    const [planId, setPlanId] = useState<string>('');          // '' = nada elegido, 'cortesia' = sin paquete
    const [metodo, setMetodo] = useState<Metodo>('cash');
    const [mandarAcceso, setMandarAcceso] = useState(true);
    const [existente, setExistente] = useState<Existente | null>(null);
    const [listo, setListo] = useState<Listo | null>(null);
    const [copiado, setCopiado] = useState(false);
    const enCurso = useRef(false);

    // Cada vez que se abre: formulario limpio con el nombre buscado.
    useEffect(() => {
        if (!open) return;
        setNombre(nombreInicial.trim());
        setTelefono(''); setEmail(''); setPlanId(''); setMetodo('cash'); setMandarAcceso(true);
        setExistente(null); setListo(null); setCopiado(false);
        enCurso.current = false;
    }, [open, nombreInicial]);

    const esSalsa = clase?.category === 'reformer';
    const nombreBolsa = esSalsa ? 'Salsa' : 'Clases';
    const { data: planes, isLoading: cargandoPlanes } = useQuery<PlanVendible[]>({
        queryKey: ['plans'],
        queryFn: async () => (await api.get('/plans')).data,
        enabled: open,
    });
    // Solo paquetes que dan créditos de la bolsa de esta clase (NULL = ilimitado, 0 = no incluye).
    const vendibles = useMemo(() => (planes ?? []).filter((p) => {
        if (p.is_internal) return false;
        const creditos = esSalsa ? p.reformer_credits : p.multi_credits;
        return creditos === null || (typeof creditos === 'number' && creditos > 0);
    }), [planes, esSalsa]);
    const plan = vendibles.find((p) => p.id === planId) ?? null;
    const cortesia = planId === 'cortesia';

    const cuando = clase
        ? `${clase.class_type_name ?? 'Clase'} · ${fechaLarga(clase.date)} · ${formatClassTime(clase.start_time)}`
        : '';
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
    const telefonoOk = telefono.replace(/\D/g, '').length >= 10;
    const nombreOk = nombre.trim().length >= 2 && nombre.trim().length <= 80;
    const puedeEnviar = !!clase && nombreOk && telefonoOk && emailOk && (!!plan || cortesia);

    const registrar = useMutation({
        mutationFn: async () => (await api.post('/users/alta-rapida', {
            nombre: nombre.trim(),
            email: email.trim(),
            telefono: telefono.trim(),
            classId: clase!.id,
            ...(cortesia ? { cortesia: true } : { planId, metodoPago: metodo }),
        })).data as { user: { id: string; display_name: string }; acceso: { url: string } },
        onSuccess: (r) => {
            setListo({
                userId: r.user.id, nombre: r.user.display_name, telefono: telefono.trim(),
                plan, metodo, url: r.acceso.url, mandarAcceso,
            });
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            queryClient.invalidateQueries({ queryKey: ['candidatas', clase?.id] });
            queryClient.invalidateQueries({ queryKey: ['attendees', clase?.id] });
            queryClient.invalidateQueries({ queryKey: ['reception-clients'] });
            onInscrita?.(r.user.id);
        },
        onError: (err) => {
            if (axios.isAxiosError(err) && err.response?.status === 409 && err.response.data?.code === 'YA_EXISTE') {
                const d = err.response.data;
                setExistente({ userId: d.userId, nombre: d.nombre, coincidencia: d.coincidencia });
                return;
            }
            toast({ variant: 'destructive', title: 'No se pudo registrar', description: getErrorMessage(err) });
        },
        onSettled: () => { enCurso.current = false; },
    });

    const enviar = () => {
        if (!puedeEnviar || enCurso.current) return;   // evita el doble clic
        enCurso.current = true;
        setExistente(null);
        registrar.mutate();
    };

    const abrirFicha = (userId: string) => {
        onOpenChange(false);
        const enRecepcion = window.location.pathname.startsWith('/reception');
        navigate(enRecepcion ? `/reception/clientes?focus=${userId}` : `/admin/members/${userId}`);
    };

    const datosMensaje = clase && listo ? {
        nombre: listo.nombre,
        clase: clase.class_type_name ?? '',
        fecha: clase.date,
        hora: formatClassTime(clase.start_time),
        url: listo.url,
    } : null;
    const enlaceWa = datosMensaje && listo ? enlaceAccesoWhatsApp({ ...datosMensaje, telefono: listo.telefono }) : null;

    const copiarLink = async () => {
        if (!listo) return;
        try {
            await navigator.clipboard.writeText(listo.url);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2500);
        } catch {
            toast({ variant: 'destructive', title: 'No se pudo copiar', description: 'Cópialo a mano desde el mensaje.' });
        }
    };

    const resumenCobro = () => {
        if (!listo) return '';
        if (!listo.plan) return 'Cortesía · sin cobro';
        const m = METODOS.find((x) => x.value === listo.metodo)?.resumen ?? listo.metodo;
        const creditos = esSalsa ? listo.plan.reformer_credits : listo.plan.multi_credits;
        const quedan = creditos === null ? 'ilimitadas' : `le quedan ${Math.max(creditos - 1, 0)}`;
        return `${listo.plan.name} cobrado en ${m} · ${quedan}`;
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!registrar.isPending) onOpenChange(v); }}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[520px]" data-testid="dialogo-alumna-nueva">
                {!listo ? (
                    <>
                        <DialogHeader>
                            <p className="text-xs font-semibold text-casa-verde">{cuando}</p>
                            <DialogTitle className="font-heading text-3xl font-normal text-casa-ciruela">Alumna nueva</DialogTitle>
                            <DialogDescription className="sr-only">Registrar, cobrar e inscribir a una alumna nueva.</DialogDescription>
                        </DialogHeader>

                        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); enviar(); }}>
                            <label className="block space-y-1.5">
                                <span className="text-sm font-semibold">Nombre completo</span>
                                <Input aria-label="Nombre completo" value={nombre} onChange={(e) => setNombre(e.target.value)}
                                    maxLength={80} autoComplete="off" className="h-11" />
                            </label>
                            <label className="block space-y-1.5">
                                <span className="text-sm font-semibold">WhatsApp</span>
                                <span className="flex gap-1.5">
                                    <span className="flex h-11 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">+52</span>
                                    <Input aria-label="WhatsApp" type="tel" inputMode="tel" value={telefono}
                                        onChange={(e) => setTelefono(e.target.value)} placeholder="55 1234 5678" className="h-11 flex-1" />
                                </span>
                                <span className="text-xs text-muted-foreground">Ahí le llega su acceso. Si el número o el correo ya existen, te ofrecemos su ficha.</span>
                            </label>
                            <label className="block space-y-1.5">
                                <span className="text-sm font-semibold">Correo</span>
                                <Input aria-label="Correo" type="email" required value={email}
                                    onChange={(e) => setEmail(e.target.value)} autoComplete="off" className="h-11" />
                                <span className="text-xs text-muted-foreground">Con este correo entra a la app.</span>
                            </label>

                            {existente && (
                                <div role="alert" className="space-y-2 rounded-xl border border-casa-arena bg-casa-avena/60 p-3 text-sm">
                                    <p>
                                        <strong>{existente.nombre}</strong> ya está registrada con ese {existente.coincidencia === 'email' ? 'correo' : 'teléfono'}.
                                    </p>
                                    <Button type="button" size="sm" onClick={() => abrirFicha(existente.userId)}>Abrir su ficha</Button>
                                </div>
                            )}

                            <fieldset className="space-y-2">
                                <legend className="mb-2 text-sm font-semibold">Paquete de {nombreBolsa}</legend>
                                {cargandoPlanes ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                ) : (
                                    <div role="radiogroup" aria-label="Paquete" className="grid grid-cols-2 gap-1.5">
                                        {vendibles.map((p) => (
                                            <OpcionPaquete key={p.id} activa={planId === p.id} onClick={() => setPlanId(p.id)}
                                                titulo={p.name} detalle={`$${Number(p.price)} · ${p.duration_days} días`} />
                                        ))}
                                        <OpcionPaquete activa={cortesia} onClick={() => setPlanId('cortesia')}
                                            titulo="Cortesía" detalle="Sin paquete ni cobro" />
                                    </div>
                                )}
                                {!cargandoPlanes && vendibles.length === 0 && (
                                    <p className="text-xs text-muted-foreground">No hay paquetes de {nombreBolsa} para vender; puedes inscribirla de cortesía.</p>
                                )}
                            </fieldset>

                            {!cortesia && (
                                <fieldset>
                                    <legend className="mb-2 text-sm font-semibold">Pago</legend>
                                    <div role="radiogroup" aria-label="Forma de pago" className="flex flex-wrap gap-1.5">
                                        {METODOS.map((m) => (
                                            <button key={m.value} type="button" role="radio" aria-checked={metodo === m.value}
                                                onClick={() => setMetodo(m.value)}
                                                className={cn('h-10 rounded-full border px-4 text-sm font-medium transition-colors',
                                                    metodo === m.value ? 'border-casa-verde bg-casa-verde text-white' : 'border-casa-arena bg-background hover:bg-casa-avena/50')}>
                                                {m.label}
                                            </button>
                                        ))}
                                    </div>
                                </fieldset>
                            )}

                            <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-casa-avena/60 p-3">
                                <input type="checkbox" checked={mandarAcceso} onChange={(e) => setMandarAcceso(e.target.checked)}
                                    className="mt-0.5 h-5 w-5 accent-[#2A4E36]" aria-label="Mandarle su acceso por WhatsApp" />
                                <span>
                                    <span className="block text-sm font-semibold text-casa-ciruela">Mandarle su acceso por WhatsApp</span>
                                    <span className="block text-xs text-muted-foreground">Recibe un link para crear su contraseña y ver sus clases.</span>
                                </span>
                            </label>

                            <div className="space-y-2 pt-1">
                                <p className="text-xs text-muted-foreground">
                                    {cortesia ? 'Cortesía · no descuenta clases' : plan ? `${plan.name} · ${METODOS.find((m) => m.value === metodo)?.resumen} · usa 1 clase` : 'Elige un paquete o cortesía'}
                                </p>
                                <Button type="submit" className="h-12 w-full text-base" disabled={!puedeEnviar || registrar.isPending}>
                                    {registrar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Registrar, cobrar e inscribir'}
                                </Button>
                            </div>
                        </form>
                    </>
                ) : (
                    <div className="-m-6 overflow-hidden rounded-lg" data-testid="alumna-registrada">
                        <div className="space-y-2 bg-casa-avena/70 p-6">
                            <span className="grid h-11 w-11 place-items-center rounded-full bg-casa-verde text-white"><Check className="h-5 w-5" /></span>
                            <DialogTitle className="font-heading text-3xl font-normal text-casa-ciruela">
                                {listo.nombre.trim().split(/\s+/)[0]} quedó inscrita
                            </DialogTitle>
                            <DialogDescription className="text-casa-ciruela/80">{cuando}</DialogDescription>
                            <p className="text-sm text-casa-ciruela/80">{resumenCobro()}</p>
                        </div>

                        <div className="space-y-3.5 p-6">
                            <h3 className="font-heading text-2xl text-casa-ciruela">Su acceso a la app</h3>
                            {listo.mandarAcceso && datosMensaje ? (
                                <>
                                    <p className="text-sm text-muted-foreground">Se abre WhatsApp con este mensaje ya escrito. Solo tienes que enviarlo.</p>
                                    <div className="whitespace-pre-line rounded-xl bg-[#DCF8C6]/70 p-3 text-sm text-casa-ciruela" data-testid="vista-mensaje">
                                        {mensajeAccesoWhatsApp(datosMensaje)}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {enlaceWa ? (
                                            <Button asChild className="h-11 gap-2">
                                                <a href={enlaceWa} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" />Abrir WhatsApp</a>
                                            </Button>
                                        ) : (
                                            <p className="text-xs text-muted-foreground">El número no parece válido para WhatsApp; copia el link.</p>
                                        )}
                                        <Button type="button" variant="outline" className="h-11 gap-2" onClick={copiarLink}>
                                            {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copiado ? 'Copiado' : 'Copiar link'}
                                        </Button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <p className="text-sm text-muted-foreground">No se le mandó el acceso. Puedes copiar el link y dárselo, o mandarlo después.</p>
                                    <Button type="button" variant="outline" className="h-11 gap-2" onClick={copiarLink}>
                                        {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copiado ? 'Copiado' : 'Copiar link'}
                                    </Button>
                                </>
                            )}
                            <p className="text-xs text-muted-foreground">Si lo pierde o vence, lo reenvías desde su ficha en Alumnas.</p>
                            <Button type="button" variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>Volver a la clase</Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

function OpcionPaquete({ activa, onClick, titulo, detalle }: { activa: boolean; onClick: () => void; titulo: string; detalle: string }) {
    return (
        <button type="button" role="radio" aria-checked={activa} onClick={onClick}
            className={cn('rounded-xl border p-2.5 text-left transition-colors',
                activa ? 'border-2 border-casa-verde bg-casa-avena' : 'border-casa-arena bg-background hover:bg-casa-avena/40')}>
            <span className="block text-sm font-semibold">{titulo}</span>
            <span className="block text-xs text-muted-foreground">{detalle}</span>
        </button>
    );
}
