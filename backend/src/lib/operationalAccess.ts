import type { UserRole } from '../types/auth.js';

/** Recepción comparte la autoridad operativa de admin; Reportes se exceptúa. */
export function operationalRole(role: UserRole): UserRole {
    return role === 'reception' ? 'admin' : role;
}

export function isReportRole(role: string | null | undefined): boolean {
    return role === 'admin' || role === 'super_admin';
}
