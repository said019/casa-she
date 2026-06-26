// Order status enum matching backend
export type OrderStatus = 
  | 'pending_payment'      // Esperando que el cliente haga el pago
  | 'pending_verification' // Comprobante subido, esperando validación admin
  | 'approved'             // Pago aprobado, membresía activada
  | 'rejected'             // Pago rechazado (comprobante inválido)
  | 'cancelled';           // Orden cancelada

// Payment method for orders
export type OrderPaymentMethod = 'bank_transfer' | 'cash' | 'card' | 'online';

// Order interface
export interface Order {
  id: string;
  order_number: string;
  user_id: string;
  plan_id: string;
  status: OrderStatus;
  payment_method: OrderPaymentMethod | null;
  subtotal: number;
  tax: number;
  total: number;
  notes: string | null;
  admin_notes: string | null;
  processed_by: string | null;
  processed_at: string | null;
  membership_id: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  user_name?: string;
  user_email?: string;
  user_phone?: string;
  plan_name?: string;
  plan_credits?: number;
  plan_duration_days?: number;
  processed_by_name?: string;
  // Stripe fields
  checkout_url?: string | null;
  mp_payment_id?: string | null;
  mp_payment_status?: string | null;
  payment_provider?: string | null;
}

// Payment proof attached to an order
export interface PaymentProof {
  id: string;
  order_id: string;
  file_url: string;
  file_type: string;
  file_name: string;
  transfer_reference: string | null;
  transfer_date: string | null;
  notes: string | null;
  uploaded_at: string;
}

// Order with payment proofs included
export interface OrderWithProofs extends Order {
  payment_proofs: PaymentProof[];
}

// Create order request
export interface CreateOrderRequest {
  plan_id: string;
  payment_method: OrderPaymentMethod;
  notes?: string;
  discount_code_id?: string;
  discount_amount?: number;
}

// Upload proof request
export interface UploadProofRequest {
  transfer_reference?: string;
  transfer_date?: string;
  notes?: string;
}

// Admin approve/reject request
export interface AdminOrderActionRequest {
  admin_notes?: string;
}

// Order stats for dashboard
export interface OrderStats {
  total_orders: number;
  pending_payment: number;
  pending_verification: number;
  approved: number;
  rejected: number;
  total_revenue: number;
  today_orders: number;
  today_revenue: number;
}

// Bank info for transfer instructions
export interface BankInfo {
  bank_name: string;
  account_holder: string;
  account_number: string;
  clabe: string;
  reference_instructions: string;
}

// Order item for list displays
export interface OrderListItem {
  id: string;
  order_number: string;
  user_name: string;
  user_email: string;
  plan_name: string;
  status: OrderStatus;
  total: number;
  payment_method: OrderPaymentMethod | null;
  created_at: string;
  has_proof: boolean;
}

// Order filters for admin panel
export interface OrderFilters {
  status?: OrderStatus;
  payment_method?: OrderPaymentMethod;
  date_from?: string;
  date_to?: string;
  search?: string;
}
