import { Link, useParams } from 'react-router-dom';
import { MapPin, Phone, Mail, Instagram } from 'lucide-react';
import { getStudioBySlug } from '@/data/studios';

const footerLinks = [
  { label: 'Clases', path: '/classes' },
  { label: 'Horarios', path: '/schedule' },
  { label: 'Instructores', path: '/instructors' },
  { label: 'Planes', path: '/pricing' },
  { label: 'Contacto', path: '/contact' },
];

export default function StudioFooter() {
  const { studioSlug } = useParams();
  const studio = getStudioBySlug(studioSlug);
  const basePath = `/${studio.slug}`;

  return (
    <footer className="bg-foreground text-primary-foreground py-16 lg:py-20 mt-16">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr_1fr]">
          <div>
            <Link to={basePath} className="flex items-center gap-2 mb-6">
              <span className="font-heading text-2xl font-semibold text-primary-foreground">
                {studio.name}
              </span>
              <span className="text-xs font-body text-primary-foreground/60 tracking-widest uppercase">
                Membresía
              </span>
            </Link>
            <p className="font-body text-sm text-primary-foreground/70 mb-6">
              {studio.description}
            </p>
            <div className="flex items-center gap-4">
              <a
                href={`https://instagram.com/${studio.instagram.replace('@', '')}`}
                className="w-10 h-10 bg-primary-foreground/10 rounded-full flex items-center justify-center hover:bg-primary-foreground/20 transition-colors"
              >
                <Instagram className="w-5 h-5" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="font-heading text-lg font-semibold text-primary-foreground mb-6">
              Explora
            </h4>
            <ul className="space-y-3">
              {footerLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    to={`${basePath}${link.path}`}
                    className="font-body text-sm text-primary-foreground/70 hover:text-primary-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-heading text-lg font-semibold text-primary-foreground mb-6">
              Contacto
            </h4>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-primary-foreground/50 flex-shrink-0 mt-0.5" />
                <a
                  href={studio.mapUrl}
                  className="font-body text-sm text-primary-foreground/70 hover:text-primary-foreground transition-colors"
                >
                  {studio.addressLine}
                  <br />
                  {studio.city}, {studio.state} {studio.postalCode}
                </a>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="w-5 h-5 text-primary-foreground/50" />
                <a
                  href={`tel:${studio.phone.replace(/\s/g, '')}`}
                  className="font-body text-sm text-primary-foreground/70 hover:text-primary-foreground transition-colors"
                >
                  {studio.phone}
                </a>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-primary-foreground/50" />
                <a
                  href={`mailto:${studio.email}`}
                  className="font-body text-sm text-primary-foreground/70 hover:text-primary-foreground transition-colors"
                >
                  {studio.email}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-primary-foreground/10 flex flex-col md:flex-row items-center justify-between gap-4 mt-12">
          <p className="font-body text-sm text-primary-foreground/50">
            © 2026 {studio.name}. Todos los derechos reservados.
          </p>
          <p className="font-body text-sm text-primary-foreground/50">
            Powered by <span className="text-secondary font-semibold">WalletClub</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
