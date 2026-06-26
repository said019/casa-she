import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, CalendarDays, MapPin, User, DollarSign, Clock, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StudioEvent, EventType } from './types';
import { EVENT_TYPES, getEventTypeInfo } from './types';
import { EventTypeIcon } from './EventTypeIcon';
import { formatEventDate, formatCurrency } from './utils';

interface EventListViewProps {
  events: StudioEvent[];
  isLoading?: boolean;
  onSelect: (event: StudioEvent) => void;
  onCreateNew: () => void;
}

const statusMap: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  published: { variant: 'default', label: 'Publicado' },
  draft: { variant: 'secondary', label: 'Borrador' },
  cancelled: { variant: 'destructive', label: 'Cancelado' },
  completed: { variant: 'outline', label: 'Completado' },
};

export default function EventListView({ events, isLoading, onSelect, onCreateNew }: EventListViewProps) {
  const [filter, setFilter] = useState<'all' | EventType>('all');
  const filtered = filter === 'all' ? events : events.filter((e) => e.type === filter);
  const activeCount = events.filter((e) => e.status === 'published').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold">Eventos del Estudio</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {events.length} eventos creados · {activeCount} activos
          </p>
        </div>
        <Button onClick={onCreateNew} className="gap-2">
          <Plus className="h-4 w-4" />
          Crear Evento
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('all')}
          className="rounded-full"
        >
          Todos
        </Button>
        {EVENT_TYPES.map((t) => (
          <Button
            key={t.value}
            variant={filter === t.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(t.value)}
            className="rounded-full gap-1.5"
          >
            <EventTypeIcon typeInfo={t} className="h-3.5 w-3.5" />
            {t.label}
          </Button>
        ))}
      </div>

      {/* Event Cards */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-5 space-y-4">
              <div className="flex gap-3 items-start">
                <Skeleton className="w-11 h-11 rounded-lg" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[1, 2, 3, 4].map((j) => (
                  <Skeleton key={j} className="h-16 rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CalendarDays className="h-12 w-12 mx-auto mb-4 opacity-40" />
          <p className="font-medium">No hay eventos {filter !== 'all' ? 'de este tipo' : 'creados'}</p>
          <p className="text-sm mt-1">Crea tu primer evento para empezar</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((event) => {
            const typeInfo = getEventTypeInfo(event.type);
            const occupancy = Math.round((event.registered / event.capacity) * 100);
            const revenue = event.registrations
              .filter((r) => r.status === 'confirmed')
              .reduce((sum, r) => sum + r.amount, 0);
            const statusInfo = statusMap[event.status] || statusMap.draft;

            return (
              <div
                key={event.id}
                onClick={() => onSelect(event)}
                className="bg-card border border-border rounded-xl p-5 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
              >
                {/* Top row */}
                <div className="flex flex-col lg:flex-row justify-between gap-4 mb-4">
                  <div className="flex gap-3 items-start">
                    <div
                      className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${typeInfo.color}15` }}
                    >
                      <EventTypeIcon typeInfo={typeInfo} className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-heading font-bold text-foreground truncate">{event.title}</h3>
                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <EventTypeIcon typeInfo={typeInfo} className="h-3 w-3" />
                          {typeInfo.label}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {event.instructor}
                        </span>
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {formatEventDate(event.date)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold" style={{ color: typeInfo.color }}>
                      {formatCurrency(event.price)}
                    </p>
                    {event.earlyBirdPrice && (
                      <p className="text-xs text-emerald-600">
                        Early bird: {formatCurrency(event.earlyBirdPrice)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <Users className="h-3 w-3" /> Capacidad
                    </p>
                    <p className="text-base font-bold text-foreground mt-0.5">
                      {event.registered}/{event.capacity}
                    </p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Ocupación
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Progress
                        value={occupancy}
                        className={cn(
                          'h-2 flex-1',
                          occupancy > 80
                            ? '[&>div]:bg-red-500'
                            : occupancy > 50
                            ? '[&>div]:bg-amber-500'
                            : '[&>div]:bg-emerald-500'
                        )}
                      />
                      <span className="text-sm font-bold text-foreground">{occupancy}%</span>
                    </div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <DollarSign className="h-3 w-3" /> Ingreso
                    </p>
                    <p className="text-base font-bold text-emerald-600 mt-0.5">
                      {formatCurrency(revenue)}
                    </p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Horario
                    </p>
                    <p className="text-base font-bold text-foreground mt-0.5">
                      {event.startTime} - {event.endTime}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
