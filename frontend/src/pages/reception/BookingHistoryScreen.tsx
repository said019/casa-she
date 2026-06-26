import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
    Search, ChevronLeft, ChevronRight, X, History, Phone,
} from 'lucide-react';
import api from '@/lib/api';
import type { BookingAdmin } from '@/types/booking';
import { useFacilityScope } from '@/hooks/useFacilityScope';
import { useIsElevated } from '@/hooks/useIsElevated';
import { formatFolio } from '@/lib/folio';

// El backend ya incluye `folio` en cada reserva de /bookings; lo extendemos localmente
// para no tocar el tipo compartido.
type BookingRow = BookingAdmin & { folio?: number };

const PAGE_SIZE = 100;

const STATUS_LABEL: Record<string, string> = {
    confirmed: 'Confirmada',
    waitlist: 'Lista de espera',
    checked_in: 'Check-in',
    no_show: 'No asistió',
    cancelled: 'Cancelada',
};

const STATUS_STYLES: Record<string, string> = {
    confirmed: 'text-emerald-600 border-emerald-600',
    waitlist: 'text-amber-600 border-amber-600',
    checked_in: 'text-sky-600 border-sky-600',
    cancelled: 'text-muted-foreground',
    no_show: 'text-rose-600 border-rose-600',
};

function trimTime(t?: string): string {
    return t && t.length >= 5 ? t.slice(0, 5) : (t ?? '');
}

const shortFacility = (name?: string | null) =>
    (name || '').replace(/^BMB\s*Studio\s*/i, '').trim();

// "Reservó": si booked_by es la propia alumna (o null) se reservó sola; si difiere, lo hizo ese staff.
function bookedByLabel(b: BookingAdmin): string {
    if (!b.booked_by || b.booked_by === b.user_id) return 'la alumna';
    const r = b.booked_by_role;
    const roleEs = r === 'reception' ? 'recepción'
        : (r === 'admin' || r === 'super_admin') ? 'admin'
        : r === 'instructor' ? 'coach'
        : (r || 'staff');
    return `${b.booked_by_name || 'staff'} · ${roleEs}`;
}

export default function BookingHistoryScreen() {
    const elevated = useIsElevated();
    const { facilityIdParam } = useFacilityScope();

    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [page, setPage] = useState(0);

    // Debounce de la búsqueda para no disparar una query por tecla.
    useEffect(() => {
        const t = setTimeout(() => setSearch(searchInput.trim()), 350);
        return () => clearTimeout(t);
    }, [searchInput]);

    // Cualquier cambio de filtro vuelve a la primera página.
    useEffect(() => { setPage(0); }, [search, status, startDate, endDate, facilityIdParam]);

    const { data: bookings = [], isLoading, isFetching } = useQuery<BookingRow[]>({
        queryKey: ['reception-booking-history', search, status, startDate, endDate, facilityIdParam, page],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (status !== 'all') params.append('status', status);
            if (search) params.append('search', search);
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);
            if (facilityIdParam) params.append('facility_id', facilityIdParam);
            params.append('limit', String(PAGE_SIZE));
            params.append('offset', String(page * PAGE_SIZE));
            return (await api.get(`/bookings?${params.toString()}`)).data;
        },
    });

    const hasFilter = !!search || status !== 'all' || !!startDate || !!endDate;
    const clearFilters = () => {
        setSearchInput(''); setSearch(''); setStatus('all'); setStartDate(''); setEndDate('');
    };

    const showFacility = elevated && !facilityIdParam;
    const colSpan = showFacility ? 7 : 6;

    const rows = useMemo(() => bookings, [bookings]);

    return (
        <div className="space-y-5">
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-3xl font-heading font-bold flex items-center gap-2">
                        <History className="h-7 w-7" />
                        Historial de reservas
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        Todas las reservas de todos los usuarios. Filtra por usuario, clase, estado o fechas.
                        {showFacility ? ' Mostrando todas las sucursales.' : ''}
                    </p>
                </div>
            </div>

            <Card>
                <CardContent className="pt-4 space-y-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder="Buscar por usuario, email o clase"
                            className="pl-10"
                        />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <Select value={status} onValueChange={setStatus}>
                            <SelectTrigger>
                                <SelectValue placeholder="Estado" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos los estados</SelectItem>
                                <SelectItem value="confirmed">Confirmadas</SelectItem>
                                <SelectItem value="checked_in">Check-in</SelectItem>
                                <SelectItem value="waitlist">Lista de espera</SelectItem>
                                <SelectItem value="no_show">No asistió</SelectItem>
                                <SelectItem value="cancelled">Canceladas</SelectItem>
                            </SelectContent>
                        </Select>
                        <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">Desde</Label>
                            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">Hasta</Label>
                            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9" />
                        </div>
                        {hasFilter && (
                            <Button variant="ghost" onClick={clearFilters} className="self-end">
                                <X className="h-4 w-4 mr-1" /> Quitar filtros
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            <div className="rounded-md border bg-card overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Folio</TableHead>
                            <TableHead>Usuario</TableHead>
                            <TableHead>Clase</TableHead>
                            {showFacility && <TableHead>Sucursal</TableHead>}
                            <TableHead>Fecha</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead>Reservó</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            Array.from({ length: 6 }).map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell colSpan={colSpan}><Skeleton className="h-8 w-full" /></TableCell>
                                </TableRow>
                            ))
                        ) : rows.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={colSpan} className="text-center py-10 text-muted-foreground text-sm">
                                    {hasFilter ? 'No hay reservas que coincidan con los filtros.' : 'No hay reservas registradas.'}
                                </TableCell>
                            </TableRow>
                        ) : (
                            rows.map((b) => (
                                <TableRow key={b.booking_id}>
                                    <TableCell className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                                        {formatFolio(b.folio)}
                                    </TableCell>
                                    <TableCell>
                                        <div className="font-medium">{b.user_name}</div>
                                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                                            {b.user_email}
                                            {b.user_phone && (
                                                <span className="inline-flex items-center gap-0.5">
                                                    <Phone className="h-3 w-3" />{b.user_phone}
                                                </span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="font-medium">{b.class_name}</div>
                                        <div className="text-xs text-muted-foreground">{b.instructor_name}</div>
                                    </TableCell>
                                    {showFacility && (
                                        <TableCell className="text-sm text-muted-foreground">
                                            {shortFacility(b.facility_name) || '—'}
                                        </TableCell>
                                    )}
                                    <TableCell className="text-sm">
                                        <div className="font-medium capitalize">
                                            {b.class_date ? format(parseISO(b.class_date), 'EEE d MMM yyyy', { locale: es }) : '—'}
                                        </div>
                                        <div className="text-muted-foreground">
                                            {trimTime(b.class_start_time)}–{trimTime(b.class_end_time)}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={STATUS_STYLES[b.booking_status] ?? ''}>
                                            {STATUS_LABEL[b.booking_status] ?? b.booking_status}
                                        </Badge>
                                        {b.booking_status === 'waitlist' && b.waitlist_position != null && (
                                            <div className="text-xs text-muted-foreground mt-1">Posición #{b.waitlist_position}</div>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                        {bookedByLabel(b)}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Paginación */}
            <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                    {rows.length > 0
                        ? `Mostrando ${page * PAGE_SIZE + 1}–${page * PAGE_SIZE + rows.length}`
                        : '—'}
                    {isFetching && !isLoading ? ' · actualizando…' : ''}
                </p>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        disabled={page === 0 || isFetching}
                    >
                        <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => p + 1)}
                        disabled={rows.length < PAGE_SIZE || isFetching}
                    >
                        Siguiente <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
