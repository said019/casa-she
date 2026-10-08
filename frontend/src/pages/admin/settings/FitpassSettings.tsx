import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import api, { getErrorMessage } from '@/lib/api';
import { ChannelLogo } from '@/components/brands/ChannelLogo';
import type { ClassType } from '@/types/class';

// ─── Tipos (contrato de /api/partners/fitpass) ────────────────────────────────

interface CredentialsStatus {
  configured: boolean;
  is_enabled: boolean;
  email_masked: string | null;
  gym_id: number | null;
  verified_at: string | null;
}

interface Lesson { id: number; name: string }

interface AutoMapResult {
  mapped: { class_type_id: string; class_type_name: string; fitpass_lesson_id: number; lesson_name: string }[];
  unmatched: { class_type_id: string; class_type_name: string }[];
}

interface SyncStatus {
  last_run_at: string | null;
  success: boolean | null;
  details: unknown;
}

const VERDE = '#2A4E36';
const GYM_ID_DEFECTO = '9813';
const SIN_LECCION = 'ninguna';

function detalleTexto(details: unknown): string {
  if (!details) return '';
  if (typeof details === 'string') return details;
  try { return JSON.stringify(details); } catch { return ''; }
}

// ─── Fila del mapeo ───────────────────────────────────────────────────────────

function FilaMapeo({ tipo, lecciones }: { tipo: ClassType; lecciones: Lesson[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [leccion, setLeccion] = useState<string>(tipo.fitpass_lesson_id != null ? String(tipo.fitpass_lesson_id) : SIN_LECCION);
  const [cupo, setCupo] = useState<string>(String(tipo.fitpass_quota ?? 0));

  // Si el servidor cambia el valor (auto-mapeo, recarga), la fila lo refleja.
  useEffect(() => {
    setLeccion(tipo.fitpass_lesson_id != null ? String(tipo.fitpass_lesson_id) : SIN_LECCION);
    setCupo(String(tipo.fitpass_quota ?? 0));
  }, [tipo.fitpass_lesson_id, tipo.fitpass_quota]);

  const guardar = useMutation({
    mutationFn: async () =>
      (await api.put(`/partners/fitpass/class-types/${tipo.id}/lesson`, {
        fitpass_lesson_id: leccion === SIN_LECCION ? null : Number(leccion),
        fitpass_quota: Math.max(0, Math.trunc(Number(cupo) || 0)),
      })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['class-types'] });
      toast({ title: 'Disciplina guardada', description: tipo.name });
    },
    onError: (err) => toast({ title: 'No se pudo guardar', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const sinCambios =
    leccion === (tipo.fitpass_lesson_id != null ? String(tipo.fitpass_lesson_id) : SIN_LECCION) &&
    Number(cupo) === Number(tipo.fitpass_quota ?? 0);

  return (
    <tr className="border-t border-casa-arena/60" data-testid={`mapeo-${tipo.id}`}>
      <td className="py-3 pr-3 font-medium text-casa-ciruela">{tipo.name}</td>
      <td className="py-3 pr-3">
        <Select value={leccion} onValueChange={setLeccion}>
          <SelectTrigger aria-label={`Lección de Fitpass para ${tipo.name}`} className="min-w-[200px]">
            <SelectValue placeholder="Sin mapear" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SIN_LECCION}>Sin mapear</SelectItem>
            {lecciones.map((l) => (
              <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="py-3 pr-3">
        <Input
          type="number"
          min={0}
          className="w-24"
          aria-label={`Lugares para Fitpass por defecto en ${tipo.name}`}
          value={cupo}
          onChange={(e) => setCupo(e.target.value)}
        />
      </td>
      <td className="py-3 text-right">
        <Button
          size="sm"
          variant="outline"
          aria-label={`Guardar ${tipo.name}`}
          disabled={guardar.isPending || sinCambios}
          onClick={() => guardar.mutate()}
        >
          {guardar.isPending ? 'Guardando...' : 'Guardar'}
        </Button>
      </td>
    </tr>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function FitpassSettings() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: estado, isLoading } = useQuery<CredentialsStatus>({
    queryKey: ['fitpass-credentials'],
    queryFn: async () => (await api.get('/partners/fitpass/credentials/status')).data,
  });

  const conectado = !!estado?.configured;

  const { data: lecciones = [] } = useQuery<Lesson[]>({
    queryKey: ['fitpass-lessons'],
    queryFn: async () => (await api.get('/partners/fitpass/lessons')).data,
    enabled: conectado,
  });

  const { data: tipos = [] } = useQuery<ClassType[]>({
    queryKey: ['class-types'],
    queryFn: async () => (await api.get('/class-types', { params: { all: 'true' } })).data,
  });

  const { data: sync } = useQuery<SyncStatus>({
    queryKey: ['fitpass-sync-status'],
    queryFn: async () => (await api.get('/partners/fitpass/sync-status')).data,
    enabled: conectado,
  });

  // ── Credenciales ──
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [gymId, setGymId] = useState(GYM_ID_DEFECTO);
  const [errorCredenciales, setErrorCredenciales] = useState<string | null>(null);

  useEffect(() => {
    if (estado?.gym_id) setGymId(String(estado.gym_id));
  }, [estado?.gym_id]);

  const guardarCredenciales = useMutation({
    mutationFn: async () =>
      (await api.post('/partners/fitpass/credentials', {
        email: email.trim(),
        password,
        gym_id: Number(gymId),
      })).data as { ok: boolean; lessons: number },
    onSuccess: (res) => {
      setPassword('');
      setErrorCredenciales(null);
      qc.invalidateQueries({ queryKey: ['fitpass-credentials'] });
      qc.invalidateQueries({ queryKey: ['fitpass-lessons'] });
      toast({ title: 'Fitpass conectado', description: `${res.lessons} disciplinas disponibles en Fitpass.` });
    },
    onError: (err) => {
      const mensaje = getErrorMessage(err);
      setErrorCredenciales(mensaje);
      toast({ title: 'No se pudo conectar', description: mensaje, variant: 'destructive' });
    },
  });

  const desconectar = useMutation({
    mutationFn: async () => (await api.delete('/partners/fitpass/credentials')).data,
    onSuccess: () => {
      setEmail('');
      setPassword('');
      qc.invalidateQueries({ queryKey: ['fitpass-credentials'] });
      qc.invalidateQueries({ queryKey: ['fitpass-lessons'] });
      qc.invalidateQueries({ queryKey: ['fitpass-sync-status'] });
      toast({ title: 'Fitpass desconectado' });
    },
    onError: (err) => toast({ title: 'No se pudo desconectar', description: getErrorMessage(err), variant: 'destructive' }),
  });

  // ── Mapeo automático ──
  const [autoMapa, setAutoMapa] = useState<AutoMapResult | null>(null);
  const mapearAuto = useMutation({
    mutationFn: async () => (await api.post('/partners/fitpass/lessons/auto-map')).data as AutoMapResult,
    onSuccess: (res) => {
      setAutoMapa(res);
      qc.invalidateQueries({ queryKey: ['class-types'] });
      toast({ title: 'Mapeo automático listo', description: `${res.mapped.length} mapeadas · ${res.unmatched.length} sin coincidencia` });
    },
    onError: (err) => toast({ title: 'No se pudo mapear', description: getErrorMessage(err), variant: 'destructive' }),
  });

  // ── Sincronizar ahora ──
  const [resultadoSync, setResultadoSync] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const sincronizar = useMutation({
    mutationFn: async () => (await api.post('/partners/fitpass/sync-now')).data as { ok: boolean; summary?: unknown },
    onSuccess: (res) => {
      setResultadoSync({ ok: !!res.ok, mensaje: detalleTexto(res.summary) });
      qc.invalidateQueries({ queryKey: ['fitpass-sync-status'] });
      toast({ title: res.ok ? 'Sincronización lista' : 'La sincronización tuvo errores', description: detalleTexto(res.summary) });
    },
    onError: (err) => {
      const mensaje = getErrorMessage(err);
      setResultadoSync({ ok: false, mensaje });
      toast({ title: 'No se pudo sincronizar', description: mensaje, variant: 'destructive' });
    },
  });

  const puedeConectar = email.trim().length > 3 && password.length > 0 && Number(gymId) > 0 && !guardarCredenciales.isPending;
  const hace = sync?.last_run_at ? formatDistanceToNow(new Date(sync.last_run_at), { addSuffix: true, locale: es }) : null;

  return (
    <AuthGuard requiredRoles={['admin', 'super_admin']}>
      <AdminLayout>
        <div className="mx-auto max-w-3xl space-y-6 p-4">

          {/* Encabezado */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-heading font-bold" style={{ color: VERDE }}>
                <ChannelLogo canal="fitpass" alto={28} />
              </h1>
              <p className="text-muted-foreground">
                Conecta el portal de Fitpass para publicar cupos y traer las reservas de sus socias.
              </p>
            </div>
            {!isLoading && estado && (
              <Badge variant={conectado ? 'default' : 'secondary'}>{conectado ? 'Conectado' : 'Sin conectar'}</Badge>
            )}
          </div>

          {/* Credenciales */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading" style={{ color: VERDE }}>Conexión</CardTitle>
              <CardDescription>
                Usa el acceso del portal de socios aliados de Fitpass. Se valida al guardar; la contraseña nunca se vuelve a mostrar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {conectado && (
                <div className="space-y-1 rounded-xl border border-casa-arena bg-casa-avena/45 p-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Cuenta</span><span>{estado?.email_masked ?? '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Gimnasio (ID)</span><span>{estado?.gym_id ?? '—'}</span></div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Verificada</span>
                    <span>{estado?.verified_at ? new Date(estado.verified_at).toLocaleString('es-MX') : '—'}</span>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="fitpass_email">Correo del portal</Label>
                <Input id="fitpass_email" type="email" autoComplete="off" placeholder={conectado ? 'Escribe el correo para cambiar la cuenta' : 'correo@estudio.com'} value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fitpass_password">Contraseña</Label>
                <Input id="fitpass_password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fitpass_gym_id">ID del gimnasio</Label>
                <Input id="fitpass_gym_id" type="number" min={1} value={gymId} onChange={(e) => setGymId(e.target.value)} />
              </div>

              {errorCredenciales && <p role="alert" className="text-sm text-destructive">{errorCredenciales}</p>}

              <div className="flex flex-wrap justify-end gap-2">
                {conectado && (
                  <Button variant="outline" onClick={() => desconectar.mutate()} disabled={desconectar.isPending}>
                    {desconectar.isPending ? 'Desconectando...' : 'Desconectar'}
                  </Button>
                )}
                <Button onClick={() => guardarCredenciales.mutate()} disabled={!puedeConectar} style={{ backgroundColor: VERDE, color: '#fff' }}>
                  {guardarCredenciales.isPending ? 'Validando...' : conectado ? 'Guardar y validar' : 'Conectar'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Mapeo de disciplinas */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading" style={{ color: VERDE }}>Mapeo de disciplinas</CardTitle>
              <CardDescription>
                Une cada disciplina de Casa Shé con su lección en Fitpass y define cuántos lugares se ofrecen por defecto (0 = no se ofrece).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!conectado ? (
                <p className="text-sm text-muted-foreground">Conecta Fitpass arriba para elegir lecciones.</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button variant="outline" onClick={() => mapearAuto.mutate()} disabled={mapearAuto.isPending}>
                      {mapearAuto.isPending ? 'Mapeando...' : 'Mapear automáticamente'}
                    </Button>
                    <span className="text-xs text-muted-foreground">Empareja por nombre; lo demás lo eliges a mano.</span>
                  </div>

                  {autoMapa && (
                    <div className="space-y-1 rounded-xl border border-casa-arena bg-casa-avena/45 p-3 text-sm" data-testid="resultado-automapa">
                      <p className="font-medium text-casa-ciruela">{autoMapa.mapped.length} mapeadas · {autoMapa.unmatched.length} sin coincidencia</p>
                      {autoMapa.mapped.map((m) => (
                        <p key={m.class_type_id} className="text-green-700">{m.class_type_name} → {m.lesson_name}</p>
                      ))}
                      {autoMapa.unmatched.map((u) => (
                        <p key={u.class_type_id} className="text-muted-foreground">{u.class_type_name}: sin coincidencia, elígela abajo</p>
                      ))}
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-muted-foreground">
                        <tr>
                          <th className="pb-2 pr-3">Disciplina</th>
                          <th className="pb-2 pr-3">Lección en Fitpass</th>
                          <th className="pb-2 pr-3">Lugares por defecto</th>
                          <th className="pb-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {tipos.filter((t) => t.is_active !== false).map((t) => (
                          <FilaMapeo key={t.id} tipo={t} lecciones={lecciones} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Sincronización */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading" style={{ color: VERDE }}>Sincronización</CardTitle>
              <CardDescription>Publica los cupos y trae las reservas de Fitpass al calendario.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm" data-testid="estado-sync">
                {hace ? (
                  <>
                    Última sincronización {hace} ·{' '}
                    <span className={sync?.success ? 'text-green-700' : 'text-destructive'}>{sync?.success ? 'correcta' : 'con error'}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Todavía no hay sincronizaciones.</span>
                )}
              </p>
              {hace && !sync?.success && detalleTexto(sync?.details) && (
                <p className="break-words text-xs text-muted-foreground">{detalleTexto(sync?.details)}</p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={() => sincronizar.mutate()} disabled={!conectado || sincronizar.isPending}>
                  {sincronizar.isPending ? 'Sincronizando...' : 'Sincronizar ahora'}
                </Button>
                <Button variant="ghost" asChild>
                  <Link to="/admin/bookings/fitpass-import">Importar reservas a mano</Link>
                </Button>
              </div>
              {resultadoSync && (
                <p className={resultadoSync.ok ? 'break-words text-sm text-green-700' : 'break-words text-sm text-destructive'}>
                  {resultadoSync.ok ? 'Sincronización lista' : 'Error'}{resultadoSync.mensaje ? ` · ${resultadoSync.mensaje}` : ''}
                </p>
              )}
            </CardContent>
          </Card>

        </div>
      </AdminLayout>
    </AuthGuard>
  );
}
