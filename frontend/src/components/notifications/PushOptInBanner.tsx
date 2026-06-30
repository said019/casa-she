import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { usePush } from '@/hooks/usePush';

const DISMISS_KEY = 'casashe_push_banner_dismissed';

export function PushOptInBanner() {
  const push = usePush();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
  }, []);

  if (dismissed) return null;
  if (push.state !== 'default') return null; // soportado, con permiso por pedir, sin suscribir

  const close = () => { localStorage.setItem(DISMISS_KEY, '1'); setDismissed(true); };

  return (
    <div className="flex items-center gap-3 rounded-[1.2rem] border border-[#D6D5C2]/70 bg-[#F6F0E4]/80 px-5 py-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2A4E36]/10 text-[#2A4E36]">
        <Bell className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-heading text-[#2E1B22]">Activa tus recordatorios</p>
        <p className="text-sm text-[#6B554D]">Te avisamos de tus clases en tu celular, aunque esté bloqueado.</p>
      </div>
      <button onClick={() => { void push.enable(); close(); }} className="shrink-0 rounded-full bg-[#2A4E36] px-4 py-2 text-sm text-[#F6F0E4]">Activar</button>
      <button onClick={close} aria-label="Cerrar" className="shrink-0 rounded-full p-1 text-[#6B554D]"><X className="h-4 w-4" /></button>
    </div>
  );
}
