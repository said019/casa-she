import { ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import CasaSheLogo from '@/components/CasaSheLogo';

interface ClientLayoutProps {
    children: ReactNode;
}

/** Ícono Material Symbols (nav/acciones del /app). `filled` = estado activo. */
function MSym({ name, size = 22, filled = false, className }: { name: string; size?: number; filled?: boolean; className?: string }) {
    return (
        <span
            aria-hidden="true"
            className={cn('material-symbols-outlined leading-none', filled && 'filled', className)}
            style={{ fontSize: size }}
        >
            {name}
        </span>
    );
}

// icon = nombre de glifo Material Symbols.
// v1 Casa Shé: sin Eventos ni Videos (fuera de alcance). "Cartera" = créditos + QR de check-in.
const navItems = [
    { href: '/app', label: 'Inicio', icon: 'home' },
    { href: '/app/book', label: 'Reservar', icon: 'calendar_add_on' },
    { href: '/app/classes', label: 'Mis clases', icon: 'event_note' },
    { href: '/app/checkout', label: 'Comprar', icon: 'shopping_bag' },
    { href: '/app/wallet', label: 'Cartera', icon: 'redeem' },
];

// El bottom-nav navega; "Reservar" (acción principal) vive en el FAB.
const bottomNavItems = [
    { href: '/app', label: 'Inicio', icon: 'home' },
    { href: '/app/checkout', label: 'Comprar', icon: 'shopping_bag' },
    { href: '/app/classes', label: 'Clases', icon: 'event_note' },
    { href: '/app/wallet', label: 'Cartera', icon: 'redeem' },
];

export function ClientLayout({ children }: ClientLayoutProps) {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const { user, logout } = useAuthStore();

    // Badge de notificaciones in-app: polling cada 60s mientras la pestaña está activa.
    const { data: unreadData } = useQuery<{ count: number }>({
        queryKey: ['notifications-unread-count'],
        queryFn: async () => (await api.get('/notifications/unread-count')).data,
        refetchInterval: 60_000,
        refetchOnWindowFocus: true,
        enabled: !!user,
    });
    const unreadCount = unreadData?.count ?? 0;

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    };

    const isActivePath = (href: string) => {
        if (href === '/app') return location.pathname === '/app';
        return location.pathname === href || location.pathname.startsWith(`${href}/`);
    };

    return (
        <div className="client-app-shell min-h-screen bg-[hsl(var(--admin-bg))] text-balance-dark">
            <div className="app-radial-bg pointer-events-none fixed inset-0" />

            <header
                className="sticky z-40 w-full border-b border-balance-sand/45 bg-[hsl(var(--admin-bg))]/82 backdrop-blur-xl"
                style={{ top: '0', paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)' }}
            >
                <div className="mx-auto flex h-[4.8rem] max-w-[1480px] items-center justify-between gap-3 px-5 sm:px-8 lg:px-10">
                    <Link to="/app" className="flex min-w-0 items-center gap-3">
                        <CasaSheLogo variant="mark" className="h-10 w-10 text-bmb-gold" />
                        <div className="hidden min-w-0 sm:block">
                            <span className="block truncate font-heading text-xl font-medium leading-none tracking-[-0.02em] text-bmb-dark">
                                Casa Shé
                            </span>
                            <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.25em] text-bmb-gold">
                                La comunidad es la medicina
                            </span>
                        </div>
                    </Link>

                    <nav className="hidden items-center gap-1 rounded-full border border-balance-sand/55 bg-[hsl(var(--admin-panel))]/80 p-1.5 backdrop-blur lg:flex">
                        {navItems.map((item) => {
                            const isActive = isActivePath(item.href);
                            return (
                                <Link
                                    key={item.href}
                                    to={item.href}
                                    className={cn(
                                        'flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition-[background,color,transform] duration-200 ease-admin-flow active:scale-[0.98]',
                                        isActive
                                            ? 'bg-[#E6D0CA] text-balance-dark app-soft-shadow'
                                            : 'text-balance-dark/58 hover:bg-balance-cream/80 hover:text-balance-dark'
                                    )}
                                >
                                    <MSym name={item.icon} size={20} filled={isActive} />
                                    <span>{item.label}</span>
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 rounded-full border border-balance-sand/65 bg-balance-cream/70 text-balance-dark transition-all hover:bg-balance-olive hover:text-balance-cream active:scale-[0.96]"
                            asChild
                        >
                            <Link to="/app/notifications" aria-label={unreadCount > 0 ? `Notificaciones (${unreadCount} sin leer)` : 'Notificaciones'} className="relative">
                                <MSym name="notifications" size={22} />
                                {unreadCount > 0 && (
                                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-balance-olive text-balance-cream text-[10px] font-bold flex items-center justify-center leading-none">
                                        {unreadCount > 9 ? '9+' : unreadCount}
                                    </span>
                                )}
                            </Link>
                        </Button>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="relative h-11 w-11 rounded-full p-0 transition-transform active:scale-[0.96]">
                                    <Avatar className="h-11 w-11 border border-balance-sand/70 bg-balance-cream">
                                        <AvatarImage src={user?.photo_url || undefined} alt={user?.display_name} />
                                        <AvatarFallback className="bg-balance-gold text-sm font-semibold text-balance-cream">
                                            {user?.display_name ? getInitials(user.display_name) : 'U'}
                                        </AvatarFallback>
                                    </Avatar>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-60 max-w-[90vw] rounded-[1.25rem] border-balance-sand/70 bg-[hsl(var(--admin-panel))] sm:w-64" align="end" forceMount>
                                <DropdownMenuLabel className="font-normal">
                                    <div className="flex items-center gap-3 py-1">
                                        <Avatar className="h-10 w-10">
                                            <AvatarImage src={user?.photo_url || undefined} alt={user?.display_name} />
                                            <AvatarFallback className="bg-balance-gold text-balance-cream">
                                                {user?.display_name ? getInitials(user.display_name) : 'U'}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-semibold leading-none text-balance-dark">{user?.display_name}</p>
                                            <p className="mt-1 truncate text-xs leading-none text-balance-dark/55">{user?.email}</p>
                                        </div>
                                    </div>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild>
                                    <Link to="/app/profile" className="cursor-pointer">
                                        <MSym name="person" size={18} className="mr-2" />
                                        <span>Mi perfil</span>
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <Link to="/app/orders" className="cursor-pointer">
                                        <MSym name="receipt_long" size={18} className="mr-2" />
                                        <span>Mis órdenes</span>
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive">
                                    <MSym name="logout" size={18} className="mr-2" />
                                    <span>Cerrar sesión</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 rounded-full border border-balance-sand/65 bg-balance-cream/70 text-balance-dark transition-all hover:bg-balance-cream active:scale-[0.96] lg:hidden"
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            aria-label="Abrir navegación"
                        >
                            <MSym name={mobileMenuOpen ? 'close' : 'menu'} size={22} />
                        </Button>
                    </div>
                </div>

                {mobileMenuOpen && (
                    <nav className="border-t border-balance-sand/45 bg-[hsl(var(--admin-panel))]/96 p-4 backdrop-blur-xl lg:hidden">
                        <div className="mx-auto grid max-w-[1480px] gap-2 sm:grid-cols-2">
                            {navItems.map((item) => {
                                const isActive = isActivePath(item.href);
                                return (
                                    <Link
                                        key={item.href}
                                        to={item.href}
                                        onClick={() => setMobileMenuOpen(false)}
                                        className={cn(
                                            'flex items-center justify-between rounded-[1rem] px-3 py-3 text-sm font-semibold transition-[background,color,transform] duration-200 ease-admin-flow active:scale-[0.99]',
                                            isActive
                                                ? 'bg-[#E6D0CA] text-balance-dark app-soft-shadow'
                                                : 'text-balance-dark/64 hover:bg-balance-cream/80 hover:text-balance-dark'
                                        )}
                                    >
                                        <span className="flex items-center gap-3">
                                            <span className={cn(
                                                'flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.85rem] transition-colors',
                                                isActive ? 'bg-balance-cream/62 text-[#AD6C20]' : 'bg-[#E6D0CA]/35 text-[#AD6C20]'
                                            )}>
                                                <MSym name={item.icon} size={20} filled={isActive} />
                                            </span>
                                            <span>{item.label}</span>
                                        </span>
                                        <ChevronRight className="h-4 w-4" />
                                    </Link>
                                );
                            })}
                        </div>
                    </nav>
                )}
            </header>

            <main className="relative mx-auto max-w-[1480px] px-5 pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))] pt-5 sm:px-8 sm:py-7 lg:px-10 lg:pb-9">
                {children}
            </main>

            <nav
                className="fixed bottom-0 left-0 right-0 z-50 border-t border-balance-sand/45 bg-[hsl(var(--admin-panel))]/92 shadow-[0_-24px_60px_-42px_rgba(42,33,24,0.85)] backdrop-blur-xl lg:hidden"
                style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            >
                <div className="grid grid-cols-4 gap-1 px-2 py-2">
                    {bottomNavItems.map((item) => {
                        const isActive = isActivePath(item.href);
                        return (
                            <Link
                                key={item.href}
                                to={item.href}
                                className={cn(
                                    'relative flex min-w-0 flex-col items-center gap-0.5 rounded-[1rem] px-1 py-2 text-xs font-semibold transition-[background,color,transform] duration-200 ease-admin-flow active:scale-[0.96]',
                                    isActive ? 'bg-[#E6D0CA] text-balance-dark app-soft-shadow' : 'text-balance-dark/52 hover:text-balance-dark'
                                )}
                            >
                                <MSym name={item.icon} size={24} filled={isActive} />
                                <span className="truncate">{item.label}</span>
                            </Link>
                        );
                    })}
                </div>
            </nav>

            {/* FAB "Reservar" (acción principal, solo móvil) — patrón del rediseño */}
            {!location.pathname.startsWith('/app/book') && (
                <Link
                    to="/app/book"
                    aria-label="Reservar clase"
                    className="fixed right-5 z-50 flex items-center gap-2 rounded-full bg-balance-olive px-5 py-3.5 font-semibold text-balance-cream shadow-[0_18px_40px_-16px_rgba(206,155,37,0.75)] transition-transform active:scale-[0.96] lg:hidden"
                    style={{ bottom: 'calc(5.2rem + env(safe-area-inset-bottom, 0px))' }}
                >
                    <MSym name="calendar_add_on" size={22} />
                    <span className="text-sm">Reservar</span>
                </Link>
            )}
        </div>
    );
}
