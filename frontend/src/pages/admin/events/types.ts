// ──────────────────── Event Types ────────────────────

export interface EventRegistration {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: 'confirmed' | 'pending' | 'waitlist' | 'cancelled' | 'no_show';
  paidAt: string | null;
  amount: number;
  checkedIn?: boolean;
  paymentMethod?: string | null;
  paymentReference?: string | null;
}

export interface StudioEvent {
  id: string;
  title: string;
  description: string;
  type: EventType;
  instructor: string;
  instructorPhoto?: string | null;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  capacity: number;
  registered: number;
  price: number;
  earlyBirdPrice?: number;
  earlyBirdDeadline?: string;
  memberDiscount: number;
  image?: string | null;
  status: 'published' | 'draft' | 'cancelled' | 'completed';
  tags: string[];
  requirements: string;
  includes: string[];
  registrations: EventRegistration[];
  waitlistEnabled: boolean;
  requiredPayment: boolean;
  walletPass: boolean;
  autoReminders: boolean;
  allowCancellations: boolean;
}

export type EventType = 'masterclass' | 'workshop' | 'retreat' | 'challenge' | 'openhouse' | 'special';

export interface EventTypeInfo {
  value: EventType;
  label: string;
  iconName: 'star' | 'wrench' | 'leaf' | 'flame' | 'home' | 'sparkles';
  color: string;
}

export const EVENT_TYPES: EventTypeInfo[] = [
  { value: 'masterclass', label: 'Masterclass', iconName: 'star', color: '#8B5CF6' },
  { value: 'workshop', label: 'Workshop / Taller', iconName: 'wrench', color: '#F59E0B' },
  { value: 'retreat', label: 'Retiro', iconName: 'leaf', color: '#10B981' },
  { value: 'challenge', label: 'Challenge / Reto', iconName: 'flame', color: '#EF4444' },
  { value: 'openhouse', label: 'Open House', iconName: 'home', color: '#3B82F6' },
  { value: 'special', label: 'Clase Especial', iconName: 'sparkles', color: '#EC4899' },
];

export const getEventTypeInfo = (type: EventType): EventTypeInfo =>
  EVENT_TYPES.find((t) => t.value === type) || EVENT_TYPES[0];

export type EventView = 'list' | 'detail' | 'create' | 'client-preview';
