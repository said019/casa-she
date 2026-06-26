import { Link, useParams } from 'react-router-dom';
import { MapPin, Sparkles, Clock, ArrowRight } from 'lucide-react';
import StudioLayout from '@/components/layout/StudioLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getStudioBySlug } from '@/data/studios';
import WalletClub from '@/components/WalletClub';
import Testimonials from '@/components/Testimonials';

export default function StudioHome() {
  const { studioSlug } = useParams();
  const studio = getStudioBySlug(studioSlug);
  const basePath = `/${studio.slug}`;

  return (
    <StudioLayout>
      <section className="relative min-h-[70vh] flex items-center justify-center overflow-hidden bg-bmb-dark">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(184,153,104,.20)_0%,rgba(42,33,24,1)_65%)]" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/20 to-background/80" />
        </div>

        <div className="relative z-10 container mx-auto px-4 lg:px-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-background/80 backdrop-blur-sm rounded-full mb-8">
              <span className="w-2 h-2 bg-secondary rounded-full animate-pulse" />
              <span className="text-sm font-body text-foreground/80 tracking-wide">
                Membresía Studio
              </span>
            </div>

            <h1 className="font-heading text-4xl md:text-6xl font-light text-foreground leading-tight mb-6">
              {studio.name}
              <br />
              <span className="font-semibold italic">{studio.tagline}</span>
            </h1>

            <p className="font-body text-lg text-foreground/70 mb-10">
              {studio.description}
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-4">
              <Button variant="hero" size="xl" asChild>
                <Link to={`${basePath}/schedule`}>Ver horarios</Link>
              </Button>
              <Button variant="heroOutline" size="xl" asChild>
                <Link to={`${basePath}/pricing`}>Ver planes</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-20 bg-background">
        <div className="container mx-auto px-4 lg:px-8 grid gap-6 lg:grid-cols-3">
          <Card className="border-border/60">
            <CardContent className="p-6 space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                Ubicación
              </div>
              <p className="font-heading text-lg">{studio.addressLine}</p>
              <p className="text-sm text-muted-foreground">
                {studio.city}, {studio.state}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="p-6 space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                Horarios
              </div>
              <p className="font-heading text-lg">{studio.businessHours[0]?.hours}</p>
              <p className="text-sm text-muted-foreground">{studio.businessHours[0]?.label}</p>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="p-6 space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4" />
                Experiencia
              </div>
              <p className="font-heading text-lg">Check-in con Membresía</p>
              <p className="text-sm text-muted-foreground">
                Membresías digitales y puntos de lealtad.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="py-16 lg:py-20 bg-muted/40">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <span className="text-sm font-body text-secondary tracking-widest uppercase mb-2 block">
                Explora
              </span>
              <h2 className="font-heading text-3xl md:text-4xl font-light text-foreground">
                Conoce el estudio
              </h2>
            </div>
            <Button variant="ghost" asChild className="hidden md:inline-flex">
              <Link to={`${basePath}/pricing`}>
                Comprar ahora <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Tipos de clase', path: '/classes' },
              { label: 'Horario semanal', path: '/schedule' },
              { label: 'Instructores', path: '/instructors' },
              { label: 'Planes', path: '/pricing' },
            ].map((item) => (
              <Link
                key={item.label}
                to={`${basePath}${item.path}`}
                className="group rounded-xl border bg-background p-6 transition-all hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg"
              >
                <p className="font-heading text-lg">{item.label}</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Ver detalles y reservar con tu membresía.
                </p>
                <span className="text-sm text-primary mt-4 inline-flex items-center gap-2 group-hover:gap-3 transition-all">
                  Abrir <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <Testimonials />
    </StudioLayout>
  );
}
