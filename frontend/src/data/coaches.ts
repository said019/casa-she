export interface CoachEntry {
  slug: string;
  name: string;
  role: string;
  /** Ruta de la foto. Opcional: si falta, la tarjeta muestra un placeholder con iniciales. */
  photo?: string;
  specialty?: "reformer" | "pole" | "hot" | "barre" | "yoga" | "sculpt";
  /** Frase corta para la tarjeta del landing (la bio completa vive en instructors.bio). */
  tagline?: string;
  /** display_name EXACTO del instructor en el sistema, para enlazar su ficha/bio. */
  match?: string;
}

export const COACH_ROSTER: CoachEntry[] = [
  { slug: "karla",    name: "Karla",          role: "Reformer & Sculpt",  photo: "/coaches/karla.jpg",       specialty: "reformer", match: "Karla" },
  { slug: "estrella", name: "Estrella",       role: "Twerk",              photo: "/coaches/estrella.jpg",    specialty: "pole",     match: "Estrella",        tagline: "Movimiento y empoderamiento femenino 💖" },
  { slug: "vane",     name: "Vane",           role: "Pole & Sculpt",      photo: "/coaches/vane.jpg",        specialty: "pole",     match: "Vane" },
  { slug: "ara",      name: "Ara",            role: "Reformer & Pole",    photo: "/coaches/ara.jpg",         specialty: "reformer", match: "Aranza",          tagline: "Pole: fuerza, libertad y volver a ti" },
  { slug: "frida",    name: "Frida",          role: "Reformer & Barre",   photo: "/coaches/frida.jpg",       specialty: "barre",    match: "Frida",           tagline: "Yoga consciente · respiración y esencia" },
  { slug: "indie",    name: "Indie",          role: "Reformer Flow",      photo: "/coaches/indie.jpg",       specialty: "reformer", match: "Indie" },
  { slug: "pao",      name: "Pao",            role: "Barre & Sculpt",     photo: "/coaches/pao.jpg",         specialty: "barre",    match: "Pao" },
  { slug: "jess",     name: "Jess Maldonado", role: "Barre",              photo: "/coaches/jess.jpg",        specialty: "barre",    match: "Jess",            tagline: "Barre · fuerza, equilibrio y amor propio 🤍" },
  { slug: "jess-tavira", name: "Jess Tavira", role: "Hot Pilates",        photo: "/coaches/jess-tavira.jpg", specialty: "hot",      match: "Jessi Tavira" },
  { slug: "fer",      name: "Fer",            role: "Pilates & Stretch",  photo: "/coaches/fer.jpg",         specialty: "reformer", match: "Fer" },
  { slug: "aaron",    name: "Aaron",          role: "Reformer",           photo: "/coaches/aaron.jpg",       specialty: "reformer", match: "Aaron Domínguez", tagline: "Reformer & fuerza · reinventa tu mejor versión ⚡" },
  { slug: "sofi-maes", name: "Sofi Maes",     role: "Reformer & Hot Pilates", photo: "/coaches/sofi-maes.jpg", specialty: "reformer",     match: "Sofi Maes",       tagline: "Reformer & Hot · movimiento con flow ✨" },
  { slug: "jaqui",    name: "Jaqui",          role: "Funcional & Fuerza", photo: "/coaches/jaqui.jpg",       specialty: "sculpt",        match: "Jaqui",           tagline: "Funcional y fuerza · deporte de toda la vida 💪" },
  // Sin foto aún (la tarjeta muestra iniciales). Ya tiene bio y da clases.
  { slug: "vero",     name: "Vero",           role: "Pole Dance",         specialty: "pole",                 match: "Vero",            tagline: "Pole dance · empoderamiento y amor propio" },
  { slug: "nicki",    name: "Nicki",          role: "Pole",               photo: "/coaches/nicki.jpg",       specialty: "pole" },
];

export const TEAM_HERO_PHOTO = "/coaches/team.jpg";
export const TEAM_POLE_PHOTO = "/coaches/team-pole.jpg";
