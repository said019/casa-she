import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

const sections = [
    { id: "intro", title: "Introducción" },
    { id: "servicios", title: "Servicios" },
    { id: "reservas", title: "Reservas y Cancelaciones" },
    { id: "pagos", title: "Pagos y Membresías" },
    { id: "comportamiento", title: "Código de Conducta" },
    { id: "responsabilidad", title: "Limitación de Responsabilidad" },
    { id: "cambios", title: "Modificaciones" },
    { id: "contacto", title: "Contacto" },
];

export default function Terms() {
    const [activeSection, setActiveSection] = useState("intro");
    const { data: policy } = useQuery<{ min_hours?: number }>({
        queryKey: ['cancellation-policy'],
        queryFn: async () => (await api.get('/settings/cancellation-policy')).data,
    });
    const minHours = Number(policy?.min_hours ?? 12);

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
                    ${activeSection === section.id
                                            ? "bg-primary/10 text-primary font-medium"
                                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                        }
                  `}
                                >
                                    <span>{section.title}</span>
                                    <ChevronRight
                                        className={`w-4 h-4 transition-transform ${activeSection === section.id ? "translate-x-1" : "opacity-0 group-hover:opacity-100"
                                            }`}
                                    />
                                </button>
                            ))}
                        </nav>

                        {/* Contact Card */}
                        <div className="mt-6 p-4 bg-primary/5 rounded-lg border border-primary/20">
                            <h3 className="text-sm font-semibold mb-2">¿Tienes dudas?</h3>
                            <p className="text-xs text-muted-foreground mb-3">
                                Contáctanos para cualquier pregunta sobre nuestros términos.
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
                                <h1 className="font-heading text-4xl font-bold">Términos y Condiciones</h1>
                                <p className="text-muted-foreground">
                                    Última actualización: 24 de enero de 2026
                                </p>
                            </div>

                            {/* Sections */}
                            <section id="intro" className="space-y-4">
                                <h2 className="font-heading text-2xl font-semibold">Introducción</h2>
                                <p className="text-muted-foreground leading-relaxed">
                                    Bienvenido a Casa Shé. Al acceder a nuestras instalaciones, utilizar nuestros servicios
                                    o reservar clases a través de nuestra plataforma, aceptas estar legalmente vinculado por estos
                                    Términos y Condiciones.
                                </p>
                                <p className="text-muted-foreground leading-relaxed">
                                    Te recomendamos leer detenidamente este documento antes de utilizar nuestros servicios.
                                </p>
                            </section>

                            <section id="servicios" className="space-y-4">
                                <h2 className="font-heading text-2xl font-semibold">Servicios</h2>
                                <p className="text-muted-foreground leading-relaxed">
                                    Casa Shé ofrece clases de entrenamiento físico (incluyendo pero no limitado a Pilates Mat,
                                    Barre, Sculpt, Yoga y Salsa), talleres y eventos relacionados con el bienestar.
                                </p>
                                <p className="text-muted-foreground leading-relaxed">
                                    Nos reservamos el derecho de modificar horarios, instructores y tipos de clase según sea necesario
                                    para la operación del estudio.
                                </p>
                            </section>

                            <section id="reservas" className="space-y-4">
                                <h2 className="font-heading text-2xl font-semibold">Reservas y Cancelaciones</h2>

                                <div className="space-y-3">
                                    <h3 className="font-medium text-lg">Política de Reserva</h3>
                                    <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                                        <li>Las reservas deben realizarse a través de nuestra plataforma digital.</li>
                                        <li>Sujeto a disponibilidad de cupo en la clase.</li>
                                        <li>Se requiere check-in 5 minutos antes del inicio de la clase.</li>
                                    </ul>
                                </div>

                                <div className="space-y-3">
                                    <h3 className="font-medium text-lg">Política de Cancelación</h3>
                                    <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                                        <li>Cancelaciones con más de {minHours} {minHours === 1 ? 'hora' : 'horas'} de antelación no generan cargo.</li>
                                        <li>Cancelaciones tardías (menos de {minHours} {minHours === 1 ? 'hora' : 'horas'}) resultarán en la pérdida de la clase o un cargo por "late cancel".</li>
                                        <li>La inasistencia sin cancelación ("no-show") resultará en la pérdida de la clase y posibles penalizaciones.</li>
                                    </ul>
                                </div>
                            </section>

                            <section id="pagos" className="space-y-4">
                                <h2 className="font-heading text-2xl font-semibold">Pagos y Membresías</h2>
                                <p className="text-muted-foreground leading-relaxed">
                                    Todos los pagos deben realizarse por adelantado. Aceptamos tarjetas de crédito, débito y transferencias
                                    bancarias autorizadas.
                                </p>
                                <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                                    <li>Los paquetes de clases tienen una fecha de expiración específica.</li>
                                    <li>Las membresías son personales e intransferibles.</li>
                                    <li>No se realizan reembolsos por clases no utilizadas o membresías canceladas anticipadamente, salvo causas de fuerza mayor comprobables.</li>
                                </ul>
                            </section>

                            <section id="comportamiento" className="space-y-4">
                                <h2 className="font-heading text-2xl font-semibold">Código de Conducta</h2>
                                <p className="text-muted-foreground leading-relaxed">
                                    Para mantener un ambiente seguro y agradable para todos, requerimos que los usuarios:
                                </p>
                                <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                                    <li>Respeten a los instructores y demás asistentes.</li>
                                    <li>Utilicen ropa deportiva adecuada y calcetines antideslizantes.</li>
                                    <li>Lleguen puntuales. No se permitirá el acceso una vez iniciada la clase por seguridad.</li>
                                    <li>Sigan las instrucciones de seguridad del personal.</li>
                                </ul>
                            </section>

                            <section id="responsabilidad" className="space-y-4">
                                <h2 className="font-heading text-2xl font-semibold">Limitación de Responsabilidad</h2>
                                <p className="text-muted-foreground leading-relaxed">
                                    El usuario reconoce que la práctica de ejercicio físico conlleva riesgos inherentes. Casa Shé
                                    no se hace responsable por lesiones sufridas durante las clases, excepto en casos de negligencia
                                    directa del estudio.
                                </p>
                                <p className="text-muted-foreground leading-relaxed">
                                    El usuario certifica que está en condiciones físicas aptas para participar en las actividades
                                    y asume la responsabilidad de informar sobre cualquier condición médica al instructor.
                                </p>
                            </section>

                            <section id="cambios" className="space-y-4">
                                <h2 className="font-heading text-2xl font-semibold">Modificaciones</h2>
                                <p className="text-muted-foreground leading-relaxed">
                                    Casa Shé se reserva el derecho de modificar estos términos y condiciones en cualquier momento.
                                    Las modificaciones entrarán en vigor inmediatamente después de su publicación en el sitio web.
                                </p>
                            </section>

                            <section id="contacto" className="space-y-4">
                                <h2 className="font-heading text-2xl font-semibold">Contacto</h2>
                                <p className="text-muted-foreground leading-relaxed">
                                    Para consultas legales o dudas sobre estos términos:
                                </p>
                                <div className="bg-muted/50 p-6 rounded-lg space-y-3">
                                    <div>
                                        <p className="text-sm font-medium">Casa Shé</p>
                                        <p className="text-sm text-muted-foreground">Departamento Legal</p>
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
                                </div>
                            </section>

                            {/* Footer */}
                            <div className="pt-8 border-t">
                                <p className="text-xs text-muted-foreground">
                                    Al utilizar nuestros servicios, confirmas que has leído y entendido estos términos.
                                </p>
                            </div>
                        </div>
                    </main>
                </div>
            </div>
        </div>
    );
}
