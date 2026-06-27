import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useState, type ElementType } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import {
    LayoutDashboard,
    CreditCard,
    ShoppingCart,
    Package,
    UserCheck,
    Users,
    CalendarDays,
    CalendarPlus,
    Wallet,
    BadgeCheck,
    LogOut,
    AlertTriangle,
    Menu,
    X,
    ChevronRight,
    PanelLeftClose,
    Command,
    Settings2,
    MessageCircle,
    Hourglass,
    History,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { effectivePermissions, type PermissionKey } from '@/lib/permissions';
import { MyProfileDialog } from '@/components/reception/MyProfileDialog';
import { AdminSearch } from '@/components/admin/AdminSearch';
import CasaSheLogo from '@/components/CasaSheLogo';

type NavItem = { href: string; label: string; icon: ElementType; exact?: boolean; perm?: PermissionKey };

// v1 Casa Shé: recepción acotada al core (sin Caja/Vender/Inventario/Nómina/WhatsApp).
const allNav: NavItem[] = [
    { href: '/reception', label: 'Dashboard', icon: LayoutDashboard, exact: true },
    { href: '/reception/checkin', label: 'Check-in', icon: UserCheck, perm: 'checkin' },
    { href: '/reception/clientes', label: 'Usuarios', icon: Users, perm: 'clientes' },
    { href: '/reception/reservas', label: 'Reservas', icon: CalendarDays, perm: 'reservas' },
    { href: '/reception/historial', label: 'Historial de reservas', icon: History, perm: 'reservas' },
    { href: '/reception/lista-espera', label: 'Lista de espera', icon: Hourglass, perm: 'reservas' },
    { href: '/reception/calendario', label: 'Calendario', icon: CalendarDays, perm: 'multi_sucursal' },
    { href: '/reception/aprobaciones', label: 'Aprobaciones', icon: BadgeCheck, perm: 'multi_sucursal' },
    { href: '/reception/equipo', label: 'Equipo', icon: Settings2, perm: 'gestionar_permisos' },
];

export default function ReceptionLayout() {
    const location = useLocation();
    const navigate = useNavigate();
    const { logout } = useAuthStore();
    const user = useAuthStore((s) => s.user);
    const perms = effectivePermissions(user?.permissions, user?.is_reception_master === true);
    const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

    const items: NavItem[] = allNav.filter(
        (it) => !it.perm || isAdmin || perms[it.perm] === true,
    );

    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const { data: me } = useQuery({
        queryKey: ['me'],
        queryFn: () => api.get('/auth/me').then((r) => r.data?.user ?? r.data),
    });

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const isActive = (href: string, exact?: boolean) =>
        exact ? location.pathname === href : location.pathname === href || location.pathname.startsWith(`${href}/`);

    const current = items.find((it) => isActive(it.href, it.exact));
    const pageTitle = current?.label ?? 'Recepción';
    const facilityLabel = me?.facility_name || 'Recepción';

    const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
        <div className="h-full overflow-y-auto overflow-x-hidden px-3 py-4">
            <nav className="space-y-1.5" aria-label="Navegación de recepción">
                {items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href, item.exact);
                    return (
                        <Link
                            key={item.href}
                            to={item.href}
                            onClick={() => setMobileMenuOpen(false)}
                            className={cn(
                                'group flex items-center gap-3 rounded-[1rem] px-3 py-2.5 text-sm font-semibold transition-[background,color,transform] duration-200 ease-admin-flow active:scale-[0.99]',
                                active
                                    ? 'bg-[#DDE4D5] text-balance-dark shadow-[0_14px_34px_-28px_rgba(166,119,106,0.42)]'
                                    : 'text-balance-dark/62 hover:bg-balance-cream/80 hover:text-balance-dark',
                            )}
                        >
                            <span
                                className={cn(
                                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.85rem] transition-colors',
                                    active
                                        ? 'bg-balance-cream/62 text-[#AE4836]'
                                        : 'bg-[#DDE4D5]/35 text-[#AE4836] group-hover:bg-[#DDE4D5]/55',
                                )}
                            >
                                <Icon className="h-[18px] w-[18px]" />
                            </span>
                            {(!sidebarCollapsed || mobile) && <span className="truncate">{item.label}</span>}
                        </Link>
                    );
                })}
            </nav>
        </div>
    );

    return (
        <div className="admin-shell min-h-screen bg-[hsl(var(--admin-bg))] text-balance-dark">
            <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_14%_6%,rgba(126,133,121,0.26),transparent_34%),radial-gradient(circle_at_82%_12%,rgba(126,133,121,0.16),transparent_28%),radial-gradient(circle_at_72%_88%,rgba(207,200,184,0.42),transparent_32%)]" />

            {/* Desktop sidebar */}
            <aside
                className={cn(
                    'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-balance-sand/55 bg-[hsl(var(--admin-panel))]/95 shadow-[18px_0_55px_-46px_rgba(51,42,34,0.7)] transition-[width] duration-300 ease-admin-flow md:flex pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
                    sidebarCollapsed ? 'w-[5.25rem]' : 'w-[18rem]',
                )}
            >
                <div className="flex h-[5.25rem] items-center justify-between px-4">
                    {!sidebarCollapsed && (
                        <Link to="/reception" className="flex min-w-0 items-center gap-3">
                            <CasaSheLogo variant="mark" className="h-9 w-9 text-balance-gold" />
                            <div className="min-w-0">
                                <span className="block truncate text-[0.95rem] font-semibold tracking-[-0.02em] text-balance-dark">
                                    Casa Shé
                                </span>
                                <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.24em] text-balance-olive">
                                    {facilityLabel}
                                </span>
                            </div>
                        </Link>
                    )}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                        className={cn(
                            'h-10 w-10 rounded-full border border-[#DDE4D5] bg-[#DDE4D5]/40 text-[#AE4836] transition-all duration-200 hover:bg-[#DDE4D5] hover:text-balance-dark active:scale-[0.96]',
                            sidebarCollapsed && 'mx-auto',
                        )}
                        aria-label={sidebarCollapsed ? 'Expandir navegación' : 'Contraer navegación'}
                    >
                        {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                    </Button>
                </div>
                <SidebarContent />
            </aside>

            {/* Mobile drawer */}
            <AnimatePresence>
                {mobileMenuOpen && (
                    <>
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
                                <Link to="/reception" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3">
                                    <CasaSheLogo variant="mark" className="h-9 w-9 text-balance-gold" />
                                    <div>
                                        <span className="block text-sm font-semibold text-balance-dark">Casa Shé</span>
                                        <span className="block text-[10px] uppercase tracking-[0.22em] text-balance-olive">{facilityLabel}</span>
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
                    </>
                )}
            </AnimatePresence>

            {/* Main column */}
            <div
                className={cn(
                    'relative flex min-h-screen flex-1 flex-col transition-[padding] duration-300 ease-admin-flow',
                    sidebarCollapsed ? 'md:pl-[5.25rem]' : 'md:pl-[18rem]',
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

                        <div className="hidden min-w-[280px] max-w-md flex-1 lg:block">
                            <AdminSearch />
                        </div>

                        <div className="flex items-center gap-2">
                            {me?.display_name && (
                                <span className="hidden text-sm font-semibold text-balance-dark/70 lg:block">
                                    {me.display_name}
                                </span>
                            )}
                            <MyProfileDialog />
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleLogout}
                                className="h-10 w-10 rounded-full border border-balance-sand/65 bg-balance-cream/70 text-balance-dark transition-all hover:bg-balance-olive hover:text-balance-cream active:scale-[0.96]"
                                aria-label="Cerrar sesión"
                            >
                                <LogOut className="h-[18px] w-[18px]" />
                            </Button>
                        </div>
                    </div>
                </header>

                {/* Aviso si la recepción aún no tiene la sede asignada (los master no aplican) */}
                {me?.role === 'reception' && !me?.default_facility_id && !me?.is_reception_master && (
                    <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 md:px-6">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>Pide al admin que active tu acceso a la sede.</span>
                    </div>
                )}

                <main className="flex-1 px-4 py-5 md:px-6 md:py-7">
                    <div className="mx-auto max-w-[1480px]">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
}
