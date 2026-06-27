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

// Orden de presentación en el checkout: Membresías primero (como en el index),
// luego Paquetes de créditos, y al final Primera vez / clase suelta.
export const packageOrder: PackageType[] = ['membership', 'mixto', 'sample', 'individual'];

const CARD_BASE =
  'bg-[#FBF7EE] text-[#2E1B22] shadow-[0_24px_80px_-68px_rgba(42,33,24,.55)]';

export const packagePresentations: Record<PackageType, PackagePresentation> = {
  // Membresías mensuales (360 / Black) — Verde Casa
  membership: {
    type: 'membership',
    title: 'Membresías',
    shortTitle: 'Membresía',
    eyebrow: 'lo más completo',
    promise: 'Tu práctica todo el mes',
    detail: 'Créditos cada mes para moverte sin contar clases, con el mejor precio por sesión y beneficios de la casa.',
    bestFor: 'Ideal si vienes seguido y quieres lo más completo.',
    rule: 'Se renueva cada mes.',
    accentLabel: 'mensual',
    surface: 'bg-[#2A4E36]',
    panel: 'bg-[#E9EFE4] text-[#2E1B22] ring-[#2A4E36]/20',
    card: `${CARD_BASE} ring-[#2A4E36]/15 hover:ring-[#2A4E36]/40`,
    chip: 'bg-[#2A4E36] text-[#F6F0E4]',
    badge: 'bg-[#DDE4D5] text-[#2A4E36] ring-[#2A4E36]/20',
    cta: 'bg-[#2A4E36] text-[#F6F0E4] hover:bg-[#16261A]',
    selected: 'ring-2 ring-[#2A4E36]/55 shadow-[0_22px_74px_-56px_rgba(42,78,54,.82)]',
    dot: 'bg-[#2A4E36]',
    text: 'text-[#6B554D]',
  },
  // Paquetes de créditos (5 / 8 / 12) — Musgo
  mixto: {
    type: 'mixto',
    title: 'Paquetes',
    shortTitle: 'Paquete',
    eyebrow: 'a tu ritmo',
    promise: 'Créditos para tus clases',
    detail: 'Créditos flexibles para reservar Pilates Mat, Yoga, Aeroyoga, Telas y talleres, en el orden que tú quieras.',
    bestFor: 'Ideal para mantener constancia sin comprometerte a todo el mes.',
    rule: 'Vigencia un mes desde la compra.',
    accentLabel: 'flexible',
    surface: 'bg-[#6C8424]',
    panel: 'bg-[#ECEFDD] text-[#2E1B22] ring-[#6C8424]/25',
    card: `${CARD_BASE} ring-[#6C8424]/18 hover:ring-[#6C8424]/45`,
    chip: 'bg-[#6C8424] text-[#F6F0E4]',
    badge: 'bg-[#E4E8CF] text-[#5A6E1E] ring-[#6C8424]/20',
    cta: 'bg-[#6C8424] text-[#F6F0E4] hover:bg-[#5A6E1E]',
    selected: 'ring-2 ring-[#6C8424]/52 shadow-[0_22px_74px_-56px_rgba(108,132,36,.78)]',
    dot: 'bg-[#6C8424]',
    text: 'text-[#5F6A4A]',
  },
  // Primera vez / clase suelta — Arcilla
  sample: {
    type: 'sample',
    title: 'Primera vez',
    shortTitle: 'Prueba',
    eyebrow: 'tu primera visita',
    promise: 'Conoce Casa Shé',
    detail: 'Entra a tu primera clase o toma una suelta para sentir el espacio antes de elegir un paquete.',
    bestFor: 'Ideal si vienes por primera vez o quieres una clase ocasional.',
    rule: 'Empieza aquí si todavía estás explorando.',
    accentLabel: 'descubrir',
    surface: 'bg-[#AE4836]',
    panel: 'bg-[#F4E6E1] text-[#2E1B22] ring-[#AE4836]/20',
    card: `${CARD_BASE} ring-[#AE4836]/15 hover:ring-[#AE4836]/40`,
    chip: 'bg-[#AE4836] text-[#F6F0E4]',
    badge: 'bg-[#F1DED8] text-[#AE4836] ring-[#AE4836]/20',
    cta: 'bg-[#AE4836] text-[#F6F0E4] hover:bg-[#934434]',
    selected: 'ring-2 ring-[#AE4836]/50 shadow-[0_22px_74px_-56px_rgba(174,72,54,.72)]',
    dot: 'bg-[#AE4836]',
    text: 'text-[#72594F]',
  },
  // Sala individual / Reformer (Casa Shé normalmente no lo usa) — Mostaza
  individual: {
    type: 'individual',
    title: 'Sala individual',
    shortTitle: 'Individual',
    eyebrow: 'una sala',
    promise: 'Enfócate en una práctica',
    detail: 'Créditos para reservar una sala o disciplina específica, con rutina constante.',
    bestFor: 'Ideal para una rutina fija en una sola disciplina.',
    rule: 'Eliges la sala al reservar.',
    accentLabel: 'enfoque',
    surface: 'bg-[#B4A248]',
    panel: 'bg-[#F1EEDD] text-[#2E1B22] ring-[#B4A248]/30',
    card: `${CARD_BASE} ring-[#B4A248]/25 hover:ring-[#B4A248]/50`,
    chip: 'bg-[#8A7B3F] text-[#F6F0E4]',
    badge: 'bg-[#EDE7CF] text-[#8A7B3F] ring-[#B4A248]/25',
    cta: 'bg-[#8A7B3F] text-[#F6F0E4] hover:bg-[#736632]',
    selected: 'ring-2 ring-[#B4A248]/55 shadow-[0_22px_74px_-56px_rgba(180,162,72,.7)]',
    dot: 'bg-[#B4A248]',
    text: 'text-[#6B6346]',
  },
};

function normalizePlanText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function getPackageType(plan: PlanPresentationInput): PackageType {
  const name = normalizePlanText(plan.name);
  const category = normalizePlanText(plan.category || '');

  // Primera vez / clase suelta
  if (
    category.includes('trial') ||
    category.includes('sample') ||
    name.includes('muestra') ||
    name.includes('prueba') ||
    name.includes('drop') ||
    name.includes('suelta') ||
    name.includes('primera vez') ||
    name.includes('primer vez') ||
    name.includes('1ra') ||
    name.includes('1era') ||
    name.includes('primera clase')
  ) {
    return 'sample';
  }

  // Membresías mensuales (360 / Black / anual / social)
  if (
    category.includes('membership') ||
    name.includes('membresia') ||
    name.includes('social') ||
    name.includes('inscrip') ||
    name.includes('360') ||
    name.includes('black')
  ) {
    return 'membership';
  }

  // Sala individual / Reformer (Casa Shé normalmente no lo usa)
  if (
    plan.requires_studio_selection ||
    name.includes('individual') ||
    name.includes('reformer') ||
    name.includes('wunda')
  ) {
    return 'individual';
  }

  // Paquetes de créditos (5 / 8 / 12) y mixto por defecto
  return 'mixto';
}

export function getPackagePresentation(plan: PlanPresentationInput): PackagePresentation {
  return packagePresentations[getPackageType(plan)];
}

export function getClassesLabel(classLimit?: number | null, fallback = 1) {
  const classes = classLimit ?? fallback;
  if (classes <= 0) return 'Acceso';
  return `${classes} clase${classes > 1 ? 's' : ''}`;
}
