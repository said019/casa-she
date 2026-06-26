import { useEffect, useState } from 'react';
import api from '@/lib/api';

type Reformer = {
  id: string;
  number: number;
  position_x: number;
  position_y: number;
  rotation: number;
  scale: number;
  image_url: string | null;
  spot_kind: string;
};
type Facility = {
  id: string;
  name: string;
  background_url: string | null;
  default_reformer_image_url: string | null;
  front_position_x: number;
  front_position_y: number;
  map_notes: string | null;
};
type MapsResponse = Array<{ facility: Facility; reformers: Reformer[] }>;

const ICON_BY_KIND: Record<string, string> = {
  reformer: '/yoga-mat.png',
  mat: '/yoga-mat.png',
  barre: '/yoga-mat.png',
  wunda: '/pilates-chair.png',
  generic: '/yoga-mat.png',
};

function MapCard({ facility, reformers }: { facility: Facility; reformers: Reformer[] }) {
  const fn = facility.name.toLowerCase();
  const isHot = /hot/.test(fn);
  const isBarre = /barre/.test(fn);
  const isWunda = /wunda/.test(fn);
  const cardClass = `lum-map-card ${isHot ? 'lum-map-hot' : ''} ${isBarre ? 'lum-map-barre' : ''} ${isWunda ? 'lum-map-wunda' : ''}`;
  const coachLabel = isHot ? 'Mat Coach' : isBarre ? 'Coach' : 'Maestra';
  const defaultImg = facility.default_reformer_image_url || null;

  return (
    <div className="export-frame">
      <div className="export-header">
        <img src="/bmb-studio-logo.png" alt="" className="export-logo" />
        <div>
          <div className="export-brand">BMB Studio</div>
          <div className="export-room">Sala {facility.name}</div>
        </div>
      </div>

      <div className={cardClass}>
        <svg className="lum-bp lum-bp-grid" viewBox="0 0 1600 1000" preserveAspectRatio="none">
          <defs>
            <pattern id={`grid-${facility.id}`} width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="rgba(71,83,110,0.06)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect x="0" y="0" width="1600" height="1000" fill={`url(#grid-${facility.id})`} />
        </svg>
        {!isHot && (
          <svg className="lum-bp" viewBox="0 0 1600 1000" preserveAspectRatio="none">
            <rect x="24" y="24" width="1552" height="952" rx="28" fill="none" stroke="rgba(28,28,30,0.16)" strokeWidth="2" />
          </svg>
        )}
        <div className="lum-specular" />

        {isBarre && (
          <>
            <div className="lum-barre-mirror lum-barre-mirror-left" />
            <div className="lum-barre-mirror lum-barre-mirror-right" />
            <img src="/barra-de-barre.png" alt="" className="lum-barre-wall lum-barre-wall-left" />
            <img src="/barra-de-barre.png" alt="" className="lum-barre-wall lum-barre-wall-right" />
          </>
        )}
        {isWunda && (
          <>
            <span className="lum-wunda-label lum-wunda-label-top">WUNDA</span>
            <span className="lum-wunda-label lum-wunda-label-bottom">CHAIR</span>
            <div className="lum-wunda-mirror" />
          </>
        )}

        {!isWunda && (
          <div
            className="lum-front"
            style={{ left: `${facility.front_position_x}%`, top: `${facility.front_position_y}%` }}
          >
            <span className="dia" />
            {coachLabel}
          </div>
        )}

        {reformers.map((r) => {
          const kind = (r.spot_kind || 'reformer') as keyof typeof ICON_BY_KIND;
          const img = r.image_url || defaultImg || ICON_BY_KIND[kind] || '/yoga-mat.png';
          let w = (kind === 'reformer' ? 112 : 96) * (r.scale || 1);
          let h: number;
          if (kind === 'reformer') h = w * 1.5;
          else if (isBarre) { w = Math.round(w * 1.45); h = Math.round(w * 0.55); }
          else h = w * 0.85;

          let rotation: number;
          if (kind === 'reformer') rotation = (r.rotation || 0) - 90;
          else if (isHot && kind === 'mat') {
            const dx = facility.front_position_x - r.position_x;
            const dy = facility.front_position_y - r.position_y;
            rotation = Math.atan2(dy, dx) * (180 / Math.PI) - 180;
          } else rotation = r.rotation || 0;

          return (
            <div
              key={r.id}
              className="lum-spot lum-spot-free"
              style={{
                left: `${r.position_x}%`,
                top: `${r.position_y}%`,
                width: `${w}px`,
                height: `${h}px`,
              }}
            >
              <div className="tile">
                <img src={img} alt="" style={{ transform: `translate(-50%, -50%) rotate(${rotation}deg)` }} />
              </div>
              <span className="num">{r.number}</span>
            </div>
          );
        })}
      </div>

      <div className="export-footer">
        <span>bmbstudio.mx</span>
        <span>·</span>
        <span>Capacidad {reformers.length}</span>
      </div>
    </div>
  );
}

export default function MapsExport() {
  const [data, setData] = useState<MapsResponse | null>(null);

  useEffect(() => {
    api.get<MapsResponse>('/facilities/public/maps')
      .then((r) => setData(r.data))
      .catch((e) => console.error('Maps fetch error:', e));
  }, []);

  return (
    <div className="export-root">
      <div className="export-instructions">
        <p>
          <strong>Instrucciones:</strong> haz captura de cada cuadro con <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>4</kbd>{' '}
          y arrastra sobre el mapa que quieras. Cada cuadro mide 1080×1080 (formato Instagram/Facebook).
        </p>
      </div>
      <div className="export-grid">
        {data?.map((m) => <MapCard key={m.facility.id} facility={m.facility} reformers={m.reformers} />)}
      </div>
      <style>{`
        body { background: #1a1a1c; }
        .export-root {
          background: #1a1a1c;
          min-height: 100vh;
          padding: 32px 16px 64px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .export-instructions {
          max-width: 1100px; margin: 0 auto 32px;
          color: #ebe6d9;
          font-size: 14px; line-height: 1.6;
        }
        .export-instructions p { background: rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.08); padding:14px 18px; border-radius: 14px; }
        .export-instructions kbd {
          background:#3a3a3e; padding:2px 7px; border-radius:5px;
          font-size:12px; border:1px solid rgba(255,255,255,.12);
        }
        .export-grid { display:flex; flex-direction:column; align-items:center; gap:32px; }
        .export-frame {
          width: 1080px; height: 1080px; max-width: 100%;
          background: #fbf8f2;
          border-radius: 24px; padding: 56px;
          display: flex; flex-direction: column;
          box-shadow: 0 24px 60px -20px rgba(0,0,0,.6);
          color: #1c1c1e;
          --lum-ink: #1c1c1e;
          --lum-ink-60: rgba(28,28,30,0.60);
          --lum-ink-40: rgba(28,28,30,0.40);
          --lum-ink-20: rgba(28,28,30,0.18);
          --lum-ink-08: rgba(28,28,30,0.08);
          --lum-cream: #fbf8f2;
          --lum-cream-2: #f5f1e8;
          --lum-sand: #ebe6d9;
          --lum-sand-dark: #d9d3c4;
          --lum-accent: #7e8579;
          --lum-accent-soft: #a8b09f;
        }
        .export-header { display:flex; align-items:center; gap:18px; margin-bottom: 28px; }
        .export-logo { width:64px; height:64px; object-fit:contain; }
        .export-brand { font-size: 12px; letter-spacing:0.3em; text-transform:uppercase; color:#7e8579; font-weight:500; }
        .export-room { font-size: 36px; font-weight:300; letter-spacing:-0.02em; margin-top:4px; }

        .lum-map-card {
          position: relative;
          flex: 1;
          aspect-ratio: 1 / 1;
          border-radius: 24px;
          overflow: hidden;
          background: linear-gradient(180deg, var(--lum-cream-2) 0%, var(--lum-sand) 100%);
          box-shadow:
            0 1px 0 rgba(255,255,255,.9) inset,
            0 0 0 1px var(--lum-ink-08),
            0 40px 80px -40px rgba(71,83,110,.18),
            0 10px 28px -14px rgba(28,28,30,.08);
        }
        .lum-map-card.lum-map-hot {
          background: linear-gradient(180deg, var(--lum-cream-2) 0%, var(--lum-sand) 100%);
        }

        .lum-bp { position:absolute; inset:0; pointer-events:none; }
        .lum-bp-grid { opacity:.45; }
        .lum-specular {
          position:absolute; inset:18% 15%;
          background: radial-gradient(60% 55% at 50% 40%, rgba(255,255,255,.4) 0%, transparent 70%);
          mix-blend-mode: screen; pointer-events:none; z-index:1;
        }

        .lum-barre-mirror {
          position:absolute; top:10%; bottom:10%; width:14px; border-radius:6px; pointer-events:none; z-index:1;
          background: linear-gradient(180deg,
            rgba(170,200,225,.55) 0%, rgba(220,235,245,.78) 28%,
            rgba(180,210,230,.62) 55%, rgba(220,235,245,.78) 78%,
            rgba(170,200,225,.55) 100%);
          border: 1px solid rgba(120,160,190,.55);
          box-shadow: inset 0 0 10px rgba(255,255,255,.7), inset 0 1px 0 rgba(255,255,255,.85), 0 0 18px rgba(150,190,220,.28);
        }
        .lum-barre-mirror-left { left:4%; }
        .lum-barre-mirror-right { right:4%; }
        .lum-barre-wall {
          position:absolute; pointer-events:none; z-index:1;
          width:38%; height:auto; top:50%;
          opacity:.88; mix-blend-mode:multiply; transform-origin:center;
        }
        .lum-barre-wall-left { left:17%; transform:translate(-50%,-50%) rotate(-90deg); }
        .lum-barre-wall-right { left:83%; transform:translate(-50%,-50%) rotate(90deg); }

        .lum-wunda-label {
          position:absolute; left:8%;
          font-size:13px; letter-spacing:0.42em; font-weight:600;
          color: var(--lum-ink); writing-mode: vertical-rl;
          text-orientation: mixed; transform: rotate(180deg);
          pointer-events:none; z-index:1;
        }
        .lum-wunda-label-top { top:18%; }
        .lum-wunda-label-bottom { top:58%; }
        .lum-wunda-mirror {
          position:absolute; top:8%; bottom:8%; right:6%; width:14px; border-radius:6px; pointer-events:none; z-index:1;
          background: linear-gradient(180deg,
            rgba(170,200,225,.55) 0%, rgba(220,235,245,.78) 28%,
            rgba(180,210,230,.62) 55%, rgba(220,235,245,.78) 78%,
            rgba(170,200,225,.55) 100%);
          border: 1px solid rgba(120,160,190,.55);
          box-shadow: inset 0 0 10px rgba(255,255,255,.7), inset 0 1px 0 rgba(255,255,255,.85), 0 0 18px rgba(150,190,220,.28);
        }

        .lum-front {
          position:absolute; transform:translate(-50%,-50%);
          padding:10px 20px 10px 14px;
          background: var(--lum-ink); color: var(--lum-cream); border-radius:999px;
          font-size:10px; letter-spacing:.3em; text-transform:uppercase;
          display:inline-flex; align-items:center; gap:11px;
          box-shadow: 0 10px 24px -8px rgba(28,28,30,.45),0 0 0 4px var(--lum-cream),inset 0 1px 0 rgba(255,255,255,.08);
          z-index:4; pointer-events:none;
        }
        .lum-front .dia { width:8px; height:8px; background:var(--lum-accent-soft); transform:rotate(45deg); flex-shrink:0; }

        .lum-spot { position:absolute; transform:translate(-50%,-50%); border:0; background:transparent; padding:0; z-index:2; }
        .lum-spot .tile {
          position:absolute; inset:0;
          border-radius: 16px;
          background: linear-gradient(160deg, #ebe6d9 0%, #d9d3c4 55%, #ebe6d9 100%);
          border: 1px solid rgba(126,133,121,.40);
          box-shadow: 0 12px 24px -12px rgba(126,133,121,.28), inset 0 1px 0 rgba(255,255,255,.55);
          overflow:hidden;
        }
        .lum-spot .tile::before {
          content:""; position:absolute; inset:0;
          background: linear-gradient(140deg, rgba(255,255,255,.28) 0%, transparent 40%);
          pointer-events:none;
        }
        .lum-spot .tile img {
          position:absolute; left:50%; top:50%; width:88%; height:88%;
          object-fit:contain; transform:translate(-50%,-50%); mix-blend-mode:multiply;
        }
        .lum-spot .num {
          position:absolute; left:50%; bottom:-10px; transform:translate(-50%,0);
          width:30px; height:30px; border-radius:50%;
          display:inline-flex; align-items:center; justify-content:center;
          font-weight:600; font-size:13px;
          background: var(--lum-cream); color: var(--lum-ink);
          box-shadow: 0 0 0 3px var(--lum-cream), 0 6px 12px -4px rgba(28,28,30,.18);
        }

        /* Hot Room — black marble tiles */
        .lum-map-hot .lum-spot-free .tile {
          background:
            radial-gradient(120% 80% at 18% 22%, rgba(255,255,255,0.10) 0%, transparent 35%),
            radial-gradient(90% 60% at 82% 78%, rgba(255,255,255,0.06) 0%, transparent 40%),
            linear-gradient(135deg, #1a1a1c 0%, #2a2a2e 35%, #141416 60%, #262628 100%);
          border-color: rgba(255,255,255,0.10);
        }
        /* Barre — solid black tiles */
        .lum-map-barre .lum-spot-free .tile {
          background: #141416;
          border-color: rgba(255,255,255,0.08);
        }
        .lum-map-barre .lum-spot .tile img { width:95%; height:95%; }
        /* Wunda — green marble */
        .lum-map-wunda .lum-spot-free .tile {
          background:
            radial-gradient(120% 80% at 18% 22%, rgba(255,255,255,0.14) 0%, transparent 35%),
            radial-gradient(90% 60% at 82% 78%, rgba(120,180,140,0.20) 0%, transparent 40%),
            linear-gradient(135deg, #1f3a2c 0%, #2e5a45 35%, #1a2e22 60%, #345e48 100%);
          border-color: rgba(180,220,200,0.18);
        }
        .lum-map-hot .lum-spot .tile img,
        .lum-map-barre .lum-spot .tile img,
        .lum-map-wunda .lum-spot .tile img {
          mix-blend-mode: screen;
          filter: invert(1) brightness(2.2) contrast(0.9);
          opacity: 0.92;
        }
        .lum-map-barre .lum-front {
          background:
            radial-gradient(120% 80% at 18% 22%, rgba(255,255,255,0.14) 0%, transparent 35%),
            linear-gradient(135deg, #1a1a1c 0%, #2c2c30 50%, #141416 100%);
        }

        .export-footer {
          margin-top: 24px;
          display:flex; justify-content:center; gap:12px;
          color:#7e8579; font-size:12px; letter-spacing:.2em; text-transform:uppercase;
        }

        @media print {
          body { background: white; }
          .export-instructions { display: none; }
          .export-frame { box-shadow: none; page-break-after: always; }
        }
      `}</style>
    </div>
  );
}
