import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronRight } from "lucide-react";

const sections = [
  { id: "intro", title: "Introducción" },
  { id: "info-recopilada", title: "Información que Recopilamos" },
  { id: "uso-info", title: "Uso de la Información" },
  { id: "proteccion", title: "Protección de Datos" },
  { id: "cookies", title: "Cookies y Tecnologías" },
  { id: "compartir", title: "Compartir Información" },
  { id: "derechos", title: "Tus Derechos" },
  { id: "menores", title: "Privacidad de Menores" },
  { id: "cambios", title: "Cambios a esta Política" },
  { id: "contacto", title: "Contacto" },
];

export default function Privacy() {
  const [activeSection, setActiveSection] = useState("intro");

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 100;

      for (const section of sections) {
        const element = document.getElementById(section.id);
        if (element) {
          const { offsetTop, offsetHeight } = element;
          if (scrollPosition >= offsetTop && scrollPosition < offsetTop + offsetHeight) {
            setActiveSection(section.id);
            break;
          }
        }
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 80;
      const elementPosition = element.getBoundingClientRect().top + window.pageYOffset;
      window.scrollTo({
        top: elementPosition - offset,
        behavior: "smooth",
      });
    }
  };

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b pt-[env(safe-area-inset-top)]">
        <div className="container mx-auto px-4 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver al inicio
            </Link>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 lg:px-8 py-12">
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
          {/* Sidebar Navigation */}
          <aside className="lg:sticky lg:top-24 lg:w-64 flex-shrink-0 h-fit">
            <nav className="space-y-1 bg-background rounded-lg border p-4">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                Contenido
              </h2>
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={`
                    w-full text-left px-3 py-2 rounded-md text-sm transition-all
                    flex items-center justify-between group
                    ${
                      activeSection === section.id
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }
                  `}
                >
                  <span>{section.title}</span>
                  <ChevronRight
                    className={`w-4 h-4 transition-transform ${
                      activeSection === section.id ? "translate-x-1" : "opacity-0 group-hover:opacity-100"
                    }`}
                  />
                </button>
              ))}
            </nav>

            {/* Contact Card */}
            <div className="mt-6 p-4 bg-primary/5 rounded-lg border border-primary/20">
              <h3 className="text-sm font-semibold mb-2">¿Tienes dudas?</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Contáctanos para cualquier pregunta sobre privacidad
              </p>
              <a
                href="mailto:casashecondesa@gmail.com"
                className="text-xs text-primary hover:underline"
              >
                casashecondesa@gmail.com
              </a>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 max-w-3xl">
            <div className="bg-background rounded-lg border p-8 lg:p-12 space-y-12">
              {/* Header */}
              <div className="space-y-4 pb-8 border-b">
                <h1 className="font-heading text-4xl font-bold">Política de Privacidad</h1>
                <p className="text-muted-foreground">
                  Última actualización: 10 de enero de 2026
                </p>
              </div>

              {/* Sections */}
              <section id="intro" className="space-y-4">
                <h2 className="font-heading text-2xl font-semibold">Introducción</h2>
                <p className="text-muted-foreground leading-relaxed">
                  En Casa Shé, nos comprometemos a proteger tu privacidad y datos personales. 
                  Esta Política de Privacidad describe cómo recopilamos, usamos, compartimos y protegemos 
                  tu información cuando utilizas nuestros servicios de Pilates y fitness.
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  Al utilizar nuestros servicios, aceptas las prácticas descritas en esta política.
                </p>
              </section>

              <section id="info-recopilada" className="space-y-4">
                <h2 className="font-heading text-2xl font-semibold">Información que Recopilamos</h2>
                
                <div className="space-y-3">
                  <h3 className="font-medium text-lg">Información de Cuenta</h3>
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                    <li>Nombre completo</li>
                    <li>Correo electrónico</li>
                    <li>Número de teléfono</li>
                    <li>Fotografía de perfil (opcional)</li>
                    <li>Fecha de nacimiento</li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <h3 className="font-medium text-lg">Información de Salud</h3>
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                    <li>Condiciones médicas relevantes</li>
                    <li>Lesiones previas</li>
                    <li>Contacto de emergencia</li>
                    <li>Notas de salud proporcionadas voluntariamente</li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <h3 className="font-medium text-lg">Información de Uso</h3>
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                    <li>Reservas de clases</li>
                    <li>Historial de asistencia</li>
                    <li>Membresías y pagos</li>
                    <li>Preferencias de comunicación</li>
                  </ul>
                </div>
              </section>

              <section id="uso-info" className="space-y-4">
                <h2 className="font-heading text-2xl font-semibold">Uso de la Información</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Utilizamos tu información para:
                </p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                  <li>Gestionar tu cuenta y reservas de clases</li>
                  <li>Procesar pagos y membresías</li>
                  <li>Comunicar cambios en horarios o servicios</li>
                  <li>Mejorar nuestros servicios y experiencia de usuario</li>
                  <li>Enviar promociones y ofertas (con tu consentimiento)</li>
                  <li>Garantizar la seguridad de nuestras instalaciones</li>
                  <li>Cumplir con obligaciones legales</li>
                </ul>
              </section>

              <section id="proteccion" className="space-y-4">
                <h2 className="font-heading text-2xl font-semibold">Protección de Datos</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Implementamos medidas de seguridad técnicas y organizativas para proteger tu información:
                </p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                  <li>Cifrado SSL/TLS para transmisión de datos</li>
                  <li>Contraseñas encriptadas con bcrypt</li>
                  <li>Acceso restringido a datos personales</li>
                  <li>Servidores seguros con certificaciones</li>
                  <li>Auditorías de seguridad regulares</li>
                  <li>Capacitación de personal en protección de datos</li>
                </ul>
              </section>

              <section id="cookies" className="space-y-4">
                <h2 className="font-heading text-2xl font-semibold">Cookies y Tecnologías Similares</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Utilizamos cookies y tecnologías similares para:
                </p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                  <li>Mantener tu sesión activa</li>
                  <li>Recordar tus preferencias</li>
                  <li>Analizar el uso de nuestro sitio web</li>
                  <li>Mejorar la experiencia de usuario</li>
                </ul>
                <p className="text-muted-foreground leading-relaxed mt-4">
                  Puedes configurar tu navegador para rechazar cookies, pero esto puede afectar 
                  la funcionalidad del sitio.
                </p>
              </section>

              <section id="compartir" className="space-y-4">
                <h2 className="font-heading text-2xl font-semibold">Compartir Información</h2>
                <p className="text-muted-foreground leading-relaxed">
                  No vendemos ni alquilamos tu información personal. Solo compartimos datos con:
                </p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                  <li><strong>Proveedores de servicios:</strong> procesamiento de pagos, hosting, email</li>
                  <li><strong>Autoridades legales:</strong> cuando sea requerido por ley</li>
                  <li><strong>Instructores:</strong> solo información necesaria para clases (nombre, notas de salud relevantes)</li>
                </ul>
              </section>

              <section id="derechos" className="space-y-4">
                <h2 className="font-heading text-2xl font-semibold">Tus Derechos</h2>
                <p className="text-muted-foreground leading-relaxed">
                  De acuerdo con la Ley Federal de Protección de Datos Personales en Posesión de 
                  Particulares (LFPDPPP), tienes derecho a:
                </p>
                <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                  <p className="font-medium">Derechos ARCO:</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-4">
                    <li><strong>Acceder</strong> a tus datos personales</li>
                    <li><strong>Rectificar</strong> datos incorrectos</li>
                    <li><strong>Cancelar</strong> tu cuenta y datos</li>
                    <li><strong>Oponerte</strong> al tratamiento de datos</li>
                  </ul>
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  Para ejercer estos derechos, contáctanos en{" "}
                  <a href="mailto:casashecondesa@gmail.com" className="text-primary hover:underline">
                    casashecondesa@gmail.com
                  </a>
                </p>
              </section>

              <section id="menores" className="space-y-4">
                <h2 className="font-heading text-2xl font-semibold">Privacidad de Menores</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Nuestros servicios están dirigidos a personas mayores de 18 años. Si eres menor de edad, 
                  requieres el consentimiento de un padre o tutor para usar nuestros servicios.
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  Si descubrimos que hemos recopilado información de menores sin consentimiento, 
                  eliminaremos dicha información inmediatamente.
                </p>
              </section>

              <section id="cambios" className="space-y-4">
                <h2 className="font-heading text-2xl font-semibold">Cambios a esta Política</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Podemos actualizar esta Política de Privacidad periódicamente. Te notificaremos sobre 
                  cambios significativos mediante:
                </p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                  <li>Correo electrónico</li>
                  <li>Aviso en nuestro sitio web</li>
                  <li>Notificación en la aplicación</li>
                </ul>
                <p className="text-muted-foreground leading-relaxed mt-4">
                  Te recomendamos revisar esta política periódicamente.
                </p>
              </section>

              <section id="contacto" className="space-y-4">
                <h2 className="font-heading text-2xl font-semibold">Contacto</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Si tienes preguntas sobre esta Política de Privacidad o el tratamiento de tus datos, 
                  contáctanos:
                </p>
                <div className="bg-muted/50 p-6 rounded-lg space-y-3">
                  <div>
                    <p className="text-sm font-medium">Casa Shé</p>
                    <p className="text-sm text-muted-foreground">Alfonso Reyes 131 · Condesa, CDMX</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Email</p>
                    <a
                      href="mailto:casashecondesa@gmail.com"
                      className="text-sm text-primary hover:underline"
                    >
                      casashecondesa@gmail.com
                    </a>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Teléfono</p>
                    <a href="tel:+525512345678" className="text-sm text-primary hover:underline">
                      +52 55 1234 5678
                    </a>
                  </div>
                </div>
              </section>

              {/* Footer */}
              <div className="pt-8 border-t">
                <p className="text-xs text-muted-foreground">
                  Esta Política de Privacidad cumple con la Ley Federal de Protección de Datos Personales 
                  en Posesión de Particulares (LFPDPPP) de México y el Reglamento General de Protección 
                  de Datos (RGPD) de la Unión Europea.
                </p>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
