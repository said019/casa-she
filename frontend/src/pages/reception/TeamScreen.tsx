import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Loader2, KeyRound } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuthStore } from '@/stores/authStore';
import { useFacilityScopeStore } from '@/stores/facilityScopeStore';
import { PermissionEditor } from '@/components/reception/PermissionEditor';
import { effectivePermissions, type PermissionMap } from '@/lib/permissions';

interface Staff {
  id: string;
  display_name: string;
  email: string;
  phone?: string | null;
  facility_name: string | null;
  default_facility_id: string | null;
  is_reception_master?: boolean;
  permissions?: Record<string, boolean>;
  role?: 'reception' | 'admin';
}

export default function TeamScreen() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const actorIsAdmin = me?.role === 'admin' || me?.role === 'super_admin';
  const actorPerms = effectivePermissions(me?.permissions);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [draft, setDraft] = useState<PermissionMap | null>(null);

  const { data: staff = [], isLoading } = useQuery<Staff[]>({
    queryKey: ['reception-staff', 'with-admins'],
    queryFn: async () => {
      // include_admins=true → la lista también trae a los admins, para poder reenviarles
      // credenciales (la dueña: admin/master pueden enviar las credenciales de admin).
      const { data } = await api.get('/users/reception?include_admins=true');
      return Array.isArray(data) ? data : [];
    },
  });

  const save = useMutation({
    mutationFn: async ({ id, permissions }: { id: string; permissions: PermissionMap }) =>
      api.put(`/users/${id}/permissions`, { permissions }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reception-staff'] });
      toast({ title: 'Permisos actualizados', description: 'La persona los verá al recargar o volver a entrar.' });
      setEditing(null); setDraft(null);
    },
    onError: (e) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(e) }),
  });

  // Reenviar credenciales (admin y recepción master) por WhatsApp + correo. Genera
  // contraseña nueva; devuelve la contraseña por si falla el envío.
  const [resendTarget, setResendTarget] = useState<Staff | null>(null);
  const [credResult, setCredResult] = useState<
    { name: string; email: string | null; phone: string | null; password: string; emailSent: boolean; whatsappSent: boolean } | null
  >(null);
  const resend = useMutation({
    mutationFn: async (member: Staff) => {
      const { data } = await api.post(`/users/${member.id}/resend-credentials`);
      return { member, data: data as { tempPassword?: string; emailSent?: boolean; whatsappSent?: boolean } };
    },
    onSuccess: ({ member, data }) => {
      setResendTarget(null);
      setCredResult({
        name: member.display_name,
        email: member.email ?? null,
        phone: member.phone ?? null,
        password: data?.tempPassword ?? '',
        emailSent: !!data?.emailSent,
        whatsappSent: !!data?.whatsappSent,
      });
    },
    onError: (e) => { setResendTarget(null); toast({ variant: 'destructive', title: 'Error al reenviar', description: getErrorMessage(e) }); },
  });

  // Respeta el selector de sucursal del header (null = todas). Incluye al propio
  // usuario (en solo-lectura) para que la lista no se vea incompleta.
  const selectedFacilityId = useFacilityScopeStore((s) => s.selectedFacilityId);
  const visible = staff.filter(
    // Los admins no están atados a una sucursal → siempre visibles (para sus credenciales).
    (s) => s.role === 'admin' || !selectedFacilityId || s.default_facility_id === selectedFacilityId,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold">Equipo</h1>
        <p className="text-balance-dark/60">Permisos de recepción y reenvío de credenciales (recepción y admins) por WhatsApp y correo.</p>
      </div>

      <div className="rounded-[1.25rem] border border-balance-sand/55 bg-[hsl(var(--admin-panel))]/70">
        {isLoading ? (
          <div className="py-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-balance-olive" /></div>
        ) : visible.length === 0 ? (
          <p className="py-12 text-center text-balance-dark/55">
            No hay recepcionistas.
          </p>
        ) : (
          <ul className="divide-y divide-balance-sand/40">
            {visible.map((s) => {
              const isSelf = s.id === me?.id;
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-balance-dark">
                      {s.display_name}
                      {s.role === 'admin' && <span className="ml-1.5 align-middle rounded-full bg-balance-gold/15 px-1.5 py-px text-[10px] font-medium text-bmb-deepgold">admin</span>}
                      {isSelf && <span className="ml-1 text-xs font-normal text-balance-dark/45">(tú)</span>}
                    </p>
                    <p className="truncate text-sm text-balance-dark/55">{s.email}{s.facility_name ? ` · ${s.facility_name}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Permisos granulares: solo para recepción (los admins no los usan). */}
                    {s.role !== 'admin' && (
                      <Button variant="outline" size="sm" disabled={isSelf}
                        title={isSelf ? 'No puedes editar tus propios permisos' : undefined}
                        onClick={() => { setEditing(s); setDraft(effectivePermissions(s.permissions)); }}>
                        Permisos
                      </Button>
                    )}
                    {/* Reenviar credenciales (WhatsApp + correo) — admin y recepción master. */}
                    <Button variant="outline" size="sm" className="gap-1.5"
                      disabled={resend.isPending}
                      title="Reenviar credenciales por WhatsApp y correo"
                      onClick={() => setResendTarget(s)}>
                      {resend.isPending && resend.variables?.id === s.id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <KeyRound className="h-4 w-4" />}
                      <span className="hidden sm:inline">Credenciales</span>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) { setEditing(null); setDraft(null); } }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Permisos de {editing?.display_name}</DialogTitle>
            <DialogDescription>{editing?.email}</DialogDescription>
          </DialogHeader>
          {draft && (
            <PermissionEditor
              value={draft}
              onChange={setDraft}
              actorIsAdmin={actorIsAdmin}
              actorPerms={actorPerms}
              disabled={save.isPending}
            />
          )}
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => { setEditing(null); setDraft(null); }} disabled={save.isPending}>Cancelar</Button>
            <Button disabled={save.isPending || !editing || !draft}
              onClick={() => editing && draft && save.mutate({ id: editing.id, permissions: draft })}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar reenvío de credenciales */}
      <AlertDialog open={!!resendTarget} onOpenChange={(o) => { if (!o) setResendTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Reenviar credenciales?</AlertDialogTitle>
            <AlertDialogDescription>
              Se generará una contraseña nueva para <strong>{resendTarget?.display_name}</strong> y se le enviará por <strong>WhatsApp y correo</strong>. La contraseña anterior dejará de funcionar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resend.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={resend.isPending} onClick={() => resendTarget && resend.mutate(resendTarget)}>
              {resend.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sí, reenviar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Resultado: contraseña nueva + estado de envío */}
      <Dialog open={!!credResult} onOpenChange={(o) => { if (!o) setCredResult(null); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Credenciales de {credResult?.name}</DialogTitle>
            <DialogDescription>Contraseña nueva generada. Compártela si el envío no llegó.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-base">{credResult?.password || '—'}</div>
            <p className="text-muted-foreground">
              WhatsApp: {credResult?.whatsappSent ? '✅ enviado' : (credResult?.phone ? '⚠️ no se pudo enviar' : 'sin teléfono')}
              {' · '}
              Correo: {credResult?.emailSent ? '✅ enviado' : (credResult?.email ? '⚠️ no se pudo enviar' : 'sin correo')}
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setCredResult(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
