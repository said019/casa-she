import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, User, CalendarDays, CreditCard, Loader2, Ticket } from 'lucide-react';
import api from '@/lib/api';
import { formatFolio } from '@/lib/folio';

interface ClientHit {
    id: string;
    display_name: string;
    email: string | null;
    phone: string | null;
    photo_url: string | null;
}
interface ClassHit {
    id: string;
    date: string;
    start_time: string | null;
    status: string;
    class_type_name: string;
    class_type_color: string | null;
    instructor_name: string;
    facility_name: string | null;
}
interface PaymentHit {
    id: string;
    amount: number | string;
    currency: string | null;
    payment_method: string;
    status: string;
    created_at: string;
    user_id: string;
    user_name: string;
}
interface ReservasHit {
    id: string;
    folio: number;
    status: string;
    class_date: string;
    start_time: string | null;
    class_type_name: string;
    user_id: string;
    user_name: string;
}
interface SearchResults {
    clients: ClientHit[];
    classes: ClassHit[];
    payments: PaymentHit[];
    reservas: ReservasHit[];
}

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

function fmtDate(d: string): string {
    const iso = String(d).slice(0, 10);
    const [y, m, day] = iso.split('-');
    if (!y || !m || !day) return iso;
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return `${Number(day)} ${months[Number(m) - 1] ?? ''}`.trim();
}

export function AdminSearch() {
    const navigate = useNavigate();
    const location = useLocation();
    // El mismo buscador vive en el header del admin y en el de recepción.
    // Navega a las rutas del área donde está parado el usuario.
    const inReception = location.pathname.startsWith('/reception');
    const [term, setTerm] = useState('');
    const [debounced, setDebounced] = useState('');
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Debounce (250ms)
    useEffect(() => {
        const t = setTimeout(() => setDebounced(term.trim()), 250);
        return () => clearTimeout(t);
    }, [term]);

    // Limpia el timer de blur al desmontar (el componente se monta condicionalmente)
    useEffect(() => () => {
        if (blurTimer.current) clearTimeout(blurTimer.current);
    }, []);

    const enabled = debounced.length >= 2;
    const { data, isFetching } = useQuery<SearchResults>({
        queryKey: ['admin-search', debounced],
        queryFn: async () => (await api.get(`/search?q=${encodeURIComponent(debounced)}`)).data,
        enabled,
        staleTime: 30_000,
    });

    const results: SearchResults = data ?? { clients: [], classes: [], payments: [], reservas: [] };
    const total = results.clients.length + results.classes.length + results.payments.length + results.reservas.length;
    const showPanel = open && enabled;

    function go(path: string) {
        if (blurTimer.current) clearTimeout(blurTimer.current);
        setOpen(false);
        setTerm('');
        setDebounced('');
        navigate(path);
    }

    // Destinos según el área (admin vs recepción) y con deep-link al resultado exacto.
    function clientPath(id: string) {
        return inReception ? `/reception/clientes?focus=${id}` : `/admin/members/${id}`;
    }
    function classPath(date: string) {
        const d = String(date).slice(0, 10);
        return `${inReception ? '/reception/calendario' : '/admin/calendar'}?date=${d}`;
    }
    function paymentPath(p: PaymentHit) {
        // Recepción no tiene lista de pagos: abre la ficha de quien pagó.
        return inReception ? `/reception/clientes?focus=${p.user_id}` : '/admin/payments';
    }

    function goFirst() {
        if (results.clients[0]) return go(clientPath(results.clients[0].id));
        if (results.classes[0]) return go(classPath(results.classes[0].date));
        if (results.payments[0]) return go(paymentPath(results.payments[0]));
        if (results.reservas[0]) return go(classPath(results.reservas[0].class_date));
    }

    return (
        <div
            ref={containerRef}
            className="relative"
            onFocus={() => {
                if (blurTimer.current) clearTimeout(blurTimer.current);
                setOpen(true);
            }}
            onBlur={() => {
                // Delay so a click on a result registers before closing
                blurTimer.current = setTimeout(() => setOpen(false), 150);
            }}
        >
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-balance-dark/42" />
            <input
                type="search"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        goFirst();
                    }
                    if (e.key === 'Escape') {
                        setTerm('');
                        setDebounced('');
                        setOpen(false);
                        (e.target as HTMLInputElement).blur();
                    }
                }}
                placeholder="Buscar usuarios, clases o pagos"
                aria-label="Buscar usuarios, clases o pagos"
                role="combobox"
                aria-expanded={showPanel}
                aria-controls="admin-search-results"
                aria-autocomplete="list"
                className="h-11 w-full rounded-full border border-balance-sand/65 bg-balance-cream/65 pl-11 pr-10 text-sm text-balance-dark outline-none transition-all duration-200 placeholder:text-balance-dark/38 focus:border-balance-olive/55 focus:bg-balance-cream focus:ring-4 focus:ring-balance-olive/10"
            />
            {isFetching && enabled && (
                <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-balance-dark/40" />
            )}

            {showPanel && (
                <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-[1.25rem] border border-balance-sand/70 bg-[hsl(var(--admin-panel))] shadow-[0_24px_70px_-42px_rgba(51,42,34,0.75)]">
                    <div id="admin-search-results" role="listbox" className="max-h-[min(70vh,30rem)] overflow-y-auto py-2">
                        {total === 0 && !isFetching && (
                            <p className="px-4 py-6 text-center text-sm text-balance-dark/50">
                                Sin resultados para “{debounced}”
                            </p>
                        )}

                        {results.clients.length > 0 && (
                            <Group label="Usuarios">
                                {results.clients.map((c) => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        role="option"
                                        aria-selected={false}
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => go(clientPath(c.id))}
                                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-balance-sand/25"
                                    >
                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-balance-sand/40 text-balance-olive">
                                            <User className="h-4 w-4" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium text-balance-dark">
                                                {c.display_name}
                                            </span>
                                            <span className="block truncate text-xs text-balance-dark/55">
                                                {c.email || c.phone || 'Sin contacto'}
                                            </span>
                                        </span>
                                    </button>
                                ))}
                            </Group>
                        )}

                        {results.classes.length > 0 && (
                            <Group label="Clases">
                                {results.classes.map((cl) => (
                                    <button
                                        key={cl.id}
                                        type="button"
                                        role="option"
                                        aria-selected={false}
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => go(classPath(cl.date))}
                                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-balance-sand/25"
                                    >
                                        <span
                                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-balance-olive"
                                            style={{ backgroundColor: (cl.class_type_color || '#B5512F') + '22' }}
                                        >
                                            <CalendarDays className="h-4 w-4" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium text-balance-dark">
                                                {cl.class_type_name}
                                            </span>
                                            <span className="block truncate text-xs text-balance-dark/55">
                                                {fmtDate(cl.date)}
                                                {cl.start_time ? ` · ${String(cl.start_time).slice(0, 5)}` : ''}
                                                {' · '}
                                                {cl.instructor_name}
                                                {cl.facility_name ? ` · ${cl.facility_name}` : ''}
                                            </span>
                                        </span>
                                    </button>
                                ))}
                            </Group>
                        )}

                        {results.payments.length > 0 && (
                            <Group label="Pagos">
                                {results.payments.map((p) => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        role="option"
                                        aria-selected={false}
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => go(paymentPath(p))}
                                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-balance-sand/25"
                                    >
                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-balance-sand/40 text-balance-olive">
                                            <CreditCard className="h-4 w-4" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium text-balance-dark">
                                                {p.user_name} · {mxn.format(Number(p.amount) || 0)}
                                            </span>
                                            <span className="block truncate text-xs text-balance-dark/55">
                                                {fmtDate(p.created_at)} · {p.payment_method} · {p.status}
                                            </span>
                                        </span>
                                    </button>
                                ))}
                            </Group>
                        )}

                        {results.reservas.length > 0 && (
                            <Group label="Reservas">
                                {results.reservas.map((r) => (
                                    <button
                                        key={r.id}
                                        type="button"
                                        role="option"
                                        aria-selected={false}
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => go(classPath(r.class_date))}
                                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-balance-sand/25"
                                    >
                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-balance-sand/40 text-balance-olive">
                                            <Ticket className="h-4 w-4" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm text-balance-dark">
                                                <span className="font-semibold tabular-nums">{formatFolio(r.folio)}</span>
                                                {' · '}
                                                {r.user_name}
                                            </span>
                                            <span className="block truncate text-xs text-balance-dark/55">
                                                {r.class_type_name}
                                                {' · '}
                                                {fmtDate(r.class_date)}
                                                {r.start_time ? ` · ${String(r.start_time).slice(0, 5)}` : ''}
                                            </span>
                                        </span>
                                    </button>
                                ))}
                            </Group>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="py-1">
            <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-balance-dark/45">
                {label}
            </p>
            {children}
        </div>
    );
}
