import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import api, { getErrorMessage } from '@/lib/api';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, Check, Info, Loader2 } from 'lucide-react';
import { SpotIcon, type SpotIconKind } from '@/components/SpotIcon';

interface BookingDetail {
  booking_id: string;
  class_id: string;
  class_name: string;
  class_date: string;
  class_start_time: string;
  class_end_time: string;
  instructor_name: string;
}

interface Reformer {
  id: string;
  number: number;
  label: string | null;
  position_x: number;
  position_y: number;
  rotation: number;
  scale: number;
  image_url: string | null;
  is_occupied: boolean;
  is_mine: boolean;
  occupied_by_name: string | null;
}

interface MapData {
  facility: {
    id: string;
    name: string;
    background_url: string | null;
    default_reformer_image_url: string | null;
    front_position_x: number;
    front_position_y: number;
    map_notes: string | null;
  } | null;
  class_type?: { name: string; spot_icon: SpotIconKind };
  reformers: Reformer[];
  message?: string;
}

const DEFAULT_ICON_BY_KIND: Record<SpotIconKind, string | null> = {
  reformer: null,
  mat: '/yoga-mat.png',
  barre: '/yoga-mat.png',
  generic: null,
  wunda: '/pilates-chair.png',
};

export default function SelectReformer() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 720 : false
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 720);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const { data: booking, isLoading: loadingBooking } = useQuery<BookingDetail>({
    queryKey: ['booking-detail', bookingId],
    queryFn: async () => (await api.get(`/bookings/${bookingId}`)).data,
    enabled: Boolean(bookingId),
  });

  const { data: mapData, isLoading: loadingMap, refetch } = useQuery<MapData>({
    queryKey: ['reformer-map', booking?.class_id],
    queryFn: async () => (await api.get(`/reformers/by-class/${booking!.class_id}`)).data,
    enabled: Boolean(booking?.class_id),
    refetchInterval: 10_000,
  });

  const myCurrent = useMemo(() => mapData?.reformers.find((r) => r.is_mine) ?? null, [mapData]);

  const assignMutation = useMutation({
    mutationFn: async (reformerId: string) =>
      api.post('/reformers/assign', { bookingId, reformerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reformer-map', booking?.class_id] });
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['booking-detail', bookingId] });
      toast({ title: '¡Lugar confirmado!', description: 'Tu lugar quedó apartado.' });
      setSelected(null);
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'No se pudo asignar', description: getErrorMessage(err) });
      refetch();
    },
  });

  const releaseMutation = useMutation({
    mutationFn: async () => api.delete(`/reformers/assign/${bookingId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reformer-map', booking?.class_id] });
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
      toast({ title: 'Lugar liberado' });
    },
    onError: (err) =>
      toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) }),
  });

  const spotKind: SpotIconKind = mapData?.class_type?.spot_icon || 'generic';
  const spotLabel =
    spotKind === 'mat'     ? 'mat' :
    spotKind === 'barre'   ? 'barre' :
    spotKind === 'wunda'   ? 'wunda' :
    spotKind === 'reformer'? 'reformer' :
    'lugar';
  const defaultImg = mapData?.facility?.default_reformer_image_url ?? DEFAULT_ICON_BY_KIND[spotKind];
  const freeCount  = mapData?.reformers.filter((r) => !r.is_occupied).length ?? 0;
  const totalCount = mapData?.reformers.length ?? 0;
  const loading = loadingBooking || loadingMap;

  return (
    <AuthGuard requiredRoles={['client']}>
      <ClientLayout>
        <StyleBlock />
        <div className="lum-map">

          {/* Hero */}
          <section className="lum-hero">
            <div>
              <div className="lum-eyebrow">
                <span className="dot" />
                Elige tu {spotLabel}
              </div>
              <h1 className="lum-display">
                Tu {spotLabel},<br />
                <em>tu espacio.</em>
              </h1>
            </div>
            <div className="lum-hero-aside">
              <p className="lum-sub">
                Toca un lugar disponible para apartarlo. Puedes cambiarlo hasta 10 minutos antes de que inicie la clase.
              </p>
              <Link to="/app/classes" className="lum-back">
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Mis clases</span>
              </Link>
            </div>
          </section>

          {/* Canvas */}
          {loading ? (
            <div className="lum-loading"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : !mapData?.facility ? (
            <div className="lum-empty">
              <Info className="h-6 w-6" />
              <p>Esta clase no tiene un mapa configurado aún.</p>
              <Link to="/app/classes" className="lum-btn lum-btn-primary">Ir a mis clases</Link>
            </div>
          ) : mapData.reformers.length === 0 ? (
            <div className="lum-empty">
              <Info className="h-6 w-6" />
              <p>La sala "{mapData.facility.name}" aún no tiene lugares posicionados.</p>
            </div>
          ) : (
            <div className="lum-canvas">

              {/* Map */}
              <div>
                {(() => {
                  const fn = (mapData.facility.name || '').toLowerCase();
                  const isHot = /hot/.test(fn);
                  const isBarre = /barre/.test(fn);
                  const isWunda = /wunda/.test(fn);
                  const className = `${booking?.class_name || ''} ${mapData.class_type?.name || ''}`.toLowerCase();
                  const isPilatesMat = !isHot && spotKind === 'mat' && /pilates/.test(`${fn} ${className}`);
                  const coachLabel = isHot ? 'Mat Coach' : isBarre ? 'Coach' : 'Maestra';
                  const cardClass = `lum-map-card ${isHot ? 'lum-map-hot' : ''} ${isBarre ? 'lum-map-barre' : ''} ${isWunda ? 'lum-map-wunda' : ''}`;
                  return (
                    <div className={cardClass}>
                      {mapData.facility.background_url ? (
                        <img src={mapData.facility.background_url} alt="" className="lum-bg-img" draggable={false} />
                      ) : (
                        <>
                          <svg className="lum-bp lum-bp-grid" viewBox="0 0 1600 1000" preserveAspectRatio="none">
                            <defs>
                              <pattern id="lumGrid" width="48" height="48" patternUnits="userSpaceOnUse">
                                <path d="M 48 0 L 0 0 0 48" fill="none" stroke="rgba(71,83,110,0.06)" strokeWidth="1" />
                              </pattern>
                            </defs>
                            <rect x="0" y="0" width="1600" height="1000" fill="url(#lumGrid)" />
                          </svg>
                          {!isHot && (
                            <svg className="lum-bp" viewBox="0 0 1600 1000" preserveAspectRatio="none">
                              <rect x="24" y="24" width="1552" height="952" rx="28" fill="none" stroke="rgba(28,28,30,0.16)" strokeWidth="2" />
                              <line x1="220" y1="42" x2="1380" y2="42" stroke="rgba(113,127,155,0.65)" strokeWidth="4" strokeLinecap="round" />
                              <line x1="220" y1="54" x2="1380" y2="54" stroke="rgba(113,127,155,0.22)" strokeWidth="2" strokeDasharray="6 6" />
                            </svg>
                          )}
                          <div className="lum-specular" />
                          {!isHot && !isWunda && !isBarre && <span className="lum-sl lum-sl-mirror">espejo</span>}
                          {!isHot && !isWunda && !isBarre && <span className="lum-sl lum-sl-door">entrada</span>}
                          {!isHot && !isWunda && !isBarre && <span className="lum-sl lum-sl-wall">pared posterior</span>}
                        </>
                      )}

                      {/* Barre — wall-mounted barres (one per side) and full-height mirrors on the outer walls. */}
                      {isBarre && (
                        <>
                          <div className="lum-barre-mirror lum-barre-mirror-left" aria-hidden="true" />
                          <div className="lum-barre-mirror lum-barre-mirror-right" aria-hidden="true" />
                          <img
                            src="/barra-de-barre.png"
                            alt=""
                            className="lum-barre-wall lum-barre-wall-left"
                            draggable={false}
                          />
                          <img
                            src="/barra-de-barre.png"
                            alt=""
                            className="lum-barre-wall lum-barre-wall-right"
                            draggable={false}
                          />
                        </>
                      )}

                      {/* Wunda vertical group labels + right-wall mirror */}
                      {isWunda && (
                        <>
                          <span className="lum-wunda-label lum-wunda-label-top">WUNDA</span>
                          <span className="lum-wunda-label lum-wunda-label-bottom">CHAIR</span>
                          <div className="lum-wunda-mirror" aria-hidden="true" />
                        </>
                      )}

                      {/* Front marker (Coach / Mat Coach / Maestra) */}
                      {!isWunda && (
                        <div
                          className="lum-front"
                          style={{ left: `${mapData.facility.front_position_x}%`, top: `${mapData.facility.front_position_y}%` }}
                        >
                          <span className="dia" />
                          {coachLabel}
                        </div>
                      )}

                  {/* LIVE chip */}
                  <span className="lum-live"><span className="pulse" />live</span>

                  {/* Spots */}
                  {mapData.reformers.map((r, i) => {
                    const isSelected = selected === r.id;
                    const state: 'free' | 'occupied' | 'selected' | 'mine' =
                      r.is_mine ? 'mine' : r.is_occupied ? 'occupied' : isSelected ? 'selected' : 'free';
                    const img = r.image_url || defaultImg;
                    const baseSize = spotKind === 'reformer' ? 112 : 96;
                    const fullW = baseSize * (r.scale || 1);
                    // Mobile: scale down to ~58% of desktop size for taps not to collide
                    let w = isMobile ? Math.round(fullW * 0.58) : fullW;
                    let h: number;
                    if (spotKind === 'reformer') {
                      h = w * 1.5;
                    } else if (isBarre) {
                      // Landscape tile so the mat reads as horizontal facing its barre
                      w = Math.round(w * 1.45);
                      h = Math.round(w * 0.55);
                    } else {
                      h = w * 0.85;
                    }
                    const iconRotation = (() => {
                      if (spotKind === 'reformer') return (r.rotation || 0) - 90;
                      if (isHot && spotKind === 'mat') {
                        const dx = mapData.facility.front_position_x - r.position_x;
                        const dy = mapData.facility.front_position_y - r.position_y;
                        return Math.atan2(dy, dx) * (180 / Math.PI) - 180;
                      }
                      if (isPilatesMat) return 90;
                      return r.rotation || 0;
                    })();
                    const clickable = state !== 'occupied';

                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => { if (state === 'mine' || !clickable) return; setSelected(r.id); }}
                        disabled={!clickable}
                        aria-label={`${spotLabel} ${r.number}${r.label ? ' — ' + r.label : ''} (${state})`}
                        className={`lum-spot lum-spot-${state}`}
                        style={{
                          left: `${r.position_x}%`,
                          top: `${r.position_y}%`,
                          width: `${w}px`,
                          height: `${h}px`,
                          animationDelay: `${0.05 + i * 0.08}s`,
                        }}
                      >
                        <div className="tile">
                          {img ? (
                            <img
                              src={img}
                              alt=""
                              draggable={false}
                              style={{ transform: `translate(-50%, -50%) rotate(${iconRotation}deg)` }}
                            />
                          ) : (
                            <SpotIcon kind={spotKind} className="w-[75%] h-[75%] lum-svg-icon" />
                          )}
                        </div>
                        <span className="num">{r.number}</span>
                        {state === 'mine' && (
                          <span className="check">
                            <Check className="h-[11px] w-[11px]" strokeWidth={2.6} />
                          </span>
                        )}
                      </button>
                    );
                  })}

                      {mapData.facility.map_notes && (
                        <div className="lum-notes"><span>{mapData.facility.map_notes}</span></div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Sidebar */}
              <aside className="lum-summary">

                <div className="block">
                  <div className="kicker">Tu reserva</div>
                  {booking && (
                    <>
                      <div className="class-name">{booking.class_name}</div>
                      <div className="meta-rows">
                        <span className="k">Día</span>
                        <span className="v">
                          {format(parseISO(booking.class_date), "EEEE, d MMMM", { locale: es })}
                        </span>
                        <span className="k">Hora</span>
                        <span className="v">
                          {booking.class_start_time?.slice(0, 5)} — {booking.class_end_time?.slice(0, 5)}
                        </span>
                        <span className="k">Instructora</span>
                        <span className="v">{booking.instructor_name}</span>
                      </div>
                    </>
                  )}
                </div>

                <div className="block">
                  <div className="kicker">Disponibilidad</div>
                  <div className="counter-row">
                    <div className="big">{freeCount}<sup>/{totalCount}</sup></div>
                    <div className="caption">
                      <div className="label">libres</div>
                      <div className="of">tiempo real</div>
                    </div>
                  </div>
                  <div
                    className="shimmer-bar"
                    style={{ ['--fill' as string]: `${totalCount ? (freeCount / totalCount) * 100 : 0}%` }}
                  />
                </div>

                <div className="block">
                  <div className="kicker">
                    {myCurrent ? 'Tu lugar' : selected ? 'Seleccionado' : 'Elige un lugar'}
                  </div>

                  {myCurrent ? (
                    <>
                      <div className="selection mine">
                        <div className="mark mine">{myCurrent.number}</div>
                        <div>
                          <div className="sel-title">{spotLabel.charAt(0).toUpperCase() + spotLabel.slice(1)} #{myCurrent.number}</div>
                          <div className="sel-sub">{myCurrent.label || 'Lugar confirmado'}</div>
                        </div>
                      </div>
                      <Legend spotKind={spotKind} highlight="mine" />
                      <div className="actions">
                        <button
                          className="lum-btn lum-btn-ghost"
                          onClick={() => releaseMutation.mutate()}
                          disabled={releaseMutation.isPending}
                        >
                          {releaseMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Liberar'}
                        </button>
                        <button className="lum-btn lum-btn-primary" onClick={() => navigate('/app/classes')}>
                          Listo
                        </button>
                      </div>
                    </>
                  ) : selected ? (() => {
                    const r = mapData.reformers.find((x) => x.id === selected);
                    if (!r) return null;
                    return (
                      <>
                        <div className="selection">
                          <div className="mark">{r.number}</div>
                          <div>
                            <div className="sel-title">{spotLabel.charAt(0).toUpperCase() + spotLabel.slice(1)} #{r.number}</div>
                            <div className="sel-sub">{r.label || 'Listo para confirmar'}</div>
                          </div>
                        </div>
                        <Legend spotKind={spotKind} highlight="selected" />
                        <div className="actions">
                          <button className="lum-btn lum-btn-ghost" onClick={() => setSelected(null)}>Cancelar</button>
                          <button
                            className="lum-btn lum-btn-primary"
                            onClick={() => assignMutation.mutate(r.id)}
                            disabled={assignMutation.isPending}
                          >
                            {assignMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar lugar'}
                          </button>
                        </div>
                      </>
                    );
                  })() : (
                    <>
                      <p className="hint">Toca un {spotLabel} disponible en el mapa.</p>
                      <Legend spotKind={spotKind} highlight={null} />
                    </>
                  )}
                </div>
              </aside>
            </div>
          )}
        </div>
      </ClientLayout>
    </AuthGuard>
  );
}

function Legend({ highlight }: { spotKind: SpotIconKind; highlight: 'mine' | 'selected' | null }) {
  const youLabel = highlight === 'mine' ? 'tu lugar' : 'tu selección';
  const youColor = highlight === 'mine' ? 'var(--lum-accent)' : 'var(--lum-amber)';
  return (
    <div className="legend">
      <span className="chip">
        <span className="d" style={{ background: 'var(--lum-cream)', boxShadow: '0 0 0 1px var(--lum-accent-soft)' }} />
        disponible
      </span>
      <span className="chip">
        <span className="d" style={{ background: youColor }} />
        {youLabel}
      </span>
      <span className="chip">
        <span className="d" style={{ background: 'var(--lum-sand-dark)', boxShadow: '0 0 0 1px var(--lum-alert)' }} />
        ocupado
      </span>
    </div>
  );
}

function StyleBlock() {
  return (
    <style>{`
      .lum-map {
        --lum-ink: #1c1c1e;
        --lum-ink-60: rgba(28,28,30,0.60);
        --lum-ink-40: rgba(28,28,30,0.40);
        --lum-ink-20: rgba(28,28,30,0.18);
        --lum-ink-08: rgba(28,28,30,0.08);
        --lum-cream: #fbf8f2;
        --lum-cream-2: #F6F1E2;
        --lum-sand: #ebe6d9;
        --lum-sand-dark: #D6D5C2;
        --lum-accent: #7e8579;
        --lum-accent-soft: #a8b09f;
        --lum-alert: #a8524c;
        --lum-amber: #AE4836;
        --lum-amber-soft: rgba(184,153,104,0.22);
        --lum-spring: cubic-bezier(0.34,1.56,0.64,1);
        --lum-glide: cubic-bezier(0.16,1,0.3,1);
        color: var(--lum-ink);
        max-width: 1440px;
        margin: 0 auto;
      }
      .lum-hero {
        padding: clamp(20px,5vw,60px) 0 clamp(24px,3vw,40px);
        display: grid; grid-template-columns: 1fr; gap: 16px;
      }
      @media (min-width:900px) { .lum-hero { grid-template-columns: 1.3fr 1fr; align-items: end; } }
      .lum-eyebrow {
        display: inline-flex; align-items: center; gap: 12px;
        color: var(--lum-accent); font-size: 10px; letter-spacing: 0.28em;
        text-transform: uppercase; font-weight: 500;
      }
      .lum-eyebrow::before { content:""; width:32px; height:1px; background:currentColor; display:inline-block; }
      .lum-eyebrow .dot { width:6px; height:6px; border-radius:50%; background:var(--lum-accent); animation:lumDotPulse 2.2s var(--lum-glide) infinite; }
      @keyframes lumDotPulse { 0%,100%{opacity:.45;transform:scale(1)} 50%{opacity:1;transform:scale(1.4)} }
      .lum-display {
        font-size: clamp(2.2rem,5.5vw,4.5rem);
        font-weight: 300; line-height: 0.96; letter-spacing: -0.04em; margin-top: 14px;
      }
      .lum-display em { font-style:italic; color:var(--lum-accent); }
      .lum-hero-aside { display:flex; flex-direction:column; gap:12px; }
      @media (min-width:900px) { .lum-hero-aside { align-items:flex-end; padding-bottom:6px; } }
      .lum-sub { color:var(--lum-ink-60); font-size:14px; line-height:1.6; max-width:38ch; }
      @media (min-width:900px) { .lum-sub { text-align:right; } }
      .lum-back {
        display:inline-flex; align-items:center; gap:8px; font-size:12px;
        color:var(--lum-ink-60); text-decoration:none;
        padding:7px 13px; border-radius:999px; border:1px solid var(--lum-ink-08);
        transition:all .25s var(--lum-glide); width:fit-content;
      }
      .lum-back:hover { background:var(--lum-cream-2); color:var(--lum-ink); border-color:var(--lum-ink-20); }
      .lum-loading,.lum-empty { padding:80px 20px; text-align:center; color:var(--lum-ink-60); }
      .lum-empty { display:flex; flex-direction:column; align-items:center; gap:14px; }
      .lum-canvas { display:grid; grid-template-columns:1fr; gap:28px; }
      @media (min-width:1080px) { .lum-canvas { grid-template-columns:1.75fr 1fr; gap:40px; align-items:start; } }

      .lum-map-card {
        position:relative; aspect-ratio:16/10;
        border-radius:clamp(18px,2.4vw,32px); overflow:hidden;
        background:linear-gradient(180deg,var(--lum-cream-2) 0%,var(--lum-sand) 100%);
        box-shadow:
          0 1px 0 rgba(255,255,255,.9) inset,
          0 0 0 1px var(--lum-ink-08),
          0 40px 80px -40px rgba(71,83,110,.18),
          0 10px 28px -14px rgba(28,28,30,.08);
      }
      /* Mobile: taller aspect so 6 spots are tappable */
      @media (max-width:720px) {
        .lum-map-card { aspect-ratio:4/5; }
        .lum-summary .meta-rows { grid-template-columns: 1fr; }
      }

      /* Barre — one decorative barra per mat, sitting just above each spot */
      .lum-barre-bar {
        position:absolute; pointer-events:none; z-index:1;
        width:14%; max-width:180px; height:auto;
        opacity:.85; mix-blend-mode:multiply;
      }
      @media (max-width:720px) {
        .lum-barre-bar { width:18%; }
      }

      /* Barre — wall-mounted barres rotated 90° so they read as embedded in the wall */
      .lum-barre-wall {
        position:absolute; pointer-events:none; z-index:1;
        width:38%; height:auto;
        top:50%;
        opacity:.88; mix-blend-mode:multiply;
        transform-origin:center;
      }
      .lum-barre-wall-left  { left:17%; transform:translate(-50%,-50%) rotate(-90deg); }
      .lum-barre-wall-right { left:83%; transform:translate(-50%,-50%) rotate(90deg);  }
      @media (max-width:720px) {
        .lum-barre-wall { width:54%; }
        .lum-barre-wall-left  { left:11%; }
        .lum-barre-wall-right { left:89%; }
      }

      /* Barre — full-height mirror strips on the outer walls */
      .lum-barre-mirror {
        position:absolute; top:10%; bottom:10%;
        width:14px; border-radius:6px; pointer-events:none; z-index:1;
        background:linear-gradient(180deg,
          rgba(170,200,225,.55) 0%,
          rgba(220,235,245,.78) 28%,
          rgba(180,210,230,.62) 55%,
          rgba(220,235,245,.78) 78%,
          rgba(170,200,225,.55) 100%);
        border:1px solid rgba(120,160,190,.55);
        box-shadow:
          inset 0 0 10px rgba(255,255,255,.7),
          inset 0 1px 0 rgba(255,255,255,.85),
          0 0 18px rgba(150,190,220,.28);
      }
      .lum-barre-mirror-left  { left:4%;  }
      .lum-barre-mirror-right { right:4%; }
      @media (max-width:720px) {
        .lum-barre-mirror { width:10px; top:6%; bottom:6%; }
        .lum-barre-mirror-left  { left:2%;  }
        .lum-barre-mirror-right { right:2%; }
      }

      /* Wunda group labels (vertical) */
      .lum-wunda-label {
        position:absolute; left:8%;
        font-size:11px; letter-spacing:0.42em; font-weight:600;
        color:var(--lum-ink); writing-mode:vertical-rl;
        text-orientation:mixed; transform:rotate(180deg);
        pointer-events:none; z-index:1;
      }
      .lum-wunda-label-top    { top:18%; }
      .lum-wunda-label-bottom { top:58%; }
      @media (max-width:720px) {
        .lum-wunda-label { left:3%; font-size:10px; letter-spacing:0.32em; }
      }

      /* Wunda — full-height mirror strip on the right wall */
      .lum-wunda-mirror {
        position:absolute; top:8%; bottom:8%;
        right:6%; width:14px;
        border-radius:6px; pointer-events:none; z-index:1;
        background:linear-gradient(180deg,
          rgba(170,200,225,.55) 0%,
          rgba(220,235,245,.78) 28%,
          rgba(180,210,230,.62) 55%,
          rgba(220,235,245,.78) 78%,
          rgba(170,200,225,.55) 100%);
        border:1px solid rgba(120,160,190,.55);
        box-shadow:
          inset 0 0 10px rgba(255,255,255,.7),
          inset 0 1px 0 rgba(255,255,255,.85),
          0 0 18px rgba(150,190,220,.28);
      }
      @media (max-width:720px) {
        .lum-wunda-mirror { width:10px; right:3%; top:5%; bottom:5%; }
      }
      /* Hot Room — neutral cream background like the other facilities */
      .lum-map-card.lum-map-hot {
        background:linear-gradient(180deg,var(--lum-cream-2) 0%,var(--lum-sand) 100%);
      }

      /* ============================================================
         Per-facility tile colors (matches the physical mats in studio):
         · Hot Room → black marble
         · Barre    → solid black (coach marker keeps marble look)
         · Wunda    → green marble
         ============================================================ */

      /* Black marble: layered radial + diagonal gradients to fake veining */
      .lum-map-hot .lum-spot-free .tile,
      .lum-map-hot .lum-spot-occupied .tile {
        background:
          radial-gradient(120% 80% at 18% 22%, rgba(255,255,255,0.10) 0%, transparent 35%),
          radial-gradient(90% 60% at 82% 78%, rgba(255,255,255,0.06) 0%, transparent 40%),
          linear-gradient(135deg, #1a1a1c 0%, #2a2a2e 35%, #141416 60%, #262628 100%);
        border-color: rgba(255,255,255,0.10);
      }
      .lum-map-hot .lum-spot:hover:not(:disabled) .tile {
        background:
          radial-gradient(120% 80% at 18% 22%, rgba(255,255,255,0.16) 0%, transparent 35%),
          radial-gradient(90% 60% at 82% 78%, rgba(255,255,255,0.10) 0%, transparent 40%),
          linear-gradient(135deg, #222226 0%, #34343a 35%, #1c1c1e 60%, #2e2e32 100%);
      }

      /* Solid black for Barre mats (clean rectangular look from owner mockup) */
      .lum-map-barre .lum-spot-free .tile,
      .lum-map-barre .lum-spot-occupied .tile {
        background: #141416;
        border-color: rgba(255,255,255,0.08);
      }
      .lum-map-barre .lum-spot:hover:not(:disabled) .tile {
        background: #1f1f22;
      }
      /* The mat icon is a portrait yoga mat; rotated 90° inside a landscape tile.
         Constrain by height so the rotated icon fills the long axis of the tile. */
      .lum-map-barre .lum-spot .tile img {
        width: 95%;
        height: 95%;
      }

      /* Green marble for Wunda */
      .lum-map-wunda .lum-spot-free .tile,
      .lum-map-wunda .lum-spot-occupied .tile {
        background:
          radial-gradient(120% 80% at 18% 22%, rgba(255,255,255,0.14) 0%, transparent 35%),
          radial-gradient(90% 60% at 82% 78%, rgba(120,180,140,0.20) 0%, transparent 40%),
          linear-gradient(135deg, #1f3a2c 0%, #2e5a45 35%, #1a2e22 60%, #345e48 100%);
        border-color: rgba(180,220,200,0.18);
      }
      .lum-map-wunda .lum-spot:hover:not(:disabled) .tile {
        background:
          radial-gradient(120% 80% at 18% 22%, rgba(255,255,255,0.20) 0%, transparent 35%),
          radial-gradient(90% 60% at 82% 78%, rgba(140,200,160,0.26) 0%, transparent 40%),
          linear-gradient(135deg, #2a4a3a 0%, #3c6e54 35%, #224030 60%, #406e54 100%);
      }

      /* Icons: invert from black-on-cream to white-on-dark for all 3 facilities */
      .lum-map-hot .lum-spot .tile img,
      .lum-map-barre .lum-spot .tile img,
      .lum-map-wunda .lum-spot .tile img {
        mix-blend-mode: screen;
        filter: invert(1) brightness(2.2) contrast(0.9);
        opacity: 0.92;
      }
      .lum-map-hot .lum-spot-occupied .tile img,
      .lum-map-barre .lum-spot-occupied .tile img,
      .lum-map-wunda .lum-spot-occupied .tile img {
        opacity: 0.32;
      }

      /* Icon SVG fallback color → white on dark surfaces */
      .lum-map-hot .lum-spot .tile .lum-svg-icon,
      .lum-map-barre .lum-spot .tile .lum-svg-icon,
      .lum-map-wunda .lum-spot .tile .lum-svg-icon {
        color: rgba(255,255,255,0.78);
      }

      /* Number badge contrast on dark mats — flip to cream-on-deep */
      .lum-map-hot .lum-spot-free .num,
      .lum-map-barre .lum-spot-free .num,
      .lum-map-wunda .lum-spot-free .num {
        background: var(--lum-cream);
        color: var(--lum-ink);
        box-shadow: 0 0 0 3px rgba(20,20,22,0.55), 0 6px 12px -4px rgba(0,0,0,.45);
      }

      /* Barre coach marker: keep black-marble look (distinct from solid-black mats) */
      .lum-map-barre .lum-front {
        background:
          radial-gradient(120% 80% at 18% 22%, rgba(255,255,255,0.14) 0%, transparent 35%),
          linear-gradient(135deg, #1a1a1c 0%, #2c2c30 50%, #141416 100%);
      }
      .lum-bg-img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; opacity:.92; pointer-events:none; }
      .lum-bp { position:absolute; inset:0; pointer-events:none; }
      .lum-bp-grid { opacity:.45; }
      .lum-specular {
        position:absolute; inset:18% 15%;
        background:radial-gradient(60% 55% at 50% 40%,rgba(255,255,255,.4) 0%,transparent 70%);
        mix-blend-mode:screen; pointer-events:none; z-index:1;
      }
      .lum-sl { position:absolute; font-size:8px; letter-spacing:.34em; text-transform:uppercase; color:var(--lum-ink-40); font-weight:500; pointer-events:none; }
      .lum-sl-mirror { top:10%; left:50%; transform:translate(-50%,0); }
      .lum-sl-door { left:2%; top:50%; transform:translate(0,-50%) rotate(-90deg); transform-origin:left center; }
      .lum-sl-wall { bottom:4%; left:50%; transform:translate(-50%,0); }

      .lum-front {
        position:absolute; transform:translate(-50%,-50%);
        padding:8px 16px 8px 12px;
        background:var(--lum-ink); color:var(--lum-cream); border-radius:999px;
        font-size:8.5px; letter-spacing:.3em; text-transform:uppercase;
        display:inline-flex; align-items:center; gap:9px;
        box-shadow:0 10px 24px -8px rgba(28,28,30,.45),0 0 0 4px var(--lum-cream),inset 0 1px 0 rgba(255,255,255,.08);
        z-index:4; animation:lumBreathe 5s var(--lum-glide) infinite; pointer-events:none;
      }
      @keyframes lumBreathe {
        0%,100%{box-shadow:0 10px 24px -8px rgba(28,28,30,.45),0 0 0 4px var(--lum-cream),inset 0 1px 0 rgba(255,255,255,.08)}
        50%{box-shadow:0 12px 28px -6px rgba(28,28,30,.55),0 0 0 5px var(--lum-cream),0 0 0 10px rgba(113,127,155,.14),inset 0 1px 0 rgba(255,255,255,.12)}
      }
      .lum-front .dia { width:7px; height:7px; background:var(--lum-accent-soft); transform:rotate(45deg); flex-shrink:0; }

      .lum-live {
        position:absolute; top:16px; right:16px;
        display:inline-flex; align-items:center; gap:7px;
        font-size:9.5px; letter-spacing:.2em; text-transform:uppercase; color:var(--lum-ink-60);
        padding:6px 11px 6px 9px;
        background:rgba(251,248,242,.72); border:1px solid var(--lum-ink-08); border-radius:999px;
        backdrop-filter:blur(10px); box-shadow:inset 0 1px 0 rgba(255,255,255,.5); z-index:5;
      }
      .lum-live .pulse { width:6px; height:6px; border-radius:50%; background:var(--lum-accent); position:relative; }
      .lum-live .pulse::after { content:""; position:absolute; inset:-4px; border-radius:50%; background:var(--lum-accent); opacity:.4; animation:lumLivePulse 1.6s ease-out infinite; }
      @keyframes lumLivePulse { 0%{transform:scale(.8);opacity:.5} 100%{transform:scale(2.2);opacity:0} }

      .lum-spot {
        position:absolute; transform:translate(-50%,-50%);
        border:0; background:transparent; padding:0; cursor:pointer;
        transition:transform .45s var(--lum-spring);
        animation:lumTileIn .8s var(--lum-glide) both; z-index:2;
      }
      .lum-spot:disabled { cursor:not-allowed; }
      .lum-spot:hover:not(:disabled) { transform:translate(-50%,calc(-50% - 4px)); }
      .lum-spot:hover:not(:disabled) .tile {
        background:linear-gradient(160deg,#D6D5C2 0%,#c4bda9 55%,#D6D5C2 100%);
        box-shadow:0 22px 36px -16px rgba(126,133,121,.42),inset 0 1px 0 rgba(255,255,255,.55),inset 0 0 0 1px rgba(255,255,255,.25);
      }
      @keyframes lumTileIn { from{opacity:0;transform:translate(-50%,calc(-50% + 16px)) scale(.94)} to{opacity:1;transform:translate(-50%,-50%) scale(1)} }
      .lum-spot .tile {
        position:absolute; inset:0;
        border-radius:clamp(12px,1.4vw,18px);
        background:linear-gradient(160deg,#ebe6d9 0%,#D6D5C2 55%,#ebe6d9 100%);
        border:1px solid rgba(126,133,121,.40);
        box-shadow:0 12px 24px -12px rgba(126,133,121,.28),inset 0 1px 0 rgba(255,255,255,.55),inset 0 0 0 1px rgba(255,255,255,.2);
        transition:all .45s var(--lum-spring); overflow:hidden;
      }
      .lum-spot .tile::before { content:""; position:absolute; inset:0; background:linear-gradient(140deg,rgba(255,255,255,.28) 0%,transparent 40%); pointer-events:none; }
      .lum-spot .tile img { position:absolute; left:50%; top:50%; width:88%; height:88%; object-fit:contain; transform:translate(-50%,-50%); transition:all .45s var(--lum-spring); mix-blend-mode:multiply; }
      .lum-spot .tile .lum-svg-icon { color:#3D3229; opacity:.75; position:absolute; left:12.5%; top:12.5%; }
      .lum-spot .num {
        position:absolute; left:50%; bottom:-9px; transform:translate(-50%,0);
        width:28px; height:28px; border-radius:50%;
        display:inline-flex; align-items:center; justify-content:center;
        font-weight:600; font-size:12px;
        background:var(--lum-ink); color:var(--lum-cream);
        box-shadow:0 0 0 3px var(--lum-cream),0 6px 12px -4px rgba(28,28,30,.3); z-index:3;
        transition:all .35s var(--lum-spring);
      }

      .lum-spot-free .tile { animation:lumFloat 6s ease-in-out infinite; }
      @keyframes lumFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-2px)} }

      .lum-spot-occupied .tile {
        background:var(--lum-sand); border:1px dashed rgba(168,82,76,.45);
        box-shadow:inset 0 1px 0 rgba(255,255,255,.5); animation:none;
      }
      .lum-spot-occupied .tile img { opacity:.22; mix-blend-mode:normal; filter:grayscale(1) contrast(.6); }
      .lum-spot-occupied .num { background:var(--lum-alert); }

      .lum-spot-selected { transform:translate(-50%,calc(-50% - 8px)); }
      .lum-spot-selected .tile {
        background:linear-gradient(160deg,#d4c094 0%,#AE4836 55%,#d4c094 100%);
        border-color:var(--lum-amber);
        box-shadow:0 0 0 5px var(--lum-amber-soft),0 28px 44px -20px rgba(184,153,104,.45),inset 0 1px 0 rgba(255,255,255,.95),inset 0 0 0 1px rgba(255,255,255,.6);
        animation:lumSelGlow 2s var(--lum-glide) infinite;
      }
      @keyframes lumSelGlow {
        0%,100%{box-shadow:0 0 0 5px var(--lum-amber-soft),0 28px 44px -20px rgba(184,153,104,.45),inset 0 1px 0 rgba(255,255,255,.95),inset 0 0 0 1px rgba(255,255,255,.6)}
        50%{box-shadow:0 0 0 8px rgba(184,153,104,.12),0 32px 52px -20px rgba(184,153,104,.55),inset 0 1px 0 rgba(255,255,255,.95),inset 0 0 0 1px rgba(255,255,255,.6)}
      }
      .lum-spot-selected .num { background:var(--lum-amber); color:var(--lum-ink); box-shadow:0 0 0 3px var(--lum-cream),0 8px 16px -4px rgba(201,153,61,.5); }

      .lum-spot-mine { transform:translate(-50%,calc(-50% - 6px)); }
      .lum-spot-mine .tile {
        background:linear-gradient(160deg,#7e8579 0%,#646b5e 55%,#7e8579 100%);
        border-color:var(--lum-accent);
        box-shadow:0 0 0 5px rgba(126,133,121,.18),0 28px 44px -20px rgba(126,133,121,.5),inset 0 1px 0 rgba(255,255,255,.95),inset 0 0 0 1px rgba(255,255,255,.6);
      }
      .lum-spot-mine .num { background:var(--lum-accent); color:var(--lum-cream); box-shadow:0 0 0 3px var(--lum-cream),0 8px 16px -4px rgba(126,133,121,.45); }
      .lum-spot-mine .check {
        position:absolute; right:-8px; top:-8px;
        width:22px; height:22px; border-radius:50%;
        display:inline-flex; align-items:center; justify-content:center;
        background:var(--lum-accent); color:var(--lum-cream);
        box-shadow:0 0 0 3px var(--lum-cream); z-index:4;
      }
      .lum-notes {
        position:absolute; left:16px; right:16px; bottom:12px;
        padding:8px 12px; border-radius:9px;
        background:rgba(251,248,242,.8); backdrop-filter:blur(8px);
        border:1px solid var(--lum-ink-08); font-size:11px; color:var(--lum-ink-60); z-index:3;
      }

      /* Sidebar */
      .lum-summary { display:flex; flex-direction:column; gap:0; }
      .lum-summary .block { padding:22px 2px; border-bottom:1px solid var(--lum-ink-08); }
      .lum-summary .block:first-child { padding-top:4px; }
      .lum-summary .block:last-child { border-bottom:none; }
      .lum-summary .kicker { font-size:10px; letter-spacing:.26em; text-transform:uppercase; color:var(--lum-accent); font-weight:500; margin-bottom:12px; }
      .lum-summary .class-name { font-size:18px; font-weight:600; letter-spacing:-.02em; margin-bottom:12px; }
      .lum-summary .meta-rows { display:grid; grid-template-columns:auto 1fr; gap:6px 12px; align-items:baseline; }
      .lum-summary .meta-rows .k { font-size:10.5px; color:var(--lum-ink-40); text-transform:uppercase; letter-spacing:.12em; white-space:nowrap; }
      .lum-summary .meta-rows .v { font-size:13px; color:var(--lum-ink-60); }
      .lum-summary .counter-row { display:flex; align-items:baseline; gap:12px; margin-bottom:14px; }
      .lum-summary .big { font-size:40px; font-weight:300; letter-spacing:-.04em; line-height:1; }
      .lum-summary .big sup { font-size:18px; opacity:.5; }
      .lum-summary .caption .label { font-size:11px; text-transform:uppercase; letter-spacing:.2em; color:var(--lum-ink-40); }
      .lum-summary .caption .of { font-size:10px; color:var(--lum-accent); letter-spacing:.12em; }
      .lum-summary .shimmer-bar {
        height:4px; border-radius:99px; background:var(--lum-ink-08); overflow:hidden; position:relative;
      }
      .lum-summary .shimmer-bar::after {
        content:""; position:absolute; inset-block:0; left:0;
        width:var(--fill,50%); background:var(--lum-accent);
        border-radius:99px; transition:width .6s var(--lum-glide);
      }
      .lum-summary .selection {
        display:flex; align-items:center; gap:14px;
        padding:14px; border-radius:14px;
        background:var(--lum-amber-soft); border:1px solid rgba(201,153,61,.3);
        margin-bottom:14px;
      }
      .lum-summary .selection.mine {
        background:rgba(113,127,155,.12); border-color:rgba(113,127,155,.28);
      }
      .lum-summary .mark {
        width:36px; height:36px; border-radius:50%; flex-shrink:0;
        display:flex; align-items:center; justify-content:center;
        background:var(--lum-amber); color:var(--lum-ink); font-weight:700; font-size:16px;
      }
      .lum-summary .mark.mine { background:var(--lum-accent); color:var(--lum-cream); }
      .lum-summary .sel-title { font-size:14px; font-weight:600; }
      .lum-summary .sel-sub { font-size:12px; color:var(--lum-ink-60); }
      .lum-summary .hint { font-size:13px; color:var(--lum-ink-60); margin-bottom:14px; }

      .legend { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px; }
      .legend .chip { display:inline-flex; align-items:center; gap:6px; font-size:11px; color:var(--lum-ink-60); }
      .legend .chip .d { width:10px; height:10px; border-radius:3px; flex-shrink:0; }

      .actions { display:flex; gap:8px; }
      .lum-btn { border:0; border-radius:999px; padding:10px 18px; font-size:13px; font-weight:500; cursor:pointer; transition:all .2s; flex:1; }
      .lum-btn-primary { background:var(--lum-ink); color:var(--lum-cream); }
      .lum-btn-primary:hover { background:#2c2c2e; transform:translateY(-1px); }
      .lum-btn-primary:disabled { opacity:.5; cursor:not-allowed; transform:none; }
      .lum-btn-ghost { background:var(--lum-ink-08); color:var(--lum-ink); }
      .lum-btn-ghost:hover { background:var(--lum-ink-20); }
      .lum-btn-ghost:disabled { opacity:.5; cursor:not-allowed; }
    `}</style>
  );
}
