export const formatEventDate = (d: string): string => {
  if (!d) return 'Sin fecha';
  // Handle both "2026-02-14" and "2026-02-14T00:00:00.000Z" formats
  const dateStr = d.includes('T') ? d.split('T')[0] : d;
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0);
  if (isNaN(date.getTime())) return 'Fecha inválida';
  return date.toLocaleDateString('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

export const formatCurrency = (n: number): string =>
  `$${n.toLocaleString('es-MX')} MXN`;
