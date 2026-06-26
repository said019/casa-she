import PaymentsTransactions from '@/pages/admin/payments/PaymentsTransactions';

export default function PaymentsPending() {
  return (
    <PaymentsTransactions
      title="Pagos pendientes"
      description="Pagos por confirmar o recibir."
      initialStatus="pending"
      statusLocked
    />
  );
}
