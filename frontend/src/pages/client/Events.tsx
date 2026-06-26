import { useEffect, useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import { fetchMyMembership } from '@/lib/memberships';
import type { ClientMembership } from '@/types/membership';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  CalendarDays,
  Clock,
  MapPin,
  User,
  Users,
  Star,
  Wrench,
  Leaf,
  Flame,
  Home,
  Sparkles,
  CheckCircle2,
  ArrowLeft,
  Gift,
  AlertCircle,
  Ticket,
  Building2,
  Upload,
  Copy,
  FileImage,
  X,
  Landmark,
  CreditCard,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ClientEvent {
  id: string;
  title: string;
  description: string;
  type: string;
  instructor: string;
  instructorPhoto: string | null;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  capacity: number;
  registered: number;
  price: number;
  earlyBirdPrice: number | null;
  earlyBirdDeadline: string | null;
  memberDiscount: number;
  image: string | null;
  status: string;
  tags: string[];
  requirements: string;
  includes: string[];
  myRegistration?: {
    id: string;
    status: string;
    amount: number;
    checkedIn: boolean;
    paymentMethod: string | null;
    paymentReference: string | null;
    hasPaymentProof: boolean;
    paymentProofFileName: string | null;
    transferDate: string | null;
  } | null;
}

interface BankInfo {
  bank_name: string;
  account_holder: string;
  account_number: string;
  clabe: string;
  reference_instructions: string;
}

type EventPaymentMethod = 'transfer' | 'cash';

const typeIcons: Record<string, React.ReactNode> = {
  masterclass: <Star className="h-5 w-5" />,
  workshop: <Wrench className="h-5 w-5" />,
  retreat: <Leaf className="h-5 w-5" />,
  challenge: <Flame className="h-5 w-5" />,
  openhouse: <Home className="h-5 w-5" />,
  special: <Sparkles className="h-5 w-5" />,
};

const typeColors: Record<string, string> = {
  masterclass: '#8B5CF6',
  workshop: '#F59E0B',
  retreat: '#10B981',
  challenge: '#EF4444',
  openhouse: '#3B82F6',
  special: '#EC4899',
};

const typeLabels: Record<string, string> = {
  masterclass: 'Masterclass',
  workshop: 'Workshop',
  retreat: 'Retiro',
  challenge: 'Challenge',
  openhouse: 'Open House',
  special: 'Clase Especial',
};

function formatDate(d: string): string {
  if (!d) return 'Sin fecha';
  const dateStr = d.includes('T') ? d.split('T')[0] : d;
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0);
  if (isNaN(date.getTime())) return 'Fecha inválida';
  return date.toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function formatShortDate(d: string): string {
  if (!d) return '';
  const dateStr = d.includes('T') ? d.split('T')[0] : d;
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

export default function ClientEvents() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedEvent, setSelectedEvent] = useState<ClientEvent | null>(null);
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [eventPaymentMethod, setEventPaymentMethod] = useState<EventPaymentMethod>('transfer');

  // Payment proof state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [transferReference, setTransferReference] = useState('');
  const [transferDate, setTransferDate] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);

  const { data: events = [], isLoading } = useQuery<ClientEvent[]>({
    queryKey: ['client-events'],
    queryFn: async () => (await api.get('/events?upcoming=true')).data,
  });

  const { data: membership } = useQuery<ClientMembership | null>({
    queryKey: ['my-membership'],
    queryFn: fetchMyMembership,
  });

  const hasActiveMembership = membership?.status === 'active';

  // Fetch bank info when user has a pending registration
  const isPendingPayment = selectedEvent?.myRegistration?.status === 'pending';
  const { data: bankInfo } = useQuery<BankInfo>({
    queryKey: ['bank-info'],
    queryFn: async () => (await api.get('/settings/bank-info')).data,
    enabled: isPendingPayment,
  });

  const registerMutation = useMutation({
    mutationFn: async ({ eventId, paymentMethod }: { eventId: string; paymentMethod: EventPaymentMethod | 'free' }) => {
      return (
        await api.post(`/events/${eventId}/register`, {
          name: user?.display_name || user?.email || '',
          email: user?.email || '',
          phone: user?.phone || '',
          payment_method: paymentMethod,
        })
      ).data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['client-events'] });
      setRegisterDialogOpen(false);
      toast({
        title: data.isFree ? '¡Registro confirmado!' : 'Registro exitoso',
        description: data.message,
      });
      // For paid events, stay on the detail view to show payment section
      if (!data.isFree && selectedEvent) {
        // Refresh the event detail to get the updated myRegistration
        api.get(`/events/${selectedEvent.id}`).then((res) => setSelectedEvent(res.data));
      } else {
        setSelectedEvent(null);
      }
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || 'Error al registrarse';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (eventId: string) => {
      return (await api.delete(`/events/${eventId}/register`)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-events'] });
      toast({ title: 'Registro cancelado' });
      setSelectedEvent(null);
    },
    onError: () => {
      toast({ title: 'Error', description: 'No se pudo cancelar', variant: 'destructive' });
    },
  });

  // Payment proof upload mutation
  const paymentProofMutation = useMutation({
    mutationFn: async ({ eventId, paymentMethod }: { eventId: string; paymentMethod: EventPaymentMethod }) => {
      if (paymentMethod === 'cash') {
        return (
          await api.put(`/events/${eventId}/register/payment`, {
            payment_method: 'cash',
          })
        ).data;
      }

      let fileData = null;
      if (selectedFile) {
        fileData = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(selectedFile);
        });
      }

      return (
        await api.put(`/events/${eventId}/register/payment`, {
          payment_method: 'transfer',
          transfer_reference: transferReference || '',
          transfer_date: transferDate || null,
          file_data: fileData,
          file_name: selectedFile?.name || null,
        })
      ).data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['client-events'] });
      toast({ title: 'Pago actualizado', description: data.message });
      // Refresh detail
      if (selectedEvent) {
        api.get(`/events/${selectedEvent.id}`).then((res) => setSelectedEvent(res.data));
      }
      // Reset form
      setTransferReference('');
      setTransferDate('');
      setSelectedFile(null);
      setFilePreview(null);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || 'Error al enviar comprobante';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Archivo muy grande', description: 'Máximo 5MB', variant: 'destructive' });
      return;
    }
    setSelectedFile(file);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => setFilePreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copiado al portapapeles' });
  };

  const filtered = filter === 'all' ? events : events.filter((e) => e.type === filter);
  const selectedRegistrationStatus = selectedEvent?.myRegistration?.status;
  const selectedRegistrationMethod = selectedEvent?.myRegistration?.paymentMethod;

  useEffect(() => {
    if (selectedRegistrationStatus !== 'pending') return;

    if (selectedRegistrationMethod === 'cash') {
      setEventPaymentMethod('cash');
      return;
    }

    setEventPaymentMethod('transfer');
  }, [selectedRegistrationMethod, selectedRegistrationStatus]);

  // Detail view
  if (selectedEvent) {
    const ev = selectedEvent;
    const color = typeColors[ev.type] || '#8B5CF6';
    const isFree = ev.price === 0;
    const isFull = ev.registered >= ev.capacity;
    const occupancy = Math.round((ev.registered / ev.capacity) * 100);
    const isRegistered = ev.myRegistration && ev.myRegistration.status !== 'cancelled';
    const pendingMethod: EventPaymentMethod = ev.myRegistration?.paymentMethod === 'cash' ? 'cash' : eventPaymentMethod;

    // Calculate price for user
    let userPrice = ev.price;
    if (ev.earlyBirdPrice && ev.earlyBirdDeadline) {
      const now = new Date();
      const deadline = new Date(ev.earlyBirdDeadline);
      if (now <= deadline) userPrice = ev.earlyBirdPrice;
    }
    if (ev.memberDiscount > 0 && hasActiveMembership) {
      userPrice = Math.round(userPrice * (1 - ev.memberDiscount / 100));
    }

    return (
      <AuthGuard>
        <ClientLayout>
          <div className="space-y-6 max-w-2xl mx-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedEvent(null)}
              className="gap-2 -ml-2 text-primary"
            >
              <ArrowLeft className="h-4 w-4" /> Volver a eventos
            </Button>

            {/* Event Header */}
            <Card className="overflow-hidden border rounded-[1.5rem]" style={{ borderColor: `${color}30` }}>
              <CardContent className="p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ background: `${color}15`, color }}
                  >
                    {typeIcons[ev.type]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h1 className="text-xl font-heading font-bold text-foreground">{ev.title}</h1>
                    <p className="text-sm text-muted-foreground">{typeLabels[ev.type]}</p>
                  </div>
                  {isFree ? (
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-sm">Gratis</Badge>
                  ) : (
                    <div className="text-right">
                      <p className="text-xl font-bold" style={{ color }}>
                        ${userPrice} <span className="text-sm">MXN</span>
                      </p>
                      {userPrice < ev.price && (
                        <p className="text-xs text-muted-foreground line-through">${ev.price} MXN</p>
                      )}
                    </div>
                  )}
                </div>

                <p className="text-sm text-muted-foreground leading-relaxed">{ev.description}</p>

                {/* Info chips */}
                <div className="flex flex-wrap gap-2">
                  {[
                    { icon: <CalendarDays className="h-3.5 w-3.5" />, text: formatDate(ev.date) },
                    { icon: <Clock className="h-3.5 w-3.5" />, text: `${ev.startTime} - ${ev.endTime}` },
                    { icon: <MapPin className="h-3.5 w-3.5" />, text: ev.location },
                    { icon: <User className="h-3.5 w-3.5" />, text: ev.instructor },
                  ].map((item, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground/80 bg-muted px-3 py-1.5 rounded-md"
                    >
                      {item.icon} {item.text}
                    </span>
                  ))}
                </div>

                {/* Capacity bar */}
                <div className="bg-muted/50 rounded-xl p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold flex items-center gap-1.5">
                      <Users className="h-4 w-4 text-muted-foreground" /> Capacidad
                    </span>
                    <span className="text-sm font-bold">
                      {ev.registered}/{ev.capacity} lugares
                    </span>
                  </div>
                  <Progress
                    value={occupancy}
                    className={cn(
                      'h-2',
                      occupancy > 80
                        ? '[&>div]:bg-red-500'
                        : occupancy > 50
                        ? '[&>div]:bg-amber-500'
                        : '[&>div]:bg-emerald-500'
                    )}
                  />
                  {isFull && (
                    <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> Evento lleno — puedes registrarte en lista de espera
                    </p>
                  )}
                </div>

                {/* Requirements */}
                {ev.requirements && (
                  <div>
                    <p className="text-sm font-semibold mb-1.5">Requisitos</p>
                    <p className="text-sm text-muted-foreground">{ev.requirements}</p>
                  </div>
                )}

                {/* Includes */}
                {ev.includes.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold mb-2">Incluye</p>
                    <div className="space-y-1.5">
                      {ev.includes.map((item, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm text-foreground/80">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Member discount info */}
                {ev.memberDiscount > 0 && (
                  <div className={cn(
                    "rounded-lg p-3 flex items-center gap-3",
                    hasActiveMembership
                      ? "bg-emerald-50 border border-emerald-200"
                      : "bg-primary/5 border border-primary/20"
                  )}>
                    <Gift className={cn("h-5 w-5 shrink-0", hasActiveMembership ? "text-emerald-600" : "text-primary")} />
                    <div>
                      <p className={cn("text-sm font-semibold", hasActiveMembership ? "text-emerald-700" : "text-primary")}>
                        {hasActiveMembership
                          ? `¡${ev.memberDiscount}% de descuento aplicado!`
                          : `${ev.memberDiscount}% de descuento para miembros`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {hasActiveMembership
                          ? `Precio original: $${ev.price} MXN`
                          : 'Activa una membresía para obtener este descuento'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Action */}
                {isRegistered ? (
                  <div className="space-y-3">
                    {/* Status badge */}
                    <div
                      className={cn(
                        'rounded-lg p-4 flex items-center gap-3',
                        ev.myRegistration!.status === 'confirmed'
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900'
                          : ev.myRegistration!.status === 'pending'
                          ? 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900'
                          : 'bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900'
                      )}
                    >
                      {ev.myRegistration!.status === 'confirmed' ? (
                        <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                      ) : ev.myRegistration!.status === 'pending' ? (
                        <Clock className="h-6 w-6 text-amber-600 shrink-0" />
                      ) : (
                        <AlertCircle className="h-6 w-6 text-blue-600 shrink-0" />
                      )}
                      <div>
                        <p
                          className={cn(
                            'font-semibold',
                            ev.myRegistration!.status === 'confirmed'
                              ? 'text-emerald-800 dark:text-emerald-300'
                              : ev.myRegistration!.status === 'pending'
                              ? 'text-amber-800 dark:text-amber-300'
                              : 'text-blue-800 dark:text-blue-300'
                          )}
                        >
                          {ev.myRegistration!.status === 'confirmed'
                            ? '¡Estás inscrita!'
                            : ev.myRegistration!.status === 'waitlist'
                            ? 'Estás en la lista de espera'
                            : pendingMethod === 'cash'
                            ? 'Pendiente de pago en studio'
                            : ev.myRegistration!.hasPaymentProof || ev.myRegistration!.paymentReference
                            ? 'Comprobante enviado — en revisión'
                            : 'Pendiente de pago'}
                        </p>
                        <p
                          className={cn(
                            'text-xs',
                            ev.myRegistration!.status === 'confirmed'
                              ? 'text-emerald-700/80 dark:text-emerald-400/80'
                              : ev.myRegistration!.status === 'pending'
                              ? 'text-amber-700/80 dark:text-amber-400/80'
                              : 'text-blue-700/80 dark:text-blue-400/80'
                          )}
                        >
                          {ev.myRegistration!.status === 'confirmed'
                            ? 'Te esperamos en el evento'
                            : ev.myRegistration!.status === 'pending'
                            ? pendingMethod === 'cash'
                              ? 'Paga en recepción del studio para confirmar tu lugar.'
                              : ev.myRegistration!.hasPaymentProof || ev.myRegistration!.paymentReference
                              ? 'Tu pago está siendo verificado. Te notificaremos cuando sea confirmado.'
                              : 'Realiza tu transferencia y sube tu comprobante abajo'
                            : 'Te avisaremos cuando haya un lugar disponible'}
                        </p>
                      </div>
                    </div>

                    {/* Already submitted proof info */}
                    {ev.myRegistration!.status === 'pending' &&
                      (ev.myRegistration!.hasPaymentProof || ev.myRegistration!.paymentReference) && (
                        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                          <p className="text-sm font-semibold flex items-center gap-2">
                            <FileImage className="h-4 w-4" /> Comprobante enviado
                          </p>
                          {ev.myRegistration!.paymentReference && (
                            <p className="text-sm text-muted-foreground">
                              Referencia: <span className="font-mono font-medium">{ev.myRegistration!.paymentReference}</span>
                            </p>
                          )}
                          {ev.myRegistration!.paymentProofFileName && (
                            <p className="text-sm text-muted-foreground">
                              Archivo: {ev.myRegistration!.paymentProofFileName}
                            </p>
                          )}
                        </div>
                      )}

                    <Button
                      variant="outline"
                      className="w-full text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => cancelMutation.mutate(ev.id)}
                      disabled={cancelMutation.isPending}
                    >
                      Cancelar registro
                    </Button>
                  </div>
                ) : (
                  <Button
                    className="w-full gap-2 text-base py-6"
                    style={{ background: color }}
                    onClick={() => setRegisterDialogOpen(true)}
                    disabled={registerMutation.isPending}
                  >
                    <Ticket className="h-5 w-5" />
                    {isFull
                      ? 'Inscribirme en lista de espera'
                      : isFree
                      ? 'Registrarme gratis'
                      : `Inscribirme — $${userPrice} MXN`}
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Bank Info + Payment Upload Section (only for pending paid events) */}
            {isRegistered &&
              ev.myRegistration!.status === 'pending' &&
              !ev.myRegistration!.hasPaymentProof &&
              !ev.myRegistration!.paymentReference && (
                <>
                  <Card className="border rounded-[1.25rem]" style={{ borderColor: `${color}30` }}>
                    <CardContent className="p-6 space-y-4">
                      <div className="space-y-2">
                        <Label>Método de pago</Label>
                        <RadioGroup
                          value={pendingMethod}
                          onValueChange={(value) => setEventPaymentMethod(value as EventPaymentMethod)}
                          className="space-y-2"
                        >
                          <label className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer">
                            <RadioGroupItem value="transfer" />
                            <Landmark className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium">Transferencia bancaria</p>
                              <p className="text-xs text-muted-foreground">Sube tu comprobante para validación</p>
                            </div>
                          </label>
                          <label className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer">
                            <RadioGroupItem value="cash" />
                            <CreditCard className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium">Pagar en studio</p>
                              <p className="text-xs text-muted-foreground">Liquidarás en recepción</p>
                            </div>
                          </label>
                        </RadioGroup>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Bank transfer details */}
                  {pendingMethod === 'transfer' && bankInfo && (
                    <Card className="border rounded-[1.25rem]" style={{ borderColor: `${color}30` }}>
                      <CardContent className="p-6 space-y-4">
                        <div className="flex items-center gap-3 mb-1">
                          <Building2 className="h-5 w-5 text-primary" />
                          <div>
                            <h3 className="font-heading font-bold text-foreground">Datos para transferencia</h3>
                            <p className="text-xs text-muted-foreground">Realiza tu transferencia a la siguiente cuenta</p>
                          </div>
                        </div>

                        <div className="grid gap-3">
                          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                            <div>
                              <p className="text-xs text-muted-foreground">Banco</p>
                              <p className="font-medium">{bankInfo.bank_name}</p>
                            </div>
                          </div>

                          <div className="flex flex-col gap-1 p-3 rounded-lg bg-muted/50 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs text-muted-foreground">Titular</p>
                              <p className="font-medium truncate">{bankInfo.account_holder}</p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="shrink-0 self-end sm:self-auto"
                              onClick={() => copyToClipboard(bankInfo.account_holder)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>

                          {bankInfo.account_number && (
                            <div className="flex flex-col gap-1 p-3 rounded-lg bg-muted/50 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-xs text-muted-foreground">Número de cuenta</p>
                                <p className="font-medium font-mono truncate">{bankInfo.account_number}</p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="shrink-0 self-end sm:self-auto"
                                onClick={() => copyToClipboard(bankInfo.account_number)}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          )}

                          {bankInfo.clabe && (
                            <div className="flex flex-col gap-1 p-3 rounded-lg bg-muted/50 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-xs text-muted-foreground">CLABE interbancaria</p>
                                <p className="font-medium font-mono truncate">{bankInfo.clabe}</p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="shrink-0 self-end sm:self-auto"
                                onClick={() => copyToClipboard(bankInfo.clabe)}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          )}

                          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                            <p className="text-xs text-muted-foreground">Monto a transferir</p>
                            <p className="font-bold text-lg text-primary">
                              ${ev.myRegistration!.amount} MXN
                            </p>
                          </div>
                        </div>

                        {bankInfo.reference_instructions && (
                          <div className="text-sm text-muted-foreground">
                            <p className="font-medium">Instrucciones adicionales:</p>
                            <p>{bankInfo.reference_instructions}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Upload proof form */}
                  {pendingMethod === 'transfer' && (
                  <Card className="border rounded-[1.25rem]" style={{ borderColor: `${color}30` }}>
                    <CardContent className="p-6 space-y-4">
                      <div className="flex items-center gap-3 mb-1">
                        <Upload className="h-5 w-5 text-primary" />
                        <div>
                          <h3 className="font-heading font-bold text-foreground">Confirmar transferencia</h3>
                          <p className="text-xs text-muted-foreground">
                            Una vez realizada la transferencia, sube tu comprobante
                          </p>
                        </div>
                      </div>

                      {/* File upload */}
                      <div className="space-y-2">
                        <Label>Comprobante de pago (imagen o PDF)</Label>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/jpg,image/webp,application/pdf"
                          onChange={handleFileSelect}
                          className="hidden"
                        />

                        {!selectedFile ? (
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full border-2 border-dashed border-muted-foreground/30 rounded-lg p-6 hover:border-primary/50 hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                              <Upload className="h-8 w-8" />
                              <span className="font-medium text-sm">Haz clic para subir tu comprobante</span>
                              <span className="text-xs">JPG, PNG, WebP o PDF (máx. 5MB)</span>
                            </div>
                          </button>
                        ) : (
                          <div className="relative border rounded-lg p-4">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute top-2 right-2 h-6 w-6"
                              onClick={removeFile}
                            >
                              <X className="h-4 w-4" />
                            </Button>

                            {filePreview ? (
                              <img
                                src={filePreview}
                                alt="Comprobante"
                                className="max-h-40 mx-auto rounded-lg object-contain"
                              />
                            ) : (
                              <div className="flex items-center gap-3 text-sm">
                                <FileImage className="h-8 w-8 text-muted-foreground" />
                                <div>
                                  <p className="font-medium">{selectedFile.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {(selectedFile.size / 1024).toFixed(0)} KB
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Transfer reference */}
                      <div className="space-y-2">
                        <Label htmlFor="transfer-ref">Referencia de transferencia</Label>
                        <Input
                          id="transfer-ref"
                          placeholder="Ej. 1234567890"
                          value={transferReference}
                          onChange={(e) => setTransferReference(e.target.value)}
                        />
                      </div>

                      {/* Transfer date */}
                      <div className="space-y-2">
                        <Label htmlFor="transfer-date">Fecha de transferencia</Label>
                        <Input
                          id="transfer-date"
                          type="date"
                          value={transferDate}
                          onChange={(e) => setTransferDate(e.target.value)}
                        />
                      </div>

                      <Button
                        className="w-full gap-2"
                        style={{ background: color }}
                        onClick={() => paymentProofMutation.mutate({ eventId: ev.id, paymentMethod: 'transfer' })}
                        disabled={paymentProofMutation.isPending || (!selectedFile && !transferReference)}
                      >
                        {paymentProofMutation.isPending ? (
                          'Enviando...'
                        ) : (
                          <>
                            <Upload className="h-4 w-4" /> Enviar comprobante
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                  )}

                  {/* Cash payment info */}
                  {pendingMethod === 'cash' && (
                    <Card className="border rounded-[1.25rem]" style={{ borderColor: `${color}30` }}>
                      <CardContent className="p-6 space-y-4">
                        <div className="flex items-center gap-3 mb-1">
                          <CreditCard className="h-5 w-5 text-primary" />
                          <div>
                            <h3 className="font-heading font-bold text-foreground">Pago en studio</h3>
                            <p className="text-xs text-muted-foreground">
                              Presenta este registro en recepción y realiza el pago para confirmar tu lugar.
                            </p>
                          </div>
                        </div>

                        <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                          <p className="text-xs text-muted-foreground">Monto a pagar en recepción</p>
                          <p className="font-bold text-lg text-primary">${ev.myRegistration!.amount} MXN</p>
                        </div>

                        <Button
                          className="w-full"
                          style={{ background: color }}
                          onClick={() => paymentProofMutation.mutate({ eventId: ev.id, paymentMethod: 'cash' })}
                          disabled={paymentProofMutation.isPending}
                        >
                          {paymentProofMutation.isPending ? 'Actualizando...' : 'Confirmar que pagaré en studio'}
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
          </div>

          {/* Registration confirmation dialog */}
          <Dialog open={registerDialogOpen} onOpenChange={setRegisterDialogOpen}>
            <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Confirmar inscripción</DialogTitle>
                <DialogDescription>
                  {isFree
                    ? `¿Quieres registrarte en "${ev.title}"?`
                    : `Tu inscripción a "${ev.title}" quedará pendiente hasta confirmar el pago.`}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="bg-muted/50 rounded-lg p-3 flex justify-between">
                  <span className="text-sm text-muted-foreground">Evento</span>
                  <span className="text-sm font-semibold">{ev.title}</span>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 flex justify-between">
                  <span className="text-sm text-muted-foreground">Fecha</span>
                  <span className="text-sm font-semibold">{formatShortDate(ev.date)}</span>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 flex justify-between">
                  <span className="text-sm text-muted-foreground">Precio</span>
                  <span className="text-sm font-bold" style={{ color }}>
                    {isFree ? 'Gratis' : `$${userPrice} MXN`}
                  </span>
                </div>

                {!isFree && (
                  <div className="space-y-2">
                    <Label>Método de pago</Label>
                    <RadioGroup
                      value={eventPaymentMethod}
                      onValueChange={(value) => setEventPaymentMethod(value as EventPaymentMethod)}
                      className="space-y-2"
                    >
                      <label className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer">
                        <RadioGroupItem value="transfer" />
                        <Landmark className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">Transferencia bancaria</p>
                          <p className="text-xs text-muted-foreground">Subes comprobante al terminar</p>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer">
                        <RadioGroupItem value="cash" />
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">Pagar en studio</p>
                          <p className="text-xs text-muted-foreground">Pago físico en recepción</p>
                        </div>
                      </label>
                    </RadioGroup>
                  </div>
                )}
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setRegisterDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() =>
                    registerMutation.mutate({
                      eventId: ev.id,
                      paymentMethod: isFree ? 'free' : eventPaymentMethod,
                    })
                  }
                  disabled={registerMutation.isPending}
                  style={{ background: color }}
                >
                  {registerMutation.isPending ? 'Registrando...' : 'Confirmar'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </ClientLayout>
      </AuthGuard>
    );
  }

  // List view
  return (
    <AuthGuard>
      <ClientLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground">Eventos</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Descubre los eventos especiales de Casa Shé
            </p>
          </div>

          {/* Type filters */}
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={filter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('all')}
              className="rounded-full"
            >
              Todos
            </Button>
            {Object.entries(typeLabels).map(([key, label]) => (
              <Button
                key={key}
                variant={filter === key ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter(key)}
                className="rounded-full gap-1.5"
              >
                {typeIcons[key] &&
                  <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{typeIcons[key]}</span>}
                {label}
              </Button>
            ))}
          </div>

          {/* Events grid */}
          {isLoading ? (
            <div className="grid sm:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} className="rounded-[1.25rem]">
                  <CardContent className="p-5 space-y-3">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-20 w-full rounded-lg" />
                    <Skeleton className="h-10 w-full rounded-lg" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <CalendarDays className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p className="font-medium">No hay eventos próximos</p>
              <p className="text-sm mt-1">
                {filter !== 'all' ? 'Prueba con otro tipo de evento' : 'Pronto habrá nuevos eventos'}
              </p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {filtered.map((ev) => {
                const color = typeColors[ev.type] || '#8B5CF6';
                const isFree = ev.price === 0;
                const isFull = ev.registered >= ev.capacity;
                const occupancy = Math.round((ev.registered / ev.capacity) * 100);
                const isRegistered = ev.myRegistration && ev.myRegistration.status !== 'cancelled';

                return (
                  <Card
                    key={ev.id}
                    className="cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border overflow-hidden rounded-[1.25rem] app-soft-shadow"
                    style={{ borderColor: `${color}20` }}
                    onClick={() => {
                      // Fetch detail for myRegistration
                      api.get(`/events/${ev.id}`).then((res) => setSelectedEvent(res.data));
                    }}
                  >
                    <CardContent className="p-5 space-y-4">
                      {/* Top */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: `${color}15`, color }}
                          >
                            {typeIcons[ev.type]}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-heading font-bold text-foreground truncate text-sm">
                              {ev.title}
                            </h3>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <User className="h-3 w-3" /> {ev.instructor}
                            </p>
                          </div>
                        </div>
                        {isFree ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 shrink-0">
                            Gratis
                          </Badge>
                        ) : (
                          <span className="text-lg font-bold shrink-0" style={{ color }}>
                            ${ev.price}
                          </span>
                        )}
                      </div>

                      {/* Date/time/location */}
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" /> {formatShortDate(ev.date)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {ev.startTime}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {ev.location}
                        </span>
                      </div>

                      {/* Capacity */}
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">
                            {ev.registered}/{ev.capacity} lugares
                          </span>
                          {isFull && (
                            <span className="text-amber-600 font-medium">Lleno</span>
                          )}
                        </div>
                        <Progress
                          value={occupancy}
                          className={cn(
                            'h-1.5',
                            occupancy > 80
                              ? '[&>div]:bg-red-500'
                              : occupancy > 50
                              ? '[&>div]:bg-amber-500'
                              : '[&>div]:bg-emerald-500'
                          )}
                        />
                      </div>

                      {/* Status */}
                      {isRegistered && (
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {ev.myRegistration!.status === 'confirmed'
                            ? 'Inscrita'
                            : ev.myRegistration!.status === 'waitlist'
                            ? 'En lista de espera'
                            : 'Pendiente'}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </ClientLayout>
    </AuthGuard>
  );
}
