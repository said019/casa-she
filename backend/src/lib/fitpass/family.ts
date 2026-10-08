/**
 * family — compatibilidad de nombres entre un tipo de clase de Casa Shé y una lesson de FitPass.
 *
 * Casa Shé tiene UN class_type por familia ("Barre", "Pilates Mat"…) y el panel de FitPass publica
 * VARIANTES por horario ("BARRE - ABS & BUTT", "BARRE GAP", "PILATES MAT - GAP"…). Por eso el
 * lesson_id NO sirve como llave de adopción; sí sirve la familia (palabras clave compartidas).
 * ÚNICA fuente de verdad: la usan la resolución del import (source.ts) y la adopción/edición (ownership.ts, edit.ts).
 * Pesos: palabras de disciplina (barre, pilates, sculpt, vinyasa, dharma, rocket, ashtanga, navakarana, flow, flex) = 3;
 * genéricas (mat, abs, yoga) = 1. 'pilates' y 'mat' son la misma familia (se expanden entre sí); una familia
 * incompatible (sin disciplina compartida) puntúa 0 y nunca empata.
 */
export const FAMILY_KEYWORDS = ['barre', 'pilates', 'mat', 'sculpt', 'abs', 'vinyasa', 'dharma', 'rocket', 'ashtanga', 'navakarana', 'flow', 'flex', 'yoga'] as const;
// El tipo "Pilates Mat" de Casa Shé aparece en el panel como "MAT FULL BODY", "MAT ABS Y BUTT"…: 'mat' expande a
// 'pilates' (disciplina, peso 3) en familyKeywords, así que 'mat' solo aporta como genérica.
const SECONDARY = new Set<string>(['mat', 'abs', 'yoga']);
const weight = (k: string) => (SECONDARY.has(k) ? 1 : 3);

/** minúsculas, sin acentos ni puntuación (& se vuelve espacio); navakaranana -> navakarana. */
export function foldName(s: string | null | undefined): string {
    return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ').replace(/navakaranana/g, 'navakarana').trim();
}

/** Palabra clave -> peso. Las implícitas (pilates<->mat) pesan 1: "Mat Power Abs" no es "Pilates Mat" por tener 'mat'. */
function weightedKeywords(name: string | null | undefined): Map<string, number> {
    const words = new Set(foldName(name).split(' '));
    const m = new Map<string, number>();
    for (const k of FAMILY_KEYWORDS) if (words.has(k)) m.set(k, weight(k));
    if (m.has('pilates') && !m.has('mat')) m.set('mat', 1);
    if (m.has('mat') && !m.has('pilates')) m.set('pilates', 1);
    return m;
}

export function familyKeywords(name: string | null | undefined): Set<string> {
    return new Set(weightedKeywords(name).keys());
}

/** Peso de traslape; 0 = incompatibles. Si la clase tiene palabras de disciplina, se exige compartir una. */
export function familyScore(casaName: string | null | undefined, fpName: string | null | undefined): number {
    const a = weightedKeywords(casaName);
    const b = weightedKeywords(fpName);
    let shared = 0;
    let extra = 0;
    let sharedPrimary = false;
    for (const [k, w] of a) {
        const wb = b.get(k);
        if (wb !== undefined) { shared += Math.min(w, wb); if (!SECONDARY.has(k)) sharedPrimary = true; } else extra += w;
    }
    for (const [k, w] of b) if (!a.has(k)) extra += w;
    const hasPrimary = [...a.keys()].some((k) => !SECONDARY.has(k));
    if (hasPrimary && !sharedPrimary) return 0;
    if (shared === 0) return 0;
    // El traslape manda (x10); las palabras que sobran en cualquiera de los lados desempatan a favor de la
    // coincidencia más exacta. Siempre > 0 si son compatibles.
    return Math.max(1, shared * 10 - extra);
}

export const familyCompatible = (casaName: string | null | undefined, fpName: string | null | undefined): boolean =>
    familyScore(casaName, fpName) > 0;
