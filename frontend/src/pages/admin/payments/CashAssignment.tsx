import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, isToday, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import api, { getErrorMessage } from '@/lib/api';
import type { User, Plan, Membership, ClassSchedule } from '@/types/auth';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/components/ui/use-toast';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';
import {
  Search,
  Loader2,
  CreditCard,
  Banknote,
  ArrowRight,
  CheckCircle2,
  User as UserIcon,
  Calendar as CalendarIcon,
  Package,
  Receipt,
  Plus,
  Clock,
  DollarSign,
  Sparkles,
  ArrowRightLeft,
  X,
  Phone,
  Mail,
  ChevronRight,
  Wallet,
  Users,
  PartyPopper
} from 'lucide-react';

// ============================================================================
// SCHEMAS
// ============================================================================

const cashAssignmentSchema = z.object({
  userId: z.string().uuid('Selecciona un usuario'),
  planId: z.string().uuid('Selecciona un plan'),
  paymentMethod: z.enum(['cash', 'transfer', 'card']),
  amountPaid: z.coerce.number().positive('El monto debe ser positivo'),
  startDate: z.date(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

type CashAssignmentForm = z.infer<typeof cashAssignmentSchema>;

const guestClassSchema = z.object({
  guestName: z.string().min(2, 'Nombre requerido'),
  guestEmail: z.string().email('Email inválido').optional().or(z.literal('')),
  guestPhone: z.string().min(10, 'Teléfono inválido'),
  classId: z.string().uuid('Selecciona una clase'),
  paymentMethod: z.enum(['cash', 'card']),
  amountPaid: z.coerce.number().positive('El monto debe ser positivo'),
  notes: z.string().optional(),
});

type GuestClassForm = z.infer<typeof guestClassSchema>;

// ============================================================================
// TYPES
// ============================================================================

interface AssignmentResponse {
  membership: Membership;
  transaction: {
    id: string;
    amount: number;
    status: string;
    reference?: string;
  };
  walletPass?: {
    id: string;
    downloadUrl: string;
  };
}

interface GuestBookingResponse {
  booking: {
    id: string;
    confirmationCode: string;
    status: string;
  };
  guest: {
    name: string;
    phone: string;
  };
  class: ClassSchedule;
}

interface DashboardStats {
  paymentsToday: number;
  amountToday: number;
  membershipsActivated: number;
  guestsToday: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const paymentMethodConfig = {
  cash: {
    label: 'Efectivo',
    icon: Banknote,
    color: 'text-success',
    bg: 'bg-success/10',
    description: 'Pago recibido en efectivo',
  },
  transfer: {
    label: 'Transferencia',
    icon: ArrowRightLeft,
    color: 'text-info',
    bg: 'bg-info/10',
    description: 'Pago por transferencia bancaria',
  },
  card: {
    label: 'Tarjeta',
    icon: CreditCard,
    color: 'text-purple-600',
    bg: 'bg-purple-100',
    description: 'Pago con tarjeta (terminal física)',
  },
};

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

// ============================================================================
// COMPONENT
// ============================================================================

/** Embeddable content version (no AuthGuard/AdminLayout wrapper) */
export function CashAssignmentContent() {
  return <CashAssignmentInner />;
}

export default function CashAssignmentPage() {
  return (
    <AuthGuard requiredRoles={['admin', 'instructor']}>
      <AdminLayout>
        <CashAssignmentInner />
      </AdminLayout>
    </AuthGuard>
  );
}

function CashAssignmentInner() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State
  const [activeTab, setActiveTab] = useState<'member' | 'guest'>('member');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [selectedClass, setSelectedClass] = useState<ClassSchedule | null>(null);
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  const [lastAssignment, setLastAssignment] = useState<AssignmentResponse | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const debouncedSearch = useDebounce(searchQuery, 300);

  // ============================================================================
  // FORMS
  // ============================================================================

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    control,
    formState: { errors }
  } = useForm<CashAssignmentForm>({
    resolver: zodResolver(cashAssignmentSchema),
    defaultValues: {
      paymentMethod: 'cash',
      startDate: new Date(),
    },
    mode: 'onChange',
  });

  const guestForm = useForm<GuestClassForm>({
    resolver: zodResolver(guestClassSchema),
    defaultValues: {
      paymentMethod: 'cash',
      amountPaid: 450,
    },
    mode: 'onChange',
  });

  const paymentMethod = watch('paymentMethod');
  const startDate = watch('startDate');
  const amountPaid = watch('amountPaid');

  // ============================================================================
  // QUERIES
  // ============================================================================

  // Search users
  const { data: searchResults, isLoading: searchLoading } = useQuery<{ users: User[] }>({
    queryKey: ['users-search', debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch || debouncedSearch.length < 2) return { users: [] };
      const { data } = await api.get(`/users?search=${debouncedSearch}&role=client&limit=10`);
      return data;
    },
    enabled: debouncedSearch.length >= 2,
  });

  // Fetch plans
  const { data: plans, isLoading: plansLoading } = useQuery<Plan[]>({
    queryKey: ['plans'],
    queryFn: async () => {
      const { data } = await api.get('/plans?active=true');
      return data;
    },
  });

  // Fetch today's and tomorrow's classes for guest booking
  const { data: upcomingClasses, isLoading: classesLoading } = useQuery<ClassSchedule[]>({
    queryKey: ['upcoming-classes-guest'],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const tomorrow = format(new Date(Date.now() + 86400000), 'yyyy-MM-dd');
      const { data } = await api.get(`/classes?start=${today}&end=${tomorrow}&hasCapacity=true`);
      return data;
    },
  });

  // Fetch recent cash payments
  const { data: recentPayments, isLoading: recentLoading } = useQuery<Membership[]>({
    queryKey: ['recent-cash-payments'],
    queryFn: async () => {
      const { data } = await api.get('/memberships?payment_method=cash,transfer&limit=10&sort=-created_at');
      return data;
    },
  });

  // Fetch dashboard stats
  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ['cash-dashboard-stats'],
    queryFn: async () => {
      const { data } = await api.get('/stats/cash-payments-today');
      return data;
    },
    placeholderData: {
      paymentsToday: 0,
      amountToday: 0,
      membershipsActivated: 0,
      guestsToday: 0,
    },
  });

  // ============================================================================
  // MUTATIONS
  // ============================================================================

  // Member assignment mutation
  const assignMutation = useMutation({
    mutationFn: async (data: CashAssignmentForm) => {
      const response = await api.post<AssignmentResponse>('/memberships/assign-cash', {
        ...data,
        startDate: format(data.startDate, 'yyyy-MM-dd'),
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['memberships'] });
      queryClient.invalidateQueries({ queryKey: ['recent-cash-payments'] });
      queryClient.invalidateQueries({ queryKey: ['cash-dashboard-stats'] });
      setLastAssignment(data);
      setIsSuccessOpen(true);
      reset();
      setSelectedUser(null);
      setSelectedPlan(null);
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Error al asignar membresía',
        description: getErrorMessage(error),
      });
    },
  });

  // Guest class mutation
  const guestMutation = useMutation({
    mutationFn: async (data: GuestClassForm) => {
      const response = await api.post<GuestBookingResponse>('/bookings/guest-cash', data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['upcoming-classes-guest'] });
      queryClient.invalidateQueries({ queryKey: ['cash-dashboard-stats'] });
      guestForm.reset();
      setSelectedClass(null);
      toast({
        title: '¡Clase registrada!',
        description: `${data.guest.name} ha sido registrado exitosamente`,
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Error al registrar invitado',
        description: getErrorMessage(error),
      });
    },
  });

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleSelectUser = (user: User) => {
    setSelectedUser(user);
    setValue('userId', user.id, { shouldValidate: true });
    setSearchQuery('');
  };

  const handleSelectPlan = (planId: string) => {
    const plan = plans?.find(p => p.id === planId);
    if (plan) {
      setSelectedPlan(plan);
      setValue('planId', plan.id, { shouldValidate: true });
      setValue('amountPaid', plan.price, { shouldValidate: true });
    }
  };

  const handleSelectClass = (classId: string) => {
    const cls = upcomingClasses?.find(c => c.id === classId);
    if (cls) {
      setSelectedClass(cls);
      guestForm.setValue('classId', cls.id, { shouldValidate: true });
    }
  };

  const clearSelectedUser = () => {
    setSelectedUser(null);
    setValue('userId', '', { shouldValidate: true });
  };

  const onSubmit = (data: CashAssignmentForm) => {
    assignMutation.mutate(data);
  };

  const onSubmitGuest = (data: GuestClassForm) => {
    guestMutation.mutate(data);
  };

  const getInitials = (name: string) => {
    return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'CL';
  };

  // Safely format a YYYY-MM-DD string; returns fallback if invalid.
  const safeFormatDate = (value: string | null | undefined, fmt: string) => {
    if (!value) return '';
    const d = parseISO(value);
    if (isNaN(d.getTime())) return '';
    return format(d, fmt, { locale: es });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount);
  };

  // Group classes by date
  const groupedClasses = useMemo(() => {
    if (!upcomingClasses) return {};
    return upcomingClasses.reduce((acc, cls) => {
      const date = safeFormatDate(cls.date, 'yyyy-MM-dd');
      if (!date) return acc; // skip classes with an invalid/missing date
      if (!acc[date]) acc[date] = [];
      acc[date].push(cls);
      return acc;
    }, {} as Record<string, ClassSchedule[]>);
  }, [upcomingClasses]);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <>
        <div className="space-y-6 p-6">
          {/* Header */}
          <motion.div {...fadeInUp}>
            <h1 className="text-3xl font-heading font-bold flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-success to-secondary flex items-center justify-center shadow-lg">
                <Banknote className="h-5 w-5 text-white" />
              </div>
              Registro de Pagos
            </h1>
            <p className="text-muted-foreground mt-1">
              Asigna membresías o registra clases individuales con pago en efectivo, transferencia o tarjeta
            </p>
          </motion.div>

          {/* Quick Stats */}
          <motion.div
            {...fadeInUp}
            transition={{ delay: 0.1 }}
            className="grid gap-4 md:grid-cols-4"
          >
            <Card className="border-none shadow-md bg-gradient-to-br from-success/10 to-white">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-success/100/10 flex items-center justify-center">
                    <DollarSign className="h-6 w-6 text-success" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Pagos hoy</p>
                    <p className="text-xl sm:text-2xl font-bold text-success tabular-nums truncate">
                      {formatCurrency(stats?.amountToday || 0)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-md bg-gradient-to-br from-info/10 to-white">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-info/10 flex items-center justify-center">
                    <Receipt className="h-6 w-6 text-info" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Transacciones</p>
                    <p className="text-xl sm:text-2xl font-bold text-info tabular-nums truncate">{stats?.paymentsToday || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-md bg-gradient-to-br from-purple-50 to-white">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
                    <Package className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Membresías</p>
                    <p className="text-xl sm:text-2xl font-bold text-purple-700 tabular-nums truncate">{stats?.membershipsActivated || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-md bg-gradient-to-br from-warning/10 to-white">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-warning/10 flex items-center justify-center">
                    <Users className="h-6 w-6 text-warning" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Invitados hoy</p>
                    <p className="text-xl sm:text-2xl font-bold text-warning tabular-nums truncate">{stats?.guestsToday || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Main Content */}
          <div className="grid gap-6">
            <motion.div
              {...fadeInUp}
              transition={{ delay: 0.2 }}
            >
              <Card className="shadow-lg">
                <CardHeader className="pb-4">
                  <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'member' | 'guest')}>
                    <TabsList className="grid w-full grid-cols-1">
                      <TabsTrigger value="member" className="gap-2">
                        <Package className="h-4 w-4" />
                        Asignar Membresía
                      </TabsTrigger>
                      {/* "Clase Invitado" deshabilitado: cobraba contra un endpoint inexistente
                          (/bookings/guest-cash → 404), dejando el cobro sin registro. */}
                    </TabsList>
                  </Tabs>
                </CardHeader>

                <CardContent>
                  <AnimatePresence mode="wait">
                    {activeTab === 'member' ? (
                      <motion.form
                        key="member-form"
                        {...fadeInUp}
                        onSubmit={handleSubmit(onSubmit)}
                        className="space-y-6"
                      >
                        {/* User Search */}
                        <div className="space-y-3">
                          <Label className="flex items-center gap-2 text-base font-semibold">
                            <UserIcon className="h-4 w-4 text-primary" />
                            Usuario
                          </Label>

                          {selectedUser ? (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20"
                            >
                              <Avatar className="h-12 w-12 border-2 border-primary/30">
                                <AvatarImage src={selectedUser.photo_url || selectedUser.avatar_url || undefined} />
                                <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                                  {getInitials(selectedUser.display_name || selectedUser.full_name || '')}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold truncate">{selectedUser.display_name || selectedUser.full_name}</p>
                                <p className="text-sm text-muted-foreground truncate">{selectedUser.email}</p>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={clearSelectedUser}
                                className="shrink-0"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </motion.div>
                          ) : (
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                placeholder="Buscar por nombre, email o teléfono..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 h-12"
                              />

                              {/* Search Results Dropdown */}
                              <AnimatePresence>
                                {(searchQuery.length >= 2) && (
                                  <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="absolute z-50 w-full mt-2 rounded-xl border bg-popover shadow-xl"
                                  >
                                    <ScrollArea className="max-h-[280px]">
                                      {searchLoading ? (
                                        <div className="p-4 space-y-3">
                                          {[1, 2, 3].map((i) => (
                                            <div key={i} className="flex items-center gap-3">
                                              <Skeleton className="h-10 w-10 rounded-full" />
                                              <div className="space-y-1 flex-1">
                                                <Skeleton className="h-4 w-32" />
                                                <Skeleton className="h-3 w-48" />
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      ) : searchResults?.users?.length ? (
                                        <div className="py-2">
                                          {searchResults.users.map((user) => (
                                            <button
                                              key={user.id}
                                              type="button"
                                              onClick={() => handleSelectUser(user)}
                                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
                                            >
                                              <Avatar className="h-10 w-10">
                                                <AvatarImage src={user.photo_url || user.avatar_url || undefined} />
                                                <AvatarFallback className="bg-primary/10 text-primary text-sm">
                                                  {getInitials(user.display_name || user.full_name || '')}
                                                </AvatarFallback>
                                              </Avatar>
                                              <div className="text-left flex-1 min-w-0">
                                                <p className="font-medium truncate">{user.display_name || user.full_name}</p>
                                                <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                                              </div>
                                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                            </button>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="p-6 text-center text-muted-foreground">
                                          <UserIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
                                          <p className="text-sm">No se encontraron usuarios</p>
                                          <p className="text-xs mt-1">Intenta con otro término de búsqueda</p>
                                        </div>
                                      )}
                                    </ScrollArea>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )}
                          {errors.userId && (
                            <p className="text-sm text-destructive">{errors.userId.message}</p>
                          )}
                        </div>

                        {/* Plan Selection */}
                        <div className="space-y-3">
                          <Label className="flex items-center gap-2 text-base font-semibold">
                            <Package className="h-4 w-4 text-primary" />
                            Plan / Paquete
                          </Label>

                          <Controller
                            name="planId"
                            control={control}
                            render={({ field }) => (
                              <Select onValueChange={handleSelectPlan} value={field.value}>
                                <SelectTrigger className="h-12">
                                  <SelectValue placeholder="Selecciona un plan" />
                                </SelectTrigger>
                                <SelectContent>
                                  {plansLoading ? (
                                    <div className="p-4">
                                      <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                                    </div>
                                  ) : (
                                    plans?.map((plan) => (
                                      <SelectItem key={plan.id} value={plan.id}>
                                        <div className="flex items-center justify-between gap-4">
                                          <span>{plan.name}</span>
                                          <Badge variant="secondary">
                                            {formatCurrency(plan.price)}
                                          </Badge>
                                        </div>
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                            )}
                          />

                          {selectedPlan && (
                            <div
                              className="rounded-lg bg-muted/50 p-3 text-sm"
                            >
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Sparkles className="h-4 w-4" />
                                <span>
                                  {selectedPlan.class_limit === null || (selectedPlan.classes_included && selectedPlan.classes_included === -1)
                                    ? 'Clases ilimitadas'
                                    : `${selectedPlan.class_limit || selectedPlan.classes_included} clases incluidas`}
                                </span>
                                <span className="mx-1">•</span>
                                <span>{selectedPlan.duration_days} días de vigencia</span>
                              </div>
                            </div>
                          )}

                          {errors.planId && (
                            <p className="text-sm text-destructive">{errors.planId.message}</p>
                          )}
                        </div>

                        {/* Payment Method */}
                        <div className="space-y-3">
                          <Label className="flex items-center gap-2 text-base font-semibold">
                            <Wallet className="h-4 w-4 text-primary" />
                            Método de Pago
                          </Label>

                          <Controller
                            name="paymentMethod"
                            control={control}
                            render={({ field }) => (
                              <div className="grid grid-cols-3 gap-3">
                                {Object.entries(paymentMethodConfig).map(([key, config]) => {
                                  const Icon = config.icon;
                                  const isSelected = field.value === key;
                                  return (
                                    <button
                                      key={key}
                                      type="button"
                                      onClick={() => field.onChange(key)}
                                      className={cn(
                                        'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all',
                                        isSelected
                                          ? 'border-primary bg-primary/5 shadow-md'
                                          : 'border-muted hover:border-primary/30 hover:bg-muted/50'
                                      )}
                                    >
                                      <div className={cn(
                                        'h-10 w-10 rounded-full flex items-center justify-center',
                                        isSelected ? 'bg-primary/10' : config.bg
                                      )}>
                                        <Icon className={cn('h-5 w-5', isSelected ? 'text-primary' : config.color)} />
                                      </div>
                                      <span className={cn(
                                        'text-sm font-medium',
                                        isSelected ? 'text-primary' : 'text-muted-foreground'
                                      )}>
                                        {config.label}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          />
                        </div>

                        {/* Amount & Date Row */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-3">
                            <Label className="flex items-center gap-2 text-base font-semibold">
                              <DollarSign className="h-4 w-4 text-primary" />
                              Monto Pagado
                            </Label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
                              <Input
                                type="number"
                                step="0.01"
                                {...register('amountPaid')}
                                className="pl-8 h-12 text-lg font-semibold"
                              />
                            </div>
                            {errors.amountPaid && (
                              <p className="text-sm text-destructive">{errors.amountPaid.message}</p>
                            )}
                          </div>

                          <div className="space-y-3">
                            <Label className="flex items-center gap-2 text-base font-semibold">
                              <CalendarIcon className="h-4 w-4 text-primary" />
                              Fecha de Inicio
                            </Label>
                            <Controller
                              name="startDate"
                              control={control}
                              render={({ field }) => (
                                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="outline"
                                      className="w-full h-12 justify-start font-normal"
                                    >
                                      <CalendarIcon className="mr-2 h-4 w-4" />
                                      {field.value && !isNaN(new Date(field.value).getTime())
                                        ? format(field.value, "d 'de' MMMM, yyyy", { locale: es })
                                        : 'Selecciona una fecha'}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                      mode="single"
                                      selected={field.value}
                                      onSelect={(date) => {
                                        if (date) {
                                          field.onChange(date);
                                          setCalendarOpen(false);
                                        }
                                      }}
                                      locale={es}
                                      initialFocus
                                    />
                                  </PopoverContent>
                                </Popover>
                              )}
                            />
                          </div>
                        </div>

                        {/* Reference & Notes */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm text-muted-foreground">Referencia (opcional)</Label>
                            <Input
                              {...register('reference')}
                              placeholder="Ej: Transferencia #1234"
                              className="h-10"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm text-muted-foreground">Notas (opcional)</Label>
                            <Input
                              {...register('notes')}
                              placeholder="Notas adicionales..."
                              className="h-10"
                            />
                          </div>
                        </div>

                        {/* Summary Card */}
                        {selectedUser && selectedPlan && (
                          <div
                            className="rounded-xl bg-gradient-to-br from-primary/5 to-primary/10 p-4 border border-primary/20"
                          >
                            <h4 className="font-semibold text-sm text-primary mb-3 flex items-center gap-2">
                              <Receipt className="h-4 w-4" />
                              Resumen de la Asignación
                            </h4>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Usuario:</span>
                                <span className="font-medium">{selectedUser.display_name || selectedUser.full_name}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Plan:</span>
                                <span className="font-medium">{selectedPlan.name}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Método:</span>
                                <span className="font-medium">{paymentMethodConfig[paymentMethod].label}</span>
                              </div>
                              <Separator className="my-2" />
                              <div className="flex justify-between text-base">
                                <span className="font-semibold">Total:</span>
                                <span className="font-bold text-primary">{formatCurrency(amountPaid || 0)}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Submit Button */}
                        <Button
                          type="submit"
                          size="lg"
                          className="w-full h-14 text-base font-semibold gap-2"
                          disabled={assignMutation.isPending || !selectedUser || !selectedPlan}
                        >
                          {assignMutation.isPending ? (
                            <>
                              <Loader2 className="h-5 w-5 animate-spin" />
                              Procesando...
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="h-5 w-5" />
                              Activar Membresía
                            </>
                          )}
                        </Button>
                      </motion.form>
                    ) : (
                      <motion.form
                        key="guest-form"
                        {...fadeInUp}
                        onSubmit={guestForm.handleSubmit(onSubmitGuest)}
                        className="space-y-6"
                      >
                        {/* Guest Info */}
                        <div className="space-y-4">
                          <Label className="flex items-center gap-2 text-base font-semibold">
                            <UserIcon className="h-4 w-4 text-primary" />
                            Datos del Invitado
                          </Label>

                          <div className="grid gap-4">
                            <Input
                              {...guestForm.register('guestName')}
                              placeholder="Nombre completo"
                              className="h-12"
                            />
                            {guestForm.formState.errors.guestName && (
                              <p className="text-sm text-destructive -mt-2">
                                {guestForm.formState.errors.guestName.message}
                              </p>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                              <div className="relative">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                  {...guestForm.register('guestPhone')}
                                  placeholder="Teléfono"
                                  className="pl-10 h-12"
                                />
                              </div>
                              <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                  {...guestForm.register('guestEmail')}
                                  placeholder="Email (opcional)"
                                  className="pl-10 h-12"
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Class Selection */}
                        <div className="space-y-3">
                          <Label className="flex items-center gap-2 text-base font-semibold">
                            <CalendarIcon className="h-4 w-4 text-primary" />
                            Clase a Reservar
                          </Label>

                          <Controller
                            name="classId"
                            control={guestForm.control}
                            render={({ field }) => (
                              <Select onValueChange={handleSelectClass} value={field.value}>
                                <SelectTrigger className="h-12">
                                  <SelectValue placeholder="Selecciona una clase" />
                                </SelectTrigger>
                                <SelectContent>
                                  {classesLoading ? (
                                    <div className="p-4">
                                      <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                                    </div>
                                  ) : Object.entries(groupedClasses).length === 0 ? (
                                    <div className="p-4 text-center text-muted-foreground text-sm">
                                      No hay clases disponibles
                                    </div>
                                  ) : (
                                    Object.entries(groupedClasses).map(([date, classes]) => (
                                      <div key={date}>
                                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50">
                                          {(() => {
                                            const d = parseISO(date);
                                            if (isNaN(d.getTime())) return date;
                                            return isToday(d)
                                              ? 'Hoy'
                                              : format(d, "EEEE d 'de' MMMM", { locale: es });
                                          })()}
                                        </div>
                                        {classes.map((cls) => (
                                          <SelectItem key={cls.id} value={cls.id}>
                                            <div className="flex items-center gap-2">
                                              <Clock className="h-3 w-3 text-muted-foreground" />
                                              <span>{(cls.start_time || '').slice(0, 5)}</span>
                                              <span className="font-medium">{cls.name}</span>
                                              <Badge variant="outline" className="ml-auto text-xs">
                                                {cls.current_capacity}/{cls.max_capacity}
                                              </Badge>
                                            </div>
                                          </SelectItem>
                                        ))}
                                      </div>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                            )}
                          />

                          {selectedClass && (
                            <div
                              className="rounded-lg bg-muted/50 p-3 text-sm"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{selectedClass.name}</span>
                                {selectedClass.instructor && (
                                  <>
                                    <span className="text-muted-foreground">con</span>
                                    <span>{selectedClass.instructor.name}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Payment */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-3">
                            <Label className="text-sm font-medium">Método de Pago</Label>
                            <Controller
                              name="paymentMethod"
                              control={guestForm.control}
                              render={({ field }) => (
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <SelectTrigger className="h-12">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="cash">
                                      <div className="flex items-center gap-2">
                                        <Banknote className="h-4 w-4" />
                                        Efectivo
                                      </div>
                                    </SelectItem>
                                    <SelectItem value="card">
                                      <div className="flex items-center gap-2">
                                        <CreditCard className="h-4 w-4" />
                                        Tarjeta
                                      </div>
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          </div>

                          <div className="space-y-3">
                            <Label className="text-sm font-medium">Monto</Label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                              <Input
                                type="number"
                                {...guestForm.register('amountPaid')}
                                className="pl-8 h-12 text-lg font-semibold"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Notes */}
                        <div className="space-y-2">
                          <Label className="text-sm text-muted-foreground">Notas (opcional)</Label>
                          <Textarea
                            {...guestForm.register('notes')}
                            placeholder="Observaciones sobre el invitado..."
                            rows={2}
                          />
                        </div>

                        {/* Submit */}
                        <Button
                          type="submit"
                          size="lg"
                          className="w-full h-14 text-base font-semibold gap-2"
                          disabled={guestMutation.isPending || !guestForm.formState.isValid}
                        >
                          {guestMutation.isPending ? (
                            <>
                              <Loader2 className="h-5 w-5 animate-spin" />
                              Registrando...
                            </>
                          ) : (
                            <>
                              <Plus className="h-5 w-5" />
                              Registrar Invitado
                            </>
                          )}
                        </Button>
                      </motion.form>
                    )}
                  </AnimatePresence>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Success Modal */}
          <Dialog open={isSuccessOpen} onOpenChange={setIsSuccessOpen}>
            <DialogContent>
              <DialogHeader>
                <div className="flex items-center justify-center mb-4">
                  <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center">
                    <PartyPopper className="h-8 w-8 text-success" />
                  </div>
                </div>
                <DialogTitle className="text-center text-2xl">¡Membresía Activada!</DialogTitle>
                <DialogDescription className="text-center">
                  La membresía ha sido asignada exitosamente
                </DialogDescription>
              </DialogHeader>
              {lastAssignment && (
                <div className="space-y-3 py-4">
                  <div className="rounded-lg bg-muted p-3 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Usuario:</span>
                      <span className="font-medium">{lastAssignment.membership.user_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Plan:</span>
                      <span className="font-medium">{lastAssignment.membership.plan_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Monto:</span>
                      <span className="font-medium">{formatCurrency(lastAssignment.transaction.amount)}</span>
                    </div>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button onClick={() => setIsSuccessOpen(false)} className="w-full">
                  Entendido
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
    </>
  );
}
