/**
 * 📋 TIPOS Y INTERFACES PARA SISTEMA DE MIGRACIÓN
 * 
 * Define todas las estructuras de datos necesarias para registrar
 * clientes que ya pagaron antes de implementar la plataforma.
 */

// Local Timestamp type (firebase/firestore was removed; this is structurally compatible).
export type Timestamp = {
  seconds: number;
  nanoseconds: number;
  toDate(): Date;
  toMillis(): number;
};

/**
 * Origen del usuario en el sistema
 */
export type UserSource = 'organic' | 'migration';

/**
 * Origen de una membresía/paquete
 */
export type PackageOrigin = 'purchase' | 'migration' | 'gift' | 'promo';

/**
 * Método de pago usado originalmente
 */
export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'other';

/**
 * Usuario con información de migración
 */
export interface User {
  id: string;
  authUid?: string | null;
  name: string;
  email: string | null;
  phone: string;
  birthDate?: string | null;
  createdAt: Timestamp;
  createdBy: string;
  source: UserSource;
  migrationNotes?: string | null;
}

/**
 * Datos de migración histórica
 */
export interface MigrationData {
  originalPaymentDate: Timestamp;
  originalAmount: number;
  paymentMethod: string;
  receiptReference?: string | null;
  migratedBy: string;
  migratedAt: Timestamp;
  notes: string;
}

/**
 * Membresía/Paquete asignado a un usuario
 */
export interface UserPackage {
  id: string;
  userId: string;
  packageId: string;
  packageName: string;
  
  // Fechas
  startDate: Timestamp;
  endDate: Timestamp;
  activatedAt: Timestamp;
  
  // Estado
  status: 'active' | 'expired' | 'cancelled';
  classesTotal: number; // -1 = ilimitado
  classesUsed: number;
  classesRemaining: number;
  
  // Origen - CLAVE PARA NO SUMAR A VENTAS
  origin: PackageOrigin;
  
  // Solo para migraciones
  migrationData?: MigrationData | null;
}

/**
 * Parámetros para migrar un cliente individual
 */
export interface MigrateClientParams {
  // Datos personales
  name: string;
  email?: string;
  phone: string;
  birthDate?: string;
  
  // Paquete
  packageId: string;
  
  // Pago original
  originalPaymentDate: Date;
  originalAmount: number;
  paymentMethod: PaymentMethod;
  receiptReference?: string;
  
  // Vigencia
  startDate: Date;
  endDate: Date;
  classesAlreadyUsed?: number;
  
  // Notas
  notes?: string;
  
  // Notificaciones
  sendEmail: boolean;
  sendWhatsApp: boolean;
}

/**
 * Resultado de una migración
 */
export interface MigrationResult {
  userId: string;
  packageId: string;
  tempPassword: string;
  success: boolean;
  error?: string;
}

/**
 * Registro de migración para historial
 */
export interface MigrationRecord {
  id: string;
  userId: string;
  userName: string;
  userEmail: string | null;
  userPhone: string;
  packageName: string;
  originalAmount: number;
  originalPaymentDate: Timestamp;
  migratedBy: string;
  migratedByName: string;
  migratedAt: Timestamp;
  notes: string;
}

/**
 * Estadísticas de membresías por origen
 */
export interface MembershipStats {
  totalActivas: number;
  porVenta: number;
  porMigracion: number;
  porPromo: number;
  porGift: number;
}

/**
 * Acción administrativa registrada
 */
export interface AdminAction {
  id: string;
  adminId: string;
  action: 'migrate_client' | 'activate_package' | 'cancel_package' | 'edit_user';
  targetUserId: string;
  details: {
    clientName?: string;
    packageName?: string;
    originalAmount?: number;
    [key: string]: any;
  };
  timestamp: Timestamp;
}

/**
 * Paquete/Plan disponible
 */
export interface Package {
  id: string;
  name: string;
  type: 'membership' | 'package' | 'single';
  classes: number; // -1 = ilimitado
  price: number;
  duration: number; // días
  description?: string;
  active: boolean;
}

/**
 * Permisos para migración por rol
 */
export const MIGRATION_PERMISSIONS: Record<string, boolean> = {
  owner: true,
  admin: true,
  manager: true,
  instructor: false,
  receptionist: false,
};

/**
 * Opciones de método de pago para el formulario
 */
export const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'other', label: 'Otro' },
] as const;
