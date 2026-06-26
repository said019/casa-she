export interface StudioClassType {
  name: string;
  description: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'all';
  durationMinutes: number;
  maxCapacity: number;
  icon?: string;
}

export interface StudioPalette {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  border: string;
  input: string;
  ring: string;
  heroGradient: string;
  cardGradient: string;
  overlayDark: string;
  glowSage: string;
  glowWarm: string;
}

export interface StudioInfo {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  addressLine: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  whatsapp: string;
  email: string;
  instagram: string;
  mapUrl: string;
  branches: Array<{
    name: string;
    addressLines: string[];
    mapUrl: string;
    mapEmbed: string;
  }>;
  classTypes: StudioClassType[];
  bank: {
    name: string;
    account: string;
    clabe: string;
    beneficiary: string;
  };
  businessHours: Array<{ label: string; hours: string }>;
  palette: StudioPalette;
}

const studioDirectory: Record<string, StudioInfo> = {
  bmb: {
    slug: 'bmb',
    name: 'Casa Shé',
    tagline: 'Pilates Mat, Yoga, Aeroyoga y Telas — en Condesa, CDMX.',
    description:
      'Estudio de wellness para mujeres con clases en grupos pequeños y atención personalizada. Membresías por créditos: Mat, Multiclases y Mixtas.',
    addressLine: 'Alfonso Reyes 131, Condesa',
    city: 'Ciudad de México',
    state: 'CDMX',
    postalCode: '06140',
    phone: '',
    whatsapp: '5543860391', // TODO: confirmar WhatsApp oficial
    email: 'casashecondesa@gmail.com',
    instagram: '@casashe.mx',
    mapUrl: 'https://www.google.com/maps/search/Casa+Sh%C3%A9+Condesa+CDMX',
    branches: [
      {
        name: 'Casa Shé — Condesa',
        addressLines: ['Alfonso Reyes 131, Condesa', '06140 Ciudad de México, CDMX'],
        mapUrl: 'https://www.google.com/maps?q=Alfonso+Reyes+131,+Condesa,+06140+Ciudad+de+M%C3%A9xico,+CDMX',
        mapEmbed:
          'https://www.google.com/maps?q=Alfonso+Reyes+131,+Condesa,+06140+Ciudad+de+M%C3%A9xico,+CDMX&output=embed',
      },
    ],
    classTypes: [
      {
        name: 'Pilates Reformer',
        description:
          'La clase estrella: pilates en máquina reformer. Fuerza, control y postura con resistencia guiada para trabajar todo el cuerpo de forma segura.',
        level: 'all',
        durationMinutes: 50,
        maxCapacity: 8,
        icon: 'sparkles',
      },
      {
        name: 'Yoga',
        description:
          'Movimiento consciente, respiración y movilidad para entrar en calma sin perder fuerza.',
        level: 'all',
        durationMinutes: 50,
        maxCapacity: 12,
        icon: 'leaf',
      },
      {
        name: 'Barre',
        description:
          'Ballet, pilates y pulsos finos para alargar, tonificar y mejorar postura.',
        level: 'all',
        durationMinutes: 50,
        maxCapacity: 12,
        icon: 'sparkles',
      },
      {
        name: 'Sculpt',
        description:
          'Entrenamiento de cuerpo completo con resistencia: fuerza, tono y energía en una sesión retadora.',
        level: 'all',
        durationMinutes: 50,
        maxCapacity: 12,
        icon: 'waves',
      },
      {
        name: 'Hot Pilates',
        description:
          'Pilates con intensidad y calor: estabilidad, fuerza y mucho sudor.',
        level: 'all',
        durationMinutes: 50,
        maxCapacity: 12,
        icon: 'flame',
      },
      {
        name: 'Pole Fitness',
        description:
          'Fuerza, flexibilidad y confianza trabajando en barra. Divertido y retador.',
        level: 'all',
        durationMinutes: 50,
        maxCapacity: 10,
        icon: 'sparkles',
      },
      {
        name: 'Flex',
        description:
          'Movilidad y estiramiento profundo para soltar tensión y ganar rango de movimiento.',
        level: 'all',
        durationMinutes: 50,
        maxCapacity: 12,
        icon: 'leaf',
      },
      {
        name: 'Funcional',
        description:
          'Entrenamiento funcional de cuerpo completo o por zonas (lower / upper / full body) para fuerza y resistencia.',
        level: 'all',
        durationMinutes: 50,
        maxCapacity: 12,
        icon: 'target',
      },
    ],
    bank: {
      name: 'Mercado Pago',
      account: '',
      clabe: '722969020755786887',
      beneficiary: 'Karla Ivonne Pérez García',
    },
    businessHours: [
      { label: 'Mañana', hours: 'Reformer desde las 7:10' },
      { label: 'Tarde', hours: 'Clases desde las 17:10' },
      { label: 'Sede', hours: 'Condesa, CDMX' },
      { label: 'Cancelación', hours: 'Hasta 12 horas antes' },
    ],
    palette: {
      background: '40 44% 91%',
      foreground: '30 27% 14%',
      card: '42 46% 96%',
      cardForeground: '30 27% 14%',
      popover: '42 46% 96%',
      popoverForeground: '30 27% 14%',
      primary: '42 72% 47%',
      primaryForeground: '40 45% 96%',
      secondary: '28 22% 78%',
      secondaryForeground: '30 27% 18%',
      muted: '38 33% 87%',
      mutedForeground: '30 12% 40%',
      accent: '40 42% 83%',
      accentForeground: '30 27% 16%',
      border: '34 24% 80%',
      input: '34 24% 80%',
      ring: '42 72% 47%',
      heroGradient:
        'linear-gradient(135deg, hsl(40 44% 93%) 0%, hsl(38 40% 86%) 52%, hsl(42 58% 78%) 100%)',
      cardGradient:
        'linear-gradient(180deg, hsl(42 46% 97%) 0%, hsl(40 34% 91%) 100%)',
      overlayDark:
        'linear-gradient(180deg, hsla(30, 27%, 14%, 0.2) 0%, hsla(30, 27%, 14%, 0.55) 100%)',
      glowSage: '0 18px 42px hsla(42, 72%, 47%, 0.18)',
      glowWarm: '0 18px 42px hsla(33, 69%, 40%, 0.16)',
    },
  },
};

const formatSlugName = (slug: string) =>
  slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export const getStudioBySlug = (slug?: string): StudioInfo => {
  if (!slug) {
    return studioDirectory.bmb;
  }

  const normalized = slug.toLowerCase();
  if (studioDirectory[normalized]) {
    return studioDirectory[normalized];
  }

  return {
    ...studioDirectory.bmb,
    slug: normalized,
    name: formatSlugName(normalized),
  };
};
