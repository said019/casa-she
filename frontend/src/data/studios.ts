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
  casashe: {
    slug: 'casashe',
    name: 'Casa Shé',
    tagline: 'Pilates Mat, Barre, Sculpt, Yoga, Flex y Salsa — en Condesa, CDMX.',
    description:
      'Estudio de wellness para mujeres con clases en grupos pequeños y atención personalizada. Pilates Mat, Barre, Sculpt, Yoga, Flex y Salsa.',
    addressLine: 'Alfonso Reyes 131, Condesa',
    city: 'Ciudad de México',
    state: 'CDMX',
    postalCode: '06140',
    phone: '',
    whatsapp: '',
    email: 'casashecondesa@gmail.com',
    instagram: '@casashe.mx',
    mapUrl: 'https://maps.app.goo.gl/PUQqpiDKyzuHGkCL9',
    branches: [
      {
        name: 'Casa Shé — Condesa',
        addressLines: ['Alfonso Reyes 131, Condesa', '06140 Ciudad de México, CDMX'],
        mapUrl: 'https://maps.app.goo.gl/PUQqpiDKyzuHGkCL9',
        mapEmbed:
          'https://www.google.com/maps?q=Alfonso+Reyes+131,+Condesa,+06140+Ciudad+de+M%C3%A9xico,+CDMX&output=embed',
      },
    ],
    classTypes: [
      {
        name: 'Pilates Mat',
        description:
          'Trabajo en colchoneta para fortalecer core, postura y control con movimientos precisos.',
        level: 'all',
        durationMinutes: 50,
        maxCapacity: 12,
        icon: 'sparkles',
      },
      {
        name: 'Barre',
        description:
          'Ballet, pilates y pulsos controlados para fortalecer piernas, core y postura.',
        level: 'all',
        durationMinutes: 50,
        maxCapacity: 12,
        icon: 'sparkles',
      },
      {
        name: 'Sculpt',
        description:
          'Entrenamiento de cuerpo completo con resistencia para ganar fuerza y definición.',
        level: 'all',
        durationMinutes: 50,
        maxCapacity: 12,
        icon: 'waves',
      },
      {
        name: 'Yoga',
        description:
          'Respiración, movilidad y secuencias conscientes para desarrollar fuerza, flexibilidad y calma.',
        level: 'all',
        durationMinutes: 60,
        maxCapacity: 7,
        icon: 'leaf',
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
        name: 'Salsa',
        description:
          'Ritmo, coordinación y energía en una clase para disfrutar el movimiento.',
        level: 'all',
        durationMinutes: 60,
        maxCapacity: 6,
        icon: 'target',
      },
    ],
    bank: {
      name: '(pendiente)',
      account: '',
      clabe: '(pendiente)',
      beneficiary: 'Casa Shé',
    },
    businessHours: [
      { label: 'Mañana', hours: 'Clases desde las 7:00' },
      { label: 'Tarde', hours: 'Clases desde las 17:00' },
      { label: 'Sede', hours: 'Condesa, CDMX' },
      { label: 'Cancelación', hours: 'Hasta 5 horas antes' },
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
    return studioDirectory.casashe;
  }

  const normalized = slug.toLowerCase();
  if (studioDirectory[normalized]) {
    return studioDirectory[normalized];
  }

  return {
    ...studioDirectory.casashe,
    slug: normalized,
    name: formatSlugName(normalized),
  };
};
