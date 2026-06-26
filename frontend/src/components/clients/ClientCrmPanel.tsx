import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CLIENT_TAGS, tagByKey } from '@/data/clientTags';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { KeyRound, X } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { useIsElevated } from '@/hooks/useIsElevated';

interface ClientCrmPanelProps {
  userId: string;
  phone?: string | null;
  email?: string | null;
  tags?: string[] | null;
  receptionNotes?: string | null;
  /** Se llama tras guardar tags/notas para que el contenedor refresque su query del cliente. */
  onChanged?: () => void;
}

interface ClientMessage {
  id: string;
  channel: string;
  subject: string | null;
  body: string;
  status: string;
  error: string | null;
  created_at: string;
  sent_by_name: string | null;
}

/**
 * CRM 1:1 de cliente compartido por recepción y admin: etiquetas, notas de
 * recepción y mensajería WhatsApp/Email con historial. Los endpoints
 * (PUT /users/:id, POST/GET /users/:id/message[s]) ya existen.
 */
export function ClientCrmPanel({
  userId,
  phone,
  email,
  tags,
  receptionNotes,
  onChanged,
}: ClientCrmPanelProps) {
  const qc = useQueryClient();
  const isElevated = useIsElevated();
  // Admin/master eligen con qué WhatsApp (sucursal) se manda el reenvío de credenciales.
  // Recepción normal no ve el selector: el backend usa el WhatsApp de su sucursal.
  const [waKey, setWaKey] = useState<'san-miguel' | 'tepa'>('san-miguel');

  const resendCredentials = useMutation({
    mutationFn: async () =>
      api.post(`/users/${userId}/resend-credentials`, isElevated ? { whatsappKey: waKey } : {}),
    onSuccess: () => toast.success('Credenciales enviadas por WhatsApp y email'),
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // Etiquetas (optimista local + persistencia)
  const [localTags, setLocalTags] = useState<string[]>(tags ?? []);
  useEffect(() => {
    setLocalTags(tags ?? []);
  }, [userId, tags]);

  const tagsMutation = useMutation({
    mutationFn: async (next: string[]) => api.put(`/users/${userId}`, { tags: next }),
    onSuccess: () => onChanged?.(),
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const toggleTag = (key: string) => {
    const next = localTags.includes(key)
      ? localTags.filter((t) => t !== key)
      : [...localTags, key];
    setLocalTags(next);
    tagsMutation.mutate(next);
  };

  // Notas de recepción
  const [notes, setNotes] = useState(receptionNotes ?? '');
  useEffect(() => {
    setNotes(receptionNotes ?? '');
  }, [userId, receptionNotes]);

  const saveNotes = useMutation({
    mutationFn: async () => api.put(`/users/${userId}`, { receptionNotes: notes }),
    onSuccess: () => {
      toast.success('Notas guardadas');
      onChanged?.();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // Mensajería
  const canWhatsApp = !!phone;
  const canEmail = !!email;
  const [channel, setChannel] = useState<'whatsapp' | 'email'>(phone ? 'whatsapp' : 'email');
  const [msgBody, setMsgBody] = useState('');
  const [subject, setSubject] = useState('');

  useEffect(() => {
    setChannel(phone ? 'whatsapp' : 'email');
    setMsgBody('');
    setSubject('');
  }, [userId, phone]);

  const { data: messages = [] } = useQuery<ClientMessage[]>({
    queryKey: ['client-messages', userId],
    queryFn: async () => (await api.get(`/users/${userId}/messages`)).data,
    enabled: !!userId,
  });

  const sendMessage = useMutation({
    mutationFn: async () => api.post(`/users/${userId}/message`, { channel, body: msgBody, subject }),
    onSuccess: (res) => {
      if (res.data?.ok) toast.success('Mensaje enviado');
      else toast.error(res.data?.error || 'No se pudo enviar el mensaje');
      setMsgBody('');
      setSubject('');
      qc.invalidateQueries({ queryKey: ['client-messages', userId] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="space-y-4">
      {/* Etiquetas */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">Etiquetas</h3>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm">+ Agregar</Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-2">
                <div className="flex flex-col gap-1">
                  {CLIENT_TAGS.map((t) => {
                    const active = localTags.includes(t.key);
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => toggleTag(t.key)}
                        disabled={tagsMutation.isPending}
                        className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted/50"
                      >
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: t.color }} />
                        <span className="flex-1">{t.label}</span>
                        {active && <span className="text-xs text-muted-foreground">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          {localTags.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin etiquetas.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {localTags.map((key) => {
                const t = tagByKey(key);
                if (!t) return null;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleTag(key)}
                    disabled={tagsMutation.isPending}
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: `${t.color}22`, color: t.color }}
                    title="Quitar etiqueta"
                  >
                    {t.label} <X className="h-3 w-3" />
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notas de recepción */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">Notas de recepción</h3>
            <Button size="sm" onClick={() => saveNotes.mutate()} disabled={saveNotes.isPending}>
              Guardar
            </Button>
          </div>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notas internas sobre el usuario…"
            rows={3}
          />
        </CardContent>
      </Card>

      {/* Mensaje */}
      <Card>
        <CardContent className="pt-4">
          <h3 className="font-medium mb-3">Enviar mensaje</h3>
          {isElevated && (
            <div className="mb-2">
              <p className="text-[11px] text-muted-foreground mb-1">Enviar credenciales desde el WhatsApp de:</p>
              <ToggleGroup
                type="single"
                value={waKey}
                onValueChange={(v) => { if (v === 'san-miguel' || v === 'tepa') setWaKey(v); }}
                className="justify-start gap-1"
              >
                <ToggleGroupItem value="san-miguel" size="sm" className="text-xs px-3">Condesa</ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2 mb-3"
            onClick={() => resendCredentials.mutate()}
            disabled={resendCredentials.isPending}
          >
            <KeyRound className="h-4 w-4" />
            {resendCredentials.isPending ? 'Enviando…' : 'Enviar credenciales por WhatsApp'}
          </Button>
          <ToggleGroup
            type="single"
            value={channel}
            onValueChange={(v) => {
              if (v === 'whatsapp' || v === 'email') setChannel(v);
            }}
            className="mb-2"
          >
            <ToggleGroupItem value="whatsapp" disabled={!canWhatsApp}>WhatsApp</ToggleGroupItem>
            <ToggleGroupItem value="email" disabled={!canEmail}>Email</ToggleGroupItem>
          </ToggleGroup>
          {channel === 'email' && (
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Asunto (opcional)"
              className="mb-2"
            />
          )}
          <Textarea
            value={msgBody}
            onChange={(e) => setMsgBody(e.target.value)}
            placeholder={channel === 'whatsapp' ? 'Mensaje de WhatsApp…' : 'Mensaje de email…'}
            rows={3}
          />
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              onClick={() => sendMessage.mutate()}
              disabled={
                sendMessage.isPending ||
                !msgBody.trim() ||
                (channel === 'whatsapp' && !canWhatsApp) ||
                (channel === 'email' && !canEmail)
              }
            >
              Enviar
            </Button>
          </div>

          {messages.length > 0 && (
            <div className="mt-4 border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Historial</p>
              <ul className="space-y-2">
                {messages.map((m) => (
                  <li key={m.id} className="text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium uppercase tracking-wide text-[10px] text-muted-foreground">
                        {m.channel}{m.sent_by_name ? ` · ${m.sent_by_name}` : ''}
                      </span>
                      <span className={m.status === 'failed' ? 'text-red-600' : 'text-muted-foreground'}>
                        {m.status === 'failed' ? 'falló' : new Date(m.created_at).toLocaleString('es-MX')}
                      </span>
                    </div>
                    <p className="text-foreground/90 whitespace-pre-wrap">{m.body}</p>
                    {m.status === 'failed' && m.error && <p className="text-red-600">{m.error}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
