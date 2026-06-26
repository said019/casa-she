export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  card: 'Tarjeta',
  cash: 'Efectivo',
  transfer: 'Transferencia',
  online: 'En línea',
  gratis: 'Gratis (cortesía)',
};

export const getPaymentMethodLabel = (method?: string | null): string =>
  !method ? '—' : (PAYMENT_METHOD_LABELS[method] ?? method);
