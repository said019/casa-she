import { type CSSProperties, ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useLocation, useParams } from 'react-router-dom';
import { Menu, X, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getStudioBySlug } from '@/data/studios';
import StudioFooter from '@/components/layout/StudioFooter';

interface StudioLayoutProps {
  children: ReactNode;
}

const navItems = [
  { label: 'Inicio', path: '' },
  { label: 'Clases', path: '/classes' },
  { label: 'Horarios', path: '/schedule' },
  { label: 'Instructores', path: '/instructors' },
  { label: 'Planes', path: '/pricing' },
  { label: 'Contacto', path: '/contact' },
];

export default function StudioLayout({ children }: StudioLayoutProps) {
  const { studioSlug } = useParams();
  const studio = getStudioBySlug(studioSlug);
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const basePath = `/${studio.slug}`;

  const paletteStyle = useMemo(
    () =>
      ({
        '--background': studio.palette.background,
        '--foreground': studio.palette.foreground,
        '--card': studio.palette.card,
        '--card-foreground': studio.palette.cardForeground,
        '--popover': studio.palette.popover,
        '--popover-foreground': studio.palette.popoverForeground,
        '--primary': studio.palette.primary,
        '--primary-foreground': studio.palette.primaryForeground,
        '--secondary': studio.palette.secondary,
        '--secondary-foreground': studio.palette.secondaryForeground,
        '--muted': studio.palette.muted,
        '--muted-foreground': studio.palette.mutedForeground,
        '--accent': studio.palette.accent,
        '--accent-foreground': studio.palette.accentForeground,
        '--border': studio.palette.border,
        '--input': studio.palette.input,
        '--ring': studio.palette.ring,
        '--hero-gradient': studio.palette.heroGradient,
        '--card-gradient': studio.palette.cardGradient,
        '--overlay-dark': studio.palette.overlayDark,
        '--glow-sage': studio.palette.glowSage,
        '--glow-warm': studio.palette.glowWarm,
      }) as CSSProperties,
    [studio.palette]
  );

  useEffect(() => {
    document.title = `${studio.name} | BMB Studio`;
  }, [studio.name]);

  const isActive = (path: string) => {
    const fullPath = `${basePath}${path}`;
    return location.pathname === fullPath;
  };

  return (
    <div className="min-h-screen bg-background text-foreground" style={paletteStyle}>
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 pt-[env(safe-area-inset-top)]">
        <div className="container mx-auto px-4 lg:px-8">
          <nav className="flex items-center justify-between h-16">
            <Link to={basePath} className="flex items-center gap-2">
              <span className="font-heading text-xl font-semibold text-foreground">
                {studio.name}
              </span>
              <span className="text-xs font-body text-muted-foreground tracking-widest uppercase">
                Membresía
              </span>
            </Link>

            <div className="hidden lg:flex items-center gap-8">
              {navItems.map((item) => (
                <NavLink
                  key={item.label}
                  to={`${basePath}${item.path}`}
                  className={cn(
                    'text-sm font-body transition-colors',
                    isActive(item.path)
                      ? 'text-primary'
                      : 'text-foreground/70 hover:text-foreground'
                  )}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>

            <div className="hidden lg:flex items-center gap-3">
              <Button variant="ghost" size="icon" asChild>
                <Link to="/login" aria-label="Mi cuenta">
                  <User className="w-5 h-5" />
                </Link>
              </Button>
              <Button variant="hero" asChild>
                <Link to={`${basePath}/pricing`}>Comprar membresía</Link>
              </Button>
            </div>

            <button
              className="lg:hidden p-2"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              aria-label="Abrir menú"
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6 text-foreground" />
              ) : (
                <Menu className="w-6 h-6 text-foreground" />
              )}
            </button>
          </nav>
        </div>

        {isMobileMenuOpen && (
          <div className="lg:hidden border-t bg-background/98 backdrop-blur">
            <div className="container mx-auto px-4 py-6 flex flex-col gap-4">
              {navItems.map((item) => (
                <NavLink
                  key={item.label}
                  to={`${basePath}${item.path}`}
                  className={cn(
                    'text-base font-body py-2 border-b border-border/50',
                    isActive(item.path)
                      ? 'text-primary'
                      : 'text-foreground/80 hover:text-foreground'
                  )}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {item.label}
                </NavLink>
              ))}
              <div className="flex items-center gap-3 pt-4">
                <Button variant="ghost" size="icon" asChild>
                  <Link to="/login" aria-label="Mi cuenta">
                    <User className="w-5 h-5" />
                  </Link>
                </Button>
                <Button variant="hero" className="w-full" asChild>
                  <Link to={`${basePath}/pricing`}>Comprar membresía</Link>
                </Button>
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="min-h-[70vh]">{children}</main>

      <StudioFooter />
    </div>
  );
}
