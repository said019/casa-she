/**
 * Fuente única de los métodos de pago canónicos al VENDER/ASIGNAR membresías
 * desde el mostrador o el admin (recepción, POS, admin de clientes/membresías).
 *
 * Reglas de negocio:
 * - {Efectivo, Transferencia, Tarjeta} siempre disponibles para staff.
 * - {Gratis} (cortesía $0) SOLO para usuarios elevados (admin / super_admin /
 *   recepción master) y exige un Motivo obligatorio (mínimo 5 caracteres).
 * - NO usar en el self-service del cliente (PurchaseFlow), que queda con
 *   card/transfer únicamente.
 *
 * El backend (memberships.assign / :id/activate / cash-shifts.sell-membership)
 * ya acepta 'gratis' (requiere elevado + reason, registra $0).
 */

export interface MembershipPaymentMethodOption {
    value: 'cash' | 'transfer' | 'card' | 'gratis';
    label: string;
}

/** Métodos base (no elevados). */
export const MEMBERSHIP_PAYMENT_METHODS: MembershipPaymentMethodOption[] = [
    { value: 'cash', label: 'Efectivo' },
    { value: 'transfer', label: 'Transferencia' },
    { value: 'card', label: 'Tarjeta' },
];

/** Opción de cortesía $0, solo para elevados. */
export const GRATIS_OPTION: MembershipPaymentMethodOption = { value: 'gratis', label: 'Gratis' };

/**
 * Devuelve los métodos disponibles según el nivel del usuario.
 * Agrega {Gratis} solo si `isElevated`.
 */
export function getMembershipPaymentMethods(isElevated: boolean): MembershipPaymentMethodOption[] {
    return isElevated ? [...MEMBERSHIP_PAYMENT_METHODS, GRATIS_OPTION] : MEMBERSHIP_PAYMENT_METHODS;
}

/**
 * Mapa de etiquetas de SOLO-lectura (incluye 'gratis' y métodos legados como
 * 'online'/'bank_transfer') para historiales y vistas que muestran el método ya guardado.
 */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
    cash: 'Efectivo',
    transfer: 'Transferencia',
    bank_transfer: 'Transferencia',
    card: 'Tarjeta',
    online: 'En línea',
    gratis: 'Gratis',
};

/** Mínimo de caracteres para el motivo de una cortesía gratis (espeja al backend). */
export const GRATIS_REASON_MIN_LENGTH = 5;
