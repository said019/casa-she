import { useState } from 'react';
import { MapPin, Phone, Mail, MessageCircle } from 'lucide-react';
import StudioLayout from '@/components/layout/StudioLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { getStudioBySlug } from '@/data/studios';
import { useParams } from 'react-router-dom';

export default function StudioContact() {
  const { studioSlug } = useParams();
  const studio = getStudioBySlug(studioSlug);
  const { toast } = useToast();
  const [formState, setFormState] = useState({
    name: '',
    email: '',
    message: '',
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    toast({
      title: 'Mensaje enviado',
      description: 'Te contactaremos lo antes posible.',
    });
    setFormState({ name: '', email: '', message: '' });
  };

  return (
    <StudioLayout>
      <section className="py-16 lg:py-20 bg-background">
        <div className="container mx-auto px-4 lg:px-8 space-y-10">
          <div>
            <span className="text-sm font-body text-secondary tracking-widest uppercase mb-2 block">
              Contacto
            </span>
            <h1 className="font-heading text-3xl md:text-5xl font-light text-foreground">
              Hablemos
            </h1>
            <p className="font-body text-muted-foreground max-w-2xl mt-4">
              ¿Tienes dudas? Nuestro equipo está listo para ayudarte.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <Card>
              <CardContent className="p-6 space-y-5">
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-muted-foreground mt-1" />
                  <div>
                    <p className="font-medium">Dirección</p>
                    <p className="text-sm text-muted-foreground">
                      {studio.addressLine}, {studio.city}, {studio.state} {studio.postalCode}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="h-5 w-5 text-muted-foreground mt-1" />
                  <div>
                    <p className="font-medium">Teléfono</p>
                    <p className="text-sm text-muted-foreground">{studio.phone}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground mt-1" />
                  <div>
                    <p className="font-medium">Email</p>
                    <p className="text-sm text-muted-foreground">{studio.email}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MessageCircle className="h-5 w-5 text-muted-foreground mt-1" />
                  <div>
                    <p className="font-medium">WhatsApp</p>
                    <p className="text-sm text-muted-foreground">{studio.whatsapp}</p>
                  </div>
                </div>
                <div className="mt-6 space-y-2">
                  {studio.businessHours.map((entry) => (
                    <div key={entry.label} className="flex justify-between text-sm text-muted-foreground">
                      <span>{entry.label}</span>
                      <span>{entry.hours}</span>
                    </div>
                  ))}
                </div>
                <Button variant="outline" className="w-full" asChild>
                  <a href={studio.mapUrl} target="_blank" rel="noreferrer">
                    Ver en mapa
                  </a>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <form className="space-y-4" onSubmit={handleSubmit}>
                  <div>
                    <label className="text-sm font-medium">Nombre</label>
                    <Input
                      value={formState.name}
                      onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                      placeholder="Tu nombre"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Email</label>
                    <Input
                      type="email"
                      value={formState.email}
                      onChange={(event) => setFormState((prev) => ({ ...prev, email: event.target.value }))}
                      placeholder="tu@email.com"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Mensaje</label>
                    <Textarea
                      value={formState.message}
                      onChange={(event) => setFormState((prev) => ({ ...prev, message: event.target.value }))}
                      placeholder="Cuéntanos cómo podemos ayudarte."
                      rows={5}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    Enviar mensaje
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </StudioLayout>
  );
}
