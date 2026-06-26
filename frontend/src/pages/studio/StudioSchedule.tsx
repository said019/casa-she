import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addDays, format, isSameDay, parseISO, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar, ChevronLeft, ChevronRight, User } from 'lucide-react';
import StudioLayout from '@/components/layout/StudioLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import api from '@/lib/api';
import type { Class } from '@/types/class';
import { Link, useParams } from 'react-router-dom';
import { getStudioBySlug } from '@/data/studios';
import { cn } from '@/lib/utils';

export default function StudioSchedule() {
  const { studioSlug } = useParams();
  const studio = getStudioBySlug(studioSlug);
  const basePath = `/${studio.slug}`;

  const [currentDate, setCurrentDate] = useState(new Date());
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 0 }));

  useEffect(() => {
    setWeekStart(startOfWeek(currentDate, { weekStartsOn: 0 }));
  }, [currentDate]);

  const startStr = format(weekStart, 'yyyy-MM-dd');
  const endStr = format(addDays(weekStart, 6), 'yyyy-MM-dd');

  const { data: classes, isLoading } = useQuery<Class[]>({
    queryKey: ['public-classes', startStr, endStr],
    queryFn: async () => (await api.get(`/classes?start=${startStr}&end=${endStr}`)).data,
  });

  const allowedClassNames = useMemo(
    () => new Set(studio.classTypes.map((type) => type.name)),
    [studio.classTypes]
  );

  const filteredClasses = useMemo(() => {
    if (!classes) {
      return [];
    }
    return classes.filter((cls) => allowedClassNames.has(cls.class_type_name ?? ''));
  }, [classes, allowedClassNames]);

  const classesByDay = useMemo(() => {
    const result: Record<string, Class[]> = {};
    for (let i = 0; i < 7; i++) {
      const day = addDays(weekStart, i);
      result[format(day, 'yyyy-MM-dd')] =
        filteredClasses.filter((c) => isSameDay(parseISO(c.date), day));
    }
    return result;
  }, [filteredClasses, weekStart]);

  return (
    <StudioLayout>
      <section className="py-16 lg:py-20 bg-background">
        <div className="container mx-auto px-4 lg:px-8 space-y-8">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div>
              <span className="text-sm font-body text-secondary tracking-widest uppercase mb-2 block">
                Horarios
              </span>
              <h1 className="font-heading text-3xl md:text-5xl font-light text-foreground">
                Agenda semanal
              </h1>
              <p className="font-body text-muted-foreground max-w-2xl mt-4">
                Consulta los horarios disponibles y asegura tu lugar con tu Membresía.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <Button variant="outline" asChild>
                <Link to={`${basePath}/pricing`}>Comprar membresía</Link>
              </Button>
              <Button variant="hero" asChild>
                <Link to="/app/book">Reservar clase</Link>
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 border rounded-md bg-card w-fit">
            <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addDays(currentDate, -7))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="px-4 font-medium min-w-[160px] text-center capitalize">
              {format(currentDate, 'MMMM yyyy', { locale: es })}
            </div>
            <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addDays(currentDate, 7))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-40 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Object.entries(classesByDay).map(([date, dayClasses]) => (
                <div key={date} className="border rounded-xl bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">
                        {format(parseISO(date), 'EEEE', { locale: es })}
                      </p>
                      <p className="font-heading text-lg">
                        {format(parseISO(date), 'd MMM', { locale: es })}
                      </p>
                    </div>
                    <Badge variant="secondary">{dayClasses.length} clases</Badge>
                  </div>

                  {dayClasses.length === 0 ? (
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Sin clases programadas.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {dayClasses.map((cls) => {
                        const full = cls.current_bookings >= cls.max_capacity;
                        return (
                          <div key={cls.id} className="rounded-lg border p-3">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-semibold">{cls.start_time.slice(0, 5)}</span>
                              <Badge variant={full ? 'destructive' : 'outline'}>
                                {full ? 'Lleno' : `${cls.current_bookings}/${cls.max_capacity}`}
                              </Badge>
                            </div>
                            <p className="font-medium mt-1">{cls.class_type_name || 'Clase'}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                              <User className="h-3 w-3" />
                              {cls.instructor_name || 'Instructor'}
                            </div>
                            <Button
                              size="sm"
                              className={cn('mt-3 w-full', full && 'opacity-70')}
                              variant="outline"
                              asChild
                            >
                              <Link to="/app/book">Reservar</Link>
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </StudioLayout>
  );
}
