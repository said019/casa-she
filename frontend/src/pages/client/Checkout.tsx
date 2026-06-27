import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { CasaSheMark } from '@/components/CasaSheLogo';
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

// Tarjetas de marca del index ("Nuestros Paquetes"): imagen, precio anterior,
// detalle y orden. Se mapea cada plan de la BD por su nombre.
type PlanCardMeta = { img: string; was?: string; hint: string; oferta?: boolean; order: number };
const PLAN_CARDS: { match: (n: string) => boolean; meta: PlanCardMeta }[] = [
  { match: (n) => n.includes('black'), meta: { img: '/casashe/card-black.jpeg', was: '$4,800', hint: '24 créditos · acceso total', oferta: true, order: 1 } },
  { match: (n) => n.includes('360'), meta: { img: '/casashe/card-360.jpeg', was: '$3,800', hint: '16 créditos al mes', oferta: true, order: 2 } },
  { match: (n) => n.includes('12'), meta: { img: '/casashe/card-12.jpeg', hint: '12 créditos · vigencia 1 mes', order: 3 } },
  { match: (n) => n.includes('8'), meta: { img: '/casashe/card-8.jpeg', hint: '8 créditos · vigencia 1 mes', order: 4 } },
  { match: (n) => n.includes('5'), meta: { img: '/casashe/card-5.jpeg', hint: '5 créditos · vigencia 1 mes', order: 5 } },
  { match: (n) => n.includes('drop') || n.includes('suelta'), meta: { img: '/casashe/card-suelta.jpeg', was: '$300', hint: '1 clase drop-in', oferta: true, order: 6 } },
  { match: (n) => n.includes('prueba') || n.includes('muestra'), meta: { img: '/casashe/card-muestra.jpeg', hint: 'Tu primera vez en casa', order: 7 } },
];

function getPlanCardMeta(name: string): PlanCardMeta | undefined {
  const n = name.toLowerCase();
  return PLAN_CARDS.find((c) => c.match(n))?.meta;
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

  // Mono-sede (Condesa): no se elige estudio; se asigna automáticamente la única sede.
  useEffect(() => {
    if (!selectedFacilityId && facilities.length > 0) {
      setSelectedFacilityId(facilities[0].id);
    }
  }, [facilities, selectedFacilityId]);

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
          <section className="rounded-[1.75rem] border border-[#D6D5C2]/80 bg-[#DDE4D5]/34 p-5 shadow-[0_22px_72px_-62px_rgba(42,33,24,0.58)] sm:p-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full bg-[#FBF7EE]/72 text-[#2E1B22] hover:bg-[#D6D5C2]/55"
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
                {step === 'plan' && 'Elige el paquete que va contigo.'}
                {step === 'payment' && 'Elige el método que te quede más cómodo.'}
                {step === 'confirm' && 'Revisa los detalles de tu compra'}
              </p>
            </div>
          </div>
          </section>

          <div className="flex items-center gap-2 text-sm">
            <Badge variant={step === 'plan' ? 'default' : 'secondary'} className={step === 'plan' ? 'rounded-full bg-[#2A4E36] text-[#F6F0E4]' : 'rounded-full bg-[#D6D5C2]/50 text-[#2E1B22]/68'}>1. Plan</Badge>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <Badge variant={step === 'payment' ? 'default' : 'secondary'} className={step === 'payment' ? 'rounded-full bg-[#2A4E36] text-[#F6F0E4]' : 'rounded-full bg-[#D6D5C2]/50 text-[#2E1B22]/68'}>2. Pago</Badge>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <Badge variant={step === 'confirm' ? 'default' : 'secondary'} className={step === 'confirm' ? 'rounded-full bg-[#2A4E36] text-[#F6F0E4]' : 'rounded-full bg-[#D6D5C2]/50 text-[#2E1B22]/68'}>3. Confirmar</Badge>
          </div>

          {/* Step 1: Select Plan */}
          {step === 'plan' && (
            <div>
              {plansLoading ? (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-[26rem] w-full rounded-2xl" />
                  ))}
                </div>
              ) : visiblePlans.length > 0 ? (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {[...visiblePlans]
                    .sort((a, b) => (getPlanCardMeta(a.name)?.order ?? 99) - (getPlanCardMeta(b.name)?.order ?? 99))
                    .map((plan) => {
                      const meta = getPlanCardMeta(plan.name);
                      const isSelected = selectedPlanId === plan.id;
                      const price = Number(plan.price);
                      return (
                        <button
                          key={plan.id}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => handlePlanSelect(plan.id)}
                          className={`group flex flex-col overflow-hidden rounded-2xl bg-white/60 text-left ring-1 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2A4E36] active:scale-[0.99] ${
                            isSelected ? 'ring-2 ring-[#2A4E36]' : 'ring-[#2A4E36]/10'
                          }`}
                        >
                          <div className="relative aspect-square overflow-hidden">
                            {meta ? (
                              <img
                                src={meta.img}
                                alt={plan.name}
                                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-[#2A4E36]/10">
                                <CasaSheMark className="h-20 w-20 opacity-40" />
                              </div>
                            )}
                            {meta?.oferta && (
                              <span
                                className="absolute left-4 top-4 rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.2em]"
                                style={{ backgroundColor: '#2A4E36', color: '#F6F0E4' }}
                              >
                                Oferta
                              </span>
                            )}
                            {isSelected && (
                              <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-[#F6F0E4] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2A4E36]">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Elegido
                              </span>
                            )}
                          </div>
                          <div className="flex flex-1 flex-col items-center px-6 py-7 text-center">
                            <h3 className="font-heading text-lg uppercase tracking-[0.14em] text-[#2A4E36]">{plan.name}</h3>
                            <p className="mt-1 text-[13px] tracking-wide text-[#2A4E36]/55">
                              {meta?.hint ?? `${plan.duration_days} días`}
                            </p>
                            <div className="mt-4 flex items-baseline justify-center gap-2 font-heading">
                              {meta?.was && (
                                <span className="text-lg text-[#2A4E36]/40 line-through">{meta.was}</span>
                              )}
                              <span className="text-4xl font-medium text-[#2A4E36]">{formatPrice(price)}</span>
                            </div>
                            <span className="mt-6 w-full rounded-full bg-[#2A4E36] py-3 text-[12px] uppercase tracking-[0.24em] text-[#F6F0E4] transition-colors group-hover:bg-[#16261A]">
                              {isSelected ? 'Continuar' : 'Comprar'}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                </div>
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
              <Card className="rounded-[1.5rem] border-[#D6D5C2]/75 bg-[#FBF7EE]/58">
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
              <Card className="rounded-[1.75rem] border-[#D6D5C2]/75 bg-[#FBF7EE]/82 shadow-[0_22px_72px_-64px_rgba(42,33,24,.55)]">
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
                          ? 'border-[#2A4E36]/58 bg-[#DDE4D5]/36'
                          : 'border-[#D6D5C2]/68 bg-[#FBF7EE]/40 hover:bg-[#DDE4D5]/24'
                          }`}
                        onClick={() => setSelectedPaymentMethod(method.value)}
                      >
                        <RadioGroupItem value={method.value} id={method.value} className="mt-1" />
                        <div className="flex-1">
                          <Label htmlFor={method.value} className="flex items-center gap-2 cursor-pointer">
                            <method.icon className="h-5 w-5 text-[#AE4836]" />
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
                  <Button onClick={handlePaymentMethodSelect} className="w-full rounded-full bg-[#2A4E36] text-[#F6F0E4] hover:bg-[#16261A]">
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
              <Card className="rounded-[1.75rem] border-[#D6D5C2]/75 bg-[#FBF7EE]/82 shadow-[0_22px_72px_-64px_rgba(42,33,24,.55)]">
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
                      <div className="flex items-center justify-between rounded-[1rem] border border-[#2A4E36]/24 bg-[#DDE4D5]/30 p-3">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-[#2A4E36]" />
                          <div>
                            <p className="text-sm font-medium text-[#6F4D45]">
                              {discountResult.code}
                            </p>
                            <p className="text-xs text-[#2A4E36]">
                              {discountResult.discountType === 'percentage'
                                ? `${discountResult.discountValue}% de descuento`
                                : `${formatPrice(discountResult.discountValue)} de descuento`}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-[#2A4E36] hover:bg-[#D6D5C2]/50 hover:text-[#2E1B22]"
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
                        <div className="flex items-center justify-between text-sm text-[#2A4E36]">
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
                    <span className="font-bold text-lg text-[#2A4E36]">
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
                    <div className="space-y-3 rounded-[1.25rem] bg-[#DDE4D5]/28 p-4 ring-1 ring-[#D6D5C2]/65">
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
                            {copiedField === 'holder' ? <Check className="h-3.5 w-3.5 text-[#2A4E36]" /> : <Copy className="h-3.5 w-3.5" />}
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
                              {copiedField === 'account' ? <Check className="h-3.5 w-3.5 text-[#2A4E36]" /> : <Copy className="h-3.5 w-3.5" />}
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
                            {copiedField === 'clabe' ? <Check className="h-3.5 w-3.5 text-[#2A4E36]" /> : <Copy className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                        <div className="rounded-[0.625rem] border border-[#2A4E36]/22 bg-[#DDE4D5]/35 p-2.5">
                          <p className="text-xs text-muted-foreground">Monto a transferir</p>
                          <p className="font-bold text-[#2A4E36]">{formatPrice(finalTotal)}</p>
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

                  {/* Mono-sede (Condesa): se asigna automáticamente la única sede, sin selector. */}
                </CardContent>
                <CardFooter className="flex-col gap-3">
                  <Button
                    onClick={handleConfirmOrder}
                    className="w-full rounded-full bg-[#2A4E36] text-[#F6F0E4] hover:bg-[#16261A]"
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
