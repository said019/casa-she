import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, CheckCircle2, Clock, Users, ChevronLeft, X } from 'lucide-react';

import api, { getErrorMessage } from '@/lib/api';

import { PlatformBadge } from '@/components/PlatformBadge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { CancelBookingDialog } from '@/components/bookings/CancelBookingDialog';
import { useFacilityScope } from '@/hooks/useFacilityScope';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TodayClass {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  max_capacity: number;
  current_bookings: number;
  status: string;
  class_type_name: string;
  class_type_color: string | null;
  instructor_name: string;
  facility_id: string | null;
  facility_name: string | null;
}

interface Attendee {
  booking_id: string;
  user_id: string;
  display_name: string;
  email: string;
  photo_url: string | null;
  status: string;
  checked_in_at: string | null;
  checkin_method: string | null;
  is_late: boolean | null;
  is_first_class: boolean | null;
  waitlist_position: number | null;
  // Trazabilidad (nuevos campos del API):
  booking_created_at?: string;
  booked_by_name?: string | null;
  booked_by_role?: string | null;
  checked_in_by_name?: string | null;
  facility_name?: string | null;
  // Plan interno (plataforma): Totalpass/Wellhub/Fitpass
  plan_name?: string | null;
  plan_color?: string | null;
  plan_is_internal?: boolean | null;
}

interface AttendanceStats {
  total: number;
  checkedIn: number;
  confirmed: number;
  waitlist: number;
  firstTimers: number;
  late: number;
}

interface AttendanceResponse {
  class: {
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    class_name: string;
    instructor_name: string;
    max_capacity: number;
    current_bookings: number;
  };
  attendees: Attendee[];
  stats: AttendanceStats;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const statusLabel: Record<string, string> = {
  confirmed: 'Confirmada',
  waitlist: 'Lista de espera',
  checked_in: 'Check-in',
  no_show: 'No show',
  cancelled: 'Cancelada',
};

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  confirmed: 'default',
  waitlist: 'secondary',
  checked_in: 'default',
  no_show: 'destructive',
  cancelled: 'outline',
};

// Additional badge class overrides for semantic coloring
const statusClass: Record<string, string> = {
  confirmed: 'bg-blue-100 text-blue-800 border-blue-200',
  waitlist: 'bg-amber-100 text-amber-800 border-amber-200',
  checked_in: 'bg-green-100 text-green-800 border-green-200',
  no_show: 'bg-red-100 text-red-800 border-red-200',
  cancelled: 'bg-muted text-muted-foreground border-border',
};

function getToday(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

// ─── Attendee Row ─────────────────────────────────────────────────────────────

function AttendeeRow({
  attendee,
  classId,
}: {
  attendee: Attendee;
  classId: string;
}) {
  const queryClient = useQueryClient();

  const checkinMutation = useMutation({
    mutationFn: () =>
      api
        .post('/checkin/manual', { bookingId: attendee.booking_id })
        .then((r) => r.data),
    onSuccess: () => {
      toast.success(`Check-in registrado para ${attendee.display_name}`);
      queryClient.invalidateQueries({ queryKey: ['attendance', classId] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const [cancelOpen, setCancelOpen] = useState(false);
  const isCheckedIn = attendee.status === 'checked_in';
  const canCheckin = ['confirmed', 'waitlist'].includes(attendee.status);
  // Recepción puede quitar cualquier reserva no cancelada (incluso ya atendida); el backend valida.
  const canRemove = attendee.status !== 'cancelled';
  // Forzar cuando ya está atendida o la clase pasó (confirmed/waitlist usan el flujo normal con ventana).
  const forceRemove = !['confirmed', 'waitlist'].includes(attendee.status);

  return (
    <>
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="flex items-center gap-3 min-w-0">
        {/* Avatar placeholder */}
        <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-sm font-semibold text-muted-foreground select-none">
          {attendee.display_name.charAt(0).toUpperCase()}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">{attendee.display_name}</span>
            <PlatformBadge name={attendee.plan_color ? attendee.plan_name : null} color={attendee.plan_color} />
            {attendee.is_first_class && (
              <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                Primera clase
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">{attendee.email}</p>
          {/* Sucursal y hora de reserva */}
          {(attendee.facility_name || attendee.booking_created_at) && (
            <div className="flex flex-wrap items-center gap-1 mt-0.5">
              {attendee.facility_name && (
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {attendee.facility_name}
                </span>
              )}
              {attendee.booking_created_at && (
                <span className="text-[10px] text-muted-foreground">
                  {attendee.booked_by_name && attendee.booked_by_role !== 'client'
                    ? `agendó: ${attendee.booked_by_name}`
                    : `reservó ${relativeTime(attendee.booking_created_at)}`}
                </span>
              )}
              {attendee.checked_in_by_name && attendee.status === 'checked_in' && (
                <span className="text-[10px] text-emerald-700">· check-in: {attendee.checked_in_by_name}</span>
              )}
            </div>
          )}
          {attendee.waitlist_position != null && attendee.status === 'waitlist' && (
            <p className="text-xs text-amber-600">Lista espera #{attendee.waitlist_position}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <Badge
          variant={statusVariant[attendee.status] ?? 'outline'}
          className={`text-xs ${statusClass[attendee.status] ?? ''}`}
        >
          {statusLabel[attendee.status] ?? attendee.status}
        </Badge>

        {canCheckin && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1 h-8 text-xs"
            onClick={() => checkinMutation.mutate()}
            disabled={checkinMutation.isPending}
          >
            {checkinMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3 w-3" />
            )}
            Check-in
          </Button>
        )}

        {isCheckedIn && attendee.checked_in_at && (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {format(new Date(attendee.checked_in_at), 'HH:mm')}
          </span>
        )}

        {canRemove && (
          <Button
            size="sm"
            variant="ghost"
            className="gap-1 h-8 text-xs text-destructive hover:text-destructive"
            onClick={() => setCancelOpen(true)}
            title="Quitar de la clase"
          >
            <X className="h-3 w-3" />
            Quitar
          </Button>
        )}
      </div>
    </div>
    <CancelBookingDialog
      bookingId={cancelOpen ? attendee.booking_id : null}
      open={cancelOpen}
      force={forceRemove}
      onClose={() => setCancelOpen(false)}
      onCancelled={() => {
        setCancelOpen(false);
        queryClient.invalidateQueries({ queryKey: ['attendance', classId] });
      }}
    />
    </>
  );
}

// ─── Attendance Panel ─────────────────────────────────────────────────────────

function AttendancePanel({
  classId,
  onBack,
}: {
  classId: string;
  onBack: () => void;
}) {
  const { data, isLoading, isError, error } = useQuery<AttendanceResponse>({
    queryKey: ['attendance', classId],
    queryFn: () =>
      api.get(`/checkin/class/${classId}`).then((r) => r.data),
    enabled: !!classId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[30vh]">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 -ml-1">
          <ChevronLeft className="h-4 w-4" />
          Volver
        </Button>
        <p className="text-sm text-destructive">{getErrorMessage(error)}</p>
      </div>
    );
  }

  if (!data) return null;

  const { attendees, stats } = data;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 -ml-1 mt-0.5">
          <ChevronLeft className="h-4 w-4" />
          Volver
        </Button>
        <div>
          <h2 className="text-lg font-semibold leading-tight">{data.class.class_name}</h2>
          <p className="text-sm text-muted-foreground">
            {data.class.start_time} — {data.class.instructor_name}
          </p>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 text-center">
          <p className="text-xl sm:text-2xl font-bold text-green-600 tabular-nums truncate">{stats.checkedIn}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Check-in</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xl sm:text-2xl font-bold text-blue-600 tabular-nums truncate">{stats.confirmed}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Confirmados</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xl sm:text-2xl font-bold text-amber-600 tabular-nums truncate">{stats.waitlist}</p>
          <p className="text-xs text-muted-foreground mt-0.5">En espera</p>
        </Card>
      </div>

      {/* Attendees list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Asistentes ({stats.total})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {attendees.length === 0 ? (
            <p className="text-sm text-muted-foreground px-6 pb-6">Sin reservas para esta clase.</p>
          ) : (
            // Altura natural: la lista crece y la página hace scroll. Antes un
            // ScrollArea con max-h-[50vh] cortaba la lista y no se veían todas.
            <div className="px-6 divide-y">
              {attendees.map((attendee) => (
                <AttendeeRow
                  key={attendee.booking_id}
                  attendee={attendee}
                  classId={classId}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Class Card ───────────────────────────────────────────────────────────────

function ClassCard({
  cls,
  isSelected,
  onSelect,
}: {
  cls: TodayClass;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const occupancy = cls.max_capacity > 0
    ? Math.round((cls.current_bookings / cls.max_capacity) * 100)
    : 0;

  const isFull = cls.current_bookings >= cls.max_capacity;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-lg border p-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        isSelected
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-border bg-card hover:bg-muted/50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="font-semibold text-sm leading-tight truncate">{cls.class_type_name}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {cls.start_time}
            </span>
            <span>·</span>
            <span>{cls.instructor_name}</span>
            {cls.facility_name && (
              <>
                <span>·</span>
                <span>{cls.facility_name}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <div className="flex items-center gap-1 text-xs font-medium">
            <Users className="h-3 w-3 text-muted-foreground" />
            <span className={isFull ? 'text-red-600' : 'text-foreground'}>
              {cls.current_bookings}/{cls.max_capacity}
            </span>
          </div>
          {isFull && (
            <Badge variant="destructive" className="text-xs py-0">
              Lleno
            </Badge>
          )}
          {!isFull && occupancy >= 80 && (
            <Badge variant="secondary" className="text-xs py-0 bg-amber-100 text-amber-700">
              Casi lleno
            </Badge>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CheckinScreen() {
  const today = getToday();
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  // Sucursal activa del selector (master/admin eligen; recepción normal el backend
  // la fuerza). Incluida en el queryKey → al cambiar de sucursal se refrescan las clases.
  const { facilityIdParam } = useFacilityScope();

  const {
    data: classes,
    isLoading: classesLoading,
    isError: classesError,
    error: classesErrorData,
  } = useQuery<TodayClass[]>({
    queryKey: ['today-classes', today, facilityIdParam],
    queryFn: () =>
      api
        .get(`/classes?start=${today}&end=${today}${facilityIdParam ? `&facility_id=${facilityIdParam}` : ''}`)
        .then((r) => r.data),
  });

  // El backend ya acota por sucursal (recepción → su sucursal; master/admin → la
  // seleccionada o todas), así que la lista que llega ya viene filtrada.
  const visibleClasses = classes ?? [];

  const todayLabel = format(new Date(), "EEEE d 'de' MMMM", { locale: es });

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
      {/* Page header */}
      {!selectedClassId && (
        <div>
          <h1 className="text-2xl font-heading font-bold">Check-in</h1>
          <p className="text-muted-foreground text-sm capitalize">{todayLabel}</p>
        </div>
      )}

      {/* Classes list or attendance panel */}
      {selectedClassId ? (
        <AttendancePanel
          classId={selectedClassId}
          onBack={() => setSelectedClassId(null)}
        />
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Clases de hoy</CardTitle>
              <CardDescription>Selecciona una clase para ver y gestionar el check-in.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {classesLoading && (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-7 w-7 animate-spin text-primary" />
                </div>
              )}

              {classesError && (
                <p className="text-sm text-destructive py-4">
                  {getErrorMessage(classesErrorData)}
                </p>
              )}

              {!classesLoading && !classesError && visibleClasses.length === 0 && (
                <div className="text-center py-10">
                  <p className="text-sm text-muted-foreground">No hay clases hoy.</p>
                </div>
              )}

              {!classesLoading && !classesError && visibleClasses.length > 0 && (
                <>
                  <Separator className="mb-3" />
                  <div className="space-y-2">
                    {visibleClasses.map((cls) => (
                      <ClassCard
                        key={cls.id}
                        cls={cls}
                        isSelected={selectedClassId === cls.id}
                        onSelect={() => setSelectedClassId(cls.id)}
                      />
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
