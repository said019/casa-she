export interface CoachEntry {
  slug: string;
  name: string;
  role: string;
  /** Ruta de la foto. Opcional: si falta, la tarjeta muestra un placeholder con iniciales. */
  photo?: string;
  specialty?: "pilates" | "barre" | "yoga" | "sculpt" | "flex" | "salsa";
  /** Frase corta para la tarjeta del landing (la bio completa vive en instructors.bio). */
  tagline?: string;
  /** display_name EXACTO del instructor en el sistema, para enlazar su ficha/bio. */
  match?: string;
}

export const COACH_ROSTER: CoachEntry[] = [
  { slug: "ale", name: "Ale", role: "Yoga", specialty: "yoga", match: "Ale" },
  { slug: "isai", name: "Isaí", role: "Pilates Mat, Barre & Sculpt", specialty: "pilates", match: "Isaí" },
  { slug: "pau", name: "Pau", role: "Navakarana", specialty: "yoga", match: "Pau" },
  { slug: "raul", name: "Raúl", role: "Pilates Mat, Barre, Sculpt & Salsa", specialty: "sculpt", match: "Raúl" },
  { slug: "regina", name: "Regina", role: "Pilates Mat & Flex", specialty: "flex", match: "Regina" },
  { slug: "roby", name: "Roby", role: "Yoga & Flex", specialty: "yoga", match: "Roby" },
  { slug: "valeria", name: "Valeria", role: "Barre", specialty: "barre", match: "Valeria" },
  { slug: "yesz", name: "Yesz", role: "Sculpt", specialty: "sculpt", match: "Yesz" },
];

export const TEAM_HERO_PHOTO = "/coaches/team.jpg";
