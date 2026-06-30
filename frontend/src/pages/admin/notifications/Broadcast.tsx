import { useState } from 'react';
import api from '@/lib/api';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { useToast } from '@/components/ui/use-toast';

export default function PushBroadcast() {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!title.trim() || !body.trim()) {
      toast({ variant: 'destructive', title: 'Faltan datos', description: 'Título y mensaje son obligatorios.' });
      return;
    }
    if (!window.confirm('¿Enviar esta notificación a todas las clientas suscritas?')) return;
    setSending(true);
    try {
      const { data } = await api.post('/admin/push/broadcast', { title, body, url: url || undefined });
      toast({ title: 'Difusión enviada', description: `${data.sent} envíos a ${data.recipients} clientas.` });
      setTitle(''); setBody(''); setUrl('');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo enviar', description: e?.response?.data?.error || 'Error' });
    } finally {
      setSending(false);
    }
  };

  return (
    <AuthGuard requiredRoles={['admin', 'super_admin']}>
      <AdminLayout>
        <div className="mx-auto max-w-xl space-y-4">
          <h1 className="font-heading text-2xl text-balance-dark">Difusión push</h1>
          <p className="text-sm text-balance-dark/60">Manda un aviso a todas las clientas con notificaciones activadas.</p>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="Título" className="w-full rounded-xl border px-4 py-3" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={160} placeholder="Mensaje" rows={3} className="w-full rounded-xl border px-4 py-3" />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Enlace (opcional, ej. /app/book)" className="w-full rounded-xl border px-4 py-3" />
          <button onClick={send} disabled={sending} className="rounded-full bg-[#2A4E36] px-6 py-3 text-[#F6F0E4] disabled:opacity-50">
            {sending ? 'Enviando…' : 'Enviar a todas'}
          </button>
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}
