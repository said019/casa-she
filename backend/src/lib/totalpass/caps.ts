// Matemática de cupo por canal (portada de Hundred partner-pool.ts). Fórmula ÚNICA de todo el sistema.
export function channelCapAvailable(capacity: number, totalBooked: number, channelBooked: number, cap: number | null): number {
  if (cap == null) return 0;
  const physicalFree = Math.max(0, Math.floor(capacity) - Math.max(0, Math.floor(totalBooked)));
  const capRoom = Math.max(0, Math.floor(cap) - Math.max(0, Math.floor(channelBooked)));
  return Math.max(0, Math.min(capRoom, physicalFree));
}

/** Número a EMPUJAR a la plataforma como `slots`. */
export function channelCapCeiling(capacity: number, totalBooked: number, channelBooked: number, cap: number | null): number {
  const chBooked = Math.max(0, Math.floor(channelBooked));
  return chBooked + channelCapAvailable(capacity, totalBooked, channelBooked, cap);
}

export interface PoolSnapshotCounts { capacity: number; total: number; totalpass: number }
export function buildPoolSnapshot(c: PoolSnapshotCounts, tpCap: number | null) {
  const capacity = Math.max(0, Math.floor(c.capacity));
  const total = Math.max(0, Math.floor(c.total));
  return {
    capacity,
    totalBooked: total,
    physicalFree: Math.max(0, capacity - total),
    tpAvailable: channelCapAvailable(capacity, total, c.totalpass, tpCap),
    tpCeiling: channelCapCeiling(capacity, total, c.totalpass, tpCap),
  };
}
