import { useRequireAuth } from '@/hooks/useAuth';
import { PurchaseFlow } from '@/components/PurchaseFlow';

export default function Checkout() {
  useRequireAuth();

  return (
    <div className="min-h-screen bg-muted/20 py-12 px-4">
      <div className="container mx-auto max-w-7xl">
        <PurchaseFlow />
      </div>
    </div>
  );
}
