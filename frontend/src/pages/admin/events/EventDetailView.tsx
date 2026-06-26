import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Scanner } from '@yudiel/react-qr-scanner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';
import {
  ArrowLeft, Pencil, Share2, Rocket, CheckCircle2,
  Clock, AlertTriangle, Smartphone, Download, Send,
  UserPlus, ScanLine, QrCode, Trash2, XCircle,
  MessageCircle, Mail, Bell, CalendarDays, MapPin,
  User, ClipboardList, Gift, BarChart3, Settings2, Loader2,
  Camera,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StudioEvent, EventRegistration } from './types';
import { getEventTypeInfo } from './types';
import { EventTypeIcon } from './EventTypeIcon';
import { formatEventDate, formatCurrency } from './utils';

interface EventDetailViewProps {
  event: StudioEvent;
  onBack: () => void;
  onEdit?: (event: StudioEvent) => void;
  onUpdateStatus?: (eventId: string, status: string) => void;
  onDelete?: (eventId: string) => void;
  onUpdateRegistration?: (eventId: string, regId: string, status: string) => void;
  onCheckin?: (eventId: string, regId: string) => void;
  onUpdateConfig?: (eventId: string, config: Partial<Pick<StudioEvent, 'waitlistEnabled' | 'requiredPayment' | 'walletPass' | 'autoReminders' | 'allowCancellations'>>) => void;
  onNotify?: (eventId: string) => void;
  isNotifying?: boolean;
}

const regStatusMap: Record<string, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; label: string }> = {
  confirmed: { variant: 'default', label: 'Confirmado' },
  pending: { variant: 'secondary', label: 'Pendiente' },
  waitlist: { variant: 'outline', label: 'Lista de espera' },
  cancelled: { variant: 'destructive', label: 'Cancelado' },
  no_show: { variant: 'destructive', label: 'No asistió' },
};

const eventStatusMap: Record<string, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; label: string }> = {
  published: { variant: 'default', label: 'Publicado' },
  draft: { variant: 'secondary', label: 'Borrador' },
  cancelled: { variant: 'destructive', label: 'Cancelado' },
  completed: { variant: 'outline', label: 'Completado' },
};

function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function EventDetailView({ event, onBack, onEdit, onUpdateStatus, onDelete, onUpdateRegistration, onCheckin, onUpdateConfig, onNotify, isNotifying }: EventDetailViewProps) {
  const { toast } = useToast();
  const typeInfo = getEventTypeInfo(event.type);

  // QR Scanner state
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [scanMode, setScanMode] = useState<'camera' | 'manual'>('camera');
  const [qrResult, setQrResult] = useState<{ success: boolean; name?: string; message?: string } | null>(null);

  const qrCheckinMutation = useMutation({
    mutationFn: async (qrPayload: string) => {
      return await api.post('/checkin/event-qr', { qrPayload, eventId: event.id });
    },
    onSuccess: (response) => {
      const data = response.data;
      setQrResult({ success: true, name: data.attendee?.name, message: data.message });
      toast({ title: 'Check-in exitoso', description: data.attendee?.name || '' });
      // Trigger parent refresh by calling onCheckin with dummy data
      // This won't do a second check-in since the backend already did it
    },
    onError: (error: any) => {
      const msg = error.response?.data?.error || 'Error al escanear QR';
      setQrResult({ success: false, message: msg });
      toast({ variant: 'destructive', title: 'Error', description: msg });
    },
  });

  const [scanPaused, setScanPaused] = useState(false);

  const handleQrScan = (detectedCodes: any[]) => {
    if (detectedCodes.length > 0 && !qrCheckinMutation.isPending && !scanPaused) {
      const raw = detectedCodes[0].rawValue;
      if (raw) {
        setScanPaused(true);
        qrCheckinMutation.mutate(raw);
      }
    }
  };

  const handleManualQrSubmit = (value: string) => {
    if (value.trim()) {
      qrCheckinMutation.mutate(value.trim());
    }
  };

  // Add attendee state
  const [isAddAttendeeOpen, setIsAddAttendeeOpen] = useState(false);
  const [attendeeForm, setAttendeeForm] = useState({ name: '', email: '', phone: '' });
  const [attendeeSearch, setAttendeeSearch] = useState('');
  const [attendeeResults, setAttendeeResults] = useState<{ id: string; display_name: string; email: string; phone: string }[]>([]);
  const [searchingAttendee, setSearchingAttendee] = useState(false);
  const searchTimeoutRef = useState<ReturnType<typeof setTimeout> | null>(null);

  const addAttendeeMutation = useMutation({
    mutationFn: async (data: { name: string; email: string; phone: string }) => {
      return await api.post(`/events/${event.id}/registrations`, {
        name: data.name,
        email: data.email,
        phone: data.phone,
        status: 'confirmed',
      });
    },
    onSuccess: () => {
      toast({ title: 'Asistente agregado', description: 'Se registró exitosamente al evento.' });
      setIsAddAttendeeOpen(false);
      setAttendeeForm({ name: '', email: '', phone: '' });
      // Parent will refresh via onUpdateRegistration or query invalidation
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Error', description: error.response?.data?.error || 'No se pudo agregar' });
    },
  });

  const searchAttendees = async (term: string) => {
    if (term.length < 2) { setAttendeeResults([]); return; }
    setSearchingAttendee(true);
    try {
      const { data } = await api.get('/users', { params: { search: term, role: 'client', limit: 5 } });
      setAttendeeResults(data.users || []);
    } catch { setAttendeeResults([]); }
    finally { setSearchingAttendee(false); }
  };

  const handleAttendeeSearchChange = (value: string) => {
    setAttendeeSearch(value);
    if (searchTimeoutRef[0]) clearTimeout(searchTimeoutRef[0]);
    searchTimeoutRef[0] = setTimeout(() => searchAttendees(value), 400);
  };
  const confirmed = event.registrations.filter((r) => r.status === 'confirmed');
  const pending = event.registrations.filter((r) => r.status === 'pending');
  const waitlist = event.registrations.filter((r) => r.status === 'waitlist');
  const checkedIn = event.registrations.filter((r) => r.checkedIn);
  const revenue = confirmed.reduce((s, r) => s + r.amount, 0);
  const totalRegistrations = event.registrations.filter((r) => r.status !== 'cancelled' && r.status !== 'no_show').length;
  const statusInfo = eventStatusMap[event.status] || eventStatusMap.draft;

  return (
    <div className="space-y-6">
      {/* Back */}
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-2 -ml-2 text-primary">
        <ArrowLeft className="h-4 w-4" />
        Volver a eventos
      </Button>

      {/* Header Card */}
      <Card
        className="border overflow-hidden"
        style={{ borderColor: `${typeInfo.color}30` }}
      >
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row justify-between gap-4">
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <EventTypeIcon typeInfo={typeInfo} className="h-6 w-6" />
                <h2 className="text-xl font-heading font-bold text-foreground">{event.title}</h2>
                <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
              </div>
              <p className="text-sm text-muted-foreground max-w-xl leading-relaxed">{event.description}</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { icon: <CalendarDays className="h-3.5 w-3.5" />, text: formatEventDate(event.date) },
                  { icon: <Clock className="h-3.5 w-3.5" />, text: `${event.startTime} - ${event.endTime}` },
                  { icon: <MapPin className="h-3.5 w-3.5" />, text: event.location },
                  { icon: <User className="h-3.5 w-3.5" />, text: event.instructor },
                ].map((item, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground/80 bg-muted px-3 py-1.5 rounded-md"
                  >
                    {item.icon} {item.text}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex gap-2 shrink-0 self-start">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onEdit?.(event)}>
                <Pencil className="h-3.5 w-3.5" /> Editar
              </Button>
              <Button size="sm" className="gap-1.5">
                <Share2 className="h-3.5 w-3.5" /> Compartir
              </Button>
              {event.status === 'draft' && (
                <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => onUpdateStatus?.(event.id, 'published')}>
                  <Rocket className="h-3.5 w-3.5" /> Publicar
                </Button>
              )}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-6">
            {[
              { label: 'Inscritos', value: `${confirmed.length}/${event.capacity}`, sub: `${pending.length} pendientes` },
              { label: 'Lista espera', value: String(waitlist.length), sub: 'personas' },
              { label: 'Ingreso actual', value: formatCurrency(revenue), sub: 'confirmado' },
              { label: 'Precio actual', value: formatCurrency(event.price), sub: event.earlyBirdPrice ? `Early: ${formatCurrency(event.earlyBirdPrice)}` : '' },
              { label: 'Desc. miembros', value: `${event.memberDiscount}%`, sub: formatCurrency(Math.round(event.price * (1 - event.memberDiscount / 100))) },
            ].map((s, i) => (
              <div key={i} className="bg-card border rounded-lg p-3 text-center">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{s.label}</p>
                <p className="text-lg font-bold text-foreground mt-0.5">{s.value}</p>
                {s.sub && <p className="text-[11px] text-muted-foreground">{s.sub}</p>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="overview">Resumen</TabsTrigger>
          <TabsTrigger value="registrations">
            Inscripciones ({event.registrations.length})
          </TabsTrigger>
          <TabsTrigger value="checkin">Check-in</TabsTrigger>
          <TabsTrigger value="settings">Configuración</TabsTrigger>
        </TabsList>

        {/* ───── OVERVIEW ───── */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-muted-foreground" /> Requisitos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">{event.requirements}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Gift className="h-4 w-4 text-muted-foreground" /> Incluye
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {event.includes.map((item, i) => (
                  <div key={i} className="flex items-center gap-2.5 px-3 py-2 bg-emerald-50 dark:bg-emerald-950/30 rounded-md">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span className="text-sm text-foreground/80">{item}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Funnel */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" /> Embudo de Registro
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const funnelData = [
                  { label: 'Registros', value: totalRegistrations, color: 'bg-slate-400' },
                  { label: 'Pendientes', value: pending.length, color: 'bg-amber-400' },
                  { label: 'Confirmados', value: confirmed.length, color: 'bg-emerald-400' },
                  { label: 'Lista espera', value: waitlist.length, color: 'bg-violet-400' },
                  { label: 'Check-in', value: checkedIn.length, color: 'bg-blue-400' },
                ];
                const maxVal = Math.max(...funnelData.map(d => d.value), 1);
                return (
                  <div className="flex gap-3 items-end h-44">
                    {funnelData.map((bar, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-2">
                        <div
                          className={cn('w-full rounded-t-md flex items-center justify-center transition-all', bar.color)}
                          style={{ height: `${Math.max((bar.value / maxVal) * 140, 24)}px` }}
                        >
                          <span className="text-sm font-bold text-white drop-shadow-sm">{bar.value}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground font-medium text-center">{bar.label}</p>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ───── REGISTRATIONS ───── */}
        <TabsContent value="registrations" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="default" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" /> {confirmed.length} confirmados
                  </Badge>
                  <Badge variant="secondary" className="gap-1">
                    <Clock className="h-3 w-3" /> {pending.length} pendientes
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <AlertTriangle className="h-3 w-3" /> {waitlist.length} en espera
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => setIsAddAttendeeOpen(true)}>
                    <UserPlus className="h-3 w-3" /> Agregar
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1 text-xs">
                    <Download className="h-3 w-3" /> Exportar
                  </Button>
                  <Button size="sm" className="gap-1 text-xs">
                    <Send className="h-3 w-3" /> Recordatorio
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="rounded-md border-t overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Contacto</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Pago</TableHead>
                      <TableHead>Monto</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {event.registrations.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Aún no hay inscripciones
                        </TableCell>
                      </TableRow>
                    ) : (
                      event.registrations.map((reg) => {
                        const rStatus = regStatusMap[reg.status] || regStatusMap.pending;
                        return (
                          <TableRow key={reg.id}>
                            <TableCell>
                              <div className="flex items-center gap-2.5">
                                <Avatar className="h-8 w-8">
                                  <AvatarFallback
                                    className="text-xs font-semibold"
                                    style={{ background: `${typeInfo.color}15`, color: typeInfo.color }}
                                  >
                                    {getInitials(reg.name)}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="font-semibold text-sm">{reg.name}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <p className="text-sm text-foreground/80">{reg.email}</p>
                              <p className="text-xs text-muted-foreground">{reg.phone}</p>
                            </TableCell>
                            <TableCell>
                              <Badge variant={rStatus.variant}>{rStatus.label}</Badge>
                            </TableCell>
                            <TableCell>
                              <div>
                                <span className={cn('text-sm', reg.paidAt ? 'text-emerald-600' : 'text-muted-foreground')}>
                                  {reg.paidAt ? new Date(reg.paidAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Sin pago'}
                                </span>
                                {reg.paymentReference && (
                                  <p className="text-xs text-muted-foreground font-mono mt-0.5">
                                    Ref: {reg.paymentReference}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="font-semibold">{formatCurrency(reg.amount)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex gap-1.5 justify-end">
                                {reg.status === 'pending' && (
                                  <Button
                                    size="sm"
                                    variant="default"
                                    className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                                    onClick={() => onUpdateRegistration?.(event.id, reg.id, 'confirmed')}
                                  >
                                    <CheckCircle2 className="h-3 w-3" /> Confirmar
                                  </Button>
                                )}
                                {reg.status === 'waitlist' && (
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs gap-1"
                                    onClick={() => onUpdateRegistration?.(event.id, reg.id, 'pending')}
                                  >
                                    Mover a inscrito
                                  </Button>
                                )}
                                {(reg.status === 'confirmed' || reg.status === 'pending') && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => onUpdateRegistration?.(event.id, reg.id, 'cancelled')}
                                  >
                                    <XCircle className="h-3 w-3" /> Cancelar
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ───── CHECK-IN ───── */}
        <TabsContent value="checkin" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="text-center">
              <CardContent className="p-8 space-y-4">
                <div className="w-40 h-40 mx-auto rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center bg-muted/30">
                  <QrCode className="h-12 w-12 text-muted-foreground/60" />
                  <p className="text-xs text-muted-foreground mt-2 font-medium">Escanear QR</p>
                </div>
                <h3 className="text-lg font-heading font-bold">Check-in con QR</h3>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  Escanea el Wallet Pass del asistente para registrar su llegada automáticamente
                </p>
                <Button className="gap-2" onClick={() => { setIsQrScannerOpen(true); setQrResult(null); }}>
                  <ScanLine className="h-4 w-4" /> Abrir Escáner
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Check-in Manual</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {confirmed.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No hay inscritos confirmados
                  </p>
                ) : (
                  confirmed.map((reg) => (
                    <div key={reg.id} className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback
                            className="text-[11px] font-semibold"
                            style={{ background: `${typeInfo.color}15`, color: typeInfo.color }}
                          >
                            {getInitials(reg.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-semibold text-sm">{reg.name}</span>
                      </div>
                      {reg.checkedIn ? (
                        <Badge variant="default" className="gap-1 bg-emerald-600">
                          <CheckCircle2 className="h-3 w-3" /> Registrado
                        </Badge>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                          onClick={() => onCheckin?.(event.id, reg.id)}
                        >
                          Check-in <CheckCircle2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))
                )}
                <div className="mt-4 p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl text-center">
                  <p className="text-2xl sm:text-3xl font-bold tabular-nums truncate text-emerald-600">{confirmed.filter(r => r.checkedIn).length}/{confirmed.length}</p>
                  <p className="text-xs text-muted-foreground font-medium mt-1">Check-ins realizados</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ───── SETTINGS ───── */}
        <TabsContent value="settings" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-muted-foreground" /> Configuración del Evento
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {[
                  { key: 'waitlistEnabled' as const, label: 'Lista de espera', desc: 'Permitir inscripciones cuando se llene la capacidad', backendKey: 'waitlist_enabled' },
                  { key: 'requiredPayment' as const, label: 'Pago obligatorio', desc: 'Requiere pago para confirmar inscripción', backendKey: 'required_payment' },
                  { key: 'walletPass' as const, label: 'Wallet Pass', desc: 'Generar pase digital para Apple/Google Wallet', backendKey: 'wallet_pass' },
                  { key: 'autoReminders' as const, label: 'Recordatorios automáticos', desc: 'Enviar recordatorio 24h y 1h antes', backendKey: 'auto_reminders' },
                  { key: 'allowCancellations' as const, label: 'Permitir cancelaciones', desc: 'Las asistentes pueden cancelar hasta 48h antes', backendKey: 'allow_cancellations' },
                ].map((setting) => (
                  <div key={setting.key} className="flex justify-between items-center py-3 border-b border-border/50 last:border-0">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{setting.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{setting.desc}</p>
                    </div>
                    <Switch
                      checked={event[setting.key] ?? false}
                      onCheckedChange={(checked) =>
                        onUpdateConfig?.(event.id, { [setting.key]: checked })
                      }
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bell className="h-4 w-4 text-muted-foreground" /> Notificaciones
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full justify-between text-sm"
                    size="sm"
                    disabled={isNotifying}
                    onClick={() => onNotify?.(event.id)}
                  >
                    <span className="flex items-center gap-2">
                      {isNotifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                      Enviar invitación por email
                    </span>
                    <span className="text-primary text-xs font-semibold">
                      {isNotifying ? 'Enviando...' : 'A todos los usuarios →'}
                    </span>
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-red-200 dark:border-red-900/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2 text-red-700 dark:text-red-400">
                    <AlertTriangle className="h-4 w-4" /> Zona de peligro
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/30"
                    onClick={() => onUpdateStatus?.(event.id, 'cancelled')}>
                    <XCircle className="h-3.5 w-3.5" /> Cancelar Evento
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/30"
                    onClick={() => onDelete?.(event.id)}>
                    <Trash2 className="h-3.5 w-3.5" /> Eliminar Evento
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Add Attendee Dialog */}
      <Dialog open={isAddAttendeeOpen} onOpenChange={setIsAddAttendeeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" /> Agregar asistente
            </DialogTitle>
            <DialogDescription>
              Busca un usuario existente o ingresa los datos manualmente.
            </DialogDescription>
          </DialogHeader>

          {/* Search existing client */}
          <div className="space-y-2">
            <Label>Buscar usuario</Label>
            <div className="relative">
              <Input
                placeholder="Nombre, email o teléfono..."
                value={attendeeSearch}
                onChange={(e) => handleAttendeeSearchChange(e.target.value)}
              />
              {searchingAttendee && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            {attendeeResults.length > 0 && (
              <div className="rounded-md border bg-popover shadow-md max-h-40 overflow-y-auto">
                {attendeeResults.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors text-sm"
                    onClick={() => {
                      setAttendeeForm({ name: u.display_name, email: u.email, phone: u.phone });
                      setAttendeeResults([]);
                      setAttendeeSearch('');
                    }}
                  >
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{u.display_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-3">
            <div className="space-y-1">
              <Label>Nombre *</Label>
              <Input value={attendeeForm.name} onChange={(e) => setAttendeeForm(f => ({ ...f, name: e.target.value }))} placeholder="Nombre completo" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Email *</Label>
                <Input value={attendeeForm.email} onChange={(e) => setAttendeeForm(f => ({ ...f, email: e.target.value }))} placeholder="correo@ejemplo.com" type="email" />
              </div>
              <div className="space-y-1">
                <Label>Teléfono</Label>
                <Input value={attendeeForm.phone} onChange={(e) => setAttendeeForm(f => ({ ...f, phone: e.target.value }))} placeholder="+52..." />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsAddAttendeeOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => addAttendeeMutation.mutate(attendeeForm)}
              disabled={!attendeeForm.name || !attendeeForm.email || addAttendeeMutation.isPending}
            >
              {addAttendeeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Scanner Dialog */}
      <Dialog
        open={isQrScannerOpen}
        onOpenChange={(open) => {
          setIsQrScannerOpen(open);
          if (!open) { setQrResult(null); setScanMode('camera'); setScanPaused(false); }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Check-in de Evento
            </DialogTitle>
            <DialogDescription>
              Escanea el QR del pase del asistente para registrar su llegada.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2 mb-4">
            <Button variant={scanMode === 'camera' ? 'default' : 'outline'} size="sm" onClick={() => setScanMode('camera')} className="flex-1">
              <Camera className="h-4 w-4 mr-2" /> Cámara
            </Button>
            <Button variant={scanMode === 'manual' ? 'default' : 'outline'} size="sm" onClick={() => setScanMode('manual')} className="flex-1">
              <QrCode className="h-4 w-4 mr-2" /> Manual
            </Button>
          </div>

          {scanMode === 'camera' && (
            <div className="relative rounded-lg overflow-hidden bg-black aspect-square">
              <Scanner
                onScan={handleQrScan}
                onError={(error) => {
                  console.error('QR Scanner error:', error);
                  toast({ variant: 'destructive', title: 'Error de cámara', description: 'No se pudo acceder a la cámara. Intenta el modo manual.' });
                }}
                styles={{ container: { width: '100%', height: '100%' }, video: { width: '100%', height: '100%', objectFit: 'cover' } }}
              />
              {qrCheckinMutation.isPending && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-white" />
                </div>
              )}
            </div>
          )}

          {scanMode === 'manual' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Código QR</Label>
                <Input
                  id="eventQrPayload"
                  placeholder="Pega el contenido del QR aquí"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleManualQrSubmit((e.target as HTMLInputElement).value); }}
                />
              </div>
              <Button
                className="w-full"
                onClick={() => { const input = document.getElementById('eventQrPayload') as HTMLInputElement; handleManualQrSubmit(input?.value || ''); }}
                disabled={qrCheckinMutation.isPending}
              >
                {qrCheckinMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Verificar y Registrar
              </Button>
            </div>
          )}

          {qrResult && (
            <div className={cn(
              'rounded-lg border p-4 text-sm',
              qrResult.success ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-red-300 bg-red-50 text-red-800'
            )}>
              <div className="flex items-center gap-2 font-medium">
                {qrResult.success ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                {qrResult.success ? 'Check-in exitoso' : 'Error'}
              </div>
              {qrResult.name && <p className="mt-1">{qrResult.name}</p>}
              {qrResult.message && <p className="text-xs mt-1 opacity-80">{qrResult.message}</p>}
            </div>
          )}

          <DialogFooter className="gap-2">
            {scanPaused && (
              <Button onClick={() => { setScanPaused(false); setQrResult(null); }}>
                <ScanLine className="h-4 w-4 mr-2" /> Escanear otro
              </Button>
            )}
            <Button variant="outline" onClick={() => setIsQrScannerOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
