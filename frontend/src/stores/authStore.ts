import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api, { setStoredToken, removeStoredToken, getStoredToken } from '@/lib/api';
import type { User, LoginCredentials, RegisterData, AuthResponse } from '@/types/auth';

interface AuthState {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;

    // Actions
    login: (credentials: LoginCredentials) => Promise<void>;
    register: (data: RegisterData) => Promise<void>;
    logout: () => void;
    checkAuth: () => Promise<void>;
    clearError: () => void;
    updateUser: (user: User) => void;
    setAuth: (user: User, token: string) => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            user: null,
            token: getStoredToken(),
            isAuthenticated: false,
            isLoading: true,
            error: null,

            login: async (credentials: LoginCredentials) => {
                set({ isLoading: true, error: null });
                try {
                    const response = await api.post<AuthResponse>('/auth/login', credentials);
                    const { user, token } = response.data;

                    setStoredToken(token);
                    set({
                        user,
                        token,
                        isAuthenticated: true,
                        isLoading: false,
                        error: null,
                    });
                } catch (error: any) {
                    const message = error.response?.data?.message || error.response?.data?.error || 'Error al iniciar sesión';
                    set({ isLoading: false, error: message });
                    throw new Error(message);
                }
            },

            register: async (data: RegisterData) => {
                set({ isLoading: true, error: null });
                try {
                    const response = await api.post<AuthResponse>('/auth/register', data);
                    const { user, token } = response.data;

                    setStoredToken(token);
                    set({
                        user,
                        token,
                        isAuthenticated: true,
                        isLoading: false,
                        error: null,
                    });
                } catch (error: any) {
                    const message = error.response?.data?.message || error.response?.data?.error || 'Error al crear cuenta';
                    set({ isLoading: false, error: message });
                    throw new Error(message);
                }
            },

            logout: () => {
                removeStoredToken();
                set({
                    user: null,
                    token: null,
                    isAuthenticated: false,
                    isLoading: false,
                    error: null,
                });
            },

            checkAuth: async () => {
                const token = getStoredToken();
                if (!token) {
                    set({ isLoading: false, isAuthenticated: false, user: null });
                    return;
                }

                try {
                    const response = await api.get<{ user: User }>('/auth/me');
                    set({
                        user: response.data.user,
                        token,
                        isAuthenticated: true,
                        isLoading: false,
                    });
                } catch {
                    removeStoredToken();
                    set({
                        user: null,
                        token: null,
                        isAuthenticated: false,
                        isLoading: false,
                    });
                }
            },

            clearError: () => set({ error: null }),

            updateUser: (user: User) => set({ user }),

            setAuth: (user: User, token: string) => {
                setStoredToken(token);
                set({
                    user,
                    token,
                    isAuthenticated: true,
                    isLoading: false,
                    error: null,
                });
            },
        }),
        {
            name: 'auth-storage',
            partialize: (state) => ({
                user: state.user,
                token: state.token,
                isAuthenticated: state.isAuthenticated,
            }),
        }
    )
);
