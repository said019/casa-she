import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronRight } from "lucide-react";

// Aviso de privacidad corto y legible. Se prefiere lenguaje llano sobre el
// clásico texto legal largo: la clienta lo lee desde el celular al registrarse.
const sections = [
  { id: "responsable", title: "Quién cuida tus datos" },
  { id: "datos", title: "Qué guardamos" },
  { id: "uso", title: "Para qué lo usamos" },
  { id: "compartir", title: "Con quién se comparte" },
  { id: "derechos", title: "Tus derechos" },
  { id: "cambios", title: "Cambios" },
];

export default function Privacy() {
  const [activeSection, setActiveSection] = useState("responsable");

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
                Escríbenos y con gusto te explicamos
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
            <div className="bg-background rounded-lg border p-8 lg:p-12 space-y-10">
              {/* Header */}
              <div className="space-y-4 pb-8 border-b">
                <h1 className="font-heading text-4xl font-bold">Aviso de privacidad</h1>
                <p className="text-muted-foreground">
                  En corto: usamos tus datos para darte servicio en el estudio, nada más.
                  No los vendemos ni los compartimos con quien no haga falta.
                </p>
                <p className="text-sm text-muted-foreground">
                  Última actualización: 26 de julio de 2026
                </p>
              </div>

              <section id="responsable" className="space-y-3">
                <h2 className="font-heading text-2xl font-semibold">Quién cuida tus datos</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Casa Shé, con domicilio en Alfonso Reyes 131, Condesa, Ciudad de México, es
                  responsable del uso y la protección de tus datos personales. Para cualquier
                  tema de privacidad puedes escribirnos a{" "}
                  <a href="mailto:casashecondesa@gmail.com" className="text-primary hover:underline">
                    casashecondesa@gmail.com
                  </a>.
                </p>
              </section>

              <section id="datos" className="space-y-3">
                <h2 className="font-heading text-2xl font-semibold">Qué guardamos</h2>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                  <li>Tu nombre, correo y teléfono. Foto de perfil, si tú la subes.</li>
                  <li>Tus reservas, asistencias, membresías, créditos y pagos.</li>
                  <li>
                    Lo que nos cuentes sobre tu salud (una lesión, un embarazo, algo a cuidar en
                    clase). Son datos sensibles: solo los guardamos si tú decides compartirlos, y
                    únicamente para cuidarte durante la práctica.
                  </li>
                </ul>
                <p className="text-muted-foreground leading-relaxed">
                  En tu navegador guardamos lo mínimo para mantener tu sesión abierta. No usamos
                  cookies de publicidad ni rastreamos tu navegación fuera de este sitio.
                </p>
              </section>

              <section id="uso" className="space-y-3">
                <h2 className="font-heading text-2xl font-semibold">Para qué lo usamos</h2>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                  <li>Reservar tus clases y llevar la cuenta de tus créditos y membresías.</li>
                  <li>Cobrarte y emitir tus comprobantes.</li>
                  <li>Avisarte de tus reservas y de lo que pase con tu cuenta.</li>
                  <li>Cuidarte en clase, si nos compartiste algo de salud.</li>
                  <li>
                    Mandarte promociones y novedades, solo si lo aceptaste al registrarte. Puedes
                    decirnos que ya no en cualquier momento.
                  </li>
                </ul>
              </section>

              <section id="compartir" className="space-y-3">
                <h2 className="font-heading text-2xl font-semibold">Con quién se comparte</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Con nadie que no sea necesario para darte el servicio, y nunca para venderlo:
                </p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                  <li>
                    Nuestros procesadores de pago (Mercado Pago y Stripe), que reciben lo
                    indispensable para cobrar. Tus datos de tarjeta los maneja el procesador,
                    nosotros no los guardamos.
                  </li>
                  <li>
                    Plataformas de beneficios como TotalPass, cuando reservas una clase a través
                    de ellas. En ese caso intercambiamos lo necesario para confirmar tu lugar y
                    tu asistencia.
                  </li>
                  <li>
                    Los servicios con los que te enviamos correos y mensajes de WhatsApp.
                  </li>
                  <li>
                    Autoridades, si la ley nos lo exige.
                  </li>
                </ul>
              </section>

              <section id="derechos" className="space-y-3">
                <h2 className="font-heading text-2xl font-semibold">Tus derechos</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Puedes pedirnos acceder a tus datos, corregirlos, cancelarlos u oponerte a que
                  los usemos (derechos ARCO), además de retirar tu consentimiento cuando quieras.
                  Escríbenos a{" "}
                  <a href="mailto:casashecondesa@gmail.com" className="text-primary hover:underline">
                    casashecondesa@gmail.com
                  </a>{" "}
                  desde el correo de tu cuenta y te respondemos dentro de los plazos que marca la
                  ley.
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  Ten en cuenta que hay información que debemos conservar por obligaciones
                  fiscales o contables, aunque cierres tu cuenta.
                </p>
              </section>

              <section id="cambios" className="space-y-3">
                <h2 className="font-heading text-2xl font-semibold">Cambios</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Si cambiamos este aviso, publicamos aquí la versión nueva con su fecha. Si el
                  cambio es importante, te lo avisamos por correo.
                </p>
              </section>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
