/**
 * family — compatibilidad de nombres entre un tipo de clase de Casa Shé y una lesson de FitPass.
 *
 * Casa Shé tiene UN class_type por familia ("Barre", "Pilates Mat"…) y el panel de FitPass publica
 * VARIANTES por horario ("BARRE - ABS & BUTT", "BARRE GAP", "PILATES MAT - GAP"…). Por eso el
 * lesson_id NO sirve como llave de adopción; sí sirve la familia (palabras clave compartidas).
 * (Misma lista y pesos que la resolución del import de 2A; unificar al integrar.)
 */
export const FAMILY_KEYWORDS = ['barre', 'pilates', 'mat', 'sculpt', 'abs', 'vinyasa', 'dharma', 'rocket', 'ashtanga', 'navakarana', 'flow', 'flex', 'yoga'] as const;
const SECONDARY = new Set<string>(['mat', 'abs', 'yoga']);
const weight = (k: string) => (SECONDARY.has(k) ? 1 : 3);

/** minúsculas, sin acentos ni puntuación (& se vuelve espacio); navakaranana -> navakarana. */
export function foldName(s: string | null | undefined): string {
    return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ').replace(/navakaranana/g, 'navakarana').trim();
}

export function familyKeywords(name: string | null | undefined): Set<string> {
    const words = new Set(foldName(name).split(' '));
    return new Set(FAMILY_KEYWORDS.filter((k) => words.has(k)));
}

/** Peso de traslape; 0 = incompatibles. Si la clase tiene palabras de disciplina, se exige compartir una. */
export function familyScore(casaName: string | null | undefined, fpName: string | null | undefined): number {
    const a = familyKeywords(casaName);
    const b = familyKeywords(fpName);
    let score = 0;
    let sharedPrimary = false;
    for (const k of a) if (b.has(k)) { score += weight(k); if (!SECONDARY.has(k)) sharedPrimary = true; }
    const hasPrimary = [...a].some((k) => !SECONDARY.has(k));
    if (hasPrimary && !sharedPrimary) return 0;
    return score;
}

export const familyCompatible = (casaName: string | null | undefined, fpName: string | null | undefined): boolean =>
    familyScore(casaName, fpName) > 0;
