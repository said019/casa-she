/**
 * 🔄 SERVICIO DE MIGRACIÓN - API ADAPTER
 * 
 * Este servicio adapta el sistema de migración para trabajar con el API backend
 * existente en lugar de Firebase directamente.
 */

import api, { getErrorMessage } from '@/lib/api';
import type {
  MigrateClientParams,
  MigrationResult,
  MigrationRecord,
  MembershipStats,
} from '@/types/migration.types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Migrar un cliente existente al sistema
 * 
 * Crea el usuario y activa su membresía SIN generar orden de venta.
 */
export const migrateExistingClient = async (
  params: MigrateClientParams,
  adminId: string,
  adminName: string
): Promise<MigrationResult> => {
  try {
    const response = await api.post('/migrations/client', {
      ...params,
      adminId,
      adminName,
      originalPaymentDate: params.originalPaymentDate.toISOString(),
      startDate: params.startDate.toISOString(),
      endDate: params.endDate.toISOString(),
    });

    return {
      userId: response.data.userId,
      packageId: response.data.packageId,
      tempPassword: response.data.tempPassword,
      success: true,
    };
  } catch (error: any) {
    console.error('Error al migrar cliente:', error);
    return {
      userId: '',
      packageId: '',
      tempPassword: '',
      success: false,
      error: getErrorMessage(error),
    };
  }
};

/**
 * Obtener historial de migraciones
 */
export const getMigrationHistory = async (
  limitCount: number = 50
): Promise<MigrationRecord[]> => {
  try {
    const response = await api.get('/migrations/history', {
      params: { limit: limitCount },
    });

    return response.data.map((record: any) => ({
      ...record,
      originalPaymentDate: new Date(record.originalPaymentDate),
      migratedAt: new Date(record.migratedAt),
    }));
  } catch (error) {
    console.error('Error al obtener historial:', error);
    return [];
  }
};

/**
 * Obtener estadísticas de membresías por origen
 */
export const getMembershipStats = async (): Promise<MembershipStats> => {
  try {
    const response = await api.get('/migrations/stats');

    return response.data;
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    return {
      totalActivas: 0,
      porVenta: 0,
      porMigracion: 0,
      porPromo: 0,
      porGift: 0,
    };
  }
};

/**
 * Validar permisos de migración
 */
export const canMigrate = (userRole: string): boolean => {
  const allowedRoles = ['owner', 'admin', 'manager'];
  return allowedRoles.includes(userRole);
};

/**
 * Calcular fecha de vencimiento según duración del paquete
 */
export const calculateEndDate = (startDate: Date, durationDays: number): Date => {
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + durationDays);
  return endDate;
};

/**
 * Formatear fecha para input date
 */
export const formatDateForInput = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

/**
 * Validar datos de migración antes de enviar
 */
export const validateMigrationData = (params: Partial<MigrateClientParams>): string[] => {
  const errors: string[] = [];
  
  if (!params.name?.trim()) {
    errors.push('El nombre es requerido');
  }
  
  if (!params.phone?.trim()) {
    errors.push('El teléfono es requerido');
  }
  
  if (!params.packageId) {
    errors.push('Debe seleccionar un paquete');
  }
  
  if (!params.originalPaymentDate) {
    errors.push('La fecha de pago original es requerida');
  }
  
  if (!params.originalAmount || params.originalAmount <= 0) {
    errors.push('El monto debe ser mayor a 0');
  }
  
  if (!params.startDate) {
    errors.push('La fecha de inicio es requerida');
  }
  
  if (!params.endDate) {
    errors.push('La fecha de vencimiento es requerida');
  }
  
  if (params.startDate && params.endDate && params.endDate <= params.startDate) {
    errors.push('La fecha de vencimiento debe ser posterior a la fecha de inicio');
  }
  
  return errors;
};
