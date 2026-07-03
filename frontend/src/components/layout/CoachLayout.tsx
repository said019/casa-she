import { ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    LayoutDashboard,
    Calendar,
    User,
    LogOut,
    Menu,
    X,
    History,
    UserCheck,
    Music,
    Dumbbell,
    Wallet,
    Users,
    TrendingUp,
    ChevronDown,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import CasaSheLogo from '@/components/CasaSheLogo';
import { CasaShePattern } from '@/components/CasaShePattern';

interface CoachLayoutProps {
    children: ReactNode;
}

// Ítems planos — se usan en el drawer mobile
const NAV_FLAT = [
    { name: 'Dashboard', href: '/coach', icon: LayoutDashboard },
    { name: 'Mi Horario', href: '/coach/schedule', icon: Calendar },
    { name: 'Historial', href: '/coach/history', icon: History },
    { name: 'Mis Alumnas', href: '/coach/students', icon: Users },
    { name: 'Tendencias', href: '/coach/trends', icon: TrendingUp },
    { name: 'Sustituciones', href: '/coach/substitutions', icon: UserCheck },
    { name: 'Playlists', href: '/coach/playlists', icon: Music },
    { name: 'Plantillas', href: '/coach/templates', icon: Dumbbell },
    { name: 'Mis Ingresos', href: '/coach/earnings', icon: Wallet },
    { name: 'Mi Perfil', href: '/coach/profile', icon: User },
];

// Grupos para el nav desktop con dropdowns
const NAV_GROUPS = [
    { name: 'Dashboard', href: '/coach', icon: LayoutDashboard, items: [] },
    { name: 'Mi Horario', href: '/coach/schedule', icon: Calendar, items: [] },
    { name: 'Sustituciones', href: '/coach/substitutions', icon: UserCheck, items: [] },
    {
        name: 'Clases',
        icon: History,
        items: [
            { name: 'Historial', href: '/coach/history', icon: History },
            { name: 'Mis Alumnas', href: '/coach/students', icon: Users },
        ],
    },
    {
        name: 'Finanzas',
        icon: Wallet,
        items: [
            { name: 'Mis Ingresos', href: '/coach/earnings', icon: Wallet },
            { name: 'Tendencias', href: '/coach/trends', icon: TrendingUp },
        ],
    },
    {
        name: 'Recursos',
        icon: Music,
        items: [
            { name: 'Playlists', href: '/coach/playlists', icon: Music },
            { name: 'Plantillas', href: '/coach/templates', icon: Dumbbell },
        ],
    },
];

// Estilos para links del header oscuro
const LINK_BASE =
    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-body text-sm transition-colors duration-150';
const LINK_ACTIVE = 'bg-white/10 text-[#F6F0E4]';
const LINK_INACTIVE = 'text-[#F6F0E4]/60 hover:bg-white/7 hover:text-[#F6F0E4]/90';

function isPathActive(href: string | undefined, pathname: string): boolean {
    if (!href) return false;
    if (href === '/coach') return pathname === '/coach';
    return pathname.startsWith(href);
}

function isGroupActive(group: (typeof NAV_GROUPS)[0], pathname: string): boolean {
    if (group.href) return isPathActive(group.href, pathname);
    return group.items.some((item) => isPathActive(item.href, pathname));
}

function getInitials(name: string) {
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function CoachLayout({ children }: CoachLayoutProps) {
    const [mobileOpen, setMobileOpen] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const { user, logout } = useAuthStore();

    const handleLogout = () => {
        logout();
        navigate('/coach/login');
    };

    return (
        <div className="min-h-screen bg-background">
            {/* ── Sticky header ── */}
            <header
                className="sticky top-0 z-40 overflow-hidden border-b border-white/10 pt-[env(safe-area-inset-top)]"
                style={{ backgroundColor: '#16261A' }}
            >
                {/* Patrón de marca como textura sutil */}
                <CasaShePattern
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    color="#F6F0E4"
                    opacity={0.06}
                />

                <div className="relative z-10 mx-auto max-w-7xl px-4">
                    <div className="flex h-16 items-center justify-between gap-4">
                        {/* Izquierda: hamburger mobile + logo */}
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-white/10 md:hidden"
                                style={{ color: '#F6F0E4' }}
                                onClick={() => setMobileOpen(true)}
                                aria-label="Abrir menú"
                            >
                                <Menu className="h-5 w-5" />
                            </button>

                            <Link to="/coach" className="flex items-center gap-2.5">
                                <CasaSheLogo variant="mark" tone="cream" className="h-8 w-8" />
                                <span
                                    className="hidden font-heading text-lg sm:block"
                                    style={{ color: '#F6F0E4' }}
                                >
                                    Casa Shé
                                </span>
                                <span
                                    className="rounded-md px-2 py-0.5 font-body text-[10px] font-semibold uppercase tracking-[2px]"
                                    style={{ backgroundColor: 'rgba(174,72,54,0.25)', color: '#AE4836' }}
                                >
                                    Coach
                                </span>
                            </Link>
                        </div>

                        {/* Centro: nav desktop con grupos */}
                        <nav className="hidden flex-1 items-center justify-center gap-0.5 md:flex">
                            {NAV_GROUPS.map((group) => {
                                const active = isGroupActive(group, location.pathname);

                                if (!group.items.length && group.href) {
                                    return (
                                        <Link
                                            key={group.name}
                                            to={group.href}
                                            className={cn(LINK_BASE, active ? LINK_ACTIVE : LINK_INACTIVE)}
                                        >
                                            <group.icon className="h-3.5 w-3.5" />
                                            {group.name}
                                        </Link>
                                    );
                                }

                                return (
                                    <DropdownMenu key={group.name}>
                                        <DropdownMenuTrigger asChild>
                                            <button
                                                type="button"
                                                className={cn(LINK_BASE, active ? LINK_ACTIVE : LINK_INACTIVE)}
                                            >
                                                <group.icon className="h-3.5 w-3.5" />
                                                {group.name}
                                                <ChevronDown className="h-3 w-3 opacity-60" />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent
                                            align="center"
                                            sideOffset={8}
                                            className="min-w-[160px]"
                                        >
                                            {group.items.map((item) => (
                                                <DropdownMenuItem key={item.href} asChild>
                                                    <Link
                                                        to={item.href}
                                                        className={cn(
                                                            'flex items-center gap-2 cursor-pointer',
                                                            isPathActive(item.href, location.pathname) &&
                                                                'font-semibold text-primary',
                                                        )}
                                                    >
                                                        <item.icon className="h-4 w-4 opacity-60" />
                                                        {item.name}
                                                    </Link>
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                );
                            })}
                        </nav>

                        {/* Derecha: avatar dropdown */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors duration-150 hover:bg-white/10"
                                >
                                    <Avatar className="h-8 w-8">
                                        <AvatarImage src={user?.photo_url ?? undefined} alt={user?.display_name} />
                                        <AvatarFallback
                                            className="text-xs font-semibold"
                                            style={{ backgroundColor: 'rgba(174,72,54,0.3)', color: '#F6F0E4' }}
                                        >
                                            {getInitials(user?.display_name ?? 'C')}
                                        </AvatarFallback>
                                    </Avatar>
                                    <ChevronDown className="hidden h-3.5 w-3.5 sm:block" style={{ color: 'rgba(246,240,228,0.5)' }} />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52" sideOffset={8}>
                                <DropdownMenuLabel className="font-normal">
                                    <p className="text-sm font-medium">{user?.display_name}</p>
                                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild>
                                    <Link to="/coach/profile" className="flex items-center gap-2 cursor-pointer">
                                        <User className="h-4 w-4" />
                                        Mi Perfil
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    className="text-destructive focus:text-destructive cursor-pointer"
                                    onClick={handleLogout}
                                >
                                    <LogOut className="mr-2 h-4 w-4" />
                                    Cerrar Sesión
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </header>

            {/* ── Drawer mobile ── */}
            {mobileOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
                        onClick={() => setMobileOpen(false)}
                        aria-hidden="true"
                    />

                    {/* Panel */}
                    <div
                        className="fixed inset-y-0 left-0 z-50 w-72 overflow-y-auto pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] md:hidden"
                        style={{
                            backgroundColor: '#16261A',
                            animation: 'slideInLeft 220ms cubic-bezier(0.32, 0.72, 0, 1) both',
                        }}
                    >
                        {/* Textura */}
                        <CasaShePattern
                            className="pointer-events-none absolute inset-0 h-full w-full"
                            color="#F6F0E4"
                            opacity={0.06}
                        />

                        <div className="relative z-10 flex flex-col h-full">
                            {/* Drawer header */}
                            <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
                                <div className="flex items-center gap-2.5">
                                    <CasaSheLogo variant="mark" tone="cream" className="h-8 w-8" />
                                    <span className="font-heading text-base" style={{ color: '#F6F0E4' }}>Casa Shé</span>
                                </div>
                                <button
                                    type="button"
                                    className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/10"
                                    style={{ color: 'rgba(246,240,228,0.7)' }}
                                    onClick={() => setMobileOpen(false)}
                                    aria-label="Cerrar menú"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            {/* Nav items */}
                            <nav className="flex-1 px-3 py-4 space-y-0.5">
                                {NAV_FLAT.map((item) => {
                                    const active = isPathActive(item.href, location.pathname);
                                    return (
                                        <Link
                                            key={item.href}
                                            to={item.href}
                                            onClick={() => setMobileOpen(false)}
                                            className={cn(
                                                'flex items-center gap-3 rounded-xl px-3 py-2.5 font-body text-sm transition-colors duration-150',
                                                active
                                                    ? 'bg-white/10 text-[#F6F0E4]'
                                                    : 'text-[#F6F0E4]/55 hover:bg-white/7 hover:text-[#F6F0E4]/85',
                                            )}
                                        >
                                            <item.icon
                                                className="h-4.5 w-4.5 flex-shrink-0"
                                                style={{ color: active ? '#AE4836' : undefined }}
                                            />
                                            {item.name}
                                        </Link>
                                    );
                                })}
                            </nav>

                            {/* Logout */}
                            <div className="border-t border-white/10 p-3">
                                <button
                                    type="button"
                                    onClick={handleLogout}
                                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 font-body text-sm transition-colors duration-150"
                                    style={{ color: 'rgba(246,240,228,0.5)' }}
                                >
                                    <LogOut className="h-4 w-4 flex-shrink-0" />
                                    Cerrar Sesión
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* ── Contenido ── */}
            <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
                {children}
            </main>

            {/* Keyframe del drawer en CSS inline */}
            <style>{`
                @keyframes slideInLeft {
                    from { transform: translateX(-100%); }
                    to   { transform: translateX(0); }
                }
            `}</style>
        </div>
    );
}
