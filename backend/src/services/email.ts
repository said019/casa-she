import { Resend } from 'resend';
import {
    brand,
    getFrontendUrl,
    getEmailFrom,
    simpleTemplate,
    wrapEmail,
    emailButton,
    infoBox,
    alertBox,
} from './email-templates.js';
import { isPlatformMemberByEmail } from '../lib/platformMember.js';

let resendClient: Resend | null = null;

function getResend(): Resend {
    if (!resendClient) {
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
            throw new Error('RESEND_API_KEY must be configured in environment variables.');
        }
        resendClient = new Resend(apiKey);
    }
    return resendClient;
}

// =============================================================================
// 1. Instructor / Coach magic link
// =============================================================================

export async function sendInstructorMagicLink({
    to,
    instructorName,
    magicLink,
}: {
    to: string;
    instructorName: string;
    magicLink: string;
}) {
    const html = simpleTemplate({
        heading: `Hola, ${instructorName}`,
        body: `
            <p>Recibimos una solicitud para entrar a tu portal de coach en ${brand.name}. Da clic en el botón para abrir tu sesión sin contraseña.</p>
            ${alertBox('Este enlace expira en <strong>1 hora</strong>. Si no fuiste tú, ignóralo.')}
        `,
        button: { label: 'Abrir mi portal de coach', href: magicLink },
        closing: 'Si no fuiste tú, ignora este correo.',
    });

    const { data, error } = await getResend().emails.send({
        from: getEmailFrom(),
        to: [to],
        subject: `Acceso a tu portal — ${brand.name}`,
        html,
    });

    if (error) {
        console.error('[email] sendInstructorMagicLink:', error);
        throw error;
    }
    return { id: data?.id };
}

// =============================================================================
// 2. Instructor / Coach credentials (initial password)
// =============================================================================

export async function sendInstructorCredentials({
    to,
    instructorName,
    email,
    temporaryPassword,
    loginUrl,
    coachNumber,
}: {
    to: string;
    instructorName: string;
    email: string;
    temporaryPassword: string;
    loginUrl: string;
    coachNumber?: string;
}) {
    const credentialRow = (label: string, value: string) =>
        `<div style="margin:10px 0;padding:12px 14px;background:${brand.cream};border-radius:10px;">
            <div style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:${brand.olive};font-weight:600;">${label}</div>
            <div style="margin-top:4px;font-size:15px;font-weight:600;color:${brand.dark};font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${value}</div>
        </div>`;

    const html = wrapEmail({
        title: `Bienvenida al equipo, ${instructorName}`,
        body: `
            <h1 style="margin:0 0 12px;font-size:26px;line-height:1.2;letter-spacing:-0.02em;color:${brand.dark};">Bienvenida al equipo, ${instructorName}</h1>
            <p style="margin:0 0 20px;color:${brand.text};">Tu cuenta de coach está lista. Estos son tus accesos al portal:</p>
            <div style="background:${brand.sand};padding:18px;border-radius:14px;">
                ${coachNumber ? credentialRow('Número de coach', coachNumber) : ''}
                ${credentialRow('Email', email)}
                ${credentialRow('Contraseña temporal', temporaryPassword)}
            </div>
            <div style="text-align:center;margin:28px 0 8px;">${emailButton({ label: 'Entrar al portal', href: loginUrl })}</div>
            ${alertBox('Por seguridad, cambia esta contraseña en tu primer inicio de sesión.')}
        `,
    });

    const { data, error } = await getResend().emails.send({
        from: getEmailFrom(),
        to: [to],
        subject: `Bienvenida a ${brand.name} — Tus credenciales`,
        html,
    });

    if (error) {
        console.error('[email] sendInstructorCredentials:', error);
        throw error;
    }
    return { id: data?.id };
}

// Credenciales para una recepcionista nueva (mismo formato que coach, texto de recepción).
export async function sendReceptionCredentials({
    to,
    name,
    email,
    temporaryPassword,
    loginUrl,
}: {
    to: string;
    name: string;
    email: string;
    temporaryPassword: string;
    loginUrl?: string;
}) {
    const finalUrl = loginUrl || `${getFrontendUrl()}/login`;
    const credentialRow = (label: string, value: string) =>
        `<div style="margin:10px 0;padding:12px 14px;background:${brand.cream};border-radius:10px;">
            <div style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:${brand.olive};font-weight:600;">${label}</div>
            <div style="margin-top:4px;font-size:15px;font-weight:600;color:${brand.dark};font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${value}</div>
        </div>`;

    const html = wrapEmail({
        title: `Bienvenida al equipo, ${name}`,
        body: `
            <h1 style="margin:0 0 12px;font-size:26px;line-height:1.2;letter-spacing:-0.02em;color:${brand.dark};">Bienvenida al equipo, ${name}</h1>
            <p style="margin:0 0 20px;color:${brand.text};">Tu cuenta de recepción está lista. Estos son tus accesos:</p>
            <div style="background:${brand.sand};padding:18px;border-radius:14px;">
                ${credentialRow('Email', email)}
                ${credentialRow('Contraseña', temporaryPassword)}
            </div>
            <div style="text-align:center;margin:28px 0 8px;">${emailButton({ label: 'Entrar', href: finalUrl })}</div>
            ${alertBox('Por seguridad, cambia esta contraseña en tu primer inicio de sesión.')}
        `,
    });

    const { data, error } = await getResend().emails.send({
        from: getEmailFrom(),
        to: [to],
        subject: `Bienvenida a ${brand.name} — Tus credenciales de recepción`,
        html,
    });

    if (error) {
        console.error('[email] sendReceptionCredentials:', error);
        return null;
    }
    return { id: data?.id };
}

// =============================================================================
// 3. Class assignment notification (coach)
// =============================================================================

export async function sendClassAssignmentNotification({
    to,
    coachName,
    className,
    classDate,
    startTime,
    endTime,
    capacity,
    portalUrl,
}: {
    to: string;
    coachName: string;
    className: string;
    classDate: string;
    startTime: string;
    endTime: string;
    capacity: number;
    portalUrl?: string;
}) {
    try {
        const finalUrl = portalUrl || `${getFrontendUrl()}/coach`;
        const dateLabel = new Date(classDate + 'T00:00:00').toLocaleDateString('es-MX', {
            weekday: 'long', day: 'numeric', month: 'long',
        });

        const html = simpleTemplate({
            heading: `Nueva clase asignada`,
            body: `
                <p>Hola ${coachName}, se te asignó una clase nueva:</p>
                ${infoBox(`
                    <div style="font-size:18px;font-weight:600;color:${brand.dark};margin-bottom:6px;">${className}</div>
                    <div><strong>Día:</strong> ${dateLabel}</div>
                    <div><strong>Horario:</strong> ${startTime} – ${endTime}</div>
                    <div><strong>Capacidad:</strong> ${capacity} alumnas</div>
                `)}
            `,
            button: { label: 'Ver en mi portal', href: finalUrl },
        });

        const { data, error } = await getResend().emails.send({
            from: getEmailFrom(),
            to: [to],
            subject: `Nueva clase asignada — ${className}`,
            html,
        });

        if (error) {
            console.error('[email] sendClassAssignmentNotification:', error);
            return null;
        }
        return { id: data?.id };
    } catch (err) {
        console.error('[email] sendClassAssignmentNotification:', err);
        return null;
    }
}

// Aviso al coach (fuera de la app): su clase fue cancelada. Si count>1, es la serie.
export async function sendClassCancelledToCoach({
    to,
    coachName,
    className,
    classDate,
    startTime,
    endTime,
    count,
    portalUrl,
}: {
    to: string;
    coachName: string;
    className: string;
    classDate: string;
    startTime?: string;
    endTime?: string;
    count?: number;
    portalUrl?: string;
}) {
    try {
        const finalUrl = portalUrl || `${getFrontendUrl()}/coach`;
        const dateLabel = new Date(classDate + 'T00:00:00').toLocaleDateString('es-MX', {
            weekday: 'long', day: 'numeric', month: 'long',
        });
        const isSeries = (count ?? 1) > 1;
        const html = simpleTemplate({
            heading: isSeries ? 'Clases canceladas' : 'Clase cancelada',
            body: isSeries
                ? `
                <p>Hola ${coachName}, se cancelaron <strong>${count} clases</strong> de tu horario de ${className}${startTime ? ` (${startTime})` : ''}, desde el ${dateLabel} en adelante.</p>
                <p>Revisa tu horario actualizado en el portal.</p>
                `
                : `
                <p>Hola ${coachName}, tu clase fue cancelada:</p>
                ${infoBox(`
                    <div style="font-size:18px;font-weight:600;color:${brand.dark};margin-bottom:6px;">${className}</div>
                    <div><strong>Día:</strong> ${dateLabel}</div>
                    ${startTime ? `<div><strong>Horario:</strong> ${startTime}${endTime ? ` – ${endTime}` : ''}</div>` : ''}
                `)}
                `,
            button: { label: 'Ver mi horario', href: finalUrl },
        });

        const { data, error } = await getResend().emails.send({
            from: getEmailFrom(),
            to: [to],
            subject: isSeries ? `Clases canceladas — ${className}` : `Clase cancelada — ${className}`,
            html,
        });

        if (error) {
            console.error('[email] sendClassCancelledToCoach:', error);
            return null;
        }
        return { id: data?.id };
    } catch (err) {
        console.error('[email] sendClassCancelledToCoach:', err);
        return null;
    }
}

// =============================================================================
// 3a. Recurring class assignment notification (coach)
// =============================================================================

export async function sendRecurringClassAssignmentNotification({
    to,
    coachName,
    className,
    startDate,
    endDate,
    dayLabels,
    startTime,
    endTime,
    capacity,
    count,
    portalUrl,
}: {
    to: string;
    coachName: string;
    className: string;
    startDate: string;
    endDate: string;
    dayLabels: string;
    startTime: string;
    endTime: string;
    capacity: number;
    count: number;
    portalUrl?: string;
}) {
    try {
        const finalUrl = portalUrl || `${getFrontendUrl()}/coach`;
        const fmt = (d: string) =>
            new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });

        const html = simpleTemplate({
            heading: `Clases recurrentes asignadas`,
            body: `
                <p>Hola ${coachName}, se te asignaron ${count} clases recurrentes:</p>
                ${infoBox(`
                    <div style="font-size:18px;font-weight:600;color:${brand.dark};margin-bottom:6px;">${className}</div>
                    <div><strong>Días:</strong> ${dayLabels}</div>
                    <div><strong>Periodo:</strong> ${fmt(startDate)} – ${fmt(endDate)}</div>
                    <div><strong>Horario:</strong> ${startTime} – ${endTime}</div>
                    <div><strong>Capacidad:</strong> ${capacity} alumnas</div>
                `)}
            `,
            button: { label: 'Ver en mi portal', href: finalUrl },
        });

        const { data, error } = await getResend().emails.send({
            from: getEmailFrom(),
            to: [to],
            subject: `Clases recurrentes asignadas — ${className}`,
            html,
        });

        if (error) {
            console.error('[email] sendRecurringClassAssignmentNotification:', error);
            return null;
        }
        return { id: data?.id };
    } catch (err) {
        console.error('[email] sendRecurringClassAssignmentNotification:', err);
        return null;
    }
}

// =============================================================================
// 3b. Substitution requested (admin recibe aviso de que un coach pide sustituto)
// =============================================================================

export async function sendSubstitutionRequestedNotification({
    to,
    originalCoachName,
    className,
    classDate,
    startTime,
    endTime,
    reason,
    portalUrl,
}: {
    to: string;
    originalCoachName: string;
    className: string;
    classDate: string;
    startTime: string;
    endTime: string;
    reason?: string | null;
    portalUrl?: string;
}) {
    try {
        const finalUrl = portalUrl || `${getFrontendUrl()}/admin`;
        const dateLabel = new Date(classDate + 'T00:00:00').toLocaleDateString('es-MX', {
            weekday: 'long', day: 'numeric', month: 'long',
        });
        const html = simpleTemplate({
            heading: 'Sustitución solicitada',
            body: `
                <p>${originalCoachName} solicitó sustitución para una clase:</p>
                ${infoBox(`
                    <div style="font-size:18px;font-weight:600;color:${brand.dark};margin-bottom:6px;">${className}</div>
                    <div><strong>Día:</strong> ${dateLabel}</div>
                    <div><strong>Horario:</strong> ${startTime} – ${endTime}</div>
                    ${reason ? `<div style="margin-top:6px;"><strong>Motivo:</strong> ${reason}</div>` : ''}
                `)}
                <p style="color:${brand.text};font-size:13px;">Otros coaches pueden aceptarla desde su portal, o tú puedes asignar uno desde el panel.</p>
            `,
            button: { label: 'Abrir panel', href: finalUrl },
        });
        const { data, error } = await getResend().emails.send({
            from: getEmailFrom(),
            to: [to],
            subject: `Sustitución solicitada — ${className} (${dateLabel})`,
            html,
        });
        if (error) {
            console.error('[email] sendSubstitutionRequestedNotification:', error);
            return null;
        }
        return { id: data?.id };
    } catch (err) {
        console.error('[email] sendSubstitutionRequestedNotification:', err);
        return null;
    }
}

// =============================================================================
// 3c. Substitution accepted (al coach original le avisamos que ya tiene cubierta la clase)
// =============================================================================

export async function sendSubstitutionAcceptedNotification({
    to,
    originalCoachName,
    substituteCoachName,
    className,
    classDate,
    startTime,
    endTime,
    note,
    portalUrl,
}: {
    to: string;
    originalCoachName: string;
    substituteCoachName: string;
    className: string;
    classDate: string;
    startTime: string;
    endTime: string;
    note?: string | null;
    portalUrl?: string;
}) {
    try {
        const finalUrl = portalUrl || `${getFrontendUrl()}/coach`;
        const dateLabel = new Date(classDate + 'T00:00:00').toLocaleDateString('es-MX', {
            weekday: 'long', day: 'numeric', month: 'long',
        });
        const html = simpleTemplate({
            heading: 'Tu clase ya tiene sustituto',
            body: `
                <p>Hola ${originalCoachName}, <strong>${substituteCoachName}</strong> aceptó cubrir tu clase:</p>
                ${infoBox(`
                    <div style="font-size:18px;font-weight:600;color:${brand.dark};margin-bottom:6px;">${className}</div>
                    <div><strong>Día:</strong> ${dateLabel}</div>
                    <div><strong>Horario:</strong> ${startTime} – ${endTime}</div>
                    ${note ? `<div style="margin-top:6px;"><strong>Nota:</strong> ${note}</div>` : ''}
                `)}
            `,
            button: { label: 'Ver en mi portal', href: finalUrl },
        });
        const { data, error } = await getResend().emails.send({
            from: getEmailFrom(),
            to: [to],
            subject: `Tu clase ya tiene sustituto — ${className}`,
            html,
        });
        if (error) {
            console.error('[email] sendSubstitutionAcceptedNotification:', error);
            return null;
        }
        return { id: data?.id };
    } catch (err) {
        console.error('[email] sendSubstitutionAcceptedNotification:', err);
        return null;
    }
}

// =============================================================================
// 3d. New review (al coach le llega una reseña; respeta is_anonymous)
// =============================================================================

export async function sendNewReviewNotification({
    to,
    coachName,
    clientName,
    isAnonymous,
    overallRating,
    instructorRating,
    comment,
    className,
    classDate,
    portalUrl,
}: {
    to: string;
    coachName: string;
    clientName: string;
    isAnonymous: boolean;
    overallRating: number;
    instructorRating?: number | null;
    comment?: string | null;
    className: string;
    classDate: string;
    portalUrl?: string;
}) {
    try {
        const finalUrl = portalUrl || `${getFrontendUrl()}/coach/history`;
        const dateLabel = new Date(classDate + 'T00:00:00').toLocaleDateString('es-MX', {
            weekday: 'long', day: 'numeric', month: 'long',
        });
        const author = isAnonymous ? 'Una alumna' : clientName;
        const stars = '★'.repeat(Math.max(1, Math.min(5, Math.round(overallRating))))
            + '☆'.repeat(Math.max(0, 5 - Math.max(1, Math.min(5, Math.round(overallRating)))));
        const html = simpleTemplate({
            heading: 'Nueva reseña en tu perfil',
            body: `
                <p>Hola ${coachName}, ${author} te dejó una reseña:</p>
                ${infoBox(`
                    <div style="font-size:20px;color:#d4af37;margin-bottom:6px;">${stars} <span style="color:${brand.dark};font-size:14px;">(${overallRating}/5)</span></div>
                    <div><strong>Clase:</strong> ${className}</div>
                    <div><strong>Día:</strong> ${dateLabel}</div>
                    ${instructorRating ? `<div><strong>Tu desempeño:</strong> ${instructorRating}/5</div>` : ''}
                    ${comment ? `<div style="margin-top:8px;font-style:italic;color:${brand.text};">“${comment}”</div>` : ''}
                `)}
            `,
            button: { label: 'Ver mis reseñas', href: finalUrl },
        });
        const { data, error } = await getResend().emails.send({
            from: getEmailFrom(),
            to: [to],
            subject: `Nueva reseña — ${overallRating}/5`,
            html,
        });
        if (error) {
            console.error('[email] sendNewReviewNotification:', error);
            return null;
        }
        return { id: data?.id };
    } catch (err) {
        console.error('[email] sendNewReviewNotification:', err);
        return null;
    }
}

// =============================================================================
// 4. Membership activated
// =============================================================================

export async function sendMembershipActivatedEmail({
    to,
    clientName,
    planName,
    classesIncluded,
    startDate,
    endDate,
    bookingUrl,
}: {
    to: string;
    clientName: string;
    planName: string;
    classesIncluded: number | null;
    startDate: string;
    endDate: string;
    bookingUrl?: string;
}) {
    // Alumnos de plataforma (Totalpass/Wellhub/Fitpass): sin correos salvo su reserva.
    if (await isPlatformMemberByEmail(to)) return null;
    try {
        const finalUrl = bookingUrl || `${getFrontendUrl()}/app/classes`;
        const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-MX', {
            day: 'numeric', month: 'long', year: 'numeric',
        });

        const html = simpleTemplate({
            heading: `¡Tu membresía está activa!`,
            body: `
                <p>Hola ${clientName}, ya puedes empezar a moverte con nosotras.</p>
                ${infoBox(`
                    <div style="font-size:18px;font-weight:600;color:${brand.dark};margin-bottom:6px;">${planName}</div>
                    ${classesIncluded !== null ? `<div><strong>Clases incluidas:</strong> ${classesIncluded}</div>` : '<div><strong>Clases ilimitadas</strong></div>'}
                    <div><strong>Inicio:</strong> ${fmt(startDate)}</div>
                    <div><strong>Vence:</strong> ${fmt(endDate)}</div>
                `)}
                <p>Reserva tu primera clase desde la app — los lugares se llenan rápido.</p>
            `,
            button: { label: 'Reservar mi clase', href: finalUrl },
        });

        const { data, error } = await getResend().emails.send({
            from: getEmailFrom(),
            to: [to],
            subject: `Tu membresía ${planName} ya está activa — ${brand.name}`,
            html,
        });

        if (error) {
            console.error('[email] sendMembershipActivatedEmail:', error);
            return null;
        }
        return { id: data?.id };
    } catch (err) {
        console.error('[email] sendMembershipActivatedEmail:', err);
        return null;
    }
}

// =============================================================================
// 4b. Booking confirmation — sent immediately after a client reserves a class
// =============================================================================

export async function sendBookingConfirmationEmail({
    to,
    clientName,
    className,
    instructorName,
    classDate,
    classStartTime,
    classEndTime,
    facilityName,
    cancelHours,
}: {
    to: string;
    clientName: string;
    className: string;
    instructorName: string | null;
    classDate: string;          // YYYY-MM-DD
    classStartTime: string;     // HH:MM[:SS]
    classEndTime: string;       // HH:MM[:SS]
    facilityName?: string | null;
    cancelHours?: number;       // horas mínimas para cancelar (cancellation_policy.min_hours)
}) {
    try {
        const ch = Number(cancelHours);
        const cancelText = Number.isFinite(ch) && ch > 0
            ? `Si necesitas cancelar, hazlo con al menos ${ch} ${ch === 1 ? 'hora' : 'horas'} de anticipación desde la app para recuperar tu crédito.`
            : 'Si necesitas cancelar, hazlo con anticipación desde la app para recuperar tu crédito.';
        const fmtDate = new Date(classDate + 'T00:00:00').toLocaleDateString('es-MX', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        });
        const startHm = classStartTime?.slice(0, 5) || classStartTime;
        const endHm = classEndTime?.slice(0, 5) || classEndTime;

        const html = simpleTemplate({
            heading: '¡Tu reserva está confirmada!',
            body: `
                <p>Hola ${clientName}, te esperamos en el studio.</p>
                ${infoBox(`
                    <div style="font-size:18px;font-weight:600;color:${brand.dark};margin-bottom:6px;">${className}</div>
                    <div><strong>Día:</strong> ${fmtDate}</div>
                    <div><strong>Hora:</strong> ${startHm} — ${endHm}</div>
                    ${instructorName ? `<div><strong>Instructora:</strong> ${instructorName}</div>` : ''}
                    ${facilityName ? `<div><strong>Sala:</strong> ${facilityName}</div>` : ''}
                `)}
                <p style="font-size:13px;color:${brand.text};">Llega 5 minutos antes para acomodarte. ${cancelText}</p>
            `,
            button: { label: 'Ver mis reservas', href: `${getFrontendUrl()}/app/my-bookings` },
        });

        const { data, error } = await getResend().emails.send({
            from: getEmailFrom(),
            to: [to],
            subject: `Reserva confirmada — ${className} (${fmtDate.split(',')[1]?.trim() || fmtDate})`,
            html,
        });

        if (error) {
            console.error('[email] sendBookingConfirmationEmail:', error);
            return null;
        }
        return { id: data?.id };
    } catch (err) {
        console.error('[email] sendBookingConfirmationEmail:', err);
        return null;
    }
}

// =============================================================================
// 5. Event announcement
// =============================================================================

export async function sendEventAnnouncementEmail({
    to,
    eventTitle,
    eventType,
    eventDate,
    startTime,
    endTime,
    location,
    price,
    instructor,
    description,
    eventUrl,
}: {
    to: string | string[];
    eventTitle: string;
    eventType: string;
    eventDate: string;
    startTime: string;
    endTime: string;
    location: string;
    price: number;
    instructor: string;
    description: string;
    eventUrl?: string;
}) {
    try {
        const finalUrl = eventUrl || `${getFrontendUrl()}/app/events`;
        const dateLabel = new Date(eventDate + 'T12:00:00').toLocaleDateString('es-MX', {
            weekday: 'long', day: 'numeric', month: 'long',
        });
        const priceLabel = price > 0 ? `$${price.toLocaleString('es-MX')} MXN` : 'Gratis';
        const recipients = Array.isArray(to) ? to : [to];

        const html = simpleTemplate({
            heading: eventTitle,
            body: `
                <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.32em;text-transform:uppercase;color:${brand.olive};font-weight:600;">${eventType}</p>
                <p style="margin:0 0 18px;color:${brand.text};">${description.length > 220 ? description.slice(0, 220) + '…' : description}</p>
                ${infoBox(`
                    <div><strong>Día:</strong> ${dateLabel}</div>
                    <div><strong>Horario:</strong> ${startTime} – ${endTime}</div>
                    <div><strong>Lugar:</strong> ${location}</div>
                    <div><strong>Imparte:</strong> ${instructor}</div>
                    <div style="margin-top:8px;font-size:18px;font-weight:600;color:${brand.olive};">${priceLabel}</div>
                `)}
            `,
            button: { label: 'Inscribirme', href: finalUrl },
            closing: 'Lugares limitados — reserva pronto.',
        });

        const { data, error } = await getResend().emails.send({
            from: getEmailFrom(),
            to: recipients,
            subject: `Nuevo evento: ${eventTitle} — ${brand.name}`,
            html,
        });

        if (error) {
            console.error('[email] sendEventAnnouncementEmail:', error);
            return null;
        }
        return { id: data?.id };
    } catch (err) {
        console.error('[email] sendEventAnnouncementEmail:', err);
        return null;
    }
}

// =============================================================================
// 6. Client welcome (admin-created account)
// =============================================================================

export async function sendClientWelcomeEmail({
    to,
    clientName,
    email,
    temporaryPassword,
    loginUrl,
}: {
    to: string;
    clientName: string;
    email: string;
    temporaryPassword: string;
    loginUrl?: string;
}) {
    // Alumnos de plataforma: sin correos salvo su reserva.
    if (await isPlatformMemberByEmail(to)) return null;
    try {
        // /login es el login universal (redirige por rol: cliente→/app, recepción→/reception,
        // admin→/admin). /app/login NO existe → daba 404 en el correo de bienvenida.
        const finalUrl = loginUrl || `${getFrontendUrl()}/login`;
        const credentialRow = (label: string, value: string) =>
            `<div style="margin:10px 0;padding:12px 14px;background:${brand.cream};border-radius:10px;">
                <div style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:${brand.olive};font-weight:600;">${label}</div>
                <div style="margin-top:4px;font-size:15px;font-weight:600;color:${brand.dark};font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${value}</div>
            </div>`;

        const html = wrapEmail({
            title: `Bienvenida a ${brand.name}`,
            body: `
                <h1 style="margin:0 0 12px;font-size:26px;line-height:1.2;letter-spacing:-0.02em;color:${brand.dark};">Bienvenida, ${clientName}</h1>
                <p style="margin:0 0 20px;color:${brand.text};">Creamos tu cuenta en ${brand.name}. Estos son tus datos de acceso:</p>
                <div style="background:${brand.sand};padding:18px;border-radius:14px;">
                    ${credentialRow('Email', email)}
                    ${credentialRow('Contraseña temporal', temporaryPassword)}
                </div>
                <div style="text-align:center;margin:28px 0 8px;">${emailButton({ label: 'Iniciar sesión', href: finalUrl })}</div>
                ${alertBox('Por seguridad, cambia esta contraseña en tu primer inicio.')}
            `,
        });

        const { data, error } = await getResend().emails.send({
            from: getEmailFrom(),
            to: [to],
            subject: `Bienvenida a ${brand.name} — Tu cuenta está lista`,
            html,
        });

        if (error) {
            console.error('[email] sendClientWelcomeEmail:', error);
            return null;
        }
        return { id: data?.id };
    } catch (err) {
        console.error('[email] sendClientWelcomeEmail:', err);
        return null;
    }
}

// =============================================================================
// 6b. Reception assigned (admin granted reception access)
// =============================================================================

export async function sendReceptionAssignedEmail({
    to,
    userName,
    permissionLabels,
    isMaster,
    loginUrl,
}: {
    to: string;
    userName: string;
    permissionLabels: string[];
    isMaster: boolean;
    loginUrl?: string;
}) {
    try {
        const finalUrl = loginUrl || `${getFrontendUrl()}/login`;

        const accessBlock = isMaster
            ? `<p style="margin:0;color:${brand.text};"><strong>Acceso total (recepción master):</strong> todas las funciones del panel y ambas sucursales.</p>`
            : permissionLabels.length
                ? `<p style="margin:0 0 8px;color:${brand.text};">Tu acceso incluye:</p>
                   <ul style="margin:0;padding-left:18px;color:${brand.text};">
                     ${permissionLabels.map((l) => `<li style="margin:4px 0;">${l}</li>`).join('')}
                   </ul>`
                : `<p style="margin:0;color:${brand.text};">Ya tienes acceso al panel de recepción.</p>`;

        const html = wrapEmail({
            title: `Acceso de recepción — ${brand.name}`,
            preview: `Ya tienes acceso de recepción en ${brand.name}`,
            body: `
                <h1 style="margin:0 0 12px;font-size:26px;line-height:1.2;letter-spacing:-0.02em;color:${brand.dark};">Ya eres parte de recepción, ${userName}</h1>
                <p style="margin:0 0 18px;color:${brand.text};">Te dieron acceso al panel de recepción de ${brand.name}. Desde ahí atiendes a las clientas y operas el día a día del studio.</p>
                ${infoBox(accessBlock)}
                <div style="text-align:center;margin:28px 0 8px;">${emailButton({ label: 'Entrar al panel', href: finalUrl })}</div>
                <p style="margin:18px 0 0;font-size:14px;color:${brand.textMuted};">Entra con el correo y la contraseña de tu cuenta. Si no la recuerdas, usa “Olvidé mi contraseña” o pídele a un administrador que te la reinicie.</p>
            `,
        });

        const { data, error } = await getResend().emails.send({
            from: getEmailFrom(),
            to: [to],
            subject: `Ya tienes acceso de recepción en ${brand.name}`,
            html,
        });

        if (error) {
            console.error('[email] sendReceptionAssignedEmail:', error);
            return null;
        }
        return { id: data?.id };
    } catch (err) {
        console.error('[email] sendReceptionAssignedEmail:', err);
        return null;
    }
}

// =============================================================================
// 7. Order rejected
// =============================================================================

export async function sendOrderRejectedEmail({
    to,
    clientName,
    orderNumber,
    planName,
    rejectionReason,
}: {
    to: string;
    clientName: string;
    orderNumber: string;
    planName: string;
    rejectionReason?: string;
}) {
    try {
        const html = simpleTemplate({
            heading: 'Tu pago necesita atención',
            body: `
                <p>Hola ${clientName}, no pudimos validar tu comprobante de la orden <strong>#${orderNumber}</strong>.</p>
                ${infoBox(`<div><strong>Plan:</strong> ${planName}</div><div><strong>Orden:</strong> #${orderNumber}</div>`)}
                ${rejectionReason ? alertBox(`<strong>Motivo:</strong> ${rejectionReason}`) : ''}
                <p>Puedes subir un nuevo comprobante desde tu cuenta o escribirnos para resolver cualquier duda.</p>
            `,
            button: { label: 'Ver mi orden', href: `${getFrontendUrl()}/app/orders` },
            closing: '¿Dudas? Responde a este correo o escríbenos por WhatsApp.',
        });

        const { data, error } = await getResend().emails.send({
            from: getEmailFrom(),
            to: [to],
            subject: `Pago no aprobado — Orden #${orderNumber}`,
            html,
        });

        if (error) {
            console.error('[email] sendOrderRejectedEmail:', error);
            return null;
        }
        return { id: data?.id };
    } catch (err) {
        console.error('[email] sendOrderRejectedEmail:', err);
        return null;
    }
}

// =============================================================================
// 8b. Loyalty points earned
// =============================================================================

export async function sendPointsEarnedEmail({
    to,
    clientName,
    pointsEarned,
    totalPoints,
    reasonLabel,
}: {
    to: string;
    clientName: string;
    pointsEarned: number;
    totalPoints: number;
    reasonLabel: string;
}) {
    // Alumnos de plataforma: sin correos salvo su reserva.
    if (await isPlatformMemberByEmail(to)) return null;
    try {
        const html = simpleTemplate({
            heading: `+${pointsEarned} puntos de lealtad`,
            body: `
                <p>Hola ${clientName}, acabas de ganar <strong>${pointsEarned} puntos</strong> por ${reasonLabel}.</p>
                ${infoBox(`
                    <div style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:${brand.olive};font-weight:600;">Tu balance</div>
                    <div style="font-size:28px;font-weight:600;color:${brand.olive};margin-top:6px;">${totalPoints} pts</div>
                `)}
                <p>Canjea tus puntos por recompensas exclusivas del studio.</p>
            `,
            button: { label: 'Ver mis puntos', href: `${getFrontendUrl()}/app/wallet` },
        });

        const { data, error } = await getResend().emails.send({
            from: getEmailFrom(),
            to: [to],
            subject: `+${pointsEarned} pts en tu cuenta — ${brand.name}`,
            html,
        });

        if (error) {
            console.error('[email] sendPointsEarnedEmail:', error);
            return null;
        }
        return { id: data?.id };
    } catch (err) {
        console.error('[email] sendPointsEarnedEmail:', err);
        return null;
    }
}

// =============================================================================
// 8. Password reset
// =============================================================================

export async function sendPasswordResetEmail({
    to,
    resetLink,
}: {
    to: string;
    resetLink: string;
}) {
    const html = simpleTemplate({
        heading: 'Restablecer tu contraseña',
        body: `
            <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en ${brand.name}.</p>
            ${alertBox('Este enlace expira en <strong>1 hora</strong> y solo puede usarse una vez.')}
        `,
        button: { label: 'Restablecer contraseña', href: resetLink },
        closing: 'Si no fuiste tú, ignora este correo — tu contraseña actual seguirá funcionando.',
    });

    const { data, error } = await getResend().emails.send({
        from: getEmailFrom(),
        to: [to],
        subject: `Restablecer contraseña — ${brand.name}`,
        html,
    });

    if (error) {
        console.error('[email] sendPasswordResetEmail:', error);
        throw error;
    }
    return { id: data?.id };
}

// =============================================================================
// Mensaje 1:1 de texto libre (recepción → cliente)
// =============================================================================

export async function sendPlainEmail(to: string, subject: string, body: string) {
    // Escapar HTML del texto libre y preservar saltos de línea como párrafos.
    const escaped = body
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const html = simpleTemplate({
        heading: subject,
        body: escaped
            .split('\n')
            .map((line) => `<p>${line.trim() ? line : '&nbsp;'}</p>`)
            .join(''),
    });

    const { data, error } = await getResend().emails.send({
        from: getEmailFrom(),
        to: [to],
        subject,
        html,
    });

    if (error) {
        console.error('[email] sendPlainEmail:', error);
        throw error;
    }
    return { id: data?.id };
}
