import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, Phone, Search, UserPlus } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Class } from '@/types/class';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToastAction } from '@/components/ui/toast';
import { useToast } from '@/components/ui/use-toast';
import { PlanLabel } from '@/components/brands/PlanLabel';
import { useIsElevated } from '@/hooks/useIsElevated';
import { getMembershipPaymentMethods, GRATIS_REASON_MIN_LENGTH } from '@/lib/membershipPaymentMethods';
import { studioTodayForInput } from '@/lib/date';

/** Lo que responde GET /api/classes/:id/candidatas (misma regla que admin-book). */
type Candidata = {
    userId: string;
    nombre: string;
    telefono: string | null;
    email: string | null;
} & (
    | { estado: 'puede'; membresia: { id: string; plan: string; restantes: number | null; vence: string | null } | null }
    | { estado: 'ya_inscrita' | 'sin_membresia' | 'sin_creditos' | 'limite_diario' | 'otro_estudio' | 'clase_llena' | 'clase_cancelada'; mensaje: string }
);

interface PlanVendible {
    id: string;
    name: string;
    price: number;
    duration_days: number;
    reformer_credits: number | null;
    multi_credits: number | null;
    is_internal?: boolean | null;
}

/** Estados donde una cortesía (sin plan ni crédito) sí resuelve la inscripción. */
const RESUELVE_CORTESIA = ['sin_membresia', 'sin_creditos', 'otro_estudio', 'limite_diario'];
/** Estados donde tiene sentido ofrecer "Vender paquete". */
const VENDIBLE = ['sin_membresia', 'sin_creditos', 'otro_estudio'];

const venceCorto = (iso: string) => format(parseISO(`${iso}T00:00:00`), "d MMM", { locale: es }).replace('.', '');

interface InscribirAlumnaProps {
    clase: Class;
    /** Se llama al inscribir (o al deshacer) para que el panel recargue inscritas y resalte a la alumna. */
    onInscrita: (userId: string) => void;
    onDeshecha: () => void;
    /** Entrega 5: abre el alta rápida con lo que se buscó. Si no viene, el botón no se muestra. */
    onRegistrarNueva?: (nombreBuscado: string) => void;
}

/**
 * Buscador para inscribir alumnas: muestra, por cada resultado, qué plan usaría y cuánto le
 * queda en la bolsa de ESTA clase (o el motivo por el que no puede), e inscribe o vende un
 * paquete ahí mismo. La regla viene del backend (lib/inscripcion.ts), la misma de admin-book.
 */
export function InscribirAlumna({ clase, onInscrita, onDeshecha, onRegistrarNueva }: InscribirAlumnaProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [texto, setTexto] = useState('');
    const [busqueda, setBusqueda] = useState('');
    const [cortesia, setCortesia] = useState(false);
    const [resaltada, setResaltada] = useState(0);
    const [vendiendo, setVendiendo] = useState<string | null>(null);

    // Espera de 250 ms al teclear.
    useEffect(() => {
        const t = setTimeout(() => setBusqueda(texto.trim()), 250);
        return () => clearTimeout(t);
    }, [texto]);

    const activa = busqueda.length >= 2;
    const { data, isFetching } = useQuery<Candidata[]>({
        queryKey: ['candidatas', clase.id, busqueda],
        queryFn: async () => (await api.get(`/classes/${clase.id}/candidatas`, { params: { q: busqueda } })).data,
        enabled: activa,
        staleTime: 0,
    });
    const resultados = activa ? (data ?? []) : [];
    const esperando = texto.trim() !== busqueda || (activa && isFetching);

    useEffect(() => { setResaltada(0); }, [data]);

    const puedeInscribir = (c: Candidata) => c.estado === 'puede' || (cortesia && RESUELVE_CORTESIA.includes(c.estado));

    const refrescar = () => {
        queryClient.invalidateQueries({ queryKey: ['candidatas', clase.id] });
        queryClient.invalidateQueries({ queryKey: ['classes'] });
    };

    const deshacer = async (bookingId: string) => {
        try {
            await api.post(`/bookings/${bookingId}/cancel`, { refundCredit: true });
            toast({ title: 'Inscripción deshecha', description: 'Crédito devuelto si aplicaba.' });
            onDeshecha();
            refrescar();
        } catch (err) {
            toast({ variant: 'destructive', title: 'No se pudo deshacer', description: getErrorMessage(err) });
        }
    };

    const inscribir = useMutation({
        mutationFn: async ({ userId, free }: { userId: string; nombre: string; free: boolean }) =>
            (await api.post('/bookings/admin-book', { classId: clase.id, userId, free })).data as { id: string },
        onSuccess: (booking, { userId, nombre }) => {
            setTexto('');
            setBusqueda('');
            setVendiendo(null);
            refrescar();
            onInscrita(userId);
            toast({
                title: `${nombre} quedó inscrita`,
                duration: 10000,
                action: (
                    <ToastAction altText={`Deshacer la inscripción de ${nombre}`} onClick={() => deshacer(booking.id)}>
                        Deshacer
                    </ToastAction>
                ),
            });
        },
        onError: (err) => {
            toast({ variant: 'destructive', title: 'No se pudo inscribir', description: getErrorMessage(err) });
            refrescar();
        },
    });

    const inscribirA = (c: Candidata) => {
        if (inscribir.isPending || !puedeInscribir(c)) return;
        inscribir.mutate({ userId: c.userId, nombre: c.nombre, free: cortesia });
    };

    const alTeclear = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (resultados.length === 0) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setResaltada((i) => Math.min(i + 1, resultados.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setResaltada((i) => Math.max(i - 1, 0)); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            const c = resultados[resaltada];
            if (c && !esperando) inscribirA(c);
        }
    };

    return (
        <section aria-labelledby="panel-inscribir" className="space-y-2.5 rounded-xl border border-casa-arena bg-casa-avena/45 p-3">
            <h3 id="panel-inscribir" className="text-sm font-semibold text-casa-ciruela">Inscribir alumna</h3>

            <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                    role="combobox"
                    aria-expanded={activa}
                    aria-controls="lista-candidatas"
                    aria-label="Buscar alumna por nombre, teléfono o email"
                    placeholder="Nombre, teléfono o email…"
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={alTeclear}
                    className="h-9 pl-8 text-sm"
                    autoComplete="off"
                />
                {esperando && activa && <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />}
            </div>

            <label className="flex cursor-pointer select-none items-start gap-2">
                <input
                    type="checkbox"
                    checked={cortesia}
                    onChange={(e) => setCortesia(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-input accent-balance-gold"
                />
                <span className="text-[11px] leading-tight">
                    <span className="font-medium text-casa-ciruela">Cortesía: inscribir sin descontar crédito</span>
                    <span className="block text-muted-foreground">No requiere plan.</span>
                </span>
            </label>

            {activa && (
                <ul id="lista-candidatas" role="listbox" aria-label="Alumnas encontradas" className="space-y-1.5">
                    {!esperando && resultados.length === 0 && (
                        <li className="py-2 text-center text-xs text-muted-foreground">Sin resultados</li>
                    )}
                    {resultados.map((c, i) => {
                        const puede = puedeInscribir(c);
                        const seleccionada = i === resaltada;
                        return (
                            <li
                                key={c.userId}
                                role="option"
                                aria-selected={seleccionada}
                                data-testid={`candidata-${c.userId}`}
                                onMouseEnter={() => setResaltada(i)}
                                className={cn(
                                    'rounded-lg border bg-background/80 p-2.5',
                                    seleccionada ? 'border-casa-verde/60 ring-1 ring-casa-verde/30' : 'border-casa-arena',
                                )}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 text-xs">
                                        <p className="truncate text-sm font-medium text-casa-profundo">{c.nombre}</p>
                                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-muted-foreground">
                                            {c.telefono && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.telefono}</span>}
                                            {c.email && <span className="truncate">{c.email}</span>}
                                        </p>
                                        {c.estado === 'puede' ? (
                                            <p className="mt-1 font-medium text-casa-verde" data-estado="puede">
                                                {c.membresia ? (
                                                    <>
                                                        <PlanLabel nombre={c.membresia.plan} />
                                                        {' · '}
                                                        {c.membresia.restantes === null
                                                            ? [/ilimitad/i.test(c.membresia.plan) ? null : 'ilimitado', c.membresia.vence ? `vence ${venceCorto(c.membresia.vence)}` : null]
                                                                .filter(Boolean).join(' · ') || 'ilimitado'
                                                            : `le quedan ${c.membresia.restantes}`}
                                                    </>
                                                ) : 'Sin descontar crédito'}
                                            </p>
                                        ) : (
                                            <p className="mt-1 font-medium text-destructive" data-estado={c.estado}>{c.mensaje}</p>
                                        )}
                                    </div>
                                    <div className="flex shrink-0 flex-col items-stretch gap-1.5">
                                        {puede && (
                                            <Button size="sm" className="h-8" disabled={inscribir.isPending} onClick={() => inscribirA(c)}>
                                                {inscribir.isPending && inscribir.variables?.userId === c.userId
                                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    : cortesia ? 'Inscribir (cortesía)' : 'Inscribir'}
                                            </Button>
                                        )}
                                        {VENDIBLE.includes(c.estado) && (
                                            <Button
                                                size="sm" variant="outline" className="h-8"
                                                aria-expanded={vendiendo === c.userId}
                                                onClick={() => setVendiendo(vendiendo === c.userId ? null : c.userId)}
                                            >
                                                Vender paquete
                                            </Button>
                                        )}
                                    </div>
                                </div>
                                {vendiendo === c.userId && (
                                    <VentaInline
                                        clase={clase}
                                        userId={c.userId}
                                        nombre={c.nombre}
                                        onVendida={() => { queryClient.invalidateQueries({ queryKey: ['users'] }); }}
                                        onInscrita={(booking) => {
                                            setTexto(''); setBusqueda(''); setVendiendo(null);
                                            refrescar();
                                            onInscrita(c.userId);
                                            toast({
                                                title: `${c.nombre} quedó inscrita`,
                                                duration: 10000,
                                                action: (
                                                    <ToastAction altText={`Deshacer la inscripción de ${c.nombre}`} onClick={() => deshacer(booking)}>
                                                        Deshacer
                                                    </ToastAction>
                                                ),
                                            });
                                        }}
                                        onFalloInscribir={() => { setVendiendo(null); refrescar(); }}
                                    />
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {activa && !esperando && onRegistrarNueva && (
                <Button type="button" variant="ghost" size="sm" className="h-8 w-full justify-start text-xs text-casa-verde"
                    onClick={() => onRegistrarNueva(busqueda)}>
                    <UserPlus className="mr-1.5 h-3.5 w-3.5" /> ¿No está? Registrar alumna nueva
                </Button>
            )}
        </section>
    );
}

/** Venta de un paquete de la bolsa de la clase, debajo de la fila, y luego la inscripción. */
function VentaInline({ clase, userId, nombre, onVendida, onInscrita, onFalloInscribir }: {
    clase: Class;
    userId: string;
    nombre: string;
    onVendida: () => void;
    onInscrita: (bookingId: string) => void;
    onFalloInscribir: () => void;
}) {
    const { toast } = useToast();
    const elevado = useIsElevated();
    const metodos = getMembershipPaymentMethods(elevado);
    const esSalsa = clase.category === 'reformer';
    const nombreBolsa = esSalsa ? 'Salsa' : 'Clases';
    const [planId, setPlanId] = useState('');
    const [metodo, setMetodo] = useState('cash');
    const [motivo, setMotivo] = useState('');
    const [cobrando, setCobrando] = useState(false);
    const enCurso = useRef(false);

    const { data: planes, isLoading } = useQuery<PlanVendible[]>({
        queryKey: ['plans'],
        queryFn: async () => (await api.get('/plans')).data,
    });
    // Solo paquetes que dan créditos de la bolsa de esta clase (NULL = ilimitado, 0 = no incluye).
    const vendibles = useMemo(() => (planes ?? []).filter((p) => {
        if (p.is_internal) return false;
        const creditos = esSalsa ? p.reformer_credits : p.multi_credits;
        return creditos === null || (typeof creditos === 'number' && creditos > 0);
    }), [planes, esSalsa]);

    const gratis = metodo === 'gratis';
    const motivoOk = !gratis || motivo.trim().length >= GRATIS_REASON_MIN_LENGTH;

    const cobrarEInscribir = async () => {
        if (!planId || enCurso.current || !motivoOk) return;
        enCurso.current = true;
        setCobrando(true);
        // Debe cubrir el día de la clase: inicia hoy, o el día de la clase si ya pasó.
        const dia = (clase.date || '').split('T')[0];
        const hoy = studioTodayForInput();
        const inicio = dia && dia < hoy ? dia : hoy;
        try {
            await api.post('/memberships/assign', {
                userId, planId, status: 'active', paymentMethod: metodo, startDate: inicio,
                ...(gratis ? { reason: motivo.trim() } : {}),
            });
        } catch (err) {
            toast({ variant: 'destructive', title: 'No se pudo vender el paquete', description: getErrorMessage(err) });
            enCurso.current = false; setCobrando(false);
            return;
        }
        onVendida();
        try {
            const res = await api.post('/bookings/admin-book', { classId: clase.id, userId, free: false });
            onInscrita((res.data as { id: string }).id);
        } catch (err) {
            // La venta se queda (ya tiene créditos): se explica por qué no entró a la clase.
            toast({
                variant: 'destructive',
                title: `Se vendió el paquete a ${nombre}, pero no se inscribió`,
                description: getErrorMessage(err),
            });
            onFalloInscribir();
        } finally {
            enCurso.current = false; setCobrando(false);
        }
    };

    return (
        <div className="mt-2.5 space-y-2 rounded-lg border border-casa-arena bg-casa-avena/50 p-2.5" data-testid="venta-inline">
            <p className="text-xs font-semibold text-casa-ciruela">Paquetes de {nombreBolsa}</p>
            {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : vendibles.length === 0 ? (
                <p className="text-xs text-muted-foreground">No hay paquetes de {nombreBolsa} para vender.</p>
            ) : (
                <>
                    <label className="block text-[11px] text-muted-foreground">
                        Paquete
                        <select
                            aria-label="Paquete" value={planId} onChange={(e) => setPlanId(e.target.value)}
                            className="mt-0.5 h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
                        >
                            <option value="">Elige un paquete</option>
                            {vendibles.map((p) => (
                                <option key={p.id} value={p.id}>{p.name} · ${Number(p.price)} · {p.duration_days} días</option>
                            ))}
                        </select>
                    </label>
                    <label className="block text-[11px] text-muted-foreground">
                        Forma de pago
                        <select
                            aria-label="Forma de pago" value={metodo} onChange={(e) => setMetodo(e.target.value)}
                            className="mt-0.5 h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
                        >
                            {metodos.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                    </label>
                    {gratis && (
                        <Input
                            aria-label="Motivo de la cortesía" placeholder={`Motivo (mínimo ${GRATIS_REASON_MIN_LENGTH} caracteres)`}
                            value={motivo} onChange={(e) => setMotivo(e.target.value)} className="h-8 text-xs"
                        />
                    )}
                    <Button size="sm" className="h-8 w-full" disabled={!planId || !motivoOk || cobrando} onClick={cobrarEInscribir}>
                        {cobrando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Cobrar e inscribir'}
                    </Button>
                </>
            )}
        </div>
    );
}
