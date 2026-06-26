import { motion } from 'framer-motion';
import { useParams } from 'react-router-dom';
import StudioLayout from '@/components/layout/StudioLayout';
import { getStudioBySlug } from '@/data/studios';

export default function StudioClasses() {
  const { studioSlug } = useParams();
  const studio = getStudioBySlug(studioSlug);

  return (
    <StudioLayout>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
      `}</style>

      <section className="py-16 lg:py-20 bg-[#E8E4DD]">
        <div className="container mx-auto px-4 lg:px-8 space-y-16">

          {/* Header */}
          <div className="text-center max-w-2xl mx-auto">
            <h1 className="text-3xl md:text-5xl font-light text-[#5A5A5A] mb-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              Clases diseñadas para cada objetivo
            </h1>
            <p className="text-sm text-[#7A7A7A]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              Barre, Pilates Mat, Hot Pilates y Sculpt conviven en un mismo espacio. Todas nuestras sesiones están limitadas a 6 personas para garantizar atención personalizada.
            </p>
          </div>

          {/* Hero Image Placeholder */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="max-w-6xl mx-auto"
          >
            <div className="aspect-[16/9] overflow-hidden rounded-lg">
              <img
                src="/studio/barre.webp"
                alt="Interior de BMB Studio — salón de clases"
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
          </motion.div>

          {/* Class Cards - Detailed */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-6xl mx-auto">
            {/* Barre */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-[#D4C5B9] p-6 rounded-lg"
            >
              <div className="mb-4">
                <svg className="w-10 h-10 text-[#5A5A5A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                </svg>
              </div>
              <span className="text-xs text-[#5A5A5A] uppercase tracking-wider block mb-1" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                Lunes, Miércoles y Viernes
              </span>
              <h3 className="text-xl font-semibold text-[#2A2A2A] mb-1" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                Barre
              </h3>
              <p className="text-xs italic text-[#8C8475] mb-3" style={{ fontFamily: "'DM Sans', sans-serif" }}>elegance in motion</p>
              <p className="text-sm text-[#5A5A5A] leading-relaxed" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                Combina lo mejor del ballet, pilates y ejercicios funcionales. Se realizan ejercicios isométricos y pulsos, cuidando siempre el equilibrio y la carga. Las series serán de repeticiones altas con cargas prolongadas, los movimientos más cortos y controlados para poder trabajar más a fondo los músculos. El objetivo principal es aislar grupos de músculos para llegar al punto de máxima tensión permitiendo tonificar, alargar y compactar todo el cuerpo. Es una práctica efectiva que se siente como un entrenamiento y una danza a la vez.
              </p>
            </motion.div>

            {/* Pilates Mat */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-[#C9D1C8] p-6 rounded-lg"
            >
              <div className="mb-4">
                <svg className="w-10 h-10 text-[#5A5A5A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </div>
              <span className="text-xs text-[#5A5A5A] uppercase tracking-wider block mb-1" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                Martes y Jueves
              </span>
              <h3 className="text-xl font-semibold text-[#2A2A2A] mb-1" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                Pilates Mat
              </h3>
              <p className="text-xs italic text-[#A2A88B] mb-3" style={{ fontFamily: "'DM Sans', sans-serif" }}>strength meets precision</p>
              <p className="text-sm text-[#5A5A5A] leading-relaxed" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                A diferencia del pilates reformer, la resistencia proviene principalmente del peso corporal, la gravedad y la contracción muscular. Es una práctica en el piso diseñada para fortalecer y tonificar tu cuerpo, especialmente los músculos más profundos del core (abdomen, espalda baja y pelvis) fundamentales para el movimiento. Combina elongación y contracción, buscando siempre la conexión mente-cuerpo y una ejecución lenta y controlada con esto mejoras tu flexibilidad, postura y equilibrio, mientras trabajas con precisión y concentración.
              </p>
            </motion.div>

            {/* Hot Pilates */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="bg-[#D5C9C1] p-6 rounded-lg"
            >
              <div className="mb-4">
                <svg className="w-10 h-10 text-[#5A5A5A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                </svg>
              </div>
              <span className="text-xs text-[#5A5A5A] uppercase tracking-wider block mb-1" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                Sábados
              </span>
              <h3 className="text-xl font-semibold text-[#2A2A2A] mb-1" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                Hot Pilates
              </h3>
              <p className="text-xs italic text-[#D4A574] mb-3" style={{ fontFamily: "'DM Sans', sans-serif" }}>energy unleashed</p>
              <p className="text-sm text-[#5A5A5A] leading-relaxed" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                Es una versión más dinámica y energizante del yoga tradicional. Con secuencias rápidas y posturas retadoras, yoga sculpt te hará sudar mientras te diviertes. Es ideal para aumentar tu fuerza, flexibilidad y concentración, además de brindarte un desafío emocionante que te hará sentirte lleno de energía.
              </p>
            </motion.div>

            {/* Sculpt */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="bg-[#D9D0C4] p-6 rounded-lg"
            >
              <div className="mb-4">
                <svg className="w-10 h-10 text-[#5A5A5A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" />
                </svg>
              </div>
              <span className="text-xs text-[#5A5A5A] uppercase tracking-wider block mb-1" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                Domingos
              </span>
              <h3 className="text-xl font-semibold text-[#2A2A2A] mb-1" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                Sculpt
              </h3>
              <p className="text-xs italic text-[#C6A77A] mb-3" style={{ fontFamily: "'DM Sans', sans-serif" }}>energy unleashed</p>
              <p className="text-sm text-[#5A5A5A] leading-relaxed" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                Es un entrenamiento de cuerpo completo (full body) o enfocado en grupos musculares específicos con movimientos controlados, sentadillas, planchas y ejercicios con resistencia para tonificar. Fusiona elementos de fuerza, entrenamiento funcional, pilates y a veces yoga o HIIT. Nuestras sesiones pueden incluir cardio ligero o intervalos para acelerar el metabolismo y la quema de grasa. Mejora la fuerza, potencia, resistencia, flexibilidad y quema calorías, ayudando a la definición muscular.
              </p>
            </motion.div>
          </div>
        </div>
      </section>
    </StudioLayout>
  );
}
