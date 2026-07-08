import { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { ClientLayout } from '@/components/layout/ClientLayout';
import {
  useBarMenu,
  useBarConfig,
  useBarExtras,
  type BarProduct,
  type BarCartLine,
  type BarExtra,
  type BarCartExtraSnapshot,
} from '@/lib/api/bar';

// ── helpers ───────────────────────────────────────────────────────────────────

function formatPrice(n: number) {
  return `$${Math.round(n).toLocaleString('es-MX')}`;
}

// Thumbnail with image or cream-gradient fallback (matching mockup .th)
function ProductThumb({ src, name }: { src: string | null; name: string }) {
  if (src) {
    return (
      <div className="relative flex h-[60px] w-[60px] flex-shrink-0 items-end justify-center overflow-hidden rounded-[18px] shadow-[inset_0_1px_2px_rgba(255,255,255,.7),0_12px_20px_-13px_rgba(22,38,26,.42)]">
        <img
          src={src}
          alt={name}
          className="h-[80px] w-auto object-contain relative z-[1] mb-[-5px] drop-shadow-[0_6px_8px_rgba(22,38,26,.22)]"
        />
      </div>
    );
  }
  return (
    <div
      className="flex h-[60px] w-[60px] flex-shrink-0 items-end justify-center overflow-hidden rounded-[18px] shadow-[inset_0_1px_2px_rgba(255,255,255,.7),0_12px_20px_-13px_rgba(22,38,26,.42)]"
      style={{ background: 'radial-gradient(circle at 50% 32%, #FCF7EE, #EADDC6)' }}
    />
  );
}

// ── category dot colors (cycle through brand palette) ────────────────────────
const CAT_COLORS = ['#8F3B52', '#2A4E36', '#AE4836', '#6C8424', '#B4A248'];

function catColor(i: number) {
  return CAT_COLORS[i % CAT_COLORS.length];
}

// ── ExtrasSelector modal ──────────────────────────────────────────────────────

type ExtraGroup = { label: string; is_single: boolean; items: BarExtra[] };

function groupExtras(extras: BarExtra[]): ExtraGroup[] {
  const map = new Map<string, { label: string; items: BarExtra[] }>();
  for (const e of extras) {
    if (!map.has(e.group_label)) {
      map.set(e.group_label, { label: e.group_label, items: [] });
    }
    map.get(e.group_label)!.items.push(e);
  }
  return Array.from(map.values()).map((g) => ({
    label: g.label,
    is_single: g.items.every((i) => i.is_single),
    items: g.items,
  }));
}

function ExtrasSelector({
  product,
  extras,
  onConfirm,
  onCancel,
}: {
  product: BarProduct;
  extras: BarExtra[];
  onConfirm: (chosen: BarCartExtraSnapshot[]) => void;
  onCancel: () => void;
}) {
  const groups = useMemo(() => groupExtras(extras), [extras]);

  // radio: group_label → extra id (or null)
  const [radios, setRadios] = useState<Record<string, string | null>>(() => {
    const init: Record<string, string | null> = {};
    groups.forEach((g) => {
      if (g.is_single) init[g.label] = null;
    });
    return init;
  });

  // checkboxes: Set of extra ids
  const [checks, setChecks] = useState<Set<string>>(new Set());

  const toggleCheck = (id: string) => {
    setChecks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const chosen: BarCartExtraSnapshot[] = useMemo(() => {
    const result: BarCartExtraSnapshot[] = [];
    groups.forEach((g) => {
      if (g.is_single) {
        const id = radios[g.label];
        if (id) {
          const e = g.items.find((i) => i.id === id);
          if (e) result.push({ id: e.id, name: e.name, price: e.price_mxn });
        }
      } else {
        g.items.forEach((e) => {
          if (checks.has(e.id)) result.push({ id: e.id, name: e.name, price: e.price_mxn });
        });
      }
    });
    return result;
  }, [radios, checks, groups]);

  const extrasTotal = chosen.reduce((a, e) => a + e.price, 0);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center"
      style={{ background: 'rgba(22,38,26,.45)', backdropFilter: 'blur(3px)' }}
      onClick={onCancel}
    >
      {/* Sheet */}
      <div
        className="relative w-full max-w-md rounded-t-[28px] bg-[#F6F0E4] px-5 pb-8 pt-5 shadow-[0_-24px_60px_-20px_rgba(22,38,26,.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* drag pill */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[rgba(22,38,26,.12)]" />

        {/* product name */}
        <h3 className="font-heading mb-[2px] text-[22px] text-[#2A4E36]">{product.name}</h3>
        <p className="mb-4 text-xs italic text-[#2A4E36] opacity-55">
          Personaliza tu bebida
        </p>

        {/* groups */}
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="mb-[10px] flex items-center gap-2">
                <span className="text-xs uppercase tracking-[.22em] text-[#2A4E36] opacity-60">
                  {g.label}
                </span>
                {g.is_single && (
                  <span className="rounded-full bg-[rgba(42,78,54,.08)] px-2 py-[1px] text-xs text-[#2A4E36] opacity-70">
                    elige uno
                  </span>
                )}
              </div>
              <div className="space-y-[8px]">
                {g.items.map((e) => {
                  const selected = g.is_single
                    ? radios[g.label] === e.id
                    : checks.has(e.id);
                  return (
                    <button
                      key={e.id}
                      onClick={() => {
                        if (g.is_single) {
                          setRadios((prev) => ({
                            ...prev,
                            [g.label]: prev[g.label] === e.id ? null : e.id,
                          }));
                        } else {
                          toggleCheck(e.id);
                        }
                      }}
                      className={[
                        'flex w-full items-center justify-between rounded-[16px] border px-[15px] py-[12px] text-left transition-all',
                        selected
                          ? 'border-[rgba(42,78,54,.24)] bg-[#FBF5EA] shadow-[0_10px_22px_-18px_rgba(42,78,54,.4),inset_0_1px_0_rgba(255,255,255,.5)]'
                          : 'border-[rgba(22,38,26,.10)] bg-[rgba(255,255,255,.42)]',
                      ].join(' ')}
                    >
                      <span className="text-[14px] text-[#2A4E36]">{e.name}</span>
                      <div className="flex items-center gap-3">
                        {e.price_mxn > 0 && (
                          <span className="text-[12.5px] italic text-[#2A4E36] opacity-60">
                            +{formatPrice(e.price_mxn)}
                          </span>
                        )}
                        {/* indicator */}
                        {g.is_single ? (
                          <div
                            className={[
                              'h-[18px] w-[18px] flex-shrink-0 rounded-full border-[1.5px] transition-all',
                              selected ? 'border-[#2A4E36]' : 'border-[rgba(22,38,26,.18)]',
                            ].join(' ')}
                            style={
                              selected
                                ? { background: 'radial-gradient(circle, #2A4E36 40%, transparent 44%)' }
                                : undefined
                            }
                          />
                        ) : (
                          <div
                            className={[
                              'flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-all',
                              selected
                                ? 'border-[#2A4E36] bg-[#2A4E36]'
                                : 'border-[rgba(22,38,26,.18)] bg-transparent',
                            ].join(' ')}
                          >
                            {selected && (
                              <svg viewBox="0 0 12 12" className="h-3 w-3" stroke="#F6EFE1" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M2 6l3 3 5-5" />
                              </svg>
                            )}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Confirm button */}
        <button
          onClick={() => onConfirm(chosen)}
          className="mt-6 flex w-full items-center justify-between rounded-full bg-[#2A4E36] px-[26px] text-[#F6EFE1] shadow-[0_18px_34px_-18px_rgba(42,78,54,.8),inset_0_1px_0_rgba(255,255,255,.12)] transition-transform active:scale-[.98]"
          style={{ height: '54px' }}
        >
          <span className="text-[13px] uppercase tracking-[.16em]">Agregar</span>
          <span className="font-heading text-[19px]">
            {formatPrice(product.price + extrasTotal)}
          </span>
        </button>
      </div>
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────────

export default function FuelBar() {
  const nav = useNavigate();
  const { data: cfg, isLoading: cfgLoading } = useBarConfig();
  const { data: menu, isLoading: menuLoading } = useBarMenu(cfg?.enabled === true);
  const { data: extrasData } = useBarExtras();

  const extras = extrasData ?? [];

  const [cart, setCart] = useState<Record<string, BarCartLine>>({});
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectorProduct, setSelectorProduct] = useState<BarProduct | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const total = useMemo(
    () =>
      Object.values(cart).reduce((a, l) => {
        const extrasSum = (l.extras ?? []).reduce((s, e) => s + e.price, 0);
        return a + (l.product.price + extrasSum) * l.quantity;
      }, 0),
    [cart],
  );
  const count = useMemo(
    () => Object.values(cart).reduce((a, l) => a + l.quantity, 0),
    [cart],
  );

  const grouped = useMemo(() => {
    const g: Record<string, BarProduct[]> = {};
    (menu?.products ?? []).forEach((p) => {
      (g[p.category_name] ||= []).push(p);
    });
    return g;
  }, [menu]);

  const categories = Object.keys(grouped);

  // When "+" tapped: open selector if extras exist, else add directly
  const handleAdd = (p: BarProduct) => {
    if (extras.length > 0) {
      setSelectorProduct(p);
    } else {
      addToCart(p, []);
    }
  };

  const addToCart = (p: BarProduct, chosen: BarCartExtraSnapshot[]) => {
    // Each addition is a separate line keyed by product+extras combo
    // Simple approach: if no extras, use product id; if extras, append new line
    if (chosen.length === 0) {
      setCart((c) => ({
        ...c,
        [p.id]: { product: p, quantity: (c[p.id]?.quantity ?? 0) + 1, extras: [] },
      }));
    } else {
      // Key: productId + sorted extra ids to allow same combo to stack
      const extraKey = chosen
        .map((e) => e.id)
        .sort()
        .join(',');
      const lineKey = `${p.id}__${extraKey}`;
      setCart((c) => ({
        ...c,
        [lineKey]: {
          product: p,
          quantity: (c[lineKey]?.quantity ?? 0) + 1,
          extras: chosen,
        },
      }));
    }
  };

  const scrollToCategory = (cat: string) => {
    setActiveCategory(cat);
    const el = sectionRefs.current[cat];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ── bar OFF or closed-by-hours state ──────────────────────────────────────
  if (!cfgLoading && cfg && (!cfg.enabled || !cfg.is_open_now)) {
    const barDisabled = !cfg.enabled;
    return (
      <AuthGuard>
        <ClientLayout>
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#2A4E36]/10">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2A4E36" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 8h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V8z" />
                <path d="M16 9h2a2 2 0 0 1 0 4h-2" />
              </svg>
            </div>
            {barDisabled ? (
              <>
                <h2 className="font-heading text-2xl text-[#2A4E36]">La barra está cerrada por ahora</h2>
                <p className="text-sm italic text-[#2A4E36]/60">
                  Vuelve pronto para recargar tu energía
                </p>
              </>
            ) : (
              <>
                <h2 className="font-heading text-2xl text-[#2A4E36]">Cerrada por ahora</h2>
                {cfg.opens_at_label && (
                  <p className="text-sm italic text-[#2A4E36]/60">
                    Abre {cfg.opens_at_label}
                  </p>
                )}
              </>
            )}
          </div>
        </ClientLayout>
      </AuthGuard>
    );
  }

  const isLoading = cfgLoading || menuLoading;

  return (
    <AuthGuard>
      <ClientLayout>
        <div className="relative mx-auto max-w-md pb-28">
          {/* ── Hero fotográfico ────────────────────────────────────────────── */}
          <div className="relative mx-4 mt-4 h-[184px] overflow-hidden rounded-[28px] shadow-[0_24px_46px_-28px_rgba(22,38,26,.65),inset_0_0_0_1px_rgba(255,255,255,.08)]">
            <img
              src="/casashe/espacio-hidratacion.jpg"
              alt="Fuel Bar Casa Shé"
              className="absolute inset-0 h-full w-full scale-[1.04] object-cover"
            />
            {/* scrim overlay */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(175deg, rgba(22,38,26,.08) 0%, rgba(22,38,26,.30) 45%, rgba(22,38,26,.72) 100%)',
              }}
            />
            {/* text content */}
            <div className="absolute bottom-[18px] left-5 right-5 z-10 text-[#F6EFE1]">
              <span className="inline-block rounded-full border border-[rgba(246,239,225,.5)] px-[11px] py-1 text-xs uppercase tracking-[.3em] text-[#F6EFE1] opacity-92">
                Recarga consciente
              </span>
              <h2 className="font-heading mt-[9px] text-[42px] leading-[.95] text-[#F6EFE1]">
                Fuel Bar
              </h2>
              <span className="mt-[7px] inline-flex items-center gap-[7px] text-[12px] italic opacity-90">
                <span
                  className="h-[7px] w-[7px] rounded-full"
                  style={{
                    background: '#8fd0a0',
                    boxShadow: '0 0 0 3px rgba(143,208,160,.25)',
                  }}
                />
                Abierto · listo en la barra tras tu clase
              </span>
            </div>
          </div>

          {/* ── Category chips ─────────────────────────────────────────────── */}
          {!isLoading && categories.length > 0 && (
            <div className="flex gap-[9px] overflow-x-auto px-4 py-[18px] scrollbar-hide">
              <button
                onClick={() => setActiveCategory(null)}
                className={[
                  'flex-shrink-0 rounded-full border px-[15px] py-[8px] text-[12.5px] transition-all',
                  activeCategory === null
                    ? 'border-[#2A4E36] bg-[#2A4E36] text-[#F6EFE1] shadow-[0_10px_20px_-12px_rgba(42,78,54,.6)]'
                    : 'border-[rgba(22,38,26,.10)] bg-[rgba(255,255,255,.42)] text-[#2A4E36] opacity-78',
                ].join(' ')}
              >
                Todo
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => scrollToCategory(cat)}
                  className={[
                    'flex-shrink-0 rounded-full border px-[15px] py-[8px] text-[12.5px] whitespace-nowrap transition-all',
                    activeCategory === cat
                      ? 'border-[#2A4E36] bg-[#2A4E36] text-[#F6EFE1] shadow-[0_10px_20px_-12px_rgba(42,78,54,.6)]'
                      : 'border-[rgba(22,38,26,.10)] bg-[rgba(255,255,255,.42)] text-[#2A4E36] opacity-78',
                  ].join(' ')}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* ── Loading skeleton ───────────────────────────────────────────── */}
          {isLoading && (
            <div className="space-y-3 px-4 py-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-[60px] w-[60px] animate-pulse rounded-[18px] bg-[#2A4E36]/10" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 animate-pulse rounded bg-[#2A4E36]/10" />
                    <div className="h-3 w-48 animate-pulse rounded bg-[#2A4E36]/08" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Product sections ───────────────────────────────────────────── */}
          {!isLoading && (
            <div className="px-4">
              {categories.map((cat, catIdx) => (
                <div
                  key={cat}
                  ref={(el) => {
                    sectionRefs.current[cat] = el;
                  }}
                >
                  {/* Category header */}
                  <div className="mt-5 mb-2 flex items-center gap-[9px]">
                    <span
                      className="h-2 w-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: catColor(catIdx) }}
                    />
                    <h3 className="font-heading text-[21px] text-[#2A4E36]">{cat}</h3>
                  </div>

                  {/* Product list */}
                  <div>
                    {grouped[cat].map((product, pIdx) => (
                      <div
                        key={product.id}
                        className={[
                          'flex items-center gap-[14px] py-[11px]',
                          pIdx < grouped[cat].length - 1
                            ? 'border-b border-[rgba(22,38,26,.06)]'
                            : '',
                        ].join(' ')}
                      >
                        <ProductThumb src={product.image_url} name={product.name} />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-[16px] leading-snug text-[#2A4E36]">
                            {product.name}
                          </div>
                          {product.description && (
                            <div className="mt-[3px] text-[12px] leading-[1.35] text-[#2A4E36] opacity-50">
                              {product.description}
                            </div>
                          )}
                        </div>

                        <div className="font-heading flex-shrink-0 text-[19px] text-[#2A4E36]">
                          {formatPrice(product.price)}
                        </div>

                        <button
                          aria-label={`Agregar ${product.name}`}
                          onClick={() => handleAdd(product)}
                          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[#2A4E36] text-[#F6EFE1] shadow-[0_10px_18px_-10px_rgba(42,78,54,.75)] transition-transform active:scale-95 disabled:opacity-40"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-[15px] w-[15px]"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M12 6v12M6 12h12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Empty state */}
              {!isLoading && categories.length === 0 && (
                <div className="py-12 text-center text-sm italic text-[#2A4E36]/50">
                  No hay productos disponibles en este momento.
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Sticky bottom CTA ──────────────────────────────────────────────── */}
        {count > 0 && (
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-8"
            style={{ background: 'linear-gradient(to top, #F6F0E4 58%, rgba(246,240,228,0))' }}
          >
            <button
              className="pointer-events-auto flex w-full max-w-md items-center justify-between rounded-full bg-[#2A4E36] px-3 pl-[26px] text-[#F6EFE1] shadow-[0_22px_40px_-22px_rgba(42,78,54,.9),inset_0_1px_0_rgba(255,255,255,.12)] transition-transform active:scale-[.98]"
              style={{ height: '58px' }}
              onClick={() =>
                nav('/app/fuel-bar/confirm', {
                  state: { cart },
                })
              }
            >
              <span className="text-[13px] uppercase tracking-[.16em]">Ver pedido</span>
              <span className="flex items-center gap-[14px]">
                <span className="font-heading text-[20px]">
                  {count} · {formatPrice(total)}
                </span>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(246,239,225,.14)]">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-[18px] w-[18px] text-[#F6EFE1]"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </span>
              </span>
            </button>
          </div>
        )}

        {/* ── Extras selector sheet ──────────────────────────────────────────── */}
        {selectorProduct && (
          <ExtrasSelector
            product={selectorProduct}
            extras={extras}
            onConfirm={(chosen) => {
              addToCart(selectorProduct, chosen);
              setSelectorProduct(null);
            }}
            onCancel={() => setSelectorProduct(null)}
          />
        )}
      </ClientLayout>
    </AuthGuard>
  );
}
