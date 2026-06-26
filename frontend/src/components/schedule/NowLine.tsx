import { useEffect, useState } from "react";
import { format } from "date-fns";

interface Props {
  firstHour: number;
  lastHour: number;
  topOffsetPx: number;     // pixels from grid top where hour rows begin
  rowHeightPx: number;     // pixels per hour row
}

export function NowLine({ firstHour, lastHour, topOffsetPx, rowHeightPx }: Props) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const m = now.getHours() * 60 + now.getMinutes();
  const start = firstHour * 60;
  const end = (lastHour + 1) * 60;
  if (m < start || m > end) return null;

  const relative = (m - start) / 60;          // hours into the grid
  const top = topOffsetPx + relative * rowHeightPx;

  return (
    <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: `${top}px` }}>
      <div className="relative">
        <span
          className="absolute -left-1 -top-2 editorial-caption-sm text-bmb-gold animate-now-pulse"
          aria-label={`Ahora: ${format(now, "HH:mm")}`}
        >
          Ahora
        </span>
        <div className="absolute left-14 right-0 h-px bg-bmb-gold animate-now-pulse" />
      </div>
    </div>
  );
}
