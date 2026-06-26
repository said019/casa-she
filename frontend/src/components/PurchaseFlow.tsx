import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Check, CreditCard, Building2, AlertCircle, Star, ArrowRight, Upload, X } from 'lucide-react';
import api from '@/lib/api';
import { planClassLabel } from '@/lib/credits';
import {
  getClassesLabel,
  getPackagePresentation,
  getPackageType,
  packageOrder,
  packagePresentations,
} from '@/lib/planPresentation';

interface Plan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  duration_days: number;
  class_limit: number | null;
  reformer_credits?: number | null;
  multi_credits?: number | null;
  features: string[];
  is_active: boolean;
  is_internal?: boolean;
  sort_order: number;
  category?: string | null;
  package_type?: 'individual' | 'mixto' | 'sample';
  requires_studio_selection?: boolean;
}

type PaymentMethod = 'card' | 'transfer';
type Step = 'select-plan' | 'payment-method' | 'processing';

/**
 * Lee un archivo de imagen y lo regresa como data URL JPEG comprimida
 * (máx ~1400px, calidad 0.7) para que el comprobante viaje liviano en el JSON.
 * Si la compresión falla, regresa el data URL original.
 */
async function fileToCompressedDataUrl(file: File, maxDim = 1400, quality = 0.7): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Imagen inválida'));
      image.src = dataUrl;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return dataUrl;
  }
}

export function PurchaseFlow() {
  const [step, setStep] = useState<Step>('select-plan');
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const [isProcessing, setIsProcessing] = useState(false);
  const [receiptDataUrl, setReceiptDataUrl] = useState<string | null>(null);
  const [receiptName, setReceiptName] = useState<string | null>(null);
  const [readingReceipt, setReadingReceipt] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Fetch planes disponibles
  const { data: plans = [], isLoading: loadingPlans } = useQuery<Plan[]>({
    queryKey: ['plans'],
    queryFn: async () => {
      const response = await api.get('/plans');
      return response.data.filter((p: Plan) => p.is_active && !p.is_internal);
    },
  });

  // Datos bancarios para transferencia (fuente única: admin → Configuración → Datos bancarios)
  const { data: bankInfo } = useQuery<{
    bank_name?: string;
    account_holder?: string;
    account_number?: string;
    clabe?: string;
    reference_instructions?: string;
  }>({
    queryKey: ['bank-info'],
    queryFn: async () => (await api.get('/settings/bank-info')).data,
  });

  // Mutation para crear membresía
  const createMembershipMutation = useMutation({
    mutationFn: async ({ planId, paymentMethod, receiptUrl }: { planId: string; paymentMethod: PaymentMethod; receiptUrl?: string | null }) => {
      const response = await api.post('/memberships', {
        planId,
        paymentMethod,
        receiptUrl: receiptUrl ?? undefined,
      });
      return response.data;
    },
    onSuccess: async (data, variables) => {
      if (variables.paymentMethod === 'card') {
        // Simular procesamiento de tarjeta (2 segundos) y auto-activar
        setTimeout(async () => {
          try {
            await api.post(
              `/memberships/complete-payment/${data.membershipId}`,
              { reference: `CARD-${Date.now()}` }
            );

            queryClient.invalidateQueries({ queryKey: ['membership'] });
            setIsProcessing(false);

            toast({
              title: '¡Pago exitoso! ✓',
              description: 'Tus créditos han sido activados. Redirigiendo al calendario...',
            });

            setTimeout(() => {
              navigate('/');
            }, 1500);
          } catch (error) {
            setIsProcessing(false);
            toast({
              variant: 'destructive',
              title: 'Error',
              description: 'Error al activar membresía',
            });
          }
        }, 2000);
      } else {
        // Transferencia - mostrar mensaje de espera
        setIsProcessing(false);
        setStep('processing');
      }
    },
    onError: (error: any) => {
      setIsProcessing(false);
      const message = error.response?.data?.error || 'Error al procesar compra';
      toast({
        variant: 'destructive',
        title: 'Error',
        description: message,
      });
    },
  });

  const handlePlanSelect = (plan: Plan) => {
    setSelectedPlan(plan);
    setStep('payment-method');
  };

  const handleReceiptFile = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({
        variant: 'destructive',
        title: 'Archivo no válido',
        description: 'Sube una imagen (JPG o PNG) del comprobante.',
      });
      return;
    }
    setReadingReceipt(true);
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      setReceiptDataUrl(dataUrl);
      setReceiptName(file.name);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo procesar la imagen.' });
    } finally {
      setReadingReceipt(false);
    }
  };

  const clearReceipt = () => {
    setReceiptDataUrl(null);
    setReceiptName(null);
  };

  const handlePaymentSubmit = async () => {
    if (!selectedPlan) return;

    if (paymentMethod === 'transfer' && !receiptDataUrl) {
      toast({
        variant: 'destructive',
        title: 'Falta el comprobante',
        description: 'Sube la foto de tu comprobante de transferencia para continuar.',
      });
      return;
    }

    setIsProcessing(true);

    if (paymentMethod === 'card') {
      toast({
        title: 'Procesando pago...',
        description: 'Por favor espera mientras procesamos tu tarjeta.',
      });
    }

    await createMembershipMutation.mutateAsync({
      planId: selectedPlan.id,
      paymentMethod,
      receiptUrl: paymentMethod === 'transfer' ? receiptDataUrl : undefined,
    });
  };

  const visiblePlans = [...plans].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const groupedPlans = packageOrder
    .map((type) => ({
      ...packagePresentations[type],
      plans: visiblePlans.filter((plan) => getPackageType(plan) === type),
    }))
    .filter((group) => group.plans.length > 0);

  // Paso 1: Selección de Plan
  if (step === 'select-plan') {
    return (
      <div className="space-y-7 pb-28 lg:pb-4">
        <div className="rounded-[2rem] bg-balance-cream/60 p-5 ring-1 ring-balance-sand/60 sm:p-7">
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-balance-olive">
            paquetes claros
          </span>
          <h2 className="mt-3 text-3xl font-heading font-bold tracking-[-0.04em] text-foreground sm:text-4xl">
            Elige cómo quieres moverte
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground font-body sm:text-base">
            Membresía activa tu acceso, prueba te deja conocer el estudio, Reformer enfoca tu rutina y Mixto te da libertad entre disciplinas.
          </p>
        </div>

        {loadingPlans ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-5">
            {groupedPlans.map((group) => (
              <section key={group.type} className={`overflow-hidden rounded-[2rem] p-3 ring-1 ${group.panel}`}>
                <div className="rounded-[1.55rem] bg-balance-dark/[0.035] p-4 sm:p-5">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <span className={`inline-flex rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${group.chip}`}>
                        {group.eyebrow}
                      </span>
                      <h3 className="mt-3 text-2xl font-heading font-bold tracking-[-0.04em]">
                        {group.title}
                      </h3>
                      <p className={`mt-1 text-sm leading-relaxed ${group.text}`}>
                        {group.detail}
                      </p>
                    </div>
                    <span className={`mt-1 hidden h-3 w-3 shrink-0 rounded-full sm:block ${group.dot}`} />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {group.plans.map((plan) => {
                      const presentation = getPackagePresentation(plan);
                      // BMB usa reformer_credits + multi_credits, no class_limit.
                      const ref = plan.reformer_credits;
                      const mul = plan.multi_credits;
                      const totalCreds = (ref ?? 0) + (mul ?? 0);
                      const isUnlimited = ref === null && mul === null;
                      const isPartUnlimited = ref === null || mul === null;
                      const pricePerClass = totalCreds > 0 && !isPartUnlimited
                        ? Math.round(plan.price / totalCreds).toString()
                        : null;
                      // Etiqueta de clases para el chip
                      const classesLabel = isUnlimited ? 'Acceso ilimitado'
                        : ref === null ? 'Reformer ilimitado'
                        : mul === null ? 'Multi ilimitado'
                        : (ref! > 0 && mul! > 0) ? `${ref} reformer · ${mul} multi`
                        : totalCreds > 0 ? `${totalCreds} clase${totalCreds === 1 ? '' : 's'}`
                        : getClassesLabel(plan.class_limit, 1);
                      const planPointsMap: Record<number, number> = { 4: 30, 8: 60, 12: 100, 24: 160 };
                      const bonusPoints = totalCreds in planPointsMap ? planPointsMap[totalCreds] : null;

                      return (
                        <button
                          key={plan.id}
                          type="button"
                          className={`group relative w-full overflow-hidden rounded-[1.55rem] p-5 text-left ring-1 transition duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 active:scale-[0.99] ${presentation.card}`}
                          onClick={() => handlePlanSelect(plan)}
                        >
                          <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-current/25 to-transparent" />
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${presentation.badge}`}>
                                {presentation.accentLabel}
                              </span>
                              <h4 className="mt-3 text-2xl font-heading font-bold leading-tight tracking-[-0.045em] text-current">
                                {plan.name}
                              </h4>
                              {plan.description && (
                                <p className={`mt-2 text-sm leading-relaxed font-body ${presentation.text}`}>
                                  {plan.description}
                                </p>
                              )}
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-3xl font-heading font-bold tracking-[-0.06em] text-current">
                                ${plan.price.toLocaleString('es-MX')}
                              </p>
                              <p className={`mt-1 text-xs font-semibold ${presentation.text}`}>
                                {plan.duration_days} días
                              </p>
                            </div>
                          </div>

                          <div className="mt-5 flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-balance-cream/70 px-3 py-1.5 text-sm font-semibold ring-1 ring-balance-dark/8">
                              <Star className="h-4 w-4" />
                              {classesLabel}
                            </span>
                            {pricePerClass && (
                              <span className="rounded-full bg-balance-cream/70 px-3 py-1.5 text-xs font-semibold ring-1 ring-balance-dark/8">
                                ${pricePerClass} por clase
                              </span>
                            )}
                            {bonusPoints && (
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ring-1 ${presentation.badge}`}>
                                <Star className="h-3.5 w-3.5 fill-current" />
                                +{bonusPoints} pts
                              </span>
                            )}
                          </div>

                          {plan.features?.length > 0 && (
                            <ul className="mt-4 space-y-2">
                              {plan.features.map((feature, idx) => (
                                <li key={idx} className="flex items-start gap-2 text-sm">
                                  <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                  <span className="font-body">{feature}</span>
                                </li>
                              ))}
                            </ul>
                          )}

                          <div className={`mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-bold ${presentation.cta}`}>
                            Seleccionar {presentation.shortTitle.toLowerCase()}
                            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Paso 2: Método de Pago
  if (step === 'payment-method') {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Button
          variant="ghost"
          onClick={() => setStep('select-plan')}
          className="mb-4"
        >
          ← Volver a planes
        </Button>

        <div className="text-center mb-8">
          <h2 className="text-3xl font-heading font-bold text-foreground mb-2">
            Método de pago
          </h2>
          <p className="text-muted-foreground font-body">
            Selecciona cómo deseas pagar tu membresía
          </p>
        </div>

        {/* Plan seleccionado */}
        {selectedPlan && (
          <Card className="bg-muted/30">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-heading font-semibold text-lg">{selectedPlan.name}</h3>
                  <p className="text-sm text-muted-foreground font-body">
                    {planClassLabel(selectedPlan)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-heading font-bold">
                    ${selectedPlan.price.toLocaleString()}
                  </p>
                  <p className="text-sm text-muted-foreground">MXN</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Métodos de pago */}
        <RadioGroup
          value={paymentMethod}
          onValueChange={(v) => {
            const next = v as PaymentMethod;
            setPaymentMethod(next);
            if (next !== 'transfer') clearReceipt();
          }}
        >
          <Card className={`cursor-pointer transition-all ${paymentMethod === 'card' ? 'border-primary' : ''}`}>
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <RadioGroupItem value="card" id="card" />
                <div className="flex-1">
                  <Label htmlFor="card" className="flex items-center gap-2 cursor-pointer">
                    <CreditCard className="w-5 h-5" />
                    <span className="font-heading font-semibold">Tarjeta de Crédito/Débito</span>
                  </Label>
                  <p className="text-sm text-muted-foreground font-body mt-1">
                    Pago instantáneo. Tus créditos se activan inmediatamente.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={`cursor-pointer transition-all ${paymentMethod === 'transfer' ? 'border-primary' : ''}`}>
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <RadioGroupItem value="transfer" id="transfer" />
                <div className="flex-1">
                  <Label htmlFor="transfer" className="flex items-center gap-2 cursor-pointer">
                    <Building2 className="w-5 h-5" />
                    <span className="font-heading font-semibold">Transferencia Bancaria</span>
                  </Label>
                  <p className="text-sm text-muted-foreground font-body mt-1">
                    Verificación manual. Créditos activados en 1-2 horas hábiles.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </RadioGroup>

        {/* Datos bancarios para transferencia (desde la config del studio) */}
        {paymentMethod === 'transfer' && (
          <Alert className="bg-info/10 border-info/30">
            <Building2 className="h-4 w-4 text-info" />
            <AlertDescription className="text-foreground space-y-2">
              <p className="font-semibold font-heading">Datos para transferencia:</p>
              <div className="space-y-1 text-sm font-body">
                {bankInfo?.bank_name && <p><strong>Institución:</strong> {bankInfo.bank_name}</p>}
                {bankInfo?.account_holder && <p><strong>Beneficiario:</strong> {bankInfo.account_holder}</p>}
                {bankInfo?.clabe && <p><strong>CLABE:</strong> {bankInfo.clabe}</p>}
                {bankInfo?.account_number && <p><strong>Cuenta:</strong> {bankInfo.account_number}</p>}
                {bankInfo?.reference_instructions
                  ? <p className="text-muted-foreground">{bankInfo.reference_instructions}</p>
                  : <p><strong>Concepto:</strong> Tu nombre + {selectedPlan?.name}</p>}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Comprobante de transferencia (obligatorio) */}
        {paymentMethod === 'transfer' && (
          <div className="rounded-xl border border-dashed border-info/40 bg-info/5 p-4 space-y-3">
            <div>
              <p className="font-semibold font-heading text-foreground">Sube tu comprobante</p>
              <p className="text-sm text-muted-foreground font-body">
                Adjunta una foto o captura de tu transferencia. Es obligatorio para validar tu pago.
              </p>
            </div>

            {receiptDataUrl ? (
              <div className="flex items-center gap-3">
                <img
                  src={receiptDataUrl}
                  alt="Comprobante"
                  className="h-20 w-20 rounded-lg object-cover ring-1 ring-border"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {receiptName || 'Comprobante'}
                  </p>
                  <p className="text-xs font-semibold text-success">Listo para enviar</p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={clearReceipt}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-info/40 bg-card px-4 py-6 text-sm font-semibold text-info transition-colors hover:bg-info/10">
                {readingReceipt ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Procesando imagen…
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Elegir imagen del comprobante
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={readingReceipt}
                  onChange={(e) => {
                    handleReceiptFile(e.target.files?.[0] ?? null);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
          </div>
        )}

        <Button
          onClick={handlePaymentSubmit}
          disabled={isProcessing || readingReceipt || (paymentMethod === 'transfer' && !receiptDataUrl)}
          className="w-full"
          size="lg"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Procesando...
            </>
          ) : paymentMethod === 'card' ? (
            'Pagar Ahora'
          ) : (
            'Ya realicé el pago'
          )}
        </Button>
      </div>
    );
  }

  // Paso 3: Procesamiento (solo para transferencia)
  if (step === 'processing' && paymentMethod === 'transfer') {
    return (
      <div className="max-w-lg mx-auto text-center space-y-6 py-12">
        <div className="w-16 h-16 bg-warning/10 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8 text-warning" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-heading font-bold">Pago en revisión</h2>
          <p className="text-muted-foreground font-body">
            Tu pago está en proceso de verificación
          </p>
        </div>

        <Alert className="text-left">
          <AlertDescription className="font-body">
            <p className="font-semibold mb-2">¿Qué sigue?</p>
            <ul className="space-y-1 text-sm">
              <li>• Nuestro equipo verificará tu transferencia</li>
              <li>• Tus créditos se activarán en 1-2 horas hábiles</li>
              <li>• Recibirás una confirmación por email</li>
              <li>• Podrás reservar clases una vez activados los créditos</li>
            </ul>
          </AlertDescription>
        </Alert>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => navigate('/')}
            className="flex-1"
          >
            Volver al inicio
          </Button>
          <Button
            onClick={() => navigate('/app/my-bookings')}
            className="flex-1"
          >
            Ver mis reservas
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
