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
    ChevronLeft,
    History,
    UserCheck,
    Music,
    Dumbbell,
    Wallet,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import CasaSheLogo from '@/components/CasaSheLogo';

interface CoachLayoutProps {
    children: ReactNode;
}

const navigation = [
    { name: 'Dashboard', href: '/coach', icon: LayoutDashboard },
    { name: 'Mi Horario', href: '/coach/schedule', icon: Calendar },
    { name: 'Historial', href: '/coach/history', icon: History },
    { name: 'Sustituciones', href: '/coach/substitutions', icon: UserCheck },
    { name: 'Playlists', href: '/coach/playlists', icon: Music },
    { name: 'Plantillas', href: '/coach/templates', icon: Dumbbell },
    { name: 'Mis Ingresos', href: '/coach/earnings', icon: Wallet },
    { name: 'Mi Perfil', href: '/coach/profile', icon: User },
];

export default function CoachLayout({ children }: CoachLayoutProps) {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const { user, logout } = useAuthStore();

    const handleLogout = () => {
        logout();
        // Volver al login de COACH, no al de cliente.
        navigate('/coach/login');
    };

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    };

    return (
        <div className="min-h-screen bg-background">
            {/* Top Navigation */}
            <header className="sticky top-0 z-40 bg-card border-b pt-[env(safe-area-inset-top)]">
                <div className="container mx-auto px-4">
                    <div className="flex h-16 items-center justify-between">
                        {/* Left side - Logo and nav */}
                        <div className="flex items-center gap-4">
                            {/* Mobile menu button */}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="md:hidden"
                                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            >
                                {mobileMenuOpen ? (
                                    <X className="h-5 w-5" />
                                ) : (
                                    <Menu className="h-5 w-5" />
                                )}
                            </Button>

                            {/* Logo */}
                            <Link to="/coach" className="flex items-center space-x-2.5">
                                <CasaSheLogo variant="mark" className="h-8 w-8 text-balance-gold" />
                                <span className="font-heading text-xl font-bold text-balance-gold">Casa Shé</span>
                                <span className="text-[10px] font-body font-semibold text-balance-gold uppercase tracking-[2px] bg-balance-gold/10 px-2.5 py-1 rounded-lg">
                                    Coach
                                </span>
                            </Link>

                            {/* Desktop Navigation */}
                            <nav className="hidden md:flex items-center gap-1 ml-6">
                                {navigation.map((item) => {
                                    const isActive = location.pathname === item.href ||
                                        (item.href !== '/coach' && location.pathname.startsWith(item.href));
                                    return (
                                        <Link
                                            key={item.name}
                                            to={item.href}
                                            className={cn(
                                                'flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl transition-all duration-200',
                                                isActive
                                                    ? 'bg-balance-gold/10 text-balance-gold'
                                                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                                            )}
                                        >
                                            <item.icon className="h-4 w-4" />
                                            {item.name}
                                        </Link>
                                    );
                                })}
                            </nav>
                        </div>

                        {/* Right side - User menu */}
                        <div className="flex items-center gap-4">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                                        <Avatar className="h-10 w-10">
                                            <AvatarImage src={user?.photo_url || undefined} alt={user?.display_name} />
                                            <AvatarFallback className="bg-primary/10 text-primary">
                                                {getInitials(user?.display_name || 'U')}
                                            </AvatarFallback>
                                        </Avatar>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="w-56" align="end">
                                    <DropdownMenuLabel className="font-normal">
                                        <div className="flex flex-col space-y-1">
                                            <p className="text-sm font-medium">{user?.display_name}</p>
                                            <p className="text-xs text-muted-foreground">{user?.email}</p>
                                        </div>
                                    </DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem asChild>
                                        <Link to="/coach/profile" className="cursor-pointer">
                                            <User className="mr-2 h-4 w-4" />
                                            Mi Perfil
                                        </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        className="text-destructive cursor-pointer"
                                        onClick={handleLogout}
                                    >
                                        <LogOut className="mr-2 h-4 w-4" />
                                        Cerrar Sesión
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </div>
            </header>

            {/* Mobile Navigation Drawer */}
            {mobileMenuOpen && (
                <>
                    <div
                        className="fixed inset-0 z-30 bg-black/50 md:hidden"
                        onClick={() => setMobileMenuOpen(false)}
                    />
                    <div className="fixed inset-y-0 left-0 z-40 w-64 bg-card border-r md:hidden animate-in slide-in-from-left pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
                        <div className="flex flex-col h-full">
                            <div className="flex h-16 items-center justify-between border-b px-4">
                                <div className="flex items-center space-x-2">
                                    <CasaSheLogo variant="mark" className="h-8 w-8 text-balance-gold" />
                                    <span className="font-heading text-lg font-bold text-balance-gold">Casa Shé</span>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setMobileMenuOpen(false)}
                                >
                                    <X className="h-5 w-5" />
                                </Button>
                            </div>
                            <nav className="flex-1 p-4 space-y-1">
                                {navigation.map((item) => {
                                    const isActive = location.pathname === item.href ||
                                        (item.href !== '/coach' && location.pathname.startsWith(item.href));
                                    return (
                                        <Link
                                            key={item.name}
                                            to={item.href}
                                            onClick={() => setMobileMenuOpen(false)}
                                            className={cn(
                                                'flex items-center gap-3 px-3 py-3 text-sm font-medium rounded-xl transition-all duration-200',
                                                isActive
                                                    ? 'bg-balance-gold/10 text-balance-gold'
                                                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                                            )}
                                        >
                                            <item.icon className="h-5 w-5" />
                                            {item.name}
                                        </Link>
                                    );
                                })}
                            </nav>
                            <div className="p-4 border-t">
                                <Button
                                    variant="ghost"
                                    className="w-full justify-start text-destructive"
                                    onClick={handleLogout}
                                >
                                    <LogOut className="mr-2 h-4 w-4" />
                                    Cerrar Sesión
                                </Button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Main Content */}
            <main className="container mx-auto px-4 py-6">
                {children}
            </main>
        </div>
    );
}
