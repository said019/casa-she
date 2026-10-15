import { test, expect, type Page } from '@playwright/test';
import { FECHA_PRUEBA, mockSemanaCalendario } from '../fixtures/calendario';

const client = { id: 'phone-client', role: 'client', display_name: 'Alumna Sin Correo', email: null, phone: '5512345678', reglamento_accepted_at: '2026-10-01', onboarding_completed_at: '2026-10-01', temp_password: false };
test.setTimeout(20_000);
async function base(page: Page) {
    await page.route('**/api/**', r => r.fulfill({ json: [] }));
}
async function calendar(page: Page) {
    await base(page);
    await page.addInitScript(() => localStorage.setItem('casashe_token', 'local-test'));
    await page.route('**/api/auth/me', r => r.fulfill({ json: { user: { id: 'staff-test', role: 'admin', display_name: 'Admin', email: 'admin@example.test' } } }));
    await mockSemanaCalendario(page);
    await page.route(/\/api\/plans(?:\?|$)/, r => r.fulfill({ json: [{ id: '00000000-0000-4000-8000-000000000001', name: 'Paquete 8', price: 1600, duration_days: 30, multi_credits: 8, reformer_credits: 0, is_active: true }] }));
    await page.goto(`/admin/calendar?date=${FECHA_PRUEBA}`);
    await page.getByRole('button', { name: /^Barre.*07:00/ }).click();
    await page.getByRole('button', { name: 'Registrar cliente', exact: true }).click();
}

for (const identity of ['5512345678', '+52 55 1234 5678', 'alumna@example.test']) {
    test(`acceso con identificador ${identity} y contraseña`, async ({ page }) => {
        await base(page);
        let body: any;
        await page.route('**/api/auth/login', async r => { body = r.request().postDataJSON(); await r.fulfill({ json: { user: client, token: 'phone-test-token' } }); });
        await page.route('**/api/auth/me', r => r.fulfill({ json: { user: client } }));
        await page.goto('/login');
        await page.getByLabel('Correo o WhatsApp', { exact: true }).fill(identity);
        await page.getByLabel('Contraseña', { exact: true }).fill('Prueba123!');
        await page.getByRole('button', { name: 'Entrar', exact: true }).click();
        await expect.poll(() => body).toMatchObject({ identifier: identity, password: 'Prueba123!' });
        await expect(page).toHaveURL(/\/app/);
    });
}

test('contraseña incorrecta no inicia sesión por WhatsApp', async ({ page }) => {
    await base(page);
    await page.route('**/api/auth/login', r => r.fulfill({ status: 401, json: { error: 'Credenciales inválidas' } }));
    await page.goto('/login');
    await page.getByLabel('Correo o WhatsApp', { exact: true }).fill('5512345678');
    await page.getByLabel('Contraseña', { exact: true }).fill('Incorrecta123');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Credenciales inválidas');
    await expect(page).toHaveURL(/\/login/);
    expect(await page.evaluate(() => localStorage.getItem('casashe_token'))).toBeNull();
});

test('recuperación acepta WhatsApp e informa sin revelar existencia', async ({ page }) => {
    await base(page);
    let body: any;
    await page.route('**/api/auth/forgot-password', async r => { body = r.request().postDataJSON(); await r.fulfill({ json: { message: 'Si existe la cuenta, recibirás instrucciones' } }); });
    await page.goto('/forgot-password');
    await page.getByLabel('Correo o WhatsApp', { exact: true }).fill('5512345678');
    await page.getByRole('button', { name: /Enviar/ }).click();
    await expect.poll(() => body).toMatchObject({ identifier: '5512345678' });
    await expect(page.getByText(/Si existe una cuenta/)).toBeVisible();
    await expect(page.getByText(/WhatsApp/).first()).toBeVisible();
});

test('registro desde calendario omite correo sin bloquear cliente', async ({ page }) => {
    await calendar(page);
    let body: any;
    await page.route('**/api/users', async r => { body = r.request().postDataJSON(); await r.fulfill({ status: 201, json: { user: client } }); });
    await page.getByLabel('Nombre completo', { exact: true }).fill(client.display_name);
    await page.getByLabel('WhatsApp', { exact: true }).fill(client.phone);
    await expect(page.getByLabel(/^Correo/)).not.toHaveAttribute('required', '');
    await page.getByRole('button', { name: 'Crear cliente', exact: true }).click();
    await expect.poll(() => body).toMatchObject({ displayName: client.display_name, phone: client.phone });
    expect(body.email || null).toBeNull();
    await expect(page.getByRole('heading', { name: `Membresías de ${client.display_name}` })).toBeVisible();
});

test('alta rápida de la captura permite registrar sin correo', async ({ page }) => {
    await calendar(page);
    await page.getByRole('button', { name: 'Registrar, cobrar e inscribir', exact: true }).click();
    let body: any;
    await page.route('**/api/users/alta-rapida', async r => { body = r.request().postDataJSON(); await r.fulfill({ status: 201, json: { user: client, acceso: { url: 'https://example.test/acceso/test' } } }); });
    await page.getByLabel('Nombre completo', { exact: true }).fill(client.display_name);
    await page.getByLabel('WhatsApp', { exact: true }).fill(client.phone);
    await page.getByRole('radio', { name: /Cortesía/ }).click();
    const submit = page.getByRole('button', { name: /Registrar e inscribir|Registrar, cobrar|Inscribir de cortesía/ });
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect.poll(() => body).toMatchObject({ nombre: client.display_name, telefono: client.phone, cortesia: true });
    expect(body.email || null).toBeNull();
});

test('correo inválido proporcionado sigue bloqueado', async ({ page }) => {
    await calendar(page);
    let sent = false;
    await page.route('**/api/users', async r => { sent = true; await r.fulfill({ status: 201, json: { user: client } }); });
    await page.getByLabel('Nombre completo', { exact: true }).fill(client.display_name);
    await page.getByLabel('WhatsApp', { exact: true }).fill(client.phone);
    await page.getByLabel(/^Correo/).fill('correo-invalido');
    await page.getByRole('button', { name: 'Crear cliente', exact: true }).click();
    expect(sent).toBe(false);
    await expect(page.getByRole('heading', { name: 'Registrar cliente', exact: true })).toBeVisible();
});

test('registro público permite cuenta sin correo con WhatsApp y contraseña', async ({ page }) => {
    await base(page);
    let body: any;
    await page.route('**/api/auth/register', async r => { body = r.request().postDataJSON(); await r.fulfill({ status: 201, json: { user: client, token: 'phone-register-token' } }); });
    await page.route('**/api/auth/me', r => r.fulfill({ json: { user: client } }));
    await page.goto('/register');
    await page.getByLabel('Nombre completo', { exact: true }).fill(client.display_name);
    await page.getByLabel(/Teléfono|WhatsApp/).fill('5512345678');
    await page.getByLabel('Contraseña', { exact: true }).fill('Prueba123!');
    await page.getByLabel('Confirmar contraseña', { exact: true }).fill('Prueba123!');
    await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
    await expect.poll(() => body).toMatchObject({ displayName: client.display_name, password: 'Prueba123!', acceptsTerms: true });
    expect(body.email || null).toBeNull();
    await expect(page).toHaveURL(/\/app/);
});

for (const area of ['admin', 'reception']) {
    test(`alta ${area} sin correo conserva WhatsApp como acceso`, async ({ page }) => {
        await base(page);
        await page.addInitScript(() => localStorage.setItem('casashe_token', 'local-test'));
        await page.route('**/api/auth/me', r => r.fulfill({ json: { user: { id: 'staff-test', role: area === 'admin' ? 'admin' : 'reception', display_name: 'Staff', permissions: { clientes: true, vender: true } } } }));
        let body: any;
        await page.route(/\/api\/users(?:\?|$)/, async r => {
            if (r.request().method() !== 'POST') return r.fulfill({ json: { users: [], pagination: { total: 0 } } });
            body = r.request().postDataJSON();
            await r.fulfill({ status: 201, json: { user: client, emailSent: false, whatsappSent: true } });
        });
        // Reception now uses the admin workspace; legacy /reception URLs redirect.
        await page.goto('/admin/members/new');
        await page.getByLabel(/Nombre completo/).fill(client.display_name);
        await page.getByLabel(/Teléfono|WhatsApp/).fill(client.phone);
        const submit = page.getByRole('button', { name: 'Crear usuario', exact: true });
        await expect(submit).toBeEnabled();
        await submit.click();
        await expect.poll(() => body).toMatchObject({ displayName: client.display_name, phone: client.phone });
        expect(body.email || null).toBeNull();
        await expect(page.getByText('Recibió un correo con su contraseña temporal.', { exact: false })).toHaveCount(0);
    });
}

test('búsqueda de alumnas no falla cuando el correo es nulo', async ({ page }) => {
    await base(page);
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => localStorage.setItem('casashe_token', 'local-test'));
    await page.route('**/api/auth/me', r => r.fulfill({ json: { user: { id: 'coach-test', role: 'instructor', display_name: 'Coach', email: 'coach@example.test' } } }));
    await page.route('**/api/instructors/me', r => r.fulfill({ json: { id: 'coach-test' } }));
    await page.route('**/api/instructors/*/students', r => r.fulfill({ json: { total: 1, students: [{ ...client, user_id: client.id, total_classes: 1, checked_in_classes: 1 }] } }));
    await page.goto('/coach/students');
    await page.getByPlaceholder(/Buscar/).fill('no-coincide');
    await expect(page.getByText(client.display_name, { exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
});

test('perfil sin correo guarda cambios con teléfono local existente', async ({ page }) => {
    await base(page);
    await page.addInitScript(() => localStorage.setItem('casashe_token', 'local-test'));
    await page.route('**/api/auth/me', r => r.fulfill({ json: { user: client } }));
    let body: any;
    await page.route(`**/api/users/${client.id}`, async r => {
        if (r.request().method() === 'PUT') body = r.request().postDataJSON();
        await r.fulfill({ json: { user: { ...client, ...body } } });
    });
    await page.goto('/app/profile/edit');
    await page.getByLabel(/Nombre completo/).fill('Alumna Editada');
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect.poll(() => body).toMatchObject({ displayName: 'Alumna Editada', phone: client.phone });
});
