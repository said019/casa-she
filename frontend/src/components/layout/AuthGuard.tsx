import { ReactNode, useEffect } from 'react';
import { useNavigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import type { UserRole } from '@/types/auth';
import { Loader2 } from 'lucide-react';
import { OnboardingGate } from '@/components/OnboardingGate';
import { ProfilerGate } from '@/components/onboarding/ProfilerGate';

interface AuthGuardProps {
    children?: ReactNode; // Make optional
    requiredRoles?: UserRole[];
    redirectTo?: string;
    /**
     * Si true, además de los roles requeridos también permite el acceso a
     * recepcionistas elevados (is_reception_master = true). Espeja la noción
     * "elevated" del backend.
     */
    allowElevated?: boolean;
}

function isElevatedUser(user: ReturnType<typeof useAuthStore.getState>['user']): boolean {
    if (!user) return false;
    if (user.role === 'admin' || user.role === 'super_admin') return true;
    if (user.role === 'reception' && user.is_reception_master === true) return true;
    return false;
}

export function AuthGuard({ children, requiredRoles, redirectTo = '/login', allowElevated = false }: AuthGuardProps) {
    const navigate = useNavigate();
    const { user, isAuthenticated, isLoading, checkAuth } = useAuthStore();

    // Check auth on mount
    useEffect(() => {
        checkAuth();
    }, [checkAuth]);

    // Handle redirects
    useEffect(() => {
        if (isLoading) return;

        // Not authenticated. Las páginas /coach/* mandan al login de coach, no al de cliente.
        if (!isAuthenticated) {
            const dest = redirectTo === '/login' && window.location.pathname.startsWith('/coach')
                ? '/coach/login'
                : redirectTo;
            navigate(dest, { replace: true });
            return;
        }

        // Check role if specified — elevated users bypass the role check when allowElevated.
        if (requiredRoles && user && !requiredRoles.includes(user.role)) {
            if (allowElevated && isElevatedUser(user)) {
                return; // allowed through
            }
            // Redirect to appropriate dashboard based on role
            if (user.role === 'admin' || user.role === 'super_admin') {
                navigate('/admin/dashboard', { replace: true });
            } else if (user.role === 'instructor') {
                navigate('/coach', { replace: true });
            } else if (user.role === 'reception') {
                navigate('/reception', { replace: true });
            } else {
                navigate('/app', { replace: true });
            }
        }
    }, [isLoading, isAuthenticated, user, requiredRoles, allowElevated, navigate, redirectTo]);

    // Show loading while checking auth
    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-muted-foreground">Cargando...</p>
                </div>
            </div>
        );
    }

    // Not authenticated or wrong role
    if (!isAuthenticated) {
        return null;
    }

    if (requiredRoles && user && !requiredRoles.includes(user.role)) {
        if (!(allowElevated && isElevatedUser(user))) {
            return null;
        }
    }

    // Primer ingreso con contraseña temporal: forzar completar acceso antes de usar la app.
    if (user?.temp_password) {
        return <OnboardingGate />;
    }

    // Perfilador obligatorio para clientas nuevas: bloquea la app hasta completarlo.
    if (user?.role === 'client' && user?.onboarding_required && !user?.onboarding_completed_at) {
        return <ProfilerGate />;
    }

    // Render children if provided (wrapper mode), otherwise Outlet (layout mode)
    return children ? <>{children}</> : <Outlet />;
}

// HOC version for simpler usage
export function withAuthGuard<P extends object>(
    Component: React.ComponentType<P>,
    requiredRoles?: UserRole[]
) {
    return function WrappedComponent(props: P) {
        return (
            <AuthGuard requiredRoles={requiredRoles}>
                <Component {...props} />
            </AuthGuard>
        );
    };
}
