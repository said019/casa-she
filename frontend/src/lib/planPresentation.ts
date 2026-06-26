export type PackageType = 'membership' | 'sample' | 'individual' | 'mixto';

export interface PlanPresentationInput {
  name: string;
  category?: string | null;
  package_type?: PackageType;
  requires_studio_selection?: boolean;
}

export interface PackagePresentation {
  type: PackageType;
  title: string;
  shortTitle: string;
  eyebrow: string;
  promise: string;
  detail: string;
  bestFor: string;
  rule: string;
  accentLabel: string;
  surface: string;
  panel: string;
  card: string;
  chip: string;
  badge: string;
  cta: string;
  selected: string;
  dot: string;
  text: string;
}

export const packageOrder: PackageType[] = ['membership', 'sample', 'individual', 'mixto'];

export const packagePresentations: Record<PackageType, PackagePresentation> = {
  membership: {
    type: 'membership',
    title: 'Membresía BMB',
    shortTitle: 'Membresía',
    eyebrow: 'acceso al estudio',
    promise: 'Tu acceso base al ecosistema BMB',
    detail: 'Activa tu cuenta anual para comprar paquetes, reservar clases y formar parte del programa de beneficios.',
    bestFor: 'Ideal para comenzar y mantener tu perfil activo durante el año.',
    rule: 'Se compra una vez al año.',
    accentLabel: 'base anual',
    surface: 'bg-[#DCCCC0]',
    panel: 'bg-[#F4EBE2] text-[#2A2118] ring-[#DCCCC0]/75',
    card: 'bg-[#FCF8F1] text-[#2A2118] ring-[#DCCCC0]/80 shadow-[0_24px_80px_-68px_rgba(42,33,24,.55)] hover:ring-[#A6776A]/45',
    chip: 'bg-[#A6776A] text-[#FFF8EE]',
    badge: 'bg-[#E6D0CA] text-[#7A554B] ring-[#A6776A]/20',
    cta: 'bg-[#A6776A] text-[#FFF8EE] hover:bg-[#8F6258]',
    selected: 'ring-2 ring-[#A6776A]/55 shadow-[0_22px_74px_-56px_rgba(166,119,106,.82)]',
    dot: 'bg-[#A6776A]',
    text: 'text-[#6B554D]',
  },
  sample: {
    type: 'sample',
    title: 'Primera vez',
    shortTitle: 'Prueba',
    eyebrow: 'primera visita',
    promise: 'Prueba sin comprometerte',
    detail: 'Opciones de entrada para conocer el ritmo del estudio antes de elegir un paquete completo.',
    bestFor: 'Ideal si vienes por primera vez o quieres probar Reformer o Multidisciplina.',
    rule: 'Empieza aquí si todavía estás explorando.',
    accentLabel: 'descubrir',
    surface: 'bg-[#E6D0CA]',
    panel: 'bg-[#F8EFE8] text-[#2A2118] ring-[#E6D0CA]/85',
    card: 'bg-[#FCF8F1] text-[#2A2118] ring-[#E6D0CA]/90 shadow-[0_24px_80px_-68px_rgba(42,33,24,.55)] hover:ring-[#A6776A]/45',
    chip: 'bg-[#AD6C20] text-[#FFF8EE]',
    badge: 'bg-[#F2DED8] text-[#7B544B] ring-[#A6776A]/18',
    cta: 'bg-[#AD6C20] text-[#FFF8EE] hover:bg-[#955D1B]',
    selected: 'ring-2 ring-[#AD6C20]/45 shadow-[0_22px_74px_-56px_rgba(173,108,32,.72)]',
    dot: 'bg-[#AD6C20]',
    text: 'text-[#72594F]',
  },
  individual: {
    type: 'individual',
    title: 'Reformer individual',
    shortTitle: 'Reformer',
    eyebrow: 'una sala',
    promise: 'Enfócate en tu práctica principal',
    detail: 'Paquetes para reservar en Reformer o en una sala específica. Perfecto si quieres una rutina constante.',
    bestFor: 'Ideal para rutina fija, progreso técnico y práctica constante.',
    rule: 'Eliges estudio al comprar.',
    accentLabel: 'enfoque',
    surface: 'bg-[#DCCCC0]',
    panel: 'bg-[#F5ECE2] text-[#2A2118] ring-[#DCCCC0]/80',
    card: 'bg-[#FCF8F1] text-[#2A2118] ring-[#DCCCC0]/90 shadow-[0_24px_80px_-68px_rgba(42,33,24,.55)] hover:ring-[#A6776A]/45',
    chip: 'bg-[#A6776A] text-[#FFF8EE]',
    badge: 'bg-[#EFE0D8] text-[#76564C] ring-[#A6776A]/18',
    cta: 'bg-[#A6776A] text-[#FFF8EE] hover:bg-[#8F6258]',
    selected: 'ring-2 ring-[#A6776A]/55 shadow-[0_22px_74px_-56px_rgba(166,119,106,.82)]',
    dot: 'bg-[#A6776A]',
    text: 'text-[#6C5A52]',
  },
  mixto: {
    type: 'mixto',
    title: 'Multidisciplina',
    shortTitle: 'Mixto',
    eyebrow: 'más libertad',
    promise: 'Muévete entre disciplinas',
    detail: 'Créditos flexibles para alternar Pilates, Barre, Yoga, Floorwork, Twerk y otras clases.',
    bestFor: 'Ideal si alternas disciplinas o quieres más libertad para agendar.',
    rule: 'Un paquete, varias formas de moverte.',
    accentLabel: 'flexible',
    surface: 'bg-[#DBB0B3]',
    panel: 'bg-[#F5E8E4] text-[#2A2118] ring-[#DBB0B3]/65',
    card: 'bg-[#FCF8F1] text-[#2A2118] ring-[#DBB0B3]/70 shadow-[0_24px_80px_-68px_rgba(42,33,24,.55)] hover:ring-[#A6776A]/45',
    chip: 'bg-[#8F5F58] text-[#FFF8EE]',
    badge: 'bg-[#F0D3D3] text-[#704D4A] ring-[#A6776A]/18',
    cta: 'bg-[#8F5F58] text-[#FFF8EE] hover:bg-[#7A514B]',
    selected: 'ring-2 ring-[#8F5F58]/52 shadow-[0_22px_74px_-56px_rgba(143,95,88,.78)]',
    dot: 'bg-[#DBB0B3]',
    text: 'text-[#6F5653]',
  },
};

function normalizePlanText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function getPackageType(plan: PlanPresentationInput): PackageType {
  const name = normalizePlanText(plan.name);
  const category = normalizePlanText(plan.category || '');

  if (
    category.includes('membership_fee') ||
    category.includes('membership fee') ||
    (name.includes('membresia') && name.includes('anual')) ||
    name.includes('membresia social') ||
    name.includes('inscrip') ||
    name.includes('social')
  ) {
    return 'membership';
  }

  if (
    category.includes('trial') ||
    category.includes('sample') ||
    name.includes('muestra') ||
    name.includes('prueba') ||
    name.includes('drop') ||
    name.includes('1ra') ||
    name.includes('1era') ||
    name.includes('primera vez') ||
    name.includes('primer vez') ||
    name.includes('primera clase')
  ) {
    return 'sample';
  }

  if (
    name.includes('multi') ||
    name.includes('mixto') ||
    name.includes('multidisciplina')
  ) {
    return 'mixto';
  }

  if (
    plan.requires_studio_selection ||
    name.includes('individual') ||
    name.includes('reformer') ||
    name.includes('wunda') ||
    name.includes('barre') ||
    name.includes('hot room')
  ) {
    return 'individual';
  }

  return plan.package_type || 'mixto';
}

export function getPackagePresentation(plan: PlanPresentationInput): PackagePresentation {
  return packagePresentations[getPackageType(plan)];
}

export function getClassesLabel(classLimit?: number | null, fallback = 1) {
  const classes = classLimit ?? fallback;
  if (classes <= 0) return 'Acceso';
  return `${classes} clase${classes > 1 ? 's' : ''}`;
}
