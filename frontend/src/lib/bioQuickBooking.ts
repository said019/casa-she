const STORAGE_KEY = 'casashe_bio_pending_booking';

export interface PendingBioBooking {
  classId: string;
  orderId: string;
}

export function savePendingBioBooking(value: PendingBioBooking) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function getPendingBioBooking(): PendingBioBooking | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingBioBooking>;
    return parsed.classId && parsed.orderId
      ? { classId: parsed.classId, orderId: parsed.orderId }
      : null;
  } catch {
    return null;
  }
}

export function clearPendingBioBooking() {
  localStorage.removeItem(STORAGE_KEY);
}
