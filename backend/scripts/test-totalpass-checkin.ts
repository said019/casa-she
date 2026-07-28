import assert from 'node:assert/strict';
import {
    isAllowedTpConfirmationHost,
    motivoRechazoConfirmacion,
    tpMatchCheckinToBookings,
    tpNormName,
    type TpBookingCandidate,
} from '../src/routes/partner-webhooks.js';

// ── isAllowedTpConfirmationHost ──────────────────────────────────────────────
// Acepta EXACTAMENTE los hosts oficiales de TotalPass, en https.
assert.equal(isAllowedTpConfirmationHost('https://admin.totalpass.com/api/v1/webhook_confirmations/abc123'), true);
assert.equal(isAllowedTpConfirmationHost('https://admin.staging.totalpass.com/api/v1/webhook_confirmations/abc123'), true);

// Rechaza: protocolo no-https.
assert.equal(isAllowedTpConfirmationHost('http://admin.totalpass.com/api/v1/webhook_confirmations/abc123'), false);
// Rechaza: host completamente ajeno.
assert.equal(isAllowedTpConfirmationHost('https://evil.com/api/v1/webhook_confirmations/abc123'), false);
// Rechaza: subdominio falso que CONTIENE el host real como substring/prefijo.
assert.equal(isAllowedTpConfirmationHost('https://admin.totalpass.com.evil.com/x'), false);
// Rechaza: IPs (metadata SSRF clásico y loopback).
assert.equal(isAllowedTpConfirmationHost('https://169.254.169.254/latest/meta-data'), false);
assert.equal(isAllowedTpConfirmationHost('https://127.0.0.1/x'), false);
// Rechaza: userinfo disfrazando el host real (aquí el host de verdad es evil.com).
assert.equal(isAllowedTpConfirmationHost('https://admin.totalpass.com@evil.com/x'), false);
// Rechaza: URL inválida / vacía, sin tronar.
assert.equal(isAllowedTpConfirmationHost(''), false);
assert.equal(isAllowedTpConfirmationHost('no-es-una-url'), false);

console.log('isAllowedTpConfirmationHost: OK');

// ── motivoRechazoConfirmacion ────────────────────────────────────────────────
// Un check-in real de una socia se rechazó y no quedó rastro de POR QUÉ. Esta
// función dice el motivo exacto (y el host) para poder diagnosticarlo sin
// aflojar el guard anti-SSRF.
assert.equal(motivoRechazoConfirmacion('https://admin.totalpass.com/api/v1/webhook_confirmations/abc').motivo, null);
assert.equal(motivoRechazoConfirmacion(null).motivo, 'sin_endpoint');
assert.equal(motivoRechazoConfirmacion('').motivo, 'sin_endpoint');
assert.equal(motivoRechazoConfirmacion('no-es-una-url').motivo, 'url_invalida');
assert.equal(motivoRechazoConfirmacion('http://admin.totalpass.com/x').motivo, 'no_https');
assert.equal(motivoRechazoConfirmacion('https://user:pass@admin.totalpass.com/x').motivo, 'con_credenciales');

// El caso que importa: host distinto al esperado. Debe decir CUÁL era.
const ajeno = motivoRechazoConfirmacion('https://admin.totalpass.com.mx/api/v1/webhook_confirmations/abc');
assert.equal(ajeno.motivo, 'host_no_permitido');
assert.equal(ajeno.host, 'admin.totalpass.com.mx');

// Coincide siempre con el guard: lo que el guard acepta, aquí no tiene motivo.
for (const u of [
    'https://admin.totalpass.com/x', 'https://admin.staging.totalpass.com/x',
    'http://admin.totalpass.com/x', 'https://evil.com/x', 'https://admin.totalpass.com@evil.com/x',
    'https://169.254.169.254/x', '', 'no-es-una-url',
]) {
    assert.equal(
        motivoRechazoConfirmacion(u).motivo === null,
        isAllowedTpConfirmationHost(u),
        `motivo y guard discrepan en "${u}"`,
    );
}

console.log('motivoRechazoConfirmacion: OK');

// ── tpNormName ────────────────────────────────────────────────────────────────
assert.equal(tpNormName('  Ana María Pérez  '), 'ana maria perez');
assert.equal(tpNormName(null), '');
assert.equal(tpNormName(undefined), '');

console.log('tpNormName: OK');

// ── tpMatchCheckinToBookings ─────────────────────────────────────────────────
const bookings: TpBookingCandidate[] = [
    { id: 'b-curp', user_id: 'u-1', class_id: 'c-1', tp_document: 'PEXA900101HDFRRN01', tp_email: null, email: 'otro@correo.com', display_name: 'Ana Pérez' },
    { id: 'b-email', user_id: 'u-2', class_id: 'c-1', tp_document: null, tp_email: 'socia@correo.com', email: null, display_name: 'Otra Persona' },
    { id: 'b-name', user_id: 'u-3', class_id: 'c-1', tp_document: null, tp_email: null, email: null, display_name: 'Beatriz López' },
    { id: 'b-dup-a', user_id: 'u-4', class_id: 'c-2', tp_document: null, tp_email: null, email: null, display_name: 'Nombre Repetido' },
    { id: 'b-dup-b', user_id: 'u-5', class_id: 'c-2', tp_document: null, tp_email: null, email: null, display_name: 'Nombre Repetido' },
];

// Match único por CURP/documento (mayúsculas/espacios no importan).
const byDoc = tpMatchCheckinToBookings({ document: ' pexa900101hdfrrn01 ', email: null, name: null }, bookings);
assert.equal(byDoc.length, 1, 'match único por CURP');
assert.equal(byDoc[0].id, 'b-curp');

// Match único por email (case-insensitive).
const byEmail = tpMatchCheckinToBookings({ document: null, email: 'SOCIA@correo.com', name: null }, bookings);
assert.equal(byEmail.length, 1, 'match único por email');
assert.equal(byEmail[0].id, 'b-email');

// Fallback a nombre normalizado cuando no hay documento/email de alta entropía.
const byName = tpMatchCheckinToBookings({ document: null, email: null, name: 'béatriz lópez' }, bookings);
assert.equal(byName.length, 1, 'match único por nombre normalizado');
assert.equal(byName[0].id, 'b-name');

// Documento/email presentes pero SIN match entre las candidatas → 0 resultados
// (nunca se cae a nombre si había una identidad de alta entropía para intentar).
const zeroMatches = tpMatchCheckinToBookings({ document: 'NOEXISTE000000', email: 'nadie@correo.com', name: null }, bookings);
assert.equal(zeroMatches.length, 0, '0 candidatos → sin match, no se marca nada');

// Nombre duplicado entre dos reservas → ambiguo (>1), no se marca nada.
const ambiguous = tpMatchCheckinToBookings({ document: null, email: null, name: 'Nombre Repetido' }, bookings);
assert.equal(ambiguous.length, 2, '>1 candidatos → ambiguo, no se marca nada');

// Sin ningún dato de identidad → sin match.
const noIdentity = tpMatchCheckinToBookings({ document: null, email: null, name: null }, bookings);
assert.equal(noIdentity.length, 0, 'sin identidad → sin match');

// Lista de candidatas vacía → sin match, no truena.
assert.deepEqual(tpMatchCheckinToBookings({ document: 'X', email: 'x@x.com', name: 'X' }, []), []);

console.log('tpMatchCheckinToBookings: OK');

console.log('test-totalpass-checkin: OK');
