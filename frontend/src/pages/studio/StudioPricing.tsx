import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import StudioLayout from '@/components/layout/StudioLayout';
import { Skeleton } from '@/components/ui/skeleton';
import api from '@/lib/api';
import type { Plan } from '@/types/auth';
import { useParams, Link } from 'react-router-dom';
import { getStudioBySlug } from '@/data/studios';

export default function StudioPricing() {
  const { studioSlug } = useParams();
  const studio = getStudioBySlug(studioSlug);
  const basePath = `/${studio.slug}`;

  const { data, isLoading } = useQuery<Plan[]>({
    queryKey: ['public-plans'],
    queryFn: async () => (await api.get('/plans')).data,
  });

  // Separate welcome offer from other plans
  const welcomeOffer = data?.find(plan => plan.name === 'Sesión Prueba');
  const plans = data?.filter(plan => plan.name !== 'Sesión Prueba') || [];

  return (
    <StudioLayout>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600&family=DM+Sans:wght@400;500;600&display=swap');
      `}</style>

      <section className="min-h-screen bg-[#E8E4DD] py-16 lg:py-20">
        <div className="container mx-auto px-4 lg:px-8 space-y-16">

          {/* Welcome Offer Banner */}
          {welcomeOffer && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-4xl mx-auto bg-gradient-to-r from-[#6B5B4F] to-[#8B7B6F] text-white p-8 md:p-12 rounded-lg shadow-xl"
            >
              <div className="text-center">
                <p className="text-xs uppercase tracking-[0.3em] mb-3 text-white/80" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {welcomeOffer.description}
                </p>
                <h2 className="text-3xl md:text-4xl font-light mb-4" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                  {welcomeOffer.name} por solo ${Number(welcomeOffer.price).toLocaleString('es-MX', { minimumFractionDigits: 0 })}
                </h2>
                <p className="text-lg mb-8 text-white/90" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  Prueba el método sin compromiso
                </p>
                <Link
                  to={`${basePath}/buy/${welcomeOffer.id}`}
                  className="inline-block px-8 py-4 bg-white text-[#6B5B4F] font-semibold uppercase tracking-wider hover:bg-[#F6F1E2] transition-colors"
                  style={{ fontFamily: "'DM Sans', sans-serif" }}
                >
                  Activar Oferta
                </Link>
              </div>
            </motion.div>
          )}

          {/* Plans Grid */}
          <div className="grid-fluid gap-8 max-w-[1400px] mx-auto" style={{ '--min-col-size': '280px' } as React.CSSProperties}>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-96 w-full bg-white/50" />
              ))
            ) : plans.length === 0 ? (
              <div className="col-span-full text-center text-[#9A9A9A] py-20">
                No hay planes disponibles por el momento.
              </div>
            ) : (
              plans.map((plan, index) => {
                const features = Array.isArray(plan.features) ? plan.features : [];
                // Match database names "Clases Ilimitadas" or "8 Clases Mensuales" for popular
                const isPopular = plan.name.toLowerCase().includes('ilimitadas') || plan.name.startsWith('8 ');

                // BMB usa reformer_credits + multi_credits (no class_limit).
                const totalCreds = (plan.reformer_credits ?? 0) + (plan.multi_credits ?? 0);
                const pricePerClass = totalCreds > 0 && Number(plan.price) > 0
                  ? `$${Math.round(Number(plan.price) / totalCreds)}/clase`
                  : '';
                const isUnlimited = plan.reformer_credits === null && plan.multi_credits === null;

                return (
                  <motion.div
                    key={plan.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className={`relative bg-white p-8 border-2 transition-all duration-300 ${isPopular
                      ? 'border-[#6B5B4F] shadow-lg scale-105'
                      : 'border-transparent hover:border-[#E8E4DD] hover:shadow-md'
                      }`}
                  >
                    {/* Popular Badge */}
                    {isPopular && (
                      <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                        <span className="bg-[#6B5B4F] text-white px-4 py-1 text-xs uppercase tracking-wider" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                          Más Popular
                        </span>
                      </div>
                    )}

                    {/* Plan Category */}
                    <p className="text-xs text-[#9A9A9A] uppercase tracking-wider mb-2" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                      {plan.duration_days} días
                    </p>

                    {/* Plan Name */}
                    <h3 className="text-xl font-semibold text-[#2A2A2A] mb-4 min-h-[56px]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                      {plan.name}
                    </h3>

                    {/* Price */}
                    <div className="mb-2">
                      <span className="text-4xl font-bold text-[#2A2A2A]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                        ${Number(plan.price).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </span>
                      {isUnlimited && (
                        <span className="text-sm text-[#7A7A7A] ml-1" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                          /mensual
                        </span>
                      )}
                    </div>

                    {/* Price per class */}
                    <div className="h-6 mb-6">
                      {pricePerClass && (
                        <p className="text-sm text-[#7A7A7A]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                          {pricePerClass}
                        </p>
                      )}
                      {!pricePerClass && isUnlimited && (
                        <p className="text-sm text-[#7A7A7A]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                          Clases ilimitadas
                        </p>
                      )}
                    </div>

                    {/* Features - if features is object/string, try to parse or show default */}
                    <ul className="space-y-3 mb-8 min-h-[80px]">
                      {(features.length > 0 ? features : [plan.description]).map((feature, idx) => (
                        <li
                          key={idx}
                          className="flex items-start text-sm text-[#5A5A5A]"
                          style={{ fontFamily: "'DM Sans', sans-serif" }}
                        >
                          <svg className="w-5 h-5 text-[#6B5B4F] mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          <span>{typeof feature === 'string' ? feature : 'Acceso a clases'}</span>
                        </li>
                      ))}
                    </ul>

                    {/* CTA Button */}
                    <Link
                      to={`${basePath}/buy/${plan.id}`}
                      className={`block w-full py-3 px-6 text-center text-sm font-semibold uppercase tracking-wider transition-colors ${isPopular
                        ? 'bg-[#6B5B4F] text-white hover:bg-[#5A4A3F]'
                        : plan.name.toLowerCase().includes('suelta')
                          ? 'bg-white border-2 border-[#5A5A5A] text-[#5A5A5A] hover:bg-[#F6F1E2]'
                          : 'bg-[#5A5A5A] text-white hover:bg-[#2A2A2A]'
                        }`}
                      style={{ fontFamily: "'DM Sans', sans-serif" }}
                    >
                      {plan.name.toLowerCase().includes('suelta') ? 'Reservar Clase' : 'Comprar Pack'}
                    </Link>
                  </motion.div>
                );
              })
            )}
          </div>

          {/* Footer Note */}
          <div className="text-center">
            <p className="text-sm text-[#7A7A7A]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              Todos los precios en MXN. Pago seguro con tarjeta de crédito, débito o transferencia. Facturación disponible.
            </p>
          </div>
        </div>
      </section>
    </StudioLayout>
  );
}
