import { AuthGuard } from '@/components/layout/AuthGuard';
import { AdminLayout } from '@/components/layout/AdminLayout';
import BookingsScreen from '@/pages/reception/BookingsScreen';

// /admin/bookings reusa la misma pantalla de "Reservas" de recepción (panel por
// clase con check-in, plan, lista de espera, reservar/cancelar) — el mismo look
// que ya se ve mejor — pero dentro del shell de admin. El subtítulo se ajusta
// porque el admin no está limitado a una sola sucursal.
export default function AdminBookingsScreen() {
    return (
        <AuthGuard requiredRoles={['admin', 'super_admin', 'instructor']}>
            <AdminLayout>
                <BookingsScreen subtitle="Calendario de clases. Click en una clase para gestionar las reservadas." />
            </AdminLayout>
        </AuthGuard>
    );
}
