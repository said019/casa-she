/**
 * Identidad del gimnasio configurable por despliegue. Los defaults son los de
 * Casa Shé; otro estudio que compre la plataforma los cambia por env vars sin tocar
 * código (la marca "Casa Shé" no debe aparecer en SU calendario de FitPass/TotalPass).
 *
 * La zona horaria vive en mx-time.ts (GYM_TIMEZONE).
 */

/** Nombre que aparece como instructor en FitPass cuando la clase no tiene coach. */
export const GYM_DEFAULT_COACH = process.env.GYM_DEFAULT_COACH || 'Hundred Studio';

/** Responsable por defecto al publicar eventos en TotalPass. */
export const GYM_TEAM_NAME = process.env.GYM_TEAM_NAME || 'Casa Shé';

/**
 * Alias nombre-FitPass → nombre-class_type de Hundred para el matching del import.
 * Codifican la taxonomía del estudio (en Hundred, "Yoga"/"Vinyasa" se dan como
 * "Hatha"); otro gimnasio define los suyos con FITPASS_CLASS_ALIASES en JSON,
 * ej. '{"spinning":"cycling"}'. Inválido o ausente → defaults de Hundred.
 */
const DEFAULT_CLASS_ALIASES: Record<string, string> = {
    yoga: 'hatha', vinyasa: 'hatha', 'power flow': 'hatha', flex: 'hatha',
    functional: 'funcional',
};

let cachedAliases: Record<string, string> | null = null;

export function fitpassClassAliases(): Record<string, string> {
    if (cachedAliases) return cachedAliases;
    const raw = process.env.FITPASS_CLASS_ALIASES;
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                cachedAliases = Object.fromEntries(
                    Object.entries(parsed).map(([k, v]) => [String(k).toLowerCase(), String(v).toLowerCase()]),
                );
                return cachedAliases;
            }
        } catch (e) {
            console.error('FITPASS_CLASS_ALIASES inválido (JSON), uso defaults:', (e as Error).message);
        }
    }
    cachedAliases = DEFAULT_CLASS_ALIASES;
    return cachedAliases;
}
