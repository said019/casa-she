/**
 * Colores de la tarjeta de clase: un fondo tenue del color del tipo y un tono
 * para los puntos de alumnas que se distinga (contraste ≥ 3:1) aunque el tipo
 * tenga un color pálido o no tenga color.
 *
 * Sin imports con alias "@/": lo prueba frontend/scripts/test-calendario-lugares.ts.
 */

/** Verde Casa: puntos de alumna cuando el tipo no tiene color válido. */
export const COLOR_ALUMNA_POR_DEFECTO = '#2A4E36';
/** Superficie sobre la que se tiñe la tarjeta. */
export const FONDO_TARJETA = '#FCF8EF';
export const ALFA_FONDO_TARJETA = 0.14;
export const ALFA_BORDE_TARJETA = 0.38;
const CONTRASTE_MINIMO = 3;

type Rgb = [number, number, number];

export function hexARgb(hex: string | null | undefined): Rgb | null {
    if (!hex) return null;
    const limpio = hex.trim().replace(/^#/, '');
    const completo = limpio.length === 3 ? limpio.split('').map((x) => x + x).join('') : limpio;
    if (!/^[0-9a-fA-F]{6}$/.test(completo)) return null;
    const n = parseInt(completo, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function aHex(rgb: number[]): string {
    return `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
}

/** El color encima del fondo con cierta opacidad, ya como color sólido (para que las líneas de la rejilla no se transparenten). */
export function mezclarConFondo(color: string | null | undefined, alfa: number, fondo: string = FONDO_TARJETA): string {
    const c = hexARgb(color) ?? (hexARgb(COLOR_ALUMNA_POR_DEFECTO) as Rgb);
    const f = hexARgb(fondo) as Rgb;
    return aHex([0, 1, 2].map((i) => f[i] + (c[i] - f[i]) * alfa));
}

function luminancia([r, g, b]: Rgb): number {
    const lineal = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lineal(r) + 0.7152 * lineal(g) + 0.0722 * lineal(b);
}

/** Contraste WCAG entre dos colores hex (de 1 a 21). Si alguno no es válido → 1. */
export function contraste(a: string, b: string): number {
    const ra = hexARgb(a);
    const rb = hexARgb(b);
    if (!ra || !rb) return 1;
    const [claro, oscuro] = [luminancia(ra), luminancia(rb)].sort((x, y) => y - x);
    return (claro + 0.05) / (oscuro + 0.05);
}

export function fondoDeTarjeta(colorTipo: string | null | undefined): string {
    return mezclarConFondo(colorTipo, ALFA_FONDO_TARJETA);
}

export function bordeDeTarjeta(colorTipo: string | null | undefined): string {
    return mezclarConFondo(colorTipo, ALFA_BORDE_TARJETA);
}

/** Color de los puntos de alumnas: el del tipo, oscurecido lo necesario para llegar a 3:1 sobre su tarjeta. */
export function colorPuntoAlumna(colorTipo: string | null | undefined): string {
    const base = hexARgb(colorTipo) ? (colorTipo as string).trim() : COLOR_ALUMNA_POR_DEFECTO;
    const fondo = fondoDeTarjeta(base);
    if (contraste(base, fondo) >= CONTRASTE_MINIMO) return base;
    const rgb = hexARgb(base) as Rgb;
    for (let paso = 1; paso <= 10; paso++) {
        const candidato = aHex(rgb.map((v) => v * (1 - paso / 10)));
        if (contraste(candidato, fondo) >= CONTRASTE_MINIMO) return candidato;
    }
    return COLOR_ALUMNA_POR_DEFECTO;
}
