import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import type { User, UserRole } from '@/types/auth';

interface UseAuthReturn {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;
    login: (email: string, password: string) => Promise<void>;
    register: (data: {
        email: string;
        password: string;
        displayName: string;
        phone: string;
        acceptsTerms: boolean;
        acceptsCommunications: boolean;
    }) => Promise<void>;
    logout: () => void;
    clearError: () => void;
}

export function useAuth(): UseAuthReturn {
    const {
        user,
        isAuthenticated,
        isLoading,
        error,
        login: storeLogin,
        register: storeRegister,
        logout: storeLogout,
        checkAuth,
        clearError,
    } = useAuthStore();

    // Check auth on mount
    useEffect(() => {
        checkAuth();
    }, [checkAuth]);

    const login = async (email: string, password: string) => {
        await storeLogin({ email, password });
    };

    const register = async (data: {
        email: string;
        password: string;
        displayName: string;
        phone: string;
        acceptsTerms: boolean;
        acceptsCommunications: boolean;
    }) => {
        await storeRegister(data);
    };

    return {
        user,
        isAuthenticated,
        isLoading,
        error,
        login,
        register,
        logout: storeLogout,
        clearError,
    };
}

// Hook to redirect based on role after login
export function useAuthRedirect() {
    const { user, isAuthenticated, isLoading } = useAuthStore();
    const navigate = useNavigate();

    useEffect(() => {
        if (!isLoading && isAuthenticated && user) {
            // Redirect based on role
            switch (user.role) {
                case 'admin':
                case 'instructor':
                    navigate('/admin/dashboard', { replace: true });
                    break;
                case 'client':
                default:
                    navigate('/app', { replace: true });
                    break;
            }
        }
    }, [isLoading, isAuthenticated, user, navigate]);
}

// Hook to require authentication for a page
export function useRequireAuth(requiredRoles?: UserRole[]) {
    const { user, isAuthenticated, isLoading } = useAuthStore();
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        if (isLoading) return;

        if (!isAuthenticated) {
            // Pass current path as returnUrl so login can redirect back
            navigate(`/login?returnUrl=${encodeURIComponent(location.pathname)}`, { replace: true });
            return;
        }

        if (requiredRoles && user && !requiredRoles.includes(user.role)) {
            // User doesn't have required role, redirect to their dashboard
            if (user.role === 'admin' || user.role === 'instructor') {
                navigate('/admin/dashboard', { replace: true });
            } else {
                navigate('/app', { replace: true });
            }
        }
    }, [isLoading, isAuthenticated, user, requiredRoles, navigate]);

    return { user, isLoading };
}
