import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
    ChevronDown,
    ChevronRight,
    User,
    CalendarDays,
    CheckCircle2,
    Sparkles,
    RefreshCw,
    Monitor,
    Smartphone,
    Zap,
    HelpCircle,
    X,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────
type Actor = 'admin' | 'client' | 'system' | 'option-a' | 'option-b';

interface FlowStep {
    actor: Actor;
    action: string;
    detail: string;
    isDecision?: boolean;
    branches?: { label: string; next: string }[];
}

interface Flow {
    id: string;
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    color: string;          // Tailwind ring/border color
    bgActive: string;       // Tailwind bg when selected
    steps: FlowStep[];
}

// ── Actor badge config ─────────────────────────────────
const actorConfig: Record<Actor, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
    admin:    { label: 'Admin',    bg: 'bg-amber-100',   text: 'text-amber-800',   icon: <Monitor className="h-3 w-3" /> },
    client:   { label: 'Usuario',  bg: 'bg-emerald-100', text: 'text-emerald-800', icon: <Smartphone className="h-3 w-3" /> },
    system:   { label: 'Sistema',  bg: 'bg-indigo-100',  text: 'text-indigo-800',  icon: <Zap className="h-3 w-3" /> },
    'option-a': { label: 'Opcion A', bg: 'bg-orange-100', text: 'text-orange-800', icon: <Monitor className="h-3 w-3" /> },
    'option-b': { label: 'Opcion B', bg: 'bg-fuchsia-100', text: 'text-fuchsia-800', icon: <Smartphone className="h-3 w-3" /> },
};

// ── Flow data ──────────────────────────────────────────
const flows: Flow[] = [
    {
        id: 'register',
        title: 'Alta de Usuario',
        subtitle: 'El usuario llega o llama al studio',
        icon: <User className="h-4 w-4" />,
        color: 'ring-[#7C6F64]',
        bgActive: 'bg-[#7C6F64]',
        steps: [
            { actor: 'admin', action: 'Abre Panel Admin → Usuarios → Nuevo Usuario', detail: 'Llena nombre, telefono y email (o solo telefono si no tiene email).' },
            { actor: 'admin', action: 'Asigna membresia o paquete de clases', detail: 'Selecciona el plan adecuado para el usuario.' },
            { actor: 'admin', action: 'Registra forma de pago', detail: 'Marca como "Pago en efectivo", "Transferencia" o "Tarjeta (Stripe)". No necesita checkout online.', isDecision: true, branches: [{ label: 'Efectivo / Transfer', next: 'Marca pago manual' }, { label: 'Tarjeta', next: 'Checkout Stripe' }] },
            { actor: 'system', action: 'Crea la cuenta y activa membresia automaticamente', detail: 'El usuario no necesita crear cuenta, poner contrasena ni descargar nada.' },
            { actor: 'admin', action: '(Opcional) Genera Wallet Pass para el celular', detail: 'Si el usuario tiene iPhone o Android, el admin puede generar el pase y agregarlo al celular en el momento.' },
        ],
    },
    {
        id: 'booking',
        title: 'Reservar Clase',
        subtitle: 'El usuario quiere ir a clase',
        icon: <CalendarDays className="h-4 w-4" />,
        color: 'ring-[#8B7E74]',
        bgActive: 'bg-[#8B7E74]',
        steps: [
            { actor: 'client', action: 'Llama o manda WhatsApp al studio', detail: '"Quiero ir a la clase del jueves a las 10am". No necesita abrir ninguna app.' },
            { actor: 'admin', action: 'Abre Panel → Horario → Selecciona la clase', detail: 'Navega al dia y horario solicitado.' },
            { actor: 'admin', action: 'Busca al usuario por nombre o telefono → Agregar', detail: 'Un clic y la reserva queda confirmada.' },
            { actor: 'system', action: 'Reserva confirmada automaticamente', detail: 'El sistema registra la reserva y descuenta del paquete.' },
            { actor: 'system', action: 'Recordatorio WhatsApp 24h antes de la clase', detail: '"Hola Maria, recuerda que tienes clase manana jueves a las 10am en BMB Studio."' },
            { actor: 'system', action: 'Si tiene Wallet Pass: push notification al celular', detail: 'Le aparece como notificacion normal en su celular, sin abrir nada.' },
        ],
    },
    {
        id: 'checkin',
        title: 'Check-in en Clase',
        subtitle: 'El usuario llega al studio',
        icon: <CheckCircle2 className="h-4 w-4" />,
        color: 'ring-[#6B8F71]',
        bgActive: 'bg-[#6B8F71]',
        steps: [
            { actor: 'client', action: 'El usuario llega al studio', detail: 'Solo necesita presentarse fisicamente.' },
            { actor: 'option-a', action: 'Check-in manual por el admin (recomendado)', detail: 'Panel → Clase de hoy → Lista de asistentes → Tap en ✓ junto al nombre. Sin tecnologia para el usuario.' },
            { actor: 'option-b', action: 'QR desde Wallet Pass (si lo tiene)', detail: 'El usuario muestra su celular y el admin escanea. Es opcional, no obligatorio.' },
            { actor: 'system', action: 'Descuenta clase del paquete automaticamente', detail: 'Si tenia 8 clases, ahora le quedan 7.' },
            { actor: 'system', action: 'Wallet Pass se actualiza en tiempo real', detail: 'Si tiene Wallet Pass, se actualiza solo: "7 de 8 clases restantes".' },
        ],
    },
    {
        id: 'events',
        title: 'Inscribir a Evento',
        subtitle: 'Workshop, masterclass, retiro, etc.',
        icon: <Sparkles className="h-4 w-4" />,
        color: 'ring-[#7B6B8D]',
        bgActive: 'bg-[#7B6B8D]',
        steps: [
            { actor: 'admin', action: 'Abre Panel → Eventos → Selecciona evento', detail: 'Navega al evento especial que deseas.' },
            { actor: 'admin', action: 'Busca al usuario por nombre → Inscribir', detail: 'Selecciona y listo, queda inscrito.' },
            { actor: 'admin', action: 'Registra pago manual (efectivo/transferencia)', detail: 'No necesita pasar por checkout online ni Stripe.' },
            { actor: 'system', action: 'Genera confirmacion automatica', detail: 'El sistema registra la inscripcion y si tiene Wallet Pass, genera uno del evento.' },
            { actor: 'system', action: 'Recordatorio WhatsApp antes del evento', detail: '"Recuerda que manana es el workshop de Barre a las 5pm."' },
        ],
    },
    {
        id: 'renewal',
        title: 'Renovacion de Membresia',
        subtitle: 'Se acerca el vencimiento',
        icon: <RefreshCw className="h-4 w-4" />,
        color: 'ring-[#6B7F8D]',
        bgActive: 'bg-[#6B7F8D]',
        steps: [
            { actor: 'system', action: 'Alerta automatica 7 dias antes de vencimiento', detail: 'WhatsApp al usuario + notificacion al admin en el panel.' },
            { actor: 'system', action: 'WhatsApp: "Tu membresia vence pronto"', detail: 'El usuario recibe aviso sin necesidad de revisar nada.' },
            { actor: 'client', action: 'Llega al studio o llama para renovar', detail: 'Paga en efectivo o transferencia como siempre.' },
            { actor: 'admin', action: 'Panel → Usuario → Renovar → Confirmar pago', detail: 'Un clic y la membresia se extiende. El Wallet Pass se actualiza automaticamente.' },
        ],
    },
];

// ── Component ──────────────────────────────────────────
export default function MemberFlowGuide() {
    const [activeFlowId, setActiveFlowId] = useState(flows[0].id);
    const [expandedStep, setExpandedStep] = useState<number | null>(null);
    const [isOpen, setIsOpen] = useState(true);

    const currentFlow = flows.find(f => f.id === activeFlowId) ?? flows[0];

    return (
        <div className="rounded-xl border bg-card overflow-hidden">
            {/* Header — collapsible */}
            <button
                type="button"
                className="w-full flex items-center justify-between p-4 sm:px-6 hover:bg-muted/30 transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-[#A48550]/10 flex items-center justify-center">
                        <HelpCircle className="h-4 w-4 text-[#A48550]" />
                    </div>
                    <div className="text-left">
                        <h3 className="text-sm font-semibold">Guia rapida de flujos</h3>
                        <p className="text-xs text-muted-foreground">Como gestionar usuarios que no usan tecnologia</p>
                    </div>
                </div>
                {isOpen ? <X className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>

            {isOpen && (
                <div className="border-t">
                    {/* Flow tabs */}
                    <div className="flex gap-1.5 p-3 sm:px-6 overflow-x-auto bg-muted/20">
                        {flows.map((flow) => {
                            const isActive = activeFlowId === flow.id;
                            return (
                                <button
                                    key={flow.id}
                                    type="button"
                                    className={cn(
                                        'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all',
                                        isActive
                                            ? `${flow.bgActive} text-white shadow-sm`
                                            : 'bg-white text-muted-foreground hover:bg-muted/50 border'
                                    )}
                                    onClick={() => {
                                        setActiveFlowId(flow.id);
                                        setExpandedStep(null);
                                    }}
                                >
                                    {flow.icon}
                                    <span className="hidden sm:inline">{flow.title}</span>
                                    <span className="sm:hidden">{flow.title.split(' ').slice(-1)[0]}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Flow header */}
                    <div className="px-4 sm:px-6 py-3 border-t bg-gradient-to-r from-muted/30 to-transparent">
                        <div className="flex items-center gap-2">
                            <div className={cn('h-6 w-6 rounded-md flex items-center justify-center text-white', currentFlow.bgActive)}>
                                {currentFlow.icon}
                            </div>
                            <div>
                                <h4 className="text-sm font-semibold">{currentFlow.title}</h4>
                                <p className="text-[11px] text-muted-foreground">{currentFlow.subtitle}</p>
                            </div>
                        </div>
                    </div>

                    {/* Steps — vertical timeline */}
                    <div className="px-4 sm:px-6 py-3 space-y-0">
                        {currentFlow.steps.map((step, index) => {
                            const actor = actorConfig[step.actor];
                            const isExpanded = expandedStep === index;
                            const isLast = index === currentFlow.steps.length - 1;

                            return (
                                <div key={`${currentFlow.id}-${index}`} className="relative flex gap-3">
                                    {/* Timeline line + dot */}
                                    <div className="flex flex-col items-center">
                                        <div
                                            className={cn(
                                                'h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 z-10 transition-all',
                                                isExpanded
                                                    ? `${currentFlow.bgActive} text-white shadow-md`
                                                    : 'bg-muted text-muted-foreground'
                                            )}
                                        >
                                            {index + 1}
                                        </div>
                                        {!isLast && (
                                            <div className="w-px flex-1 bg-border min-h-[12px]" />
                                        )}
                                    </div>

                                    {/* Content */}
                                    <button
                                        type="button"
                                        className={cn(
                                            'flex-1 text-left rounded-lg px-3 py-2 mb-1 transition-all',
                                            isExpanded ? 'bg-muted/50' : 'hover:bg-muted/30',
                                        )}
                                        onClick={() => setExpandedStep(isExpanded ? null : index)}
                                    >
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className={cn(
                                                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold',
                                                actor.bg, actor.text,
                                            )}>
                                                {actor.icon}
                                                {actor.label}
                                            </span>
                                            {step.isDecision && (
                                                <span className="text-[10px] text-orange-600 font-medium">Punto de decision</span>
                                            )}
                                            <ChevronRight className={cn(
                                                'h-3 w-3 text-muted-foreground ml-auto transition-transform',
                                                isExpanded && 'rotate-90'
                                            )} />
                                        </div>
                                        <p className="text-sm font-medium leading-snug">{step.action}</p>
                                        {isExpanded && (
                                            <div className="mt-1.5 space-y-1.5">
                                                <p className="text-xs text-muted-foreground leading-relaxed">{step.detail}</p>
                                                {step.branches && (
                                                    <div className="flex flex-wrap gap-1.5 mt-1">
                                                        {step.branches.map((branch, bi) => (
                                                            <span key={bi} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-orange-50 text-orange-700 border border-orange-200">
                                                                {branch.label}: {branch.next}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    {/* Legend */}
                    <div className="px-4 sm:px-6 py-2.5 border-t bg-muted/10 flex flex-wrap gap-3">
                        {(['admin', 'client', 'system'] as Actor[]).map(key => {
                            const a = actorConfig[key];
                            return (
                                <span key={key} className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium', a.bg, a.text)}>
                                    {a.icon} {a.label}
                                </span>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
