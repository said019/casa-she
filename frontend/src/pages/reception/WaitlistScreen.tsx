import { WaitlistPanel } from '@/components/bookings/WaitlistPanel';

/** Lista de espera para recepción (permiso 'reservas'); mismo panel que el admin. */
export default function WaitlistScreen() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold font-heading">Lista de espera</h1>
                <p className="text-muted-foreground">Filas por clase: promueve, quita o reordena usuarios.</p>
            </div>
            <WaitlistPanel />
        </div>
    );
}
