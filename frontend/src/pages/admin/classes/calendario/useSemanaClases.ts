import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, startOfWeek, addDays, isSameDay, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import api from '@/lib/api';
import type { Class, ClassType, Instructor } from '@/types/class';
import type { Facility } from './tipos';

/**
 * Datos de la semana visible del calendario: consultas (tipos, coaches, sucursales,
 * clases, días cerrados), la semana y el día elegidos, y los filtros.
 * Movido sin cambios desde ClassesCalendar.tsx.
 */
export function useSemanaClases() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
    const [mobileSelectedDay, setMobileSelectedDay] = useState(new Date());
    const [classTypeFilter, setClassTypeFilter] = useState<string>('all');
    const [studioFilter, setStudioFilter] = useState<string>('all');
    const [programFilter, setProgramFilter] = useState<string>('all');
    const [instructorFilter, setInstructorFilter] = useState<string>('all');

    // Deep-link: ?date=YYYY-MM-DD posiciona el calendario en la semana que contiene esa fecha.
    // Se aplica UNA sola vez al entrar (no pelea con la navegación manual del usuario después).
    const [searchParams] = useSearchParams();
    const dateParamApplied = useRef(false);
    useEffect(() => {
        if (dateParamApplied.current) return;
        const param = searchParams.get('date');
        if (!param || !/^\d{4}-\d{2}-\d{2}$/.test(param)) return;
        const [y, m, d] = param.split('-').map(Number);
        const parsed = new Date(y, m - 1, d); // LOCAL, no UTC: evita correrse un día
        if (Number.isNaN(parsed.getTime())) return;
        dateParamApplied.current = true;
        setCurrentDate(parsed);
    }, [searchParams]);

    useEffect(() => {
        setWeekStart(startOfWeek(currentDate, { weekStartsOn: 1 }));
    }, [currentDate]);

    useEffect(() => {
        const today = new Date();
        const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });
        setMobileSelectedDay(isSameDay(weekStart, currentWeekStart) ? today : weekStart);
    }, [weekStart]);

    const { data: classTypes } = useQuery<ClassType[]>({
        queryKey: ['class-types'],
        queryFn: async () => (await api.get('/class-types')).data,
    });

    const { data: instructors } = useQuery<Instructor[]>({
        queryKey: ['instructors'],
        queryFn: async () => (await api.get('/instructors')).data,
    });

    const { data: facilities } = useQuery<Facility[]>({
        queryKey: ['facilities'],
        queryFn: async () => (await api.get('/facilities')).data,
    });

    const startStr = format(weekStart, 'yyyy-MM-dd');
    const endStr = format(addDays(weekStart, 6), 'yyyy-MM-dd');

    const { data: classes, isLoading: classesLoading, isError: classesError, refetch: refetchClasses } = useQuery<Class[]>({
        queryKey: ['classes', startStr, endStr, studioFilter, programFilter],
        queryFn: async () => {
            const params = new URLSearchParams({ start: startStr, end: endStr });
            if (studioFilter !== 'all') params.set('facility_id', studioFilter);
            if (programFilter !== 'all') params.set('category', programFilter);
            const { data } = await api.get(`/classes?${params.toString()}`);
            return data;
        },
        retry: 3,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
        refetchOnWindowFocus: true,
    });

    // Closed days for visual indicator
    const { data: closedDays = [] } = useQuery<{ id: string; date: string; reason: string }[]>({
        queryKey: ['closed-days-range', startStr, endStr],
        queryFn: async () => (await api.get(`/closed-days/range?start=${startStr}&end=${endStr}`)).data,
    });
    const closedDaySet = new Set(closedDays.map(d => d.date));
    const getClosedReason = (day: Date) => closedDays.find(d => d.date === format(day, 'yyyy-MM-dd'))?.reason;

    const handlePrevWeek = () => setCurrentDate(addDays(currentDate, -7));
    const handleNextWeek = () => setCurrentDate(addDays(currentDate, 7));
    const handleToday = () => setCurrentDate(new Date());

    const getClassesForDay = (day: Date) => {
        return classes?.filter(c => {
            const dateStr = (c.date || '').split('T')[0];
            const dateMatch = isSameDay(parseISO(dateStr + 'T00:00:00'), day);
            const typeMatch = classTypeFilter === 'all' || c.class_type_id === classTypeFilter;
            const studioMatch = studioFilter === 'all' || c.facility_id === studioFilter;
            const instructorMatch = instructorFilter === 'all' || c.instructor_id === instructorFilter;
            return dateMatch && typeMatch && studioMatch && instructorMatch;
        }) || [];
    };

    const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
    const activeClasses = classes?.filter((c) => c.status !== 'cancelled') || [];

    // Sede única (de facilities). Sin selector visible: el filtro se fija a la única sede.
    const bmbStudios = useMemo(
        () => (facilities || [])
            .filter((f) => /^casa sh/i.test(f.name))
            .map((f) => ({ id: f.id, name: f.name, short: f.name.replace(/^Casa Shé\s*/i, '') })),
        [facilities]
    );

    // Fija el filtro a la única sede en cuanto carga (en vez de 'all').
    useEffect(() => {
        if (bmbStudios.length && !bmbStudios.some((s) => s.id === studioFilter)) {
            setStudioFilter(bmbStudios[0].id);
        }
    }, [bmbStudios, studioFilter]);

    const totalBookings = activeClasses.reduce((sum, c) => sum + Number(c.current_bookings || 0), 0);
    const totalCapacity = activeClasses.reduce((sum, c) => sum + Number(c.max_capacity || 0), 0);
    const openSpots = Math.max(totalCapacity - totalBookings, 0);
    const weekRange = `${format(weekStart, 'd MMM', { locale: es })} al ${format(addDays(weekStart, 6), 'd MMM yyyy', { locale: es })}`;
    const occupancy = totalCapacity > 0 ? Math.round((totalBookings / totalCapacity) * 100) : 0;
    const mobileDayClasses = getClassesForDay(mobileSelectedDay)
        .slice()
        .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
    const mobileDayClosed = closedDaySet.has(format(mobileSelectedDay, 'yyyy-MM-dd'));
    const mobileClosedReason = getClosedReason(mobileSelectedDay);

    return {
        currentDate, setCurrentDate, weekStart, mobileSelectedDay, setMobileSelectedDay,
        classTypeFilter, setClassTypeFilter, programFilter, setProgramFilter, instructorFilter, setInstructorFilter,
        classTypes, instructors, facilities,
        classes, classesLoading, classesError, refetchClasses,
        startStr, endStr, closedDaySet, getClosedReason, getClassesForDay, weekDays, activeClasses,
        totalBookings, openSpots, weekRange, occupancy, mobileDayClasses, mobileDayClosed, mobileClosedReason,
        handlePrevWeek, handleNextWeek, handleToday,
    };
}
