import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Aviso pequeño de "nueva versión disponible" para la PWA.
 *
 * Escucha el evento window `bmb:update-available` que dispara el registro del
 * service worker en main.tsx cuando hay un SW nuevo esperando. Mientras no haya
 * versión nueva, no renderiza nada (return null), así que es seguro montarlo
 * global, fuera de <Routes>.
 *
 * El botón "Recargar" le manda SKIP_WAITING al SW que espera (guardado en
 * window.__bmbWaitingSW); cuando el SW nuevo toma control, el listener de
 * `controllerchange` en main.tsx hace el reload real. Si no hay SW esperando
 * (fallback), recarga directo.
 *
 * Posición: en móvil/tablet se sitúa POR ENCIMA del bottom-nav + FAB "Reservar"
 * del shell de cliente (ambos `lg:hidden`); en ≥lg cae a la esquina inferior
 * derecha. z-40 = por encima del contenido normal pero por debajo de los
 * diálogos/sheets de shadcn (z-50) y de los toasts (z-100).
 */
export default function UpdatePrompt() {
  const [show, setShow] = useState(false);
  const [reloading, setReloading] = useState(false);
  const fallbackTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    // En dev no hay SW (solo se registra en PROD), así que nadie emite el
    // evento; gateamos también aquí para no instalar listeners de más.
    if (!import.meta.env.PROD) return;

    const onUpdate = () => setShow(true);
    window.addEventListener('bmb:update-available', onUpdate);

    // Por si el evento se disparó ANTES de que este componente montara (carrera
    // entre el registro del SW y el mount de React): el estado queda persistente
    // en window.__bmbWaitingSW, así que lo chequeamos al montar.
    if (window.__bmbWaitingSW) setShow(true);

    return () => {
      window.removeEventListener('bmb:update-available', onUpdate);
      if (fallbackTimer.current) window.clearTimeout(fallbackTimer.current);
    };
  }, []);

  const handleReload = () => {
    if (reloading) return; // evita re-armar el respaldo con doble clic
    setReloading(true);
    const sw = window.__bmbWaitingSW;
    if (sw) {
      // Promueve el SW de 'waiting' a 'activating'; al tomar control disparará
      // controllerchange en main.tsx, que hace el reload real.
      sw.postMessage({ type: 'SKIP_WAITING' });
      // Respaldo por si controllerchange no llega (algunos navegadores / casos
      // donde el SW ya no estaba realmente en waiting). Se cancela al desmontar.
      fallbackTimer.current = window.setTimeout(() => window.location.reload(), 1500);
    } else {
      // Fallback: una recarga normal ya basta (network-first en navegaciones).
      window.location.reload();
    }
  };

  if (!show) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-[calc(9rem+env(safe-area-inset-bottom,0px))] left-3 right-3 z-40 animate-in fade-in slide-in-from-bottom-4 duration-300 lg:bottom-4 lg:left-auto lg:right-4 lg:max-w-sm"
    >
      <div className="flex items-start gap-3 rounded-2xl border border-bmb-gold/40 bg-bmb-cream px-4 py-3 text-bmb-dark shadow-lg shadow-bmb-gold/10">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bmb-gold/15 text-bmb-deepgold">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-bmb-dark">Nueva versión disponible</p>
          <p className="mt-0.5 text-xs text-bmb-dark/70">
            Recarga para tener lo último de BMB Studio.
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleReload}
              disabled={reloading}
              aria-label="Recargar para actualizar a la nueva versión"
              className="h-8 gap-1.5 rounded-full bg-bmb-gold px-3 text-xs font-semibold text-bmb-dark hover:bg-bmb-deepgold hover:text-white focus-visible:ring-2 focus-visible:ring-bmb-deepgold focus-visible:ring-offset-2 focus-visible:ring-offset-bmb-cream"
            >
              <RefreshCw
                className={cn('h-3.5 w-3.5', reloading && 'animate-spin')}
                aria-hidden="true"
              />
              {reloading ? 'Recargando…' : 'Recargar'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShow(false)}
              disabled={reloading}
              aria-label="Recordarme después"
              className="h-8 rounded-full px-3 text-xs font-medium text-bmb-dark/60 hover:bg-bmb-gold/10 hover:text-bmb-deepgold focus-visible:ring-2 focus-visible:ring-bmb-deepgold focus-visible:ring-offset-2 focus-visible:ring-offset-bmb-cream"
            >
              Después
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
