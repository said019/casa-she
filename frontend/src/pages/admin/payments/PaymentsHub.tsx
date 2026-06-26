import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CreditCard, ClipboardCheck, Clock, Receipt, Banknote } from 'lucide-react';
import { OrdersVerificationContent } from '@/pages/admin/orders/OrdersVerification';
import { TransactionsContent, PendingPaymentsContent } from '@/pages/admin/payments/PaymentsTransactions';
import { CashAssignmentContent } from '@/pages/admin/payments/CashAssignment';
import ManualIncome from './ManualIncome';

export default function PaymentsHub() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') || 'verification');

  return (
    <AuthGuard requiredRoles={['admin']}>
      <AdminLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-heading font-bold">Pagos</h1>
            <p className="text-muted-foreground">
              Gestiona verificaciones, transacciones y registros de pago
            </p>
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full justify-start">
              <TabsTrigger value="verification" className="gap-1.5">
                <ClipboardCheck className="h-4 w-4" />
                <span className="hidden sm:inline">Verificar órdenes</span>
                <span className="sm:hidden">Verificar</span>
              </TabsTrigger>
              <TabsTrigger value="transactions" className="gap-1.5">
                <CreditCard className="h-4 w-4" />
                <span>Transacciones</span>
              </TabsTrigger>
              <TabsTrigger value="pending" className="gap-1.5">
                <Clock className="h-4 w-4" />
                <span>Pendientes</span>
              </TabsTrigger>
              <TabsTrigger value="register" className="gap-1.5">
                <Receipt className="h-4 w-4" />
                <span className="hidden sm:inline">Registrar Pago</span>
                <span className="sm:hidden">Registrar</span>
              </TabsTrigger>
              <TabsTrigger value="manual-income" className="gap-1.5">
                <Banknote className="h-4 w-4" />
                <span className="hidden sm:inline">Ingreso manual</span>
                <span className="sm:hidden">Ingreso</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="verification">
              <OrdersVerificationContent />
            </TabsContent>

            <TabsContent value="transactions">
              <TransactionsContent />
            </TabsContent>

            <TabsContent value="pending">
              <PendingPaymentsContent />
            </TabsContent>

            <TabsContent value="register">
              <CashAssignmentContent />
            </TabsContent>

            <TabsContent value="manual-income">
              <ManualIncome />
            </TabsContent>
          </Tabs>
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}
