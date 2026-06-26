import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import type { ApiError } from '@/types/auth';

// API base URL - change in production
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Create axios instance
const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
    withCredentials: true,
});

// Token storage key
const TOKEN_KEY = 'casashe_token';
// Admin API token (separate from JWT) used by /evolution endpoints in the Casa Shé API
const ADMIN_TOKEN_KEY = 'bmb_studio_admin_token';

export function getAdminApiToken(): string | null {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminApiToken(token: string): void {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function removeAdminApiToken(): void {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
}

// Get stored token
export function getStoredToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

// Store token
export function setStoredToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
}

// Remove token
export function removeStoredToken(): void {
    localStorage.removeItem(TOKEN_KEY);
}

// Request interceptor - add auth token
api.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        const token = getStoredToken();
        if (token && config.headers) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        // Attach admin token for /evolution/* endpoints (Casa Shé API)
        const adminToken = getAdminApiToken();
        if (adminToken && config.headers && (config.url || '').startsWith('/evolution')) {
            config.headers['x-admin-token'] = adminToken;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor - handle errors
api.interceptors.response.use(
    (response) => response,
    (error: AxiosError<ApiError>) => {
        // Handle 401 - unauthorized
        if (error.response?.status === 401) {
            const reqUrl = (error.config?.url || '').toString();
            // NO botar la sesión cuando el 401 es de un INTENTO DE LOGIN/credencial
            // (/auth/login, /auth/coach/login, registro, cambio de contraseña, etc.):
            // ahí 401 = "contraseña incorrecta" y lo maneja la propia pantalla. Antes esto
            // mandaba al coach con contraseña mala al /login del studio. /auth/me sí significa
            // sesión vencida → sí redirige. /evolution usa token admin, no sesión de usuario.
            const isCredentialAttempt = reqUrl.startsWith('/auth/') && !reqUrl.startsWith('/auth/me');
            if (!reqUrl.startsWith('/evolution') && !isCredentialAttempt) {
                removeStoredToken();
                const path = window.location.pathname;
                // Redirigir al login del ÁREA correcta: coach → /coach/login; resto → /login.
                const loginPath = path.startsWith('/coach') ? '/coach/login' : '/login';
                if (path !== loginPath) {
                    window.location.href = loginPath;
                }
            }
        }
        return Promise.reject(error);
    }
);

export default api;

// Helper to extract error message
export function getErrorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
        const apiError = error.response?.data as ApiError;
        return apiError?.message || apiError?.error || 'Error de conexión';
    }
    if (error instanceof Error) {
        return error.message;
    }
    return 'Error desconocido';
}
