import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';
import {
  getClassesLabel,
  getPackagePresentation,
  getPackageType,
  packageOrder,
  packagePresentations,
} from '@/lib/planPresentation';
import type { OrderPaymentMethod, CreateOrderRequest, Order } from '@/types/order';
import {
  CreditCard,
  Building2,
  Banknote,
  ChevronRight,
  ArrowRight,
  CheckCircle2,
  ArrowLeft,
  Tag,
  X,
  Loader2,
  Copy,
  Check,
  Star,
} from 'lucide-react';

interface Plan {
  id: string;
  name: string;
  price: number;
  duration_days: number;
  class_limit: number | null;
  description: string | null;
  is_active: boolean;
  is_internal?: boolean;
  is_unlimited: boolean;
  category: string;
  is_exclusive: boolean;
  sort_order?: number;
  package_type?: 'individual' | 'mixto' | 'sample';
  requires_studio_selection?: boolean;
  features?: string[];
}

interface BankInfo {
  bank_name: string;
  account_holder: string;
  account_number: string;
  clabe: string;
  reference_instructions: string;
}

function isMembershipFeePlan(plan: Plan) {
  return (
    plan.category === 'membership_fee' ||
    plan.name.toLowerCase().includes('social') ||
    plan.name.toLowerCase().includes('inscrip') ||
    Number(plan.price) === 500
  );
}

function getRewardPoints(classLimit: number | null) {
  const points: Record<number, number> = { 4: 30, 8: 60, 12: 100, 24: 160 };
  return classLimit ? points[classLimit] : null;
}

function getPlanAccessLabel(plan: Plan) {
  if (isMembershipFeePlan(plan)) return 'Acceso anual';
  if (plan.is_unlimited) return 'Clases ilimitadas';
  if (plan.class_limit) return getClassesLabel(plan.class_limit);
  return 'Acceso';
}

function sortPlansByUse(planA: Plan, planB: Plan) {
  const classA = planA.class_limit ?? (planA.is_unlimited ? 999 : 0);
  const classB = planB.class_limit ?? (planB.is_unlimited ? 999 : 0);

  if (classA !== classB) return classA - classB;
  if (Number(planA.price) !== Number(planB.price)) return Number(planA.price) - Number(planB.price);
  return (planA.sort_order || 0) - (planB.sort_order || 0);
}

export default function Checkout() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const preselectedPlanId = searchParams.get('plan');

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(preselectedPlanId);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<OrderPaymentMethod>('bank_transfer');
  const [notes, setNotes] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };
  const [step, setStep] = useState<'plan' | 'payment' | 'confirm'>('plan');

  // Discount code state
  const [discountCode, setDiscountCode] = useState('');
  const [discountResult, setDiscountResult] = useState<{
    valid: boolean;
    codeId: string;
    discountAmount: number;
    finalTotal: number;
    discountType: string;
    discountValue: number;
    description?: string;
    code: string;
  } | null>(null);
  const [discountError, setDiscountError] = useState('');
  const [isValidatingDiscount, setIsValidatingDiscount] = useState(false);

  // Fetch available plans
  const { data: plans, isLoading: plansLoading } = useQuery<Plan[]>({
    queryKey: ['plans-active'],
    queryFn: async () => {
      const res = await api.get('/plans');
      return res.data.filter((p: Plan) => p.is_active && !p.is_internal).sort((a: Plan, b: Plan) => (a.sort_order || 0) - (b.sort_order || 0));
    },
  });

  // Fetch user membership status 
  // We need to know if they have an active "membership_fee" plan
  const { data: myMembership } = useQuery({
    queryKey: ['my-membership-status'],
    queryFn: async () => {
      try {
        // We can check /bookings/my-bookings or a specific endpoint. 
        // Or simpler: /memberships/my-active-fee
        // Since we dont have that, let's use the generic my-membership and check plan details if possible.
        // Actually, `ProfileMembership` uses `fetchMyMembership`. Let's assume user might have multiple or we check the backend check.
        // For UI, let's just assume we need to handle the visual lock.
        // Let's use `api.get('/memberships/active')` if it exists, or check the existing `my-membership` logic.
        // Existing code uses `fetchMyMembership`. Let's rely on that.
        const res = await api.get('/memberships/my');
        // BE endpoint /api/memberships/my returns the active membership usually. 
        // But we specifically need to know if they have the "Fee" membership.
        // Let's assume the backend endpoint returns plan details.
        return res.data;
      } catch (e) {
        return null;
      }
    },
    retry: false
  });

  const hasActiveMembershipFee = myMembership?.some((m: any) => (
    m.status === 'active' && (
      m.plan_category === 'membership_fee' ||
      m.plan_name?.toLowerCase().includes('inscripci') ||
      m.plan_name?.toLowerCase().includes('social')
    )
  ));


  // Fetch facilities (studios) for individual-package studio selection
  const { data: facilities = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['facilities'],
    queryFn: async () => (await api.get('/facilities')).data,
  });
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>('');

  // Fetch bank info for transfer instructions
  const { data: bankInfo } = useQuery<BankInfo>({
    queryKey: ['bank-info'],
    queryFn: async () => (await api.get('/settings/bank-info')).data,
    enabled: selectedPaymentMethod === 'bank_transfer',
  });

  // Create order mutation
  const createOrder = useMutation({
    mutationFn: async (data: CreateOrderRequest) => {
      const res = await api.post('/orders', data);
      return res.data as Order;
    },
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ['my-orders'] });
      if (order.checkout_url) {
        window.location.href = order.checkout_url;
        return;
      }
      toast({
        title: '¡Orden creada!',
        description: `Tu orden ${order.order_number} ha sido creada.`,
      });
      navigate(`/app/orders/${order.id}`);
    },
    onError: (error: any) => {
      // Handle specific error codes
      if (error.response?.data?.code === 'MEMBERSHIP_REQUIRED') {
        toast({
          title: 'Membresía Requerida',
          description: 'Este plan es exclusivo para miembros activos.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Error',
          description: error.response?.data?.error || 'No se pudo crear la orden',
          variant: 'destructive',
        });
      }
    },
  });

  const selectedPlan = plans?.find(p => p.id === selectedPlanId);
  const visiblePlans = (plans || []).filter((plan) => {
    if (isMembershipFeePlan(plan) && hasActiveMembershipFee) return false;
    return true;
  });
  const groupedPlans = packageOrder
    .map((type) => ({
      ...packagePresentations[type],
      plans: visiblePlans.filter((plan) => getPackageType(plan) === type).sort(sortPlansByUse),
    }))
    .filter((group) => group.plans.length > 0);
  const needsStudio = !!selectedPlan?.requires_studio_selection;

  const handlePlanSelect = (planId: string) => {
    setSelectedPlanId(planId);
    // Clear discount when changing plan (may not apply to new plan)
    handleRemoveDiscount();
    // Force bank_transfer for trial/individual plans
    const plan = plans?.find(p => p.id === planId);
    if (plan && (plan.name.toLowerCase().includes('muestra') || plan.name.toLowerCase().includes('individual') || plan.name.toLowerCase().includes('prueba'))) {
      setSelectedPaymentMethod('bank_transfer');
    }
    setStep('payment');
  };

  const handlePaymentMethodSelect = () => {
    if (!selectedPlanId) return;
    setStep('confirm');
  };

  const handleConfirmOrder = () => {
    if (!selectedPlanId) return;

    if (needsStudio && !selectedFacilityId) {
      toast({
        title: 'Falta el estudio',
        description: 'Elige un estudio para tu paquete individual.',
        variant: 'destructive',
      });
      return;
    }

    createOrder.mutate({
      plan_id: selectedPlanId,
      payment_method: selectedPaymentMethod,
      notes: notes || undefined,
      discount_code_id: discountResult?.codeId || undefined,
      discount_amount: discountResult?.discountAmount || undefined,
      facility_id: needsStudio ? selectedFacilityId : undefined,
    } as any);
  };

  const handleValidateDiscount = async () => {
    if (!discountCode.trim() || !selectedPlan) return;

    setIsValidatingDiscount(true);
    setDiscountError('');
    setDiscountResult(null);

    try {
      const res = await api.post('/discount-codes/validate', {
        code: discountCode.trim(),
        plan_id: selectedPlan.id,
        subtotal: Number(selectedPlan.price),
      });

      setDiscountResult(res.data);
      toast({
        title: '¡Código aplicado!',
        description: `Descuento de ${formatPrice(res.data.discountAmount)} aplicado`,
      });
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Código no válido';
      setDiscountError(msg);
      toast({
        title: 'Código no válido',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setIsValidatingDiscount(false);
    }
  };

  const handleRemoveDiscount = () => {
    setDiscountResult(null);
    setDiscountCode('');
    setDiscountError('');
  };

  const subtotalAfterCode = discountResult
    ? discountResult.finalTotal
    : (selectedPlan?.price ?? 0);
  const baseAfterDiscounts = Math.max(subtotalAfterCode, 0);
  // Sin recargo por tarjeta: el total es exactamente el precio del paquete (menos descuentos).
  // Cualquier método de pago cobra lo mismo.
  const finalTotal = baseAfterDiscounts;

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(price);
  };

  const paymentMethods: { value: OrderPaymentMethod; label: string; icon: typeof CreditCard; description: string }[] = [
    {
      value: 'card',
      label: 'Tarjeta de crédito / débito',
      icon: CreditCard,
      description: 'Paga con tarjeta de forma segura vía Stripe',
    },
    {
      value: 'bank_transfer',
      label: 'Transferencia bancaria',
      icon: Building2,
      description: 'Realiza una transferencia y sube tu comprobante',
    },
    {
      value: 'cash' as OrderPaymentMethod,
      label: 'Efectivo en estudio',
      icon: Banknote,
      description: 'Genera tu orden y paga en el estudio; el staff la aprueba',
    },
  ];

  return (
    <AuthGuard requiredRoles={['client']}>
      <ClientLayout>
        <div className="mx-auto max-w-5xl space-y-6">
          <section className="rounded-[1.75rem] border border-[#DCCCC0]/80 bg-[#E6D0CA]/34 p-5 shadow-[0_22px_72px_-62px_rgba(42,33,24,0.58)] sm:p-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full bg-[#FCF8F1]/72 text-[#2A2118] hover:bg-[#DCCCC0]/55"
              onClick={() => {
                if (step === 'payment') setStep('plan');
                else if (step === 'confirm') setStep('payment');
                else navigate('/app');
              }}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-semibold tracking-[-0.04em] text-balance-dark sm:text-4xl">
                {step === 'plan' && 'Elige tu forma de moverte'}
                {step === 'payment' && 'Pago tranquilo'}
                {step === 'confirm' && 'Confirmar orden'}
              </h1>
              <p className="mt-1 text-sm text-balance-dark/62">
                {step === 'plan' && 'Los paquetes están agrupados por intención para que elijas sin adivinar.'}
                {step === 'payment' && 'Elige el método que te quede más cómodo.'}
                {step === 'confirm' && 'Revisa los detalles de tu compra'}
              </p>
            </div>
          </div>
          </section>

          <div className="flex items-center gap-2 text-sm">
            <Badge variant={step === 'plan' ? 'default' : 'secondary'} className={step === 'plan' ? 'rounded-full bg-[#A6776A] text-[#FFF8EE]' : 'rounded-full bg-[#DCCCC0]/50 text-[#2A2118]/68'}>1. Plan</Badge>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <Badge variant={step === 'payment' ? 'default' : 'secondary'} className={step === 'payment' ? 'rounded-full bg-[#A6776A] text-[#FFF8EE]' : 'rounded-full bg-[#DCCCC0]/50 text-[#2A2118]/68'}>2. Pago</Badge>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <Badge variant={step === 'confirm' ? 'default' : 'secondary'} className={step === 'confirm' ? 'rounded-full bg-[#A6776A] text-[#FFF8EE]' : 'rounded-full bg-[#DCCCC0]/50 text-[#2A2118]/68'}>3. Confirmar</Badge>
          </div>

          {/* Step 1: Select Plan */}
          {step === 'plan' && (
            <div className="space-y-5">
              {plansLoading ? (
                <>
                  <Skeleton className="h-44 w-full rounded-[1.75rem]" />
                  <Skeleton className="h-44 w-full rounded-[1.75rem]" />
                  <Skeleton className="h-44 w-full rounded-[1.75rem]" />
                </>
              ) : groupedPlans.length > 0 ? (
                groupedPlans.map((group) => (
                  <section key={group.type} className={`overflow-hidden rounded-[1.55rem] p-2 sm:p-3 ring-1 ${group.panel}`}>
                    <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
                      <div className="flex min-h-[12rem] flex-col justify-between rounded-[1.2rem] bg-[#FCF8F1]/58 p-4 ring-1 ring-[#2A2118]/[0.06]">
                        <div>
                          <span className={`inline-flex rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${group.chip}`}>
                            {group.eyebrow}
                          </span>
                          <h2 className="mt-4 text-2xl font-semibold leading-tight tracking-[-0.035em]">{group.title}</h2>
                          <p className={`mt-2 text-sm leading-relaxed ${group.text}`}>{group.detail}</p>
                        </div>
                        <p className="mt-5 border-t border-[#2A2118]/10 pt-3 text-xs font-semibold leading-relaxed text-[#2A2118]/62">
                          {group.rule}
                        </p>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                        {group.plans.map((plan) => {
                          const presentation = getPackagePresentation(plan);
                          const isSelected = selectedPlanId === plan.id;
                          const rewardPoints = getRewardPoints(plan.class_limit);
                          const price = Number(plan.price);
                          const classesLabel = getPlanAccessLabel(plan);
                          const pricePerClass = plan.class_limit
                            ? formatPrice(Math.round(price / plan.class_limit))
                            : null;

                          return (
                            <button
                              key={plan.id}
                              type="button"
                              className={`group relative flex min-h-[14rem] w-full min-w-0 flex-col overflow-hidden rounded-[1.25rem] p-4 text-left ring-1 transition duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A6776A]/45 active:scale-[0.99] ${presentation.card} ${
                                isSelected ? presentation.selected : ''
                              }`}
                              aria-pressed={isSelected}
                              onClick={() => handlePlanSelect(plan.id)}
                            >
                              <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-current/25 to-transparent" />

                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${presentation.badge}`}>
                                      {presentation.accentLabel}
                                    </span>
                                    {isMembershipFeePlan(plan) && (
                                      <span className="rounded-full bg-balance-cream/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-balance-dark/70 ring-1 ring-balance-dark/10">
                                        acceso anual
                                      </span>
                                    )}
                                    {isSelected && (
                                      <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${presentation.chip}`}>
                                        <CheckCircle2 className="h-3 w-3" />
                                        Seleccionado
                                      </span>
                                    )}
                                  </div>
                                  <h4 className="mt-3 text-xl font-heading font-bold leading-[1.02] tracking-[-0.035em] text-current">
                                    {plan.name}
                                  </h4>
                                  {plan.description && (
                                    <p className={`mt-2 overflow-hidden text-sm leading-relaxed font-body [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] ${presentation.text}`}>
                                      {plan.description}
                                    </p>
                                  )}
                                </div>
                                <div className="shrink-0 text-right">
                                  <p className="text-2xl font-heading font-bold tracking-[-0.05em] text-current">
                                    {formatPrice(price)}
                                  </p>
                                  <p className={`mt-1 text-xs font-semibold ${presentation.text}`}>
                                    {plan.duration_days} días
                                  </p>
                                </div>
                              </div>

                              <div className="mt-4 flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#DCCCC0]/75 bg-[#ECE1CE]/58 px-3 py-1.5 text-sm font-semibold">
                                  <Star className="h-4 w-4" />
                                  {classesLabel}
                                </span>
                                {pricePerClass && (
                                  <span className="rounded-full border border-[#DCCCC0]/75 bg-[#ECE1CE]/58 px-3 py-1.5 text-xs font-semibold">
                                    {pricePerClass} por clase
                                  </span>
                                )}
                                {rewardPoints && (
                                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ring-1 ${presentation.badge}`}>
                                    <Star className="h-3.5 w-3.5 fill-current" />
                                    +{rewardPoints} pts
                                  </span>
                                )}
                              </div>

                              {plan.features && plan.features.length > 0 && (
                                <ul className="mt-4 space-y-2">
                                  {plan.features.map((feature, idx) => (
                                    <li key={idx} className="flex items-start gap-2 text-sm">
                                      <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                      <span className="font-body">{feature}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}

                              <div className={`mt-auto inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-bold ${presentation.cta}`}>
                                {isSelected ? (
                                  <>
                                    <CheckCircle2 className="h-4 w-4" />
                                    Seleccionado
                                  </>
                                ) : (
                                  <>
                                    Seleccionar {presentation.shortTitle.toLowerCase()}
                                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                                  </>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </section>
                ))
              ) : (
                <Card className="rounded-[1.25rem]">
                  <CardContent className="py-8 text-center">
                    <p className="text-muted-foreground">
                      No hay planes disponibles en este momento.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Step 2: Select Payment Method */}
          {step === 'payment' && selectedPlan && (
            <div className="space-y-4">
              {/* Selected plan summary */}
              <Card className="rounded-[1.5rem] border-[#DCCCC0]/75 bg-[#FCF8F1]/58">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{selectedPlan.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {getPlanAccessLabel(selectedPlan)}
                        {' · '}
                        {selectedPlan.duration_days} días
                      </p>
                    </div>
                    <p className="text-xl font-bold">{formatPrice(selectedPlan.price)}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Payment methods */}
              <Card className="rounded-[1.75rem] border-[#DCCCC0]/75 bg-[#FCF8F1]/82 shadow-[0_22px_72px_-64px_rgba(42,33,24,.55)]">
                <CardHeader>
                  <CardTitle className="text-lg">Selecciona método de pago</CardTitle>
                </CardHeader>
                <CardContent>
                  <RadioGroup
                    value={selectedPaymentMethod}
                    onValueChange={(v) => setSelectedPaymentMethod(v as OrderPaymentMethod)}
                    className="space-y-3"
                  >
                    {paymentMethods.map((method) => (
                      <div
                        key={method.value}
                        className={`flex cursor-pointer items-start space-x-3 rounded-[1.25rem] border p-4 transition-colors ${selectedPaymentMethod === method.value
                          ? 'border-[#A6776A]/58 bg-[#E6D0CA]/36'
                          : 'border-[#DCCCC0]/68 bg-[#FCF8F1]/40 hover:bg-[#E6D0CA]/24'
                          }`}
                        onClick={() => setSelectedPaymentMethod(method.value)}
                      >
                        <RadioGroupItem value={method.value} id={method.value} className="mt-1" />
                        <div className="flex-1">
                          <Label htmlFor={method.value} className="flex items-center gap-2 cursor-pointer">
                            <method.icon className="h-5 w-5 text-[#AD6C20]" />
                            <span className="font-medium">{method.label}</span>
                          </Label>
                          <p className="text-sm text-muted-foreground mt-1">
                            {method.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </RadioGroup>
                </CardContent>
                <CardFooter>
                  <Button onClick={handlePaymentMethodSelect} className="w-full rounded-full bg-[#A6776A] text-[#FFF8EE] hover:bg-[#8F6258]">
                    Continuar
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </CardFooter>
              </Card>
            </div>
          )}

          {/* Step 3: Confirm Order */}
          {step === 'confirm' && selectedPlan && (
            <div className="space-y-4">
              <Card className="rounded-[1.75rem] border-[#DCCCC0]/75 bg-[#FCF8F1]/82 shadow-[0_22px_72px_-64px_rgba(42,33,24,.55)]">
                <CardHeader>
                  <CardTitle className="text-lg">Resumen de tu orden</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Plan details */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{selectedPlan.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {getPlanAccessLabel(selectedPlan)}
                        {' · '}
                        {selectedPlan.duration_days} días
                      </p>
                    </div>
                    <p className="font-medium">{formatPrice(selectedPlan.price)}</p>
                  </div>

                  <Separator />

                  {/* Payment method */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Método de pago</span>
                    <span className="font-medium">
                      {paymentMethods.find(m => m.value === selectedPaymentMethod)?.label}
                    </span>
                  </div>

                  <Separator />

                  {/* Discount code */}
                  <div className="space-y-3">
                    <Label className="flex items-center gap-2 text-sm">
                      <Tag className="h-4 w-4" />
                      Código de descuento
                    </Label>

                    {discountResult ? (
                      <div className="flex items-center justify-between rounded-[1rem] border border-[#A6776A]/24 bg-[#E6D0CA]/30 p-3">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-[#A6776A]" />
                          <div>
                            <p className="text-sm font-medium text-[#6F4D45]">
                              {discountResult.code}
                            </p>
                            <p className="text-xs text-[#A6776A]">
                              {discountResult.discountType === 'percentage'
                                ? `${discountResult.discountValue}% de descuento`
                                : `${formatPrice(discountResult.discountValue)} de descuento`}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-[#A6776A] hover:bg-[#DCCCC0]/50 hover:text-[#2A2118]"
                          onClick={handleRemoveDiscount}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          placeholder="Código de descuento o referido"
                          value={discountCode}
                          onChange={(e) => {
                            setDiscountCode(e.target.value.toUpperCase());
                            setDiscountError('');
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleValidateDiscount();
                            }
                          }}
                          className={`w-full ${discountError ? 'border-red-400' : ''}`}
                          disabled={isValidatingDiscount}
                        />
                        <Button
                          variant="outline"
                          onClick={handleValidateDiscount}
                          disabled={!discountCode.trim() || isValidatingDiscount}
                          className="w-full shrink-0 sm:w-auto"
                        >
                          {isValidatingDiscount ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            'Aplicar'
                          )}
                        </Button>
                      </div>
                    )}

                    {discountError && (
                      <p className="text-xs text-red-500">{discountError}</p>
                    )}
                  </div>

                  <Separator />

                  {/* Subtotal and discount breakdown */}
                  {discountResult && (
                    <>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span>{formatPrice(selectedPlan.price)}</span>
                      </div>
                      {discountResult && (
                        <div className="flex items-center justify-between text-sm text-[#A6776A]">
                          <span className="flex items-center gap-1">
                            <Tag className="h-3 w-3" />
                            Descuento ({discountResult.code})
                          </span>
                          <span>-{formatPrice(discountResult.discountAmount)}</span>
                        </div>
                      )}
                    </>
                  )}

                  {/* Total */}
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-lg">Total</span>
                    <span className="font-bold text-lg text-[#A6776A]">
                      {formatPrice(finalTotal)}
                    </span>
                  </div>

                  {/* Notes */}
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notas adicionales (opcional)</Label>
                    <Textarea
                      id="notes"
                      placeholder="¿Algún comentario sobre tu compra?"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                    />
                  </div>

                  {/* Bank transfer info preview */}
                  {selectedPaymentMethod === 'bank_transfer' && bankInfo && (
                    <div className="space-y-3 rounded-[1.25rem] bg-[#E6D0CA]/28 p-4 ring-1 ring-[#DCCCC0]/65">
                      <p className="text-sm font-medium flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        Datos para transferencia
                      </p>
                      <div className="grid gap-2">
                        <div className="flex items-center justify-between p-2.5 rounded-md bg-background">
                          <div>
                            <p className="text-xs text-muted-foreground">Banco</p>
                            <p className="text-sm font-medium">{bankInfo.bank_name}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between p-2.5 rounded-md bg-background">
                          <div>
                            <p className="text-xs text-muted-foreground">Titular</p>
                            <p className="text-sm font-medium">{bankInfo.account_holder}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 shrink-0"
                            onClick={() => copyToClipboard(bankInfo.account_holder, 'holder')}
                          >
                            {copiedField === 'holder' ? <Check className="h-3.5 w-3.5 text-[#A6776A]" /> : <Copy className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                        {bankInfo.account_number && (
                          <div className="flex items-center justify-between p-2.5 rounded-md bg-background">
                            <div>
                              <p className="text-xs text-muted-foreground">Número de cuenta</p>
                              <p className="text-sm font-medium font-mono">{bankInfo.account_number}</p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-10 w-10 shrink-0"
                              onClick={() => copyToClipboard(bankInfo.account_number, 'account')}
                            >
                              {copiedField === 'account' ? <Check className="h-3.5 w-3.5 text-[#A6776A]" /> : <Copy className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                        )}
                        <div className="flex items-center justify-between p-2.5 rounded-md bg-background">
                          <div>
                            <p className="text-xs text-muted-foreground">CLABE interbancaria</p>
                            <p className="text-sm font-medium font-mono">{bankInfo.clabe}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 shrink-0"
                            onClick={() => copyToClipboard(bankInfo.clabe, 'clabe')}
                          >
                            {copiedField === 'clabe' ? <Check className="h-3.5 w-3.5 text-[#A6776A]" /> : <Copy className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                        <div className="rounded-[0.625rem] border border-[#A6776A]/22 bg-[#E6D0CA]/35 p-2.5">
                          <p className="text-xs text-muted-foreground">Monto a transferir</p>
                          <p className="font-bold text-[#A6776A]">{formatPrice(finalTotal)}</p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Después de confirmar, podrás subir tu comprobante de pago desde el detalle de tu orden.
                      </p>
                    </div>
                  )}

                  {selectedPaymentMethod === 'cash' && (
                    <div className="rounded-[1rem] bg-muted/50 p-4 app-soft-shadow">
                      <p className="text-sm flex items-center gap-2">
                        <Banknote className="h-4 w-4" />
                        <span>
                          Tu orden quedará pendiente hasta que realices el pago en el estudio.
                          Presenta el número de orden al pagar.
                        </span>
                      </p>
                    </div>
                  )}

                  {needsStudio && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Elige tu estudio (paquete individual)</Label>
                      <Select value={selectedFacilityId} onValueChange={setSelectedFacilityId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un estudio" />
                        </SelectTrigger>
                        <SelectContent>
                          {facilities.map((f) => (
                            <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Tu paquete individual solo podrá usarse en este estudio.</p>
                    </div>
                  )}
                </CardContent>
                <CardFooter className="flex-col gap-3">
                  <Button
                    onClick={handleConfirmOrder}
                    className="w-full rounded-full bg-[#A6776A] text-[#FFF8EE] hover:bg-[#8F6258]"
                    disabled={createOrder.isPending}
                  >
                    {createOrder.isPending ? (
                      'Creando orden...'
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Confirmar orden
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-center text-muted-foreground">
                    Al confirmar, aceptas los términos y condiciones del estudio.
                  </p>
                </CardFooter>
              </Card>
            </div>
          )}
        </div>
      </ClientLayout>
    </AuthGuard>
  );
}
