// ============================================
// Check-in Types
// ============================================

export type CheckinMethod =
  | 'qr_scan'
  | 'manual_reception'
  | 'self_checkin'
  | 'nfc_tap'
  | 'wallet_scan';

export type SuspiciousActivityType =
  | 'multiple_devices'
  | 'rapid_checkins'
  | 'location_mismatch'
  | 'duplicate_qr_attempt'
  | 'invalid_qr'
  | 'device_clone_suspected';

export type SuspiciousSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface DeviceInfo {
  deviceId?: string;
  deviceType?: string;
  deviceModel?: string;
  appVersion?: string;
}

export interface Location {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface CheckinLog {
  id: string;
  booking_id: string;
  user_id: string;
  class_id: string;
  membership_id?: string;
  checkin_method: CheckinMethod;
  checked_in_at: string;
  checked_in_by?: string;
  device_id?: string;
  device_type?: string;
  device_model?: string;
  ip_address?: string;
  latitude?: number;
  longitude?: number;
  distance_from_studio?: number;
  is_late: boolean;
  minutes_early_late: number;
  is_first_class: boolean;
}

export interface QrCheckinRequest {
  qrPayload: string;
  deviceInfo?: DeviceInfo;
  location?: Location;
}

export interface SelfCheckinRequest {
  bookingId: string;
  deviceInfo?: DeviceInfo;
  location: Location;
}

export interface ManualCheckinRequest {
  bookingId: string;
  notes?: string;
}

export interface CheckinResponse {
  success: boolean;
  message: string;
  alreadyCheckedIn?: boolean;
  isFirstClass?: boolean;
  member?: {
    id: string;
    name: string;
    email?: string;
    photo?: string;
  };
  class?: {
    id: string;
    name: string;
    date: string;
    start_time: string;
    instructor?: string;
  };
  booking?: {
    id: string;
    status: string;
    checked_in_at: string;
  };
  waitlistPosition?: number;
  distance?: number;
  maxRadius?: number;
}

export interface ClassAttendee {
  booking_id: string;
  user_id: string;
  display_name: string;
  email: string;
  photo_url?: string;
  status: 'confirmed' | 'waitlist' | 'checked_in' | 'no_show' | 'cancelled';
  checked_in_at?: string;
  checkin_method?: CheckinMethod;
  is_late?: boolean;
  is_first_class?: boolean;
  waitlist_position?: number;
}

export interface ClassCheckinData {
  class: {
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    class_name: string;
    instructor_name: string;
    max_capacity: number;
    current_bookings: number;
  };
  attendees: ClassAttendee[];
  stats: {
    total: number;
    checkedIn: number;
    confirmed: number;
    waitlist: number;
    firstTimers: number;
    late: number;
  };
}

export interface CheckinDailyStats {
  date: string;
  totalCheckins: number;
  uniqueUsers: number;
  classesWithCheckins: number;
  byMethod: {
    qr: number;
    manual: number;
    self: number;
  };
  punctuality: {
    late: number;
    onTime: number;
  };
  firstTimeUsers: number;
}

export interface CheckinStats {
  period: {
    start: string;
    end: string;
  };
  totals: {
    totalCheckins: number;
    uniqueUsers: number;
    avgPerDay: number;
  };
  daily: CheckinDailyStats[];
}

export interface SuspiciousActivity {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  activity_type: SuspiciousActivityType;
  severity: SuspiciousSeverity;
  description: string;
  evidence: Record<string, unknown>;
  is_reviewed: boolean;
  is_false_positive: boolean;
  created_at: string;
}

export interface ReviewSuspiciousActivityRequest {
  isFalsePositive?: boolean;
  notes?: string;
  actionTaken?: 'none' | 'warning' | 'suspended' | 'banned';
}
