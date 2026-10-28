import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import api from '@/lib/api';
import { normalizarTelefono } from '@/lib/whatsapp';
import { WhatsAppIcon } from './WhatsAppIcon';

export default function PersonalAssistance() {
  const { pathname } = useLocation();
  const visible = ['/', '/landing', '/bio', '/bio-link', '/inicio-clasico', '/bio/contacto'].includes(pathname);
  const { data } = useQuery<{ whatsapp: string | null }>({
    queryKey: ['public-contact'],
    queryFn: async () => (await api.get('/settings/public-contact')).data,
    staleTime: 60_000,
    enabled: visible,
  });
  const phone = normalizarTelefono(data?.whatsapp);
  if (!visible || !phone) return null;
  return <a
    href={`https://wa.me/${phone}?text=${encodeURIComponent('Hola Casa Shé, me gustaría recibir asistencia personal.')}`}
    target="_blank" rel="noopener noreferrer"
    aria-label="Asistencia personal de Casa Shé por WhatsApp"
    className="fixed right-4 z-40 inline-flex min-h-14 items-center gap-3 rounded-full bg-[#245C40] px-5 py-3 text-white shadow-lg transition-colors hover:bg-[#1B4630] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#245C40] sm:right-6"
    style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
  >
    <WhatsAppIcon className="h-7 w-7 shrink-0" />
    <span className="text-sm font-semibold">Asistencia personal</span>
  </a>;
}
