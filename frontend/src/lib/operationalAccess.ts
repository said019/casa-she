import type { User, UserRole } from '@/types/auth';

/** Recepción usa los controles de admin; `account_role` preserva el bloqueo de Reportes. */
export function withOperationalAccess(user: User): User {
  const accountRole: UserRole = user.account_role ?? user.role;
  return {
    ...user,
    account_role: accountRole,
    role: accountRole === 'reception' ? 'admin' : user.role,
  };
}

export function isReceptionAccount(user: User | null | undefined): boolean {
  return (user?.account_role ?? user?.role) === 'reception';
}
