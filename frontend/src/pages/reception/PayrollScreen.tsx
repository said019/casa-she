import { CoachPayrollContent } from '@/pages/admin/payroll/CoachPayrollPage';

// Nómina de Coaches dentro del shell de Recepción (para recepción master).
// Reusa el mismo contenido que la versión admin; el layout lo provee ReceptionLayout.
export default function ReceptionPayrollScreen() {
    return <CoachPayrollContent />;
}
