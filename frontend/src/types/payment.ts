export type PaymentStatus = 'completed' | 'pending' | 'failed' | 'refunded';

export interface PaymentRecord {
  id: string;
  user_id: string;
  membership_id: string | null;
  amount: number;
  currency: string;
  payment_method: 'cash' | 'transfer' | 'card' | 'online';
  reference: string | null;
  notes: string | null;
  status: PaymentStatus;
  processed_by: string | null;
  created_at: string;
  user_name?: string;
  user_email?: string;
  plan_name?: string | null;
}

export interface PaymentReportSummary {
  total_amount: number;
  completed_amount: number;
  pending_amount: number;
  total_count: number;
  completed_count: number;
  pending_count: number;
  by_method: Array<{ payment_method: string; total: number }>;
}
