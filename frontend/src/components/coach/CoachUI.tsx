/**
 * Componentes de UI compartidos para el portal de coach de Casa Shé.
 * Todos siguen el sistema de diseño: verde profundo, arcilla, crema, patrón de ramas.
 */

import { type ReactNode, type ElementType } from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CasaShePattern } from '@/components/CasaShePattern';

// ─────────────────────────────────────────────
// CoachPageHero — banda oscura de encabezado de página
// ─────────────────────────────────────────────

interface CoachPageHeroProps {
    eyebrow?: string;
    title: string;
    subtitle?: string;
    icon?: LucideIcon;
    right?: ReactNode;
    className?: string;
}

export function CoachPageHero({ eyebrow, title, subtitle, icon: Icon, right, className }: CoachPageHeroProps) {
    return (
        <section
            className={cn('relative -mx-4 mb-6 overflow-hidden sm:-mx-6', className)}
            style={{ backgroundColor: '#16261A' }}
        >
            {/* Patrón de ramas como textura tonal */}
            <CasaShePattern
                className="pointer-events-none absolute inset-0 h-full w-full"
                color="#F6F0E4"
                opacity={0.07}
            />
            {/* Orbe de calor — arcilla a la derecha */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-12 -top-10 h-44 w-44 rounded-full"
                style={{ background: 'radial-gradient(circle, rgba(174,72,54,0.22) 0%, transparent 68%)' }}
            />
            {/* Orbe frío — verde profundo izquierda abajo */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 rounded-full"
                style={{ background: 'radial-gradient(circle, rgba(42,78,54,0.35) 0%, transparent 70%)' }}
            />

            <div className="relative z-10 mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        {eyebrow && (
                            <p
                                className="mb-1.5 font-body text-[10px] uppercase tracking-[3px]"
                                style={{ color: 'rgba(246,240,228,0.5)' }}
                            >
                                {eyebrow}
                            </p>
                        )}
                        <div className="flex items-center gap-2.5">
                            {Icon && (
                                <div
                                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
                                    style={{ backgroundColor: 'rgba(174,72,54,0.2)' }}
                                >
                                    <Icon className="h-4 w-4" style={{ color: '#AE4836' }} />
                                </div>
                            )}
                            <h1
                                className="font-heading text-2xl font-normal leading-tight sm:text-3xl"
                                style={{ color: '#F6F0E4' }}
                            >
                                {title}
                            </h1>
                        </div>
                        {subtitle && (
                            <p
                                className="mt-1 max-w-prose font-body text-sm leading-relaxed"
                                style={{ color: 'rgba(246,240,228,0.58)' }}
                            >
                                {subtitle}
                            </p>
                        )}
                    </div>
                    {right && <div className="flex-shrink-0">{right}</div>}
                </div>
            </div>
        </section>
    );
}

// ─────────────────────────────────────────────
// CoachStat — tarjeta de estadística
// ─────────────────────────────────────────────

type StatTone = 'arcilla' | 'verde' | 'success' | 'neutral';

const TONE_STYLES: Record<StatTone, { iconBg: string; iconColor: string; valueColor: string }> = {
    arcilla: {
        iconBg: 'rgba(174,72,54,0.12)',
        iconColor: '#AE4836',
        valueColor: '#AE4836',
    },
    verde: {
        iconBg: 'rgba(42,78,54,0.12)',
        iconColor: '#2A4E36',
        valueColor: '#2A4E36',
    },
    success: {
        iconBg: 'rgba(74,130,80,0.12)',
        iconColor: '#4a8250',
        valueColor: '#4a8250',
    },
    neutral: {
        iconBg: 'rgba(216,210,188,0.4)',
        iconColor: '#5a5a52',
        valueColor: '#2E1B22',
    },
};

interface CoachStatProps {
    label: string;
    value: ReactNode;
    icon: LucideIcon;
    tone?: StatTone;
    className?: string;
}

export function CoachStat({ label, value, icon: Icon, tone = 'arcilla', className }: CoachStatProps) {
    const s = TONE_STYLES[tone];
    return (
        <div
            className={cn(
                'flex items-center gap-3 rounded-xl border bg-card px-4 py-3.5 transition-shadow duration-200 hover:shadow-sm',
                className,
            )}
        >
            <div
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: s.iconBg }}
            >
                <Icon className="h-5 w-5" style={{ color: s.iconColor }} />
            </div>
            <div className="min-w-0">
                <p
                    className="font-heading text-2xl font-normal leading-none"
                    style={{ color: s.valueColor }}
                >
                    {value}
                </p>
                <p className="mt-0.5 truncate font-body text-xs text-muted-foreground">{label}</p>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// CoachCard — tarjeta con acento lateral de color
// ─────────────────────────────────────────────

interface CoachCardProps {
    accentColor?: string;
    className?: string;
    onClick?: () => void;
    children: ReactNode;
}

export function CoachCard({ accentColor = '#2A4E36', className, onClick, children }: CoachCardProps) {
    return (
        <div
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            onClick={onClick}
            onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
            className={cn(
                'relative overflow-hidden rounded-xl border bg-card pl-3 transition-all duration-200',
                onClick && 'cursor-pointer hover:-translate-y-px hover:shadow-md active:scale-[0.98]',
                className,
            )}
        >
            {/* Barra lateral */}
            <div
                aria-hidden="true"
                className="absolute bottom-0 left-0 top-0 w-1 rounded-l-xl"
                style={{ backgroundColor: accentColor }}
            />
            {children}
        </div>
    );
}

// ─────────────────────────────────────────────
// CoachEmptyState — estado vacío con textura de marca
// ─────────────────────────────────────────────

interface CoachEmptyStateProps {
    icon: LucideIcon;
    title: string;
    description?: string;
    action?: ReactNode;
    className?: string;
}

export function CoachEmptyState({ icon: Icon, title, description, action, className }: CoachEmptyStateProps) {
    return (
        <div className={cn('relative overflow-hidden rounded-2xl border bg-card px-6 py-14 text-center', className)}>
            <CasaShePattern
                className="pointer-events-none absolute inset-0 h-full w-full"
                color="#2A4E36"
                opacity={0.04}
            />
            <div className="relative z-10">
                <div
                    className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: 'rgba(42,78,54,0.1)' }}
                >
                    <Icon className="h-7 w-7" style={{ color: '#2A4E36' }} />
                </div>
                <h3 className="font-heading text-xl" style={{ color: '#2E1B22' }}>
                    {title}
                </h3>
                {description && (
                    <p className="mx-auto mt-2 max-w-xs font-body text-sm text-muted-foreground">{description}</p>
                )}
                {action && <div className="mt-5">{action}</div>}
            </div>
        </div>
    );
}
