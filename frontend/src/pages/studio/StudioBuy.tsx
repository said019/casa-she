import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, CreditCard, Landmark, MessageCircle } from 'lucide-react';
import StudioLayout from '@/components/layout/StudioLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import api, { getErrorMessage } from '@/lib/api';
import { planClassLabel } from '@/lib/credits';
import type { Plan } from '@/types/auth';
import { useAuthStore } from '@/stores/authStore';
import { Link, useParams } from 'react-router-dom';
import { getStudioBySlug } from '@/data/studios';

interface PurchaseResponse {
  membershipId: string;
  status: string;
}

export default function StudioBuy() {
  const { studioSlug, planId } = useParams();
  const studio = getStudioBySlug(studioSlug);
  const basePath = `/${studio.slug}`;
  const { isAuthenticated } = useAuthStore();
  const { toast } = useToast();

  const [paymentMethod, setPaymentMethod] = useState<'transfer' | 'cash'>('transfer');
  const [completed, setCompleted] = useState(false);

  const { data: plan, isLoading } = useQuery<Plan>({
    queryKey: ['plan', planId],
    queryFn: async () => (await api.get(`/plans/${planId}`)).data,
    enabled: Boolean(planId),
  });

  const planSummary = useMemo(() => {
    if (!plan) return '';
    return `${plan.name} • ${planClassLabel(plan)} • ${plan.duration_days} días`;
  }, [plan]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!planId) {
        throw new Error('Plan inválido');
      }
      const { data } = await api.post<PurchaseResponse>('/memberships', {
        planId,
        paymentMethod,
      });
      return data;
    },
    onSuccess: () => {
      setCompleted(true);
      toast({
        title: 'Solicitud registrada',
        description: 'Tu membresía quedó pendiente de pago.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'No pudimos procesar la compra',
        description: getErrorMessage(error),
      });
    },
  });

  return (
    <StudioLayout>
      <section className="py-16 lg:py-20 bg-background">
        <div className="container mx-auto px-4 lg:px-8 space-y-8">
          <div>
            <span className="text-sm font-body text-secondary tracking-widest uppercase mb-2 block">
              Comprar membresía
            </span>
            <h1 className="font-heading text-3xl md:text-5xl font-light text-foreground">
              Confirma tu plan
            </h1>
            <p className="font-body text-muted-foreground max-w-2xl mt-4">
              Selecciona el método de pago y recibe las instrucciones al instante.
            </p>
          </div>

          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !plan ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                No encontramos el plan seleccionado.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <Card>
                <CardContent className="p-6 space-y-5">
                  <div>
                    <p className="text-sm text-muted-foreground">Plan seleccionado</p>
                    <h2 className="font-heading text-2xl">{plan.name}</h2>
                    <p className="text-sm text-muted-foreground">{planSummary}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total</p>
                    <p className="font-heading text-3xl">
                      ${Number(plan.price).toLocaleString()} {plan.currency}
                    </p>
                  </div>

                  {!isAuthenticated ? (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Inicia sesión o crea una cuenta para continuar con la compra.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <Button className="w-full" asChild>
                          <Link to="/login">Iniciar sesión</Link>
                        </Button>
                        <Button variant="outline" className="w-full" asChild>
                          <Link to="/register">Crear cuenta</Link>
                        </Button>
                      </div>
                    </div>
                  ) : completed ? (
                    <div className="rounded-lg border border-success/30 bg-success/10 p-4 text-success">
                      <div className="flex items-center gap-2 font-medium">
                        <CheckCircle2 className="h-5 w-5" />
                        Membresía solicitada
                      </div>
                      <p className="text-sm mt-2">
                        Estamos esperando tu pago. Al confirmarlo, activaremos tu pase de Membresía.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-medium mb-2">Método de pago</p>
                        <RadioGroup
                          value={paymentMethod}
                          onValueChange={(value) => setPaymentMethod(value as 'transfer' | 'cash')}
                          className="space-y-2"
                        >
                          <label className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer">
                            <RadioGroupItem value="transfer" />
                            <Landmark className="h-5 w-5 text-muted-foreground" />
                            Transferencia bancaria
                          </label>
                          <label className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer">
                            <RadioGroupItem value="cash" />
                            <CreditCard className="h-5 w-5 text-muted-foreground" />
                            Pago en efectivo
                          </label>
                        </RadioGroup>
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => mutation.mutate()}
                        disabled={mutation.isPending}
                      >
                        {mutation.isPending ? 'Procesando...' : 'Solicitar membresía'}
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Tu solicitud aparecerá como pendiente en el panel del estudio.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6 space-y-4">
                  <h3 className="font-heading text-xl">Instrucciones de pago</h3>
                  {paymentMethod === 'transfer' ? (
                    <div className="space-y-3 text-sm text-muted-foreground">
                      <p>Realiza tu transferencia y envía el comprobante.</p>
                      <div className="rounded-lg border p-3 space-y-1">
                        <p><span className="font-medium text-foreground">Banco:</span> {studio.bank.name}</p>
                        <p><span className="font-medium text-foreground">Cuenta:</span> {studio.bank.account}</p>
                        <p><span className="font-medium text-foreground">CLABE:</span> {studio.bank.clabe}</p>
                        <p><span className="font-medium text-foreground">Beneficiario:</span> {studio.bank.beneficiary}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 text-sm text-muted-foreground">
                      <p>Paga en recepción y comparte tu comprobante.</p>
                      <p>Horario sugerido: {studio.businessHours[0]?.hours}</p>
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <Button variant="outline" className="w-full" asChild>
                      <a href={`https://wa.me/${studio.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">
                        <MessageCircle className="mr-2 h-4 w-4" />
                        Enviar comprobante
                      </a>
                    </Button>
                    <Button variant="ghost" className="w-full" asChild>
                      <a href={`mailto:${studio.email}`}>Enviar por email</a>
                    </Button>
                    <Button variant="ghost" className="w-full" asChild>
                      <Link to={`${basePath}/pricing`}>Cambiar plan</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </section>
    </StudioLayout>
  );
}
