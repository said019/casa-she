import { ReactNode, useState, useEffect, Fragment } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    LayoutDashboard,
    Calendar,
    Users,
    CreditCard,
    Gift,
    Settings,
    Dumbbell,
    ChevronRight,
    LogOut,
    Menu,
    Bell,
    ClipboardList,
    BadgeCheck,
    TrendingUp,
    DollarSign,
    CalendarCheck,
    UserPlus,
    Video,
    PartyPopper,
    Tag,
    ShoppingBag,
    X,
    Command,
    PanelLeftClose,
    ArrowLeftRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import CasaSheLogo from '@/components/CasaSheLogo';
import { RECEPTION_ENABLED } from '@/config/features';
import { AdminBreadcrumbs } from '@/components/layout/AdminBreadcrumbs';
import { AdminSearch } from '@/components/admin/AdminSearch';
import api from '@/lib/api';

interface AdminLayoutProps {
    children: ReactNode;
}

type SidebarChild = {
    href?: string;
    label: string;
    kind?: 'header';
};

type SidebarItem = {
    href?: string;
    label: string;
    icon: React.ElementType;
    children?: SidebarChild[];
};

// v1 Casa Shé: menú acotado al core de reservas. Las rutas de módulos fuera de v1
// (eventos, descuentos, videos, caja/POS, lealtad, egresos, nómina, comisiones,
// bitácora, WhatsApp, mapa de salas, rutinas) siguen existiendo pero no se enlazan.
const sidebarItems: SidebarItem[] = [
    { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/calendar', label: 'Calendario', icon: Calendar },
    {
        label: 'Reservas',
        icon: ClipboardList,
        children: [
            { href: '/admin/bookings', label: 'Reservas' },
            { href: '/admin/bookings/waitlist', label: 'Lista de espera' },
        ],
    },
    {
        label: 'Clases',
        icon: Dumbbell,
        children: [
            { href: '/admin/classes/schedules', label: 'Horarios' },
            { href: '/admin/classes/types', label: 'Disciplinas' },
            { href: '/admin/classes/prices', label: 'Precios y paquetes' },
        ],
    },
    {
        label: 'Comunidad',
        icon: Users,
        children: [
            { href: '/admin/members', label: 'Usuarios' },
            { href: '/admin/instructors', label: 'Coaches' },
            // Recepción apagada por feature flag (RECEPTION_ENABLED). Reactivar => reaparece.
            ...(RECEPTION_ENABLED ? [{ href: '/admin/reception', label: 'Recepción' }] : []),
        ],
    },
    {
        label: 'Membresías',
        icon: BadgeCheck,
        children: [
            { href: '/admin/memberships/pending', label: 'Aprobaciones' },
            { href: '/admin/memberships/all', label: 'Activas e historial' },
            { href: '/admin/memberships/paquetes', label: 'Planes' },
        ],
    },
    { href: '/admin/payments', label: 'Pagos', icon: CreditCard },
    {
        label: 'Reportes',
        icon: TrendingUp,
        children: [
            { href: '/admin/reports/overview', label: 'Vista general' },
            { href: '/admin/reports/revenue', label: 'Ingresos' },
            { href: '/admin/reports/retention', label: 'Retención' },
            { href: '/admin/reports/top-clients', label: 'Top clientes' },
            { href: '/admin/reports/membership-movements', label: 'Movimientos de membresías' },
            { href: '/admin/reports/classes', label: 'Clases' },
        ],
    },
    {
        label: 'Ajustes',
        icon: Settings,
        children: [
            { href: '/admin/settings/general', label: 'General' },
            { href: '/admin/settings/studio', label: 'Studio' },
            { href: '/admin/settings/policies', label: 'Políticas' },
            { href: '/admin/settings/cancellations', label: 'Cancelaciones' },
            { href: '/admin/settings/notifications', label: 'Notificaciones' },
            { href: '/admin/settings/closed-days', label: 'Días cerrados' },
        ],
    },
];

const pageNames: Record<string, string> = {
    dashboard: 'Dashboard',
    events: 'Eventos',
    'discount-codes': 'Descuentos',
    calendar: 'Calendario',
    bookings: 'Reservas',
    classes: 'Clases',
    members: 'Comunidad',
    memberships: 'Membresías',
    instructors: 'Coaches',
    videos: 'Contenido',
    pos: 'Caja',
    payments: 'Pagos',
    loyalty: 'Lealtad',
    reports: 'Reportes',
    settings: 'Ajustes',
    products: 'Productos',
};

export function AdminLayout({ children }: AdminLayoutProps) {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [expandedItems, setExpandedItems] = useState<string[]>([]);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [notifOpen, setNotifOpen] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const { user, logout } = useAuthStore();
    const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

    useEffect(() => {
        setMobileMenuOpen(false);
        const activeParents = sidebarItems
            .filter((item) => item.children?.some((child) => child.href && isActivePath(location.pathname, child.href)))
            .map((item) => item.label);
        if (activeParents.length > 0) {
            setExpandedItems((prev) => Array.from(new Set([...prev, ...activeParents])));
        }
    }, [location.pathname]);

    useEffect(() => {
        if (!mobileMenuOpen) return;
        if (window.matchMedia('(min-width: 768px)').matches) return;

        const body = document.body;
        const html = document.documentElement;
        const scrollY = window.scrollY;

        const prev = {
            bodyOverflow: body.style.overflow,
            bodyPosition: body.style.position,
            bodyTop: body.style.top,
            bodyLeft: body.style.left,
            bodyRight: body.style.right,
            bodyWidth: body.style.width,
            htmlOverflow: html.style.overflow,
        };

        html.style.overflow = 'hidden';
        body.style.overflow = 'hidden';
        body.style.position = 'fixed';
        body.style.top = `-${scrollY}px`;
        body.style.left = '0';
        body.style.right = '0';
        body.style.width = '100%';

        return () => {
            html.style.overflow = prev.htmlOverflow;
            body.style.overflow = prev.bodyOverflow;
            body.style.position = prev.bodyPosition;
            body.style.top = prev.bodyTop;
            body.style.left = prev.bodyLeft;
            body.style.right = prev.bodyRight;
            body.style.width = prev.bodyWidth;
            window.scrollTo(0, scrollY);
        };
    }, [mobileMenuOpen]);

    useEffect(() => {
        const fetchNotifications = async () => {
            try {
                const { data } = await api.get('/admin/notifications');
                setNotifications(data.notifications || []);
                setUnreadCount(data.unreadCount || 0);
            } catch {
                // Notifications are auxiliary. The admin shell should still load.
            }
        };
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 60000);
        return () => clearInterval(interval);
    }, []);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const toggleExpand = (label: string, btn?: HTMLElement) => {
        setExpandedItems((prev) =>
            prev.includes(label) ? prev.filter((i) => i !== label) : [...prev, label]
        );
        btn?.blur();
    };

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    };

    const getTimeAgo = (date: Date) => {
        const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
        if (seconds < 60) return 'ahora';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d`;
        return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
    };

    const isActive = (href: string) => isActivePath(location.pathname, href);
    const isParentActive = (children: SidebarChild[]) => children.some((child) => child.href != null && isActive(child.href));

    const sectionName = location.pathname.split('/').filter(Boolean)[1] || 'dashboard';
    const pageTitle = pageNames[sectionName] || 'Admin';

    const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
        <div className="h-full overflow-y-auto overflow-x-hidden px-3 py-4">
            <nav className="space-y-1.5" aria-label="Navegación de administración">
                {sidebarItems.map((item) => {
                    const Icon = item.icon;

                    if (item.children) {
                        const isExpanded = expandedItems.includes(item.label);
                        const hasActiveChild = isParentActive(item.children);

                        return (
                            <div key={item.label}>
                                <button
                                    onClick={(e) => toggleExpand(item.label, e.currentTarget)}
                                    className={cn(
                                        'group flex w-full items-center justify-between rounded-[1rem] px-3 py-2.5 text-sm font-semibold transition-[background,color,transform] duration-200 ease-admin-flow active:scale-[0.99]',
                                        hasActiveChild
                                            ? 'bg-[#DDE4D5] text-balance-dark shadow-[0_14px_34px_-28px_rgba(166,119,106,0.42)]'
                                            : 'text-balance-dark/62 hover:bg-balance-cream/80 hover:text-balance-dark'
                                    )}
                                >
                                    <span className="flex min-w-0 items-center gap-3">
                                        <span className={cn(
                                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.85rem] transition-colors',
                                            hasActiveChild ? 'bg-balance-cream/62 text-[#B5512F]' : 'bg-[#DDE4D5]/35 text-[#B5512F] group-hover:bg-[#DDE4D5]/55'
                                        )}>
                                            <Icon className="h-[18px] w-[18px]" />
                                        </span>
                                        {(!sidebarCollapsed || mobile) && <span className="truncate">{item.label}</span>}
                                    </span>
                                    {(!sidebarCollapsed || mobile) && (
                                        <ChevronRight
                                            className={cn('h-4 w-4 shrink-0 transition-transform duration-200', isExpanded && 'rotate-90')}
                                        />
                                    )}
                                </button>
                                <AnimatePresence initial={false}>
                                    {isExpanded && (!sidebarCollapsed || mobile) && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -4 }}
                                            transition={{ duration: 0.16 }}
                                            className="ml-5 mt-1 space-y-1 border-l border-balance-sand/60 pl-4"
                                        >
                                            {item.children.map((child) => {
                                                if (child.kind === 'header') {
                                                    return (
                                                        <div
                                                            key={`header-${child.label}`}
                                                            className="px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                                                        >
                                                            {child.label}
                                                        </div>
                                                    );
                                                }
                                                return (
                                                    <Link
                                                        key={child.href}
                                                        to={child.href!}
                                                        onClick={() => setMobileMenuOpen(false)}
                                                        className={cn(
                                                            'block rounded-[0.85rem] px-3 py-2 text-sm transition-[background,color,transform] duration-200 active:scale-[0.99]',
                                                            isActive(child.href!)
                                                                ? 'bg-[#DDE4D5]/58 text-balance-dark font-semibold'
                                                                : 'text-balance-dark/56 hover:bg-balance-cream/75 hover:text-balance-dark'
                                                        )}
                                                    >
                                                        {child.label}
                                                    </Link>
                                                );
                                            })}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        );
                    }

                    return (
                        <div key={item.href}>
                            <Link
                                to={item.href!}
                                onClick={() => setMobileMenuOpen(false)}
                                className={cn(
                                    'group flex items-center gap-3 rounded-[1rem] px-3 py-2.5 text-sm font-semibold transition-[background,color,transform] duration-200 ease-admin-flow active:scale-[0.99]',
                                    isActive(item.href!)
                                        ? 'bg-[#DDE4D5] text-balance-dark shadow-[0_14px_34px_-28px_rgba(166,119,106,0.42)]'
                                        : 'text-balance-dark/62 hover:bg-balance-cream/80 hover:text-balance-dark'
                                )}
                            >
                                <span className={cn(
                                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.85rem] transition-colors',
                                    isActive(item.href!) ? 'bg-balance-cream/62 text-[#B5512F]' : 'bg-[#DDE4D5]/35 text-[#B5512F] group-hover:bg-[#DDE4D5]/55'
                                )}>
                                    <Icon className="h-[18px] w-[18px]" />
                                </span>
                                {(!sidebarCollapsed || mobile) && <span className="truncate">{item.label}</span>}
                            </Link>
                        </div>
                    );
                })}
            </nav>
        </div>
    );

    return (
        <div className="admin-shell min-h-screen bg-[hsl(var(--admin-bg))] text-balance-dark">
            <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_14%_6%,rgba(126,133,121,0.26),transparent_34%),radial-gradient(circle_at_82%_12%,rgba(126,133,121,0.16),transparent_28%),radial-gradient(circle_at_72%_88%,rgba(207,200,184,0.42),transparent_32%)]" />

            <aside
                className={cn(
                    'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-balance-sand/55 bg-[hsl(var(--admin-panel))]/95 shadow-[18px_0_55px_-46px_rgba(51,42,34,0.7)] transition-[width] duration-300 ease-admin-flow md:flex pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
                    sidebarCollapsed ? 'w-[5.25rem]' : 'w-[18rem]'
                )}
            >
                <div className="flex h-[5.25rem] items-center justify-between px-4">
                    {!sidebarCollapsed && (
                        <Link to="/admin/dashboard" className="flex min-w-0 items-center gap-3">
                            <CasaSheLogo variant="mark" className="h-9 w-9 text-balance-gold" />
                            <div className="min-w-0">
                                <span className="block truncate text-[0.95rem] font-semibold tracking-[-0.02em] text-balance-dark">Casa Shé</span>
                                <span className="block text-[10px] font-semibold uppercase tracking-[0.24em] text-balance-olive">Studio admin</span>
                            </div>
                        </Link>
                    )}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                        className={cn(
                            'h-10 w-10 rounded-full border border-[#DDE4D5] bg-[#DDE4D5]/40 text-[#B5512F] transition-all duration-200 hover:bg-[#DDE4D5] hover:text-balance-dark active:scale-[0.96]',
                            sidebarCollapsed && 'mx-auto'
                        )}
                        aria-label={sidebarCollapsed ? 'Expandir navegación' : 'Contraer navegación'}
                    >
                        {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                    </Button>
                </div>
                <SidebarContent />
            </aside>

            <AnimatePresence>
                {mobileMenuOpen && (
                    <Fragment>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-40 bg-balance-dark/35 backdrop-blur-sm md:hidden"
                            onClick={() => setMobileMenuOpen(false)}
                        />
                        <motion.aside
                            initial={{ x: '-100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '-100%' }}
                            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                            className="fixed inset-y-0 left-0 z-50 flex w-[19rem] max-w-[88vw] flex-col border-r border-balance-sand/60 bg-[hsl(var(--admin-panel))] shadow-2xl md:hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
                        >
                            <div className="flex h-[5.25rem] items-center justify-between px-4">
                                <Link to="/admin/dashboard" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3">
                                    <CasaSheLogo variant="mark" className="h-9 w-9 text-balance-gold" />
                                    <div>
                                        <span className="block text-sm font-semibold text-balance-dark">Casa Shé</span>
                                        <span className="block text-[10px] uppercase tracking-[0.22em] text-balance-olive">Admin</span>
                                    </div>
                                </Link>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-10 w-10 rounded-full bg-balance-cream/80"
                                    onClick={() => setMobileMenuOpen(false)}
                                    aria-label="Cerrar navegación"
                                >
                                    <X className="h-5 w-5" />
                                </Button>
                            </div>
                            <SidebarContent mobile />
                        </motion.aside>
                    </Fragment>
                )}
            </AnimatePresence>

            <div
                className={cn(
                    'relative flex min-h-screen flex-1 flex-col transition-[padding] duration-300 ease-admin-flow',
                    sidebarCollapsed ? 'md:pl-[5.25rem]' : 'md:pl-[18rem]'
                )}
            >
                <header className="sticky top-0 z-30 border-b border-balance-sand/45 bg-[hsl(var(--admin-bg))]/82 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-xl md:px-6">
                    <div className="mx-auto flex max-w-[1480px] items-center gap-3">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 rounded-full border border-balance-sand/65 bg-balance-cream/70 md:hidden"
                            onClick={() => setMobileMenuOpen(true)}
                            aria-label="Abrir navegación"
                        >
                            <Menu className="h-5 w-5" />
                        </Button>

                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-balance-olive">
                                <Command className="h-3.5 w-3.5" />
                                Operación
                            </div>
                            <h1 className="truncate text-lg font-semibold tracking-[-0.02em] text-balance-dark md:text-xl">
                                {pageTitle}
                            </h1>
                        </div>

                        {isAdmin && (
                            <div className="hidden min-w-[280px] max-w-md flex-1 lg:block">
                                <AdminSearch />
                            </div>
                        )}

                        <div className="flex items-center gap-2">
                            <Popover open={notifOpen} onOpenChange={setNotifOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="relative h-10 w-10 rounded-full border border-balance-sand/65 bg-balance-cream/70 transition-all hover:bg-balance-dark hover:text-balance-cream active:scale-[0.96]"
                                        aria-label="Notificaciones"
                                    >
                                        <Bell className="h-[18px] w-[18px]" />
                                        {unreadCount > 0 && (
                                            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-balance-olive px-1 text-[10px] font-bold text-balance-cream">
                                                {unreadCount > 9 ? '9+' : unreadCount}
                                            </span>
                                        )}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-[1.5rem] border-balance-sand/70 bg-[hsl(var(--admin-panel))] p-0 shadow-[0_24px_70px_-42px_rgba(51,42,34,0.75)]" align="end">
                                    <div className="flex items-center justify-between border-b border-balance-sand/50 px-4 py-3">
                                        <h4 className="text-sm font-semibold text-balance-dark">Actividad reciente</h4>
                                        <span className="rounded-full bg-balance-cream px-2.5 py-1 text-[11px] font-semibold text-balance-dark/60">{unreadCount} nuevas</span>
                                    </div>
                                    <ScrollArea className="h-[380px]">
                                        {notifications.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center px-6 py-12 text-center text-balance-dark/55">
                                                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-[1.1rem] bg-balance-cream">
                                                    <Bell className="h-5 w-5" />
                                                </div>
                                                <p className="text-sm font-medium">Sin actividad reciente</p>
                                            </div>
                                        ) : (
                                            <div className="divide-y divide-balance-sand/45">
                                                {notifications.map((n: any) => {
                                                    const isRecent = new Date(n.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000);
                                                    const icon = n.type === 'payment' ? (
                                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.9rem] bg-balance-olive/12 text-balance-olive">
                                                            <DollarSign className="h-4 w-4" />
                                                        </div>
                                                    ) : n.type === 'membership' ? (
                                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.9rem] bg-balance-sand/35 text-balance-dark">
                                                            <UserPlus className="h-4 w-4" />
                                                        </div>
                                                    ) : (
                                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.9rem] bg-balance-cream text-balance-dark">
                                                            <CalendarCheck className="h-4 w-4" />
                                                        </div>
                                                    );

                                                    const label = n.type === 'payment'
                                                        ? `Pago de $${parseFloat(n.title).toLocaleString('es-MX')} (${n.detail})`
                                                        : n.type === 'membership'
                                                            ? `Membresía "${n.title}" (${n.detail})`
                                                            : `Reserva: ${n.title}`;

                                                    const timeAgo = getTimeAgo(new Date(n.created_at));

                                                    return (
                                                        <button
                                                            key={`${n.type}-${n.id}`}
                                                            className={cn(
                                                                'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-balance-cream/60',
                                                                isRecent && 'bg-balance-olive/5'
                                                            )}
                                                            onClick={() => {
                                                                setNotifOpen(false);
                                                                if (n.user_id) navigate(`/admin/members/${n.user_id}`);
                                                            }}
                                                        >
                                                            {icon}
                                                            <span className="min-w-0 flex-1">
                                                                <span className="block truncate text-sm font-semibold text-balance-dark">{n.user_name}</span>
                                                                <span className="block truncate text-xs text-balance-dark/55">{label}</span>
                                                            </span>
                                                            <span className="mt-0.5 shrink-0 text-[10px] text-balance-dark/45">{timeAgo}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </ScrollArea>
                                </PopoverContent>
                            </Popover>

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" className="relative h-10 w-10 rounded-full p-0 transition-transform active:scale-[0.96]">
                                        <Avatar className="h-10 w-10 border border-balance-sand/70 bg-balance-cream">
                                            <AvatarImage src={user?.photo_url || undefined} alt={user?.display_name} />
                                            <AvatarFallback className="bg-balance-dark text-sm font-semibold text-balance-cream">
                                                {user?.display_name ? getInitials(user.display_name) : 'A'}
                                            </AvatarFallback>
                                        </Avatar>
                                        {user?.is_instructor && (
                                            <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-[hsl(var(--admin-bg))] bg-balance-olive">
                                                <Dumbbell className="h-2.5 w-2.5 text-balance-cream" />
                                            </span>
                                        )}
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="w-64 rounded-[1.25rem] border-balance-sand/70 bg-[hsl(var(--admin-panel))]" align="end" forceMount>
                                    <DropdownMenuLabel className="font-normal">
                                        <div className="flex items-center gap-3 py-1">
                                            <Avatar className="h-10 w-10">
                                                <AvatarImage src={user?.photo_url || undefined} alt={user?.display_name} />
                                                <AvatarFallback className="bg-balance-dark text-balance-cream">
                                                    {user?.display_name ? getInitials(user.display_name) : 'A'}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-semibold leading-none text-balance-dark">{user?.display_name}</p>
                                                <p className="mt-1 truncate text-xs leading-none text-balance-dark/55">{user?.email}</p>
                                                <div className="mt-2 flex flex-wrap items-center gap-1">
                                                    <span className="inline-flex items-center rounded-md bg-balance-olive/10 px-2 py-0.5 text-xs font-semibold capitalize text-balance-olive">
                                                        {user?.role}
                                                    </span>
                                                    {user?.is_instructor && (
                                                        <span className="inline-flex items-center rounded-md bg-balance-sand/40 px-2 py-0.5 text-xs font-semibold text-balance-dark/70">
                                                            Coach
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    {user?.is_instructor && (
                                        <>
                                            <DropdownMenuItem asChild>
                                                <Link to="/admin/calendar" className="cursor-pointer">
                                                    <Calendar className="mr-2 h-4 w-4" />
                                                    <span>Mis clases</span>
                                                </Link>
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                        </>
                                    )}
                                    <DropdownMenuItem asChild>
                                        <Link to="/admin/settings/general" className="cursor-pointer">
                                            <Settings className="mr-2 h-4 w-4" />
                                            <span>Configuración</span>
                                        </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive">
                                        <LogOut className="mr-2 h-4 w-4" />
                                        <span>Cerrar sesión</span>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </header>

                <main className="flex-1 px-4 py-5 md:px-6 md:py-7">
                    <div className="mx-auto max-w-[1480px]">
                        <div className="mb-5">
                            <AdminBreadcrumbs />
                        </div>
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}

function isActivePath(pathname: string, href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
}
