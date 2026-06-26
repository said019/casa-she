import { Fragment } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

const labelMap: Record<string, string> = {
  admin: 'Admin',
  dashboard: 'Dashboard',
  calendar: 'Calendario',
  bookings: 'Reservas',
  waitlist: 'Lista de espera',
  classes: 'Clases',
  schedules: 'Horarios',
  types: 'Tipos de clase',
  generate: 'Generar clases',
  members: 'Miembros',
  new: 'Nuevo',
  memberships: 'Membresías',
  paquetes: 'Paquetes',
  pending: 'Pendientes',
  active: 'Activas',
  expiring: 'Por vencer',
  all: 'Todas',
  instructors: 'Instructores',
  payments: 'Pagos',
  transactions: 'Transacciones',
  register: 'Registrar pago',
  reports: 'Reportes',
  loyalty: 'Lealtad',
  config: 'Configuración',
  rewards: 'Recompensas',
  redemptions: 'Canjes',
  adjust: 'Ajustes',
  referrals: 'Referidos',
  overview: 'Overview',
  revenue: 'Ingresos',
  retention: 'Retención',
  settings: 'Configuración',
  general: 'General',
  studio: 'Estudio',
  policies: 'Políticas',
  notifications: 'Notificaciones',
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function AdminBreadcrumbs() {
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) return null;

  const crumbs = segments.map((segment, index) => {
    const previous = segments[index - 1];
    let label = labelMap[segment] || segment;

    if (isUuid(segment)) {
      label = previous === 'members' ? 'Perfil' : 'Detalle';
    }

    return {
      label,
      href: `/${segments.slice(0, index + 1).join('/')}`,
      isLast: index === segments.length - 1,
    };
  });

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => (
          <Fragment key={crumb.href}>
            <BreadcrumbItem>
              {crumb.isLast ? (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link to={crumb.href}>{crumb.label}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {index < crumbs.length - 1 && <BreadcrumbSeparator />}
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
