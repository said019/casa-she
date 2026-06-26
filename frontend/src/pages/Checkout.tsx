import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

/**
 * Ruta pública /pricing. El antiguo PurchaseFlow SIMULABA el pago con tarjeta
 * (activaba membresías sin cobro real), por lo que se eliminó. Esta ruta ahora
 * redirige al checkout real (/app/checkout con Stripe + transferencia) o a login.
 */
export default function Checkout() {
  const navigate = useNavigate();
  const { token } = useAuthStore();

  useEffect(() => {
    navigate(token ? '/app/checkout' : '/login', { replace: true });
  }, [token, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bmb-cream text-bmb-ink">
      <p className="font-heading italic text-lg">Llevándote a comprar…</p>
    </div>
  );
}
