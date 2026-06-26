// Casa Shé — Brand-aware email templates.
// Single source of truth for colors, logo, footer, and the wrapper layout.

export const brand = {
    name: 'Casa Shé',
    tagline: 'Movimiento · Nutrición · Comunidad',
    olive: '#2E4A35',      // Verde Casa — primario
    oliveDark: '#16261A',  // verde profundo
    cream: '#FBF3DD',      // Avena — fondo
    sand: '#D8D2BC',       // Arena — superficie
    dark: '#2E1B22',       // Ciruela — texto/encabezados
    accent: '#B6A43C',     // Musgo — acento
    alert: '#B5512F',      // Arcilla — alertas
    text: '#2E1B22',
    textMuted: 'rgba(46,27,34,0.62)',
};

// URL viva del frontend en prod. Default a casashe.mx para que links/logo funcionen
// aunque FRONTEND_URL no esté seteado. Sobreescribible con FRONTEND_URL / EMAIL_LOGO_URL.
const PROD_FRONTEND = 'https://casashe.mx';

export function getFrontendUrl(): string {
    return process.env.FRONTEND_URL || PROD_FRONTEND;
}

export function getLogoUrl(): string {
    return process.env.EMAIL_LOGO_URL || `${getFrontendUrl()}/casa-she-logo.png`;
}

export function getEmailFrom(): string {
    return process.env.EMAIL_FROM || `${brand.name} <onboarding@resend.dev>`;
}

interface ButtonOpts {
    label: string;
    href: string;
    variant?: 'primary' | 'secondary';
}

export function emailButton({ label, href, variant = 'primary' }: ButtonOpts): string {
    const bg = variant === 'primary' ? brand.olive : brand.sand;
    const fg = variant === 'primary' ? brand.cream : brand.dark;
    return `<a href="${href}" style="display:inline-block;background:${bg};color:${fg} !important;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:600;font-size:15px;letter-spacing:0.01em;">${label}</a>`;
}

export function infoBox(htmlContent: string): string {
    return `<div style="background:${brand.cream};border-left:4px solid ${brand.olive};padding:16px 18px;margin:20px 0;border-radius:8px;color:${brand.text};font-size:14px;line-height:1.55;">${htmlContent}</div>`;
}

export function alertBox(htmlContent: string): string {
    return `<div style="background:#fbeeec;border-left:4px solid ${brand.alert};padding:16px 18px;margin:20px 0;border-radius:8px;color:${brand.text};font-size:14px;line-height:1.55;">${htmlContent}</div>`;
}

interface WrapOpts {
    title: string;
    preview?: string;
    body: string; // raw inner HTML (already styled)
}

export function wrapEmail({ title, preview, body }: WrapOpts): string {
    const previewText = preview || title;
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${brand.sand};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${brand.text};">
<span style="display:none !important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${previewText}</span>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${brand.sand};padding:32px 16px;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:${brand.cream};border-radius:24px;overflow:hidden;box-shadow:0 18px 60px -32px rgba(61,50,41,0.18);">
<tr><td style="padding:40px 40px 28px;text-align:center;border-bottom:1px solid rgba(61,50,41,0.08);">
<a href="${getFrontendUrl()}" style="text-decoration:none;color:inherit;display:inline-block;">
<img src="${getLogoUrl()}" alt="${brand.name}" width="96" height="96" style="display:block;margin:0 auto;height:96px;width:96px;border:0;outline:none;" />
<div style="margin-top:16px;font-size:18px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:${brand.dark};">${brand.name}</div>
<div style="margin-top:6px;font-size:10px;letter-spacing:0.32em;text-transform:uppercase;color:${brand.olive};">${brand.tagline}</div>
</a>
</td></tr>
<tr><td style="padding:36px 40px;font-size:15px;line-height:1.65;color:${brand.text};">
${body}
</td></tr>
<tr><td style="padding:24px 40px 32px;border-top:1px solid rgba(61,50,41,0.08);text-align:center;color:${brand.textMuted};font-size:12px;line-height:1.6;">
© ${new Date().getFullYear()} ${brand.name} · Condesa, CDMX<br />
<a href="${getFrontendUrl()}" style="color:${brand.olive};text-decoration:none;">casashe.mx</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// Convenience wrapper for plain heading + paragraph + optional button
export function simpleTemplate({
    heading,
    body,
    button,
    closing,
}: {
    heading: string;
    body: string;
    button?: ButtonOpts;
    closing?: string;
}): string {
    return wrapEmail({
        title: heading,
        body: `
            <h1 style="margin:0 0 16px;font-size:26px;line-height:1.2;letter-spacing:-0.02em;color:${brand.dark};">${heading}</h1>
            <div style="font-size:15px;line-height:1.65;color:${brand.text};">${body}</div>
            ${button ? `<div style="text-align:center;margin:28px 0 8px;">${emailButton(button)}</div>` : ''}
            ${closing ? `<p style="margin:24px 0 0;font-size:14px;color:${brand.textMuted};">${closing}</p>` : ''}
        `,
    });
}
